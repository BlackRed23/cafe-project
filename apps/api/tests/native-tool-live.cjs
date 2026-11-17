// Opt-in real acceptance. Not part of unit suite; one provider request, no fixtures.
const assert = require('node:assert/strict');
const path = require('node:path');
const report = { status: 'BLOCKED', llm_provider: 'FreeModel', native_tool_calling: 'BLOCKED',
    tool_registry: 'NOT_RUN', backend_real: 'NOT_RUN', postgres_read: 'NOT_RUN', data_source: 'REAL_DATABASE',
    mock_used: false, tool_executed: false, result_verified: false, write_operations: 0,
    gate_a: 'NOT_RUN', gate_b: 'NOT_RUN', gate_c: 'NOT_RUN', validated_tool_calls: 0,
    provider_requests: 0, provider_http_status: null, tool_schema_count: 0,
    authorized_actor_found: false, active_ingredient_found: false, errors: [], modified_files: [] };
async function main() {
    if (!process.argv.includes('--confirm-development-read-only')) throw Error('DEVELOPMENT_READ_ONLY_CONFIRMATION_REQUIRED');
    if (process.env.NODE_ENV === 'production') throw Error('PRODUCTION_FORBIDDEN');
    require('dotenv').config({ path: path.resolve('apps/agent/.env'), quiet: true });
    require('dotenv').config({ path: path.resolve('apps/api/.env'), quiet: true });
    const url = new URL(process.env.DATABASE_URL || '');
    // Fail closed for remote databases; this test is authorized for local development only.
    if (!['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)) throw Error('NONLOCAL_DATABASE_REQUIRES_SEPARATE_AUTHORIZATION');
    url.searchParams.set('connection_limit', '1');
    url.searchParams.set('options', '-c default_transaction_read_only=on -c statement_timeout=5000');
    process.env.DATABASE_URL = url.toString();
    process.env.NODE_ENV = 'development';
    const { PrismaClient } = require('@prisma/client');
    let queries = 0;
    const client = new PrismaClient({ datasources: { db: { url: url.toString() } }, log: [{ emit: 'event', level: 'query' }] });
    client.$on('query', () => { queries++; });
    globalThis.prisma = client;
    try {
        await client.$transaction(async tx => {
            const [state] = await tx.$queryRaw`SELECT current_setting('transaction_read_only') AS readonly`;
            assert.equal(state.readonly, 'on');
            report.postgres_read = 'PASS';
            const actor = await tx.user.findFirst({ where: { role: { in: ['ADMIN', 'STAFF'] }, isActive: true }, select: { id: true } });
            report.authorized_actor_found = Boolean(actor);
            const ingredient = await tx.ingredient.findFirst({ where: { isActive: true, deletedAt: null }, select: { id: true }, orderBy: { id: 'asc' } });
            report.active_ingredient_found = Boolean(ingredient);
            if (!actor) report.errors.push('BLOCKED_NO_AUTHORIZED_ACTOR');
            if (!ingredient) report.errors.push('BLOCKED_NO_TEST_DATA');
            // All Backend repositories reuse this repeatable-read, read-only transaction.
            globalThis.prisma = tx;
            const { createBackendToolServices } = require('../dist/workflows/tool-services.js');
            const { createReadOnlyAgentRuntime, createToolRegistry, TOOL_CONTRACTS } = require('@cafe-project/agent/workflows');
            const services = createBackendToolServices();
            const registry = createToolRegistry({ authorize: services.authorize, availability: async id => {
                report.tool_executed = true;
                const before = queries;
                const output = await services.availability(id);
                assert.ok(queries > before, 'Availability handler must query PostgreSQL');
                report.backend_real = 'PASS';
                return output;
            } }, 'BACKEND');
            const workflow = createReadOnlyAgentRuntime({ toolRegistry: registry, authorize: services.authorize });
            const prompt = ingredient
                ? `Check current inventory for ingredientId ${ingredient.id}. Call getIngredientAvailability exactly once with this ID.`
                : 'Check inventory. No ingredientId is supplied. Do not invent an ID; return the explicit INSUFFICIENT_CONTEXT error.';
            // Provider-only gate never fabricates an identity or dispatches a Backend tool.
            const { generateNativeToolPlan } = require('../../agent/dist/services/openai-planner.service.js');
            const catalog = registry.capabilities().filter(c => c.bound && c.mode === 'BACKEND' &&
                TOOL_CONTRACTS[c.name].status === 'IMPLEMENTED' && TOOL_CONTRACTS[c.name].category === 'READ');
            report.gate_a = 'FAIL';
            const originalFetch = globalThis.fetch;
            let plan;
            try {
                globalThis.fetch = async (url, options) => {
                    report.provider_requests++;
                    report.tool_schema_count = JSON.parse(options.body).tools.length;
                    const response = await originalFetch(url, options);
                    report.provider_http_status = response.status;
                    return response;
                };
                plan = await generateNativeToolPlan(prompt, catalog);
            } finally { globalThis.fetch = originalFetch; }
            if (!ingredient) throw Error('BLOCKED_NO_TEST_DATA');
            report.native_tool_calling = 'PASS';
            assert.equal(plan.steps.length, 1);
            assert.equal(plan.steps[0].tool, 'getIngredientAvailability');
            assert.deepEqual(plan.steps[0].input, { ingredientId: ingredient.id });
            assert.equal(TOOL_CONTRACTS.getIngredientAvailability.input.safeParse(plan.steps[0].input).success, true);
            report.gate_a = 'PASS';
            report.validated_tool_calls = plan.steps.length;
            if (!actor) {
                report.status = 'PARTIAL_SUCCESS';
                report.gate_b = report.gate_c = 'BLOCKED';
                throw Error('BLOCKED_NO_AUTHORIZED_ACTOR');
            }
            await services.authorize(actor.id, 'agent.run');
            await services.authorize(actor.id, TOOL_CONTRACTS[plan.steps[0].tool].permission);
            report.gate_b = 'FAIL';
            report.gate_c = 'FAIL';
            const before = queries;
            const result = await workflow.executeDynamicTools(actor.id, plan);
            assert.equal(result.status, 'SUCCEEDED');
            assert.ok(queries > before, 'Backend must query PostgreSQL');
            report.tool_registry = report.backend_real = 'PASS';
            report.gate_b = report.gate_c = 'PASS';
            const direct = await services.availability(ingredient.id);
            assert.deepEqual(result.results[plan.steps[0].id], direct);
            report.result_verified = true;
            const [after] = await tx.$queryRaw`SELECT current_setting('transaction_read_only') AS readonly`;
            assert.equal(after.readonly, 'on');
            report.status = 'PASS';
        }, { isolationLevel: 'RepeatableRead', timeout: 150000, maxWait: 5000 });
    } finally { await client.$disconnect(); delete globalThis.prisma; }
}
main().catch(error => {
    const safe = /^(BLOCKED_|LLM_|INVALID_|TOOL_|FORBIDDEN|PRODUCTION_|NONLOCAL_|DEVELOPMENT_)[A-Z_]+$/;
    report.errors.push(safe.test(error.message) ? error.message : 'LIVE_ACCEPTANCE_FAILED_SECRETS_OMITTED');
    if (report.postgres_read === 'PASS' && !error.message.startsWith('BLOCKED_')) report.status = 'FAIL';
    if (error.message.startsWith('LLM_')) report.native_tool_calling = 'FAIL';
}).finally(() => { console.log(JSON.stringify(report)); process.exitCode = report.status === 'PASS' ? 0 : 1; });
