/**
 * Explicit test-only safety boundary. Fault hooks are impossible against the
 * shared cafedb, even when a caller sets only one opt-in environment variable.
 * Never use this module for ordinary production fault tolerance.
 */
import { prisma } from '@cafe-project/database';

export async function verifiedIsolatedActFault(ingredientId: string): Promise<boolean> {
    const target = process.env.ACT_E2E_FAULT_INGREDIENT_ID;
    if (!target || target !== ingredientId) return false;
    if (process.env.AGENT_ACT_READ_EXECUTION !== 'YES' ||
        process.env.ACT_ISOLATED_DB_CONFIRMED !== 'YES' ||
        process.env.ACT_E2E_ENABLE_FAULTS !== 'YES') {
        throw new Error('ACT_TEST_FAULT_NOT_AUTHORIZED');
    }
    let configured: URL;
    try { configured = new URL(process.env.DATABASE_URL ?? ''); }
    catch { throw new Error('ACT_TEST_DATABASE_NOT_VERIFIED'); }
    const actFixture = configured.pathname === '/act_acceptance_8a4e1ba1';
    // D4 owns a SEPARATE, uniquely OID-pinned schema-only acceptance database.
    // Never generalize this gate to an arbitrary database name or all 'd4_%'.
    const d4Fixture = configured.pathname === '/d4_runtime_20261120_c5cf7347' &&
        process.env.D4_E2E_DB_CONFIRMED === 'YES' &&
        process.env.AGENT_SESSION_D4_LIVE_AUTHORITY === 'YES' &&
        process.env.AGENT_SESSION_D_INTEGRATION === 'YES';
    if (!actFixture && !d4Fixture) {
        throw new Error('ACT_TEST_DATABASE_NOT_VERIFIED');
    }
    const rows = await prisma.$queryRaw<Array<{ name: string; oid: string }>>`
        SELECT current_database() AS name,
            (SELECT oid::text FROM pg_database WHERE datname=current_database()) AS oid
    `;
    if (rows.length !== 1 || !(actFixture &&
        rows[0]?.name === 'act_acceptance_8a4e1ba1' && rows[0]?.oid === '46615') &&
        !(d4Fixture && rows[0]?.name === 'd4_runtime_20261120_c5cf7347' &&
            rows[0]?.oid === '54090')) throw new Error('ACT_TEST_DATABASE_NOT_VERIFIED');
    return true;
}
