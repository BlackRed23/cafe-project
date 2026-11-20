/**
 * REP decision-only leaf. It neither calls a tool nor creates a new StateGraph.
 * The existing Graph owner must verify/persist this proposal transactionally.
 */
import { createHash } from 'node:crypto';
import { isDeepStrictEqual } from 'node:util';
import { TOOL_CONTRACTS, type P1ToolName } from '../../workflows/tool-contracts';
import { REP_CONTRACT_VERSION, replanInputSchema, replanAuthorityProofSchema,
    replanResultSchema, type ReplanInput, type ReplanResult,
    type ReplanSource, type ReplanAuthority } from './replanning.schema';

export type ReplanLedger = Readonly<Record<string, { fingerprint: string; planVersion: number }>>;
const HASH = (v: unknown): string => createHash('sha256').update(JSON.stringify(v)).digest('hex');
const AGE_LIMIT = 300000;
const units = (v: string): bigint => {
    const [whole, fraction = ''] = v.split('.');
    return BigInt(whole!) * 10000n + BigInt(fraction.padEnd(4, '0'));
};
const sameSources = (left: ReplanSource[], right: ReplanSource[]): boolean =>
    isDeepStrictEqual([...left].sort((a, b) => a.ingredientId.localeCompare(b.ingredientId)),
        [...right].sort((a, b) => a.ingredientId.localeCompare(b.ingredientId)));

/** No raw tool output, prompt, supplier secrets or actor-supplied error text in decisions. */
function propose(input: ReplanInput, status: ReplanResult['status'], reasons: string[],
    sourceAttested: boolean, changes: string[], fingerprint: string): ReplanResult {
    const next: ReplanResult['nextPermittedAction'] = status === 'REFRESH_REQUIRED'
        ? 'REQUEST_AUTHORIZED_READ' : status === 'REPLAN_PROPOSED'
            ? 'SUBMIT_PLAN_FOR_VALIDATION' : status === 'REVIEW_REQUIRED'
                ? 'REQUEST_HUMAN_REVIEW' : 'NONE';
    const decision = {
        contractVersion: REP_CONTRACT_VERSION, runId: input.runId,
        graphId: input.graphId, actorId: input.actorId, eventId: input.eventId,
        status, priorPlanId: input.plan.planId, priorPlanVersion: input.plan.version,
        revisedPlanId: null,
        proposedPlanVersion: status === 'REPLAN_PROPOSED' ? input.plan.version + 1 : null,
        changedStepRefs: status === 'REPLAN_PROPOSED' ? changes : [],
        reasons: [...new Set(reasons)].sort(),
        evidenceRefs: sourceAttested ? [...new Set([
            input.observation.auditTraceId,
            ...input.sources.map(s => s.evidenceRef),
            ...input.anomaly.findings.map(f => f.traceRef)
        ])].sort() : [input.observation.auditTraceId],
        sourceFingerprints: sourceAttested ? input.sources.map(s => HASH([
            s.sourceId, s.sourceVersion, s.rowVersion, s.movementCursor, s.availableBase,
            s.eligibleBase, s.reservedBase, s.blockedBatchBase, s.readAt
        ])) : [],
        eventFingerprint: fingerprint,
        readOnly: true, authorizedToExecute: false,
        authorizedToPurchase: false, authorizedToApprove: false,
        requiresPolicyValidation: true,
        nextPermittedAction: next,
        usedReplans: input.usedReplans +
            (status === 'REPLAN_PROPOSED' || status === 'REFRESH_REQUIRED' ? 1 : 0),
        maxReplans: input.maxReplans,
        auditTraceId: 'rep-' + HASH([input.runId, input.plan.planId, input.eventId,
            status, [...new Set(reasons)].sort(), changes]).slice(0, 32),
        sourceAttested, persistenceStatus: 'PROPOSAL_ONLY'
    };
    return replanResultSchema.parse(decision);
}

/**
 * `authority.verify` MUST independently inspect authenticated persisted
 * Graph/Backend evidence. Without it, evaluateReplanning always HOLDs. Tests
 * provide an explicitly labelled test-owned fixture authority.
 */
