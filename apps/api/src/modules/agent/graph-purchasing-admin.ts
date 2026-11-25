import { createHash } from 'node:crypto';
import { prisma, type Prisma } from '@cafe-project/database';
import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../../common/async-handler';
import { HttpError } from '../../common/http-error';
import { sendSuccess } from '../../common/response';
import { authenticate, requireRole, type AuthenticatedRequest } from '../auth/auth.middleware';
import { resumeGraphPurchasing } from './agent.client';
import { readIngredientDemandRisk } from './ingredient-demand-risk';
import { proposalReferenceSchema, proposalSnapshotSchema, purchaseProposalService } from './purchase-proposal.service';

const graphIdSchema = z.string().regex(/^[a-f0-9]{64}$/);
const referenceSchema = proposalReferenceSchema.extend({ proposalId: z.string() });
const lineageSchema = z.object({
    graphId: graphIdSchema,
    requestId: z.uuid(),
    scanSessionId: z.string().min(8).max(200),
    ingredientIds: z.array(z.string().regex(/^[A-Za-z0-9][A-Za-z0-9:_-]{0,119}$/)).min(1).max(4),
    readOnly: z.literal(false),
});
const graphSchema = lineageSchema.extend({
    status: z.enum(['RUNNING', 'AWAITING_APPROVAL', 'SUCCEEDED', 'FAILED', 'CANCELLED', 'UNKNOWN', 'DEGRADED_LLM', 'HELD_POLICY']),
    proposalReference: referenceSchema.optional(),
    purchaseRequestId: z.string().optional(),
    trace: z.array(z.object({
        node: z.string().regex(/^[a-z0-9_]{1,80}$/),
        status: z.string().regex(/^[A-Z0-9_]{1,100}$/),
        code: z.string().regex(/^[A-Z0-9_]{1,100}$/).optional(),
    }).optional().catch(undefined)).default([]),
    d4Recommendation: z.object({
        confirmed: z.object({
            stockBase: z.string().regex(/^\d+(\.\d+)?$/),
            targetBase: z.string().regex(/^\d+(\.\d+)?$/),
            shortageBase: z.string().regex(/^\d+(\.\d+)?$/),
            purchaseBase: z.string().regex(/^\d+(\.\d+)?$/).nullable(),
        }).nullable(),
        reviewWarnings: z.array(z.string().regex(/^[A-Z0-9_]{1,100}$/)).optional(),
    }).optional().catch(undefined),
});
const graphLogs = {
    action: { in: ['AGENT_LANGGRAPH_PURCHASING', 'AGENT_LANGGRAPH_PURCHASING_PENDING_OR_HELD'] },
    reference_type: 'AgentGraphReadOnly',
};
const logSelect = { output: true, reference_id: true, createdBy: true, triggered_at: true } as const;
const logOrder = [{ triggered_at: 'desc' }, { id: 'desc' }] satisfies Prisma.AgentLogOrderByWithRelationInput[];
const prefix = 'agent.purchasing.continuation.pending.';
const jobSchema = referenceSchema.extend({
    graphId: graphIdSchema,
    actorId: z.string(),
    scanSessionId: lineageSchema.shape.scanSessionId,
    ingredientIds: lineageSchema.shape.ingredientIds,
});
const jobKey = (proposalId: string, version: number) => prefix + proposalId + '.' + version;
const hash = (parts: string[]) => createHash('sha256').update(JSON.stringify(parts)).digest('hex');

function parseJson(value: string | null): unknown {
    try { return value === null ? null : JSON.parse(value); }
    catch { return null; }
}

function parseLog(log: Prisma.AgentLogGetPayload<{ select: typeof logSelect }>) {
    const parsed = graphSchema.safeParse(parseJson(log.output));
    if (!parsed.success || !log.createdBy) return null;
    const graph = parsed.data;
    const session = hash([log.createdBy, graph.scanSessionId]);
    const requestId = [
        session.slice(0, 8), session.slice(8, 12), '5' + session.slice(13, 16),
        ((parseInt(session[16], 16) & 3) | 8).toString(16) + session.slice(17, 20), session.slice(20, 32),
    ].join('-');
    if (graph.graphId !== log.reference_id || graph.requestId !== requestId ||
        hash([log.createdBy, requestId]) !== graph.graphId ||
        (graph.proposalReference && graph.proposalReference.proposalId !== 'graph-' + graph.graphId)) return null;
    return { ...graph, actorId: log.createdBy, updatedAt: log.triggered_at };
}

