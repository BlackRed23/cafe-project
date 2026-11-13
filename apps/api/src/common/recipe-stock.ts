import { Prisma } from '@cafe-project/database';
import { HttpError } from './http-error';
import { normalizeIngredientQuantity, type BaseUnit } from './ingredient-policy';

export interface RecipeStockIngredient {
    id: string; baseUnit: string; isActive: boolean; deletedAt: Date | null;
    quantity: Prisma.Decimal; reserved: Prisma.Decimal;
    batches: Array<{ quantityRemaining: Prisma.Decimal; expirationDate: Date | null; receivedAt: Date }>;
}
export interface StockRecipe {
    id: string; productId: string; version: number; isActive: boolean; effectiveFrom: Date; effectiveTo: Date | null;
    yieldQuantity: Prisma.Decimal;
    ingredients: Array<{ ingredientId: string; quantity: Prisma.Decimal; unit: string; quantityBase: Prisma.Decimal; ingredient: RecipeStockIngredient }>;
}
export function activeRecipe(recipes: readonly StockRecipe[], now = new Date()): StockRecipe {
    const eligible = recipes.filter(r => r.isActive && r.effectiveFrom <= now && (!r.effectiveTo || r.effectiveTo > now));
    if (eligible.length !== 1 || !eligible[0]!.yieldQuantity.gt(0) || !eligible[0]!.ingredients.length) throw new HttpError(409, 'Công thức thiếu hoặc không xác định duy nhất.');
    return eligible[0]!;
}
export function recipeNeeds(recipe: StockRecipe, servings: number): Map<string, Prisma.Decimal> {
    if (!Number.isSafeInteger(servings) || servings <= 0) throw new HttpError(400, 'Số phần bán không hợp lệ.');
    const needs = new Map<string, Prisma.Decimal>();
    for (const line of recipe.ingredients) {
        const ingredient = line.ingredient;
        if (!ingredient.isActive || ingredient.deletedAt || ingredient.id !== line.ingredientId) throw new HttpError(409, 'Nguyên liệu không khả dụng.');
        const base = ingredient.baseUnit;
        if (base !== 'g' && base !== 'ml' && base !== 'piece') throw new HttpError(409, 'Đơn vị gốc chưa được hỗ trợ.');
        let normalized: string;
        try { normalized = normalizeIngredientQuantity(line.quantity.toString(), line.unit, base as BaseUnit); }
        catch { throw new HttpError(409, 'Đơn vị công thức không khớp nguyên liệu.'); }
        if (!line.quantityBase.eq(normalized) || !line.quantityBase.gt(0)) throw new HttpError(409, 'Số lượng công thức cần đối soát.');
        const quantity = line.quantityBase.times(servings).div(recipe.yieldQuantity);
        if (quantity.decimalPlaces() > 3 || quantity.gt('99999999999.999') || (base === 'piece' && !quantity.isInteger())) throw new HttpError(409, 'Công thức không thể chia chính xác theo đơn vị gốc.');
        needs.set(line.ingredientId, (needs.get(line.ingredientId) ?? new Prisma.Decimal(0)).plus(quantity));
    }
    return needs;
}
export function ingredientAvailable(ingredient: RecipeStockIngredient, now = new Date()): Prisma.Decimal {
    const eligible = ingredient.batches.filter(b => b.expirationDate && b.expirationDate > now && b.receivedAt <= now)
        .reduce((sum, b) => sum.plus(b.quantityRemaining), new Prisma.Decimal(0));
    return Prisma.Decimal.max(0, Prisma.Decimal.min(ingredient.quantity, eligible).minus(ingredient.reserved));
}
export function productCapacity(recipes: readonly StockRecipe[], now = new Date()): number {
    try {
        const recipe = activeRecipe(recipes, now);
        const needs = recipeNeeds(recipe, 1);
        return Math.min(...[...needs].map(([id, amount]) => ingredientAvailable(recipe.ingredients.find(l => l.ingredientId === id)!.ingredient, now).div(amount).floor().toNumber()));
    } catch { return 0; }
}
