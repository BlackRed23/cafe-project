/**
 * The ONLY LangGraph implementation of AgentWorkflow's plan/resume path.
 * Nodes call the existing AgentWorkflow authorization, planner, registered read tools,
 * approval gate and Backend adapter. LangGraph does not create a second purchasing engine.
 * The existing AgentRepository stores checkpoints and authoritative execution identity.
 */
import { Annotation, END, START, StateGraph } from '@langchain/langgraph';
import type { Execution, Plan } from './workflow-contracts';
import type { InventoryRow, ReplenishmentInput, StockRecommendation } from './replenishment';
import type { ToolOutcome } from './tool-registry';
import type { ToolSelectionDecision } from '../services/tool-selection/tool-selection.schema';
import type { ActReadStep, ActReadResult } from '../services/execution/act-read-step';
import type { ProposalReviewReference, ProposalReviewObservation } from './agent-backend-proposal-review';
import { z } from 'zod';
import { inventoryScaledQuantity, perceptionContextSchema, type PerceptionContext } from './inventory-perception';
import { backendRiskEvidenceSchema, type BackendRiskEvidence } from './agent-backend-risk-evidence';

export type AgentGraphInput = {
    requestId: string;
    actorId: string;
    prompt: string;
    budget: number;
    mode: 'PLAN' | 'RESUME';
    replenishment?: ReplenishmentInput;
    readTools?: { name: string; input: unknown; version?: string }[];
    /** Isolated read-only AI18 inspection; never authorizes a purchase. */
    proposalReview?: ProposalReviewReference;
    /** Explicit read-only join: trusted inventory/risk/tool evidence + Backend proposal read, one execution/trace. */
    jointReview?: true;
};
export type AgentGraphStatus =
    'RUNNING' | 'AWAITING_APPROVAL' | 'SUCCEEDED' | 'FAILED' | 'CANCELLED' | 'UNKNOWN' | 'DEGRADED_LLM' | 'HELD_POLICY';
export type AgentGraphEvent = {
    node: string;
    edge: string;
    status: string;
    at: string;
    code?: string;
    executionId?: string;
    tool?: string;
    stepId?: string;
    attempt?: number;
    actorId?: string;
    approvalBoundary?: ProposalReviewObservation;
};
export type AgentGraphResult = {
    graphId: string;
    requestId: string;
    actorId: string;
    status: AgentGraphStatus;
    execution?: Execution;
    source: 'LANGGRAPH_STATEGRAPH';
    trace: AgentGraphEvent[];
    classifications: string[];
    toolResults: ToolOutcome[];
    perception?: PerceptionContext[];
    approvalBoundary?: ProposalReviewObservation;
};

type Operations = {
    now(): number;
    authorize(actorId: string, permission: string): Promise<unknown>;
    inventory(actorId: string): Promise<InventoryRow[]>;
    recommendations(actorId: string, inventory: InventoryRow[]): Promise<StockRecommendation[]>;
    perceive?(actorId: string, inventory: InventoryRow[]): Promise<PerceptionContext[]>;
    risk?(actorId: string, inventory: InventoryRow[]): Promise<string[] | BackendRiskEvidence>;
    proposalReview?(actorId: string, reference: ProposalReviewReference): Promise<ProposalReviewObservation>;
    /** Fixed read-only execution identity, no model/provider/planner or business execution. */
    createReadIdentity?(input: AgentGraphInput): Promise<Execution>;
    plan(input: AgentGraphInput): Promise<Execution>;
    resume(input: AgentGraphInput): Promise<Execution>;
    execute(id: string, actorId: string): Promise<Execution>;
    inspect(actorId: string, id: string): Promise<{
        execution: Execution;
        approvals: { approverId: string; hash: string; expiresAt: string; consumed: boolean; revoked: boolean }[];
    }>;
    validate(plan: Plan, budget: number): void;
    dispatchRead(actorId: string, name: string, input: unknown, version?: string): Promise<ToolOutcome>;
    /** Existing ACT leaf, invoked inside THIS StateGraph after TOOL selection. */
    executeActRead?(step: ActReadStep): Promise<{ result: ActReadResult; events: AgentGraphEvent[] }>;
    /** Optional policy selection for the existing read tool path; never authorizes execution. */
    selectRead?(actorId: string, name: string, input: unknown, hasTrustedPerception: boolean): Promise<ToolSelectionDecision>;
    checkpoint(event: AgentGraphEvent, execution?: Execution): Promise<void>;
};
const knownStatus = (status: Execution['status']): AgentGraphStatus =>
    status === 'PLANNED' || status === 'RUNNING' ? 'RUNNING' : status;

/**
 * Explicitly reviewed Backend demand-risk evidence contract. Backend may
 * introduce new risk signals independently of this service. An unrecognized
 * signal MUST stop the graph for review, not be silently treated as safe.
 * Keep this set synchronized when a new Backend signal is security-reviewed.
 */
