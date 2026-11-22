import '../config/env';
import { z } from 'zod';
import { createHash, randomUUID } from 'node:crypto';
import { isDeepStrictEqual } from 'node:util';
import type { UnifiedToolRegistry } from './tool-registry';
import { selectToolForTask } from '../services/tool-selection/tool-selection.service';
import { TOOL_SELECTION_VERSION, type ToolSelectionInput } from '../services/tool-selection/tool-selection.schema';
import { executeActReadStep } from '../services/execution/act-read-step';
import { executeAndObserveActRead } from '../services/observation/act-observation-handoff';
import { digestObservation } from '../services/anomaly/observation-handoff';
import { handoffDurableObservationToAnomaly,
    handoffDurableAnomalyToReplanning,
    type DurableObsAnmPorts, type DurableAnmRepPorts,
    type DurableAnomalyRecord, type DurableObservationRecord
} from './integration/session-d-anm-rep-handoff';
import type { HandoffScope } from '../services/anomaly/observation-handoff';
import type { ReplanLedger } from '../services/replanning/replanning.service';
import type { ObservationLedger } from '../services/observation/observation';
export * from './tool-contracts';
export * from './tool-registry';
export * from './tool-policies';
export { SAFETY_BUFFER_DAYS } from '../utils/inventory.utils';
import { replenishmentPlan, validateReplenishmentPlan } from './replenishment';
import type { InventoryRow, PurchaseProposal, ReplenishmentInput, ReplenishmentOutputs, ReplenishmentPlan, SupplierQuote } from './replenishment';
export type { PurchaseProposal, ReplenishmentInput, ReplenishmentOutputs, ReplenishmentPlan } from './replenishment';


import {
    TOOL_CONTRACTS,
    ToolError,
} from './tool-contracts';

import { validateDynamicPlan, type DynamicToolName, type DynamicToolPlan } from './dynamic-plan';
export { validateDynamicPlan } from './dynamic-plan';
export type { DynamicToolName, DynamicPlanStep, DynamicToolPlan } from './dynamic-plan';

import type { BusinessPort, Plan, LegacyStep, ToolName, PurchaseCommand, PurchaseResult, MemoryEvidence, PlanningContext, LLMProvider, MemoryAttribution, Execution, Approval, Memory, AgentState, AgentRepository, AgentApprovalRepository, MemoryLearning } from './workflow-contracts';
export type { BusinessPort, Plan, ToolName, MemoryEvidence, PlanningContext, LLMProvider, Execution, Approval, Memory, AgentState, AgentExecutionRepository, AgentApprovalRepository, MemoryLearning, AgentRepository } from './workflow-contracts';
import { MockLLMProvider, mockDecision } from './testing/mock-llm-provider';
export { MockLLMProvider } from './testing/mock-llm-provider';
import { MockAgentRepository } from '../repositories/mock-agent.repository';
export { MockAgentRepository } from '../repositories/mock-agent.repository';
import { compileAgentLangGraph, graphResult, type AgentGraphInput, type AgentGraphResult } from './agent-langgraph';
export type { AgentGraphInput, AgentGraphResult, AgentGraphEvent, AgentGraphStatus } from './agent-langgraph';

export const TOOL_REGISTRY = Object.freeze({
    'inventory.read': Object.freeze({ cost: 1, approval: false, permission: 'inventory.read', attempts: 2 }),
    'inventory.recommend': Object.freeze({ cost: 1, approval: false, permission: 'inventory.read', attempts: 1 }),
    'inventory.analyze': Object.freeze({ cost: 1, approval: false, permission: 'inventory.read', attempts: 2 }),
    'purchase.recommend': Object.freeze({ cost: 1, approval: false, permission: 'purchase.write', attempts: 2 }),
    'purchase.prepare': Object.freeze({ cost: 1, approval: false, permission: 'purchase.write', attempts: 2 }),
    'purchase.requestApproval': Object.freeze({ cost: 1, approval: false, permission: 'purchase.write', attempts: 1 }),
    'purchase.create': Object.freeze({ cost: 2, approval: true, permission: 'purchase.write', attempts: 1 }),
});
const allowed = Object.keys(TOOL_REGISTRY) as ToolName[];
function permit(s: AgentState, actor: string, permission: string) { if (!s.permissions[actor]?.includes(permission)) throw new Error('FORBIDDEN'); }
function canonical(value: unknown): string {
    if (value === null || typeof value === 'string' || typeof value === 'boolean') return JSON.stringify(value);
    if (typeof value === 'number' && Number.isSafeInteger(value)) return JSON.stringify(value);
    if (Array.isArray(value)) return '[' + value.map(canonical).join(',') + ']';
    if (typeof value === 'object' && value && Object.getPrototypeOf(value) === Object.prototype) return '{' + Object.keys(value).sort().map(key => JSON.stringify(key) + ':' + canonical((value as Record<string, unknown>)[key])).join(',') + '}';
    throw new Error('INVALID_CANONICAL_VALUE');
}
function digest(plan: Plan, versions: Record<string, string>, revision = '1', proposal?: PurchaseProposal): string {
    return createHash('sha256').update(canonical(proposal ? { plan, versions, revision, proposal } : { plan, versions, revision })).digest('hex');
}
const terms = (text: string) => new Set(text.toLowerCase().match(/[\p{L}\p{N}_-]+/gu) ?? []);
function relevance(text: string, query: string): number {
    const a = terms(text), b = terms(query); if (!b.size) return 0;
    return [...b].filter(term => a.has(term)).length / b.size;
}
function activeMemory(m: Memory, now: number): boolean {
    return !m.revoked && !m.forgotten && (m.expiresAt === undefined || Date.parse(m.expiresAt) > now);
}
const record = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === 'object' && !Array.isArray(value);
const identifier = (value: unknown): value is string => typeof value === 'string' && value.length > 0 && value.trim() === value;
const version = (value: unknown): boolean => typeof value === 'string' && /^[1-9]\d*$/.test(value);

function decimal(value: unknown, scale = 3): bigint | undefined {
    if (typeof value !== 'string' || !/^(0|[1-9]\d{0,17})(\.\d{1,4})?$/.test(value)) return;
    const [whole, fraction = ''] = value.split('.');
    if (fraction.length > scale) return;
    return BigInt(whole! + fraction.padEnd(scale, '0'));
}

function verifiedResult(step: LegacyStep, result: unknown): boolean {
    if (step.tool === 'purchase.create') {
        const proposal = step.input!;
        if (!record(result) || !identifier(result.id) || result.supplierId !== proposal.supplierId ||
            result.status !== 'OPEN' || result.version !== '1' || !Array.isArray(result.lines) ||
            result.lines.length !== proposal.lines.length) return false;
        const lines: unknown[] = result.lines;
        return proposal.lines.every((expected, index) => {
            const line = lines[index];
            if (!record(line) || line.ingredientId !== expected.ingredientId || line.quantity !== expected.quantity ||
                line.unitCost !== expected.unitCost || decimal(line.received) !== 0n ||
                !identifier(line.purchaseUnit) || !version(line.quoteVersion)) return false;
            const packs = decimal(line.packs, 0);
            const conversion = decimal(line.conversionQuantity);
            return packs !== undefined && packs > 0n && conversion !== undefined && conversion > 0n &&
                packs * conversion === decimal(line.quantity);
        });
    }
    if (!Array.isArray(result)) return false;
    const seen = new Set<string>();
    for (const row of result) {
        if (!record(row) || !identifier(row.ingredientId)) return false;
        const key = step.tool === 'inventory.read' ? row.id : row.ingredientId;
        if (!identifier(key) || seen.has(key)) return false;
        seen.add(key);
        if (step.tool === 'inventory.read') {
            const remaining = decimal(row.remaining), reserved = decimal(row.reserved);
            if (!version(row.version) || remaining === undefined || reserved === undefined || reserved > remaining) return false;
        } else {
            const available = decimal(row.available), min = decimal(row.minStock), target = decimal(row.targetStock);
            if (!version(row.sourceVersion) || !['g', 'ml', 'piece'].some(unit => unit === row.baseUnit) ||
                available === undefined || min === undefined || target === undefined || target < min ||
                decimal(row.recommendedBaseQuantity) !== (available < min ? target - available : 0n)) return false;
        }
    }
    return true;
}

/** Only independently verified tool outcomes can supply typed hints. Raw memory text never enters LLM context. */
function verifiedSources(s: AgentState, m: Memory, query?: string) {
    const memoryTerms = terms(m.text);
    const queryTerms = query === undefined ? undefined : terms(query);
    return Object.values(s.executions).filter(e => e.actorId === m.ownerId && e.status === 'SUCCEEDED' && e.outcome?.verified &&
        !e.planning?.evidence.some(hint => {
            const attribution = e.planning?.attribution?.find(a => a.memoryId === hint.memoryId);
            // Old snapshots lack presentation evidence. Never use a hinted outcome to reinforce that hint.
            return attribution?.presented === undefined || attribution.status !== 'UNUSED' ||
                hint.memoryId === m.id || m.sourceIds?.includes(hint.memoryId);
        }))
        .flatMap(e => e.plan.flatMap((planned, index) => {
            // Only independently checkable inventory and purchase outputs enter memory.
            let step: LegacyStep;
            if ('id' in planned) {
                if (planned.tool === 'inventory.read') step = { tool: planned.tool, input: null };
                else if (planned.tool === 'purchase.create') {
                    const prepared = preparedProposal(e);
                    if (!prepared) return [];
                    step = { tool: planned.tool, input: prepared.proposal };
                }
                else return [];
            } else step = planned;
            const call = Object.values(s.toolCalls).find(c => c.executionId === e.id && c.index === index && c.tool === step.tool && c.status === 'VERIFIED');
            if (!call || !isDeepStrictEqual(call.input, step.input) || !isDeepStrictEqual(call.result, e.result[index]) ||
                !verifiedResult(step, call.result) || (step.tool === 'purchase.create' && !call.receipt)) return [];
            const evaluations = s.evaluations.filter(v => v.executionId === e.id && v.toolCallId === call.id && v.passed && v.code === 'RESULT_VERIFIED' && e.outcome?.evaluationIds.includes(v.id));
            const rows = Array.isArray(call?.result) ? call.result : [];
            const subjects = new Set([...step.tool.split('.'), ...(step.input?.lines.map(l => l.ingredientId) ?? []), ...rows.flatMap(row => row && typeof row.ingredientId === 'string' ? [row.ingredientId.toLowerCase()] : [])]);
            const matchingSubjects = [...memoryTerms].filter(t => subjects.has(t) && (!queryTerms || queryTerms.has(t))).length;
            if (!evaluations.length || !matchingSubjects) return [];
            const timestamp = Date.parse(call.verifiedAt ?? '');
            return [{
                executionId: e.id, evaluationIds: evaluations.map(v => v.id), tool: step.tool,
                matchingSubjects, recency: Number.isFinite(timestamp) ? timestamp : Number.NEGATIVE_INFINITY,
                currentProof: Number(call.authorization !== undefined),
            }];
        }));
}
function planningContext(s: AgentState, ownerId: string, query: string, now: number): PlanningContext {
    const context: PlanningContext = { trust: 'untrusted-evidence-only', evidence: [], maxTokens: 2048 };
    if (!s.permissions[ownerId]?.includes('memory')) return context;
    const candidates = Object.values(s.memories).filter(m => m.ownerId === ownerId && activeMemory(m, now) && m.learned && (m.confidence ?? 0) >= 0.8)
        .map(m => ({ m, score: relevance(m.text, query) })).filter(c => c.score >= 0.5)
        .flatMap(({ m, score }) => {
            const verified = verifiedSources(s, m, query)
                .filter(p => m.provenance?.some(source => source.executionId === p.executionId && source.tool === p.tool &&
                    p.evaluationIds.every(id => source.evaluationIds.includes(id))))
                .sort((a, b) => b.matchingSubjects - a.matchingSubjects || b.currentProof - a.currentProof || b.recency - a.recency);
            const best = verified[0];
            return best ? [{ m, score, best, verified }] : [];
        })
        .sort((a, b) => b.score - a.score || b.best.matchingSubjects - a.best.matchingSubjects || b.best.currentProof - a.best.currentProof ||
            b.best.recency - a.best.recency || a.m.id.localeCompare(b.m.id));
    for (const { m, score, best, verified } of candidates) {
        const matchingTool = verified.filter(p => p.tool === best.tool);
        const executionIds = [...new Set(matchingTool.map(p => p.executionId))].slice(0, 4);
        const evaluationIds = [...new Set(matchingTool.filter(p => executionIds.includes(p.executionId)).flatMap(p => p.evaluationIds))].slice(0, 8);
        const evidence: MemoryEvidence = { memoryId: m.id, executionIds, evaluationIds, tool: best.tool, relevance: score, confidence: m.confidence! };
        const next = { ...context, evidence: [...context.evidence, evidence] };
        // UTF-8 bytes upper-bound token count; bounded independently of provider tokenizer.
        if (Buffer.byteLength(JSON.stringify(next), 'utf8') > context.maxTokens || context.evidence.length === 4) break;
        context.evidence.push(evidence);
    }
    return context;
}
function isReplenishment(plan: Plan): plan is ReplenishmentPlan {
    return plan.some(step => step && ('id' in step || 'dependsOn' in step));
}
function preparedProposal(e: Execution): ReplenishmentOutputs['proposal'] | undefined {
    return e.result[3] as ReplenishmentOutputs['proposal'] | undefined;
}
function stepError(error: unknown): string | undefined {
    if (error instanceof Error && typeof (error as { status?: number }).status === 'number') {
        const { status, code } = error as Error & { status: number; code?: string };
        if (status >= 400 && status < 500 && code && /^[A-Z_]+$/.test(code)) return code;
    }
    if (error instanceof Error && ['FORBIDDEN', 'VERIFICATION_FAILED', 'NO_PURCHASE_RECOMMENDATIONS',
        'QUOTE_UNAVAILABLE', 'STALE_PROPOSAL', 'TOOL_UNAVAILABLE', 'INVALID_PURCHASE_QUANTITY'].includes(error.message)) return error.message;
}
function validatePlan(plan: Plan, allowlist: readonly ToolName[]): void {
    if (!Array.isArray(plan) || !plan.length || plan.length > 20) throw new Error('INVALID_PLAN');
    for (const step of plan) {
        if (!record(step) || !allowed.includes(step.tool) || !allowlist.includes(step.tool)) throw new Error('TOOL_DENIED');
    }
    if (isReplenishment(plan)) return validateReplenishmentPlan(plan);
    for (const step of plan) {
        if (step.tool !== 'inventory.read' && step.tool !== 'inventory.recommend' && step.tool !== 'purchase.create') throw new Error('INVALID_PLAN');
        if (step.tool === 'purchase.create') {
            if (!step.input || typeof step.input.supplierId !== 'string' || !Array.isArray(step.input.lines) || !step.input.lines.length || step.input.lines.some(l => typeof l.ingredientId !== 'string' || typeof l.quantity !== 'string' || typeof l.unitCost !== 'string')) throw new Error('INVALID_PROPOSAL');
        } else if (step.input !== null) throw new Error('INVALID_TOOL_INPUT');
    }
}
/** Graph-only strict policy: reject extra actions and implausible numeric payloads
 * BEFORE persisting an LLM plan, never silently cap a supplier purchase. This is
 * a technical safety bound, not an approved merchant purchasing policy. */
