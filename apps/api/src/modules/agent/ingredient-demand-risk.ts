import { prisma, Prisma, InventoryTransactionType } from '@cafe-project/database';
import { HttpError } from '../../common/http-error';

/**
 * Read-only, deterministic demand/stockout assessment. No financial or
 * purchasing policy is inferred here: every recommendation is review-only.
 * The existing AgentWorkflow/Backend approval path remains authoritative.
 */
export type DemandObservation = { createdAt: Date; quantity: number };
export type DemandAssessment = {
    model: 'DETERMINISTIC_LEDGER_BASELINE';
    evidenceWindowDays: 30;
    observedMovements: number;
    observedConsumptionDays: number;
    dailyRate: number;
    previousSevenDays: number;
    recentSevenDays: number;
    trend: 'RISING' | 'FALLING' | 'STABLE' | 'UNKNOWN';
    confidence: 'LOW' | 'MEDIUM' | 'HIGH';
    anomalousDailySpikes: number;
    codes: string[];
};

export type SupplyTimingAssessment = {
    /** Supplier catalog lead time is an estimate, NEVER a delivery guarantee. */
    arrivalEstimateAt: string | null;
    arrivalEvidence: 'SUPPLIER_CATALOG_ESTIMATE' | 'UNAVAILABLE';
    projectedDemandBeforeArrivalBase: number | null;
    projectedShortfallBeforeArrivalBase: number | null;
    projectedCoverageDaysWithoutInbound: number | null;
    /** Conditional only: unreceived orders are not usable stock. */
    hypotheticalCoverageDaysWithInbound: number | null;
    codes: string[];
};

const round3 = (value: number) => Number(value.toFixed(3));
const dayMs = 86400000;
const safe = (n: number) => Number.isFinite(n) && n >= 0 && n <= 1e11;

/** Scenario math only. An outstanding PO is never treated as received stock. */
export function assessSupplyTiming(input: {
    at: Date; availableBase: number; dailyDemandBase: number;
    leadTimeDays: number | null; unreceivedInboundBase: number;
}): SupplyTimingAssessment {
    const { at, availableBase, dailyDemandBase, leadTimeDays, unreceivedInboundBase } = input;
    if (!Number.isFinite(at.getTime()) || !safe(availableBase) ||
        !safe(dailyDemandBase) || !safe(unreceivedInboundBase) ||
        (leadTimeDays !== null && (!Number.isInteger(leadTimeDays) ||
            leadTimeDays < 0 || leadTimeDays > 3650))) throw new Error('INVALID_SUPPLY_TIMING');
    const hasDemand = dailyDemandBase > 0;
    const hasLead = leadTimeDays !== null;
    const stockoutDays = hasDemand ? round3(availableBase / dailyDemandBase) : null;
    const due = hasLead ? new Date(at.getTime() + leadTimeDays * dayMs).toISOString() : null;
    const projectedDemand = hasDemand && hasLead ? round3(dailyDemandBase * leadTimeDays) : null;
    const projectedShortfall = projectedDemand === null ? null :
        round3(Math.max(0, projectedDemand - availableBase));
    return {
        arrivalEstimateAt: due,
        arrivalEvidence: hasLead ? 'SUPPLIER_CATALOG_ESTIMATE' : 'UNAVAILABLE',
        projectedDemandBeforeArrivalBase: projectedDemand,
        projectedShortfallBeforeArrivalBase: projectedShortfall,
        projectedCoverageDaysWithoutInbound: stockoutDays,
        hypotheticalCoverageDaysWithInbound: hasDemand && unreceivedInboundBase > 0
            ? round3((availableBase + unreceivedInboundBase) / dailyDemandBase) : null,
        codes: [
            ...(hasLead ? ['ETA_IS_ESTIMATE_NOT_PROMISE'] : ['SUPPLIER_LEAD_TIME_UNVERIFIED']),
            ...(!hasDemand ? ['DEMAND_RATE_UNCERTAIN'] : []),
            ...(projectedShortfall !== null && projectedShortfall > 0
                ? ['PROJECTED_STOCKOUT_BEFORE_LEAD_TIME'] : []),
            ...(unreceivedInboundBase > 0 ? ['INBOUND_SCENARIO_NOT_PHYSICAL'] : [])
        ]
    };
}

