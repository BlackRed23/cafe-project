const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const Module = require('node:module');
const ts = require('typescript');
const previous = Module._extensions['.ts'];
Module._extensions['.ts'] = (mod, file) => mod._compile(ts.transpileModule(fs.readFileSync(file, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true }
}).outputText, file);
after(() => { if (previous) Module._extensions['.ts'] = previous; else delete Module._extensions['.ts']; });
const { generateNativeToolPlan: nativePlanner } = require('../src/services/openai-planner.service.ts');
const { createReadOnlyAgentRuntime, createToolRegistry } = require('../src/workflows/agent-workflow.ts');
const generateNativeToolPlan = (prompt, tools, config, options = { policy: 'OPTIONAL_TOOL' }) => nativePlanner(prompt, tools, config, options);
const config = { LLM_API_KEY: 'unit-key', LLM_BASE_URL: 'https://provider.invalid/v1', LLM_MODEL: 'unit-model' };
const tools = [{ name: 'getIngredientAvailability' }];
const call = (name = tools[0].name, args = '{"ingredientId":"existing-id"}') => ({ id: 'provider-call', type: 'function', function: { name, arguments: args } });

for (const [label, response, code] of [
    ['refusal', { choices: [{ message: { refusal: 'Declined' } }] }, 'LLM_REFUSED'],
    ['clarification', { choices: [{ message: { content: '{"error":"INSUFFICIENT_CONTEXT"}' } }] }, 'INSUFFICIENT_CONTEXT'],
    ['provider error', { error: { message: 'private detail' } }, 'PROVIDER_REQUEST_FAILED'],
    ['invalid envelope', {}, 'LLM_INVALID_RESPONSE'],
    ['truncated', { choices: [{ finish_reason: 'length', message: {} }] }, 'LLM_RESPONSE_TRUNCATED'],
    ['empty response', { choices: [{ message: {} }] }, 'NO_TOOL_CALL_RETURNED'],
]) test(`classify ${label} without fallback`, async t => {
    let requests = 0;
    t.mock.method(global, 'fetch', async () => {
        requests++;
        return { ok: true, json: async () => response };
    });
    await assert.rejects(generateNativeToolPlan('Read ID', tools, config), { message: code });
    assert.equal(requests, 1);
});

