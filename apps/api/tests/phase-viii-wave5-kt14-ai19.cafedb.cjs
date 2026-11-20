// WAVE5: real Postgres/HTTP JWT acceptance of AI17/AI19/KT14/KT11 read boundaries.
// Every event INSERT/UPDATE/DELETE probe is rolled back. No permanent DB writes.
// Opt-in: WAVE5_CAFEDB_CONFIRMED=YES node apps/api/tests/phase-viii-wave5-kt14-ai19.cafedb.cjs
'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const net = require('node:net');
const { randomUUID, randomBytes, createHash } = require('node:crypto');
const { execFileSync } = require('node:child_process');
require('dotenv').config({ path: 'apps/api/.env', quiet: true });
const runId = 'phase-viii-wave5-' + randomUUID();
const reportDir = 'D:/KLTN/cafe-project-artifacts/reports/security/' + runId;
fs.mkdirSync(reportDir, { recursive: true });
const encode = data => JSON.stringify(data, (key, value) =>
    /password|token|secret|authorization|DATABASE_URL/i.test(key) ? '[REDACTED]' :
    typeof value === 'bigint' ? value.toString() : value, 2);
const write = (filename, data) =>
    fs.writeFileSync(reportDir + '/' + filename, encode(data), 'utf8');
const docker = (args, timeout = 20000) => execFileSync('docker', args, {
    cwd: process.cwd(), windowsHide: true, encoding: 'utf8',
    timeout, stdio: ['ignore', 'pipe', 'pipe']
}).trim();
const freePort = () => new Promise((resolve, reject) => {
    const listener = net.createServer();
    listener.once('error', reject);
    listener.listen(0, '127.0.0.1', () => {
        const port = listener.address().port;
        listener.close(() => resolve(port));
    });
});
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const hash = value => createHash('sha256').update(value).digest('hex');
const report = {
    runId, startedAt: new Date().toISOString(), database: 'cafedb',
    verdict: 'NOT_RUN', migration: {}, fixture: {}, privilege: [],
    http: [], assertions: {}, events: [], baseline: {}, after: {}, proxy: {},
    permanentWritesByTest: 0, approvals: 0, purchaseExecutions: 0,
    boundaries: [
        'KT11: concurrent reads only; does not rerun scheduler or prove cross-host exactly-once',
        'AI17: wrong reference returns STALE_PROPOSAL; no live database corruption is introduced to exercise SNAPSHOT_INTEGRITY',
        'KT14: ordinary SQL DML rejected by triggers; DB owner/superuser can administer triggers, so not a superuser tamper-proof guarantee'
    ]
};
const proxyName = 'wave5-owned-' + randomUUID().slice(0, 12);
let ownProxy = false, db, appDb, server;
function closeProxy() {
    if (!ownProxy) return;
    try {
        docker(['stop', '--time', '2', proxyName], 15000);
        ownProxy = false;
        report.proxy.removed = true;
    } catch (error) {
        report.proxy.cleanupError = String(error.message).slice(0, 200);
    }
}
process.on('exit', closeProxy);

