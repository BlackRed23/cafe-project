const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { chromium } = require('playwright');
const { fixture, MockClient } = require('../../api/tests/phase3-harness.cjs');
const http = require('node:http');
let vite, browser, origin, apiServer, apiOrigin, active;
before(async () => {
  apiServer = http.createServer((req, res) => active.app(req, res));
  await new Promise(resolve => apiServer.listen(0, '127.0.0.1', resolve));
  apiOrigin = 'http://127.0.0.1:' + apiServer.address().port;
  const root = path.resolve(__dirname, '..');
  process.env.VITE_DATA_PROVIDER = 'mock';
  const { createServer } = await import(pathToFileURL(require.resolve('vite', { paths: [root] })).href);
  vite = await createServer({ root, server: { host: '127.0.0.1', port: 0, proxy: { '/api/mock': { target: apiOrigin, changeOrigin: true } } }, logLevel: 'error' });
  await vite.listen(); origin = 'http://127.0.0.1:' + vite.httpServer.address().port;
  try { browser = await chromium.launch({ headless: true }); }
  catch (error) { if (!error.message.includes("Executable doesn't exist")) throw error; browser = await chromium.launch({ channel: 'msedge', headless: true }); }
}, { timeout: 60000 });
after(async () => { await browser?.close(); await vite?.close(); await new Promise(resolve => apiServer?.close(resolve)); });
async function open(actor = 'admin', target = '/admin/orders', f = fixture()) {
  const context = await browser.newContext(); const unexpected = []; const errors = []; const control = { dropOrderResponse: false, dropAgentResponse: false }; const mutations = [];
  active = f;
  // Assertions use authenticated HTTP too; browser mutations traverse Vite's real proxy.
  f.api = new MockClient('mock', () => f.token('admin'), (url, init) => fetch(apiOrigin + url, init));
  await context.route('**/*', async route => {
    const req = route.request(), url = new URL(req.url());
    if (url.origin !== origin) { unexpected.push(req.url()); return route.abort(); }
    if (url.pathname.startsWith('/api/mock/')) {
      if (req.method() === 'POST') mutations.push({ path: url.pathname, key: req.headers()['idempotency-key'], body: req.postData() });
      if (control.dropOrderResponse && url.pathname === '/api/mock/orders' && req.method() === 'POST') { await route.fetch(); control.dropOrderResponse = false; return route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ success: false, message: 'OPERATION_UNCERTAIN', data: null }) }); }
      if (control.dropAgentResponse && url.pathname === '/api/mock/agent/execute' && req.method() === 'POST') {
        await route.fetch(); control.dropAgentResponse = false;
        return route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ success: false, message: 'OPERATION_UNCERTAIN', data: null }) });
      }
      return route.continue();
    }
    if (url.pathname.startsWith('/api/')) { unexpected.push(req.url()); return route.abort(); }
    return route.continue();
  });
  await context.addInitScript(({ token }) => { if (token && !localStorage.getItem('mock_access_token')) localStorage.setItem('mock_access_token', token); }, { token: actor ? f.token(actor) : null });
  const page = await context.newPage(); page.on('pageerror', e => errors.push(e.message));
  await page.goto(origin + target);
  try { await page.getByRole('heading', { level: 1 }).waitFor({ timeout: 15000 }); }
  catch (err) { const details = { target, url: page.url(), errors, text: (await page.locator('body').innerText()).slice(0, 1500) }; await context.close(); throw new Error(JSON.stringify(details)); }
  return { ...f, page, context, unexpected, errors, control, mutations, async close() { await context.close(); assert.deepEqual(unexpected, [], 'No legacy or external HTTP calls'); assert.deepEqual(errors, [], 'No browser runtime errors'); } };
}
const workflow = async (page, name) => { await page.getByLabel('Workflow', { exact: true }).selectOption({ label: name }); };
const save = async (page, name) => { await page.getByRole('button', { name, exact: true }).click(); await page.getByRole('status').filter({ hasText: 'Saved in mock memory.' }).waitFor(); };
const field = (page, name) => page.getByLabel(name, { exact: true });

