import { randomUUID } from 'node:crypto';
import { prisma, Prisma } from '@cafe-project/database';
import { HttpError } from '../../common/http-error';
import { allocateFifoBatches, toDecimal } from '../../common/ingredient-cost.utils';
import { ingredientRepository } from './ingredient.repository';

// Lost/missing stock is a pending count, never confirmed waste.
export const ingredientIncidentService = {
    async create(ingredientId: string, input: { actualQuantity: number; reason: string }, actorId: string) {
        return prisma.$transaction(async tx => {
            await tx.$queryRaw`SELECT "id" FROM "Ingredient" WHERE "id" = ${ingredientId} FOR UPDATE`;
            const ingredient = await ingredientRepository.findById(ingredientId, tx);
            if (!ingredient) throw new HttpError(404, 'Ingredient not found.');
            const actual = new Prisma.Decimal(input.actualQuantity);
            if (actual.gte(ingredient.quantity)) throw new HttpError(400, 'A missing-stock incident requires a lower actual quantity.');
            return tx.stockCount.create({ data: {
                code: `ING-LOSS-${randomUUID()}`, status: 'PENDING', createdById: actorId, note: input.reason,
                items: { create: { ingredientId, systemQty: ingredient.quantity, actualQty: actual,
                    varianceQty: actual.sub(ingredient.quantity), reason: input.reason } }
            }, include: { items: true } });
        });
    },

    async get(ingredientId: string, incidentId: string) {
        const count = await prisma.stockCount.findFirst({
            where: { id: incidentId, code: { startsWith: 'ING-LOSS-' }, items: { some: { ingredientId } } }, include: { items: true }
        });
        if (!count) throw new HttpError(404, 'Incident not found.');
        return count;
    },

    async approve(ingredientId: string, incidentId: string, actorId: string) {
        return prisma.$transaction(async tx => {
            // Same ingredient-first lock order as every Ingredient stock writer.
            await tx.$queryRaw`SELECT "id" FROM "Ingredient" WHERE "id" = ${ingredientId} FOR UPDATE`;
            await tx.$queryRaw`SELECT "id" FROM "StockCount" WHERE "id" = ${incidentId} FOR UPDATE`;
            const count = await tx.stockCount.findUnique({ where: { id: incidentId }, include: { items: true } });
            const item = count?.items[0];
            if (!count || !count.code.startsWith('ING-LOSS-') || count.items.length !== 1 || item?.ingredientId !== ingredientId) {
                throw new HttpError(404, 'Incident not found.');
            }
            if (count.status === 'COMPLETED') return count;
            if (count.status !== 'PENDING') throw new HttpError(409, 'Incident is not pending.');
            const ingredient = await ingredientRepository.findById(ingredientId, tx);
            if (!ingredient) throw new HttpError(404, 'Ingredient not found.');
            if (!ingredient.quantity.equals(item.systemQty)) throw new HttpError(409, 'Stock changed; recount before approval.');
            if (item.actualQty.lt(ingredient.reserved) || !item.varianceQty.lt(0) ||
                !item.actualQty.sub(item.systemQty).equals(item.varianceQty)) {
                throw new HttpError(409, 'Invalid variance or adjustment would consume reserved stock.');
            }
            const { allocations } = allocateFifoBatches(ingredient.batches, item.varianceQty.neg(), ingredient.name);
            for (const allocation of allocations) {
                await tx.ingredientBatch.update({ where: { id: allocation.batchId },
                    data: { quantityRemaining: { decrement: allocation.quantity } } });
                await tx.inventoryTransaction.create({ data: {
                    ingredientId, batchId: allocation.batchId, type: 'ADJUSTMENT', quantity: allocation.quantity.neg(),
                    unitCost: allocation.unitCost, totalCost: allocation.totalCost,
                    referenceType: 'StockCount', referenceId: count.id, performedBy: actorId, reason: item.reason
                } });
            }
            await tx.ingredient.update({ where: { id: ingredientId },
                data: { quantity: toDecimal(item.actualQty), rowVersion: { increment: 1 } } });
            return tx.stockCount.update({ where: { id: count.id }, data: {
                status: 'COMPLETED', approvedById: actorId, approvedAt: new Date()
            }, include: { items: true } });
        });
    }
};