async function run() {
    try {
        assert.equal(process.env.WAVE5_CAFEDB_CONFIRMED, 'YES');
        const original = new URL(process.env.DATABASE_URL);
        assert.equal(original.pathname, '/cafedb');
        assert.equal(docker(['inspect', 'cafe_postgres', '--format', '{{.State.Running}}']), 'true');
        const networks = JSON.parse(docker(['inspect', 'cafe_postgres',
            '--format', '{{json .NetworkSettings.Networks}}']));
        assert.ok(networks.bridge?.IPAddress);
        const hostPort = await freePort();
        const internalPort = 26000 + Math.floor(Math.random() * 18000);
        const proxyScript = [
            'const net=require("node:net");',
            'net.createServer(c=>{const u=net.connect(5432,process.env.PG_TARGET);',
            'c.on("error",()=>u.destroy());u.on("error",()=>c.destroy());',
            'c.pipe(u);u.pipe(c);}).listen(Number(process.env.LISTEN_PORT),"0.0.0.0");'
        ].join('');
        docker(['run', '--rm', '-d', '--name', proxyName, '--network', 'bridge',
            '-p', '127.0.0.1:' + hostPort + ':' + internalPort,
            '-e', 'PG_TARGET=' + networks.bridge.IPAddress,
            '-e', 'LISTEN_PORT=' + internalPort, '--entrypoint', 'node',
            'cafe-agent:local', '-e', proxyScript], 30000);
        ownProxy = true;
        report.proxy = { name: proxyName, hostPort, internalPort, removed: false };
        original.hostname = '127.0.0.1';
        original.port = String(hostPort);
        process.env.DATABASE_URL = original.toString();
        process.env.NODE_ENV = 'test';
        process.env.AGENT_INTERNAL_TOKEN = randomBytes(64).toString('base64url');
        require('ts-node').register({ project: 'apps/api/tsconfig.json', transpileOnly: true });
        const { PrismaClient, Prisma } = require('@prisma/client');
        const jwt = require('jsonwebtoken');
        const express = require('express');
        db = new PrismaClient({ datasources: { db: { url: original.toString() } } });
        let identity;
        for (let index = 0; index < 35; index++) {
            try {
                [identity] = await db.$queryRawUnsafe(
                    'SELECT current_database() name,current_user role');
                break;
            } catch (error) {
                if (index === 34) throw error;
                await sleep(120);
            }
        }
        assert.equal(identity.name, 'cafedb');
        const migrations = await db.$queryRawUnsafe(
            'SELECT migration_name,checksum,finished_at,rolled_back_at ' +
            'FROM "_prisma_migrations" ORDER BY migration_name');
        const directories = fs.readdirSync('packages/database/prisma/schema/migrations',
            { withFileTypes: true }).filter(x => x.isDirectory()).map(x => x.name).sort();
        assert.equal(migrations.length, 15);
        assert.ok(migrations.every(row => row.finished_at && !row.rolled_back_at));
        assert.deepEqual(migrations.map(row => row.migration_name), directories);
        for (const migration of migrations) {
            const sql = fs.readFileSync('packages/database/prisma/schema/migrations/' +
                migration.migration_name + '/migration.sql');
            assert.equal(hash(sql), migration.checksum,
                'Migration checksum drift: ' + migration.migration_name);
        }
        const needed = ['rejectedById', 'rejectedAt', 'rejectionReason'];
        const prismaFields = Prisma.dmmf.datamodel.models.find(x =>
            x.name === 'AgentPurchaseProposalVersion')?.fields ?? [];
        assert.ok(needed.every(name => prismaFields.some(f =>
            f.name === name && !f.isRequired)), 'Generated Prisma Client stale');
        report.migration = { identity, count: migrations.length,
            KT14: migrations.some(x => x.migration_name === '20261119133000_kt14_event_guard'),
            AI18: migrations.some(x =>
                x.migration_name === '20261119161000_agent_proposal_version_rejection'),
            checksumVerified: migrations.length, generatedClientFieldsPresent: true };
        assert.ok(report.migration.KT14 && report.migration.AI18);

        const existingWave4 = JSON.parse(fs.readFileSync(
            'D:/KLTN/cafe-project-artifacts/reports/security/' +
            'agent-purchase-status-wave4-79961b49-dd0d-4f72-8e5a-8b7f18d150d4/final.json', 'utf8'));
        assert.equal(existingWave4.verdict, 'BACKEND_PASS_AI18_WAVE4');
        const proposalId = existingWave4.fixture.proposalId;
        assert.match(proposalId, /^ai-status-wave4-[a-f0-9-]{36}$/);
        const userId = existingWave4.fixture.adminId;
        const staffId = existingWave4.fixture.staffId;
        const [admin, staff] = await Promise.all([
            db.user.findUniqueOrThrow({ where: { id: userId },
                select: { id: true, email: true, role: true, isActive: true } }),
            db.user.findUniqueOrThrow({ where: { id: staffId },
                select: { id: true, email: true, role: true, isActive: true } })
        ]);
        assert.equal(admin.role, 'ADMIN');
        assert.equal(admin.isActive, true);
        assert.equal(staff.role, 'STAFF');
        assert.equal(staff.isActive, true);
        const proposal = await db.agentPurchaseProposal.findUniqueOrThrow({
            where: { id: proposalId },
            include: { revisions: { orderBy: { version: 'asc' } } }
        });
        assert.equal(proposal.currentVersion, 2);
        assert.deepEqual(proposal.revisions.map(x => x.version), [1, 2]);
        const [v1, v2] = proposal.revisions;
        assert.equal(v1.rejectedById, admin.id);
        assert.ok(v1.rejectedAt && v1.rejectionReason);
        assert.equal(v1.approvedAt, null);
        assert.equal(v2.rejectedAt, null);
        assert.equal(v2.approvedAt, null);
        assert.match(v2.contentHash, /^[a-f0-9]{64}$/);
        assert.equal(await db.purchaseRequest.count({ where: { agentProposalId: proposalId } }), 0);
        report.fixture = { proposalId, reusedWave4Run: existingWave4.runId,
            v1: { version: 1, rejected: true, approved: false },
            v2: { version: 2, rejected: false, approved: false },
            actorRoles: ['ADMIN', 'STAFF'], immutableBefore: true };
        const counts = async () => ({
            purchaseRequest: await db.purchaseRequest.count(),
            purchaseOrder: await db.purchaseOrder.count(),
            purchaseOrderEvent: await db.purchaseOrderEvent.count(),
            purchaseOrderItem: await db.purchaseOrderItem.count(),
            goodsReceipt: await db.goodsReceipt.count(),
            inventoryTransaction: await db.inventoryTransaction.count(),
            lotEvent: await db.lotEvent.count(),
            stocktakeEntryHistory: await db.stocktakeEntryHistory.count(),
            inventoryBatch: await db.ingredientBatch.count(),
            purchaseCommandReceipt: await db.agentPurchaseCommandReceipt.count(),
            agentLog: await db.agentLog.count(),
            selectedIngredient: await db.ingredient.findUnique({
                where: { id: existingWave4.fixture.ingredientId },
                select: { quantity: true, reserved: true, movementCursor: true, rowVersion: true }
            }),
            selectedLots: await db.ingredientBatch.aggregate({
                where: { ingredientId: existingWave4.fixture.ingredientId },
                _count: { id: true },
                _sum: { quantityRemaining: true, quantityInitial: true }
            })
        });
        report.baseline = await counts();
        write('before.json', report);
        // Metadata is obtained from the current DB role. Distinguish trigger
        // enforcement from ACL/RLS and the privileged DB account.
        const guardTables = ['PurchaseOrderEvent', 'LotEvent', 'StocktakeEntryHistory'];
        const meta = await db.$queryRawUnsafe(
            "SELECT c.relname table_name,pg_get_userbyid(c.relowner) owner,c.relrowsecurity rls," +
            "has_table_privilege(current_user,c.oid,'INSERT') can_insert," +
            "has_table_privilege(current_user,c.oid,'UPDATE') can_update," +
            "has_table_privilege(current_user,c.oid,'DELETE') can_delete," +
            "COALESCE((SELECT json_agg(json_build_object('name',t.tgname," +
            "'enabled',t.tgenabled,'definition',pg_get_triggerdef(t.oid))) FROM pg_trigger t " +
            "WHERE NOT t.tgisinternal AND t.tgrelid=c.oid),'[]'::json) guards " +
            "FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace " +
            "WHERE n.nspname=current_schema() AND c.relname IN " +
            "('PurchaseOrderEvent','LotEvent','StocktakeEntryHistory') ORDER BY c.relname");
        assert.equal(meta.length, 3);
        const userCaps = (await db.$queryRawUnsafe(
            'SELECT rolsuper,rolcreaterole,rolbypassrls FROM pg_roles WHERE rolname=current_user'))[0];
        report.privilege = meta;
        report.dbRole = { ...userCaps, observedTriggerBlocks: true };
        for (const table of guardTables) {
            const row = meta.find(x => x.table_name === table);
            assert.ok(row);
            assert.ok(row.guards.some(g => g.name === table + '_append_only' &&
                g.enabled === 'O' && /UPDATE/.test(g.definition) && /DELETE/.test(g.definition)),
            'KT14 installed append-only trigger missing: ' + table);
        }

        const app = express();
        app.use(express.json());
        app.use('/api/agent', require('../src/modules/agent/agent.route').default);
        app.use(require('../src/common/error-handler').errorHandler);
        appDb = require('@cafe-project/database').prisma;
        server = app.listen(0, '127.0.0.1');
        await new Promise(resolve => server.once('listening', resolve));
        const base = 'http://127.0.0.1:' + server.address().port + '/api/agent';
        const token = user => jwt.sign({
            id: user.id, email: user.email, role: user.role, jti: runId
        }, process.env.JWT_SECRET, { expiresIn: '15m' });
        const signedAdmin = token(admin), signedStaff = token(staff);
        const serviceHeader = { 'x-agent-internal-token': process.env.AGENT_INTERNAL_TOKEN };
        const statusUri = (version, digest, actor = admin.id) =>
            '/internal/purchase-proposals/' + proposalId + '/status?' +
            new URLSearchParams({ actorId: actor, version: String(version),
                contentHash: digest }).toString();
        const call = async (name, method, pathname, role = 'SERVICE', extra = {}) => {
            const response = await fetch(base + pathname, {
                method, headers: {
                    ...(role === 'ADMIN' ? { Authorization: 'Bearer ' + signedAdmin } :
                        role === 'STAFF' ? { Authorization: 'Bearer ' + signedStaff } : {}),
                    ...extra
                }, signal: AbortSignal.timeout(20000)
            });
            const bodyText = await response.text();
            let body;
            try { body = JSON.parse(bodyText); }
            catch { body = { message: 'NON_JSON' }; }
            report.http.push({ name, method, role, status: response.status,
                code: body.code ?? null, error: response.status >= 400 ?
                    String(body.message || 'unknown').slice(0, 120) : null });
            return { status: response.status, body };
        };
        const required = (label, actual, status, code) => {
            assert.equal(actual.status, status, label + ': ' + encode(actual.body).slice(0, 250));
            if (code) assert.equal(actual.body.code, code, label + ' error code mismatch');
            report.assertions[label] = true;
            return actual.body.data;
        };
        const current = statusUri(2, v2.contentHash);
        const fresh = required('AI19-current-pending', await call('AI19-current-pending',
            'GET', current, 'SERVICE', serviceHeader), 200);
        assert.deepEqual(Object.keys(fresh).sort(), [
            'proposalId','version','contentHash','status','approvedById','approvedAt',
            'rejectedById','rejectedAt','rejectionReason','purchaseRequestId',
            'writesPerformed'].sort());
        assert.equal(fresh.status, 'PENDING_APPROVAL');
        assert.equal(fresh.version, 2);
        assert.equal(fresh.approvedAt, null);
        assert.equal(fresh.rejectedAt, null);
        assert.equal(fresh.purchaseRequestId, null);
        assert.equal(fresh.writesPerformed, false);
        required('AI17-stale-hash-code', await call('AI17-stale-hash-code', 'GET',
            statusUri(2, 'a'.repeat(64)), 'SERVICE', serviceHeader),
        409, 'STALE_PROPOSAL');
        required('AI19-old-revision-stale', await call('AI19-old-revision-stale', 'GET',
            statusUri(1, v1.contentHash), 'SERVICE', serviceHeader),
        409, 'STALE_PROPOSAL');
        required('STAFF-service-principal-403', await call('STAFF-service-principal-403',
            'GET', statusUri(2, v2.contentHash, staff.id), 'SERVICE',
            serviceHeader), 403);
        required('unknown-service-principal-403', await call('unknown-service-principal-403',
            'GET', statusUri(2, v2.contentHash, 'invalid-' + randomUUID()),
            'SERVICE', serviceHeader), 403);
        required('wrong-service-token-403', await call('wrong-service-token-403',
            'GET', current, 'SERVICE', { 'x-agent-internal-token': 'wrong-token' }), 403);
        required('missing-service-token-403', await call('missing-service-token-403',
            'GET', current), 403);
        required('invalid-hash-400', await call('invalid-hash-400',
            'GET', statusUri(2, 'bad'), 'SERVICE', serviceHeader), 400);
        required('unknown-proposal-404', await call('unknown-proposal-404',
            'GET', statusUri(2, v2.contentHash).replace(proposalId, 'unknown-' + randomUUID()),
            'SERVICE', serviceHeader), 404);
        const publicUrl = '/purchase-proposals/' + proposalId;
        const validJwt = required('ADMIN-JWT-view-200', await call('ADMIN-JWT-view-200',
            'GET', publicUrl, 'ADMIN'), 200);
        assert.equal(validJwt.version, 2);
        required('STAFF-JWT-view-403', await call('STAFF-JWT-view-403',
            'GET', publicUrl, 'STAFF'), 403);
        required('anonymous-JWT-view-401', await call('anonymous-JWT-view-401',
            'GET', publicUrl, 'ANONYMOUS'), 401);
        const parallel = await Promise.all(Array.from({ length: 8 }, (_x, index) =>
            call('KT11-concurrent-read-' + index, 'GET', current, 'SERVICE', serviceHeader)));
        assert.ok(parallel.every(x => x.status === 200 &&
            x.body.data?.status === 'PENDING_APPROVAL' &&
            x.body.data?.writesPerformed === false));
        assert.equal(new Set(parallel.map(x =>
            x.body.data.contentHash + ':' + x.body.data.version)).size, 1);
        report.assertions.KT11ConcurrentReadsNoChanges = true;

        // All event data is test-owned and exists exclusively inside one DB
        // transaction. Savepoints recover expected 23514 errors; throwing the
        // sentinel enforces full rollback after verifying INSERT compatibility.
        const parents = {
            PurchaseOrderEvent: (await db.$queryRawUnsafe(
                'SELECT id FROM "PurchaseOrder" ORDER BY "createdAt" DESC LIMIT 1'))[0]?.id,
            LotEvent: (await db.$queryRawUnsafe(
                'SELECT id FROM "IngredientBatch" ORDER BY "createdAt" DESC LIMIT 1'))[0]?.id,
            StocktakeEntryHistory: (await db.$queryRawUnsafe(
                'SELECT id FROM "StocktakeEntry" ORDER BY "createdAt" DESC LIMIT 1'))[0]?.id
        };
        assert.ok(Object.values(parents).every(Boolean), 'Missing real existing FK parent');
        for (const table of guardTables) {
            const id = 'wave5-' + randomUUID();
            const requestId = 'wave5-' + randomUUID();
            let attempts = [];
            try {
                await db.$transaction(async tx => {
                    let insert, values;
                    if (table === 'PurchaseOrderEvent') {
                        insert = 'INSERT INTO "PurchaseOrderEvent" ' +
                            '("id","purchaseOrderId","requestId","type","actorId","payloadHash","details") ' +
                            'VALUES ($1,$2,$3,$4,$5,$6,$7::jsonb)';
                        values = [id, parents[table], requestId, 'WAVE5_ROLLBACK',
                            'WAVE5_TEST', hash(id), JSON.stringify({ runId, rollback: true })];
                    } else if (table === 'LotEvent') {
                        insert = 'INSERT INTO "LotEvent" ' +
                            '("id","batchId","requestId","action","previousStatus",' +
                            '"newStatus","reason","actorId") VALUES ($1,$2,$3,$4,$5,$6,$7,$8)';
                        values = [id, parents[table], requestId, 'WAVE5_ROLLBACK',
                            'AVAILABLE', 'AVAILABLE', 'Rollback-only WAVE5', 'WAVE5_TEST'];
                    } else {
                        insert = 'INSERT INTO "StocktakeEntryHistory" ' +
                            '("id","entryId","revision","previousQty","newQty",' +
                            '"actorId","reason") VALUES ($1,$2,(SELECT COALESCE(' +
                            'MAX("revision"),0)+1 FROM "StocktakeEntryHistory" ' +
                            'WHERE "entryId"=$2),NULL,0.000,$3,$4)';
                        values = [id, parents[table], 'WAVE5_TEST', 'Rollback-only WAVE5'];
                    }
                    assert.equal(await tx.$executeRawUnsafe(insert, ...values), 1);
                    for (const operation of ['UPDATE', 'DELETE']) {
                        await tx.$executeRawUnsafe('SAVEPOINT wave5_guard');
                        let code = null, message = '';
                        try {
                            const query = operation === 'UPDATE' ?
                                'UPDATE "' + table + '" SET "createdAt"="createdAt" WHERE "id"=$1' :
                                'DELETE FROM "' + table + '" WHERE "id"=$1';
                            await tx.$executeRawUnsafe(query, id);
                        } catch (error) {
                            code = String(error.meta?.code ?? error.code ?? '');
                            message = String(error.message || '').slice(0, 180);
                        }
                        await tx.$executeRawUnsafe('ROLLBACK TO SAVEPOINT wave5_guard');
                        await tx.$executeRawUnsafe('RELEASE SAVEPOINT wave5_guard');
                        attempts.push({ operation, sqlstate: code, blocked: code === '23514',
                            message: /append.only/i.test(message) });
                        assert.equal(code, '23514', table + '/' + operation + ' not blocked');
                    }
                    throw new Error('WAVE5_EXPECTED_ROLLBACK');
                }, { timeout: 24000 });
                assert.fail(table + ': fixture accidentally committed');
            } catch (error) {
                if (error.message !== 'WAVE5_EXPECTED_ROLLBACK') throw error;
            }
            report.events.push({ table, validInsertRolledBack: true,
                updateDelete: attempts, committedFixtureRows: 0 });
        }
        assert.equal(report.events.length, 3);
        assert.equal(report.events.flatMap(x => x.updateDelete).filter(x =>
            x.sqlstate === '23514').length, 6);
        report.assertions.KT14RealPGImmutability = true;
        report.after = await counts();
        assert.equal(encode(report.after), encode(report.baseline),
            'Tracked purchasing/stock/ledger/AgentLog counts changed');
        const reread = await db.agentPurchaseProposal.findUniqueOrThrow({
            where: { id: proposalId },
            include: { revisions: { orderBy: { version: 'asc' } } }
        });
        assert.equal(reread.currentVersion, 2);
        assert.equal(reread.revisions[0].rejectedAt.toISOString(), v1.rejectedAt.toISOString());
        assert.equal(reread.revisions[1].rejectedAt, null);
        assert.equal(await db.purchaseRequest.count({ where: { agentProposalId: proposalId } }), 0);
        report.assertions.AI18PersistedStateUnchanged = true;
        report.assertions.NoPurchaseOrInventorySideEffect = true;
        report.verdict = 'BACKEND_PASS_WAVE5_SCOPED';
    } catch (error) {
        report.verdict = 'FAIL';
        report.error = String(error.stack || error.message).slice(0, 2500);
        process.exitCode = 1;
    } finally {
        if (server) await new Promise(resolve => server.close(resolve));
        if (db) await db.$disconnect();
        if (appDb) await appDb.$disconnect();
        closeProxy();
        report.finishedAt = new Date().toISOString();
        write('final.json', report);
        fs.writeFileSync(reportDir + '/report.md', [
            '# Phase VIII WAVE5 independent PG/JWT acceptance',
            '',
            'RunID: ' + runId,
            'Verdict: ' + report.verdict,
            'Database: cafedb, checked 15 finished migrations and SHA256',
            'HTTP: ' + report.http.length + ', checks: ' +
                Object.keys(report.assertions).length,
            'KT14: ' + report.events.length + ' valid rollback-only INSERTs, ' +
                report.events.flatMap(x => x.updateDelete).length +
                ' blocked UPDATE/DELETE probes with SQLSTATE 23514',
            'AI19: persisted WAVE4 v1 REJECTED, v2 PENDING; stale hash/revision 409',
            'KT11: concurrent read-only consistency only; no scheduler exactly-once claim',
            'Purchase/stock/ledger/AgentLog before-after equal: ' +
                (encode(report.baseline) === encode(report.after)),
            'Test-owned proxy removed: ' + !!report.proxy.removed,
            'No permanent writes, approvals, PR/PO or external supplier actions',
            'Limits: ' + report.boundaries.join('; '),
            'Failure: ' + (report.error || 'none'),
            'Evidence: before.json, final.json'
        ].join('\r\n'), 'utf8');
        console.log(encode({ runId, verdict: report.verdict, reportDir,
            http: report.http.length, guards: report.events.length,
            sqlState23514: report.events.flatMap(x => x.updateDelete).filter(x =>
                x.sqlstate === '23514').length,
            checks: Object.keys(report.assertions).length, proxyRemoved: report.proxy.removed,
            noPermanentWrite: report.permanentWritesByTest === 0, error: report.error }));
    }
}
run().catch(error => {
    report.verdict = 'FAIL';
    report.error = String(error.stack || error).slice(0,2500);
    write('final.json',report);
    console.error(report.error);
    process.exitCode = 2;
});
