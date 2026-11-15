import { Prisma } from '@cafe-project/database';
import { HttpError } from './http-error';
import { convertToBaseQuantity } from './unit-conversion';

export const toDecimal = (val: number | string | Prisma.Decimal | null | undefined, fallback = 0): Prisma.Decimal => {
    if (val === null || val === undefined || val === '') {
        return new Prisma.Decimal(fallback);
    }
    return new Prisma.Decimal(val);
};

export const roundCost4 = (val: Prisma.Decimal): Prisma.Decimal =>
    val.toDecimalPlaces(4, Prisma.Decimal.ROUND_HALF_UP);

export const roundMoney2 = (val: Prisma.Decimal): Prisma.Decimal =>
    val.toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP);

export const roundQty3 = (val: Prisma.Decimal): Prisma.Decimal =>
    val.toDecimalPlaces(3, Prisma.Decimal.ROUND_HALF_UP);

/**
 * Mục 2.3: Bình quân gia quyền di động (Moving Weighted Average)
 * newCost = (qtyTồn * costCũ + qtyNhập * unitCostNhập) / (qtyTồn + qtyNhập)
 * Nếu tồn hiện tại <= 0 thì lấy unitCostNhập.
 */
export const calculateMovingAverageCost = (
    currentQty: number | string | Prisma.Decimal,
    currentCostPerBaseUnit: number | string | Prisma.Decimal,
    importQtyBase: number | string | Prisma.Decimal,
    importUnitCost: number | string | Prisma.Decimal
): Prisma.Decimal => {
    const curQty = toDecimal(currentQty);
    const curCost = toDecimal(currentCostPerBaseUnit);
    const impQty = toDecimal(importQtyBase);
    const impCost = toDecimal(importUnitCost);

    if (impQty.lte(0)) {
        throw new HttpError(400, 'Số lượng nhập phải lớn hơn 0.');
    }
    if (impCost.lt(0)) {
        throw new HttpError(400, 'Đơn giá nhập không được âm.');
    }

    if (curQty.lte(0)) {
        return roundCost4(impCost);
    }

    const totalOldValue = curQty.mul(curCost);
    const totalImportValue = impQty.mul(impCost);
    const totalNewQty = curQty.add(impQty);

    if (totalNewQty.lte(0)) {
        return roundCost4(impCost);
    }

    return roundCost4(totalOldValue.add(totalImportValue).div(totalNewQty));
};

export interface FifoBatchCandidate {
    id: string;
    batchCode?: string;
    quantityRemaining: number | string | Prisma.Decimal;
    unitCost: number | string | Prisma.Decimal;
    expirationDate?: Date | string | null;
    receivedAt?: Date | string | null;
}

export interface FifoBatchAllocation {
    batchId: string;
    batchCode?: string;
    quantity: Prisma.Decimal;
    unitCost: Prisma.Decimal;
    totalCost: Prisma.Decimal;
}

/**
 * Mục 2.4: Trừ lô theo FIFO hạn dùng (expirationDate asc NULLS LAST, receivedAt asc, id asc)
 */
export const sortBatchesForFifo = <T extends FifoBatchCandidate>(batches: T[]): T[] => {
    return [...batches].sort((a, b) => {
        const expA = a.expirationDate ? new Date(a.expirationDate).getTime() : null;
        const expB = b.expirationDate ? new Date(b.expirationDate).getTime() : null;

        if (expA !== null && expB !== null && expA !== expB) {
            return expA - expB;
        }
        if (expA !== null && expB === null) return -1;
        if (expA === null && expB !== null) return 1;

        const recA = a.receivedAt ? new Date(a.receivedAt).getTime() : 0;
        const recB = b.receivedAt ? new Date(b.receivedAt).getTime() : 0;
        if (recA !== recB) {
            return recA - recB;
        }

        return a.id.localeCompare(b.id);
    });
};

