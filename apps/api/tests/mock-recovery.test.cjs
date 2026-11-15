const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { fork } = require('node:child_process');
const { once } = require('node:events');
require('./phase3-harness.cjs');
const { createMockHttpApp } = require('../src/workflows/http.ts');
const { LocalDevelopmentState, createLocalDevelopmentRepositories } = require('../src/workflows/local-state.ts');
const secret = 'phase5-local-test-signing-secret-over-32-characters';
const env = { DATA_PROVIDER: 'mock', NODE_ENV: 'test', JWT_SECRET: secret };
const clock = () => new Date('2026-11-07T00:00:00Z');
const sale = { productId: 'coffee', servings: '1', amount: '30', omitted: [], effects: [] };
const command = { actorId: 'admin', scope: 'test', key: 'restart', versions: {} };
const proposal = { supplierId: 'supplier', lines: [{ ingredientId: 'beans', quantity: '10', unitCost: '1' }] };
function setup(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cafe-phase5-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const file = path.join(dir, 'state.json');
  const config = { ...env, MOCK_STATE_PERSISTENCE: 'true', MOCK_STATE_PATH: file };
  const create = () => createMockHttpApp({ env: config, clock });
  return { dir, file, config, create };
}

test('Phase 5 recovery: explicit flag restores business data, dates, receipts, Agent state and forgotten memory', async t => {
  const s = setup(t); let runtime = s.create();
  const first = await runtime.business.createOrder(command, sale);
  const memory = await runtime.agent.remember('staff', 'beans inventory');
  const run = await runtime.agent.plan('staff', 'recommend', 1); await runtime.agent.execute(run.id, 'staff');
  await runtime.agent.learn('staff', memory.id);
  const buy = await runtime.agent.plan('staff', 'purchase:' + JSON.stringify(proposal), 2);
  const approval = await runtime.agent.approve(buy.id, 'admin', '2026-11-08Z'); await runtime.agent.revoke(approval.id, 'admin');
  const before = { business: runtime.repository.snapshot(), agent: runtime.agentRepository.snapshot() };
  runtime = s.create(); assert.deepEqual(runtime.repository.snapshot(), before.business); assert.deepEqual(runtime.agentRepository.snapshot(), before.agent);
  assert.ok(runtime.repository.snapshot().lots.early.expirationDate instanceof Date);
  assert.deepEqual(await runtime.business.createOrder(command, sale), first);
  await assert.rejects(runtime.agent.execute(buy.id, 'staff'), /APPROVAL_REQUIRED/);
  assert.equal((await runtime.agent.plan('staff', 'beans inventory', 1)).plan[0].tool, 'inventory.recommend');
  await runtime.agent.forget('staff', memory.id); runtime = s.create();
  assert.deepEqual(await runtime.agent.retrieve('staff', 'beans'), []);
  assert.deepEqual((await runtime.agent.plan('staff', 'beans inventory', 1)).planning.evidence, []);
});

test('Phase 5 recovery: one atomic snapshot for joint Agent/business commit, including failure boundaries', async t => {
  const s = setup(t), runtime = s.create();
  const memory = await runtime.agent.remember('staff', 'beans purchase');
  await runtime.agent.learn('staff', memory.id);
  const run = await runtime.agent.plan('staff', 'purchase:' + JSON.stringify(proposal), 2);
  await runtime.agent.approve(run.id, 'admin', '2026-11-08Z');
  for (const repo of [runtime.repository, runtime.agentRepository]) {
    const bytes = fs.readFileSync(s.file); repo.injectFault('beforeCommit');
    await assert.rejects(runtime.agent.execute(run.id, 'staff'), /INJECTED_beforeCommit/);
    assert.deepEqual(fs.readFileSync(s.file), bytes);
    const rolledBack = s.create();
    assert.equal(Object.keys(rolledBack.repository.snapshot().purchases).length, 0);
    assert.equal(rolledBack.agentRepository.snapshot().memories[memory.id].confidence, 0);
    assert.deepEqual((await rolledBack.agent.plan('staff', 'beans purchase', 2)).planning.evidence, []);
  }
  runtime.agentRepository.injectFault('afterCommit');
  await assert.rejects(runtime.agent.execute(run.id, 'staff'), /INJECTED_afterCommit/);
  const restored = s.create(); const result = await restored.agent.execute(run.id, 'staff');
  assert.equal(result.status, 'SUCCEEDED'); assert.equal(result.spent, 2);
  assert.equal(restored.agentRepository.snapshot().memories[memory.id].provenance[0].executionId, run.id);
  assert.equal(Object.keys(restored.repository.snapshot().purchases).length, 1);
  assert.equal(Object.values(restored.agentRepository.snapshot().approvals)[0].consumed, true);
});

test('Phase 5 recovery: failed atomic replacement retains prior snapshot and unpublished state', async t => {
  const s = setup(t), runtime = s.create(); await runtime.business.createOrder(command, sale);
  const before = runtime.repository.snapshot(), bytes = fs.readFileSync(s.file);
  const rename = fs.renameSync; fs.renameSync = () => { throw new Error('simulated rename failure'); };
  try { await assert.rejects(runtime.business.createOrder({ ...command, key: 'second' }, sale), /simulated rename failure/); }
  finally { fs.renameSync = rename; }
  assert.deepEqual(runtime.repository.snapshot(), before); assert.deepEqual(fs.readFileSync(s.file), bytes);
  assert.deepEqual(fs.readdirSync(s.dir), ['state.json']);
  assert.deepEqual(s.create().repository.snapshot(), before);
});

