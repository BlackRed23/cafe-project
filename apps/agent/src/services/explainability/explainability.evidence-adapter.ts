/**
 * H2: independent evidence-reader contract for EXP.
 *
 * This module does NOT connect to PostgreSQL or authorize anyone by itself.
 * Only a server-side integration owner may bind all ports to authenticated,
 * independently persisted sources. An untrusted JSON payload or its own
 * "verified" flag/hash is never authority.
 */
import { createHash } from 'node:crypto';
import { z } from 'zod';
import {
    EXP_CONTRACT_VERSION, expId, expInventorySchema, expPhaseSchema,
    explanationSnapshotSchema, type ExplanationAuthority,
    type ExplanationRequest, type ExplanationScope, type ExplanationSnapshot
} from './explainability.schema';

const at = z.iso.datetime({ offset: true });
const sha256 = z.string().regex(/^[a-f0-9]{64}$/);

export const expEvidencePrincipalSchema = z.strictObject({
    actorId: expId, role: z.enum(['ADMIN', 'STAFF']), active: z.boolean()
});
export const expEvidenceRunSchema = z.strictObject({
    runId: expId, graphId: expId, ownerActorId: expId, state: z.enum([
        'RUNNING', 'WAITING_APPROVAL', 'SUCCEEDED', 'FAILED', 'TIMEOUT', 'CANCELLED', 'HELD'
    ])
});

/** A persisted decision view, not a caller-supplied EXP source/provenance claim. */
export const expEvidenceDecisionSchema = explanationSnapshotSchema.omit({
    provenance: true, evidence: true, inventory: true, checkpointRef: true, auditRef: true
}).extend({
    inventoryAtDecision: expInventorySchema.optional()
});
type EvidenceDecision = z.infer<typeof expEvidenceDecisionSchema>;

/** Digest is checked against a SEPARATELY read, schema-parsed decision projection. */
export const expEvidenceLedgerEntrySchema = z.strictObject({
    eventId: expId, runId: expId, graphId: expId, actorId: expId,
    decisionId: expId, phase: expPhaseSchema, occurredAt: at,
    state: z.enum(['EXECUTED', 'NOT_EXECUTED']),
    payloadDigest: sha256,
    auditRef: expId, checkpointRef: expId,
    sourceId: expId.optional(), sourceVersion: expId.optional()
});
const persistedProofSchema = z.strictObject({
    id: expId, eventId: expId, runId: expId, graphId: expId, actorId: expId,
    decisionId: expId, phase: expPhaseSchema, payloadDigest: sha256
});
export type EvidenceLedgerEntry = z.infer<typeof expEvidenceLedgerEntrySchema>;

/**
 * All methods must read independent server-controlled stores. For example:
 * - currentPrincipal: authenticated current user in Backend, not request.actorId
 * - readRun: persisted authenticated run owner and graph identity
 * - readDecision: saved sanitized decision projection
 * - readLedger: append-only events; each event has an independently stored digest
 * - readAudit/readCheckpoint: real committed persisted proof, not echoed references
 * - readCurrentInventory: current authorized Backend read, not saved plan values
 *
 * Native AgentLog/AgentToolCall alone do not satisfy this interface. The Graph
 * owner must supply durable correlations and independently verifiable proofs.
 */
export interface ExplanationEvidencePorts {
    currentPrincipal(): Promise<unknown>;
    readRun(runId: string): Promise<unknown>;
    readDecision(runId: string, decisionId: string): Promise<unknown>;
    readLedger(runId: string, decisionId: string): Promise<unknown>;
    readAudit(ref: string): Promise<unknown>;
    readCheckpoint(ref: string): Promise<unknown>;
    readCurrentInventory(ingredientId: string): Promise<unknown>;
}

/** Canonical hashing is for cross-record integrity only, NOT authentication. */
export function digestExplanationProjection(value: unknown): string {
    const canonical = JSON.stringify(value, (_key, entry: unknown) => {
        if (entry !== null && typeof entry === 'object' && !Array.isArray(entry)) {
            return Object.fromEntries(Object.entries(entry).sort(([a], [b]) => a.localeCompare(b)));
        }
        return entry;
    });
    return createHash('sha256').update(canonical).digest('hex');
}

