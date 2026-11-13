import { createHash } from 'node:crypto';
import { InventoryTransactionType, Prisma, prisma } from '@cafe-project/database';
import { HttpError } from '../../common/http-error';
import { supplierExpiryInstant } from '../../common/ingredient-policy';
import { requireWholePieces, stockQuantity } from './inventory-quantity';

const inventoryInclude = {
    category: true,
    batches: { orderBy: [{ expirationDate: 'asc' }, { receivedAt: 'asc' }, { id: 'asc' }] }
} satisfies Prisma.IngredientInclude;
const transactionInclude = {
    ingredient: { select: { name: true, sku: true } },
    performedByUser: { select: { id: true, name: true, email: true } }
} satisfies Prisma.InventoryTransactionInclude;

export type InventoryRecord = Prisma.IngredientGetPayload<{ include: typeof inventoryInclude }>;
export type InventoryTransactionRecord = Prisma.InventoryTransactionGetPayload<{ include: typeof transactionInclude }>;
export type ImportStockOptions = { idempotencyKey?: string; supplierIngredientId?: string; purchaseQuantity?: number };

const mutationKey = (kind: string, key?: string): string | undefined => key
    ? `inventory:${kind}:${createHash('sha256').update(key).digest('hex')}` : undefined;

const expiryDate = (value?: string): Date => {
    let expiry: Date;
    try { expiry = value && /^\d{4}-\d{2}-\d{2}$/.test(value) ? supplierExpiryInstant(value) : new Date(value ?? ''); }
    catch { throw new HttpError(400, 'Ngày hết hạn không hợp lệ.'); }
    if (!Number.isFinite(expiry.getTime()) || expiry.getTime() <= Date.now()) throw new HttpError(400, 'Lô nhập cần hạn sử dụng trong tương lai.');
    return expiry;
};

const lockedIngredient = async (tx: Prisma.TransactionClient, id: string) => {
    await tx.$queryRaw`SELECT "id" FROM "Ingredient" WHERE "id" = ${id} FOR UPDATE`;
    const current = await tx.ingredient.findUnique({ where: { id } });
    if (!current || !current.isActive || current.deletedAt) throw new HttpError(404, 'Không tìm thấy nguyên liệu đang hoạt động.');
    if (current.reserved.isNegative() || current.quantity.lessThan(current.reserved)) throw new HttpError(409, 'Tồn kho cần đối soát trước khi thay đổi.');
    const balances = await tx.ingredientBatch.aggregate({ where: { ingredientId: id }, _sum: { quantityRemaining: true } });
    if (!current.quantity.equals(balances._sum.quantityRemaining ?? 0)) throw new HttpError(409, 'Tổng tồn lô lệch tồn nguyên liệu; cần đối soát.');
    return current;
};

const readUpdated = async (tx: Prisma.TransactionClient, id: string): Promise<InventoryRecord> => {
    const row = await tx.ingredient.findUnique({ where: { id }, include: inventoryInclude });
    if (!row) throw new HttpError(404, 'Không tìm thấy nguyên liệu.');
    return row;
};

