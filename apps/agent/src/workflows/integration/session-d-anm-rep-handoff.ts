/**
 * Session D integration ports for the one existing AgentWorkflow StateGraph.
 *
 * These adapters read independently persisted evidence and return decisions.
 * They never dispatch a tool, authorize a business operation, or persist a plan.
 * Graph/Repository owns authenticated readers, all writes and final routing.
 */
import { createHash } from 'node:crypto';
import { isDeepStrictEqual } from 'node:util';
import { z } from 'zod';
import {
    OBS_ANM_HANDOFF_VERSION, evaluateObservationHandoff,
    handoffScopeSchema, persistedSourceSchema, type HandoffResult,
    type HandoffScope, type PersistedAnomalySource
} from '../../services/anomaly/observation-handoff';
import {
    anomalyResultSchema, type AnomalyAuthority
} from '../../services/anomaly/anomaly.schema';
import {
    replanAuthorityProofSchema, replanInputSchema,
    type ReplanAuthority, type ReplanInput, type ReplanResult,
    type ReplanSource
} from '../../services/replanning/replanning.schema';
import {
    evaluateReplanning, type ReplanLedger
} from '../../services/replanning/replanning.service';

const id = z.string().regex(/^[A-Za-z0-9][A-Za-z0-9:_-]{0,119}$/);
const timestamp = z.iso.datetime({ offset: true });
const digest = z.string().regex(/^[a-f0-9]{64}$/);
const FRESH_MS = 300000;
const fingerprint = (value: unknown): string =>
    createHash('sha256').update(JSON.stringify(value)).digest('hex');

/** Reader must return the committed OBS decision, not a proposal from a request. */
export const durableObservationRecordSchema = z.strictObject({
    graphId: id, runId: id, actorId: id, invocationId: id, toolName: id,
    observationId: id, observationAuditTraceId: id,
    terminalCheckpointId: id, terminalAt: timestamp, recordedAt: timestamp,
    persistedObservationDigest: digest, decision: z.unknown()
});
export type DurableObservationRecord = z.infer<typeof durableObservationRecordSchema>;

export type DurableObsAnmPorts = {
    /** Authenticated independent durable read, scoped to run, actor and ACT invocation. */
    loadPersistedObservation(scope: HandoffScope): Promise<unknown>;
    /** Independent authoritative Backend/ACT source, not echoed from OBS output. */
    loadPersistedSource(scope: HandoffScope): Promise<unknown>;
    /** Must re-read trusted Backend facts and authorization before attesting. */
    anomalyAuthority: AnomalyAuthority;
};

const current = (value: string, now: Date): boolean => {
    const age = now.getTime() - Date.parse(value);
    return Number.isFinite(age) && age >= 0 && age <= FRESH_MS;
};
const sameScope = (source: HandoffScope, scope: HandoffScope): boolean =>
    source.graphId === scope.graphId && source.runId === scope.runId &&
    source.actorId === scope.actorId && source.invocationId === scope.invocationId &&
    source.toolName === scope.toolName;

/**
 * D2: pinned, durable OBS decision -> independently verified ANM analysis.
 * A READY handoff may contain analysis.status=HOLD; Graph must still enforce it.
 */
export async function handoffDurableObservationToAnomaly(
    rawScope: unknown, ports: DurableObsAnmPorts, now?: Date
): Promise<HandoffResult> {
    const parsed = handoffScopeSchema.safeParse(rawScope);
    const scope = parsed.success ? parsed.data : undefined;
    const held = (reason: HandoffResult['reason']): HandoffResult => ({
        version: OBS_ANM_HANDOFF_VERSION, status: 'HOLD', reason, missingFields: [],
        graphId: scope?.graphId ?? null, runId: scope?.runId ?? null,
        observationId: null, traceRef: null
    });
    if (!scope || (now && !Number.isFinite(now.getTime()))) return held('INVALID_SCOPE');
    if (typeof ports?.loadPersistedObservation !== 'function' ||
        typeof ports?.loadPersistedSource !== 'function' ||
        typeof ports?.anomalyAuthority?.verify !== 'function') return held('UNVERIFIED_SOURCE');

    let rawObservation: unknown, rawSource: unknown;
    try {
        rawObservation = await ports.loadPersistedObservation(scope);
        rawSource = await ports.loadPersistedSource(scope);
    } catch { return held('UNVERIFIED_SOURCE'); }
    const observation = durableObservationRecordSchema.safeParse(rawObservation);
    const source = persistedSourceSchema.safeParse(rawSource);
    if (!observation.success || !source.success) return held('UNVERIFIED_SOURCE');
    const d = observation.data, s = source.data;
    const checkedAt = now ?? new Date();
    if (!sameScope(d, scope) || !sameScope(s, scope) ||
        d.observationId !== s.observationId ||
        d.observationAuditTraceId !== s.observationAuditTraceId ||
        d.terminalCheckpointId !== s.terminalCheckpointId || d.terminalAt !== s.terminalAt) {
        return held('OBS_SCOPE_MISMATCH');
    }
    if (!current(d.recordedAt, checkedAt) || !current(d.terminalAt, checkedAt)) {
        return held('STALE_SNAPSHOT');
    }
    // Check an independently loaded OBS record against an independently loaded
    // source. Neither digest may originate in an LLM/client request.
    try {
        if (fingerprint(d.decision) !== d.persistedObservationDigest ||
            d.persistedObservationDigest !== s.persistedObservationDigest) {
            return held('OBS_SCOPE_MISMATCH');
        }
    } catch { return held('INVALID_OBS_DECISION'); }
    return evaluateObservationHandoff(d.decision, scope, {
        loadPersistedSource: async (): Promise<PersistedAnomalySource> => s,
        authority: ports.anomalyAuthority
    }, now);
}

