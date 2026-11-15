const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const Module = require('node:module');
const ts = require('typescript');
const original = Module._extensions['.ts'];
Module._extensions['.ts'] = (mod, file) => mod._compile(ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, file);
let MockRepository, BusinessWorkflows, provider, TransactionFailure;
try {
    ({ MockRepository } = require('../src/workflows/mock-repository.ts'));
    ({ BusinessWorkflows } = require('../src/workflows/business-service.ts'));
    provider = require('../src/workflows/provider.ts');
    ({ TransactionFailure } = require('../src/workflows/contracts.ts'));
} finally { if (original) Module._extensions['.ts'] = original; else delete Module._extensions['.ts']; }
const { workflowContract, command, sale } = require('./workflow-contract.cjs');
const now = () => new Date('2026-11-07T00:00:00Z');
function factory(seed) { const repository = new MockRepository(seed); return { repository, service: new BusinessWorkflows(repository, now, 1), restart: r => factory(r.snapshot()) }; }
workflowContract(test, 'MOCK_VERIFIED', factory);
test('MOCK_VERIFIED: fault at every order write and before commit rolls back', async () => {
    for (const [point, occurrence] of [['write', 1], ['write', 2], ['write', 3], ['write', 4], ['beforeCommit', 1]]) {
        const { repository, service } = factory(); const before = repository.snapshot(); repository.injectFault(point, occurrence);
        await assert.rejects(service.createOrder(command('fault'), sale), /INJECTED/); assert.deepEqual(repository.snapshot(), before);
        assert.equal((await service.createOrder(command('fault'), sale)).status, 200);
    }
});
test('MOCK_VERIFIED: unknown commit recovers exact result with no blind duplicate', async () => {
    const { repository, service } = factory(); repository.injectFault('afterCommit');
    assert.equal((await service.createOrder(command('lost'), sale)).status, 200);
    const restarted = factory(repository.snapshot()); const result = await restarted.service.createOrder(command('lost'), sale);
    assert.equal(result.status, 200); assert.equal(Object.keys(restarted.repository.snapshot().orders).length, 1);
});
test('MOCK_VERIFIED D09: at most three confirmed-rollback attempts; UNKNOWN absence never retries', async () => {
    const { repository } = factory(); const service = new BusinessWorkflows(repository, now);
    repository.injectFault('beforeCommit'); assert.equal((await service.createOrder(command('retry'), sale)).status, 200);
    let calls = 0; const broken = { transaction: async () => { calls++; throw new TransactionFailure('ROLLED_BACK', 'rollback'); }, read: async () => undefined };
    await assert.rejects(new BusinessWorkflows(broken, now).createOrder(command('limit'), sale), /rollback/); assert.equal(calls, 3);
    calls = 0; broken.transaction = async () => { calls++; throw new TransactionFailure('UNKNOWN', 'unknown'); };
    await assert.rejects(new BusinessWorkflows(broken, now).createOrder(command('unknown'), sale), /unknown/); assert.equal(calls, 1);
});
test('MOCK_VERIFIED: revocation denies replay and agent cannot approve counts', async () => {
    const { service, repository } = factory(); await service.createOrder(command('auth'), sale);
    const seed = repository.snapshot(); seed.principals.admin.active = false;
    await assert.rejects(factory(seed).service.createOrder(command('auth'), sale), /FORBIDDEN/);
    await assert.rejects(service.approveCount(command('no', {}, 'agent'), { countId: 'x', selfApprovalReason: 'reason' }), /FORBIDDEN/);
});
test('MOCK_VERIFIED: expired reservation reallocation and insufficient stock rollback', async () => {
    const { service, repository } = factory(); const order = (await service.createOrder(command('a'), sale)).body;
    const seed = repository.snapshot(); seed.lots.early.expirationDate = new Date('2026-11-06Z');
    let f = factory(seed); assert.equal((await f.service.transitionOrder(command('p', { [order.id]: '1' }), { orderId: order.id, action: 'prepare' })).status, 200);
    assert.equal(f.repository.snapshot().lots.early.remaining, '100'); assert.equal(f.repository.snapshot().lots.late.remaining, '82.000');
    seed.lots.late.remaining = '0'; f = factory(seed); const before = f.repository.snapshot();
    assert.equal((await f.service.transitionOrder(command('p', { [order.id]: '1' }), { orderId: order.id, action: 'prepare' })).status, 409);
    assert.deepEqual(f.repository.snapshot().lots, before.lots);
});
test('MOCK_VERIFIED: partial multi-line receipts, overreceive and atomic rollback', async () => {
    const { service, repository } = factory();
    const pr = (await service.createPurchase(command('pr'), { supplierId: 'supplier', lines: [{ ingredientId: 'beans', quantity: '10', unitCost: '1.25' }] })).body;
    const receive = quantity => ({ purchaseId: pr.id, lines: [{ ingredientId: 'beans', quantity, expirationDate: '2027-01-01Z' }] });
    const first = await service.receive(command('r1', { [pr.id]: '1' }), receive('4')); assert.equal(first.status, 200);
    assert.equal((await service.receive(command('too', { [pr.id]: '2' }), receive('7'))).status, 400);
    assert.equal((await service.receive(command('r2', { [pr.id]: '2' }), receive('6'))).status, 200);
    assert.equal(repository.snapshot().purchases[pr.id].status, 'RECEIVED');
    assert.equal(Object.keys(repository.snapshot().receipts).length, 2);
});
test('MOCK_VERIFIED: count approval state, reason, stale versions, variance', async () => {
    const { service, repository } = factory();
    const count = (await service.createCount(command('count'), { lines: [{ batchId: 'early', actual: '90' }] })).body;
    assert.equal((await service.approveCount(command('early'), { countId: count.id, selfApprovalReason: 'audit' })).status, 409);
    await service.submitCount(command('submit'), { countId: count.id });
    assert.equal((await service.approveCount(command('reason'), { countId: count.id, selfApprovalReason: '' })).status, 403);
    assert.equal((await service.approveCount(command('approve'), { countId: count.id, selfApprovalReason: 'owner audit' })).status, 200);
    assert.equal(repository.snapshot().lots.early.remaining, '90');
    assert.equal(repository.snapshot().events.at(-1).variance, '-10.000');
    const other = (await service.createCount(command('other'), { lines: [{ batchId: 'early', actual: '95' }] })).body;
    await service.submitCount(command('other-submit'), { countId: other.id }); await service.createOrder(command('reserve'), sale);
    assert.equal((await service.approveCount(command('stale'), { countId: other.id, selfApprovalReason: 'audit' })).status, 409);
});
test('MOCK_VERIFIED: payment attempts, callback account validation, partial/full refund', async () => {
    const { service, repository } = factory(); const order = (await service.createOrder(command('o'), sale)).body;
    const pay = (await service.paymentAttempt(command('pay'), { orderId: order.id, account: 'merchant' })).body;
    assert.equal((await service.paymentAttempt(command('duplicate'), { orderId: order.id, account: 'merchant' })).status, 409);
    const callback = { paymentId: pay.id, account: 'merchant', eventId: 'event', amount: '30', outcome: 'SETTLED' };
    assert.equal((await service.settle(command('bad'), { ...callback, account: 'attacker' })).status, 409);
    assert.equal((await service.settle(command('settle'), callback)).status, 200);
    assert.equal((await service.refund(command('refund1'), { paymentId: pay.id, amount: '10' })).status, 200);
    assert.equal((await service.refund(command('too'), { paymentId: pay.id, amount: '21' })).status, 409);
    assert.equal((await service.refund(command('refund2'), { paymentId: pay.id, amount: '20' })).status, 200);
    assert.equal(repository.snapshot().payments[pay.id].status, 'REFUNDED');
});
test('POSTGRES_NOT_VERIFIED: provider fails closed without reading credentials', () => {
    assert.equal(provider.TARGET_TABLES.length, 27); assert.equal(new Set(provider.TARGET_ENUMS).size, 16);
    assert.ok(provider.createWorkflowRepository({}) instanceof MockRepository);
    for (const env of [{ DATA_PROVIDER: 'postgres' }, { DATA_PROVIDER: 'invalid' }, { NODE_ENV: 'production' }, { NODE_ENV: 'production', DATA_PROVIDER: 'mock' }]) assert.throws(() => provider.createWorkflowRepository(env));
    const env = { DATA_PROVIDER: 'postgres', get DATABASE_URL() { throw new Error('SECRET_READ'); } };
    assert.throws(() => provider.createWorkflowRepository(env), /POSTGRES_NOT_VERIFIED/);
});
test('MOCK_VERIFIED D09: arbitrary edit/rejection history survives snapshot restart without fake movements', async () => {
    let { repository, service } = factory(); const originals = [];
    for (let i = 0; i < 40; i++) {
        const c = command(`edit-${i}`, { beans: String(i + 1) }); const input = { ingredientId: 'beans', name: `Name ${i}` };
        const response = await service.editIngredient(c, input); assert.equal(response.status, 200); originals.push({ c, input, response });
        const rejection = await service.editIngredient(command(`reject-${i}`, { beans: '0' }), input); assert.equal(rejection.status, 409);
    }
    ({ service, repository } = factory(repository.snapshot()));
    for (const { c, input, response } of originals) assert.deepEqual(await service.editIngredient(c, input), response);
    assert.equal(Object.keys(repository.snapshot().operations).length, 80); assert.equal(repository.snapshot().events.length, 0);
    assert.equal(repository.snapshot().ingredients.beans.name, 'Name 39');
});
test('MOCK_VERIFIED: fractional piece receiving/counts fail and cost attribution is exact', async () => {
    const seed = new MockRepository().snapshot(); seed.ingredients.beans.baseUnit = 'piece';
    const f = factory(seed);
    assert.equal((await f.service.createPurchase(command('bad-piece'), { supplierId: 's', lines: [{ ingredientId: 'beans', quantity: '0.5', unitCost: '1' }] })).status, 400);
    assert.equal((await f.service.createCount(command('bad-count'), { lines: [{ batchId: 'early', actual: '0.5' }] })).status, 400);
    const { service } = factory(); const order = (await service.createOrder(command('cost-order'), sale)).body;
    const prepared = (await service.transitionOrder(command('cost-prepare', { [order.id]: '1' }), { orderId: order.id, action: 'prepare' })).body;
    assert.equal(prepared.costTotal, '1.8'); assert.deepEqual(prepared.costs, [{ ingredientId: 'beans', batchId: 'early', quantity: '18', unitCost: '0.1000' }]);
});
test('MOCK_VERIFIED: rejected multi-resource command rolls back first ingredient effects', async () => {
    const seed = new MockRepository().snapshot();
    seed.recipes.coffee[0].ingredients.push({ ingredientId: 'z-missing', quantity: '1', unit: 'ml', baseUnit: 'ml', active: true, optional: false });
    const { service, repository } = factory(seed); const before = repository.snapshot();
    assert.equal((await service.createOrder(command('multi-reject'), sale)).status, 409);
    assert.deepEqual(repository.snapshot().lots, before.lots); assert.deepEqual(repository.snapshot().events, []);
});
test('MOCK_VERIFIED: queued commands freeze caller payload and versions before hashing/writes', async () => {
    const { service } = factory(); const input = structuredClone(sale); const c = command('frozen');
    const pending = service.createOrder(c, input); input.amount = '1000'; c.actorId = 'agent';
    const result = await pending; assert.equal(result.status, 200); assert.equal(result.body.amount, '30.00');
    assert.deepEqual(await service.createOrder(command('frozen'), sale), result);
});
test('MOCK_VERIFIED: every backend write workflow rolls back at commit fault', async () => {
    const base = factory(); const s = base.service;
    const order = (await s.createOrder(command('setup-order'), sale)).body;
    const purchase = (await s.createPurchase(command('setup-pr'), { supplierId: 'supplier', lines: [{ ingredientId: 'beans', quantity: '10', unitCost: '1' }] })).body;
    const count = (await s.createCount(command('setup-count'), { lines: [{ batchId: 'early', actual: '95' }] })).body;
    const submitted = (await s.createCount(command('setup-submitted'), { lines: [{ batchId: 'late', actual: '95' }] })).body;
    await s.submitCount(command('setup-submit'), { countId: submitted.id });
    const payment = (await s.paymentAttempt(command('setup-pay'), { orderId: order.id, account: 'merchant' })).body;
    const settledOrder = (await s.createOrder(command('setup-order2'), sale)).body;
    const settled = (await s.paymentAttempt(command('setup-pay2'), { orderId: settledOrder.id, account: 'merchant' })).body;
    await s.settle(command('setup-settle'), { paymentId: settled.id, account: 'merchant', eventId: 'setup', amount: '30', outcome: 'SETTLED' });
    const actions = [
        f => f.editIngredient(command('fault', { beans: '1' }), { ingredientId: 'beans', name: 'New name' }),
        f => f.createOrder(command('fault'), sale),
        f => f.transitionOrder(command('fault', { [order.id]: '1' }), { orderId: order.id, action: 'prepare' }),
        f => f.transitionOrder(command('fault', { [order.id]: '1' }), { orderId: order.id, action: 'cancel' }),
        f => f.createPurchase(command('fault'), { supplierId: 'supplier', lines: [{ ingredientId: 'beans', quantity: '10', unitCost: '1' }] }),
        f => f.receive(command('fault', { [purchase.id]: '1' }), { purchaseId: purchase.id, lines: [{ ingredientId: 'beans', quantity: '5', expirationDate: '2027-01-01Z' }] }),
        f => f.createCount(command('fault'), { lines: [{ batchId: 'early', actual: '95' }] }),
        f => f.editCount(command('fault'), { countId: count.id, lines: [{ batchId: 'early', actual: '96' }] }),
        f => f.submitCount(command('fault'), { countId: count.id }),
        f => f.approveCount(command('fault'), { countId: submitted.id, selfApprovalReason: 'audit' }),
        f => f.settle(command('fault'), { paymentId: payment.id, account: 'merchant', eventId: 'new', amount: '30', outcome: 'SETTLED' }),
        f => f.refund(command('fault'), { paymentId: settled.id, amount: '10' }),
    ];
    for (const action of actions) {
        const { service, repository } = factory(base.repository.snapshot()); const before = repository.snapshot(); repository.injectFault('beforeCommit');
        await assert.rejects(action(service), /INJECTED_beforeCommit/); assert.deepEqual(repository.snapshot(), before);
    }
});
test('MOCK_VERIFIED D06: frozen packs, multi-item draft revisions, fractional-pack lot splits, corrections', async () => {
    const seed = new MockRepository().snapshot(); seed.quotes.find(q => q.supplierId === 'supplier').conversionQuantity = '10';
    seed.ingredients.milk = { id: 'milk', name: 'Milk', baseUnit: 'ml', version: '1', active: true };
    seed.quotes.push({ supplierId: 'supplier', ingredientId: 'milk', purchaseUnit: 'bottle', conversionQuantity: '5', version: '1', active: true });
    const { service, repository } = factory(seed);
    const input = { supplierId: 'supplier', lines: [{ ingredientId: 'beans', quantity: '20', unitCost: '0.1' }, { ingredientId: 'milk', quantity: '10', unitCost: '0.2' }] };
    assert.equal((await service.createPurchase(command('fractional-pack'), { ...input, lines: [{ ...input.lines[0], quantity: '15' }] })).status, 400);
    const purchase = (await service.createPurchase(command('packs'), input)).body; assert.equal(purchase.lines[0].packs, '2');
    const receiptInput = { purchaseId: purchase.id, lines: [{ ingredientId: 'beans', quantity: '4.5', expirationDate: '2027-01-01Z' }, { ingredientId: 'beans', quantity: '5.5', expirationDate: '2027-02-01Z' }, { ingredientId: 'milk', quantity: '5', expirationDate: '2027-01-01Z' }] };
    const draft = (await service.createReceiptDraft(command('draft'), receiptInput)).body; assert.equal(draft.status, 'DRAFT'); assert.equal(Object.keys(repository.snapshot().lots).length, 2);
    const edited = (await service.editReceiptDraft(command('edit', { [draft.id]: '1' }), { ...receiptInput, receiptId: draft.id })).body;
    assert.equal(edited.revisions.length, 1);
    const receipt = (await service.confirmReceipt(command('confirm', { [draft.id]: '2', [purchase.id]: '1' }), { receiptId: draft.id })).body;
    assert.equal(receipt.status, 'CONFIRMED'); assert.equal(receipt.lines[0].packNumerator, '4500'); assert.equal(receipt.lines[0].packDenominator, '10000');
    assert.equal(repository.snapshot().purchases[purchase.id].lines[0].received, '10.000');
    const correction = await service.correctReceipt(command('correct', { [draft.id]: '3', [purchase.id]: '2' }), { receiptId: draft.id, lineId: receipt.lines[0].id, quantity: '1.5', reason: 'returned damaged stock' });
    assert.equal(correction.status, 200); assert.equal(correction.body.corrections[0].payableDelta, '-0.15');
    assert.equal(repository.snapshot().purchases[purchase.id].lines[0].received, '8.500');
    assert.equal(repository.snapshot().lots[receipt.lines[0].batchId].remaining, '3.000');
    assert.equal((await service.editReceiptDraft(command('sealed', { [draft.id]: '4' }), { ...receiptInput, receiptId: draft.id })).status, 409);
});
test('MOCK_VERIFIED D11: unknown refund blocks new dispatch, resolution applies once, reconciliation by account/date', async () => {
    const { service, repository } = factory(); const order = (await service.createOrder(command('order'), sale)).body;
    const payment = (await service.paymentAttempt(command('attempt'), { orderId: order.id, account: 'account' })).body;
    await service.settle(command('settled'), { paymentId: payment.id, account: 'account', eventId: 'paid', amount: '30', outcome: 'SETTLED' });
    const refund = (await service.requestRefund(command('request-refund'), { paymentId: payment.id, amount: '10' })).body;
    const resolution = { paymentId: payment.id, refundId: refund.id, account: 'account', eventId: 'refund-event', outcome: 'UNKNOWN' };
    assert.equal((await service.resolveRefund(command('unknown-refund'), resolution)).status, 200);
    assert.equal((await service.requestRefund(command('blocked-refund'), { paymentId: payment.id, amount: '5' })).status, 409);
    assert.equal((await service.refund(command('blocked-immediate'), { paymentId: payment.id, amount: '5' })).status, 409);
    const confirmed = await service.resolveRefund(command('confirm-refund'), { ...resolution, outcome: 'SUCCEEDED', eventId: 'refund-confirmed' }); assert.equal(confirmed.status, 200);
    assert.deepEqual(await service.resolveRefund(command('confirm-refund'), { ...resolution, outcome: 'SUCCEEDED', eventId: 'refund-confirmed' }), confirmed);
    assert.equal(repository.snapshot().payments[payment.id].refunds.length, 1);
    const report = await service.reconcilePayments(command('reconcile'), { account: 'account', date: '2026-11-07', expectedGross: '30', expectedRefunds: '10' }); assert.equal(report.body.status, 'MATCHED');
    const other = await service.reconcilePayments(command('other-account'), { account: 'other', date: '2026-11-07', expectedGross: '30', expectedRefunds: '0' }); assert.equal(other.body.status, 'MISMATCHED');
    assert.equal((await service.resolveRefund(command('late-failure'), { ...resolution, outcome: 'FAILED', eventId: 'late' })).status, 409);
});
test('MOCK_VERIFIED: additional receipt/refund/reconciliation workflows roll back atomically', async () => {
    const base = factory(); const s = base.service;
    const order = (await s.createOrder(command('base-order'), sale)).body;
    await s.transitionOrder(command('base-prepare', { [order.id]: '1' }), { orderId: order.id, action: 'prepare' });
    const payment = (await s.paymentAttempt(command('base-pay'), { orderId: order.id, account: 'merchant' })).body;
    await s.settle(command('base-settle'), { paymentId: payment.id, account: 'merchant', eventId: 'base', amount: '30', outcome: 'SETTLED' });
    const refund = (await s.requestRefund(command('base-refund'), { paymentId: payment.id, amount: '5' })).body;
    const purchase = (await s.createPurchase(command('base-pr'), { supplierId: 'supplier', lines: [{ ingredientId: 'beans', quantity: '10', unitCost: '1' }] })).body;
    const receiptInput = { purchaseId: purchase.id, lines: [{ ingredientId: 'beans', quantity: '5', expirationDate: '2027-01-01Z' }] };
    const draft = (await s.createReceiptDraft(command('base-draft'), receiptInput)).body;
    const confirmed = (await s.receive(command('base-receipt', { [purchase.id]: '1' }), receiptInput)).body;
    const actions = [
        f => f.remakeOrder(command('fault', { [order.id]: '2' }), { orderId: order.id, reason: 'spilled' }),
        f => f.transitionOrder(command('fault', { [order.id]: '2' }), { orderId: order.id, action: 'complete' }),
        f => f.createReceiptDraft(command('fault'), receiptInput),
        f => f.editReceiptDraft(command('fault', { [draft.id]: '1' }), { ...receiptInput, receiptId: draft.id }),
        f => f.confirmReceipt(command('fault', { [draft.id]: '1', [purchase.id]: '2' }), { receiptId: draft.id }),
        f => f.correctReceipt(command('fault', { [confirmed.id]: '2', [purchase.id]: '2' }), { receiptId: confirmed.id, lineId: confirmed.lines[0].id, quantity: '1', reason: 'damaged' }),
        f => f.resolveRefund(command('fault'), { paymentId: payment.id, refundId: refund.id, account: 'merchant', eventId: 'resolved', outcome: 'SUCCEEDED' }),
        f => f.reconcilePayments(command('fault'), { account: 'merchant', date: '2026-11-07', expectedGross: '30', expectedRefunds: '0' }),
    ];
    for (const action of actions) { const { service, repository } = factory(base.repository.snapshot()); const before = repository.snapshot(); repository.injectFault('beforeCommit'); await assert.rejects(action(service), /INJECTED/); assert.deepEqual(repository.snapshot(), before); }
});
module.exports = { factory, command, sale, MockRepository, BusinessWorkflows };
