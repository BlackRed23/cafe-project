const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const ts = require('typescript');
const jwt = require('jsonwebtoken');
const { request } = require('./in-process-http.cjs');
const previousTs = Module._extensions['.ts']; const previousLoad = Module._load;
let forbiddenImports = 0;
Module._extensions['.ts'] = (mod, file) => mod._compile(ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText, file);
Module._load = function(name, parent, main) {
    if (['@cafe-project/database', '@google/generative-ai', 'nodemailer'].includes(name)) { forbiddenImports++; throw new Error('External infrastructure import forbidden'); }
    if (name === '@cafe-project/agent/workflows') return previousLoad.call(this, path.resolve(__dirname, '../../agent/src/workflows/agent-workflow.ts'), parent, main);
    return previousLoad.call(this, name, parent, main);
};
let createMockHttpApp, MockRepository, MockAgentRepository;
try {
    ({ createMockHttpApp } = require('../src/workflows/http.ts'));
    ({ MockRepository } = require('../src/workflows/mock-repository.ts'));
    ({ MockAgentRepository } = require('../../agent/src/workflows/agent-workflow.ts'));
} finally { Module._load = previousLoad; if (previousTs) Module._extensions['.ts'] = previousTs; else delete Module._extensions['.ts']; }
const secret = 'mock-http-test-signing-secret-over-32-characters';
const env = () => ({ DATA_PROVIDER: 'mock', NODE_ENV: 'test', JWT_SECRET: secret });
const line = (effects = []) => ({ productId: 'coffee', servings: '1', omitted: [], effects });
const orderInput = { items: [line()], amount: '30.00' };
const proposal = { supplierId: 'supplier', lines: [{ ingredientId: 'beans', quantity: '36', unitCost: '0.1000' }] };
const expiry = '2027-02-01T00:00:00.000Z';
const token = (actor = 'admin', role = actor === 'admin' ? 'ADMIN' : actor === 'customer' ? 'CUSTOMER' : 'STAFF') => jwt.sign({ id: actor, email: `${actor}@mock.invalid`, role }, secret, { expiresIn: '1h' });
function fixture(seed, agentRepository, config = {}) {
    const runtime = createMockHttpApp({ env: env(), repository: new MockRepository(seed), agentRepository, clock: () => new Date('2026-11-07T00:00:00Z'), maxAttempts: 1, ...config });
    let sequence = 0;
    const call = async (route, input, options = {}) => {
        const headers = { 'content-type': 'application/json', authorization: 'Bearer ' + (options.token ?? token(options.actor)), 'idempotency-key': options.key ?? `http-${++sequence}` };
        const body = options.body ?? (route.startsWith('/agent/') ? { input } : { input, versions: options.versions ?? {} });
        const response = await request(runtime.app, '/api/mock' + route, { method: options.method ?? 'POST', headers, body: JSON.stringify(body) });
        return { status: response.status, body: await response.json() };
    };
    const get = async (route, actor = 'admin') => { const response = await request(runtime.app, '/api/mock' + route, { headers: { authorization: 'Bearer ' + token(actor) } }); return { status: response.status, body: await response.json() }; };
    return { ...runtime, call, get };
}

