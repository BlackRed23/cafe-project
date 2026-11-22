/**
 * Backend-owned Prisma models, READ-only implementation of three existing
 * UnifiedToolRegistry ports. The current ADMIN principal is enforced by the
 * Registry factory on every dispatch; each handler separately verifies scope.
 *
 * Stocktake/PO outputs reuse TOOL's public Business API evidence validator.
 * The client below projects the SAME existing public GET DTOs from committed
 * PostgreSQL rows. No Agent JWT is manufactured and no HTTP write is issued.
 */
import { prisma, Prisma } from '@cafe-project/database';
import { createToolBusinessReadAdapter, type ToolBusinessBackendClient } from
    '../../services/tool-selection/tool-business-read';
import { TOOL_CONTRACTS } from '../tool-contracts';
import type { ToolServices } from '../tool-registry';
import { SAFETY_BUFFER_DAYS } from '../../utils/inventory.utils';

export type D4LiveReadBindings = Pick<ToolServices, 'reorder' | 'stocktake' | 'inbound'>;
const deny = (statusCode: number): never => {
    throw Object.assign(new Error(statusCode === 404 ? 'NOT_FOUND' : 'FORBIDDEN'), { statusCode });
};
const invalid = (): never => { throw new Error('D4_BACKEND_READ_UNVERIFIED'); };
const decimal = (value: Prisma.Decimal): Prisma.Decimal => {
    if (!value.isFinite() || value.lt(0) || value.decimalPlaces() > 3) invalid();
    return value;
};
const bounded = (value: Prisma.Decimal): number => {
    const checked = decimal(value);
    if (checked.gt(1e12)) invalid();
    return checked.toNumber();
};
// A ratio derived from 30-day CONSUME demand can legitimately have more than
// three fractional places. Quantity precision still stays at <= 3 decimal
// places; only computed daily rates use this floating DTO boundary.
const boundedRate = (value: Prisma.Decimal): number => {
    if (!value.isFinite() || value.lt(0) || value.gt(1e12)) return invalid();
    const n = value.toNumber();
    if (!Number.isFinite(n) || n < 0) return invalid();
    return n;
};
const nonnegativePrice = (value: Prisma.Decimal): Prisma.Decimal => {
    if (!value.isFinite() || value.lt(0) || value.decimalPlaces() > 4) return invalid();
    return value;
};
const signed = (value: Prisma.Decimal): string => {
    if (!value.isFinite() || value.decimalPlaces() > 3) invalid();
    return value.toFixed(3);
};
const positive = (value: Prisma.Decimal): string => decimal(value).toFixed(3);
const scoped = (scope: ReadonlySet<string>, ingredientId: string): void => {
    if (!scope.has(ingredientId)) deny(403);
};

/** Pure DTO projection: same API reorder fields, with live Backend data/terms.
 * A policy/rate or product-supplier mismatch fails closed. The output is NEVER
 * an approval, external quote or permission to create a PurchaseRequest. */
