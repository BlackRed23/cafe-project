// Opt-in Batch A only. HTTP mutations; Prisma read assertions against existing cafedb.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { randomUUID } = require('node:crypto');
require('dotenv').config({ path: 'apps/api/.env', quiet: true });
require('dotenv').config({ quiet: true });
const { PrismaClient } = require('@prisma/client');
const jwt = require('jsonwebtoken');
async function main() {
  assert.equal(process.env.RECIPE_CAFEDB_CONFIRMED, 'YES');
  const url = new URL(process.env.DATABASE_URL);
  assert.equal(url.pathname, '/cafedb');
  url.hostname = '127.0.0.1'; url.port = '55432';
  const db = new PrismaClient({ datasources: { db: { url: url.toString() } } });
  const run = 'ct-a-' + randomUUID();
  const out = { run, time: new Date().toISOString(), scenarios: [], requests: [] };
  let token, seq = 0;
  const api = async (method, route, body, access = token) => {
    const r = await fetch('http://127.0.0.1:5000/api' + route, {
      method, signal: AbortSignal.timeout(15000),
      headers: { 'content-type': 'application/json', ...(access ? { authorization: 'Bearer ' + access } : {}) },
      body: body === undefined ? undefined : JSON.stringify(body)
    });
    const response = await r.json();
    const entry = { id: 'E' + (++seq), method, route, request: body, status: r.status, response };
    out.requests.push(entry); return entry;
  };
  const ok = (r, status) => { assert.equal(r.status, status, `${r.id}: ${JSON.stringify(r.response)}`); return r.response.data; };
  const scenario = async (id, fn) => {
    const start = seq;
    try { const assertion = await fn(); out.scenarios.push({ id, verdict: 'PASS', evidence: out.requests.slice(start).map(r => r.id), assertion }); }
    catch (e) { out.scenarios.push({ id, verdict: 'FAIL', evidence: out.requests.slice(start).map(r => r.id), error: e.message }); }
    console.log(JSON.stringify(out.scenarios.at(-1)));
  };
  try {
    out.database = await db.$queryRaw`SELECT current_database() AS database, version() AS version`;
    const actor = await db.user.findFirstOrThrow({ where: { role: 'ADMIN' }, select: { id: true, email: true, role: true } });
    token = jwt.sign(actor, process.env.JWT_SECRET, { expiresIn: '20m' });
    out.authentication = 'Short-lived locally signed token for existing ADMIN; real HTTP middleware/current-account lookup. No login test or credentials exported.';
    const category = await db.category.findFirstOrThrow({ select: { id: true } });
    const coffee = ok(await api('POST', '/ingredients', { name: run + '-coffee', sku: run + '-g', baseUnit: 'g', costPerBaseUnit: 2 }), 201);
    const milk = ok(await api('POST', '/ingredients', { name: run + '-milk', sku: run + '-ml', baseUnit: 'ml', costPerBaseUnit: 3 }), 201);
    assert.ok(coffee.id); assert.ok(milk.id);
    for (const ing of [coffee, milk]) ok(await api('POST', `/ingredients/${ing.id}/import`, { quantity: 10000, unit: ing.baseUnit, unitCost: ing.baseUnit === 'g' ? 2 : 3, batchCode: run, expirationDate: '2099-01-01' }), 200);
    const product = ok(await api('POST', '/products', { name: run, sku: run, price: 50000, categoryId: category.id, isActive: false, requiresRecipe: true }), 201).product;
    const route = `/products/${product.id}/recipes`;
    const body = quantity => ({ yieldQuantity: 1, ingredients: [{ ingredientId: coffee.id, quantity, unit: 'g' }] });
    const stock = () => db.ingredient.findMany({ where: { id: { in: [coffee.id, milk.id] } }, select: { id: true, quantity: true, reserved: true }, orderBy: { id: 'asc' } });
    const recipes = () => db.recipe.findMany({ where: { productId: product.id }, include: { ingredients: true }, orderBy: { version: 'asc' } });
    const snap = value => JSON.stringify(value);
    let first, second;
    await scenario('CT-01', async () => {
      const before = snap(await stock()); first = ok(await api('POST', route, body(10)), 201);
      assert.equal(first.productId, product.id); assert.equal(first.version, 1);
      const saved = (await recipes())[0];
      assert.equal(saved.productId, product.id); assert.equal(saved.version, 1);
      assert.equal(saved.ingredients[0].ingredientId, coffee.id); assert.equal(saved.ingredients[0].quantity.toString(), '10'); assert.equal(saved.ingredients[0].unit, 'g');
      const read = ok(await api('GET', route), 200); assert.equal(read[0].id, first.id); assert.equal(read[0].ingredients[0].quantity, 10);
      assert.equal(snap(await stock()), before);
      return { productId: product.id, recipeId: first.id, version: 1, quantity: '10 g', inventoryUnchanged: true };
    });
    await scenario('CT-02', async () => {
      assert.ok(first);
      const current = ok(await api('GET', `/products/${product.id}`), 200).product;
      ok(await api('PUT', `/products/${product.id}`, { expectedUpdatedAt: current.updatedAt, isActive: true }), 200);
      const order = ok(await api('POST', '/orders', { items: [{ productId: product.id, quantity: 2, toppings: [] }], paymentMethod: 'CASH' }), 201).order;
      ok(await api('PATCH', `/orders/${order.id}/status`, { status: 'CONFIRMED' }), 200);
      const history = () => db.order.findUniqueOrThrow({ where: { id: order.id }, include: { items: { include: { toppings: true } } } });
      const beforeHistory = snap(await history()); const old = (await recipes())[0];
      second = ok(await api('POST', route, body(20)), 201);
      assert.equal(second.version, 2); const all = await recipes(); assert.equal(all.length, 2);
      assert.equal(all[0].id, old.id); assert.equal(snap(all[0].ingredients), snap(old.ingredients));
      for (const key of ['productId', 'version', 'yieldQuantity', 'laborCost', 'overheadCost', 'note', 'createdAt']) assert.equal(snap(all[0][key]), snap(old[key]));
      assert.equal(all[0].isActive, false); assert.ok(all[0].effectiveTo); assert.equal(all[1].ingredients[0].quantity.toString(), '20');
      assert.equal(snap(await history()), beforeHistory); const item = (await history()).items[0]; assert.equal(item.recipeId, first.id); assert.equal(item.recipeVersion, 1);
      assert.equal(ok(await api('GET', route + '/active'), 200).id, second.id);
      return { oldRecipeId: first.id, newRecipeId: second.id, orderId: order.id, recipeContentUnchanged: true, confirmedHistoryUnchanged: true, lifecycleChange: 'v1 inactive/effectiveTo set; v2 active' };
    });
    await scenario('CT-03', async () => {
      const before = snap(await recipes());
      ok(await api('POST', route, { ingredients: [] }), 400);
      ok(await api('POST', route, { ingredients: [{ ingredientId: 'missing-' + run, quantity: 10, unit: 'g' }] }), 404);
      assert.equal(snap(await recipes()), before);
      const empty = ok(await api('POST', '/products', { name: run + '-empty', sku: run + '-empty', categoryId: category.id, price: 100, requiresRecipe: true, isActive: false }), 201).product;
      ok(await api('POST', `/products/${empty.id}/recipes`, { ingredients: [] }), 400);
      ok(await api('POST', '/orders', { items: [{ productId: empty.id, quantity: 1, toppings: [] }], paymentMethod: 'CASH' }), 409);
      assert.equal(await db.recipe.count({ where: { productId: empty.id } }), 0); assert.equal(await db.orderItem.count({ where: { productId: empty.id } }), 0);
      return { emptyRejected: true, unknownIngredientRejected: true, recipeSnapshotUnchanged: true, recipeRequiredSaleRejected: true, invalidActiveRows: 0, saleGuard: 'inactive product rejected; active-invalid guard reused from SP-10, no SQL fixture writes' };
    });
    await scenario('CT-04', async () => {
      const before = snap(await recipes());
      for (const quantity of [0, -1]) ok(await api('POST', route, body(quantity)), 400);
      const empty = ok(await api('POST', '/products', { name: run + '-zero', sku: run + '-zero', categoryId: category.id, price: 100, requiresRecipe: true, isActive: false }), 201).product;
      for (const quantity of [0, -1]) ok(await api('POST', `/products/${empty.id}/recipes`, body(quantity)), 400);
      assert.equal(await db.recipe.count({ where: { productId: empty.id } }), 0); assert.equal(snap(await recipes()), before);
      return { createAndNewVersionZeroNegativeRejected: true, persistedRecipeSnapshotUnchanged: true };
    });
    await scenario('CT-05', async () => {
      const converted = { yieldQuantity: 1, ingredients: [{ ingredientId: coffee.id, quantity: 0.5, unit: 'kg' }, { ingredientId: milk.id, quantity: 1.5, unit: 'l' }] };
      const preview = ok(await api('POST', route + '/cost-preview', converted), 200);
      const version = ok(await api('POST', route, converted), 201);
      const saved = await db.recipe.findUniqueOrThrow({ where: { id: version.id }, include: { ingredients: true } });
      assert.equal(saved.ingredients.find(i => i.ingredientId === coffee.id).quantityBase.toString(), '500');
      assert.equal(saved.ingredients.find(i => i.ingredientId === milk.id).quantityBase.toString(), '1500');
      assert.equal(version.ingredients.find(i => i.ingredientId === coffee.id).quantityBase, 500); assert.equal(version.ingredients.find(i => i.ingredientId === milk.id).quantityBase, 1500);
      assert.equal(preview.ingredientsCost, 5500);
      const baseline = snap(await recipes());
      for (const [id, unit] of [[coffee.id, 'ml'], [milk.id, 'g']]) {
        const invalid = { ingredients: [{ ingredientId: id, quantity: 1, unit }] };
        ok(await api('POST', route, invalid), 400); ok(await api('POST', route + '/cost-preview', invalid), 400);
      }
      assert.equal(snap(await recipes()), baseline);
      const before = await stock();
      const order = ok(await api('POST', '/orders', { items: [{ productId: product.id, quantity: 2, toppings: [] }], paymentMethod: 'CASH' }), 201).order;
      const after = await stock();
      for (const [id, need] of [[coffee.id, 1000], [milk.id, 3000]]) {
        const old = before.find(i => i.id === id), now = after.find(i => i.id === id);
        assert.equal(Number(now.reserved) - Number(old.reserved), need); assert.equal(now.quantity.toString(), old.quantity.toString());
      }
      ok(await api('PATCH', `/orders/${order.id}/status`, { status: 'CANCELLED' }), 200);
      assert.equal(snap(await stock()), snap(before));
      return { recipeId: version.id, coffeeBase: '500 g', milkBase: '1500 ml', cost: 5500, twoServingDemand: { g: 1000, ml: 3000 }, crossDimensionRejected: true, cancelledReservationReleased: true };
    });
    // Supplementary boundary probes: unauthenticated access and activation.
    ok(await api('GET', route, undefined, null), 401);
    if (second) {
      ok(await api('POST', `${route}/${second.id}/activate`, {}), 200);
      const active = (await recipes()).filter(r => r.isActive);
      assert.equal(active.length, 1); assert.equal(active[0].id, second.id);
    }
    ok(await api('POST', `${route}/missing-${run}/activate`, {}), 404);
    const staff = await db.user.findFirst({ where: { role: 'STAFF' }, select: { id: true, email: true, role: true } });
    if (staff) {
      const access = jwt.sign(staff, process.env.JWT_SECRET, { expiresIn: '20m' });
      ok(await api('GET', route, undefined, access), 200);
      ok(await api('POST', route + '/cost-preview', body(10), access), 200);
      ok(await api('POST', route, body(10), access), 403);
      ok(await api('POST', `${route}/${first.id}/activate`, {}, access), 403);
    }
    out.supplementary = { activeVersionDatabaseChecked: true, staffGuardChecked: Boolean(staff) };
  } catch (e) { out.runtimeError = e.message; console.log(JSON.stringify({ runtimeError: e.message })); process.exitCode = 2; }
  finally { await db.$disconnect(); fs.writeFileSync('recipe-batch-a-evidence.json', JSON.stringify(out, null, 2)); }
  if (out.scenarios.some(s => s.verdict !== 'PASS')) process.exitCode = 1;
}
main().catch(e => { console.error(e.message); process.exitCode = 2; });
