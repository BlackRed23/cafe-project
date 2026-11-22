import { Prisma } from '@cafe-project/database';
import { SAFETY_BUFFER_DAYS } from '@cafe-project/agent/workflows';
import { rankEligibleBatches } from './ingredient-policy';
import { estimateBasePurchaseCost, toDecimal } from './ingredient-cost.utils';
import { HttpError } from './http-error';

const blocked = (reason: string): never => { throw new HttpError(409, reason, 'BLOCKED'); };
export type ReorderSupplier = { supplierId: string; purchaseUnit: string; conversionQuantity: number;
    minOrderQuantity: number; leadTimeDays: number; pricePerBaseUnit: number; updatedAt: Date };
export type ReorderStock = { id: string; baseUnit: string; quantity: Prisma.Decimal; reserved: Prisma.Decimal;
    minThreshold: Prisma.Decimal; rowVersion: number; batches: { id: string; quantityRemaining: Prisma.Decimal;
        expirationDate: Date | null; receivedAt: Date; qualityStatus: string }[] };

/** Read-only conservative planning. All demand/threshold/lead-time/pack inputs supplied by backend. */
export function calculateIngredientReorder(stock: ReorderStock, consumption: { quantity: Prisma.Decimal }[], supplier: ReorderSupplier,
    settings: { days: number; source: 'DATABASE' | 'DEFAULT_POLICY' }, from: Date, now: Date) {
    const decimal = (value: Prisma.Decimal | number) => {
        if (value == null) blocked('Missing stock/pack quantity.');
        const n = toDecimal(value);
        if (!n.isFinite() || n.lt(0) || n.decimalPlaces() > 3) blocked('Invalid stock/pack precision.');
        return n;
    };
    // Ingredient CRUD and the authoritative unit-conversion table also accept
    // `gram` as a 1:1 spelling of `g`. Rejecting it makes valid ingredient
    // purchasing impossible even with verified, consistent supplier terms.
    if (!['g', 'gram', 'ml', 'piece'].includes(stock.baseUnit) || stock.batches.length > 10000 || consumption.length > 10000) blocked('Unsupported planning snapshot.');
    const quantity = decimal(stock.quantity), reserved = decimal(stock.reserved), threshold = decimal(stock.minThreshold);
    const total = stock.batches.reduce((sum, b) => sum.add(decimal(b.quantityRemaining)), new Prisma.Decimal(0));
    if (!total.eq(quantity) || reserved.gt(quantity)) blocked('Batch/aggregate/reservation mismatch.');
    if (stock.baseUnit === 'piece' && [quantity, reserved, threshold, ...stock.batches.map(b => b.quantityRemaining)].some(n => !n.isInteger())) {
        blocked('Fractional piece balance.');
    }
    // FEFO alone validates expiry/order, NOT lot quality. Quarantined/recalled
    // material is physical but never supply available for purchasing decisions.
    const eligible = rankEligibleBatches(stock.batches, now)
        .filter(b => b.receivedAt <= now && b.qualityStatus === 'AVAILABLE')
        .reduce((sum, b) => sum.add(b.quantityRemaining), new Prisma.Decimal(0));
    const unknown = stock.batches.filter(b => b.expirationDate === null).reduce((sum, b) => sum.add(b.quantityRemaining), new Prisma.Decimal(0));
    // Reservations exist only at Ingredient level. Subtract ALL once; conservative lower bound, no invented batch allocation.
    const usable = Prisma.Decimal.max(eligible.sub(reserved), 0);
    const conversion = decimal(supplier.conversionQuantity);
    if (conversion.lte(0) || !Number.isInteger(supplier.minOrderQuantity) || supplier.minOrderQuantity < 1 ||
        !Number.isInteger(supplier.leadTimeDays) || supplier.leadTimeDays < 0 || supplier.leadTimeDays > 365 ||
        !Number.isInteger(settings.days) || settings.days < 1 || settings.days > 90 ||
        !Number.isFinite(supplier.updatedAt.getTime()) ||
        (stock.baseUnit === 'piece' && !conversion.isInteger())) blocked('Invalid supplier/planning policy.');
    let observed = new Prisma.Decimal(0);
    for (const row of consumption) {
        const amount = toDecimal(row.quantity);
        if (!amount.isFinite() || amount.gte(0) || amount.decimalPlaces() > 3) blocked('Invalid CONSUME ledger.');
        observed = observed.sub(amount);
    }
    const days = (now.getTime() - from.getTime()) / 86400000;
    if (!Number.isFinite(days) || days <= 0 || days > 90) blocked('Invalid demand window.');
    const daily = observed.div(days);
    const target = Prisma.Decimal.max(threshold, daily.mul(settings.days + supplier.leadTimeDays + SAFETY_BUFFER_DAYS))
        .toDecimalPlaces(3, Prisma.Decimal.ROUND_CEIL);
    const deficit = Prisma.Decimal.max(target.sub(usable), 0);
    const packs = deficit.gt(0) ? Prisma.Decimal.max(supplier.minOrderQuantity, deficit.div(conversion).ceil()) : new Prisma.Decimal(0);
    const recommended = packs.mul(conversion);
    if (recommended.gt('99999999999.999') || !packs.isInteger() || packs.gt(Number.MAX_SAFE_INTEGER)) blocked('Purchase quantity overflow.');
    return { ingredientId: stock.id, supplierId: supplier.supplierId, baseUnit: stock.baseUnit, quantity: recommended.toNumber(),
        packs: packs.toNumber(), purchaseUnit: supplier.purchaseUnit, conversionQuantity: conversion.toNumber(), minOrderQuantity: supplier.minOrderQuantity,
        aggregateAvailable: quantity.sub(reserved).toNumber(), eligibleStock: eligible.toNumber(), usableStock: usable.toNumber(), unknownExpiryStock: unknown.toNumber(),
        observedConsumption: observed.toNumber(), dailyConsumption: daily.toNumber(), demandRecords: consumption.length, demandBasis: 'OBSERVED_ORDER_CONSUME' as const,
        demandFrom: from.toISOString(), demandTo: now.toISOString(),
        targetStock: target.toNumber(), planningDays: settings.days, leadTimeDays: supplier.leadTimeDays, safetyDays: SAFETY_BUFFER_DAYS,
        ingredientVersion: stock.rowVersion, supplierUpdatedAt: supplier.updatedAt.toISOString(), capturedAt: now.toISOString(), settingsSource: settings.source,
        estimatedCost: estimateBasePurchaseCost(recommended.toFixed(3), supplier.pricePerBaseUnit), policyVersion: 'OBSERVED_CONSUMPTION_V1' as const,
        reservationPolicy: 'ALL_RESERVED_FROM_ELIGIBLE' as const, priceKind: 'REFERENCE' as const };
}