export async function evaluateReplanning(raw: unknown, now: Date,
    authority?: ReplanAuthority, ledger: ReplanLedger = {}
): Promise<{ decision: ReplanResult; ledger: ReplanLedger }> {
    const parsed = replanInputSchema.safeParse(raw);
    if (!parsed.success || !Number.isFinite(now.getTime())) throw new Error('REP_INPUT_REJECTED');
    const input = parsed.data;
    const reject = (code: string): never => { throw new Error('REP_INPUT_REJECTED:' + code); };
    const steps = new Set<string>();
    const ingredients = new Set(input.planning.candidates.map(c => c.ingredientId));
    if (!ingredients.size || ingredients.size !== input.planning.candidates.length ||
        ingredients.size !== input.sources.length || input.plan.steps.some(step => {
            if (steps.has(step.stepId) || !ingredients.has(step.ingredientId)) return true;
            steps.add(step.stepId); return false;
        }) || input.plan.steps.some(step => step.dependsOn.some(dep =>
            dep === step.stepId || !steps.has(dep)))) reject('PLAN_SCOPE_INVALID');
    // Static cycle detection. No user-supplied step can execute via this module.
    const stepById = new Map(input.plan.steps.map(s => [s.stepId, s]));
    const visit = (stepId: string, visiting = new Set<string>(), finished = new Set<string>()): boolean => {
        if (visiting.has(stepId)) return false;
        if (finished.has(stepId)) return true;
        visiting.add(stepId);
        for (const parent of stepById.get(stepId)!.dependsOn) {
            if (!visit(parent, visiting, finished)) return false;
        }
        visiting.delete(stepId); finished.add(stepId); return true;
    };
    if ([...stepById.keys()].some(id => !visit(id))) reject('CYCLIC_DEPENDENCY');

    const sourceById = new Map(input.sources.map(s => [s.ingredientId, s]));
    if (sourceById.size !== input.sources.length ||
        [...sourceById.keys()].some(id => !ingredients.has(id)) ||
        input.anomaly.runId !== input.runId ||
        input.anomaly.observationId !== input.observation.auditTraceId ||
        input.observation.runId !== input.runId || input.observation.actorId !== input.actorId ||
        input.observation.toolName !== input.act.toolName) reject('CROSS_SCOPE_EVIDENCE');
    const tool = Object.prototype.hasOwnProperty.call(TOOL_CONTRACTS, input.act.toolName)
        ? TOOL_CONTRACTS[input.act.toolName as P1ToolName] : undefined;
    if (!tool || tool.version !== input.act.toolVersion || tool.category === 'WRITE' ||
        tool.category !== 'READ' || tool.status !== 'IMPLEMENTED') reject('UNAUTHORIZED_TOOL_CONTRACT');
    const eventKey = [input.runId, input.plan.planId, input.eventId].join(':');
    const fingerprint = HASH(input);
    const previous = ledger[eventKey];
    if (previous) {
        const status = previous.fingerprint === fingerprint &&
            previous.planVersion === input.plan.version ? 'KEEP_PLAN' : 'HOLD';
        return { decision: propose(input, status,
            [status === 'KEEP_PLAN' ? 'DUPLICATE_EVENT_IGNORED' : 'REPLAY_CONFLICT'],
            false, [], fingerprint), ledger };
    }

    let proofValid = false;
    if (authority) {
        try {
            const verified = replanAuthorityProofSchema.safeParse(await authority.verify(input));
            if (verified.success) {
                const proof = verified.data;
                const age = now.getTime() - Date.parse(proof.verifiedAt);
                proofValid = age >= 0 && age <= AGE_LIMIT &&
                    proof.runId === input.runId && proof.graphId === input.graphId &&
                    proof.actorId === input.actorId && proof.planId === input.plan.planId &&
                    proof.eventId === input.eventId &&
                    proof.observationTraceId === input.observation.auditTraceId &&
                    sameSources(proof.sources, input.sources);
            }
        } catch { /* Source verification failed: never trust caller data by fallback. */ }
    }
    const nextLedger: ReplanLedger = { ...ledger, [eventKey]: {
        fingerprint, planVersion: input.plan.version
    } };
    const finish = (status: ReplanResult['status'], reasons: string[],
        changedSteps: string[] = []): { decision: ReplanResult; ledger: ReplanLedger } => {
        // Refresh requests consume a replan-cycle slot too, not just revisions.
        // Otherwise repeated stale/empty reads could loop forever.
        if ((status === 'REPLAN_PROPOSED' || status === 'REFRESH_REQUIRED') &&
            input.usedReplans >= input.maxReplans) {
            status = 'HOLD'; reasons = ['REPLAN_BUDGET_EXHAUSTED']; changedSteps = [];
        }
        return { decision: propose(input, status, reasons, proofValid, changedSteps, fingerprint),
            ledger: nextLedger };
    };
    if (!proofValid) return finish('HOLD', ['SOURCE_AUTHORITY_UNVERIFIED']);
    if (input.plan.status === 'HELD' || input.planning.status === 'HOLD') {
        return finish('HOLD', ['PRIOR_POLICY_HOLD', ...input.planning.reasons]);
    }
    if (input.planning.reasons.length || input.planning.candidates.some(c => c.suggestedBase === null) ||
        (input.planning.status === 'NO_SHORTAGE' &&
            input.planning.candidates.some(c => units(c.suggestedBase!) !== 0n)) ||
        (input.planning.status === 'REVIEW_CANDIDATE' &&
            input.planning.candidates.every(c => units(c.suggestedBase!) === 0n))) {
        return finish('HOLD', ['PLANNING_RESULT_INCONSISTENT']);
    }
    if (input.anomaly.evidenceLevel !== 'SOURCE_ATTESTED' || !input.anomaly.sourceVerified) {
        return finish('HOLD', ['ANOMALY_SOURCE_UNVERIFIED']);
    }
    // A real ANM normal result cannot follow a rejected OBS result. Never turn
    // an invented NORMAL label into permission to recover an ACT failure.
    if (input.anomaly.status === 'NORMAL' && (input.observation.status !== 'SUCCESS' ||
        input.observation.dataQuality !== 'VERIFIED_SCHEMA' ||
        !input.observation.verifiedForBusiness)) {
        return finish('HOLD', ['ANOMALY_OBS_INCONSISTENT']);
    }
    const contradiction = new Set(['INCONSISTENT_STOCK', 'SOURCE_BALANCE_CONFLICT',
        'SOURCE_VERSION_CONFLICT', 'SELLABLE_BATCH_CONFLICT', 'INVALID_OBSERVATION',
        'UNAPPROVED_STOCKTAKE_MUTATION', 'STOCKTAKE_VERSION_DRIFT', 'PO_OVERRECEIPT',
        'BATCH_SUM_MISMATCH', 'NEGATIVE_INVENTORY', 'NEGATIVE_AVAILABLE_SHORTAGE']);
    if (input.anomaly.status === 'HOLD' ||
        input.anomaly.findings.some(f => contradiction.has(f.code) || f.recommendedRoute === 'HOLD')) {
        return finish('HOLD', ['ANOMALY_POLICY_HOLD', ...input.anomaly.findings.map(f => f.code)]);
    }
    if (input.act.status === 'SUCCEEDED' && (input.act.errorCode || input.act.attempts === 0) ||
        input.act.status === 'HELD_POLICY' && !input.act.errorCode ||
        input.act.status === 'NOT_EXECUTED' && (input.act.attempts !== 0 || input.act.errorCode)) {
        return finish('HOLD', ['ACT_RESULT_INCONSISTENT']);
    }
    if (input.observation.status === 'DUPLICATE') return finish('KEEP_PLAN', ['DUPLICATE_OBSERVATION_IGNORED']);
    if (input.observation.status === 'REJECTED' || input.observation.status === 'INVALID_OUTPUT' ||
        input.observation.dataQuality === 'UNTRUSTED' || input.observation.dataQuality === 'INVALID') {
        return finish('HOLD', ['OBSERVATION_REJECTED']);
    }
    if (input.act.status === 'HELD_POLICY' || input.observation.status === 'FAILED') {
        const code = input.act.errorCode ?? input.observation.errorCode ?? 'ACT_FAILURE_UNKNOWN';
        const recoverable = new Set(['TIMEOUT', 'BACKEND_FAILURE', 'STALE_CONTEXT', 'DATA_UNAVAILABLE']);
        if (!recoverable.has(code)) return finish('HOLD', ['ACT_NONRETRYABLE_FAILURE', code]);
        if (input.usedReplans >= input.maxReplans) return finish('HOLD', ['REPLAN_BUDGET_EXHAUSTED']);
        return finish('REFRESH_REQUIRED', ['ACT_READ_RECOVERY_REQUIRED', code]);
    }
    if (input.observation.status === 'STALE' || input.observation.status === 'INSUFFICIENT_DATA' ||
        input.observation.status === 'PARTIAL' || input.observation.requiresFreshRead) {
        if (input.usedReplans >= input.maxReplans) return finish('HOLD', ['REPLAN_BUDGET_EXHAUSTED']);
        return finish('REFRESH_REQUIRED', ['OBSERVATION_REQUIRES_FRESH_READ']);
    }
    if (input.observation.status !== 'SUCCESS' || input.observation.dataQuality !== 'VERIFIED_SCHEMA' ||
        !input.observation.verifiedForBusiness || input.act.status !== 'SUCCEEDED') {
        return finish('HOLD', ['UNVERIFIED_EXECUTION_RESULT']);
    }
    if (input.anomaly.status === 'INSUFFICIENT_EVIDENCE') {
        return finish('REFRESH_REQUIRED', ['ANOMALY_EVIDENCE_INSUFFICIENT']);
    }
    if (input.anomaly.status === 'REVIEW_REQUIRED' || input.anomaly.status === 'WARNING') {
        return finish('REVIEW_REQUIRED', input.anomaly.findings.map(f => f.code).length
            ? input.anomaly.findings.map(f => f.code) : ['ANOMALY_REVIEW']);
    }
    if (input.anomaly.status !== 'NORMAL' || input.anomaly.findings.some(f => f.severity !== 'INFO')) {
        return finish('HOLD', ['ANOMALY_STATUS_INCONSISTENT']);
    }
    const changedIngredients = new Set<string>();
    for (const planSource of input.planning.candidates) {
        const actual = sourceById.get(planSource.ingredientId)!;
        const age = now.getTime() - Date.parse(actual.readAt);
        if (age < 0 || age > AGE_LIMIT) return finish('REFRESH_REQUIRED', ['SOURCE_STALE']);
        const physical = units(actual.physicalBase), eligible = units(actual.eligibleBase);
        const reserved = units(actual.reservedBase), blocked = units(actual.blockedBatchBase);
        if (physical !== eligible + blocked || eligible < reserved ||
            eligible - reserved !== units(actual.availableBase)) {
            return finish('HOLD', ['SOURCE_BALANCE_CONFLICT']);
        }
        if (actual.rowVersion < planSource.rowVersion ||
            BigInt(actual.movementCursor) < BigInt(planSource.movementCursor)) {
            return finish('HOLD', ['SOURCE_ROLLBACK']);
        }
        if (actual.pendingStocktake) return finish('REVIEW_REQUIRED', ['STOCKTAKE_PENDING_APPROVAL']);
        if (actual.uncertainInbound) return finish('REVIEW_REQUIRED', ['INBOUND_NOT_PHYSICAL']);
        if (blocked > 0n) return finish('REVIEW_REQUIRED', ['INELIGIBLE_BATCH_EXCLUDED']);
        if (actual.rowVersion === planSource.rowVersion &&
            actual.movementCursor === planSource.movementCursor &&
            actual.availableBase !== planSource.availableBase) {
            return finish('HOLD', ['SAME_VERSION_QUANTITY_CONFLICT']);
        }
        if (actual.rowVersion !== planSource.rowVersion ||
            actual.movementCursor !== planSource.movementCursor) {
            changedIngredients.add(planSource.ingredientId);
        }
    }
    if (!changedIngredients.size) return finish('KEEP_PLAN', ['PLAN_STILL_VALID']);
    const changedSteps = input.plan.steps.filter(step => changedIngredients.has(step.ingredientId)
        && step.status === 'PENDING').map(step => step.stepId);
    if (!changedSteps.length) return finish('REFRESH_REQUIRED', ['AFFECTED_STEPS_ALREADY_COMPLETED']);
    if (input.usedReplans >= input.maxReplans) return finish('HOLD', ['REPLAN_BUDGET_EXHAUSTED']);
    const progressFingerprint = HASH([input.plan.planId,
        input.sources.map(s => [s.ingredientId, s.rowVersion, s.movementCursor, s.availableBase])]);
    if (input.priorFingerprints.includes(progressFingerprint)) return finish('HOLD', ['REPLAN_LOOP_DETECTED']);
    return finish('REPLAN_PROPOSED', ['AUTHORIZED_SOURCE_VERSION_CHANGED'], changedSteps);
}
