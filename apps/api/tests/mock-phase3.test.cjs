const { test } = require('node:test');
const assert = require('node:assert/strict');
const { fixture, MockCommand } = require('./phase3-harness.cjs');
const draft = { productId: 'espresso', name: 'Espresso', price: '25', yieldQuantity: '1', ingredients: [{ ingredientId: 'beans', quantity: '12', unit: 'g', optional: false }] };
const proposal = { supplierId: 'full-supplier', lines: [{ ingredientId: 'milk', quantity: '1000', unitCost: '0.02' }] };
const expiry = '2027-02-01T00:00:00Z';
const sale = (productId = 'coffee') => ({ amount: '30', items: [{ productId, servings: '1' }] });
const rejects = (work, status, code) => assert.rejects(work, e => e.status === status && (!code || e.message === code));

test('Phase 3 HTTP Menu: draft privacy, publish, version guard, replay, frozen historical recipe', async () => {
  const f = fixture();
  const d = await f.write('/menu/draft', draft);
  assert.equal(d.active, false);
  assert.ok(!(await f.client('staff').request('/menu')).some(p => p.id === draft.productId));
  await rejects(() => f.write('/orders', sale('espresso')), 400, 'INVALID_RECIPE');
  const published = await f.write('/menu/publish', { productId: d.id }, { [d.id]: d.version }, 'admin', 'publish');
  assert.equal(published.active, true);
  assert.deepEqual(await f.write('/menu/publish', { productId: d.id }, { [d.id]: d.version }, 'admin', 'publish'), published);
  const order = await f.write('/orders', sale('espresso'));
  assert.equal(order.snapshot.requirements[0].quantity, '12');
  const updated = await f.write('/menu/draft', { ...draft, name: 'New espresso', ingredients: [{ ...draft.ingredients[0], quantity: '20' }] }, { espresso: published.version });
  const staffCatalog = (await f.client('staff').request('/menu')).find(p => p.id === 'espresso');
  assert.equal(staffCatalog.name, 'Espresso'); assert.equal(staffCatalog.draft, null);
  await rejects(() => f.write('/menu/publish', { productId: d.id }, { espresso: published.version }), 409, 'STALE_VERSION');
  await f.write('/menu/publish', { productId: d.id }, { espresso: updated.version });
  const prepared = await f.write('/orders/transition', { orderId: order.id, action: 'prepare' }, { [order.id]: order.version });
  assert.equal(prepared.snapshot.requirements[0].quantity, '12');
  assert.equal((await f.write('/orders', sale('espresso'))).snapshot.requirements[0].quantity, '20');
  assert.equal((await f.api.request('/recipes/espresso')).length, 2);
});

test('Phase 3 HTTP authoring: dimensions, duplicate/inactive ingredient, yield and money validation; ADMIN only', async () => {
  const f = fixture(); const before = f.repository.snapshot();
  await rejects(() => f.write('/menu/draft', draft, {}, 'staff'), 403);
  await rejects(() => f.write('/menu/draft', draft, {}, 'customer'), 403);
  assert.deepEqual(f.repository.snapshot(), before);
  for (const invalid of [{ ...draft, yieldQuantity: '0' }, { ...draft, price: '0' }, { ...draft, ingredients: [...draft.ingredients, ...draft.ingredients] }, { ...draft, ingredients: [{ ...draft.ingredients[0], unit: 'ml' }] }]) await rejects(() => f.write('/menu/draft', invalid), 400);
  assert.deepEqual(f.repository.snapshot().menu, before.menu);
  assert.deepEqual(f.repository.snapshot().recipes, before.recipes);
  const seed = before; seed.ingredients.beans.active = false;
  await rejects(() => fixture(seed).write('/menu/draft', draft), 400);
});

test('Phase 3 Menu rollback: atomic recipes/menu/history, infrastructure rollback, unknown commit lookup', async () => {
  const f = fixture(); const d = await f.write('/menu/draft', draft); const before = f.repository.snapshot();
  const command = new MockCommand('/menu/publish', { productId: d.id }, { [d.id]: d.version }, 'publish-fault');
  f.repository.injectFault('write', 2);
  await rejects(() => command.run(f.api), 503, 'OPERATION_UNCERTAIN');
  assert.deepEqual(f.repository.snapshot(), before);
  f.repository.injectFault('afterCommit'); const published = await command.run(f.api);
  assert.equal(published.active, true);
  assert.deepEqual(await command.run(f.api), published);
  assert.equal(f.repository.snapshot().recipes.espresso.length, 1);
  const restored = fixture(f.repository.snapshot()); assert.deepEqual(await command.run(restored.api), published);
});

