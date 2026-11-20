// Real Express/JWT/Prisma/PostgreSQL stocktake acceptance (opt-in).
// All new business data have a unique kk-run prefix; no DB reset/seed/mocking.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { randomUUID } = require('node:crypto');
require('dotenv').config({ path: 'apps/api/.env', quiet: true });
require('dotenv').config({ quiet: true });
const { PrismaClient } = require('@prisma/client');
const jwt = require('jsonwebtoken');
const httpClient = require('node:http');
const root = 'D:/KLTN/cafe-project-artifacts/reports/stocktake';
fs.mkdirSync(root, { recursive: true });
const run = 'kk-' + randomUUID();
const output = { run, startedAt: new Date().toISOString(), scenarios: [], requests: [], database: null,
  notes: ['Real HTTP server :5002 and PostgreSQL cafedb:55432.', 'Owned fixtures only, no destructive writes.'] };
const json = value => JSON.stringify(value, (_key, v) => typeof v === 'bigint' ? v.toString() : v);
const selected = process.env.STOCKTAKE_CASES?.split(',');
async function main() {
  assert.equal(process.env.STOCKTAKE_CAFEDB_CONFIRMED, 'YES');
  const url = new URL(process.env.DATABASE_URL);
  assert.equal(url.pathname, '/cafedb');
  url.hostname = '127.0.0.1'; url.port = '55432';
  const db = new PrismaClient({ datasources: { db: { url: url.toString() } } });
  let admin, staff, adminActor, staffActor, category, seq = 0;
  const endpoint = 'http://127.0.0.1:5002/api';
  const saveEvidence = () => fs.writeFileSync(root + '/STOCKTAKE-HTTP-DB-EVIDENCE.json', json(output, null, 2));
  async function http(method, route, body, token = admin) {
    const start = new Date().toISOString();
    const response = await fetch(endpoint + route, {
      method, signal: AbortSignal.timeout(30000),
      headers: { 'content-type': 'application/json', ...(token ? { authorization: 'Bearer ' + token } : {}) },
      body: body === undefined ? undefined : JSON.stringify(body)
    });
    const raw = await response.text();
    let payload; try { payload = JSON.parse(raw); } catch { payload = { raw }; }
    const row = { id: 'KK-H' + (++seq), method, route, role: token === staff ? 'STAFF' : token === admin ? 'ADMIN' : 'OTHER',
      request: body, start, finish: new Date().toISOString(), status: response.status, response: payload };
    output.requests.push(row); return row;
  }
  const ok = (r, status = 200) => {
    assert.equal(r.status, status, r.id + ': ' + json(r.response).slice(0, 350));
    return r.response.data;
  };
  const verify = async (id, expected, fn) => {
    if (selected && !selected.includes(id)) return;
    const begin = output.requests.length;
    try {
      const actual = await fn();
      output.scenarios.push({ id, verdict: 'PASS', expected, actual,
        evidence: output.requests.slice(begin).map(r => r.id) });
    } catch (error) {
      output.scenarios.push({ id, verdict: 'FAIL', expected, error: error.stack ?? error.message,
        evidence: output.requests.slice(begin).map(r => r.id) });
    }
    const last = output.scenarios.at(-1);
    console.log(last.id + ' ' + last.verdict + (last.error ? ' ' + last.error.slice(0, 220) : ''));
    saveEvidence();
  };
  const create = async (suffix, opts = {}) =>
    ok(await http('POST', '/ingredients', { sku: run + suffix, name: run + suffix, baseUnit: 'g',
      costPerBaseUnit: 2, expiryClassification: 'NON_PERISHABLE', ...opts }), 201);
  const receipt = async (i, n, suffix, expiry = '2099-01-01') =>
    ok(await http('POST', `/ingredients/${i.id}/import`, {
      requestId: randomUUID(), quantity: n, unit: 'g', unitCost: 2,
      batchCode: run + suffix + randomUUID().slice(0, 5), expirationDate: expiry
    }));
  const state = async i => ({
    ingredient: await db.ingredient.findUniqueOrThrow({ where: { id: i.id } }),
    batches: await db.ingredientBatch.findMany({ where: { ingredientId: i.id }, orderBy: { id: 'asc' } }),
    ledger: await db.inventoryTransaction.findMany({ where: { ingredientId: i.id }, orderBy: { id: 'asc' } })
  });
  const stock = async (i, physical, reserved) => {
    const s = await state(i);
    if (physical !== undefined) assert.equal(Number(s.ingredient.quantity), physical);
    if (reserved !== undefined) assert.equal(Number(s.ingredient.reserved), reserved);
    assert.equal(s.batches.reduce((n, b) => n + Number(b.quantityRemaining), 0), Number(s.ingredient.quantity));
    return s;
  };
  const open = async (ingredients, assignedCounterId = staffActor.id, token = staff, extra = {}) =>
    ok(await http('POST', '/stocktakes', { requestId: randomUUID(),
      ingredientIds: ingredients.map(i => i.id), assignedCounterId, note: run, ...extra }, token), 201);
  const view = async (s, token = staff) => ok(await http('GET', '/stocktakes/' + s.session.id, undefined, token));
  const entryBody = (s, ingredientId, batchId, actualQty, reasonCategory = 'COUNTED',
    extra = {}) => {
    const current = s.current.find(x => x.ingredientId === ingredientId);
    const e = s.entries.find(x => x.batchId === batchId);
    return {
      requestId: randomUUID(), batchId, expectedCursor: current.cursor,
      expectedRevision: e?.revision ?? 0, actualQty,
      reason: run + ' verified physical count', reasonCategory, ...extra
    };
  };
  const count = async (s, ingredientId, batchId, actualQty, reasonCategory = 'COUNTED', token = staff) =>
    ok(await http('POST', '/stocktakes/' + s.session.id + '/entries',
      entryBody(await view(s, token), ingredientId, batchId, actualQty, reasonCategory), token));
  const submit = (s, requestId = randomUUID(), token = staff) =>
    http('POST', '/stocktakes/' + s.session.id + '/submit', { requestId }, token);
  const approve = (s, requestId = randomUUID(), token = admin) =>
    http('POST', '/stocktakes/' + s.session.id + '/approve', { requestId }, token);
  const reject = (s, reason = run + ' rejected after review', requestId = randomUUID(), token = admin) =>
    http('POST', '/stocktakes/' + s.session.id + '/reject', { requestId, reason }, token);
  const product = async (i, suffix, grams = 2) => {
    const p = ok(await http('POST', '/products', { sku: run + suffix, name: run + suffix,
      price: 10000, categoryId: category.id, isActive: false, requiresRecipe: true }), 201).product;
    ok(await http('POST', `/products/${p.id}/recipes`, {
      ingredients: [{ ingredientId: i.id, quantity: grams, unit: 'g' }]
    }), 201);
    const old = ok(await http('GET', '/products/' + p.id)).product;
    ok(await http('PUT', '/products/' + p.id, { expectedUpdatedAt: old.updatedAt, isActive: true }));
    return p;
  };
  const order = async (p, n = 1) => ok(await http('POST', '/orders', {
    requestId: randomUUID(), items: [{ productId: p.id, quantity: n }], paymentMethod: 'CASH'
  }), 201).order;
  const status = async (o, next) => ok(await http('PATCH', '/orders/' + o.id + '/status', { status: next }));
  const waste = async (i, n, token = staff) => ok(await http('POST', `/ingredients/${i.id}/waste`, {
    quantity: n, unit: 'g', wasteReason: 'DAMAGED', note: run + ' confirmed damaged'
  }, token));
  async function lockOverlap(ingredientId, operations) {
    let release, ready;
    const gate = new Promise(resolve => release = resolve);
    const hasLock = new Promise(resolve => ready = resolve);
    const holder = db.$transaction(async tx => {
      await tx.$queryRaw`SELECT id FROM "Ingredient" WHERE id = ${ingredientId} FOR UPDATE`;
      ready(); await gate;
    }, { timeout: 20000 });
    await hasLock;
    const calls = operations.map(fn => fn());
    let waiting = 0;
    try {
      for (let n = 0; n < 90; n++) {
        const rows = await db.$queryRaw`SELECT pid FROM pg_stat_activity
            WHERE datname = current_database() AND wait_event_type = 'Lock'
            AND query LIKE '%Ingredient%FOR UPDATE%'`;
        waiting = rows.length; if (waiting >= 2) break;
        await new Promise(resolve => setTimeout(resolve, 40));
      }
    } finally { release(); await holder; }
    const results = await Promise.all(calls);
    assert.ok(waiting >= 2, 'No observed PostgreSQL overlap (2 lock waiters required).');
    return { waiting, results };
  }
  async function disconnectDuringWrite(ingredientId, route, body, token) {
    let release, ready;
    const gate = new Promise(resolve => release = resolve);
    const hasLock = new Promise(resolve => ready = resolve);
    const holder = db.$transaction(async tx => {
      await tx.$queryRaw`SELECT id FROM "Ingredient" WHERE id = ${ingredientId} FOR UPDATE`;
      ready(); await gate;
    }, { timeout: 20000 });
    await hasLock;
    const request = httpClient.request(endpoint + route, { method: 'POST',
      headers: { 'content-type': 'application/json', authorization: 'Bearer ' + token } });
    request.on('error', () => {}); request.end(JSON.stringify(body));
    let waiting = 0;
    try {
      for (let n = 0; n < 100; n++) {
        const [row] = await db.$queryRaw`SELECT count(*)::int AS count FROM pg_stat_activity
          WHERE datname=current_database() AND wait_event_type='Lock'
          AND query LIKE '%Ingredient%FOR UPDATE%'`;
        waiting = row.count; if (waiting >= 1) break;
        await new Promise(resolve => setTimeout(resolve, 40));
      }
      assert.ok(waiting >= 1, 'HTTP request did not reach a locked database transaction.');
      request.destroy(); // client is now disconnected while server has not committed.
      output.requests.push({ id: 'KK-H' + (++seq), method: 'POST', route,
        request: body, status: null, transport: 'CLIENT_SOCKET_ABORTED',
        waiting, response: null, role: 'STAFF' });
    } finally {
      request.destroy(); release(); await holder;
    }
    return { waiting, disconnectedBeforeCommit: true };
  }

  try {
    const [dbrow] = await db.$queryRaw`SELECT current_database() db,
      (SELECT count(*)::int FROM pg_trigger WHERE tgname='InventoryTransaction_stocktake_cursor') AS trigger_count`;
    assert.equal(dbrow.db, 'cafedb'); assert.equal(dbrow.trigger_count, 1);
    output.database = dbrow;
    adminActor = await db.user.findFirstOrThrow({ where: { role: 'ADMIN', isActive: true },
      select: { id: true, email: true, role: true } });
    staffActor = await db.user.findFirstOrThrow({ where: { role: 'STAFF', isActive: true },
      select: { id: true, email: true, role: true } });
    const secondAdminActor = await db.user.findFirst({ where: { role: 'ADMIN', isActive: true, id: { not: adminActor.id } },
      select: { id: true, email: true, role: true } });
    admin = jwt.sign(adminActor, process.env.JWT_SECRET, { expiresIn: '1h' });
    staff = jwt.sign(staffActor, process.env.JWT_SECRET, { expiresIn: '1h' });
    const secondAdmin = secondAdminActor ? jwt.sign(secondAdminActor, process.env.JWT_SECRET, { expiresIn: '1h' }) : admin;
    category = await db.category.findFirstOrThrow({ select: { id: true } });

    await verify('KK-01', 'Create persisted scoped session with assigned counter and consistent per-lot opening', async () => {
      const i = await create('session'); await receipt(i, 10, '-start');
      const s = await open([i]); assert.equal(s.session.status, 'DRAFT');
      assert.deepEqual(s.session.scope, [i.id]); assert.equal(s.session.assignedCounterId, staffActor.id);
      assert.equal(s.entries.length, 1); assert.equal(s.entries[0].openingQty, '10');
      assert.equal(s.entries[0].observedQty, null);
      assert.equal(s.entries[0].openingCursor, String((await state(i)).ingredient.movementCursor));
      assert.equal((await db.stockCount.findUniqueOrThrow({ where: { id: s.session.id } })).kind, 'STOCKTAKE');
      assert.equal((await http('POST', '/stocktakes', { requestId: randomUUID(), ingredientIds: [i.id],
        assignedCounterId: staffActor.id }, staff)).status, 409);
      return { sessionId: s.session.id, scope: s.session.scope, openingQty: 10 };
    });

    await verify('KK-02', 'Matching counts complete without adjustment ledger', async () => {
      const i = await create('equal'); await receipt(i, 8, '-eq');
      const s = await open([i]); await count(s, i.id, s.entries[0].batchId, 8);
      ok(await submit(s)); const before = await stock(i, 8);
      ok(await approve(s)); assert.equal((await view(s)).session.status, 'COMPLETED');
      assert.deepEqual(await state(i), before);
      assert.equal((await db.inventoryTransaction.count({ where: { ingredientId: i.id, type: 'ADJUSTMENT' } })), 0);
      return { sessionId: s.session.id, adjustmentLedgerCount: 0, quantity: 8 };
    });

    await verify('KK-03', 'Positive variance pending until ADMIN approval', async () => {
      const i = await create('increase'); await receipt(i, 6, '-plus');
      const s = await open([i]); await count(s, i.id, s.entries[0].batchId, 9);
      const pending = ok(await submit(s)); assert.equal(pending.session.status, 'PENDING_APPROVAL');
      assert.equal(pending.entries[0].varianceQty, '3'); await stock(i, 6);
      const done = ok(await approve(s)); assert.equal(done.session.status, 'COMPLETED');
      const after = await stock(i, 9);
      assert.equal(after.ledger.filter(t => t.referenceType === 'Stocktake').length, 1);
      return { sessionId: s.session.id, before: 6, after: 9 };
    });

    await verify('KK-04', 'Negative discrepancy has reason and waits for authorized approval', async () => {
      const i = await create('decrease'); await receipt(i, 9, '-minus');
      const s = await open([i]); await count(s, i.id, s.entries[0].batchId, 7, 'DAMAGED');
      const pending = ok(await submit(s)); assert.equal(pending.entries[0].varianceQty, '-2');
      await stock(i, 9); ok(await approve(s)); const after = await stock(i, 7);
      assert.equal(Number(after.ledger.find(t => t.referenceType === 'Stocktake').quantity), -2);
      return { sessionId: s.session.id, before: 9, after: 7, actor: adminActor.id };
    });

    await verify('KK-05', 'Draft accepts partial counts; uncounted is never silently treated as zero', async () => {
      const i = await create('partial'); const a = await receipt(i, 2, '-partial-a');
      const b = await receipt(i, 3, '-partial-b'); const s = await open([i]);
      await count(s, i.id, a.batch.id, 2);
      const partial = await view(s); assert.equal(partial.counted, 1); assert.equal(partial.uncounted, 1);
      assert.equal((await submit(s)).status, 409);
      assert.equal((await view(s)).session.status, 'DRAFT');
      await count(s, i.id, b.batch.id, 0);
      assert.equal(ok(await submit(s)).session.status, 'PENDING_APPROVAL');
      return { sessionId: s.session.id, firstCount: 2, secondCount: 0, otherNeverAssumedZero: true };
    });

    await verify('KK-06', 'Negative quantity rejected with Vietnamese 400 and zero explicit count accepted', async () => {
      const i = await create('negative'); await receipt(i, 4, '-negative');
      const s = await open([i]), original = json(await view(s));
      const body = entryBody(s, i.id, s.entries[0].batchId, -1);
      const bad = await http('POST', '/stocktakes/' + s.session.id + '/entries', body);
      assert.equal(bad.status, 400); assert.match(bad.response.message, /không được âm/);
      assert.equal(json(await view(s)), original);
      await count(s, i.id, s.entries[0].batchId, 0, 'DAMAGED');
      assert.equal((await view(s)).entries[0].observedQty, '0');
      return { sessionId: s.session.id, rejected: 400, storedZero: true };
    });

    await verify('KK-07', 'Concurrent writes serialize using revision and explicit assignment', async () => {
      const i = await create('racing'); await receipt(i, 10, '-race');
      const s = await open([i]); const original = await view(s);
      const bodies = [entryBody(original, i.id, s.entries[0].batchId, 8),
        entryBody(original, i.id, s.entries[0].batchId, 9)];
      const route = '/stocktakes/' + s.session.id + '/entries';
      assert.equal((await http('POST', route, bodies[0], admin)).status, 403);
      const overlap = await lockOverlap(i.id, [
        () => http('POST', route, bodies[0], staff), () => http('POST', route, bodies[1], staff)
      ]);
      assert.deepEqual(overlap.results.map(x => x.status).sort(), [200, 409]);
      const after = await view(s); assert.equal(after.entries[0].revision, 1);
      assert.equal(after.entries[0].history.length, 1); assert.equal(after.entries[0].history[0].actorId, staffActor.id);
      return { sessionId: s.session.id, lockWaiters: overlap.waiting, statuses: overlap.results.map(x => x.status) };
    });

    await verify('KK-08', 'Sale PREPARING during count reconciles COMMITTED movement and does not cause false shortage', async () => {
      const i = await create('sale'); await receipt(i, 20, '-sale');
      const p = await product(i, '-sale-product'); const s = await open([i]); const start = await view(s);
      const o = await order(p); await status(o, 'CONFIRMED');
      const initialCount = entryBody(start, i.id, s.entries[0].batchId, 20);
      const overlap = await lockOverlap(i.id, [
        () => http('PATCH', '/orders/' + o.id + '/status', { status: 'PREPARING' }),
        () => http('POST', '/stocktakes/' + s.session.id + '/entries', initialCount, staff)
      ]);
      ok(overlap.results[0]); assert.ok([200, 409].includes(overlap.results[1].status));
      await stock(i, 18, 0);
      const countDone = overlap.results[1].status === 409 ?
        await count(s, i.id, s.entries[0].batchId, 18) : await view(s);
      assert.equal(countDone.entries[0].varianceQty, '0');
      ok(await submit(s)); ok(await approve(s)); const after = await stock(i, 18, 0);
      assert.equal(after.ledger.filter(x => x.type === 'CONSUME').length, 1);
      return { sessionId: s.session.id, orderId: o.id, before: 20, after: 18,
        concurrentStatuses: overlap.results.map(x => x.status), lockWaiters: overlap.waiting,
        falseShortage: false };
    });

    await verify('KK-09', 'Receipt during open count is assigned to newly created lot, not false surplus', async () => {
      const i = await create('arrival'); const original = await receipt(i, 10, '-arrival-old');
      const s = await open([i]); const start = await view(s);
      const incoming = { requestId: randomUUID(), quantity: 4, unit: 'g', unitCost: 2,
        batchCode: run + '-arrival-new', expirationDate: '2099-01-01' };
      const initialCount = entryBody(start, i.id, original.batch.id, 10);
      const overlap = await lockOverlap(i.id, [
        () => http('POST', `/ingredients/${i.id}/import`, incoming),
        () => http('POST', '/stocktakes/' + s.session.id + '/entries', initialCount, staff)
      ]);
      const added = ok(overlap.results[0]);
      assert.ok([200, 409].includes(overlap.results[1].status));
      const fresh = await view(s); assert.equal(fresh.untrackedBatches.length, 1);
      assert.equal(fresh.untrackedBatches[0].batchId, added.batch.id);
      if (overlap.results[1].status === 409) await count(s, i.id, original.batch.id, 10);
      await count(s, i.id, added.batch.id, 4);
      const stored = await view(s);
      assert.equal(stored.entries.length, 2);
      assert.equal(stored.entries.find(e => e.batchId === added.batch.id).openingQty, '0');
      assert.ok(stored.entries.every(e => e.varianceQty === '0'));
      ok(await submit(s)); ok(await approve(s)); await stock(i, 14);
      return { sessionId: s.session.id, newLotId: added.batch.id, movementCursor: stored.current[0].cursor,
        lockWaiters: overlap.waiting, concurrentStatuses: overlap.results.map(x => x.status) };
    });

    await verify('KK-10', 'Pending approval does not alter official stock, batch or ledger', async () => {
      const i = await create('pending'); await receipt(i, 10, '-pending');
      const s = await open([i]); await count(s, i.id, s.entries[0].batchId, 12);
      const before = json(await state(i));
      const done = ok(await submit(s)); assert.equal(done.session.status, 'PENDING_APPROVAL');
      assert.equal(json(await state(i)), before);
      return { sessionId: s.session.id, before: 10, after: 10, pendingOnly: true };
    });

    await verify('KK-11', 'ADMIN approves exactly once, with actor, lot and immutable adjustment audit', async () => {
      const i = await create('approved'); await receipt(i, 10, '-approved');
      const s = await open([i]); await count(s, i.id, s.entries[0].batchId, 12);
      ok(await submit(s)); const key = randomUUID();
      const first = ok(await approve(s, key)); assert.equal(first.session.approvedById, adminActor.id);
      assert.ok(first.session.approvedAt); const after = await stock(i, 12);
      assert.equal(after.ledger.filter(x => x.referenceType === 'Stocktake').length, 1);
      assert.equal(ok(await approve(s, key)).replayed, true);
      assert.equal(json(await state(i)), json(after));
      const other = await create('self-approval'); await receipt(other, 4, '-self-approval');
      const self = await open([other], adminActor.id);
      await count(self, other.id, self.entries[0].batchId, 5, 'COUNTED', admin);
      ok(await submit(self, randomUUID(), admin));
      assert.equal((await approve(self)).status, 403);
      await stock(other, 4);
      return { sessionId: s.session.id, requestId: key, adjustment: 2, noDuplicate: true,
        selfApprovalDenied: 403 };
    });

    await verify('KK-12', 'ADMIN rejection is durable and distinct from cancellation, with reason and no writes', async () => {
      const i = await create('rejected'); await receipt(i, 10, '-rejected');
      const s = await open([i]); await count(s, i.id, s.entries[0].batchId, 8, 'DAMAGED');
      ok(await submit(s)); const before = json(await state(i));
      assert.equal((await reject(s, '', randomUUID())).status, 400);
      const denied = await reject(s, run + ' insufficient evidence', randomUUID(), staff);
      assert.equal(denied.status, 403);
      const decision = ok(await reject(s, run + ' insufficient evidence'));
      assert.equal(decision.session.status, 'REJECTED');
      assert.ok(decision.session.rejectedById === adminActor.id);
      assert.equal((await approve(s)).status, 409);
      assert.equal(json(await state(i)), before);
      return { sessionId: s.session.id, status: 'REJECTED', noAdjustment: true };
    });

    await verify('KK-13', 'Committed post-count receipt is reconciled before approval; no stale absolute overwrite', async () => {
      const i = await create('rebase'); await receipt(i, 10, '-rebase-initial');
      const s = await open([i]); await count(s, i.id, s.entries[0].batchId, 12);
      ok(await submit(s)); await stock(i, 10);
      const extra = await receipt(i, 3, '-rebase-extra');
      // A new lot in the scoped ingredient is uncounted; approval must refuse until reconciled.
      const decision = ok(await approve(s));
      assert.equal(decision.blockedForInvestigation, true);
      assert.equal(decision.session.status, 'NEEDS_INVESTIGATION'); await stock(i, 13);
      assert.equal((await db.inventoryTransaction.count({ where: { ingredientId: i.id, referenceType: 'Stocktake' } })), 0);
      assert.equal(extra.batch.importedQuantityBase, 3);
      const j = await create('rebase-concurrent'); await receipt(j, 10, '-rebase-concurrent-old');
      const t = await open([j]); await count(t, j.id, t.entries[0].batchId, 12);
      ok(await submit(t));
      const race = await lockOverlap(j.id, [
        () => http('POST', '/stocktakes/' + t.session.id + '/approve', { requestId: randomUUID() }),
        () => http('POST', '/ingredients/' + j.id + '/import', {
          requestId: randomUUID(), quantity: 3, unit: 'g', unitCost: 2,
          batchCode: run + '-rebase-concurrent-new', expirationDate: '2099-01-01'
        })
      ]);
      race.results.forEach(x => ok(x));
      const finalState = await view(t);
      const approved = finalState.session.status === 'COMPLETED';
      assert.ok(approved || finalState.session.status === 'NEEDS_INVESTIGATION');
      await stock(j, approved ? 15 : 13);
      assert.equal((await db.inventoryTransaction.count({ where: { ingredientId: j.id,
        referenceType: 'Stocktake' } })), approved ? 1 : 0);
      return { sessionId: s.session.id, currentStock: 13, status: 'NEEDS_INVESTIGATION',
        concurrencySessionId: t.session.id, concurrentApproval: finalState.session.status,
        waiters: race.waiting, noStaleOverwrite: true };
    });

    await verify('KK-14', 'Duplicate submissions reuse one persistent request; changed payload conflicts', async () => {
      const i = await create('retry'); await receipt(i, 10, '-retry');
      const s = await open([i]); const initial = await view(s);
      const request = entryBody(initial, i.id, s.entries[0].batchId, 10);
      const path = '/stocktakes/' + s.session.id + '/entries';
      const race = await lockOverlap(i.id, [() => http('POST', path, request, staff),
        () => http('POST', path, request, staff)]);
      race.results.forEach(x => ok(x)); assert.equal(race.results.filter(x => x.response.data.replayed).length, 1);
      assert.equal((await http('POST', path, { ...request, actualQty: 9 }, staff)).status, 409);
      assert.equal((await view(s)).entries[0].history.length, 1);
      const key = randomUUID();
      const submissions = await lockOverlap(i.id, [
        () => submit(s, key), () => submit(s, key)
      ]);
      submissions.results.forEach(x => ok(x));
      assert.equal(submissions.results.filter(x => x.response.data.replayed).length, 1);
      assert.equal((await view(s)).session.status, 'PENDING_APPROVAL');
      return { sessionId: s.session.id, duplicateCount: 1,
        overlapWaiters: race.waiting, submitWaiters: submissions.waiting, conflict: 409 };
    });

    await verify('KK-15', 'Concurrent authorized ADMIN approve/reject allows one terminal decision only', async () => {
      const i = await create('decision'); await receipt(i, 10, '-decision');
      const s = await open([i]); await count(s, i.id, s.entries[0].batchId, 12);
      ok(await submit(s)); const route = '/stocktakes/' + s.session.id;
      const race = await lockOverlap(i.id, [
        () => http('POST', route + '/approve', { requestId: randomUUID() }, admin),
        () => http('POST', route + '/reject', { requestId: randomUUID(), reason: run + ' disputed' }, secondAdmin)
      ]);
      assert.deepEqual(race.results.map(x => x.status).sort(), [200, 409]);
      const session = await view(s); const after = await stock(i);
      assert.ok(['COMPLETED', 'REJECTED'].includes(session.session.status));
      assert.equal(after.ledger.filter(t => t.referenceType === 'Stocktake').length,
        session.session.status === 'COMPLETED' ? 1 : 0);
      assert.equal(Number(after.ingredient.quantity), session.session.status === 'COMPLETED' ? 12 : 10);
      return { sessionId: s.session.id, statuses: race.results.map(x => x.status), waiters: race.waiting,
        final: session.session.status };
    });

    await verify('KK-16', 'Expired lot recorded physically, unusable, optional quality action does not deduct or double transition', async () => {
      const i = await create('expiry');
      const imported = await receipt(i, 10, '-expired', new Date(Date.now() - 60000).toISOString());
      const s = await open([i]); await count(s, i.id, imported.batch.id, 10, 'EXPIRED');
      const before = await stock(i, 10);
      assert.equal(ok(await http('GET', '/ingredients/' + i.id)).availableQuantity, 0);
      const transition = { requestId: randomUUID(), reason: run + ' expired evidence' };
      ok(await http('POST', `/ingredients/${i.id}/batches/${imported.batch.id}/quarantine`, transition));
      assert.equal(ok(await http('POST', `/ingredients/${i.id}/batches/${imported.batch.id}/quarantine`, transition)).replayed, true);
      await stock(i, 10);
      const res = ok(await submit(s)); assert.equal(res.session.status, 'PENDING_APPROVAL');
      assert.equal((await db.inventoryTransaction.count({ where: { ingredientId: i.id, type: 'WASTE' } })), 0);
      return { sessionId: s.session.id, expired: true, physical: 10, quarantineOnly: true,
        originalLedgerCount: before.ledger.length };
    });

    await verify('KK-17', 'Recover persisted draft after lost client response; replay never overwrites newer count', async () => {
      const i = await create('recover'); await receipt(i, 10, '-recover');
      const s = await open([i]);
      const initial = await view(s), body = entryBody(initial, i.id, s.entries[0].batchId, 10);
      const path = '/stocktakes/' + s.session.id + '/entries';
      const transport = await disconnectDuringWrite(i.id, path, body, staff);
      let recovered;
      for (let attempt = 0; attempt < 30; attempt++) {
        recovered = await view(s);
        if (recovered.entries[0].revision === 1) break;
        await new Promise(resolve => setTimeout(resolve, 100));
      }
      assert.equal(recovered.entries[0].observedQty, '10');
      assert.equal(recovered.entries[0].revision, 1);
      const updated = entryBody(recovered, i.id, s.entries[0].batchId, 9, 'DAMAGED');
      ok(await http('POST', path, updated, staff));
      assert.equal(ok(await http('POST', path, body, staff)).replayed, true);
      assert.equal((await view(s)).entries[0].observedQty, '9');
      assert.equal((await view(s)).entries[0].history.length, 2);
      return { sessionId: s.session.id, persistedVersion: 2,
        waiting: transport.waiting, clientSocketAbortedBeforeCommit: true,
        recovery: 'POST reached DB lock, TCP socket destroyed, server committed, GET recovered, replay did not overwrite newer revision' };
    });

    await verify('KK-18', 'Waste movement between opening and observation does not double deduct; ambiguous case investigated', async () => {
      const i = await create('waste'); await receipt(i, 10, '-waste');
      const s = await open([i]); await waste(i, 2); await stock(i, 8);
      await count(s, i.id, s.entries[0].batchId, 8);
      const done = ok(await submit(s)); assert.equal(done.entries[0].varianceQty, '0');
      ok(await approve(s)); await stock(i, 8);
      assert.equal((await db.inventoryTransaction.count({ where: { ingredientId: i.id, type: 'ADJUSTMENT' } })), 0);
      const j = await create('waste-conflict'); await receipt(j, 10, '-waste-conflict');
      const pending = await open([j]); await count(pending, j.id, pending.entries[0].batchId, 8, 'DAMAGED');
      await waste(j, 2); const reviewed = ok(await submit(pending));
      assert.equal(reviewed.session.status, 'NEEDS_INVESTIGATION');
      await stock(j, 8);
      return { sessionId: s.session.id, investigatedId: pending.session.id,
        countedWasteOnce: true, ambiguousAdjustmentBlocked: true };
    });

    await verify('KK-19', 'Wrong-lot correction transfers balance between eligible lots, aggregate unchanged', async () => {
      const i = await create('lot-transfer'); const a = await receipt(i, 5, '-transfer-a'),
        b = await receipt(i, 5, '-transfer-b');
      const s = await open([i]);
      await count(s, i.id, a.batch.id, 3, 'WRONG_LOT');
      await count(s, i.id, b.batch.id, 7, 'WRONG_LOT');
      ok(await submit(s)); const before = await stock(i, 10);
      ok(await approve(s)); const after = await stock(i, 10);
      assert.equal(Number(after.batches.find(x => x.id === a.batch.id).quantityRemaining), 3);
      assert.equal(Number(after.batches.find(x => x.id === b.batch.id).quantityRemaining), 7);
      const transfer = after.ledger.filter(x => x.referenceType === 'StocktakeTransfer');
      assert.equal(transfer.length, 2);
      assert.equal(transfer.reduce((sum, x) => sum + Number(x.quantity), 0), 0);
      assert.equal(after.ledger.filter(x => x.type === 'IMPORT').length, before.ledger.filter(x => x.type === 'IMPORT').length);
      return { sessionId: s.session.id, source: a.batch.id, target: b.batch.id, transferRows: 2, aggregate: 10 };
    });

    await verify('KK-20', 'Unexplained discrepancy has durable investigation, no auto-adjust; authorized reopen retains history', async () => {
      const i = await create('unknown'); await receipt(i, 10, '-unknown');
      const s = await open([i]);
      await count(s, i.id, s.entries[0].batchId, 7, 'UNEXPLAINED');
      const before = json(await state(i)); const submitted = ok(await submit(s));
      assert.equal(submitted.session.status, 'NEEDS_INVESTIGATION');
      assert.equal((await approve(s)).status, 409);
      assert.equal(json(await state(i)), before);
      const openAgain = ok(await http('POST', '/stocktakes/' + s.session.id + '/reopen', {
        requestId: randomUUID(), reason: run + ' recount ordered'
      }));
      assert.equal(openAgain.session.status, 'DRAFT');
      assert.equal(openAgain.entries[0].observedQty, null);
      assert.equal(openAgain.entries[0].history[0].newQty, '7');
      await stock(i, 10);
      return { sessionId: s.session.id, investigated: true, oldEvidencePreserved: true };
    });

  } catch (error) {
    output.blocker = error.stack ?? error.message;
    process.exitCode = 2; console.error('PRECONDITION FAILED', error.message);
  } finally {
    output.finishedAt = new Date().toISOString(); saveEvidence(); await db.$disconnect();
  }
  if (output.scenarios.some(s => s.verdict !== 'PASS')) process.exitCode = 1;
}
main().catch(e => { console.error(e.stack); process.exitCode = 2; });