/** Pure function: no wall-clock input, provider call or DB write. */
export function assessDemandFromLedger(
    observations: DemandObservation[], at: Date
): DemandAssessment {
    if (!Number.isFinite(at.getTime()) || observations.length > 10000) {
        throw new Error('INVALID_FORECAST_INPUT');
    }
    const counts = new Array<number>(30).fill(0);
    let invalid = 0, used = 0;
    for (const item of observations) {
        const age = at.getTime() - item.createdAt?.getTime();
        if (!safe(-item.quantity) || !Number.isFinite(age) || age < 0 || age >= 30 * dayMs) {
            invalid++;
            continue;
        }
        const idx = Math.floor(age / dayMs);
        counts[idx] += -item.quantity;
        used++;
    }
    const positives = counts.filter(value => value > 0).sort((a, b) => a - b);
    const median = positives.length
        ? positives[Math.floor((positives.length - 1) / 2)]!
        : 0;
    const limit = median > 0 ? median * 3 : Number.POSITIVE_INFINITY;
    const spikes = counts.filter(n => n > limit).length;
    const trimmed = counts.map(n => Math.min(n, limit));
    const sum = (a: number, b: number) => trimmed.slice(a, b).reduce((x, y) => x + y, 0);
    const recent = sum(0, 7), previous = sum(7, 14);
    const activeDays = counts.filter(n => n > 0).length;
    // No consumption in the most recent week must NOT be replaced by an
    // optimistic 30-day rate from older history. That would invent continuing
    // demand during a genuine falling/dormant trend and overstate stockout.
    // Missing real observations also cannot prove future demand is zero:
    // explicitly mark the resulting scenario LOW-confidence for review.
    const dormant = recent === 0 && sum(0, 30) > 0;
    const confidence = dormant || invalid > 0 || activeDays < 7 ? 'LOW'
        : activeDays < 14 || spikes > 0 ? 'MEDIUM' : 'HIGH';
    const rate = recent / 7;
    const trend: DemandAssessment['trend'] = previous === 0
        ? 'UNKNOWN'
        : recent > previous * 1.25 ? 'RISING'
            : recent < previous * 0.75 ? 'FALLING' : 'STABLE';
    const codes = [
        ...(activeDays < 7 ? ['SPARSE_HISTORY_FALLBACK'] : []),
        ...(invalid ? ['INVALID_LEDGER_OBSERVATION'] : []),
        ...(spikes ? ['OUTLIER_REVIEW_REQUIRED'] : []),
        ...(dormant ? ['DEMAND_DORMANT_REVIEW'] : []),
        ...(trend === 'UNKNOWN' ? ['TREND_UNCERTAIN'] : [])
    ];
    return {
        model: 'DETERMINISTIC_LEDGER_BASELINE',
        evidenceWindowDays: 30,
        observedMovements: used,
        observedConsumptionDays: activeDays,
        dailyRate: round3(rate),
        previousSevenDays: round3(previous),
        recentSevenDays: round3(recent),
        trend, confidence, anomalousDailySpikes: spikes, codes
    };
}

/**
 * PostgreSQL reads up to 10,001 rows to detect a hard evidence cap.
 * Never pass 10,001 rows to the 10,000-row pure estimator: that would
 * previously raise INVALID_FORECAST_INPUT as an unrelated HTTP 500.
 * A partial history is usable only as LOW-confidence review evidence.
 */
export function assessBoundedDemandFromLedger(
    observations: DemandObservation[], at: Date
): DemandAssessment {
    const truncated = observations.length > 10000;
    const assessment = assessDemandFromLedger(observations.slice(0, 10000), at);
    if (truncated) {
        assessment.codes.push('HISTORY_TRUNCATED');
        assessment.confidence = 'LOW';
    }
    return assessment;
}

const validNumber = (value: Prisma.Decimal | number): number => {
    const converted = Number(value);
    if (!safe(converted)) throw new HttpError(409, 'INVENTORY_INTEGRITY', 'INVENTORY_INTEGRITY');
    return converted;
};

/** AI06/AI13/AI24: classify actual lot eligibility without silently assigning
 * a merchant shelf-life policy. An unknown expiry is NOT a verified-safe lot;
 * its current legacy quantity calculation is unchanged, but the Agent receives
 * an explicit HOLD/review signal instead of treating missing dates as proof.
 * Quality, expiry and physical integrity are evidence, not purchase authority.
 */
