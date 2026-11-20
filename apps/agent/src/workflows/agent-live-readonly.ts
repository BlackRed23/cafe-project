/**
 * Opt-in production HTTP bridge into the EXISTING AgentWorkflow LangGraph.
 *
 * Deliberately READ-ONLY: the legacy production AgentService has no verified
 * Postgres-backed AgentRepository for Graph approvals/checkpoints. This mode
 * uses authoritative Prisma reads, real ADMIN auth, the same AgentWorkflow
 * graph and append-only AgentLog node/edge evidence. It NEVER submits a
 * PurchaseProposal, PR/PO, or synthesizes an ADMIN approval.
 *
 * AGENT_GRAPH_READONLY=YES is explicit; the default production scan is untouched.
 * AgentLog is durable AUDIT, NOT a durable graph execution checkpoint/resume.
 */
import { createHash, randomUUID } from 'node:crypto';
import { prisma, Prisma } from '@cafe-project/database';
import { requireAgentUser } from '../internal-auth';
import { agentRepository } from '../repositories/agent.repository';
import { AgentWorkflow } from './agent-workflow';
import { MockAgentRepository } from '../repositories/mock-agent.repository';
import { PostgresAgentRepository } from '../repositories/postgres-agent.repository';
import { createLiveBackendReadRegistry } from './agent-live-backend-registry';
import { readBackendPerceptionRisk } from './agent-backend-demand-risk';
import { inspectBackendProposalRevision } from './agent-backend-proposal-review';
import type { ProposalReviewReference } from './agent-backend-proposal-review';
import { z } from 'zod';
import { AgentHttpError } from '../errors/http-error';
import type { BusinessPort, LLMProvider } from './workflow-contracts';
import type { InventoryRow, StockRecommendation } from './replenishment';
import { analyzeInventoryPerception } from './inventory-perception';
import { perceptionHoldReason } from './perception-hold-reason';
import { verifiedIsolatedActFault } from '../services/execution/act-isolated-fault';

export type ReadOnlyGraphScope = {
    scope?: 'ALL' | 'PRODUCT' | 'INGREDIENT';
    ingredientIds?: string[];
    productIds?: string[];
    triggerType?: string;
};
type JointReadOnlyReview = { reference: ProposalReviewReference; mode: 'PLAN' | 'RESUME' };

/**
 * Explicit opt-in to prove ONE trace through live inventory, Backend demand,
 * registered reads, Backend-owned exact proposal decision and PostgreSQL.
 * No input can request an LLM plan, approval, or purchase execution.
 */
export async function runLiveReadOnlyJointReview(raw: unknown, actorId: string) {
    const schema = z.strictObject({
        requestId: z.uuid(),
        mode: z.enum(['PLAN', 'RESUME']),
        ingredientIds: z.array(z.string().regex(/^[A-Za-z0-9][A-Za-z0-9:_-]{0,119}$/)).min(1).max(4),
        proposalId: z.string().regex(/^[A-Za-z0-9][A-Za-z0-9:_-]{0,119}$/),
        version: z.number().int().positive().max(2147483647),
        contentHash: z.string().regex(/^[a-f0-9]{64}$/)
    });
    const parsed = schema.safeParse(raw);
    if (!parsed.success || new Set(parsed.data?.ingredientIds).size !== parsed.data?.ingredientIds.length) {
        throw new AgentHttpError(400, 'INVALID_GRAPH_REQUEST');
    }
    const data = parsed.data;
    if (process.env.AGENT_GRAPH_READONLY !== 'YES' ||
        process.env.AGENT_GRAPH_PG_READONLY !== 'YES' ||
        process.env.AGENT_GRAPH_BACKEND_RISK !== 'YES' ||
        process.env.AGENT_GRAPH_AI18_REVIEW !== 'YES' ||
        process.env.AGENT_GRAPH_AI18_JOINT_READ !== 'YES') {
        throw new AgentHttpError(403, 'READ_ONLY_GRAPH_REVIEW_DISABLED');
    }
    const audit = await runLiveReadOnlyGraph({
        scope: 'INGREDIENT', ingredientIds: data.ingredientIds
    }, actorId, 'AI18_JOINED_' + data.requestId, {
        mode: data.mode,
        reference: { proposalId: data.proposalId, version: data.version, contentHash: data.contentHash }
    });
    return {
        graphId: audit.graphId, requestId: audit.requestId,
        executionId: audit.executionId ?? null, status: audit.status,
        approvalBoundary: audit.approvalBoundary ?? null, trace: audit.trace,
        registeredBackendReads: audit.registeredBackendReads,
        checkpointDurable: audit.checkpointDurable,
        readOnly: true, approvalOrPurchaseAttempted: false
    };
}
/**
 * AI18 read-only graph invocation. It is a separate authenticated Backend
 * service call; the existing scan business workflow is NOT a purchase adapter.
 * Only Backend may approve, reject, revise or create procurement records.
 */
