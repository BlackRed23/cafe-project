import { InventoryTransactionType, PurchaseRequestStatus, type Prisma } from '@cafe-project/database';
import { prisma } from '../../common/prisma';
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
    async supplierExists(supplierId: string): Promise<boolean> { return Boolean(await prisma.supplier.findUnique({ where: { id: supplierId }, select: { id: true } })); },
    async inventoriesByIds(ids: string[]) { return prisma.inventory.findMany({ where: { id: { in: ids }, product: { isActive: true } }, include: { product: true } }); },
    async hasActiveRequestForInventory(inventoryId: string): Promise<boolean> {
        const item = await prisma.purchaseRequestItem.findFirst({
            where: { inventoryId, request: { status: { in: [...ACTIVE_PURCHASE_REQUEST_STATUSES] } } },
            select: { id: true }
        });
        return Boolean(item);
    },
    async create(input: CreatePurchaseRequestInput, userId: string, requestNumber: string): Promise<PurchaseRequestRecord> {
        return prisma.$transaction(async (tx) => {
            const inventories = await tx.inventory.findMany({ where: { id: { in: input.items.map((item) => item.inventoryId) }, product: { isActive: true } }, include: { product: true } });
            const inventoryById = new Map(inventories.map((inventory) => [inventory.id, inventory]));
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
                    items: { create: input.items.map((item) => {
                        const inventory = inventoryById.get(item.inventoryId)!;
                        return { inventoryId: inventory.id, productId: inventory.productId, quantity: item.quantity, unitPrice: item.unitPrice ?? 0, notes: item.notes };
                    }) }
                },
                include: purchaseInclude
            });
        });
    },
    async updateStatus(id: string, data: Prisma.PurchaseRequestUpdateInput): Promise<PurchaseRequestRecord> { return prisma.purchaseRequest.update({ where: { id }, data, include: purchaseInclude }); },
    async receive(request: PurchaseRequestRecord, input: ReceivePurchaseRequestInput, userId: string): Promise<PurchaseRequestRecord> {
        return prisma.$transaction(async (tx) => {
            const currentRequest = await tx.purchaseRequest.findUnique({ where: { id: request.id }, select: { status: true } });
            if (currentRequest?.status !== PurchaseRequestStatus.SENT) throw new Error('Cannot receive before request is sent.');

            for (const receiveItem of input.items) {
                const requestItem = request.items.find((item) => item.id === receiveItem.purchaseRequestItemId);
                if (!requestItem) throw new Error('Purchase request item not found.');
                const inventory = await tx.inventory.findUnique({ where: { id: requestItem.inventoryId } });
                if (!inventory) throw new Error('Inventory not found.');
                await tx.purchaseRequestItem.update({ where: { id: requestItem.id }, data: { quantityReceived: receiveItem.receivedQuantity } });
                await tx.inventory.update({ where: { id: inventory.id }, data: { quantity: { increment: receiveItem.receivedQuantity } } });
                await tx.inventoryTransaction.create({ data: { productId: requestItem.productId, userId, type: InventoryTransactionType.IMPORT, quantity: receiveItem.receivedQuantity, reason: input.note ?? `Import from purchase request ${request.requestNumber}` } });
            }
            return tx.purchaseRequest.update({ where: { id: request.id }, data: { status: PurchaseRequestStatus.RECEIVED, receivedAt: new Date() }, include: purchaseInclude });
        });
    },
    async delete(id: string): Promise<PurchaseRequestRecord> { return prisma.purchaseRequest.delete({ where: { id }, include: purchaseInclude }); }
};
