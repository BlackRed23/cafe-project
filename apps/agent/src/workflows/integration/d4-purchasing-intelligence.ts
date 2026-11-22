/**
 * D4 purchasing intelligence is a pure, read-only Graph leaf. The Graph owns
 * authenticated source acquisition, tool dispatch, policy, approval and audit.
 * A typed caller provenance claim alone NEVER authenticates business data:
 * every Registry result is independently validated against BACKEND evidence.
 */
import { z } from 'zod';
import { inventoryScaledQuantity, perceptionContextSchema, type PerceptionContext } from '../inventory-perception';
import { stocktakeScenarioSourceSchema, type StocktakeScenarioSource } from './stocktake-scenario-continuation';
import { TOOL_CONTRACTS, type P1ToolName } from '../tool-contracts';
import type { ToolOutcome } from '../tool-registry';

const id = z.string().regex(/^[A-Za-z0-9][A-Za-z0-9:_-]{0,119}$/);
const qty = z.string().regex(/^(0|[1-9]\d{0,17})(\.\d{1,4})?$/);
const provenanceSchema = z.strictObject({
    source: z.literal('GRAPH_AUTHENTICATED_BACKEND'),
    verifiedAt: z.iso.datetime(),
    rowVersion: z.number().int().nonnegative(),
    movementCursor: z.string().regex(/^\d+$/),
    demandBasis: z.literal('OBSERVED_ORDER_CONSUME'),
    demandRecords: z.number().int().positive(),
    policyRef: id
});
export const d4ContextSchema = z.strictObject({
    actorId: id,
    perception: perceptionContextSchema,
    demandDailyBase: qty,
    leadTimeDays: z.number().int().nonnegative().max(365),
    safetyStockBase: qty,
    stocktake: stocktakeScenarioSourceSchema.nullable().optional(),
    incomingBase: qty,
    activePurchaseRequests: z.number().int().nonnegative(),
    purchaseOrderIds: z.array(id).max(5).optional(),
    /** Verified backend procurement policy; null means expiry suitability is unknown. */
    supplierShelfLifeDays: z.number().int().positive().max(3650).nullable().optional(),
    /** UNKNOWN means catalog eligibility, NOT supplier stock confirmation. */
    supplierAvailability: z.strictObject({
        supplierId: id,
        status: z.enum(['UNKNOWN', 'CONFIRMED', 'VERIFIED_AVAILABLE', 'UNAVAILABLE']),
        checkedAt: z.iso.datetime(),
        source: z.enum(['BACKEND_SUPPLIER_ELIGIBILITY', 'BACKEND_SUPPLIER_CONFIRMATION'])
    }).optional(),
    /** Source-backed preflight; fresh independent Registry reorder must match. */
    reorderPolicy: z.strictObject({
        targetStock: qty, dailyConsumption: qty,
        demandRecords: z.number().int().positive(), supplierId: id,
        policyVersion: z.literal('OBSERVED_CONSUMPTION_V1'),
        settingsSource: z.literal('DATABASE'),
        planningDays: z.number().int().positive().max(90),
        safetyDays: z.number().int().nonnegative().max(30),
        policyUpdatedAt: z.iso.datetime()
    }).optional(),
    supplierSnapshotDigest: z.string().regex(/^[0-9a-f]{64}$/).optional(),
    provenance: provenanceSchema.optional(),
    now: z.iso.datetime()
});
export type D4Context = z.infer<typeof d4ContextSchema>;
export type D4Capability = { name: string; version: string; bound: boolean; mode: 'MOCK' | 'BACKEND' };
export type D4PlanStep = { id: string; tool: P1ToolName; version: '1.0.0'; input: Record<string, string>; dependsOn: string[] };
export type D4Plan = {
    status: 'READY' | 'HOLD'; reasons: string[]; goal: 'PURCHASING_INTELLIGENCE';
    sourceIdentity: string; steps: D4PlanStep[]; replanCount: 0 | 1;
    readOnly: true; authorizedToPurchase: false; authorizedToApprove: false;
};
export type D4Scenario = {
    stockBase: string; targetBase: string; shortageBase: string;
    purchasePacks: number | null; purchaseBase: string | null;
};
export type D4Recommendation = {
    status: 'HOLD' | 'REVIEW_CANDIDATE' | 'NO_PURCHASE_NEEDED';
    reasons: string[]; confirmed: D4Scenario | null; hypothetical: D4Scenario | null;
    supplier: { supplierId: string; purchaseUnit: string; packSizeBase: string;
        minimumPacks: number; estimatedCostReference: string } | null;
    verifiedTools: string[];
    reviewWarnings?: string[];
    replan: { reason: 'RETRY_BACKEND_READ'; step: D4PlanStep; maxRetries: 1 } | null;
    readOnly: true; businessExecution: 'HELD_POLICY';
    requiresHumanApproval: true; authorizedToPurchase: false;
    authorizedToApprove: false; authorizedToPay: false;
};

