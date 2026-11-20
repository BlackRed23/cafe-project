import { planningInputSchema, planningResultSchema, type PlanningInput, type PlanningResult,
    PLN_CONTRACT_VERSION } from './planning.schema';
import { isDeepStrictEqual } from 'node:util';

/** Backend & PER codes observed in the Graph at PLN_PER_BACKEND_V1. Additions must be reviewed. */
const knownBackendCodes = new Set([
    'SPARSE_HISTORY_FALLBACK', 'INVALID_LEDGER_OBSERVATION', 'OUTLIER_REVIEW_REQUIRED',
    'DEMAND_DORMANT_REVIEW', 'TREND_UNCERTAIN', 'HISTORY_TRUNCATED',
    'STOCKTAKE_UNCERTAIN', 'EXISTING_PURCHASE_REQUEST', 'ANOMALOUS_STOCK_AGGREGATE',
    'EXPIRED_STOCK_PRESENT', 'UNKNOWN_EXPIRY_LOT', 'NON_AVAILABLE_LOT_PRESENT',
    'NEAR_EXPIRY_FEFO', 'INBOUND_NOT_PHYSICAL', 'ESTIMATED_DELIVERY_LATE_UNVERIFIED',
    'EXPIRY_SURPLUS_RISK', 'ETA_IS_ESTIMATE_NOT_PROMISE',
    'SUPPLIER_LEAD_TIME_UNVERIFIED', 'DEMAND_RATE_UNCERTAIN',
    'PROJECTED_STOCKOUT_BEFORE_LEAD_TIME', 'INBOUND_SCENARIO_NOT_PHYSICAL',
    'DEMAND_LOW_CONFIDENCE', 'OBSERVED_DEMAND_RISING',
    'NEAR_EXPIRY_BACKEND', 'EXPIRY_SURPLUS_BACKEND',
]);
const cautionCodes = new Set([
    'INVALID_LEDGER_OBSERVATION', 'OUTLIER_REVIEW_REQUIRED', 'DEMAND_DORMANT_REVIEW',
    'HISTORY_TRUNCATED', 'STOCKTAKE_UNCERTAIN', 'EXISTING_PURCHASE_REQUEST',
    'ANOMALOUS_STOCK_AGGREGATE', 'EXPIRED_STOCK_PRESENT', 'UNKNOWN_EXPIRY_LOT',
    'NON_AVAILABLE_LOT_PRESENT', 'NEAR_EXPIRY_FEFO', 'INBOUND_NOT_PHYSICAL',
    'ESTIMATED_DELIVERY_LATE_UNVERIFIED', 'EXPIRY_SURPLUS_RISK',
    'SUPPLIER_LEAD_TIME_UNVERIFIED', 'DEMAND_RATE_UNCERTAIN',
    'INBOUND_SCENARIO_NOT_PHYSICAL', 'DEMAND_LOW_CONFIDENCE',
    'NEAR_EXPIRY_BACKEND', 'EXPIRY_SURPLUS_BACKEND'
]);
const knownPerWarnings = new Set([
    'BELOW_THRESHOLD', 'EXPIRED_STOCK_PRESENT', 'QUALITY_HOLD', 'UNKNOWN_EXPIRY_LOT'
]);
const scale = (value: string): bigint => {
    const [whole, fraction = ''] = value.split('.');
    return BigInt(whole!) * 10000n + BigInt(fraction.padEnd(4, '0'));
};
const fail = (): never => { throw new Error('PLN_EVIDENCE_REJECTED'); };
const ensure = (condition: boolean): void => { if (!condition) fail(); };

/**
 * Pure and side-effect-free planning review. This is deliberately NOT connected to
 * AgentWorkflow, purchase.write, privileged APIs or live databases.
 * `source/perAcceptance` describe supplied evidence, not an attestation: only a
 * future, authenticated Graph adapter may decide whether to trust it.
 */
