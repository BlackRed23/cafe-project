import { z } from 'zod';

/** Contract-only adapter. ACT/OBS do not currently persist an ANM-authoritative snapshot. */
export const ANM_CONTRACT_VERSION = 'ANM_OBSERVATION_V1' as const;
const id = z.string().regex(/^[A-Za-z0-9][A-Za-z0-9:_-]{0,119}$/);
const instant = z.iso.datetime({ offset: true });
const signedQuantity = z.string().regex(/^-?(0|[1-9]\d{0,17})(\.\d{1,4})?$/);
const nonnegative = z.string().regex(/^(0|[1-9]\d{0,17})(\.\d{1,4})?$/);
const cursor = z.string().regex(/^\d+$/);

export const anomalyInputSchema = z.strictObject({
    contractVersion: z.literal(ANM_CONTRACT_VERSION),
    runId: id, actorId: id, observationId: id,
    observation: z.strictObject({
        observationStatus: z.enum(['SUCCESS', 'FAILED', 'INSUFFICIENT_DATA', 'INVALID_OUTPUT',
            'STALE', 'PARTIAL', 'REJECTED', 'DUPLICATE']),
        dataQuality: z.enum(['VERIFIED_SCHEMA', 'TEST_FIXTURE', 'INSUFFICIENT',
            'INVALID', 'STALE', 'UNTRUSTED']),
        auditTraceId: id,
        verifiedForBusiness: z.boolean()
    }),
    source: z.strictObject({
        kind: z.enum(['OBS_RESULT', 'BACKEND_READ']), sourceId: id,
        sourceVersion: id, readAt: instant, rowVersion: z.number().int().nonnegative().optional(),
        movementCursor: cursor.optional(), traceRef: id
    }),
    entity: z.strictObject({ ingredientId: id, batchId: id.optional(),
        baseUnit: z.enum(['g', 'ml', 'piece']) }),
    stock: z.strictObject({
        physical: signedQuantity, eligible: signedQuantity,
        reserved: signedQuantity, available: signedQuantity
    }).optional(),
    batches: z.array(z.strictObject({
        id, physical: signedQuantity,
        qualityStatus: z.enum(['AVAILABLE', 'QUARANTINED', 'RECALLED', 'UNAVAILABLE', 'UNKNOWN']),
        expirationDate: instant.nullable(), eligibleForSale: z.boolean(),
        originRef: id.optional()
    })).max(1000).optional(),
    stocktake: z.strictObject({
        id, expected: nonnegative, counted: nonnegative, variance: signedQuantity,
        status: z.enum(['DRAFT', 'PENDING', 'SUBMITTED', 'APPROVED', 'REJECTED']),
        adjustmentApplied: z.boolean(), sourceVersion: id
    }).optional(),
    consumption: z.strictObject({
        observedTotal: nonnegative, windowDays: z.number().int().positive().max(365),
        baselinePerDay: nonnegative.nullable(), historyDays: z.number().int().nonnegative(),
        historyMovements: z.number().int().nonnegative()
    }).optional(),
    reconciliation: z.strictObject({
        ledgerPhysical: nonnegative, aggregatePhysical: nonnegative, batchPhysical: nonnegative,
        reserved: nonnegative, rowVersion: z.number().int().nonnegative(),
        movementCursor: cursor
    }).optional(),
    inbound: z.array(z.strictObject({
        purchaseOrderId: id, orderedBase: nonnegative, receivedBase: nonnegative,
        goodsReceiptRefs: z.array(id).max(100), receiptReferences: z.array(id).max(100),
        conversionVerified: z.boolean(),
        status: z.enum(['PENDING', 'SENT', 'PARTIALLY_RECEIVED', 'RECEIVED', 'CANCELLED'])
    })).max(100).optional()
});
export type AnomalyInput = z.infer<typeof anomalyInputSchema>;