test('catalog excludes denied permissions and retains fresh dispatch authorization', async t => {
    const { ToolError } = require('../src/workflows/tool-contracts.ts');
    let revoked = false;
    let executions = 0;
    const services = {
        authorize: async (_, permission) => {
            if (permission === 'supplier.read' || (revoked && permission === 'inventory.read')) throw new ToolError('FORBIDDEN');
        },
        availability: async () => { executions++; },
        suppliers: async () => { throw Error('DENIED_HANDLER_CALLED'); },
    };
    t.mock.method(global, 'fetch', async (_, options) => {
        assert.equal(JSON.parse(options.body).tool_choice, 'required');
        assert.deepEqual(JSON.parse(options.body).tools.map(t => t.function.name), ['getIngredientAvailability']);
        return { ok: true, json: async () => ({ choices: [{ message: { tool_calls: [call()] } }] }) };
    });
    const workflow = createReadOnlyAgentRuntime({ authorize: services.authorize,
        toolRegistry: createToolRegistry(services, 'BACKEND') }, config);
    const plan = await workflow.generateDynamicPlan('unit-actor', 'Read supplied ingredientId existing-id');
    assert.equal(executions, 0, 'Planning must never execute bound handlers');
    revoked = true;
    const result = await workflow.executeDynamicTools('unit-actor', plan);
    assert.equal(result.status, 'FAILED');
    assert.equal(result.error, 'FORBIDDEN');
    assert.equal(executions, 0);
});
test('real READ runtime rejects mock bindings and works without AgentRepository', async () => {
    const services = { authorize: async () => ({}), availability: async id => ({
        ingredientId: id, baseUnit: 'g', quantity: 0, reserved: 0, available: 0, active: true, rowVersion: 0
    }) };
    assert.throws(() => createReadOnlyAgentRuntime({ authorize: services.authorize,
        toolRegistry: createToolRegistry(services, 'MOCK') }), /REAL_BACKEND_REGISTRY_REQUIRED/);
    const agent = createReadOnlyAgentRuntime({ authorize: services.authorize,
        toolRegistry: createToolRegistry(services, 'BACKEND') });
    const result = await agent.dispatchTool('unit-actor', 'getIngredientAvailability', { ingredientId: 'unit-id' });
    assert.equal(result.ok, true);
    await assert.rejects(agent.remember('unit-actor', 'disabled'), /READ_ONLY_WORKFLOW_/);
});
test('native API schemas and validated provider arguments become workflow steps', async t => {
    t.mock.method(global, 'fetch', async (_, options) => {
        const body = JSON.parse(options.body);
        assert.equal(body.tool_choice, 'auto');
        assert.equal(body.tools[0].function.name, tools[0].name);
        assert.deepEqual(body.tools[0].function.parameters.required, ['ingredientId']);
        assert.equal(body.response_format, undefined);
        return { ok: true, json: async () => ({ choices: [{ message: { tool_calls: [call()] } }] }) };
    });
    const plan = await generateNativeToolPlan('Read supplied ID', tools, config);
    assert.deepEqual(plan.steps[0].input, { ingredientId: 'existing-id' });
});
for (const [label, calls, error] of [
    ['missing', undefined, 'NO_TOOL_CALL_RETURNED'],
    ['empty', [], 'NO_TOOL_CALL_RETURNED'],
    ['unknown', [call('unknown')], 'INVALID_TOOL_NAME'],
    ['write', [call('createDraftPurchaseRequest')], 'TOOL_NOT_AVAILABLE'],
    ['unbound', [call('getIngredientBatches')], 'TOOL_NOT_AVAILABLE'],
    ['malformed JSON', [call(tools[0].name, '{')], 'INVALID_TOOL_ARGUMENTS'],
    ['extra argument', [call(tools[0].name, '{"ingredientId":"id","quantity":10}')], 'INVALID_TOOL_ARGUMENTS'],
    ['duplicate IDs', [call(), call()], 'INVALID_NATIVE_TOOL_CALL'],
]) test(`reject ${label}; no retry or fabricated plan`, async t => {
    let requests = 0;
    t.mock.method(global, 'fetch', async () => {
        requests++;
        return { ok: true, json: async () => ({ choices: [{ message: { content: '{}', tool_calls: calls } }] }) };
    });
    await assert.rejects(generateNativeToolPlan('Read ID', tools, config), new RegExp(error));
    assert.equal(requests, 1);
});

test('native provider failures distinguish HTTP failure and timeout', async t => {
    t.mock.method(global, 'fetch', async () => ({ ok: false }));
    await assert.rejects(generateNativeToolPlan('Read ID', tools, config), /PROVIDER_REQUEST_FAILED/);
    global.fetch = async (_, { signal }) => new Promise((_, reject) => {
        signal.addEventListener('abort', () => reject(signal.reason), { once: true });
    });
    // Keep event loop alive while AbortSignal timeout fires.
    const timer = setTimeout(() => {}, 100);
    try {
        await assert.rejects(generateNativeToolPlan('Read ID', tools, { ...config, LLM_TIMEOUT_MS: '1' }), /PROVIDER_TIMEOUT/);
    } finally { clearTimeout(timer); }
});

test('no bound capability fails before provider request', async t => {
    let requests = 0;
    t.mock.method(global, 'fetch', async () => { requests++; throw Error('UNEXPECTED_REQUEST'); });
    const authorize = async () => {};
    const workflow = createReadOnlyAgentRuntime({ authorize,
        toolRegistry: createToolRegistry({ authorize }, 'BACKEND') }, config);
    await assert.rejects(workflow.generateDynamicPlan('unit-actor', 'Read inventory'), /TOOL_NOT_AVAILABLE/);
    assert.equal(requests, 0);
});