function validateGraphPlan(plan: Plan, allowlist: readonly ToolName[], budget: number): void {
    validatePlan(plan, allowlist);
    if (plan.reduce((sum, step) => sum + TOOL_REGISTRY[step.tool].cost, 0) > budget) {
        throw new Error('BUDGET_EXCEEDED');
    }
    for (const step of plan) {
        if ('id' in step) continue; // replenishmentPlan already verifies canonical graph byte-for-byte
        if (Object.keys(step).sort().join(',') !== 'input,tool') throw new Error('INVALID_PLAN');
        if (step.tool !== 'purchase.create') continue;
        const proposal = step.input;
        if (!proposal || Object.keys(proposal).sort().join(',') !== 'lines,supplierId' ||
            proposal.lines.some(line => Object.keys(line).sort().join(',') !== 'ingredientId,quantity,unitCost' ||
                !/^(0|[1-9]\d*)(\.\d{1,3})?$/.test(line.quantity) ||
                !/^(0|[1-9]\d*)(\.\d{1,4})?$/.test(line.unitCost) ||
                Number(line.quantity) > 1e12 || Number(line.unitCost) > 1e12)) {
            throw new Error('INVALID_PROPOSAL');
        }
    }
}

/** A joint Backend review can request only two READ contracts per scoped ingredient. */
function validJointReadTools(tools: AgentGraphInput['readTools']): boolean {
    if (!tools || tools.length < 2 || tools.length > 8 || tools.length % 2 !== 0) return false;
    const ids = new Set<string>();
    for (let i = 0; i < tools.length; i += 2) {
        const available = tools[i]!, batches = tools[i + 1]!;
        const input = available.input;
        if (available.name !== 'getIngredientAvailability' || batches.name !== 'getIngredientBatches' ||
            available.version !== '1.0.0' || batches.version !== '1.0.0' ||
            !record(input) || Object.keys(input).length !== 1 ||
            typeof input.ingredientId !== 'string' ||
            !/^[A-Za-z0-9][A-Za-z0-9:_-]{0,119}$/.test(input.ingredientId) ||
            !record(batches.input) || Object.keys(batches.input).length !== 1 ||
            batches.input.ingredientId !== input.ingredientId ||
            ids.has(input.ingredientId)) return false;
        ids.add(input.ingredientId);
    }
    return true;
}

