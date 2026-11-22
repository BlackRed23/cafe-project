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
import type { ObservationDecision } from '../services/observation/observation';
import type { HandoffResult, HandoffScope } from '../services/anomaly/observation-handoff';
import type { DurableAnmRepHandoff } from './integration/session-d-anm-rep-handoff';
import type { ProposalReviewReference, ProposalReviewObservation } from './agent-backend-proposal-review';
import { z } from 'zod';
import { inventoryScaledQuantity, perceptionContextSchema, type PerceptionContext } from './inventory-perception';
import { backendRiskEvidenceSchema, type BackendRiskEvidence } from './agent-backend-risk-evidence';
import { calculateHeldStocktakeScenario, stocktakeScenarioSourceSchema,
    type StocktakeScenarioAnalysis, type StocktakeScenarioSource } from './integration/stocktake-scenario-continuation';
import { buildD4Plan, evaluateD4Plan,
    type D4Context, type D4Plan, type D4PlanStep, type D4Recommendation } from './integration/d4-purchasing-intelligence';

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
    /** Opt-in D4 analysis: always read-only; not a purchasing WRITE grant. */
    d4Intelligence?: true;
    /** Explicit, separately gated D4 proposal workflow. Never implied by READ mode. */
    purchaseFlow?: true;
};
export type GraphPurchaseReference = ProposalReviewReference & { proposalId: string };
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
    actCycle?: number;
    observationTraceId?: string;
    approvalBoundary?: ProposalReviewObservation;
    scenarioAnalysis?: StocktakeScenarioAnalysis;
    d4Plan?: D4Plan;
    d4Recommendation?: D4Recommendation;
    proposalReference?: GraphPurchaseReference;
    purchaseRequestId?: string;
    /** Read-only threshold what-if, never misrepresented as demand forecast. */
    d4ThresholdScenario?: D4ThresholdScenario;
    d4Step?: {
        stepId: string; tool: string; result: string; attempt: number;
        sanitizedInput: Record<string, string>;
        evidence: { validated: boolean; status: string; mode: string; version: string;
            attempts: number; durationMs: number; durable: false };
    };
};
export type D4ThresholdScenario = {
    targetBasis: 'INGREDIENT_MIN_THRESHOLD_NOT_FORECAST';
    planBasis: 'D4_READ_PLAN_EXECUTED';
    permission: 'READ_ONLY_ANALYSIS';
    stocktakeStatusToolVerified: boolean;
    confirmed: { stockBase: string; shortageBase: string };
    hypothetical: { stockBase: string; shortageBase: string };
    targetBase: string;
    sourceVersion: { rowVersion: number; movementCursor: string; stocktakeRevision: number };
    noPurchaseOrApprovalAuthority: true;
};
/** Sanitized OBS proof: never persist tool output or a proposed business mutation. */
export type AgentGraphObservation = {
    runId: string; stepId: string; actorId: string; toolName: string;
    attempt: number; status: ObservationDecision['observationStatus'];
    quality: ObservationDecision['dataQuality'];
    verifiedForBusiness: boolean; traceId: string; code?: string;
};
/** Sanitized durable D2/D3 outcomes; never expose raw inventory evidence. */
export type AgentGraphAnomaly = {
    invocationId: string; observationId: string; status: string;
    sourceVerified: boolean; findingCodes: string[]; policyBlocked: boolean;
};
export type AgentGraphReplan = {
    invocationId: string; status: string; sourceAttested: boolean;
    reasons: string[]; priorPlanId: string; priorPlanVersion: number;
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
    observations?: AgentGraphObservation[];
    anomalies?: AgentGraphAnomaly[];
    replanning?: AgentGraphReplan[];
    perception?: PerceptionContext[];
    approvalBoundary?: ProposalReviewObservation;
    scenarioAnalysis?: StocktakeScenarioAnalysis;
    d4Plan?: D4Plan;
    d4Recommendation?: D4Recommendation;
    proposalReference?: GraphPurchaseReference;
    purchaseRequestId?: string;
    d4ThresholdScenario?: D4ThresholdScenario;
};