test('Frontend browser: local token sign-in, empty orders, validation, staff cannot use payment UI', { timeout: 60000 }, async () => {
  const f = await open(null); const { page } = f;
  try {
    await field(page, 'Local mock bearer token').fill('invalid'); await page.getByRole('button', { name: 'Sign in', exact: true }).click(); await page.getByRole('alert').waitFor();
    await field(page, 'Local mock bearer token').fill(f.token('staff')); await page.getByRole('button', { name: 'Sign in', exact: true }).click(); await page.getByRole('heading', { name: 'Inventory', exact: true }).waitFor();
    await page.getByRole('link', { name: 'Orders', exact: true }).click(); await page.getByText('No records yet.', { exact: true }).waitFor();
    await field(page, 'POS gross total').fill('bad'); assert.equal(await field(page, 'POS gross total').evaluate(e => e.checkValidity()), false);
    await page.getByRole('link', { name: 'Payments & Refunds', exact: true }).click(); await page.getByRole('alert').filter({ hasText: 'Unauthorized' }).waitFor();
  } finally { await f.close(); }
});

test('Frontend browser: existing product page authors/publishes recipe; existing orders page creates/prepares multi-item order', { timeout: 60000 }, async () => {
  const f = await open('admin', '/admin/products/create'); const { page } = f;
  try {
    await field(page, 'Product ID').fill('browser-coffee'); await field(page, 'Name').fill('Browser coffee');
    await save(page, 'Save recipe draft'); await workflow(page, 'Publish recipe'); await field(page, 'Product').fill('browser-coffee'); await save(page, 'Publish recipe');
    await page.getByRole('link', { name: 'Orders', exact: true }).click();
    await field(page, 'Product').fill('browser-coffee'); await page.getByRole('button', { name: 'Add Order items', exact: true }).click(); await field(page, 'Product').nth(1).fill('coffee');
    await field(page, 'POS gross total').fill('60'); await save(page, 'Create order');
    let orders = await f.api.request('/views/orders'); assert.equal(orders.length, 1); assert.equal(orders[0].items.length, 2);
    assert.ok(orders[0].allocations.length > 0); assert.ok(orders[0].allocations.every(a => a.batchId === 'early' && a.terminal === 'RESERVED'));
    await workflow(page, 'Change order state'); await field(page, 'Order').fill(orders[0].id); await save(page, 'Change order state');
    orders = await f.api.request('/views/orders'); assert.equal(orders[0].status, 'PREPARING'); assert.equal(orders[0].costTotal, '3.6');
    assert.ok(orders[0].allocations.some(a => a.terminal === 'CONSUMED')); assert.ok(orders[0].allocations.every(a => a.terminal !== 'RESERVED'));
    await page.screenshot({ path: path.resolve(__dirname, '../../../.task-artifacts/phase3/orders-ui.png'), fullPage: true });
  } finally { await f.close(); }
});

test('Frontend browser: Agent proposal review/ADMIN approval executes PR; Memory Learning remains owner scoped', { timeout: 60000 }, async () => {
  const f = await open('admin', '/admin/agent-logs'); const { page } = f;
  try {
    await workflow(page, 'Plan inventory inspection'); await field(page, 'Inspection').selectOption('recommend'); await save(page, 'Plan inventory inspection');
    const recommendation = (await f.api.request('/agent/executions'))[0];
    await workflow(page, 'Execute approved proposal'); await field(page, 'Proposal').fill(recommendation.id); await save(page, 'Execute approved proposal');
    const inspection = await f.api.request('/agent/executions/' + recommendation.id);
    assert.equal(inspection.toolCalls[0].tool, 'inventory.recommend'); assert.equal(inspection.evaluations[0].passed, true);
    assert.equal((await f.api.request('/views/purchases')).purchases.length, 0);
    await workflow(page, 'Propose purchase');
    await save(page, 'Propose purchase'); const execution = (await f.api.request('/agent/executions')).find(e => e.id !== recommendation.id);
    await workflow(page, 'Approve proposal'); await field(page, 'Proposal').fill(execution.id); await field(page, 'Approval expiry (UTC)').fill('2027-01-01T00:00:00Z');
    assert.equal(await page.getByRole('button', { name: 'Approve proposal', exact: true }).isDisabled(), true);
    await page.getByRole('button', { name: 'Inspect proposal and approval history', exact: true }).click();
    await field(page, 'I reviewed this exact proposal, hash and source versions').check(); await save(page, 'Approve proposal');
    await workflow(page, 'Execute approved proposal'); await field(page, 'Proposal').fill(execution.id); await save(page, 'Execute approved proposal');
    assert.equal((await f.api.request('/views/purchases')).purchases.length, 1);
    await workflow(page, 'Remember'); await field(page, 'Memory text').fill('Review milk reorder weekly'); await save(page, 'Remember');
    const memory = (await f.api.request('/agent/memory?q=milk'))[0];
    await workflow(page, 'Learn memory'); await field(page, 'Memory').fill(memory.id); await save(page, 'Learn memory'); assert.equal((await f.api.request('/agent/memory?q=milk'))[0].learned, true);
    await workflow(page, 'Consolidate memory'); await save(page, 'Consolidate memory');
    await workflow(page, 'Forget memory'); await field(page, 'Memory').fill(memory.id); await save(page, 'Forget memory'); assert.equal((await f.api.request('/agent/memory?q=milk')).length, 0);
  } finally { await f.close(); }
});

