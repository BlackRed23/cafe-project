import { z } from 'zod';
import { perceptionContextSchema } from '../../workflows/inventory-perception';
import { backendRiskEvidenceSchema } from '../../workflows/agent-backend-risk-evidence';

/** Versioned read-only dependency on the current PER/Backend observation contract.
 * Neither a caller-supplied acceptance flag nor this schema authenticates a live read.
 */
export const PLN_CONTRACT_VERSION = 'PLN_PER_BACKEND_V1' as const;
const id = z.string().regex(/^[A-Za-z0-9][A-Za-z0-9:_-]{0,119}$/);
const quantity = z.string().regex(/^(0|[1-9]\d{0,17})(\.\d{1,4})?$/);

export const planningInputSchema = z.strictObject({
    contractVersion: z.literal(PLN_CONTRACT_VERSION),
    source: z.enum(['CONTRACT_FIXTURE', 'PER_LIVE_VERIFIED']),
    /** A PARTIAL PER result can never become verified just because its numbers look plausible. */
    perAcceptance: z.enum(['PARTIAL', 'E2E_VERIFIED']),
    mode: z.literal('READ_ONLY'),
    perception: z.array(perceptionContextSchema).min(1).max(4),
    backendRisk: backendRiskEvidenceSchema,
    recommendations: z.array(z.strictObject({
        ingredientId: id,
        baseUnit: z.enum(['g', 'ml', 'piece']),
        available: quantity,
        minStock: quantity,
        targetStock: quantity,
        recommendedBaseQuantity: quantity,
        sourceVersion: z.string().regex(/^[1-9]\d*$/)
    })).min(1).max(4)
});
export type PlanningInput = z.infer<typeof planningInputSchema>;

const decisionReason = z.string().regex(/^[A-Z0-9_]{1,64}$/);
export const planningResultSchema = z.strictObject({
    contractVersion: z.literal(PLN_CONTRACT_VERSION),
    status: z.enum(['HOLD', 'REVIEW_CANDIDATE', 'NO_SHORTAGE']),
    readOnly: z.literal(true),
    authorizedToPurchase: z.literal(false),
    authorizedToApprove: z.literal(false),
    requiresFreshReadAtIntegration: z.literal(true),
    reasons: z.array(decisionReason),
    candidates: z.array(z.strictObject({
        ingredientId: id,
        baseUnit: z.enum(['g', 'ml', 'piece']),
        rowVersion: z.number().int().nonnegative(),
        movementCursor: z.string().regex(/^\d+$/),
        availableBase: quantity,
        /** Null if evidence is blocked or not independently verified. */
        suggestedBase: quantity.nullable(),
        reviewOnly: z.literal(true)
    })).max(4)
});
export type PlanningResult = z.infer<typeof planningResultSchema>;
