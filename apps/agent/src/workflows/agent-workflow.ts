import { createHash } from 'node:crypto';
import { isDeepStrictEqual } from 'node:util';
import { replenishmentPlan, validateReplenishmentPlan } from './replenishment';
import type { InventoryRow, PurchaseProposal, ReplenishmentInput, ReplenishmentOutputs, ReplenishmentPlan, SupplierQuote } from './replenishment';
export type { PurchaseProposal, ReplenishmentInput, ReplenishmentOutputs, ReplenishmentPlan } from './replenishment';

type LegacyTool = 'inventory.read' | 'inventory.recommend' | 'purchase.create';
type LegacyStep = { tool: LegacyTool; input: PurchaseProposal | null };
export type ToolName = LegacyTool | ReplenishmentPlan[number]['tool'];
type PurchaseCommand = { actorId: string; key: string; scope: string; versions: Record<string, string> };
type PurchaseResult = { status: number; body: unknown };
type PurchaseReceiptProof = { key: string; requestHash: string };
export type Plan = LegacyStep[] | ReplenishmentPlan;
export interface BusinessPort {
    authorize(actorId: string, permission: string): Promise<unknown>;
    sourceVersions(actorId: string, proposals: PurchaseProposal[]): Promise<Record<string, string>>;
    atomic<T>(work: (business: BusinessPort, onCommit: (publish: () => void) => void, onFinish: (finish: () => void) => void) => Promise<T>): Promise<T>;
    inventory(actorId: string): Promise<InventoryRow[]>;
    recommendInventory(actorId: string, snapshot?: InventoryRow[]): Promise<unknown[]>;
    purchaseQuotes?(actorId: string, supplierId: string): Promise<(SupplierQuote | undefined)[]>;
    createPurchase(command: PurchaseCommand, proposal: PurchaseProposal): Promise<PurchaseResult>;
    purchaseReceipt(command: PurchaseCommand, proposal: PurchaseProposal): Promise<(PurchaseReceiptProof & { response: PurchaseResult }) | undefined>;
}
export type MemoryEvidence = { memoryId: string; executionIds: string[]; evaluationIds: string[]; tool: ToolName; relevance: number; confidence: number };
export type PlanningContext = { trust: 'untrusted-evidence-only'; evidence: MemoryEvidence[]; maxTokens: 2048 };
type InventoryTool = 'inventory.read' | 'inventory.recommend';
type MemoryDecisionProof = {
    kind: 'MOCK_INVENTORY_SELECTION'; stepIndex: 0; selectedTool: InventoryTool;
    alternativeTool: InventoryTool; without: 'ALL_HINTS' | 'SELECTED_HINT';
};
type MemoryAttribution = { memoryId: string; presented?: boolean; status: 'USED' | 'UNUSED' | 'UNKNOWN'; proof?: MemoryDecisionProof };
type PlanningEvidence = { evidence: MemoryEvidence[]; attribution?: MemoryAttribution[]; decision: Plan };
export interface LLMProvider { plan(prompt: string, context?: PlanningContext): Promise<Plan> }
const mockDecision = Symbol('mockDecision');
const inventoryHint = (e: MemoryEvidence): e is MemoryEvidence & { tool: InventoryTool } =>
    e.tool === 'inventory.read' || e.tool === 'inventory.recommend';
