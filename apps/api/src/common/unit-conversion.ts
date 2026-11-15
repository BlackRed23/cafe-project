import { Prisma } from '@cafe-project/database';
import { HttpError } from './http-error';

type UnitGroup = 'MASS' | 'VOLUME' | 'COUNT';

interface UnitDefinition {
    group: UnitGroup;
    toBaseFactor: Prisma.Decimal;
    canonicalBase: string;
}

const UNIT_MAP: Record<string, UnitDefinition> = {
    mg: { group: 'MASS', toBaseFactor: new Prisma.Decimal('0.001'), canonicalBase: 'g' },
    g: { group: 'MASS', toBaseFactor: new Prisma.Decimal('1'), canonicalBase: 'g' },
    gr: { group: 'MASS', toBaseFactor: new Prisma.Decimal('1'), canonicalBase: 'g' },
    gram: { group: 'MASS', toBaseFactor: new Prisma.Decimal('1'), canonicalBase: 'g' },
    kg: { group: 'MASS', toBaseFactor: new Prisma.Decimal('1000'), canonicalBase: 'g' },
    kilogram: { group: 'MASS', toBaseFactor: new Prisma.Decimal('1000'), canonicalBase: 'g' },

    ml: { group: 'VOLUME', toBaseFactor: new Prisma.Decimal('1'), canonicalBase: 'ml' },
    l: { group: 'VOLUME', toBaseFactor: new Prisma.Decimal('1000'), canonicalBase: 'ml' },
    lit: { group: 'VOLUME', toBaseFactor: new Prisma.Decimal('1000'), canonicalBase: 'ml' },
    'lít': { group: 'VOLUME', toBaseFactor: new Prisma.Decimal('1000'), canonicalBase: 'ml' },
    liter: { group: 'VOLUME', toBaseFactor: new Prisma.Decimal('1000'), canonicalBase: 'ml' },
};

export const normalizeUnitString = (unit: string | null | undefined): string => {
    if (!unit) return '';
    return unit.trim().toLowerCase();
};

export const getUnitConversionFactor = (fromUnit: string, toBaseUnit: string): Prisma.Decimal => {
    const fromNorm = normalizeUnitString(fromUnit);
    const toNorm = normalizeUnitString(toBaseUnit);

    if (!fromNorm || !toNorm) {
        throw new HttpError(400, 'Đơn vị tính không được để trống.');
    }

    if (fromNorm === toNorm) {
        return new Prisma.Decimal(1);
    }

    const fromDef = UNIT_MAP[fromNorm];
    const toDef = UNIT_MAP[toNorm];

    if (fromDef && toDef && fromDef.group === toDef.group) {
        return fromDef.toBaseFactor.div(toDef.toBaseFactor);
    }

    throw new HttpError(
        400,
        `Không thể quy đổi trực tiếp từ đơn vị "${fromUnit}" sang đơn vị chuẩn "${toBaseUnit}" vì khác nhóm đơn vị.`
    );
};

export const convertToBaseQuantity = (
    quantity: number | string | Prisma.Decimal,
    fromUnit: string,
    toBaseUnit: string
): Prisma.Decimal => {
    const qtyDecimal = new Prisma.Decimal(quantity);
    if (qtyDecimal.lte(0)) {
        throw new HttpError(400, 'Số lượng quy đổi phải lớn hơn 0.');
    }
    const factor = getUnitConversionFactor(fromUnit, toBaseUnit);
    return qtyDecimal.mul(factor).toDecimalPlaces(3, Prisma.Decimal.ROUND_HALF_UP);
};