/** Proof is created by an authenticated source adapter, NOT supplied by the LLM or input. */
export const authorityProofSchema = z.strictObject({
    actorId: id, runId: id, observationId: id, sourceId: id, sourceVersion: id,
    evidenceHash: z.string().regex(/^[a-f0-9]{64}$/),
    policyRef: id, recordedAt: instant,
    rowVersion: z.number().int().nonnegative().optional(),
    movementCursor: cursor.optional(),
    /** Previous reported events, read from a trusted persisted ledger by the adapter. */
    priorEventIds: z.array(z.string().regex(/^[a-f0-9]{64}$/)).max(200).default([]),
    /** Must originate from approved Backend settings; absent means no spike threshold. */
    consumptionPolicy: z.strictObject({
        thresholdMultiplier: nonnegative, minimumHistoryDays: z.number().int().positive(),
        minimumHistoryMovements: z.number().int().positive()
    }).optional()
});
export type AuthorityProof = z.infer<typeof authorityProofSchema>;
export type AnomalyAuthority = {
    /** Must independently authorize actor and compare content with trusted ACT/OBS/Backend. */
    verify(input: AnomalyInput): Promise<unknown>;
};

export const anomalyCodeSchema = z.enum([
    'NEGATIVE_INVENTORY', 'NEGATIVE_AVAILABLE_SHORTAGE', 'INCONSISTENT_STOCK',
    'STOCKTAKE_VARIANCE', 'UNAPPROVED_STOCKTAKE_MUTATION', 'STOCKTAKE_VERSION_DRIFT',
    'CONSUMPTION_SPIKE', 'CONSUMPTION_BASELINE_MISSING', 'CONSUMPTION_WINDOW_INADEQUATE',
    'CONSUMPTION_POLICY_MISSING', 'EXPIRED_BATCH', 'QUARANTINED_BATCH',
    'RECALLED_BATCH', 'UNAVAILABLE_BATCH', 'UNKNOWN_BATCH_QUALITY', 'UNKNOWN_EXPIRY_LOT',
    'SELLABLE_BATCH_CONFLICT', 'BATCH_SUM_MISMATCH', 'SOURCE_BALANCE_CONFLICT',
    'RECONCILIATION_TIMING_DIFFERENCE', 'PO_OVERRECEIPT', 'PO_MISSING_RECEIPT',
    'PO_DUPLICATE_RECEIPT', 'PO_CONVERSION_UNVERIFIED', 'PO_STATUS_CONFLICT',
    'INVALID_OBSERVATION', 'NO_BUSINESS_EVIDENCE', 'STALE_CONTEXT', 'SOURCE_VERSION_CONFLICT',
    'SOURCE_UNVERIFIED'
]);
export type AnomalyCode = z.infer<typeof anomalyCodeSchema>;
export const anomalyResultSchema = z.strictObject({
    contractVersion: z.literal(ANM_CONTRACT_VERSION),
    runId: id, observationId: id, sourceVerified: z.boolean(),
    evidenceLevel: z.enum(['UNIT_ONLY', 'SOURCE_ATTESTED']),
    status: z.enum(['NORMAL', 'WARNING', 'REVIEW_REQUIRED', 'HOLD', 'INSUFFICIENT_EVIDENCE']),
    readOnly: z.literal(true), canApprove: z.literal(false), canPurchase: z.literal(false),
    requiresFreshRead: z.boolean(), requiresHumanReview: z.boolean(),
    findings: z.array(z.strictObject({
        code: anomalyCodeSchema,
        severity: z.enum(['INFO', 'WARNING', 'REVIEW', 'CRITICAL', 'INSUFFICIENT']),
        entityId: id, eventId: z.string().regex(/^[a-f0-9]{64}$/),
        sourceVersion: id, sourceConfidence: z.enum(['UNVERIFIED', 'ATTESTED']),
        policyRef: id.nullable(), traceRef: id,
        observedEvidence: z.record(z.string(), z.string()),
        recommendedRoute: z.enum(['CONTINUE', 'REVIEW', 'HOLD']),
        requiresFreshRead: z.boolean(), requiresHumanReview: z.boolean(),
        duplicate: z.boolean(), newRecommendation: z.boolean(), noWrite: z.literal(true)
    })).max(6000)
});
export type AnomalyResult = z.infer<typeof anomalyResultSchema>;
