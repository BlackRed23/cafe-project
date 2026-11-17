import { createReadToolAdapter, createToolRegistry, type ToolServices } from './tool-adapter';
import { ToolError, TOOL_CONTRACTS } from './tool-contracts';

/** Explicit backend binding; not mounted on HTTP or connected to legacy Agent execution. */
export function createBackendToolServices(): ToolServices {
    const ingredient = async (id: string) => (await import('../modules/ingredient/ingredient.service')).ingredientService.getById(id);
    const suppliers = async (id: string) => {
        // Guard legacy product fallback: supplier lookup must resolve an active Ingredient first.
        const item = await ingredient(id);
        if (!item.isActive) throw new ToolError('NOT_FOUND');
        const { supplierService } = await import('../modules/supplier/supplier.service');
        const rows = await supplierService.findIngredientSuppliers(id);
        return rows.map(row => {
            if (!('ingredientId' in row) || row.ingredientId !== id || !('pricePerBaseUnit' in row) ||
                row.conversionTargetUnit !== item.baseUnit) throw new ToolError('INVALID_OUTPUT');
            return { supplierId: row.supplierId, ingredientId: row.ingredientId, purchaseUnit: row.purchaseUnit,
                conversionQuantity: Number(row.conversionQuantity), baseUnit: row.conversionTargetUnit, pricePerBaseUnit: row.pricePerBaseUnit };
        });
    };
    return {
        async authorize(actorId, permission) {
            const { getCurrentUser } = await import('../modules/auth/auth.service');
            const current = await getCurrentUser(actorId); // Includes current active-account check.
            const roles: Record<string, string[]> = {
                'agent.run': ['ADMIN', 'STAFF'],
                'inventory.read': ['ADMIN', 'STAFF'], 'recipe.read': ['ADMIN', 'STAFF'], 'supplier.read': ['ADMIN'],
                'sales.read': ['ADMIN', 'STAFF'], 'purchase.plan': ['ADMIN'],
            };
            if (!roles[permission]?.includes(current.role)) throw new ToolError('FORBIDDEN');
        },
        async availability(id) {
            const row = await ingredient(id);
            return { ingredientId: row.id, baseUnit: row.baseUnit, quantity: row.quantity, reserved: row.reserved,
                available: row.availableQuantity, active: row.isActive, rowVersion: row.rowVersion };
        },
        async batches(id) {
            const row = await ingredient(id);
            return { ingredientId: row.id, baseUnit: row.baseUnit, batches: row.batches.map(b => ({
                id: b.id, quantityRemaining: b.quantityRemaining, expirationDate: b.expirationDate?.toISOString() ?? null,
                receivedAt: b.receivedAt.toISOString(),
            })) };
        },
        async recipe(id) {
            const { recipeService } = await import('../modules/recipe/recipe.service');
            const row = await recipeService.getActiveByProduct(id);
            if (!row) throw new ToolError('NOT_FOUND');
            return { recipeId: row.id, productId: row.productId, version: row.version, yieldQuantity: row.yieldQuantity,
                ingredients: row.ingredients.map(i => ({ ingredientId: i.ingredientId, baseUnit: i.baseUnit,
                    quantityBase: i.quantityBase, optional: i.isOptional })) };
        },
        suppliers,
        async sales(input) {
            return (await import('../modules/order/order.service')).getSalesHistory(input);
        },
        async reorder(input) {
            return (await import('../modules/ingredient/ingredient.service')).ingredientService.calculateReorderQuantity(input);
        },
        async estimate(input) {
            const parsed = TOOL_CONTRACTS.findIngredientSuppliers.output.safeParse(await suppliers(input.ingredientId));
            if (!parsed.success) throw new ToolError('INVALID_OUTPUT');
            const rows = parsed.data;
            const candidates = rows.filter(row => row.supplierId === input.supplierId);
            if (candidates.length !== 1) throw new ToolError('NOT_FOUND');
            const row = candidates[0]!;
            const { estimateBasePurchaseCost } = await import('../common/ingredient-cost.utils');
            return { ...input, baseUnit: row.baseUnit, total: estimateBasePurchaseCost(input.quantityBase, row.pricePerBaseUnit) };
        },
    };
}

export const createBackendReadTools = () => createReadToolAdapter(createBackendToolServices());
export const createBackendToolRegistry = () => createToolRegistry(createBackendToolServices(), 'BACKEND');