test('Phase 6 mock HTTP prepares, approves, resumes and replays a replenishment workflow', async () => {
    const f = fixture();
    const replenish = { supplierId: 'full-supplier', unitCosts: { milk: '0.25' } };
    const mixed = await f.call('/agent/plan', { proposal, replenishment: replenish, budget: 7 }, { actor: 'staff' });
    assert.equal(mixed.status, 400);
    const planned = await f.call('/agent/plan', { replenishment: replenish, budget: 7 }, { actor: 'staff' });
    assert.equal(planned.status, 200);
    const executionId = planned.body.data.id;
    const execute = key => f.call('/agent/execute', { executionId }, { actor: 'staff', key });
    const awaiting = await execute('prepare');
    assert.equal(awaiting.body.data.status, 'AWAITING_APPROVAL');
    const request = { executionId, expiresAt: expiry, expectedHash: awaiting.body.data.hash };
    assert.equal((await f.call('/agent/approve', request, { actor: 'staff' })).status, 403);
    assert.equal((await f.call('/agent/approve', request)).status, 200);
    assert.deepEqual(await execute('prepare'), awaiting);
    const finished = await execute('dispatch');
    assert.equal(finished.body.data.status, 'SUCCEEDED');
    assert.deepEqual(await execute('dispatch'), finished);
    assert.equal(Object.keys(f.repository.snapshot().purchases).length, 1);
    const other = await f.call('/agent/plan', { replenishment: replenish, budget: 7 }, { actor: 'staff' });
    const cancel = await f.call('/agent/cancel', { executionId: other.body.data.id }, { actor: 'staff' });
    assert.equal(cancel.body.data.status, 'CANCELLED');
});

test('MOCK_VERIFIED HTTP: explicit mode gate, no external imports, legacy paths absent and auth required', async () => {
    assert.equal(forbiddenImports, 0);
    for (const settings of [{}, { DATA_PROVIDER: 'postgres' }, { DATA_PROVIDER: 'mock', NODE_ENV: 'production' }, { DATA_PROVIDER: 'mock', JWT_SECRET: 'short' }]) assert.throws(() => createMockHttpApp({ env: settings }));
    const f = fixture();
    assert.equal((await request(f.app, '/api/mock/inventory')).status, 401);
    assert.equal((await request(f.app, '/api/orders', { method: 'POST' })).status, 404);
    assert.equal((await f.get('/inventory', 'customer')).status, 403);
    const manifest = await f.get('/manifest'); assert.equal(manifest.body.data.tables.length, 27); assert.equal(manifest.body.data.enums.length, 16);
    assert.equal((await f.call('/orders', orderInput, { token: 'invalid' })).status, 401);
    const config = env(); const gated = fixture(undefined, undefined, { env: config }); config.DATA_PROVIDER = 'postgres';
    assert.equal((await gated.get('/inventory')).status, 404);
});

test('MOCK_VERIFIED HTTP: shared JWT auth uses current account; strict validation blocks identity injection', async () => {
    const f = fixture(); const before = f.repository.snapshot();
    assert.equal((await f.call('/orders', orderInput, { body: { input: orderInput, versions: {}, actorId: 'admin' }, actor: 'staff' })).status, 400);
    assert.equal((await f.call('/orders', { ...orderInput, amount: 30 })).status, 400);
    assert.equal((await f.call('/orders', orderInput, { key: '' })).status, 400);
    assert.deepEqual(f.repository.snapshot(), before);
    assert.equal((await f.call('/agent/approve', { executionId: 'x', expectedHash: '0'.repeat(64), expiresAt: expiry }, { token: token('staff', 'ADMIN') })).status, 403);
    const seed = f.repository.snapshot(); seed.principals.admin.active = false; const disabled = fixture(seed);
    assert.equal((await disabled.get('/inventory')).status, 403);
    seed.principals.admin.active = true; seed.principals.admin.role = 'STAFF'; seed.principals.admin.permissions = ['inventory.read'];
    const demoted = fixture(seed); assert.equal((await demoted.call('/orders', orderInput)).status, 403);
});
test('MOCK_VERIFIED HTTP: recipe/quote reads and recommendations use shared services without writes', async () => {
    const seed = new MockRepository().snapshot(); seed.lots.early.expirationDate = new Date('2026-11-06T00:00:00Z'); seed.lots.late.reserved = '80';
    const f = fixture(seed); const before = f.repository.snapshot();
    const recommendations = (await f.get('/inventory/recommendations')).body.data;
    assert.equal(recommendations.find(row => row.ingredientId === 'beans').recommendedBaseQuantity, '180.000');
    assert.equal(recommendations.find(row => row.ingredientId === 'milk').recommendedBaseQuantity, '1000.000');
    assert.equal((await f.get('/recipes/latte')).body.data[0].id, 'latte-v1');
    assert.equal((await f.get('/purchases/suppliers/full-supplier/quotes')).body.data.length, 2);
    const recipe = await f.call('/recipes/requirements', undefined, { body: { ...line(), productId: 'latte' } });
    assert.equal(recipe.status, 200); assert.deepEqual(recipe.body.data.snapshot.requirements.map(r => r.quantity), ['18', '150']);
    assert.deepEqual(f.repository.snapshot(), before);
});