export async function runLiveReadOnlyProposalReview(raw: unknown, actorId: string) {
    const schema = z.strictObject({
        requestId: z.uuid(),
        mode: z.enum(['PLAN', 'RESUME']),
        proposalId: z.string().regex(/^[A-Za-z0-9][A-Za-z0-9:_-]{0,119}$/),
        version: z.number().int().positive().max(2147483647),
        contentHash: z.string().regex(/^[a-f0-9]{64}$/)
    });
    const parsed = schema.safeParse(raw);
    if (!parsed.success) throw new AgentHttpError(400, 'INVALID_GRAPH_REQUEST');
    if (process.env.AGENT_GRAPH_READONLY !== 'YES' ||
        process.env.AGENT_GRAPH_PG_READONLY !== 'YES' ||
        process.env.AGENT_GRAPH_AI18_REVIEW !== 'YES') {
        throw new AgentHttpError(403, 'READ_ONLY_GRAPH_REVIEW_DISABLED');
    }
    await requireAgentUser(actorId, ['ADMIN']);
    const key = process.env.AGENT_GRAPH_PG_CHECKPOINT_KEY || 'agent.workflow.checkpoint.v1';
    const store = new PostgresAgentRepository(prisma, key);
    await store.atomic(s => {
        // Only minimal READ/RUN, NEVER agent.approve or purchase.write.
        s.permissions[actorId] = ['agent.run', 'inventory.read'];
    });
    const port = {
        authorize: async (actor: string, permission: string) => {
            if (permission !== 'agent.run') throw new Error('FORBIDDEN');
            return requireAgentUser(actor, ['ADMIN']);
        },
        inspectProposal: inspectBackendProposalRevision
    };
    const workflow = new AgentWorkflow(store, port, {
        plan: async () => { throw new Error('POSTGRES_NOT_VERIFIED'); }
    }, [], () => new Date(), true);
    const { requestId, mode, proposalId, version, contentHash } = parsed.data;
    const result = await workflow.runLangGraph({
        requestId, actorId, mode, budget: 0,
        prompt: 'AI18 Backend proposal status inspection only; no plan or purchase.',
        proposalReview: { proposalId, version, contentHash }
    });
    const stored = await store.atomic(s =>
        s.graphRuns?.[result.graphId]);
    if (!stored || !stored.approvalBoundary || stored.status !== result.status ||
        stored.approvalBoundary.proposalId !== proposalId ||
        stored.approvalBoundary.version !== version ||
        stored.approvalBoundary.contentHash !== contentHash) {
        throw new Error('INVALID_GRAPH_CHECKPOINT');
    }
    return { graphId: result.graphId, requestId: result.requestId, status: result.status,
        approvalBoundary: stored.approvalBoundary ?? null, trace: stored.trace,
        checkpointDurable: true, readOnly: true, approvalOrPurchaseAttempted: false };
}
const DECIMAL = (value: Prisma.Decimal | number) => new Prisma.Decimal(value);
const MAX_IDS = 30;
const cleanError = (error: unknown) => {
    const message = error instanceof Error ? error.message : '';
    return ['ANOMALOUS_INVENTORY', 'STALE_CONTEXT', 'STOCKTAKE_UNCERTAIN', 'INBOUND_UNVERIFIED', 'INVALID_BASE_UNIT',
        'INVALID_INVENTORY_SCOPE', 'FORBIDDEN', 'INVALID_GRAPH_CHECKPOINT'].includes(message)
        ? message : 'UNVERIFIED_GRAPH_READ';
};

