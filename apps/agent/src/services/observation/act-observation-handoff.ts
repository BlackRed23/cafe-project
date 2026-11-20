/**
 * OBS-owned compatibility bridge for the existing ACT READ leaf.
 * This is NOT a StateGraph node or an independent executor. The Graph owner
 * must explicitly wire it into the one existing Graph after source handoff.
 */
import { executeActReadStep, type ActReadBoundary, type ActReadEvent,
    type ActReadResult, type ActReadStep } from '../execution/act-read-step';
import { TOOL_CONTRACTS, type P1ToolName } from '../../workflows/tool-contracts';
import { observeActRead, type ObservationBoundary, type ObservationDecision,
    type ObservationLedger, type ObservationInput } from './observation';

/** Every field must come from authenticated caller state, not a tool response. */
export type ActObservationContext = {
    runId: string;
    stepId: string;
    actorId: string;
    toolName: string;
    expectedRowVersion?: number;
    expectedMovementCursor?: string;
    /** Verified ACT dependencies only. */
    completedDependencies?: readonly string[];
    /** Optional proven source facts; never infer a cursor/evidence reference. */
    source?: ObservationInput['source'];
    maxAgeMs?: number;
};

export type ActObservationHandoff = {
    actResult: ActReadResult;
    terminalEvent: ActReadEvent;
    observation: ObservationDecision;
    ledger: ObservationLedger;
};

/**
 * Invokes REAL ACT once. Records the ACT terminal event only AFTER the caller's
 * checkpoint succeeds. No checkpoint means no OBS, not even a fabricated HOLD.
 * Graph ownership of the durable checkpoint and subsequent apply is mandatory.
 */
export async function executeAndObserveActRead(step: ActReadStep, boundary: ActReadBoundary,
    context: ActObservationContext, ledger: ObservationLedger = {}): Promise<ActObservationHandoff> {
    if (step.runId !== context.runId || step.stepId !== context.stepId ||
        step.actorId !== context.actorId || step.tool !== context.toolName) {
        throw new Error('OBS_ACT_BOUNDARY_MISMATCH');
    }
    const catalog = Object.prototype.hasOwnProperty.call(TOOL_CONTRACTS, step.tool)
        ? TOOL_CONTRACTS[step.tool as P1ToolName] : undefined;
    if (!catalog || catalog.category !== 'READ' || catalog.status !== 'IMPLEMENTED') {
        throw new Error('OBS_UNSUPPORTED_ACT_TOOL');
    }
    if (step.version && step.version !== catalog.version) {
        throw new Error('OBS_ACT_VERSION_MISMATCH');
    }
    // A caller may not forge a completed dependency in ACT step while handing
    // OBS a weaker verification list. Fail BEFORE any handler executes.
    const actCompleted = new Set(step.completedDependencies ?? []);
    const trustedCompleted = new Set(context.completedDependencies ?? []);
    if (actCompleted.size !== trustedCompleted.size ||
        [...actCompleted].some(dep => !trustedCompleted.has(dep))) {
        throw new Error('OBS_DEPENDENCY_PROOF_MISMATCH');
    }
    const committedEvents: ActReadEvent[] = [];
    const checkedBoundary: ActReadBoundary = {
        ...boundary,
        checkpoint: async event => {
            await boundary.checkpoint(event); // explicitly trusted durable callback
            committedEvents.push(event); // only after callback resolved
        }
    };
    const actResult = await executeActReadStep(step, checkedBoundary);
    const terminalEvents = committedEvents.filter(e => e.status === 'SUCCEEDED' || e.status === 'HELD');
    if (terminalEvents.length !== 1) throw new Error('OBS_ACT_TERMINAL_NOT_PROVEN');
    const terminal = terminalEvents[0]!;
    if (terminal.runId !== step.runId || terminal.stepId !== step.stepId ||
        terminal.actorId !== step.actorId || terminal.tool !== step.tool ||
        terminal.attempt !== actResult.attempts ||
        (actResult.status === 'SUCCEEDED' ? terminal.status !== 'SUCCEEDED' || actResult.code !== undefined :
            terminal.status !== 'HELD' || terminal.code !== actResult.code)) {
        throw new Error('OBS_ACT_TERMINAL_MISMATCH');
    }
    const input: ObservationInput = {
        schemaVersion: '1.0.0', runId: step.runId,
        invocationId: step.stepId, actorId: step.actorId, toolName: step.tool,
        toolInput: step.input, expectedSchemaVersion: catalog.version,
        actResult, completedAt: terminal.at,
        ...(context.source ? { source: context.source } : {}),
        ...(step.dependencies ? { dependencies: [...step.dependencies] } : {})
    };
    const obsBoundary: ObservationBoundary = {
        runId: context.runId, invocationId: context.stepId,
        actorId: context.actorId, toolName: context.toolName,
        receivedAt: (boundary.now?.() ?? new Date()).toISOString(),
        ...(context.expectedRowVersion !== undefined ? { expectedRowVersion: context.expectedRowVersion } : {}),
        ...(context.expectedMovementCursor !== undefined ? { expectedMovementCursor: context.expectedMovementCursor } : {}),
        ...(context.maxAgeMs !== undefined ? { maxAgeMs: context.maxAgeMs } : {}),
        ...(step.dependencies ? { dependencies: step.dependencies } : {}),
        completedDependencies: context.completedDependencies ?? []
    };
    const observed = observeActRead(input, obsBoundary, ledger);
    return { actResult, terminalEvent: terminal,
        observation: observed.decision, ledger: observed.ledger };
}
