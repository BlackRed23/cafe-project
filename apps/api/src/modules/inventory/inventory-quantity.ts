import { Prisma } from '@cafe-project/database';
import { HttpError } from '../../common/http-error';

/** Decimal(14,3); validate before persistence, never round stock. */
export const stockQuantity = (value: Prisma.Decimal | number | string, signed = false, allowZero = false): Prisma.Decimal => {
    let result: Prisma.Decimal;
    try { result = new Prisma.Decimal(value); }
    catch { throw new HttpError(400, 'Số lượng tồn kho không hợp lệ.'); }
    if (!result.isFinite() || result.decimalPlaces() > 3 || result.abs().greaterThan('99999999999.999') ||
        (!signed && result.isNegative()) || (!allowZero && result.isZero())) {
        throw new HttpError(400, 'Số lượng vượt Decimal(14,3) hoặc không hợp lệ.');
    }
    return result;
};

export const requireWholePieces = (quantity: Prisma.Decimal, baseUnit: string): void => {
    if (baseUnit === 'piece' && !quantity.isInteger()) throw new HttpError(400, 'Nguyên liệu piece cần số lượng nguyên.');
};
