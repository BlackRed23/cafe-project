import { Prisma } from '@cafe-project/database';
import { HttpError } from '../../common/http-error';
import { activeRecipe, recipeNeeds, productCapacity, ingredientAvailable } from '../../common/recipe-stock';
import { simulateSaleRepository } from './simulate-sale.repository';
import type { SimulateSaleInput } from './simulate-sale.validator';

export const simulateSaleService = {
    async run(input: SimulateSaleInput, _userId: string) {
        // Legacy implementation mutated real stock and triggered purchase creation.
        // No approved replacement policy or simulation persistence contract exists.
        if (input.isPreview !== true) throw new HttpError(409, 'BLOCKED: mô phỏng ghi tồn thật chưa có chính sách được xác minh. Chỉ hỗ trợ isPreview=true.', 'SIMULATION_WRITE_BLOCKED');
        let items = input.items?.length ? input.items : input.productId ? [{ productId: input.productId, quantity: input.quantity ?? 0 }] : [];
        if (input.simulationMode || input.dailySimulatedQuantity !== undefined) {
            if (items.length !== 1) throw new HttpError(400, 'Mô phỏng theo kỳ chỉ nhận một sản phẩm.');
            let days = input.simulationMode === 'WEEK' ? 7 : input.simulationMode === 'MONTH' ? 30 : 1;
            if (input.simulationMode === 'CUSTOM_RANGE') {
                const start = Date.parse(input.startDate ?? ''), end = Date.parse(input.endDate ?? '');
                if (!Number.isFinite(start) || !Number.isFinite(end) || end < start) throw new HttpError(400, 'Khoảng thời gian không hợp lệ.');
                days = Math.floor((end - start) / 86400000) + 1;
            }
            items = [{ productId: items[0]!.productId, quantity: input.dailySimulatedQuantity === undefined ? items[0]!.quantity : input.dailySimulatedQuantity * days }];
        }
        if (!items.length || new Set(items.map(i => i.productId)).size !== items.length || items.some(i => !Number.isSafeInteger(i.quantity) || i.quantity <= 0)) throw new HttpError(400, 'Số lượng mô phỏng không hợp lệ.');
        const products = await simulateSaleRepository.findProducts(items.map(i => i.productId));
        const totals = new Map<string, { quantity: Prisma.Decimal; available: Prisma.Decimal }>();
        const affectedProducts = items.map(item => {
            const product = products.find(p => p.id === item.productId);
            if (!product) throw new HttpError(404, 'Không tìm thấy sản phẩm đang bán.');
            const recipe = activeRecipe(product.recipes), needs = recipeNeeds(recipe, item.quantity);
            for (const [id, amount] of needs) {
                const ingredient = recipe.ingredients.find(i => i.ingredientId === id)!.ingredient;
                const previous = totals.get(id);
                totals.set(id, { quantity: (previous?.quantity ?? new Prisma.Decimal(0)).plus(amount), available: ingredientAvailable(ingredient) });
            }
            const capacity = productCapacity(product.recipes);
            if (item.quantity > capacity) throw new HttpError(409, 'Không đủ nguyên liệu/lô còn hạn cho dự báo.');
            return { productId: product.id, productName: product.name, inventoryId: null, transactionId: null,
                stockBefore: capacity, stockAfter: capacity - item.quantity, decreasedQuantity: item.quantity,
                ingredientConsumption: [...needs].map(([ingredientId, quantity]) => ({ ingredientId, quantityBase: quantity.toString() })) };
        });
        for (const total of totals.values()) if (total.quantity.gt(total.available)) throw new HttpError(409, 'Các sản phẩm dùng chung nguyên liệu vượt tồn khả dụng.');
        for (const affected of affectedProducts) {
            const recipe = activeRecipe(products.find(product => product.id === affected.productId)!.recipes);
            affected.stockAfter = Math.min(...[...recipeNeeds(recipe, 1)].map(([id, perServing]) => {
                const total = totals.get(id)!;
                return total.available.minus(total.quantity).div(perServing).floor().toNumber();
            }));
        }
        return { isPreview: true, inventoryUnchanged: true, affectedProduct: affectedProducts[0], affectedProducts,
            newQuantity: affectedProducts[0]?.stockAfter ?? 0, createdPurchaseRequests: [], agentLogs: [], agentResults: [], agentWarning: null, scanSessionId: null };
    },
    async restore(_transactionId: string, _userId: string): Promise<never> {
        throw new HttpError(409, 'BLOCKED: thiếu bằng chứng hoàn kho mô phỏng lịch sử; không tự cộng tồn thật.', 'SIMULATION_RESTORE_BLOCKED');
    },
    async pendingRestore(userId: string) {
        const historicalTransactions = await simulateSaleRepository.findPendingRestore(userId);
        return { pendingRestores: [], historicalTransactions, blocked: true, reason: 'Historical simulations require manual reconciliation.' };
    }
};
