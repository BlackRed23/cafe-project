/**
 * Restricted analytical continuation for an already HELD stocktake run.
 * This is NOT a replacement for inventory.recommend or a purchasing plan.
 * The only evidence permitted is the verified perception, pending stocktake
 * and output from the existing registered BACKEND READ tools.
 */
import { z } from 'zod';
import { inventoryScaledQuantity, perceptionContextSchema, type PerceptionContext } from '../inventory-perception';

const qty = z.string().regex(/^(0|[1-9]\d{0,17})(\.\d{1,4})?$/);
const id = z.string().regex(/^[A-Za-z0-9][A-Za-z0-9:_-]{0,119}$/);
export const stocktakeScenarioSourceSchema = z.strictObject({
    ingredientId: id,
    stocktakeId: id,
    stocktakeStatus: z.enum(['DRAFT', 'PENDING_APPROVAL', 'NEEDS_INVESTIGATION']),
    stocktakeRevision: z.number().int().nonnegative(),
    rowVersion: z.number().int().nonnegative(),
    movementCursor: z.string().regex(/^\d+$/),
    officialBase: qty,
    hypotheticalBase: qty,
    observedVarianceBase: z.string().regex(/^-?(0|[1-9]\d{0,17})(\.\d{1,4})?$/),
    targetBase: qty,
    baseUnit: z.enum(['g', 'ml', 'piece']),
    entryRevisions: z.array(z.strictObject({
        batchId: id, revision: z.number().int().nonnegative(),
        observedCursor: z.string().regex(/^\d+$/)
    })).min(1).max(1000),
    sourceDigest: z.string().regex(/^[a-f0-9]{64}$/)
});
export type StocktakeScenarioSource = z.infer<typeof stocktakeScenarioSourceSchema>;
export type StocktakeScenarioAnalysis = {
    permission: 'READ_ONLY_ANALYSIS'; businessExecution: 'HELD_POLICY';
    originalHoldReason: 'STOCKTAKE_UNCERTAIN';
    planningStatus: 'NOT_EXECUTED';
    targetBasis: 'INGREDIENT_MIN_THRESHOLD_NOT_FORECAST';
    ingredientId: string; stocktakeId: string; status: string;
    baseUnit: string; targetBase: string;
    confirmed: { stockBase: string; shortageBase: string; basis: 'OFFICIAL_AVAILABLE_UNCHANGED' };
    hypothetical: { stockBase: string; shortageBase: string; basis: 'UNAPPROVED_COUNT_NOT_POSTED' };
    sourceVersion: { rowVersion: number; movementCursor: string;
        stocktakeRevision: number; sourceDigest: string; entryRevisions: StocktakeScenarioSource['entryRevisions'] };
    formula: 'max(0, targetBase - stockBase)';
    verifiedReadTools: ['getIngredientAvailability', 'getIngredientBatches'];
    noPurchasingAuthority: true;
};

const amount = (v: bigint): string => {
    if (v < 0n) throw new Error('INVALID_SCENARIO_SOURCE');
    const decimal = (v % 10000n).toString().padStart(4, '0').replace(/0+$/, '');
    return (v / 10000n).toString() + (decimal ? '.' + decimal : '');
};
const signed = (text: string): bigint => text.startsWith('-')
    ? -inventoryScaledQuantity(text.slice(1)) : inventoryScaledQuantity(text);