const proposalReview = page => page.getByRole('region', { name: 'Proposal review' });
const agentButton = (page, name) => page.getByRole('button', { name, exact: true });
const executionStatus = (page, status) => proposalReview(page).locator('p > strong').filter({ hasText: new RegExp('^' + status + '$') });
async function runReplenishment(page, button) {
  const response = page.waitForResponse(res => res.url().endsWith('/api/mock/agent/execute') && res.request().method() === 'POST');
  await agentButton(page, button).click();
  return (await (await response).json()).data;
}
async function planReplenishment(page) {
  await workflow(page, 'Plan replenishment');
  await field(page, 'Supplier').fill('full-supplier');
  await field(page, 'Ingredient').fill('milk');
  await field(page, 'Cost per base unit').fill('0.25');
  await save(page, 'Plan replenishment');
  await executionStatus(page, 'PLANNED').waitFor();
}
async function openAgentRecord(page, id) {
  const row = page.locator('details').filter({ has: page.locator('summary').filter({ hasText: id }) });
  await row.locator('summary').click();
  await row.getByRole('button', { name: 'Use this record', exact: true }).click();
  await proposalReview(page).waitFor();
}
async function switchAgentActor(f, actor) {
  await f.page.evaluate(token => localStorage.setItem('mock_access_token', token), f.token(actor));
  await f.page.reload();
  await f.page.getByText(actor + '@mock.invalid', { exact: false }).waitFor();
}
async function reviewAndApprove(page, expiresAt) {
  await agentButton(page, 'Review for ADMIN approval').click();
  await field(page, 'Approval expiry (UTC)').fill(expiresAt);
  assert.equal(await agentButton(page, 'Approve proposal').isDisabled(), true);
  await field(page, 'I reviewed this exact proposal, hash and source versions').check();
  await save(page, 'Approve proposal');
  await proposalReview(page).getByText('Approved', { exact: true }).waitFor();
}

