import { z } from 'zod';
import {
    stocktakeReadInputSchema, inboundReadInputSchema,
    stocktakeToolReadOutputSchema, inboundToolReadOutputSchema
} from '../services/tool-selection/tool-business-read';

const id = z.string().regex(/^[A-Za-z0-9][A-Za-z0-9:_-]{0,119}$/);
const qty = z.number().finite().nonnegative().max(1e12);
const unit = z.enum(['g', 'ml', 'piece']);
const object = z.strictObject;
const ingredient = object({ ingredientId: id });
const availability = object({ ingredientId: id, baseUnit: unit, quantity: qty, reserved: qty,
    available: z.number().finite(), active: z.boolean(), rowVersion: z.number().int().nonnegative() });
const batch = object({ id, quantityRemaining: qty, expirationDate: z.iso.datetime().nullable(), receivedAt: z.iso.datetime() });
const supplier = object({ supplierId: id, ingredientId: id, purchaseUnit: z.string().min(1),
    conversionQuantity: qty.positive(), baseUnit: unit, pricePerBaseUnit: qty });
const dates = object({ productId: id, from: z.iso.datetime(), to: z.iso.datetime() })
    .refine(v => Date.parse(v.from) < Date.parse(v.to) && Date.parse(v.to) - Date.parse(v.from) <= 90 * 86400000);