test('required single READ probe preserves native schema and emits sanitized diagnostics', async t => {
    const events = [];
    t.mock.method(global, 'fetch', async (_, options) => {
        const body = JSON.parse(options.body);
        assert.equal(body.tool_choice, 'required');
        assert.equal(body.tools.length, 1);
        assert.equal(body.tools[0].type, 'function');
        assert.deepEqual(body.tools[0].function.parameters.required, ['ingredientId']);
        assert.equal(body.response_format, undefined);
        return { ok: true, status: 200, json: async () => ({ choices: [{ finish_reason: 'tool_calls',
            message: { role: 'assistant', content: null, refusal: null, tool_calls: [call()] } }] }) };
    });
    const plan = await generateNativeToolPlan('private-prompt', tools, config,
        { policy: 'REQUIRES_TOOL', onDiagnostic: event => events.push(event) });
    assert.equal(plan.steps[0].tool, tools[0].name);
    assert.equal(events.length, 1);
    assert.match(events[0].requestId, /^[a-f0-9-]{36}$/);
    assert.deepEqual({ ...events[0], requestId: 'redacted', durationMs: 0 }, {
        requestId: 'redacted', model: 'unit-model', toolsCount: 1, toolChoice: 'required',
        selectedTool: 'getIngredientAvailability', argumentsValidation: 'PASS', planAdapterStatus: 'PASS', dynamicPlanValidation: 'PASS', durationMs: 0,
        requestSent: true, httpStatus: 200, finishReason: 'tool_calls',
        messageKeys: ['role', 'content', 'refusal', 'tool_calls'], toolCallsCount: 1,
        contentType: 'null', refusalPresent: false, validationStatus: 'PASS', errorCode: null,
    });
    for (const secret of ['private-prompt', config.LLM_API_KEY, 'existing-id', config.LLM_BASE_URL]) {
        assert.equal(JSON.stringify(events).includes(secret), false);
    }
});

test('required probe refuses prose without fallback and excludes raw content from logs', async t => {
    let requests = 0;
    let event;
    t.mock.method(global, 'fetch', async () => {
        requests++;
        return { ok: true, status: 200, json: async () => ({ choices: [{ finish_reason: 'stop',
            message: { role: 'assistant', content: 'private-response', refusal: null } }] }) };
    });
    await assert.rejects(generateNativeToolPlan('private-prompt', tools, config,
        { policy: 'REQUIRES_TOOL', onDiagnostic: value => { event = value; } }), /NO_TOOL_CALL_RETURNED/);
    assert.equal(requests, 1);
    assert.equal(event.contentType, 'string');
    assert.equal(event.toolCallsCount, 0);
    assert.equal(event.validationStatus, 'NOT_RUN');
    assert.equal(event.errorCode, 'NO_TOOL_CALL_RETURNED');
    assert.equal(JSON.stringify(event).includes('private-response'), false);
});

test('required policy retains multiple tools and model selects second tool', async t => {
    t.mock.method(global, 'fetch', async (_, options) => {
        const body = JSON.parse(options.body);
        assert.equal(body.tool_choice, 'required');
        assert.deepEqual(body.tools.map(t => t.function.name), ['getIngredientAvailability', 'getIngredientBatches']);
        return { ok: true, json: async () => ({ choices: [{ message: { tool_calls: [call('getIngredientBatches')] } }] }) };
    });
    const plan = await nativePlanner('Read batches', [...tools, { name: 'getIngredientBatches' }], config, { policy: 'REQUIRES_TOOL' });
    assert.deepEqual(plan, { goal: 'Read batches', steps: [{ id: 'step_1', tool: 'getIngredientBatches', input: { ingredientId: 'existing-id' }, dependsOn: [] }] });
    require('../src/workflows/agent-workflow.ts').validateDynamicPlan(plan);
});
test('missing policy and empty required catalog fail before transport', async t => {
    let requests = 0;
    t.mock.method(global, 'fetch', async () => { requests++; throw Error('UNEXPECTED_REQUEST'); });
    await assert.rejects(nativePlanner('Read', tools, config), { code: 'TOOL_CHOICE_POLICY_REQUIRED' });
    await assert.rejects(nativePlanner('Read', [], config, { policy: 'REQUIRES_TOOL' }), /INVALID_PLANNING_REQUEST/);
    assert.equal(requests, 0);
});

test('workflow forwards explicit optional context without executing handlers', async t => {
    let executions = 0;
    const services = { authorize: async () => {}, availability: async () => { executions++; } };
    const workflow = createReadOnlyAgentRuntime({ authorize: services.authorize, toolRegistry: createToolRegistry(services, 'BACKEND') }, config);
    t.mock.method(global, 'fetch', async (_, options) => {
        assert.equal(JSON.parse(options.body).tool_choice, 'auto');
        return { ok: true, json: async () => ({ choices: [{ message: { tool_calls: [call()] } }] }) };
    });
    await workflow.generateDynamicPlan('actor', 'Read supplied ID', { toolChoicePolicy: 'OPTIONAL_TOOL' });
    assert.equal(executions, 0);
});
