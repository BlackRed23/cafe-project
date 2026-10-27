const assert = require('node:assert/strict');
const { test } = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
function load(file, deps = {}) {
 const exports = {};
 vm.runInNewContext(ts.transpileModule(fs.readFileSync(path.resolve(__dirname, '../../..', file), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }).outputText, { exports, Date, Number, Math, require: name => { if (name in deps) return deps[name]; throw Error(name); } });
 return exports;
}
const component = load('apps/web/src/components/admin/AdjustmentBatchSelect.tsx', { 'react/jsx-runtime': require('react/jsx-runtime') });
const batches = [
 { id: 'valid', batchCode: 'VALID', quantity: 3, expirationDate: '2099-01-01' },
 { id: 'empty', batchCode: 'EMPTY', quantity: 0, expirationDate: '2099-01-01' },
 { id: 'expired', quantity: 5, expirationDate: '2020-01-01' },
 { id: 'invalid', quantity: 5, expirationDate: 'bad' }
];
test('batch selector excludes expired/invalid batches, permits counted zero batch and requires explicit selection', () => {
 assert.deepEqual(Array.from(component.eligibleAdjustmentBatches({ batches }), b => b.id), ['valid', 'empty']);
 const html = require('react-dom/server').renderToStaticMarkup(component.AdjustmentBatchSelect({ inventory: { batches }, value: '', onChange() {} }));
 assert.match(html, /required/); assert.match(html, /VALID/); assert.match(html, /Tồn: 3/); assert.doesNotMatch(html, /value="expired"/);
 const empty = require('react-dom/server').renderToStaticMarkup(component.AdjustmentBatchSelect({ inventory: {}, value: '', onChange() {} }));
 assert.match(empty, /role="alert"/); assert.match(empty, /Không có lô/);
});
test('web API sends explicit batch ID and signed delta; missing batch never posts', async () => {
 const calls = [];
 const { inventoryApi } = load('apps/web/src/api/inventory.api.ts', { './client': {
  apiClient: { get: async () => ({ data: [{ id: 'inv', productId: 'p', quantity: 20 }] }), post: async (url, body) => { calls.push({ url, body }); return { data: { quantity: 18 } }; } },
  unwrapApiData: x => x, unwrapApiList: x => x
 } });
 await inventoryApi.adjustInventory({ productId: 'p', batchId: 'valid', quantity: -2 });
 assert.equal(calls[0].body.inventoryId, 'inv'); assert.equal(calls[0].body.batchId, 'valid'); assert.equal(calls[0].body.quantity, -2);
 await assert.rejects(inventoryApi.adjustInventory({ productId: 'p', quantity: 2 })); assert.equal(calls.length, 1);
});
for (const file of ['AdminInventoryPage', 'AdminInventoryDetailPage']) test(`${file} connects batch selector and submits batch count delta`, () => {
 const src = fs.readFileSync(path.resolve(__dirname, `../../web/src/pages/admin/${file}.tsx`), 'utf8');
 assert.match(src, /<AdjustmentBatchSelect/); assert.match(src, /inputValue - batch.quantity/); assert.match(src, /batchId: adjustmentBatchId/);
});
function simulationFixture({ reservedStock = 5, batchId = 'b' } = {}) {
 let state = { quantity: 20, reservedStock, batch: 20, history: [] };
 const locks = [];
 const original = { id: 'sale', productId: 'p', type: 'SIMULATE_SALE', quantity: -3, batchId };
 const prisma = { async $transaction(callback) {
  const draft = structuredClone(state);
  const current = () => ({ id: 'inv', productId: 'p', quantity: draft.quantity, reservedStock: draft.reservedStock, product: { name: 'P' } });
  const tx = {
   $queryRaw: async (_sql, id) => { locks.push(id); return [{ id }]; },
   inventory: { findUnique: async () => current(), update: async ({ data }) => { assert.ok(locks.length); assert.equal(typeof data.quantity, 'object'); draft.quantity += (data.quantity.increment ?? -data.quantity.decrement); return current(); } },
   inventoryBatch: { findMany: async () => [{ id: 'b', quantity: draft.batch }], findFirst: async () => batchId ? { id: 'b' } : null, update: async ({ data }) => { draft.batch += data.quantity.increment ?? -data.quantity.decrement; } },
   inventoryTransaction: { findUnique: async () => original, findFirst: async () => draft.history.find(h => h.reason?.includes('[restore-of:sale]')) ?? null, create: async ({ data }) => { draft.history.push(data); return { id: 'movement', ...data }; } }
  };
  const result = await callback(tx); state = draft; return result;
 } };
 const { HttpError } = load('apps/api/src/common/http-error.ts');
 const { simulateSaleRepository } = load('apps/api/src/modules/simulate-sale/simulate-sale.repository.ts', { '@cafe-project/database': { prisma, InventoryTransactionType: { SIMULATE_SALE: 'SIMULATE_SALE', ADJUSTMENT: 'ADJUSTMENT' } }, '../../common/http-error': { HttpError } });
 return { repo: simulateSaleRepository, state: () => state, locks };
}
test('simulation uses fresh quantity, preserves reservations and restores original batch exactly once (mock)', async () => {
 const f = simulationFixture();
 await f.repo.applyProductSale({ id: 'inv', quantity: 999 }, 3, null, 'admin');
 assert.equal(f.state().quantity, 17); assert.equal(f.state().batch, 17); assert.equal(f.state().reservedStock, 5);
 await f.repo.restoreSale('sale', 'admin');
 assert.equal(f.state().quantity, 20); assert.equal(f.state().batch, 20); assert.equal(f.state().history[1].batchId, 'b');
 await assert.rejects(f.repo.restoreSale('sale', 'admin')); assert.equal(f.state().quantity, 20);
});
test('simulation cannot consume reserved stock or restore a legacy movement with no source batch', async () => {
 const f = simulationFixture({ reservedStock: 19 });
 await assert.rejects(f.repo.applyProductSale({ id: 'inv' }, 2, null, 'admin')); assert.equal(f.state().quantity, 20);
 const legacy = simulationFixture({ batchId: null });
 await assert.rejects(legacy.repo.restoreSale('sale', 'admin')); assert.equal(legacy.state().quantity, 20);
});
test('multi-product simulation reads fresh stock rather than stale plan quantities', async () => {
 const f = simulationFixture();
 await f.repo.applySale([{ inventory: { id: 'inv', productId: 'p', product: { name: 'P' }, quantity: 999 }, decrease: 4 }], null, 'admin');
 assert.equal(f.state().quantity, 16); assert.equal(f.state().batch, 16); assert.equal(f.state().reservedStock, 5);
});
for (const nextStatus of ['COMPLETED', 'CANCELLED']) test(`order ${nextStatus} uses atomic reserved/stock deltas and rejects stale status (mock)`, async () => {
 let state = { quantity: 20, reservedStock: 5, batch: 20, status: 'PROCESSING', history: [] };
 const prisma = { async $transaction(callback) {
  const d = structuredClone(state);
  const tx = {
   order: { updateMany: async ({ where, data }) => { if (where.status !== d.status) return { count: 0 }; d.status = data.status; return { count: 1 }; }, findUnique: async () => ({ status: d.status }) },
   inventory: { findUnique: async () => ({ id: 'inv', quantity: 999, reservedStock: 999 }), updateMany: async ({ data }) => { if (data.quantity) { assert.equal(data.quantity.decrement, 3); d.quantity -= 3; } assert.equal(data.reservedStock.decrement, 3); d.reservedStock -= 3; return { count: 1 }; } },
   inventoryBatch: { findMany: async () => [{ id: 'b', quantity: d.batch }], updateMany: async ({ data }) => { d.batch -= data.quantity.decrement; return { count: 1 }; } },
   inventoryTransaction: { create: async ({ data }) => { d.history.push(data); } }
  };
  const result = await callback(tx); state = d; return result;
 } };
 const { orderRepository } = load('apps/api/src/modules/order/order.repository.ts', { '@cafe-project/database': { prisma, InventoryTransactionType: { ORDER: 'ORDER', CANCEL: 'CANCEL' }, OrderStatus: { PENDING: 'PENDING', PROCESSING: 'PROCESSING', COMPLETED: 'COMPLETED', CANCELLED: 'CANCELLED' } }, './shipping.service': {}, '../agent/agent.client': { scanInventoryViaAgentService: async () => {} } });
 const stale = { id: 'order', status: 'PROCESSING', stockDeductedAt: null, items: [{ productId: 'p', quantity: 3 }] };
 await orderRepository.updateStatus(stale, nextStatus, 'admin');
 assert.equal(state.quantity, nextStatus === 'COMPLETED' ? 17 : 20); assert.equal(state.batch, state.quantity); assert.equal(state.reservedStock, 2); assert.equal(state.history.length, 1);
 await assert.rejects(orderRepository.updateStatus(stale, nextStatus, 'admin')); assert.equal(state.history.length, 1);
});
