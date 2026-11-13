import { Prisma } from '@cafe-project/database';
import { HttpError } from '../../common/http-error';
import { stockQuantity } from '../inventory/inventory-quantity';

export function reservationUnits(items: ReadonlyArray<{ id: string; recipeId: string | null; recipeVersion: number | null; quantity: number; costBreakdown: Prisma.JsonValue }>,
    held: ReadonlyArray<{ orderItemId: string | null; ingredientId: string; quantity: Prisma.Decimal }>): Map<string, string> {
    const units = new Map<string, string>();
    const invalid = () => new HttpError(409, 'BLOCKED: snapshot và ledger giữ kho không khớp; cần đối soát.');
    if (held.some(r => !items.some(i => i.id === r.orderItemId))) throw invalid();
    for (const item of items) {
        const snapshot = item.costBreakdown;
        if (!snapshot || typeof snapshot !== 'object' || Array.isArray(snapshot) || snapshot.schema !== 'api-recipe-v1' ||
            snapshot.recipeId !== item.recipeId || snapshot.recipeVersion !== item.recipeVersion || snapshot.servings !== item.quantity || !Array.isArray(snapshot.ingredients)) throw invalid();
        const reservations = held.filter(r => r.orderItemId === item.id);
        if (!reservations.length || reservations.length !== snapshot.ingredients.length) throw invalid();
        const seen = new Set<string>();
        for (const line of snapshot.ingredients) {
            if (!line || typeof line !== 'object' || Array.isArray(line) || typeof line.ingredientId !== 'string' || typeof line.quantityBase !== 'string' ||
                typeof line.baseUnit !== 'string' || seen.has(line.ingredientId)) throw invalid();
            seen.add(line.ingredientId);
            let quantity: Prisma.Decimal;
            try { quantity = stockQuantity(line.quantityBase); } catch { throw invalid(); }
            const matching = reservations.filter(r => r.ingredientId === line.ingredientId);
            if (matching.length !== 1 || !matching[0]!.quantity.eq(quantity)) throw invalid();
            units.set(`${item.id}:${line.ingredientId}`, line.baseUnit);
        }
    }
    return units;
}