export function computeD4ReorderSnapshot(raw: {
    ingredient: { id: string; baseUnit: string; quantity: Prisma.Decimal; reserved: Prisma.Decimal;
        minThreshold: Prisma.Decimal; rowVersion: number; isActive: boolean; deletedAt: Date | null;
        batches: { id: string; quantityRemaining: Prisma.Decimal; expirationDate: Date | null;
            receivedAt: Date; qualityStatus: string }[] };
    consumption: { quantity: Prisma.Decimal }[];
    supplier: { supplierId: string; purchaseUnit: string; conversionQuantity: Prisma.Decimal;
        pricePerBaseUnit: Prisma.Decimal; minOrderQuantity: number; leadTimeDays: number; updatedAt: Date };
    settings: { days: number; source: 'DATABASE' | 'DEFAULT_POLICY' };
    from: Date; now: Date;
}) {
    const { ingredient: stock, supplier: s, settings, now, from, consumption } = raw;
    if (!stock.isActive || stock.deletedAt || !['g', 'ml', 'piece'].includes(stock.baseUnit) ||
        !Number.isSafeInteger(stock.rowVersion) || stock.rowVersion < 0 ||
        stock.batches.length > 1000 || consumption.length > 10000 ||
        !Number.isInteger(settings.days) || settings.days < 1 || settings.days > 90 ||
        !Number.isInteger(s.leadTimeDays) || s.leadTimeDays < 0 || s.leadTimeDays > 365 ||
        !Number.isInteger(s.minOrderQuantity) || s.minOrderQuantity < 1 ||
        !Number.isFinite(s.updatedAt.getTime()) || !Number.isFinite(now.getTime())) invalid();
    const quantity = decimal(stock.quantity), reserved = decimal(stock.reserved);
    const threshold = decimal(stock.minThreshold), conversion = decimal(s.conversionQuantity);
    nonnegativePrice(s.pricePerBaseUnit);
    if (conversion.lte(0) || stock.baseUnit === 'piece' && !conversion.isInteger()) invalid();
    const total = stock.batches.reduce((sum, b) => sum.add(decimal(b.quantityRemaining)), new Prisma.Decimal(0));
    if (!total.eq(quantity) || reserved.gt(quantity)) invalid();
    if (stock.baseUnit === 'piece' && [quantity, reserved, threshold, ...stock.batches.map(b => b.quantityRemaining)]
        .some(v => !v.isInteger())) invalid();
    const eligible = stock.batches.filter(b => b.receivedAt <= now &&
        b.qualityStatus === 'AVAILABLE' && (!b.expirationDate || b.expirationDate > now))
        .reduce((sum, b) => sum.add(b.quantityRemaining), new Prisma.Decimal(0));
    if (reserved.gt(eligible)) invalid();
    const unknown = stock.batches.filter(b => b.expirationDate === null)
        .reduce((sum, b) => sum.add(b.quantityRemaining), new Prisma.Decimal(0));
    const usable = Prisma.Decimal.max(eligible.sub(reserved), 0);
    const days = (now.getTime() - from.getTime()) / 86400000;
    if (!Number.isFinite(days) || days <= 0 || days > 90) invalid();
    let observed = new Prisma.Decimal(0);
    for (const r of consumption) {
        if (!r.quantity.isFinite() || r.quantity.gte(0) || r.quantity.decimalPlaces() > 3) invalid();
        observed = observed.sub(r.quantity);
    }
    if (!consumption.length) invalid(); // D4 requires observed, committed consumption provenance
    const daily = observed.div(days);
    // Same Backend core policy: horizon = store days + supplier lead + two safety days.
    const safetyDays = SAFETY_BUFFER_DAYS;
    const target = Prisma.Decimal.max(threshold, daily.mul(settings.days + s.leadTimeDays + safetyDays))
        .toDecimalPlaces(3, Prisma.Decimal.ROUND_CEIL);
    const deficit = Prisma.Decimal.max(0, target.sub(usable));
    const packs = deficit.gt(0) ?
        Prisma.Decimal.max(s.minOrderQuantity, deficit.div(conversion).ceil()) : new Prisma.Decimal(0);
    const recommended = packs.mul(conversion);
    if (!packs.isInteger() || packs.gt(Number.MAX_SAFE_INTEGER) || recommended.gt('99999999999.999')) invalid();
    const output = {
        ingredientId: stock.id, supplierId: s.supplierId, baseUnit: stock.baseUnit,
        quantity: bounded(recommended), packs: packs.toNumber(), purchaseUnit: s.purchaseUnit,
        conversionQuantity: bounded(conversion), minOrderQuantity: s.minOrderQuantity,
        aggregateAvailable: quantity.sub(reserved).toNumber(), eligibleStock: bounded(eligible),
        usableStock: bounded(usable), unknownExpiryStock: bounded(unknown),
        observedConsumption: bounded(observed), dailyConsumption: boundedRate(daily),
        demandRecords: consumption.length, demandBasis: 'OBSERVED_ORDER_CONSUME' as const,
        demandFrom: from.toISOString(), demandTo: now.toISOString(),
        targetStock: bounded(target), planningDays: settings.days,
        leadTimeDays: s.leadTimeDays, safetyDays,
        ingredientVersion: stock.rowVersion, supplierUpdatedAt: s.updatedAt.toISOString(),
        capturedAt: now.toISOString(), settingsSource: settings.source,
        estimatedCost: recommended.mul(s.pricePerBaseUnit).toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP).toFixed(2),
        policyVersion: 'OBSERVED_CONSUMPTION_V1' as const,
        reservationPolicy: 'ALL_RESERVED_FROM_ELIGIBLE' as const,
        priceKind: 'REFERENCE' as const
    };
    return TOOL_CONTRACTS.calculateReorderQuantity.output.parse(output);
}