export async function runLiveReadOnlyGraph(
    scope: ReadOnlyGraphScope, actorId: string, scanSessionId: string,
    joint?: JointReadOnlyReview
) {
    await requireAgentUser(actorId, ['ADMIN']);
    const ZERO = new Prisma.Decimal(0);
    let ingredientIds = scope.ingredientIds ?? [];
    if (scope.scope === 'PRODUCT') ingredientIds = await agentRepository.resolveIngredientIdsFromProducts(scope.productIds ?? []);
    if (scope.scope === 'ALL' || (!scope.scope && !ingredientIds.length && !scope.productIds?.length)) {
        ingredientIds = await agentRepository.findActiveIngredientIds();
    }
    if (scope.productIds?.length && !scope.ingredientIds?.length && scope.scope !== 'ALL') {
        ingredientIds = await agentRepository.resolveIngredientIdsFromProducts(scope.productIds);
    }
    ingredientIds = [...new Set(ingredientIds)].sort();
    if (!ingredientIds.length || ingredientIds.length > MAX_IDS || ingredientIds.some(id => typeof id !== 'string' || id.length > 120)) {
        throw new Error('INVALID_INVENTORY_SCOPE');
    }
    const lookup = async () => {
        const rows = await prisma.ingredient.findMany({
            where: { id: { in: ingredientIds }, isActive: true, deletedAt: null },
            include: { batches: true }
        });
        if (rows.length !== ingredientIds.length) throw new Error('INVALID_INVENTORY_SCOPE');
        return rows.sort((a, b) => a.id.localeCompare(b.id));
    };
    const durableReadOnly = process.env.AGENT_GRAPH_PG_READONLY === 'YES';
    if (joint && (!durableReadOnly || process.env.AGENT_GRAPH_READONLY !== 'YES' ||
        process.env.AGENT_GRAPH_BACKEND_RISK !== 'YES' ||
        process.env.AGENT_GRAPH_AI18_REVIEW !== 'YES' ||
        process.env.AGENT_GRAPH_AI18_JOINT_READ !== 'YES')) {
        throw new Error('POSTGRES_NOT_VERIFIED');
    }
    // Explicit bounded contract: the StateGraph currently permits eight READ
    // calls, two per ingredient. Reject rather than silently sample evidence.
    if (durableReadOnly && ingredientIds.length > 4) throw new Error('INVALID_INVENTORY_SCOPE');
    const port: BusinessPort = {
        authorize: (actor, permission) => {
            if (!['agent.run', 'inventory.read'].includes(permission)) throw new Error('FORBIDDEN');
            return requireAgentUser(actor, ['ADMIN']);
        },
        inventory: async actor => {
            await port.authorize(actor, 'inventory.read');
            const rows = await lookup();
            return rows.map(row => {
                const physical = DECIMAL(row.quantity), reserved = DECIMAL(row.reserved);
                const lotSum = row.batches.reduce((acc, batch) => acc.plus(batch.quantityRemaining), ZERO);
                const eligible = row.batches.filter(batch => batch.qualityStatus === 'AVAILABLE' &&
                    (!batch.expirationDate || batch.expirationDate.getTime() > Date.now()))
                    .reduce((acc, batch) => acc.plus(batch.quantityRemaining), ZERO);
                if (!lotSum.eq(physical) || physical.lt(0) || reserved.lt(0) || reserved.gt(eligible) ||
                    row.batches.some(batch => DECIMAL(batch.quantityRemaining).lt(0))) throw new Error('ANOMALOUS_INVENTORY');
                return { id: row.id, ingredientId: row.id, remaining: physical.toString(), reserved: reserved.toString(),
                    version: String(row.rowVersion + 1) } satisfies InventoryRow;
            });
        },
        perceiveInventory: async (actor, snapshot) => {
            await port.authorize(actor, 'inventory.read');
            const rows = await lookup();
            if (rows.length !== snapshot.length) throw new Error('STALE_CONTEXT');
            const byId = new Map(snapshot.map(item => [item.ingredientId, item]));
            const readAt = new Date();
            return rows.map(row => {
                const prior = byId.get(row.id);
                if (!prior) throw new Error('STALE_CONTEXT');
                return analyzeInventoryPerception(row, prior, readAt);
            });
        },
        recommendInventory: async (actor, snapshot) => {
            await port.authorize(actor, 'inventory.read');
            // The legacy inventory.recommend tool is intentionally callable
            // without a supplied snapshot; it must acquire a fresh one.
            const authoritative = snapshot ?? await port.inventory(actor);
            if (authoritative.length !== ingredientIds.length) throw new Error('INVALID_INVENTORY_SCOPE');
            const rows = await lookup();
            const result: StockRecommendation[] = [];
            for (const row of rows) {
                const opened = await prisma.stockCount.findFirst({
                    where: { kind: 'STOCKTAKE', status: { in: ['DRAFT', 'PENDING_APPROVAL', 'NEEDS_INVESTIGATION'] },
                        stocktakeEntries: { some: { ingredientId: row.id } } },
                    select: { id: true }
                });
                if (opened) throw new Error('STOCKTAKE_UNCERTAIN');
                const supply = await agentRepository.readIngredientSupplyState(row.id);
                if (!supply || supply.rowVersion !== row.rowVersion || supply.inboundOutstanding > 0) {
                    throw new Error(!supply ? 'ANOMALOUS_INVENTORY' : supply.inboundOutstanding > 0 ?
                        'INBOUND_UNVERIFIED' : 'ANOMALOUS_INVENTORY');
                }
                if (!['g', 'ml', 'piece'].includes(row.baseUnit)) throw new Error('INVALID_BASE_UNIT');
                const min = DECIMAL(row.minThreshold);
                const available = DECIMAL(supply.available);
                const needed = Prisma.Decimal.max(ZERO, min.minus(available));
                result.push({ ingredientId: row.id, baseUnit: row.baseUnit as 'g' | 'ml' | 'piece',
                    available: available.toString(), minStock: min.toString(), targetStock: min.toString(),
                    recommendedBaseQuantity: needed.toString(), sourceVersion: String(row.rowVersion + 1) });
            }
            return result;
        },
        sourceVersions: async () => ({}),
        actSourceVersion: async (actor, ingredientId) => {
            await port.authorize(actor, 'inventory.read');
            if (!ingredientIds.includes(ingredientId)) throw new Error('FORBIDDEN');
            // Isolated ACT-07 acceptance only. A loopback owned test service uses
            // the normal authenticated Backend import API to commit a real
            // rowVersion/movementCursor change AFTER Perception and BEFORE dispatch.
            if (process.env.ACT_E2E_FAULT_CASE === 'STALE_VERSION' &&
                await verifiedIsolatedActFault(ingredientId)) {
                let hook: URL;
                try { hook = new URL(process.env.ACT_E2E_STALE_HOOK_URL ?? ''); }
                catch { throw new Error('ACT_TEST_STALE_HOOK_INVALID'); }
                if (hook.protocol !== 'http:' || hook.hostname !== '127.0.0.1' ||
                    hook.pathname !== '/act-stale' || !hook.port) {
                    throw new Error('ACT_TEST_STALE_HOOK_INVALID');
                }
                const reply = await fetch(hook, {
                    method: 'POST', headers: { 'content-type': 'application/json' },
                    body: JSON.stringify({ ingredientId }),
                    signal: AbortSignal.timeout(15000)
                });
                if (!reply.ok) throw new Error('ACT_TEST_STALE_HOOK_FAILED');
            }
            // Separate, authoritative read immediately before EACH dispatch.
            const fresh = await prisma.ingredient.findFirst({
                where: { id: ingredientId, isActive: true, deletedAt: null },
                select: { rowVersion: true, movementCursor: true }
            });
            if (!fresh) throw new Error('STALE_CONTEXT');
            return fresh.rowVersion + ':' + fresh.movementCursor.toString();
        },
        purchaseReceipt: async () => { throw new Error('POSTGRES_NOT_VERIFIED'); },
        createPurchase: async () => { throw new Error('POSTGRES_NOT_VERIFIED'); },
        atomic: async work => {
            let commit: (() => void) | undefined, finish: (() => void) | undefined;
            try {
                const result = await work(port, fn => { commit = fn; }, fn => { finish = fn; });
                commit?.();
                return result;
            } finally { finish?.(); }
        }
    };
    const readOnlyPlan: LLMProvider = { plan: async () => [
        { tool: 'inventory.read', input: null },
        { tool: 'inventory.recommend', input: null }
    ] };
    // Separate opt-in only: actual Postgres checkpoint on the existing
    // read-only graph. The default AGENT_GRAPH_READONLY mode stays unchanged.
    if (durableReadOnly) port.toolRegistry = createLiveBackendReadRegistry(ingredientIds);
    // Separate strict opt-in for the Backend-owned internal read route. Never
    // synthesize an ADMIN JWT or call any proposal/purchasing endpoint.
    if (durableReadOnly && process.env.AGENT_GRAPH_BACKEND_RISK === 'YES') {
        port.demandRisk = readBackendPerceptionRisk;
    }
    if (joint) port.inspectProposal = inspectBackendProposalRevision;
    // Optional namespaced checkpoint for isolated acceptance runs. Namespace
    // validation also lives in the repository and prevents arbitrary DB keys.
    const checkpointKey = process.env.AGENT_GRAPH_PG_CHECKPOINT_KEY || 'agent.workflow.checkpoint.v1';
    const readStore = durableReadOnly ? new PostgresAgentRepository(prisma, checkpointKey) : new MockAgentRepository();
    // Principal is already checked against live DB ADMIN above. The ephemeral
    // read-only workflow store must use the same real actor ID (not mock "admin").
    // Grant only read/run, NEVER agent.approve or purchase.write.
    await readStore.atomic(state => {
        state.permissions[actorId] = ['agent.run', 'inventory.read'];
    });
    const workflow = new AgentWorkflow(readStore, port, readOnlyPlan,
        ['inventory.read', 'inventory.recommend'], () => new Date(), durableReadOnly);
    // UUIDv5-shaped deterministic request identity scoped to the authenticated
    // actor and server scan session. Same session can safely replay after crash.
    const identityHash = createHash('sha256').update(JSON.stringify([actorId, scanSessionId])).digest('hex');
    const requestId = durableReadOnly ? [
        identityHash.slice(0, 8), identityHash.slice(8, 12),
        '5' + identityHash.slice(13, 16),
        ((parseInt(identityHash[16]!, 16) & 3) | 8).toString(16) + identityHash.slice(17, 20),
        identityHash.slice(20, 32)
    ].join('-') : randomUUID();
    const graphId = createHash('sha256').update(JSON.stringify([actorId, requestId])).digest('hex');
    const existing = durableReadOnly ? await readStore.atomic(s => s.graphRuns?.[graphId]) : undefined;
    const beforeEvidence = await lookup();
    const fingerprint = (rows: Awaited<ReturnType<typeof lookup>>) =>
        createHash('sha256').update(JSON.stringify(rows.map(row => [
            row.id, row.rowVersion, row.movementCursor.toString(),
            row.quantity.toString(), row.reserved.toString(), row.minThreshold.toString(),
            ...[...row.batches].sort((a, b) => a.id.localeCompare(b.id)).map(batch => [
                batch.id, batch.quantityRemaining.toString(), batch.qualityStatus,
                batch.expirationDate?.toISOString() ?? null
            ])
        ]))).digest('hex');
    const beforeFingerprint = fingerprint(beforeEvidence);
    // A cached SUCCEEDED Graph trace is historical evidence, not a new read.
    // Refuse stale or older unpinned cached runs rather than presenting their
    // old success as current after inventory/source versions drifted.
    if (durableReadOnly && existing?.status === 'SUCCEEDED' &&
        (!existing.sourceFingerprint || existing.sourceFingerprint !== beforeFingerprint)) {
        throw new Error('STALE_CONTEXT');
    }
    const result = await workflow.runLangGraph({
        requestId, actorId, prompt: 'Live inventory read-only analysis, scope=' +
            createHash('sha256').update(JSON.stringify(ingredientIds)).digest('hex'),
        budget: 2, mode: joint?.mode ?? (existing?.executionId ? 'RESUME' : 'PLAN'),
        ...(joint ? { jointReview: true as const, proposalReview: joint.reference } : {}),
        ...(durableReadOnly ? { readTools: ingredientIds.flatMap(id => [
            { name: 'getIngredientAvailability', input: { ingredientId: id }, version: '1.0.0' },
            { name: 'getIngredientBatches', input: { ingredientId: id }, version: '1.0.0' }
        ]) } : {})
    });
    const executionTrace = await readStore.atomic(s => s);
    const durableRun = durableReadOnly ? executionTrace.graphRuns?.[result.graphId] : undefined;
    // An early RESUME risk/tool HOLD has no newly verified Execution in the
    // StateGraph return, but the fixed historical executionId stays linked in
    // PostgreSQL. That is safe only for HOLD, never proof of new SUCCESS.
    const validLinkedExecution = result.execution
        ? durableRun?.executionId === result.execution.id
        : !durableRun?.executionId || result.status === 'HELD_POLICY';
    if (durableReadOnly && (!durableRun || durableRun.status !== result.status ||
        !validLinkedExecution ||
        (joint && result.status === 'AWAITING_APPROVAL' && !durableRun.approvalBoundary))) {
        throw new Error('INVALID_GRAPH_CHECKPOINT');
    }
    const afterEvidence = await lookup();
    // Version and movement cursor are necessary but not sufficient when a
    // misbehaving writer changes a reservation, stock threshold or expiry
    // without bumping them. Validate all perception-relevant source fields
    // before exposing the result for downstream decisions.
    if (beforeFingerprint !== fingerprint(afterEvidence)) {
        // A fresh ACT source-version gate may have already persisted the exact
        // STALE_CONTEXT HOLD before any Registry handler attempt. Return that
        // persisted denial/audit, NEVER a stale success. Any uncorrelated drift
        // still fails closed without exposing a misleading Graph completion.
        const verifiedActHold = process.env.AGENT_ACT_READ_EXECUTION === 'YES' &&
            result.status === 'HELD_POLICY' &&
            durableRun?.trace.some(e => e.node === 'act_executor' &&
                e.status === 'ACT_HELD' && e.code === 'STALE_CONTEXT' && e.attempt === 0);
        if (!verifiedActHold) throw new Error('STALE_CONTEXT');
    }
    if (durableReadOnly && result.status === 'SUCCEEDED' && !existing?.sourceFingerprint) {
        await readStore.atomic(s => {
            const run = s.graphRuns?.[result.graphId];
            if (!run || run.status !== 'SUCCEEDED' ||
                (run.sourceFingerprint && run.sourceFingerprint !== beforeFingerprint)) {
                throw new Error('INVALID_GRAPH_CHECKPOINT');
            }
            run.sourceFingerprint = beforeFingerprint;
            run.completedSourceAt = new Date().toISOString();
        });
    }
    const now = Date.now();
    const lotEvidence = afterEvidence.flatMap(r => r.batches.map(b => {
        const expires = b.expirationDate?.getTime();
        return {
            ingredientId: r.id, batchId: b.id, quantityBase: b.quantityRemaining.toString(),
            expirationDate: b.expirationDate, quality: b.qualityStatus,
            eligible: b.qualityStatus === 'AVAILABLE' && (!expires || expires > now),
            risk: b.qualityStatus !== 'AVAILABLE' ? 'QUALITY_HOLD' :
                expires !== null && expires !== undefined && expires <= now ? 'EXPIRED' :
                expires !== null && expires !== undefined && expires <= now + 7 * 86400000 ?
                    'NEAR_EXPIRY_FEFO' : 'NONE'
        };
    }));
    const audit = {
        graphId: result.graphId, requestId, source: result.source, status: result.status,
        ...(result.status !== 'SUCCEEDED' ? { reason: perceptionHoldReason(result.trace) } : {}),
        executionId: result.execution?.id,
        trace: durableRun?.trace ?? result.trace, classifications: [...new Set([...result.classifications,
            ...lotEvidence.filter(e => e.risk !== 'NONE').map(e => e.risk)])],
        ...(result.perception?.length ? { perception: result.perception } : {}),
        ...(joint ? { approvalBoundary: durableRun?.approvalBoundary ?? null } : {}),
        lotEvidence,
        toolEvidence: Object.values(executionTrace.toolCalls).filter(c => c.executionId === result.execution?.id).map(c => ({
            tool: c.tool, status: c.status, stepId: c.stepId ?? null,
            verified: Boolean(c.verifiedAt), resultPresent: c.result !== null
        })),
        evaluationEvidence: executionTrace.evaluations.filter(e => e.executionId === result.execution?.id).map(e => ({
            passed: e.passed, code: e.code
        })),
        registeredBackendReads: durableRun?.trace.filter(e =>
            e.node === 'tool_registry' && e.status === 'BACKEND_READ_VALIDATED').length ?? 0,
        count: ingredientIds.length, ingredientIds, readOnly: true,
        replayCached: Boolean(durableReadOnly && existing?.status === 'SUCCEEDED'),
        checkpointDurable: Boolean(durableRun), auditDurable: true, approvalOrPurchaseAttempted: false,
        scanSessionId
    };
    const log = await agentRepository.createLog({
        action: result.status === 'SUCCEEDED' ? 'AGENT_LANGGRAPH_READONLY' : 'AGENT_LANGGRAPH_READONLY_HELD',
        input: JSON.stringify({ scanSessionId, ingredientIds, readOnly: true }),
        output: JSON.stringify(audit),
        reasoning: durableReadOnly ?
            'Actual LangGraph READ analysis with PostgreSQL checkpoint and independent AgentLog audit; no purchasing authority.' :
            'Actual LangGraph READ analysis with current Prisma; AgentLog audit only, no graph checkpoint.',
        result: result.status === 'SUCCEEDED' ? 'SUCCESS' : 'SKIPPED',
        fallback_used: false,
        reference_type: 'AgentGraphReadOnly', reference_id: result.graphId,
        creator: { connect: { id: actorId } }
    });
    return { ...audit, log, verified: result.status === 'SUCCEEDED' && result.execution?.outcome?.verified === true };
}

/** No raw provider, SQL, LLM output or authorization tokens are placed in a log. */
export async function logLiveGraphHold(actorId: string, scanSessionId: string, error: unknown) {
    const reason = cleanError(error);
    return agentRepository.createLog({
        action: 'AGENT_LANGGRAPH_READONLY_HELD',
        input: JSON.stringify({ scanSessionId, readOnly: true }),
        output: JSON.stringify({ scanSessionId, status: 'HELD_POLICY', reason,
            checkpointDurable: false, approvalOrPurchaseAttempted: false }),
        reasoning: 'Graph live preflight denied or data uncertain; no proposal, PR/PO or stock write.',
        result: 'SKIPPED', fallback_used: false,
        reference_type: 'AgentGraphReadOnly', reference_id: scanSessionId,
        creator: { connect: { id: actorId } }
    });
}