/** Persistent, authenticated ANM result receipt; distinct from caller input. */
export const durableAnomalyRecordSchema = z.strictObject({
    graphId: id, runId: id, actorId: id, invocationId: id, toolName: id,
    observationId: id, observationAuditTraceId: id,
    checkpointId: id, recordedAt: timestamp,
    anomalyDigest: digest, anomaly: anomalyResultSchema
});
export type DurableAnomalyRecord = z.infer<typeof durableAnomalyRecordSchema>;

/** Independent proof must be re-read from the durable ANM journal. */
export const durableAnomalyProofSchema = z.strictObject({
    graphId: id, runId: id, actorId: id, invocationId: id, toolName: id,
    observationId: id, observationAuditTraceId: id,
    checkpointId: id, anomalyDigest: digest, verifiedAt: timestamp
});

const ledgerSchema = z.record(z.string().min(1).max(370), z.strictObject({
    fingerprint: digest, planVersion: z.number().int().positive()
}));

export type DurableAnmRepPorts = {
    /** Authenticate the actor and read committed ANM data for the exact invocation. */
    loadPersistedAnomaly(scope: HandoffScope): Promise<unknown>;
    /** Construct REP only from already authenticated Graph/PLN/ACT/OBS/Backend. */
    loadPersistedReplanInput(scope: HandoffScope): Promise<unknown>;
    /** Read the durable idempotency ledger in the same trusted Graph scope. */
    loadPersistedReplanLedger(scope: HandoffScope): Promise<unknown>;
    /** Independently attest ANM digest, checkpoint and actor from durable journal. */
    verifyPersistedAnomaly(record: DurableAnomalyRecord): Promise<unknown>;
    /** Re-read plan revision, policy, source OIDs/versions and authenticated actor. */
    replanAuthority: ReplanAuthority;
};

export type DurableAnmRepHandoff = {
    status: 'READY' | 'HOLD';
    reason: 'ACCEPTED' | 'INVALID_SCOPE' | 'PERSISTED_EVIDENCE_UNAVAILABLE' |
        'DURABLE_RECORD_MISMATCH' | 'STALE_EVIDENCE' |
        'SOURCE_AUTHORITY_UNVERIFIED' | 'REP_INPUT_REJECTED';
    decision?: ReplanResult;
    /** Derived ledger is only a proposal; Graph must commit atomically. */
    proposedLedger?: ReplanLedger;
};

const sameSources = (a: ReplanSource[], b: ReplanSource[]): boolean =>
    isDeepStrictEqual([...a].sort((x, y) => x.ingredientId.localeCompare(y.ingredientId)),
        [...b].sort((x, y) => x.ingredientId.localeCompare(y.ingredientId)));

/**
 * D3: re-verify persisted ANM and the current, authenticated REP source first.
 * Even an in-memory ledger duplicate must pass the independent authority check.
 * No decision from here authorizes execution or persists a changed plan.
 */