const VERIFIED_DEMAND_RISK_CODES = new Set([
    'SPARSE_HISTORY_FALLBACK',
    'INVALID_LEDGER_OBSERVATION',
    'OUTLIER_REVIEW_REQUIRED',
    'DEMAND_DORMANT_REVIEW',
    'TREND_UNCERTAIN',
    'HISTORY_TRUNCATED',
    'STOCKTAKE_UNCERTAIN',
    'EXISTING_PURCHASE_REQUEST',
    'ANOMALOUS_STOCK_AGGREGATE',
    'EXPIRED_STOCK_PRESENT',
    'UNKNOWN_EXPIRY_LOT',
    'NON_AVAILABLE_LOT_PRESENT',
    'NEAR_EXPIRY_FEFO',
    'INBOUND_NOT_PHYSICAL',
    'ESTIMATED_DELIVERY_LATE_UNVERIFIED',
    'EXPIRY_SURPLUS_RISK',
    'ETA_IS_ESTIMATE_NOT_PROMISE',
    'SUPPLIER_LEAD_TIME_UNVERIFIED',
    'DEMAND_RATE_UNCERTAIN',
    'PROJECTED_STOCKOUT_BEFORE_LEAD_TIME',
    'INBOUND_SCENARIO_NOT_PHYSICAL',
    // Derived by the Agent read-only Backend HTTP adapter, never LLM text.
    'DEMAND_LOW_CONFIDENCE',
    'OBSERVED_DEMAND_RISING',
    'NEAR_EXPIRY_BACKEND',
    'EXPIRY_SURPLUS_BACKEND'
]);

const State = Annotation.Root({
    request: Annotation<AgentGraphInput>(),
    graphId: Annotation<string>(),
    status: Annotation<AgentGraphStatus>(),
    execution: Annotation<Execution | undefined>(),
    inventory: Annotation<InventoryRow[]>({ reducer: (_left, right) => right, default: () => [] }),
    perception: Annotation<PerceptionContext[]>({ reducer: (_left, right) => right, default: () => [] }),
    recommendations: Annotation<StockRecommendation[]>({ reducer: (_left, right) => right, default: () => [] }),
    classifications: Annotation<string[]>({ reducer: (_left, right) => right, default: () => [] }),
    toolResults: Annotation<ToolOutcome[]>({ reducer: (_left, right) => right, default: () => [] }),
    approvalBoundary: Annotation<ProposalReviewObservation | undefined>(),
    errorCode: Annotation<string | undefined>(),
    trace: Annotation<AgentGraphEvent[]>({
        reducer: (left, right) => [...left, ...right],
        default: () => []
    })
});
type GraphState = typeof State.State;

/**
 * Defense in depth at the StateGraph boundary. An injected/malformed Backend
 * adapter, test double, or replay may NOT claim an ADMIN approval. The actual
 * HTTP client separately validates its strict Backend response and reference.
 */
const observedProposal = z.strictObject({
    proposalId: z.string().regex(/^[A-Za-z0-9][A-Za-z0-9:_-]{0,119}$/),
    version: z.number().int().positive().max(2147483647),
    contentHash: z.string().regex(/^[a-f0-9]{64}$/),
    backendStatus: z.enum(['PENDING_APPROVAL', 'APPROVED_AWAITING_BACKEND', 'REJECTED',
        'EXECUTED', 'STALE_PROPOSAL', 'BACKEND_UNVERIFIED']),
    observedAt: z.iso.datetime(),
    httpStatus: z.union([z.literal(200), z.literal(409), z.null()]),
    approved: z.boolean(), rejected: z.boolean(), purchaseRequestPresent: z.boolean(),
    decisionActorId: z.string().min(1).max(120).nullable(),
    decisionAt: z.iso.datetime().nullable(),
    rejectionReasonHash: z.string().regex(/^[a-f0-9]{64}$/).nullable(),
    writesPerformed: z.literal(false)
});
function verifiedGraphObservation(raw: unknown, reference: ProposalReviewReference, now: number):
    ProposalReviewObservation {
    const parsed = observedProposal.safeParse(raw);
    if (!parsed.success) throw new Error('BACKEND_PROPOSAL_UNVERIFIED');
    const o = parsed.data;
    const age = now - Date.parse(o.observedAt);
    if (o.proposalId !== reference.proposalId || o.version !== reference.version ||
        o.contentHash !== reference.contentHash || !Number.isFinite(age) ||
        Math.abs(age) > 300000) throw new Error('BACKEND_PROPOSAL_UNVERIFIED');
    const hasDecision = Boolean(o.decisionActorId && o.decisionAt);
    if (Boolean(o.decisionActorId) !== Boolean(o.decisionAt) ||
        (o.backendStatus === 'PENDING_APPROVAL' &&
            (o.httpStatus !== 200 || o.approved || o.rejected || hasDecision ||
                o.rejectionReasonHash || o.purchaseRequestPresent)) ||
        (o.backendStatus === 'APPROVED_AWAITING_BACKEND' &&
            (o.httpStatus !== 200 || !o.approved || o.rejected || !hasDecision ||
                o.rejectionReasonHash || o.purchaseRequestPresent)) ||
        (o.backendStatus === 'REJECTED' &&
            (o.httpStatus !== 200 || !o.rejected || !hasDecision ||
                !o.rejectionReasonHash || o.purchaseRequestPresent)) ||
        (o.backendStatus === 'EXECUTED' &&
            (o.httpStatus !== 200 || !o.approved || o.rejected || !hasDecision ||
                o.rejectionReasonHash || !o.purchaseRequestPresent)) ||
        (o.backendStatus === 'STALE_PROPOSAL' &&
            (o.httpStatus !== 409 || o.approved || o.rejected || hasDecision ||
                o.rejectionReasonHash || o.purchaseRequestPresent)) ||
        (o.backendStatus === 'BACKEND_UNVERIFIED' &&
            (o.httpStatus !== null || o.approved || o.rejected || hasDecision ||
                o.rejectionReasonHash || o.purchaseRequestPresent))) {
        throw new Error('BACKEND_PROPOSAL_UNVERIFIED');
    }
    return o;
}

