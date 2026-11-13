import { Prisma } from '@cafe-project/database';
import { HttpError } from '../../common/http-error';

/** Legacy price is per purchase unit. Never round a quoted price to fit storage. */
export function supplierConversion(input: { price: number | string; purchaseUnit?: string | null; conversionQuantity?: number | null; conversionTargetUnit?: string | null }, baseUnit: string) {
    const explicit = input.purchaseUnit != null || input.conversionQuantity != null || input.conversionTargetUnit != null;
    if (explicit && (!input.purchaseUnit || !input.conversionQuantity || !input.conversionTargetUnit)) throw new HttpError(400, 'Cần đủ quy cách nhập hàng.');
    const target = input.conversionTargetUnit === 'gram' ? 'g' : input.conversionTargetUnit ?? baseUnit;
    if (target !== baseUnit) throw new HttpError(400, 'Đơn vị quy đổi phải khớp đơn vị gốc nguyên liệu.');
    const conversion = new Prisma.Decimal(input.conversionQuantity ?? 1);
    const price = new Prisma.Decimal(input.price);
    const basePrice = price.div(conversion);
    if (!conversion.isFinite() || conversion.lte(0) || conversion.decimalPlaces() > 3 || conversion.gt('99999999999.999') ||
        !price.isFinite() || price.lt(0) || !basePrice.isFinite() || basePrice.decimalPlaces() > 4 || basePrice.gt('99999999999999.9999') ||
        (baseUnit === 'piece' && !conversion.isInteger())) throw new HttpError(400, 'Quy cách hoặc giá vượt độ chính xác lưu trữ.');
    return { purchaseUnit: input.purchaseUnit ?? baseUnit, conversionQuantity: conversion, conversionTargetUnit: baseUnit, pricePerBaseUnit: basePrice };
}