test('Phase 3 HTTP queries: empty states, current auth, role boundaries and detached records', async () => {
  const f = fixture();
  assert.equal((await f.api.request('/session')).role, 'ADMIN');
  for (const path of ['/menu', '/views/inventory', '/views/orders', '/views/purchases', '/views/counts', '/views/payments', '/agent/executions']) {
    assert.ok(await f.api.request(path)); await rejects(() => f.client('customer').request(path), 403);
  }
  assert.deepEqual(await f.client('staff').request('/views/orders'), []);
  await rejects(() => f.client('staff').request('/views/payments'), 403);
  const menu = await f.api.request('/menu'); menu[0].name = 'mutated';
  assert.equal((await f.api.request('/menu'))[0].name, 'Coffee');
  const seed = f.repository.snapshot(); seed.principals.admin.active = false;
  await rejects(() => fixture(seed).api.request('/views/orders'), 403);
});

test('Phase 3 HTTP purchasing: split receipt, payable, partial supplier settlement, credit and replay', async () => {
  const f = fixture();
  const p = await f.write('/purchases', proposal);
  const r = await f.write('/receipts/draft', { purchaseId: p.id, lines: [{ ingredientId: 'milk', quantity: '400', expirationDate: expiry }, { ingredientId: 'milk', quantity: '600', expirationDate: expiry }] });
  const confirmed = await f.write('/receipts/confirm', { receiptId: r.id }, { [r.id]: r.version, [p.id]: p.version });
  let view = await f.api.request('/views/purchases'); let current = view.purchases[0];
  assert.equal(view.balances[0].payable, '20.00');
  await rejects(() => f.write('/purchases/settle', { purchaseId: p.id, amount: '5', reason: 'Paid locally' }, { [p.id]: current.version }, 'staff'), 403);
  const paid = await f.write('/purchases/settle', { purchaseId: p.id, amount: '15', reason: 'Mock cash' }, { [p.id]: current.version }, 'admin', 'supplier-pay');
  assert.equal(paid.balance.balance, '5.00');
  assert.deepEqual(await f.write('/purchases/settle', { purchaseId: p.id, amount: '15', reason: 'Mock cash' }, { [p.id]: current.version }, 'admin', 'supplier-pay'), paid);
  await rejects(() => f.write('/purchases/settle', { purchaseId: p.id, amount: '6', reason: 'Overpay' }, { [p.id]: paid.purchase.version }), 400);
  await f.write('/receipts/correct', { receiptId: confirmed.id, lineId: confirmed.lines[0].id, quantity: '400', reason: 'Return damaged bottle split' }, { [confirmed.id]: confirmed.version, [p.id]: paid.purchase.version });
  view = await f.api.request('/views/purchases'); assert.equal(view.balances[0].supplierCredit, '3.00');
  assert.equal(view.purchases[0].settlements.length, 1);
});