test('Phase 8B browser: STAFF and ADMIN complete six steps, verify one receipt, and learn from its verified outcome', { timeout: 60000 }, async () => {
  let time = '2026-11-07T00:00:00Z';
  const f = await open('staff', '/admin/agent-logs', fixture(undefined, undefined, () => new Date(time)));
  const { page } = f;
  try {
    await page.clock.setFixedTime(new Date(time));
    const staff = new MockClient('mock', () => f.token('staff'), (url, init) => fetch(apiOrigin + url, init));
    await workflow(page, 'Remember');
    await field(page, 'Memory text').fill('purchase create');
    await save(page, 'Remember');
    const [memory] = await staff.request('/agent/memory');
    await workflow(page, 'Learn memory');
    await field(page, 'Memory').fill(memory.id);
    await save(page, 'Learn memory');
    assert.equal((await staff.request('/agent/memory'))[0].confidence, 0);

    await planReplenishment(page);
    const [execution] = await f.api.request('/agent/executions');
    const review = proposalReview(page);
    assert.equal(await review.getByRole('list', { name: 'Six execution steps' }).locator(':scope > li').count(), 6);
    assert.match(await review.getByRole('heading', { name: 'Purchase result' }).locator('..').innerText(), /Depends on proposal, approval/);
    await agentButton(page, 'Analyze inventory and request approval').click();
    await review.getByText('Waiting for exact-hash ADMIN approval.', { exact: true }).waitFor();
    assert.equal(await review.getByText('1000.000', { exact: true }).count() > 0, true);
    assert.match(await review.getByRole('heading', { name: 'Recommended quantities and unit costs' }).locator('..').innerText(), /1000[\s\S]*0\.25/);
    assert.equal(await agentButton(page, 'Review for ADMIN approval').count(), 0);
    const ready = (await f.api.request('/agent/executions/' + execution.id)).execution;
    const approve = { executionId: execution.id, expectedHash: ready.hash, expiresAt: '2026-11-08T00:00:00Z' };
    await assert.rejects(staff.request('/agent/approve', approve, 'staff-denied'), e => e.status === 403);
    await assert.rejects(f.api.request('/agent/approve', { ...approve, expectedHash: '0'.repeat(64) }, 'wrong-hash'), e => e.message === 'INVALID_APPROVAL');
    assert.equal((await runReplenishment(page, 'Execute replenishment')).status, 'AWAITING_APPROVAL');
    assert.equal((await f.api.request('/views/purchases')).purchases.length, 0);

    await switchAgentActor(f, 'admin');
    await openAgentRecord(page, execution.id);
    assert.equal(await agentButton(page, 'Execute replenishment').count(), 0);
    await reviewAndApprove(page, approve.expiresAt);
    assert.equal(JSON.parse(f.mutations.find(m => m.path.endsWith('/agent/approve')).body).input.expectedHash, ready.hash);
    time = '2026-11-08T00:00:00Z';
    await page.clock.setFixedTime(new Date(time));
    await agentButton(page, 'Refresh').click();
    await review.getByText('Approval expired. An ADMIN must review and approve again.', { exact: true }).waitFor();
    await switchAgentActor(f, 'staff');
    await openAgentRecord(page, execution.id);
    assert.equal((await runReplenishment(page, 'Execute replenishment')).status, 'AWAITING_APPROVAL');
    assert.equal((await f.api.request('/views/purchases')).purchases.length, 0);

    await switchAgentActor(f, 'admin');
    await openAgentRecord(page, execution.id);
    await reviewAndApprove(page, '2026-11-09T00:00:00Z');
    await switchAgentActor(f, 'staff');
    await openAgentRecord(page, execution.id);
    const contenders = [];
    await page.route('**/api/mock/agent/execute', async route => {
      const responses = await Promise.all([route.fetch(), route.fetch()]);
      for (const response of responses) contenders.push({ status: response.status(), body: await response.json() });
      await route.fulfill({ response: responses[0] });
    }, { times: 1 });
    await agentButton(page, 'Execute replenishment').click();
    await executionStatus(page, 'SUCCEEDED').waitFor();
    assert.equal(contenders.length, 2);
    assert.equal(contenders[0].status, 200);
    assert.deepEqual(contenders[0], contenders[1]);
    const done = await f.api.request('/agent/executions/' + execution.id);
    assert.equal(done.toolCalls.length, 6);
    assert.ok(done.toolCalls.every(call => call.status === 'VERIFIED'));
    const purchases = (await f.api.request('/views/purchases')).purchases;
    assert.equal(purchases.length, 1);
    assert.equal(done.execution.result[5].id, purchases[0].id);
    const purchaseCall = done.toolCalls.find(call => call.tool === 'purchase.create');
    const receipt = f.repository.snapshot().operations[purchaseCall.receipt.key];
    assert.equal(receipt.requestHash, purchaseCall.receipt.requestHash);
    assert.deepEqual(receipt.response.body, done.execution.result[5]);
    const [feedback] = await staff.request('/agent/memory');
    assert.equal(feedback.confidence, 0.9);
    assert.deepEqual(feedback.provenance.map(({ executionId, tool, evaluationIds }) => ({ executionId, tool, evaluationIds })), [{
      executionId: execution.id, tool: 'purchase.create',
      evaluationIds: done.evaluations.filter(e => e.toolCallId === purchaseCall.id && e.passed).map(e => e.id),
    }]);
    assert.ok(feedback.provenance[0].evaluationIds.length);
    assert.deepEqual(await f.api.request('/agent/memory'), []);
    const memoryRow = page.locator('summary').filter({ hasText: 'purchase create' });
    await memoryRow.click();
    await memoryRow.locator('..').getByText('0.9', { exact: true }).waitFor();

    await workflow(page, 'Forget memory');
    await field(page, 'Memory').fill(memory.id);
    await save(page, 'Forget memory');
    assert.deepEqual(await staff.request('/agent/memory'), []);
    await workflow(page, 'Learn memory');
    await field(page, 'Memory').fill(memory.id);
    await agentButton(page, 'Learn memory').click();
    await page.getByRole('alert').filter({ hasText: 'Unauthorized' }).waitFor();
    await field(page, 'Memory').fill('invalid-memory-id');
    const denied = page.waitForResponse(res => res.url().endsWith('/api/mock/agent/memory/learn') && res.status() === 403);
    await agentButton(page, 'Learn memory').click();
    await denied;
    const freshPlan = await staff.request('/agent/plan', { prompt: 'purchase create', budget: 1 }, 'after-forget');
    assert.deepEqual(freshPlan.planning.evidence, []);
  } finally { await f.close(); }
});