/** Directly reads the same Postgres relations used by:
 * GET /api/stocktakes/:id, GET /api/purchase-orders/:id,
 * GET /api/ingredients/:id/batches. No invented URL or caller JWT. */
/** Optional database seam is for isolated fake-DB unit tests only. Production
 * passes no second argument and always uses the shared verified Prisma client. */
export function createD4LiveToolBindings(
    ingredientIds: readonly string[], db: typeof prisma = prisma
): D4LiveReadBindings {
    const scope = new Set(ingredientIds);
    if (!scope.size || scope.size > 30 ||
        [...scope].some(s => !/^[A-Za-z0-9][A-Za-z0-9:_-]{0,119}$/.test(s))) {
        throw new Error('INVALID_INVENTORY_SCOPE');
    }
    const client: ToolBusinessBackendClient = {
        async get(path) {
            const stocktake = /^\/api\/stocktakes\/([A-Za-z0-9:_-]+)$/.exec(path);
            if (stocktake) {
                const session = await db.stockCount.findFirst({
                    where: { id: stocktake[1], kind: 'STOCKTAKE' },
                    include: { stocktakeEntries: true }
                });
                if (!session) return deny(404);
                const sessionScope = session.scope;
                if (!Array.isArray(sessionScope) ||
                    sessionScope.some(x => typeof x !== 'string') ||
                    !sessionScope.every(x => typeof x === 'string' && scope.has(x))) return deny(403);
                const rows = await db.ingredient.findMany({
                    where: { id: { in: sessionScope as string[] } },
                    include: { batches: true }
                });
                if (rows.length !== sessionScope.length) return invalid();
                return {
                    session: { id: session.id, status: session.status, scope: sessionScope,
                        createdById: session.createdById,
                        assignedCounterId: session.assignedCounterId,
                        revision: session.revision,
                        approvedAt: session.approvedAt?.toISOString() ?? null,
                        updatedAt: session.updatedAt.toISOString() },
                    entries: session.stocktakeEntries.map(e => ({
                        ingredientId: e.ingredientId, batchId: e.batchId,
                        openingCursor: e.openingCursor.toString(),
                        observedCursor: e.observedCursor?.toString() ?? null,
                        countedAt: e.countedAt?.toISOString() ?? null,
                        expectedAtCount: e.expectedAtCount === null ? null : signed(e.expectedAtCount),
                        observedQty: e.observedQty === null ? null : signed(e.observedQty),
                        varianceQty: e.varianceQty === null ? null : signed(e.varianceQty),
                        openingQualityStatus: e.openingQualityStatus })),
                    current: rows.map(row => ({
                        ingredientId: row.id, cursor: row.movementCursor.toString(),
                        batches: row.batches.map(b => ({
                            id: b.id, qualityStatus: b.qualityStatus,
                            quantityRemaining: positive(b.quantityRemaining),
                            expirationDate: b.expirationDate?.toISOString() ?? null }))
                    }))
                };
            }
            const po = /^\/api\/purchase-orders\/([A-Za-z0-9:_-]+)$/.exec(path);
            if (po) {
                const row = await db.purchaseOrder.findUnique({
                    where: { id: po[1] }, include: { items: true, receipts: true }
                });
                if (!row) return deny(404);
                if (!row.items.some(i => i.ingredientId && scope.has(i.ingredientId)) ||
                    row.items.some(i => i.ingredientId && !scope.has(i.ingredientId))) return deny(403);
                return {
                    id: row.id, status: row.status,
                    purchaseRequestId: row.purchaseRequestId,
                    confirmedAt: row.confirmedAt?.toISOString() ?? null,
                    confirmationSource: row.confirmationSource,
                    updatedAt: row.updatedAt.toISOString(),
                    items: row.items.map(item => ({
                        id: item.id, ingredientId: item.ingredientId,
                        quantityOrdered: item.quantityOrdered,
                        quantityReceived: item.quantityReceived,
                        conversionToBase: positive(item.conversionToBase) })),
                    receipts: row.receipts.map(receipt => ({
                        id: receipt.id, purchaseOrderId: receipt.purchaseOrderId,
                        status: receipt.status, receivedAt: receipt.receivedAt.toISOString() }))
                };
            }
            const lots = /^\/api\/ingredients\/([A-Za-z0-9:_-]+)\/batches$/.exec(path);
            if (lots) {
                const ingredientId = lots[1]!;
                scoped(scope, ingredientId);
                const row = await db.ingredient.findFirst({
                    where: { id: ingredientId, isActive: true, deletedAt: null },
                    include: { batches: true }
                });
                if (!row) return deny(404);
                return { batches: row.batches.map(b => ({
                    id: b.id, ingredientId: b.ingredientId,
                    goodsReceiptId: b.goodsReceiptId, qualityStatus: b.qualityStatus,
                    expirationDate: b.expirationDate?.toISOString() ?? null,
                    quantityRemaining: positive(b.quantityRemaining) })) };
            }
            return deny(403);
        }
    };
    const adapter = createToolBusinessReadAdapter(client);
    return Object.freeze({
        reorder: async input => {
            scoped(scope, input.ingredientId);
            const now = new Date(), from = new Date(now.getTime() - 30 * 86400000);
            return db.$transaction(async tx => {
                const ingredient = await tx.ingredient.findFirst({
                    where: { id: input.ingredientId, isActive: true, deletedAt: null },
                    include: { batches: true }
                });
                if (!ingredient) return deny(404);
                const consumption = await tx.inventoryTransaction.findMany({
                    where: { ingredientId: input.ingredientId, type: 'CONSUME',
                        referenceType: 'Order', orderItemId: { not: null },
                        createdAt: { gte: from, lt: now } },
                    select: { quantity: true }, orderBy: { id: 'asc' }, take: 10001
                });
                if (consumption.length > 10000) return invalid();
                const suppliers = await tx.supplierIngredient.findMany({
                    where: { ingredientId: input.ingredientId,
                        supplier: { status: 'ACTIVE', deletedAt: null },
                        conversionTargetUnit: ingredient.baseUnit,
                        ...(input.supplierId ? { supplierId: input.supplierId } : {}) },
                    orderBy: [{ isPreferred: 'desc' }, { pricePerBaseUnit: 'asc' },
                        { leadTimeDays: 'asc' }, { supplierId: 'asc' }],
                    take: 2
                });
                if (!suppliers.length) return deny(404);
                const period = await tx.systemSetting.findUnique({
                    where: { key: 'inventory.reorderPlanningPeriod' }
                });
                // Explicit database policy only; never invent a default on absent policy.
                if (!period) return invalid();
                let days: number;
                if (period.value === 'WEEKLY') days = 7;
                else if (period.value === 'MONTHLY') days = 30;
                else if (period.value === 'CUSTOM') {
                    const custom = await tx.systemSetting.findUnique({
                        where: { key: 'inventory.reorderPlanningCustomDays' }
                    });
                    if (!custom || !/^[1-9]\d*$/.test(custom.value)) return invalid();
                    days = Number(custom.value);
                } else return invalid();
                return computeD4ReorderSnapshot({
                    ingredient, consumption,
                    supplier: suppliers[0]!, settings: { days, source: 'DATABASE' },
                    from, now
                });
            }, { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead, timeout: 4000 });
        },
        stocktake: async input => {
            scoped(scope, input.ingredientId);
            return adapter.readStocktake(input);
        },
        inbound: async input => {
            scoped(scope, input.ingredientId);
            return adapter.readInbound(input);
        }
    });
}