test('MOCK_VERIFIED HTTP: multi-item frozen recipe snapshots, source×lot COGS, prepare/complete/cancel', async () => {
    const seed = new MockRepository().snapshot(); seed.lots.early.remaining = '10';
    let f = fixture(seed);
    const effect = { type: 'ADD', ingredientId: 'beans', baseUnit: 'g', unit: 'g', quantity: '2', active: true };
    const input = { items: [line(), line([effect])], amount: '60' };
    const created = await f.call('/orders', input, { key: 'multi' }); assert.equal(created.status, 200);
    const sale = created.body.data; assert.equal(sale.items.length, 2); assert.equal(sale.items[1].components.length, 2);
    const saved = f.repository.snapshot(); saved.recipes.coffee[0].ingredients[0].quantity = '90'; f = fixture(saved);
    const prepared = await f.call('/orders/transition', { orderId: sale.id, action: 'prepare' }, { versions: { [sale.id]: '1' } });
    assert.equal(prepared.status, 200); const p = prepared.body.data; assert.equal(p.items[0].snapshot.requirements[0].quantity, '18');
    assert.equal(p.costTotal, '6.6'); assert.equal(p.componentCosts.length, 4);
    assert.equal(p.componentCosts.reduce((sum, c) => sum + Math.round(Number(c.attributedCost) * 100), 0), 660);
    assert.ok(p.componentCosts.every(c => c.allocationId && c.itemId && c.componentId && c.exact));
    const remaining = f.repository.snapshot().lots.late.remaining;
    assert.equal((await f.call('/orders/transition', { orderId: sale.id, action: 'complete' }, { versions: { [sale.id]: '2' } })).status, 200);
    assert.equal(f.repository.snapshot().lots.late.remaining, remaining);
    assert.deepEqual(await f.call('/orders', input, { key: 'multi' }), created);
    const current = f.repository.snapshot(); current.recipes.coffee[0].ingredients[0].quantity = '18'; f = fixture(current);
    const pending = (await f.call('/orders', orderInput)).body.data;
    assert.equal((await f.call('/orders/transition', { orderId: pending.id, action: 'cancel' }, { versions: { [pending.id]: '1' } })).status, 200);
});

test('MOCK_VERIFIED HTTP D09: parallel replay, historical rejection and partial multi-item rollback', async () => {
    const f = fixture(); const calls = await Promise.all(Array.from({ length: 12 }, () => f.call('/orders', orderInput, { key: 'concurrent' })));
    calls.forEach(result => assert.deepEqual(result, calls[0])); assert.equal(Object.keys(f.repository.snapshot().orders).length, 1);
    assert.deepEqual(await f.call('/orders', { ...orderInput, amount: '30' }, { key: 'concurrent' }), calls[0]);
    assert.equal((await f.call('/orders', { ...orderInput, amount: '31' }, { key: 'concurrent' })).status, 409);
    const bad = { amount: '60', items: [line(), { ...line(), servings: '100' }] }; const before = f.repository.snapshot();
    const rejected = await f.call('/orders', bad, { key: 'rejected' }); assert.equal(rejected.status, 409);
    assert.deepEqual(f.repository.snapshot().lots, before.lots); assert.deepEqual(f.repository.snapshot().orders, before.orders);
    const restarted = fixture(f.repository.snapshot()); assert.deepEqual(await restarted.call('/orders', bad, { key: 'rejected' }), rejected);
    const deniedSeed = f.repository.snapshot(); deniedSeed.principals.admin.permissions = [];
    assert.equal((await fixture(deniedSeed).call('/orders', orderInput, { key: 'concurrent' })).status, 403);
});