export function evaluatePlanning(raw: unknown, now: Date): PlanningResult {
    const parsed = planningInputSchema.safeParse(raw);
    if (!parsed.success) throw new Error('PLN_EVIDENCE_REJECTED');
    if (!Number.isFinite(now.getTime())) throw new Error('PLN_EVIDENCE_REJECTED');
    const input: PlanningInput = parsed.data;
    const reasons = new Set<string>();
    const add = (code: string) => reasons.add(code);
    if (input.source !== 'PER_LIVE_VERIFIED' || input.perAcceptance !== 'E2E_VERIFIED') {
        add('PER_ACCEPTANCE_NOT_VERIFIED');
    }
    const perById = new Map(input.perception.map(item => [item.ingredientId, item]));
    const riskById = new Map(input.backendRisk.observations.map(item => [item.ingredientId, item]));
    const recById = new Map(input.recommendations.map(item => [item.ingredientId, item]));
    const count = input.perception.length;
    ensure(perById.size === count && riskById.size === count && recById.size === count &&
        input.backendRisk.observations.length === count && input.recommendations.length === count);
    ensure(input.backendRisk.codes.every(code => knownBackendCodes.has(code)));
    input.backendRisk.codes.filter(code => cautionCodes.has(code)).forEach(add);

    const candidates = input.perception.map(per => {
        const risk = riskById.get(per.ingredientId), rec = recById.get(per.ingredientId);
        if (!risk || !rec) throw new Error('PLN_EVIDENCE_REJECTED');
        ensure(per.dataQualityStatus === 'VERIFIED' && per.requiresRevalidation &&
            per.warnings.every(code => knownPerWarnings.has(code)) &&
            risk.ingredientId === per.ingredientId && rec.ingredientId === per.ingredientId &&
            risk.rowVersion === per.rowVersion && risk.movementCursor === per.movementCursor &&
            scale(risk.availableBase) === scale(per.availableQuantity) &&
            rec.baseUnit === per.baseUnit && scale(rec.available) === scale(per.availableQuantity) &&
            rec.sourceVersion === String(per.rowVersion + 1) &&
            scale(rec.minStock) === scale(per.thresholdQuantity) &&
            scale(rec.targetStock) >= scale(rec.minStock));

        const perRead = Date.parse(per.sourceReadAt), riskRead = Date.parse(risk.asOf);
        // Exactly the Graph's bounded current-read freshness; reject future timestamps too.
        if (perRead > now.getTime() || riskRead > now.getTime() ||
            now.getTime() - perRead > 300000 || now.getTime() - riskRead > 300000 ||
            Math.abs(perRead - riskRead) > 300000) add('STALE_CONTEXT');

        const lots = new Set<string>();
        let physical = 0n, eligible = 0n, expired = 0n, qualityHeld = 0n;
        for (const lot of per.lotBreakdown) {
            ensure(!lots.has(lot.id));
            lots.add(lot.id);
            const q = scale(lot.quantityRemaining);
            physical += q;
            const isExpired = lot.expirationDate !== null && Date.parse(lot.expirationDate) <= perRead;
            const allowed = lot.qualityStatus === 'AVAILABLE' && !isExpired;
            ensure(lot.eligible === allowed);
            if (allowed) eligible += q;
            else if (lot.qualityStatus !== 'AVAILABLE') qualityHeld += q;
            else expired += q;
            if (lot.expirationDate === null && q > 0n) add('UNKNOWN_EXPIRY_LOT');
        }
        ensure(physical === scale(per.physicalQuantity) && eligible === scale(per.eligibleQuantity) &&
            expired === scale(per.excludedQuantityByReason.expired) &&
            qualityHeld === scale(per.excludedQuantityByReason.qualityHold) &&
            scale(per.reservedQuantity) <= eligible &&
            eligible - scale(per.reservedQuantity) === scale(per.availableQuantity) &&
            per.belowThreshold === (scale(per.availableQuantity) < scale(per.thresholdQuantity)));

        if (expired > 0n) add('EXPIRED_STOCK_PRESENT');
        if (qualityHeld > 0n) add('NON_AVAILABLE_LOT_PRESENT');
        if (risk.pendingStocktakes > 0) add('STOCKTAKE_UNCERTAIN');
        if (risk.incomingPurchaseOrders.some(item => scale(item.unreceivedBase) > 0n)) add('INBOUND_NOT_PHYSICAL');
        if (risk.outstandingPurchaseRequests.length || risk.outstandingPurchaseRequestsTruncated) add('EXISTING_PURCHASE_REQUEST');
        if (risk.forecastConfidence === 'LOW' || risk.observedConsumptionMovements === 0) add('DEMAND_LOW_CONFIDENCE');
        if (risk.projectedDaysRemaining === null) add('FORECAST_UNAVAILABLE');
        if (per.projectedDaysRemaining !== undefined && per.projectedDaysRemaining !== risk.projectedDaysRemaining ||
            per.forecastConfidence !== undefined && per.forecastConfidence !== risk.forecastConfidence ||
            per.demandWindowDays !== undefined && per.demandWindowDays !== risk.demandWindowDays ||
            per.observedConsumptionMovements !== undefined && per.observedConsumptionMovements !== risk.observedConsumptionMovements ||
            per.pendingStocktakes !== undefined && per.pendingStocktakes !== risk.pendingStocktakes ||
            per.backendReadAt !== undefined && per.backendReadAt !== risk.asOf ||
            per.outstandingPurchaseRequestsTruncated !== undefined &&
                per.outstandingPurchaseRequestsTruncated !== risk.outstandingPurchaseRequestsTruncated ||
            per.outstandingPurchaseRequests !== undefined && !isDeepStrictEqual(per.outstandingPurchaseRequests, risk.outstandingPurchaseRequests) ||
            per.incomingPurchaseOrders !== undefined && !isDeepStrictEqual(per.incomingPurchaseOrders, risk.incomingPurchaseOrders)) fail();

        const amount = scale(rec.recommendedBaseQuantity);
        if ((amount > 0n) !== per.belowThreshold) add('RECOMMENDATION_NOT_RECONCILED');
        return {
            ingredientId: per.ingredientId, baseUnit: per.baseUnit,
            rowVersion: per.rowVersion, movementCursor: per.movementCursor,
            availableBase: per.availableQuantity, suggestedBase: rec.recommendedBaseQuantity,
            reviewOnly: true as const
        };
    });

    const blocked = reasons.size > 0;
    const result = {
        contractVersion: PLN_CONTRACT_VERSION,
        status: blocked ? 'HOLD' as const :
            candidates.some(item => scale(item.suggestedBase!) > 0n) ? 'REVIEW_CANDIDATE' as const : 'NO_SHORTAGE' as const,
        readOnly: true as const,
        authorizedToPurchase: false as const,
        authorizedToApprove: false as const,
        requiresFreshReadAtIntegration: true as const,
        reasons: [...reasons].sort(),
        candidates: candidates.map(candidate => ({
            ...candidate, suggestedBase: blocked ? null : candidate.suggestedBase
        }))
    };
    return planningResultSchema.parse(result);
}