const errorCode = (error: unknown): string => {
    if (error instanceof Error && /^(FORBIDDEN|TOOL_DENIED|BUDGET_EXCEEDED|INVALID_[A-Z_]+|STALE_PROPOSAL|STALE_CONTEXT|DATA_UNAVAILABLE|APPROVAL_REQUIRED|TOOL_NOT_AVAILABLE|READ_ONLY_WORKFLOW_[A-Z_]+|POSTGRES_NOT_VERIFIED|STOCKTAKE_UNCERTAIN|INBOUND_UNVERIFIED|ANOMALOUS_INVENTORY|BACKEND_RISK_UNVERIFIED)$/.test(error.message)) {
        return error.message;
    }
    return 'UNVERIFIED_OPERATION'; // no raw LLM/provider/error strings in audit
};

/** No automatic approver identity, privileged execution, supplier purchase, or external I/O. */
export function compileAgentLangGraph(ops: Operations) {
    async function emit(
        state: GraphState, node: string, edge: string, status: string,
        code?: string, execution?: Execution, tool?: string, approvalBoundary?: ProposalReviewObservation
    ) {
        const event: AgentGraphEvent = { node, edge, status, at: new Date().toISOString(),
            ...(code ? { code } : {}), ...(tool ? { tool } : {}),
            ...(approvalBoundary ? { approvalBoundary } : {}),
            ...((execution ?? state.execution) ? { executionId: (execution ?? state.execution)!.id } : {}) };
        await ops.checkpoint(event, execution ?? state.execution);
        return { trace: [event] };
    }
    const graph = new StateGraph(State)
        .addNode('intake', async state => {
            try {
                await ops.authorize(state.request.actorId, 'agent.run');
                return { ...await emit(state, 'intake',
                    state.request.proposalReview && !state.request.jointReview ?
                        'backend_proposal_review' : 'data_collector', 'AUTHORIZED') };
            } catch (error) {
                return { ...await emit(state, 'intake', 'audit', 'DENIED', errorCode(error)),
                    status: 'HELD_POLICY' as const, errorCode: errorCode(error) };
            }
        })
        .addNode('backend_proposal_review', async state => {
            try {
                if (!state.request.proposalReview || !ops.proposalReview) {
                    throw new Error('BACKEND_PROPOSAL_UNVERIFIED');
                }
                await ops.authorize(state.request.actorId, 'agent.run');
                const observation = verifiedGraphObservation(
                    await ops.proposalReview(state.request.actorId, state.request.proposalReview),
                    state.request.proposalReview, ops.now());
                const current = observation.backendStatus;
                // Backend may already have persisted approval, rejection or
                // execution. None grants this read-only Agent a write capability.
                const awaiting = current === 'PENDING_APPROVAL';
                const trace = await emit(state, 'backend_proposal_review', 'audit',
                    awaiting ? 'BACKEND_AWAITING_HUMAN' : 'BACKEND_DECISION_HOLD', current,
                    undefined, undefined, observation);
                return { ...trace, approvalBoundary: observation,
                    status: awaiting ? 'AWAITING_APPROVAL' as const : 'HELD_POLICY' as const,
                    classifications: ['AI18_BACKEND_READ_ONLY', current] };
            } catch {
                // Never return a previously observed approval/rejection as if a
                // failed RESUME had freshly revalidated it. Persist an explicit
                // unverified checkpoint in the SAME graph run/trace instead.
                const reference = state.request.proposalReview;
                const unverified: ProposalReviewObservation | undefined = reference
                    ? { ...reference, backendStatus: 'BACKEND_UNVERIFIED',
                        observedAt: new Date(ops.now()).toISOString(),
                        httpStatus: null, approved: false, rejected: false,
                        purchaseRequestPresent: false, decisionActorId: null,
                        decisionAt: null, rejectionReasonHash: null, writesPerformed: false }
                    : undefined;
                return { ...await emit(state, 'backend_proposal_review', 'audit',
                    'BACKEND_DECISION_UNVERIFIED', 'BACKEND_PROPOSAL_UNVERIFIED',
                    undefined, undefined, unverified),
                    ...(unverified ? { approvalBoundary: unverified } : {}),
                    status: 'HELD_POLICY' as const, errorCode: 'BACKEND_PROPOSAL_UNVERIFIED' };
            }
        })
        .addNode('data_collector', async state => {
            try {
                await ops.authorize(state.request.actorId, 'inventory.read');
                let rows: InventoryRow[] | undefined;
                for (let attempt = 0; attempt < 2; attempt++) {
                    try { rows = await ops.inventory(state.request.actorId); break; }
                    catch (error) { if (attempt === 1) throw error; }
                }
                if (!Array.isArray(rows) || rows.length > 10000 || rows.some(row => !row || typeof row.id !== 'string' ||
                    typeof row.ingredientId !== 'string' || typeof row.remaining !== 'string' ||
                    typeof row.reserved !== 'string' || typeof row.version !== 'string')) {
                    throw new Error('INVALID_INVENTORY_SNAPSHOT');
                }
                return { ...await emit(state, 'data_collector', 'perception_collection', 'READ_VERIFIED'), inventory: rows };
            } catch (error) {
                return { ...await emit(state, 'data_collector', 'audit', 'READ_REJECTED', errorCode(error)),
                    status: 'HELD_POLICY' as const, errorCode: errorCode(error) };
            }
        })
        .addNode('perception_collection', async state => {
            if (!ops.perceive) return { ...await emit(state, 'perception_collection', 'inventory_analysis', 'LEGACY_PERCEPTION_UNAVAILABLE') };
            try {
                await ops.authorize(state.request.actorId, 'inventory.read');
                const records = await ops.perceive(state.request.actorId, state.inventory);
                if (!Array.isArray(records) || records.length !== state.inventory.length) {
                    throw new Error('DATA_UNAVAILABLE');
                }
                const seen = new Set<string>();
                for (const record of records) {
                    const checked = perceptionContextSchema.safeParse(record);
                    if (!checked.success || checked.data.dataQualityStatus !== 'VERIFIED' ||
                        seen.has(checked.data.ingredientId)) throw new Error('ANOMALOUS_INVENTORY');
                    seen.add(checked.data.ingredientId);
                    const source = state.inventory.find(row => row.ingredientId === checked.data.ingredientId);
                    if (!source || source.version !== String(checked.data.rowVersion + 1) ||
                        source.remaining !== checked.data.physicalQuantity ||
                        source.reserved !== checked.data.reservedQuantity) throw new Error('STALE_CONTEXT');
                }
                return { ...await emit(state, 'perception_collection', 'inventory_analysis', 'LOT_AWARE_READ_VERIFIED'),
                    perception: records };
            } catch (error) {
                return { ...await emit(state, 'perception_collection', 'audit', 'PERCEPTION_REJECTED', errorCode(error)),
                    status: 'HELD_POLICY' as const, errorCode: errorCode(error) };
            }
        })
        .addNode('inventory_analysis', async state => {
            try {
                await ops.authorize(state.request.actorId, 'inventory.read');
                let data: StockRecommendation[] | undefined;
                for (let attempt = 0; attempt < 2; attempt++) {
                    try { data = await ops.recommendations(state.request.actorId, state.inventory); break; }
                    catch (error) { if (attempt === 1) throw error; }
                }
                if (!Array.isArray(data) || data.length > 10000 ||
                    data.some(row => !row || typeof row.ingredientId !== 'string' ||
                        !/^(0|[1-9]\d*)(\.\d{1,3})?$/.test(row.recommendedBaseQuantity))) {
                    throw new Error('INVALID_INVENTORY_ANALYSIS');
                }
                if (state.perception.length && (data.length !== state.perception.length ||
                    data.some(row => {
                        const context = state.perception.find(item => item.ingredientId === row.ingredientId);
                        return !context || row.available !== context.availableQuantity ||
                            row.sourceVersion !== String(context.rowVersion + 1);
                    }))) throw new Error('STALE_CONTEXT');
                return { ...await emit(state, 'inventory_analysis', 'conditional_route', 'ANALYSIS_VERIFIED'),
                    recommendations: data, classifications: [
                        data.some(row => Number(row.recommendedBaseQuantity) > 0) ? 'LOW_STOCK' : 'NO_SHORTAGE'
                    ] };
            } catch (error) {
                return { ...await emit(state, 'inventory_analysis', 'audit', 'ANALYSIS_REJECTED', errorCode(error)),
                    status: 'HELD_POLICY' as const, errorCode: errorCode(error) };
            }
        })
        .addNode('backend_demand_risk', async state => {
            try {
                if (!ops.risk) throw new Error('BACKEND_RISK_UNVERIFIED');
                await ops.authorize(state.request.actorId, 'inventory.read');
                const raw = await ops.risk(state.request.actorId, state.inventory);
                const codes = Array.isArray(raw) ? raw : raw?.codes;
                if (!Array.isArray(codes) || codes.length > 120 ||
                    codes.some(code => !/^[A-Z0-9_]{1,64}$/.test(code))) throw new Error('BACKEND_RISK_UNVERIFIED');
                const all = [...new Set(codes)];
                if (all.some(code => !VERIFIED_DEMAND_RISK_CODES.has(code))) {
                    // Unknown Backend code may mean an added inventory safety
                    // condition. Do not invoke LLM/planner or persist raw,
                    // possibly adversarial evidence as trusted classification.
                    throw new Error('BACKEND_RISK_UNVERIFIED');
                }
                let richer: PerceptionContext[] | undefined;
                if (!Array.isArray(raw)) {
                    const parsed = backendRiskEvidenceSchema.safeParse(raw);
                    if (!parsed.success || !state.perception.length ||
                        parsed.data.observations.length !== state.perception.length) {
                        throw new Error('BACKEND_RISK_UNVERIFIED');
                    }
                    const seen = new Set<string>();
                    richer = state.perception.map(context => {
                        const observation = parsed.data.observations.find(o => o.ingredientId === context.ingredientId);
                        if (!observation || seen.has(observation.ingredientId) ||
                            observation.rowVersion !== context.rowVersion ||
                            observation.movementCursor !== context.movementCursor ||
                            inventoryScaledQuantity(observation.availableBase) !== inventoryScaledQuantity(context.availableQuantity) ||
                            Math.abs(ops.now() - Date.parse(observation.asOf)) > 300000) {
                            throw new Error('BACKEND_RISK_UNVERIFIED');
                        }
                        seen.add(observation.ingredientId);
                        return perceptionContextSchema.parse({
                            ...context,
                            projectedDaysRemaining: observation.projectedDaysRemaining,
                            forecastConfidence: observation.forecastConfidence,
                            demandWindowDays: observation.demandWindowDays,
                            observedConsumptionMovements: observation.observedConsumptionMovements,
                            incomingPurchaseOrders: observation.incomingPurchaseOrders,
                            outstandingPurchaseRequests: observation.outstandingPurchaseRequests,
                            outstandingPurchaseRequestsTruncated: observation.outstandingPurchaseRequestsTruncated,
                            pendingStocktakes: observation.pendingStocktakes,
                            backendReadAt: observation.asOf
                        });
                    });
                }
                const events: AgentGraphEvent[] = [];
                for (const code of all.length ? all : ['NO_ALERTS']) {
                    events.push(...(await emit(state, 'backend_demand_risk',
                        'conditional_route', 'BACKEND_READ_REVIEW_ONLY', code)).trace);
                }
                // Backend provides observations, not merchant-approved purchase
                // authority. Any active stocktake/inbound/request/aggregate anomaly
                // blocks planning and still persists the complete reason.
                const held = all.some(code => ['STOCKTAKE_UNCERTAIN', 'INBOUND_NOT_PHYSICAL',
                    'EXISTING_PURCHASE_REQUEST', 'ANOMALOUS_STOCK_AGGREGATE',
                    'EXPIRED_STOCK_PRESENT', 'UNKNOWN_EXPIRY_LOT',
                    'NON_AVAILABLE_LOT_PRESENT', 'NEAR_EXPIRY_FEFO',
                    'DEMAND_DORMANT_REVIEW'].includes(code));
                if (held) {
                    events.push(...(await emit(state, 'backend_demand_risk',
                        'audit', 'POLICY_HOLD', 'BACKEND_RISK_UNVERIFIED')).trace);
                }
                return { trace: events,
                    ...(richer ? { perception: richer } : {}),
                    classifications: [...state.classifications, ...all],
                    ...(held ? { status: 'HELD_POLICY' as const, errorCode: 'BACKEND_RISK_UNVERIFIED' } : {}) };
            } catch {
                return { ...await emit(state, 'backend_demand_risk', 'audit',
                    'BACKEND_READ_FAILED', 'BACKEND_RISK_UNVERIFIED'),
                    status: 'HELD_POLICY' as const, errorCode: 'BACKEND_RISK_UNVERIFIED' };
            }
        })
        .addNode('conditional_route', async state => ({
            ...await emit(state, 'conditional_route',
                state.request.mode === 'RESUME' ? 'resume_checkpoint' :
                    state.request.jointReview ? 'read_only_identity' : 'planner',
                state.request.mode === 'RESUME' ? 'RESUME_EXISTING_EXECUTION' :
                    state.request.jointReview ? 'FIXED_READ_IDENTITY_NO_PLANNER' :
                        state.request.replenishment ? 'DETERMINISTIC_REPLENISHMENT' : 'LLM_OPTIONAL')
        }))
        .addNode('read_only_identity', async state => {
            try {
                if (!state.request.jointReview || !ops.createReadIdentity) {
                    throw new Error('POSTGRES_NOT_VERIFIED');
                }
                await ops.authorize(state.request.actorId, 'agent.run');
                const execution = await ops.createReadIdentity(state.request);
                return { ...await emit(state, 'read_only_identity', 'policy_validation',
                    'FIXED_READ_ID_PERSISTED', undefined, execution),
                    execution, status: knownStatus(execution.status) };
            } catch (error) {
                return { ...await emit(state, 'read_only_identity', 'audit',
                    'READ_ID_HELD', errorCode(error)),
                    status: 'HELD_POLICY' as const, errorCode: errorCode(error) };
            }
        })
        .addNode('planner', async state => {
            try {
                const execution = await ops.plan(state.request);
                return { ...await emit(state, 'planner', 'policy_validation', 'PLAN_PERSISTED', undefined, execution),
                    execution, status: knownStatus(execution.status) };
            } catch (error) {
                const code = errorCode(error);
                const unavailable = code === 'UNVERIFIED_OPERATION';
                return { ...await emit(state, 'planner', 'audit', 'PLAN_REJECTED', unavailable ? 'LLM_UNAVAILABLE_OR_INVALID' : code),
                    status: unavailable ? 'DEGRADED_LLM' as const : 'HELD_POLICY' as const,
                    errorCode: unavailable ? 'LLM_UNAVAILABLE_OR_INVALID' : code };
            }
        })
        .addNode('resume_checkpoint', async state => {
            try {
                const execution = await ops.resume(state.request);
                return { ...await emit(state, 'resume_checkpoint', 'policy_validation', 'RESUMED_DURABLE_ID', undefined, execution),
                    execution, status: knownStatus(execution.status) };
            } catch (error) {
                return { ...await emit(state, 'resume_checkpoint', 'audit', 'RESUME_REJECTED', errorCode(error)),
                    status: 'HELD_POLICY' as const, errorCode: errorCode(error) };
            }
        })
        .addNode('policy_validation', async state => {
            try {
                if (!state.execution) throw new Error('INVALID_GRAPH_EXECUTION');
                await ops.authorize(state.request.actorId, 'agent.run');
                ops.validate(state.execution.plan, state.request.budget);
                return { ...await emit(state, 'policy_validation', 'allowlisted_tools', 'ALLOWLIST_POLICY_VERIFIED') };
            } catch (error) {
                return { ...await emit(state, 'policy_validation', 'audit', 'POLICY_REJECTED', errorCode(error)),
                    status: 'HELD_POLICY' as const, errorCode: errorCode(error) };
            }
        })
        .addNode('allowlisted_tools', async state => {
            const results: ToolOutcome[] = [];
            const tools = state.request.readTools ?? [];
            const registryEvents: AgentGraphEvent[] = [];
            for (const [toolIndex, tool] of tools.entries()) {
                // A trusted selector can reject a request BEFORE the Registry call.
                // Registry remains the independent authority for permission/schema.
                if (ops.selectRead) {
                    let selection: ToolSelectionDecision;
                    try {
                        selection = await ops.selectRead(state.request.actorId, tool.name,
                            tool.input, state.perception.length > 0);
                    } catch {
                        const failure = await emit(state, 'tool_selection', 'audit',
                            'INPUT_REJECTED', 'INVALID_TOOL_INPUT');
                        return { ...failure, trace: [...registryEvents, ...failure.trace],
                            toolResults: results, status: 'HELD_POLICY' as const,
                            errorCode: 'INVALID_TOOL_INPUT' };
                    }
                    if (selection.status !== 'SELECTED' ||
                        selection.selectedTool !== tool.name || !selection.readOnly ||
                        selection.requiresApproval || selection.executeCalled) {
                        // UNKNOWN_TOOL can be proven through the existing
                        // Registry's catalog rejection (zero handler attempts).
                        // This is a denial probe, NOT execution or fallback;
                        // preserve historical AI22 evidence in toolResults.
                        if (selection.selectionReason === 'UNKNOWN_TOOL') {
                            try {
                                const denied = await ops.dispatchRead(state.request.actorId,
                                    tool.name, tool.input, tool.version);
                                if (!denied.ok && denied.error === 'UNKNOWN_TOOL' &&
                                    denied.evidence.attempts === 0) results.push(denied);
                            } catch { /* Selector remains a fail-closed denial. */ }
                        }
                        const failure = await emit(state, 'tool_selection', 'audit',
                            'SELECTION_HELD', selection.selectionReason);
                        return { ...failure, trace: [...registryEvents, ...failure.trace],
                            toolResults: results, status: 'HELD_POLICY' as const,
                            errorCode: 'TOOL_DENIED' };
                    }
                    const chosen = await emit(state, 'tool_selection',
                        'allowlisted_tools', 'SELECTED_READ_ONLY', selection.selectionReason,
                        undefined, tool.name);
                    registryEvents.push(...chosen.trace);
                }
                let outcome: ToolOutcome | undefined;
                if (ops.executeActRead) {
                    const stepId = 'act-' + (toolIndex + 1);
                    const previous = toolIndex ? tools[toolIndex - 1] : undefined;
                    const currentId = (tool.input as { ingredientId?: unknown } | null)?.ingredientId;
                    const priorId = (previous?.input as { ingredientId?: unknown } | null)?.ingredientId;
                    const dependsOnPrevious = tool.name === 'getIngredientBatches' &&
                        previous?.name === 'getIngredientAvailability' &&
                        typeof currentId === 'string' && currentId === priorId;
                    // Dependency IDs are derived from validated tool contracts and
                    // previously verified Registry results, never client assertions.
                    const dependencies = dependsOnPrevious ? ['act-' + toolIndex] : [];
                    const completedDependencies = dependsOnPrevious && results[toolIndex - 1]?.ok
                        ? ['act-' + toolIndex] : [];
                    const context = state.perception.find(p => p.ingredientId === currentId);
                    const expectedSourceVersion = context ?
                        context.rowVersion + ':' + context.movementCursor : undefined;
                    try {
                        const act = await ops.executeActRead({
                            runId: state.graphId, stepId, actorId: state.request.actorId,
                            tool: tool.name, input: tool.input, version: tool.version,
                            dependencies, completedDependencies,
                            ...(expectedSourceVersion ? { expectedSourceVersion } : {})
                        });
                        registryEvents.push(...act.events);
                        if (act.result.status !== 'SUCCEEDED' || !act.result.outcome) {
                            const failure = await emit(state, 'allowlisted_tools', 'audit',
                                'ACT_HELD', act.result.code ?? 'TOOL_NOT_AVAILABLE');
                            return { ...failure, trace: [...registryEvents, ...failure.trace],
                                toolResults: results, status: 'HELD_POLICY' as const,
                                errorCode: act.result.code ?? 'TOOL_NOT_AVAILABLE' };
                        }
                        outcome = act.result.outcome;
                        if (dependsOnPrevious) {
                            // The second step consumes the verified first result.
                            // A mismatched ingredient, sum or missing predecessor is
                            // stale, even if each individual Registry DTO is valid.
                            const first = results[toolIndex - 1];
                            const prior = first?.ok ? first.output as { ingredientId: string; quantity: number } : null;
                            const second = outcome.output as { ingredientId: string;
                                batches: { quantityRemaining: number }[] };
                            if (!prior || second.ingredientId !== prior.ingredientId ||
                                second.batches.reduce((sum, b) =>
                                    sum + inventoryScaledQuantity(b.quantityRemaining), 0n) !==
                                    inventoryScaledQuantity(prior.quantity)) {
                                const failure = await emit(state, 'allowlisted_tools', 'audit',
                                    'ACT_DEPENDENCY_STALE', 'STALE_CONTEXT');
                                return { ...failure, trace: [...registryEvents, ...failure.trace],
                                    toolResults: results, status: 'HELD_POLICY' as const,
                                    errorCode: 'STALE_CONTEXT' };
                            }
                            const verified = await emit(state, 'act_dependency',
                                'allowlisted_tools', 'PREREQUISITE_CONSUMED', undefined,
                                undefined, tool.name);
                            registryEvents.push(...verified.trace);
                        }
                    } catch {
                        const failure = await emit(state, 'allowlisted_tools', 'audit',
                            'ACT_CHECKPOINT_UNVERIFIED', 'TOOL_NOT_AVAILABLE');
                        return { ...failure, trace: [...registryEvents, ...failure.trace],
                            toolResults: results, status: 'HELD_POLICY' as const,
                            errorCode: 'TOOL_NOT_AVAILABLE' };
                    }
                } else {
                    // Legacy read path remains for runtimes that did not enable ACT.
                    for (let attempt = 0; attempt < 2; ++attempt) {
                        try {
                            outcome = await ops.dispatchRead(state.request.actorId, tool.name, tool.input, tool.version);
                        } catch {
                            const failure = await emit(state, 'allowlisted_tools', 'audit', 'REGISTRY_NOT_BOUND', 'TOOL_NOT_AVAILABLE');
                            return { ...failure, trace: [...registryEvents, ...failure.trace],
                                toolResults: results, status: 'HELD_POLICY' as const, errorCode: 'TOOL_NOT_AVAILABLE' };
                        }
                        if (outcome.ok || !['TIMEOUT', 'BACKEND_FAILURE'].includes(outcome.error)) break;
                    }
                }
                results.push(outcome!);
                if (!outcome!.ok) {
                    const failure = await emit(state, 'allowlisted_tools', 'audit', 'TOOL_REJECTED', outcome!.error);
                    return { ...failure, trace: [...registryEvents, ...failure.trace],
                        toolResults: results, status: 'HELD_POLICY' as const, errorCode: outcome!.error };
                }
                // The two existing registry reads are independent queries.
                // Compare their validated results to the earlier lot-aware
                // perception/version before treating either as current evidence.
                if (state.perception.length &&
                    (tool.name === 'getIngredientAvailability' || tool.name === 'getIngredientBatches')) {
                    try {
                        const body = outcome!.output as Record<string, unknown>;
                        const context = state.perception.find(item => item.ingredientId === body.ingredientId);
                        if (!context) throw new Error('STALE_CONTEXT');
                        if (tool.name === 'getIngredientAvailability') {
                            if (body.rowVersion !== context.rowVersion ||
                                inventoryScaledQuantity(body.quantity as number) !== inventoryScaledQuantity(context.physicalQuantity) ||
                                inventoryScaledQuantity(body.reserved as number) !== inventoryScaledQuantity(context.reservedQuantity)) {
                                throw new Error('STALE_CONTEXT');
                            }
                        } else {
                            const batches = body.batches as { id: string; quantityRemaining: number;
                                expirationDate: string | null }[];
                            if (batches.length !== context.lotBreakdown.length ||
                                batches.some(batch => {
                                    const prior = context.lotBreakdown.find(p => p.id === batch.id);
                                    return !prior || prior.expirationDate !== batch.expirationDate ||
                                        inventoryScaledQuantity(batch.quantityRemaining) !== inventoryScaledQuantity(prior.quantityRemaining);
                                })) throw new Error('STALE_CONTEXT');
                        }
                    } catch {
                        const failure = await emit(state, 'allowlisted_tools', 'audit',
                            'STALE_REGISTERED_READ', 'STALE_CONTEXT');
                        return { ...failure, trace: [...registryEvents, ...failure.trace],
                            toolResults: results, status: 'HELD_POLICY' as const, errorCode: 'STALE_CONTEXT' };
                    }
                }
                // Persist a separate validated-backend-read checkpoint, not raw
                // untrusted tool results, tokens, or a fabricated purchase receipt.
                const verified = await emit(state, 'tool_registry', 'allowlisted_tools',
                    'BACKEND_READ_VALIDATED', undefined, undefined, tool.name);
                registryEvents.push(...verified.trace);
            }
            const observations = new Set<string>();
            const now = ops.now();
            for (let i = 0; i < results.length; i++) {
                const outcome = results[i];
                if (tools[i]?.name !== 'getIngredientBatches' || !outcome?.ok) continue;
                const response = outcome.output as { batches?: { expirationDate: string | null; quantityRemaining: number }[] };
                if (!Array.isArray(response.batches)) continue; // registry contract already validated
                const lots = response.batches.filter(b => b.quantityRemaining > 0);
                if (lots.some(b => b.expirationDate === null)) observations.add('UNKNOWN_EXPIRY_LOT');
                if (lots.some(b => b.expirationDate && Date.parse(b.expirationDate) <= now)) observations.add('EXPIRED_STOCK_PRESENT');
                if (lots.some(b => b.expirationDate && Date.parse(b.expirationDate) > now &&
                    Date.parse(b.expirationDate) <= now + 7 * 86400000)) observations.add('NEAR_EXPIRY_FEFO');
                if (lots.some(b => b.expirationDate)) observations.add('FEFO_EXPIRY_ORDER_OBSERVED');
                // Registry batch contract has no quality/hold status. An expiry
                // order is NOT approval to deduct inventory from that lot.
                if (lots.length && !state.perception.length) observations.add('FEFO_QUALITY_NOT_VERIFIED');
            }
            for (const code of observations) {
                const evidence = await emit(state, 'risk_analysis',
                    state.request.jointReview ? 'backend_proposal_review' : 'human_approval', 'OBSERVATION_ONLY', code);
                registryEvents.push(...evidence.trace);
            }
            const transition = await emit(state, 'allowlisted_tools',
                state.request.jointReview ? 'backend_proposal_review' : 'human_approval',
                'REGISTERED_READS_VERIFIED');
            return { ...transition, trace: [...registryEvents, ...transition.trace],
                classifications: [...state.classifications, ...observations], toolResults: results };
        })
        .addNode('human_approval', async state => {
            if (!state.execution) return { ...await emit(state, 'human_approval', 'audit', 'MISSING_EXECUTION'),
                status: 'HELD_POLICY' as const };
            const e = state.execution;
            if (e.status === 'SUCCEEDED' || e.status === 'FAILED' || e.status === 'CANCELLED') {
                return { ...await emit(state, 'human_approval', 'evaluation', 'ALREADY_TERMINAL'), status: knownStatus(e.status) };
            }
            const requiresApproval = e.plan.some(step => step.tool === 'purchase.create');
            if (requiresApproval) {
                const inspected = await ops.inspect(state.request.actorId, e.id);
                const approved = inspected.approvals.some(a => a.hash === e.hash && !a.revoked &&
                    (a.consumed || Date.parse(a.expiresAt) > ops.now()));
                if (!approved && state.request.mode === 'PLAN' && e.plan.some(step => 'id' in step)) {
                    const next = await ops.execute(e.id, state.request.actorId);
                    // Existing workflow performs ONLY preparatory tools before requesting ADMIN approval.
                    return { ...await emit(state, 'human_approval', 'audit', 'AWAITING_HUMAN_APPROVAL', undefined, next),
                        execution: next, status: 'AWAITING_APPROVAL' as const };
                }
                if (!approved) {
                    return { ...await emit(state, 'human_approval', 'audit', 'AWAITING_HUMAN_APPROVAL'),
                        status: 'AWAITING_APPROVAL' as const };
                }
            }
            // This is an explicitly granted transition; a stale AWAITING_APPROVAL
            // status must not route the graph straight to END.
            return { ...await emit(state, 'human_approval', 'backend_execution', requiresApproval ?
                'PERSISTED_APPROVAL_FOUND' : 'READ_ONLY_EXECUTION'), status: 'RUNNING' as const };
        })
        .addNode('backend_execution', async state => {
            try {
                const execution = await ops.execute(state.execution!.id, state.request.actorId);
                return { ...await emit(state, 'backend_execution', 'evaluation', execution.status, undefined, execution),
                    execution, status: knownStatus(execution.status) };
            } catch (error) {
                return { ...await emit(state, 'backend_execution', 'audit', 'EXECUTION_HELD', errorCode(error)),
                    status: errorCode(error) === 'APPROVAL_REQUIRED' ? 'AWAITING_APPROVAL' as const : 'HELD_POLICY' as const,
                    errorCode: errorCode(error) };
            }
        })
        .addNode('evaluation', async state => {
            const execution = state.execution;
            if (!execution) return { ...await emit(state, 'evaluation', 'audit', 'NO_EXECUTION'), status: 'HELD_POLICY' as const };
            const verified = await ops.inspect(state.request.actorId, execution.id);
            const clean = verified.execution.status === 'SUCCEEDED' && verified.execution.outcome?.verified;
            return { ...await emit(state, 'evaluation', 'audit', clean ? 'OUTCOME_VERIFIED' : 'OUTCOME_HELD'),
                execution: verified.execution, status: knownStatus(verified.execution.status) };
        })
        .addNode('audit', async state => ({ ...await emit(state, 'audit', END, 'CHECKPOINTED') }))
        .addEdge(START, 'intake')
        .addConditionalEdges('intake', s => s.errorCode ? 'audit' :
            s.request.proposalReview && !s.request.jointReview ? 'backend_proposal_review' : 'data_collector')
        .addEdge('backend_proposal_review', 'audit')
        .addConditionalEdges('data_collector', s => s.errorCode ? 'audit' : 'perception_collection')
        .addConditionalEdges('perception_collection', s => s.errorCode ? 'audit' : 'inventory_analysis')
        .addConditionalEdges('inventory_analysis', s => s.errorCode ? 'audit' :
            ops.risk ? 'backend_demand_risk' : 'conditional_route')
        .addConditionalEdges('backend_demand_risk', s => s.errorCode ? 'audit' : 'conditional_route')
        .addConditionalEdges('conditional_route', s => s.request.mode === 'RESUME' ?
            'resume_checkpoint' : s.request.jointReview ? 'read_only_identity' : 'planner')
        .addConditionalEdges('read_only_identity', s => s.errorCode ? 'audit' : 'policy_validation')
        .addConditionalEdges('planner', s => s.errorCode ? 'audit' : 'policy_validation')
        .addConditionalEdges('resume_checkpoint', s => s.errorCode ? 'audit' : 'policy_validation')
        .addConditionalEdges('policy_validation', s => s.errorCode ? 'audit' : 'allowlisted_tools')
        .addConditionalEdges('allowlisted_tools', s => s.errorCode ? 'audit' :
            s.request.jointReview ? 'backend_proposal_review' : 'human_approval')
        .addConditionalEdges('human_approval', s => s.status === 'AWAITING_APPROVAL' ? 'audit' :
            s.execution && ['SUCCEEDED', 'FAILED', 'CANCELLED'].includes(s.execution.status) ? 'evaluation' : 'backend_execution')
        .addConditionalEdges('backend_execution', s => s.errorCode ? 'audit' : 'evaluation')
        .addEdge('evaluation', 'audit')
        .addEdge('audit', END);
    return graph.compile();
}

export function graphResult(state: typeof State.State): AgentGraphResult {
    return { graphId: state.graphId, requestId: state.request.requestId, actorId: state.request.actorId,
        status: state.status, source: 'LANGGRAPH_STATEGRAPH', trace: state.trace,
        classifications: state.classifications, toolResults: state.toolResults,
        ...(state.perception.length ? { perception: state.perception } : {}),
        ...(state.execution ? { execution: state.execution } : {}),
        ...(state.approvalBoundary ? { approvalBoundary: state.approvalBoundary } : {}) };
}
