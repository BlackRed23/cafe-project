// Opt-in NL-01..NL-04 only; reuses recipe/product cafedb HTTP harness pattern.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { randomUUID } = require('node:crypto');
require('dotenv').config({ path: 'apps/api/.env', quiet: true });
require('dotenv').config({ quiet: true });
const { PrismaClient } = require('@prisma/client');
const jwt = require('jsonwebtoken');
async function main() {
  assert.equal(process.env.INGREDIENT_CAFEDB_CONFIRMED, 'YES');
  const url = new URL(process.env.DATABASE_URL);
  assert.equal(url.pathname, '/cafedb');
  url.hostname = '127.0.0.1'; url.port = '55432';
  const db = new PrismaClient({ datasources: { db: { url: url.toString() } } });
  const run = 'nl-a-' + randomUUID();
  const out = { run, time: new Date().toISOString(), scenarios: [], requests: [] };
  let token, ingredient, seq = 0;
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
  const row = () => db.ingredient.findUniqueOrThrow({ where: { sku: run } });
  const stock = async () => {
    const i = await row();
    return JSON.stringify({ quantity: i.quantity, reserved: i.reserved,
      batches: await db.ingredientBatch.findMany({ where: { ingredientId: i.id }, orderBy: { id: 'asc' } }),
      transactions: await db.inventoryTransaction.findMany({ where: { ingredientId: i.id }, orderBy: { id: 'asc' } }) });
  };
  const scenario = async (id, fn) => {
    const start = seq;
    try { out.scenarios.push({ id, verdict: 'PASS', assertion: await fn(), evidence: out.requests.slice(start).map(r => r.id) }); }
    catch (e) { out.scenarios.push({ id, verdict: 'FAIL', error: e.message, evidence: out.requests.slice(start).map(r => r.id) }); }
    console.log(JSON.stringify(out.scenarios.at(-1)));
  };
  try {
    out.database = await db.$queryRaw`SELECT current_database() AS database, version() AS version`;
    const actor = await db.user.findFirstOrThrow({ where: { role: 'ADMIN' }, select: { id: true, email: true, role: true } });
    token = jwt.sign(actor, process.env.JWT_SECRET, { expiresIn: '20m' });
    out.authentication = 'Locally signed short-lived existing ADMIN token; real auth middleware. Login not tested; no credentials exported.';
    await scenario('NL-01', async () => {
      assert.equal(await db.ingredient.count({ where: { sku: run } }), 0);
      ingredient = ok(await api('POST', '/ingredients', { sku: run, name: run + '-coffee', baseUnit: 'g', costPerBaseUnit: 2 }), 201);
      const read = ok(await api('GET', '/ingredients/' + ingredient.id), 200), saved = await row();
      for (const key of ['id', 'sku', 'name', 'baseUnit']) { assert.equal(read[key], ingredient[key]); assert.equal(saved[key], ingredient[key]); }
      assert.equal(await db.ingredient.count({ where: { sku: run } }), 1);
      return { id: ingredient.id, sku: run, name: saved.name, baseUnit: saved.baseUnit, records: 1 };
    });
    await scenario('NL-02', async () => {
      const before = JSON.stringify(await row());
      ok(await api('POST', '/ingredients', { sku: run, name: run + '-duplicate', baseUnit: 'ml' }), 409);
      assert.equal(await db.ingredient.count({ where: { sku: run } }), 1);
      assert.equal(JSON.stringify(await row()), before);
      return { duplicateStatus: 409, records: 1, originalUnchanged: true };
    });
    await scenario('NL-03', async () => {
      const before = await stock();
      assert.equal(ok(await api('PATCH', '/ingredients/' + ingredient.id, { minThreshold: 10.125 }), 200).minThreshold, 10.125);
      assert.equal(ok(await api('GET', '/ingredients/' + ingredient.id), 200).minThreshold, 10.125);
      assert.equal((await row()).minThreshold.toString(), '10.125');
      const configured = JSON.stringify(await row());
      ok(await api('PATCH', '/ingredients/' + ingredient.id, { minThreshold: -1 }), 400);
      assert.equal(JSON.stringify(await row()), configured); assert.equal(await stock(), before);
      return { threshold: 10.125, negativeStatus: 400, stockBatchesTransactionsUnchanged: true };
    });
    await scenario('NL-04', async () => {
      const route = '/ingredients/' + ingredient.id;
      assert.equal(ok(await api('GET', route), 200).status, 'OUT_OF_STOCK');
      const imported = ok(await api('POST', route + '/import', { quantity: 5, unit: 'g', unitCost: 2, batchCode: run, expirationDate: '2099-01-01' }), 200);
      assert.equal(imported.ingredient.quantity, 5);
      const before = await stock(), boundaries = [];
      for (const [threshold, status, included] of [[10, 'LOW_STOCK', true], [5, 'LOW_STOCK', true], [4.999, 'IN_STOCK', false]]) {
        const updated = ok(await api('PATCH', route, { minThreshold: threshold }), 200);
        const read = ok(await api('GET', route), 200);
        const list = ok(await api('GET', '/ingredients?lowStock=true&search=' + encodeURIComponent(run)), 200);
        assert.equal(updated.status, status); assert.equal(read.status, status); assert.equal(read.availableQuantity, 5);
        assert.equal(list.some(i => i.id === ingredient.id), included);
        assert.equal((await row()).minThreshold.toString(), String(threshold));
        assert.equal(await stock(), before);
        boundaries.push({ available: 5, threshold, status, included });
      }
      ok(await api('PATCH', route, { minThreshold: 10 }), 200);
      const saved = await row(); assert.equal(saved.quantity.toString(), '5'); assert.equal(saved.reserved.toString(), '0');
      assert.equal(await db.ingredientBatch.count({ where: { ingredientId: ingredient.id } }), 1);
      assert.equal(await db.inventoryTransaction.count({ where: { ingredientId: ingredient.id, type: 'IMPORT' } }), 1);
      return { boundaries, zeroStatus: 'OUT_OF_STOCK', stockUnchangedByThreshold: true, signal: 'DTO status and lowStock=true list', finalThreshold: 10 };
    });
    ok(await api('GET', '/ingredients/' + ingredient.id, undefined, null), 401);
    const staff = await db.user.findFirst({ where: { role: 'STAFF' }, select: { id: true, email: true, role: true } });
    if (staff) {
      const access = jwt.sign(staff, process.env.JWT_SECRET, { expiresIn: '20m' });
      ok(await api('GET', '/ingredients/' + ingredient.id, undefined, access), 200);
      ok(await api('POST', '/ingredients', { sku: run + '-staff', name: run, baseUnit: 'g' }, access), 403);
      ok(await api('PATCH', '/ingredients/' + ingredient.id, { minThreshold: 100 }, access), 403);
      assert.equal(await db.ingredient.count({ where: { sku: run + '-staff' } }), 0);
      assert.equal((await row()).minThreshold.toString(), '10');
    }
    out.staffGuardChecked = Boolean(staff);
    out.notRun = Array.from({ length: 8 }, (_, i) => 'NL-' + String(i + 5).padStart(2, '0'));
  } catch (e) { out.runtimeError = e.message; console.log(JSON.stringify({ runtimeError: e.message })); process.exitCode = 2; }
  finally { await db.$disconnect(); fs.writeFileSync('ingredient-batch-a-evidence.json', JSON.stringify(out, null, 2)); }
  if (out.scenarios.some(s => s.verdict !== 'PASS')) process.exitCode = 1;
}
main().catch(e => { console.error(e.message); process.exitCode = 2; });