const SCALE = 10000n;
const scaled = (s: string | number): bigint => inventoryScaledQuantity(String(s));
// Backend DTOs transport Decimal-derived rates as JS numbers. Round once at
// the trust boundary to four decimal places before fixed-point arithmetic.
const rate = (n: number): bigint => {
    if (!Number.isFinite(n) || n < 0 || n > 1e12) throw new Error('D4_INVALID_RATE');
    return scaled(n.toFixed(4));
};
const format = (v: bigint): string => {
    if (v < 0n) throw new Error('D4_NEGATIVE_QUANTITY');
    const fraction = (v % SCALE).toString().padStart(4, '0').replace(/0+$/, '');
    return (v / SCALE).toString() + (fraction ? '.' + fraction : '');
};
const max = (a: bigint, b: bigint): bigint => a > b ? a : b;
const positive = (v: bigint): bigint => max(0n, v);
const ceilDiv = (a: bigint, b: bigint): bigint => (a + b - 1n) / b;
const signed = (value: string): bigint => value.startsWith('-')
    ? -scaled(value.slice(1)) : scaled(value);
const contextId = (p: PerceptionContext): string =>
    `${p.ingredientId}:${p.rowVersion}:${p.movementCursor}`;
const recent = (when: string, now: string): boolean => {
    const delta = Date.parse(now) - Date.parse(when);
    return Number.isFinite(delta) && delta >= -60000 && delta <= 300000;
};

function evaluateContext(context: D4Context): string[] {
    const p = context.perception, reasons = new Set<string>();
    if (!context.provenance || context.provenance.source !== 'GRAPH_AUTHENTICATED_BACKEND' ||
        context.provenance.rowVersion !== p.rowVersion ||
        context.provenance.movementCursor !== p.movementCursor ||
        !recent(context.provenance.verifiedAt, context.now) ||
        !recent(p.sourceReadAt, context.now)) reasons.add('TRUSTED_PROVENANCE_MISSING_OR_STALE');
    if (p.dataQualityStatus !== 'VERIFIED') reasons.add('PERCEPTION_NOT_VERIFIED');
    if (context.provenance && context.provenance.demandRecords < 1) reasons.add('DEMAND_SOURCE_UNVERIFIED');
    let physical = 0n, eligible = 0n;
    for (const lot of p.lotBreakdown) {
        const quantity = scaled(lot.quantityRemaining);
        physical += quantity;
        const valid = lot.qualityStatus === 'AVAILABLE' &&
            (!lot.expirationDate || Date.parse(lot.expirationDate) > Date.parse(p.sourceReadAt));
        if (lot.eligible !== valid) reasons.add('LOT_ELIGIBILITY_CONFLICT');
        if (valid) eligible += quantity;
    }
    if (physical !== scaled(p.physicalQuantity) || eligible !== scaled(p.eligibleQuantity) ||
        eligible - scaled(p.reservedQuantity) !== scaled(p.availableQuantity)) {
        reasons.add('INVENTORY_NOT_RECONCILED');
    }
    const stocktake = context.stocktake;
    if (stocktake && (stocktake.ingredientId !== p.ingredientId ||
        stocktake.rowVersion !== p.rowVersion || stocktake.movementCursor !== p.movementCursor ||
        stocktake.officialBase !== p.physicalQuantity || stocktake.baseUnit !== p.baseUnit ||
        scaled(stocktake.targetBase) !== scaled(p.thresholdQuantity) ||
        signed(stocktake.observedVarianceBase) !== scaled(stocktake.hypotheticalBase) - scaled(stocktake.officialBase) ||
        stocktake.stocktakeStatus === 'DRAFT')) reasons.add('STOCKTAKE_SOURCE_CONFLICT');
    if (stocktake && scaled(p.reservedQuantity) > 0n) {
        reasons.add('STOCKTAKE_RESERVATION_UNCERTAIN');
    }
    if ((p.pendingStocktakes ?? 0) > 0 && !stocktake) reasons.add('STOCKTAKE_SOURCE_MISSING');
    // An absent incoming-PO list is zero PO, never a duplicate. Compare only
    // actual returned identifiers; undefined?.length !== 0 is always true.
    if ((context.purchaseOrderIds ?? []).length !== new Set(context.purchaseOrderIds ?? []).size) {
        reasons.add('DUPLICATE_INBOUND_SOURCE');
    }
    if (scaled(context.incomingBase) > 0n && !context.purchaseOrderIds?.length) {
        reasons.add('INBOUND_SOURCE_MISSING');
    }
    if (p.baseUnit === 'piece' && [context.demandDailyBase, context.safetyStockBase].some(v => scaled(v) % SCALE !== 0n)) {
        reasons.add('FRACTIONAL_PIECE_DEMAND');
    }
    return [...reasons].sort();
}

