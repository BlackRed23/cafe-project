import { InventoryTransactionType, PurchaseRequestStatus, type Prisma } from '@cafe-project/database';
import { prisma } from '@cafe-project/database';
import type { CreatePurchaseRequestInput, PurchaseRequestFiltersInput, ReceivePurchaseRequestInput } from './purchase.validator';

const purchaseInclude = {
    supplier: { include: { products: true } },
    requester: { select: { id: true, name: true, email: true } },
    approver: { select: { id: true, name: true, email: true } },
    items: { include: { inventory: { include: { product: { include: { category: true } } } }, product: true } }
} satisfies Prisma.PurchaseRequestInclude;

export type PurchaseRequestRecord = Prisma.PurchaseRequestGetPayload<{ include: typeof purchaseInclude }>;
export const ACTIVE_PURCHASE_REQUEST_STATUSES = [
    PurchaseRequestStatus.PENDING,
    PurchaseRequestStatus.APPROVED,
    PurchaseRequestStatus.SENT
] as const;
export const ACTIVE_PURCHASE_REQUEST_MESSAGE = 'Sản phẩm này đã có yêu cầu nhập hàng đang xử lý.';

export const purchaseRepository = {
    async findMany(filters: PurchaseRequestFiltersInput = {}): Promise<PurchaseRequestRecord[]> {
        return prisma.purchaseRequest.findMany({
            where: { ...(filters.status ? { status: filters.status } : {}), ...(filters.supplierId ? { supplierId: filters.supplierId } : {}), ...(filters.aiGenerated !== undefined ? { aiGenerated: filters.aiGenerated } : {}) },
            include: purchaseInclude,
            orderBy: { createdAt: 'desc' }
        });
    },
    async findById(id: string): Promise<PurchaseRequestRecord | null> { return prisma.purchaseRequest.findUnique({ where: { id }, include: purchaseInclude }); },
    async supplierExists(supplierId: string): Promise<boolean> { return Boolean(await prisma.supplier.findFirst({ where: { id: supplierId, status: { not: 'INACTIVE' }, deletedAt: null }, select: { id: true } })); },
    async inventoriesByIds(ids: string[]) { return prisma.inventory.findMany({ where: { id: { in: ids }, product: { isActive: true } }, include: { product: true } }); },
    async hasActiveRequestForInventory(inventoryId: string): Promise<boolean> {
        const item = await prisma.purchaseRequestItem.findFirst({
            where: { inventoryId, request: { status: { in: [...ACTIVE_PURCHASE_REQUEST_STATUSES] } } },
            select: { id: true }
        });
        return Boolean(item);
    },
    async create(input: CreatePurchaseRequestInput, userId: string, requestNumber: string): Promise<PurchaseRequestRecord> {
        return prisma.$transaction(async (tx: Prisma.TransactionClient) => {
            const inventories = await tx.inventory.findMany({ where: { id: { in: input.items.map((item) => item.inventoryId) }, product: { isActive: true } }, include: { product: true } });
            const inventoryById = new Map(inventories.map((inventory: any) => [inventory.id, inventory]));
            const activeItem = await tx.purchaseRequestItem.findFirst({
                where: {
                    inventoryId: { in: input.items.map((item) => item.inventoryId) },
                    request: { status: { in: [...ACTIVE_PURCHASE_REQUEST_STATUSES] } }
                },
                select: { id: true }
            });
            if (activeItem) throw new Error(ACTIVE_PURCHASE_REQUEST_MESSAGE);
            let totalAmount = 0;
            for (const item of input.items) {
                const inventory = inventoryById.get(item.inventoryId);
                if (!inventory) throw new Error(`Inventory not found: ${item.inventoryId}`);
                totalAmount += item.quantity * (item.unitPrice ?? 0);
            }
            return tx.purchaseRequest.create({
                data: {
                    requestNumber,
                    supplierId: input.supplierId,
                    notes: input.notes,
                    aiGenerated: input.aiGenerated,
                    totalAmount,
                    requestedBy: userId,
                    status: PurchaseRequestStatus.PENDING,
                    items: {
                        create: input.items.map((item) => {
                            const inventory = inventoryById.get(item.inventoryId)!;
                            return { inventoryId: inventory.id, productId: inventory.productId, quantity: item.quantity, unitPrice: item.unitPrice ?? 0, notes: item.notes };
                        })
                    }
                },
                include: purchaseInclude
            });
        });
    },
    async updateStatus(id: string, data: Prisma.PurchaseRequestUpdateInput): Promise<PurchaseRequestRecord> { return prisma.purchaseRequest.update({ where: { id }, data, include: purchaseInclude }); },
    async receive(request: PurchaseRequestRecord, input: ReceivePurchaseRequestInput, userId: string): Promise<PurchaseRequestRecord> {
        let retries = 0;
        let lastError: any = null;

        while (retries < 3) {
            try {
                return await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
                    const currentRequest = await tx.purchaseRequest.findUnique({ where: { id: request.id }, select: { status: true, emailSentAt: true } });
                    if (currentRequest?.status === PurchaseRequestStatus.RECEIVED || currentRequest?.status === PurchaseRequestStatus.COMPLETED) {
                        throw new Error('Yêu cầu nhập hàng này đã được nhận đủ trước đó, không thể cộng kho lần nữa.');
                    }
                    if (currentRequest?.status !== PurchaseRequestStatus.SENT && !currentRequest?.emailSentAt) {
                        throw new Error('Chỉ có thể nhận hàng sau khi đã gửi email đặt hàng cho nhà cung cấp.');
                    }

                    let totalReceivedAmountToIncrement = 0;
                    const batchCounters: Record<string, number> = {};

                    for (const receiveItem of input.items) {
                        if (receiveItem.receivedQuantity <= 0) {
                            throw new Error('Số lượng thực nhận phải lớn hơn 0.');
                        }
                        const requestItem = request.items.find((item) => item.id === receiveItem.purchaseRequestItemId);
                        if (!requestItem) throw new Error('Purchase request item not found.');

                        totalReceivedAmountToIncrement += receiveItem.receivedQuantity * Number(requestItem.unitPrice || 0);

                        const currentQuantityReceived = requestItem.quantityReceived || 0;
                        const remaining = requestItem.quantity - currentQuantityReceived;

                        if (receiveItem.receivedQuantity > remaining) {
                            throw new Error('Số lượng nhận không được vượt quá số lượng còn lại của yêu cầu.');
                        }

                        const inventory = await tx.inventory.findUnique({ where: { id: requestItem.inventoryId } });
                        if (!inventory) throw new Error('Inventory not found.');

                        await tx.purchaseRequestItem.update({
                            where: { id: requestItem.id },
                            data: { quantityReceived: { increment: receiveItem.receivedQuantity } }
                        });

                        await tx.inventory.update({
                            where: { id: inventory.id },
                            data: { quantity: { increment: receiveItem.receivedQuantity } }
                        });

                        if (receiveItem.batches && receiveItem.batches.length > 0) {
                            for (const b of receiveItem.batches) {
                                let batchCode = b.batchCode;
                                if (!batchCode) {
                                    const dateStr = new Date().toISOString().slice(2, 10).replace(/-/g, '');
                                    const prefix = `BATCH_${dateStr}_`;

                                    if (batchCounters[inventory.id] === undefined) {
                                        const existingBatches = await tx.inventoryBatch.findMany({
                                            where: { inventoryId: inventory.id, batchCode: { startsWith: prefix } },
                                            select: { batchCode: true }
                                        });
                                        let maxNum = 0;
                                        for (const eb of existingBatches) {
                                            const parts = eb.batchCode.split('_');
                                            if (parts.length >= 3) {
                                                const num = parseInt(parts[2], 10);
                                                if (!isNaN(num)) maxNum = Math.max(maxNum, num);
                                            }
                                        }
                                        batchCounters[inventory.id] = maxNum + 1;
                                    } else {
                                        batchCounters[inventory.id]++;
                                    }

                                    const seqStr = String(batchCounters[inventory.id]).padStart(3, '0');
                                    batchCode = `${prefix}${seqStr}`;
                                }
                                const existingBatch = await tx.inventoryBatch.findFirst({
                                    where: { inventoryId: inventory.id, batchCode: batchCode }
                                });
                                let batchId = '';
                                if (existingBatch) {
                                    await tx.inventoryBatch.update({
                                        where: { id: existingBatch.id },
                                        data: { quantity: { increment: b.quantity } }
                                    });
                                    batchId = existingBatch.id;
                                } else {
                                    const newBatch = await tx.inventoryBatch.create({
                                        data: {
                                            inventoryId: inventory.id,
                                            batchCode: batchCode,
                                            quantity: b.quantity,
                                            expirationDate: new Date(b.expirationDate)
                                        }
                                    });
                                    batchId = newBatch.id;
                                }
                                await tx.inventoryTransaction.create({
                                    data: {
                                        productId: requestItem.productId,
                                        userId,
                                        type: InventoryTransactionType.IMPORT,
                                        quantity: b.quantity,
                                        reason: input.note ?? `Nhập lô ${batchCode} từ yêu cầu ${request.requestNumber}`,
                                        batchId: batchId
                                    }
                                });
                            }
                        } else {
                            await tx.inventoryTransaction.create({
                                data: {
                                    productId: requestItem.productId,
                                    userId,
                                    type: InventoryTransactionType.IMPORT,
                                    quantity: receiveItem.receivedQuantity,
                                    reason: input.note ?? `Nhập hàng từ yêu cầu ${request.requestNumber}`
                                }
                            });
                        }
                    }

                    // Check if all items are fully received
                    const allItems = await tx.purchaseRequestItem.findMany({ where: { requestId: request.id } });
                    let allItemsFullyReceived = true;
                    for (const item of allItems) {
                        if (item.quantityReceived < item.quantity) {
                            allItemsFullyReceived = false;
                            break;
                        }
                    }

                    const newStatus = allItemsFullyReceived ? PurchaseRequestStatus.RECEIVED : currentRequest?.status || PurchaseRequestStatus.SENT;

                    return tx.purchaseRequest.update({
                        where: { id: request.id },
                        data: { status: newStatus, receivedAt: new Date(), receivedAmount: { increment: totalReceivedAmountToIncrement } },
                        include: purchaseInclude
                    });
                });
            } catch (error: any) {
                lastError = error;
                // If it's a Prisma unique constraint violation error (P2002), retry
                if (error.code === 'P2002' || error.message?.includes('Unique constraint failed')) {
                    retries++;
                    if (retries >= 3) {
                        throw new Error(`Đã thử tạo mã lô 3 lần nhưng vẫn bị trùng. Vui lòng thử lại sau. (Lỗi: ${error.message})`);
                    }
                    // Wait a bit before retrying to avoid immediate collisions
                    await new Promise(res => setTimeout(res, 100 * retries));
                } else {
                    // For any other error, do not retry
                    throw error;
                }
            }
        }
        throw lastError;
    },
    async delete(id: string): Promise<PurchaseRequestRecord> { return prisma.purchaseRequest.delete({ where: { id }, include: purchaseInclude }); }
};
