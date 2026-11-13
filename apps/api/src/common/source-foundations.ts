/** Phase 2D pure, opt-in checks. No persistence owner, stock writer or costing policy. */
import { BaseUnit, normalizeIngredientQuantity, rankEligibleBatches } from './ingredient-policy';

function identity(value: string): void {
    if (typeof value !== 'string' || !value || value.trim() !== value) throw Error('Invalid identity');
}
function instant(value: Date): number {
    if (!(value instanceof Date) || !Number.isFinite(value.getTime())) throw Error('Invalid instant');
    return value.getTime();
}
function flag(value: boolean): void { if (typeof value !== 'boolean') throw Error('Explicit boolean required'); }

/** Explicit caller capacity, exact string only; null stays unknown, known zero stays zero.
 * Caller must obtain profile approval before production use. No BDM numeric default. */
export function validateKnownDecimal(value: string | null, profile: { precision: number; scale: number }): string | null {
    const { precision, scale } = profile;
    if (!Number.isSafeInteger(precision) || precision < 1 || precision > 1000 ||
        !Number.isSafeInteger(scale) || scale < 0 || scale > precision) throw Error('Invalid Decimal profile');
    if (value === null) return null;
    if (typeof value !== 'string' || value.length > precision + 2 || !/^(0|[1-9]\d*)(\.\d+)?$/.test(value)) throw Error('Invalid Decimal');
    const [whole = '', fraction = ''] = value.split('.');
    if ((whole === '0' ? 0 : whole.length) > precision - scale || fraction.length > scale) throw Error('Decimal capacity exceeded');
    const tail = fraction.replace(/0+$/, '');
    return whole + (tail ? `.${tail}` : '');
}

export interface IngredientSource { id: string; baseUnit: BaseUnit; isActive: boolean }
function ingredientMap(ingredients: readonly IngredientSource[]): Map<string, IngredientSource> {
    const result = new Map<string, IngredientSource>();
    for (const row of ingredients) {
        identity(row.id); flag(row.isActive);
        normalizeIngredientQuantity('1', row.baseUnit, row.baseUnit);
        if (result.has(row.id)) throw Error('Duplicate ingredient');
        result.set(row.id, row);
    }
    return result;
}
export interface BatchSource {
    id: string; ingredientId: string; expirationDate: Date | null; receivedAt: Date; quantityBase: string | null;
}

export function inspectFefo<T extends BatchSource>(ingredient: IngredientSource, batches: readonly T[], now: Date) {
    ingredientMap([ingredient]); const clock = instant(now);
    if (!ingredient.isActive) throw Error('Inactive ingredient');
    const seen = new Set<string>(), eligible: T[] = [];
    const rejected: { id: string; reason: 'invalid' | 'expired' | 'unknown' | 'empty' }[] = [];
    for (const row of batches) {
        identity(row.id);
        if (seen.has(row.id)) throw Error('Duplicate batch identity');
        seen.add(row.id);
        let reason: 'invalid' | 'expired' | 'unknown' | 'empty' | undefined;
        try {
            if (row.ingredientId !== ingredient.id) throw Error('Cross-ingredient batch');
            if (instant(row.receivedAt) > clock) throw Error('Future receipt');
            const expiry = row.expirationDate === null ? null : instant(row.expirationDate);
            if (expiry !== null && expiry <= instant(row.receivedAt)) throw Error('Invalid batch interval');
            const quantity = validateKnownDecimal(row.quantityBase, { precision: 14, scale: 3 });
            if (quantity !== null && quantity !== '0') normalizeIngredientQuantity(quantity, ingredient.baseUnit, ingredient.baseUnit);
            if (expiry !== null && expiry <= clock) reason = 'expired';
            else if (expiry === null || quantity === null) reason = 'unknown';
            else if (quantity === '0') reason = 'empty';
        } catch { reason = 'invalid'; }
        if (reason) rejected.push({ id: row.id, reason }); else eligible.push(row);
    }
    return { eligible: rankEligibleBatches(eligible, now), rejected };
}

export interface RecipeLineSource {
    ingredientId: string; quantity: string; unit: string; quantityBase: string; isOptional: boolean; allowSubstitute: boolean;
}
export interface RecipeSource {
    id: string; productId: string; version: number; isActive: boolean;
    effectiveFrom: Date; effectiveTo: Date | null; ingredients: readonly RecipeLineSource[];
}
export interface ToppingSource {
    id: string; productId: string | null; isActive: boolean;
    ingredients: readonly { ingredientId: string; quantityBase: string }[];
}
function baseQuantity(id: string, value: string, ingredients: Map<string, IngredientSource>): string {
    const ingredient = ingredients.get(id);
    if (!ingredient?.isActive) throw Error('Missing or inactive ingredient');
    return normalizeIngredientQuantity(value, ingredient.baseUnit, ingredient.baseUnit);
}


