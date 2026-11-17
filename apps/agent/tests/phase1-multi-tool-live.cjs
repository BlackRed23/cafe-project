// Provider-only selection probe. Synthetic IDs are not business records.
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const root = path.resolve(__dirname, '../../..');
const { artifactPath } = require('../../../scripts/artifact-path.cjs');
const output = artifactPath('reports/agentic-workflow/native-tool-calling/phase1-multi-tool-live.json');
const scenarios = [
    ['inventory', 'getIngredientAvailability', 'ingredientId', 'Read aggregate ingredient stock'],
    ['batches', 'getIngredientBatches', 'ingredientId', 'Inspect ingredient batches and expiry'],
    ['recipe', 'getRecipeRequirements', 'productId', 'Read active product recipe requirements'],
    ['suppliers', 'findIngredientSuppliers', 'ingredientId', 'Find active ingredient suppliers'],
];
const report = { result: [], errors: [], next: [] };
let liveCalls = 0;
async function main() {
    require('dotenv').config({ path: path.join(root, 'apps/agent/.env'), quiet: true });
    require('tsx/cjs');
    const { validateDynamicPlan } = require('../src/workflows/agent-workflow.ts');
    const { TOOL_CONTRACTS } = require('../src/workflows/tool-contracts.ts');
    const { generateNativeToolPlan } = require('../src/services/openai-planner.service.ts');
    // No Registry, Backend service, actor authorization or executor instantiated.
    const tools = scenarios.map(([, name]) => {
        const c = TOOL_CONTRACTS[name];
        assert.equal(c.status, 'IMPLEMENTED');
        assert.equal(c.category, 'READ');
        return { name: c.name, purpose: c.purpose };
    });
    assert.ok(new Set(tools.map(t => t.name)).size >= 3, 'INSUFFICIENT_REAL_SCHEMAS');
    const inputs = scenarios.map(([, name, field]) => {
        const input = { [field]: field === 'ingredientId' ? 'PHASE1_TEST_INGREDIENT' : 'PHASE1_TEST_PRODUCT' };
        assert.ok(TOOL_CONTRACTS[name].input.safeParse(input).success, 'INVALID_TEST_ID');
        return input;
    });
    const prompts = scenarios.map(([, , , request], i) =>
        `${request}. Inputs: ${JSON.stringify(inputs[i])}. Synthetic IDs for tool-selection testing only; not real business records. Plan only; never execute.`);
    const transport = globalThis.fetch;
    const previews = [];
    // Capture real Planner payload, then abort before network; never fabricate LLM response.
    globalThis.fetch = async (url, init) => {
        previews.push({ endpoint: String(url), method: init.method,
            headers: { Authorization: '[REDACTED]', 'Content-Type': 'application/json' }, body: JSON.parse(init.body) });
        throw Error('PREVIEW_NETWORK_DISABLED');
    };
    try {
        for (const prompt of prompts) {
            await assert.rejects(generateNativeToolPlan(prompt, tools, process.env, { policy: 'REQUIRES_TOOL' }),
                { message: 'PROVIDER_REQUEST_FAILED' });
        }
    } finally { globalThis.fetch = transport; }
    assert.equal(previews.length, 4, 'INCOMPLETE_PREVIEW');
    for (const preview of previews) {
        assert.equal(preview.body.tool_choice, 'required');
        assert.equal(preview.body.tools.length, 4);
        for (const tool of preview.body.tools) {
            const { z } = require('zod');
            assert.deepEqual(tool.function.parameters, z.toJSONSchema(TOOL_CONTRACTS[tool.function.name].input));
        }
    }
    fs.mkdirSync(path.dirname(output), { recursive: true });
    fs.writeFileSync(output.replace('.json', '-payload-preview.json'), JSON.stringify(previews, null, 2) + '\n');
    console.log(JSON.stringify({ payloadPreview: previews }));
    const approved = process.argv.includes('--live') && process.env.PHASE1_APPROVED_CALLS === '4';
    if (!approved) {
        report.errors.push('APPROVAL_REQUIRED');
        report.result.push(...scenarios.map(([scenario, expectedTool]) => ({ scenario, expectedTool,
            status: 'NOT_RUN', reason: 'APPROVAL_REQUIRED', toolsCount: 4, toolChoice: 'required' })));
        report.next.push('Explicit approval for up to four configured-provider calls with displayed payloads; no Backend or authorization reads.');
        return;
    }
    globalThis.fetch = async (url, init) => {
        assert.ok(liveCalls < 4, 'CALL_LIMIT_EXCEEDED');
        assert.equal(String(url), previews[liveCalls].endpoint, 'ENDPOINT_CHANGED');
        assert.deepEqual(JSON.parse(init.body), previews[liveCalls].body, 'PAYLOAD_CHANGED');
        liveCalls++;
        return transport(url, init);
    };
    try {
        for (let i = 0; i < scenarios.length; i++) {
            const [scenario, expectedTool] = scenarios[i];
            const row = { scenario, expectedTool, status: 'FAIL', toolCallStatus: 'NOT_RUN',
                argumentsStatus: 'NOT_RUN', adapterStatus: 'NOT_RUN', validationStatus: 'NOT_RUN' };
            let diagnostic;
            try {
                const plan = await generateNativeToolPlan(prompts[i], tools, process.env, {
                    policy: 'REQUIRES_TOOL', onDiagnostic: event => { diagnostic = event; } });
                row.toolCallStatus = 'PASS';
                row.adapterStatus = 'PASS';
                assert.ok(plan.steps.every(step => TOOL_CONTRACTS[step.tool].input.safeParse(step.input).success), 'INVALID_ARGUMENTS');
                row.argumentsStatus = 'PASS';
                validateDynamicPlan(plan);
                row.validationStatus = 'PASS';
                assert.equal(plan.steps.length, 1, 'UNEXPECTED_STEP_COUNT');
                assert.equal(plan.steps[0].tool, expectedTool, 'WRONG_TOOL_SELECTED');
                assert.deepEqual(plan.steps[0].input, inputs[i], 'ARGUMENTS_CHANGED');
                row.status = 'PASS';
                row.reason = 'Actual native call, Zod input, Plan Adapter, DynamicToolPlan and expected selection passed';
            } catch (error) {
                row.reason = diagnostic?.errorCode || (error.code === 'ERR_ASSERTION' && error.message.match(/^[A-Z_]+/u)?.[0]) || 'PROBE_FAILED';
                if (diagnostic?.toolCallsCount > 0) row.toolCallStatus = 'PASS';
            }
            row.diagnostic = diagnostic;
            report.result.push(row);
            console.log(JSON.stringify(row));
        }
    } finally { globalThis.fetch = transport; }
}
main().catch(() => { report.errors.push('PREFLIGHT_FAILED'); process.exitCode = 1; }).finally(() => {
    const cases = report.result;
    const status = cases.length === 4 && cases.every(row => row.status === 'PASS') && !report.errors.length
        ? 'PASS' : report.errors.includes('APPROVAL_REQUIRED') ? 'BLOCKED' : 'FAIL';
    report.result.push({ phase: 1, status, liveCalls, backendCalls: 0, backendToolsExecuted: 0, mockLLMUsed: false });
    fs.mkdirSync(path.dirname(output), { recursive: true });
    fs.writeFileSync(output, JSON.stringify(report, null, 2) + '\n');
    if (status === 'FAIL') process.exitCode = 1;
    console.log(JSON.stringify(report));
});
