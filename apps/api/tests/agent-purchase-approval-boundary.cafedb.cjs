// AI15/18/19/21/22: real JWT/Backend/Postgres purchase proposal security boundary.
// Opt-in with an owned Docker proxy. Creates ONLY a reviewable proposal, never
// ADMIN approval, PurchaseRequest/PO, email or real supplier communication.
'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { randomUUID, randomBytes } = require('node:crypto');
require('dotenv').config({ path: 'apps/api/.env', quiet: true });
assert.equal(process.env.PROPOSAL_CAFEDB_CONFIRMED, 'YES');
const url = new URL(process.env.DATABASE_URL);
assert.equal(url.pathname, '/cafedb');
url.hostname = '127.0.0.1'; url.port = process.env.PROPOSAL_DB_PORT || '15432';
process.env.DATABASE_URL = url.toString();
process.env.NODE_ENV = 'test';
process.env.AGENT_INTERNAL_TOKEN = randomBytes(64).toString('base64url');
require('ts-node').register({ project: 'apps/api/tsconfig.json', transpileOnly: true });
const { PrismaClient, Prisma } = require('@prisma/client');
const jwt = require('jsonwebtoken');
const express = require('express');
const db = new PrismaClient({ datasources: { db: { url: url.toString() } } });
const runId = 'ai-purchase-held-' + randomUUID();
const folder = 'D:/KLTN/cafe-project-artifacts/reports/agent';
fs.mkdirSync(folder, { recursive: true });
const output = folder + '/' + runId + '.json';
const report = { runId, caseIds: ['AI15', 'AI18', 'AI19', 'AI21', 'AI22'],
    startedAt: new Date().toISOString(), database: 'cafedb',
    verdict: 'NOT_RUN', evidenceClass: 'REAL_JWT_HTTP_PRISMA_APPROVAL_BOUNDARY_NO_ADMIN_APPROVAL',
    authorizedAdminApprovalExecuted: false, purchaseExecuted: false,
    requests: [], fixture: {}, snapshots: {} };
const clean = data => JSON.stringify(data, (key, value) =>
    /token|password|secret|signature|authorization/i.test(key) ? '[REDACTED]' :
        typeof value === 'bigint' ? String(value) : value, 2);
