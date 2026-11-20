// WAVE4/AI18-19 live PostgreSQL + real JWT/HTTP acceptance. Opt-in required.
// Creates ONLY a test-owned proposal, persists a real active ADMIN rejection
// for that proposal and a newer pending revision. Never approves or purchases.
// Usage: $env:AGENT_STATUS_CAFEDB_CONFIRMED='YES'; node apps/api/tests/agent-purchase-status-wave4.cafedb.cjs
'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const net = require('node:net');
const { randomUUID, randomBytes } = require('node:crypto');
const { execFileSync } = require('node:child_process');
require('dotenv').config({ path: 'apps/api/.env', quiet: true });

const root = 'D:/KLTN/cafe-project-artifacts/reports/security';
const runId = 'agent-purchase-status-wave4-' + randomUUID();
const out = root + '/' + runId;
fs.mkdirSync(out, { recursive: true });
const iso = () => new Date().toISOString();
const sanitized = value => JSON.stringify(value, (key, val) =>
    /token|password|authorization|secret|databaseurl/i.test(key) ? '[REDACTED]' :
        typeof val === 'bigint' ? val.toString() : val, 2);
const docker = (args, timeout = 22000) => execFileSync('docker', args, {
    cwd: process.cwd(), encoding: 'utf8', timeout, windowsHide: true,
    stdio: ['ignore', 'pipe', 'pipe']
}).trim();
const unusedPort = () => new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
        const port = server.address().port;
        server.close(() => resolve(port));
    });
});
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const output = {
    runId, startedAt: iso(), verdict: 'NOT_RUN', database: 'cafedb',
    evidenceClass: 'REAL_POSTGRES_HTTP_JWT_AI18_STATUS_TEST_OWNED_ONLY',
    fixture: {}, proxy: {}, migration: {}, requests: [], checks: {},
    noApproval: true, purchaseExecuted: false, snapshots: {}, error: null
};
const save = name => fs.writeFileSync(out + '/' + name, sanitized(output), 'utf8');

let ownProxy = false, db, listener, applicationPrisma;
const proxyName = 'ai-status-owned-' + randomUUID().slice(0, 10);
function cleanProxy() {
    if (!ownProxy) return;
    try {
        docker(['stop', '--time', '2', proxyName], 18000);
        ownProxy = false;
        output.proxy.removed = true;
    } catch (error) {
        output.proxy.cleanupError = String(error.message).slice(0, 250);
    }
}
process.on('exit', cleanProxy);