export const allocateFifoBatches = (
    batches: FifoBatchCandidate[],
    requiredQtyBase: number | string | Prisma.Decimal,
    ingredientName = 'Nguyên liệu'
): { allocations: FifoBatchAllocation[]; totalCost: Prisma.Decimal } => {
    const needed = roundQty3(toDecimal(requiredQtyBase));
    if (needed.lte(0)) {
        return { allocations: [], totalCost: new Prisma.Decimal(0) };
    }

    const sorted = sortBatchesForFifo(batches).filter((b) => toDecimal(b.quantityRemaining).gt(0));
    const totalAvailable = sorted.reduce(
        (sum, b) => sum.add(toDecimal(b.quantityRemaining)),
        new Prisma.Decimal(0)
    );

    if (totalAvailable.lt(needed)) {
        throw new HttpError(
            400,
            `Không đủ lô nguyên liệu "${ingredientName}" còn hạn để xuất. Cần: ${needed.toString()}, khả dụng: ${totalAvailable.toString()}.`
        );
    }

    let remaining = needed;
    const allocations: FifoBatchAllocation[] = [];
    let totalCost = new Prisma.Decimal(0);

    for (const batch of sorted) {
        if (remaining.lte(0)) break;
        const batchRem = roundQty3(toDecimal(batch.quantityRemaining));
        if (batchRem.lte(0)) continue;

        const take = Prisma.Decimal.min(batchRem, remaining);
        const uCost = roundCost4(toDecimal(batch.unitCost));
        const lineCost = roundMoney2(take.mul(uCost));

        allocations.push({
            batchId: batch.id,
            batchCode: batch.batchCode,
            quantity: take,
            unitCost: uCost,
            totalCost: lineCost
        });

        totalCost = totalCost.add(lineCost);
        remaining = roundQty3(remaining.sub(take));
    }

    return {
        allocations,
        totalCost: roundMoney2(totalCost)
    };
};

export interface RecipeIngredientCostInput {
    ingredientId: string;
    ingredientName?: string;
    ingredientSku?: string;
    quantity: number | string | Prisma.Decimal;
    unit: string;
    baseUnit: string;
    quantityBase?: number | string | Prisma.Decimal;
    costPerBaseUnit: number | string | Prisma.Decimal;
    isOptional?: boolean;
    allowSubstitute?: boolean;
    note?: string | null;
}

export interface RecipeCostCalculationInput {
    ingredients: RecipeIngredientCostInput[];
    yieldQuantity?: number | string | Prisma.Decimal;
    laborCost?: number | string | Prisma.Decimal;
    overheadCost?: number | string | Prisma.Decimal;
    productPrice?: number | string | Prisma.Decimal;
}

/**
 * Mục 2.5: Giá vốn món ước tính từ công thức:
 * (Σ quantityBase * costPerBaseUnit (bỏ isOptional) + laborCost + overheadCost) / yieldQuantity
 */
export const calculateRecipeCost = (input: RecipeCostCalculationInput) => {
    const yieldQty = toDecimal(input.yieldQuantity ?? 1, 1);
    if (yieldQty.lte(0)) {
        throw new HttpError(400, 'Sản lượng công thức (yieldQuantity) phải lớn hơn 0.');
    }

    const labor = roundMoney2(toDecimal(input.laborCost ?? 0));
    const overhead = roundMoney2(toDecimal(input.overheadCost ?? 0));

    let mandatoryIngredientsCost = new Prisma.Decimal(0);
    let optionalIngredientsCost = new Prisma.Decimal(0);

    const breakdown = input.ingredients.map((item) => {
        const qtyBase = item.quantityBase !== undefined
            ? roundQty3(toDecimal(item.quantityBase))
            : convertToBaseQuantity(item.quantity, item.unit, item.baseUnit);
        const unitCost = roundCost4(toDecimal(item.costPerBaseUnit));
        const lineCost = roundCost4(qtyBase.mul(unitCost));
        const isOptional = Boolean(item.isOptional);

        if (isOptional) {
            optionalIngredientsCost = optionalIngredientsCost.add(lineCost);
        } else {
            mandatoryIngredientsCost = mandatoryIngredientsCost.add(lineCost);
        }

        return {
            ingredientId: item.ingredientId,
            ingredientName: item.ingredientName ?? '',
            ingredientSku: item.ingredientSku ?? '',
            quantity: Number(toDecimal(item.quantity)),
            unit: item.unit,
            baseUnit: item.baseUnit,
            quantityBase: Number(qtyBase),
            costPerBaseUnit: Number(unitCost),
            lineCost: Number(roundMoney2(lineCost)),
            lineCostExact: lineCost,
            isOptional,
            allowSubstitute: Boolean(item.allowSubstitute),
            note: item.note ?? null
        };
    });

    const totalBatchCost = mandatoryIngredientsCost.add(labor).add(overhead);
    const unitCostDecimal = roundCost4(totalBatchCost.div(yieldQty));
    const priceDecimal = toDecimal(input.productPrice ?? 0);

    let marginAmount = new Prisma.Decimal(0);
    let marginPercent = 0;
    if (priceDecimal.gt(0)) {
        marginAmount = roundMoney2(priceDecimal.sub(unitCostDecimal));
        marginPercent = Number(
            priceDecimal.sub(unitCostDecimal).div(priceDecimal).mul(100).toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP)
        );
    }

    return {
        breakdown,
        ingredientsCost: Number(roundMoney2(mandatoryIngredientsCost)),
        optionalIngredientsCost: Number(roundMoney2(optionalIngredientsCost)),
        laborCost: Number(labor),
        overheadCost: Number(overhead),
        yieldQuantity: Number(yieldQty),
        totalBatchCost: Number(roundMoney2(totalBatchCost)),
        unitCost: Number(unitCostDecimal),
        unitCostDecimal,
        price: Number(priceDecimal),
        marginAmount: Number(marginAmount),
        marginPercent,
        lowMarginWarning: priceDecimal.gt(0) && marginPercent < 30
    };
};