export async function handoffDurableAnomalyToReplanning(
    rawScope: unknown, ports: DurableAnmRepPorts, now = new Date()
): Promise<DurableAnmRepHandoff> {
    const parsed = handoffScopeSchema.safeParse(rawScope);
    if (!parsed.success || !Number.isFinite(now.getTime())) {
        return { status: 'HOLD', reason: 'INVALID_SCOPE' };
    }
    const scope = parsed.data;
    const held = (reason: DurableAnmRepHandoff['reason']): DurableAnmRepHandoff =>
        ({ status: 'HOLD', reason });
    if (typeof ports?.loadPersistedAnomaly !== 'function' ||
        typeof ports?.loadPersistedReplanInput !== 'function' ||
        typeof ports?.loadPersistedReplanLedger !== 'function' ||
        typeof ports?.verifyPersistedAnomaly !== 'function' ||
        typeof ports?.replanAuthority?.verify !== 'function') {
        return held('PERSISTED_EVIDENCE_UNAVAILABLE');
    }
    let record: unknown, context: unknown, rawLedger: unknown;
    try {
        // Snapshot is read by the trusted Graph/Repository implementation.
        [record, context, rawLedger] = await Promise.all([
            ports.loadPersistedAnomaly(scope),
            ports.loadPersistedReplanInput(scope),
            ports.loadPersistedReplanLedger(scope)
        ]);
    } catch { return held('PERSISTED_EVIDENCE_UNAVAILABLE'); }
    const persisted = durableAnomalyRecordSchema.safeParse(record);
    const input = replanInputSchema.safeParse(context);
    const ledger = ledgerSchema.safeParse(rawLedger);
    if (!persisted.success || !input.success || !ledger.success) {
        return held('PERSISTED_EVIDENCE_UNAVAILABLE');
    }
    const a = persisted.data, r: ReplanInput = input.data;
    if (!sameScope(a, scope) || !current(a.recordedAt, now)) {
        return !sameScope(a, scope) ? held('DURABLE_RECORD_MISMATCH') : held('STALE_EVIDENCE');
    }
    if (a.anomalyDigest !== fingerprint(a.anomaly) ||
        a.anomaly.runId !== scope.runId ||
        a.anomaly.observationId !== a.observationId ||
        r.observation.observationId !== a.observationId ||
        a.anomaly.evidenceLevel !== 'SOURCE_ATTESTED' || !a.anomaly.sourceVerified ||
        r.graphId !== scope.graphId || r.runId !== scope.runId || r.actorId !== scope.actorId ||
        r.act.toolName !== scope.toolName ||
        r.observation.invocationId !== scope.invocationId ||
        r.observation.toolName !== scope.toolName ||
        r.observation.auditTraceId !== a.observationAuditTraceId ||
        !isDeepStrictEqual(r.anomaly, a.anomaly)) {
        return held('DURABLE_RECORD_MISMATCH');
    }
    // An independent record verification closes the gap between a JSON digest
    // and an authenticated, durably committed ANM journal entry.
    let anmProof: unknown;
    try { anmProof = await ports.verifyPersistedAnomaly(a); }
    catch { return held('SOURCE_AUTHORITY_UNVERIFIED'); }
    const confirmed = durableAnomalyProofSchema.safeParse(anmProof);
    if (!confirmed.success || !current(confirmed.data.verifiedAt, now) ||
        !sameScope(confirmed.data, scope) ||
        confirmed.data.observationId !== a.observationId ||
        confirmed.data.observationAuditTraceId !== a.observationAuditTraceId ||
        confirmed.data.checkpointId !== a.checkpointId ||
        confirmed.data.anomalyDigest !== a.anomalyDigest) {
        return held('SOURCE_AUTHORITY_UNVERIFIED');
    }
    let proof: unknown;
    try { proof = await ports.replanAuthority.verify(r); }
    catch { return held('SOURCE_AUTHORITY_UNVERIFIED'); }
    const source = replanAuthorityProofSchema.safeParse(proof);
    if (!source.success || !current(source.data.verifiedAt, now) ||
        source.data.runId !== r.runId || source.data.graphId !== r.graphId ||
        source.data.actorId !== r.actorId || source.data.planId !== r.plan.planId ||
        source.data.eventId !== r.eventId ||
        source.data.observationTraceId !== r.observation.auditTraceId ||
        !sameSources(source.data.sources, r.sources)) {
        return held('SOURCE_AUTHORITY_UNVERIFIED');
    }
    try {
        const evaluated = await evaluateReplanning(r, now, {
            verify: async () => source.data
        }, ledger.data);
        return { status: 'READY', reason: 'ACCEPTED',
            decision: evaluated.decision, proposedLedger: evaluated.ledger };
    } catch { return held('REP_INPUT_REJECTED'); }
}
