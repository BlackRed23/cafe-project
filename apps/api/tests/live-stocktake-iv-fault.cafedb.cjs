// IV08: real JWT HTTP / Stocktake service / Prisma / PostgreSQL rollback acceptance.
// Test-only fault occurs AFTER actual approval SQL, BEFORE transaction commits.
// Opt in: IV08_CAFEDB_CONFIRMED=YES IV08_DB_PORT=15432 node apps/api/tests/live-stocktake-iv-fault.cafedb.cjs
// Owned isolated child server only. No DB reset, simulated payment charge, SMTP or shared-server stop.
'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const net = require('node:net');
const { randomUUID } = require('node:crypto');
const { spawn } = require('node:child_process');
require('dotenv').config({ path: 'apps/api/.env', quiet: true });
require('dotenv').config({ quiet: true });
const url = new URL(process.env.DATABASE_URL);
assert.equal(url.pathname, '/cafedb', 'This test may only target existing cafedb');
url.hostname = '127.0.0.1';
url.port = process.env.IV08_DB_PORT || '15432';
const stringify = data => JSON.stringify(data, (_k, x) => typeof x === 'bigint' ? String(x) : x, 2);
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));

if (process.env.IV08_ISOLATED_CHILD === 'YES') {
  assert.equal(process.env.IV08_CAFEDB_CONFIRMED, 'YES');
  process.env.DATABASE_URL = url.toString();
  process.env.NODE_ENV = 'test';
  require('ts-node').register({ project: 'apps/api/tsconfig.json', transpileOnly: true });
  const { prisma } = require('@cafe-project/database');
  const originalTransaction = prisma.$transaction.bind(prisma);
  prisma.$transaction = (callback, opts) => {
    if (typeof callback !== 'function') return originalTransaction(callback, opts);
    return originalTransaction(async tx => {
      const wrapped = new Proxy(tx, {
        get(target, key) {
          if (key !== 'stockCount') return Reflect.get(target, key);
          return new Proxy(Reflect.get(target, key), {
            get(model, methodName) {
              const method = Reflect.get(model, methodName);
              if (typeof method !== 'function') return method;
              if (methodName !== 'update') return method.bind(model);
              return async args => {
                if (process.env.IV08_FAULT_ACTIVE === 'YES' && args.data?.status === 'COMPLETED') {
                  const row = await tx.stockCount.findUnique({
                    where: args.where, select: { id: true, note: true }
                  });
                  if (row?.note?.includes('__IV_APPROVAL_ROLLBACK__')) {
                    const completedSql = await method.call(model, args);
                    process.send?.({ type: 'INJECTED_AFTER_COMPLETED_SQL',
                      stockCountId: row.id, pid: process.pid });
                    assert.equal(completedSql.status, 'COMPLETED');
                    throw new Error('IV08_TEST_ONLY_FAILURE_AFTER_STOCKCOUNT_COMPLETED_SQL');
                  }
                }
                return method.call(model, args);
              };
            }
          });
        }
      });
      return callback(wrapped);
    }, opts);
  };
  const express = require('express');
  const app = express();
  app.use(express.json());
  app.set('json replacer', (_key, value) => typeof value === 'bigint' ? value.toString() : value);
  app.use('/api/ingredients', require('../src/modules/ingredient/ingredient.route').ingredientRoutes);
  app.use('/api/stocktakes', require('../src/modules/inventory/stocktake.route').stocktakeRoutes);
  app.use('/api/products', require('../src/modules/product/product.route').default);
  app.use('/api/products', require('../src/modules/recipe/recipe.route').productRecipeRoutes);
  app.use('/api/orders', require('../src/modules/order/order.route').default);
  app.use(require('../src/common/error-handler').errorHandler);
  const server = app.listen(Number(process.env.IV08_PORT), '127.0.0.1',
    () => process.send?.({ type: 'READY', pid: process.pid,
      port: Number(process.env.IV08_PORT), injection: process.env.IV08_FAULT_ACTIVE === 'YES' }));
  process.on('SIGTERM', () => server.close(() => process.exit(0)));
} else {
  main().catch(error => { console.error(error.stack ?? error); process.exitCode = 2; });
}

