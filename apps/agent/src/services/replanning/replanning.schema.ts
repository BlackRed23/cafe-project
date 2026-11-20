import { z } from 'zod';
import { planningResultSchema } from '../planning/planning.schema';
import { anomalyResultSchema } from '../anomaly/anomaly.schema';

export const REP_CONTRACT_VERSION = 'REP_V1' as const;
const id = z.string().regex(/^[A-Za-z0-9][A-Za-z0-9:_-]{0,119}$/);
const reason = z.string().regex(/^[A-Z][A-Z0-9_]{0,63}$/);
const timestamp = z.iso.datetime({ offset: true });
const decimal = z.string().regex(/^(0|[1-9]\d{0,17})(\.\d{1,4})?$/);

/** Adapter maps EXISTING AgentWorkflow Plan/Execution to this read-only REP view.
 * PLN does not currently assign a planId or revision. Both must come from the
 * authenticated persisted execution, not the planner's recommendations.
 */
export const replanStepSchema = z.strictObject({
    stepId: id, ingredientId: id, kind: z.enum(['READ', 'REVIEW']),
    status: z.enum(['PENDING', 'COMPLETED']), dependsOn: z.array(id).max(20)
});
export const replanPlanSchema = z.strictObject({
    planId: id, version: z.number().int().positive().max(2147483646),
    status: z.enum(['ACTIVE', 'HELD']),
    steps: z.array(replanStepSchema).min(1).max(40)
});
export const replanSourceSchema = z.strictObject({
    ingredientId: id, sourceId: id, sourceVersion: id,
    rowVersion: z.number().int().nonnegative(), movementCursor: z.string().regex(/^\d+$/),
    readAt: timestamp, availableBase: decimal, eligibleBase: decimal,
    physicalBase: decimal, reservedBase: decimal,
    pendingStocktake: z.boolean(), uncertainInbound: z.boolean(),
    /** Sum of expired/quality-held stock, never counted as eligible. */
    blockedBatchBase: decimal,
    evidenceRef: id
});

/** ACT is a SANITIZED projection from actual ActReadResult, not a competing ACT contract. */
export const replanActSchema = z.strictObject({
    status: z.enum(['SUCCEEDED', 'HELD_POLICY', 'NOT_EXECUTED']),
    attempts: z.number().int().min(0).max(2),
    errorCode: reason.optional(),
    toolName: id, toolVersion: z.string().min(1).max(40)
});
/** OBS output projection: only known classification and authenticated identity. */
export const replanObsSchema = z.strictObject({
    status: z.enum(['SUCCESS', 'FAILED', 'INSUFFICIENT_DATA', 'INVALID_OUTPUT',
        'STALE', 'PARTIAL', 'REJECTED', 'DUPLICATE']),
    dataQuality: z.enum(['VERIFIED_SCHEMA', 'TEST_FIXTURE', 'INSUFFICIENT', 'INVALID', 'STALE', 'UNTRUSTED']),
    auditTraceId: id, runId: id, actorId: id, invocationId: id,
    toolName: id, verifiedForBusiness: z.boolean(),
    errorCode: reason.optional(), requiresFreshRead: z.boolean()
});

export const replanInputSchema = z.strictObject({
    contractVersion: z.literal(REP_CONTRACT_VERSION),
    runId: id, graphId: id, actorId: id, eventId: id,
    plan: replanPlanSchema, planning: planningResultSchema,
    act: replanActSchema, observation: replanObsSchema,
    anomaly: anomalyResultSchema,
    /** Identity and current evidence must come from the verified ACT/OBS/Backend adapter. */
    sources: z.array(replanSourceSchema).min(1).max(4),
    usedReplans: z.number().int().nonnegative().max(100),
    maxReplans: z.number().int().min(0).max(5),
    priorFingerprints: z.array(z.string().regex(/^[a-f0-9]{64}$/)).max(50)
});
export type ReplanInput = z.infer<typeof replanInputSchema>;
export type ReplanSource = z.infer<typeof replanSourceSchema>;

/** Verification must independently read the existing authenticated execution,
 * source snapshot and policy. An echoed caller-provided hash is NOT authority.
 */
export const replanAuthorityProofSchema = z.strictObject({
    runId: id, graphId: id, actorId: id, planId: id, eventId: id,
    observationTraceId: id, policyRef: id, verifiedAt: timestamp,
    sources: z.array(replanSourceSchema).min(1).max(4)
});
export type ReplanAuthorityProof = z.infer<typeof replanAuthorityProofSchema>;
export interface ReplanAuthority {
    verify(input: ReplanInput): Promise<unknown>;
}

export const replanResultSchema = z.strictObject({
    contractVersion: z.literal(REP_CONTRACT_VERSION),
    runId: id, graphId: id, actorId: id, eventId: id,
    status: z.enum(['KEEP_PLAN', 'REFRESH_REQUIRED', 'REPLAN_PROPOSED', 'REVIEW_REQUIRED', 'HOLD']),
    priorPlanId: id, priorPlanVersion: z.number().int().positive(),
    /** Null: only Graph/Repository can allocate a durable new planId. */
    revisedPlanId: id.nullable(), proposedPlanVersion: z.number().int().positive().nullable(),
    changedStepRefs: z.array(id).max(40), reasons: z.array(reason).min(1).max(40),
    evidenceRefs: z.array(id).max(40), sourceFingerprints: z.array(z.string().regex(/^[a-f0-9]{64}$/)).max(4),
    eventFingerprint: z.string().regex(/^[a-f0-9]{64}$/),
    readOnly: z.literal(true), authorizedToExecute: z.literal(false),
    authorizedToPurchase: z.literal(false), authorizedToApprove: z.literal(false),
    requiresPolicyValidation: z.literal(true),
    nextPermittedAction: z.enum(['NONE', 'REQUEST_AUTHORIZED_READ', 'REQUEST_HUMAN_REVIEW',
        'SUBMIT_PLAN_FOR_VALIDATION']),
    usedReplans: z.number().int().nonnegative(), maxReplans: z.number().int().nonnegative(),
    auditTraceId: id, sourceAttested: z.boolean(), persistenceStatus: z.literal('PROPOSAL_ONLY')
});
export type ReplanResult = z.infer<typeof replanResultSchema>;
