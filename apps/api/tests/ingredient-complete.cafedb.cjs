// Opt-in remaining Ingredient acceptance; preserves Batch A evidence.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { randomUUID } = require('node:crypto');
require('dotenv').config({ path: 'apps/api/.env', quiet: true });
require('dotenv').config({ quiet: true });
const { PrismaClient } = require('@prisma/client');
const jwt = require('jsonwebtoken');
async function main() {
  assert.equal(process.env.INGREDIENT_CAFEDB_CONFIRMED, 'YES');
  const url = new URL(process.env.DATABASE_URL); assert.equal(url.pathname, '/cafedb');
  url.hostname = '127.0.0.1'; url.port = '55432';
  const db = new PrismaClient({ datasources: { db: { url: url.toString() } } });
  const run = 'nl-full-' + randomUUID();
  const out = { run, time: new Date().toISOString(), scenarios: [], requests: [] };
  const selected = process.env.INGREDIENT_CASES?.split(',');
  let admin, staff, actor, category, seq = 0;
  const api = async (method, route, body, token = admin) => {
    const r = await fetch((process.env.INGREDIENT_API_URL || 'http://127.0.0.1:5000/api') + route, {
      method, signal: AbortSignal.timeout(20000), headers: { 'content-type': 'application/json', authorization: 'Bearer ' + token },
      body: body === undefined ? undefined : JSON.stringify(body)
    });
    const raw = await r.text(); let response; try { response = JSON.parse(raw); } catch { response = { raw }; }
    const entry = { id: 'C' + (++seq), method, route, request: body, role: token === staff ? 'STAFF' : 'ADMIN', status: r.status, response };
    out.requests.push(entry); return entry;
  };
  const ok = (r, status) => { assert.equal(r.status, status, `${r.id}: ${JSON.stringify(r.response)}`); return r.response.data; };
  const scenario = async (id, expected, fn) => {
    if (selected && !selected.includes(id)) return;
    const start = seq;
    try { out.scenarios.push({ id, expected, verdict: 'PASS', actual: await fn(), evidence: out.requests.slice(start).map(x => x.id) }); }
    catch (e) { out.scenarios.push({ id, expected, verdict: 'FAIL', error: e.message, evidence: out.requests.slice(start).map(x => x.id) }); }
    console.log(JSON.stringify(out.scenarios.at(-1)));
  };
  const create = async (suffix, extra = {}) => ok(await api('POST', '/ingredients', {
    sku: run + '-' + suffix, name: run + '-' + suffix, baseUnit: 'g', costPerBaseUnit: 2, expiryClassification: 'NON_PERISHABLE', ...extra
  }), 201);
  const get = id => db.ingredient.findUniqueOrThrow({ where: { id } });
  const snapshot = async id => JSON.stringify({
    ingredient: await get(id), batches: await db.ingredientBatch.findMany({ where: { ingredientId: id }, orderBy: { id: 'asc' } }),
    ledger: await db.inventoryTransaction.findMany({ where: { ingredientId: id }, orderBy: { id: 'asc' } })
  });
  const imported = async (i, qty) => ok(await api('POST', `/ingredients/${i.id}/import`, {
    quantity: qty, unit: i.baseUnit, unitCost: i.costPerBaseUnit, batchCode: run, expirationDate: '2099-01-01'
  }), 200);
  const waste = (i, quantity, extra = {}, token = admin) => api('POST', `/ingredients/${i.id}/waste`, {
    quantity, unit: i.baseUnit, wasteReason: 'DAMAGED', note: run + ' confirmed damage', ...extra
  }, token);
  const product = async suffix => ok(await api('POST', '/products', {
    sku: run + '-' + suffix, name: run + '-' + suffix, price: 10000, categoryId: category.id, isActive: false, requiresRecipe: true
  }), 201).product;
  const recipe = (p, i, quantity, extra = {}) => api('POST', `/products/${p.id}/recipes`, {
    ingredients: [{ ingredientId: i.id, quantity, unit: i.baseUnit }], ...extra
  });
  try {
    out.database = await db.$queryRaw`SELECT current_database() AS database, version() AS version`;
    // Check existing schema only; no migration or schema push.
    out.baseline = await db.$queryRaw`SELECT to_regclass('public."StockCount"')::text AS count_table, to_regclass('public."StockCountItem"')::text AS item_table`;
    actor = await db.user.findFirstOrThrow({ where: { role: 'ADMIN', isActive: true }, select: { id: true, email: true, role: true } });
    const staffActor = await db.user.findFirstOrThrow({ where: { role: 'STAFF', isActive: true }, select: { id: true, email: true, role: true } });
    admin = jwt.sign(actor, process.env.JWT_SECRET, { expiresIn: '30m' });
    staff = jwt.sign(staffActor, process.env.JWT_SECRET, { expiresIn: '30m' });
    category = await db.category.findFirstOrThrow({ select: { id: true } });
    await scenario('OBS-01', 'PATCH isActive changes only supplied field plus version/timestamp', async () => {
      const i = await create('patch', { baseUnit: 'ml', costPerBaseUnit: 7, minThreshold: 12, origin: 'owned origin', storageInstructions: 'cool', expiryInfo: 'sealed', shelfLifeDays: 20 });
      await imported(i, 20);
      const before = await get(i.id), stock = JSON.parse(await snapshot(i.id));
      const response = ok(await api('PATCH', `/ingredients/${i.id}`, { isActive: false }), 200);
      const after = await get(i.id);
      for (const key of Object.keys(before).filter(k => !['isActive', 'rowVersion', 'updatedAt'].includes(k))) assert.equal(JSON.stringify(after[key]), JSON.stringify(before[key]), key);
      assert.equal(after.isActive, false); assert.equal(after.rowVersion, before.rowVersion + 1);
      assert.ok(after.updatedAt >= before.updatedAt); assert.equal(response.baseUnit, 'ml'); assert.equal(response.costPerBaseUnit, 7); assert.equal(response.minThreshold, 12);
      const afterStock = JSON.parse(await snapshot(i.id)); assert.deepEqual(afterStock.batches, stock.batches); assert.deepEqual(afterStock.ledger, stock.ledger);
      return { id: i.id, before, after, batchesLedgerUnchanged: true };
    });
    await scenario('NL-05', 'Zero stock rejects additional consumption with no writes', async () => {
      const i = await create('zero'), before = await snapshot(i.id);
      ok(await waste(i, 1), 400); assert.equal(await snapshot(i.id), before);
      assert.equal(ok(await api('GET', `/ingredients/${i.id}`), 200).availableQuantity, 0);
      return { id: i.id, quantity: 0, snapshotUnchanged: true };
    });
    await scenario('NL-06', 'Overconsumption rolls back aggregate, batches and ledger', async () => {
      const i = await create('negative'); await imported(i, 10);
      const before = await snapshot(i.id); ok(await waste(i, 11), 400); assert.equal(await snapshot(i.id), before);
      // Force insufficient selected batch after aggregate guard: transaction must stay unchanged.
      await imported(i, 10);
      const batch = await db.ingredientBatch.findFirstOrThrow({ where: { ingredientId: i.id } });
      const partial = await snapshot(i.id); const r = await waste(i, 15, { batchId: batch.id });
      assert.ok([400, 409].includes(r.status)); assert.equal(await snapshot(i.id), partial);
      return { id: i.id, overStockRejected: true, insufficientBatchRejected: true, fullSnapshotsUnchanged: true };
    });
    await scenario('NL-07', 'Unit changes preserve stock/cost/history; unsafe relabel rejected; input conversion correct', async () => {
      const i = await create('unit', { baseUnit: 'ml', costPerBaseUnit: 7, minThreshold: 9, origin: 'unit-fixture' });
      ok(await api('PATCH', `/ingredients/${i.id}`, { baseUnit: 'g' }), 200);
      let saved = await get(i.id); assert.equal(saved.baseUnit, 'g'); assert.equal(saved.costPerBaseUnit.toString(), '7'); assert.equal(saved.minThreshold.toString(), '9');
      ok(await api('POST', `/ingredients/${i.id}/import`, { quantity: 0.02, unit: 'kg', unitCost: 7000, batchCode: run, expirationDate: '2099-01-01' }), 200);
      const before = await snapshot(i.id);
      ok(await api('PATCH', `/ingredients/${i.id}`, { baseUnit: 'kg' }), 409);
      ok(await api('PATCH', `/ingredients/${i.id}`, { baseUnit: 'ml' }), 409);
      assert.equal(await snapshot(i.id), before);
      saved = await get(i.id); assert.equal(saved.quantity.toString(), '20'); assert.equal(saved.costPerBaseUnit.toString(), '7');
      const tx = await db.inventoryTransaction.findFirstOrThrow({ where: { ingredientId: i.id, type: 'IMPORT' } });
      assert.equal(tx.quantity.toString(), '20'); assert.equal(tx.totalCost.toString(), '140');
      return { id: i.id, emptyUnitChanged: 'ml -> g', stock: '20 g', costPerG: 7, import: '0.02 kg at 7000/kg = 140', usedUnitChangeStatus: 409, historicalSnapshotUnchanged: true, policy: 'Used base unit immutable; input units converted. No historical unit migration.' };
    });
    await scenario('NL-08', 'Inactive ingredient rejected in new recipe and activation; PATCH regression preserved', async () => {
      const i = await create('inactive', { baseUnit: 'ml', costPerBaseUnit: 7, minThreshold: 9 });
      const p = await product('inactive-product'); const r = ok(await recipe(p, i, 2, { activate: false }), 201);
      const before = await get(i.id); ok(await api('PATCH', `/ingredients/${i.id}`, { isActive: false }), 200);
      const after = await get(i.id); for (const key of ['baseUnit', 'costPerBaseUnit', 'minThreshold', 'quantity', 'reserved']) assert.equal(String(after[key]), String(before[key]));
      const recipesBefore = JSON.stringify(await db.recipe.findMany({ where: { productId: p.id }, include: { ingredients: true } }));
      ok(await recipe(p, i, 2), 404);
      ok(await api('POST', `/products/${p.id}/recipes/${r.id}/activate`, {}), 409);
      assert.equal(JSON.stringify(await db.recipe.findMany({ where: { productId: p.id }, include: { ingredients: true } })), recipesBefore);
      return { ingredientId: i.id, productId: p.id, inactiveRecipeRejected: 404, activationRejected: 409, recipesUnchanged: true, unit: after.baseUnit, cost: after.costPerBaseUnit.toString(), threshold: after.minThreshold.toString() };
    });
    await scenario('NL-09', 'Multiple products aggregate shared ingredient demand once; reserve/release/consume ledger correct', async () => {
      const i = await create('shared'); await imported(i, 100);
      const a = await product('shared-a'), b = await product('shared-b');
      ok(await recipe(a, i, 3), 201); ok(await recipe(b, i, 4), 201);
      for (const p of [a, b]) {
        const current = ok(await api('GET', `/products/${p.id}`), 200).product;
        ok(await api('PUT', `/products/${p.id}`, { expectedUpdatedAt: current.updatedAt, isActive: true }), 200);
      }
      const orderBody = { items: [{ productId: a.id, quantity: 2, toppings: [] }, { productId: b.id, quantity: 3, toppings: [] }], paymentMethod: 'CASH' };
      const order = ok(await api('POST', '/orders', orderBody), 201).order;
      let saved = await get(i.id); assert.equal(saved.quantity.toString(), '100'); assert.equal(saved.reserved.toString(), '18');
      const before = await snapshot(i.id); ok(await waste(i, 83), 400); assert.equal(await snapshot(i.id), before);
      ok(await api('PATCH', `/orders/${order.id}/status`, { status: 'CONFIRMED' }), 200);
      ok(await api('PATCH', `/orders/${order.id}/status`, { status: 'COMPLETED' }), 200);
      saved = await get(i.id); assert.equal(saved.quantity.toString(), '82'); assert.equal(saved.reserved.toString(), '0');
      const consumed = await db.inventoryTransaction.findMany({ where: { ingredientId: i.id, type: 'CONSUME' } });
      assert.equal(consumed.reduce((sum, t) => sum + Math.abs(Number(t.quantity)), 0), 18);
      const complete = await snapshot(i.id); const retry = await api('PATCH', `/orders/${order.id}/status`, { status: 'COMPLETED' });
      assert.ok([200, 400, 409].includes(retry.status)); assert.equal(await snapshot(i.id), complete);
      const batches = await db.ingredientBatch.findMany({ where: { ingredientId: i.id } });
      assert.equal(batches.reduce((n, batch) => n + Number(batch.quantityRemaining), 0), 82);
      const cancelled = ok(await api('POST', '/orders', orderBody), 201).order;
      assert.equal((await get(i.id)).reserved.toString(), '18');
      ok(await api('PATCH', `/orders/${cancelled.id}/status`, { status: 'CANCELLED' }), 200);
      assert.equal((await get(i.id)).quantity.toString(), '82'); assert.equal((await get(i.id)).reserved.toString(), '0');
      return { ingredientId: i.id, orderId: order.id, expectedDemand: '2*3 + 3*4 = 18 g', finalQuantity: 82, reserved: 0, completionRetryNoWrites: true, reservationProtected: true, cancellationReleased: true };
    });
    await scenario('NL-10', 'Authorized confirmed damage reduces batch/stock and writes audited WASTE ledger', async () => {
      const i = await create('damage'); await imported(i, 10);
      const result = ok(await waste(i, 3, {}, staff), 200);
      assert.equal(result.wastedQuantityBase, 3); assert.equal(result.totalWasteCost, 6);
      const saved = await get(i.id); assert.equal(saved.quantity.toString(), '7'); assert.equal(saved.reserved.toString(), '0');
      const batch = await db.ingredientBatch.findFirstOrThrow({ where: { ingredientId: i.id } }); assert.equal(batch.quantityRemaining.toString(), '7');
      const ledger = await db.inventoryTransaction.findMany({ where: { ingredientId: i.id, type: 'WASTE' } });
      assert.equal(ledger.length, 1); assert.equal(ledger[0].quantity.toString(), '-3'); assert.equal(ledger[0].wasteReason, 'DAMAGED'); assert.equal(ledger[0].referenceType, 'Waste'); assert.equal(ledger[0].performedBy, staffActor.id); assert.equal(ledger[0].totalCost.toString(), '6');
      const history = ok(await api('GET', `/ingredients/${i.id}/transactions`), 200); assert.ok(history.some(t => t.id === ledger[0].id && t.quantity === -3));
      return { id: i.id, role: 'STAFF', quantityBefore: 10, quantityAfter: 7, batchAfter: 7, ledgerId: ledger[0].id, reason: 'DAMAGED', cost: 6 };
    });
    await scenario('NL-11', 'ADMIN confirmed internal usage with purpose/recipient, atomic batch ledger and request idempotency', async () => {
      const i = await create('internal'); await imported(i, 10);
      const route = `/ingredients/${i.id}/internal-use`;
      const body = { requestId: randomUUID(), quantity: 3, unit: 'g', purpose: 'Barista training', recipient: 'Owned acceptance team' };
      const before = await snapshot(i.id);
      ok(await api('POST', route, body, staff), 403); assert.equal(await snapshot(i.id), before);
      ok(await api('POST', route, { ...body, purpose: '' }), 400); assert.equal(await snapshot(i.id), before);
      const result = ok(await api('POST', route, body), 200);
      assert.equal(result.consumedQuantityBase, 3); assert.equal(result.totalCost, 6); assert.equal(result.replayed, false);
      const saved = await get(i.id); assert.equal(saved.quantity.toString(), '7'); assert.equal(saved.reserved.toString(), '0');
      const batch = await db.ingredientBatch.findFirstOrThrow({ where: { ingredientId: i.id } }); assert.equal(batch.quantityRemaining.toString(), '7');
      const ledger = await db.inventoryTransaction.findMany({ where: { ingredientId: i.id, referenceType: 'InternalUsage', referenceId: body.requestId } });
      assert.equal(ledger.length, 1); assert.equal(ledger[0].type, 'CONSUME'); assert.equal(ledger[0].quantity.toString(), '-3'); assert.equal(ledger[0].totalCost.toString(), '6'); assert.equal(ledger[0].performedBy, actor.id);
      assert.deepEqual(JSON.parse(ledger[0].reason), { purpose: body.purpose, recipient: body.recipient, quantityBase: '3' });
      const committed = await snapshot(i.id);
      assert.equal(ok(await api('POST', route, body), 200).replayed, true); assert.equal(await snapshot(i.id), committed);
      ok(await api('POST', route, { ...body, recipient: 'different' }), 409); assert.equal(await snapshot(i.id), committed);
      ok(await api('POST', route, { ...body, requestId: randomUUID(), quantity: 8 }), 400); assert.equal(await snapshot(i.id), committed);
      ok(await api('POST', route, { ...body, requestId: randomUUID(), unit: 'ml' }), 400); assert.equal(await snapshot(i.id), committed);
      const history = ok(await api('GET', `/ingredients/${i.id}/transactions`), 200); assert.ok(history.some(t => t.id === ledger[0].id && t.quantity === -3 && t.referenceType === 'InternalUsage'));
      return { id: i.id, role: 'ADMIN', policy: 'User approved ADMIN confirmation; mandatory purpose/recipient; no separate approval.', quantityBefore: 10, quantityAfter: 7, batchAfter: 7, cost: 6, ledgerId: ledger[0].id, requestId: body.requestId, staffDenied: 403, replayNoWrites: true, changedPayloadConflict: 409, overconsumptionAndWrongUnitRollback: true };
    });
    await scenario('NL-12', 'Missing stock stays pending until ADMIN approval; batch and ledger atomic, approval idempotent', async () => {
      assert.ok(out.baseline[0].count_table && out.baseline[0].item_table, 'Existing stock count baseline missing');
      const i = await create('incident'); await imported(i, 10);
      const route = `/ingredients/${i.id}/incidents`, before = await snapshot(i.id);
      const incident = ok(await api('POST', route, { actualQuantity: 7, reason: run + ' verified missing during count' }, staff), 201);
      assert.equal(incident.status, 'PENDING'); assert.equal(await snapshot(i.id), before);
      const pending = await db.stockCount.findUniqueOrThrow({ where: { id: incident.id }, include: { items: true } });
      assert.equal(pending.status, 'PENDING'); assert.equal(pending.approvedById, null); assert.equal(pending.items[0].varianceQty.toString(), '-3');
      const approve = route + '/' + incident.id + '/approve';
      ok(await api('POST', approve, {}, staff), 403); assert.equal(await snapshot(i.id), before);
      const approved = ok(await api('POST', approve, {}), 200); assert.equal(approved.status, 'COMPLETED');
      const saved = await get(i.id); assert.equal(saved.quantity.toString(), '7'); assert.equal(saved.reserved.toString(), '0');
      const ledger = await db.inventoryTransaction.findMany({ where: { ingredientId: i.id, referenceId: incident.id } });
      assert.equal(ledger.length, 1); assert.equal(ledger[0].type, 'ADJUSTMENT'); assert.equal(ledger[0].quantity.toString(), '-3'); assert.equal(ledger[0].performedBy, actor.id);
      const batch = await db.ingredientBatch.findFirstOrThrow({ where: { ingredientId: i.id } }); assert.equal(batch.quantityRemaining.toString(), '7');
      const confirmed = await db.stockCount.findUniqueOrThrow({ where: { id: incident.id } }); assert.equal(confirmed.approvedById, actor.id); assert.ok(confirmed.approvedAt);
      const final = await snapshot(i.id); ok(await api('POST', approve, {}), 200); assert.equal(await snapshot(i.id), final);
      assert.equal(JSON.stringify(await db.stockCount.findUniqueOrThrow({ where: { id: incident.id } })), JSON.stringify(confirmed));
      ok(await api('GET', route + '/' + incident.id, undefined, staff), 200);
      // Stale count must not apply after an intervening stock movement.
      const stale = ok(await api('POST', route, { actualQuantity: 6, reason: 'stale count regression' }, staff), 201);
      await imported(i, 1); const beforeStale = await snapshot(i.id);
      ok(await api('POST', route + '/' + stale.id + '/approve', {}), 409); assert.equal(await snapshot(i.id), beforeStale);
      assert.equal((await db.stockCount.findUniqueOrThrow({ where: { id: stale.id } })).status, 'PENDING');
      return { id: i.id, incidentId: incident.id, pendingNoStockChange: true, staffApproval: 403, adminApproval: 200, adjustment: -3, batchAndLedgerMatched: true, repeatApprovalNoWrites: true, staleApproval: 409, finalQuantityAfterStaleSetup: 8 };
    });
  } catch (e) { out.runtimeError = e.message; console.log(JSON.stringify({ runtimeError: e.message })); process.exitCode = 2; }
  finally { await db.$disconnect(); fs.writeFileSync(process.env.INGREDIENT_EVIDENCE_FILE || (selected ? 'ingredient-complete-retest.json' : 'ingredient-complete-evidence.json'), JSON.stringify(out, null, 2)); }
  if (out.scenarios.some(s => s.verdict === 'FAIL')) process.exitCode = 1;
}
main().catch(e => { console.error(e.message); process.exitCode = 2; });
