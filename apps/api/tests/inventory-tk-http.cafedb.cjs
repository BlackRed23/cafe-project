// Opt-in real HTTP + PostgreSQL acceptance. Uses only uniquely owned TK fixtures.
// Run with INVENTORY_CAFEDB_CONFIRMED=YES against ingredient-acceptance-server.cjs.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
require('dotenv').config({ path: 'apps/api/.env', quiet: true });
require('dotenv').config({ quiet: true });
const { PrismaClient } = require('@prisma/client');
const jwt = require('jsonwebtoken');

async function main() {
  assert.equal(process.env.INVENTORY_CAFEDB_CONFIRMED, 'YES', 'Explicit acceptance gate required.');
  const uri = new URL(process.env.DATABASE_URL);
  assert.equal(uri.pathname, '/cafedb');
  uri.hostname = '127.0.0.1'; uri.port = '55432';
  const db = new PrismaClient({ datasources: { db: { url: uri.toString() } } });
  const prefix = 'tk-' + randomUUID();
  const folder = 'D:/KLTN/cafe-project-artifacts/reports/inventory';
  fs.mkdirSync(folder, { recursive: true });
  const out = { run: prefix, time: new Date().toISOString(), scenarios: [], requests: [],
    notes: ['Only uniquely owned fixtures were changed. Existing business inventory was not modified.'] };
  let seq = 0, admin, staff;
  async function api(method, route, body, token = admin) {
    const started = new Date().toISOString();
    const response = await fetch('http://127.0.0.1:5002/api' + route, {
      method, signal: AbortSignal.timeout(30000),
      headers: { 'content-type': 'application/json', authorization: 'Bearer ' + token },
      body: body === undefined ? undefined : JSON.stringify(body)
    });
    const payload = await response.json();
    const item = { id: 'TK-H' + (++seq), started, finished: new Date().toISOString(),
      method, route, body, role: token === staff ? 'STAFF' : 'ADMIN', status: response.status, payload };
    out.requests.push(item); return item;
  }
  const ok = (item, status = 200) => {
    assert.equal(item.status, status, item.id + ': ' + JSON.stringify(item.payload));
    return item.payload.data;
  };
  const scenario = async (id, expected, callback) => {
    const selected = process.env.INVENTORY_CASES?.split(',');
    if (selected && !selected.includes(id)) return;
    const begin = out.requests.length;
    try {
      const actual = await callback();
      out.scenarios.push({ id, expected, actual, verdict: 'PASS', evidence: out.requests.slice(begin).map(x => x.id) });
    } catch (error) {
      out.scenarios.push({ id, expected, error: error.message, verdict: 'FAIL', evidence: out.requests.slice(begin).map(x => x.id) });
    }
    console.log(id + ' ' + out.scenarios.at(-1).verdict + (out.scenarios.at(-1).error ? ' ' + out.scenarios.at(-1).error.slice(0, 200) : ''));
    fs.writeFileSync(path.join(folder, 'INVENTORY-HTTP-DB-EVIDENCE.json'), JSON.stringify(out, null, 2));
  };
  const create = async suffix => ok(await api('POST', '/ingredients', {
    sku: prefix + suffix, name: prefix + suffix, baseUnit: 'g',
    costPerBaseUnit: 2, expiryClassification: 'NON_PERISHABLE'
  }), 201);
  const receipt = (i, quantity, suffix = 'A', requestId = randomUUID()) =>
    api('POST', '/ingredients/' + i.id + '/import', {
      requestId, quantity, unit: 'g', unitCost: 2,
      batchCode: prefix + suffix, expirationDate: '2099-01-01T00:00:00Z'
    });
  const internal = (i, quantity, requestId = randomUUID(), token = admin, purpose = prefix) =>
    api('POST', '/ingredients/' + i.id + '/internal-use', {
      requestId, quantity, unit: 'g', purpose, recipient: 'TK acceptance fixture'
    }, token);
  const stock = async i => ({
    ingredient: await db.ingredient.findUniqueOrThrow({ where: { id: i.id } }),
    batches: await db.ingredientBatch.findMany({ where: { ingredientId: i.id }, orderBy: { id: 'asc' } }),
    ledger: await db.inventoryTransaction.findMany({ where: { ingredientId: i.id }, orderBy: { id: 'asc' } })
  });
  const sum = s => s.batches.reduce((n, b) => n + Number(b.quantityRemaining), 0);
  const balanced = s => assert.equal(Number(s.ingredient.quantity), sum(s));
  const makeAdjustment = (i, batchId, measuredQuantity, requestId = randomUUID(), token = staff) =>
    api('POST', '/ingredients/' + i.id + '/adjustments', {
      requestId, batchId, measuredQuantity, reason: prefix + ' physical count'
    }, token);

  // Hold an actual PostgreSQL row lock until both HTTP requests are observed
  // waiting in pg_stat_activity. Promise.all alone is not concurrency evidence.
  const overlap = async (i, operations) => {
    let release, acknowledge;
    const gate = new Promise(resolve => { release = resolve; });
    const ready = new Promise(resolve => { acknowledge = resolve; });
    const holder = db.$transaction(async tx => {
      await tx.$queryRaw`SELECT "id" FROM "Ingredient" WHERE "id" = ${i.id} FOR UPDATE`;
      acknowledge(); await gate;
    }, { timeout: 20000 });
    await ready;
    const requests = operations.map(fn => fn());
    let waiters = [];
    try {
      for (let n = 0; n < 40; n++) {
        waiters = await db.$queryRaw`SELECT pid, wait_event FROM pg_stat_activity
          WHERE datname = current_database() AND wait_event_type = 'Lock'
          AND query LIKE '%Ingredient%FOR UPDATE%'`;
        if (waiters.length >= 2) break;
        await new Promise(resolve => setTimeout(resolve, 25));
      }
    } finally {
      release(); await holder;
    }
    const results = await Promise.all(requests);
    assert.ok(waiters.length >= 2, 'Expected two concurrent HTTP database lock waiters.');
    return { results, lockWaiters: waiters.length, waitEvents: waiters.map(w => w.wait_event) };
  };

  try {
    const database = await db.$queryRaw`SELECT current_database() AS database, current_user AS username`;
    assert.equal(database[0].database, 'cafedb'); out.database = database;
    const adminActor = await db.user.findFirstOrThrow({
      where: { role: 'ADMIN', isActive: true }, select: { id: true, email: true, role: true }
    });
    const staffActor = await db.user.findFirstOrThrow({
      where: { role: 'STAFF', isActive: true }, select: { id: true, email: true, role: true }
    });
    admin = jwt.sign(adminActor, process.env.JWT_SECRET, { expiresIn: '30m' });
    staff = jwt.sign(staffActor, process.env.JWT_SECRET, { expiresIn: '30m' });

    await scenario('TK-01', 'Receipt increases physical and batch stock exactly once; IMPORT includes actor and cost', async () => {
      const i = await create('receipt');
      const r = ok(await receipt(i, 10)); const s = await stock(i); balanced(s);
      assert.equal(Number(s.ingredient.quantity), 10);
      assert.equal(s.batches.length, 1); assert.equal(s.batches[0].id, r.batch.id);
      assert.equal(s.ledger.length, 1); assert.equal(s.ledger[0].type, 'IMPORT');
      assert.equal(Number(s.ledger[0].quantity), 10);
      assert.equal(s.ledger[0].performedBy, adminActor.id);
      assert.equal(Number(s.ledger[0].totalCost), 20);
      return { ingredientId: i.id, quantity: 10, batchId: r.batch.id, transactionId: s.ledger[0].id };
    });

    await scenario('TK-02', 'Order reserves until PREPARING, consumes FEFO once, COMPLETED has no second consumption', async () => {
      const i = await create('sales'); await receipt(i, 20);
      const category = await db.category.findFirstOrThrow({ select: { id: true } });
      const p = ok(await api('POST', '/products', {
        sku: prefix + '-drink', name: prefix + '-drink', price: 10000, categoryId: category.id,
        isActive: false, requiresRecipe: true
      }), 201).product;
      ok(await api('POST', '/products/' + p.id + '/recipes', {
        ingredients: [{ ingredientId: i.id, quantity: 3, unit: 'g' }]
      }), 201);
      const product = ok(await api('GET', '/products/' + p.id)).product;
      ok(await api('PUT', '/products/' + p.id, { expectedUpdatedAt: product.updatedAt, isActive: true }));
      const order = ok(await api('POST', '/orders', {
        requestId: randomUUID(), items: [{ productId: p.id, quantity: 2, toppings: [] }], paymentMethod: 'CASH'
      }), 201).order;
      assert.equal(Number((await stock(i)).ingredient.quantity), 20);
      assert.equal(Number((await stock(i)).ingredient.reserved), 6);
      ok(await api('PATCH', '/orders/' + order.id + '/status', { status: 'CONFIRMED' }));
      ok(await api('PATCH', '/orders/' + order.id + '/status', { status: 'PREPARING' }));
      const preparing = await stock(i); balanced(preparing);
      assert.equal(Number(preparing.ingredient.quantity), 14);
      assert.equal(Number(preparing.ingredient.reserved), 0);
      const consumed = preparing.ledger.filter(t => t.type === 'CONSUME');
      assert.equal(consumed.length, 1); assert.equal(Number(consumed[0].quantity), -6);
      assert.ok(consumed[0].orderItemId);
      ok(await api('PATCH', '/orders/' + order.id + '/status', { status: 'COMPLETED' }));
      const completed = await stock(i); balanced(completed);
      assert.equal(Number(completed.ingredient.quantity), 14);
      assert.deepEqual(completed.ledger, preparing.ledger);
      return { ingredientId: i.id, orderId: order.id, beforePreparing: 20, afterPreparing: 14,
        afterCompleted: 14, consumptionTransactionId: consumed[0].id };
    });

    await scenario('TK-03', 'Confirmed waste reduces batch and quantity with WASTE actor/reason; no refund linkage', async () => {
      const i = await create('waste'); await receipt(i, 10);
      ok(await api('POST', '/ingredients/' + i.id + '/waste', {
        quantity: 3, unit: 'g', wasteReason: 'DAMAGED', note: prefix + ' damaged'
      }, staff));
      const s = await stock(i); balanced(s);
      assert.equal(Number(s.ingredient.quantity), 7);
      const w = s.ledger.filter(t => t.type === 'WASTE');
      assert.equal(w.length, 1); assert.equal(Number(w[0].quantity), -3);
      assert.equal(w[0].performedBy, staffActor.id);
      return { ingredientId: i.id, stockAfter: 7, transactionId: w[0].id };
    });

    await scenario('TK-04', 'Positive adjustment pending -> approval once, with audit and compensating ledger', async () => {
      const i = await create('increase'); const r = ok(await receipt(i, 10));
      const req = randomUUID(); ok(await makeAdjustment(i, r.batch.id, 13, req), 201);
      assert.equal(Number((await stock(i)).ingredient.quantity), 10);
      const pending = ok(await api('GET', '/ingredients/' + i.id + '/adjustments/' + req));
      assert.equal(pending.status, 'PENDING');
      const frozen = JSON.stringify(await stock(i));
      ok(await api('POST', '/ingredients/' + i.id + '/adjustments/' + req + '/approve', {}, staff), 403);
      assert.equal(JSON.stringify(await stock(i)), frozen);
      ok(await api('POST', '/ingredients/' + i.id + '/adjustments/' + req + '/approve', {}));
      const after = await stock(i); balanced(after); assert.equal(Number(after.ingredient.quantity), 13);
      const ledger = after.ledger.filter(t => t.type === 'ADJUSTMENT');
      assert.equal(ledger.length, 1); assert.equal(Number(ledger[0].quantity), 3);
      assert.equal(ledger[0].performedBy, adminActor.id);
      assert.equal((await db.stockCount.findUniqueOrThrow({ where: { code: 'ING-ADJUST-' + req } })).status, 'COMPLETED');
      ok(await api('POST', '/ingredients/' + i.id + '/adjustments/' + req + '/approve', {}));
      assert.equal(JSON.stringify(await stock(i)), JSON.stringify(after));
      return { ingredientId: i.id, quantityBefore: 10, quantityAfter: 13, ledgerId: ledger[0].id, requestId: req };
    });

    await scenario('TK-05', 'Negative adjustment requires ADMIN and cannot overdraw physical/reserved stock', async () => {
      const i = await create('decrease'); const r = ok(await receipt(i, 10));
      const invalid = randomUUID(); ok(await makeAdjustment(i, r.batch.id, 0, invalid), 201);
      const before = JSON.stringify(await stock(i));
      ok(await api('POST', '/ingredients/' + i.id + '/adjustments/' + invalid + '/reject', {}));
      assert.equal(JSON.stringify(await stock(i)), before);
      const req = randomUUID(); ok(await makeAdjustment(i, r.batch.id, 7, req), 201);
      assert.equal(JSON.stringify(await stock(i)), before);
      ok(await api('POST', '/ingredients/' + i.id + '/adjustments/' + req + '/approve', {}));
      const after = await stock(i); balanced(after); assert.equal(Number(after.ingredient.quantity), 7);
      assert.equal(Number(after.ledger.find(t => t.type === 'ADJUSTMENT').quantity), -3);
      const category = await db.category.findFirstOrThrow({ select: { id: true } });
      const p = ok(await api('POST', '/products', {
        sku: prefix + '-reserved-product', name: prefix + '-reserved-product', price: 10000,
        categoryId: category.id, isActive: false, requiresRecipe: true
      }), 201).product;
      ok(await api('POST', '/products/' + p.id + '/recipes', { ingredients: [
        { ingredientId: i.id, quantity: 4, unit: 'g' }
      ] }), 201);
      const prod = ok(await api('GET', '/products/' + p.id)).product;
      ok(await api('PUT', '/products/' + p.id, { expectedUpdatedAt: prod.updatedAt, isActive: true }));
      const order = ok(await api('POST', '/orders', { requestId: randomUUID(),
        items: [{ productId: p.id, quantity: 1 }], paymentMethod: 'CASH' }), 201).order;
      assert.equal(Number((await stock(i)).ingredient.reserved), 4);
      const reservedRequest = randomUUID();
      ok(await makeAdjustment(i, r.batch.id, 2, reservedRequest), 201);
      const beforeReservedAttempt = JSON.stringify(await stock(i));
      assert.equal((await api('POST', '/ingredients/' + i.id + '/adjustments/' + reservedRequest + '/approve', {})).status, 409);
      assert.equal(JSON.stringify(await stock(i)), beforeReservedAttempt);
      ok(await api('PATCH', '/orders/' + order.id + '/status', { status: 'CANCELLED' }));
      return { ingredientId: i.id, rejectedRequest: invalid, approvedRequest: req, stockAfter: 7,
        reservedGuardRejected: 409, pendingPreserved: true };
    });

    await scenario('TK-07', 'Concurrent HTTP import plus export yields exact net movement', async () => {
      const i = await create('overlap'); await receipt(i, 10);
      const race = await overlap(i, [() => receipt(i, 8, 'B'), () => internal(i, 4)]);
      const results = race.results;
      for (const result of results) ok(result);
      const s = await stock(i); balanced(s); assert.equal(Number(s.ingredient.quantity), 14);
      return { ingredientId: i.id, statuses: results.map(x => x.status), stockAfter: 14, lockWaiters: race.lockWaiters };
    });

    await scenario('TK-08', 'Two overlapping HTTP exports cannot consume 14 from 10 stock', async () => {
      const i = await create('racing'); await receipt(i, 10);
      const race = await overlap(i, [() => internal(i, 7), () => internal(i, 7)]);
      const results = race.results;
      assert.deepEqual(results.map(x => x.status).sort(), [200, 400]);
      const s = await stock(i); balanced(s); assert.equal(Number(s.ingredient.quantity), 3);
      assert.equal(s.ledger.filter(t => t.type === 'CONSUME').reduce((v, t) => v - Number(t.quantity), 0), 7);
      return { ingredientId: i.id, statuses: results.map(x => x.status), stockAfter: 3, lockWaiters: race.lockWaiters };
    });

    await scenario('TK-09', 'Excess export returns Vietnamese error without stock or ledger changes', async () => {
      const i = await create('exceed'); await receipt(i, 4);
      const before = JSON.stringify(await stock(i));
      const reject = await internal(i, 7);
      assert.equal(reject.status, 400); assert.match(JSON.stringify(reject.payload), /vượt quá tồn kho khả dụng/);
      assert.equal(JSON.stringify(await stock(i)), before);
      return { ingredientId: i.id, status: reject.status, unchanged: true };
    });

    await scenario('TK-10', 'Durable import requestId replay, payload conflict, and concurrent retries', async () => {
      const i = await create('replay'); const req = randomUUID();
      const one = ok(await receipt(i, 5, 'A', req));
      const two = ok(await receipt(i, 5, 'A', req));
      assert.equal(one.batch.id, two.batch.id); assert.equal(two.replayed, true);
      const conflict = await receipt(i, 6, 'A', req); assert.equal(conflict.status, 409);
      const concurrentReq = randomUUID();
      const race = await overlap(i, [
        () => receipt(i, 7, 'B', concurrentReq), () => receipt(i, 7, 'B', concurrentReq)
      ]);
      const raced = race.results;
      raced.forEach(x => ok(x));
      assert.equal(raced.map(x => x.payload.data.replayed).filter(Boolean).length, 1);
      const s = await stock(i); balanced(s); assert.equal(Number(s.ingredient.quantity), 12);
      assert.equal(s.ledger.filter(t => t.type === 'IMPORT').length, 2);
      return { ingredientId: i.id, conflictStatus: conflict.status, retryStatuses: raced.map(x => x.status), stockAfter: 12,
        lockWaiters: race.lockWaiters };
    });

    await scenario('TK-11', 'Concurrent duplicate internal-use request produces one CONSUME ledger', async () => {
      const i = await create('export-replay'); await receipt(i, 15);
      const req = randomUUID();
      const race = await overlap(i, [() => internal(i, 3, req), () => internal(i, 3, req)]);
      const raced = race.results;
      raced.forEach(x => ok(x)); assert.equal(raced.filter(x => x.payload.data.replayed).length, 1);
      const conflict = await internal(i, 3, req, admin, prefix + '-changed');
      assert.equal(conflict.status, 409);
      const s = await stock(i); balanced(s); assert.equal(Number(s.ingredient.quantity), 12);
      assert.equal(s.ledger.filter(t => t.type === 'CONSUME').length, 1);
      return { ingredientId: i.id, conflictStatus: 409, stockAfter: 12, lockWaiters: race.lockWaiters };
    });

    await scenario('TK-12', 'Read-only reconciliation detects aggregate/batch discrepancy on owned fixture', async () => {
      const i = await create('aggregate-mismatch'); await receipt(i, 10);
      const normal = ok(await api('GET', '/ingredients/' + i.id + '/reconciliation'));
      assert.equal(normal.aggregateBatchDifference, '0');
      await db.ingredient.update({ where: { id: i.id }, data: { quantity: { increment: 2 } } });
      try {
        const invalid = ok(await api('GET', '/ingredients/' + i.id + '/reconciliation'));
        assert.equal(invalid.aggregateBatchConsistent, false); assert.equal(invalid.aggregateBatchDifference, '2');
        assert.equal(Number((await stock(i)).ingredient.quantity), 12);
        return { ingredientId: i.id, difference: invalid.aggregateBatchDifference, restoredAfterTest: true };
      } finally {
        await db.ingredient.update({ where: { id: i.id }, data: { quantity: { decrement: 2 } } });
        balanced(await stock(i));
      }
    });

    await scenario('TK-13', 'Read-only audit reports ledger-vs-stock discrepancy without editing ledger', async () => {
      const i = await create('ledger-mismatch'); const r = ok(await receipt(i, 10));
      await db.$transaction(async tx => {
        await tx.ingredient.update({ where: { id: i.id }, data: { quantity: { increment: 2 } } });
        await tx.ingredientBatch.update({ where: { id: r.batch.id }, data: { quantityRemaining: { increment: 2 } } });
      });
      try {
        const report = ok(await api('GET', '/ingredients/' + i.id + '/reconciliation'));
        assert.equal(report.aggregateBatchDifference, '0'); assert.equal(report.ledgerBalanceDifference, '2');
        assert.equal(report.ledgerBaseline, 'UNVERIFIED');
        assert.equal(report.ledgerDifferenceIsDefinitive, false);
        return { ingredientId: i.id, discrepancy: report.ledgerBalanceDifference, openingBalanceCaveat: true };
      } finally {
        await db.$transaction(async tx => {
          await tx.ingredient.update({ where: { id: i.id }, data: { quantity: { decrement: 2 } } });
          await tx.ingredientBatch.update({ where: { id: r.batch.id }, data: { quantityRemaining: { decrement: 2 } } });
        });
        balanced(await stock(i));
      }
    });

    await scenario('TK-14', 'Quarantined lot stays physical but cannot be used internally', async () => {
      const i = await create('quarantine'); const r = ok(await receipt(i, 10));
      const category = await db.category.findFirstOrThrow({ select: { id: true } });
      const p = ok(await api('POST', '/products', {
        sku: prefix + '-quarantine-product', name: prefix + '-quarantine-product', price: 10000,
        categoryId: category.id, isActive: false, requiresRecipe: true
      }), 201).product;
      ok(await api('POST', '/products/' + p.id + '/recipes', {
        ingredients: [{ ingredientId: i.id, quantity: 2, unit: 'g' }]
      }), 201);
      const product = ok(await api('GET', '/products/' + p.id)).product;
      ok(await api('PUT', '/products/' + p.id, { expectedUpdatedAt: product.updatedAt, isActive: true }));
      const orderBody = { requestId: randomUUID(), items: [{ productId: p.id, quantity: 1 }], paymentMethod: 'CASH' };
      const pending = ok(await api('POST', '/orders', orderBody), 201).order;
      assert.equal(Number((await stock(i)).ingredient.reserved), 2);
      ok(await api('POST', '/ingredients/' + i.id + '/batches/' + r.batch.id + '/quarantine',
        { requestId: randomUUID(), reason: prefix + ' quality concern' }));
      const snapshot = await stock(i); balanced(snapshot);
      assert.equal(snapshot.batches[0].qualityStatus, 'QUARANTINED');
      const details = ok(await api('GET', '/ingredients/' + i.id));
      assert.equal(details.availableQuantity, 0); assert.equal(details.physicalQuantity, 10);
      const attempt = await internal(i, 1); assert.equal(attempt.status, 400);
      assert.equal((await api('POST', '/orders', { ...orderBody, requestId: randomUUID() })).status, 400);
      ok(await api('PATCH', '/orders/' + pending.id + '/status', { status: 'CONFIRMED' }));
      assert.equal((await api('PATCH', '/orders/' + pending.id + '/status', { status: 'PREPARING' })).status, 400);
      assert.equal(JSON.stringify(await stock(i)), JSON.stringify(snapshot));
      ok(await api('PATCH', '/orders/' + pending.id + '/status', { status: 'CANCELLED' }));
      const final = await stock(i); balanced(final);
      assert.equal(Number(final.ingredient.quantity), 10);
      assert.equal(Number(final.ingredient.reserved), 0);
      return { ingredientId: i.id, physical: 10, usable: 0, rejectedExportStatus: attempt.status,
        orderReservationRejected: true, preparingRejected: true, cancellationReleasedReservation: true };
    });

    await scenario('TK-15', 'ADMIN compensation is append-only, linked, authorized, and idempotent', async () => {
      const i = await create('correction'); await receipt(i, 10);
      const initial = await stock(i); const original = initial.ledger.find(t => t.type === 'IMPORT');
      const route = '/ingredients/' + i.id + '/transactions/' + original.id + '/corrections';
      const req = randomUUID(), body = { requestId: req, reason: prefix + ' mistaken receipt correction' };
      ok(await api('POST', route, body, staff), 403);
      assert.equal(JSON.stringify(await stock(i)), JSON.stringify(initial));
      const race = await overlap(i, [() => api('POST', route, body), () => api('POST', route, body)]);
      race.results.forEach(x => ok(x));
      assert.equal(race.results.filter(x => x.payload.data.replayed).length, 1);
      const after = await stock(i); balanced(after); assert.equal(Number(after.ingredient.quantity), 0);
      assert.deepEqual(after.ledger.find(t => t.id === original.id), original);
      const reversals = after.ledger.filter(t => t.referenceType === 'InventoryTransactionCorrection');
      assert.equal(reversals.length, 1); assert.equal(reversals[0].referenceId, original.id);
      assert.equal(Number(reversals[0].quantity), -10);
      assert.equal(reversals[0].performedBy, adminActor.id);
      const other = await api('POST', route, { ...body, requestId: randomUUID() });
      assert.equal(other.status, 409);
      await assert.rejects(db.inventoryTransaction.update({ where: { id: original.id }, data: { reason: 'unauthorized edit' } }));
      await assert.rejects(db.inventoryTransaction.delete({ where: { id: original.id } }));
      assert.deepEqual((await stock(i)).ledger.find(t => t.id === original.id), original);
      return { ingredientId: i.id, originalTransactionId: original.id, correctionTransactionId: reversals[0].id,
        lockedWaiters: race.lockWaiters, appendOnlyTrigger: true, replayedExactlyOnce: true };
    });
  } catch (error) {
    out.blocker = error.stack ?? error.message; process.exitCode = 2;
    console.error('Acceptance precondition failed:', error.message);
  } finally {
    out.finishedAt = new Date().toISOString();
    fs.writeFileSync(path.join(folder, 'INVENTORY-HTTP-DB-EVIDENCE.json'), JSON.stringify(out, null, 2));
    await db.$disconnect();
  }
  if (out.scenarios.some(s => s.verdict !== 'PASS')) process.exitCode = 1;
}
main().catch(error => { console.error(error); process.exitCode = 2; });