/** Deterministic fixed-point math. No supplier, forecast or approval inference. */
export function calculateHeldStocktakeScenario(
    perceptionRaw: PerceptionContext, sourceRaw: StocktakeScenarioSource,
    availabilityRaw: unknown, batchesRaw: unknown
): StocktakeScenarioAnalysis {
    const parsed = perceptionContextSchema.safeParse(perceptionRaw);
    const checked = stocktakeScenarioSourceSchema.safeParse(sourceRaw);
    const availability = z.strictObject({
        ingredientId: id, baseUnit: z.enum(['g', 'ml', 'piece']),
        quantity: z.number().finite().nonnegative(), reserved: z.number().finite().nonnegative(),
        available: z.number().finite(), active: z.literal(true),
        rowVersion: z.number().int().nonnegative()
    }).safeParse(availabilityRaw);
    const batches = z.strictObject({
        ingredientId: id, baseUnit: z.enum(['g', 'ml', 'piece']),
        batches: z.array(z.strictObject({
            id, quantityRemaining: z.number().finite().nonnegative(),
            expirationDate: z.iso.datetime().nullable(), receivedAt: z.iso.datetime()
        })).max(1000)
    }).safeParse(batchesRaw);
    if (!parsed.success || !checked.success || !availability.success || !batches.success) {
        throw new Error('INVALID_SCENARIO_SOURCE');
    }
    const p = parsed.data, s = checked.data, a = availability.data, b = batches.data;
    if (p.ingredientId !== s.ingredientId || p.rowVersion !== s.rowVersion ||
        p.movementCursor !== s.movementCursor ||
        p.physicalQuantity !== s.officialBase || p.thresholdQuantity !== s.targetBase ||
        p.baseUnit !== s.baseUnit || s.baseUnit !== 'ml' ||
        a.ingredientId !== s.ingredientId || b.ingredientId !== s.ingredientId ||
        a.baseUnit !== s.baseUnit || b.baseUnit !== s.baseUnit ||
        a.rowVersion !== s.rowVersion ||
        inventoryScaledQuantity(String(a.quantity)) !== inventoryScaledQuantity(s.officialBase) ||
        inventoryScaledQuantity(String(a.reserved)) !== inventoryScaledQuantity(p.reservedQuantity) ||
        inventoryScaledQuantity(String(a.available)) !==
            inventoryScaledQuantity(p.physicalQuantity) - inventoryScaledQuantity(p.reservedQuantity) ||
        b.batches.length !== p.lotBreakdown.length ||
        b.batches.some(lot => {
            const found = p.lotBreakdown.find(item => item.id === lot.id);
            return !found ||
                inventoryScaledQuantity(String(lot.quantityRemaining)) !== inventoryScaledQuantity(found.quantityRemaining) ||
                lot.expirationDate !== found.expirationDate;
        }) ||
        s.stocktakeStatus === 'DRAFT' || p.reservedQuantity !== '0' ||
        s.entryRevisions.length !== b.batches.length) {
        throw new Error('INVALID_SCENARIO_SOURCE');
    }
    const official = inventoryScaledQuantity(s.officialBase),
        hypothetical = inventoryScaledQuantity(s.hypotheticalBase),
        target = inventoryScaledQuantity(s.targetBase);
    if (hypothetical - official !== signed(s.observedVarianceBase) ||
        inventoryScaledQuantity(p.availableQuantity) !== official ||
        s.entryRevisions.some(item => !b.batches.some(lot => lot.id === item.batchId))) {
        throw new Error('INVALID_SCENARIO_SOURCE');
    }
    return {
        permission: 'READ_ONLY_ANALYSIS', businessExecution: 'HELD_POLICY',
        originalHoldReason: 'STOCKTAKE_UNCERTAIN', planningStatus: 'NOT_EXECUTED',
        targetBasis: 'INGREDIENT_MIN_THRESHOLD_NOT_FORECAST',
        ingredientId: s.ingredientId, stocktakeId: s.stocktakeId,
        status: s.stocktakeStatus, baseUnit: s.baseUnit, targetBase: s.targetBase,
        confirmed: { stockBase: s.officialBase,
            shortageBase: amount(target > official ? target - official : 0n),
            basis: 'OFFICIAL_AVAILABLE_UNCHANGED' },
        hypothetical: { stockBase: s.hypotheticalBase,
            shortageBase: amount(target > hypothetical ? target - hypothetical : 0n),
            basis: 'UNAPPROVED_COUNT_NOT_POSTED' },
        sourceVersion: { rowVersion: s.rowVersion, movementCursor: s.movementCursor,
            stocktakeRevision: s.stocktakeRevision, sourceDigest: s.sourceDigest,
            entryRevisions: s.entryRevisions },
        formula: 'max(0, targetBase - stockBase)',
        verifiedReadTools: ['getIngredientAvailability', 'getIngredientBatches'],
        noPurchasingAuthority: true
    };
}
