/**
 * ACT read-only dispatch policy for the EXISTING UnifiedToolRegistry.
 * This is a leaf operation, NOT a second Graph, planner, or purchasing engine.
 * The Graph owner must explicitly bind a durable checkpoint implementation before
 * this can be called from production. Do not treat isolated calls as E2E proof.
 */
import { TOOL_CONTRACTS } from '../../workflows/tool-contracts';
import type { ToolOutcome, UnifiedToolRegistry } from '../../workflows/tool-registry';

export type ActReadEvent = {
    runId: string;
    stepId: string;
    actorId: string;
    tool: string;
    attempt: number;
    at: string;
    status: 'STARTED' | 'RETRY_SCHEDULED' | 'SUCCEEDED' | 'HELD';
    code?: string;
};
export type ActReadStep = {
    runId: string;
    stepId: string;
    actorId: string;
    tool: string;
    input: unknown;
    version?: string;
    dependencies?: readonly string[];
    completedDependencies?: readonly string[];
    expectedSourceVersion?: string;
};
export type ActReadBoundary = {
    registry: UnifiedToolRegistry;
    /** The caller supplies its authenticated actor, never a model-provided substitute. */
    authorize(actorId: string, permission: string): Promise<unknown>;
    /** Must durably persist BEFORE dispatch; failures abort instead of silently logging. */
    checkpoint(event: ActReadEvent): Promise<void>;
    /** Fresh authoritative version, not a cached Perception/LLM observation. */
    sourceVersion?(): Promise<string>;
    now?(): Date;
};
export type ActReadResult = {
    status: 'SUCCEEDED' | 'HELD_POLICY';
    attempts: number;
    outcome?: Extract<ToolOutcome, { ok: true }>;
    code?: string;
};

const safeId = /^[A-Za-z0-9][A-Za-z0-9:_-]{0,119}$/;
const transient = new Set(['TIMEOUT', 'BACKEND_FAILURE']);

/** Never retries WRITE, unauthorized, invalid, unbound or stale operations. */
export async function executeActReadStep(step: ActReadStep, boundary: ActReadBoundary): Promise<ActReadResult> {
    const now = () => (boundary.now?.() ?? new Date()).toISOString();
    const event = (status: ActReadEvent['status'], attempt: number, code?: string): ActReadEvent => ({
        runId: step.runId, stepId: step.stepId, actorId: step.actorId, tool: step.tool,
        attempt, at: now(), status, ...(code ? { code } : {})
    });
    const hold = async (code: string, attempt: number): Promise<ActReadResult> => {
        await boundary.checkpoint(event('HELD', attempt, code));
        return { status: 'HELD_POLICY', attempts: attempt, code };
    };
    if (![step.runId, step.stepId, step.actorId].every(v => typeof v === 'string' && safeId.test(v)) ||
        typeof step.tool !== 'string') return hold('INVALID_ACT_REQUEST', 0);
    const catalog = Object.prototype.hasOwnProperty.call(TOOL_CONTRACTS, step.tool)
        ? TOOL_CONTRACTS[step.tool as keyof typeof TOOL_CONTRACTS] : undefined;
    // Classification is independent of capability binding; WRITE cannot be retried.
    if (!catalog || catalog.category !== 'READ' || catalog.status !== 'IMPLEMENTED') {
        return hold('TOOL_DENIED', 0);
    }
    if (step.version && step.version !== catalog.version) return hold('VERSION_MISMATCH', 0);
    if (!catalog.input.safeParse(step.input).success) return hold('INVALID_INPUT', 0);
    const completed = new Set(step.completedDependencies ?? []);
    if ((step.dependencies ?? []).some(dependency => !completed.has(dependency))) {
        return hold('DEPENDENCY_NOT_VERIFIED', 0);
    }
    if (!boundary.registry.capabilities().some(capability => capability.name === step.tool &&
        capability.version === catalog.version && capability.bound)) return hold('TOOL_NOT_AVAILABLE', 0);
    if (step.expectedSourceVersion !== undefined && !boundary.sourceVersion) {
        return hold('STALE_CONTEXT', 0);
    }
    for (let attempt = 1; attempt <= 2; attempt++) {
        try {
            await boundary.authorize(step.actorId, 'agent.run');
            await boundary.authorize(step.actorId, catalog.permission);
        } catch {
            return hold('FORBIDDEN', attempt - 1);
        }
        if (step.expectedSourceVersion !== undefined) {
            let fresh: string;
            try { fresh = await boundary.sourceVersion!(); }
            catch { return hold('DATA_UNAVAILABLE', attempt - 1); }
            if (fresh !== step.expectedSourceVersion) return hold('STALE_CONTEXT', attempt - 1);
        }
        // This checkpoint must be durable before the Registry can invoke a handler.
        await boundary.checkpoint(event('STARTED', attempt));
        let outcome: ToolOutcome;
        try {
            outcome = await boundary.registry.dispatch(step.actorId, step.tool, step.input,
                step.version ?? catalog.version, () => boundary.authorize(step.actorId, 'agent.run'));
        } catch {
            // No proof of execution when the Registry itself throws unexpectedly.
            return hold('REGISTRY_UNVERIFIED', attempt);
        }
        if (outcome.ok) {
            if (!outcome.evidence.validated || outcome.evidence.attempts !== 1 ||
                !catalog.output.safeParse(outcome.output).success) return hold('INVALID_OUTPUT', attempt);
            await boundary.checkpoint(event('SUCCEEDED', attempt));
            return { status: 'SUCCEEDED', attempts: attempt, outcome };
        }
        if (!transient.has(outcome.error) || attempt === 2) return hold(outcome.error, attempt);
        await boundary.checkpoint(event('RETRY_SCHEDULED', attempt, outcome.error));
    }
    return hold('RETRY_BUDGET_EXCEEDED', 2);
}
