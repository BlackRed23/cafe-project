import { prisma, Prisma } from '@cafe-project/database';
import { HttpError } from '../../common/http-error';

type AdjustmentInput = { requestId: string; batchId: string; measuredQuantity: number; reason: string };
type AdjustmentNote = { batchId: string; batchQuantityBefore: string; measuredQuantity: string; reason: string; actorId: string; rejectedBy?: string; rejectedAt?: string };
const prefix = 'ING-ADJUST-';

const parseNote = (value: string | null): AdjustmentNote => {
    try {
        const note = JSON.parse(value ?? '') as AdjustmentNote;
        if (!note.batchId || !note.batchQuantityBefore || !note.reason || !note.actorId) throw new Error();
        return note;
    } catch {
        throw new HttpError(409, 'Thông tin kiểm kê không hợp lệ, không thể duyệt.');
    }
};

const readRequest = async (tx: Prisma.TransactionClient, ingredientId: string, requestId: string) => {
    const count = await tx.stockCount.findFirst({
        where: { code: prefix + requestId, items: { some: { ingredientId } } },
        include: { items: true }
    });
    if (!count || count.items.length !== 1 || count.items[0]?.ingredientId !== ingredientId) {
        throw new HttpError(404, 'Không tìm thấy phiếu kiểm kê.');
    }
    return count;
};

export const inventoryAdjustmentService = {
    async create(ingredientId: string, input: AdjustmentInput, actorId: string) {
        return prisma.$transaction(async tx => {
            await tx.$queryRaw`SELECT "id" FROM "Ingredient" WHERE "id" = ${ingredientId} FOR UPDATE`;
            const ingredient = await tx.ingredient.findFirst({ where: { id: ingredientId, deletedAt: null } });
            if (!ingredient) throw new HttpError(404, 'Không tìm thấy nguyên liệu.');
            const prior = await tx.stockCount.findUnique({ where: { code: prefix + input.requestId }, include: { items: true } });
            if (prior) {
                const note = parseNote(prior.note);
                if (prior.createdById !== actorId || prior.items.length !== 1 || prior.items[0]?.ingredientId !== ingredientId ||
                    note.batchId !== input.batchId || note.measuredQuantity !== new Prisma.Decimal(input.measuredQuantity).toString() ||
                    note.reason !== input.reason.trim()) throw new HttpError(409, 'Mã phiếu đã dùng với nội dung khác.');
                return { request: prior, replayed: true };
            }
            const batch = await tx.ingredientBatch.findFirst({ where: { id: input.batchId, ingredientId } });
            if (!batch) throw new HttpError(404, 'Không tìm thấy lô nguyên liệu.');
            const measured = new Prisma.Decimal(input.measuredQuantity);
            const delta = measured.sub(batch.quantityRemaining);
            if (delta.isZero()) throw new HttpError(400, 'Số lượng kiểm kê không có chênh lệch.');
            const target = ingredient.quantity.add(delta);
            if (target.lt(0)) throw new HttpError(409, 'Số lượng sau điều chỉnh không thể âm.');
            const note: AdjustmentNote = { batchId: batch.id, batchQuantityBefore: batch.quantityRemaining.toString(),
                measuredQuantity: measured.toString(), reason: input.reason.trim(), actorId };
            const request = await tx.stockCount.create({ data: {
                code: prefix + input.requestId, status: 'PENDING', createdById: actorId, note: JSON.stringify(note),
                items: { create: { ingredientId, systemQty: ingredient.quantity, actualQty: target,
                    varianceQty: delta, reason: input.reason.trim() } }
            }, include: { items: true } });
            return { request, replayed: false };
        });
    },

    async get(ingredientId: string, requestId: string) {
        return prisma.$transaction(tx => readRequest(tx, ingredientId, requestId));
    },

    async approve(ingredientId: string, requestId: string, actorId: string) {
        return prisma.$transaction(async tx => {
            await tx.$queryRaw`SELECT "id" FROM "Ingredient" WHERE "id" = ${ingredientId} FOR UPDATE`;
            const count = await readRequest(tx, ingredientId, requestId);
            await tx.$queryRaw`SELECT "id" FROM "StockCount" WHERE "id" = ${count.id} FOR UPDATE`;
            const current = await readRequest(tx, ingredientId, requestId);
            if (current.status === 'COMPLETED') return { request: current, replayed: true };
            if (current.status !== 'PENDING') throw new HttpError(409, 'Phiếu không còn chờ duyệt.');
            const item = current.items[0]!;
            const note = parseNote(current.note);
            const [ingredient, batch] = await Promise.all([
                tx.ingredient.findUnique({ where: { id: ingredientId } }),
                tx.ingredientBatch.findFirst({ where: { id: note.batchId, ingredientId } })
            ]);
            if (!ingredient || !batch) throw new HttpError(404, 'Không tìm thấy nguyên liệu hoặc lô.');
            if (!ingredient.quantity.equals(item.systemQty) ||
                !batch.quantityRemaining.equals(new Prisma.Decimal(note.batchQuantityBefore))) {
                throw new HttpError(409, 'Tồn kho đã thay đổi; cần kiểm kê lại trước khi duyệt.');
            }
            const delta = item.varianceQty;
            if (!item.actualQty.sub(item.systemQty).equals(delta) ||
                !new Prisma.Decimal(note.measuredQuantity).sub(batch.quantityRemaining).equals(delta) ||
                item.actualQty.lt(ingredient.reserved) || item.actualQty.lt(0) ||
                batch.quantityRemaining.add(delta).lt(0)) {
                throw new HttpError(409, 'Điều chỉnh không hợp lệ hoặc xâm phạm tồn đã giữ chỗ.');
            }
            await tx.ingredientBatch.update({ where: { id: batch.id }, data: { quantityRemaining: { increment: delta } } });
            await tx.ingredient.update({ where: { id: ingredientId },
                data: { quantity: { increment: delta }, rowVersion: { increment: 1 } } });
            await tx.inventoryTransaction.create({ data: {
                ingredientId, batchId: batch.id, type: 'ADJUSTMENT', quantity: delta,
                unitCost: batch.unitCost, totalCost: delta.mul(batch.unitCost).toDecimalPlaces(2),
                referenceType: 'StockCount', referenceId: current.id,
                idempotencyKey: `ingredient-adjust:${current.id}`, performedBy: actorId, reason: note.reason
            } });
            const updated = await tx.stockCount.update({ where: { id: current.id },
                data: { status: 'COMPLETED', approvedById: actorId, approvedAt: new Date() }, include: { items: true } });
            return { request: updated, replayed: false };
        });
    },

    async reject(ingredientId: string, requestId: string, actorId: string) {
        return prisma.$transaction(async tx => {
            await tx.$queryRaw`SELECT "id" FROM "Ingredient" WHERE "id" = ${ingredientId} FOR UPDATE`;
            const count = await readRequest(tx, ingredientId, requestId);
            await tx.$queryRaw`SELECT "id" FROM "StockCount" WHERE "id" = ${count.id} FOR UPDATE`;
            if (count.status !== 'PENDING') throw new HttpError(409, 'Chỉ phiếu đang chờ duyệt mới có thể từ chối.');
            const note = parseNote(count.note);
            return tx.stockCount.update({ where: { id: count.id }, data: { status: 'CANCELLED',
                note: JSON.stringify({ ...note, rejectedBy: actorId, rejectedAt: new Date().toISOString() }) },
                include: { items: true } });
        });
    }
};