type Operations = {
    now(): number;
    authorize(actorId: string, permission: string): Promise<unknown>;
    inventory(actorId: string): Promise<InventoryRow[]>;
    recommendations(actorId: string, inventory: InventoryRow[]): Promise<StockRecommendation[]>;
    perceive?(actorId: string, inventory: InventoryRow[]): Promise<PerceptionContext[]>;
    risk?(actorId: string, inventory: InventoryRow[]): Promise<string[] | BackendRiskEvidence>;
    proposalReview?(actorId: string, reference: ProposalReviewReference): Promise<ProposalReviewObservation>;
    /** Backend alone owns terms, persistence, ADMIN approval and PR deduplication. */
    createD4Proposal?(actorId: string, graphId: string, context: D4Context,
        recommendation: D4Recommendation): Promise<GraphPurchaseReference>;
    executeD4ApprovedProposal?(actorId: string, graphId: string,
        reference: GraphPurchaseReference): Promise<{ purchaseRequestId: string }>;
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
    executeActRead?(step: ActReadStep, trusted?: { expectedRowVersion?: number }):
        Promise<{ result: ActReadResult; events: AgentGraphEvent[]; observation?: AgentGraphObservation }>;
    /** Optional D2/D3 trusted persisted readers; opt-in preserves legacy Graph. */
    sessionDAnomaly?(scope: HandoffScope): Promise<HandoffResult>;
    sessionDReplanning?(scope: HandoffScope): Promise<DurableAnmRepHandoff>;
    /** D4 independent, committed read-identity proof; a missing PLN plan is
     * never inferred from a thrown REP verifier or caller-provided flag. */
    sessionDNoPlanProof?(scope: HandoffScope): Promise<{
        status: 'REP_NOT_APPLICABLE'; reason: 'FIXED_READ_IDENTITY_NO_VERIFIED_PLN';
        graphId: string; actorId: string; executionId: string; sourceAttested: true;
    }>;
    /** Only supplied in explicit durable read-only mode, never a business write permission. */
    stocktakeScenarioSource?(actorId: string, context: PerceptionContext): Promise<StocktakeScenarioSource>;
    /** Authenticated Backend business facts; must never accept LLM inventory numbers. */
    d4Context?(actorId: string, context: PerceptionContext): Promise<D4Context>;
    /** Explicit opt-in: select one independent, already-authorized READ step.
     * A model can change execution order, never add/remove mandatory reads. */
    selectD4LlmRead?(actorId: string, steps: D4PlanStep[]): Promise<string>;
    registryCapabilities?(): { name: string; version: string; bound: boolean; mode: 'MOCK' | 'BACKEND' }[];
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
    observations: Annotation<AgentGraphObservation[]>({ reducer: (_left, right) => right, default: () => [] }),
    anomalies: Annotation<AgentGraphAnomaly[]>({ reducer: (_left, right) => right, default: () => [] }),
    replanning: Annotation<AgentGraphReplan[]>({ reducer: (_left, right) => right, default: () => [] }),
    noVerifiedPlnProof: Annotation<boolean>({ reducer: (_left, right) => right, default: () => false }),
    approvalBoundary: Annotation<ProposalReviewObservation | undefined>(),
    proposalReference: Annotation<GraphPurchaseReference | undefined>(),
    purchaseRequestId: Annotation<string | undefined>(),
    scenarioAnalysis: Annotation<StocktakeScenarioAnalysis | undefined>(),
    d4Context: Annotation<D4Context | undefined>(),
    d4Plan: Annotation<D4Plan | undefined>(),
    d4Recommendation: Annotation<D4Recommendation | undefined>(),
    d4ThresholdScenario: Annotation<D4ThresholdScenario | undefined>(),
    d4Observations: Annotation<Record<string, ToolOutcome>>({
        reducer: (_left, right) => right, default: () => ({})
    }),
    d4ReplanCount: Annotation<number>({ reducer: (_left, right) => right, default: () => 0 }),
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
                const stocktakeRead = errorCode(error) === 'STOCKTAKE_UNCERTAIN' &&
                    Boolean(ops.stocktakeScenarioSource) && state.perception.length === 1 &&
                    state.request.readTools?.length === 2;
                return { ...await emit(state, 'inventory_analysis',
                    stocktakeRead ? 'stocktake_scenario_analysis' : 'audit',
                    'ANALYSIS_REJECTED', errorCode(error)),
                    status: 'HELD_POLICY' as const, errorCode: errorCode(error) };
            }
        })
        .addNode('stocktake_scenario_analysis', async state => {
            // This path is reached ONLY after the original policy HOLD. It does
            // not enter conditional_route, planner, policy_validation or execution.
            const tools = state.request.readTools ?? [];
            const p = state.perception[0];
            const actor = state.request.actorId;
            const events: AgentGraphEvent[] = [];
            const outcomes: ToolOutcome[] = [];
            try {
                if (!p || state.errorCode !== 'STOCKTAKE_UNCERTAIN' ||
                    state.status !== 'HELD_POLICY' || !ops.stocktakeScenarioSource ||
                    !ops.selectRead || tools.length !== 2 ||
                    tools[0]?.name !== 'getIngredientAvailability' ||
                    tools[1]?.name !== 'getIngredientBatches' ||
                    tools.some(t => t.version !== '1.0.0' ||
                        (t.input as { ingredientId?: unknown } | null)?.ingredientId !== p.ingredientId)) {
                    throw new Error('INVALID_SCENARIO_SOURCE');
                }
                await ops.authorize(actor, 'agent.run');
                await ops.authorize(actor, 'inventory.read');
                const source = stocktakeScenarioSourceSchema.parse(
                    await ops.stocktakeScenarioSource(actor, p));
                for (const tool of tools) {
                    const selection = await ops.selectRead(actor, tool.name, tool.input, true);
                    if (selection.status !== 'SELECTED' || selection.selectedTool !== tool.name ||
                        !selection.readOnly || selection.requiresApproval || selection.executeCalled) {
                        throw new Error('TOOL_DENIED');
                    }
                    events.push(...(await emit(state, 'stocktake_scenario_tool_selection',
                        'stocktake_scenario_analysis', 'SELECTED_READ_ONLY',
                        undefined, undefined, tool.name)).trace);
                    const outcome = await ops.dispatchRead(actor, tool.name, tool.input, tool.version);
                    outcomes.push(outcome);
                    events.push(...(await emit(state, 'stocktake_scenario_tool_registry',
                        outcome.ok ? 'stocktake_scenario_analysis' : 'audit',
                        outcome.ok ? 'BACKEND_READ_VALIDATED' : 'BACKEND_READ_FAILED',
                        outcome.ok ? undefined : outcome.error, undefined, tool.name)).trace);
                    if (!outcome.ok || !outcome.evidence.validated ||
                        outcome.evidence.mode !== 'BACKEND') throw new Error('INVALID_SCENARIO_SOURCE');
                }
                // Re-read the authoritative pending count, versions and status
                // after registry calls. Any intervening adjustment/review fails closed.
                const fresh = stocktakeScenarioSourceSchema.parse(
                    await ops.stocktakeScenarioSource(actor, p));
                if (JSON.stringify(source) !== JSON.stringify(fresh)) throw new Error('STALE_CONTEXT');
                const calculated = calculateHeldStocktakeScenario(
                    p, fresh, outcomes[0]?.ok ? outcomes[0].output : null,
                    outcomes[1]?.ok ? outcomes[1].output : null);
                const proof: AgentGraphEvent = {
                    node: 'stocktake_scenario_analysis', edge: 'audit',
                    status: 'SCENARIO_ANALYSIS_VERIFIED', code: 'STOCKTAKE_UNCERTAIN',
                    at: new Date().toISOString(), scenarioAnalysis: calculated
                };
                await ops.checkpoint(proof);
                return { trace: [...events, proof], toolResults: outcomes,
                    scenarioAnalysis: calculated, status: 'HELD_POLICY' as const,
                    errorCode: 'STOCKTAKE_UNCERTAIN' };
            } catch (error) {
                const held = await emit(state, 'stocktake_scenario_analysis', 'audit',
                    'SCENARIO_ANALYSIS_HELD',
                    errorCode(error) === 'STALE_CONTEXT' ? 'STALE_CONTEXT' : 'SCENARIO_SOURCE_UNVERIFIED');
                return { trace: [...events, ...held.trace], toolResults: outcomes,
                    status: 'HELD_POLICY' as const, errorCode: 'STOCKTAKE_UNCERTAIN' };
            }
        })
        .addNode('d4_planning', async state => {
            try {
                if (!state.request.d4Intelligence || state.perception.length !== 1 ||
                    !ops.d4Context || !ops.registryCapabilities || !ops.selectRead) {
                    throw new Error('DATA_UNAVAILABLE');
                }
                await ops.authorize(state.request.actorId, 'agent.run');
                await ops.authorize(state.request.actorId, 'inventory.read');
                const context = await ops.d4Context(state.request.actorId, state.perception[0]!);
                if (context.perception.ingredientId !== state.perception[0]!.ingredientId ||
                    context.perception.rowVersion !== state.perception[0]!.rowVersion ||
                    context.perception.movementCursor !== state.perception[0]!.movementCursor) {
                    throw new Error('STALE_CONTEXT');
                }
                const capabilities = ops.registryCapabilities();
                const plan = buildD4Plan(context, capabilities);
                if (!plan.steps.length || plan.steps.length > 10 || plan.steps.some(step =>
                    !capabilities.some(c => c.name === step.tool && c.version === step.version &&
                        c.bound && c.mode === 'BACKEND'))) {
                    throw new Error('TOOL_DENIED');
                }
                let modelSelectionProof: AgentGraphEvent | undefined;
                if (ops.selectD4LlmRead) {
                    // Do not allow a model to suppress required stocktake, lot,
                    // source-version, inbound or supplier safety checks.
                    const independent = plan.steps.filter(step => step.dependsOn.length === 0);
                    if (!independent.length) throw new Error('TOOL_DENIED');
                    const selectedTool = await ops.selectD4LlmRead(state.request.actorId, independent);
                    const chosen = independent.find(step => step.tool === selectedTool);
                    if (!chosen || !plan.steps.some(step => step.id === chosen.id)) {
                        throw new Error('TOOL_DENIED');
                    }
                    // The selected independent step executes first; all other
                    // steps and their dependency identifiers remain unchanged.
                    plan.steps = [chosen, ...plan.steps.filter(step => step.id !== chosen.id)];
                    modelSelectionProof = { node: 'd4_planning', edge: 'd4_registry_execution',
                        status: 'LLM_READ_SELECTION_VERIFIED',
                        at: new Date(ops.now()).toISOString(), tool: selectedTool };
                    await ops.checkpoint(modelSelectionProof);
                }
                const proof: AgentGraphEvent = { node: 'd4_planning', edge: 'd4_registry_execution',
                    status: 'CONTEXT_PLAN_VERIFIED', at: new Date(ops.now()).toISOString(),
                    d4Plan: plan };
                await ops.checkpoint(proof);
                // Original STOCKTAKE_UNCERTAIN stays recorded in the audit
                // classification and in the fresh context. Only the Graph
                // routing error clears so READ analysis can finish; the final
                // business status remains HELD_POLICY without a WRITE edge.
                return { d4Context: context, d4Plan: plan,
                    trace: modelSelectionProof ? [modelSelectionProof, proof] : [proof],
                    errorCode: undefined };
            } catch (error) {
                const code = errorCode(error);
                return { ...await emit(state, 'd4_planning', 'audit', 'PLANNING_HELD',
                    code === 'UNVERIFIED_OPERATION' ? 'D4_CONTEXT_UNVERIFIED' : code),
                    status: 'HELD_POLICY' as const, errorCode: 'D4_CONTEXT_UNVERIFIED' };
            }
        })
        .addNode('d4_registry_execution', async state => {
            const outcomes: Record<string, ToolOutcome> = {};
            const events: AgentGraphEvent[] = [];
            const plan = state.d4Plan;
            if (!plan || !ops.selectRead || !ops.d4Context || !state.d4Context) {
                return { ...await emit(state, 'd4_registry_execution', 'audit',
                    'PLAN_UNVERIFIED', 'TOOL_DENIED'), status: 'HELD_POLICY' as const,
                    errorCode: 'TOOL_DENIED' };
            }
            const actor = state.request.actorId;
            for (const step of plan.steps) {
                if (step.dependsOn.some(dependency => !outcomes[dependency]?.ok)) {
                    events.push(...(await emit(state, 'd4_registry_execution', 'd4_evaluation',
                        'PREREQUISITE_NOT_VERIFIED', 'TOOL_DENIED', undefined, step.tool)).trace);
                    break;
                }
                let selected: ToolSelectionDecision;
                try {
                    selected = await ops.selectRead(actor, step.tool, step.input, true);
                } catch {
                    events.push(...(await emit(state, 'd4_tool_selection', 'd4_evaluation',
                        'INVALID_ARGUMENTS', 'TOOL_DENIED', undefined, step.tool)).trace);
                    break;
                }
                if (selected.status !== 'SELECTED' || selected.selectedTool !== step.tool ||
                    !selected.readOnly || selected.requiresApproval || selected.executeCalled) {
                    events.push(...(await emit(state, 'd4_tool_selection', 'd4_evaluation',
                        'DENIED_BY_POLICY', 'TOOL_DENIED', undefined, step.tool)).trace);
                    break;
                }
                events.push(...(await emit(state, 'd4_tool_selection',
                    'd4_registry_execution', 'DYNAMIC_SELECTED', undefined,
                    undefined, step.tool)).trace);
                let outcome: ToolOutcome | undefined;
                // A registered READ is safe to retry once on known transient errors.
                for (let attempt = 1; attempt <= 2; attempt++) {
                    try {
                        outcome = await ops.dispatchRead(actor, step.tool, step.input, step.version);
                    } catch {
                        events.push(...(await emit(state, 'd4_registry_execution', 'd4_evaluation',
                            'REGISTRY_FAILURE', 'TOOL_NOT_AVAILABLE', undefined, step.tool)).trace);
                        break;
                    }
                    const proof: AgentGraphEvent = { node: 'd4_registry_execution',
                        edge: outcome.ok ? 'd4_registry_execution' : 'd4_evaluation',
                        status: outcome.ok ? 'REGISTERED_READ_VERIFIED' : 'REGISTERED_READ_FAILED',
                        at: new Date(ops.now()).toISOString(), tool: step.tool,
                        ...(outcome.ok ? {} : { code: outcome.error }),
                        d4Step: { stepId: step.id, tool: step.tool,
                            sanitizedInput: step.input,
                            result: outcome.ok ? 'VALIDATED' : outcome.error, attempt,
                            evidence: {
                                validated: outcome.evidence.validated,
                                status: outcome.evidence.status, mode: outcome.evidence.mode,
                                version: outcome.evidence.version, attempts: outcome.evidence.attempts,
                                durationMs: outcome.evidence.durationMs, durable: false
                            } } };
                    await ops.checkpoint(proof);
                    events.push(proof);
                    if (outcome.ok || !['TIMEOUT', 'BACKEND_FAILURE'].includes(outcome.error)) break;
                }
                if (!outcome) break;
                outcomes[step.id] = outcome;
                if (!outcome.ok || !outcome.evidence.validated ||
                    outcome.evidence.mode !== 'BACKEND') break;
            }
            // Independent read after all tool calls detects a new inventory
            // version, pending count, inbound PO, supplier change or request.
            // Volatile source-read timestamps are intentionally excluded:
            // a genuine second read must NOT appear stale merely because
            // 'now' or the observation's measuredAt changed.
            try {
                const sourceKey = (c: D4Context) => JSON.stringify({
                    ingredientId: c.perception.ingredientId,
                    rowVersion: c.perception.rowVersion, cursor: c.perception.movementCursor,
                    physical: c.perception.physicalQuantity, reserved: c.perception.reservedQuantity,
                    available: c.perception.availableQuantity, threshold: c.perception.thresholdQuantity,
                    lots: c.perception.lotBreakdown, stocktake: c.stocktake ?? null,
                    demand: c.demandDailyBase, lead: c.leadTimeDays,
                    safety: c.safetyStockBase, inbound: c.incomingBase,
                    reorderPolicy: c.reorderPolicy ?? null,
                    requests: c.activePurchaseRequests, orders: c.purchaseOrderIds ?? [],
                    supplierSnapshotDigest: c.supplierSnapshotDigest ?? null,
                    supplierAvailability: c.supplierAvailability
                        ? [c.supplierAvailability.supplierId, c.supplierAvailability.status,
                            c.supplierAvailability.source] : null,
                    shelfLife: c.supplierShelfLifeDays ?? null,
                    policy: c.provenance?.policyRef ?? null,
                    demandRecords: c.provenance?.demandRecords ?? null
                });
                if (ops.perceive) {
                    const latest = await ops.perceive(actor, state.inventory);
                    if (latest.length !== 1 ||
                        JSON.stringify(latest[0]!.lotBreakdown) !==
                            JSON.stringify(state.d4Context.perception.lotBreakdown) ||
                        latest[0]!.rowVersion !== state.d4Context.perception.rowVersion ||
                        latest[0]!.movementCursor !== state.d4Context.perception.movementCursor) {
                        throw new Error('STALE_CONTEXT');
                    }
                }
                const fresh = await ops.d4Context(actor, state.d4Context.perception);
                if (sourceKey(fresh) !== sourceKey(state.d4Context)) {
                    events.push(...(await emit(state, 'd4_replanning', 'audit',
                        'SOURCE_CHANGED_REPLAN_REQUIRED', 'STALE_CONTEXT')).trace);
                    return { trace: events, d4Observations: outcomes,
                        status: 'HELD_POLICY' as const, errorCode: 'STALE_CONTEXT' };
                }
            } catch {
                events.push(...(await emit(state, 'd4_replanning', 'audit',
                    'SOURCE_REVALIDATION_HELD', 'STALE_CONTEXT')).trace);
                return { trace: events, d4Observations: outcomes,
                    status: 'HELD_POLICY' as const, errorCode: 'STALE_CONTEXT' };
            }
            return { trace: events, d4Observations: outcomes };
        })
        .addNode('d4_evaluation', async state => {
            if (!state.d4Context || !state.d4Plan) {
                return { ...await emit(state, 'd4_evaluation', 'audit', 'MISSING_PLAN'),
                    status: 'HELD_POLICY' as const, errorCode: 'TOOL_DENIED' };
            }
            const failed = state.d4Plan.steps.filter(step => !state.d4Observations[step.id]?.ok);
            if (failed.length && state.d4ReplanCount < 1 && ops.registryCapabilities) {
                const blocked = new Set<string>(failed.map(step => step.tool));
                const alternate = ops.registryCapabilities().filter(cap => !blocked.has(cap.name));
                try {
                    const next = buildD4Plan(state.d4Context, alternate);
                    if (next.steps.length && next.steps.length <= 10 &&
                        JSON.stringify(next.steps) !== JSON.stringify(state.d4Plan.steps)) {
                        const proof: AgentGraphEvent = { node: 'd4_replanning', edge: 'd4_registry_execution',
                            status: 'REVISED_FOR_TOOL_FAILURE', at: new Date(ops.now()).toISOString(),
                            d4Plan: next };
                        await ops.checkpoint(proof);
                        return { trace: [proof], d4Plan: next, d4ReplanCount: state.d4ReplanCount + 1 };
                    }
                } catch { /* No verified alternative; produce REVIEW_REQUIRED instead. */ }
            }
            const recommendation = evaluateD4Plan(state.d4Context, state.d4Plan, state.d4Observations);
            const scenarioEvents: AgentGraphEvent[] = [];
            let thresholdScenario: D4ThresholdScenario | undefined;
            if (state.d4Context.stocktake) {
                const read = (name: string) => {
                    const step = state.d4Plan?.steps.find(s => s.tool === name);
                    const result = step && state.d4Observations[step.id];
                    return result?.ok && result.evidence.validated &&
                        result.evidence.mode === 'BACKEND' ? result.output : null;
                };
                try {
                    const source = state.d4Context.stocktake;
                    const validated = calculateHeldStocktakeScenario(
                        state.d4Context.perception, source,
                        read('getIngredientAvailability'), read('getIngredientBatches'));
                    thresholdScenario = {
                        targetBasis: 'INGREDIENT_MIN_THRESHOLD_NOT_FORECAST',
                        planBasis: 'D4_READ_PLAN_EXECUTED', permission: 'READ_ONLY_ANALYSIS',
                        stocktakeStatusToolVerified: Boolean(read('getStocktakeStatus')),
                        confirmed: { stockBase: validated.confirmed.stockBase,
                            shortageBase: validated.confirmed.shortageBase },
                        hypothetical: { stockBase: validated.hypothetical.stockBase,
                            shortageBase: validated.hypothetical.shortageBase },
                        targetBase: validated.targetBase,
                        sourceVersion: { rowVersion: source.rowVersion,
                            movementCursor: source.movementCursor,
                            stocktakeRevision: source.stocktakeRevision },
                        noPurchaseOrApprovalAuthority: true
                    };
                    const proof: AgentGraphEvent = {
                        node: 'd4_threshold_stocktake_scenario', edge: 'd4_recommendation',
                        status: 'READ_ONLY_THRESHOLD_SCENARIO_VERIFIED',
                        at: new Date(ops.now()).toISOString(), d4ThresholdScenario: thresholdScenario
                    };
                    await ops.checkpoint(proof);
                    scenarioEvents.push(proof);
                } catch {
                    scenarioEvents.push(...(await emit(state, 'd4_threshold_stocktake_scenario',
                        'd4_recommendation', 'THRESHOLD_SCENARIO_UNVERIFIED',
                        'SCENARIO_SOURCE_UNVERIFIED')).trace);
                }
            }
            const proof: AgentGraphEvent = { node: 'd4_evaluation', edge: 'd4_recommendation',
                status: 'EVALUATED_READ_ONLY', at: new Date(ops.now()).toISOString(),
                d4Recommendation: recommendation };
            await ops.checkpoint(proof);
            return { trace: [...scenarioEvents, proof],
                ...(thresholdScenario ? { d4ThresholdScenario: thresholdScenario } : {}),
                d4Recommendation: recommendation };
        })
        .addNode('d4_recommendation', async state => {
            if (state.request.purchaseFlow) {
                // The model may select READ tools, but only the independently
                // validated D4 recommendation can authorize a proposal draft.
                const r = state.d4Recommendation;
                if (!ops.createD4Proposal || !ops.proposalReview ||
                    !ops.executeD4ApprovedProposal || !state.d4Context || !r ||
                    r.status !== 'REVIEW_CANDIDATE' || r.reasons.length ||
                    r.confirmed?.purchasePacks == null ||
                    r.confirmed.purchasePacks < 1 || !r.supplier ||
                    r.authorizedToPurchase || r.authorizedToApprove ||
                    !r.readOnly || state.d4Plan?.status !== 'READY') {
                    return { ...await emit(state, 'd4_recommendation', 'audit',
                        'PROPOSAL_SOURCE_HELD', 'APPROVAL_REQUIRED'),
                        status: 'HELD_POLICY' as const, errorCode: 'APPROVAL_REQUIRED' };
                }
                return { ...await emit(state, 'd4_recommendation',
                    'd4_proposal_create', 'VERIFIED_DRAFT_CANDIDATE') };
            }
            // Default READ-only mode never prepares a Backend write.
            return { ...await emit(state, 'd4_recommendation', 'audit',
                'HUMAN_REVIEW_REQUIRED_NO_WRITE', 'APPROVAL_REQUIRED'),
                status: 'HELD_POLICY' as const, errorCode: 'APPROVAL_REQUIRED' };
        })
        .addNode('d4_proposal_create', async state => {
            try {
                if (!state.request.purchaseFlow || !ops.createD4Proposal ||
                    !state.d4Context || !state.d4Recommendation ||
                    state.d4Recommendation.status !== 'REVIEW_CANDIDATE') {
                    throw new Error('APPROVAL_REQUIRED');
                }
                await ops.authorize(state.request.actorId, 'agent.run');
                const proposed = await ops.createD4Proposal(state.request.actorId,
                    state.graphId, state.d4Context, state.d4Recommendation);
                const checked = z.strictObject({
                    proposalId: z.string().regex(/^[A-Za-z0-9][A-Za-z0-9:_-]{0,119}$/),
                    version: z.number().int().positive(),
                    contentHash: z.string().regex(/^[a-f0-9]{64}$/)
                }).safeParse(proposed);
                if (!checked.success || checked.data.proposalId !== 'graph-' + state.graphId) {
                    throw new Error('INVALID_PROPOSAL_REFERENCE');
                }
                const proof: AgentGraphEvent = { node: 'd4_proposal_create',
                    edge: 'audit', status: 'PROPOSAL_PERSISTED_AWAITING_ADMIN',
                    at: new Date(ops.now()).toISOString(), proposalReference: checked.data };
                await ops.checkpoint(proof);
                return { trace: [proof], proposalReference: checked.data,
                    status: 'AWAITING_APPROVAL' as const };
            } catch {
                return { ...await emit(state, 'd4_proposal_create', 'audit',
                    'PROPOSAL_CREATE_HELD', 'APPROVAL_REQUIRED'),
                    status: 'HELD_POLICY' as const, errorCode: 'APPROVAL_REQUIRED' };
            }
        })
        .addNode('d4_proposal_observe', async state => {
            const reference = state.proposalReference;
            try {
                if (!state.request.purchaseFlow || !reference || !ops.proposalReview ||
                    !ops.executeD4ApprovedProposal) throw new Error('BACKEND_PROPOSAL_UNVERIFIED');
                const observation = verifiedGraphObservation(
                    await ops.proposalReview(state.request.actorId, reference),
                    reference, ops.now());
                const status = observation.backendStatus;
                const authorized = status === 'EXECUTED' || status === 'APPROVED_AWAITING_BACKEND';
                const proof: AgentGraphEvent = { node: 'd4_proposal_observe',
                    edge: authorized ? 'd4_proposal_execute' : 'audit',
                    status: 'BACKEND_DECISION_OBSERVED', code: status,
                    at: new Date(ops.now()).toISOString(), proposalReference: reference,
                    approvalBoundary: observation };
                await ops.checkpoint(proof);
                return { trace: [proof], approvalBoundary: observation,
                    status: authorized ? 'RUNNING' as const :
                        status === 'PENDING_APPROVAL' ? 'AWAITING_APPROVAL' as const :
                            'HELD_POLICY' as const };
            } catch {
                return { ...await emit(state, 'd4_proposal_observe', 'audit',
                    'BACKEND_DECISION_UNVERIFIED', 'BACKEND_PROPOSAL_UNVERIFIED'),
                    status: 'HELD_POLICY' as const, errorCode: 'BACKEND_PROPOSAL_UNVERIFIED' };
            }
        })
        .addNode('d4_proposal_execute', async state => {
            try {
                const reference = state.proposalReference;
                if (!state.request.purchaseFlow || !reference || !ops.executeD4ApprovedProposal ||
                    !ops.proposalReview || !state.approvalBoundary ||
                    !['APPROVED_AWAITING_BACKEND','EXECUTED'].includes(state.approvalBoundary.backendStatus)) {
                    throw new Error('APPROVAL_REQUIRED');
                }
                const persisted = await ops.executeD4ApprovedProposal(state.request.actorId,
                    state.graphId, reference);
                if (!/^[A-Za-z0-9][A-Za-z0-9:_-]{0,119}$/.test(persisted.purchaseRequestId)) {
                    throw new Error('BACKEND_PROPOSAL_UNVERIFIED');
                }
                const observed = verifiedGraphObservation(
                    await ops.proposalReview(state.request.actorId, reference),
                    reference, ops.now());
                if (observed.backendStatus !== 'EXECUTED' || !observed.purchaseRequestPresent) {
                    throw new Error('BACKEND_PROPOSAL_UNVERIFIED');
                }
                const proof: AgentGraphEvent = { node: 'd4_proposal_execute',
                    edge: 'audit', status: 'PR_VERIFIED', at: new Date(ops.now()).toISOString(),
                    proposalReference: reference, purchaseRequestId: persisted.purchaseRequestId,
                    approvalBoundary: observed };
                await ops.checkpoint(proof);
                return { trace: [proof], approvalBoundary: observed,
                    purchaseRequestId: persisted.purchaseRequestId,
                    status: 'SUCCEEDED' as const };
            } catch {
                return { ...await emit(state, 'd4_proposal_execute', 'audit',
                    'PR_EXECUTION_HELD', 'BACKEND_PROPOSAL_UNVERIFIED'),
                    status: 'HELD_POLICY' as const,
                    errorCode: 'BACKEND_PROPOSAL_UNVERIFIED' };
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
            const observed: AgentGraphObservation[] = [];
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
                        }, tool.name === 'getIngredientAvailability' && context
                            ? { expectedRowVersion: context.rowVersion } : undefined);
                        registryEvents.push(...act.events);
                        if (act.observation) {
                            observed.push(act.observation);
                            if (act.observation.runId !== state.graphId ||
                                act.observation.stepId !== stepId ||
                                act.observation.actorId !== state.request.actorId ||
                                act.observation.toolName !== tool.name ||
                                act.observation.attempt !== act.result.attempts) {
                                const failure = await emit(state, 'observation_validation', 'audit',
                                    'OBS_CORRELATION_HELD', 'CORRELATION_MISMATCH');
                                return { ...failure, trace: [...registryEvents, ...failure.trace],
                                    observations: observed, toolResults: results,
                                    status: 'HELD_POLICY' as const, errorCode: 'CORRELATION_MISMATCH' };
                            }
                        }
                        if (act.result.status !== 'SUCCEEDED' || !act.result.outcome) {
                            const failure = await emit(state, 'allowlisted_tools', 'audit',
                                'ACT_HELD', act.result.code ?? 'TOOL_NOT_AVAILABLE');
                            return { ...failure, trace: [...registryEvents, ...failure.trace],
                                observations: observed, toolResults: results, status: 'HELD_POLICY' as const,
                                errorCode: act.result.code ?? 'TOOL_NOT_AVAILABLE' };
                        }
                        if (!act.observation || act.observation.status !== 'SUCCESS' ||
                            !act.observation.verifiedForBusiness || act.observation.quality !== 'VERIFIED_SCHEMA') {
                            const failure = await emit(state, 'observation_validation', 'audit',
                                'OBS_POLICY_HELD', act.observation?.code ?? 'OBSERVATION_UNVERIFIED');
                            return { ...failure, trace: [...registryEvents, ...failure.trace],
                                observations: observed, toolResults: results,
                                status: 'HELD_POLICY' as const,
                                errorCode: act.observation?.code ?? 'OBSERVATION_UNVERIFIED' };
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
                ops.executeActRead ? 'observation_validation' :
                    state.request.jointReview ? 'backend_proposal_review' : 'human_approval',
                'REGISTERED_READS_VERIFIED');
            return { ...transition, trace: [...registryEvents, ...transition.trace],
                classifications: [...state.classifications, ...observations],
                observations: observed, toolResults: results };
        })
        .addNode('observation_validation', async state => {
            const requested = state.request.readTools ?? [];
            const accepted = state.observations.length === requested.length &&
                state.observations.every((proof, index) =>
                    proof.runId === state.graphId && proof.actorId === state.request.actorId &&
                    proof.stepId === `act-${index + 1}` && proof.toolName === requested[index]?.name &&
                    proof.status === 'SUCCESS' && proof.quality === 'VERIFIED_SCHEMA' &&
                    proof.verifiedForBusiness && proof.attempt >= 1 && proof.attempt <= 2);
            if (!accepted) return { ...await emit(state, 'observation_validation', 'audit',
                'OBS_POLICY_HELD', 'OBSERVATION_UNVERIFIED'),
                status: 'HELD_POLICY' as const, errorCode: 'OBSERVATION_UNVERIFIED' };
            return { ...await emit(state, 'observation_validation',
                ops.sessionDAnomaly ? 'anomaly_classification' :
                    state.request.jointReview ? 'backend_proposal_review' : 'human_approval',
                'OBSERVATIONS_ACCEPTED') };
        })
        .addNode('anomaly_classification', async state => {
            const summaries: AgentGraphAnomaly[] = [];
            if (!ops.sessionDAnomaly || !ops.sessionDReplanning || !state.observations.length) {
                return { ...await emit(state, 'anomaly_classification', 'audit',
                    'ANM_POLICY_HELD', 'ANM_SOURCE_UNVERIFIED'),
                    status: 'HELD_POLICY' as const, errorCode: 'ANM_SOURCE_UNVERIFIED' };
            }
            for (const obs of state.observations) {
                const scope: HandoffScope = {
                    graphId: state.graphId, runId: obs.runId, actorId: state.request.actorId,
                    invocationId: obs.stepId, toolName: obs.toolName
                };
                let handoff: HandoffResult;
                try {
                    handoff = await ops.sessionDAnomaly(scope);
                } catch {
                    handoff = { version: 'OBS_ANM_HANDOFF_V1', status: 'HOLD',
                        reason: 'UNVERIFIED_SOURCE', missingFields: [], graphId: scope.graphId,
                        runId: scope.runId, observationId: null, traceRef: null };
                }
                const analysis = handoff.analysis;
                if (handoff.status !== 'READY' || !analysis || !analysis.sourceVerified ||
                    analysis.evidenceLevel !== 'SOURCE_ATTESTED' ||
                    analysis.runId !== scope.runId || !handoff.observationId ||
                    analysis.observationId !== handoff.observationId) {
                    const event = await emit(state, 'anomaly_classification', 'audit',
                        'ANM_SOURCE_HELD', handoff.reason);
                    return { ...event, anomalies: summaries, status: 'HELD_POLICY' as const,
                        errorCode: 'ANM_SOURCE_UNVERIFIED' };
                }
                summaries.push({ invocationId: obs.stepId, observationId: analysis.observationId,
                    status: analysis.status, sourceVerified: true,
                    policyBlocked: analysis.status !== 'NORMAL' || analysis.findings.some(f =>
                        f.recommendedRoute !== 'CONTINUE' || f.severity !== 'INFO'),
                    findingCodes: [...new Set(analysis.findings.map(f => f.code))].sort() });
                // Verified ANM HOLD/REVIEW still reaches REP for an auditable
                // read-only decision. Only a later policy gate may CONTINUE,
                // and it must retain ANM severity precedence.
            }
            const noPlan = Boolean(ops.sessionDNoPlanProof);
            if (noPlan && summaries.some(a => !a.sourceVerified || a.policyBlocked)) {
                return { ...await emit(state, 'anomaly_classification', 'audit',
                    'ANM_POLICY_HELD', 'ANM_REVIEW_OR_HOLD'),
                    anomalies: summaries, status: 'HELD_POLICY' as const,
                    errorCode: 'ANM_REVIEW_OR_HOLD' };
            }
            // Absent a persisted validated PLN plan, REP is not applicable.
            // Verify this fact through a fresh, authenticated durable-read
            // proof; no fallback from a thrown REP callback can grant success.
            if (noPlan) {
                const obs = state.observations[0];
                if (!obs || !state.execution ||
                    state.observations.length !== summaries.length ||
                    state.execution.budget !== 2 || state.execution.plan.length !== 2 ||
                    state.execution.plan[0]?.tool !== 'inventory.read' ||
                    state.execution.plan[1]?.tool !== 'inventory.recommend') {
                    return { ...await emit(state, 'anomaly_classification', 'audit',
                        'REP_PROOF_HELD', 'REP_SOURCE_UNVERIFIED'),
                        anomalies: summaries, status: 'HELD_POLICY' as const,
                        errorCode: 'REP_SOURCE_UNVERIFIED' };
                }
                let confirmed: Awaited<ReturnType<NonNullable<Operations['sessionDNoPlanProof']>>> | undefined;
                try {
                    confirmed = await ops.sessionDNoPlanProof!({
                        graphId: state.graphId, runId: obs.runId, actorId: state.request.actorId,
                        invocationId: obs.stepId, toolName: obs.toolName
                    });
                } catch { /* No trusted plan proof => HOLD. */ }
                if (!confirmed || confirmed.status !== 'REP_NOT_APPLICABLE' ||
                    confirmed.reason !== 'FIXED_READ_IDENTITY_NO_VERIFIED_PLN' ||
                    confirmed.graphId !== state.graphId ||
                    confirmed.actorId !== state.request.actorId ||
                    confirmed.executionId !== state.execution.id ||
                    confirmed.sourceAttested !== true) {
                    return { ...await emit(state, 'anomaly_classification', 'audit',
                        'REP_PROOF_HELD', 'REP_SOURCE_UNVERIFIED'),
                        anomalies: summaries, status: 'HELD_POLICY' as const,
                        errorCode: 'REP_SOURCE_UNVERIFIED' };
                }
            }
            return { ...await emit(state, 'anomaly_classification',
                noPlan ? 'policy_revalidation' : 'replanning_decision',
                noPlan ? 'REP_NOT_APPLICABLE_NO_VERIFIED_PLN' : 'ANM_VERIFIED'),
                anomalies: summaries, noVerifiedPlnProof: noPlan };
        })
        .addNode('replanning_decision', async state => {
            const summaries: AgentGraphReplan[] = [];
            if (!ops.sessionDReplanning || !state.observations.length ||
                state.anomalies.length !== state.observations.length) {
                return { ...await emit(state, 'replanning_decision', 'audit',
                    'REP_SOURCE_HELD', 'REP_SOURCE_UNVERIFIED'),
                    status: 'HELD_POLICY' as const, errorCode: 'REP_SOURCE_UNVERIFIED' };
            }
            for (const obs of state.observations) {
                const scope: HandoffScope = {
                    graphId: state.graphId, runId: obs.runId, actorId: state.request.actorId,
                    invocationId: obs.stepId, toolName: obs.toolName
                };
                let handoff: DurableAnmRepHandoff;
                try { handoff = await ops.sessionDReplanning(scope); }
                catch { handoff = { status: 'HOLD', reason: 'PERSISTED_EVIDENCE_UNAVAILABLE' }; }
                const decision = handoff.decision;
                if (handoff.status !== 'READY' || !decision ||
                    decision.runId !== scope.runId || decision.graphId !== scope.graphId ||
                    decision.actorId !== scope.actorId || !decision.readOnly ||
                    decision.authorizedToExecute || decision.authorizedToPurchase ||
                    decision.authorizedToApprove || !decision.requiresPolicyValidation) {
                    return { ...await emit(state, 'replanning_decision', 'audit',
                        'REP_SOURCE_HELD', handoff.reason),
                        replanning: summaries, status: 'HELD_POLICY' as const,
                        errorCode: 'REP_SOURCE_UNVERIFIED' };
                }
                summaries.push({ invocationId: obs.stepId, status: decision.status,
                    sourceAttested: decision.sourceAttested, reasons: decision.reasons,
                    priorPlanId: decision.priorPlanId, priorPlanVersion: decision.priorPlanVersion });
                // Not even a verified REPLAN_PROPOSED is an execution authorization.
                // KEEP_PLAN requires an independently attested source and policy re-check.
                if (decision.status !== 'KEEP_PLAN' || !decision.sourceAttested ||
                    state.anomalies.find(a => a.invocationId === obs.stepId)?.policyBlocked !== false) {
                    return { ...await emit(state, 'replanning_decision', 'audit',
                        'REP_POLICY_HELD', 'REP_REVALIDATION_REQUIRED'),
                        replanning: summaries, status: 'HELD_POLICY' as const,
                        errorCode: 'REP_REVALIDATION_REQUIRED' };
                }
            }
            return { ...await emit(state, 'replanning_decision',
                'policy_revalidation', 'REPLANNING_VERIFIED'), replanning: summaries };
        })
        .addNode('policy_revalidation', async state => {
            try {
                const noPlan = ops.sessionDNoPlanProof !== undefined &&
                    state.noVerifiedPlnProof === true &&
                    state.replanning.length === 0 &&
                    state.execution?.budget === 2 &&
                    state.execution.plan.length === 2 &&
                    state.execution.plan[0]?.tool === 'inventory.read' &&
                    state.execution.plan[1]?.tool === 'inventory.recommend' &&
                    state.observations.length > 0 &&
                    state.anomalies.every(a => a.sourceVerified && a.status === 'NORMAL' &&
                        !a.policyBlocked);
                if (!state.execution || state.anomalies.length !== state.observations.length ||
                    (!noPlan && state.replanning.length !== state.observations.length)) {
                    throw new Error('INVALID_GRAPH_EXECUTION');
                }
                await ops.authorize(state.request.actorId, 'agent.run');
                ops.validate(state.execution.plan, state.request.budget);
                // Replay / drift is never a license to create purchasing effects.
                const next = state.request.jointReview ? 'backend_proposal_review' : 'human_approval';
                return { ...await emit(state, 'policy_revalidation', next,
                    'EXISTING_POLICY_REVALIDATED') };
            } catch {
                return { ...await emit(state, 'policy_revalidation', 'audit',
                    'POLICY_REVALIDATION_HELD', 'REP_REVALIDATION_REQUIRED'),
                    status: 'HELD_POLICY' as const, errorCode: 'REP_REVALIDATION_REQUIRED' };
            }
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
            s.request.purchaseFlow && s.request.mode === 'RESUME' && s.proposalReference
                ? 'd4_proposal_observe' :
            s.request.proposalReview && !s.request.jointReview ? 'backend_proposal_review' : 'data_collector')
        .addEdge('backend_proposal_review', 'audit')
        .addConditionalEdges('data_collector', s => s.errorCode ? 'audit' : 'perception_collection')
        .addConditionalEdges('perception_collection', s => s.errorCode ? 'audit' : 'inventory_analysis')
        .addConditionalEdges('inventory_analysis', s =>
            s.request.d4Intelligence && ops.d4Context && ops.registryCapabilities
                ? s.errorCode && s.errorCode !== 'STOCKTAKE_UNCERTAIN'
                    ? 'audit'
                    : s.errorCode === 'STOCKTAKE_UNCERTAIN' ? 'd4_planning'
                    : ops.risk ? 'backend_demand_risk' : 'd4_planning'
                :
            s.errorCode === 'STOCKTAKE_UNCERTAIN' && ops.stocktakeScenarioSource &&
            s.perception.length === 1 && s.request.readTools?.length === 2
                ? 'stocktake_scenario_analysis' : s.errorCode ? 'audit' :
            ops.risk ? 'backend_demand_risk' : 'conditional_route')
        .addEdge('stocktake_scenario_analysis', 'audit')
        .addConditionalEdges('backend_demand_risk', s =>
            s.request.d4Intelligence && ops.d4Context && ops.registryCapabilities
                ? 'd4_planning' : s.errorCode ? 'audit' : 'conditional_route')
        .addConditionalEdges('d4_planning', s => s.errorCode && s.errorCode !== 'STOCKTAKE_UNCERTAIN'
            ? 'audit' : 'd4_registry_execution')
        .addConditionalEdges('d4_registry_execution', s => s.errorCode ? 'audit' : 'd4_evaluation')
        .addConditionalEdges('d4_evaluation', s => s.d4Recommendation
            ? 'd4_recommendation' : s.d4ReplanCount > 0 ? 'd4_registry_execution' : 'audit')
        .addConditionalEdges('d4_recommendation', s => s.request.purchaseFlow &&
            s.d4Recommendation?.status === 'REVIEW_CANDIDATE' && !s.errorCode
                ? 'd4_proposal_create' : 'audit')
        .addEdge('d4_proposal_create', 'audit')
        .addConditionalEdges('d4_proposal_observe', s => !s.errorCode &&
            ['APPROVED_AWAITING_BACKEND', 'EXECUTED'].includes(s.approvalBoundary?.backendStatus ?? '')
                ? 'd4_proposal_execute' : 'audit')
        .addEdge('d4_proposal_execute', 'audit')
        .addConditionalEdges('conditional_route', s => s.request.mode === 'RESUME' ?
            'resume_checkpoint' : s.request.jointReview ? 'read_only_identity' : 'planner')
        .addConditionalEdges('read_only_identity', s => s.errorCode ? 'audit' : 'policy_validation')
        .addConditionalEdges('planner', s => s.errorCode ? 'audit' : 'policy_validation')
        .addConditionalEdges('resume_checkpoint', s => s.errorCode ? 'audit' : 'policy_validation')
        .addConditionalEdges('policy_validation', s => s.errorCode ? 'audit' : 'allowlisted_tools')
        .addConditionalEdges('allowlisted_tools', s => s.errorCode ? 'audit' :
            ops.executeActRead ? 'observation_validation' :
                s.request.jointReview ? 'backend_proposal_review' : 'human_approval')
        .addConditionalEdges('observation_validation', s => s.errorCode ? 'audit' :
            ops.sessionDAnomaly ? 'anomaly_classification' :
                s.request.jointReview ? 'backend_proposal_review' : 'human_approval')
        .addConditionalEdges('anomaly_classification', s => s.errorCode ? 'audit' :
            s.noVerifiedPlnProof ?
                'policy_revalidation' : 'replanning_decision')
        .addConditionalEdges('replanning_decision', s => s.errorCode ? 'audit' : 'policy_revalidation')
        .addConditionalEdges('policy_revalidation', s => s.errorCode ? 'audit' :
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
        ...(state.observations.length ? { observations: state.observations } : {}),
        ...(state.anomalies.length ? { anomalies: state.anomalies } : {}),
        ...(state.replanning.length ? { replanning: state.replanning } : {}),
        ...(state.perception.length ? { perception: state.perception } : {}),
        ...(state.execution ? { execution: state.execution } : {}),
        ...(state.approvalBoundary ? { approvalBoundary: state.approvalBoundary } : {}),
        ...(state.scenarioAnalysis ? { scenarioAnalysis: state.scenarioAnalysis } : {}),
        ...(state.d4Plan ? { d4Plan: state.d4Plan } : {}),
        ...(state.d4Recommendation ? { d4Recommendation: state.d4Recommendation } : {}),
        ...(state.proposalReference ? { proposalReference: state.proposalReference } : {}),
        ...(state.purchaseRequestId ? { purchaseRequestId: state.purchaseRequestId } : {}),
        ...(state.d4ThresholdScenario ? { d4ThresholdScenario: state.d4ThresholdScenario } : {}) };
}
