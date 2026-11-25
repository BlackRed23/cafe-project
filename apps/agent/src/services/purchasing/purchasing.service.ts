/** PUR Session F: independently owned purchasing DECISION leaf. No Backend call,
 * Graph/Registry registration, Prisma write, approval or supplier dispatch here.
 * Production supplies an independent, authenticated Backend authority adapter.
 */
import { createHash } from 'node:crypto';
import { PUR_CONTRACT_VERSION, purchasingInputSchema, purchasingAuthorityProofSchema,
    purchasingResultSchema, type PurchasingAuthority, type PurchasingInput,
    type PurchasingAuthorityProof, type PurchasingResult } from './purchasing.schema';

const SCALE = 10000n;
const hash = (value: unknown): string => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const scaled = (s: string): bigint => {
    const [w, f = ''] = s.split('.');
    return BigInt(w!) * SCALE + BigInt(f.padEnd(4, '0'));
};
const format = (v: bigint): string => {
    if (v < 0n) throw new Error('NEGATIVE_PURCHASING_QUANTITY');
    const decimals = (v % SCALE).toString().padStart(4, '0').replace(/0+$/, '');
    return String(v / SCALE) + (decimals ? '.' + decimals : '');
};
const max = (...a: bigint[]) => a.reduce((left, right) => left > right ? left : right, 0n);
const fresh = (iso: string, now: Date) => {
    const age = now.getTime() - Date.parse(iso);
    return Number.isFinite(age) && age >= -60_000 && age <= 300_000;
};

type Status = PurchasingResult['status'];
type PartialDecision = Partial<Pick<PurchasingResult, 'requiredBase'|'shortageBase'|
    'recommendedBase'|'purchasePacks'|'supplierId'|'purchaseUnit'|'incomingOutstandingBase'|
    'receivedObservedBase'|'draftPreview'|'policyRef'>>;

