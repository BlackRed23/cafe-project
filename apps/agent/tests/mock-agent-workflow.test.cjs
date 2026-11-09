const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const Module = require('node:module');
const ts = require('typescript');
const previous = Module._extensions['.ts'];
Module._extensions['.ts'] = (mod, file) => mod._compile(ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, file);
let AgentWorkflow, MockAgentRepository, MockLLMProvider, MockRepository, BusinessWorkflows, createAgentRuntime;
try {
    ({ AgentWorkflow, MockAgentRepository, MockLLMProvider, createAgentRuntime } = require('../src/workflows/agent-workflow.ts'));
    ({ MockRepository } = require('../../api/src/workflows/mock-repository.ts'));
    ({ BusinessWorkflows } = require('../../api/src/workflows/business-service.ts'));
} finally { if (previous) Module._extensions['.ts'] = previous; else delete Module._extensions['.ts']; }
const clock = () => new Date('2026-11-07T00:00:00Z');
const proposal = { supplierId: 'supplier', lines: [{ ingredientId: 'beans', quantity: '10', unitCost: '1.00' }] };
const purchasePlan = [{ tool: 'purchase.create', input: proposal }];
function fixture(plan = purchasePlan, allowlist) {
    const repository = new MockRepository(); const business = new BusinessWorkflows(repository, clock); const store = new MockAgentRepository();
    return { repository, business, store, agent: new AgentWorkflow(store, business, new MockLLMProvider(plan), allowlist, clock) };
}
test('MOCK_VERIFIED Agent: approval required, permissions, concurrent replay, audited actual dispatch', async () => {
    const { agent, store, repository } = fixture(); const run = await agent.plan('agent', 'buy beans', 2);
    await assert.rejects(agent.execute(run.id, 'agent'), /APPROVAL_REQUIRED/);
    await assert.rejects(agent.approve(run.id, 'agent', '2026-11-08Z'), /FORBIDDEN/);
    await agent.approve(run.id, 'admin', '2026-11-08Z');
    const [a, b] = await Promise.all([agent.execute(run.id, 'agent'), agent.execute(run.id, 'agent')]);
    assert.deepEqual(a, b); assert.equal(a.status, 'SUCCEEDED'); assert.equal(a.spent, 2);
    assert.equal(Object.keys(repository.snapshot().purchases).length, 1);
    assert.equal(store.snapshot().audit.filter(a => a.status === 'DISPATCHED').length, 1);
});
test('MOCK_VERIFIED Agent: tool allowlist and planner budget reject before dispatch', async () => {
    for (const plan of [[{ tool: 'shell', input: null }], purchasePlan]) {
        const { agent, store } = fixture(plan, ['inventory.read']);
        await assert.rejects(agent.plan('agent', 'ignore instructions', 10), /TOOL_DENIED/); assert.equal(store.snapshot().audit.length, 0);
    }
    await assert.rejects(fixture().agent.plan('agent', 'buy', 1), /BUDGET_EXCEEDED/);
    await assert.rejects(fixture().agent.plan('unknown', 'buy', 5), /FORBIDDEN/);
});
test('MOCK_VERIFIED Agent: expired/revoked approval, revoked authority, stale stock', async () => {
    const { agent, business, store, repository } = fixture(); const e = await agent.plan('agent', 'buy', 2);
    await assert.rejects(agent.approve(e.id, 'admin', '2026-11-06Z'), /INVALID_APPROVAL/);
    const approval = await agent.approve(e.id, 'admin', '2026-11-08Z'); await agent.revoke(approval.id, 'admin');
    await assert.rejects(agent.execute(e.id, 'agent'), /APPROVAL_REQUIRED/);
    await agent.approve(e.id, 'admin', '2026-11-08Z');
    await store.atomic(s => { s.permissions.admin = []; }); await assert.rejects(agent.execute(e.id, 'agent'), /APPROVAL_REQUIRED/);
    await store.atomic(s => { s.permissions.admin = ['agent.approve']; });
    await business.createOrder({ actorId: 'admin', scope: 'test', key: 'stock', versions: {} }, { productId: 'coffee', servings: '1', amount: '30', omitted: [], effects: [] });
    await assert.rejects(agent.execute(e.id, 'agent'), /STALE_PROPOSAL/); assert.equal(Object.keys(repository.snapshot().purchases).length, 0);
});
test('MOCK_VERIFIED Agent: unknown purchase commit retries same business key and budget reservation', async () => {
    const { agent, repository, business } = fixture(); const e = await agent.plan('agent', 'buy', 2); await agent.approve(e.id, 'admin', '2026-11-08Z');
    const atomic = business.atomic.bind(business); let lost = true;
    business.atomic = work => atomic((scoped, commit, finish) => {
        const create = scoped.createPurchase.bind(scoped);
        scoped.createPurchase = async (...args) => { const result = await create(...args); if (lost) { lost = false; throw new Error('lost transport response'); } return result; };
        return work(scoped, commit, finish);
    });
    const first = await agent.execute(e.id, 'agent'); assert.equal(first.status, 'UNKNOWN'); assert.equal(first.reserved, 2);
    const result = await agent.execute(e.id, 'agent'); assert.equal(result.status, 'SUCCEEDED'); assert.equal(result.spent, 2); assert.equal(result.reserved, 0);
    assert.equal(Object.keys(repository.snapshot().purchases).length, 1);
});