test('MOCK_VERIFIED HTTP: fault rollback, aftercommit replay and stock-count variance lifecycle', async () => {
    const f = fixture(); const before = f.repository.snapshot(); f.repository.injectFault('beforeCommit');
    const failed = await f.call('/orders', orderInput, { key: 'fault' }); assert.equal(failed.status, 503); assert.equal(failed.body.message, 'OPERATION_UNCERTAIN'); assert.deepEqual(f.repository.snapshot(), before);
    const order = await f.call('/orders', orderInput, { key: 'fault' }); assert.equal(order.status, 200);
    f.repository.injectFault('afterCommit'); const committed = await f.call('/orders', orderInput, { key: 'lost' }); assert.equal(committed.status, 200); assert.deepEqual(await f.call('/orders', orderInput, { key: 'lost' }), committed);
    const count = (await f.call('/counts', { lines: [{ batchId: 'late', actual: '95' }] })).body.data;
    assert.equal((await f.call('/counts/submit', { countId: count.id })).status, 200);
    assert.equal((await f.call('/counts/approve', { countId: count.id, selfApprovalReason: 'owner audit' }, { actor: 'staff' })).status, 403);
    assert.equal((await f.call('/counts/approve', { countId: count.id, selfApprovalReason: 'owner audit' })).status, 200);
    assert.equal(f.repository.snapshot().lots.late.remaining, '95');
});

test('MOCK_VERIFIED HTTP D06: multi-item split-lot draft/edit/confirm and partial correction', async () => {
    const seed = new MockRepository().snapshot(); seed.ingredients.milk = { id: 'milk', name: 'Milk', active: true, baseUnit: 'ml', version: '1' };
    seed.quotes.push({ supplierId: 'supplier', ingredientId: 'milk', active: true, purchaseUnit: 'bottle', conversionQuantity: '10', version: '1' });
    const f = fixture(seed); const input = { ...proposal, lines: [...proposal.lines, { ingredientId: 'milk', quantity: '10', unitCost: '0.2' }] };
    const purchase = (await f.call('/purchases', input)).body.data;
    const lines = [{ ingredientId: 'beans', quantity: '10.5', expirationDate: expiry }, { ingredientId: 'beans', quantity: '7.5', expirationDate: expiry }, { ingredientId: 'milk', quantity: '5', expirationDate: expiry }];
    const draft = (await f.call('/receipts/draft', { purchaseId: purchase.id, lines })).body.data;
    const edited = await f.call('/receipts/edit', { receiptId: draft.id, purchaseId: purchase.id, lines }, { versions: { [draft.id]: '1' } }); assert.equal(edited.status, 200);
    const receipt = (await f.call('/receipts/confirm', { receiptId: draft.id }, { versions: { [draft.id]: '2', [purchase.id]: '1' } })).body.data;
    assert.equal(receipt.lines.length, 3); assert.equal(receipt.revisions.length, 1);
    const corrected = await f.call('/receipts/correct', { receiptId: receipt.id, lineId: receipt.lines[0].id, quantity: '0.5', reason: 'damaged return' }, { versions: { [receipt.id]: '3', [purchase.id]: '2' } });
    assert.equal(corrected.status, 200); assert.equal(corrected.body.data.corrections[0].payableDelta, '-0.05');
    assert.equal(f.repository.snapshot().purchases[purchase.id].lines[0].received, '17.500');
});