test('Phase 5 recovery: corruption, incompatible version/contract/runtime rejected without overwriting file', async t => {
  const s = setup(t), runtime = s.create(); await runtime.agent.remember('staff', 'marker');
  const valid = fs.readFileSync(s.file, 'utf8');
  const cases = ['{truncated', JSON.stringify({ ...JSON.parse(valid), checksum: 'wrong' }), ...[
    ['version', 999], ['contract', 'unknown'], ['format', 'foreign'], ['runtime', '0'],
  ].map(([key, value]) => JSON.stringify({ ...JSON.parse(valid), [key]: value }))];
  for (let i = 0; i < cases.length; i++) {
    fs.writeFileSync(s.file, cases[i]); assert.throws(s.create, i < 2 ? /MOCK_STATE_CORRUPT/ : /MOCK_STATE_INCOMPATIBLE/);
    assert.equal(fs.readFileSync(s.file, 'utf8'), cases[i]);
  }
  const adapter = new LocalDevelopmentState(s.file);
  assert.throws(() => adapter.save({ business: {}, agent: {} }), /MOCK_STATE_CORRUPT/);
});

test('Phase 5 recovery: production/provider/relative-path/config conflicts rejected; disabled mode stays in memory', async t => {
  const s = setup(t);
  for (const overrides of [{ NODE_ENV: 'production' }, { NODE_ENV: undefined }, { DATA_PROVIDER: 'postgres' }, { MOCK_STATE_PATH: 'relative.json' }, { MOCK_STATE_PATH: undefined }]) {
    assert.throws(() => createLocalDevelopmentRepositories({ ...s.config, ...overrides }));
  }
  assert.throws(() => createLocalDevelopmentRepositories({ ...env, MOCK_STATE_PERSISTENCE: 'yes' }), /INVALID_MOCK_STATE_PERSISTENCE/);
  assert.throws(() => createMockHttpApp({ env: s.config, repository: s.create().repository }), /CUSTOM_REPOSITORY_CONFLICT/);
  for (const flag of [undefined, 'false']) {
    const options = { env: { ...env, MOCK_STATE_PATH: s.file, MOCK_STATE_PERSISTENCE: flag }, clock };
    const first = createMockHttpApp(options); await first.business.createOrder(command, sale);
    const second = createMockHttpApp(options); assert.equal(Object.keys(second.repository.snapshot().orders).length, 0);
    assert.equal(fs.existsSync(s.file), false);
  }
});

async function start(t, file) {
  const child = fork(path.join(__dirname, 'mock-recovery-process.cjs'), [file], { stdio: ['ignore', 'ignore', 'inherit', 'ipc'] });
  t.after(async () => { if (child.exitCode === null && child.signalCode === null) { const exit = once(child, 'exit'); child.kill(); await exit; } });
  const ready = await Promise.race([once(child, 'message').then(([m]) => m), once(child, 'exit').then(([code]) => { throw new Error('Mock child exited: ' + code); })]);
  return { pid: child.pid, async stop() { const exit = once(child, 'exit'); child.kill(); await exit; }, async call(route, input, key) {
    const response = await fetch(ready.origin + '/api/mock' + route, { method: input === undefined ? 'GET' : 'POST', headers: { Authorization: 'Bearer ' + ready.token, 'Content-Type': 'application/json', ...(key ? { 'Idempotency-Key': key } : {}) }, body: input === undefined ? undefined : JSON.stringify(route.startsWith('/agent/') ? { input } : { input, versions: {} }) });
    const body = await response.json(); assert.equal(response.status, 200, JSON.stringify(body)); return body.data;
  } };
}
test('Phase 5 recovery: real process restart replays business and Agent command receipts without duplicate writes', { timeout: 60000 }, async t => {
  const s = setup(t); let server = await start(t, s.file);
  const input = { amount: '30', items: [{ productId: 'coffee', servings: '1' }] };
  const order = await server.call('/orders', input, 'order-key');
  const memory = await server.call('/agent/memory/remember', { text: 'restart marker' }, 'memory-key');
  const run = await server.call('/agent/plan', { proposal, budget: 2 }, 'plan-key');
  await server.call('/agent/approve', { executionId: run.id, expectedHash: run.hash, expiresAt: '2026-11-08T00:00:00Z' }, 'approval-key');
  const oldPid = server.pid; await server.stop(); server = await start(t, s.file); assert.notEqual(server.pid, oldPid);
  assert.deepEqual(await server.call('/orders', input, 'order-key'), order);
  assert.deepEqual(await server.call('/agent/memory/remember', { text: 'restart marker' }, 'memory-key'), memory);
  assert.deepEqual(await server.call('/agent/plan', { proposal, budget: 2 }, 'plan-key'), run);
  const result = await server.call('/agent/execute', { executionId: run.id }, 'execute-key'); assert.equal(result.status, 'SUCCEEDED');
  await server.stop(); server = await start(t, s.file);
  assert.deepEqual(await server.call('/agent/execute', { executionId: run.id }, 'execute-key'), result);
  assert.equal((await server.call('/views/orders')).length, 1); assert.equal((await server.call('/views/purchases')).purchases.length, 1);
  assert.equal((await server.call('/agent/memory?q=marker')).length, 1); await server.stop();
});
