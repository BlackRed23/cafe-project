// Opt-in HTTP acceptance against existing cafedb; creates only uniquely owned fixtures.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
require('dotenv').config({ path: 'apps/api/.env', quiet: true });
require('dotenv').config({ quiet: true });
const { PrismaClient } = require('@prisma/client');
const jwt = require('jsonwebtoken');
async function main() {
  assert.equal(process.env.LOT_CAFEDB_CONFIRMED, 'YES');
  const url = new URL(process.env.DATABASE_URL); assert.equal(url.pathname, '/cafedb');
  url.hostname = '127.0.0.1'; url.port = '55432';
  const db = new PrismaClient({ datasources: { db: { url: url.toString() } } });
  const directory = 'D:/KLTN/cafe-project-artifacts/reports/lot';
  fs.mkdirSync(directory, { recursive: true });
  const evidenceFile = path.join(directory, 'lot-evidence.json');
  const ledger = fs.existsSync(evidenceFile) ? JSON.parse(fs.readFileSync(evidenceFile)) : { runs: [] };
  const out = { run: 'lot-' + randomUUID(), phase: process.env.LOT_PHASE || 'baseline', time: new Date().toISOString(), requests: [], scenarios: [], regressions: [] };
  ledger.runs.push(out);
  let token, staff, seq = 0;
  const api = async (method, route, body, access = token) => {
    const started = new Date().toISOString();
    const r = await fetch('http://127.0.0.1:5002/api' + route, { method, signal: AbortSignal.timeout(30000), headers: { 'content-type': 'application/json', authorization: 'Bearer ' + access }, body: body === undefined ? undefined : JSON.stringify(body) });
    const raw = await r.text(); let response; try { response = JSON.parse(raw); } catch { response = { text: raw }; }
    const e = { id: out.phase + '-H' + (++seq), method, route, request: body, role: access === staff ? 'STAFF' : 'ADMIN', started, ended: new Date().toISOString(), status: r.status, response };
    out.requests.push(e); return e;
  };
  const ok = (r, status = 200) => { assert.equal(r.status, status, r.id + ': ' + JSON.stringify(r.response)); return r.response.data; };
  const create = async (suffix, extra = {}) => ok(await api('POST', '/ingredients', { sku: out.run + '-' + suffix, name: out.run + '-' + suffix, baseUnit: 'g', costPerBaseUnit: 2, expiryClassification: 'NON_PERISHABLE', ...extra }), 201);
  const receipt = async (i, qty, code, expiry = '2099-01-01T00:00:00Z', cost = 2) => ok(await api('POST', `/ingredients/${i.id}/import`, { quantity: qty, unit: 'g', unitCost: cost, batchCode: out.run + '-' + code, ...(expiry === undefined ? {} : { expirationDate: expiry }) }));
  const consume = (i, quantity, requestId = randomUUID(), access = token) => api('POST', `/ingredients/${i.id}/internal-use`, { quantity, unit: 'g', requestId, purpose: out.run, recipient: 'lot acceptance fixture' }, access);
  const state = async i => ({ ingredient: await db.ingredient.findUniqueOrThrow({ where: { id: i.id } }), batches: await db.ingredientBatch.findMany({ where: { ingredientId: i.id }, orderBy: { id: 'asc' } }), ledger: await db.inventoryTransaction.findMany({ where: { ingredientId: i.id }, orderBy: { id: 'asc' } }) });
  const consistent = s => assert.equal(Number(s.ingredient.quantity), s.batches.reduce((n, b) => n + Number(b.quantityRemaining), 0));
  const orderFixture = async (i, suffix, quantity = 2) => {
    const category = await db.category.findFirstOrThrow({ select: { id: true } });
    const product = ok(await api('POST', '/products', { sku: out.run + suffix, name: out.run + suffix,
      price: 10000, categoryId: category.id, isActive: false, requiresRecipe: true }), 201).product;
    ok(await api('POST', `/products/${product.id}/recipes`, { ingredients: [{ ingredientId: i.id, quantity: 1, unit: 'g' }] }), 201);
    const current = ok(await api('GET', `/products/${product.id}`)).product;
    ok(await api('PUT', `/products/${product.id}`, { expectedUpdatedAt: current.updatedAt, isActive: true }));
    const body = { items: [{ productId: product.id, quantity, toppings: [] }], paymentMethod: 'CASH' };
    return { product, body, order: ok(await api('POST', '/orders', body), 201).order };
  };
  const scenario = async (id, expected, fn) => {
    if (process.env.LOT_CASES && !process.env.LOT_CASES.split(',').includes(id)) return;
    const start = out.requests.length;
    try { const actual = await fn(); out.scenarios.push({ id, expected, verdict: actual.verdict || 'PASS', actual, evidence: out.requests.slice(start).map(e => e.id) }); }
    catch (e) { out.scenarios.push({ id, expected, verdict: 'FAIL', error: e.message, evidence: out.requests.slice(start).map(e => e.id) }); }
    console.log(id + ' ' + out.scenarios.at(-1).verdict);
    fs.writeFileSync(evidenceFile, JSON.stringify(ledger, null, 2));
  };
  try {
    out.database = await db.$queryRaw`SELECT current_database() AS database, version() AS version, now() AS now`;
    const actor = await db.user.findFirstOrThrow({ where: { role: 'ADMIN', isActive: true }, select: { id: true, email: true, role: true } });
    const staffActor = await db.user.findFirstOrThrow({ where: { role: 'STAFF', isActive: true }, select: { id: true, email: true, role: true } });
    token = jwt.sign(actor, process.env.JWT_SECRET, { expiresIn: '30m' }); staff = jwt.sign(staffActor, process.env.JWT_SECRET, { expiresIn: '30m' });
    await scenario('LO-01', 'Receipt persists batch, timestamp, expiry, quantity and ledger', async () => {
      const i = await create('receipt'), r = await receipt(i, 10, 'A'); const s = await state(i); consistent(s);
      const b = s.batches[0]; assert.equal(b.id, r.batch.id); assert.equal(Number(b.quantityInitial), 10); assert.equal(Number(b.quantityRemaining), 10); assert.equal(b.batchCode, out.run + '-A'); assert.equal(b.expirationDate.toISOString(), '2099-01-01T00:00:00.000Z'); assert.ok(b.receivedAt instanceof Date); assert.equal(s.ledger.length, 1); assert.equal(s.ledger[0].performedBy, actor.id); return s;
    });
    await scenario('LO-02', 'Separate lots preserve costs, expiry and balances; aggregate equals physical sum', async () => {
      const i = await create('multiple'); await receipt(i, 4, 'late', '2099-02-01', 3); await receipt(i, 6, 'early', '2099-01-01', 5); const s = await state(i); consistent(s); assert.equal(s.batches.length, 2); assert.equal(new Set(s.batches.map(b => b.id)).size, 2); assert.deepEqual(s.batches.map(b => Number(b.unitCost)).sort(), [3, 5]); assert.equal(ok(await api('GET', `/ingredients/${i.id}`)).availableQuantity, 10); return s;
    });
    for (const [id, demand] of [['LO-03', 3], ['LO-04', 6]]) await scenario(id, 'Atomic FEFO consumption uses early lot first; exact allocations and insufficient rollback', async () => {
      const i = await create(id); const late = await receipt(i, 10, 'late', '2099-02-01'), early = await receipt(i, 4, 'early', '2099-01-01');
      ok(await consume(i, demand)); const s = await state(i); consistent(s); const rows = s.ledger.filter(t => t.type === 'CONSUME');
      assert.equal(Number(s.batches.find(b => b.id === early.batch.id).quantityRemaining), Math.max(4 - demand, 0));
      assert.equal(Number(s.batches.find(b => b.id === late.batch.id).quantityRemaining), 10 - Math.max(demand - 4, 0));
      assert.equal(rows.length, demand > 4 ? 2 : 1); assert.equal(rows.reduce((n, t) => n - Number(t.quantity), 0), demand);
      const before = JSON.stringify(s); assert.equal((await consume(i, 20)).status, 400); assert.equal(JSON.stringify(await state(i)), before); return s;
    });
    await scenario('LO-05', 'Expired stock excluded from availability and consumption; exact timestamp boundary preserves history', async () => {
      const i = await create('expired'); const boundary = new Date(Date.now() - 1000).toISOString(); const expired = await receipt(i, 7, 'expired', boundary); const fresh = await receipt(i, 3, 'fresh');
      const before = await state(i), read = ok(await api('GET', `/ingredients/${i.id}`));
      // Capture consumption even when availability is wrong, to expose both defects.
      const used = await consume(i, 3); const after = await state(i); out.expiryEvidence = { boundary, before, read, used: used.id, after };
      assert.equal(read.availableQuantity, 3); ok(used); consistent(after);
      assert.equal(Number(after.batches.find(b => b.id === expired.batch.id).quantityRemaining), 7); assert.equal(Number(after.batches.find(b => b.id === fresh.batch.id).quantityRemaining), 0);
      const frozen = JSON.stringify(after); assert.equal((await consume(i, 1)).status, 400); assert.equal(JSON.stringify(await state(i)), frozen); return out.expiryEvidence;
    });
    await scenario('LO-06', 'Configurable approved near-expiry threshold and observable warning', async () => {
      const route = '/system-settings/inventory.lotNearExpiryDays';
      const previous = ok(await api('GET', route)).setting;
      try {
        ok(await api('PATCH', route, { value: '7' }));
        const i = await create('near');
        const inside = await receipt(i, 2, 'inside', new Date(Date.now() + 7 * 86400000 - 60000).toISOString());
        const outside = await receipt(i, 3, 'outside', new Date(Date.now() + 7 * 86400000 + 60000).toISOString());
        const expired = await receipt(i, 5, 'expired', new Date(Date.now() - 1000).toISOString());
        const read = ok(await api('GET', `/ingredients/${i.id}/batches`));
        assert.equal(read.warningDays, 7);
        assert.equal(read.batches.find(b => b.id === inside.batch.id).expiryStatus, 'NEAR_EXPIRY');
        assert.equal(read.batches.find(b => b.id === outside.batch.id).expiryStatus, 'VALID');
        assert.equal(read.batches.find(b => b.id === expired.batch.id).expiryStatus, 'EXPIRED');
        assert.equal(read.ingredient.physicalQuantity, 10); assert.equal(read.ingredient.availableQuantity, 5);
        assert.equal((await api('PATCH', route, { value: '8' }, staff)).status, 403);
        assert.equal((await api('PATCH', route, { value: '-1' })).status, 400);
        ok(await api('PATCH', route, { value: '8' }));
        const configured = ok(await api('GET', `/ingredients/${i.id}/batches`));
        assert.equal(configured.batches.find(b => b.id === outside.batch.id).expiryStatus, 'NEAR_EXPIRY');
        assert.equal((await db.systemSetting.findUniqueOrThrow({ where: { key: 'inventory.lotNearExpiryDays' } })).value, '8');
        return { read, configured, state: await state(i), exactBoundary: 'Pure unit test covers exact 7-day equality; HTTP brackets boundary by +/-60 seconds.' };
      } finally { ok(await api('PATCH', route, { value: previous.value })); }
    });
    for (const [id, action] of [['LO-07', 'quarantine'], ['LO-11', 'recall'], ['LO-13', 'quarantine']]) await scenario(id, 'Audited quality transition preserves physical stock, blocks reservation/internal-use and existing order completion', async () => {
      const i = await create(id); const b = await receipt(i, 10, id);
      const pending = await orderFixture(i, id);
      if (id === 'LO-11') {
        ok(await api('PATCH', `/orders/${pending.order.id}/status`, { status: 'CONFIRMED' }));
        ok(await api('PATCH', `/orders/${pending.order.id}/status`, { status: 'COMPLETED' }));
        pending.order = ok(await api('POST', '/orders', pending.body), 201).order;
      }
      const before = await state(i), route = `/ingredients/${i.id}/batches/${b.batch.id}/${action}`;
      const body = { requestId: randomUUID(), reason: out.run + ' quality failed' };
      assert.equal((await api('POST', route, body, staff)).status, 403);
      assert.equal((await api('POST', route, { ...body, reason: '' })).status, 400);
      const r = ok(await api('POST', route, body));
      assert.equal(r.batch.qualityStatus, action === 'recall' ? 'RECALLED' : 'QUARANTINED');
      assert.equal(r.event.actorId, actor.id); assert.equal(r.event.reason, body.reason); assert.ok(r.event.createdAt);
      assert.equal(ok(await api('POST', route, body)).replayed, true);
      assert.equal((await api('POST', route, { ...body, reason: 'changed' })).status, 409);
      const blocked = await state(i); assert.equal(Number(blocked.ingredient.quantity), Number(before.ingredient.quantity));
      assert.equal(Number(blocked.batches[0].quantityRemaining), Number(before.batches[0].quantityRemaining)); assert.deepEqual(blocked.ledger, before.ledger);
      assert.equal((await consume(i, 1)).status, 400);
      assert.equal((await api('POST', '/orders', pending.body)).status, 400);
      assert.equal((await api('POST', '/simulate-sale', { productId: pending.product.id, quantity: 1, note: out.run })).status, 400);
      assert.deepEqual(await state(i), blocked);
      ok(await api('PATCH', `/orders/${pending.order.id}/status`, { status: 'CONFIRMED' }));
      const beforeCompletion = await state(i);
      assert.equal((await api('PATCH', `/orders/${pending.order.id}/status`, { status: 'COMPLETED' })).status, 400);
      assert.deepEqual(await state(i), beforeCompletion);
      ok(await api('PATCH', `/orders/${pending.order.id}/status`, { status: 'CANCELLED' }));
      const read = ok(await api('GET', `/ingredients/${i.id}/batches`, undefined, staff));
      assert.equal(read.ingredient.availableQuantity, 0); assert.equal(read.ingredient.usableQuantity, 0); assert.ok(read.ingredient.physicalQuantity > 0);
      const trace = ok(await api('GET', `/ingredients/${i.id}/batches/${b.batch.id}/trace`));
      assert.equal(trace.events.length, 1);
      if (id === 'LO-11') {
        assert.ok(trace.outbound.length > 0); assert.ok(trace.orders.length > 0);
        const downgraded = ok(await api('POST', `/ingredients/${i.id}/batches/${b.batch.id}/quarantine`, { requestId: randomUUID(), reason: 'Must not release recalled lot' }));
        assert.equal(downgraded.batch.qualityStatus, 'RECALLED');
      }
      consistent(await state(i)); return { before, after: await state(i), read, trace };
    });
    await scenario('LO-08', 'Missing mandatory expiry rejected under established perishable policy', async () => {
      const i = await create('perishable', { expiryClassification: 'PERISHABLE', shelfLifeDays: 20 });
      const body = { quantity: 2, unitCost: 2, batchCode: out.run + '-null' }, before = await state(i);
      for (const extra of [{}, { expirationDate: '' }, { expirationDate: 'invalid' }, { expirationDate: '2099-02-30' }]) {
        assert.equal((await api('POST', `/ingredients/${i.id}/import`, { ...body, ...extra })).status, 400); assert.deepEqual(await state(i), before);
      }
      await receipt(i, 2, 'perishable-valid');
      const non = await create('nonperishable'); ok(await api('POST', `/ingredients/${non.id}/import`, body));
      assert.equal((await state(non)).batches[0].expirationDate, null);
      const unclassified = await create('unclassified', { expiryClassification: undefined });
      const fresh = await state(unclassified); assert.equal(fresh.ingredient.expiryClassificationRequired, true);
      assert.equal((await api('POST', `/ingredients/${unclassified.id}/import`, { ...body, expirationDate: '2099-01-01' })).status, 409); assert.deepEqual(await state(unclassified), fresh);
      await assert.rejects(db.ingredientBatch.create({ data: { ingredientId: unclassified.id,
        batchCode: out.run + '-blocked-db-insert', quantityInitial: 1, quantityRemaining: 1 } }), /Classify new ingredient/);
      await assert.rejects(db.ingredientBatch.create({ data: { ingredientId: i.id,
        batchCode: out.run + '-blocked-perishable-db-insert', quantityInitial: 1, quantityRemaining: 1 } }), /PERISHABLE ingredient requires/);
      assert.deepEqual(await state(unclassified), fresh);
      ok(await api('PATCH', `/ingredients/${unclassified.id}`, { expiryClassification: 'NON_PERISHABLE' }));
      ok(await api('POST', `/ingredients/${unclassified.id}/import`, body));
      const legacy = await db.ingredient.findFirstOrThrow({ where: { expiryClassificationRequired: false, expiryClassification: null, sku: { startsWith: 'lot-' } }, select: { id: true, expiryClassification: true, expiryClassificationRequired: true } });
      assert.equal(ok(await api('GET', `/ingredients/${legacy.id}`)).expiryClassification, null);
      const legacyBefore = await state(legacy);
      ok(await api('POST', `/ingredients/${legacy.id}/import`, { quantity: 1, unitCost: 2, batchCode: out.run + '-legacy-null' }));
      const legacyAfter = await state(legacy); assert.equal(legacyAfter.ingredient.expiryClassification, null);
      assert.equal(legacyAfter.ingredient.expiryClassificationRequired, false);
      assert.equal(Number(legacyAfter.ingredient.quantity), Number(legacyBefore.ingredient.quantity) + 1);
      for (const row of legacyBefore.ledger) assert.deepEqual(legacyAfter.ledger.find(t => t.id === row.id), row);
      return { perishable: await state(i), nonperishable: await state(non), classifiedAfterRejection: await state(unclassified), legacyClassificationUnchanged: legacy, legacyBefore, legacyAfter, databaseBypassRejected: true };
    });
    await scenario('LO-09', 'Overlapping HTTP operations serialize on shared insufficient stock, no oversell or duplicate ledger', async () => {
      const i = await create('race'); await receipt(i, 10, 'race');
      // Hold real row lock until both HTTP handlers are waiting: overlap is DB-observed, not inferred from Promise.all.
      let release, locked; const ready = new Promise(r => locked = r), gate = new Promise(r => release = r);
      const holder = db.$transaction(async tx => { await tx.$queryRaw`SELECT id FROM "Ingredient" WHERE id = ${i.id} FOR UPDATE`; locked(); await gate; }, { timeout: 15000 });
      await ready; const calls = [consume(i, 7), consume(i, 7)]; let waiting = 0;
      try { for (let n = 0; n < 60; n++) { const [r] = await db.$queryRaw`SELECT count(*)::int AS count FROM pg_stat_activity WHERE datname = current_database() AND wait_event_type = 'Lock' AND query LIKE '%Ingredient%FOR UPDATE%'`; waiting = r.count; if (waiting >= 2) break; await new Promise(r => setTimeout(r, 50)); } }
      finally { release(); await holder; }
      const results = await Promise.all(calls); const s = await state(i); out.concurrentEvidence = { waiting, responses: results.map(r => r.id), state: s };
      assert.ok(waiting >= 2, 'Both HTTP handlers must be waiting on DB locks'); assert.deepEqual(results.map(r => r.status).sort(), [200, 400]); consistent(s); assert.equal(Number(s.ingredient.quantity), 3); assert.equal(s.ledger.filter(t => t.type === 'CONSUME').length, 1); assert.ok(s.batches.every(b => Number(b.quantityRemaining) >= 0)); return out.concurrentEvidence;
    });
    await scenario('LO-10', 'Return references original outbound batch, quantity/quality and duplicate protection', async () => {
      const i = await create('return'); const b = await receipt(i, 5, 'return'); ok(await consume(i, 3)); const before = await state(i), source = before.ledger.find(t => t.type === 'CONSUME');
      const route = `/ingredients/${i.id}/returns`;
      const body = { sourceTransactionId: source.id, batchId: b.batch.id, quantity: 1, quality: 'UNKNOWN', requestId: randomUUID(), reason: out.run + ' returned material' };
      assert.equal((await api('POST', route, body, staff)).status, 403);
      assert.equal((await api('POST', route, { ...body, quantity: 0 })).status, 400);
      assert.equal((await api('POST', route, { ...body, batchId: 'wrong-lot' })).status, 409);
      const r = ok(await api('POST', route, body)); assert.equal(r.return.sourceTransactionId, source.id); assert.equal(r.return.sourceBatchId, b.batch.id);
      assert.equal(r.return.actorId, actor.id); assert.equal(r.return.disposition, 'QUARANTINED');
      const after = await state(i); consistent(after); assert.equal(Number(after.ingredient.quantity), 3);
      assert.equal(after.batches.find(x => x.id === r.return.targetBatchId).qualityStatus, 'QUARANTINED');
      assert.equal(ok(await api('GET', `/ingredients/${i.id}`)).availableQuantity, 2);
      assert.equal(ok(await api('POST', route, body)).replayed, true); assert.deepEqual(await state(i), after);
      assert.equal((await api('POST', route, { ...body, quantity: 2 })).status, 409);
      assert.equal((await api('POST', route, { ...body, requestId: randomUUID(), quantity: 3 })).status, 409); assert.deepEqual(await state(i), after);
      const returnedRest = ok(await api('POST', route, { ...body, requestId: randomUUID(), quantity: 2, quality: 'SAFE' }));
      assert.equal(returnedRest.return.disposition, 'QUARANTINED'); assert.equal(returnedRest.releaseToUsable, 'NOT_VERIFIED');
      assert.equal((await api('POST', route, { ...body, requestId: randomUUID() })).status, 409);
      ok(await consume(i, 2)); const frozen = await state(i); assert.equal((await consume(i, 1)).status, 400); assert.deepEqual(await state(i), frozen); consistent(frozen);
      const returns = await db.lotReturn.findMany({ where: { sourceTransactionId: source.id } }); assert.equal(returns.length, 2); assert.equal(returns.reduce((n, r) => n + Number(r.quantity), 0), 3);
      const trace = ok(await api('GET', `/ingredients/${i.id}/batches/${b.batch.id}/trace`)); assert.equal(trace.returns.length, 2);
      const race = await create('return-race'), raceBatch = await receipt(race, 5, 'return-race'); ok(await consume(race, 3));
      const raceSource = (await state(race)).ledger.find(t => t.type === 'CONSUME');
      const returnBody = { ...body, sourceTransactionId: raceSource.id, batchId: raceBatch.batch.id, quantity: 2 };
      const competing = await Promise.all([api('POST', `/ingredients/${race.id}/returns`, { ...returnBody, requestId: randomUUID() }), api('POST', `/ingredients/${race.id}/returns`, { ...returnBody, requestId: randomUUID() })]);
      assert.deepEqual(competing.map(r => r.status).sort(), [200, 409]);
      const concurrentReturns = await db.lotReturn.findMany({ where: { sourceTransactionId: raceSource.id } }); assert.equal(concurrentReturns.length, 1); assert.equal(Number(concurrentReturns[0].quantity), 2); consistent(await state(race));
      return { before, after: frozen, returns, trace, concurrentReturns, releaseToUsable: 'NOT_VERIFIED: all returns quarantined, including caller assertion SAFE.' };
    });
    await scenario('LO-12', 'DELETE transacted batch rejects destructive removal; ledger and links intact', async () => {
      const i = await create('delete'); const b = await receipt(i, 5, 'delete'); ok(await consume(i, 1)); const before = await state(i);
      const route = `/ingredients/${i.id}/batches/${b.batch.id}`;
      assert.equal((await api('DELETE', route, undefined, staff)).status, 403);
      const r = await api('DELETE', route); assert.equal(r.status, 409); assert.match(r.response.message || r.response.error?.message || JSON.stringify(r.response), /transactions|references/); assert.deepEqual(await state(i), before);
      return { state: before, businessConflict: r.response };
    });
    await scenario('LO-14', 'Exact depletion leaves zero, implicit depleted status and no further allocation', async () => {
      // Complete lot list must expose depletion even when ingredient detail omits zero lots.
      const i = await create('deplete'); await receipt(i, 5, 'deplete'); ok(await consume(i, 5)); const s = await state(i); consistent(s); assert.equal(Number(s.batches[0].quantityRemaining), 0); assert.equal(Number(s.ingredient.quantity), 0); const read = ok(await api('GET', `/ingredients/${i.id}`)); assert.equal(read.availableQuantity, 0); assert.equal(read.status, 'OUT_OF_STOCK'); assert.equal(read.batches.length, 0); const before = JSON.stringify(s); assert.equal((await consume(i, 1)).status, 400); assert.equal(JSON.stringify(await state(i)), before);
      const listed = ok(await api('GET', `/ingredients/${i.id}/batches`));
      assert.equal(listed.batches[0].depletionStatus, 'DEPLETED');
      return { state: s, read, listed };
    });
    try {
      const i = await create('regression'); await receipt(i, 20, 'regression');
      const expired = await receipt(i, 7, 'regression-expired', new Date(Date.now() - 1000).toISOString());
      const key = randomUUID(); ok(await consume(i, 2, key)); const before = await state(i); assert.equal(ok(await consume(i, 2, key)).replayed, true); assert.deepEqual(await state(i), before); assert.equal((await consume(i, 3, key)).status, 409); assert.equal((await consume(i, 1, randomUUID(), staff)).status, 403); assert.deepEqual(await state(i), before);
      const category = await db.category.findFirstOrThrow({ select: { id: true } });
      const p = ok(await api('POST', '/products', { sku: out.run + '-product', name: out.run, price: 10000, categoryId: category.id, isActive: false, requiresRecipe: true }), 201).product;
      ok(await api('POST', `/products/${p.id}/recipes`, { ingredients: [{ ingredientId: i.id, quantity: 3, unit: 'g' }] }), 201);
      const current = ok(await api('GET', `/products/${p.id}`)).product; ok(await api('PUT', `/products/${p.id}`, { expectedUpdatedAt: current.updatedAt, isActive: true }));
      const orderBody = { items: [{ productId: p.id, quantity: 2, toppings: [] }], paymentMethod: 'CASH' };
      const o = ok(await api('POST', '/orders', orderBody), 201).order; let s = await state(i); assert.equal(Number(s.ingredient.quantity), 25); assert.equal(Number(s.ingredient.reserved), 6);
      ok(await api('PATCH', `/orders/${o.id}/status`, { status: 'CANCELLED' })); s = await state(i); assert.equal(Number(s.ingredient.quantity), 25); assert.equal(Number(s.ingredient.reserved), 0);
      const o2 = ok(await api('POST', '/orders', orderBody), 201).order; ok(await api('PATCH', `/orders/${o2.id}/status`, { status: 'CONFIRMED' })); ok(await api('PATCH', `/orders/${o2.id}/status`, { status: 'COMPLETED' })); s = await state(i); consistent(s); assert.equal(Number(s.ingredient.quantity), 19); assert.equal(Number(s.ingredient.reserved), 0);
      assert.equal(Number(s.batches.find(b => b.id === expired.batch.id).quantityRemaining), 7);
      assert.equal(ok(await api('GET', `/ingredients/${i.id}`)).availableQuantity, 12);
      const reservationBefore = await state(i);
      assert.equal((await api('POST', '/orders', { ...orderBody, items: [{ productId: p.id, quantity: 5, toppings: [] }] })).status, 400);
      assert.deepEqual(await state(i), reservationBefore);
      const done = JSON.stringify(s); const repeat = await api('PATCH', `/orders/${o2.id}/status`, { status: 'COMPLETED' }); assert.ok([200, 400, 409].includes(repeat.status)); assert.equal(JSON.stringify(await state(i)), done); ok(await api('GET', `/ingredients/${i.id}/transactions`));
      ok(await api('POST', '/simulate-sale', { productId: p.id, quantity: 1, note: out.run + ' eligible consumption regression' }));
      const simulated = await state(i); consistent(simulated); assert.equal(Number(simulated.ingredient.quantity), 16);
      const simulationLedger = simulated.ledger.filter(t => t.type === 'SIMULATE_SALE');
      assert.ok(simulationLedger.length > 0); assert.ok(simulationLedger.every(t => t.batchId && t.quantity.lt(0)));
      assert.equal(Number(simulated.batches.find(b => b.id === expired.batch.id).quantityRemaining), 7);
      out.regressions.push({ verdict: 'PASS', description: 'Internal-use retry/conflict/RBAC; recipe reservation, cancellation, completion, repeat completion and ledger; eligible-only simulation with batch provenance; aggregate consistent.', state: simulated });
    } catch (e) { out.regressions.push({ verdict: 'FAIL', error: e.message }); }
  } finally { await db.$disconnect(); fs.writeFileSync(evidenceFile, JSON.stringify(ledger, null, 2)); }
  console.log(JSON.stringify({ phase: out.phase, http: out.requests.length, verdicts: out.scenarios.map(s => s.id + ':' + s.verdict), regressions: out.regressions.map(r => r.verdict) }));
  if (out.scenarios.some(s => s.verdict !== 'PASS') || out.regressions.some(r => r.verdict !== 'PASS')) process.exitCode = 1;
}
main().catch(e => { console.error(e.message); process.exitCode = 1; });