function publicGraph(graph: NonNullable<ReturnType<typeof parseLog>>) {
    const lastEvent = graph.trace.filter(Boolean).slice(-1)[0];
    return {
        graphId: graph.graphId, status: graph.status, updatedAt: graph.updatedAt,
        node: lastEvent?.node ?? null, lastEvent: lastEvent?.status ?? null,
        warning: [...graph.trace].reverse().find(event => event?.code)?.code ?? null,
        purchaseRequestVerified: graph.trace.some(event => event?.status === 'PR_VERIFIED'),
        proposalId: graph.proposalReference?.proposalId ?? null,
        purchaseRequestId: graph.purchaseRequestId ?? null,
    };
}

const findGraphLogs = (db: Pick<Prisma.TransactionClient, 'agentLog'>, graphId: string) =>
    db.agentLog.findMany({ where: { ...graphLogs, reference_id: graphId }, select: logSelect, orderBy: logOrder, take: 25 });

const revisionSelect = {
    proposalId: true, version: true, contentHash: true, snapshot: true, createdAt: true,
    approvedAt: true, approvedById: true, rejectedAt: true, rejectedById: true, rejectionReason: true,
    purchaseRequest: { select: { id: true, requestNumber: true, status: true } },
} satisfies Prisma.AgentPurchaseProposalVersionSelect;
type Revision = Prisma.AgentPurchaseProposalVersionGetPayload<{ select: typeof revisionSelect }>;

function publicRevision(revision: Revision, snapshot: z.infer<typeof proposalSnapshotSchema>, ingredientName?: string) {
    return {
        proposalId: revision.proposalId, version: revision.version, contentHash: revision.contentHash,
        createdAt: revision.createdAt, approvedAt: revision.approvedAt, approvedById: revision.approvedById,
        rejectedAt: revision.rejectedAt, rejectedById: revision.rejectedById, rejectionReason: revision.rejectionReason,
        status: revision.purchaseRequest ? 'EXECUTED' : revision.rejectedAt ? 'REJECTED'
            : revision.approvedAt ? 'APPROVED_AWAITING_BACKEND' : 'PENDING_APPROVAL',
        ingredientId: snapshot.ingredientId, ingredientName,
        quantity: snapshot.quantity, unit: snapshot.unit, baseUnit: snapshot.baseUnit,
        unitsPerPack: snapshot.unitsPerPack, unitPrice: snapshot.unitPrice, supplierId: snapshot.supplierId,
        purchaseRequest: revision.purchaseRequest ? {
            id: revision.purchaseRequest.id, requestNumber: revision.purchaseRequest.requestNumber,
            status: revision.purchaseRequest.status,
        } : null,
    };
}

function sameReference(graph: ReturnType<typeof parseLog>, reference: z.infer<typeof referenceSchema>) {
    return graph?.proposalReference?.proposalId === reference.proposalId &&
        graph.proposalReference.version === reference.version &&
        graph.proposalReference.contentHash === reference.contentHash;
}

async function enqueue(tx: Prisma.TransactionClient, reference: z.infer<typeof referenceSchema>) {
    const key = jobKey(reference.proposalId, reference.version);
    if (await tx.systemSetting.findUnique({ where: { key }, select: { key: true } })) return;
    const graphId = reference.proposalId.slice('graph-'.length);
    const logs = (await findGraphLogs(tx, graphId)).map(parseLog);
    const graph = logs.find(log => sameReference(log, reference));
    if (!graph) throw new HttpError(409, 'GRAPH_LINEAGE_UNAVAILABLE');
    if (graph.status === 'SUCCEEDED') return;
    const job = {
        ...reference, graphId, actorId: graph.actorId,
        scanSessionId: graph.scanSessionId, ingredientIds: graph.ingredientIds,
    };
    await tx.systemSetting.createMany({ data: [{ key, value: JSON.stringify(job) }], skipDuplicates: true });
}

