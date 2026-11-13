import { Prisma } from '@cafe-project/database';
import { HttpError } from '../../common/http-error';
import { stockQuantity } from '../inventory/inventory-quantity';

export async function lockStock(tx: Prisma.TransactionClient, ids: string[]) {
    for (const id of [...new Set(ids)].sort()) await tx.$queryRaw`SELECT "id" FROM "Ingredient" WHERE "id" = ${id} FOR UPDATE`;
}
export async function reserveIngredient(tx: Prisma.TransactionClient, id: string, quantity: Prisma.Decimal) {
    const current = await tx.ingredient.findUnique({ where: { id }, include: { batches: true } });
    if (!current || !current.isActive || current.deletedAt) throw new HttpError(409, 'Nguyên liệu không khả dụng.');
    const sum = current.batches.reduce((s, b) => s.plus(b.quantityRemaining), new Prisma.Decimal(0));
    const now = new Date();
    const eligible = current.batches.filter(b => b.expirationDate && b.expirationDate > now && b.receivedAt <= now)
        .reduce((s, b) => s.plus(b.quantityRemaining), new Prisma.Decimal(0));
    if (!sum.eq(current.quantity) || current.reserved.lt(0) || current.quantity.lt(current.reserved) ||
        Prisma.Decimal.min(eligible, current.quantity).minus(current.reserved).lt(quantity)) throw new HttpError(409, 'Không đủ tồn kho/lô còn hạn hoặc tồn cần đối soát.');
    await tx.ingredient.update({ where: { id }, data: { reserved: stockQuantity(current.reserved.plus(quantity)), rowVersion: { increment: 1 } } });
}
export async function finishReservation(tx: Prisma.TransactionClient, ingredientId: string, quantity: Prisma.Decimal,
    orderId: string, orderItemId: string, userId: string, consume: boolean, expectedUnit: string) {
    const current = await tx.ingredient.findUnique({ where: { id: ingredientId } });
    if (!current || current.baseUnit !== expectedUnit || current.reserved.lt(quantity) || current.quantity.lt(current.reserved)) throw new HttpError(409, 'Tồn đặt trước/đơn vị cần đối soát.');
    if (consume) {
        const now = new Date();
        const all = await tx.ingredientBatch.findMany({ where: { ingredientId }, orderBy: [{ expirationDate: 'asc' }, { receivedAt: 'asc' }, { id: 'asc' }] });
        const total = all.reduce((s, b) => s.plus(b.quantityRemaining), new Prisma.Decimal(0));
        if (!total.eq(current.quantity)) throw new HttpError(409, 'Tổng tồn lô lệch tồn nguyên liệu.');
        const eligible = all.filter(b => b.expirationDate && b.expirationDate > now && b.receivedAt <= now && b.quantityRemaining.gt(0));
        let remaining = quantity;
        for (const batch of eligible) {
            if (remaining.isZero()) break;
            const delta = Prisma.Decimal.min(remaining, batch.quantityRemaining);
            const changed = await tx.ingredientBatch.updateMany({ where: { id: batch.id, ingredientId, quantityRemaining: { gte: delta } }, data: { quantityRemaining: { decrement: delta } } });
            if (changed.count !== 1) throw new HttpError(409, 'Lô đã thay đổi.');
            await tx.inventoryTransaction.create({ data: { ingredientId, batchId: batch.id, orderItemId, performedBy: userId,
                type: 'CONSUME', quantity: delta.negated(), unitCost: batch.unitCost, referenceType: 'ORDER', referenceId: orderId,
                idempotencyKey: `order:${orderItemId}:consume:${batch.id}` } });
            remaining = remaining.minus(delta);
        }
        if (remaining.gt(0)) throw new HttpError(409, 'Không đủ lô nguyên liệu còn hạn.');
    }
    await tx.ingredient.update({ where: { id: ingredientId }, data: {
        reserved: { decrement: quantity }, ...(consume ? { quantity: { decrement: quantity } } : {}), rowVersion: { increment: 1 }
    } });
    await tx.inventoryTransaction.create({ data: { ingredientId, orderItemId, performedBy: userId, type: 'RELEASE',
        quantity: quantity.negated(), referenceType: 'ORDER', referenceId: orderId, idempotencyKey: `order:${orderItemId}:release:${ingredientId}` } });
}