export const inventoryRepository = {
    async findMany(): Promise<InventoryRecord[]> {
        return prisma.ingredient.findMany({ where: { isActive: true, deletedAt: null }, include: inventoryInclude, orderBy: { updatedAt: 'desc' } });
    },
    async findById(id: string): Promise<InventoryRecord | null> {
        return prisma.ingredient.findFirst({ where: { id, isActive: true, deletedAt: null }, include: inventoryInclude });
    },
    async findTransactions(): Promise<InventoryTransactionRecord[]> {
        return prisma.inventoryTransaction.findMany({ include: transactionInclude, orderBy: { createdAt: 'desc' } });
    },
    /** Standalone receipts only. Purchase receipts must go through GoodsReceipt. */
    async importStock(inventory: InventoryRecord, inputQuantity: Prisma.Decimal | number, note: string | null, userId: string,
        batchCode?: string, expirationDate?: string, options: ImportStockOptions = {}): Promise<InventoryRecord> {
        const quantity = stockQuantity(inputQuantity);
        const expiry = expiryDate(expirationDate);
        const key = mutationKey('import', options.idempotencyKey);
        const code = batchCode?.trim() || (key ? `manual-${key.slice(-32)}` : undefined);
        if (!code) throw new HttpError(400, 'Cần mã lô hoặc idempotencyKey để tránh nhập trùng.');
        return prisma.$transaction(async (tx: Prisma.TransactionClient) => {
            const current = await lockedIngredient(tx, inventory.id);
            requireWholePieces(quantity, current.baseUnit);
            let supplierId: string | undefined;
            let unitCost = current.costPerBaseUnit;
            let receivedUnit = current.baseUnit;
            let receivedQty = quantity;
            if (options.supplierIngredientId) {
                const link = await tx.supplierIngredient.findUnique({ where: { id: options.supplierIngredientId }, include: { supplier: true } });
                if (!link || link.ingredientId !== current.id || link.supplier.deletedAt || link.supplier.status !== 'ACTIVE' ||
                    link.conversionTargetUnit !== current.baseUnit || !link.conversionQuantity.greaterThan(0)) {
                    throw new HttpError(400, 'Quy cách nhà cung cấp không hợp lệ cho nguyên liệu.');
                }
                if (options.purchaseQuantity !== undefined) {
                    receivedQty = stockQuantity(options.purchaseQuantity);
                    if (!receivedQty.times(link.conversionQuantity).equals(quantity)) throw new HttpError(409, 'Quy cách nhập đã thay đổi, vui lòng thử lại.');
                    receivedUnit = link.purchaseUnit;
                }
                supplierId = link.supplierId;
                unitCost = link.pricePerBaseUnit;
            }
            if (unitCost.isNegative()) throw new HttpError(409, 'Giá vốn nguyên liệu không hợp lệ.');
            const existing = await tx.ingredientBatch.findUnique({ where: { ingredientId_batchCode: { ingredientId: current.id, batchCode: code } } });
            const prior = key ? await tx.inventoryTransaction.findUnique({ where: { idempotencyKey: key } }) : null;
            if (existing || prior) {
                if (!existing || !prior || prior.ingredientId !== current.id || prior.batchId !== existing.id ||
                    prior.type !== InventoryTransactionType.IMPORT || !prior.quantity.equals(quantity) || prior.reason !== note ||
                    prior.performedBy !== userId || existing.goodsReceiptId || existing.purchaseRequestItemId ||
                    existing.supplierId !== (supplierId ?? null) || existing.receivedUnit !== receivedUnit || !existing.receivedQty?.equals(receivedQty) ||
                    existing.expirationDate?.getTime() !== expiry.getTime()) throw new HttpError(409, 'Mã lô hoặc idempotencyKey đã được sử dụng.');
                return readUpdated(tx, current.id);
            }
            const next = stockQuantity(current.quantity.plus(quantity));
            const batch = await tx.ingredientBatch.create({ data: {
                ingredientId: current.id, batchCode: code, quantityInitial: quantity, quantityRemaining: quantity,
                expirationDate: expiry, supplierId, unitCost, receivedQty, receivedUnit, note
            } });
            await tx.ingredient.update({ where: { id: current.id }, data: { quantity: next, rowVersion: { increment: 1 } } });
            await tx.inventoryTransaction.create({ data: {
                ingredientId: current.id, batchId: batch.id, performedBy: userId, type: InventoryTransactionType.IMPORT,
                quantity, unitCost, reason: note, referenceType: 'MANUAL_IMPORT', referenceId: batch.id, idempotencyKey: key
            } });
            return readUpdated(tx, current.id);
        });
    },
    async adjustStock(inventory: InventoryRecord, inputQuantity: number, note: string | null, userId: string, batchId?: string, idempotencyKey?: string): Promise<InventoryRecord> {
        const quantity = stockQuantity(inputQuantity, true);
        if (!batchId) throw new HttpError(409, 'Cần chọn lô để điều chỉnh.');
        const key = mutationKey('adjust', idempotencyKey);
        return prisma.$transaction(async (tx: Prisma.TransactionClient) => {
            const current = await lockedIngredient(tx, inventory.id);
            requireWholePieces(quantity, current.baseUnit);
            const prior = key ? await tx.inventoryTransaction.findUnique({ where: { idempotencyKey: key } }) : null;
            if (prior) {
                if (prior.ingredientId !== current.id || prior.batchId !== batchId || prior.type !== InventoryTransactionType.ADJUSTMENT ||
                    !prior.quantity.equals(quantity) || prior.reason !== note || prior.performedBy !== userId) throw new HttpError(409, 'idempotencyKey đã được sử dụng cho yêu cầu khác.');
                return readUpdated(tx, current.id);
            }
            const batch = await tx.ingredientBatch.findFirst({ where: { id: batchId, ingredientId: current.id } });
            if (!batch) throw new HttpError(400, 'Lô không thuộc nguyên liệu cần điều chỉnh.');
            if (!batch.expirationDate || batch.expirationDate.getTime() <= Date.now() || batch.receivedAt.getTime() > Date.now()) throw new HttpError(409, 'Lô hết hạn hoặc thiếu hạn; cần đối soát riêng.');
            const next = stockQuantity(current.quantity.plus(quantity), false, true);
            const nextBatch = stockQuantity(batch.quantityRemaining.plus(quantity), false, true);
            if (next.lessThan(current.reserved)) throw new HttpError(409, 'Điều chỉnh vượt tồn khả dụng.');
            const changed = await tx.ingredientBatch.updateMany({
                where: { id: batch.id, ingredientId: current.id, quantityRemaining: batch.quantityRemaining },
                data: { quantityRemaining: nextBatch }
            });
            if (changed.count !== 1) throw new HttpError(409, 'Lô đã thay đổi, vui lòng thử lại.');
            await tx.ingredient.update({ where: { id: current.id }, data: { quantity: next, rowVersion: { increment: 1 } } });
            await tx.inventoryTransaction.create({ data: {
                ingredientId: current.id, batchId: batch.id, performedBy: userId, type: InventoryTransactionType.ADJUSTMENT,
                quantity, reason: note, referenceType: 'MANUAL_ADJUSTMENT', referenceId: batch.id, idempotencyKey: key
            } });
            return readUpdated(tx, current.id);
        });
    },
    async updateThreshold(inventory: InventoryRecord, minThreshold: number): Promise<InventoryRecord> {
        const threshold = stockQuantity(minThreshold, false, true);
        return prisma.$transaction(async (tx: Prisma.TransactionClient) => {
            const current = await lockedIngredient(tx, inventory.id);
            requireWholePieces(threshold, current.baseUnit);
            return tx.ingredient.update({ where: { id: current.id }, data: { minThreshold: threshold, rowVersion: { increment: 1 } }, include: inventoryInclude });
        });
    }
};
