// KK acceptance rollback. Fault injected inside test-only Prisma transaction
// AFTER full stocktake approval writes, never in production services.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { randomUUID } = require('node:crypto');
require('dotenv').config({ path: 'apps/api/.env', quiet: true });
const { PrismaClient } = require('@prisma/client');
const jwt = require('jsonwebtoken');
const folder = 'D:/KLTN/cafe-project-artifacts/reports/stocktake';
fs.mkdirSync(folder, { recursive: true });
const run = 'kk-fault-' + randomUUID();
const out = { run, startedAt: new Date().toISOString(), verdict: 'BLOCKED', requests: [] };
const json = value => JSON.stringify(value, (_key, v) => typeof v === 'bigint' ? v.toString() : v);
async function main() {
  assert.equal(process.env.INVENTORY_FAULT_CONFIRMED, 'YES');
  const url = new URL(process.env.DATABASE_URL);
  assert.equal(url.pathname, '/cafedb'); url.hostname = '127.0.0.1'; url.port = '55432';
  const db = new PrismaClient({ datasources: { db: { url: url.toString() } } });
  let token, staffToken;
  const api = async (method, route, body, access = token) => {
    const r = await fetch('http://127.0.0.1:5003/api' + route, { method,
      headers: { authorization: 'Bearer ' + access, 'content-type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body), signal: AbortSignal.timeout(30000) });
    const response = await r.json();
    const row = { id: 'FAULT-H' + (out.requests.length + 1), method, route, status: r.status, request: body, response };
    out.requests.push(row); return row;
  };
  const ok = (r, status = 200) => { assert.equal(r.status, status, json(r)); return r.response.data; };
  const snapshot = async (ingredientId, stockCountId) => ({
    ingredient: await db.ingredient.findUniqueOrThrow({ where: { id: ingredientId } }),
    batches: await db.ingredientBatch.findMany({ where: { ingredientId }, orderBy: { id: 'asc' } }),
    ledger: await db.inventoryTransaction.findMany({ where: { ingredientId }, orderBy: { id: 'asc' } }),
    session: await db.stockCount.findUniqueOrThrow({ where: { id: stockCountId } }),
    entries: await db.stocktakeEntry.findMany({ where: { stockCountId }, orderBy: { id: 'asc' } }),
    requests: await db.stocktakeRequest.findMany({ where: { stockCountId }, orderBy: { requestId: 'asc' } })
  });
  try {
    assert.equal((await db.$queryRaw`SELECT current_database() AS db`)[0].db, 'cafedb');
    const actor = await db.user.findFirstOrThrow({ where: { role: 'ADMIN', isActive: true },
      select: { id: true, email: true, role: true } });
    const staff = await db.user.findFirstOrThrow({ where: { role: 'STAFF', isActive: true },
      select: { id: true, email: true, role: true } });
    token = jwt.sign(actor, process.env.JWT_SECRET, { expiresIn: '20m' });
    staffToken = jwt.sign(staff, process.env.JWT_SECRET, { expiresIn: '20m' });
    const ingredient = ok(await api('POST', '/ingredients', {
      sku: run, name: run, baseUnit: 'g', costPerBaseUnit: 2, expiryClassification: 'NON_PERISHABLE'
    }), 201);
    const receipt = ok(await api('POST', '/ingredients/' + ingredient.id + '/import', {
      requestId: randomUUID(), quantity: 10, unit: 'g', unitCost: 2,
      batchCode: run + '-batch', expirationDate: '2099-01-01'
    }));
    const s = ok(await api('POST', '/stocktakes', { requestId: randomUUID(),
      ingredientIds: [ingredient.id], assignedCounterId: staff.id,
      note: '__KK_APPROVAL_ROLLBACK__ ' + run }, staffToken), 201);
    const current = ok(await api('GET', '/stocktakes/' + s.session.id, undefined, staffToken));
    ok(await api('POST', '/stocktakes/' + s.session.id + '/entries', {
      requestId: randomUUID(), batchId: receipt.batch.id, actualQty: 12,
      expectedCursor: current.current[0].cursor, expectedRevision: 0,
      reason: run + ' verified counted surplus', reasonCategory: 'COUNTED'
    }, staffToken));
    ok(await api('POST', '/stocktakes/' + s.session.id + '/submit', { requestId: randomUUID() }, staffToken));
    const before = await snapshot(ingredient.id, s.session.id);
    const failed = await api('POST', '/stocktakes/' + s.session.id + '/approve', { requestId: randomUUID() });
    assert.equal(failed.status, 500);
    assert.equal(failed.response.success, false);
    const after = await snapshot(ingredient.id, s.session.id);
    assert.equal(json(after), json(before), 'Approval failure committed a partial stock/ledger/session change.');
    assert.equal(after.session.status, 'PENDING_APPROVAL');
    assert.equal(after.batches[0].quantityRemaining.toString(), '10');
    assert.equal(after.ingredient.movementCursor.toString(), before.ingredient.movementCursor.toString());
    assert.equal(after.ledger.filter(row => row.referenceType === 'Stocktake').length, 0);
    out.verdict = 'PASS'; out.actual = { ingredientId: ingredient.id, sessionId: s.session.id,
      faultHttp: 500, physicalBefore: 10, physicalAfter: 10,
      transactionRollback: true, cursorRollback: true, ledgerRollback: true,
      approvalStatusRollback: true };
    console.log('KK-ROLLBACK PASS');
  } catch (error) {
    out.verdict = 'FAIL'; out.error = error.stack ?? error.message;
    process.exitCode = 1; console.log('KK-ROLLBACK FAIL ' + error.message.slice(0, 300));
  } finally {
    out.finishedAt = new Date().toISOString();
    fs.writeFileSync(folder + '/STOCKTAKE-FAULT-EVIDENCE.json', json(out));
    await db.$disconnect();
  }
}
main().catch(error => { console.error(error); process.exitCode = 2; });