export function createGraphPurchasingAdminRouter() {
    const router = Router();
    const admin = [authenticate, requireRole(['ADMIN'])];
    const pageSchema = z.coerce.number().int().min(1).max(10000).default(1);
    const pageSize = 20;
    router.get('/graph-purchasing', ...admin, asyncHandler(async (req, res) => {
        const parsed = pageSchema.safeParse(req.query.page);
        if (!parsed.success) throw new HttpError(400, 'INVALID_PAGE');
        const page = parsed.data;
        const [proposals, logs] = await Promise.all([
            prisma.agentPurchaseProposal.findMany({
                where: { id: { startsWith: 'graph-' } },
                select: { id: true, currentVersion: true },
                orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], skip: (page - 1) * pageSize, take: pageSize + 1,
            }),
            prisma.agentLog.findMany({ where: graphLogs, select: logSelect, orderBy: logOrder, take: 80 }),
        ]);
        const pageProposals = proposals.slice(0, pageSize);
        const revisions = pageProposals.length ? await prisma.agentPurchaseProposalVersion.findMany({
            where: { OR: pageProposals.map(p => ({ proposalId: p.id, version: p.currentVersion })) },
            select: revisionSelect,
        }) : [];
        const byId = new Map(revisions.map(revision => [revision.proposalId, revision]));
        const snapshots = pageProposals.flatMap(p => {
            const revision = byId.get(p.id);
            const snapshot = proposalSnapshotSchema.safeParse(revision?.snapshot);
            return revision && snapshot.success ? [{ revision, snapshot: snapshot.data }] : [];
        });
        const ingredients = await prisma.ingredient.findMany({
            where: { id: { in: snapshots.flatMap(({ snapshot }) => snapshot.ingredientId ? [snapshot.ingredientId] : []) } },
            select: { id: true, name: true },
        });
        const names = new Map(ingredients.map(row => [row.id, row.name]));
        const graphRecords = logs.map(parseLog);
        const graphs = new Map<string, ReturnType<typeof publicGraph>>();
        for (const graph of graphRecords) {
            if (graph && !graphs.has(graph.graphId)) graphs.set(graph.graphId, publicGraph(graph));
        }
        graphRecords.reverse();
        sendSuccess(res, 200, 'Graph purchasing.', {
            proposals: snapshots.map(({ revision, snapshot }) => {
                const graph = graphRecords.find(record => sameReference(record, revision) && record?.d4Recommendation?.confirmed);
                const calculation = graph?.d4Recommendation?.confirmed;
                return {
                    ...publicRevision(revision, snapshot, names.get(snapshot.ingredientId ?? '')),
                    graphId: revision.proposalId.slice('graph-'.length),
                    confirmedStock: calculation ? {
                        availableBase: calculation.stockBase, targetBase: calculation.targetBase,
                        shortageBase: calculation.shortageBase,
                    } : null,
                };
            }),
            graphs: [...graphs.values()].slice(0, 12), page, hasNextPage: proposals.length > pageSize,
        });
    }));

    router.get('/graph-purchasing/:graphId', ...admin, asyncHandler(async (req, res) => {
        const parsed = graphIdSchema.safeParse(req.params.graphId);
        if (!parsed.success) throw new HttpError(404, 'GRAPH_NOT_FOUND');
        const graphId = parsed.data;
        const proposalId = 'graph-' + graphId;
        const [revision, logs] = await Promise.all([
            purchaseProposalService.get(proposalId),
            findGraphLogs(prisma, graphId),
        ]);
        const snapshot = proposalSnapshotSchema.parse(revision.snapshot);
        const [ingredient, supplier, history, job] = await Promise.all([
            snapshot.ingredientId ? prisma.ingredient.findUnique({ where: { id: snapshot.ingredientId }, select: { name: true } }) : null,
            prisma.supplier.findUnique({ where: { id: snapshot.supplierId }, select: { name: true } }),
            prisma.agentPurchaseProposalVersion.findMany({
                where: { proposalId, version: { lte: revision.version } }, orderBy: { version: 'desc' }, take: 20,
                select: { version: true, approvedAt: true, approvedById: true, rejectedAt: true,
                    rejectedById: true, rejectionReason: true, createdAt: true },
            }),
            prisma.systemSetting.findUnique({ where: { key: jobKey(proposalId, revision.version) }, select: { key: true } }),
        ]);
        const parsedLogs = logs.map(parseLog);
        const graph = parsedLogs.find(log => sameReference(log, revision));
        const evidence = parsedLogs.reverse().find(log => sameReference(log, revision) && log?.d4Recommendation?.confirmed);
        const source = /^LangGraph D4 DRAFT requires independent ADMIN review [a-f0-9]{64} source (\d+)\/(\d+) policy ([a-zA-Z0-9_.-]{1,100}) /.exec(snapshot.notes);
        const demand = snapshot.ingredientId && !revision.approvedAt && !revision.rejectedAt
            ? await readIngredientDemandRisk(snapshot.ingredientId).catch(() => null) : null;
        res.locals.workflowId = graphId;
        sendSuccess(res, 200, 'Graph purchasing review.', {
            ...publicRevision(revision, snapshot, ingredient?.name),
            graphId, supplierName: supplier?.name, supplierAvailability: 'UNKNOWN',
            graph: graph ? publicGraph(graph) : null, continuationPending: Boolean(job),
            reviewable: Boolean(graph),
            source: source ? { rowVersion: source[1], movementCursor: source[2], policy: source[3] } : null,
            demand: demand ? {
                asOf: demand.asOf, observedMovements: demand.demand.observedMovements,
                dailyRate: demand.demand.dailyRate,
                sourceChanged: source ? source[1] !== String(demand.rowVersion) || source[2] !== demand.movementCursor : null,
            } : null,
            evidence: evidence ? {
                calculatedAt: evidence.updatedAt,
                calculation: evidence.d4Recommendation?.confirmed,
                warnings: evidence.d4Recommendation?.reviewWarnings ?? [],
            } : null,
            history,
        });
    }));

    router.post('/graph-purchasing/:graphId/:decision', ...admin, asyncHandler(async (req: AuthenticatedRequest, res) => {
        const graphId = graphIdSchema.safeParse(req.params.graphId);
        if (!graphId.success || !['approve', 'reject'].includes(req.params.decision))
            throw new HttpError(404, 'GRAPH_NOT_FOUND');
        const proposalId = 'graph-' + graphId.data;
        const continuation = (tx: Prisma.TransactionClient, reference: z.infer<typeof proposalReferenceSchema>) =>
            enqueue(tx, { proposalId, version: reference.version, contentHash: reference.contentHash });
        try {
            const decide = req.params.decision === 'approve'
                ? purchaseProposalService.approve.bind(purchaseProposalService)
                : purchaseProposalService.reject.bind(purchaseProposalService);
            const revision = await decide(proposalId, req.user!.id, req.body, continuation);
            res.locals.workflowId = graphId.data;
            sendSuccess(res, 200, 'Decision recorded.', {
                version: revision.version, approvedAt: revision.approvedAt, rejectedAt: revision.rejectedAt,
            });
        } catch (error) {
            if (error instanceof z.ZodError) throw new HttpError(400, 'INVALID_PROPOSAL_INPUT');
            throw error;
        }
    }));
    return router;
}