/** Stable non-LLM identity for joint review. No purchase plan, approval, or tool execution. */
const jointReadIdentityPlan = (): Plan => [
    { tool: 'inventory.read', input: null },
    { tool: 'inventory.recommend', input: null }
];
/** Private, serializable Session D journal in the EXISTING Graph repository. */
type SessionDStoredRun = NonNullable<AgentState['graphRuns']>[string] & {
    sessionDObservations?: Record<string, DurableObservationRecord>;
    sessionDAnomalies?: Record<string, DurableAnomalyRecord>;
    sessionDReplanLedger?: ReplanLedger;
    sessionDReplans?: Record<string, { eventFingerprint: string; status: string; auditTraceId: string }>;
    sessionDUsedReplans?: number;
};
function validJointReadIdentity(execution: Execution | undefined, actorId: string): execution is Execution {
    const fixed = jointReadIdentityPlan();
    return Boolean(execution && execution.actorId === actorId &&
        execution.status === 'PLANNED' && execution.budget === 2 &&
        execution.revision === '1' && execution.hash === digest(fixed, {}) &&
        isDeepStrictEqual(execution.plan, fixed) &&
        Object.keys(execution.versions).length === 0 &&
        execution.spent === 0 && execution.reserved === 0 &&
        Array.isArray(execution.result) && execution.result.length === 0 &&
        Array.isArray(execution.revisions) && execution.revisions.length === 0);
}
/** Planner/Executor/Verifier; purchasing and stock rules belong exclusively to BusinessPort. */
export class AgentWorkflow implements AgentApprovalRepository, MemoryLearning {
    private readonly allowlist: readonly ToolName[];
    /** D-only verified Backend source ports. Absence is HOLD, not inferred authority. */
    constructor(private readonly repository: AgentRepository | null, private readonly readBusiness: Pick<BusinessPort, 'authorize' | 'toolRegistry'> & Partial<BusinessPort>, private readonly llm: LLMProvider, allowlist: readonly ToolName[] = allowed, private readonly clock = () => new Date(), private readonly readOnlyGraphExecution = false,
        private readonly sessionDSource?: Pick<DurableObsAnmPorts, 'loadPersistedSource' | 'anomalyAuthority'> &
            Pick<DurableAnmRepPorts, 'loadPersistedReplanInput' | 'replanAuthority'> &
            { verifyFixedReadIdentity?: (scope: HandoffScope) => Promise<{
                status: 'REP_NOT_APPLICABLE'; reason: 'FIXED_READ_IDENTITY_NO_VERIFIED_PLN';
                graphId: string; actorId: string; executionId: string; sourceAttested: true;
            }> },
        private readonly stocktakeScenarioSource?: (actorId: string,
            context: import('./inventory-perception').PerceptionContext) =>
            Promise<import('./integration/stocktake-scenario-continuation').StocktakeScenarioSource>,
        private readonly d4ContextSource?: (actorId: string,
            context: import('./inventory-perception').PerceptionContext) =>
            Promise<import('./integration/d4-purchasing-intelligence').D4Context>) {
        if (readOnlyGraphExecution && allowlist.some(tool => tool !== 'inventory.read' && tool !== 'inventory.recommend')) {
            throw new Error('INVALID_READ_ONLY_ALLOWLIST');
        }
        if (stocktakeScenarioSource && !readOnlyGraphExecution) {
            throw new Error('INVALID_READ_ONLY_SCENARIO_ADAPTER');
        }
        if (d4ContextSource && !readOnlyGraphExecution) {
            throw new Error('INVALID_READ_ONLY_D4_ADAPTER');
        }
        this.allowlist = Object.freeze([...allowlist]);
    }
    /**
     * LangGraph orchestration is a method of the existing AgentWorkflow, not a second
     * purchasing engine. Durable identity/checkpoints are written into the SAME
     * AgentRepository state as executions/approvals/tool calls. Production postgres
     * remains fail-closed until its repository+BusinessPort adapter is verified.
     */
    async runLangGraph(raw: AgentGraphInput): Promise<AgentGraphResult> {
        const schema = z.strictObject({
            requestId: z.uuid(),
            actorId: z.string().trim().min(1).max(120),
            prompt: z.string().trim().min(1).max(10000),
            budget: z.number().int().nonnegative().max(1000000),
            mode: z.enum(['PLAN', 'RESUME']),
            replenishment: z.strictObject({
                supplierId: z.string().trim().min(1),
                unitCosts: z.record(z.string(), z.string())
            }).optional(),
            readTools: z.array(z.strictObject({
                name: z.string().trim().min(1),
                input: z.unknown(),
                version: z.string().optional()
            })).max(8).optional(),
            proposalReview: z.strictObject({
                proposalId: z.string().regex(/^[A-Za-z0-9][A-Za-z0-9:_-]{0,119}$/),
                version: z.number().int().positive().max(2147483647),
                contentHash: z.string().regex(/^[a-f0-9]{64}$/)
            }).optional(),
            jointReview: z.literal(true).optional(),
            d4Intelligence: z.literal(true).optional(),
            purchaseFlow: z.literal(true).optional()
        });
        const parsed = schema.safeParse(raw);
        if (!parsed.success) throw new Error('INVALID_GRAPH_REQUEST');
        const request = parsed.data as AgentGraphInput;
        if (!this.repository) throw new Error('POSTGRES_NOT_VERIFIED: Agent graph persistence adapter unavailable');
        if (request.d4Intelligence && (!this.readOnlyGraphExecution ||
            !this.d4ContextSource || !this.readBusiness.toolRegistry ||
            !this.readBusiness.perceiveInventory || request.jointReview ||
            request.proposalReview || request.replenishment || request.budget !== 2)) {
            throw new Error('D4_READ_ONLY_INTELLIGENCE_DISABLED');
        }
        if (request.purchaseFlow && (!request.d4Intelligence ||
            !this.readOnlyGraphExecution || !this.readBusiness.createD4Proposal ||
            !this.readBusiness.executeD4ApprovedProposal ||
            !this.readBusiness.inspectProposal || request.proposalReview ||
            request.jointReview || process.env.AGENT_GRAPH_PURCHASING !== 'YES' ||
            process.env.AGENT_GRAPH_PG_READONLY !== 'YES')) {
            throw new Error('GRAPH_PURCHASING_DISABLED');
        }
        if (request.jointReview && (!request.proposalReview || !this.readOnlyGraphExecution ||
            !this.readBusiness.inspectProposal || !this.readBusiness.demandRisk ||
            !this.readBusiness.toolRegistry || request.budget !== 2 ||
            request.replenishment || !validJointReadTools(request.readTools) ||
            this.allowlist.length !== 2 || !this.allowlist.includes('inventory.read') ||
            !this.allowlist.includes('inventory.recommend'))) {
            throw new Error('POSTGRES_NOT_VERIFIED: Joined Backend inspection is READ-only');
        }
        if (request.proposalReview && !request.jointReview && (!this.readOnlyGraphExecution ||
            !this.readBusiness.inspectProposal || request.budget !== 0 ||
            request.replenishment || request.readTools?.length)) {
            throw new Error('POSTGRES_NOT_VERIFIED: Backend proposal status is read-only');
        }
        const graphId = createHash('sha256').update(JSON.stringify([request.actorId, request.requestId])).digest('hex');
        const inputHash = createHash('sha256').update(canonical({
            actorId: request.actorId, prompt: request.prompt, budget: request.budget,
            replenishment: request.replenishment ?? null, readTools: request.readTools ?? [],
            proposalReview: request.proposalReview ?? null,
            ...(request.jointReview ? { jointReview: true } : {}),
            ...(request.d4Intelligence ? { d4Intelligence: true } : {}),
            ...(request.purchaseFlow ? { purchaseFlow: true } : {})
        })).digest('hex');
        const invocationId = randomUUID();
        const leaseUntil = () => new Date(this.clock().getTime() + 60000).toISOString();
        const prior = await this.store.atomic(s => {
            s.graphRuns ??= {};
            // A requestId cannot be rebound to a different principal just by
            // selecting a distinct graphId. This mirrors Backend actor scope.
            if (Object.values(s.graphRuns).some(x => x.requestId === request.requestId && x.actorId !== request.actorId)) {
                throw new Error('INVALID_GRAPH_REPLAY');
            }
            const existing = s.graphRuns[graphId];
            if (existing) {
                if (existing.inputHash !== inputHash || existing.actorId !== request.actorId) throw new Error('INVALID_GRAPH_REPLAY');
                if (request.mode === 'RESUME' && !existing.executionId &&
                    !request.proposalReview && !request.d4Intelligence) {
                    throw new Error('INVALID_GRAPH_RESUME');
                }
                const active = existing.leaseOwner && Date.parse(existing.leaseUntil ?? '') > this.clock().getTime();
                if (active) {
                    if (request.mode === 'RESUME') throw new Error('GRAPH_RESUME_IN_PROGRESS');
                    return { state: structuredClone(existing), claimed: false };
                }
                if (request.mode === 'PLAN' && existing.status !== 'RUNNING') {
                    return { state: structuredClone(existing), claimed: false };
                }
                if (request.mode === 'RESUME' && ['SUCCEEDED', 'FAILED', 'CANCELLED'].includes(existing.status)) {
                    return { state: structuredClone(existing), claimed: false };
                }
                // A crashed invocation may be retried after its bounded lease.
                // plan() reuses the recorded execution identity under this same lock.
                existing.leaseOwner = invocationId;
                existing.leaseUntil = leaseUntil();
                if (request.mode === 'RESUME' && existing.status === 'HELD_POLICY') {
                    existing.actCycle = (existing.actCycle ?? 0) + 1;
                    // A new authorized ACT cycle must not inherit previous OBS attempts.
                    delete (existing as typeof existing & { observationLedger?: ObservationLedger }).observationLedger;
                }
                if (request.mode === 'RESUME' && request.proposalReview) {
                    // The prior decision remains in append-only trace, but is
                    // NOT a current Backend observation. A RESUME can fail at
                    // inventory/risk/tool checks BEFORE proposal inspection.
                    // Never return yesterday's approval/rejection as newly
                    // revalidated, including to concurrent PLAN duplicates.
                    existing.status = 'RUNNING';
                    delete existing.approvalBoundary;
                }
                return { state: structuredClone(existing), claimed: true };
            }
            if (request.mode === 'RESUME') throw new Error('INVALID_GRAPH_RESUME');
            s.graphRuns[graphId] = { requestId: request.requestId, actorId: request.actorId,
                inputHash, status: 'RUNNING', trace: [], startedAt: this.clock().toISOString(),
                updatedAt: this.clock().toISOString(), leaseOwner: invocationId, leaseUntil: leaseUntil() };
            return null;
        });
        const resultFromStored = async (): Promise<AgentGraphResult> => {
            await this.business.authorize(request.actorId, 'agent.run');
            const saved = await this.store.atomic(s => s.graphRuns?.[graphId]);
            if (!saved) throw new Error('INVALID_GRAPH_CHECKPOINT');
            await this.store.atomic(s => permit(s, request.actorId, 'agent.run'));
            const execution = saved.executionId ? await this.store.execution(saved.executionId) : undefined;
            const storedScenario = ([...saved.trace] as import('./agent-langgraph').AgentGraphEvent[])
                .reverse().find(e => e.scenarioAnalysis)?.scenarioAnalysis;
            const storedD4Events = [...saved.trace] as import('./agent-langgraph').AgentGraphEvent[];
            const storedD4Plan = storedD4Events.reverse().find(e => e.d4Plan)?.d4Plan;
            const storedD4Recommendation = storedD4Events.find(e => e.d4Recommendation)?.d4Recommendation;
            const storedD4Scenario = storedD4Events.find(e => e.d4ThresholdScenario)?.d4ThresholdScenario;
            return { graphId, requestId: saved.requestId, actorId: saved.actorId, status: saved.status,
                source: 'LANGGRAPH_STATEGRAPH', trace: structuredClone(saved.trace),
                classifications: [], toolResults: [], ...(execution ? { execution } : {}),
                ...(storedScenario ? { scenarioAnalysis: structuredClone(storedScenario) } : {}),
                ...(storedD4Plan ? { d4Plan: structuredClone(storedD4Plan) } : {}),
                ...(storedD4Recommendation ? { d4Recommendation: structuredClone(storedD4Recommendation) } : {}),
                ...(storedD4Scenario ? { d4ThresholdScenario: structuredClone(storedD4Scenario) } : {}),
                ...(saved.approvalBoundary ? { approvalBoundary: structuredClone(saved.approvalBoundary) } : {}),
                ...(saved.purchaseProposal ? { proposalReference: structuredClone(saved.purchaseProposal) } : {}),
                ...(saved.purchaseRequestId ? { purchaseRequestId: saved.purchaseRequestId } : {}) };
        };
        // A duplicate PLAN cannot create a second execution, including when the
        // first attempt has not reached its final node. RESUME is a separate action.
        if (prior && !prior.claimed) return resultFromStored();
        // Optional D2/D3 integration. Never enable by silently reinterpreting a
        // schema-verified result as Backend-authoritative source proof.
        const sessionDEnabled = this.readOnlyGraphExecution &&
            process.env.AGENT_ACT_READ_EXECUTION === 'YES' &&
            process.env.AGENT_SESSION_D_INTEGRATION === 'YES';
        const checkSessionDScope = async (scope: HandoffScope): Promise<SessionDStoredRun> => {
            if (scope.graphId !== graphId || scope.runId !== graphId ||
                scope.actorId !== request.actorId || !/^act-[1-8]$/.test(scope.invocationId) ||
                !request.readTools?.some((tool, index) =>
                    `act-${index + 1}` === scope.invocationId && tool.name === scope.toolName)) {
                throw new Error('INVALID_GRAPH_CHECKPOINT');
            }
            await this.business.authorize(scope.actorId, 'agent.run');
            await this.business.authorize(scope.actorId, 'inventory.read');
            return this.store.atomic(s => {
                permit(s, scope.actorId, 'agent.run');
                const run = s.graphRuns?.[graphId] as SessionDStoredRun | undefined;
                if (!run || run.actorId !== scope.actorId ||
                    run.inputHash !== inputHash || run.leaseOwner !== invocationId) {
                    throw new Error('INVALID_GRAPH_CHECKPOINT');
                }
                return structuredClone(run);
            });
        };
        const graph = compileAgentLangGraph({
            now: () => this.clock().getTime(),
            authorize: (actor, permission) => this.business.authorize(actor, permission),
            inventory: actor => this.business.inventory(actor),
            recommendations: (actor, inventory) => this.business.recommendInventory(actor, inventory) as Promise<import('./replenishment').StockRecommendation[]>,
            ...(this.business.perceiveInventory ? { perceive: (actor: string, rows: import('./replenishment').InventoryRow[]) =>
                this.business.perceiveInventory!(actor, rows) } : {}),
            ...(this.stocktakeScenarioSource ? { stocktakeScenarioSource: this.stocktakeScenarioSource } : {}),
            ...(request.d4Intelligence && this.d4ContextSource
                ? { d4Context: this.d4ContextSource } : {}),
            ...(request.purchaseFlow && this.readBusiness.createD4Proposal &&
                this.readBusiness.executeD4ApprovedProposal && this.readBusiness.inspectProposal
                ? {
                    createD4Proposal: (actor: string, currentGraph: string,
                        context: import('./integration/d4-purchasing-intelligence').D4Context,
                        recommendation: import('./integration/d4-purchasing-intelligence').D4Recommendation) => {
                        if (currentGraph !== graphId) throw new Error('INVALID_GRAPH_CHECKPOINT');
                        return this.readBusiness.createD4Proposal!(actor, currentGraph, context, recommendation);
                    },
                    executeD4ApprovedProposal: (actor: string, currentGraph: string,
                        reference: import('./agent-langgraph').GraphPurchaseReference) => {
                        if (currentGraph !== graphId) throw new Error('INVALID_GRAPH_CHECKPOINT');
                        return this.readBusiness.executeD4ApprovedProposal!(actor, currentGraph, reference);
                    },
                    proposalReview: this.readBusiness.inspectProposal
                } : {}),
            ...(request.d4Intelligence && this.readOnlyGraphExecution &&
                process.env.AGENT_GRAPH_LLM_READ_PLANNER === 'YES' && this.llm.planDynamic
                ? { selectD4LlmRead: async (actor: string,
                    steps: import('./integration/d4-purchasing-intelligence').D4PlanStep[]): Promise<string> => {
                    await this.business.authorize(actor, 'agent.run');
                    await this.business.authorize(actor, 'inventory.read');
                    if (!steps.length || steps.length > 10 ||
                        steps.some(step => step.dependsOn.length > 0 ||
                            TOOL_CONTRACTS[step.tool]?.category === 'WRITE')) {
                        throw new Error('LLM_READ_SELECTION_DENIED');
                    }
                    const allowed = [] as { name: DynamicToolName; purpose: string }[];
                    for (const step of steps) {
                        const contract = TOOL_CONTRACTS[step.tool];
                        if (!contract || contract.status !== 'IMPLEMENTED' ||
                            !['READ', 'CALCULATION'].includes(contract.category) ||
                            !contract.input.safeParse(step.input).success) {
                            throw new Error('LLM_READ_SELECTION_DENIED');
                        }
                        await this.business.authorize(actor, contract.permission);
                        allowed.push({ name: step.tool as DynamicToolName, purpose: contract.purpose });
                    }
                    const prompt = 'Select exactly ONE available READ or CALCULATION tool. ' +
                        'Do not invent business IDs or quantities; use exactly one listed tool input unchanged. ' +
                        'This is analysis only: no purchase, approval, or writes. Allowed verified inputs: ' +
                        JSON.stringify(steps.map(step => ({ tool: step.tool, input: step.input })));
                    const proposal = await this.llm.planDynamic!(prompt, allowed,
                        { toolChoicePolicy: 'REQUIRES_TOOL' });
                    validateDynamicPlan(proposal);
                    if (proposal.steps.length !== 1 || proposal.steps[0]!.dependsOn.length !== 0 ||
                        !steps.some(step => step.tool === proposal.steps[0]!.tool &&
                            isDeepStrictEqual(step.input, proposal.steps[0]!.input))) {
                        throw new Error('LLM_READ_SELECTION_DENIED');
                    }
                    return proposal.steps[0]!.tool;
                } } : {}),
            ...(request.d4Intelligence && this.readBusiness.toolRegistry
                ? { registryCapabilities: () => this.readBusiness.toolRegistry!.capabilities() } : {}),
            ...(this.business.demandRisk ? { risk: (actor: string, rows: import('./replenishment').InventoryRow[]) =>
                this.business.demandRisk!(actor, rows) } : {}),
            ...(this.business.inspectProposal ? { proposalReview: (actor: string,
                reference: import('./agent-backend-proposal-review').ProposalReviewReference) =>
                this.business.inspectProposal!(actor, reference) } : {}),
            createReadIdentity: async input => {
                if (!input.jointReview || !this.readOnlyGraphExecution ||
                    !this.readBusiness.inspectProposal || !this.readBusiness.demandRisk ||
                    !this.readBusiness.toolRegistry || !validJointReadTools(input.readTools)) {
                    throw new Error('POSTGRES_NOT_VERIFIED');
                }
                await this.business.authorize(input.actorId, 'agent.run');
                return this.store.atomic(s => {
                    permit(s, input.actorId, 'agent.run');
                    const run = s.graphRuns?.[graphId];
                    if (!run || run.inputHash !== inputHash || run.actorId !== input.actorId ||
                        run.leaseOwner !== invocationId) throw new Error('INVALID_GRAPH_CHECKPOINT');
                    if (run.executionId) {
                        const existing = s.executions[run.executionId];
                        if (!validJointReadIdentity(existing, input.actorId)) {
                            throw new Error('INVALID_GRAPH_CHECKPOINT');
                        }
                        return existing;
                    }
                    const plan = jointReadIdentityPlan();
                    const execution: Execution = {
                        id: `execution-${++s.sequence}`, actorId: input.actorId,
                        status: 'PLANNED', plan, versions: {}, hash: digest(plan, {}),
                        revision: '1', revisions: [], spent: 0, reserved: 0,
                        budget: 2, result: []
                    };
                    s.executions[execution.id] = execution;
                    run.executionId = execution.id;
                    return execution;
                });
            },
            plan: input => this.plan(input.actorId, input.prompt, input.budget, input.replenishment, { graphId, inputHash, invocationId }),
            resume: async input => {
                const stored = await this.store.atomic(s => s.graphRuns?.[graphId]);
                if (!stored?.executionId) throw new Error('INVALID_GRAPH_RESUME');
                const execution = await this.store.execution(stored.executionId);
                if (!execution || execution.actorId !== input.actorId) throw new Error('FORBIDDEN');
                if (input.jointReview && !validJointReadIdentity(execution, input.actorId)) {
                    throw new Error('INVALID_GRAPH_CHECKPOINT');
                }
                return execution;
            },
            execute: (id, actor) => this.execute(id, actor),
            inspect: async (actor, id) => {
                await this.business.authorize(actor, 'agent.run');
                return this.store.atomic(s => {
                    permit(s, actor, 'agent.run');
                    const execution = s.executions[id];
                    if (!execution || execution.actorId !== actor) throw new Error('FORBIDDEN');
                    return { execution, approvals: Object.values(s.approvals).filter(a => a.executionId === id) };
                });
            },
            validate: (plan, budget) => validateGraphPlan(plan, this.allowlist, budget),
            dispatchRead: async (actor, name, input, version) => {
                // All names and WRITE classifications are checked by the single registry.
                return this.dispatchTool(actor, name, input, version);
            },
            ...(this.readOnlyGraphExecution &&
                process.env.AGENT_ACT_READ_EXECUTION === 'YES' && this.readBusiness.toolRegistry
                ? { executeActRead: async (step: import('../services/execution/act-read-step').ActReadStep,
                    trusted?: { expectedRowVersion?: number }) => {
                    const events: import('./agent-langgraph').AgentGraphEvent[] = [];
                    const savedLedger = await this.store.atomic(s => {
                        const run = s.graphRuns?.[graphId] as
                            (NonNullable<AgentState['graphRuns']>[string] & { observationLedger?: ObservationLedger }) | undefined;
                        if (!run || run.inputHash !== inputHash ||
                            run.leaseOwner !== invocationId || run.actorId !== step.actorId ||
                            step.runId !== graphId || !/^act-[1-8]$/.test(step.stepId)) {
                            throw new Error('INVALID_GRAPH_CHECKPOINT');
                        }
                        // A crashed Graph must never re-dispatch a read with an
                        // already journaled ACT attempt in the SAME cycle.
                        if (run.trace.some(e => e.node === 'act_executor' && e.stepId === step.stepId &&
                            ((e as typeof e & { actCycle?: number }).actCycle ?? 0) === (run.actCycle ?? 0))) {
                            throw new Error('INVALID_ACT_REPLAY');
                        }
                        return structuredClone(run.observationLedger ?? {});
                    });
                    const sourceVersion = this.readBusiness.actSourceVersion &&
                        typeof (step.input as { ingredientId?: unknown } | null)?.ingredientId === 'string'
                        ? () => this.readBusiness.actSourceVersion!(
                            step.actorId, (step.input as { ingredientId: string }).ingredientId)
                        : undefined;
                    const boundary: import('../services/execution/act-read-step').ActReadBoundary = {
                        registry: this.readBusiness.toolRegistry!,
                        authorize: (actor, permission) => this.business.authorize(actor, permission),
                        ...(sourceVersion ? { sourceVersion } : {}),
                        now: () => this.clock(),
                        checkpoint: async event => {
                            const run = await this.store.atomic(s => s.graphRuns?.[graphId]);
                            if (!run || run.inputHash !== inputHash ||
                                run.leaseOwner !== invocationId || run.actorId !== event.actorId) {
                                throw new Error('INVALID_GRAPH_CHECKPOINT');
                            }
                            const item: import('./agent-langgraph').AgentGraphEvent = {
                                node: 'act_executor', edge: 'allowlisted_tools',
                                status: 'ACT_' + event.status, at: event.at,
                                tool: event.tool, stepId: event.stepId,
                                attempt: event.attempt, actorId: event.actorId,
                                actCycle: run.actCycle ?? 0,
                                ...(event.code ? { code: event.code } : {}),
                                ...(run.executionId ? { executionId: run.executionId } : {})
                            };
                            if (this.store.recordActEvent) {
                                await this.store.recordActEvent({
                                    graphId, inputHash, invocationId,
                                    actorId: event.actorId, requestId: request.requestId,
                                    executionId: run.executionId,
                                    toolIndex: Number(event.stepId.slice(4)) - 1,
                                    event: item
                                });
                            } else {
                                await this.store.atomic(s => {
                                    const locked = s.graphRuns?.[graphId];
                                    if (!locked || locked.inputHash !== inputHash ||
                                        locked.leaseOwner !== invocationId) throw new Error('INVALID_GRAPH_CHECKPOINT');
                                    locked.trace.push(structuredClone(item));
                                    locked.updatedAt = event.at;
                                });
                            }
                            events.push(item);
                        }
                    };
                    const catalog = Object.prototype.hasOwnProperty.call(TOOL_CONTRACTS, step.tool)
                        ? TOOL_CONTRACTS[step.tool as keyof typeof TOOL_CONTRACTS] : undefined;
                    // Preserve ACT's durable policy HOLD for invalid catalog versions;
                    // OBS only accepts a contract-verified READ invocation.
                    if (!catalog || catalog.category !== 'READ' || catalog.status !== 'IMPLEMENTED' ||
                        (step.version && step.version !== catalog.version)) {
                        return { result: await executeActReadStep(step, boundary), events };
                    }
                    const handoff = await executeAndObserveActRead(step, boundary, {
                        runId: graphId, stepId: step.stepId, actorId: request.actorId,
                        toolName: step.tool, completedDependencies: step.completedDependencies,
                        ...(trusted?.expectedRowVersion !== undefined
                            ? { expectedRowVersion: trusted.expectedRowVersion } : {})
                    }, savedLedger);
                    const observed = handoff.observation;
                    const proposal = observed.stateUpdateProposal;
                    const proof: import('./agent-langgraph').AgentGraphObservation = {
                        runId: graphId, stepId: step.stepId, actorId: request.actorId,
                        toolName: step.tool, attempt: proposal.attemptNumber,
                        status: observed.observationStatus, quality: observed.dataQuality,
                        verifiedForBusiness: proposal.verifiedForBusiness,
                        traceId: observed.auditTraceId,
                        ...(observed.errorCode ? { code: observed.errorCode } : {})
                    };
                    // This transaction is the OBS apply gate. The ACT terminal
                    // checkpoint must already exist; only sanitized OBS proof and
                    // replay ledger enter the same durable Graph repository.
                    const obsEvent = await this.store.atomic(s => {
                        const run = s.graphRuns?.[graphId] as
                            (NonNullable<AgentState['graphRuns']>[string] & { observationLedger?: ObservationLedger }) | undefined;
                        if (!run || run.inputHash !== inputHash || run.leaseOwner !== invocationId ||
                            run.actorId !== request.actorId || !s.permissions[request.actorId]?.includes('agent.run') ||
                            run.observationLedger?.[`${graphId}:${step.stepId}`]) {
                            throw new Error('INVALID_GRAPH_CHECKPOINT');
                        }
                        const terminal = run.trace.filter(e => e.node === 'act_executor' &&
                            e.stepId === step.stepId && e.actorId === step.actorId &&
                            ((e as typeof e & { actCycle?: number }).actCycle ?? 0) === (run.actCycle ?? 0))
                            .at(-1);
                        if (!terminal || terminal.at !== handoff.terminalEvent.at ||
                            terminal.attempt !== proof.attempt ||
                            terminal.status !== (handoff.actResult.status === 'SUCCEEDED' ? 'ACT_SUCCEEDED' : 'ACT_HELD')) {
                            throw new Error('INVALID_GRAPH_CHECKPOINT');
                        }
                        const entry: import('./agent-langgraph').AgentGraphEvent = {
                            node: 'observation', edge: 'observation_validation',
                            status: `OBS_${proof.status}`, at: this.clock().toISOString(),
                            tool: proof.toolName, stepId: proof.stepId,
                            attempt: proof.attempt, actorId: proof.actorId,
                            observationTraceId: proof.traceId,
                            ...(proof.code ? { code: proof.code } : {}),
                            ...(run.executionId ? { executionId: run.executionId } : {})
                        };
                        run.observationLedger = structuredClone(handoff.ledger);
                        // A full OBS decision is committed privately only for
                        // registered inventory READ contracts; no raw Registry
                        // failure, prompt, JWT or supplier information is stored.
                        // D2 independently verifies source facts later.
                        if (sessionDEnabled && (step.tool === 'getIngredientAvailability' ||
                            step.tool === 'getIngredientBatches') &&
                            observed.observationStatus === 'SUCCESS' &&
                            observed.dataQuality === 'VERIFIED_SCHEMA' &&
                            observed.stateUpdateProposal.verifiedForBusiness) {
                            const bytes = Buffer.byteLength(JSON.stringify(observed), 'utf8');
                            if (bytes > 65536) throw new Error('INVALID_GRAPH_CHECKPOINT');
                            const journal = run as SessionDStoredRun;
                            journal.sessionDObservations ??= {};
                            const key = `${run.actCycle ?? 0}:${step.stepId}`;
                            if (journal.sessionDObservations[key]) throw new Error('INVALID_ACT_REPLAY');
                            const obsRecord: DurableObservationRecord = {
                                graphId, runId: graphId, actorId: request.actorId,
                                invocationId: step.stepId, toolName: step.tool,
                                observationId: observed.auditTraceId,
                                observationAuditTraceId: observed.auditTraceId,
                                terminalCheckpointId: 'act-' + createHash('sha256')
                                    .update(JSON.stringify([graphId, step.stepId, terminal.at, terminal.status,
                                        terminal.attempt])).digest('hex').slice(0, 32),
                                terminalAt: terminal.at, recordedAt: entry.at,
                                persistedObservationDigest: digestObservation(observed),
                                decision: structuredClone(observed)
                            };
                            journal.sessionDObservations[key] = obsRecord;
                        }
                        run.trace.push(structuredClone(entry));
                        run.updatedAt = entry.at;
                        return entry;
                    });
                    events.push(obsEvent);
                    return { result: handoff.actResult, events, observation: proof };
                } } : {}),
            ...(sessionDEnabled ? {
                ...(this.sessionDSource?.verifyFixedReadIdentity ? {
                    sessionDNoPlanProof: async (scope: HandoffScope) => {
                        await checkSessionDScope(scope);
                        return this.sessionDSource!.verifyFixedReadIdentity!(scope);
                    }
                } : {}),
                sessionDAnomaly: async (scope: HandoffScope) => {
                    const provider = this.sessionDSource;
                    const handoff = await handoffDurableObservationToAnomaly(scope, {
                        loadPersistedObservation: async scoped => {
                            const run = await checkSessionDScope(scoped);
                            const key = `${run.actCycle ?? 0}:${scoped.invocationId}`;
                            const record = run.sessionDObservations?.[key];
                            if (!record || !run.trace.some(e => e.node === 'observation' &&
                                e.stepId === scoped.invocationId &&
                                e.observationTraceId === record.observationAuditTraceId)) {
                                throw new Error('OBS_DURABLE_CHECKPOINT_NOT_FOUND');
                            }
                            return record;
                        },
                        loadPersistedSource: async scoped => {
                            await checkSessionDScope(scoped);
                            if (!provider) throw new Error('ANM_SOURCE_UNVERIFIED');
                            return provider.loadPersistedSource(scoped);
                        },
                        anomalyAuthority: { verify: async input => {
                            await checkSessionDScope({
                                graphId, runId: input.runId, actorId: input.actorId,
                                invocationId: scope.invocationId, toolName: scope.toolName
                            });
                            if (!provider) throw new Error('ANM_SOURCE_UNVERIFIED');
                            return provider.anomalyAuthority.verify(input);
                        } }
                    }, this.sessionDSource?.verifyFixedReadIdentity ? undefined : this.clock());
                    if (handoff.status !== 'READY' || !handoff.analysis ||
                        !handoff.analysis.sourceVerified || !handoff.observationId) {
                        return handoff;
                    }
                    // Commit an independently source-attested analysis to the
                    // SAME repository as ACT/OBS; no business writes.
                    await this.store.atomic(s => {
                        permit(s, request.actorId, 'agent.run');
                        const run = s.graphRuns?.[graphId] as SessionDStoredRun | undefined;
                        if (!run || run.actorId !== request.actorId ||
                            run.inputHash !== inputHash || run.leaseOwner !== invocationId) {
                            throw new Error('INVALID_GRAPH_CHECKPOINT');
                        }
                        const key = `${run.actCycle ?? 0}:${scope.invocationId}`;
                        const observed = run.sessionDObservations?.[key];
                        if (!observed || observed.observationId !== handoff.observationId ||
                            handoff.analysis!.observationId !== observed.observationId) {
                            throw new Error('INVALID_GRAPH_CHECKPOINT');
                        }
                        run.sessionDAnomalies ??= {};
                        const analysis = structuredClone(handoff.analysis!);
                        const item: DurableAnomalyRecord = {
                            graphId, runId: graphId, actorId: request.actorId,
                            invocationId: scope.invocationId, toolName: scope.toolName,
                            observationId: observed.observationId,
                            observationAuditTraceId: observed.observationAuditTraceId,
                            checkpointId: 'anm-' + createHash('sha256').update(
                                JSON.stringify([graphId, key, observed.persistedObservationDigest])
                            ).digest('hex').slice(0, 32),
                            recordedAt: this.clock().toISOString(),
                            anomalyDigest: createHash('sha256').update(
                                JSON.stringify(analysis)).digest('hex'),
                            anomaly: analysis
                        };
                        const existing = run.sessionDAnomalies[key];
                        if (existing && !isDeepStrictEqual(existing.anomaly, item.anomaly)) {
                            throw new Error('INVALID_GRAPH_REPLAY');
                        }
                        run.sessionDAnomalies[key] = existing ?? item;
                        run.updatedAt = this.clock().toISOString();
                    });
                    return handoff;
                },
                sessionDReplanning: async (scope: HandoffScope) => {
                    const provider = this.sessionDSource;
                    // The verification reference instant must be stable across
                    // all independently loaded records. A later generated proof
                    // timestamp must not silently be accepted as past evidence.
                    const evaluationAt = this.clock();
                    const handoff = await handoffDurableAnomalyToReplanning(scope, {
                        loadPersistedAnomaly: async scoped => {
                            const run = await checkSessionDScope(scoped);
                            const key = `${run.actCycle ?? 0}:${scoped.invocationId}`;
                            const item = run.sessionDAnomalies?.[key];
                            if (!item) throw new Error('ANM_DURABLE_CHECKPOINT_NOT_FOUND');
                            return item;
                        },
                        loadPersistedReplanInput: async scoped => {
                            await checkSessionDScope(scoped);
                            if (!provider) throw new Error('REP_SOURCE_UNVERIFIED');
                            return provider.loadPersistedReplanInput(scoped);
                        },
                        loadPersistedReplanLedger: async scoped => {
                            const run = await checkSessionDScope(scoped);
                            return run.sessionDReplanLedger ?? {};
                        },
                        verifyPersistedAnomaly: async record => {
                            const run = await checkSessionDScope({
                                graphId: record.graphId, runId: record.runId, actorId: record.actorId,
                                invocationId: record.invocationId, toolName: record.toolName
                            });
                            const key = `${run.actCycle ?? 0}:${record.invocationId}`;
                            const saved = run.sessionDAnomalies?.[key];
                            if (!saved || !isDeepStrictEqual(saved, record)) {
                                throw new Error('ANM_RECORD_UNVERIFIED');
                            }
                            return {
                                graphId: record.graphId, runId: record.runId, actorId: record.actorId,
                                invocationId: record.invocationId, toolName: record.toolName,
                                observationId: record.observationId,
                                observationAuditTraceId: record.observationAuditTraceId,
                                checkpointId: record.checkpointId,
                                anomalyDigest: record.anomalyDigest,
                                verifiedAt: evaluationAt.toISOString()
                            };
                        },
                        replanAuthority: { verify: async input => {
                            await checkSessionDScope({
                                graphId: input.graphId, runId: input.runId, actorId: input.actorId,
                                invocationId: scope.invocationId, toolName: scope.toolName
                            });
                            if (!provider) throw new Error('REP_SOURCE_UNVERIFIED');
                            return provider.replanAuthority.verify(input);
                        } }
                    }, evaluationAt);
                    if (handoff.status !== 'READY' || !handoff.decision ||
                        !handoff.proposedLedger) return handoff;
                    // Transactional CAS on both the durable decision and replan
                    // budget. A replan remains proposal-only, never execution.
                    await this.store.atomic(s => {
                        permit(s, request.actorId, 'agent.run');
                        const run = s.graphRuns?.[graphId] as SessionDStoredRun | undefined;
                        if (!run || run.actorId !== request.actorId || run.inputHash !== inputHash ||
                            run.leaseOwner !== invocationId) throw new Error('INVALID_GRAPH_CHECKPOINT');
                        const key = `${run.actCycle ?? 0}:${scope.invocationId}`;
                        if (!run.sessionDAnomalies?.[key]) throw new Error('INVALID_GRAPH_CHECKPOINT');
                        const d = handoff.decision!;
                        if (d.graphId !== graphId || d.runId !== graphId || d.actorId !== request.actorId ||
                            !d.readOnly || d.authorizedToExecute || d.authorizedToPurchase ||
                            d.authorizedToApprove) throw new Error('REP_POLICY_DENIED');
                        run.sessionDReplans ??= {};
                        const previous = run.sessionDReplans[key];
                        if (previous) {
                            if (previous.eventFingerprint !== d.eventFingerprint ||
                                previous.auditTraceId !== d.auditTraceId) throw new Error('INVALID_GRAPH_REPLAY');
                            return;
                        }
                        const increment = d.status === 'REPLAN_PROPOSED' ||
                            d.status === 'REFRESH_REQUIRED' ? 1 : 0;
                        if (d.usedReplans - increment !== (run.sessionDUsedReplans ?? 0) ||
                            d.usedReplans > d.maxReplans) throw new Error('REPLAN_BUDGET_EXHAUSTED');
                        run.sessionDReplans[key] = {
                            eventFingerprint: d.eventFingerprint,
                            auditTraceId: d.auditTraceId, status: d.status
                        };
                        run.sessionDReplanLedger = structuredClone(handoff.proposedLedger!);
                        run.sessionDUsedReplans = d.usedReplans;
                        run.updatedAt = this.clock().toISOString();
                    });
                    return handoff;
                }
            } : {}),
            ...(this.readBusiness.toolRegistry ? { selectRead: async (actor: string, name: string,
                rawInput: unknown, hasTrustedPerception: boolean) => {
                const objectiveByTool: Record<string, ToolSelectionInput['objective']> = {
                    getIngredientAvailability: 'INVENTORY', getIngredientBatches: 'EXPIRY',
                    getSalesHistory: 'CONSUMPTION', getStocktakeStatus: 'STOCKTAKE',
                    getInboundPurchaseOrder: 'INBOUND', findIngredientSuppliers: 'SUPPLIER',
                    calculateReorderQuantity: 'REORDER'
                };
                const known = Object.prototype.hasOwnProperty.call(TOOL_CONTRACTS, name);
                const contract = known ? TOOL_CONTRACTS[name as keyof typeof TOOL_CONTRACTS] : undefined;
                const checked = contract?.input.safeParse(rawInput);
                if (known && !checked?.success) throw new Error('INVALID_TOOL_INPUT');
                // No raw model-provided arguments can bypass the strict selector.
                const inputs = checked?.success ? checked.data : {};
                return selectToolForTask({
                    version: TOOL_SELECTION_VERSION, actorId: actor,
                    objective: objectiveByTool[name] ?? 'EXPLICIT',
                    dataQuality: hasTrustedPerception ? 'VERIFIED' : 'PARTIAL',
                    requiredInformation: [], availableInformation: [],
                    dependencyIds: [], completedDependencyIds: [],
                    inputs, requestedTool: name, previousOutcome: 'NOT_RUN', recoveryCount: 0
                }, this.readBusiness.toolRegistry!, (id, permission) => this.readBusiness.authorize(id, permission));
            } } : {}),
            checkpoint: async (event, execution) => {
                await this.store.atomic(s => {
                    const run = s.graphRuns?.[graphId];
                    if (!run || run.inputHash !== inputHash || run.leaseOwner !== invocationId) throw new Error('INVALID_GRAPH_CHECKPOINT');
                    if (execution) {
                        if (run.executionId && run.executionId !== execution.id) throw new Error('INVALID_GRAPH_REPLAY');
                        run.executionId = execution.id;
                    }
                    run.trace.push(structuredClone(event));
                    if (event.approvalBoundary) run.approvalBoundary = structuredClone(event.approvalBoundary);
                    if (event.proposalReference) {
                        if (run.purchaseProposal && !isDeepStrictEqual(run.purchaseProposal, event.proposalReference)) {
                            throw new Error('INVALID_GRAPH_REPLAY');
                        }
                        run.purchaseProposal = structuredClone(event.proposalReference);
                    }
                    if (event.purchaseRequestId) {
                        if (run.purchaseRequestId && run.purchaseRequestId !== event.purchaseRequestId) {
                            throw new Error('INVALID_GRAPH_REPLAY');
                        }
                        run.purchaseRequestId = event.purchaseRequestId;
                    }
                    run.updatedAt = this.clock().toISOString();
                });
            }
        });
        try {
            const snapshot = await graph.invoke({ graphId, request, status: 'RUNNING',
                ...(prior?.state.purchaseProposal ?
                    { proposalReference: structuredClone(prior.state.purchaseProposal) } : {})
            }, { recursionLimit: 35 });
            const result = graphResult(snapshot);
            if (this.readOnlyGraphExecution && process.env.AGENT_ACT_READ_EXECUTION === 'YES' &&
                this.store.finalizeActRun) {
                await this.store.finalizeActRun({
                    graphId, inputHash, invocationId, status: result.status
                });
            } else {
                await this.store.atomic(s => {
                    const run = s.graphRuns?.[graphId];
                    if (!run || run.inputHash !== inputHash || run.leaseOwner !== invocationId) {
                        throw new Error('INVALID_GRAPH_CHECKPOINT');
                    }
                    run.status = result.status;
                    run.updatedAt = this.clock().toISOString();
                    delete run.leaseOwner;
                    delete run.leaseUntil;
                });
            }
            if (request.purchaseFlow) {
                const durable = await this.store.atomic(s => s.graphRuns?.[graphId]);
                if (!durable || durable.status !== result.status ||
                    !durable.purchaseProposal && result.status === 'SUCCEEDED') {
                    throw new Error('INVALID_GRAPH_CHECKPOINT');
                }
                // A RESUME invokes only the next graph nodes; the permanent
                // checkpoint is the full SAME-execution trace across invocations.
                return { ...result, trace: structuredClone(durable.trace),
                    ...(durable.purchaseProposal ?
                        { proposalReference: structuredClone(durable.purchaseProposal) } : {}),
                    ...(durable.purchaseRequestId ?
                        { purchaseRequestId: durable.purchaseRequestId } : {}) };
            }
            return result;
        } catch {
            // If the actual StateGraph invocation/checkpoint throws, do not
            // strand a 60s live lease or preserve an old Backend decision as
            // current. Only the invocation holding the SAME lease may clean it.
            // If PostgreSQL itself is unavailable, leave its crash-lease
            // recovery intact, but never claim success or expose the cause.
            try {
                await this.store.atomic(s => {
                    const run = s.graphRuns?.[graphId];
                    if (!run || run.inputHash !== inputHash || run.leaseOwner !== invocationId) return;
                    const now = this.clock().toISOString();
                    run.status = 'HELD_POLICY';
                    run.trace.push({ node: 'graph_failure', edge: 'audit', status: 'INVOCATION_HELD',
                        code: 'UNVERIFIED_GRAPH_EXECUTION', at: now });
                    if (request.proposalReview) {
                        run.approvalBoundary = { ...request.proposalReview,
                            backendStatus: 'BACKEND_UNVERIFIED', observedAt: now, httpStatus: null,
                            approved: false, rejected: false, purchaseRequestPresent: false,
                            decisionActorId: null, decisionAt: null, rejectionReasonHash: null,
                            writesPerformed: false };
                    }
                    run.updatedAt = now;
                    delete run.leaseOwner;
                    delete run.leaseUntil;
                });
            } catch { /* Storage may itself be unavailable: bounded lease still fails closed. */ }
            throw new Error('UNVERIFIED_GRAPH_EXECUTION');
        }
    }
    private get store(): AgentRepository {
        if (!this.repository) throw new Error('READ_ONLY_WORKFLOW_REPOSITORY_DISABLED');
        return this.repository;
    }
    private get business(): BusinessPort {
        if (!this.repository) throw new Error('READ_ONLY_WORKFLOW_LEGACY_DISABLED');
        return this.readBusiness as BusinessPort;
    }
    /** Explicit P1.5 entry; legacy Plan/execute and repository evidence unchanged. */
    async dispatchTool(actorId: string, name: string, input: unknown, version = '1.0.0') {
        if (!this.readBusiness.toolRegistry) throw new Error('TOOL_REGISTRY_NOT_BOUND');
        return this.readBusiness.toolRegistry.dispatch(actorId, name, input, version, () => this.readBusiness.authorize(actorId, 'agent.run'));
    }
    async planDynamicTools(
    actorId: string,
    plan: DynamicToolPlan
    ): Promise<DynamicToolPlan> {
        await this.readBusiness.authorize(actorId, 'agent.run');

        validateDynamicPlan(plan);

        const registry = this.readBusiness.toolRegistry;

        if (!registry) {
            throw new Error('TOOL_REGISTRY_NOT_BOUND');
        }

        const capabilities = registry.capabilities();

        for (const step of plan.steps) {
            const capability = capabilities.find(
                item => item.name === step.tool
            );

            if (!capability || !capability.bound) {
                throw new Error('TOOL_NOT_AVAILABLE');
            }
        }

        return structuredClone(plan);
    }
    async generateDynamicPlan(
    actorId: string,
    prompt: string,
    context: { toolChoicePolicy: import('../services/openai-planner.service').ToolChoicePolicy } = { toolChoicePolicy: 'REQUIRES_TOOL' }
    ): Promise<DynamicToolPlan> {
        if (
            typeof prompt !== 'string' ||
            !prompt.trim() ||
            prompt.length > 10000
        ) {
            throw new Error('INVALID_PROMPT');
        }

        await this.readBusiness.authorize(actorId, 'agent.run');

        const registry = this.readBusiness.toolRegistry;
        if (!registry) {
            throw new Error('TOOL_REGISTRY_NOT_BOUND');
        }

        const candidates = registry.capabilities()
            .filter(capability => capability.bound &&
                capability.version === TOOL_CONTRACTS[capability.name].version &&
                TOOL_CONTRACTS[capability.name].status === 'IMPLEMENTED' &&
                TOOL_CONTRACTS[capability.name].category !== 'WRITE')
            .map(capability => ({
                name: capability.name as DynamicToolName,
                purpose: TOOL_CONTRACTS[capability.name].purpose,
                inputSchema: z.toJSONSchema(TOOL_CONTRACTS[capability.name].input)
            }));

        const tools: typeof candidates = [];
        for (const candidate of candidates) {
            try {
                await this.readBusiness.authorize(actorId, TOOL_CONTRACTS[candidate.name].permission);
                tools.push(candidate);
            } catch (error) {
                const status = (error as { statusCode?: number; status?: number } | null)?.statusCode ??
                    (error as { status?: number } | null)?.status;
                const denied = error instanceof ToolError && error.code === 'FORBIDDEN' ||
                    status === 401 || status === 403;
                if (!denied) throw error;
            }
        }
        if (!tools.length) throw new Error('TOOL_NOT_AVAILABLE');

        if (!this.llm.planDynamic) {
            throw new Error('DYNAMIC_PLANNER_NOT_CONFIGURED');
        }

        const proposed = await this.llm.planDynamic(prompt, tools, context);

        for (const step of proposed.steps) {
            if (Object.prototype.hasOwnProperty.call(TOOL_CONTRACTS, step.tool)) {
                await this.readBusiness.authorize(actorId, TOOL_CONTRACTS[step.tool].permission);
            }
        }

        return this.planDynamicTools(actorId, proposed);
    }