test('Phase 3 full application scenario: Agent proposal → ADMIN approval → one PR → receipt → latte → count → payment/refund', async () => {
  const f = fixture(); const staff = f.client('staff');
  const e = await f.write('/agent/plan', { proposal, budget: 2 }, {}, 'staff');
  assert.equal((await f.api.request('/agent/executions'))[0].id, e.id);
  assert.equal((await staff.request('/agent/executions'))[0].id, e.id);
  await rejects(() => f.write('/agent/execute', { executionId: e.id }, {}, 'staff'), 409);
  await rejects(() => f.write('/agent/approve', { executionId: e.id, expectedHash: e.hash, expiresAt: expiry }, {}, 'staff'), 403);
  await f.write('/agent/approve', { executionId: e.id, expectedHash: e.hash, expiresAt: expiry });
  const executed = await f.write('/agent/execute', { executionId: e.id }, {}, 'staff', 'execute-once');
  assert.equal(executed.status, 'SUCCEEDED');
  assert.deepEqual(await f.write('/agent/execute', { executionId: e.id }, {}, 'staff', 'execute-once'), executed);
  const inbox = await staff.request('/agent/executions/' + e.id); assert.equal(inbox.toolCalls.length, 1); assert.equal(inbox.evaluations[0].passed, true);
  const pv = await staff.request('/views/purchases'); assert.equal(pv.purchases.length, 1); const p = pv.purchases[0];
  await f.write('/receipts/receive', { purchaseId: p.id, lines: [{ ingredientId: 'milk', quantity: '1000', expirationDate: expiry }] }, { [p.id]: p.version }, 'staff');
  const order = await f.write('/orders', sale('latte'), {}, 'staff');
  const prepared = await f.write('/orders/transition', { orderId: order.id, action: 'prepare' }, { [order.id]: order.version }, 'staff');
  assert.equal(prepared.costTotal, '4.8');
  await f.write('/orders/transition', { orderId: order.id, action: 'complete' }, { [order.id]: prepared.version }, 'staff');
  const count = await f.write('/counts', { lines: [{ batchId: 'early', actual: '82' }] }, {}, 'staff');
  await f.write('/counts/submit', { countId: count.id }, {}, 'staff');
  await rejects(() => f.write('/counts/approve', { countId: count.id, selfApprovalReason: '' }, {}, 'staff'), 403);
  await f.write('/counts/approve', { countId: count.id, selfApprovalReason: '' });
  const payment = await f.write('/payments/attempt', { orderId: order.id, account: 'cash' });
  await f.write('/payments/settle', { paymentId: payment.id, account: 'cash', eventId: 'settled', amount: '30', outcome: 'SETTLED' });
  const refund = await f.write('/refunds/request', { paymentId: payment.id, amount: '5' });
  await f.write('/refunds/resolve', { paymentId: payment.id, refundId: refund.id, account: 'cash', eventId: 'refunded', outcome: 'SUCCEEDED' });
  const reconciliation = await f.write('/payments/reconcile', { account: 'cash', date: '2026-11-07', expectedGross: '30', expectedRefunds: '5' });
  assert.equal(reconciliation.status, 'MATCHED');
});

test('Phase 3 Agent inbox/memory: admin review, staff isolation, revision invalidates approval, all memory methods', async () => {
  let f = fixture(); const own = await f.write('/agent/plan', { proposal, budget: 2 });
  assert.equal((await f.client('staff').request('/agent/executions')).length, 0);
  await rejects(() => f.client('staff').request('/agent/executions/' + own.id), 403);
  const planned = await f.write('/agent/plan', { proposal, budget: 2 }, {}, 'staff');
  await f.write('/agent/approve', { executionId: planned.id, expectedHash: planned.hash, expiresAt: expiry });
  const revised = await f.write('/agent/revise', { executionId: planned.id, expectedRevision: planned.revision, plan: [{ tool: 'purchase.create', input: proposal }] }, {}, 'staff');
  assert.notEqual(revised.hash, planned.hash);
  await rejects(() => f.write('/agent/execute', { executionId: planned.id }, {}, 'staff'), 409);
  const memory = await f.write('/agent/memory/remember', { text: 'milk bottle reorder' }, {}, 'staff');
  assert.equal((await f.write('/agent/memory/learn', { memoryId: memory.id }, {}, 'staff')).learned, true);
  assert.equal((await f.client('staff').request('/agent/memory?q=milk')).length, 1);
  assert.equal((await f.api.request('/agent/memory?q=milk')).length, 0);
  await f.write('/agent/memory/consolidate', {}, {}, 'staff');
  await f.write('/agent/memory/forget', { memoryId: memory.id }, {}, 'staff');
  assert.equal((await f.client('staff').request('/agent/memory?q=milk')).length, 0);
  const seed = f.repository.snapshot(); seed.principals.admin.role = 'STAFF'; f = fixture(seed, f.agentRepository.snapshot());
  assert.equal((await f.api.request('/agent/executions')).length, 1);
});

