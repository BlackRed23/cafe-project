import type { Prisma, PrismaClient, UserRole } from '@prisma/client';
import bcrypt from 'bcrypt';

const DATABASE = 'cafedb_v2_test';
export type Account = { email: string; name: string; role: UserRole };
type Tx = Prisma.TransactionClient;

const ERROR_MESSAGES = {
    DATABASE_URL_REQUIRED: 'DATABASE_URL required.',
    DATABASE_URL_INVALID: 'Invalid database URL.',
    DATABASE_TARGET_REJECTED: 'Only PostgreSQL cafedb_v2_test allowed.',
    DATABASE_OPTIONS_REJECTED: 'Unsupported database URL parameter.',
    EMAIL_INVALID: 'Two distinct valid account emails required.',
    PASSWORD_POLICY: 'Password requires 12+ characters, at most 72 UTF-8 bytes, no control or surrounding whitespace.',
    DATABASE_GUARD_REJECTED: 'Database identity, schema or account privileges rejected.',
    ACCOUNT_CONFLICT: 'Existing account conflict; no accounts changed.',
    PLAN_INVALID: 'Invalid bootstrap account plan.',
    PLAN_CHANGED: 'Account plan changed; retry required.',
    TERMINAL_REQUIRED: 'Interactive terminal required.',
    INPUT_INTERRUPTED: 'Password input interrupted.',
    PASSWORD_MISMATCH: 'Password confirmation mismatch.',
    PASSWORD_INPUT_REQUIRED: 'Secure password input required.',
    HASH_FAILED: 'Password hashing failed.',
    USAGE_INVALID: 'Usage: bootstrap:test-accounts [--dry-run|--apply].',
} as const;

export class BootstrapError extends Error {
    constructor(public readonly code: keyof typeof ERROR_MESSAGES) { super(ERROR_MESSAGES[code]); }
    get safeMessage(): string { return ERROR_MESSAGES[this.code]; }
}

export function validateUrl(raw: string | undefined): string {
    if (!raw) throw new BootstrapError('DATABASE_URL_REQUIRED');
    let url: URL;
    try { url = new URL(raw); } catch { throw new BootstrapError('DATABASE_URL_INVALID'); }
    if (!['postgresql:', 'postgres:'].includes(url.protocol) ||
        url.pathname !== `/${DATABASE}` || !url.hostname || url.hash) {
        throw new BootstrapError('DATABASE_TARGET_REJECTED');
    }
    // Reject routing overrides such as options, host, dbname and alternate schemas.
    const allowed = new Set(['schema', 'sslmode', 'connection_limit', 'pool_timeout', 'connect_timeout']);
    for (const [key, value] of url.searchParams) {
        if (!allowed.has(key) || url.searchParams.getAll(key).length !== 1 ||
            (key === 'schema' && value !== 'public')) throw new BootstrapError('DATABASE_OPTIONS_REJECTED');
    }
    return raw;
}

export function accounts(adminEmail: string, staffEmail: string): Account[] {
    const emails = [adminEmail, staffEmail].map(value => value.trim().toLowerCase());
    if (emails.some(value => value.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) || emails[0] === emails[1]) {
        throw new BootstrapError('EMAIL_INVALID');
    }
    return [
        { email: emails[0]!, name: 'Test Admin', role: 'ADMIN' },
        { email: emails[1]!, name: 'Test Staff', role: 'STAFF' },
    ];
}

export function validatePassword(password: string): void {
    if (password.trim() !== password || password.length < 12 || Buffer.byteLength(password, 'utf8') > 72 || /[\x00-\x1f\x7f]/.test(password)) {
        throw new BootstrapError('PASSWORD_POLICY');
    }
}

async function inspect(tx: Tx, targets: Account[]): Promise<Account[]> {
    const [guard] = await tx.$queryRaw<Array<{ database: string; schema: string; allowed: boolean }>>`
        SELECT current_database() AS database, current_schema() AS schema,
            (has_database_privilege(current_user, current_database(), 'CONNECT')
             AND has_schema_privilege(current_user, 'public', 'USAGE')
             AND has_table_privilege(current_user, 'public."User"', 'SELECT')
             AND has_table_privilege(current_user, 'public."User"', 'INSERT')
             AND NOT (SELECT relrowsecurity FROM pg_class WHERE oid = 'public."User"'::regclass)) AS allowed
    `;
    if (!guard || guard.database !== DATABASE || guard.schema !== 'public' || guard.allowed !== true) {
        throw new BootstrapError('DATABASE_GUARD_REJECTED');
    }
    const missing: Account[] = [];
    for (const target of targets) {
        const found = await tx.user.findMany({
            where: { email: { equals: target.email, mode: 'insensitive' } },
            select: { email: true, role: true, isActive: true, provider: true, googleId: true, password: true },
        });
        if (found.length === 0) { missing.push(target); continue; }
        const user = found[0]!;
        if (found.length !== 1 || user.email !== target.email || user.role !== target.role ||
            !user.isActive || user.provider !== 'local' || user.googleId !== null || !user.password) {
            throw new BootstrapError('ACCOUNT_CONFLICT');
        }
    }
    return missing;
}

export async function bootstrap(
    prisma: PrismaClient,
    targets: Account[],
    apply = false,
    passwordFor: (role: UserRole) => Promise<string> = async () => { throw new BootstrapError('PASSWORD_INPUT_REQUIRED'); },
    hash: (password: string, rounds: number) => Promise<string> = bcrypt.hash,
): Promise<{ mode: string; created: number; existing: number; planned: number }> {
    // Validate even callers other than CLI. No arbitrary role or account creation.
    if (targets.length !== 2 || targets[0]?.role !== 'ADMIN' || targets[1]?.role !== 'STAFF' ||
        JSON.stringify(targets) !== JSON.stringify(accounts(targets[0].email, targets[1].email))) {
        throw new BootstrapError('PLAN_INVALID');
    }
    const planned = await prisma.$transaction(async tx => {
        await tx.$executeRaw`SET TRANSACTION READ ONLY`;
        return inspect(tx, targets);
    });
    if (!apply) return { mode: 'dry-run', created: 0, existing: 2 - planned.length, planned: planned.length };
    const hashes = new Map<string, string>();
    for (const target of planned) {
        let password = await passwordFor(target.role);
        try {
            validatePassword(password);
            try { hashes.set(target.email, await hash(password, 12)); }
            catch { throw new BootstrapError('HASH_FAILED'); }
        }
        finally { password = ''; }
    }
    return prisma.$transaction(async tx => {
        // Serialize cooperating bootstrap runs; unique key + serializable isolation
        // also cause rollback on competing external inserts. Never upsert/update.
        await tx.$queryRaw`SELECT pg_advisory_xact_lock(160113, 2)::text`;
        const missing = await inspect(tx, targets);
        for (const target of missing) {
            const password = hashes.get(target.email);
            if (!password) throw new BootstrapError('PLAN_CHANGED');
            await tx.user.create({ data: { ...target, password, provider: 'local', isActive: true }, select: { id: true } });
        }
        return { mode: 'apply', created: missing.length, existing: 2 - missing.length, planned: planned.length };
    }, { isolationLevel: 'Serializable' });
}