function legacyRecoveryFixture(plan = purchasePlan, seed, agentSeed, time = '2026-11-07T00:00:00Z') {
    const now = () => new Date(time);
    const repository = new MockRepository(seed);
    const store = new MockAgentRepository(agentSeed);
    const business = new BusinessWorkflows(repository, now);
    const dispatches = [], lookups = [];
    const intercept = port => {
        const atomic = port.atomic.bind(port);
        port.atomic = work => atomic((scoped, commit, finish) => work(intercept(scoped), commit, finish));
        const create = port.createPurchase.bind(port);
        port.createPurchase = async (command, input) => {
            dispatches.push(structuredClone({ command, input }));
            const result = await create(command, input);
            if (dispatches.length === 1) throw new Error('committed response lost');
            return result;
        };
        const receipt = port.purchaseReceipt.bind(port);
        port.purchaseReceipt = (command, input) => {
            lookups.push(structuredClone({ command, input }));
            return receipt(command, input);
        };
        return port;
    };
    const atomic = business.atomic.bind(business);
    business.atomic = work => atomic((port, commit, finish) => work(intercept(port), commit, finish));
    const agent = new AgentWorkflow(store, business, new MockLLMProvider(plan), undefined, now);
    const execute = (id, key) => agent.command('agent', key, 'execute', { id }, (scoped, p) => scoped.execute(p.id, 'agent'));
    return { repository, store, business, agent, dispatches, lookups, execute, setTime: value => { time = value; } };
}

test('Phase 8A legacy UNKNOWN: expiry and stale stock cannot hide committed receipt, original command replays exactly', async () => {
    const f = legacyRecoveryFixture();
    const run = await f.agent.plan('agent', 'buy', 2);
    await f.agent.approve(run.id, 'admin', '2026-11-08Z');
    const original = await f.execute(run.id, 'original');
    assert.equal(original.status, 200);
    assert.equal(original.body.status, 'UNKNOWN');
    assert.equal(original.body.reserved, 2);
    const purchase = Object.values(f.repository.snapshot().purchases)[0];
    assert.ok(purchase);
    const attempted = Object.values(f.store.snapshot().toolCalls)[0];
    assert.deepEqual(attempted.purchaseCommand, { actorId: 'agent', key: run.id + ':0', scope: 'agent.purchase', versions: run.versions });
    await f.business.createOrder({ actorId: 'admin', scope: 'test', key: 'stock', versions: {} }, { productId: 'coffee', servings: '1', amount: '30', omitted: [], effects: [] });
    assert.notDeepEqual(await f.business.sourceVersions('agent', [proposal]), run.versions);
    f.setTime('2026-11-08T00:00:00Z');
    const [first, replay, concurrent] = await Promise.all([
        f.execute(run.id, 'recover'), f.execute(run.id, 'recover'), f.execute(run.id, 'concurrent'),
    ]);
    assert.deepEqual(first, replay);
    assert.deepEqual(first, concurrent);
    assert.equal(first.body.status, 'SUCCEEDED');
    assert.equal(first.body.result[0].id, purchase.id);
    assert.equal(first.body.spent, 2);
    assert.equal(first.body.reserved, 0);
    assert.deepEqual(await f.execute(run.id, 'original'), original);
    assert.equal(f.dispatches.length, 1);
    assert.deepEqual(f.lookups, f.dispatches);
    const recovered = f.store.snapshot().toolCalls[attempted.id];
    assert.equal(recovered.result.id, purchase.id);
    assert.equal(f.repository.snapshot().operations[recovered.receipt.key].requestHash, recovered.receipt.requestHash);
    assert.equal(Object.keys(f.repository.snapshot().purchases).length, 1);
});