async function main() {
    try {
        assert.equal(process.env.AGENT_STATUS_CAFEDB_CONFIRMED, 'YES',
            'Explicit permission required for test-owned real ADMIN rejection');
        const uri = new URL(process.env.DATABASE_URL);
        assert.equal(uri.pathname, '/cafedb', 'Wrong DB target');
        assert.equal(docker(['inspect', 'cafe_postgres', '--format', '{{.State.Running}}']), 'true');
        const nets = JSON.parse(docker(['inspect', 'cafe_postgres',
            '--format', '{{json .NetworkSettings.Networks}}']));
        assert.ok(nets.bridge?.IPAddress);
        const port = await unusedPort();
        // Both sides are allocated for this run; no fixed host/container port.
        const proxyContainerPort = 25000 + Math.floor(Math.random() * 20000);
        const proxyScript = [
            'const n=require("node:net");',
            'n.createServer(c=>{const u=n.connect(5432,process.env.PG_TARGET);',
            'c.on("error",()=>u.destroy());u.on("error",()=>c.destroy());',
            'c.pipe(u);u.pipe(c);}).listen(Number(process.env.PROXY_LISTEN_PORT),"0.0.0.0");'
        ].join('');
        docker(['run', '--rm', '-d', '--name', proxyName, '--network', 'bridge',
            '-p', '127.0.0.1:' + port + ':' + proxyContainerPort,
            '-e', 'PG_TARGET=' + nets.bridge.IPAddress,
            '-e', 'PROXY_LISTEN_PORT=' + proxyContainerPort,
            '--entrypoint', 'node', 'cafe-agent:local', '-e', proxyScript], 30000);
        ownProxy = true;
        output.proxy = { name: proxyName, hostPort: port,
            containerPort: proxyContainerPort, removed: false };
        uri.hostname = '127.0.0.1';
        uri.port = String(port);
        process.env.DATABASE_URL = uri.toString();
        process.env.NODE_ENV = 'test';
        process.env.AGENT_INTERNAL_TOKEN = randomBytes(64).toString('base64url');
        require('ts-node').register({ project: 'apps/api/tsconfig.json', transpileOnly: true });
        const { PrismaClient, Prisma } = require('@prisma/client');
        const jwt = require('jsonwebtoken');
        const express = require('express');
        db = new PrismaClient({ datasources: { db: { url: uri.toString() } } });
        let identity;
        for (let attempt = 0; attempt < 30; attempt++) {
            try {
                [identity] = await db.$queryRawUnsafe(
                    'SELECT current_database() AS name, current_user AS role');
                break;
            } catch (error) {
                if (attempt === 29) throw error;
                await sleep(150);
            }
        }
        assert.equal(identity?.name, 'cafedb');
        const applied = await db.$queryRawUnsafe(
            'SELECT migration_name, checksum, finished_at, rolled_back_at ' +
            'FROM "_prisma_migrations" ORDER BY migration_name');
        const folders = fs.readdirSync('packages/database/prisma/schema/migrations', {
            withFileTypes: true
        }).filter(item => item.isDirectory()).map(item => item.name).sort();
        assert.equal(applied.filter(row => row.finished_at).length, 15);
        assert.equal(applied.filter(row => !row.finished_at && !row.rolled_back_at).length, 0);
        assert.deepEqual(applied.map(row => row.migration_name), folders);
        assert.ok(applied.some(row =>
            row.migration_name === '20261119161000_agent_proposal_version_rejection' && row.finished_at));
        const schemaFields = Prisma.dmmf.datamodel.models.find(x =>
            x.name === 'AgentPurchaseProposalVersion')?.fields ?? [];
        assert.ok(['rejectedById', 'rejectedAt', 'rejectionReason'].every(name =>
            schemaFields.some(field => field.name === name && !field.isRequired)));
        const liveFields = await db.$queryRawUnsafe(
            "SELECT column_name,is_nullable FROM information_schema.columns " +
            "WHERE table_name='AgentPurchaseProposalVersion' AND " +
            "column_name IN ('rejectedById','rejectedAt','rejectionReason')");
        assert.equal(liveFields.length, 3);
        assert.ok(liveFields.every(x => x.is_nullable === 'YES'));
        output.migration = { identity, applied: applied.length, expected: folders.length,
            rejectionFieldsNullable: true, prismaClientGenerated: true };

        const [admin, staff] = await Promise.all([
            db.user.findFirstOrThrow({
                where: { role: 'ADMIN', isActive: true },
                select: { id: true, email: true, role: true, isActive: true }
            }),
            db.user.findFirstOrThrow({
                where: { role: 'STAFF', isActive: true },
                select: { id: true, email: true, role: true, isActive: true }
            })
        ]);
        const supplierLink = await db.supplierIngredient.findFirst({
            where: { ingredient: { isActive: true, deletedAt: null },
                supplier: { status: 'ACTIVE', deletedAt: null },
                minOrderQuantity: { gte: 1 }, conversionQuantity: { gt: 0 } },
            include: { ingredient: { select: {
                id: true, baseUnit: true, quantity: true, reserved: true,
                movementCursor: true, rowVersion: true
            } } },
            orderBy: { createdAt: 'asc' }
        });
        assert.ok(supplierLink && supplierLink.conversionTargetUnit === supplierLink.ingredient.baseUnit,
            'No compatible active supplier ingredient for isolated test proposal');
        const proposalId = 'ai-status-wave4-' + randomUUID();
        const snapshot = {
            supplierId: supplierLink.supplierId,
            ingredientId: supplierLink.ingredientId,
            quantity: Math.max(1, supplierLink.minOrderQuantity),
            unit: supplierLink.purchaseUnit,
            baseUnit: supplierLink.ingredient.baseUnit,
            unitsPerPack: supplierLink.conversionQuantity.toString(),
            unitPrice: new Prisma.Decimal(supplierLink.pricePerBaseUnit)
                .mul(supplierLink.conversionQuantity).toDecimalPlaces(2).toFixed(2),
            notes: runId + ' isolated pending proposal; no real purchase',
            emailContent: null
        };
        output.fixture = { proposalId, adminId: admin.id, staffId: staff.id,
            ingredientId: supplierLink.ingredientId, supplierId: supplierLink.supplierId,
            owningRun: runId, leftForAudit: true };
        const monitored = async () => ({
            purchaseRequests: await db.purchaseRequest.count(),
            purchaseOrders: await db.purchaseOrder.count(),
            purchaseOrderItems: await db.purchaseOrderItem.count(),
            purchaseOrderEvents: await db.purchaseOrderEvent.count(),
            goodsReceipts: await db.goodsReceipt.count(),
            purchaseCommands: await db.agentPurchaseCommandReceipt.count(),
            ledger: await db.inventoryTransaction.count(),
            ingredient: await db.ingredient.findUnique({ where: { id: supplierLink.ingredientId },
                select: { quantity: true, reserved: true, movementCursor: true, rowVersion: true } }),
            ingredientLedger: await db.inventoryTransaction.count({
                where: { ingredientId: supplierLink.ingredientId }
            }),
            ingredientBatches: await db.ingredientBatch.aggregate({
                where: { ingredientId: supplierLink.ingredientId },
                _count: { id: true },
                _sum: { quantityRemaining: true, quantityInitial: true }
            })
        });
        const before = await monitored();
        output.snapshots.before = before;
        save('before.json');
        const app = express();
        app.use(express.json());
        app.use('/api/agent', require('../src/modules/agent/agent.route').default);
        app.use(require('../src/common/error-handler').errorHandler);
        applicationPrisma = require('@cafe-project/database').prisma;
        listener = app.listen(0, '127.0.0.1');
        await new Promise(resolve => listener.once('listening', resolve));
        const base = 'http://127.0.0.1:' + listener.address().port + '/api/agent';
        const claims = user => ({ id: user.id, email: user.email, role: user.role });
        const signedAdmin = jwt.sign(claims(admin), process.env.JWT_SECRET, { expiresIn: '15m' });
        const signedStaff = jwt.sign(claims(staff), process.env.JWT_SECRET, { expiresIn: '15m' });
        const serviceHeader = { 'x-agent-internal-token': process.env.AGENT_INTERNAL_TOKEN };
        const recordPath = value => value.replaceAll(proposalId, ':ownProposal')
            .replaceAll(admin.id, ':activeAdmin').replaceAll(staff.id, ':activeStaff');
        async function request(method, route, payload, role, headers = {}) {
            const token = role === 'ADMIN' ? signedAdmin : role === 'STAFF' ? signedStaff : null;
            const response = await fetch(base + route, {
                method, headers: { 'content-type': 'application/json',
                    ...(token ? { Authorization: 'Bearer ' + token } : {}), ...headers },
                body: payload === undefined ? undefined : JSON.stringify(payload),
                signal: AbortSignal.timeout(25000)
            });
            const text = await response.text();
            let body;
            try { body = JSON.parse(text); }
            catch { body = { message: 'NON_JSON_RESPONSE' }; }
            output.requests.push({ method, path: recordPath(route),
                role, status: response.status, error: response.status >= 400 ?
                    String(body.message || body.code).slice(0, 140) : null });
            return { status: response.status, data: body.data, body };
        }
        const statusRoute = (ref, actorId = admin.id, suffix = '') =>
            '/internal/purchase-proposals/' + proposalId + '/status?' +
            new URLSearchParams({ actorId, version: String(ref.version),
                contentHash: ref.contentHash }).toString() + suffix;
        const ensure = (result, status, description) => {
            assert.equal(result.status, status, description + ': ' + sanitized(result.body).slice(0, 400));
            output.checks[description] = true;
            return result;
        };

        const created = ensure(await request('POST', '/internal/purchase-proposals',
            { proposalId, snapshot }, 'SERVICE', serviceHeader), 201, 'created-test-owned-proposal');
        const reference = { version: created.data.version, contentHash: created.data.contentHash };
        assert.equal(reference.version, 1);
        assert.match(reference.contentHash, /^[a-f0-9]{64}$/);
        const pending = ensure(await request('GET', statusRoute(reference), undefined, 'SERVICE',
            serviceHeader), 200, 'current-admin-service-status');
        const publicFields = [
            'proposalId', 'version', 'contentHash', 'status', 'approvedById',
            'approvedAt', 'rejectedById', 'rejectedAt', 'rejectionReason',
            'purchaseRequestId', 'writesPerformed'
        ];
        assert.deepEqual(Object.keys(pending.data).sort(), publicFields.sort(),
            'Status projection contains unexpected fields or omits required evidence');
        assert.equal(pending.data.status, 'PENDING_APPROVAL');
        assert.equal(pending.data.writesPerformed, false);
        assert.equal(pending.data.purchaseRequestId, null);
        assert.equal(pending.data.approvedById, null);
        assert.equal(pending.data.rejectedById, null);
        assert.equal(pending.data.contentHash, reference.contentHash);
        ensure(await request('GET', statusRoute(reference, staff.id), undefined, 'SERVICE',
            serviceHeader), 403, 'staff-principal-service-forbidden');
        ensure(await request('GET', statusRoute(reference, 'unknown-' + randomUUID()),
            undefined, 'SERVICE', serviceHeader), 403, 'unknown-principal-forbidden');
        ensure(await request('GET', statusRoute(reference), undefined, 'SERVICE',
            { 'x-agent-internal-token': 'wrong-' + randomUUID() }), 403,
        'wrong-service-token-forbidden');
        ensure(await request('GET', statusRoute(reference), undefined, 'SERVICE'), 403,
            'missing-service-token-forbidden');
        ensure(await request('GET', statusRoute(reference, ''), undefined, 'SERVICE',
            serviceHeader), 400, 'malformed-actor-forbidden');
        ensure(await request('GET', statusRoute(reference).replace('version=1', 'version=bad'),
            undefined, 'SERVICE', serviceHeader), 400, 'malformed-revision-forbidden');
        ensure(await request('GET', statusRoute(reference) + '&unexpected=1',
            undefined, 'SERVICE', serviceHeader), 400, 'extra-query-key-forbidden');
        ensure(await request('GET', statusRoute(reference).replace(reference.contentHash, 'bad'),
            undefined, 'SERVICE', serviceHeader), 400, 'malformed-content-hash-forbidden');
        ensure(await request('GET', statusRoute(reference).replace(
            proposalId, 'unknown-' + randomUUID()), undefined, 'SERVICE', serviceHeader),
        404, 'unknown-proposal-path-404');
        ensure(await request('GET', statusRoute({ ...reference, version: 2 }),
            undefined, 'SERVICE', serviceHeader), 409, 'stale-revision-409');
        ensure(await request('GET', statusRoute({
            ...reference, contentHash: 'a'.repeat(64) }), undefined, 'SERVICE', serviceHeader),
        409, 'stale-hash-409');

        const reason = 'WAVE4 isolated ADMIN veto: no procurement approved';
        const rejection = { ...reference, reason };
        ensure(await request('POST', '/purchase-proposals/' + proposalId + '/reject',
            rejection, 'STAFF'), 403, 'staff-cannot-reject');
        ensure(await request('POST', '/purchase-proposals/' + proposalId + '/reject',
            { ...rejection, version: 9 }, 'ADMIN'), 409, 'stale-rejection-409');
        // Competing first-time vetoes share the same exact revision/hash and
        // must converge on one durable decision rather than overwrite it.
        const parallel = await Promise.all([
            request('POST', '/purchase-proposals/' + proposalId + '/reject',
                rejection, 'ADMIN'),
            request('POST', '/purchase-proposals/' + proposalId + '/reject',
                rejection, 'ADMIN')
        ]);
        const first = ensure(parallel[0], 200, 'concurrent-genuine-admin-veto');
        ensure(parallel[1], 200, 'concurrent-same-decision-replay');
        assert.equal(first.data.rejectedById, admin.id);
        assert.ok(first.data.rejectedAt);
        assert.equal(first.data.rejectionReason, reason);
        assert.equal(parallel[1].data.rejectedAt, first.data.rejectedAt);
        output.checks.realAdminVetoTestOwnedOnly = true;
        output.checks.concurrentRejectionRace = true;
        const replay = ensure(await request('POST', '/purchase-proposals/' + proposalId +
            '/reject', rejection, 'ADMIN'), 200, 'exact-rejection-replay');
        assert.equal(replay.data.rejectedAt, first.data.rejectedAt);
        ensure(await request('POST', '/purchase-proposals/' + proposalId + '/reject',
            { ...rejection, reason: 'Different rejection reason' }, 'ADMIN'),
        409, 'different-rejection-replay-409');
        const rejectedStatus = ensure(await request('GET', statusRoute(reference),
            undefined, 'SERVICE', serviceHeader), 200, 'persisted-rejected-status');
        assert.equal(rejectedStatus.data.status, 'REJECTED');
        assert.equal(rejectedStatus.data.rejectedById, admin.id);
        assert.equal(rejectedStatus.data.rejectedAt, first.data.rejectedAt);
        assert.equal(rejectedStatus.data.rejectionReason, reason);
        assert.equal(rejectedStatus.data.writesPerformed, false);
        assert.equal(rejectedStatus.data.purchaseRequestId, null);
        const v1 = await db.agentPurchaseProposalVersion.findUniqueOrThrow({
            where: { proposalId_version: { proposalId, version: 1 } }
        });
        assert.equal(v1.approvedById, null);
        assert.equal(v1.approvedAt, null);
        assert.equal(v1.rejectedById, admin.id);
        assert.equal(v1.rejectionReason, reason);
        assert.ok(v1.rejectedAt);
        const nextSnapshot = { ...snapshot, notes: snapshot.notes + ' revised and pending' };
        const revision = ensure(await request('PUT',
            '/internal/purchase-proposals/' + proposalId,
            { reference, snapshot: nextSnapshot }, 'SERVICE', serviceHeader), 200,
        'new-revision-created');
        const nextRef = { version: revision.data.version, contentHash: revision.data.contentHash };
        assert.equal(nextRef.version, 2);
        assert.notEqual(nextRef.contentHash, reference.contentHash);
        const fresh = ensure(await request('GET', statusRoute(nextRef),
            undefined, 'SERVICE', serviceHeader), 200, 'new-revision-pending-status');
        assert.equal(fresh.data.status, 'PENDING_APPROVAL');
        assert.equal(fresh.data.rejectedAt, null);
        assert.equal(fresh.data.rejectedById, null);
        assert.equal(fresh.data.approvedById, null);
        assert.equal(fresh.data.purchaseRequestId, null);
        assert.equal(fresh.data.writesPerformed, false);
        ensure(await request('GET', statusRoute(reference), undefined, 'SERVICE',
            serviceHeader), 409, 'old-revision-now-stale-409');
        ensure(await request('POST', '/purchase-proposals/' + proposalId + '/reject',
            rejection, 'ADMIN'), 409, 'old-rejection-after-revise-stale-409');
        const v2 = await db.agentPurchaseProposalVersion.findUniqueOrThrow({
            where: { proposalId_version: { proposalId, version: 2 } }
        });
        const v1Again = await db.agentPurchaseProposalVersion.findUniqueOrThrow({
            where: { proposalId_version: { proposalId, version: 1 } }
        });
        assert.equal(v2.rejectedAt, null);
        assert.equal(v2.approvedAt, null);
        assert.equal(v1Again.rejectedAt.toISOString(), v1.rejectedAt.toISOString());
        assert.equal(await db.purchaseRequest.count({ where: { agentProposalId: proposalId } }), 0);
        const after = await monitored();
        output.snapshots.after = after;
        assert.equal(sanitized(after), sanitized(before),
            'PR/PO/ledger/stock baseline changed unexpectedly');
        output.checks.pgPersistedExactRejection = true;
        output.checks.pgNewRevisionIndependentPending = true;
        output.checks.noPRPOStockOrLedgerEffect = true;
        output.fixture.revisionCount = 2;
        output.verdict = 'BACKEND_PASS_AI18_WAVE4';
    } catch (error) {
        output.verdict = 'FAIL';
        output.error = String(error.stack || error).slice(0, 2500);
        process.exitCode = 1;
    } finally {
        if (listener) await new Promise(resolve => listener.close(resolve));
        if (db) await db.$disconnect();
        if (applicationPrisma) await applicationPrisma.$disconnect();
        cleanProxy();
        output.finishedAt = iso();
        save('final.json');
        fs.writeFileSync(out + '/report.md', [
            '# WAVE4 Backend Agent purchase proposal status acceptance',
            '', 'RUNID: ' + runId, 'Verdict: ' + output.verdict,
            'Database: cafedb; current database verified before any fixture insertion',
            'Migration: 15/15 preapplied; generated Prisma Client rejection fields present',
            'Fixture: ' + (output.fixture.proposalId || 'not created'),
            'Real ADMIN rejection: ' + !!output.checks.realAdminVetoTestOwnedOnly,
            'No approval, real purchase, supplier or payment performed',
            'Verified PR/PO/ledger/ingredient state unchanged: ' +
                !!output.checks.noPRPOStockOrLedgerEffect,
            'Owned proxy removed: ' + !!output.proxy.removed,
            'Requests: ' + output.requests.length,
            'Error: ' + (output.error || 'none'),
            'Evidence: before.json, final.json'
        ].join('\r\n'), 'utf8');
        console.log(sanitized({ runId, verdict: output.verdict, reportDir: out,
            requests: output.requests.length, passed: Object.keys(output.checks).length,
            proxyRemoved: output.proxy.removed, error: output.error }));
    }
}
main().catch(error => {
    output.verdict = 'FAIL';
    output.error = String(error.stack || error).slice(0, 2500);
    save('final.json');
    console.error(output.error);
    process.exitCode = 2;
});
