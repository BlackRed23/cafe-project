// Opt-in current-source HTTP + independent existing cafedb assertions. No direct fixture SQL writes.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { randomUUID } = require('node:crypto');
require('dotenv').config({ path: 'apps/api/.env', quiet: true });
require('dotenv').config({ quiet: true });
const { PrismaClient } = require('@prisma/client');
const jwt = require('jsonwebtoken');
async function main() {
  assert.equal(process.env.SALES_CAFEDB_CONFIRMED, 'YES');
  const url = new URL(process.env.DATABASE_URL); assert.equal(url.pathname, '/cafedb');
  url.hostname = '127.0.0.1'; url.port = '55432';
  const db = new PrismaClient({ datasources: { db: { url: url.toString() } } });
  const dir = 'D:/KLTN/cafe-project-artifacts/reports/sales'; fs.mkdirSync(dir, { recursive: true });
  const evidenceLabel = process.env.SALES_EVIDENCE_LABEL || 'sales-evidence';
  assert.match(evidenceLabel, /^[a-zA-Z0-9_-]+$/, 'Invalid SALES_EVIDENCE_LABEL');
  const file = dir + '/' + evidenceLabel + '.json'; const ledger = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file)) : { runs: [] };
  const out = { run: 'bh-' + randomUUID(), phase: process.env.SALES_PHASE || 'baseline', base: process.env.SALES_API_URL || 'http://127.0.0.1:5002/api', time: new Date().toISOString(), requests: [], scenarios: [] }; ledger.runs.push(out);
  fs.mkdirSync(dir + '/runs', { recursive: true });
  const save = () => {
    // Per-run evidence remains durable even if another acceptance process updates shared index.
    fs.writeFileSync(dir + '/runs/' + out.run + '.json', JSON.stringify(out, null, 2));
    const current = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file)) : { runs: [] };
    current.runs = [...current.runs.filter(r => r.run !== out.run), out];
    fs.writeFileSync(file, JSON.stringify(current, null, 2));
  };
  let token, staff, category, seq = 0;
  const api = async (method, route, body, access = token) => {
    const started = new Date().toISOString();
    const r = await fetch(out.base + route, { method, signal: AbortSignal.timeout(25000), headers: { 'content-type': 'application/json', ...(access ? { authorization: 'Bearer ' + access } : {}) }, body: body === undefined ? undefined : JSON.stringify(body) });
    const raw = await r.text(); let response; try { response = JSON.parse(raw); } catch { response = { text: raw }; }
    const e = { id: out.phase + '-H' + (++seq), method, route, request: body, role: access === staff ? 'STAFF' : access ? 'ADMIN' : 'ANONYMOUS', started, ended: new Date().toISOString(), status: r.status, response }; out.requests.push(e); return e;
  };
  const ok = (r, code = 200) => { assert.equal(r.status, code, r.id + ':' + JSON.stringify(r.response)); return r.response.data; };
  const create = async (label, qty = 20, expiry = '2099-01-01') => {
    const i = ok(await api('POST', '/ingredients', { sku: out.run + '-' + label, name: out.run + '-' + label, baseUnit: 'g', costPerBaseUnit: 2, expiryClassification: 'NON_PERISHABLE' }), 201);
    if (qty) ok(await api('POST', `/ingredients/${i.id}/import`, { quantity: qty, unit: 'g', unitCost: 2, batchCode: out.run + '-' + label, expirationDate: expiry }));
    return i;
  };
  const product = async (label, ingredients, yieldQuantity = 1) => {
    const p = ok(await api('POST', '/products', { sku: out.run + '-' + label, name: out.run + '-' + label, price: 10000, categoryId: category.id, isActive: false, requiresRecipe: true }), 201).product;
    ok(await api('POST', `/products/${p.id}/recipes`, { yieldQuantity, ingredients: ingredients.map(([i, quantity, unit = 'g']) => ({ ingredientId: i.id, quantity, unit })) }), 201);
    const current = ok(await api('GET', `/products/${p.id}`)).product;
    ok(await api('PUT', `/products/${p.id}`, { expectedUpdatedAt: current.updatedAt, isActive: true })); return p;
  };
  const body = (p, quantity = 1, extra = {}) => ({ items: [{ productId: p.id, quantity }], paymentMethod: 'CASH', ...extra });
  const order = async b => ok(await api('POST', '/orders', b), 201).order;
  const transition = (o, status, access = token) => api('PATCH', `/orders/${o.id}/status`, { status }, access);
  const state = async i => ({ ingredient: await db.ingredient.findUniqueOrThrow({ where: { id: i.id } }), batches: await db.ingredientBatch.findMany({ where: { ingredientId: i.id }, orderBy: { id: 'asc' } }), ledger: await db.inventoryTransaction.findMany({ where: { ingredientId: i.id }, orderBy: { id: 'asc' } }) });
  const stock = async (i, physical, reserved) => { const s = await state(i); assert.equal(Number(s.ingredient.quantity), physical); assert.equal(Number(s.ingredient.reserved), reserved); assert.equal(s.batches.reduce((n, b) => n + Number(b.quantityRemaining), 0), physical); return s; };
  const persisted = id => db.order.findUniqueOrThrow({ where: { id }, include: { items: true, payments: true } });
  const overlap = async (table, id, operations) => {
    assert.ok(['Ingredient', 'Order'].includes(table)); let release, ready;
    const gate = new Promise(r => release = r), locked = new Promise(r => ready = r);
    const holder = db.$transaction(async tx => { await tx.$queryRawUnsafe(`SELECT id FROM "${table}" WHERE id = $1 FOR UPDATE`, id); ready(); await gate; }, { timeout: 20000 });
    await locked; const calls = operations.map(fn => fn()); let waiting = 0, waiters = [];
    const pattern = '%"' + table + '"%';
    try { for (let n = 0; n < 100; n++) { waiters = await db.$queryRaw`SELECT pid, wait_event, query FROM pg_stat_activity WHERE datname = current_database() AND wait_event_type = 'Lock' AND query LIKE ${pattern}`; waiting = waiters.length; if (waiting >= 2) break; await new Promise(r => setTimeout(r, 40)); } }
    finally { release(); await holder; }
    const results = await Promise.all(calls); assert.ok(waiting >= 2, 'Two HTTP database lock waiters required');
    return { waiting, waiters, responses: results.map(r => ({ id: r.id, status: r.status })), results };
  };
  const disconnectSubmit = async (ingredientId, b) => {
    let release, ready; const gate = new Promise(r => release = r), locked = new Promise(r => ready = r);
    const holder = db.$transaction(async tx => { await tx.$queryRaw`SELECT id FROM "Ingredient" WHERE id=${ingredientId} FOR UPDATE`; ready(); await gate; }, { timeout: 20000 });
    await locked;
    const started = new Date().toISOString();
    const request = require('node:http').request(out.base + '/orders', { method: 'POST', headers: { 'content-type': 'application/json', authorization: 'Bearer ' + token } });
    request.on('error', () => {}); request.end(JSON.stringify(b)); let waiting = 0;
    try {
      for (let n = 0; n < 100; n++) { const [r] = await db.$queryRaw`SELECT count(*)::int AS count FROM pg_stat_activity WHERE datname=current_database() AND wait_event_type='Lock'`; waiting = r.count; if (waiting >= 1) break; await new Promise(r => setTimeout(r, 40)); }
      assert.ok(waiting >= 1, 'HTTP submission must reach locked transaction before disconnect');
      request.destroy();
      out.requests.push({ id: out.phase + '-H' + (++seq), method: 'POST', route: '/orders', request: b, role: 'ADMIN', started, ended: new Date().toISOString(), status: null, response: { transport: 'CLIENT_SOCKET_DESTROYED_BEFORE_COMMIT', dbLockWaiters: waiting } });
    } finally { request.destroy(); release(); await holder; }
  };
  const scenario = async (id, expected, fn) => {
    if (process.env.SALES_CASES && !process.env.SALES_CASES.split(',').includes(id)) return;
    const start = out.requests.length;
    try { const actual = await fn(); out.scenarios.push({ id, expected, verdict: actual.verdict || 'PASS', actual, evidence: out.requests.slice(start).map(r => r.id) }); }
    catch (e) { process.exitCode = 1; out.scenarios.push({ id, expected, verdict: 'FAIL', error: e.stack, evidence: out.requests.slice(start).map(r => r.id) }); }
    save(); console.log(id + ' ' + out.scenarios.at(-1).verdict);
  };
  try {
    let ready = false;
    for (let n = 0; n < 100; n++) {
      try { const r = await fetch(out.base + '/orders/me', { signal: AbortSignal.timeout(1000) }); if (r.status === 401) { ready = true; break; } }
      catch { /* Startup only; no business request submitted. */ }
      await new Promise(r => setTimeout(r, 200));
    }
    assert.ok(ready, 'Current-source HTTP runner not ready');
    out.runtimeReady = new Date().toISOString();
    out.database = await db.$queryRaw`SELECT current_database() AS database, version() AS version`;
    const actor = await db.user.findFirstOrThrow({ where: { role: 'ADMIN', isActive: true }, select: { id: true, email: true, role: true } });
    const employee = await db.user.findFirstOrThrow({ where: { role: 'STAFF', isActive: true }, select: { id: true, email: true, role: true } });
    token = jwt.sign(actor, process.env.JWT_SECRET, { expiresIn: '2h' }); staff = jwt.sign(employee, process.env.JWT_SECRET, { expiresIn: '2h' });
    out.actors = { admin: actor.id, staff: employee.id }; category = await db.category.findFirstOrThrow({ select: { id: true } });
    out.migrationBaseline = await db.$queryRaw`SELECT to_regclass('public._prisma_migrations')::text AS migration_table`;
    if (process.env.SALES_RECOVERY_ONLY === 'YES') {
      const previous = [...ledger.runs].reverse().find(r => r !== out && r.scenarios.some(s => s.id === 'BH-13' && s.verdict === 'PASS'));
      assert.ok(previous, 'Successful BH-13 pre-restart evidence required');
      const source = previous.scenarios.find(s => s.id === 'BH-13').actual;
      await scenario('BH-13', 'Fresh source process replays durable submission after handler/process restart', async () => {
        const before = await persisted(source.order.id), count = await db.orderItem.count({ where: { productId: source.body.items[0].productId } });
        const found = ok(await api('GET', '/orders/by-request/' + source.requestId)).order;
        assert.equal(found.id, before.id); assert.equal((await order(source.body)).id, before.id);
        assert.equal(await db.orderItem.count({ where: { productId: source.body.items[0].productId } }), count);
        assert.deepEqual(await persisted(source.order.id), before);
        assert.equal((await api('GET', '/orders/by-request/' + source.requestId, undefined, staff)).status, 404);
        return { sourceRun: previous.run, before, after: await persisted(source.order.id), count, restartVerified: true };
      });
      return;
    }
    await scenario('BH-01', 'HTTP order persists exact identity, quantity, price and PENDING state', async () => {
      const i = await create('valid'), p = await product('valid', [[i, 2]]), o = await order(body(p, 2)), d = await persisted(o.id);
      assert.equal(d.status, 'PENDING'); assert.equal(d.items.length, 1); assert.equal(d.items[0].productId, p.id); assert.equal(d.items[0].quantity, 2); assert.equal(Number(d.items[0].price), 10000); assert.equal(Number(d.totalAmount), o.totalAmount); assert.equal(d.payments.length, 1);
      assert.equal((await api('POST', '/orders', body(p), '')).status, 401);
      return { order: d, state: await stock(i, 20, 4) };
    });
    await scenario('BH-02', 'Multiple products freeze recipe versions and sum shared demand exactly once', async () => {
      const i = await create('multi'), p = await product('multi-a', [[i, 2]]), q = await product('multi-b', [[i, 3]]);
      const o = await order({ items: [{ productId: p.id, quantity: 2 }, { productId: q.id, quantity: 1 }], paymentMethod: 'CASH' });
      const d = await persisted(o.id); assert.equal(d.items.length, 2); assert.ok(d.items.every(x => x.recipeId && x.recipeVersion === 1)); const s = await stock(i, 20, 7); assert.equal(s.ledger.filter(x => x.type === 'RESERVE').length, 2);
      // Publish a new recipe: completion must use frozen versions, not the new active recipe.
      ok(await api('POST', `/products/${p.id}/recipes`, { ingredients: [{ ingredientId: i.id, quantity: 9, unit: 'g' }] }), 201);
      ok(await transition(o, 'CONFIRMED')); ok(await transition(o, 'PREPARING')); ok(await transition(o, 'COMPLETED'));
      const after = await stock(i, 13, 0); assert.equal(after.ledger.filter(x => x.type === 'CONSUME').reduce((n, x) => n - Number(x.quantity), 0), 7);
      return { order: await persisted(o.id), after };
    });
    await scenario('BH-03', 'Batch yield and kg conversion scale quantities without premature per-serving rounding', async () => {
      const i = await create('yield', 100), p = await product('yield', [[i, 0.001, 'kg']], 3), o = await order(body(p, 3));
      const reserved = await stock(i, 100, 1); ok(await transition(o, 'CONFIRMED')); ok(await transition(o, 'PREPARING')); ok(await transition(o, 'COMPLETED')); return { reserved, consumed: await stock(i, 99, 0), order: await persisted(o.id) };
    });
    for (const id of ['BH-04', 'BH-05']) await scenario(id, 'Shortage rejects whole transaction, preserving order count, stock and ledger', async () => {
      const a = await create(id + '-enough', 10), b = await create(id + '-short', 1), p = await product(id, id === 'BH-04' ? [[b, 2]] : [[a, 2], [b, 2]]);
      const before = [await state(a), await state(b)], count = await db.orderItem.count({ where: { productId: p.id } }); assert.equal((await api('POST', '/orders', body(p))).status, 400);
      assert.deepEqual([await state(a), await state(b)], before); assert.equal(await db.orderItem.count({ where: { productId: p.id } }), count); return { before, after: [await state(a), await state(b)], count };
    });
    await scenario('BH-06', 'Two DB-observed overlapping HTTP orders cannot oversell shared stock', async () => {
      const i = await create('race', 10), p = await product('race', [[i, 7]]);
      const race = await overlap('Ingredient', i.id, [() => api('POST', '/orders', body(p)), () => api('POST', '/orders', body(p), staff)]);
      assert.deepEqual(race.results.map(r => r.status).sort(), [201, 400]); const s = await stock(i, 10, 7); assert.equal(s.ledger.filter(x => x.type === 'RESERVE').length, 1); assert.equal(await db.orderItem.count({ where: { productId: p.id } }), 1); return { ...race, state: s };
    });
    await scenario('BH-07', 'Concurrent/repeated initial submission and confirmation have one business effect', async () => {
      const i = await create('dedup', 30), p = await product('dedup', [[i, 2]]), requestId = randomUUID(), b = body(p, 1, { requestId });
      const responses = await Promise.all([api('POST', '/orders', b), api('POST', '/orders', b)]); const ids = responses.map(r => ok(r, 201).order.id);
      out.duplicateInitial = { ids, requestId }; assert.equal(new Set(ids).size, 1, 'Duplicate initial order creation'); const o = { id: ids[0] };
      assert.equal((await order(b)).id, o.id); const race = await overlap('Order', o.id, [() => transition(o, 'CONFIRMED'), () => transition(o, 'CONFIRMED', staff)]);
      assert.equal(race.results.filter(r => r.status === 200).length, 1); assert.ok([400, 409].includes(race.results.find(r => r.status !== 200).status)); assert.ok([400, 409].includes((await transition(o, 'CONFIRMED')).status));
      ok(await transition(o, 'PREPARING')); ok(await transition(o, 'COMPLETED')); assert.ok([400, 409].includes((await transition(o, 'COMPLETED')).status));
      assert.equal((await api('POST', '/orders', body(p, 2, { requestId }))).status, 409);
      const s = await stock(i, 28, 0); assert.equal(s.ledger.filter(x => x.type === 'RESERVE').length, 1); assert.equal(s.ledger.filter(x => x.type === 'CONSUME').length, 1); return { race, state: s, order: await persisted(o.id) };
    });
    await scenario('BH-08', 'Cancellation releases reservation once, physical stock unchanged and actor recorded', async () => {
      const i = await create('cancel'), p = await product('cancel', [[i, 2]]), o = await order(body(p)); ok(await transition(o, 'CANCELLED', staff)); const after = await stock(i, 20, 0);
      const release = after.ledger.filter(x => x.type === 'RELEASE'); assert.equal(release.length, 1); assert.equal(release[0].performedBy, employee.id); assert.ok([400, 409].includes((await transition(o, 'CANCELLED')).status)); assert.deepEqual(await state(i), after); return { after, order: await persisted(o.id) };
    });
    // Approved policy: request by STAFF, explicit ADMIN approval, no automatic stock restoration.
    const requestOp = async (o, kind, extra = {}) => {
      const current = await persisted(o.id);
      return ok(await api('POST', `/orders/${o.id}/operations`, { requestId: randomUUID(), expectedVersion: current.version, kind, reason: out.run, ...extra }, staff), 201).operation;
    };
    const approve = async (o, op, access = token) => api('POST', `/orders/${o.id}/operations/${op.id}/approve`, { expectedVersion: (await persisted(o.id)).version }, access);
    const prepared = async (label, quantity = 20) => {
      const i = await create(label, quantity), p = await product(label, [[i, 2]]), o = await order(body(p));
      ok(await transition(o, 'CONFIRMED')); await stock(i, quantity, 2);
      ok(await transition(o, 'PREPARING')); await stock(i, quantity - 2, 0);
      return { i, p, o };
    };
    await scenario('BH-09', 'ADMIN approves STAFF post-consumption cancellation; separate authorized cash refund; no restoration', async () => {
      const { i, o } = await prepared('after-cancel');
      ok(await api('POST', `/orders/${o.id}/confirm-payment`, {}));
      const before = await state(i), original = await persisted(o.id);
      assert.equal((await api('PATCH', `/orders/${o.id}/status`, { status: 'PREPARING', paymentStatus: 'REFUNDED' }, staff)).status, 400);
      assert.ok([400, 409].includes((await transition(o, 'CANCELLED', staff)).status));
      const op = await requestOp(o, 'CANCEL'); assert.equal((await approve(o, op, staff)).status, 403);
      const applied = ok(await approve(o, op)).operation; assert.equal(applied.approvedBy, actor.id); assert.ok(applied.approvedAt); assert.equal(applied.actorId, employee.id);
      assert.equal((await persisted(o.id)).status, 'CANCELLED'); assert.deepEqual(await state(i), before);
      ok(await approve(o, op)); assert.deepEqual(await state(i), before);
      assert.equal((await api('POST', `/payments/${original.payments[0].id}/mark-refunded`, { note: out.run }, staff)).status, 403);
      ok(await api('POST', `/payments/${original.payments[0].id}/mark-refunded`, { note: out.run })); assert.deepEqual(await state(i), before);
      assert.equal((await persisted(o.id)).paymentStatus, 'REFUNDED');
      return { before, after: await state(i), operation: applied, order: await persisted(o.id), financial: 'Existing ADMIN cash refund record; no automatic refund or stock restoration.' };
    });
    await scenario('BH-10', 'Approved preparation-error remake consumes frozen ingredients once; linked attempt, zero charge, shortage rollback', async () => {
      const { i, p, o } = await prepared('remake', 5), original = await persisted(o.id), before = await state(i);
      ok(await api('POST', `/products/${p.id}/recipes`, { ingredients: [{ ingredientId: i.id, quantity: 9, unit: 'g' }] }), 201);
      const op = await requestOp(o, 'REMAKE', { originalItemId: original.items[0].id });
      assert.equal((await approve(o, op, staff)).status, 403); assert.deepEqual(await state(i), before);
      const result = ok(await approve(o, op)).operation, after = await stock(i, 1, 0); ok(await approve(o, op)); assert.deepEqual(await state(i), after);
      const current = await persisted(o.id), attempt = current.items.find(x => x.id === result.replacementItemId);
      assert.equal(attempt.originalItemId, original.items[0].id); assert.equal(attempt.recipeId, original.items[0].recipeId); assert.equal(attempt.attemptType, 'REMAKE'); assert.equal(Number(current.totalAmount), Number(original.totalAmount));
      assert.equal(after.ledger.filter(x => x.type === 'CONSUME').length, 2);
      const short = await requestOp(o, 'REMAKE', { originalItemId: original.items[0].id }); const frozen = await persisted(o.id);
      assert.equal((await approve(o, short)).status, 400); assert.deepEqual(await state(i), after); assert.deepEqual(await persisted(o.id), frozen);
      assert.equal((await db.orderOperation.findUniqueOrThrow({ where: { id: short.id } })).status, 'REQUESTED');
      return { original, before, after, approved: result, insufficientOperation: short, order: current };
    });
    await scenario('BH-11', 'STAFF edits before PREPARING with atomic release/reallocation, new snapshots, audit and shortage rollback', async () => {
      const a = await create('edit-old'), b = await create('edit-new'), c = await create('edit-short', 1);
      const p = await product('edit-old', [[a, 2]]), q = await product('edit-new', [[b, 3]]), r = await product('edit-short', [[c, 2]]), o = await order(body(p));
      const currentP = ok(await api('GET', `/products/${q.id}`)).product;
      ok(await api('PUT', `/products/${q.id}`, { expectedUpdatedAt: currentP.updatedAt, price: 12000 }));
      const original = await persisted(o.id), edit = { requestId: randomUUID(), expectedVersion: original.version, reason: out.run, items: [{ productId: q.id, quantity: 1 }] };
      const changed = ok(await api('PATCH', `/orders/${o.id}/items`, edit, staff)).operation;
      ok(await api('PATCH', `/orders/${o.id}/items`, edit, staff)); await stock(a, 20, 0); await stock(b, 20, 3);
      const after = await persisted(o.id); assert.equal(Number(after.totalAmount), 12000 + Number(after.shippingFee)); assert.equal(after.items.find(x => x.id === original.items[0].id).consumptionStatus, 'VOIDED');
      const selected = ok(await api('GET', `/orders/${o.id}`)).order; assert.equal(selected.items.length, 1); assert.equal(selected.items[0].productId, q.id); assert.equal(selected.items[0].price, 12000); assert.equal(selected.itemHistory.length, 2);
      const frozen = [await state(a), await state(b), await state(c)], auditCount = await db.orderOperation.count({ where: { orderId: o.id } });
      assert.equal((await api('PATCH', `/orders/${o.id}/items`, { ...edit, requestId: randomUUID(), expectedVersion: after.version, items: [{ productId: r.id, quantity: 1 }] }, staff)).status, 400);
      assert.deepEqual([await state(a), await state(b), await state(c)], frozen); assert.deepEqual(await persisted(o.id), after); assert.equal(await db.orderOperation.count({ where: { orderId: o.id } }), auditCount);
      assert.equal((await api('PATCH', `/orders/${o.id}/items`, { ...edit, requestId: randomUUID() }, staff)).status, 409);
      ok(await transition(o, 'CONFIRMED')); ok(await transition(o, 'PREPARING')); ok(await transition(o, 'COMPLETED')); await stock(b, 17, 0);
      return { original, changed, selected, after, shortageRollback: frozen, consumed: await state(b) };
    });
    await scenario('BH-12', 'Authorized post-preparation replacement preserves history, separate consumption and positive/negative/zero financial adjustments', async () => {
      const results = [];
      for (const price of [12000, 8000, 10000]) {
        const { i, o } = await prepared('correction-' + price), j = await create('replacement-' + price), q = await product('replacement-' + price, [[j, 3]]);
        const cp = ok(await api('GET', `/products/${q.id}`)).product; ok(await api('PUT', `/products/${q.id}`, { expectedUpdatedAt: cp.updatedAt, price }));
        const original = await persisted(o.id), before = await state(i), op = await requestOp(o, 'CORRECTION', { originalItemId: original.items[0].id, replacement: { productId: q.id, quantity: 1 } });
        assert.equal((await approve(o, op, staff)).status, 403); const applied = ok(await approve(o, op)).operation; ok(await approve(o, op));
        assert.deepEqual(await state(i), before); await stock(j, 20, 3);
        const read = ok(await api('GET', `/orders/${o.id}`)).order;
        assert.equal(read.totalAmount, Number(original.totalAmount)); assert.equal(read.adjustmentTotal, price - 10000); assert.equal(read.adjustedPayable, Number(original.totalAmount) + price - 10000);
        assert.equal(read.additionalAmountDue, Math.max(price - 10000, 0)); assert.equal(read.refundDue, Math.max(10000 - price, 0));
        assert.equal(Number(applied.amountDelta), price - 10000); const current = await persisted(o.id);
        assert.equal(current.items.find(x => x.id === original.items[0].id).recipeId, original.items[0].recipeId); assert.ok(current.items.find(x => x.id === original.items[0].id).replacedAt);
        assert.equal((await transition(o, 'COMPLETED')).status, 409);
        const prepare = { requestId: randomUUID(), expectedVersion: current.version };
        ok(await api('POST', `/orders/${o.id}/items/${applied.replacementItemId}/prepare`, prepare, staff));
        const consumed = await stock(j, 17, 0); ok(await api('POST', `/orders/${o.id}/items/${applied.replacementItemId}/prepare`, prepare, staff)); assert.deepEqual(await state(j), consumed);
        ok(await transition(o, 'COMPLETED')); assert.deepEqual(await state(i), before); assert.deepEqual((await persisted(o.id)).payments, original.payments);
        results.push({ price, original, originalStock: before, operation: applied, read, replacementStock: consumed, final: await persisted(o.id) });
      }
      return { results, payments: 'Adjustments only; no automatic payment/refund; original payment records unchanged.' };
    });
    await scenario('BH-13', 'Unknown client outcome reconciles through durable request identity; retry cannot duplicate', async () => {
      const i = await create('lost'), p = await product('lost', [[i, 2]]), requestId = randomUUID(), b = body(p, 1, { requestId });
      await disconnectSubmit(i.id, b);
      let lookup;
      for (let n = 0; n < 40; n++) { lookup = await api('GET', '/orders/by-request/' + requestId); if (lookup.status === 200) break; assert.equal(lookup.status, 404); await new Promise(r => setTimeout(r, 50)); }
      const found = ok(lookup).order;
      assert.equal((await order(b)).id, found.id); assert.equal(await db.orderItem.count({ where: { productId: p.id } }), 1);
      ok(await transition(found, 'CONFIRMED')); const retry = await transition(found, 'CONFIRMED'); assert.ok([400, 409].includes(retry.status)); assert.equal(ok(await api('GET', '/orders/' + found.id)).order.status, 'PROCESSING');
      return { requestId, body: b, order: await persisted(found.id), stock: await stock(i, 20, 2), recovery: 'Actual client socket destroyed while handler waits in PostgreSQL; durable lookup then identical POST replay.' };
    });
    await scenario('BH-14', 'Two authorized employees overlap completion; one transition and one stock movement', async () => {
      const i = await create('employees'), p = await product('employees', [[i, 2]]), o = await order(body(p)); ok(await transition(o, 'CONFIRMED')); ok(await transition(o, 'PREPARING'));
      const race = await overlap('Order', o.id, [() => transition(o, 'COMPLETED'), () => transition(o, 'COMPLETED', staff)]); assert.equal(race.results.filter(r => r.status === 200).length, 1); assert.ok([400, 409].includes(race.results.find(r => r.status !== 200).status));
      const s = await stock(i, 18, 0); assert.equal(s.ledger.filter(x => x.type === 'CONSUME').length, 1); assert.equal((await persisted(o.id)).status, 'COMPLETED'); return { race, state: s, order: await persisted(o.id) };
    });
    await scenario('BH-15', 'Confirmed order price/total remain frozen after verified Product API price update', async () => {
      const i = await create('price'), p = await product('price', [[i, 2]]), o = await order(body(p)); ok(await transition(o, 'CONFIRMED')); const before = await persisted(o.id);
      const current = ok(await api('GET', `/products/${p.id}`)).product; ok(await api('PUT', `/products/${p.id}`, { expectedUpdatedAt: current.updatedAt, price: 12000 })); const read = ok(await api('GET', '/orders/' + o.id)).order, after = await persisted(o.id);
      assert.equal(read.items[0].price, 10000); assert.equal(read.totalAmount, Number(before.totalAmount)); assert.deepEqual(after.items, before.items); assert.equal(String(after.totalAmount), String(before.totalAmount));
      const next = await order(body(p)); assert.equal(next.items[0].price, 12000); ok(await transition(o, 'PREPARING')); ok(await transition(o, 'COMPLETED')); return { before, after, next, state: await stock(i, 18, 2) };
    });
    await scenario('BH-16', 'Expired/quarantined/recalled positive physical stock cannot reserve or consume', async () => {
      const results = [];
      for (const quality of ['expired', 'quarantine', 'recall']) {
        const i = await create('unusable-' + quality, 10, quality === 'expired' ? '2020-01-01' : '2099-01-01'), p = await product('unusable-' + quality, [[i, 2]]);
        const batch = (await state(i)).batches[0]; let existing;
        if (quality !== 'expired') { existing = await order(body(p)); ok(await transition(existing, 'CONFIRMED')); ok(await api('POST', `/ingredients/${i.id}/batches/${batch.id}/${quality}`, { reason: out.run, requestId: randomUUID() })); }
        const before = await state(i); assert.equal(ok(await api('GET', `/ingredients/${i.id}`)).availableQuantity, 0);
        assert.equal((await api('POST', '/orders', body(p))).status, 400);
        if (existing) assert.equal((await transition(existing, 'PREPARING')).status, 400);
        assert.deepEqual(await state(i), before); assert.equal(Number(before.ingredient.quantity), 10); results.push({ quality, before, after: await state(i) });
      }
      return { results };
    });
  } finally { save(); await db.$disconnect(); }
  console.log(JSON.stringify({ run: out.run, requests: out.requests.length, scenarios: out.scenarios.map(s => ({ id: s.id, verdict: s.verdict, error: s.error?.split('\n')[0] })) }));
}
main().catch(e => { console.error(e.message); process.exitCode = 1; });