export function assessLotEvidence(
    lots: Array<{ quantityRemaining: Prisma.Decimal | number; qualityStatus: string;
        expirationDate: Date | null }>,
    at: Date
): { usableBase: number; totalBase: number; nearExpiryBase: number; codes: string[] } {
    if (!Number.isFinite(at.getTime())) throw new Error('INVALID_FORECAST_TIME');
    let usableBase = 0, totalBase = 0, nearExpiryBase = 0;
    let expired = false, unknownExpiry = false, nonAvailable = false, nearExpiry = false;
    for (const lot of lots) {
        const quantity = validNumber(lot.quantityRemaining);
        totalBase += quantity;
        if (!safe(totalBase)) throw new HttpError(409, 'INVENTORY_INTEGRITY', 'INVENTORY_INTEGRITY');
        if (quantity === 0) continue;
        const expiry = lot.expirationDate;
        if (expiry !== null && (! (expiry instanceof Date) || !Number.isFinite(expiry.getTime()))) {
            throw new HttpError(409, 'INVENTORY_INTEGRITY', 'INVENTORY_INTEGRITY');
        }
        if (lot.qualityStatus !== 'AVAILABLE') nonAvailable = true;
        if (expiry === null) unknownExpiry = true;
        if (expiry && expiry <= at) expired = true;
        if (lot.qualityStatus !== 'AVAILABLE' || (expiry && expiry <= at)) continue;
        usableBase += quantity;
        if (!safe(usableBase)) throw new HttpError(409, 'INVENTORY_INTEGRITY', 'INVENTORY_INTEGRITY');
        if (expiry && expiry.getTime() <= at.getTime() + 7 * dayMs) {
            nearExpiry = true;
            nearExpiryBase += quantity;
        }
    }
    return {
        usableBase: round3(usableBase), totalBase: round3(totalBase),
        nearExpiryBase: round3(nearExpiryBase),
        codes: [
            ...(expired ? ['EXPIRED_STOCK_PRESENT'] : []),
            ...(unknownExpiry ? ['UNKNOWN_EXPIRY_LOT'] : []),
            ...(nonAvailable ? ['NON_AVAILABLE_LOT_PRESENT'] : []),
            ...(nearExpiry ? ['NEAR_EXPIRY_FEFO'] : [])
        ]
    };
}

