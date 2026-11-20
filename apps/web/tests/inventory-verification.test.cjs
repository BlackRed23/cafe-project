const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
const path = require('node:path');
function load(file, mocks = {}) {
  const module = { exports: {} };
  const code = ts.transpileModule(fs.readFileSync(path.resolve(__dirname, '..', file), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true },
  }).outputText;
  new Function('require', 'module', 'exports', code)(name => {
    assert.ok(name in mocks, name); return mocks[name];
  }, module, module.exports);
  return module.exports;
}
test('Inventory endpoints and envelopes match backend; authorization remains backend-controlled', async () => {
  const calls = []; let result;
  const client = Object.fromEntries(['get', 'post'].map(verb => [verb, async (...args) => {
    calls.push([verb, ...args]); return { data: { success: true, data: result } };
  }]));
  const api = load('src/api/ingredients.api.ts', { './client': { apiClient: client, unwrapApiData: v => v.data } }).ingredientsApi;
  const body = { requestId: 'uuid', batchId: 'lot', measuredQuantity: 8, reason: 'Kiểm đếm' };
  result = { request: { id: 'c', status: 'PENDING', code: 'ING-ADJUST-uuid' }, replayed: false };
  assert.equal((await api.createAdjustment('i/1', body)).request.status, 'PENDING');
  assert.deepEqual(calls.at(-1), ['post', '/ingredients/i%2F1/adjustments', body]);
  result = { id: 'c', status: 'PENDING' };
  await api.getAdjustment('i/1', 'uuid/2');
  assert.equal(calls.at(-1)[1], '/ingredients/i%2F1/adjustments/uuid%2F2');
  result = { request: { id: 'c', status: 'COMPLETED' }, replayed: false };
  await api.approveAdjustment('i', 'uuid');
  assert.deepEqual(calls.at(-1), ['post', '/ingredients/i/adjustments/uuid/approve', {}]);
  result = { id: 'c', status: 'CANCELLED' };
  assert.equal((await api.rejectAdjustment('i', 'uuid')).status, 'CANCELLED');
  result = { ledgerBaseline: 'UNVERIFIED', ledgerDifferenceIsDefinitive: false };
  assert.equal((await api.getReconciliation('i')).ledgerBaseline, 'UNVERIFIED');
  result = { transaction: { id: 'new' }, originalTransactionId: 'old', replayed: false };
  assert.equal((await api.correctTransaction('i', 'old/x', { requestId: 'uuid', reason: 'Sai' })).originalTransactionId, 'old');
  assert.equal(calls.at(-1)[1], '/ingredients/i/transactions/old%2Fx/corrections');
});
test('Verification UI exposes ledger baseline caution and never edits historical transactions', () => {
  const source = fs.readFileSync(path.resolve(__dirname, '../src/pages/admin/InventoryVerification.tsx'), 'utf8');
  assert.match(source, /Chưa xác minh được số dư đầu kỳ/);
  assert.match(source, /isAdmin && canCorrect\(tx\)/);
  assert.match(source, /count\.status === 'PENDING'/);
  assert.match(source, /if \(uncertain\)/);
  assert.doesNotMatch(source, /\.delete\(|\.put\(/);
});