    async executeDynamicTools(
    actorId: string,
    plan: DynamicToolPlan
    ) {
        // Kiểm tra quyền, Tool Contracts và handler trước khi chạy.
        const validatedPlan = await this.planDynamicTools(actorId, plan);

        const results: Record<string, unknown> = {};

        for (const step of validatedPlan.steps) {
            // Không chạy bước phụ thuộc nếu bước trước chưa thành công.
            for (const dependency of step.dependsOn) {
                if (!Object.prototype.hasOwnProperty.call(results, dependency)) {
                    throw new Error('DEPENDENCY_NOT_COMPLETED');
                }
            }

            const outcome = await this.dispatchTool(
                actorId,
                step.tool,
                step.input
            );

            if (!outcome.ok) {
                return {
                    status: 'FAILED' as const,
                    failedStep: step.id,
                    error: outcome.error,
                    results
                };
            }

            results[step.id] = outcome.output;
        }

        return {
            status: 'SUCCEEDED' as const,
            results
        };
    }

    /** Agent-only HTTP command receipts; no manual backend records are placed in Agent tables. */
    command<P>(actorId: string, key: string, kind: 'plan' | 'revise' | 'approve' | 'revoke' | 'execute' | 'cancel' | 'remember' | 'learn' | 'consolidate' | 'forget', payload: P, work: (agent: AgentWorkflow, payload: P) => Promise<unknown>) {
        payload = structuredClone(payload);
        const hash = createHash('sha256').update(canonical({ actorId, kind, payload })).digest('hex');
        const identity = JSON.stringify([actorId, kind, key]);
        const permission = ['approve', 'revoke'].includes(kind) ? 'agent.approve' : ['remember', 'learn', 'consolidate', 'forget'].includes(kind) ? 'memory' : 'agent.run';
        return this.business.atomic((business, commit, finish) => this.store.atomic(async state => {
            await business.authorize(actorId, permission); permit(state, actorId, permission);
            const prior = state.operations[identity];
            if (prior) return prior.hash === hash ? prior.response : { status: 409, body: { code: 'IDEMPOTENCY_CONFLICT' } };
            const scopedStore: AgentRepository = {
                execution: async id => structuredClone(state.executions[id]),
                atomic: async fn => {
                    const before = structuredClone(state);
                    try { return structuredClone(await fn(state)); } catch (error) { Object.assign(state, before); throw error; }
                },
            };
            const before = structuredClone(state); let response: { status: number; body: unknown };
            try { response = { status: 200, body: (await work(new AgentWorkflow(scopedStore, business, this.llm, this.allowlist, this.clock), payload)) ?? null }; }
            catch (error) {
                const code = error instanceof Error ? error.message : '';
                const businessError = error as { status?: number; code?: string };
                if (typeof businessError.status === 'number' && businessError.status >= 400 && businessError.status <= 499 && typeof businessError.code === 'string' && /^[A-Z_]+$/.test(businessError.code)) {
                    Object.assign(state, before); response = { status: businessError.status, body: { code: businessError.code } };
                } else {
                    if (!/^(FORBIDDEN|TOOL_DENIED|BUDGET_EXCEEDED|APPROVAL_REQUIRED|INVALID_[A-Z_]+|STALE_PROPOSAL|PLAN_CHANGED|EXECUTION_TERMINAL)$/.test(code)) throw error;
                    Object.assign(state, before); response = { status: code === 'FORBIDDEN' || code === 'TOOL_DENIED' ? 403 : code.startsWith('INVALID_') ? 400 : 409, body: { code } };
                }
            }
            state.operations[identity] = { hash, actorId, response }; return response;
        }, commit, finish));
    }
    async listExecutions(actorId: string) {
        return this.business.atomic((business, commit, finish) => this.store.atomic(async s => {
            const actor = await business.authorize(actorId, 'agent.run') as { role?: string };
            permit(s, actorId, 'agent.run');
            const admin = actor.role === 'ADMIN' && s.permissions[actorId]?.includes('agent.approve');
            if (admin) await business.authorize(actorId, 'agent.approve');
            return Object.values(s.executions).filter(e => e.actorId === actorId || admin);
        }, commit, finish));
    }
    async inspect(actorId: string, id: string) {
        return this.business.atomic((business, commit, finish) => this.store.atomic(async s => {
            await business.authorize(actorId, 'agent.run');
            permit(s, actorId, 'agent.run'); const execution = s.executions[id];
            if (!execution || (execution.actorId !== actorId && !s.permissions[actorId]?.includes('agent.approve'))) throw new Error('FORBIDDEN');
            if (execution.actorId !== actorId) await business.authorize(actorId, 'agent.approve');
            return { execution, approvals: Object.values(s.approvals).filter(a => a.executionId === id), toolCalls: Object.values(s.toolCalls).filter(c => c.executionId === id), evaluations: s.evaluations.filter(e => e.executionId === id), audit: s.audit.filter(a => a.executionId === id) };
        }, commit, finish));
    }
    async plan(actorId: string, prompt: string, budget: number, replenishment?: ReplenishmentInput,
        graphContext?: { graphId: string; inputHash: string; invocationId: string }): Promise<Execution> {
        const requestedPlan = replenishment === undefined ? undefined : replenishmentPlan(replenishment);
        await this.business.authorize(actorId, 'agent.run');
        await this.store.atomic(s => permit(s, actorId, 'agent.run'));
        if (!Number.isSafeInteger(budget) || budget < 0 || prompt.length > 10000) throw new Error('INVALID_BUDGET_OR_PROMPT');
        let memoryAllowed = true;
        try { await this.business.authorize(actorId, 'memory'); } catch { memoryAllowed = false; }
        const context = await this.store.atomic(s => memoryAllowed ? planningContext(s, actorId, prompt, this.clock().getTime()) : { trust: 'untrusted-evidence-only' as const, evidence: [], maxTokens: 2048 as const });
        const mock = this.llm instanceof MockLLMProvider && this.llm.plan === MockLLMProvider.prototype.plan &&
            this.llm[mockDecision] === MockLLMProvider.prototype[mockDecision] ? this.llm : undefined;
        const traced = requestedPlan ? undefined : mock?.[mockDecision](prompt, context);
        const plan = requestedPlan ?? traced?.plan ?? structuredClone(await this.llm.plan(prompt, structuredClone(context)));
        validatePlan(plan, this.allowlist);
        if (graphContext) validateGraphPlan(plan, this.allowlist, budget);
        const attribution: MemoryAttribution[] = context.evidence.map(({ memoryId }) => {
            if (traced?.influence?.memoryId === memoryId) return { memoryId, presented: true, status: 'USED', proof: traced.influence.proof };
            return { memoryId, presented: !requestedPlan, status: requestedPlan || traced ? 'UNUSED' : 'UNKNOWN' };
        });
        if (plan.reduce((n, step) => n + TOOL_REGISTRY[step.tool].cost, 0) > budget) throw new Error('BUDGET_EXCEEDED');
        const workflow = isReplenishment(plan);
        const versions = workflow ? {} : await this.business.sourceVersions(actorId, plan.filter(step => step.tool === 'purchase.create').map(step => step.input!));
        await this.business.authorize(actorId, 'agent.run');
        if (context.evidence.length) await this.business.authorize(actorId, 'memory');
        return this.store.atomic(s => {
            permit(s, actorId, 'agent.run'); const id = `execution-${++s.sequence}`;
            if (graphContext) {
                const run = s.graphRuns?.[graphContext.graphId];
                if (!run || run.inputHash !== graphContext.inputHash || run.actorId !== actorId ||
                    run.leaseOwner !== graphContext.invocationId) throw new Error('INVALID_GRAPH_CHECKPOINT');
                if (run.executionId) {
                    const existing = s.executions[run.executionId];
                    if (!existing) throw new Error('INVALID_GRAPH_CHECKPOINT');
                    return existing;
                }
            }
            const e: Execution = { id, actorId, status: !workflow && plan.some(p => TOOL_REGISTRY[p.tool].approval) ? 'AWAITING_APPROVAL' : 'PLANNED', plan, versions, hash: digest(plan, versions), revision: '1', revisions: [], spent: 0, reserved: 0, budget, result: [] };
            // Reject stale evidence if forgotten/revoked while provider was planning.
            const current = memoryAllowed ? planningContext(s, actorId, prompt, this.clock().getTime()) : context;
            if (JSON.stringify(current) !== JSON.stringify(context)) throw new Error('INVALID_MEMORY_CONTEXT');
            e.planning = { evidence: context.evidence, attribution, decision: structuredClone(plan) };
            s.executions[id] = e;
            if (graphContext) s.graphRuns![graphContext.graphId]!.executionId = id;
            return e;
        });
    }
    async revise(id: string, actorId: string, plan: Plan, expectedRevision?: string): Promise<Execution> {
        await this.business.authorize(actorId, 'agent.run');
        plan = structuredClone(plan);
        validatePlan(plan, this.allowlist);
        if (isReplenishment(plan)) throw new Error('INVALID_REVISION');
        const versions = await this.business.sourceVersions(actorId, plan.filter(step => step.tool === 'purchase.create').map(step => step.input!));
        return this.store.atomic(s => {
            permit(s, actorId, 'agent.run'); const e = s.executions[id];
            if (!e || e.actorId !== actorId || isReplenishment(e.plan) || !['PLANNED', 'AWAITING_APPROVAL'].includes(e.status) || e.spent || e.reserved) throw new Error('INVALID_REVISION');
            if (expectedRevision !== undefined && e.revision !== expectedRevision) throw new Error('INVALID_REVISION');
            if (plan.reduce((sum, step) => sum + TOOL_REGISTRY[step.tool].cost, 0) > e.budget) throw new Error('BUDGET_EXCEEDED');
            e.revisions.push({ revision: e.revision, hash: e.hash, plan: e.plan }); e.revision = (BigInt(e.revision) + 1n).toString();
            e.plan = structuredClone(plan); e.versions = versions; e.hash = digest(e.plan, e.versions, e.revision);
            e.status = plan.some(p => TOOL_REGISTRY[p.tool].approval) ? 'AWAITING_APPROVAL' : 'PLANNED'; return e;
        });
    }
    async approve(id: string, approverId: string, expiresAt: string, expectedHash?: string): Promise<Approval> {
        await this.business.authorize(approverId, 'agent.approve');
        return this.store.atomic(s => {
            permit(s, approverId, 'agent.approve'); const e = s.executions[id];
            if (!e || e.status !== 'AWAITING_APPROVAL' || !Number.isFinite(Date.parse(expiresAt)) || Date.parse(expiresAt) <= this.clock().getTime()) throw new Error('INVALID_APPROVAL');
            if ((expectedHash !== undefined || isReplenishment(e.plan)) && expectedHash !== e.hash) throw new Error('INVALID_APPROVAL');
            const approval: Approval = { id: `approval-${++s.sequence}`, executionId: id, approverId, hash: e.hash, expiresAt, revoked: false, consumed: false };
            s.approvals[approval.id] = approval; return approval;
        });
    }
    async revoke(id: string, actorId: string): Promise<void> { await this.business.authorize(actorId, 'agent.approve'); return this.store.atomic(s => { permit(s, actorId, 'agent.approve'); const a = s.approvals[id]; if (!a || a.consumed) throw new Error('INVALID_APPROVAL'); a.revoked = true; }); }
    async execute(id: string, actorId: string): Promise<Execution> {
        const perform = (business: BusinessPort, onCommit?: (publish: () => void) => void,
            onFinish?: (finish: () => void) => void) => this.store.atomic(async s => {
            await business.authorize(actorId, 'agent.run');
            permit(s, actorId, 'agent.run'); const e = s.executions[id];
            if (!e || e.actorId !== actorId) throw new Error('FORBIDDEN');
            if (e.status === 'SUCCEEDED') return e;
            if (e.status === 'FAILED' || e.status === 'CANCELLED') throw new Error('EXECUTION_TERMINAL');
            validatePlan(e.plan, this.allowlist);
            if (isReplenishment(e.plan)) return this.executeReplenishment(s, business, e, e.plan);
            if (e.hash !== digest(e.plan, e.versions, e.revision)) throw new Error('PLAN_CHANGED');
            const resumeIndex = e.result.length;
            const recovering = e.status === 'UNKNOWN' && e.plan[resumeIndex]?.tool === 'purchase.create';
            let approval: Approval | undefined;
            if (!recovering) {
                const needsApproval = e.plan.slice(resumeIndex).some(p => TOOL_REGISTRY[p.tool].approval);
                if (needsApproval) {
                    approval = Object.values(s.approvals).find(a => a.executionId === id && a.hash === e.hash &&
                        !a.revoked && Date.parse(a.expiresAt) > this.clock().getTime() &&
                        s.permissions[a.approverId]?.includes('agent.approve'));
                    if (!approval) throw new Error('APPROVAL_REQUIRED');
                    try { await business.authorize(approval.approverId, 'agent.approve'); } catch { throw new Error('APPROVAL_REQUIRED'); }
                }
                if (e.status !== 'UNKNOWN' || needsApproval) {
                    const versions = await business.sourceVersions(actorId, e.plan.filter(step => step.tool === 'purchase.create').map(step => step.input!));
                    if (digest(e.plan, versions, e.revision) !== e.hash) throw new Error('STALE_PROPOSAL');
                }
            }
            e.status = 'RUNNING';
            for (let index = e.result.length; index < e.plan.length; index++) {
                const step = e.plan[index]!; const cost = TOOL_REGISTRY[step.tool].cost;
                if (e.spent + e.reserved + (e.reserved ? 0 : cost) > e.budget) { e.status = 'FAILED'; break; }
                if (!e.reserved) e.reserved = cost;
                const recoveringPurchase = recovering && index === resumeIndex;
                const priorCall = recoveringPurchase
                    ? Object.values(s.toolCalls).find(c => c.executionId === id && c.index === index &&
                        c.tool === step.tool && c.status === 'UNKNOWN' && c.authorization?.approvalId &&
                        isDeepStrictEqual(c.input, step.input))
                    : undefined;
                if (recoveringPurchase && !priorCall) { e.status = 'UNKNOWN'; return e; }
                const call: AgentState['toolCalls'][string] = priorCall ?? {
                    id: `tool-call-${++s.sequence}`, executionId: id, index, tool: step.tool,
                    input: step.input, status: 'PENDING_AUTHORIZATION', result: null,
                };
                const callId = call.id;
                s.toolCalls[callId] = call;
                try {
                    const { permission } = TOOL_REGISTRY[step.tool];
                    await business.authorize(actorId, permission);
                    if (!recoveringPurchase) {
                        if (step.tool === 'purchase.create' && !(Date.parse(approval!.expiresAt) > this.clock().getTime())) {
                            e.reserved = 0;
                            e.status = 'AWAITING_APPROVAL';
                            this.recordStep(s, call, 'PENDING_AUTHORIZATION', 'APPROVAL_EXPIRED');
                            return e;
                        }
                        call.authorization = approval && step.tool === 'purchase.create' ? { permission, approvalId: approval.id } : { permission };
                        if (approval && step.tool === 'purchase.create') approval.consumed = true;
                        call.status = 'DISPATCHED';
                        s.audit.push({ executionId: id, tool: step.tool, status: 'DISPATCHED' });
                    }
                    let result: unknown;
                    if (step.tool === 'purchase.create') {
                        const original = { actorId, key: `${id}:${index}`, scope: 'agent.purchase', versions: e.versions };
                        // Earlier snapshots used this same deterministic command without storing it.
                        if (call.purchaseCommand && !isDeepStrictEqual(call.purchaseCommand, original)) throw new Error('VERIFICATION_FAILED');
                        const command = call.purchaseCommand ??= structuredClone(original);
                        const returned = recoveringPurchase ? undefined : await business.createPurchase(command, step.input!);
                        const response = await this.verifyPurchaseReceipt(business, command, step.input!, call, returned, recoveringPurchase);
                        if (Number.isInteger(response.status) && response.status >= 400 && response.status <= 599) { e.spent += e.reserved; e.reserved = 0; e.status = 'FAILED'; call.status = 'REJECTED'; call.result = response.body; s.evaluations.push({ id: `evaluation-${++s.sequence}`, executionId: id, toolCallId: callId, passed: false, code: 'BUSINESS_REJECTED' }); e.outcome = { verified: false, evaluationIds: s.evaluations.filter(v => v.executionId === id).map(v => v.id) }; s.audit.push({ executionId: id, tool: step.tool, status: 'REJECTED' }); return e; }
                        if (response.status !== 200) throw new Error('VERIFICATION_FAILED');
                        result = response.body;
                    } else {
                        result = step.tool === 'inventory.read' ? await business.inventory(actorId) : await business.recommendInventory(actorId);
                    }
                    if (!verifiedResult(step, result)) throw new Error('VERIFICATION_FAILED');
                    call.verifiedAt = this.clock().toISOString();
                    call.result = result; call.status = 'VERIFIED'; s.evaluations.push({ id: `evaluation-${++s.sequence}`, executionId: id, toolCallId: callId, passed: true, code: 'RESULT_VERIFIED' });
                    e.result.push(result); e.spent += e.reserved; e.reserved = 0;
                    s.audit.push({ executionId: id, tool: step.tool, status: 'VERIFIED' });
                } catch { e.status = 'UNKNOWN'; call.status = 'UNKNOWN'; s.evaluations.push({ id: `evaluation-${++s.sequence}`, executionId: id, toolCallId: callId, passed: false, code: 'RESULT_UNVERIFIED' }); e.outcome = { verified: false, evaluationIds: s.evaluations.filter(v => v.executionId === id).map(v => v.id) }; s.audit.push({ executionId: id, tool: step.tool, status: 'UNKNOWN' }); return e; }
                if (recoveringPurchase && e.result.length < e.plan.length) {
                    e.status = e.plan.slice(e.result.length).some(p => TOOL_REGISTRY[p.tool].approval) ? 'AWAITING_APPROVAL' : 'PLANNED';
                    return this.finishOutcome(s, business, e);
                }
            }
            if (e.result.length === e.plan.length) e.status = 'SUCCEEDED';
            return this.finishOutcome(s, business, e);
        }, onCommit, onFinish);
        // Only an explicitly constructed READ-only graph (both legacy allowlist
        // and authoritative BusinessPort tools) may use a standalone PG checkpoint
        // transaction. No purchase or cross-database business write is possible.
        if (this.readOnlyGraphExecution) return perform(this.business);
        return this.business.atomic((business, onCommit, onFinish) => perform(business, onCommit, onFinish));
    }
    async cancel(id: string, actorId: string): Promise<Execution> {
        return this.business.atomic((business, commit, finish) => this.store.atomic(async s => {
            await business.authorize(actorId, 'agent.run');
            permit(s, actorId, 'agent.run');
            const e = s.executions[id];
            if (!e || e.actorId !== actorId) throw new Error('FORBIDDEN');
            if (e.status === 'CANCELLED') return e;
            if (!isReplenishment(e.plan) || (e.status !== 'PLANNED' && e.status !== 'AWAITING_APPROVAL')) throw new Error('EXECUTION_TERMINAL');
            e.status = 'CANCELLED';
            for (const approval of Object.values(s.approvals)) if (approval.executionId === id && !approval.consumed) approval.revoked = true;
            this.skipSteps(s, e, e.plan, e.result.length, 'CANCELLED');
            return this.finishOutcome(s, business, e);
        }, commit, finish));
    }
    private async verifyPurchaseReceipt(business: BusinessPort, command: PurchaseCommand, proposal: PurchaseProposal, call: AgentState['toolCalls'][string], returned: PurchaseResult | undefined, reconcile: boolean) {
        const receipt = await business.purchaseReceipt(command, proposal);
        if (!receipt || (call.receipt && (call.receipt.key !== receipt.key || call.receipt.requestHash !== receipt.requestHash))) throw new Error('VERIFICATION_FAILED');
        const proof = { key: receipt.key, requestHash: receipt.requestHash };
        if (!reconcile && !isDeepStrictEqual(returned, receipt.response)) {
            // Retain authoritative linkage for legacy calls even when their response disagrees.
            if (call.purchaseCommand) call.receipt = proof;
            throw new Error('VERIFICATION_FAILED');
        }
        call.receipt = proof;
        return receipt.response;
    }
    private recordStep(s: AgentState, call: AgentState['toolCalls'][string], status: string, code?: string) {
        call.status = status;
        s.audit.push({ executionId: call.executionId, tool: call.tool, status, stepId: call.stepId, attempt: call.attempts });
        if (code) s.evaluations.push({
            id: `evaluation-${++s.sequence}`, executionId: call.executionId, toolCallId: call.id, passed: status === 'VERIFIED', code,
        });
    }
    private stepCall(s: AgentState, e: Execution, plan: ReplenishmentPlan, index: number) {
        const step = plan[index]!;
        const id = `tool-call:${e.id}:${e.revision}:${step.id}`;
        return s.toolCalls[id] ??= { id, executionId: e.id, index, tool: step.tool, stepId: step.id, input: step.input, status: 'PENDING_AUTHORIZATION', result: null, attempts: 0 };
    }
    private skipSteps(s: AgentState, e: Execution, plan: ReplenishmentPlan, index: number, code: string) {
        for (; index < plan.length; index++) this.recordStep(s, this.stepCall(s, e, plan, index), 'SKIPPED', code);
    }
    private async executeReplenishment(s: AgentState, business: BusinessPort, e: Execution, plan: ReplenishmentPlan) {
        const prepared = preparedProposal(e);
        const requested = e.result[4] as ReplenishmentOutputs['approval'] | undefined;
        if (e.hash !== digest(plan, e.versions, e.revision, prepared?.proposal) ||
            (prepared && !isDeepStrictEqual(prepared.versions, e.versions)) ||
            (e.result.length >= 5 && (!prepared || requested?.requiredRole !== 'ADMIN' || requested.proposalHash !== e.hash))) throw new Error('PLAN_CHANGED');
        const reconcile = e.status === 'UNKNOWN';
        const verifiedSteps = new Set(Object.values(s.toolCalls).filter(c => c.executionId === e.id && c.status === 'VERIFIED').map(c => c.stepId));
        const actor = e.actorId;
        for (let index = e.result.length; index < plan.length; index++) {
            const step = plan[index]!;
            const { cost, permission, attempts } = TOOL_REGISTRY[step.tool];
            let approval: Approval | undefined;
            if (step.tool === 'purchase.create' && !reconcile && step.dependsOn.every(id => verifiedSteps.has(id))) {
                for (const candidate of Object.values(s.approvals)) {
                    if (candidate.executionId !== e.id || candidate.hash !== e.hash || candidate.revoked || candidate.consumed ||
                        !(Date.parse(candidate.expiresAt) > this.clock().getTime()) || !s.permissions[candidate.approverId]?.includes('agent.approve')) continue;
                    try { await business.authorize(candidate.approverId, 'agent.approve'); }
                    catch (error) { if (stepError(error) === 'FORBIDDEN') continue; throw error; }
                    approval = candidate;
                    break;
                }
                if (!approval) { e.status = 'AWAITING_APPROVAL'; return e; }
            }
            const call = this.stepCall(s, e, plan, index);
            const fail = (code: string, status = 'FAILED') => {
                e.status = 'FAILED';
                this.recordStep(s, call, status, code);
                this.skipSteps(s, e, plan, index + 1, 'DEPENDENCY_FAILED');
                return this.finishOutcome(s, business, e);
            };
            if (reconcile && (step.tool !== 'purchase.create' || call.status !== 'UNKNOWN' ||
                !call.authorization?.approvalId || !prepared || e.reserved !== cost ||
                !isDeepStrictEqual(call.input, prepared.proposal) || step.dependsOn.some(id => !verifiedSteps.has(id)))) throw new Error('PLAN_CHANGED');
            if (step.dependsOn.some(id => !verifiedSteps.has(id))) return fail('DEPENDENCY_FAILED', 'SKIPPED');
            try { await business.authorize(actor, permission); }
            catch (error) {
                if (stepError(error) !== 'FORBIDDEN') throw error;
                if (!reconcile) return fail('FORBIDDEN', 'DENIED');
                this.recordStep(s, call, 'UNKNOWN', 'RECONCILIATION_DENIED');
                return this.finishOutcome(s, business, e);
            }
            if (step.tool === 'purchase.create') {
                const proposal = prepared!.proposal;
                if (!reconcile) {
                    if (e.spent + cost > e.budget) return fail('BUDGET_EXCEEDED');
                    try {
                        const versions = await business.sourceVersions(actor, [proposal]);
                        const lowStock = this.targetedLowStock(await this.lowStock(business, actor), plan[2].input);
                        const reviewedStock = this.targetedLowStock(e.result[1] as ReplenishmentOutputs['low-stock'], plan[2].input);
                        if (!isDeepStrictEqual(versions, e.versions) || !isDeepStrictEqual(lowStock, reviewedStock)) return fail('STALE_PROPOSAL');
                    } catch (error) {
                        const code = stepError(error);
                        if (code) return fail(code, code === 'FORBIDDEN' ? 'DENIED' : 'FAILED');
                        throw error;
                    }
                    if (!(Date.parse(approval!.expiresAt) > this.clock().getTime())) {
                        e.status = 'AWAITING_APPROVAL';
                        this.recordStep(s, call, 'PENDING_AUTHORIZATION', 'APPROVAL_EXPIRED');
                        return e;
                    }
                    approval!.consumed = true;
                    call.input = proposal;
                    call.authorization = { permission, approvalId: approval!.id };
                    call.attempts = 1;
                    e.reserved = cost;
                }
                e.status = 'RUNNING';
                this.recordStep(s, call, reconcile ? 'RECONCILING' : 'DISPATCHED');
                const command = { actorId: actor, key: call.id, scope: 'agent.replenishment', versions: e.versions };
                const rolledBack = Symbol();
                let response: PurchaseResult;
                try {
                    const returned = reconcile ? undefined : await business.createPurchase(command, proposal).catch((error: unknown): typeof rolledBack => {
                        if (error instanceof Error && (error as { outcome?: string }).outcome === 'ROLLED_BACK') return rolledBack;
                        throw error;
                    });
                    if (returned === rolledBack) {
                        e.spent += e.reserved;
                        e.reserved = 0;
                        return fail('BUSINESS_ROLLED_BACK', 'ROLLED_BACK');
                    }
                    response = await this.verifyPurchaseReceipt(business, command, proposal, call, returned, reconcile);
                    if (response.status === 200) {
                        if (!verifiedResult({ tool: 'purchase.create', input: proposal }, response.body)) throw new Error('VERIFICATION_FAILED');
                        const purchase = response.body as ReplenishmentOutputs['purchase'];
                        const recommendations = e.result[2] as ReplenishmentOutputs['recommendations'];
                        if (!purchase.lines.every((line, i) => line.packs === recommendations[i]?.packs &&
                            line.quoteVersion === recommendations[i]?.quoteVersion)) throw new Error('VERIFICATION_FAILED');
                    } else if (!Number.isInteger(response.status) || response.status < 400 || response.status > 599) {
                        throw new Error('VERIFICATION_FAILED');
                    }
                } catch {
                    e.status = 'UNKNOWN';
                    this.recordStep(s, call, 'UNKNOWN', 'RESULT_UNVERIFIED');
                    return this.finishOutcome(s, business, e);
                }
                e.spent += e.reserved;
                e.reserved = 0;
                if (response.status >= 400) {
                    call.result = response.body;
                    return fail('BUSINESS_REJECTED', 'REJECTED');
                }
                call.result = response.body;
            } else {
                e.status = 'RUNNING';
                call.authorization = { permission };
                if (step.tool === 'purchase.requestApproval' && e.spent + cost + TOOL_REGISTRY['purchase.create'].cost > e.budget) return fail('BUDGET_EXCEEDED');
                for (let attempt = 1; attempt <= attempts; attempt++) {
                    if (e.spent + cost > e.budget) return fail('BUDGET_EXCEEDED');
                    e.spent += cost;
                    call.attempts = attempt;
                    this.recordStep(s, call, 'DISPATCHED');
                    try {
                        call.result = await this.runPreparationStep(business, e, plan, step);
                        break;
                    } catch (error) {
                        const code = stepError(error);
                        if (code || attempt === attempts) return fail(code ?? 'STEP_FAILED');
                        this.recordStep(s, call, 'RETRYABLE_FAILURE', 'READ_FAILED');
                    }
                }
            }
            call.verifiedAt = this.clock().toISOString();
            this.recordStep(s, call, 'VERIFIED', 'RESULT_VERIFIED');
            e.result.push(call.result);
            verifiedSteps.add(step.id);
            if (step.tool === 'purchase.requestApproval') {
                e.status = 'AWAITING_APPROVAL';
                s.audit.push({ executionId: e.id, tool: call.tool, stepId: step.id, status: 'AWAITING_APPROVAL' });
                return e;
            }
        }
        e.status = 'SUCCEEDED';
        return this.finishOutcome(s, business, e);
    }
    private async lowStock(business: BusinessPort, actor: string, snapshot?: InventoryRow[]): Promise<ReplenishmentOutputs['low-stock']> {
        const rows = await business.recommendInventory(actor, snapshot);
        if (!verifiedResult({ tool: 'inventory.recommend', input: null }, rows)) throw new Error('VERIFICATION_FAILED');
        return (rows as ReplenishmentOutputs['low-stock']).filter(row => decimal(row.recommendedBaseQuantity)! > 0n);
    }
    private targetedLowStock(rows: ReplenishmentOutputs['low-stock'], input: ReplenishmentInput) {
        return rows.filter(row => Object.hasOwn(input.unitCosts, row.ingredientId));
    }
    private async runPreparationStep(business: BusinessPort, e: Execution, plan: ReplenishmentPlan, step: Exclude<ReplenishmentPlan[number], { tool: 'purchase.create' }>): Promise<ReplenishmentOutputs[typeof step.id]> {
        const actor = e.actorId;
        switch (step.tool) {
            case 'inventory.read': {
                const rows = await business.inventory(actor);
                if (!verifiedResult(step, rows)) throw new Error('VERIFICATION_FAILED');
                return rows;
            }
            case 'inventory.analyze':
                return this.lowStock(business, actor, e.result[0] as ReplenishmentOutputs['inventory']);
            case 'purchase.recommend': {
                const lowStock = this.targetedLowStock(e.result[1] as ReplenishmentOutputs['low-stock'], step.input);
                if (!lowStock.length) throw new Error('NO_PURCHASE_RECOMMENDATIONS');
                if (!business.purchaseQuotes) throw new Error('TOOL_UNAVAILABLE');
                const quotes = await business.purchaseQuotes(actor, step.input.supplierId);
                return lowStock.map(row => {
                    const matches = quotes.filter(quote => quote?.ingredientId === row.ingredientId && quote.active && quote.supplierId === step.input.supplierId);
                    const quote = matches[0];
                    const conversion = decimal(quote?.conversionQuantity);
                    if (matches.length !== 1 || !quote || !version(quote.version) || !identifier(quote.purchaseUnit) || !conversion) throw new Error('QUOTE_UNAVAILABLE');
                    const needed = decimal(row.recommendedBaseQuantity)!;
                    const packs = (needed + conversion - 1n) / conversion;
                    const quantity = packs * conversion;
                    if (quantity >= 100_000_000_000_000n) throw new Error('INVALID_PURCHASE_QUANTITY');
                    const fraction = (quantity % 1000n).toString().padStart(3, '0').replace(/0+$/, '');
                    return { ingredientId: row.ingredientId, quantity: `${quantity / 1000n}${fraction ? '.' + fraction : ''}`, unitCost: step.input.unitCosts[row.ingredientId]!, packs: packs.toString(), quoteVersion: quote.version };
                });
            }
            case 'purchase.prepare': {
                const recommendations = e.result[2] as ReplenishmentOutputs['recommendations'];
                const proposal = { supplierId: plan[2].input.supplierId, lines: recommendations.map(({ ingredientId, quantity, unitCost }) => ({ ingredientId, quantity, unitCost })) };
                const versions = await business.sourceVersions(actor, [proposal]);
                e.versions = versions;
                e.hash = digest(plan, versions, e.revision, proposal);
                return { proposal, versions };
            }
            case 'purchase.requestApproval':
                return { requiredRole: 'ADMIN', proposalHash: e.hash };
        }
    }
    private async finishOutcome(s: AgentState, business: BusinessPort, e: Execution) {
        e.outcome = { verified: e.status === 'SUCCEEDED', evaluationIds: s.evaluations.filter(v => v.executionId === e.id).map(v => v.id) };
        if (!e.outcome.verified || !s.permissions[e.actorId]?.includes('memory')) return e;
        try { await business.authorize(e.actorId, 'memory'); } catch { return e; }
        for (const m of Object.values(s.memories)) {
            if (m.ownerId !== e.actorId || !m.learned || !activeMemory(m, this.clock().getTime())) continue;
            const sources = verifiedSources(s, m);
            if (sources.length) { m.provenance = sources; m.confidence = 0.9; }
        }
        return e;
    }
    async remember(ownerId: string, text: string): Promise<Memory> { await this.business.authorize(ownerId, 'memory'); return this.store.atomic(s => { permit(s, ownerId, 'memory'); if (!text.trim() || text.length > 4000) throw new Error('INVALID_MEMORY'); const m = { id: `memory-${++s.sequence}`, ownerId, text, learned: false }; s.memories[m.id] = m; return m; }); }
    async retrieve(ownerId: string, query: string): Promise<Memory[]> { await this.business.authorize(ownerId, 'memory'); return this.store.atomic(s => { permit(s, ownerId, 'memory'); return Object.values(s.memories).filter(m => m.ownerId === ownerId && activeMemory(m, this.clock().getTime()) && (!query || relevance(m.text, query) >= 0.5)); }); }
    async learn(ownerId: string, id: string): Promise<Memory> { await this.business.authorize(ownerId, 'memory'); return this.store.atomic(s => { permit(s, ownerId, 'memory'); const m = s.memories[id]; if (!m || m.ownerId !== ownerId || !activeMemory(m, this.clock().getTime())) throw new Error('FORBIDDEN'); m.learned = true; m.provenance = verifiedSources(s, m); m.confidence = m.provenance.length ? 0.9 : 0; return m; }); }
    async consolidate(ownerId: string): Promise<Memory[]> { await this.business.authorize(ownerId, 'memory'); return this.store.atomic(s => { permit(s, ownerId, 'memory'); const seen = new Map<string, Memory>(); for (const m of Object.values(s.memories).filter(m => m.ownerId === ownerId && activeMemory(m, this.clock().getTime()))) { const key = m.text.trim().toLowerCase().replace(/\s+/g, ' '); const prior = seen.get(key); if (prior && prior.expiresAt === m.expiresAt) { prior.learned ||= m.learned; prior.confidence = Math.max(prior.confidence ?? 0, m.confidence ?? 0); prior.provenance = [...new Map([...(prior.provenance ?? []), ...(m.provenance ?? [])].map(p => [JSON.stringify(p), p])).values()]; prior.sourceIds = [...new Set([...(prior.sourceIds ?? [prior.id]), ...(m.sourceIds ?? [m.id])])]; delete s.memories[m.id]; } else seen.set(key, m); } return Object.values(s.memories).filter(m => m.ownerId === ownerId && activeMemory(m, this.clock().getTime())); }); }
    async forget(ownerId: string, id: string): Promise<void> { await this.business.authorize(ownerId, 'memory'); return this.store.atomic(s => { permit(s, ownerId, 'memory'); const m = s.memories[id] ?? Object.values(s.memories).find(m => m.sourceIds?.includes(id)); if (!m || m.ownerId !== ownerId) throw new Error('FORBIDDEN'); m.forgotten = true; m.text = ''; m.provenance = []; m.confidence = 0; }); }
}

