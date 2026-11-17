// Provider-only probe. Synthetic input proves selection, never inventory facts.
const assert = require('node:assert/strict');
const path = require('node:path');
const { artifactPath } = require('../../../scripts/artifact-path.cjs');
const report = { request_sent: false, provider_http_status: null,
    native_tool_calls_received: 0, arguments_validated: false,
    backend_tools_executed: 0, input_source: 'NON_SENSITIVE_SELECTION_PROBE',
    diagnostic: null, error: null };
async function main() {
    require('dotenv').config({ path: path.resolve('apps/agent/.env'), quiet: true });
    const { generateNativeToolPlan } = require('../dist/services/openai-planner.service.js');
    const { TOOL_CONTRACTS } = require('../dist/workflows/tool-contracts.js');
    // One real READ contract; no Backend imports, handlers, identity or stock claims.
    const contract = TOOL_CONTRACTS.getIngredientAvailability;
    assert.equal(contract.status, 'IMPLEMENTED');
    assert.equal(contract.category, 'READ');
    const tools = [{ name: contract.name, purpose: contract.purpose }];
        const plan = await generateNativeToolPlan(
            'Tool-selection test only; no inventory query or execution. Propose reading aggregate stock for ingredientId phase1-selection-probe. This is a synthetic test ID, not a real ingredient. Use supplied ID only.', tools,
            process.env, { toolChoice: 'required', onDiagnostic(event) {
                report.diagnostic = event;
                report.request_sent = event.requestSent;
                report.provider_http_status = event.httpStatus;
                report.native_tool_calls_received = event.toolCallsCount;
                console.log(JSON.stringify(event));
            } });
        assert.equal(plan.steps.length, 1);
        assert.equal(plan.steps.length, report.native_tool_calls_received);
        for (const step of plan.steps) {
            assert.ok(tools.some(t => t.name === step.tool));
            assert.equal(TOOL_CONTRACTS[step.tool].input.safeParse(step.input).success, true);
            assert.deepEqual(step.input, { ingredientId: 'phase1-selection-probe' });
        }
        report.arguments_validated = true;
        report.selected_tool = plan.steps[0].tool;
}
main().catch(error => {
    report.error = /^[A-Z_]+$/.test(error.message) ? error.message : 'LIVE_PROBE_FAILED';
    process.exitCode = 1;
}).finally(() => {
    const output = artifactPath('reports/agentic-workflow/native-tool-calling/phase1-required-live.json');
    require('node:fs').mkdirSync(path.dirname(output), { recursive: true });
    require('node:fs').writeFileSync(output, JSON.stringify(report, null, 2) + '\n');
    console.log(JSON.stringify(report));
});
