// Opt-in ONLY; not matched by npm test. No fixtures, writes, app bootstrap, jobs, email or LLM.
const assert = require('node:assert/strict');
const path = require('node:path');
async function main() {
    const args = process.argv.slice(2);
    const expected = args[args.indexOf('--database') + 1];
    if (!args.includes('--confirm-read-only') || !args.includes('--database') || !expected || expected.startsWith('--')) {
        throw Error('EXPLICIT_APPROVED_DATABASE_AND_READ_ONLY_FLAG_REQUIRED');
    }
    require('dotenv').config({ path: path.resolve('apps/api/.env') });
    const connection = new URL(process.env.DATABASE_URL || '');
    if (decodeURIComponent(connection.pathname.slice(1)) !== expected) throw Error('APPROVED_DATABASE_MISMATCH');
    connection.searchParams.set('connection_limit', '1');
    connection.searchParams.set('options', '-c default_transaction_read_only=on -c statement_timeout=4000');
    const { PrismaClient } = require('@prisma/client');
    const client = new PrismaClient({ datasources: { db: { url: connection.toString() } } });
    // Existing database package honors global singleton; every actual Backend Service uses this client.
    globalThis.prisma = client;
    process.env.DATABASE_URL = connection.toString();
    const summary = { database: expected, mode: 'READ_ONLY', fixturesCreated: 0, businessWrites: 0, tests: [] };
    try {
        await client.$executeRawUnsafe('SET default_transaction_read_only = on');
        await client.$executeRawUnsafe('SET statement_timeout = 4000');
        const [identity] = await client.$queryRaw`SELECT current_database() AS name, current_setting('default_transaction_read_only') AS readonly`;
        assert.equal(identity.name, expected); assert.equal(identity.readonly, 'on');
        const user = await client.user.findFirst({ where: { role: 'ADMIN', isActive: true }, select: { id: true } });
        if (!user) throw Error('SAFE_SCOPE_HAS_NO_ACTIVE_ADMIN');
        const product = await client.product.findFirst({ select: { id: true }, orderBy: { id: 'asc' } });
        const ingredient = await client.ingredient.findFirst({ where: { isActive: true, deletedAt: null }, select: { id: true }, orderBy: { id: 'asc' } });
        const shared = require('@cafe-project/agent/workflows');
        const { createBackendToolRegistry } = require('../dist/workflows/tool-services.js');
        const registry = createBackendToolRegistry();
        const { getCurrentUser } = require('../dist/modules/auth/auth.service.js');
        const business = { toolRegistry: registry, authorize: async actor => {
            const current = await getCurrentUser(actor); if (current.role !== 'ADMIN') throw Error('FORBIDDEN'); return current;
        } };
        const agent = new shared.AgentWorkflow(new shared.MockAgentRepository(), business, { plan: async () => { throw Error('LLM_FORBIDDEN'); } });
        const to = new Date(), from = new Date(to.getTime() - 30 * 86400000);
        for (const [name, input] of [
            ['getSalesHistory', product ? { productId: product.id, from: from.toISOString(), to: to.toISOString() } : null],
            ['calculateReorderQuantity', ingredient ? { ingredientId: ingredient.id } : null],
        ]) {
            if (!input) { summary.tests.push({ tool: name, status: 'BLOCKED_NO_EXISTING_FIXTURE' }); continue; }
            const result = await agent.dispatchTool(user.id, name, input);
            if (!result.ok) {
                summary.tests.push({ tool: name, status: result.error === 'BLOCKED' ? 'BLOCKED_SOURCE_DATA' : 'FAIL', error: result.error });
                continue;
            }
            assert.equal(shared.TOOL_CONTRACTS[name].output.safeParse(result.output).success, true);
            summary.tests.push({ tool: name, status: 'PASS', complete: result.output.complete, quantity: result.output.quantity,
                soldQuantity: result.output.soldQuantity, mode: result.evidence.mode });
        }
        const [after] = await client.$queryRaw`SELECT current_setting('default_transaction_read_only') AS readonly`;
        assert.equal(after.readonly, 'on');
        console.log(JSON.stringify(summary));
        if (summary.tests.some(t => t.status === 'FAIL')) process.exitCode = 1;
        else if (summary.tests.some(t => t.status !== 'PASS')) process.exitCode = 2;
    } finally { await client.$disconnect(); delete globalThis.prisma; }
}
main().catch(() => { console.error(JSON.stringify({ status: 'BLOCKED', reason: 'READ_ONLY_PREFLIGHT_OR_BACKEND_CHECK_FAILED', secretsOmitted: true })); process.exitCode = 1; });