let listener;
async function main() {
    try {
        const [identity] = await db.$queryRawUnsafe('SELECT current_database() AS name');
        assert.equal(identity.name, 'cafedb');
        const [admin, staff] = await Promise.all([
            db.user.findFirstOrThrow({ where: { role: 'ADMIN', isActive: true },
                select: { id: true, role: true, email: true } }),
            db.user.findFirstOrThrow({ where: { role: 'STAFF', isActive: true },
                select: { id: true, role: true, email: true } })
        ]);
        const link = await db.supplierIngredient.findFirst({
            where: { ingredient: { isActive: true, deletedAt: null },
                supplier: { status: 'ACTIVE', deletedAt: null },
                minOrderQuantity: { gte: 1 }, conversionQuantity: { gt: 0 } },
            include: { ingredient: { select: { id: true, baseUnit: true, quantity: true,
                reserved: true, movementCursor: true, rowVersion: true } } },
            orderBy: { createdAt: 'asc' }
        });
        if (!link || link.conversionTargetUnit !== link.ingredient.baseUnit)
            throw new Error('BLOCKED_FIXTURE: no compatible active SupplierIngredient');
        const price = new Prisma.Decimal(link.pricePerBaseUnit)
            .mul(link.conversionQuantity).toDecimalPlaces(2).toFixed(2);
        const proposalId = 'ai-held-' + randomUUID();
        const snapshot = {
            supplierId: link.supplierId, ingredientId: link.ingredientId,
            quantity: Math.max(1, link.minOrderQuantity), unit: link.purchaseUnit,
            baseUnit: link.ingredient.baseUnit, unitsPerPack: link.conversionQuantity.toString(),
            unitPrice: price, notes: runId + ': review only', emailContent: null
        };
        report.fixture = { proposalId, supplierId: link.supplierId,
            ingredientId: link.ingredientId, adminId: admin.id, staffId: staff.id,
            noRealSupplierContact: true };
        const baseline = async () => ({
            ingredient: await db.ingredient.findUnique({
                where: { id: link.ingredientId },
                select: { quantity: true, reserved: true, movementCursor: true, rowVersion: true }
            }),
            ledger: await db.inventoryTransaction.count({ where: { ingredientId: link.ingredientId } }),
            purchaseRequests: await db.purchaseRequest.count(),
            purchaseOrderItems: await db.purchaseOrderItem.count(),
            commandReceipts: await db.agentPurchaseCommandReceipt.count(),
        });
        const before = await baseline();
        report.snapshots.before = before;
        const app = express();
        app.use(express.json());
        app.use('/api/agent', require('../src/modules/agent/agent.route').default);
        app.use(require('../src/common/error-handler').errorHandler);
        listener = app.listen(0, '127.0.0.1');
        await new Promise(resolve => listener.once('listening', resolve));
        const base = 'http://127.0.0.1:' + listener.address().port + '/api/agent';
        const signed = user => jwt.sign(user, process.env.JWT_SECRET, { expiresIn: '10m' });
        async function http(method, path, body, role, header = {}) {
            const token = role === 'ADMIN' ? signed(admin) : role === 'STAFF' ? signed(staff) : null;
            const response = await fetch(base + path, {
                method, headers: { 'content-type': 'application/json',
                    ...(token ? { Authorization: 'Bearer ' + token } : {}), ...header },
                body: body === undefined ? undefined : JSON.stringify(body),
                signal: AbortSignal.timeout(20000)
            });
            // Express returns a plain HTML 404 for an absent privileged route.
            // Preserve the real status instead of assuming all error bodies are JSON.
            const textBody = await response.text();
            let json;
            try { json = JSON.parse(textBody); }
            catch {
                json = { message: 'NON_JSON_RESPONSE', contentType: response.headers.get('content-type') };
            }
            report.requests.push({ method, path: path.replace(proposalId, ':proposalId'),
                actorRole: role, status: response.status,
                error: response.status >= 400 ? json.message || json.code : null });
            return { status: response.status, data: json.data, json };
        }
        const svc = { 'x-agent-internal-token': process.env.AGENT_INTERNAL_TOKEN };
        const first = await http('POST', '/internal/purchase-proposals', {
            proposalId, snapshot
        }, 'SERVICE', svc);
        assert.equal(first.status, 201, clean(first.json).slice(0, 700));
        const ref = { version: first.data.version, contentHash: first.data.contentHash };
        assert.equal(ref.version, 1);
        assert.match(ref.contentHash, /^[a-f0-9]{64}$/);
        const saved = await http('GET', '/purchase-proposals/' + proposalId,
            undefined, 'ADMIN');
        assert.equal(saved.status, 200);
        assert.equal(saved.data.approvedById, null);
        assert.equal(saved.data.purchaseRequest, null);

        const deniedStaff = await http('POST', '/purchase-proposals/' + proposalId +
            '/approve', ref, 'STAFF');
        assert.equal(deniedStaff.status, 403);
        const wrongHash = await http('POST', '/purchase-proposals/' + proposalId +
            '/approve', { ...ref, contentHash: 'f'.repeat(64) }, 'ADMIN');
        assert.equal(wrongHash.status, 409, clean(wrongHash.json).slice(0, 800));
        const cannotExecute = await http('POST', '/internal/purchase-proposals/' +
            proposalId + '/execute', { ...ref, idempotencyKey: randomUUID() }, 'SERVICE', svc);
        assert.equal(cannotExecute.status, 403);
        const staffCannotExecute = await http('POST', '/purchase-proposals/' +
            proposalId + '/execute', { ...ref, idempotencyKey: randomUUID() }, 'STAFF');
        assert.equal(staffCannotExecute.status, 403);
        const anonymousCannotRead = await http('GET', '/purchase-proposals/' +
            proposalId, undefined, 'ANONYMOUS');
        assert.equal(anonymousCannotRead.status, 401);
        const serviceCannotReject = await http('POST', '/internal/purchase-proposals/' +
            proposalId + '/reject', { ...ref, reason: 'Unauthorized internal rejection' }, 'SERVICE', svc);
        assert.equal(serviceCannotReject.status, 404);
        const forgedActor = await http('POST', '/purchase-proposals/' + proposalId +
            '/reject', { ...ref, reason: 'Forged identity', actorId: admin.id }, 'ADMIN');
        assert.equal(forgedActor.status, 400);
        // AI18: a real authenticated, current ADMIN rejects THIS test-owned
        // proposal only; this is not an ADMIN purchase approval.
        const reason = 'Test-only veto: no new purchasing is authorized';
        const veto = await http('POST', '/purchase-proposals/' + proposalId +
            '/reject', { ...ref, reason }, 'ADMIN');
        assert.equal(veto.status, 200, clean(veto.json).slice(0, 800));
        assert.equal(veto.data.rejectedById, admin.id);
        assert.equal(veto.data.rejectionReason, reason);
        assert.ok(veto.data.rejectedAt);
        const sameVeto = await http('POST', '/purchase-proposals/' + proposalId +
            '/reject', { ...ref, reason }, 'ADMIN');
        assert.equal(sameVeto.status, 200);
        assert.equal(sameVeto.data.rejectedAt, veto.data.rejectedAt);
        const vetoStaff = await http('POST', '/purchase-proposals/' + proposalId +
            '/reject', { ...ref, reason }, 'STAFF');
        assert.equal(vetoStaff.status, 403);
        const vetoWrongVersion = await http('POST', '/purchase-proposals/' + proposalId +
            '/reject', { ...ref, version: 999, reason }, 'ADMIN');
        assert.equal(vetoWrongVersion.status, 409);
        const cannotApproveRejected = await http('POST', '/purchase-proposals/' +
            proposalId + '/approve', ref, 'ADMIN');
        assert.equal(cannotApproveRejected.status, 409);
        const cannotExecuteRejected = await http('POST', '/internal/purchase-proposals/' +
            proposalId + '/execute', { ...ref, idempotencyKey: randomUUID() }, 'SERVICE', svc);
        assert.equal(cannotExecuteRejected.status, 409);
        const after = await baseline();
        report.snapshots.after = after;
        assert.deepEqual(JSON.parse(clean(after)), JSON.parse(clean(before)));
        const persisted = await db.agentPurchaseProposalVersion.findUniqueOrThrow({
            where: { proposalId_version: { proposalId, version: 1 } }
        });
        assert.equal(persisted.approvedById, null);
        assert.equal(persisted.approvedAt, null);
        assert.equal(persisted.rejectedById, admin.id);
        assert.equal(persisted.rejectionReason, reason);
        assert.ok(persisted.rejectedAt);
        assert.equal(await db.purchaseRequest.count({ where: { agentProposalId: proposalId } }), 0);
        report.verdict = 'BACKEND_PASS_REJECTION_AND_APPROVAL_BOUNDARY';
        report.proposalSavedForReview = true;
        report.approvalPersisted = false;
        report.authorizedAdminRejectionExecuted = true;
        report.exactVersionRejectionPersisted = true;
        report.noPurchaseOrStockEffect = true;
        report.httpCount = report.requests.length;
        report.limitations = ['Only a test-owned proposal was rejected by authorized ADMIN JWT; no purchasing approved',
            'Not a successful post-approval graph→purchase operation',
            'No external supplier or payment confirmation'];
    } catch (error) {
        report.verdict = 'FAIL'; report.error = String(error.stack || error).slice(0, 1900);
        process.exitCode = 1;
    } finally {
        if (listener) await new Promise(resolve => listener.close(resolve));
        await db.$disconnect();
        report.finishedAt = new Date().toISOString();
        fs.writeFileSync(output, clean(report), 'utf8');
        console.log(clean({ output, runId, verdict: report.verdict,
            count: report.requests.length, error: report.error?.slice(0, 500) }));
    }
}
main().catch(error => { console.error(error); process.exitCode = 2; });
