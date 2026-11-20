import { z } from 'zod';

/** Pure read-only Backend risk contract. Safe to import in offline/mock Graph tests. */
export type BackendRiskObservation = {
    ingredientId: string;
    asOf: string;
    rowVersion: number;
    movementCursor: string;
    availableBase: string;
    projectedDaysRemaining: number | null;
    forecastConfidence: 'LOW' | 'MEDIUM' | 'HIGH';
    demandWindowDays: number;
    observedConsumptionMovements: number;
    incomingPurchaseOrders: { purchaseOrderId: string; unreceivedBase: string;
        confirmationSource: string; estimatedLate: boolean }[];
    outstandingPurchaseRequests: { id: string; status: 'PENDING' | 'APPROVED' | 'SENT';
        demandHashPresent: boolean }[];
    outstandingPurchaseRequestsTruncated: boolean;
    pendingStocktakes: number;
};
export type BackendRiskEvidence = { codes: string[]; observations: BackendRiskObservation[] };
const code = z.string().regex(/^[A-Z0-9_]{1,64}$/);
export const backendRiskEvidenceSchema = z.strictObject({
    codes: z.array(code).max(120),
    observations: z.array(z.strictObject({
        ingredientId: z.string().min(1).max(120),
        asOf: z.iso.datetime(),
        rowVersion: z.number().int().nonnegative(),
        movementCursor: z.string().regex(/^\d+$/),
        availableBase: z.string().regex(/^(0|[1-9]\d{0,17})(\.\d{1,4})?$/),
        projectedDaysRemaining: z.number().finite().nonnegative().nullable(),
        forecastConfidence: z.enum(['LOW', 'MEDIUM', 'HIGH']),
        demandWindowDays: z.literal(30),
        observedConsumptionMovements: z.number().int().nonnegative(),
        incomingPurchaseOrders: z.array(z.strictObject({
            purchaseOrderId: z.string().min(1).max(120),
            unreceivedBase: z.string().regex(/^(0|[1-9]\d{0,17})(\.\d{1,4})?$/),
            confirmationSource: z.string().min(1).max(120),
            estimatedLate: z.boolean()
        })).max(1000),
        outstandingPurchaseRequests: z.array(z.strictObject({
            id: z.string().min(1).max(120),
            status: z.enum(['PENDING', 'APPROVED', 'SENT']),
            demandHashPresent: z.boolean()
        })).max(64),
        outstandingPurchaseRequestsTruncated: z.boolean(),
        pendingStocktakes: z.number().int().nonnegative()
    })).min(1).max(4)
});