export interface OrderItemCostSnapshotInput {
    price: number | string | Prisma.Decimal;
    quantity: number;
    ingredientCostTotal?: number | string | Prisma.Decimal;
    toppings?: Array<{
        toppingId: string;
        quantity: number;
        price: number | string | Prisma.Decimal;
        unitCostSnapshot: number | string | Prisma.Decimal;
    }>;
    recipe?: {
        yieldQuantity: number | string | Prisma.Decimal;
        laborCost: number | string | Prisma.Decimal;
        overheadCost: number | string | Prisma.Decimal;
    } | null;
    fallbackProductCostPrice?: number | string | Prisma.Decimal;
}

/**
 * Mục 2.6 & 2.8: Tính snapshot giá vốn và lợi nhuận gộp trên OrderItem
 */
export const calculateOrderItemCostSnapshot = (input: OrderItemCostSnapshotInput) => {
    const qty = new Prisma.Decimal(input.quantity);
    const itemPrice = toDecimal(input.price);

    const toppings = (input.toppings ?? []).map((t) => {
        const tQty = new Prisma.Decimal(t.quantity);
        const tPrice = roundMoney2(toDecimal(t.price));
        const costSnapshot = roundMoney2(toDecimal(t.unitCostSnapshot).mul(tQty));
        const revenue = roundMoney2(tPrice.mul(tQty));
        return {
            toppingId: t.toppingId,
            quantity: t.quantity,
            price: tPrice,
            costSnapshot,
            revenue
        };
    });

    const toppingCost = roundMoney2(
        toppings.reduce((sum, t) => sum.add(t.costSnapshot), new Prisma.Decimal(0))
    );
    const toppingRevenue = roundMoney2(
        toppings.reduce((sum, t) => sum.add(t.revenue), new Prisma.Decimal(0))
    );

    let ingredientCost: Prisma.Decimal;
    let extraRecipeCost = new Prisma.Decimal(0);

    if (input.recipe) {
        ingredientCost = roundMoney2(toDecimal(input.ingredientCostTotal ?? 0));
        const yieldQty = toDecimal(input.recipe.yieldQuantity, 1);
        const laborAndOverhead = toDecimal(input.recipe.laborCost).add(toDecimal(input.recipe.overheadCost));
        if (yieldQty.gt(0) && laborAndOverhead.gt(0)) {
            extraRecipeCost = roundMoney2(laborAndOverhead.div(yieldQty).mul(qty));
        }
    } else {
        const fallbackUnitCost = toDecimal(input.fallbackProductCostPrice ?? 0);
        ingredientCost = roundMoney2(fallbackUnitCost.mul(qty));
    }

    const totalCost = roundMoney2(ingredientCost.add(toppingCost).add(extraRecipeCost));
    const itemRevenue = roundMoney2(itemPrice.mul(qty).add(toppingRevenue));
    const grossProfit = roundMoney2(itemRevenue.sub(totalCost));

    return {
        ingredientCost,
        toppingCost,
        totalCost,
        grossProfit,
        toppings
    };
};