test('MOCK_VERIFIED HTTP D06/D03: consumed correction credits original component without fake stock movements', async () => {
    const seed = new MockRepository().snapshot(); seed.lots.early.remaining = '0'; seed.lots.late.remaining = '0';
    const f = fixture(seed); const purchase = (await f.call('/purchases', proposal)).body.data;
    const receipt = (await f.call('/receipts/receive', { purchaseId: purchase.id, lines: [{ ingredientId: 'beans', quantity: '36', expirationDate: expiry }] }, { versions: { [purchase.id]: '1' } })).body.data;
    const sale = (await f.call('/orders', { amount: '60', items: [line(), line()] })).body.data;
    await f.call('/orders/transition', { orderId: sale.id, action: 'prepare' }, { versions: { [sale.id]: '1' } });
    const input = { receiptId: receipt.id, lineId: receipt.lines[0].id, quantity: '18', reason: 'supplier document overstatement' };
    const versions = { [receipt.id]: '2', [purchase.id]: '2' }; const before = f.repository.snapshot();
    assert.equal((await f.call('/receipts/correct', input, { versions })).status, 409);
    assert.deepEqual(f.repository.snapshot().events, before.events);
    const beforeFault = f.repository.snapshot(); f.repository.injectFault('write');
    assert.equal((await f.call('/receipts/correct', { ...input, disposition: 'RETURN_AND_CREDIT_CONSUMED' }, { versions, key: 'credit' })).status, 503);
    assert.deepEqual(f.repository.snapshot(), beforeFault);
    const correction = await f.call('/receipts/correct', { ...input, disposition: 'RETURN_AND_CREDIT_CONSUMED' }, { versions, key: 'credit' }); assert.equal(correction.status, 200);
    assert.equal(correction.body.data.corrections[0].consumedQuantity, '18.000'); assert.equal(correction.body.data.corrections[0].physicalQuantity, '0.000');
    assert.deepEqual(f.repository.snapshot().events, before.events);
    const saved = f.repository.snapshot().orders[sale.id]; assert.equal(saved.costTotal, '3.6'); assert.equal(saved.costAdjustments[0].amount, '-1.8');
    assert.deepEqual(await f.call('/receipts/correct', { ...input, disposition: 'RETURN_AND_CREDIT_CONSUMED' }, { versions, key: 'credit' }), correction);
});

test('MOCK_VERIFIED HTTP D11: failed attempt, settlement, uncertain refund and historical recovery', async () => {
    const f = fixture(); const sale = (await f.call('/orders', orderInput)).body.data;
    const failed = (await f.call('/payments/attempt', { orderId: sale.id, account: 'merchant' })).body.data;
    assert.equal((await f.call('/payments/settle', { paymentId: failed.id, account: 'merchant', eventId: 'failed', amount: '30', outcome: 'FAILED' })).status, 200);
    const payment = (await f.call('/payments/attempt', { orderId: sale.id, account: 'merchant' }, { key: 'second-attempt' })).body.data;
    assert.equal((await f.call('/payments/settle', { paymentId: payment.id, account: 'merchant', eventId: 'settled', amount: '30', outcome: 'SETTLED' }, { actor: 'staff' })).status, 403);
    await f.call('/payments/settle', { paymentId: payment.id, account: 'merchant', eventId: 'settled', amount: '30', outcome: 'SETTLED' });
    const refund = (await f.call('/refunds/request', { paymentId: payment.id, amount: '10' })).body.data;
    const resolve = { paymentId: payment.id, refundId: refund.id, account: 'merchant', eventId: 'unknown-refund', outcome: 'UNKNOWN' };
    await f.call('/refunds/resolve', resolve);
    assert.equal((await f.call('/refunds/request', { paymentId: payment.id, amount: '1' })).status, 409);
    f.repository.injectFault('afterCommit'); const settled = await f.call('/refunds/resolve', { ...resolve, eventId: 'known-refund', outcome: 'SUCCEEDED' }, { key: 'refund-resolved' }); assert.equal(settled.status, 200);
    assert.deepEqual(await f.call('/refunds/resolve', { ...resolve, eventId: 'known-refund', outcome: 'SUCCEEDED' }, { key: 'refund-resolved' }), settled);
    assert.equal(f.repository.snapshot().payments[payment.id].refunds.length, 1);
    assert.equal((await f.call('/payments/reconcile', { account: 'merchant', date: '2026-11-07', expectedGross: '30', expectedRefunds: '10' })).body.data.status, 'MATCHED');
    assert.equal((await f.call('/payments/attempt', { orderId: sale.id, account: 'merchant' }, { key: 'second-attempt' })).body.data.status, 'PENDING');
});