/** All potentially untrusted proof failures HOLD; no fallback to caller-claimed evidence. */
export async function evaluatePurchasing(raw: unknown, now: Date,
    authority?: PurchasingAuthority): Promise<PurchasingResult> {
    const input: PurchasingInput = purchasingInputSchema.parse(raw);
    if (!Number.isFinite(now.getTime())) throw new Error('PUR_INVALID_CLOCK');
    const identity = hash([PUR_CONTRACT_VERSION, input.runId, input.actorId,
        input.ingredientId, input.expectedRowVersion, input.expectedMovementCursor,
        input.requestedRecipeId]);
    let proof: PurchasingAuthorityProof | undefined;
    if (authority) {
        try {
            const result = purchasingAuthorityProofSchema.safeParse(await authority.verify(input));
            if (result.success) proof = result.data;
        } catch { /* No authority fallback. */ }
    }
    const base = proof?.perception;
    const sourceAttested = Boolean(proof &&
        proof.runId === input.runId && proof.actorId === input.actorId &&
        proof.ingredientId === input.ingredientId &&
        base?.ingredientId === input.ingredientId &&
        base.rowVersion === input.expectedRowVersion &&
        base.movementCursor === input.expectedMovementCursor &&
        fresh(proof.verifiedAt, now) && fresh(base.sourceReadAt, now));
    const evidenceRefs = sourceAttested && proof ? [proof.evidenceRef] : [];

    const result = (status: Status, reasons: string[], additions: PartialDecision = {}): PurchasingResult => {
        const decision = {
            contractVersion: PUR_CONTRACT_VERSION, runId: input.runId,
            actorId: input.actorId, ingredientId: input.ingredientId,
            status, reasons: [...new Set(reasons)].sort(), evidenceRefs: [...new Set(evidenceRefs)].sort(),
            auditTraceId: 'pur-' + hash([identity, status, reasons, evidenceRefs]).slice(0, 32),
            sourceAttested, rowVersion: sourceAttested ? base!.rowVersion : null,
            movementCursor: sourceAttested ? base!.movementCursor : null,
            baseUnit: sourceAttested ? base!.baseUnit : null,
            physicalBase: sourceAttested ? base!.physicalQuantity : null,
            eligibleBase: sourceAttested ? base!.eligibleQuantity : null,
            reservedBase: sourceAttested ? base!.reservedQuantity : null,
            availableBase: sourceAttested ? base!.availableQuantity : null,
            excludedExpiredBase: sourceAttested ? base!.excludedQuantityByReason.expired : null,
            excludedQualityBase: sourceAttested ? base!.excludedQuantityByReason.qualityHold : null,
            requiredBase: null, shortageBase: null, recommendedBase: null,
            purchasePacks: null, supplierId: null, purchaseUnit: null,
            incomingOutstandingBase: null, receivedObservedBase: null,
            policyRef: null, draftPreview: null, ...additions,
            // Stable across separate runs for the SAME business evidence. This is
            // a proposal comparison key, NOT durable Backend WRITE idempotency.
            requestFingerprint: hash([PUR_CONTRACT_VERSION, input.ingredientId,
                input.requestedRecipeId, sourceAttested ? base!.rowVersion : null,
                sourceAttested ? base!.movementCursor : null,
                additions.policyRef ?? null, additions.requiredBase ?? null]),
            nextPermittedAction: status === 'HOLD' ? 'REQUEST_AUTHORIZED_READ' :
                status === 'NO_PURCHASE_NEEDED' ? 'NONE' :
                status === 'AWAITING_APPROVAL' ? 'REVIEW_EXISTING_PURCHASE_REQUEST' :
                'REQUEST_HUMAN_REVIEW',
            readOnly: true as const, authorizedToPurchase: false as const,
            authorizedToApprove: false as const, authorizedToPay: false as const,
            requiresFreshReadBeforeWrite: true as const,
            persistenceStatus: 'DECISION_ONLY' as const
        };
        return purchasingResultSchema.parse(decision);
    };

    if (!sourceAttested || !proof || !base || base.dataQualityStatus !== 'VERIFIED' ||
        base.warnings.some(w => w.includes('STALE') || w.includes('ANOMAL'))) {
        return result('HOLD', ['UNATTESTED_OR_STALE_INVENTORY']);
    }
    const observation = proof.backendRisk.observations.filter(o => o.ingredientId === input.ingredientId);
    if (observation.length !== 1 || !fresh(observation[0]!.asOf, now) ||
        observation[0]!.rowVersion !== base.rowVersion ||
        observation[0]!.movementCursor !== base.movementCursor ||
        observation[0]!.availableBase !== base.availableQuantity ||
        proof.backendRisk.codes.some(code => code.includes('STALE') || code.includes('ANOMALOUS'))) {
        return result('HOLD', ['BACKEND_EVIDENCE_MISMATCH']);
    }
    const risk = observation[0]!;
    const physical = scaled(base.physicalQuantity), eligible = scaled(base.eligibleQuantity);
    const reserved = scaled(base.reservedQuantity), available = scaled(base.availableQuantity);
    const expired = scaled(base.excludedQuantityByReason.expired);
    const quality = scaled(base.excludedQuantityByReason.qualityHold);
    let actualPhysical = 0n, actualEligible = 0n, actualExpired = 0n, actualQuality = 0n;
    for (const lot of base.lotBreakdown) {
        const qty = scaled(lot.quantityRemaining);
        const past = lot.expirationDate !== null && Date.parse(lot.expirationDate) <= Date.parse(base.sourceReadAt);
        const eligibleLot = lot.qualityStatus === 'AVAILABLE' && !past;
        if (eligibleLot !== lot.eligible) return result('HOLD', ['BATCH_ELIGIBILITY_CONFLICT']);
        actualPhysical += qty;
        if (eligibleLot) actualEligible += qty;
        else if (lot.qualityStatus !== 'AVAILABLE') actualQuality += qty;
        else actualExpired += qty;
    }
    if (actualPhysical !== physical || actualEligible !== eligible || actualExpired !== expired ||
        actualQuality !== quality || reserved > eligible || eligible - reserved !== available ||
        (base.baseUnit === 'piece' && [physical, eligible, reserved, available].some(n => n % SCALE !== 0n))) {
        return result('HOLD', ['INVENTORY_RECONCILIATION_FAILED']);
    }
    if (proof.recipeDemand && (proof.recipeDemand.baseUnit !== base.baseUnit ||
        proof.recipeDemand.recipeId !== input.requestedRecipeId)) {
        return result('HOLD', ['RECIPE_SCOPE_MISMATCH']);
    }
    if (proof.inbound.some(i => i.ingredientId !== input.ingredientId || !fresh(i.checkedAt, now)) ||
        proof.stocktake && (proof.stocktake.ingredientId !== input.ingredientId ||
            !fresh(proof.stocktake.checkedAt, now))) {
        return result('HOLD', ['BUSINESS_SOURCE_STALE_OR_WRONG_SCOPE']);
    }

    const inboundRefs = new Set(proof.inbound.map(i => i.purchaseOrderId));
    const incomingByPo = new Map<string, bigint>();
    for (const item of risk.incomingPurchaseOrders) {
        incomingByPo.set(item.purchaseOrderId, (incomingByPo.get(item.purchaseOrderId) ?? 0n) +
            scaled(item.unreceivedBase));
    }
    // The risk snapshot and PO/receipt GETs are NOT atomic. Never silently
    // assume their quantities agree or count an outstanding PO as inventory.
    if (inboundRefs.size !== proof.inbound.length ||
        proof.inbound.some(i => i.inboundConsideration === 'NOT_INBOUND' && scaled(i.pendingBase) > 0n) ||
        [...incomingByPo].some(([id, qty]) =>
            !inboundRefs.has(id) || scaled(proof.inbound.find(i => i.purchaseOrderId === id)!.pendingBase) !== qty)) {
        return result('HOLD', ['INBOUND_SNAPSHOT_INCONSISTENT']);
    }
    const outstanding = proof.inbound.reduce((v, row) => v + scaled(row.pendingBase), 0n);
    const received = proof.inbound.reduce((v, row) => v + scaled(row.observedReceivedBase), 0n);
    evidenceRefs.push(...proof.inbound.map(i => i.purchaseOrderId),
        ...proof.suppliers.map(s => s.evidenceRef));
    if (proof.recipeDemand) evidenceRefs.push(proof.recipeDemand.evidenceRef);
    if (proof.stocktake) evidenceRefs.push(proof.stocktake.stocktakeId);

    if (!proof.policy) {
        return result('INSUFFICIENT_EVIDENCE', ['MISSING_VERIFIED_PURCHASING_POLICY'],
            { incomingOutstandingBase: format(outstanding), receivedObservedBase: format(received) });
    }
    evidenceRefs.push(proof.policy.reference);
    const reference = proof.policy.reference;
    if (input.requestedRecipeId && !proof.recipeDemand) {
        return result('INSUFFICIENT_EVIDENCE', ['MISSING_BACKEND_RECIPE_DEMAND'], { policyRef: reference });
    }
    const demand = proof.recipeDemand ? scaled(proof.recipeDemand.quantityBase) : 0n;
    const required = max(scaled(base.thresholdQuantity), scaled(proof.policy.targetStockBase), demand);
    const shortage = max(required - available);
    const common = { requiredBase: format(required), shortageBase: format(shortage),
        incomingOutstandingBase: format(outstanding), receivedObservedBase: format(received),
        policyRef: reference };
    if (base.baseUnit === 'piece' && (required % SCALE !== 0n || demand % SCALE !== 0n)) {
        return result('HOLD', ['FRACTIONAL_PIECE_DEMAND'], common);
    }
    if (shortage === 0n) return result('NO_PURCHASE_NEEDED', ['AVAILABLE_MEETS_VERIFIED_REQUIREMENT'], common);
    if (proof.backendRisk.observations.some(o => o.ingredientId === input.ingredientId &&
        o.outstandingPurchaseRequestsTruncated)) {
        return result('HOLD', ['TRUNCATED_PURCHASE_REQUEST_EVIDENCE'], common);
    }
    if (risk.outstandingPurchaseRequests.length) {
        evidenceRefs.push(...risk.outstandingPurchaseRequests.map(r => r.id));
        return result('AWAITING_APPROVAL', ['EXISTING_OPEN_PURCHASE_REQUEST'], common);
    }
    if (risk.pendingStocktakes > 0 || proof.stocktake &&
        (proof.stocktake.pendingApproval || proof.stocktake.unapprovedVariances.length > 0 ||
            proof.stocktake.uncountedLots > 0 || proof.stocktake.warnings.length > 0)) {
        return result('REVIEW_REQUIRED', ['PENDING_STOCKTAKE_REVIEW'], common);
    }
    if (proof.inbound.some(i =>
        i.inboundConsideration !== 'NOT_INBOUND' || i.warnings.length > 0)) {
        return result('REVIEW_REQUIRED', ['INBOUND_SUPPLY_NOT_VERIFIED'], common);
    }
    const candidates = proof.suppliers.filter(s => s.ingredientId === input.ingredientId &&
        s.status === 'ACTIVE' && !s.deleted && s.conversionTargetUnit === base.baseUnit &&
        scaled(s.conversionToBase) > 0n && (base.baseUnit !== 'piece' ||
            scaled(s.conversionToBase) % SCALE === 0n));
    if (candidates.length !== 1) return result('REVIEW_REQUIRED',
        [candidates.length ? 'SUPPLIER_SELECTION_REQUIRED' : 'NO_ELIGIBLE_SUPPLIER'], common);
    const s = candidates[0]!;
    const conversion = scaled(s.conversionToBase);
    const packs = max(BigInt(s.minOrderQuantity), (shortage + conversion - 1n) / conversion);
    if (packs > 1_000_000_000n || packs * conversion >= 10n ** 18n) {
        return result('HOLD', ['PURCHASE_QUANTITY_OUT_OF_RANGE'], common);
    }
    const preview = s.unitPrice === null ? null : {
        ingredientId: input.ingredientId, supplierId: s.supplierId,
        quantity: Number(packs), unit: s.purchaseUnit, baseUnit: base.baseUnit,
        unitsPerPack: s.conversionToBase, unitPrice: s.unitPrice
    };
    return result(preview ? 'RECOMMEND_PURCHASE' : 'REVIEW_REQUIRED',
        [preview ? 'VERIFIED_INGREDIENT_PURCHASE_CANDIDATE' : 'MISSING_VERIFIED_SUPPLIER_PRICE'], {
            ...common, recommendedBase: format(packs * conversion),
            purchasePacks: Number(packs), supplierId: s.supplierId,
            purchaseUnit: s.purchaseUnit, draftPreview: preview
        });
}
