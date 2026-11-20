import type { Prisma } from '@cafe-project/database';
import { z } from 'zod';
import type { InventoryRow } from './replenishment';

// The backend's canonical ingredient lot rules: only AVAILABLE and unexpired
// batches are eligible; a null expiry is accepted for legacy non-expiring stock.
// Use Decimal all the way to the JSON boundary, never binary float arithmetic.
const quantity = z.string().regex(/^(0|[1-9]\d{0,17})(\.\d{1,4})?$/);
const id = z.string().regex(/^[A-Za-z0-9][A-Za-z0-9:_-]{0,119}$/);
export const perceptionContextSchema = z.strictObject({
    ingredientId: id,
    baseUnit: z.enum(['g', 'ml', 'piece']),
    physicalQuantity: quantity,
    reservedQuantity: quantity,
    eligibleQuantity: quantity,
    availableQuantity: quantity,
    thresholdQuantity: quantity,
    belowThreshold: z.boolean(),
    excludedQuantityByReason: z.strictObject({
        expired: quantity,
        qualityHold: quantity
    }),
    lotBreakdown: z.array(z.strictObject({
        id, quantityRemaining: quantity, qualityStatus: z.string().min(1).max(80),
        expirationDate: z.iso.datetime().nullable(), eligible: z.boolean()
    })).max(1000),
    rowVersion: z.number().int().nonnegative(),
    movementCursor: z.string().regex(/^\d+$/),
    sourceReadAt: z.iso.datetime(),
    projectedDaysRemaining: z.number().finite().nonnegative().nullable().optional(),
    forecastConfidence: z.enum(['LOW', 'MEDIUM', 'HIGH']).optional(),
    demandWindowDays: z.number().int().positive().optional(),
    observedConsumptionMovements: z.number().int().nonnegative().optional(),
    incomingPurchaseOrders: z.array(z.strictObject({
        purchaseOrderId: id, unreceivedBase: quantity,
        confirmationSource: z.string().min(1).max(120), estimatedLate: z.boolean()
    })).optional(),
    outstandingPurchaseRequests: z.array(z.strictObject({
        id, status: z.enum(['PENDING', 'APPROVED', 'SENT']),
        demandHashPresent: z.boolean()
    })).optional(),
    outstandingPurchaseRequestsTruncated: z.boolean().optional(),
    pendingStocktakes: z.number().int().nonnegative().optional(),
    backendReadAt: z.iso.datetime().optional(),
    dataQualityStatus: z.enum(['VERIFIED', 'ANOMALOUS', 'STALE_CONTEXT']),
    warnings: z.array(z.string().regex(/^[A-Z0-9_]{1,64}$/)),
    requiresRevalidation: z.literal(true)
});
export type PerceptionContext = z.infer<typeof perceptionContextSchema>;

export type PerceptionSourceRow = {
    id: string; baseUnit: string; quantity: Prisma.Decimal;
    reserved: Prisma.Decimal; minThreshold: Prisma.Decimal;
    rowVersion: number; movementCursor: bigint;
    batches: {
        id: string; quantityRemaining: Prisma.Decimal;
        qualityStatus: string; expirationDate: Date | null;
    }[];
};
// Canonical fixed-point (four decimals) keeps this graph contract free from
// runtime database imports. Prisma.Decimal remains the Backend source type.
// No floating-point conversions are used for stock arithmetic.
export const inventoryScaledQuantity = (value: { toString(): string } | string | number): bigint => {
    const text = String(value);
    if (!quantity.safeParse(text).success) throw new Error('ANOMALOUS_INVENTORY');
    const [whole, fraction = ''] = text.split('.');
    return BigInt(whole!) * 10000n + BigInt(fraction.padEnd(4, '0'));
};
const asQuantity = (value: bigint): string => {
    if (value < 0n) throw new Error('ANOMALOUS_INVENTORY');
    const fraction = (value % 10000n).toString().padStart(4, '0').replace(/0+$/, '');
    return (value / 10000n).toString() + (fraction ? '.' + fraction : '');
};

/** Pure, read-only, deterministic perception. No mutation or procurement hook. */
export function analyzeInventoryPerception(
    row: PerceptionSourceRow, prior: InventoryRow, readAt = new Date()
): PerceptionContext {
    if (prior.ingredientId !== row.id || prior.id !== row.id ||
        prior.version !== String(row.rowVersion + 1) ||
        prior.remaining !== row.quantity.toString() ||
        prior.reserved !== row.reserved.toString()) {
        throw new Error('STALE_CONTEXT');
    }
    if (!id.safeParse(row.id).success || !['g', 'ml', 'piece'].includes(row.baseUnit) ||
        !Number.isSafeInteger(row.rowVersion) || row.rowVersion < 0 ||
        row.batches.length > 1000 || row.movementCursor < 0n) {
        throw new Error('ANOMALOUS_INVENTORY');
    }
    const ordered = [...row.batches].sort((a, b) =>
        (a.expirationDate?.getTime() ?? Infinity) - (b.expirationDate?.getTime() ?? Infinity) ||
        a.id.localeCompare(b.id));
    let lotTotal = 0n, eligible = 0n, expired = 0n, qualityHold = 0n;
    const warnings = new Set<string>();
    const lots = ordered.map(batch => {
        if (!id.safeParse(batch.id).success) throw new Error('ANOMALOUS_INVENTORY');
        const q = inventoryScaledQuantity(batch.quantityRemaining);
        const expiry = batch.expirationDate?.getTime() ?? null;
        if (expiry !== null && !Number.isFinite(expiry)) throw new Error('ANOMALOUS_INVENTORY');
        const isExpired = expiry !== null && expiry <= readAt.getTime();
        const isEligible = batch.qualityStatus === 'AVAILABLE' && !isExpired;
        lotTotal += q;
        if (isEligible) eligible += q;
        else if (batch.qualityStatus !== 'AVAILABLE') {
            qualityHold += q;
            if (q > 0n) warnings.add('QUALITY_HOLD');
        } else {
            expired += q;
            if (q > 0n) warnings.add('EXPIRED_STOCK_PRESENT');
        }
        if (expiry === null && q > 0n) warnings.add('UNKNOWN_EXPIRY_LOT');
        return { id: batch.id, quantityRemaining: asQuantity(q), qualityStatus: batch.qualityStatus,
            expirationDate: batch.expirationDate?.toISOString() ?? null, eligible: isEligible };
    });
    const physical = inventoryScaledQuantity(row.quantity),
        reserved = inventoryScaledQuantity(row.reserved),
        threshold = inventoryScaledQuantity(row.minThreshold);
    if (lotTotal !== physical || reserved > eligible) throw new Error('ANOMALOUS_INVENTORY');
    const available = eligible - reserved;
    if (available < threshold) warnings.add('BELOW_THRESHOLD');
    return perceptionContextSchema.parse({
        ingredientId: row.id, baseUnit: row.baseUnit,
        physicalQuantity: asQuantity(physical), reservedQuantity: asQuantity(reserved),
        eligibleQuantity: asQuantity(eligible), availableQuantity: asQuantity(available),
        thresholdQuantity: asQuantity(threshold), belowThreshold: available < threshold,
        excludedQuantityByReason: { expired: asQuantity(expired), qualityHold: asQuantity(qualityHold) },
        lotBreakdown: lots, rowVersion: row.rowVersion, movementCursor: row.movementCursor.toString(),
        sourceReadAt: readAt.toISOString(), dataQualityStatus: 'VERIFIED' as const,
        warnings: [...warnings].sort(), requiresRevalidation: true as const
    });
}