test('Phase 8B browser: preparation can be cancelled and another operator cannot inspect it', { timeout: 60000 }, async () => {
  const f = await open('admin', '/admin/agent-logs');
  const { page } = f;
  try {
    await planReplenishment(page);
    const [execution] = await f.api.request('/agent/executions');
    await agentButton(page, 'Analyze inventory and request approval').click();
    await executionStatus(page, 'AWAITING_APPROVAL').waitFor();
    await switchAgentActor(f, 'staff');
    await workflow(page, 'Execute approved proposal');
    await field(page, 'Proposal').fill(execution.id);
    await agentButton(page, 'Inspect proposal and approval history').click();
    await page.getByRole('alert').filter({ hasText: 'Unauthorized' }).waitFor();
    await switchAgentActor(f, 'admin');
    await openAgentRecord(page, execution.id);
    await agentButton(page, 'Cancel this replenishment').click();
    await proposalReview(page).getByText('Replenishment cancelled.', { exact: true }).waitFor();
    assert.equal(await agentButton(page, 'Execute replenishment').count(), 0);
    assert.equal((await f.api.request('/views/purchases')).purchases.length, 0);
    assert.equal((await f.api.request('/agent/executions/' + execution.id)).execution.status, 'CANCELLED');
  } finally { await f.close(); }
});

test('Phase 8B browser: UNKNOWN receipt recovery and transport replay preserve one purchase', { timeout: 60000 }, async () => {
  const f = await open('admin', '/admin/agent-logs');
  const { page } = f;
  let hideReceipt = true;
  function interceptReceipt(port) {
    const atomic = port.atomic.bind(port);
    const receipt = port.purchaseReceipt.bind(port);
    port.atomic = work => atomic((scoped, commit, finish) => work(interceptReceipt(scoped), commit, finish));
    port.purchaseReceipt = (...args) => hideReceipt ? Promise.resolve(undefined) : receipt(...args);
    return port;
  }
  interceptReceipt(f.business);
  try {
    await page.clock.setFixedTime(new Date('2026-11-07T00:00:00Z'));
    await planReplenishment(page);
    const [execution] = await f.api.request('/agent/executions');
    await agentButton(page, 'Analyze inventory and request approval').click();
    await executionStatus(page, 'AWAITING_APPROVAL').waitFor();
    await reviewAndApprove(page, '2026-11-08T00:00:00Z');
    await agentButton(page, 'Execute replenishment').click();
    await proposalReview(page).getByRole('alert').filter({ hasText: 'Purchase outcome UNKNOWN' }).waitFor();
    const [committed] = (await f.api.request('/views/purchases')).purchases;
    assert.ok(committed);

    assert.equal((await runReplenishment(page, 'Recover purchase receipt')).status, 'UNKNOWN');
    await proposalReview(page).getByRole('alert').filter({ hasText: 'Purchase outcome UNKNOWN' }).waitFor();
    assert.equal((await f.api.request('/agent/executions/' + execution.id)).execution.status, 'UNKNOWN');
    hideReceipt = false;
    f.control.dropAgentResponse = true;
    await agentButton(page, 'Recover purchase receipt').click();
    await page.getByRole('alert').filter({ hasText: 'Inputs are frozen' }).waitFor();
    await page.reload();
    await agentButton(page, 'Retry same operation').click();
    await page.getByRole('status').filter({ hasText: 'Retried the original command with the same key.' }).waitFor();
    await executionStatus(page, 'SUCCEEDED').waitFor();
    const [recovery, replay] = f.mutations.filter(m => m.path.endsWith('/agent/execute')).slice(-2);
    assert.deepEqual(recovery, replay);
    const done = await f.api.request('/agent/executions/' + execution.id);
    assert.equal(done.audit.filter(entry => entry.tool === 'purchase.create' && entry.status === 'DISPATCHED').length, 1);
    assert.equal(done.execution.result[5].id, committed.id);
    assert.equal((await f.api.request('/views/purchases')).purchases.length, 1);
  } finally { await f.close(); }
});