/** Durable decisions survive API and Agent restarts. Graph leases and Backend receipts arbitrate concurrent workers. */
export function startGraphPurchasingContinuations() {
    let running = false;
    const tick = async () => {
        if (running) return;
        running = true;
        try {
            const pending = await prisma.systemSetting.findMany({
                where: { key: { startsWith: prefix } }, orderBy: [{ updatedAt: 'asc' }, { key: 'asc' }], take: 8,
            });
            await Promise.all(pending.map(async row => {
                const job = jobSchema.safeParse(parseJson(row.value));
                if (!job.success) return;
                const { proposalId, version, contentHash, graphId, actorId, scanSessionId, ingredientIds } = job.data;
                const where = { key: row.key, updatedAt: row.updatedAt, value: row.value };
                try {
                    const proposal = await purchaseProposalService.get(proposalId);
                    if (proposal.version === version && proposal.contentHash === contentHash &&
                        (proposal.approvedAt || proposal.rejectedAt)) {
                        const result = graphSchema.parse(await resumeGraphPurchasing({ scanSessionId, ingredientIds }, actorId));
                        if (result.graphId !== graphId || !['SUCCEEDED', 'HELD_POLICY', 'FAILED', 'CANCELLED'].includes(result.status))
                            throw new Error('GRAPH_CONTINUATION_INCOMPLETE');
                    }
                    await prisma.systemSetting.deleteMany({ where });
                } catch {
                    await prisma.systemSetting.updateMany({ where, data: { updatedAt: new Date() } });
                }
            }));
        } catch {
            console.warn('[api] Graph purchasing continuation queue unavailable.');
        } finally {
            running = false;
        }
    };
    void tick();
    const timer = setInterval(() => { void tick(); }, 10000);
    timer.unref();
    return () => clearInterval(timer);
}
