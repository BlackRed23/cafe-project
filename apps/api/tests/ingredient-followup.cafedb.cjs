// Reuse existing owned fixtures for impacted Batch A and incident reservation guards.
const assert = require('node:assert/strict');
const fs = require('node:fs');
require('dotenv').config({ path: 'apps/api/.env', quiet: true }); require('dotenv').config({ quiet: true });
const { PrismaClient } = require('@prisma/client'); const jwt = require('jsonwebtoken');
async function main() {
  assert.equal(process.env.INGREDIENT_CAFEDB_CONFIRMED, 'YES');
  const url = new URL(process.env.DATABASE_URL); assert.equal(url.pathname, '/cafedb'); url.hostname = '127.0.0.1'; url.port = '55432';
  const db = new PrismaClient({ datasources: { db: { url: url.toString() } } });
  const a = JSON.parse(fs.readFileSync('ingredient-batch-a-evidence.json', 'utf8'));
  const b = JSON.parse(fs.readFileSync('ingredient-complete-retest.json', 'utf8'));
  const out = { time: new Date().toISOString(), requests: [], assertions: [] };
  try {
    const actor = await db.user.findFirstOrThrow({ where: { role: 'ADMIN', isActive: true }, select: { id: true, email: true, role: true } });
    const token = jwt.sign(actor, process.env.JWT_SECRET, { expiresIn: '10m' });
    const api = async (method, route, body, expected) => {
      const r = await fetch('http://127.0.0.1:5002/api' + route, { method, signal: AbortSignal.timeout(20000),
        headers: { 'content-type': 'application/json', authorization: 'Bearer ' + token }, body: body === undefined ? undefined : JSON.stringify(body) });
      const response = await r.json(); out.requests.push({ method, route, request: body, status: r.status, response });
      assert.equal(r.status, expected, JSON.stringify(response)); return response.data;
    };
    const original = a.scenarios[0].assertion, route = '/ingredients/' + original.id;
    const before = await db.ingredient.findUniqueOrThrow({ where: { id: original.id } });
    const read = await api('GET', route, undefined, 200);
    for (const key of ['id', 'sku', 'name', 'baseUnit']) assert.equal(read[key], original[key]);
    await api('POST', '/ingredients', { sku: original.sku, name: 'duplicate followup', baseUnit: 'ml' }, 409);
    assert.equal(await db.ingredient.count({ where: { sku: original.sku } }), 1);
    assert.equal(JSON.stringify(await db.ingredient.findUniqueOrThrow({ where: { id: original.id } })), JSON.stringify(before));
    await api('PATCH', route, { minThreshold: 12.125 }, 200);
    const after = await db.ingredient.findUniqueOrThrow({ where: { id: original.id } });
    for (const key of Object.keys(before).filter(k => !['minThreshold', 'rowVersion', 'updatedAt'].includes(k))) assert.equal(JSON.stringify(after[key]), JSON.stringify(before[key]), key);
    assert.equal(after.minThreshold.toString(), '12.125'); assert.equal((await api('GET', route, undefined, 200)).minThreshold, 12.125);
    await api('PATCH', route, { minThreshold: -1 }, 400);
    assert.equal(JSON.stringify(await db.ingredient.findUniqueOrThrow({ where: { id: original.id } })), JSON.stringify(after));
    for (const [threshold, status, included] of [[5, 'LOW_STOCK', true], [4.999, 'IN_STOCK', false]]) {
      await api('PATCH', route, { minThreshold: threshold }, 200);
      const current = await api('GET', route, undefined, 200); assert.equal(current.status, status); assert.equal(current.quantity, 5);
      const list = await api('GET', '/ingredients?lowStock=true&search=' + original.sku, undefined, 200);
      assert.equal(list.some(i => i.id === original.id), included);
    }
    await api('PATCH', route, { minThreshold: 10 }, 200);
    out.assertions.push('NL-01..NL-04 reused fixture post-fix PASS; all omitted fields preserved, duplicate/negative rejection and boundaries still correct.');
    const sharedId = b.scenarios.find(s => s.id === 'NL-09').actual.ingredientId;
    const p = await db.recipe.findFirstOrThrow({ where: { ingredients: { some: { ingredientId: sharedId } }, isActive: true }, select: { productId: true } });
    const order = (await api('POST', '/orders', { items: [{ productId: p.productId, quantity: 1, toppings: [] }], paymentMethod: 'CASH' }, 201)).order;
    const stock = async () => JSON.stringify({ ingredient: await db.ingredient.findUniqueOrThrow({ where: { id: sharedId } }),
      batches: await db.ingredientBatch.findMany({ where: { ingredientId: sharedId }, orderBy: { id: 'asc' } }),
      ledger: await db.inventoryTransaction.findMany({ where: { ingredientId: sharedId }, orderBy: { id: 'asc' } }) });
    const snap = await stock(), incidentRoute = '/ingredients/' + sharedId + '/incidents';
    const incident = await api('POST', incidentRoute, { actualQuantity: 0, reason: 'Owned reservation guard regression count' }, 201);
    assert.equal(await stock(), snap);
    await api('POST', incidentRoute + '/' + incident.id + '/approve', {}, 409); assert.equal(await stock(), snap);
    assert.equal((await db.stockCount.findUniqueOrThrow({ where: { id: incident.id } })).status, 'PENDING');
    await api('POST', incidentRoute, { actualQuantity: -1, reason: 'invalid' }, 400); assert.equal(await stock(), snap);
    await api('GET', route + '/incidents/' + incident.id, undefined, 404);
    await api('PATCH', '/orders/' + order.id + '/status', { status: 'CANCELLED' }, 200);
    assert.equal((await db.ingredient.findUniqueOrThrow({ where: { id: sharedId } })).reserved.toString(), '0');
    out.assertions.push('Incident approval protects reserved stock; failed approval/invalid count leave ingredient/batch/ledger unchanged; wrong owner read 404; temporary order reservation cancelled.');
    out.verdict = 'PASS'; console.log(JSON.stringify({ verdict: out.verdict, http: out.requests.length, assertions: out.assertions }));
  } catch (e) { out.verdict = 'FAIL'; out.error = e.message; console.error(e.message); process.exitCode = 1; }
  finally { await db.$disconnect(); fs.writeFileSync(process.env.INGREDIENT_EVIDENCE_FILE || 'ingredient-followup-evidence.json', JSON.stringify(out, null, 2)); }
}
main().catch(e => { console.error(e.message); process.exitCode = 2; });