test('Phase 3 Backend: concurrent publish uses one version winner; archive blocks new orders and preserves reservations', async () => {
  const f = fixture(); const command = (key, versions = {}, actorId = 'admin') => ({ key, versions, actorId, scope: 'backend.phase3' });
  const draftResult = await f.business.saveMenuDraft(command('draft'), draft); const d = draftResult.body;
  const outcomes = await Promise.all([f.business.publishMenu(command('a', { [d.id]: d.version }), { productId: d.id }), f.business.publishMenu(command('b', { [d.id]: d.version }), { productId: d.id })]);
  assert.deepEqual(outcomes.map(r => r.status).sort(), [200, 409]);
  const published = outcomes.find(r => r.status === 200).body;
  const order = await f.write('/orders', sale('espresso'));
  const archived = await f.business.archiveMenu(command('archive', { [published.id]: published.version }), { productId: published.id });
  assert.equal(archived.status, 200);
  await rejects(() => f.write('/orders', sale('espresso')), 400, 'INVALID_RECIPE');
  assert.equal((await f.write('/orders/transition', { orderId: order.id, action: 'prepare' }, { [order.id]: order.version })).status, 'PREPARING');
  assert.equal(f.repository.snapshot().recipes.espresso.length, 1);
});

test('Phase 3 Backend supplier payment: rollback includes payable history; after-commit replay creates one settlement', async () => {
  const f = fixture(); const p = await f.write('/purchases', proposal);
  await f.write('/receipts/receive', { purchaseId: p.id, lines: [{ ingredientId: 'milk', quantity: '1000', expirationDate: expiry }] }, { [p.id]: p.version });
  const current = (await f.api.request('/views/purchases')).purchases[0]; const before = f.repository.snapshot();
  const c = { actorId: 'admin', key: 'settle-backend', scope: 'backend.phase3', versions: { [p.id]: current.version } };
  const input = { purchaseId: p.id, amount: '20', reason: 'Mock settlement' };
  f.repository.injectFault('beforeCommit'); await assert.rejects(f.business.settlePurchase(c, input), /INJECTED_beforeCommit/); assert.deepEqual(f.repository.snapshot(), before);
  f.repository.injectFault('afterCommit'); const applied = await f.business.settlePurchase(c, input); assert.equal(applied.status, 200);
  assert.deepEqual(await f.business.settlePurchase(c, input), applied);
  assert.equal((await f.api.request('/views/purchases')).purchases[0].settlements.length, 1);
  assert.equal(applied.body.balance.balance, '0.00');
});

test('Phase 3 Backend receipt payable conserves cents across split lots', async () => {
  const f = fixture(); const p = await f.write('/purchases', { supplierId: 'supplier', lines: [{ ingredientId: 'beans', quantity: '2', unitCost: '0.005' }] });
  await f.write('/receipts/receive', { purchaseId: p.id, lines: [{ ingredientId: 'beans', quantity: '1', expirationDate: expiry }, { ingredientId: 'beans', quantity: '1', expirationDate: expiry }] }, { [p.id]: p.version });
  assert.equal((await f.api.request('/views/purchases')).balances[0].payable, '0.01');
});

test('Phase 3 HTTP ADMIN replay boundary: role downgrade with retained grants cannot replay authoring or supplier settlement', async () => {
  let f = fixture(); const d = await f.write('/menu/draft', draft, {}, 'admin', 'admin-draft');
  const p = await f.write('/purchases', proposal); await f.write('/receipts/receive', { purchaseId: p.id, lines: [{ ingredientId: 'milk', quantity: '1000', expirationDate: expiry }] }, { [p.id]: p.version });
  const current = (await f.api.request('/views/purchases')).purchases[0]; const settlement = { purchaseId: p.id, amount: '1', reason: 'Mock paid' }; const versions = { [p.id]: current.version };
  await f.write('/purchases/settle', settlement, versions, 'admin', 'admin-payment');
  const seed = f.repository.snapshot(); seed.principals.admin.role = 'STAFF'; f = fixture(seed);
  await rejects(() => f.write('/menu/draft', draft, {}, 'admin', 'admin-draft'), 403);
  await rejects(() => f.write('/menu/publish', { productId: d.id }, { [d.id]: d.version }), 403);
  await rejects(() => f.write('/purchases/settle', settlement, versions, 'admin', 'admin-payment'), 403);
});