test('MOCK_VERIFIED HTTP Agent: multi-line proposals, revision-bound approval, replay and real audit', async () => {
    const seed = new MockRepository().snapshot(); seed.ingredients.milk = { id: 'milk', name: 'Milk', baseUnit: 'ml', version: '1', active: true };
    seed.quotes.push({ supplierId: 'supplier', ingredientId: 'milk', purchaseUnit: 'bottle', conversionQuantity: '10', version: '1', active: true });
    const f = fixture(seed); const multi = { ...proposal, lines: [...proposal.lines, { ingredientId: 'milk', quantity: '10', unitCost: '0.2' }] };
    const planned = await f.call('/agent/plan', { budget: 2, proposal: multi }, { actor: 'staff', key: 'plan' }); assert.equal(planned.status, 200); const run = planned.body.data;
    assert.deepEqual(await f.call('/agent/plan', { budget: 2, proposal: multi }, { actor: 'staff', key: 'plan' }), planned);
    const denied = await f.call('/agent/execute', { executionId: run.id }, { actor: 'staff', key: 'unapproved' }); assert.equal(denied.status, 409);
    await f.call('/agent/approve', { executionId: run.id, expectedHash: run.hash, expiresAt: expiry });
    const revision = (await f.call('/agent/revise', { executionId: run.id, expectedRevision: '1', plan: [{ tool: 'purchase.create', input: multi }] }, { actor: 'staff' })).body.data;
    assert.equal((await f.call('/agent/approve', { executionId: run.id, expectedHash: run.hash, expiresAt: expiry })).status, 400);
    assert.equal((await f.call('/agent/execute', { executionId: run.id }, { actor: 'staff' })).status, 409);
    await f.call('/agent/approve', { executionId: run.id, expectedHash: revision.hash, expiresAt: expiry });
    const results = await Promise.all(Array.from({ length: 6 }, () => f.call('/agent/execute', { executionId: run.id }, { actor: 'staff', key: 'execute' })));
    results.forEach(r => assert.deepEqual(r, results[0])); assert.equal(results[0].body.data.status, 'SUCCEEDED');
    assert.deepEqual(await f.call('/agent/execute', { executionId: run.id }, { actor: 'staff', key: 'unapproved' }), denied);
    const state = f.repository.snapshot(); assert.equal(Object.keys(state.purchases).length, 1); assert.equal(Object.values(state.purchases)[0].lines.length, 2);
    const audit = (await f.get('/agent/executions/' + run.id, 'staff')).body.data;
    assert.equal(audit.toolCalls.length, 1); assert.equal(audit.evaluations.length, 1); assert.equal(audit.evaluations[0].passed, true);
    assert.equal(audit.execution.spent, 2); assert.equal(audit.execution.reserved, 0);
});