test('Frontend browser: uncertain operation survives reload and replays same key without duplicate order', { timeout: 60000 }, async () => {
  const f = await open(); const { page } = f;
  try {
    f.control.dropOrderResponse = true;
    await page.getByRole('button', { name: 'Create order', exact: true }).click();
    await page.getByText(/Result uncertain\. Inputs are frozen/).waitFor();
    assert.equal(await field(page, 'POS gross total').isDisabled(), true);
    await page.reload(); await page.getByText(/Result uncertain\. Inputs are frozen/).waitFor();
    await save(page, 'Retry same operation');
    assert.equal((await f.api.request('/views/orders')).length, 1);
    const calls = f.mutations.filter(m => m.path === '/api/mock/orders'); assert.equal(calls.length, 2); assert.deepEqual(calls[0], calls[1]);
  } finally { await f.close(); }
});

test('Frontend browser: purchasing/receipt, own-count approval reason, payment/refund and reconciliation use connected pages', { timeout: 60000 }, async () => {
  const f = await open('admin', '/admin/purchase-requests'); const { page } = f;
  try {
    await workflow(page, 'Create purchase request'); await field(page, 'Ingredient').fill('milk'); await field(page, 'Base quantity').fill('1000'); await field(page, 'Cost per base unit').fill('0.02');
    await page.getByRole('button', { name: 'Add Purchase lines', exact: true }).click(); await field(page, 'Ingredient').nth(1).fill('beans'); await save(page, 'Create purchase request');
    const purchase = (await f.api.request('/views/purchases')).purchases[0];
    assert.equal(purchase.lines.length, 2);
    await workflow(page, 'Draft receipt'); await field(page, 'Purchase').fill(purchase.id); await field(page, 'Ingredient').fill('milk'); await field(page, 'Base quantity').fill('1000');
    await page.getByRole('button', { name: 'Add Received lots', exact: true }).click(); await field(page, 'Ingredient').nth(1).fill('beans'); await save(page, 'Draft receipt');
    const receipt = (await f.api.request('/views/purchases')).receipts[0];
    await workflow(page, 'Confirm receipt'); await field(page, 'Receipt').fill(receipt.id); await save(page, 'Confirm receipt');
    const purchases = await f.api.request('/views/purchases'); const confirmed = purchases.receipts[0]; assert.equal(confirmed.lines.length, 2);
    const inventory = await f.api.request('/inventory'); assert.ok(inventory.some(l => l.ingredientId === 'milk' && Number(l.remaining) === 1000));
    await workflow(page, 'Register mock supplier payment'); await field(page, 'Purchase').fill(purchase.id); await field(page, 'Paid amount').fill('23.6'); await field(page, 'Reason').fill('Phase 4 bookkeeping'); await save(page, 'Register mock supplier payment');
    const beanLine = confirmed.lines.find(l => l.ingredientId === 'beans');
    await workflow(page, 'Correct received stock'); await field(page, 'Receipt').fill(receipt.id); await field(page, 'Receipt line ID').fill(beanLine.id); await field(page, 'Correction quantity').fill('36'); await field(page, 'Reason').fill('Return unused beans'); await save(page, 'Correct received stock');
    assert.equal((await f.api.request('/views/purchases')).balances[0].supplierCredit, '3.60');
    await workflow(page, 'Resolve supplier credit'); await field(page, 'Source purchase').fill(purchase.id); await field(page, 'Credit amount').fill('3.6'); await field(page, 'Reason').fill('Supplier refund bookkeeping'); await save(page, 'Resolve supplier credit');
    assert.equal((await f.api.request('/views/purchases')).balances[0].supplierCredit, '0.00');
    await page.getByRole('link', { name: 'Orders', exact: true }).click(); await field(page, 'Product').fill('latte'); await save(page, 'Create order'); const order = (await f.api.request('/views/orders'))[0];
    await workflow(page, 'Change order state'); await field(page, 'Order').fill(order.id); await save(page, 'Change order state'); await field(page, 'Action').selectOption('complete'); await save(page, 'Change order state');
    await page.getByRole('link', { name: 'Stock Counts', exact: true }).click(); await field(page, 'Actual physical quantity').fill('80'); await save(page, 'Create stock count'); const count = (await f.api.request('/views/counts'))[0];
    await workflow(page, 'Submit count'); await field(page, 'Stock count').fill(count.id); await save(page, 'Submit count');
    await workflow(page, 'Approve count'); await field(page, 'Stock count').fill(count.id); await page.getByRole('button', { name: 'Approve count', exact: true }).click(); await page.getByRole('alert').filter({ hasText: 'SELF_APPROVAL_REASON_REQUIRED' }).waitFor();
    await field(page, 'Reason if approving own count').fill('Admin manually checked physical balance'); await save(page, 'Approve count');
    await page.getByRole('link', { name: 'Payments & Refunds', exact: true }).click(); await field(page, 'Order').fill(order.id); await save(page, 'Create payment attempt'); const payment = (await f.api.request('/views/payments')).payments[0];
    await workflow(page, 'Inject mock settlement'); await field(page, 'Payment').fill(payment.id); await field(page, 'Unique event ID').fill('browser-settle'); await save(page, 'Inject mock settlement');
    await workflow(page, 'Request refund'); await field(page, 'Payment').fill(payment.id); await field(page, 'Amount').fill('5'); await save(page, 'Request refund'); const refund = (await f.api.request('/payments/' + payment.id)).refundAttempts[0];
    await workflow(page, 'Resolve refund event'); await field(page, 'Payment').fill(payment.id); await field(page, 'Refund ID').fill(refund.id); await field(page, 'Unique event ID').fill('browser-refund'); await field(page, 'Outcome').selectOption('SUCCEEDED'); await save(page, 'Resolve refund event');
    await workflow(page, 'Reconcile account / UTC date'); await field(page, 'Expected refunds').fill('5'); await save(page, 'Reconcile account / UTC date');
    assert.equal((await f.api.request('/views/payments')).reconciliations[0].status, 'MATCHED'); const approved = (await f.api.request('/views/counts'))[0]; assert.equal(approved.status, 'APPROVED'); assert.equal(Number(approved.lines[0].variance), -2);
  } finally { await f.close(); }
});