test('Phase 3 supplier credit: same-supplier transfer atomic with rollback/replay; refund limits, cross-supplier and role boundaries', async () => {
  const f = fixture();
  async function received(supplierId = 'supplier') {
    const p = await f.write('/purchases', { supplierId, lines: [{ ingredientId: 'beans', quantity: '10', unitCost: '1' }] });
    const receipt = await f.write('/receipts/receive', { purchaseId: p.id, lines: [{ ingredientId: 'beans', quantity: '10', expirationDate: expiry }] }, { [p.id]: p.version });
    return { purchase: (await f.api.request('/views/purchases')).purchases.find(row => row.id === p.id), receipt };
  }
  const source = await received();
  const paid = await f.write('/purchases/settle', { purchaseId: source.purchase.id, amount: '10', reason: 'Mock paid' }, { [source.purchase.id]: source.purchase.version });
  await f.write('/receipts/correct', { receiptId: source.receipt.id, lineId: source.receipt.lines[0].id, quantity: '10', reason: 'Returned whole shipment' }, { [source.receipt.id]: source.receipt.version, [source.purchase.id]: paid.purchase.version });
  const target = await received(); const other = await received('full-supplier');
  const input = { purchaseId: source.purchase.id, targetPurchaseId: target.purchase.id, amount: '6', reason: 'Apply supplier credit' };
  const view = await f.api.request('/views/purchases'); const current = view.purchases.find(p => p.id === source.purchase.id);
  const guards = { [current.id]: current.version, [target.purchase.id]: target.purchase.version };
  await rejects(() => f.write('/purchases/credit', input, guards, 'staff'), 403);
  await rejects(() => f.write('/purchases/credit', { ...input, targetPurchaseId: other.purchase.id }, { ...guards, [other.purchase.id]: other.purchase.version }), 400, 'INVALID_CREDIT_TRANSFER');
  const before = f.repository.snapshot(); f.repository.injectFault('write', 2);
  await rejects(() => f.write('/purchases/credit', input, guards, 'admin', 'credit-once'), 503); assert.deepEqual(f.repository.snapshot(), before);
  f.repository.injectFault('afterCommit'); const moved = await f.write('/purchases/credit', input, guards, 'admin', 'credit-once');
  assert.equal(moved.sourceBalance.supplierCredit, '4.00'); assert.equal(moved.targetBalance.balance, '4.00');
  assert.deepEqual(await f.write('/purchases/credit', input, guards, 'admin', 'credit-once'), moved);
  const refund = { purchaseId: current.id, amount: '4', reason: 'Supplier returned remaining cash' };
  await rejects(() => f.write('/purchases/credit', { ...refund, amount: '5' }, { [current.id]: moved.source.version }), 400, 'INVALID_SUPPLIER_CREDIT');
  const refunded = await f.write('/purchases/credit', refund, { [current.id]: moved.source.version }); assert.equal(refunded.sourceBalance.supplierCredit, '0.00'); assert.equal(refunded.sourceBalance.paid, '0.00');
  const transfers = (await f.api.request('/views/purchases')).purchases.find(p => p.id === target.purchase.id).settlements; assert.equal(transfers.length, 1); assert.equal(transfers[0].kind, 'CREDIT_IN');
});

test('Phase 3 payable corrections conserve cents across repeated fractional-price returns', async () => {
  const f = fixture(); const purchase = await f.write('/purchases', { supplierId: 'supplier', lines: [{ ingredientId: 'beans', quantity: '2', unitCost: '0.005' }] });
  let receipt = await f.write('/receipts/receive', { purchaseId: purchase.id, lines: [{ ingredientId: 'beans', quantity: '2', expirationDate: expiry }] }, { [purchase.id]: purchase.version });
  for (let i = 0; i < 2; i++) {
    const current = (await f.api.request('/views/purchases')).purchases[0];
    receipt = await f.write('/receipts/correct', { receiptId: receipt.id, lineId: receipt.lines[0].id, quantity: '1', reason: 'Return one unit' }, { [receipt.id]: receipt.version, [purchase.id]: current.version });
  }
  const balance = (await f.api.request('/views/purchases')).balances[0]; assert.equal(balance.payable, '0.00'); assert.equal(balance.supplierCredit, '0.00');
  assert.equal(receipt.corrections.reduce((sum, c) => sum + Math.round(Number(c.payableDelta) * 100), 0), -1);
});
