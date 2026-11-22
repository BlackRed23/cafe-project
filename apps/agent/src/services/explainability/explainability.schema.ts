import { z } from 'zod';
import { anomalyResultSchema } from '../anomaly/anomaly.schema';
import { replanPlanSchema, replanResultSchema } from '../replanning/replanning.schema';
import { purchasingResultSchema } from '../purchasing/purchasing.schema';
import { toolSelectionDecisionSchema } from '../tool-selection/tool-selection.schema';

/** EXP is a READ-ONLY projection; it is not an authority or a second Agent graph. */
export const EXP_CONTRACT_VERSION = 'EXP_V1' as const;
export const expId = z.string().regex(/^[A-Za-z0-9][A-Za-z0-9:_-]{0,119}$/);
const instant = z.iso.datetime({ offset: true });
const decimal = z.string().regex(/^(0|[1-9]\d{0,17})(\.\d{1,4})?$/);
const reasonCode = z.string().regex(/^[A-Z][A-Z0-9_]{0,63}$/);
const hash = z.string().regex(/^[a-f0-9]{64}$/);
export const expTopicSchema = z.enum([
    'EXP-01', 'EXP-02', 'EXP-03', 'EXP-04', 'EXP-05',
    'EXP-06', 'EXP-07', 'EXP-08', 'EXP-09', 'EXP-10'
]);
export const expPhaseSchema = z.enum(['PER', 'PLN', 'TOOL', 'ACT', 'OBS', 'ANM', 'REP', 'PUR', 'SEC']);

/** These are identifiers only: never trust an actor, source or business fact in a request. */
export const explanationRequestSchema = z.strictObject({
    contractVersion: z.literal(EXP_CONTRACT_VERSION),
    runId: expId, graphId: expId, actorId: expId, decisionId: expId,
    topic: expTopicSchema, locale: z.literal('vi')
});
export type ExplanationRequest = z.infer<typeof explanationRequestSchema>;

export const explanationScopeSchema = z.strictObject({
    runId: expId, graphId: expId, actorId: expId,
    role: z.enum(['ADMIN', 'STAFF']),
    canReadDecision: z.boolean(),
    /** Authenticated caller's current server time; NEVER supplied by the model/request. */
    now: instant,
    maxAgeMs: z.number().int().nonnegative().max(86_400_000)
});
export type ExplanationScope = z.infer<typeof explanationScopeSchema>;

export const expInventorySchema = z.strictObject({
    ingredientId: expId, sourceId: expId, sourceVersion: expId,
    rowVersion: z.number().int().nonnegative(), movementCursor: z.string().regex(/^\d+$/),
    readAt: instant, evidenceRef: expId, unit: z.enum(['g', 'ml', 'piece']),
    physical: decimal, eligible: decimal, reserved: decimal, available: decimal,
    excludedExpired: decimal.optional(), excludedQuality: decimal.optional()
});

export const expActSchema = z.strictObject({
    status: z.enum(['SUCCEEDED', 'HELD_POLICY', 'NOT_EXECUTED']),
    attempts: z.number().int().min(0).max(2),
    stepId: expId, toolName: expId, toolVersion: z.string().min(1).max(40),
    checkpointRef: expId.optional(), errorCode: reasonCode.optional(),
    retryScheduled: z.boolean().optional(), timeoutObserved: z.boolean().optional()
});
export const expObservationSchema = z.strictObject({
    observationStatus: z.enum(['SUCCESS', 'FAILED', 'INSUFFICIENT_DATA', 'INVALID_OUTPUT',
        'STALE', 'PARTIAL', 'REJECTED', 'DUPLICATE']),
    dataQuality: z.enum(['VERIFIED_SCHEMA', 'TEST_FIXTURE', 'INSUFFICIENT',
        'INVALID', 'STALE', 'UNTRUSTED']),
    verifiedForBusiness: z.boolean(), auditTraceId: expId,
    invocationId: expId, errorCode: reasonCode.optional()
});
export const expSecuritySchema = z.strictObject({
    status: z.enum(['ALLOW', 'DENY', 'HOLD', 'PENDING_APPROVAL']),
    reason: z.enum(['AUTHORIZED', 'ADMIN_ONLY', 'MISSING_PERMISSION', 'INVALID_SOURCE_ACTOR',
        'PENDING_APPROVAL', 'STOCKTAKE_REJECTED', 'POLICY_HOLD']),
    policyRef: expId.optional(), approvalRef: expId.optional(),
    /** Never turn an explanation into a new authorization grant. */
    canExecute: z.boolean(), canApprove: z.boolean()
});
export const expEvidenceSchema = z.strictObject({
    eventId: expId, phase: expPhaseSchema, runId: expId, actorId: expId, graphId: expId,
    occurredAt: instant,
    status: z.enum(['VERIFIED', 'NOT_EXECUTED', 'MISSING']),
    sourceId: expId.optional(), sourceVersion: expId.optional(),
    checkpointRef: expId.optional(), auditRef: expId.optional()
});

