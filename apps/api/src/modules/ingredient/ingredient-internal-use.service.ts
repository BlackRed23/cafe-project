import { prisma, Prisma } from '@cafe-project/database';
import { HttpError } from '../../common/http-error';
import { isIngredientBatchUsable } from '../../common/ingredient-batch-availability';
import { allocateFifoBatches, roundMoney2 } from '../../common/ingredient-cost.utils';
import { convertToBaseQuantity } from '../../common/unit-conversion';
import { ingredientRepository } from './ingredient.repository';
import { toIngredientDto } from './ingredient.service';

export const ingredientInternalUseService = {
    async confirm(ingredientId: string, input: {
        requestId: string; quantity: number; unit: string; purpose: string; recipient: string;
    }, actorId: string) {
        return prisma.$transaction(async tx => {
            await tx.$queryRaw`SELECT "id" FROM "Ingredient" WHERE "id" = ${ingredientId} FOR UPDATE`;
            const ingredient = await ingredientRepository.findById(ingredientId, tx);
            if (!ingredient) throw new HttpError(404, 'Ingredient not found.');
            const quantity = convertToBaseQuantity(input.quantity, input.unit, ingredient.baseUnit);
            if (!quantity.gt(0)) throw new HttpError(400, 'Quantity rounds to zero in base units.');
            const reason = JSON.stringify({ purpose: input.purpose, recipient: input.recipient, quantityBase: quantity.toString() });
            const previous = await tx.inventoryTransaction.findMany({ where: {
                ingredientId, referenceType: 'InternalUsage', referenceId: input.requestId
            }, orderBy: { id: 'asc' } });
            if (previous.length) {
                if (previous.some(t => t.reason !== reason || t.performedBy !== actorId || t.type !== 'CONSUME') ||
                    !previous.reduce((sum, t) => sum.sub(t.quantity), new Prisma.Decimal(0)).equals(quantity)) {
                    throw new HttpError(409, 'Request ID already used for different internal usage.');
                }
                return { ingredient: toIngredientDto(ingredient), consumedQuantityBase: Number(quantity),
                    totalCost: Number(roundMoney2(previous.reduce((sum, t) => sum.add(t.totalCost), new Prisma.Decimal(0)))),
                    transactionIds: previous.map(t => t.id), replayed: true };
            }
            if (!ingredient.isActive) throw new HttpError(409, 'Inactive ingredient cannot be used internally.');
            if (new Prisma.Decimal(toIngredientDto(ingredient).availableQuantity).lt(quantity)) {
                throw new HttpError(400, 'Số lượng xuất dùng vượt quá tồn kho khả dụng.');
            }
            const now = new Date();
            const eligibleBatches = ingredient.batches.filter(batch => isIngredientBatchUsable(batch, now));
            const { allocations, totalCost } = allocateFifoBatches(eligibleBatches, quantity, ingredient.name);
            const transactionIds: string[] = [];
            for (const allocation of allocations) {
                await tx.ingredientBatch.update({ where: { id: allocation.batchId },
                    data: { quantityRemaining: { decrement: allocation.quantity } } });
                const entry = await tx.inventoryTransaction.create({ data: {
                    ingredientId, batchId: allocation.batchId, type: 'CONSUME', quantity: allocation.quantity.neg(),
                    unitCost: allocation.unitCost, totalCost: allocation.totalCost,
                    referenceType: 'InternalUsage', referenceId: input.requestId, performedBy: actorId, reason
                } });
                transactionIds.push(entry.id);
            }
            await tx.ingredient.update({ where: { id: ingredientId },
                data: { quantity: { decrement: quantity }, rowVersion: { increment: 1 } } });
            const updated = await ingredientRepository.findById(ingredientId, tx);
            return { ingredient: toIngredientDto(updated!), consumedQuantityBase: Number(quantity),
                totalCost: Number(totalCost), transactionIds, replayed: false };
        }, { timeout: 15000 });
    }
};
