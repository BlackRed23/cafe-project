import { prisma, Prisma } from '@cafe-project/database';
import { HttpError } from '../../common/http-error';
import { isIngredientBatchUsable, lotExpiryStatus } from '../../common/ingredient-batch-availability';
import { getSettingByKey } from '../system-setting/system-setting.service';
import { ingredientRepository } from './ingredient.repository';
import { toIngredientDto } from './ingredient.service';

const lockIngredient = async (tx: Prisma.TransactionClient, id: string) => {
    await tx.$queryRaw`SELECT "id" FROM "Ingredient" WHERE "id" = ${id} FOR UPDATE`;
    const ingredient = await ingredientRepository.findById(id, tx);
    if (!ingredient) throw new HttpError(404, 'Ingredient not found.');
    return ingredient;
};

const findBatch = async (tx: Prisma.TransactionClient, ingredientId: string, batchId: string) => {
    const batch = await tx.ingredientBatch.findFirst({ where: { id: batchId, ingredientId } });
    if (!batch) throw new HttpError(404, 'Lot not found for this ingredient.');
    return batch;
};

export const ingredientLotService = {
    async list(ingredientId: string) {
        const setting = await getSettingByKey('inventory.lotNearExpiryDays');
        const warningDays = Number(setting.value);
        if (!/^(0|[1-9]\d*)$/.test(setting.value) || !Number.isSafeInteger(warningDays * 86400000)) {
            throw new HttpError(409, 'Invalid configured near-expiry threshold.');
        }
        return prisma.$transaction(async tx => {
            const ingredient = await ingredientRepository.findById(ingredientId, tx);
            if (!ingredient) throw new HttpError(404, 'Ingredient not found.');
            const batches = await tx.ingredientBatch.findMany({ where: { ingredientId }, orderBy: [{ expirationDate: 'asc' }, { receivedAt: 'asc' }, { id: 'asc' }] });
            const now = new Date(), dto = toIngredientDto(ingredient);
            return {
                evaluatedAt: now, warningDays,
                ingredient: { id: ingredientId, physicalQuantity: dto.quantity, reservedQuantity: dto.reserved,
                    usableQuantity: Number(batches.reduce((sum, batch) => isIngredientBatchUsable(batch, now) ? sum.add(batch.quantityRemaining) : sum, new Prisma.Decimal(0))),
                    availableQuantity: dto.availableQuantity },
                batches: batches.map(batch => ({ ...batch, physicalQuantity: Number(batch.quantityRemaining),
                    usableQuantity: isIngredientBatchUsable(batch, now) ? Number(batch.quantityRemaining) : 0,
                    expiryStatus: lotExpiryStatus(batch.expirationDate, now, warningDays),
                    depletionStatus: batch.quantityRemaining.isZero() ? 'DEPLETED' : 'REMAINING' }))
            };
        }, { isolationLevel: 'RepeatableRead' });
    },

    async transition(ingredientId: string, batchId: string, action: 'QUARANTINE' | 'RECALL',
        input: { requestId: string; reason: string }, actorId: string) {
        return prisma.$transaction(async tx => {
            await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext(${input.requestId}))::text`;
            await lockIngredient(tx, ingredientId);
            const batch = await findBatch(tx, ingredientId, batchId);
            const previous = await tx.lotEvent.findUnique({ where: { requestId: input.requestId } });
            if (previous) {
                if (previous.batchId !== batchId || previous.action !== action || previous.reason !== input.reason || previous.actorId !== actorId) {
                    throw new HttpError(409, 'Request ID already used for a different lot transition.');
                }
                return { batch, event: previous, replayed: true };
            }
            // Quarantine cannot downgrade a recalled batch. Neither operation grants release.
            const status = action === 'RECALL' || batch.qualityStatus === 'RECALLED' ? 'RECALLED' : 'QUARANTINED';
            const updated = await tx.ingredientBatch.update({ where: { id: batchId }, data: { qualityStatus: status } });
            const event = await tx.lotEvent.create({ data: { batchId, requestId: input.requestId, action,
                previousStatus: batch.qualityStatus, newStatus: status, reason: input.reason, actorId } });
            await tx.ingredient.update({ where: { id: ingredientId }, data: { rowVersion: { increment: 1 } } });
            return { batch: updated, event, replayed: false };
        });
    },

    async trace(ingredientId: string, batchId: string) {
        return prisma.$transaction(async tx => {
            const batch = await findBatch(tx, ingredientId, batchId);
            const events = await tx.lotEvent.findMany({ where: { batchId }, orderBy: { createdAt: 'asc' } });
            const outbound = await tx.inventoryTransaction.findMany({ where: { batchId, quantity: { lt: 0 } }, orderBy: { createdAt: 'asc' } });
            const orderItemIds = outbound.flatMap(entry => entry.orderItemId ? [entry.orderItemId] : []);
            const orderItems = await tx.orderItem.findMany({ where: { id: { in: orderItemIds } }, select: { id: true, orderId: true } });
            const orderIds = [...new Set([...orderItems.map(item => item.orderId),
                ...outbound.flatMap(entry => entry.referenceType === 'Order' && entry.referenceId ? [entry.referenceId] : [])])];
            const orders = await tx.order.findMany({ where: { id: { in: orderIds } }, select: { id: true, status: true, stockDeductedAt: true } });
            const returns = await tx.lotReturn.findMany({ where: { OR: [{ sourceBatchId: batchId }, { targetBatchId: batchId }] } });
            return { batch, events, outbound, orderItems, orders, returns };
        }, { isolationLevel: 'RepeatableRead' });
    },

    async returnStock(ingredientId: string, input: { requestId: string; sourceTransactionId: string; batchId: string;
        quantity: number; quality: 'UNKNOWN' | 'UNSAFE' | 'SAFE'; reason: string }, actorId: string) {
        return prisma.$transaction(async tx => {
            await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext(${input.requestId}))::text`;
            await lockIngredient(tx, ingredientId);
            const quantity = new Prisma.Decimal(input.quantity);
            const previous = await tx.lotReturn.findUnique({ where: { requestId: input.requestId } });
            if (previous) {
                const source = await tx.inventoryTransaction.findUniqueOrThrow({ where: { id: previous.sourceTransactionId } });
                if (source.ingredientId !== ingredientId || previous.sourceTransactionId !== input.sourceTransactionId ||
                    previous.sourceBatchId !== input.batchId || !previous.quantity.eq(quantity) || previous.quality !== input.quality ||
                    previous.reason !== input.reason || previous.actorId !== actorId) {
                    throw new HttpError(409, 'Request ID already used for a different return.');
                }
                return { return: previous, replayed: true, releaseToUsable: 'NOT_VERIFIED' };
            }
            if (await tx.lotEvent.findUnique({ where: { requestId: input.requestId } })) {
                throw new HttpError(409, 'Request ID already used for a lot lifecycle operation.');
            }
            const source = await tx.inventoryTransaction.findFirst({ where: { id: input.sourceTransactionId,
                ingredientId, batchId: input.batchId, type: 'CONSUME', quantity: { lt: 0 } } });
            if (!source) throw new HttpError(409, 'Return requires an original CONSUME transaction from the exact ingredient and lot.');
            const batch = await findBatch(tx, ingredientId, input.batchId);
            const returned = await tx.lotReturn.aggregate({ where: { sourceTransactionId: source.id }, _sum: { quantity: true } });
            if ((returned._sum.quantity ?? new Prisma.Decimal(0)).add(quantity).gt(source.quantity.neg())) {
                throw new HttpError(409, 'Return exceeds unreturned quantity of original consumption.');
            }
            // Segregate returned material from existing usable balance; retain exact original lot provenance.
            const target = await tx.ingredientBatch.create({ data: { ingredientId,
                batchCode: `${batch.batchCode}-RETURN-${input.requestId}`, quantityInitial: quantity, quantityRemaining: quantity,
                unitCost: source.unitCost, expirationDate: batch.expirationDate, qualityStatus: 'QUARANTINED',
                note: `Return from batch ${batch.id}, outbound ${source.id}; ${input.reason}` } });
            const movement = await tx.inventoryTransaction.create({ data: { ingredientId, batchId: target.id, type: 'RETURN',
                quantity, unitCost: source.unitCost, totalCost: quantity.mul(source.unitCost).toDecimalPlaces(2),
                referenceType: 'LotReturn', referenceId: input.requestId, performedBy: actorId,
                reason: input.reason, idempotencyKey: `lot-return:${input.requestId}` } });
            const record = await tx.lotReturn.create({ data: { requestId: input.requestId, sourceTransactionId: source.id,
                sourceBatchId: batch.id, targetBatchId: target.id, transactionId: movement.id,
                quantity, quality: input.quality, reason: input.reason, actorId, disposition: 'QUARANTINED' } });
            await tx.lotEvent.create({ data: { batchId: target.id, requestId: input.requestId, action: 'RETURN_QUARANTINE',
                previousStatus: 'NOT_IN_STOCK', newStatus: 'QUARANTINED', actorId, reason: input.reason } });
            await tx.ingredient.update({ where: { id: ingredientId }, data: { quantity: { increment: quantity }, rowVersion: { increment: 1 } } });
            return { return: record, replayed: false, releaseToUsable: 'NOT_VERIFIED' };
        });
    },

    async remove(ingredientId: string, batchId: string) {
        return prisma.$transaction(async tx => {
            await lockIngredient(tx, ingredientId);
            const batch = await findBatch(tx, ingredientId, batchId);
            const references = await tx.inventoryTransaction.count({ where: { batchId } });
            if (references || batch.goodsReceiptId || batch.purchaseRequestItemId ||
                await tx.lotEvent.count({ where: { batchId } }) ||
                await tx.lotReturn.count({ where: { OR: [{ sourceBatchId: batchId }, { targetBatchId: batchId }] } })) {
                throw new HttpError(409, 'Lot has stock transactions or business references and cannot be deleted. Use quarantine or recall.');
            }
            throw new HttpError(409, 'Physical lot deletion is disabled. Use audited quarantine or recall.');
        });
    }
};