/** Backend-only READ entry point; legacy persistence, approval and memory are unavailable. */
export function createReadOnlyAgentRuntime(
    business: Pick<BusinessPort, 'authorize' | 'toolRegistry'>,
    config: Record<string, string | undefined> = process.env
): AgentWorkflow {
    const capabilities = business.toolRegistry?.capabilities();
    if (!capabilities || capabilities.some(item => item.bound && item.mode !== 'BACKEND')) throw new Error('REAL_BACKEND_REGISTRY_REQUIRED');
    return new AgentWorkflow(null, business, {
        plan: async () => { throw new Error('READ_ONLY_WORKFLOW_LEGACY_DISABLED'); },
        planDynamic: async (prompt, tools, context) => {
            const { generateConfiguredLlmPlan } = await import('../services/llm-planner.service');
            return generateConfiguredLlmPlan(prompt, tools, config, context?.toolChoicePolicy);
        },
    });
}

export function createGeminiPlanner(
    legacy: LLMProvider = new MockLLMProvider()
): LLMProvider {
    return {
        plan: (prompt, context) =>
            legacy.plan(prompt, context),

        planDynamic: async (prompt, tools) => {
            const { geminiService } = await import(
                '../services/gemini.service'
            );

            return geminiService.generateDynamicPlan(prompt, tools);
        }
    };
}

