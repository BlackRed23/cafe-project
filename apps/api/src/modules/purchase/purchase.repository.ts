import { createHash } from 'node:crypto';
import { PurchaseRequestStatus, Prisma, prisma } from '@cafe-project/database';
import type { CreatePurchaseRequestInput, PurchaseRequestFiltersInput, ReceivePurchaseRequestInput } from './purchase.validator';
import { duplicateReceiptItemIndex } from './purchase.receipt-validation';
import { HttpError } from '../../common/http-error';
import { supplierExpiryInstant } from '../../common/ingredient-policy';
import { stockQuantity, requireWholePieces } from '../inventory/inventory-quantity';
import { lockStock } from '../order/order-stock';

export const purchaseInclude = {
    supplier: { include: { ingredients: true } }, requester: { select: { id: true, name: true, email: true } },
    approver: { select: { id: true, name: true, email: true } },
    items: { include: { ingredient: { include: { category: true } } } }, receipts: true
} satisfies Prisma.PurchaseRequestInclude;
export type PurchaseRequestRecord = Prisma.PurchaseRequestGetPayload<{ include: typeof purchaseInclude }>;
export const ACTIVE_PURCHASE_REQUEST_STATUSES = ['PENDING', 'APPROVED', 'SENT'] satisfies PurchaseRequestStatus[];
export const ACTIVE_PURCHASE_REQUEST_MESSAGE = 'Nguyên liệu này đã có yêu cầu nhập hàng đang xử lý.';
const hash = (s: string) => createHash('sha256').update(s).digest('hex');
const validInt = (x: number) => Number.isInteger(x) && x > 0 && x <= 2147483647;
const money = (value: Prisma.Decimal | number) => {
    const result = new Prisma.Decimal(value);
    if (!result.isFinite() || result.lt(0) || result.gt('9999999999.99') || result.decimalPlaces() > 2) throw new HttpError(400, 'Giá/tổng tiền vượt Decimal(12,2).');
    return result;
};