test('Frontend browser: HTTP fault rollback, frozen retry and concurrent replay retain one order', { timeout: 60000 }, async () => {
  const f = await open(); const { page } = f;
  try {
    const before = f.repository.snapshot(); f.repository.injectFault('beforeCommit');
    await page.getByRole('button', { name: 'Create order', exact: true }).click();
    await page.getByText(/Result uncertain\. Inputs are frozen/).waitFor();
    assert.deepEqual(f.repository.snapshot(), before);
    await save(page, 'Retry same operation');
    const results = await page.evaluate(async () => {
      const headers = { Authorization: 'Bearer ' + localStorage.getItem('mock_access_token'), 'Content-Type': 'application/json', 'Idempotency-Key': 'browser-race' };
      const body = JSON.stringify({ input: { amount: '30', items: [{ productId: 'coffee', servings: '1' }] }, versions: {} });
      return Promise.all(Array.from({ length: 4 }, async () => {
        const response = await fetch('/api/mock/orders', { method: 'POST', headers, body });
        return { status: response.status, body: await response.json() };
      }));
    });
    assert.equal(results[0].status, 200); results.forEach(r => assert.deepEqual(r, results[0]));
    assert.equal((await f.api.request('/views/orders')).length, 2);
    assert.equal(f.mutations.filter(m => m.key === 'browser-race').length, 4);
  } finally { await f.close(); }
});
