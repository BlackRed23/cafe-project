import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PrismaClient } from '@prisma/client';

const require = createRequire(import.meta.url);
const schema = fileURLToPath(new URL('./schema', import.meta.url));
const migrations = path.join(schema, 'migrations');
const legacy = '20261116090000_expand_preserve_legacy';
const marker = 'migration.compat.' + legacy;
const digest = 'c5dbc1b09396b384da49a0302a665f299e5c7094aac003430257b424a0a5536d';

function prisma(args, input) {
    const result = spawnSync(process.execPath, [
        require.resolve('prisma/build/index.js'), ...args, '--schema', schema
    ], { input, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] });
    if (result.error) throw result.error;
    const redact = value => value.replace(/postgres(?:ql)?:\/\/[^\s"'\x60]+/gi, '[REDACTED_DATABASE_URL]');
    process.stdout.write(redact(result.stdout));
    process.stderr.write(redact(result.stderr));
    return result.status === 0;
}

function legacySql() {
    const source = readFileSync(path.join(migrations, legacy, 'migration.sql'), 'utf8').replace(/\r\n/g, '\n');
    if (createHash('sha256').update(source).digest('hex') !== digest) {
        throw new Error('Historical migration checksum differs');
    }
    // Keep the table locks, empty-business assertions, transformations and
    // before/after User comparison from the reviewed historical SQL.
    return source.split('\n').filter(line =>
        !line.includes("IF current_database() <> 'cafe-kltn'") &&
        !line.includes('User baseline changed') &&
        !line.includes('User differs from verified backup')
    ).join('\n');
}

async function deploy() {
    const url = new URL(process.env.DATABASE_URL || 'invalid://missing');
    const expected = process.env.CAFE_MIGRATION_DATABASE;
    if (!['postgres:', 'postgresql:'].includes(url.protocol) ||
        !/^[A-Za-z0-9_-]{1,63}$/.test(expected || '') ||
        decodeURIComponent(url.pathname.slice(1)) !== expected ||
        (url.searchParams.get('schema') || 'public') !== 'public') {
        throw new Error('Set DATABASE_URL and CAFE_MIGRATION_DATABASE for the exact public-schema target');
    }
    const db = new PrismaClient({ datasourceUrl: url.toString() });
    try {
        const [identity] = await db.$queryRaw`SELECT current_database() AS name, current_schema() AS schema`;
        if (identity.name !== expected || identity.schema !== 'public') throw new Error('Migration target mismatch');
        if (prisma(['migrate', 'deploy'])) return;

        const history = await db.$queryRaw`SELECT migration_name AS name, finished_at IS NOT NULL AS finished,
            checksum FROM "_prisma_migrations" WHERE rolled_back_at IS NULL`;
        const prefix = readdirSync(migrations, { withFileTypes: true })
            .filter(entry => entry.isDirectory() && entry.name < legacy)
            .map(entry => entry.name);
        const failures = history.filter(row => !row.finished);
        if (failures.length !== 1 || failures[0].name !== legacy ||
            history.length !== prefix.length + 1 ||
            !prefix.every(name => history.some(row => row.name === name && row.finished))) {
            throw new Error('Deployment failed outside the supported legacy baseline');
        }
        const sql = legacySql();
        const rawChecksum = createHash('sha256').update(readFileSync(path.join(migrations, legacy, 'migration.sql'))).digest('hex');
        if (![digest, rawChecksum].includes(failures[0].checksum)) throw new Error('Failed migration checksum differs');

        const [journal] = await db.$queryRaw`SELECT value FROM "SystemSetting" WHERE key = ${marker}`;
        if (journal) {
            const [shape] = await db.$queryRaw`SELECT to_regclass('public."Ingredient"') IS NOT NULL AS ingredient,
                to_regclass('public."AgentExecution"') IS NOT NULL AS execution`;
            if (journal.value !== digest || !shape.ingredient || !shape.execution) {
                throw new Error('Legacy compatibility journal mismatch');
            }
        }
        if (!journal) {
            const guard = `DO $$ BEGIN
                IF current_database() <> '${expected}' THEN RAISE EXCEPTION 'Migration target mismatch'; END IF;
                IF EXISTS (SELECT 1 FROM "SystemSetting" WHERE key = '${marker}') THEN
                    RAISE EXCEPTION 'Compatibility migration already committed; rerun deploy';
                END IF;
            END $$;`;
            const bridge = sql.replace('-- Populated business migration', () => guard + '\n-- Populated business migration')
                .replace('COMMIT;', `INSERT INTO "SystemSetting" (key, value, "updatedAt")
                    VALUES ('${marker}', '${digest}', CURRENT_TIMESTAMP);\nCOMMIT;`);
            if (!prisma(['db', 'execute', '--stdin'], bridge)) {
                throw new Error('Compatibility transaction failed; populated business schemas need a reviewed mapping');
            }
        }
        if (!prisma(['migrate', 'resolve', '--applied', legacy]) ||
            !prisma(['migrate', 'deploy'])) {
            throw new Error('Migration reconciliation or follow-up deployment failed');
        }
    } finally {
        await db.$disconnect();
    }
}

deploy().catch(error => {
    // Prisma connection failures may contain connection details.
    console.error(error.constructor === Error ? error.message : error.code || error.name);
    process.exitCode = 1;
});
