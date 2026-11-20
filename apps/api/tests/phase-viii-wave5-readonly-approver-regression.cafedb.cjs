// Post-Wave5 Backend approver-integrity change: real JWT/PG read-only regression.
// No fixtures, approval/rejection mutations or purchasing. No existing tests edited.
// WAVE5_READONLY_CONFIRMED=YES node apps/api/tests/phase-viii-wave5-readonly-approver-regression.cafedb.cjs
'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const net = require('node:net');
const { randomUUID, randomBytes, createHash } = require('node:crypto');
const { execFileSync } = require('node:child_process');
require('dotenv').config({ path: 'apps/api/.env', quiet: true });

const runId = 'wave5-readonly-assurance-' + randomUUID();
const reportDir = 'D:/KLTN/cafe-project-artifacts/reports/security/' + runId;
fs.mkdirSync(reportDir, { recursive: true });
const serial = value => JSON.stringify(value, (key, val) =>
    /password|secret|token|authorization|DATABASE_URL/i.test(key) ? '[REDACTED]' :
    typeof val === 'bigint' ? val.toString() : val, 2);
const save = name => fs.writeFileSync(reportDir + '/' + name, serial(record), 'utf8');
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const docker = (args, timeout = 20000) => execFileSync('docker', args,
    { encoding: 'utf8', cwd: process.cwd(), windowsHide: true, timeout,
        stdio: ['ignore', 'pipe', 'pipe'] }).trim();
const freePort = () => new Promise((resolve, reject) => {
    const s = net.createServer();
    s.once('error', reject);
    s.listen(0, '127.0.0.1', () => {
        const port = s.address().port;
        s.close(() => resolve(port));
    });
});
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const record = {
    runId, startedAt: new Date().toISOString(), verdict: 'NOT_RUN',
    mode: 'REAL_JWT_HTTP_POSTGRES_READ_ONLY_EXISTING_PROPOSALS',
    database: 'cafedb', mutations: 0, approvals: 0, purchases: 0,
    baseline: {}, after: {}, identity: {}, migrations: {}, fixtures: [],
    http: [], assertions: {}, proxy: {}, source: {}, limitations: [
        '481/481 historical full-monorepo log predates new inactive-approver source fix',
        'No inactive approver injected and no existing approved revision assumed',
        'New fix cannot be marked live APPROVER_NO_LONGER_ACTIVE PASS unless preexisting eligible approved/inactive revision exists',
        'No native LangGraph checkpoint or privileged purchase execution proven',
        'Audit retains prior KT/UAT/policy verdicts; a read-only GET is not a human approval'
    ]
};
const proxy = 'wave5-ro-owned-' + randomUUID().slice(0, 10);
let started = false, client, applicationClient, httpServer;
function stopProxy() {
    if (!started) return;
    try {
        docker(['stop', '--time', '2', proxy], 15000);
        started = false;
        record.proxy.removed = true;
    } catch (error) {
        record.proxy.cleanupError = String(error.message).slice(0, 200);
    }
}
process.on('exit', stopProxy);