const phaseField = {
    PER: 'inventoryAtDecision',
    PLN: 'plan',
    TOOL: 'selection',
    ACT: 'act',
    OBS: 'observation',
    ANM: 'anomaly',
    REP: 'replan',
    PUR: 'purchasing',
    SEC: 'security'
} as const;
type Phase = keyof typeof phaseField;

/**
 * An untrusted test provider is explicitly locked to TEST_FIXTURE. Only the
 * D4 owner may opt in to source attestation after binding ALL ports to real
 * authenticated, independent persisted reads; H2 does not enable this mode.
 */
export function createCorrelatedExplanationAuthority(
    ports: ExplanationEvidencePorts,
    boundary: { sourceKind: 'TEST_FIXTURE' | 'PERSISTED_READS' } = { sourceKind: 'TEST_FIXTURE' }
): ExplanationAuthority {
    return {
        async load(request: ExplanationRequest, scope: ExplanationScope): Promise<unknown> {
            // Fail before any private run read for mismatched caller-supplied claims.
            if (request.actorId !== scope.actorId || request.runId !== scope.runId ||
                request.graphId !== scope.graphId || !scope.canReadDecision) {
                throw new Error('EXP_SCOPE_DENIED');
            }
            // The session MUST be independently looked up: a self-reported role or
            // "verified":true on a decision is never sufficient.
            const principal = expEvidencePrincipalSchema.safeParse(await ports.currentPrincipal());
            if (!principal.success || !principal.data.active ||
                principal.data.actorId !== scope.actorId || principal.data.role !== scope.role) {
                throw new Error('EXP_SCOPE_DENIED');
            }
            const run = expEvidenceRunSchema.safeParse(await ports.readRun(request.runId));
            if (!run.success || run.data.runId !== request.runId ||
                run.data.graphId !== request.graphId ||
                run.data.ownerActorId !== principal.data.actorId) {
                throw new Error('EXP_SCOPE_DENIED');
            }
            // A run owner has been proved BEFORE reading private decision contents.
            const decisionParsed = expEvidenceDecisionSchema.safeParse(
                await ports.readDecision(request.runId, request.decisionId));
            if (!decisionParsed.success) throw new Error('EXP_DECISION_NOT_VERIFIED');
            const decision: EvidenceDecision = decisionParsed.data;
            if (decision.runId !== request.runId || decision.graphId !== request.graphId ||
                decision.actorId !== request.actorId || decision.decisionId !== request.decisionId) {
                throw new Error('EXP_DECISION_CORRELATION_MISMATCH');
            }
            const rawLedger = await ports.readLedger(request.runId, request.decisionId);
            const ledger = z.array(expEvidenceLedgerEntrySchema).max(100).safeParse(rawLedger);
            if (!ledger.success) throw new Error('EXP_LEDGER_INVALID');
            if (new Set(ledger.data.map(e => e.eventId)).size !== ledger.data.length) {
                throw new Error('EXP_DUPLICATE_EVENT');
            }
            // Reject cross-run entries and out-of-order event delivery rather than
            // "repairing" timestamps or combining foreign runs.
            if (ledger.data.some((e, i, events) =>
                e.runId !== request.runId || e.graphId !== request.graphId ||
                e.actorId !== request.actorId || e.decisionId !== request.decisionId ||
                Date.parse(e.occurredAt) > Date.parse(scope.now) ||
                (i > 0 && Date.parse(e.occurredAt) < Date.parse(events[i - 1].occurredAt)))) {
                throw new Error('EXP_LEDGER_CORRELATION_MISMATCH');
            }
            const projection: Partial<ExplanationSnapshot> = {};
            const evidence: ExplanationSnapshot['evidence'] = [];
            const verifiedPhases = new Set<Phase>();
            for (const e of ledger.data) {
                const phase = e.phase;
                const field = phaseField[phase];
                const value = decision[field];
                // Even NOT_EXECUTED must be an actual persisted event with proof.
                const digest = digestExplanationProjection(e.state === 'NOT_EXECUTED' ? null : value ?? null);
                const proofs = await Promise.all([
                    ports.readAudit(e.auditRef), ports.readCheckpoint(e.checkpointRef)
                ]);
                const audit = persistedProofSchema.safeParse(proofs[0]);
                const checkpoint = persistedProofSchema.safeParse(proofs[1]);
                const matches = (proof: z.infer<typeof persistedProofSchema>, id: string): boolean =>
                    proof.id === id && proof.eventId === e.eventId && proof.runId === request.runId &&
                    proof.graphId === request.graphId && proof.actorId === request.actorId &&
                    proof.decisionId === request.decisionId && proof.phase === phase &&
                    proof.payloadDigest === e.payloadDigest;
                const authorized = audit.success && checkpoint.success &&
                    matches(audit.data, e.auditRef) && matches(checkpoint.data, e.checkpointRef);
                let correlated = authorized && digest === e.payloadDigest &&
                    (e.state === 'NOT_EXECUTED' ? value === undefined : value !== undefined);
                // Do not call a fixture's "verified" flag authoritative.
                if (phase === 'PER' && decision.inventoryAtDecision && e.sourceId !== undefined) {
                    correlated = correlated && e.sourceId === decision.inventoryAtDecision.sourceId &&
                        e.sourceVersion === decision.inventoryAtDecision.sourceVersion;
                } else if (phase === 'PER') correlated = false;
                evidence.push({
                    eventId: e.eventId, phase, runId: e.runId, graphId: e.graphId,
                    actorId: e.actorId, occurredAt: e.occurredAt,
                    status: correlated
                        ? (e.state === 'NOT_EXECUTED' ? 'NOT_EXECUTED' : 'VERIFIED')
                        : 'MISSING',
                    ...(correlated && e.sourceId ? { sourceId: e.sourceId } : {}),
                    ...(correlated && e.sourceVersion ? { sourceVersion: e.sourceVersion } : {}),
                    ...(correlated ? { auditRef: e.auditRef, checkpointRef: e.checkpointRef } : {})
                });
                if (correlated && e.state === 'EXECUTED') {
                    if (verifiedPhases.has(phase)) {
                        throw new Error('EXP_DUPLICATE_PHASE_PROOF');
                    }
                    verifiedPhases.add(phase);
                    // Only schema-validated exact projections, never raw event text,
                    // can enter the explanation view.
                    if (phase !== 'PER') {
                        Object.assign(projection, { [field]: value });
                    }
                }
            }
            if (decision.inventoryAtDecision && verifiedPhases.has('PER')) {
                const inventory = expInventorySchema.safeParse(
                    await ports.readCurrentInventory(decision.inventoryAtDecision.ingredientId));
                // Invalid, absent, differently scoped ingredient or uncorrelated
                // inventory source is not a positive stock fact.
                if (inventory.success && inventory.data.ingredientId ===
                    decision.inventoryAtDecision.ingredientId &&
                    inventory.data.sourceId === decision.inventoryAtDecision.sourceId) {
                    projection.inventory = inventory.data;
                } else {
                    const per = evidence.find(e => e.phase === 'PER');
                    if (per) per.status = 'MISSING';
                    verifiedPhases.delete('PER');
                }
            }
            const valid = evidence.filter(e => e.status === 'VERIFIED');
            // No trusted top-level audit/checkpoint without a matching persisted
            // proof record for a verified phase.
            const final = valid[valid.length - 1];
            const snapshot: ExplanationSnapshot = {
                contractVersion: EXP_CONTRACT_VERSION,
                provenance: boundary.sourceKind === 'PERSISTED_READS' &&
                    valid.length > 0 && evidence.every(e => e.status !== 'MISSING')
                    ? 'SOURCE_ATTESTED' : 'TEST_FIXTURE',
                runId: request.runId, graphId: request.graphId, actorId: request.actorId,
                decisionId: request.decisionId, evidence,
                ...projection,
                ...(final?.auditRef ? { auditRef: final.auditRef } : {}),
                ...(final?.checkpointRef ? { checkpointRef: final.checkpointRef } : {}),
                ...(decision.policyRef && verifiedPhases.has('SEC') ? { policyRef: decision.policyRef } : {}),
                ...(decision.expectedSourceVersion ? { expectedSourceVersion: decision.expectedSourceVersion } : {}),
                ...(decision.expectedRowVersion !== undefined ? { expectedRowVersion: decision.expectedRowVersion } : {}),
                ...(decision.expectedMovementCursor ? { expectedMovementCursor: decision.expectedMovementCursor } : {})
            };
            return explanationSnapshotSchema.parse(snapshot);
        }
    };
}
