import { z } from 'zod';
import { perceptionContextSchema } from '../../workflows/inventory-perception';
import { backendRiskEvidenceSchema } from '../../workflows/agent-backend-risk-evidence';
import { inboundToolReadOutputSchema, stocktakeToolReadOutputSchema } from '../tool-selection/tool-business-read';

export const PUR_CONTRACT_VERSION = 'PUR_INGREDIENT_V1' as const;
const id = z.string().regex(/^[A-Za-z0-9][A-Za-z0-9:_-]{0,119}$/);
const decimal = z.string().regex(/^(0|[1-9]\d{0,13})(\.\d{1,4})?$/);
const date = z.iso.datetime();
const reason = z.string().regex(/^[A-Z][A-Z0-9_]{0,63}$/);

/** Identifiers are claims used only for comparison against an independent Backend read. */
export const purchasingInputSchema = z.strictObject({
    contractVersion: z.literal(PUR_CONTRACT_VERSION),
    runId: id, actorId: id, ingredientId: id,
    expectedRowVersion: z.number().int().nonnegative(),
    expectedMovementCursor: z.string().regex(/^\d+$/),
    requestedRecipeId: id.nullable(),
});
export type PurchasingInput = z.infer<typeof purchasingInputSchema>;

const supplier = z.strictObject({
    supplierId: id, ingredientId: id, status: z.enum(['ACTIVE', 'INACTIVE']),
    deleted: z.boolean(), conversionTargetUnit: z.enum(['g', 'ml', 'piece']),
    purchaseUnit: z.string().trim().min(1).max(80),
    conversionToBase: decimal,
    minOrderQuantity: z.number().int().positive().max(1_000_000_000),
    /** Null price means NO executable Backend snapshot can be created. */
    unitPrice: z.string().regex(/^(0|[1-9]\d{0,11})(\.\d{1,2})?$/).nullable(),
    evidenceRef: id
});

/** Returned by a trusted adapter that independently reads current Backend business state.
 * Parsing alone never confers trust: production MUST implement verify() with a live
 * authorized read; an echoed caller-supplied object is not an authority.
 */
export const purchasingAuthorityProofSchema = z.strictObject({
    runId: id, actorId: id, actorRole: z.enum(['ADMIN', 'STAFF']),
    ingredientId: id, verifiedAt: date, evidenceRef: id,
    perception: perceptionContextSchema,
    backendRisk: backendRiskEvidenceSchema,
    policy: z.strictObject({
        reference: id, source: z.enum(['DATABASE', 'APPROVED_POLICY']),
        /** A verified target; never synthesized from an LLM or guessed sales rate. */
        targetStockBase: decimal,
    }).nullable(),
    recipeDemand: z.strictObject({
        recipeId: id, quantityBase: decimal,
        baseUnit: z.enum(['g', 'ml', 'piece']),
        source: z.literal('AUTHORITATIVE_BACKEND_RECIPE'),
        evidenceRef: id
    }).nullable(),
    suppliers: z.array(supplier).max(100),
    inbound: z.array(inboundToolReadOutputSchema).max(50),
    stocktake: stocktakeToolReadOutputSchema.nullable(),
});
export type PurchasingAuthorityProof = z.infer<typeof purchasingAuthorityProofSchema>;
export interface PurchasingAuthority { verify(input: PurchasingInput): Promise<unknown> }

export const purchasingResultSchema = z.strictObject({
    contractVersion: z.literal(PUR_CONTRACT_VERSION),
    runId: id, actorId: id, ingredientId: id,
    status: z.enum(['NO_PURCHASE_NEEDED', 'RECOMMEND_PURCHASE', 'INSUFFICIENT_EVIDENCE',
        'REVIEW_REQUIRED', 'HOLD', 'AWAITING_APPROVAL']),
    reasons: z.array(reason).min(1).max(40),
    evidenceRefs: z.array(id).max(150),
    auditTraceId: id,
    sourceAttested: z.boolean(),
    rowVersion: z.number().int().nonnegative().nullable(),
    movementCursor: z.string().regex(/^\d+$/).nullable(),
    baseUnit: z.enum(['g', 'ml', 'piece']).nullable(),
    physicalBase: decimal.nullable(), eligibleBase: decimal.nullable(),
    reservedBase: decimal.nullable(), availableBase: decimal.nullable(),
    excludedExpiredBase: decimal.nullable(), excludedQualityBase: decimal.nullable(),
    requiredBase: decimal.nullable(), shortageBase: decimal.nullable(),
    recommendedBase: decimal.nullable(),
    purchasePacks: z.number().int().nonnegative().nullable(),
    supplierId: id.nullable(), purchaseUnit: z.string().nullable(),
    incomingOutstandingBase: decimal.nullable(), receivedObservedBase: decimal.nullable(),
    policyRef: id.nullable(),
    /** Preview ONLY; not an authorized request and does not include email credentials. */
    draftPreview: z.strictObject({
        ingredientId: id, supplierId: id, quantity: z.number().int().positive(),
        unit: z.string().min(1), baseUnit: z.enum(['g', 'ml', 'piece']),
        unitsPerPack: decimal, unitPrice: z.string().min(1)
    }).nullable(),
    requestFingerprint: z.string().regex(/^[a-f0-9]{64}$/),
    nextPermittedAction: z.enum(['NONE', 'REQUEST_AUTHORIZED_READ',
        'REQUEST_HUMAN_REVIEW', 'REVIEW_EXISTING_PURCHASE_REQUEST']),
    readOnly: z.literal(true), authorizedToPurchase: z.literal(false),
    authorizedToApprove: z.literal(false), authorizedToPay: z.literal(false),
    requiresFreshReadBeforeWrite: z.literal(true),
    persistenceStatus: z.literal('DECISION_ONLY'),
});
export type PurchasingResult = z.infer<typeof purchasingResultSchema>;