async function main() {
    try {
        assert.equal(process.env.WAVE5_READONLY_CONFIRMED, 'YES');
        const databaseUrl = new URL(process.env.DATABASE_URL);
        assert.equal(databaseUrl.pathname, '/cafedb');
        assert.equal(docker(['inspect', 'cafe_postgres', '--format', '{{.State.Running}}']), 'true');
        const networks = JSON.parse(docker(['inspect', 'cafe_postgres',
            '--format', '{{json .NetworkSettings.Networks}}']));
        const target = networks.bridge?.IPAddress;
        assert.ok(target, 'cafe_postgres bridge target unavailable');
        const hostPort = await freePort();
        const internalPort = 26000 + Math.floor(Math.random() * 16000);
        const code = 'const n=require("node:net");' +
            'n.createServer(c=>{const u=n.connect(5432,process.env.PG_TARGET);' +
            'c.on("error",()=>u.destroy());u.on("error",()=>c.destroy());' +
            'c.pipe(u);u.pipe(c);}).listen(Number(process.env.LISTEN_PORT),"0.0.0.0");';
        docker(['run', '--rm', '-d', '--name', proxy, '--network', 'bridge',
            '-p', '127.0.0.1:' + hostPort + ':' + internalPort,
            '-e', 'PG_TARGET=' + target, '-e', 'LISTEN_PORT=' + internalPort,
            '--entrypoint', 'node', 'cafe-agent:local', '-e', code], 30000);
        started = true;
        record.proxy = { name: proxy, hostPort, internalPort, removed: false };
        databaseUrl.hostname = '127.0.0.1';
        databaseUrl.port = String(hostPort);
        process.env.DATABASE_URL = databaseUrl.toString();
        process.env.NODE_ENV = 'test';
        process.env.AGENT_INTERNAL_TOKEN = randomBytes(64).toString('base64url');
        require('ts-node').register({ project: 'apps/api/tsconfig.json', transpileOnly: true });
        const { PrismaClient, Prisma } = require('@prisma/client');
        const jwt = require('jsonwebtoken');
        const express = require('express');
        client = new PrismaClient({ datasources: { db: { url: databaseUrl.toString() } } });
        let identity;
        for (let attempt = 0; attempt < 35; attempt++) {
            try {
                [identity] = await client.$queryRawUnsafe(
                    'SELECT current_database() db,current_user actor');
                break;
            } catch (error) {
                if (attempt === 34) throw error;
                await sleep(130);
            }
        }
        assert.equal(identity.db, 'cafedb');
        record.identity = identity;
        const applied = await client.$queryRawUnsafe(
            'SELECT migration_name,checksum,finished_at,rolled_back_at ' +
            'FROM "_prisma_migrations" ORDER BY migration_name');
        const migrationRoot = 'packages/database/prisma/schema/migrations';
        const names = fs.readdirSync(migrationRoot, { withFileTypes: true })
            .filter(x => x.isDirectory()).map(x => x.name).sort();
        assert.equal(applied.length, 15);
        assert.ok(applied.every(x => x.finished_at && !x.rolled_back_at));
        assert.deepEqual(applied.map(x => x.migration_name), names);
        for (const m of applied) {
            const file = migrationRoot + '/' + m.migration_name + '/migration.sql';
            assert.equal(m.checksum, sha(fs.readFileSync(file)),
                'migration checksum drift: ' + m.migration_name);
        }
        assert.ok(names.includes('20261119133000_kt14_event_guard'));
        assert.ok(names.includes('20261119161000_agent_proposal_version_rejection'));
        const fields = Prisma.dmmf.datamodel.models.find(x =>
            x.name === 'AgentPurchaseProposalVersion')?.fields ?? [];
        assert.ok(['rejectedById', 'rejectedAt', 'rejectionReason'].every(name =>
            fields.some(field => field.name === name && !field.isRequired)));
        const servicePath = 'apps/api/src/modules/agent/purchase-proposal.service.ts';
        record.source = { path: servicePath,
            sha256AtStart: sha(fs.readFileSync(servicePath)), unchangedDuringRun: false };
        assert.match(fs.readFileSync(servicePath, 'utf8'),
            /APPROVER_NO_LONGER_ACTIVE/);
        record.migrations = { applied: 15, checksumVerified: 15,
            unresolved: 0, generatedClientRejectionFields: true };
        const actor = await client.user.findFirstOrThrow({
            where: { role: 'ADMIN', isActive: true },
            select: { id: true, email: true, role: true, isActive: true }
        });
        const staff = await client.user.findFirstOrThrow({
            where: { role: 'STAFF', isActive: true },
            select: { id: true, email: true, role: true, isActive: true }
        });
        const wave4 = JSON.parse(fs.readFileSync(
            'D:/KLTN/cafe-project-artifacts/reports/security/' +
            'agent-purchase-status-wave4-79961b49-dd0d-4f72-8e5a-8b7f18d150d4/final.json', 'utf8'));
        const wave5Graph = JSON.parse(fs.readFileSync(
            'D:/KLTN/cafe-project-artifacts/reports/agent/' +
            'agent-pg-committed-3b907159-aca3-497f-93b4-1db97edcfbae.json', 'utf8'));
        assert.equal(wave4.verdict, 'BACKEND_PASS_AI18_WAVE4');
        assert.equal(wave5Graph.status, 'BACKEND_PASS_COMMITTED_JWT_RESTART');
        const ids = [
            { name: 'PENDING', id: wave4.fixture.proposalId, version: 2 },
            { name: 'REJECTED', id: wave5Graph.phases[0].result.ai18.proposalId, version: 1 }
        ];
        assert.ok(ids.every(x => /^[a-z0-9-]+$/.test(x.id)));
        const preexisting = [];
        for (const item of ids) {
            const proposal = await client.agentPurchaseProposal.findUniqueOrThrow({
                where: { id: item.id },
                include: { revisions: true }
            });
            assert.equal(proposal.currentVersion, item.version);
            const current = proposal.revisions.find(x => x.version === item.version);
            assert.ok(current);
            assert.match(current.contentHash, /^[0-9a-f]{64}$/);
            assert.equal(current.approvedAt, null);
            assert.equal(current.rejectedAt !== null, item.name === 'REJECTED');
            assert.equal(await client.purchaseRequest.count({
                where: { agentProposalId: item.id }
            }), 0);
            preexisting.push({ ...item, hash: current.contentHash,
                rejectedById: current.rejectedById, rejectedAt: current.rejectedAt });
        }
        const counts = async () => ({
            purchaseRequests: await client.purchaseRequest.count(),
            purchaseOrders: await client.purchaseOrder.count(),
            purchaseEvents: await client.purchaseOrderEvent.count(),
            ledger: await client.inventoryTransaction.count(),
            lotEvents: await client.lotEvent.count(),
            stockHistory: await client.stocktakeEntryHistory.count(),
            stockBatches: await client.ingredientBatch.count(),
            proposals: await client.agentPurchaseProposal.count(),
            versions: await client.agentPurchaseProposalVersion.count()
        });
        record.baseline = await counts();
        record.fixtures = preexisting.map(x => ({
            source: x.name === 'PENDING' ? wave4.runId : wave5Graph.runId,
            proposalId: x.id, version: x.version, state: x.name,
            preexisting: true, mutationByThisRun: false
        }));
        const [totals] = await client.$queryRawUnsafe(
            'SELECT COUNT(*) FILTER (WHERE v."approvedById" IS NOT NULL)::int approved,' +
            'COUNT(*) FILTER (WHERE v."approvedById" IS NOT NULL AND ' +
            '(u.id IS NULL OR u."isActive"=false OR u.role::text <> \'ADMIN\'))::int inactiveApprover ' +
            'FROM "AgentPurchaseProposalVersion" v LEFT JOIN "User" u ON u.id=v."approvedById"');
        record.approverCandidate = {
            approvedVersions: totals.approved,
            inactiveApproverVersions: totals.inactiveapprover ?? totals.inactiveApprover,
            liveInactiveApproverCase: totals.inactiveapprover > 0 ? 'ELIGIBLE_EXISTING_ONLY' :
                'NOT_RUN_NO_EXISTING_INACTIVE_APPROVER',
            noDatabaseRoleMutation: true
        };
        save('before.json');
        const app = express();
        app.use(express.json());
        app.use('/api/agent', require('../src/modules/agent/agent.route').default);
        app.use(require('../src/common/error-handler').errorHandler);
        applicationClient = require('@cafe-project/database').prisma;
        httpServer = app.listen(0, '127.0.0.1');
        await new Promise(resolve => httpServer.once('listening', resolve));
        const base = 'http://127.0.0.1:' + httpServer.address().port + '/api/agent';
        const token = user => jwt.sign({ id: user.id, email: user.email, role: user.role },
            process.env.JWT_SECRET, { expiresIn: '12m' });
        const adminJwt = token(actor), staffJwt = token(staff);
        const service = { 'x-agent-internal-token': process.env.AGENT_INTERNAL_TOKEN };
        const statusUri = (item, version = item.version, digest = item.hash, actorId = actor.id) =>
            '/internal/purchase-proposals/' + item.id + '/status?' +
            new URLSearchParams({ actorId, version: String(version), contentHash: digest });
        const fetchResult = async (label, pathname, opts = {}) => {
            const response = await fetch(base + pathname, {
                method: 'GET', headers: {
                    ...(opts.role === 'ADMIN' ? { Authorization: 'Bearer ' + adminJwt } :
                        opts.role === 'STAFF' ? { Authorization: 'Bearer ' + staffJwt } : {}),
                    ...(opts.service === 'VALID' ? service : opts.service === 'WRONG' ?
                        { 'x-agent-internal-token': 'invalid-' + randomUUID() } : {})
                }, signal: AbortSignal.timeout(20000)
            });
            const raw = await response.text();
            let body;
            try { body = JSON.parse(raw); }
            catch { body = { message: 'NON_JSON' }; }
            record.http.push({ label, status: response.status,
                role: opts.role || 'SERVICE', code: body.code ?? null,
                error: response.status >= 400 ? String(body.message).slice(0, 120) : null });
            return { status: response.status, body };
        };
        const expect = (label, response, code, errorCode) => {
            assert.equal(response.status, code, label + ': ' + serial(response.body).slice(0, 200));
            if (errorCode) assert.equal(response.body.code, errorCode, label);
            record.assertions[label] = true;
            return response.body.data;
        };
        for (const item of preexisting) {
            const label = item.name.toLowerCase();
            const valid = expect(label + '-unchanged', await fetchResult(label + '-unchanged',
                statusUri(item), { service: 'VALID' }), 200);
            assert.equal(valid.status, item.name === 'PENDING' ? 'PENDING_APPROVAL' : 'REJECTED');
            assert.equal(valid.version, item.version);
            assert.equal(valid.contentHash, item.hash);
            assert.equal(valid.writesPerformed, false);
            assert.equal(valid.purchaseRequestId, null);
            assert.equal(valid.approvedAt, null);
            assert.equal(Boolean(valid.rejectedAt), item.name === 'REJECTED');
            const adminView = expect(label + '-ADMIN-JWT-200',
                await fetchResult(label + '-ADMIN-JWT-200',
                    '/purchase-proposals/' + item.id, { role: 'ADMIN' }), 200);
            assert.equal(adminView.version, item.version);
            expect(label + '-STAFF-service-403',
                await fetchResult(label + '-STAFF-service-403',
                    statusUri(item, item.version, item.hash, staff.id),
                    { service: 'VALID' }), 403);
            expect(label + '-STAFF-JWT-403',
                await fetchResult(label + '-STAFF-JWT-403',
                    '/purchase-proposals/' + item.id, { role: 'STAFF' }), 403);
        }
        const pending = preexisting[0];
        expect('stale-hash-409', await fetchResult('stale-hash-409',
            statusUri(pending, pending.version, 'f'.repeat(64)),
            { service: 'VALID' }), 409, 'STALE_PROPOSAL');
        expect('bad-service-token-403', await fetchResult('bad-service-token-403',
            statusUri(pending), { service: 'WRONG' }), 403);
        expect('missing-service-token-403', await fetchResult('missing-service-token-403',
            statusUri(pending)), 403);
        expect('malformed-actor-400', await fetchResult('malformed-actor-400',
            statusUri(pending, pending.version, pending.hash, ''),
            { service: 'VALID' }), 400);
        record.after = await counts();
        assert.equal(serial(record.after), serial(record.baseline),
            'Observed PR/PO/ledger/lot/stock/proposal record counts changed');
        assert.equal(record.source.sha256AtStart,
            sha(fs.readFileSync(record.source.path)), 'Production source changed during run');
        record.source.unchangedDuringRun = true;
        for (const item of preexisting) {
            const latest = await client.agentPurchaseProposal.findUniqueOrThrow({
                where: { id: item.id },
                include: { revisions: true }
            });
            assert.equal(latest.currentVersion, item.version);
            const rev = latest.revisions.find(x => x.version === item.version);
            assert.equal(rev.contentHash, item.hash);
            assert.equal(rev.rejectedAt?.toISOString() ?? null,
                item.rejectedAt?.toISOString() ?? null);
        }
        record.assertions.noPersistentBusinessMutation = true;
        record.verdict = 'PASS_READ_ONLY_PENDING_REJECTED_REGRESSION';
    } catch (error) {
        record.verdict = 'FAIL';
        record.error = String(error.stack || error.message).slice(0, 2400);
        process.exitCode = 1;
    } finally {
        if (httpServer) await new Promise(resolve => httpServer.close(resolve));
        if (client) await client.$disconnect();
        if (applicationClient) await applicationClient.$disconnect();
        stopProxy();
        record.finishedAt = new Date().toISOString();
        save('final.json');
        const equals = serial(record.baseline) === serial(record.after);
        fs.writeFileSync(reportDir + '/report.md', [
            '# Wave5 read-only post-source-fix evidence',
            '', 'RunID: ' + runId,
            'Verdict: ' + record.verdict,
            'Current database: cafedb, 15 migrations/checksums verified, generated client validated',
            'HTTP GET total: ' + record.http.length,
            'Named checks: ' + Object.keys(record.assertions).length,
            'Pre-existing states: PENDING_APPROVAL + REJECTED, unchanged',
            'Existing inactive approver candidates: ' +
                (record.approverCandidate?.inactiveApproverVersions ?? 'not evaluated'),
            'APPROVER_NO_LONGER_ACTIVE branch: ' +
                (record.approverCandidate?.liveInactiveApproverCase ?? 'NOT_RUN'),
            'Global PR/PO/ledger/lot/stock/proposal counts identical: ' + equals,
            'Owned Docker proxy removed: ' + !!record.proxy.removed,
            'No test fixtures, ADMIN changes, approvals or purchasing',
            'This does NOT upgrade UAT10/UAT11 privileged or policy signoff gates',
            'Evidence: before.json and final.json'
        ].join('\r\n'), 'utf8');
        console.log(serial({ runId, verdict: record.verdict,
            http: record.http.length, namedChecks: Object.keys(record.assertions).length,
            migrationCount: record.migrations.applied, proxyRemoved: record.proxy.removed,
            noMutation: equals, inactiveApprover: record.approverCandidate?.liveInactiveApproverCase,
            reportDir, error: record.error }));
    }
}
main().catch(error => {
    record.verdict = 'FAIL';
    record.error = String(error.stack || error.message).slice(0,2400);
    save('final.json');
    console.error(record.error);
    process.exitCode = 2;
});