export class MockLLMProvider implements LLMProvider {
    constructor(private readonly steps?: Plan) {}
    async plan(prompt: string, context?: PlanningContext): Promise<Plan> {
        return this[mockDecision](prompt, context).plan;
    }
    [mockDecision](prompt: string, context?: PlanningContext): {
        plan: Plan; influence?: { memoryId: string; proof: MemoryDecisionProof };
    } {
        if (this.steps) return { plan: structuredClone(this.steps) };
        if (prompt.startsWith('purchase:')) return { plan: [{ tool: 'purchase.create', input: JSON.parse(prompt.slice(9)) }] };
        if (prompt === 'recommend') return { plan: [{ tool: 'inventory.recommend', input: null }] };
        const [hint, nextHint] = context?.evidence.filter(inventoryHint) ?? [];
        const selectedTool = hint?.tool ?? 'inventory.read';
        const plan: Plan = [{ tool: selectedTool, input: null }];
        if (!hint) return { plan };
        // The default without hints is read. A ranked read hint can also displace a recommendation.
        const without = selectedTool === 'inventory.recommend' ? 'ALL_HINTS' : 'SELECTED_HINT';
        const alternativeTool = without === 'ALL_HINTS' ? 'inventory.read' : nextHint?.tool ?? 'inventory.read';
        if (selectedTool === alternativeTool) return { plan };
        return { plan, influence: { memoryId: hint.memoryId, proof: { kind: 'MOCK_INVENTORY_SELECTION', stepIndex: 0, selectedTool, alternativeTool, without } } };
    }
}
export type Execution = { id: string; actorId: string; status: 'PLANNED' | 'AWAITING_APPROVAL' | 'RUNNING' | 'SUCCEEDED' | 'FAILED' | 'UNKNOWN' | 'CANCELLED'; plan: Plan; hash: string; revision: string; revisions: { revision: string; hash: string; plan: Plan }[]; versions: Record<string, string>; spent: number; reserved: number; budget: number; result: unknown[]; planning?: PlanningEvidence; outcome?: { verified: boolean; evaluationIds: string[] } };
export type Approval = { id: string; executionId: string; approverId: string; hash: string; expiresAt: string; revoked: boolean; consumed: boolean };
export type Memory = { id: string; ownerId: string; text: string; learned: boolean; confidence?: number; expiresAt?: string; revoked?: boolean; forgotten?: boolean; provenance?: { executionId: string; evaluationIds: string[]; tool: ToolName }[]; sourceIds?: string[] };
export type AgentState = { sequence: number; executions: Record<string, Execution>; approvals: Record<string, Approval>; audit: { executionId: string; tool: string; status: string; stepId?: string; attempt?: number }[]; memories: Record<string, Memory>; permissions: Record<string, string[]>;
    operations: Record<string, { hash: string; actorId: string; response: { status: number; body: unknown } }>;
    toolCalls: Record<string, {
        id: string; executionId: string; index: number; tool: ToolName; input: unknown; status: string; result: unknown;
        authorization?: { permission: string; approvalId?: string };
        purchaseCommand?: PurchaseCommand;
        receipt?: PurchaseReceiptProof;
        verifiedAt?: string;
        stepId?: string;
        attempts?: number;
    }>;
    evaluations: { id: string; executionId: string; toolCallId: string; passed: boolean; code: string }[];
};
export interface AgentExecutionRepository { execution(id: string): Promise<Execution | undefined> }
export interface AgentApprovalRepository { approve(id: string, approverId: string, expiresAt: string): Promise<Approval>; revoke(id: string, actorId: string): Promise<void> }
export interface MemoryLearning { remember(ownerId: string, text: string): Promise<Memory>; retrieve(ownerId: string, query: string): Promise<Memory[]>; learn(ownerId: string, id: string): Promise<Memory>; consolidate(ownerId: string): Promise<Memory[]>; forget(ownerId: string, id: string): Promise<void> }
export interface AgentRepository extends AgentExecutionRepository {
    atomic<T>(work: (state: AgentState) => Promise<T> | T, onCommit?: (publish: () => void) => void, onFinish?: (finish: () => void) => void): Promise<T>;
}
export class MockAgentRepository implements AgentRepository {
    private state: AgentState;
    private tail = Promise.resolve();
    private fault: 'beforeCommit' | 'afterCommit' | undefined;
    private prepared: AgentState | undefined;
    constructor(seed?: AgentState, private readonly persist?: (state: AgentState) => void) {
        this.state = structuredClone(seed ?? { sequence: 0, executions: {}, approvals: {}, audit: [], memories: {}, operations: {}, toolCalls: {}, evaluations: [], permissions: { admin: ['agent.run', 'agent.approve', 'memory'], staff: ['agent.run', 'memory'], agent: ['agent.run', 'memory'] } });
        this.state.operations ??= {}; this.state.toolCalls ??= {}; this.state.evaluations ??= [];
    }
    snapshot(): AgentState { return structuredClone(this.state); }
    preparedSnapshot(): AgentState { return structuredClone(this.prepared ?? this.state); }
    injectFault(point: 'beforeCommit' | 'afterCommit'): void { this.fault = point; }
    private hit(point: 'beforeCommit' | 'afterCommit'): void { if (this.fault === point) { this.fault = undefined; throw new Error(`INJECTED_${point}`); } }
    async atomic<T>(work: (state: AgentState) => Promise<T> | T, onCommit?: (publish: () => void) => void, onFinish?: (finish: () => void) => void): Promise<T> {
        const prior = this.tail; let release!: () => void; this.tail = new Promise<void>(resolve => { release = resolve; }); await prior;
        try {
            const draft = structuredClone(this.state); const result = structuredClone(await work(draft)); this.hit('beforeCommit');
            if (onCommit) { this.prepared = draft; onCommit(() => { this.state = draft; this.hit('afterCommit'); }); }
            else { this.persist?.(draft); this.state = draft; this.hit('afterCommit'); }
            return result;
        } finally { const finish = () => { this.prepared = undefined; release(); }; if (onFinish) onFinish(finish); else finish(); }
    }
    async execution(id: string) { return this.atomic(s => s.executions[id]); }
}
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
/** Planner/Executor/Verifier; purchasing and stock rules belong exclusively to BusinessPort. */
export class AgentWorkflow implements AgentApprovalRepository, MemoryLearning {
    private readonly allowlist: readonly ToolName[];
    constructor(private readonly store: AgentRepository, private readonly business: BusinessPort, private readonly llm: LLMProvider, allowlist: readonly ToolName[] = allowed, private readonly clock = () => new Date()) { this.allowlist = Object.freeze([...allowlist]); }
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
    async plan(actorId: string, prompt: string, budget: number, replenishment?: ReplenishmentInput): Promise<Execution> {
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
            const e: Execution = { id, actorId, status: !workflow && plan.some(p => TOOL_REGISTRY[p.tool].approval) ? 'AWAITING_APPROVAL' : 'PLANNED', plan, versions, hash: digest(plan, versions), revision: '1', revisions: [], spent: 0, reserved: 0, budget, result: [] };
            // Reject stale evidence if forgotten/revoked while provider was planning.
            const current = memoryAllowed ? planningContext(s, actorId, prompt, this.clock().getTime()) : context;
            if (JSON.stringify(current) !== JSON.stringify(context)) throw new Error('INVALID_MEMORY_CONTEXT');
            e.planning = { evidence: context.evidence, attribution, decision: structuredClone(plan) };
            s.executions[id] = e; return e;
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
        return this.business.atomic((business, onCommit, onFinish) => this.store.atomic(async s => {
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
        }, onCommit, onFinish));
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

/** Independent Agent composition boundary; no implicit production mock or Prisma import. */
export function createAgentRuntime(business: BusinessPort, env: Record<string, string | undefined> = process.env, llm?: LLMProvider): AgentWorkflow {
    if (env.NODE_ENV === 'production' && !env.DATA_PROVIDER) throw new Error('Production requires explicit DATA_PROVIDER');
    if (env.DATA_PROVIDER === 'postgres') throw new Error('POSTGRES_NOT_VERIFIED: Agent approval/memory adapter unavailable');
    if (env.NODE_ENV === 'production' || (env.DATA_PROVIDER !== undefined && env.DATA_PROVIDER !== 'mock')) throw new Error('Invalid Agent provider');
    return new AgentWorkflow(new MockAgentRepository(), business, llm ?? new MockLLMProvider());
}
