// Real HTTP fault injection through test-only Prisma transaction proxy; never touches non-owned fixtures.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { randomUUID } = require('node:crypto');
require('dotenv').config({ path: 'apps/api/.env', quiet: true });
const { PrismaClient } = require('@prisma/client');
const jwt = require('jsonwebtoken');
async function main() {
  assert.equal(process.env.INVENTORY_FAULT_CONFIRMED, 'YES');
  const url = new URL(process.env.DATABASE_URL);
  assert.equal(url.pathname, '/cafedb');
  url.hostname = '127.0.0.1'; url.port = '55432';
  const db = new PrismaClient({ datasources: { db: { url: url.toString() } } });
  const run = 'tk06-' + randomUUID(), requests = [];
  const folder = 'D:/KLTN/cafe-project-artifacts/reports/inventory';
  fs.mkdirSync(folder, { recursive: true });
  const report = { run, scenario: 'TK-06', time: new Date().toISOString(), requests, verdict: 'BLOCKED' };
  const save = () => fs.writeFileSync(folder + '/INVENTORY-TK06-FAULT-EVIDENCE.json', JSON.stringify(report, null, 2));
  let admin;
  const api = async (method, route, body) => {
    const response = await fetch('http://127.0.0.1:5003/api' + route, {
      method, signal: AbortSignal.timeout(30000),
      headers: { 'content-type': 'application/json', authorization: 'Bearer ' + admin },
      body: body === undefined ? undefined : JSON.stringify(body)
    });
    const data = await response.json();
    const entry = { method, route, status: response.status, body, response: data };
    requests.push(entry); return entry;
  };
  const ok = (r, status = 200) => { assert.equal(r.status, status, JSON.stringify(r)); return r.response.data; };
  const state = async id => ({
    ingredient: await db.ingredient.findUniqueOrThrow({ where: { id } }),
    batches: await db.ingredientBatch.findMany({ where: { ingredientId: id }, orderBy: { id: 'asc' } }),
    ledger: await db.inventoryTransaction.findMany({ where: { ingredientId: id }, orderBy: { id: 'asc' } })
  });
  try {
    assert.equal((await db.$queryRaw`SELECT current_database() AS database`)[0].database, 'cafedb');
    const actor = await db.user.findFirstOrThrow({ where: { role: 'ADMIN', isActive: true },
      select: { id: true, email: true, role: true } });
    admin = jwt.sign(actor, process.env.JWT_SECRET, { expiresIn: '20m' });
    const i = ok(await api('POST', '/ingredients', {
      sku: run, name: run, baseUnit: 'g', costPerBaseUnit: 2, expiryClassification: 'NON_PERISHABLE'
    }), 201);
    const receipt = ok(await api('POST', '/ingredients/' + i.id + '/import', {
      requestId: randomUUID(), quantity: 10, unit: 'g', unitCost: 2,
      batchCode: run + '-baseline', expirationDate: '2099-01-01'
    }));
    const baseline = await state(i.id);
    const failedImport = await api('POST', '/ingredients/' + i.id + '/import', {
      requestId: randomUUID(), quantity: 5, unit: 'g', unitCost: 3,
      batchCode: run + '-failed', expirationDate: '2099-02-01',
      note: '__TK06_IMPORT_ROLLBACK__'
    });
    assert.equal(failedImport.status, 500);
    assert.equal(failedImport.response.success, false);
    assert.deepEqual(await state(i.id), baseline, 'Failed receipt committed a partial stock change.');

    const category = await db.category.findFirstOrThrow({ select: { id: true } });
    const p = ok(await api('POST', '/products', {
      sku: run + '-product', name: run + '-product', categoryId: category.id,
      price: 10000, isActive: false, requiresRecipe: true
    }), 201).product;
    ok(await api('POST', '/products/' + p.id + '/recipes', {
      ingredients: [{ ingredientId: i.id, quantity: 2, unit: 'g' }]
    }), 201);
    const product = ok(await api('GET', '/products/' + p.id)).product;
    ok(await api('PUT', '/products/' + p.id, { expectedUpdatedAt: product.updatedAt, isActive: true }));
    const order = ok(await api('POST', '/orders', {
      requestId: randomUUID(), items: [{ productId: p.id, quantity: 1 }], paymentMethod: 'CASH'
    }), 201).order;
    assert.equal(Number((await state(i.id)).ingredient.reserved), 2);

    const adjustmentId = randomUUID();
    ok(await api('POST', '/ingredients/' + i.id + '/adjustments', {
      requestId: adjustmentId, batchId: receipt.batch.id, measuredQuantity: 12,
      reason: '__TK06_APPROVAL_ROLLBACK__'
    }), 201);
    const beforeApproval = await state(i.id);
    const pendingBefore = await db.stockCount.findUniqueOrThrow({ where: { code: 'ING-ADJUST-' + adjustmentId } });
    assert.equal(pendingBefore.status, 'PENDING');
    const failedApproval = await api('POST', '/ingredients/' + i.id + '/adjustments/' + adjustmentId + '/approve', {});
    assert.equal(failedApproval.status, 500);
    assert.equal(failedApproval.response.success, false);
    assert.deepEqual(await state(i.id), beforeApproval, 'Failed approval committed an inventory write.');
    const pendingAfter = await db.stockCount.findUniqueOrThrow({ where: { code: 'ING-ADJUST-' + adjustmentId } });
    assert.deepEqual(pendingAfter, pendingBefore, 'Failed approval changed approval status/history.');
    assert.equal(Number((await state(i.id)).ingredient.reserved), 2);
    report.verdict = 'PASS';
    report.actual = { ingredientId: i.id, orderId: order.id, importedBefore: 10, afterImportFailure: 10,
      reservedBefore: 2, reservedAfter: 2, failedImportStatus: 500, failedApprovalStatus: 500,
      batchLedgerAndAdjustmentStatusRolledBack: true, source: 'Test-only transaction proxy on isolated HTTP server :5003' };
    console.log('TK-06 PASS');
  } catch (e) {
    report.verdict = 'FAIL'; report.error = e.stack ?? e.message; console.log('TK-06 FAIL ' + e.message.slice(0, 250)); process.exitCode = 1;
  } finally { save(); await db.$disconnect(); }
}
main().catch(e => { console.error(e); process.exitCode = 2; });