export async function readIngredientDemandRisk(ingredientId: string, at = new Date()) {
    if (!/^[A-Za-z0-9_-]{1,200}$/.test(ingredientId)) {
        throw new HttpError(400, 'INVALID_INGREDIENT_ID');
    }
    if (!Number.isFinite(at.getTime())) throw new Error('INVALID_FORECAST_TIME');
    // RepeatableRead gives a single authoritative snapshot for all reads.
    return prisma.$transaction(async tx => {
        const ingredient = await tx.ingredient.findUnique({
            where: { id: ingredientId },
            include: {
                batches: true,
                supplierLinks: {
                    where: { supplier: { status: 'ACTIVE', deletedAt: null } },
                    orderBy: [{ isPreferred: 'desc' }, { leadTimeDays: 'asc' }]
                }
            }
        });
        if (!ingredient || !ingredient.isActive || ingredient.deletedAt) {
            throw new HttpError(404, 'INGREDIENT_UNAVAILABLE');
        }
        const [movements, inbound, pendingCount, pendingEntries, pendingRequests, openRequestRows] = await Promise.all([
            tx.inventoryTransaction.findMany({
                where: {
                    ingredientId, type: InventoryTransactionType.CONSUME,
                    createdAt: { gte: new Date(at.getTime() - 30 * dayMs), lte: at }
                },
                select: { createdAt: true, quantity: true },
                orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
                take: 10001
            }),
            tx.purchaseOrderItem.findMany({
                where: {
                    ingredientId,
                    purchaseOrder: { status: { in: ['CONFIRMED', 'PARTIALLY_RECEIVED'] } }
                },
                select: {
                    quantityOrdered: true, quantityReceived: true, conversionToBase: true,
                    purchaseOrder: { select: { id: true, confirmedAt: true, confirmationSource: true } }
                }
            }),
            tx.stockCountItem.count({
                where: {
                    ingredientId,
                    stockCount: { status: { in: ['DRAFT', 'PENDING_APPROVAL', 'NEEDS_INVESTIGATION'] } }
                }
            }),
            // Active live counts use StocktakeEntry, not only legacy StockCountItem.
            tx.stocktakeEntry.count({
                where: {
                    ingredientId,
                    stockCount: { status: { in: ['DRAFT', 'PENDING_APPROVAL', 'NEEDS_INVESTIGATION'] } }
                }
            }),
            tx.purchaseRequestItem.count({
                where: {
                    ingredientId,
                    request: { status: { in: ['PENDING', 'APPROVED', 'SENT'] } }
                }
            }),
            tx.purchaseRequestItem.findMany({
                where: {
                    ingredientId,
                    request: { status: { in: ['PENDING', 'APPROVED', 'SENT'] } }
                },
                select: {
                    request: { select: {
                        id: true, status: true, demandSourceKey: true, demandHash: true
                    } }
                },
                orderBy: { createdAt: 'desc' },
                take: 64
            })
        ]);
        const risk = assessBoundedDemandFromLedger(
            movements.map(row => ({ quantity: Number(row.quantity), createdAt: row.createdAt })), at);
        const lotEvidence = assessLotEvidence(ingredient.batches, at);
        const physical = validNumber(ingredient.quantity);
        const reserved = validNumber(ingredient.reserved);
        const available = Math.max(0, Math.min(physical, lotEvidence.usableBase) - reserved);
        const lead = ingredient.supplierLinks.find(link =>
            link.conversionTargetUnit === ingredient.baseUnit &&
            link.leadTimeDays >= 0 && Number(link.conversionQuantity) > 0);
        const leadDays = lead?.leadTimeDays ?? null;
        const incoming = inbound.map(row => ({
            purchaseOrderId: row.purchaseOrder.id,
            unreceivedBase: Math.max(0, row.quantityOrdered - row.quantityReceived) * validNumber(row.conversionToBase),
            confirmationSource: row.purchaseOrder.confirmationSource || 'UNVERIFIED',
            estimatedLate: Boolean(leadDays !== null && row.purchaseOrder.confirmedAt &&
                row.purchaseOrder.confirmedAt.getTime() + leadDays * dayMs < at.getTime())
        }));
        const expectedInbound = incoming.reduce((sum, row) => sum + row.unreceivedBase, 0);
        const timing = assessSupplyTiming({
            at, availableBase: available, dailyDemandBase: risk.dailyRate,
            leadTimeDays: leadDays, unreceivedInboundBase: expectedInbound
        });
        const expiresSoon = lotEvidence.nearExpiryBase;
        const expiryExcess = Math.max(0, expiresSoon - risk.dailyRate * 7);
        const anomalousAggregate = Math.abs(lotEvidence.totalBase - physical) > 0.001;
        const activeStocktakeItems = pendingCount + pendingEntries;
        const outstandingRequests = [...new Map(openRequestRows.map(row => [
            row.request.id, { id: row.request.id, status: row.request.status,
                demandSourceKey: row.request.demandSourceKey,
                demandHashPresent: Boolean(row.request.demandHash) }
        ])).values()];
        const codes = [...risk.codes,
            ...(activeStocktakeItems ? ['STOCKTAKE_UNCERTAIN'] : []),
            ...(pendingRequests ? ['EXISTING_PURCHASE_REQUEST'] : []),
            ...(anomalousAggregate ? ['ANOMALOUS_STOCK_AGGREGATE'] : []),
            ...lotEvidence.codes,
            ...(expectedInbound ? ['INBOUND_NOT_PHYSICAL'] : []),
            ...(incoming.some(row => row.estimatedLate) ? ['ESTIMATED_DELIVERY_LATE_UNVERIFIED'] : []),
            ...(expiryExcess > 0 ? ['EXPIRY_SURPLUS_RISK'] : []),
            ...timing.codes];
        return {
            ingredientId, asOf: at.toISOString(), baseUnit: ingredient.baseUnit,
            rowVersion: ingredient.rowVersion, movementCursor: ingredient.movementCursor.toString(),
            availableBase: round3(available), reservedBase: round3(reserved),
            minThresholdBase: validNumber(ingredient.minThreshold),
            demand: risk,
            stockoutEstimateDays: timing.projectedCoverageDaysWithoutInbound,
            leadTimeEstimateDays: leadDays,
            supplyTiming: timing,
            inboundOutstandingBase: round3(expectedInbound),
            incoming,
            nearExpiryBase: round3(expiresSoon),
            potentialExpirySurplusBase: round3(expiryExcess),
            pendingStockCountItems: activeStocktakeItems,
            pendingPurchaseRequestItems: pendingRequests,
            openPurchaseRequests: outstandingRequests,
            openPurchaseRequestsTruncated: pendingRequests > openRequestRows.length,
            codes,
            providerDeliveryVerified: false,
            purchasingDecision: 'HOLD_FOR_AUTHORIZED_REVIEW' as const,
            policyVersionApproved: false,
            writesPerformed: false
        };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead, timeout: 15000 });
}
