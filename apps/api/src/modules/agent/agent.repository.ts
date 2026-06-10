import { type Prisma } from '@cafe-project/database';
import { prisma } from '../../common/prisma';
import { ACTIVE_PURCHASE_REQUEST_MESSAGE, ACTIVE_PURCHASE_REQUEST_STATUSES } from '../purchase/purchase.repository';

const inventoryInclude = {
    product: {
        include: {
            category: true,
            supplierProducts: {
                include: { supplier: true },
                orderBy: [{ isPreferred: 'desc' }, { price: 'asc' }, { leadTimeDays: 'asc' }]
            }
        }
    }
} satisfies Prisma.InventoryInclude;
const logInclude = { creator: { select: { id: true, name: true, email: true } } } satisfies Prisma.AgentLogInclude;

export type AgentInventoryRecord = Prisma.InventoryGetPayload<{ include: typeof inventoryInclude }>;

export const agentRepository = {
    async findInventories(productIds?: string[]): Promise<AgentInventoryRecord[]> {
        return prisma.inventory.findMany({ where: { ...(productIds?.length ? { productId: { in: productIds } } : {}), product: { isActive: true } }, include: inventoryInclude });
    },
    async hasOpenPurchaseRequest(productId: string, inventoryId: string): Promise<boolean> {
        const item = await prisma.purchaseRequestItem.findFirst({ where: { productId, inventoryId, request: { status: { in: [...ACTIVE_PURCHASE_REQUEST_STATUSES] } } }, select: { id: true } });
        return Boolean(item);
    },
    async createAiPurchaseRequest(inventory: AgentInventoryRecord, supplierProduct: AgentInventoryRecord['product']['supplierProducts'][number], quantity: number, reasoning: string, userId: string) {
        return prisma.$transaction(async (tx) => {
            const activeItem = await tx.purchaseRequestItem.findFirst({
                where: { productId: inventory.productId, inventoryId: inventory.id, request: { status: { in: [...ACTIVE_PURCHASE_REQUEST_STATUSES] } } },
                select: { id: true }
            });
            if (activeItem) throw new Error(ACTIVE_PURCHASE_REQUEST_MESSAGE);

            const request = await tx.purchaseRequest.create({
                data: {
                    requestNumber: `AI-PR-${Date.now()}-${inventory.productId.slice(-4)}`,
                    supplierId: supplierProduct.supplierId,
                    requestedBy: userId,
                    aiGenerated: true,
                    notes: reasoning,
                    totalAmount: Number(supplierProduct.price) * quantity,
                    items: { create: { inventoryId: inventory.id, productId: inventory.productId, quantity, unitPrice: supplierProduct.price, notes: reasoning } }
                },
                include: { supplier: true, items: { include: { product: true, inventory: true } } }
            });
            return request;
        });
    },
    async createLog(data: Prisma.AgentLogCreateInput) { return prisma.agentLog.create({ data, include: logInclude }); },
    async findLogs() { return prisma.agentLog.findMany({ include: logInclude, orderBy: { triggered_at: 'desc' }, take: 100 }); }
};