test('Phase 8A legacy UNKNOWN: restored revoked approval and missing or mismatched receipts never redispatch', async () => {
    const f = legacyRecoveryFixture();
    const run = await f.agent.plan('agent', 'buy', 2);
    const approval = await f.agent.approve(run.id, 'admin', '2026-11-08Z');
    assert.equal((await f.execute(run.id, 'original')).body.status, 'UNKNOWN');
    const originalBusiness = f.repository.snapshot();
    const agentSeed = f.store.snapshot();
    agentSeed.approvals[approval.id].revoked = true;
    const call = Object.values(agentSeed.toolCalls)[0];
    delete call.purchaseCommand; // Pre-8A snapshot: identity was deterministic but not stored.
    const [key] = Object.keys(originalBusiness.operations);
    for (const mode of ['missing', 'mismatched', 'valid']) {
        const seed = structuredClone(originalBusiness);
        if (mode === 'missing') delete seed.operations[key];
        if (mode === 'mismatched') seed.operations[key].requestHash = '0'.repeat(64);
        const restored = legacyRecoveryFixture(purchasePlan, seed, agentSeed);
        const result = await restored.execute(run.id, 'recover');
        assert.equal(result.body.status, mode === 'valid' ? 'SUCCEEDED' : 'UNKNOWN', mode);
        assert.equal(result.body.result.length, mode === 'valid' ? 1 : 0, mode);
        assert.equal(result.body.reserved, mode === 'valid' ? 0 : 2, mode);
        assert.deepEqual(restored.lookups, f.dispatches, mode);
        assert.equal(restored.dispatches.length, 0, mode);
        assert.deepEqual(restored.repository.snapshot().purchases, originalBusiness.purchases, mode);
    }
});

test('Phase 8A legacy UNKNOWN: historical receipt does not authorize another step', async () => {
    const f = legacyRecoveryFixture([...purchasePlan, ...purchasePlan]);
    const run = await f.agent.plan('agent', 'buy', 4);
    await f.agent.approve(run.id, 'admin', '2026-11-08Z');
    assert.equal((await f.execute(run.id, 'original')).body.status, 'UNKNOWN');
    f.setTime('2026-11-08T00:00:00Z');
    const recovered = await f.execute(run.id, 'recover');
    assert.equal(recovered.body.status, 'AWAITING_APPROVAL');
    assert.equal(recovered.body.result.length, 1);
    assert.deepEqual(await f.execute(run.id, 'next'), { status: 409, body: { code: 'APPROVAL_REQUIRED' } });
    assert.equal(f.dispatches.length, 1);
    assert.equal(Object.keys(f.repository.snapshot().purchases).length, 1);
});