export function selectRecipe(product: { id: string; isActive: boolean }, recipes: readonly RecipeSource[], now: Date): RecipeSource {
    identity(product.id); flag(product.isActive); const clock = instant(now);
    if (!product.isActive) throw Error('Inactive product');
    const ids = new Set<string>(), versions = new Set<number>();
    const eligible = recipes.filter(row => {
        identity(row.id); flag(row.isActive);
        if (row.productId !== product.id) throw Error('Cross-product recipe');
        if (!Number.isSafeInteger(row.version) || row.version < 1 || row.version > 2147483647) throw Error('Invalid recipe version');
        if (ids.has(row.id) || versions.has(row.version)) throw Error('Duplicate recipe identity/version');
        ids.add(row.id); versions.add(row.version);
        const start = instant(row.effectiveFrom), end = row.effectiveTo === null ? null : instant(row.effectiveTo);
        if (end !== null && end <= start) throw Error('Invalid recipe interval');
        return row.isActive && start <= clock && (end === null || clock < end);
    });
    if (eligible.length !== 1) throw Error('Missing or ambiguous recipe');
    return eligible[0]!;
}


export function captureRecipeSource(
    product: { id: string; isActive: boolean }, recipes: readonly RecipeSource[], ingredients: readonly IngredientSource[],
    omitted: readonly string[], toppings: readonly ToppingSource[], now: Date,
) {
    const recipe = selectRecipe(product, recipes, now), catalog = ingredientMap(ingredients);
    const seen = new Set<string>();
    const lines = recipe.ingredients.map(row => {
        identity(row.ingredientId); flag(row.isOptional); flag(row.allowSubstitute);
        if (seen.has(row.ingredientId)) throw Error('Duplicate recipe ingredient');
        seen.add(row.ingredientId);
        const quantityBase = baseQuantity(row.ingredientId, row.quantityBase, catalog);
        const ingredient = catalog.get(row.ingredientId)!;
        if (normalizeIngredientQuantity(row.quantity, row.unit, ingredient.baseUnit) !== quantityBase) throw Error('quantityBase mismatch');
        return Object.freeze({ ingredientId: row.ingredientId, baseUnit: ingredient.baseUnit, quantityBase,
            isOptional: row.isOptional, allowSubstitute: row.allowSubstitute });
    });
    if (new Set(omitted).size !== omitted.length) throw Error('Duplicate omission');
    for (const key of omitted) {
        if (!lines.find(row => row.ingredientId === key)?.isOptional) throw Error('Unknown or mandatory omission');
    }
    const toppingIds = new Set<string>();
    const selectedToppings = toppings.map(row => {
        identity(row.id); flag(row.isActive);
        if (!row.isActive || (row.productId !== null && row.productId !== product.id)) throw Error('Invalid topping product/activity');
        if (toppingIds.has(row.id)) throw Error('Duplicate topping');
        toppingIds.add(row.id); const ids = new Set<string>();
        const composition = row.ingredients.map(line => {
            identity(line.ingredientId);
            if (ids.has(line.ingredientId)) throw Error('Duplicate topping ingredient');
            ids.add(line.ingredientId);
            return Object.freeze({ ingredientId: line.ingredientId, baseUnit: catalog.get(line.ingredientId)?.baseUnit,
                quantityBase: baseQuantity(line.ingredientId, line.quantityBase, catalog) });
        });
        return Object.freeze({ id: row.id, productId: row.productId, ingredients: Object.freeze(composition) });
    });
    return Object.freeze({ productId: product.id, recipeId: recipe.id, recipeVersion: recipe.version,
        effectiveFrom: recipe.effectiveFrom.toISOString(), effectiveTo: recipe.effectiveTo?.toISOString() ?? null,
        capturedAt: now.toISOString(), ingredients: Object.freeze(lines), omitted: Object.freeze([...omitted]),
        toppings: Object.freeze(selectedToppings) });
}

export function validateHistoricalRecipeIdentity(
    item: { productId: string; recipeId: string | null; recipeVersion: number | null },
    snapshot: ReturnType<typeof captureRecipeSource> | null,
): void {
    identity(item.productId);
    if (!snapshot || item.recipeId === null || item.recipeVersion === null) throw Error('Historical recipe evidence unavailable');
    identity(item.recipeId);
    if (item.productId !== snapshot.productId || item.recipeId !== snapshot.recipeId || item.recipeVersion !== snapshot.recipeVersion) throw Error('Historical recipe identity mismatch');
}