/** Independent Agent composition boundary; no implicit production mock or Prisma import. */

export function createAgentRuntime(
    business: BusinessPort,
    runtimeEnv: Record<string, string | undefined> = process.env,
    llm?: LLMProvider
): AgentWorkflow {
    const config = {
        ...runtimeEnv
    };

    // Keep existing production and database safety gates.
    if (config.NODE_ENV === 'production' && !config.DATA_PROVIDER) {
        throw new Error('Production requires explicit DATA_PROVIDER');
    }

    if (config.DATA_PROVIDER === 'postgres') {
        throw new Error(
            'POSTGRES_NOT_VERIFIED: Agent approval/memory adapter unavailable'
        );
    }

    if (
        config.NODE_ENV === 'production' ||
        (config.DATA_PROVIDER !== undefined &&
         config.DATA_PROVIDER !== 'mock')
    ) {
        throw new Error('Invalid Agent provider');
    }

    const requestedProvider = (
        config.AGENT_PLANNER_PROVIDER || 'mock'
    ).trim().toLowerCase();

    // "chatgpt" is an alias of the OpenAI API provider.
    const providerName =
        requestedProvider === 'chatgpt'
            ? 'openai'
            : requestedProvider;

    if (!['mock', 'gemini', 'openai', 'anthropic', 'openai-compatible'].includes(providerName)) {
        throw new Error('INVALID_LLM_PROVIDER');
    }

    const provider: LLMProvider = llm ?? {
        // Preserve existing legacy planning behavior.
        plan: (prompt, context) =>
            new MockLLMProvider().plan(prompt, context),

        planDynamic: async (prompt, tools, context) => {
            if (providerName === 'mock' && !config.LLM_MODEL && !config.LLM_PROVIDER) {
                throw new Error('DYNAMIC_PLANNER_NOT_CONFIGURED');
            }

            // Preserve historical Gemini configuration while unified LLM_MODEL is unset.
            if (providerName === 'gemini' && !config.LLM_MODEL && !config.GEMINI_MODEL) {
                const { geminiService } = await import('../services/gemini.service');
                return geminiService.generateDynamicPlan(prompt, tools);
            }

            const { generateConfiguredLlmPlan } = await import('../services/llm-planner.service');
            return generateConfiguredLlmPlan(prompt, tools, config, context?.toolChoicePolicy);
        }
    };

    return new AgentWorkflow(
        new MockAgentRepository(),
        business,
        provider
    );
}