/** Required reads change with pending counts and inbound IDs. Each read uses the
 * existing Registry capability, never a caller-named tool or writable tool. */
export function buildD4Plan(context: D4Context, capabilities: D4Capability[]): D4Plan {
    const parsed = d4ContextSchema.safeParse(context);
    if (!parsed.success) throw new Error('D4_CONTEXT_REJECTED');
    const c = parsed.data, reasons = new Set(evaluateContext(c));
    const ingredientId = c.perception.ingredientId;
    const steps: D4PlanStep[] = [];
    const requireRead = (tool: P1ToolName, input: Record<string, string>, dependsOn: string[] = []) => {
        const capability = capabilities.find(cap => cap.name === tool && cap.version === '1.0.0' &&
            cap.bound && cap.mode === 'BACKEND');
        if (!capability || TOOL_CONTRACTS[tool].category === 'WRITE' ||
            !TOOL_CONTRACTS[tool].input.safeParse(input).success) {
            reasons.add(`BACKEND_CAPABILITY_UNAVAILABLE_${tool.toUpperCase()}`);
            return;
        }
        steps.push({ id: `d4-${steps.length + 1}`, tool, input, version: '1.0.0', dependsOn });
    };
    requireRead('getIngredientAvailability', { ingredientId });
    requireRead('getIngredientBatches', { ingredientId }, steps.length ? [steps[0]!.id] : []);
    // Verify unapproved count and incoming orders BEFORE speculative reorder:
    // a later supplier/policy failure must not suppress these safety observations.
    if (c.stocktake) requireRead('getStocktakeStatus', { ingredientId, stocktakeId: c.stocktake.stocktakeId });
    for (const purchaseOrderId of c.purchaseOrderIds ?? []) {
        requireRead('getInboundPurchaseOrder', { ingredientId, purchaseOrderId });
    }
    requireRead('findIngredientSuppliers', { ingredientId });
    // An unavailable supplier is evidence to rediscover alternatives, not
    // permission to generate a quantity for the unavailable mapping.
    if (c.supplierAvailability?.status !== 'UNAVAILABLE') {
        requireRead('calculateReorderQuantity', { ingredientId });
    } else {
        reasons.add('SUPPLIER_UNAVAILABLE_REPLAN_REQUIRED');
    }
    if (steps.length > 10) reasons.add('READ_STEP_LIMIT_EXCEEDED');
    return {
        status: reasons.size ? 'HOLD' : 'READY', reasons: [...reasons].sort(),
        goal: 'PURCHASING_INTELLIGENCE', sourceIdentity: contextId(c.perception),
        // Retain independently verified BACKEND reads even if another required
        // capability is unavailable. Graph can audit partial evidence; HOLD is
        // immutable until the complete authority chain is established.
        steps, replanCount: 0, readOnly: true,
        authorizedToPurchase: false, authorizedToApprove: false
    };
}