async function main() {
  assert.equal(process.env.IV08_CAFEDB_CONFIRMED, 'YES', 'Explicit opt-in required');
  const jwt = require('jsonwebtoken');
  const { PrismaClient } = require('@prisma/client');
  const db = new PrismaClient({ datasources: { db: { url: url.toString() } } });
  const runID = randomUUID(), prefix = 'iv08-' + runID;
  const dir = 'D:/KLTN/cafe-project-artifacts/reports/live-stocktake';
  fs.mkdirSync(dir, { recursive: true });
  const target = dir + '/iv08-fault-' + runID + '.json';
  const evidence = { runID, startedAt: new Date().toISOString(), database: 'cafedb',
    dbPort: Number(url.port), scenario: 'IV08', verdict: 'NOT_RUN', http: [],
    servers: [], injectionEvents: [], assertions: [], notes: [
      'Owned test HTTP children; first fault-enabled, second fault-disabled',
      'POST approval throws after real StockCount COMPLETED SQL, before transaction commit',
      'CASH fixture has no money movement; no external supplier or email activity'
    ] };
  const save = () => fs.writeFileSync(target, stringify(evidence), 'utf8');
  let child = null, port = null, adminToken = '', staffToken = '', adminUser, staffUser, counter = 0;
  const check = (name, value) => { assert.ok(value, name); evidence.assertions.push(name); };
  const openPort = () => new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const selected = server.address().port;
      server.close(() => resolve(selected));
    });
  });
  async function startChild(faultActive) {
    assert.equal(child, null, 'Owned child must not overlap');
    port = await openPort();
    child = spawn(process.execPath, [__filename], { cwd: process.cwd(), windowsHide: true,
      env: { ...process.env, IV08_ISOLATED_CHILD: 'YES', IV08_PORT: String(port),
        IV08_FAULT_ACTIVE: faultActive ? 'YES' : 'NO' }, stdio: ['ignore', 'pipe', 'pipe', 'ipc'] });
    const pid = child.pid;
    let stderr = '';
    child.stderr.on('data', data => { stderr = (stderr + String(data)).slice(-1800); });
    child.stdout.on('data', () => {});
    const ready = new Promise((resolve, reject) => {
      child.on('message', msg => {
        if (msg.type === 'READY') resolve(msg);
        if (msg.type === 'INJECTED_AFTER_COMPLETED_SQL') {
          evidence.injectionEvents.push({ ...msg, at: new Date().toISOString() });
        }
      });
      child.once('exit', (code, signal) => reject(new Error(
        'IV08 owned server exited before ready ' + code + '/' + signal + ' ' + stderr)));
    });
    const started = await Promise.race([ready,
      pause(20000).then(() => { throw Error('IV08 child startup timeout ' + stderr); })]);
    evidence.servers.push({ action: 'START', ...started, at: new Date().toISOString() });
  }
  async function stopChild() {
    if (!child) return;
    const current = child; child = null;
    if (current.exitCode !== null || current.signalCode !== null) return;
    const terminated = new Promise(resolve =>
      current.once('exit', (code, signal) => resolve({ code, signal })));
    current.kill('SIGTERM');
    const result = await Promise.race([terminated,
      pause(5000).then(() => { current.kill('SIGKILL'); return terminated; })]);
    evidence.servers.push({ action: 'STOP', pid: current.pid, at: new Date().toISOString(), ...result });
  }
  async function http(method, path, body, token = adminToken) {
    const id = 'IV08-H' + (++counter), when = new Date().toISOString();
    const result = await fetch('http://127.0.0.1:' + port + '/api' + path, {
      method, signal: AbortSignal.timeout(30000),
      headers: { 'content-type': 'application/json', authorization: 'Bearer ' + token },
      body: body === undefined ? undefined : JSON.stringify(body)
    });
    const raw = await result.text();
    let payload;
    try { payload = JSON.parse(raw); } catch { payload = { raw }; }
    evidence.http.push({ id, method, path, requestId: body?.requestId,
      status: result.status, start: when, end: new Date().toISOString(),
      message: payload?.message, replayed: payload?.data?.replayed,
      ...(result.status >= 400 ? { error: payload?.error ?? payload?.message } : {}) });
    return { status: result.status, data: payload?.data, payload, id };
  }
  const ok = (row, expected = 200) => {
    assert.equal(row.status, expected, row.id + ': ' + stringify(row.payload).slice(0, 500));
    return row.data;
  };
  async function snapshot(ingredientId, stockCountId) {
    return {
      ingredient: await db.ingredient.findUniqueOrThrow({ where: { id: ingredientId } }),
      batches: await db.ingredientBatch.findMany({ where: { ingredientId }, orderBy: { id: 'asc' } }),
      ledger: await db.inventoryTransaction.findMany({ where: { ingredientId }, orderBy: { movementSeq: 'asc' } }),
      session: await db.stockCount.findUniqueOrThrow({ where: { id: stockCountId } }),
      entries: await db.stocktakeEntry.findMany({ where: { stockCountId },
        include: { history: { orderBy: { revision: 'asc' } } }, orderBy: { id: 'asc' } }),
      requests: await db.stocktakeRequest.findMany({ where: { stockCountId }, orderBy: { requestId: 'asc' } })
    };
  }
  try {
    const [identity] = await db.$queryRawUnsafe(
      'SELECT current_database() AS name, (SELECT count(*)::int FROM pg_trigger WHERE tgname = ' +
      "'InventoryTransaction_stocktake_cursor'" + ') AS cursor_trigger');
    assert.equal(identity.name, 'cafedb');
    assert.equal(identity.cursor_trigger, 1);
    evidence.databaseVerification = identity;
    adminUser = await db.user.findFirstOrThrow({ where: { role: 'ADMIN', isActive: true },
      select: { id: true, role: true, email: true } });
    staffUser = await db.user.findFirstOrThrow({ where: { role: 'STAFF', isActive: true },
      select: { id: true, role: true, email: true } });
    const cat = await db.category.findFirstOrThrow({ select: { id: true } });
    adminToken = jwt.sign(adminUser, process.env.JWT_SECRET, { expiresIn: '45m' });
    staffToken = jwt.sign(staffUser, process.env.JWT_SECRET, { expiresIn: '45m' });
    await startChild(true);
    const i = ok(await http('POST', '/ingredients', {
      sku: prefix, name: prefix, baseUnit: 'ml', costPerBaseUnit: 2,
      expiryClassification: 'NON_PERISHABLE'
    }), 201);
    const imported = ok(await http('POST', '/ingredients/' + i.id + '/import', {
      requestId: randomUUID(), quantity: 10000, unit: 'ml', unitCost: 2,
      batchCode: prefix + '-batch', expirationDate: '2099-01-01'
    }));
    const started = ok(await http('POST', '/stocktakes', {
      requestId: randomUUID(), ingredientIds: [i.id],
      assignedCounterId: staffUser.id, note: '__IV_APPROVAL_ROLLBACK__ ' + prefix
    }, staffToken), 201);
    const stockCountId = started.session.id;
    const opening = ok(await http('GET', '/stocktakes/' + stockCountId, undefined, staffToken));
    const openingEntry = opening.entries.find(row => row.batchId === imported.batch.id);
    check('Opening count snapshot exactly 10000 ml', openingEntry.openingQty === '10000');
    const observation = ok(await http('POST', '/stocktakes/' + stockCountId + '/entries', {
      requestId: randomUUID(), batchId: imported.batch.id,
      expectedCursor: opening.current.find(x => x.ingredientId === i.id).cursor,
      expectedRevision: 0, actualQty: 9700,
      reason: prefix + ' signed physical observation 9700ml', reasonCategory: 'COUNTED'
    }, staffToken));
    const record = observation.entries.find(row => row.batchId === imported.batch.id);
    check('Observation expectedAtCount 10000, variance -300',
      record.expectedAtCount === '10000' && record.observedQty === '9700' && record.varianceQty === '-300');
    // Sale is AFTER physical observation and BEFORE approval, through real HTTP.
    const product = ok(await http('POST', '/products', {
      sku: prefix + '-product', name: prefix + '-product', price: 10000,
      categoryId: cat.id, requiresRecipe: true, isActive: false
    }), 201).product;
    ok(await http('POST', '/products/' + product.id + '/recipes', {
      ingredients: [{ ingredientId: i.id, quantity: 200, unit: 'ml' }]
    }), 201);
    const freshProduct = ok(await http('GET', '/products/' + product.id)).product;
    ok(await http('PUT', '/products/' + product.id, {
      expectedUpdatedAt: freshProduct.updatedAt, isActive: true
    }));
    const order = ok(await http('POST', '/orders', {
      requestId: randomUUID(), paymentMethod: 'CASH',
      items: [{ productId: product.id, quantity: 1 }]
    }), 201).order;
    ok(await http('PATCH', '/orders/' + order.id + '/status', { status: 'CONFIRMED' }));
    ok(await http('PATCH', '/orders/' + order.id + '/status', { status: 'PREPARING' }));
    const submitted = ok(await http('POST', '/stocktakes/' + stockCountId + '/submit',
      { requestId: randomUUID() }, staffToken));
    check('Count submitted PENDING_APPROVAL after one sale', submitted.session.status === 'PENDING_APPROVAL');
    const before = await snapshot(i.id, stockCountId);
    check('Real sale left 9800 ml before fault',
      Number(before.ingredient.quantity) === 9800 &&
      Number(before.batches[0].quantityRemaining) === 9800);
    check('One true -200 CONSUME before fault',
      before.ledger.filter(x => x.type === 'CONSUME' && Number(x.quantity) === -200).length === 1);
    check('No stocktake ADJUSTMENT before approval',
      before.ledger.filter(x => x.referenceType === 'Stocktake').length === 0);
    const approveRequestId = randomUUID();
    const attempt = await http('POST', '/stocktakes/' + stockCountId + '/approve',
      { requestId: approveRequestId });
    check('Fault injection HTTP response 500', attempt.status === 500);
    check('Injection occurred after actual StockCount COMPLETE SQL',
      evidence.injectionEvents.some(e => e.stockCountId === stockCountId));
    const afterFault = await snapshot(i.id, stockCountId);
    assert.equal(stringify(afterFault), stringify(before), 'IV08 partial commit leaked out of transaction');
    check('Ingredient/Batch/StockCount/requests/ledger/cursor byte-identical after rollback', true);
    check('No APPROVE requestId persisted on aborted transaction',
      afterFault.requests.every(x => x.requestId !== approveRequestId));
    await stopChild();
    await startChild(false);
    const committed = ok(await http('POST', '/stocktakes/' + stockCountId + '/approve',
      { requestId: approveRequestId }));
    check('Retry after restart is first successful commit', committed.session.status === 'COMPLETED' &&
      committed.replayed === false);
    const final = await snapshot(i.id, stockCountId);
    check('Final physical 9500 ml, no absolute overwrite',
      Number(final.ingredient.quantity) === 9500 &&
      Number(final.batches[0].quantityRemaining) === 9500);
    const adjustments = final.ledger.filter(x => x.type === 'ADJUSTMENT' && x.referenceType === 'Stocktake');
    check('Exactly one -300 stocktake adjustment, historical -200 sale preserved',
      adjustments.length === 1 && Number(adjustments[0].quantity) === -300 &&
      final.ledger.filter(x => x.type === 'CONSUME' && Number(x.quantity) === -200).length === 1);
    check('Commit advances cursor once for signed adjustment',
      BigInt(final.ingredient.movementCursor) === BigInt(before.ingredient.movementCursor) + 1n);
    check('Stored APPROVE requestId exists exactly once',
      final.requests.filter(row => row.requestId === approveRequestId).length === 1);
    const replayed = ok(await http('POST', '/stocktakes/' + stockCountId + '/approve',
      { requestId: approveRequestId }));
    check('Same requestId replay has no second commit', replayed.replayed === true);
    assert.equal(stringify(await snapshot(i.id, stockCountId)), stringify(final));
    check('Post-success replay preserves all persisted rows', true);
    evidence.verdict = 'PASS';
    evidence.actual = { ingredientId: i.id, stockCountId, orderId: order.id,
      batchId: imported.batch.id, approveRequestId, countAtCursor: record.observedCursor,
      movementCursorBeforeApproval: String(before.ingredient.movementCursor),
      movementCursorAfterApproval: String(final.ingredient.movementCursor),
      openingMl: 10000, observedMl: 9700, saleConsumeMl: 200,
      physicalAfterSaleMl: 9800, failedApprovalHttp: attempt.status, successfulApprovalHttp: 200,
      finalMl: 9500, adjustmentMl: -300, ledgerAdjustmentCount: adjustments.length,
      exactRollbackAcrossAllEntities: true, replayAfterRestart: true };
    evidence.snapshots = { before, afterFault, final };
    console.log('IV08 PASS: real HTTP fault rollback and retry 9500ml; runID=' + runID);
  } catch (error) {
    evidence.verdict = 'FAIL';
    evidence.error = error.stack ?? error.message;
    process.exitCode = 1;
    console.error('IV08 FAIL: ' + error.message);
  } finally {
    await stopChild().catch(() => {});
    await db.$disconnect();
    evidence.finishedAt = new Date().toISOString();
    evidence.totalHttp = evidence.http.length;
    save();
    console.log(stringify({ runID, file: target, verdict: evidence.verdict,
      httpRequests: evidence.totalHttp, approval: evidence.actual, error: evidence.error?.slice(0, 700) }));
  }
}