export const purchaseRepository = {
    async findMany(filters: PurchaseRequestFiltersInput = {}): Promise<PurchaseRequestRecord[]> {
        return prisma.purchaseRequest.findMany({ where: { ...(filters.status ? { status: filters.status } : {}), ...(filters.supplierId ? { supplierId: filters.supplierId } : {}),
            ...(filters.aiGenerated !== undefined ? { aiGenerated: filters.aiGenerated } : {}) }, include: purchaseInclude, orderBy: { createdAt: 'desc' } });
    },
    async findById(id: string): Promise<PurchaseRequestRecord | null> { return prisma.purchaseRequest.findUnique({ where: { id }, include: purchaseInclude }); },
    async supplierExists(id: string) { return Boolean(await prisma.supplier.findFirst({ where: { id, status: 'ACTIVE', deletedAt: null } })); },
    async hasActiveRequestForInventory(ingredientId: string) {
        return Boolean(await prisma.purchaseRequestItem.findFirst({ where: { ingredientId, request: { status: { in: ACTIVE_PURCHASE_REQUEST_STATUSES } } } }));
    },
    async create(input: CreatePurchaseRequestInput, userId: string, requestNumber: string): Promise<PurchaseRequestRecord> {
        if (!input.items.length || new Set(input.items.map(i => i.inventoryId)).size !== input.items.length || input.items.some(i => !validInt(i.quantity))) throw new HttpError(400, 'Nguyên liệu trùng hoặc số lượng không hợp lệ.');
        return prisma.$transaction(async tx => {
            await lockStock(tx, input.items.map(i => i.inventoryId));
            const supplier = await tx.supplier.findFirst({ where: { id: input.supplierId, status: 'ACTIVE', deletedAt: null } });
            if (!supplier) throw new HttpError(409, 'Nhà cung cấp không hoạt động.');
            if (await tx.purchaseRequestItem.findFirst({ where: { ingredientId: { in: input.items.map(i => i.inventoryId) }, request: { status: { in: ACTIVE_PURCHASE_REQUEST_STATUSES } } } })) throw new HttpError(409, ACTIVE_PURCHASE_REQUEST_MESSAGE);
            const data: Prisma.PurchaseRequestItemUncheckedCreateWithoutRequestInput[] = [];
            let total = new Prisma.Decimal(0);
            for (const item of input.items) {
                const link = await tx.supplierIngredient.findUnique({ where: { supplierId_ingredientId: { supplierId: input.supplierId, ingredientId: item.inventoryId } }, include: { ingredient: true } });
                if (!link || !link.ingredient.isActive || link.ingredient.deletedAt || link.conversionTargetUnit !== link.ingredient.baseUnit || !link.conversionQuantity.gt(0)) throw new HttpError(409, 'Nhà cung cấp/quy cách nguyên liệu không hợp lệ.');
                // Agent contract: integer BASE quantities, price per BASE unit, not pack counts.
                const unitPrice = money(item.unitPrice ?? link.pricePerBaseUnit);
                total = money(total.plus(unitPrice.times(item.quantity)));
                data.push({ ingredientId: item.inventoryId, quantity: item.quantity, unitPrice,
                    notes: JSON.stringify({ schema: 'api-purchase-v1', baseUnit: link.ingredient.baseUnit, purchaseUnit: link.purchaseUnit,
                        conversionQuantity: link.conversionQuantity.toString(), note: item.notes ?? null }) });
            }
            return tx.purchaseRequest.create({ data: { requestNumber, supplierId: input.supplierId, requestedBy: userId, notes: input.notes,
                aiGenerated: input.aiGenerated, totalAmount: total, status: 'PENDING', items: { create: data } }, include: purchaseInclude });
        });
    },
    async updateStatus(id: string, data: Prisma.PurchaseRequestUpdateInput, expected: PurchaseRequestStatus): Promise<PurchaseRequestRecord> {
        return prisma.$transaction(async tx => {
            await tx.$queryRaw`SELECT "id" FROM "PurchaseRequest" WHERE "id" = ${id} FOR UPDATE`;
            const current = await tx.purchaseRequest.findUnique({ where: { id } });
            if (!current || current.status !== expected) throw new HttpError(409, 'Trạng thái yêu cầu đã thay đổi.');
            if (data.status === 'REJECTED' && await tx.purchaseRequestItem.count({ where: { requestId: id, quantityReceived: { gt: 0 } } })) throw new HttpError(409, 'Không hủy yêu cầu đã nhận một phần.');
            return tx.purchaseRequest.update({ where: { id }, data, include: purchaseInclude });
        });
    },
    async receive(request: PurchaseRequestRecord, input: ReceivePurchaseRequestInput, userId: string): Promise<PurchaseRequestRecord> {
        if (!input.idempotencyKey || !input.items.length || duplicateReceiptItemIndex(input.items) !== -1 || input.items.some(i => !validInt(i.receivedQuantity))) throw new HttpError(400, 'Receipt cần key, số lượng dương và nguyên liệu không trùng.');
        const key = `purchase-receipt:${hash(input.idempotencyKey)}`;
        const fingerprint = hash(JSON.stringify({ requestId: request.id, userId, items: input.items, note: input.note ?? null }));
        const receiptNote = JSON.stringify({ schema: 'api-receipt-v1', fingerprint, note: input.note ?? null });
        return prisma.$transaction(async tx => {
            await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(${key}, 0))::text`;
            await tx.$queryRaw`SELECT "id" FROM "PurchaseRequest" WHERE "id" = ${request.id} FOR UPDATE`;
            const prior = await tx.goodsReceipt.findUnique({ where: { idempotencyKey: key } });
            if (prior) {
                if (prior.purchaseRequestId !== request.id || prior.note !== receiptNote || prior.receivedBy !== userId || prior.status !== 'CONFIRMED') throw new HttpError(409, 'Receipt key đã được dùng cho yêu cầu khác.');
                const updated = await tx.purchaseRequest.findUnique({ where: { id: request.id }, include: purchaseInclude });
                if (!updated) throw new HttpError(404, 'Purchase request not found.');
                return updated;
            }
            const current = await tx.purchaseRequest.findUnique({ where: { id: request.id }, include: purchaseInclude });
            if (!current || current.status !== 'SENT') throw new HttpError(409, 'Chỉ nhận hàng cho yêu cầu SENT.');
            if (current.supplier.status !== 'ACTIVE' || current.supplier.deletedAt) throw new HttpError(409, 'Nhà cung cấp không hoạt động.');
            const selected = input.items.map(i => {
                const item = current.items.find(item => item.id === i.purchaseRequestItemId);
                if (!item || i.receivedQuantity > item.quantity - item.quantityReceived) throw new HttpError(409, 'Nhận vượt số lượng còn lại hoặc sai dòng yêu cầu.');
                if (!i.batches?.length || i.batches.reduce((s, b) => s + b.quantity, 0) !== i.receivedQuantity || i.batches.some(b => !validInt(b.quantity))) throw new HttpError(400, 'Cần lô có hạn, tổng lượng lô đúng số thực nhận theo đơn vị gốc.');
                return { input: i, item };
            });
            await lockStock(tx, selected.map(s => s.item.ingredientId));
            const receipt = await tx.goodsReceipt.create({ data: { receiptNumber: `GR-${hash(key).slice(0, 32)}`, purchaseRequestId: current.id,
                status: 'CONFIRMED', receivedBy: userId, idempotencyKey: key, note: receiptNote } });
            let receivedAmount = new Prisma.Decimal(0);
            for (const selectedItem of selected) {
                const { item, input: received } = selectedItem;
                const ingredient = await tx.ingredient.findUnique({ where: { id: item.ingredientId }, include: { batches: true } });
                const link = await tx.supplierIngredient.findUnique({ where: { supplierId_ingredientId: { supplierId: current.supplierId, ingredientId: item.ingredientId } } });
                if (!ingredient?.isActive || ingredient.deletedAt || !link || link.conversionTargetUnit !== ingredient.baseUnit) throw new HttpError(409, 'Nguyên liệu/quy cách đã thay đổi.');
                try {
                    const snapshot: unknown = JSON.parse(item.notes ?? '');
                    if (snapshot && typeof snapshot === 'object' && 'schema' in snapshot && snapshot.schema === 'api-purchase-v1' &&
                        'baseUnit' in snapshot && snapshot.baseUnit !== ingredient.baseUnit) throw new HttpError(409, 'Đơn vị gốc đã đổi sau khi đặt hàng.');
                } catch (error) { if (error instanceof HttpError) throw error; }
                if (!ingredient.quantity.eq(ingredient.batches.reduce((s,b) => s.plus(b.quantityRemaining), new Prisma.Decimal(0))) || ingredient.reserved.lt(0) || ingredient.quantity.lt(ingredient.reserved)) throw new HttpError(409, 'Tồn kho cần đối soát trước khi nhận.');
                const quantity = stockQuantity(received.receivedQuantity); requireWholePieces(quantity, ingredient.baseUnit);
                const unitPrice = item.unitPrice;
                if (!unitPrice) throw new HttpError(409, 'Thiếu giá chụp trong yêu cầu mua.');
                for (let index = 0; index < received.batches!.length; index++) {
                    const entry = received.batches![index]!;
                    let expiry: Date;
                    try { expiry = /^\d{4}-\d{2}-\d{2}$/.test(entry.expirationDate) ? supplierExpiryInstant(entry.expirationDate) : new Date(entry.expirationDate); }
                    catch { throw new HttpError(400, 'Ngày hết hạn không hợp lệ.'); }
                    if (!Number.isFinite(expiry.getTime()) || expiry.getTime() <= Date.now()) throw new HttpError(400, 'Lô phải còn hạn.');
                    const batchCode = entry.batchCode?.trim() || `${receipt.receiptNumber}-${item.id}-${index}`;
                    if (await tx.ingredientBatch.findUnique({ where: { ingredientId_batchCode: { ingredientId: item.ingredientId, batchCode } } })) throw new HttpError(409, 'Mã lô đã tồn tại; không gộp receipt vào lô cũ.');
                    const amount = stockQuantity(entry.quantity);
                    const batch = await tx.ingredientBatch.create({ data: { ingredientId: item.ingredientId, batchCode, quantityInitial: amount, quantityRemaining: amount,
                        unitCost: unitPrice, expirationDate: expiry, supplierId: current.supplierId, goodsReceiptId: receipt.id, purchaseRequestItemId: item.id,
                        receivedQty: amount, receivedUnit: ingredient.baseUnit, note: input.note } });
                    await tx.inventoryTransaction.create({ data: { ingredientId: item.ingredientId, batchId: batch.id, type: 'IMPORT', quantity: amount,
                        unitCost: unitPrice, performedBy: userId, reason: input.note, referenceType: 'GOODS_RECEIPT', referenceId: receipt.id,
                        idempotencyKey: `receipt:${receipt.id}:${item.id}:${index}` } });
                }
                await tx.ingredient.update({ where: { id: item.ingredientId }, data: { quantity: stockQuantity(ingredient.quantity.plus(quantity)), rowVersion: { increment: 1 } } });
                await tx.purchaseRequestItem.update({ where: { id: item.id }, data: { quantityReceived: { increment: received.receivedQuantity } } });
                receivedAmount = money(receivedAmount.plus(unitPrice.times(received.receivedQuantity)));
            }
            const all = await tx.purchaseRequestItem.findMany({ where: { requestId: current.id } });
            return tx.purchaseRequest.update({ where: { id: current.id }, data: { status: all.every(i => i.quantityReceived === i.quantity) ? 'RECEIVED' : 'SENT',
                receivedAt: new Date(), receivedAmount: money(current.receivedAmount.plus(receivedAmount)) }, include: purchaseInclude });
        });
    },
    async delete(id: string): Promise<PurchaseRequestRecord> {
        return prisma.$transaction(async tx => {
            await tx.$queryRaw`SELECT "id" FROM "PurchaseRequest" WHERE "id" = ${id} FOR UPDATE`;
            const current = await tx.purchaseRequest.findUnique({ where: { id }, include: purchaseInclude });
            if (!current || !['PENDING', 'REJECTED'].includes(current.status) || current.receipts.length || current.items.some(i => i.quantityReceived > 0)) throw new HttpError(409, 'Không xóa yêu cầu đã xử lý/nhận hàng.');
            await tx.purchaseRequestItem.deleteMany({ where: { requestId: id } });
            await tx.purchaseRequest.delete({ where: { id } }); return current;
        });
    }
};