/** Consume only validated Backend Registry outcomes, keyed by D4PlanStep.id.
 * A retried outcome can replace a failed one at the same key; Graph must journal
 * every attempt and enforce its own reauthorization + policy revalidation. */
export function evaluateD4Plan(context: D4Context, plan: D4Plan,
    observations: Record<string, unknown>): D4Recommendation {
    const checked = d4ContextSchema.safeParse(context);
    if (!checked.success) throw new Error('D4_CONTEXT_REJECTED');
    const c = checked.data;
    const reasons = new Set<string>([...evaluateContext(c), ...plan.reasons]);
    // Policy HOLD reasons must survive even when a separate missing demand or
    // supplier attestation prevents quantity evaluation. A pending count is
    // not approved inventory, nor is outstanding inbound physical stock.
    if (c.stocktake) reasons.add('PENDING_STOCKTAKE_HUMAN_REVIEW');
    if (c.activePurchaseRequests > 0) reasons.add('EXISTING_PURCHASE_REQUEST');
    if (scaled(c.incomingBase) > 0n) reasons.add('INBOUND_NOT_PHYSICAL');
    const verifiedTools: string[] = [];
    const reviewWarnings: string[] = [];
    let replan: D4Recommendation['replan'] = null;
    const outputs = new Map<string, unknown>();
    if (!['READY', 'HOLD'].includes(plan.status) ||
        plan.goal !== 'PURCHASING_INTELLIGENCE' || !plan.readOnly ||
        plan.authorizedToPurchase || plan.authorizedToApprove ||
        plan.sourceIdentity !== contextId(c.perception) ||
        plan.steps.length > 10 || plan.replanCount > 1) {
        reasons.add('PLAN_UNVERIFIED');
    } else {
        if (plan.steps.length === 0) reasons.add('NO_BOUND_BACKEND_READS');
        const known = new Set<string>();
        for (const step of plan.steps) {
            const contract = TOOL_CONTRACTS[step.tool];
            if (known.has(step.id) || !contract || contract.category === 'WRITE' ||
                step.version !== '1.0.0' || !contract.input.safeParse(step.input).success ||
                step.input.ingredientId !== c.perception.ingredientId ||
                step.dependsOn.some(dependency => !known.has(dependency)) ||
                (step.tool === 'getStocktakeStatus' &&
                    step.input.stocktakeId !== c.stocktake?.stocktakeId) ||
                (step.tool === 'getInboundPurchaseOrder' &&
                    !(c.purchaseOrderIds ?? []).includes(step.input.purchaseOrderId!))) {
                reasons.add('PLAN_STEP_UNVERIFIED');
                continue;
            }
            known.add(step.id);
            const observation = observations[step.id] as ToolOutcome | undefined;
            if (!observation || !observation.evidence || observation.evidence.tool !== step.tool ||
                observation.evidence.actorId !== c.actorId ||
                observation.evidence.version !== step.version ||
                observation.evidence.mode !== 'BACKEND' ||
                !recent(observation.evidence.startedAt, c.now)) {
                reasons.add('BACKEND_OBSERVATION_MISSING_OR_UNVERIFIED');
                continue;
            }
            if (!observation.ok) {
                reasons.add(`TOOL_${observation.error}`);
                if (!replan && plan.replanCount === 0 &&
                    ['TIMEOUT', 'BACKEND_FAILURE'].includes(observation.error)) {
                    replan = { reason: 'RETRY_BACKEND_READ', step, maxRetries: 1 };
                }
                continue;
            }
            if (!observation.evidence.validated || observation.evidence.status !== 'SUCCEEDED' ||
                observation.evidence.attempts !== 1 ||
                !contract.output.safeParse(observation.output).success) {
                reasons.add('TOOL_OUTPUT_UNVERIFIED');
                continue;
            }
            const parsed = contract.output.safeParse(observation.output);
            if (!parsed.success) { reasons.add('TOOL_OUTPUT_UNVERIFIED'); continue; }
            outputs.set(step.id, parsed.data);
            verifiedTools.push(step.tool);
        }
    }
    const read = (name: P1ToolName): unknown => {
        const step = plan.steps.find(s => s.tool === name);
        return step ? outputs.get(step.id) : undefined;
    };
    const finish = (confirmed: D4Scenario | null, hypothetical: D4Scenario | null,
        supplier: D4Recommendation['supplier']): D4Recommendation => ({
        status: reasons.size ? 'HOLD' : confirmed?.shortageBase === '0' ?
            'NO_PURCHASE_NEEDED' : 'REVIEW_CANDIDATE',
        reasons: [...reasons].sort(), confirmed, hypothetical, supplier,
        verifiedTools, reviewWarnings, replan, readOnly: true, businessExecution: 'HELD_POLICY',
        requiresHumanApproval: true, authorizedToPurchase: false,
        authorizedToApprove: false, authorizedToPay: false
    });
    const p = c.perception;
    const available = read('getIngredientAvailability') as z.infer<typeof TOOL_CONTRACTS.getIngredientAvailability.output> | undefined;
    const batches = read('getIngredientBatches') as z.infer<typeof TOOL_CONTRACTS.getIngredientBatches.output> | undefined;
    const suppliers = read('findIngredientSuppliers') as z.infer<typeof TOOL_CONTRACTS.findIngredientSuppliers.output> | undefined;
    const reorder = read('calculateReorderQuantity') as z.infer<typeof TOOL_CONTRACTS.calculateReorderQuantity.output> | undefined;
    if (!available || !batches || !c.provenance ||
        reasons.has('TRUSTED_PROVENANCE_MISSING_OR_STALE') ||
        reasons.has('INVENTORY_NOT_RECONCILED') ||
        reasons.has('PERCEPTION_NOT_VERIFIED') ||
        reasons.has('STOCKTAKE_SOURCE_CONFLICT') ||
        reasons.has('STOCKTAKE_RESERVATION_UNCERTAIN') ||
        reasons.has('PLAN_UNVERIFIED') || reasons.has('PLAN_STEP_UNVERIFIED')) {
        return finish(null, null, null);
    }
    if (
        available.ingredientId !== p.ingredientId || batches.ingredientId !== p.ingredientId ||
        available.baseUnit !== p.baseUnit || batches.baseUnit !== p.baseUnit ||
        available.rowVersion !== p.rowVersion || !available.active ||
        available.available < 0 ||
        scaled(available.quantity) !== scaled(p.physicalQuantity) ||
        scaled(available.reserved) !== scaled(p.reservedQuantity) ||
        scaled(available.available) !== scaled(p.physicalQuantity) - scaled(p.reservedQuantity) ||
        batches.batches.length !== p.lotBreakdown.length ||
        batches.batches.some(row => {
            const prior = p.lotBreakdown.find(lot => lot.id === row.id);
            return !prior || prior.expirationDate !== row.expirationDate ||
                scaled(row.quantityRemaining) !== scaled(prior.quantityRemaining);
        })) reasons.add('PER_REGISTRY_STALE_CONTEXT');
    if (!reorder) reasons.add('REORDER_READ_UNVERIFIED');
    if (!suppliers) reasons.add('SUPPLIER_READ_UNVERIFIED');
    if (reorder && (reorder.ingredientId !== p.ingredientId || reorder.baseUnit !== p.baseUnit ||
        reorder.ingredientVersion !== p.rowVersion || reorder.leadTimeDays !== c.leadTimeDays ||
        rate(reorder.dailyConsumption) !== scaled(c.demandDailyBase) ||
        rate(reorder.usableStock) !== scaled(p.availableQuantity) ||
        reorder.demandRecords < 1 || !recent(reorder.capturedAt, c.now) ||
        !Number.isFinite(Date.parse(reorder.supplierUpdatedAt)) ||
        Date.parse(reorder.supplierUpdatedAt) > Date.parse(c.now) + 60000)) {
        reasons.add('REORDER_BACKEND_EVIDENCE_MISMATCH');
    }
    if (c.reorderPolicy && (!reorder ||
        c.reorderPolicy.policyVersion !== reorder.policyVersion ||
        c.reorderPolicy.supplierId !== reorder.supplierId ||
        c.reorderPolicy.settingsSource !== reorder.settingsSource ||
        c.reorderPolicy.planningDays !== reorder.planningDays ||
        c.reorderPolicy.safetyDays !== reorder.safetyDays ||
        c.reorderPolicy.demandRecords !== reorder.demandRecords ||
        rate(reorder.dailyConsumption) !== scaled(c.reorderPolicy.dailyConsumption) ||
        scaled(reorder.targetStock) !== scaled(c.reorderPolicy.targetStock))) {
        reasons.add('REORDER_TARGET_POLICY_MISMATCH');
    }
    if (c.stocktake) {
        const result = read('getStocktakeStatus') as z.infer<typeof TOOL_CONTRACTS.getStocktakeStatus.output> | undefined;
        if (!result) reasons.add('STOCKTAKE_READ_UNVERIFIED');
        else if (result.ingredientId !== p.ingredientId ||
            result.stocktakeId !== c.stocktake.stocktakeId ||
            result.revision !== c.stocktake.stocktakeRevision ||
            result.status !== c.stocktake.stocktakeStatus ||
            !recent(result.checkedAt, c.now) || !result.pendingApproval &&
            result.status !== 'NEEDS_INVESTIGATION' ||
            result.unapprovedVariances.reduce((sum, entry) => sum + signed(entry.varianceBase), 0n) !==
                signed(c.stocktake.observedVarianceBase)) reasons.add('STOCKTAKE_BACKEND_EVIDENCE_MISMATCH');
        reasons.add('PENDING_STOCKTAKE_HUMAN_REVIEW');
    }
    let observedInbound = 0n;
    for (const orderId of c.purchaseOrderIds ?? []) {
        const step = plan.steps.find(s => s.tool === 'getInboundPurchaseOrder' &&
            s.input.purchaseOrderId === orderId);
        const result = step ? outputs.get(step.id) as z.infer<typeof TOOL_CONTRACTS.getInboundPurchaseOrder.output> : undefined;
        if (!result || result.purchaseOrderId !== orderId || result.ingredientId !== p.ingredientId ||
            !recent(result.checkedAt, c.now) || !result.provenanceChecked) {
            reasons.add('INBOUND_BACKEND_EVIDENCE_MISMATCH');
            continue;
        }
        observedInbound += scaled(result.pendingBase);
        if (scaled(result.pendingBase) > 0n || result.warnings.length ||
            result.inboundConsideration !== 'NOT_INBOUND') reasons.add('INBOUND_NOT_PHYSICAL');
    }
    if (observedInbound !== scaled(c.incomingBase)) reasons.add('INBOUND_BACKEND_EVIDENCE_MISMATCH');
    if (c.activePurchaseRequests > 0) reasons.add('EXISTING_PURCHASE_REQUEST');
    if (c.supplierShelfLifeDays == null) {
        if (c.supplierAvailability?.status === 'UNKNOWN')
            reviewWarnings.push('SUPPLIER_EXPIRY_POLICY_UNKNOWN_REQUIRES_ADMIN_REVIEW');
        else reasons.add('SUPPLIER_EXPIRY_POLICY_UNVERIFIED');
    }
    if (p.lotBreakdown.some(lot => lot.eligible && lot.quantityRemaining !== '0' &&
        lot.expirationDate && Date.parse(lot.expirationDate) <=
        Date.parse(c.now) + c.leadTimeDays * 86400000)) reasons.add('EXPIRY_BEFORE_LEAD_TIME');
    if (reasons.size && [...reasons].some(r => r.includes('MISMATCH') || r.includes('STALE') ||
        r === 'PER_REGISTRY_STALE_CONTEXT' || r === 'TRUSTED_PROVENANCE_MISSING_OR_STALE')) {
        return finish(null, null, null);
    }
    const daily = scaled(c.demandDailyBase), target = c.reorderPolicy
        ? scaled(c.reorderPolicy.targetStock)
        : max(scaled(p.thresholdQuantity),
            daily * BigInt(c.leadTimeDays) + scaled(c.safetyStockBase));
    // Supplier updatedAt is an historical version stamp, not a fresh-read
    // timestamp. The Graph compares its snapshot digest after tool dispatch.
    // But the Backend reorder policy may plan a *different horizon*: never
    // silently convert that Backend recommendation into the D4 2-day target.
    if (reorder && scaled(String(reorder.targetStock)) !== target) {
        reasons.add('REORDER_TARGET_POLICY_MISMATCH');
    }
    const stock = scaled(p.availableQuantity);
    const variance = c.stocktake ? signed(c.stocktake.observedVarianceBase) : 0n;
    const hypotheticalStock = positive(stock + variance);
    const confirmedShortage = positive(target - stock);
    const hypotheticalShortage = positive(target - hypotheticalStock);
    let chosen: D4Recommendation['supplier'] = null;
    let packSize = 0n, minPacks = 0n;
    if (reorder && suppliers && !reasons.has('REORDER_TARGET_POLICY_MISMATCH')) {
        const matched = suppliers.filter(s => s.ingredientId === p.ingredientId &&
            s.baseUnit === p.baseUnit && s.supplierId === reorder.supplierId &&
            scaled(s.conversionQuantity) === scaled(reorder.conversionQuantity) &&
            s.purchaseUnit === reorder.purchaseUnit);
        if (matched.length !== 1 || reorder.minOrderQuantity < 1) reasons.add('SUPPLIER_BACKEND_EVIDENCE_MISMATCH');
        else {
            packSize = scaled(matched[0]!.conversionQuantity);
            minPacks = BigInt(reorder.minOrderQuantity);
            chosen = { supplierId: reorder.supplierId, purchaseUnit: reorder.purchaseUnit,
                packSizeBase: format(packSize), minimumPacks: reorder.minOrderQuantity,
                estimatedCostReference: reorder.estimatedCost };
            const availability = c.supplierAvailability;
            if (!availability || availability.supplierId !== chosen.supplierId ||
                !recent(availability.checkedAt, c.now)) {
                reasons.add('SUPPLIER_AVAILABILITY_UNVERIFIED');
            } else if (availability.status === 'UNKNOWN' &&
                availability.source === 'BACKEND_SUPPLIER_ELIGIBILITY') {
                // Backend permits an eligible supplier's proposal DRAFT before
                // confirmation. Do not turn UNKNOWN into a promise, PR, or PO.
                reviewWarnings.push('SUPPLIER_AVAILABILITY_UNKNOWN_REQUIRES_ADMIN_REVIEW');
            } else if (availability.source !== 'BACKEND_SUPPLIER_CONFIRMATION') {
                reasons.add('SUPPLIER_AVAILABILITY_UNVERIFIED');
            } else if (!['CONFIRMED', 'VERIFIED_AVAILABLE'].includes(availability.status)) {
                reasons.add('SUPPLIER_UNAVAILABLE_REPLAN_REQUIRED');
            }
            if (suppliers.filter(s => s.ingredientId === p.ingredientId && s.baseUnit === p.baseUnit).length > 1) {
                reasons.add('MULTIPLE_SUPPLIERS_REQUIRE_REVIEW');
            }
        }
    }
    const withPacks = (stockBase: bigint, shortage: bigint): D4Scenario => {
        const packs = !packSize || shortage === 0n ? 0n : max(minPacks, ceilDiv(shortage, packSize));
        if (packs > 1000000000n || packs * packSize > 10n ** 21n) {
            reasons.add('PURCHASE_QUANTITY_OUT_OF_RANGE');
            return { stockBase: format(stockBase), targetBase: format(target),
                shortageBase: format(shortage), purchasePacks: null, purchaseBase: null };
        }
        return { stockBase: format(stockBase), targetBase: format(target),
            shortageBase: format(shortage), purchasePacks: chosen ? Number(packs) : null,
            purchaseBase: chosen ? format(packs * packSize) : null };
    };
    const confirmed = withPacks(stock, confirmedShortage);
    const hypothetical = c.stocktake ? withPacks(hypotheticalStock, hypotheticalShortage) : null;
    if (chosen && c.supplierShelfLifeDays && daily > 0n) {
        const maxUse = daily * BigInt(c.supplierShelfLifeDays);
        for (const scenario of [confirmed, hypothetical]) {
            if (scenario?.purchaseBase && scaled(scenario.purchaseBase) > maxUse) {
                reasons.add('EXPIRY_SURPLUS_RISK');
            }
        }
    }
    if (daily === 0n && confirmedShortage > 0n) reasons.add('DEMAND_RATE_UNVERIFIED');
    // Incoming stock and unapproved counts remain scenario evidence only; no
    // quantity from them is silently applied to official available inventory.
    return finish(confirmed, hypothetical, chosen);
}