/**
 * An adapter MUST independently load these records from an authenticated persisted
 * run/Backend, or explicitly label its controlled inputs TEST_FIXTURE.
 * The schema verifies shape/correlation, NOT source provenance on its own.
 */
export const explanationSnapshotSchema = z.strictObject({
    contractVersion: z.literal(EXP_CONTRACT_VERSION),
    provenance: z.enum(['SOURCE_ATTESTED', 'TEST_FIXTURE']),
    runId: expId, graphId: expId, actorId: expId, decisionId: expId,
    evidence: z.array(expEvidenceSchema).max(100),
    inventory: expInventorySchema.optional(),
    selection: toolSelectionDecisionSchema.optional(),
    plan: replanPlanSchema.optional(),
    act: expActSchema.optional(), observation: expObservationSchema.optional(),
    anomaly: anomalyResultSchema.optional(), replan: replanResultSchema.optional(),
    purchasing: purchasingResultSchema.optional(), security: expSecuritySchema.optional(),
    policyRef: expId.optional(), checkpointRef: expId.optional(), auditRef: expId.optional(),
    expectedSourceVersion: expId.optional(),
    expectedRowVersion: z.number().int().nonnegative().optional(),
    expectedMovementCursor: z.string().regex(/^\d+$/).optional()
});
export type ExplanationSnapshot = z.infer<typeof explanationSnapshotSchema>;

export const explanationResultSchema = z.strictObject({
    contractVersion: z.literal(EXP_CONTRACT_VERSION),
    explanationId: hash, runId: expId, graphId: expId, decisionId: expId,
    topic: expTopicSchema,
    status: z.enum(['EXPLAINED', 'REFRESH_REQUIRED', 'REVIEW_REQUIRED', 'HOLD',
        'INSUFFICIENT_EVIDENCE', 'ACCESS_DENIED']),
    messageVi: z.string().min(1).max(1200),
    claims: z.array(z.strictObject({
        kind: z.enum(['VERIFIED_FACT', 'POLICY_DECISION', 'RECOMMENDATION', 'INSUFFICIENT_EVIDENCE']),
        textVi: z.string().min(1).max(1200),
        evidenceRefs: z.array(expId).max(20)
    })).max(30),
    reasonCodes: z.array(reasonCode).max(40),
    verifiedEvidenceRefs: z.array(expId).max(100),
    evidenceGaps: z.array(reasonCode).max(40),
    sourceFreshness: z.enum(['FRESH', 'STALE', 'UNVERIFIED', 'NOT_APPLICABLE']),
    evidenceCompleteness: z.enum(['COMPLETE', 'PARTIAL', 'MISSING']),
    traceabilityLevel: z.enum(['PERSISTED', 'CONTRACT_ONLY', 'UNVERIFIED']),
    policyBasis: expId.nullable(), requiredHumanAction: z.enum(['NONE', 'REQUEST_AUTHORIZED_READ',
        'REQUEST_HUMAN_REVIEW', 'REQUEST_ADMIN_APPROVAL']),
    limitations: z.array(reasonCode).max(40),
    /** Deterministic leaf computation; this result is never an approval or purchase. */
    readOnly: z.literal(true), noWrite: z.literal(true),
    authorizedToExecute: z.literal(false), authorizedToApprove: z.literal(false),
    authorizedToPurchase: z.literal(false)
});
export type ExplanationResult = z.infer<typeof explanationResultSchema>;

export interface ExplanationAuthority {
    /** Must enforce server-authenticated actor and exact run/decision isolation. */
    load(request: ExplanationRequest, scope: ExplanationScope): Promise<unknown>;
}