test('MOCK_VERIFIED HTTP Agent: budget, allowlist, memory isolation and atomic rollback', async () => {
    const f = fixture();
    assert.equal((await f.call('/agent/plan', { budget: 1, proposal }, { actor: 'staff' })).status, 409);
    const run = (await f.call('/agent/plan', { budget: 2, proposal }, { actor: 'staff' })).body.data;
    assert.equal((await f.call('/agent/revise', { executionId: run.id, expectedRevision: '1', plan: [{ tool: 'shell', input: null }] }, { actor: 'staff' })).status, 400);
    await f.call('/agent/approve', { executionId: run.id, expectedHash: run.hash, expiresAt: expiry });
    const beforeBusiness = f.repository.snapshot(); const beforeAgent = f.agentRepository.snapshot(); f.agentRepository.injectFault('beforeCommit');
    assert.equal((await f.call('/agent/execute', { executionId: run.id }, { actor: 'staff', key: 'joint' })).status, 503);
    assert.deepEqual(f.repository.snapshot(), beforeBusiness); assert.deepEqual(f.agentRepository.snapshot(), beforeAgent);
    assert.equal((await f.call('/agent/execute', { executionId: run.id }, { actor: 'staff', key: 'joint' })).body.data.status, 'SUCCEEDED');
    for (const side of ['business', 'agent']) {
        const next = (await f.call('/agent/plan', { budget: 2, proposal }, { actor: 'staff' })).body.data;
        await f.call('/agent/approve', { executionId: next.id, expectedHash: next.hash, expiresAt: expiry });
        (side === 'business' ? f.repository : f.agentRepository).injectFault('afterCommit');
        assert.equal((await f.call('/agent/execute', { executionId: next.id }, { actor: 'staff', key: 'postcommit-' + side })).status, 503);
        assert.equal((await f.call('/agent/execute', { executionId: next.id }, { actor: 'staff', key: 'postcommit-' + side })).body.data.status, 'SUCCEEDED');
    }
    assert.equal(Object.keys(f.repository.snapshot().purchases).length, 3);
    const memory = (await f.call('/agent/memory/remember', { text: 'buy beans weekly' }, { actor: 'staff', key: 'remember' })).body.data;
    await f.call('/agent/memory/learn', { memoryId: memory.id }, { actor: 'staff' });
    assert.equal((await f.get('/agent/memory?q=beans', 'staff')).body.data[0].learned, true);
    assert.deepEqual((await f.get('/agent/memory?q=beans', 'admin')).body.data, []);
    assert.equal((await f.call('/agent/memory/forget', { memoryId: memory.id })).status, 403);
    await f.call('/agent/memory/consolidate', {}, { actor: 'staff' }); await f.call('/agent/memory/forget', { memoryId: memory.id }, { actor: 'staff' });
    assert.equal((await f.get('/agent/memory', 'staff')).body.data.length, 0);
});
test('MOCK_VERIFIED HTTP Agent: current approver role, expiry, revoke and quote/ingredient source guards', async () => {
    const f = fixture(); const run = (await f.call('/agent/plan', { budget: 2, proposal }, { actor: 'staff' })).body.data;
    const approval = (await f.call('/agent/approve', { executionId: run.id, expectedHash: run.hash, expiresAt: expiry })).body.data;
    const baseBusiness = f.repository.snapshot(); const baseAgent = f.agentRepository.snapshot();
    for (const mutate of [seed => { seed.principals.admin.role = 'STAFF'; }, seed => { seed.quotes.find(q => q.supplierId === 'supplier').version = '2'; }, seed => { seed.ingredients.beans.version = '2'; }]) {
        const seed = structuredClone(baseBusiness); mutate(seed); const changed = fixture(seed, new MockAgentRepository(baseAgent));
        const denied = await changed.call('/agent/execute', { executionId: run.id }, { actor: 'staff' }); assert.equal(denied.status, 409);
        assert.equal(Object.keys(changed.repository.snapshot().purchases).length, 0);
        assert.equal(Object.keys(changed.agentRepository.snapshot().toolCalls).length, 0);
    }
    const expired = fixture(baseBusiness, new MockAgentRepository(baseAgent), { clock: () => new Date('2027-03-01T00:00:00Z') });
    assert.equal((await expired.call('/agent/execute', { executionId: run.id }, { actor: 'staff' })).body.message, 'APPROVAL_REQUIRED');
    assert.equal((await f.call('/agent/revoke', { approvalId: approval.id })).status, 200);
    assert.equal((await f.call('/agent/execute', { executionId: run.id }, { actor: 'staff' })).status, 409);
});
test('MOCK_VERIFIED HTTP: concurrent receipt and payment contenders retain one successful mutation', async () => {
    const f = fixture(); const purchase = (await f.call('/purchases', proposal)).body.data;
    const input = { purchaseId: purchase.id, lines: [{ ingredientId: 'beans', quantity: '25', expirationDate: expiry }] };
    const receipts = await Promise.all(['receipt-a', 'receipt-b'].map(key => f.call('/receipts/receive', input, { key, versions: { [purchase.id]: '1' } })));
    assert.deepEqual(receipts.map(r => r.status).sort(), [200, 409]);
    assert.equal((await f.call('/receipts/receive', input, { versions: { [purchase.id]: '2' } })).status, 400);
    assert.equal(Object.keys(f.repository.snapshot().receipts).length, 1);
    const sale = (await f.call('/orders', orderInput)).body.data;
    const attempts = await Promise.all(['pay-a', 'pay-b'].map(key => f.call('/payments/attempt', { orderId: sale.id, account: 'merchant' }, { key })));
    assert.deepEqual(attempts.map(r => r.status).sort(), [200, 409]);
    assert.equal(Object.keys(f.repository.snapshot().payments).length, 1);
});
test('MOCK_VERIFIED HTTP D08: per-item preparation/cancellation/remake preserves other reservations and loss lineage', async () => {
    const f = fixture(); const sale = (await f.call('/orders', { amount: '90', items: [line(), line(), line()] })).body.data;
    const [first, cancelled, third] = sale.items.map(item => item.id);
    const move = (action, itemIds, version) => f.call('/orders/transition', { orderId: sale.id, action, itemIds }, { versions: { [sale.id]: version } });
    assert.equal((await move('prepare', [first], '1')).status, 200);
    assert.equal(f.repository.snapshot().lots.early.reserved, '36.000');
    assert.equal((await move('cancel', [cancelled], '2')).status, 200); assert.equal(f.repository.snapshot().lots.early.reserved, '18.000');
    const remake = await f.call('/orders/remake', { orderId: sale.id, reason: 'spilled first cup', itemIds: [first] }, { versions: { [sale.id]: '3' }, key: 'remake' }); assert.equal(remake.status, 200);
    assert.equal(remake.body.data.losses.length, 1); assert.equal(remake.body.data.losses[0].itemId, first);
    assert.equal(f.repository.snapshot().lots.early.reserved, '18.000');
    assert.equal((await move('complete', [first], '4')).status, 200);
    assert.equal((await move('prepare', [third], '5')).status, 200);
    const completed = await move('complete', [third], '6'); assert.equal(completed.body.data.status, 'COMPLETED');
    assert.deepEqual(completed.body.data.items.map(item => item.status), ['COMPLETED', 'CANCELLED', 'COMPLETED']);
    assert.equal(f.repository.snapshot().lots.early.remaining, '46.000'); assert.equal(f.repository.snapshot().lots.early.reserved, '0.000');
    assert.deepEqual(await f.call('/orders/remake', { orderId: sale.id, reason: 'spilled first cup', itemIds: [first] }, { versions: { [sale.id]: '3' }, key: 'remake' }), remake);
});
test('MOCK_VERIFIED HTTP D03: remake cannot change previously frozen component cents', async () => {
    const seed = new MockRepository().snapshot(); seed.lots.early.remaining = '18'; seed.lots.early.unitCost = '0.0003'; seed.lots.late.unitCost = '0.0004';
    const f = fixture(seed); const sale = (await f.call('/orders', orderInput)).body.data;
    const prepared = (await f.call('/orders/transition', { orderId: sale.id, action: 'prepare' }, { versions: { [sale.id]: '1' } })).body.data;
    assert.equal(prepared.componentCosts[0].attributedCost, '0.01');
    const remade = (await f.call('/orders/remake', { orderId: sale.id, reason: 'remake' }, { versions: { [sale.id]: '2' } })).body.data;
    assert.deepEqual(remade.componentCosts[0], prepared.componentCosts[0]); assert.equal(remade.componentCosts[1].attributedCost, '0'); assert.equal(remade.costTotal, '0.01');
    const cancelled = (await f.call('/orders/transition', { orderId: sale.id, action: 'cancel' }, { versions: { [sale.id]: '3' } })).body.data;
    assert.equal(cancelled.losses.reduce((sum, loss) => sum + Math.round(Number(loss.costTotal) * 100), 0), 1);
});