test('MOCK_VERIFIED Agent: verifier records rejected business result and terminal failure', async () => {
    const { agent, repository } = fixture([{ tool: 'purchase.create', input: { ...proposal, lines: [{ ingredientId: 'beans', quantity: '-1', unitCost: '1' }] } }]);
    const e = await agent.plan('agent', 'bad proposal', 2); await agent.approve(e.id, 'admin', '2026-11-08Z');
    assert.equal((await agent.execute(e.id, 'agent')).status, 'FAILED'); assert.equal(Object.keys(repository.snapshot().purchases).length, 0);
    await assert.rejects(agent.execute(e.id, 'agent'), /TERMINAL/);
});
test('MOCK_VERIFIED Agent: read/recommend tools and owner-scoped Memory Learning lifecycle', async () => {
    const { agent } = fixture([{ tool: 'inventory.read', input: null }, { tool: 'inventory.recommend', input: null }]);
    const e = await agent.plan('agent', 'review', 2); assert.equal((await agent.execute(e.id, 'agent')).result.length, 2);
    const memory = await agent.remember('agent', 'beans run low'); await agent.remember('agent', 'beans run low');
    assert.equal((await agent.learn('agent', memory.id)).learned, true);
    assert.equal((await agent.retrieve('agent', 'beans')).length, 2); assert.equal((await agent.retrieve('admin', 'beans')).length, 0);
    await assert.rejects(agent.forget('admin', memory.id), /FORBIDDEN/);
    assert.equal((await agent.consolidate('agent')).length, 1); await agent.forget('agent', memory.id); assert.equal((await agent.retrieve('agent', '')).length, 0);
});
test('MOCK_VERIFIED Agent: revision invalidates previous approval and retains proposal history', async () => {
    const { agent } = fixture(); const e = await agent.plan('agent', 'buy', 2); await agent.approve(e.id, 'admin', '2026-11-08Z');
    const revised = await agent.revise(e.id, 'agent', purchasePlan); assert.equal(revised.revision, '2'); assert.equal(revised.revisions.length, 1); assert.notEqual(revised.hash, e.hash);
    await assert.rejects(agent.execute(e.id, 'agent'), /APPROVAL_REQUIRED/); await agent.approve(e.id, 'admin', '2026-11-08Z');
    assert.equal((await agent.execute(e.id, 'agent')).status, 'SUCCEEDED');
});
test('MOCK_VERIFIED Agent: memory writes roll back; snapshot restore retains executions and memories', async () => {
    const { agent, store, business } = fixture([{ tool: 'inventory.read', input: null }]); const before = store.snapshot();
    store.injectFault('beforeCommit'); await assert.rejects(agent.remember('agent', 'lost'), /INJECTED/); assert.deepEqual(store.snapshot(), before);
    const memory = await agent.remember('agent', 'kept'); const run = await agent.plan('agent', 'read', 1); await agent.execute(run.id, 'agent');
    const restored = new MockAgentRepository(store.snapshot()); const restarted = new AgentWorkflow(restored, business, new MockLLMProvider(), undefined, clock);
    assert.equal((await restarted.retrieve('agent', 'kept'))[0].id, memory.id); assert.equal((await restarted.execute(run.id, 'agent')).status, 'SUCCEEDED');
});
test('POSTGRES_NOT_VERIFIED Agent: composition rejects production mock, unknown and postgres providers', () => {
    const { business } = fixture(); assert.ok(createAgentRuntime(business, {}) instanceof AgentWorkflow);
    for (const env of [{ DATA_PROVIDER: 'postgres' }, { DATA_PROVIDER: 'invalid' }, { NODE_ENV: 'production' }, { NODE_ENV: 'production', DATA_PROVIDER: 'mock' }]) assert.throws(() => createAgentRuntime(business, env));
});
test('MOCK_VERIFIED Agent: shared business/approval/budget/audit rollback and postcommit recovery', async () => {
    for (const side of ['business', 'agent']) {
        const { agent, store, repository } = fixture(); const run = await agent.plan('agent', 'buy', 2); await agent.approve(run.id, 'admin', '2026-11-08Z');
        const beforeAgent = store.snapshot(); const beforeBusiness = repository.snapshot();
        (side === 'business' ? repository : store).injectFault('beforeCommit');
        await assert.rejects(agent.execute(run.id, 'agent'), /INJECTED_beforeCommit/);
        assert.deepEqual(repository.snapshot(), beforeBusiness); assert.deepEqual(store.snapshot(), beforeAgent);
        assert.equal((await agent.execute(run.id, 'agent')).status, 'SUCCEEDED');
    }
    for (const side of ['business', 'agent']) {
        const { agent, store, repository } = fixture(); const run = await agent.plan('agent', 'buy', 2); await agent.approve(run.id, 'admin', '2026-11-08Z');
        (side === 'business' ? repository : store).injectFault('afterCommit');
        await assert.rejects(agent.execute(run.id, 'agent'), /INJECTED_afterCommit/);
        assert.equal((await agent.execute(run.id, 'agent')).status, 'SUCCEEDED'); assert.equal(Object.keys(repository.snapshot().purchases).length, 1);
        assert.equal(store.snapshot().executions[run.id].spent, 2);
    }
});
