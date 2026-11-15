const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const Module = require('node:module');
const ts = require('typescript');

const previous = Module._extensions['.ts'];
Module._extensions['.ts'] = (mod, file) => mod._compile(ts.transpileModule(fs.readFileSync(file, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText, file);
let AgentWorkflow, MockAgentRepository, MockLLMProvider, MockRepository, BusinessWorkflows;
try {
    ({ AgentWorkflow, MockAgentRepository, MockLLMProvider } = require('../src/workflows/agent-workflow.ts'));
    ({ MockRepository } = require('../../api/src/workflows/mock-repository.ts'));
    ({ BusinessWorkflows } = require('../../api/src/workflows/business-service.ts'));
} finally {
    if (previous) Module._extensions['.ts'] = previous;
    else delete Module._extensions['.ts'];
}

const input = { supplierId: 'full-supplier', unitCosts: { milk: '0.25' } };
const expiry = '2026-11-08T00:00:00Z';
function fixture({ configure, intercept, llm = new MockLLMProvider(), allowlist } = {}) {
    const seed = new MockRepository().snapshot();
    seed.ingredients.milk.targetStock = '1500';
    configure?.(seed);
    const repo = new MockRepository(seed);
    const store = new MockAgentRepository();
    let time = '2026-11-07T00:00:00Z';
    const clock = () => new Date(time);
    const service = new BusinessWorkflows(repo, clock);
    const business = Object.create(service);
    if (intercept) business.atomic = work => service.atomic((port, commit, finish) =>
        work(Object.assign(Object.create(port), intercept(port)), commit, finish));
    const agent = new AgentWorkflow(store, business, llm, allowlist, clock);
    const plan = (budget = 7) => agent.plan('staff', 'inventory milk', budget, input);
    const prepare = async budget => agent.execute((await plan(budget)).id, 'staff');
    const approve = e => agent.approve(e.id, 'admin', expiry, e.hash);
    const purchases = () => Object.values(repo.snapshot().purchases);
    return { agent, store, repo, plan, prepare, approve, purchases, setTime: value => { time = value; } };
}

test('Phase 6 verifies the dependency chain, exact whole-pack proposal, approval and purchase receipt', async () => {
    const f = fixture();
    const e = await f.plan();
    assert.equal(e.status, 'PLANNED');
    await assert.rejects(f.approve(e), /INVALID_APPROVAL/);
    const ready = await f.agent.execute(e.id, 'staff');
    assert.equal(ready.status, 'AWAITING_APPROVAL');
    assert.equal(ready.spent, 5);
    assert.notEqual(ready.hash, e.hash);
    assert.deepEqual(ready.result[2], [{ ingredientId: 'milk', quantity: '2000', unitCost: '0.25', packs: '2', quoteVersion: '1' }]);
    assert.deepEqual(ready.result[4], { requiredRole: 'ADMIN', proposalHash: ready.hash });
    assert.equal(f.purchases().length, 0);
    assert.deepEqual(await f.agent.execute(e.id, 'staff'), ready);
    await assert.rejects(f.agent.approve(e.id, 'admin', expiry, e.hash), /INVALID_APPROVAL/);
    const approval = await f.approve(ready);
    const done = await f.agent.execute(e.id, 'staff');
    assert.equal(done.status, 'SUCCEEDED');
    assert.equal(done.spent, 7);
    assert.equal(done.outcome.verified, true);
    const inspected = await f.agent.inspect('admin', e.id);
    assert.deepEqual(inspected.audit.filter(row => row.status === 'DISPATCHED').map(row => row.stepId),
        ['inventory', 'low-stock', 'recommendations', 'proposal', 'approval', 'purchase']);
    const call = inspected.toolCalls.at(-1);
    assert.equal(call.authorization.approvalId, approval.id);
    assert.equal(f.repo.snapshot().operations[call.receipt.key].requestHash, call.receipt.requestHash);
    assert.equal(f.purchases()[0].id, done.result[5].id);
});

test('Phase 6 rejects mixed, reordered, cyclic, undeclared and denied tool plans before dispatch', async () => {
    const valid = (await fixture().plan()).plan;
    for (const mutate of [
        p => { [p[0], p[1]] = [p[1], p[0]]; },
        p => { p[0].dependsOn = ['purchase']; },
        p => { p[5].dependsOn = ['proposal']; },
        p => { p[5] = { tool: 'purchase.create', input: null }; },
        p => { p[3].tool = 'shell'; },
        p => { p[2].input.actorId = 'admin'; },
    ]) {
        const candidate = structuredClone(valid);
        mutate(candidate);
        const f = fixture({ llm: new MockLLMProvider(candidate) });
        await assert.rejects(f.agent.plan('staff', 'inventory', 40), /INVALID_|TOOL_DENIED/);
        assert.deepEqual(f.store.snapshot().audit, []);
    }
    const denied = fixture({ allowlist: ['inventory.read'] });
    await assert.rejects(denied.plan(), /TOOL_DENIED/);
});

test('Phase 6 malformed reads fail verification and downstream steps are skipped', async () => {
    const f = fixture({ intercept: () => ({ inventory: async () => [{ id: 'lot' }] }) });
    const failed = await f.prepare();
    assert.equal(failed.status, 'FAILED');
    assert.equal(failed.spent, 1);
    const view = await f.agent.inspect('staff', failed.id);
    assert.equal(view.evaluations[0].code, 'VERIFICATION_FAILED');
    assert.ok(view.evaluations.slice(1).every(row => row.code === 'DEPENDENCY_FAILED' && !row.passed));
    assert.equal(view.audit.filter(row => row.status === 'DISPATCHED').length, 1);
    assert.equal(f.purchases().length, 0);
});

test('Phase 6 retries a failed safe read once and charges the retry against budget', async () => {
    let fail = true;
    const f = fixture({ intercept: port => ({ inventory: async actor => {
        if (fail) { fail = false; throw new Error('transient read failure'); }
        return port.inventory(actor);
    } }) });
    await assert.rejects(f.plan(6), /BUDGET_EXCEEDED/);
    const result = await f.prepare();
    assert.equal(result.spent, 5);
    assert.equal(result.status, 'FAILED');
    const view = await f.agent.inspect('staff', result.id);
    assert.equal(view.toolCalls[0].attempts, 2);
    assert.ok(view.evaluations.some(row => row.code === 'BUDGET_EXCEEDED'));
    assert.deepEqual(view.approvals, []);
    assert.equal(f.purchases().length, 0);
    fail = true;
    const ready = await f.prepare(8);
    await f.approve(ready);
    const done = await f.agent.execute(ready.id, 'staff');
    assert.equal(done.status, 'SUCCEEDED');
    assert.equal(done.spent, 8);
});

test('Phase 6 denies purchase preparation without Backend permission and never dispatches it', async () => {
    const f = fixture({ configure: seed => { seed.principals.staff.permissions = ['inventory.read', 'agent.run', 'memory']; } });
    const failed = await f.prepare();
    assert.equal(failed.status, 'FAILED');
    const view = await f.agent.inspect('staff', failed.id);
    assert.equal(view.toolCalls.find(call => call.stepId === 'recommendations').status, 'DENIED');
    assert.equal(view.audit.filter(row => row.status === 'DISPATCHED').length, 2);
    assert.equal(f.purchases().length, 0);
});

test('Phase 6 requires a current ADMIN approval and respects revocation, expiry and cancellation', async () => {
    const f = fixture();
    const ready = await f.prepare();
    await assert.rejects(f.agent.approve(ready.id, 'staff', expiry, ready.hash), /FORBIDDEN/);
    await assert.rejects(f.agent.approve(ready.id, 'admin', expiry), /INVALID_APPROVAL/);
    const revoked = await f.approve(ready);
    await f.agent.revoke(revoked.id, 'admin');
    assert.equal((await f.agent.execute(ready.id, 'staff')).status, 'AWAITING_APPROVAL');
    await f.approve(ready);
    await f.store.atomic(state => { state.permissions.admin = ['agent.run']; });
    assert.equal((await f.agent.execute(ready.id, 'staff')).status, 'AWAITING_APPROVAL');
    await f.store.atomic(state => { state.permissions.admin.push('agent.approve'); });
    f.setTime(expiry);
    assert.equal((await f.agent.execute(ready.id, 'staff')).status, 'AWAITING_APPROVAL');
    await assert.rejects(f.agent.cancel(ready.id, 'admin'), /FORBIDDEN/);
    const cancelled = await f.agent.cancel(ready.id, 'staff');
    assert.equal(cancelled.status, 'CANCELLED');
    assert.deepEqual(await f.agent.cancel(ready.id, 'staff'), cancelled);
    await assert.rejects(f.agent.execute(ready.id, 'staff'), /EXECUTION_TERMINAL/);
    assert.equal(f.purchases().length, 0);
});

test('Phase 6 rechecks time-sensitive inventory before spending an approved proposal', async () => {
    const f = fixture({ configure: seed => {
        seed.lots.milk = { ...seed.lots.early, id: 'milk', ingredientId: 'milk', remaining: '50', expirationDate: new Date('2026-11-07T12:00:00Z') };
    } });
    const ready = await f.prepare();
    await f.approve(ready);
    f.setTime('2026-11-07T13:00:00Z');
    assert.equal((await f.agent.execute(ready.id, 'staff')).status, 'FAILED');
    const view = await f.agent.inspect('staff', ready.id);
    assert.equal(view.evaluations.at(-1).code, 'STALE_PROPOSAL');
    assert.equal(view.approvals[0].consumed, false);
    assert.equal(f.purchases().length, 0);
});

test('Phase 6 concurrent preparation, commit and idempotent replay issue one purchase', async () => {
    const f = fixture();
    const run = await f.plan();
    const execute = () => f.agent.execute(run.id, 'staff');
    const [ready, waiting] = await Promise.all([execute(), execute()]);
    assert.deepEqual(ready, waiting);
    await f.approve(ready);
    const [first, second] = await Promise.all([execute(), execute()]);
    assert.equal(first.status, 'SUCCEEDED');
    assert.deepEqual(first, second);
    assert.deepEqual(await execute(), first);
    assert.equal(f.purchases().length, 1);
    assert.equal(f.store.snapshot().audit.filter(row => row.status === 'DISPATCHED').length, 6);
});

test('Phase 6 UNKNOWN reconciles the original receipt after approval expiry without redispatch', async () => {
    let receiptState = 'missing';
    let dispatches = 0;
    const f = fixture({ intercept: port => ({
        createPurchase: async (...args) => { dispatches++; await port.createPurchase(...args); throw new Error('response lost'); },
        purchaseReceipt: async (...args) => {
            if (receiptState === 'missing') return undefined;
            const receipt = await port.purchaseReceipt(...args);
            return receiptState === 'malformed' ? { ...receipt, response: { ...receipt.response, status: NaN } } : receipt;
        },
    }) });
    const ready = await f.prepare();
    await f.approve(ready);
    assert.equal((await f.agent.execute(ready.id, 'staff')).status, 'UNKNOWN');
    f.setTime(expiry);
    assert.equal((await f.agent.execute(ready.id, 'staff')).reserved, 2);
    await assert.rejects(f.agent.cancel(ready.id, 'staff'), /EXECUTION_TERMINAL/);
    receiptState = 'malformed';
    assert.equal((await f.agent.execute(ready.id, 'staff')).status, 'UNKNOWN');
    receiptState = 'valid';
    const done = await f.agent.execute(ready.id, 'staff');
    assert.equal(done.status, 'SUCCEEDED');
    assert.equal(done.reserved, 0);
    assert.equal(dispatches, 1);
    assert.equal(f.purchases().length, 1);
    const view = await f.agent.inspect('staff', ready.id);
    assert.equal(view.toolCalls.at(-1).attempts, 1);
    assert.equal(view.audit.filter(row => row.status === 'RECONCILING').length, 3);
});

test('Phase 6 proven transaction rollback restores purchase, approval, budget and audit atomically', async () => {
    const f = fixture();
    const ready = await f.prepare();
    await f.approve(ready);
    const before = f.store.snapshot();
    f.repo.injectFault('beforeCommit');
    await assert.rejects(f.agent.execute(ready.id, 'staff'), /INJECTED/);
    assert.deepEqual(f.store.snapshot(), before);
    assert.equal(f.purchases().length, 0);
    assert.equal((await f.agent.execute(ready.id, 'staff')).status, 'SUCCEEDED');
    assert.equal(f.purchases().length, 1);
});

test('Phase 6 records a proven Backend write rollback and never learns or retries that purchase', async () => {
    const f = fixture();
    const memory = await f.agent.remember('staff', 'purchase milk');
    await f.agent.learn('staff', memory.id);
    const ready = await f.prepare();
    await f.approve(ready);
    f.repo.injectFault('write');
    const failed = await f.agent.execute(ready.id, 'staff');
    assert.equal(failed.status, 'FAILED');
    assert.equal(failed.reserved, 0);
    assert.equal(f.purchases().length, 0);
    const view = await f.agent.inspect('staff', ready.id);
    assert.equal(view.toolCalls.at(-1).status, 'ROLLED_BACK');
    assert.equal(view.evaluations.at(-1).code, 'BUSINESS_ROLLED_BACK');
    await assert.rejects(f.agent.execute(ready.id, 'staff'), /EXECUTION_TERMINAL/);
    assert.equal((await f.agent.learn('staff', memory.id)).confidence, 0);
});

test('Phase 6 memory isolates interim, rejected and cancelled outcomes and advises future same-owner plans', async () => {
    const f = fixture({ configure: seed => {
        seed.ingredients.milk.baseUnit = 'piece';
        seed.ingredients.milk.targetStock = '1.5';
        seed.ingredients.milk.minStock = '1';
        seed.quotes.find(quote => quote.ingredientId === 'milk').conversionQuantity = '0.5';
    } });
    const m = await f.agent.remember('staff', 'purchase milk');
    await f.agent.learn('staff', m.id);
    const ready = await f.prepare();
    assert.equal((await f.agent.learn('staff', m.id)).confidence, 0);
    await assert.rejects(f.agent.approve(ready.id, 'staff', expiry, ready.hash), /FORBIDDEN/);
    await f.agent.cancel(ready.id, 'staff');
    assert.equal((await f.agent.learn('staff', m.id)).confidence, 0);
    const rejected = await f.prepare();
    await f.approve(rejected);
    assert.equal((await f.agent.execute(rejected.id, 'staff')).status, 'FAILED');
    assert.equal((await f.agent.inspect('staff', rejected.id)).evaluations.at(-1).code, 'BUSINESS_REJECTED');
    assert.equal((await f.agent.learn('staff', m.id)).confidence, 0);

    let evidence;
    const verified = fixture({ llm: { plan: async (_prompt, context) => {
        evidence = context.evidence;
        return [{ tool: 'inventory.read', input: null }];
    } } });
    const memory = await verified.agent.remember('staff', 'purchase milk');
    await verified.agent.learn('staff', memory.id);
    const done = await verified.prepare();
    await verified.approve(done);
    assert.equal((await verified.agent.execute(done.id, 'staff')).outcome.verified, true);
    await verified.agent.plan('staff', 'purchase milk', 1);
    assert.deepEqual(evidence.map(hint => [hint.tool, ...hint.executionIds]), [['purchase.create', done.id]]);
    await verified.agent.plan('agent', 'purchase milk', 1);
    assert.deepEqual(evidence, []);
});
