const { test } = require('node:test');
const assert = require('node:assert/strict');
const { fixture, MockClient, MockCommand, commands } = require('../../api/tests/phase3-harness.cjs');

test('Frontend mock client: explicit provider only; missing auth makes no request; paths cannot escape mock prefix', async () => {
  for (const provider of [undefined, 'postgres', 'legacy']) assert.throws(() => new MockClient(provider, () => 'token'), /MOCK_CLIENT_DISABLED/);
  let calls = 0; const client = new MockClient('mock', () => null, async () => { calls++; });
  await assert.rejects(client.request('/menu'), e => e.status === 401); assert.equal(calls, 0);
  for (const path of ['//remote.test/api', '/../orders', 'https://remote.test/', '/orders#secret']) await assert.rejects(client.request(path), /INVALID_MOCK_PATH/);
});

test('Frontend mock client: decimal strings, bearer auth and command envelopes match real HTTP; punctuation memory queries work', async () => {
  const f = fixture(); const captured = [];
  const client = new MockClient('mock', () => 'test-token', async (url, init) => { captured.push({ url, init }); return { ok: true, status: 200, json: async () => ({ success: true, data: { id: 'result' } }) }; });
  await client.request('/orders', { amount: '30.50' }, 'same-key', { order: '2' });
  assert.equal(captured[0].init.headers.Authorization, 'Bearer test-token'); assert.equal(captured[0].init.headers['Idempotency-Key'], 'same-key');
  assert.deepEqual(JSON.parse(captured[0].init.body), { input: { amount: '30.50' }, versions: { order: '2' } });
  await client.request('/agent/memory/remember', { text: 'milk' }, 'memory-key');
  assert.deepEqual(JSON.parse(captured[1].init.body), { input: { text: 'milk' } });
  assert.deepEqual(await f.api.request('/agent/memory?q=' + encodeURIComponent("milk: !()'~ test")), []);
});

test('Frontend mutation recovery: network ambiguity reuses frozen key/body/version, no automatic retry or duplicated order', async () => {
  const calls = []; const input = { amount: '30', items: [{ productId: 'coffee', servings: '1' }] }; const versions = {};
  const f = fixture(); const api = f.api; const run = api.transport;
  api.transport = async (url, init) => { calls.push(init); const response = await run(url, init); if (calls.length === 1) throw new Error('network dropped after commit'); return response; };
  const command = new MockCommand('/orders', input, versions, 'lost-response'); input.amount = '999'; versions.early = '999';
  await assert.rejects(command.run(api), /network dropped/); assert.equal(calls.length, 1);
  assert.equal((await command.run(api)).amount, '30.00'); assert.equal(calls[1].body, calls[0].body); assert.equal(calls[1].headers['Idempotency-Key'], calls[0].headers['Idempotency-Key']);
  assert.equal((await api.request('/views/orders')).length, 1);
});

test('Frontend form serialization: multi-item omissions and toppings, Agent nested proposals/revisions and approval bodies', () => {
  const create = commands.actions.orders.find(a => a.path === '/orders'); const values = commands.defaults(create.fields);
  values.items[0].omitted = [{ value: 'milk' }]; values.items[0].effects = [{ type: 'ADD', ingredientId: 'beans', baseUnit: 'g', quantity: '2', unit: 'g', active: true }];
  const parsed = commands.payload(create.fields, values); assert.equal(parsed.items[0].servings, '1'); assert.deepEqual(parsed.items[0].omitted, ['milk']); assert.equal(parsed.items[0].effects[0].quantity, '2');
  const transition = commands.actions.orders.find(a => a.path === '/orders/transition'); const next = commands.payload(transition.fields, commands.defaults(transition.fields)); assert.ok(!('itemIds' in next)); assert.ok(!('reason' in next));
  const propose = commands.actions.agent[0]; const proposal = commands.payload(propose.fields, commands.defaults(propose.fields)); assert.equal(proposal.budget, 2); assert.equal(proposal.proposal.lines[0].quantity, '36');
  const revise = commands.actions.agent.find(a => a.path === '/agent/revise'); const revision = commands.payload(revise.fields, commands.defaults(revise.fields)); assert.equal(revision.plan[0].input.supplierId, 'full-supplier');
  const approval = commands.actions.agent.find(a => a.path === '/agent/approve'); const approved = commands.payload(approval.fields, { ...commands.defaults(approval.fields), expectedRevision: '2' }); assert.ok(!('expectedRevision' in approved));
});

test('Frontend replenishment form preserves operator cost strings and rejects duplicate ingredients', () => {
  const plan = commands.actions.agent.find(a => a.label === 'Plan replenishment');
  const values = commands.defaults(plan.fields);
  assert.equal(values.replenishment.unitCosts[0].unitCost, '');
  values.replenishment = { supplierId: 'full-supplier', unitCosts: [
    { ingredientId: 'milk', unitCost: '0.2500' }, { ingredientId: 'beans', unitCost: '0' },
  ] };
  assert.deepEqual(commands.payload(plan.fields, values), {
    budget: 7, replenishment: { supplierId: 'full-supplier', unitCosts: { milk: '0.2500', beans: '0' } },
  });
  values.replenishment.unitCosts.push({ ingredientId: 'milk', unitCost: '0.5' });
  assert.throws(() => commands.payload(plan.fields, values), /one cost per ingredient/);
});

test('Frontend version guards: receipt and purchase versions frozen from visible records; permission gates remain server-side', async () => {
  const data = { receipts: [{ id: 'r', purchaseId: 'p', version: '3' }], purchases: [{ id: 'p', version: '4' }] };
  const guards = commands.versionGuards({ receiptId: 'r' }, data); assert.deepEqual(guards, { r: '3', p: '4' }); data.purchases[0].version = '5'; assert.equal(guards.p, '4');
  const f = fixture(); await assert.rejects(f.client('staff').request('/menu/draft', { productId: 'x', name: 'X', price: '1', yieldQuantity: '1', ingredients: [{ ingredientId: 'beans', quantity: '1', unit: 'g', optional: false }] }, 'staff-write'), e => e.status === 403);
  assert.ok(commands.actions.counts.find(a => a.path === '/counts/approve').admin);
  assert.ok(commands.actions.agent.find(a => a.path === '/agent/approve').admin);
  assert.ok(commands.actions.payments.every(a => a.admin));
});
