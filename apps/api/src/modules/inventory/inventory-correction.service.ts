import { prisma, Prisma } from '@cafe-project/database';
import { HttpError } from '../../common/http-error';

const correctionType = 'InventoryTransactionCorrection';
const allowedSources = new Set(['IMPORT', 'CONSUME', 'WASTE', 'RETURN', 'ADJUSTMENT', 'DAMAGE']);

export const inventoryCorrectionService = {
    async compensate(ingredientId: string, originalId: string, input: { requestId: string; reason: string }, actorId: string) {
        return prisma.$transaction(async tx => {
            await tx.$queryRaw`SELECT "id" FROM "Ingredient" WHERE "id" = ${ingredientId} FOR UPDATE`;
            const ingredient = await tx.ingredient.findFirst({ where: { id: ingredientId, deletedAt: null } });
            if (!ingredient) throw new HttpError(404, 'Không tìm thấy nguyên liệu.');
            const original = await tx.inventoryTransaction.findFirst({ where: { id: originalId, ingredientId } });
            if (!original || !original.batchId || !allowedSources.has(original.type) ||
                original.referenceType === correctionType || original.quantity.isZero()) {
                throw new HttpError(409, 'Giao dịch gốc không đủ điều kiện tạo bút toán đảo.');
            }
            const key = `ingredient-correction:${input.requestId}`;
            const previous = await tx.inventoryTransaction.findUnique({ where: { idempotencyKey: key } });
            if (previous) {
                if (previous.ingredientId !== ingredientId || previous.referenceType !== correctionType ||
                    previous.referenceId !== originalId || previous.performedBy !== actorId ||
                    previous.reason !== input.reason.trim()) {
                    throw new HttpError(409, 'Mã yêu cầu sửa giao dịch đã được dùng với nội dung khác.');
                }
                return { transaction: previous, originalTransactionId: originalId, replayed: true,
                    approvedBy: previous.performedBy, approvedAt: previous.createdAt };
            }
            const anyCorrection = await tx.inventoryTransaction.findFirst({
                where: { ingredientId, referenceType: correctionType, referenceId: originalId }
            });
            if (anyCorrection) throw new HttpError(409, 'Giao dịch gốc đã được đảo trước đó.');
            const batch = await tx.ingredientBatch.findFirst({ where: { id: original.batchId, ingredientId } });
            if (!batch) throw new HttpError(409, 'Không tìm thấy lô của giao dịch gốc.');
            const delta = original.quantity.neg();
            if (ingredient.quantity.add(delta).lt(ingredient.reserved) ||
                ingredient.quantity.add(delta).lt(0) || batch.quantityRemaining.add(delta).lt(0)) {
                throw new HttpError(409, 'Không thể đảo giao dịch vì tồn kho hoặc số lượng đã giữ chỗ không đủ.');
            }
            await tx.ingredientBatch.update({ where: { id: batch.id }, data: { quantityRemaining: { increment: delta } } });
            await tx.ingredient.update({ where: { id: ingredientId }, data: {
                quantity: { increment: delta }, rowVersion: { increment: 1 }
            } });
            const transaction = await tx.inventoryTransaction.create({ data: {
                ingredientId, batchId: batch.id, type: 'ADJUSTMENT', quantity: delta,
                unitCost: original.unitCost, totalCost: delta.mul(original.unitCost).toDecimalPlaces(2),
                referenceType: correctionType, referenceId: originalId, idempotencyKey: key,
                performedBy: actorId, reason: input.reason.trim()
            } });
            return { transaction, originalTransactionId: originalId, replayed: false,
                approvedBy: actorId, approvedAt: transaction.createdAt };
        }, { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted, timeout: 15000 });
    }
};