/** Contract catalog only; no planner, executor, database access or write registration. */
const definitions = {
    getIngredientAvailability: { category: 'READ', purpose: 'Read aggregate stock; not sellable/FEFO stock.',
        permission: 'inventory.read', service: 'ingredientService.getById', status: 'IMPLEMENTED',
        input: ingredient, output: availability },
    getIngredientBatches: { category: 'READ', purpose: 'Inspect batches; no reservation allocation.',
        permission: 'inventory.read', service: 'ingredientService.getById', status: 'IMPLEMENTED',
        input: ingredient, output: object({ ingredientId: id, baseUnit: unit, batches: z.array(batch) }) },
    getRecipeRequirements: { category: 'READ', purpose: 'Read active recipe base quantities per recipe yield; optional lines explicit.',
        permission: 'recipe.read', service: 'recipeService.getActiveByProduct', status: 'IMPLEMENTED',
        input: object({ productId: id }), output: object({ recipeId: id, productId: id, version: z.number().int().positive(),
            yieldQuantity: qty.positive(), ingredients: z.array(object({ ingredientId: id, baseUnit: unit, quantityBase: qty, optional: z.boolean() })) }) },
    getSalesHistory: { category: 'READ', purpose: 'Paid completed sales by committedAt; exclude any refunded order; report missing timestamps, max 90 days.',
        permission: 'sales.read', service: 'getSalesHistory', status: 'IMPLEMENTED',
        input: dates, output: object({ productId: id, from: z.iso.datetime(), to: z.iso.datetime(), soldQuantity: qty,
            includedItems: qty.int(), excludedCancelledQuantity: qty, excludedRefundedQuantity: qty, excludedUnpaidQuantity: qty,
            excludedUncommittedQuantity: qty, missingCommittedAtItems: qty.int(), complete: z.boolean(),
            timeBasis: z.literal('OrderItem.committedAt'), refundPolicy: z.literal('EXCLUDE_ANY_REFUNDED_ORDER') }) },
    getStocktakeStatus: { category: 'READ', purpose: 'Read pending physical count and unapproved variance; never approve or adjust inventory.',
        permission: 'inventory.read', service: 'GET /api/stocktakes/:id', status: 'IMPLEMENTED',
        input: stocktakeReadInputSchema, output: stocktakeToolReadOutputSchema },
    getInboundPurchaseOrder: { category: 'READ', purpose: 'Read outstanding PO and receipt provenance; not supplier confirmation or physical inventory.',
        permission: 'purchase.read', service: 'GET /api/purchase-orders/:id + ingredient batches', status: 'IMPLEMENTED',
        input: inboundReadInputSchema, output: inboundToolReadOutputSchema },
    findIngredientSuppliers: { category: 'READ', purpose: 'Read active supplier mappings; prices are references, not confirmed quotes.',
        permission: 'supplier.read', service: 'supplierService.findIngredientSuppliers', status: 'IMPLEMENTED',
        input: ingredient, output: z.array(supplier) },
    calculateReorderQuantity: { category: 'CALCULATION', purpose: 'Backend policy and observed CONSUME demand; conservative usable stock, supplier packs/MOQ; recommendation only.',
        permission: 'purchase.plan', service: 'ingredientService.calculateReorderQuantity', status: 'IMPLEMENTED',
        input: object({ ingredientId: id, supplierId: id.optional() }), output: object({ ingredientId: id, supplierId: id, baseUnit: unit,
            quantity: qty, packs: qty.int(), purchaseUnit: z.string().min(1), conversionQuantity: qty.positive(), minOrderQuantity: qty.int().positive(),
            aggregateAvailable: z.number().finite(), eligibleStock: qty, usableStock: qty, unknownExpiryStock: qty,
            observedConsumption: qty, dailyConsumption: qty, demandRecords: qty.int(), demandBasis: z.literal('OBSERVED_ORDER_CONSUME'),
            demandFrom: z.iso.datetime(), demandTo: z.iso.datetime(),
            targetStock: qty, planningDays: qty.int().positive(), leadTimeDays: qty.int(), safetyDays: qty.int(),
            ingredientVersion: qty.int(), supplierUpdatedAt: z.iso.datetime(), capturedAt: z.iso.datetime(),
            settingsSource: z.enum(['DATABASE', 'DEFAULT_POLICY']), estimatedCost: z.string().regex(/^\d+\.\d{2}$/),
            policyVersion: z.literal('OBSERVED_CONSUMPTION_V1'), reservationPolicy: z.literal('ALL_RESERVED_FROM_ELIGIBLE'), priceKind: z.literal('REFERENCE') }) },
    estimatePurchaseCost: { category: 'CALCULATION', purpose: 'Estimate base quantity using reference price; not confirmed quote; excludes tax/shipping/pack minimums.',
        permission: 'supplier.read', service: 'estimateBasePurchaseCost + supplierService.findIngredientSuppliers', status: 'IMPLEMENTED',
        input: object({ ingredientId: id, supplierId: id, quantityBase: z.string().regex(/^(0|[1-9]\d{0,11})(\.\d{1,3})?$/) }),
        output: object({ ingredientId: id, supplierId: id, baseUnit: unit, quantityBase: z.string(), total: z.string().regex(/^\d+\.\d{2}$/) }) },
    createDraftPurchaseRequest: { category: 'WRITE', purpose: 'Proposed approval-bound idempotent draft creation; disabled.',
        permission: 'purchase.write', service: 'BLOCKED: purchaseService.create lacks durable idempotency/approval binding', status: 'BLOCKED',
        input: object({ supplierId: id, idempotencyKey: id, approvalId: id, proposalHash: z.string().regex(/^[a-f0-9]{64}$/),
            sourceVersions: z.record(id, z.string().min(1).max(120)), expiresAt: z.iso.datetime(),
            lines: z.array(object({ ingredientId: id, quantityBase: z.string().regex(/^(0|[1-9]\d{0,10})(\.\d{1,3})?$/).refine(v => Number(v) > 0) })).min(1).max(100) }),
        output: object({ requestId: id, status: z.literal('PENDING') }) },
} as const;
export const TOOL_POLICY = Object.freeze({ timeoutMs: 5000, attempts: 1, idempotency: 'READ/CALCULATION: no mutation; WRITE disabled' });
export const TOOL_ERRORS = Object.freeze(['INVALID_INPUT', 'FORBIDDEN', 'NOT_FOUND', 'INVALID_OUTPUT', 'TIMEOUT', 'BACKEND_FAILURE', 'BLOCKED', 'UNKNOWN_TOOL', 'VERSION_MISMATCH'] as const);
const bindings = {
    getIngredientAvailability: 'availability', getIngredientBatches: 'batches', getRecipeRequirements: 'recipe',
    findIngredientSuppliers: 'suppliers', estimatePurchaseCost: 'estimate',
    getSalesHistory: 'sales', calculateReorderQuantity: 'reorder', createDraftPurchaseRequest: null,
    getStocktakeStatus: 'stocktake', getInboundPurchaseOrder: 'inbound',
} as const;
// Single runtime definition: schemas, capability, policy and adapter service binding.
export const TOOL_CONTRACTS = Object.freeze(Object.fromEntries(Object.entries(definitions).map(([name, definition]) =>
    [name, Object.freeze({ ...definition, name, version: '1.0.0', policy: TOOL_POLICY, errors: TOOL_ERRORS,
        binding: bindings[name as keyof typeof bindings] })])) as {
    readonly [N in keyof typeof definitions]: typeof definitions[N] & {
        readonly name: N; readonly version: '1.0.0'; readonly policy: typeof TOOL_POLICY;
        readonly errors: typeof TOOL_ERRORS; readonly binding: typeof bindings[N];
    }
});
export type P1ToolName = keyof typeof TOOL_CONTRACTS;
export class ToolError extends Error {
    constructor(readonly code: typeof TOOL_ERRORS[number]) { super(code); }
}
