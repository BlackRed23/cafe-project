import { InventoryTransactionType, type Prisma } from '@cafe-project/database';
import { prisma } from '../../common/prisma';
import { HttpError } from '../../common/http-error';

const inventoryInclude = { product: true } satisfies Prisma.InventoryInclude;
export type SaleInventoryRecord = Prisma.InventoryGetPayload<{ include: typeof inventoryInclude }>;
export type SalePlan = { inventory: SaleInventoryRecord; decrease: number };

export const simulateSaleRepository = {
    async findInventories(): Promise<SaleInventoryRecord[]> { return prisma.inventory.findMany({ where: { product: { isActive: true } }, include: inventoryInclude }); },
    async findInventoryByProductId(productId: string): Promise<SaleInventoryRecord | null> {
        return prisma.inventory.findUnique({ where: { productId }, include: inventoryInclude });
    },
    async applyProductSale(inventory: SaleInventoryRecord, quantity: number, note: string | null, userId: string) {
        return prisma.$transaction(async (tx) => {
            const current = await tx.inventory.findUnique({ where: { id: inventory.id }, include: inventoryInclude });
            if (!current) throw new HttpError(404, 'Inventory not found for selected product.');

            const previousQuantity = current.quantity;
            if (previousQuantity < quantity) {
                throw new HttpError(400, `Not enough inventory for ${current.product.name}. Current stock: ${previousQuantity}, requested: ${quantity}.`);
            }

            const newQuantity = previousQuantity - quantity;

            await tx.inventory.update({ where: { id: current.id }, data: { quantity: newQuantity } });
            await tx.inventoryTransaction.create({ data: { productId: current.productId, userId, type: InventoryTransactionType.SIMULATE_SALE, quantity: -quantity, reason: note ?? 'Simulate sale' } });

            return {
                productId: current.productId,
                inventoryId: current.id,
                productName: current.product.name,
                stockBefore: previousQuantity,
                stockAfter: newQuantity,
                minThreshold: current.minThreshold,
                decreasedQuantity: quantity
            };
        });
    },
    async applySale(plans: SalePlan[], note: string | null, userId: string) {
        return prisma.$transaction(async (tx) => {
            const affected = [];
            for (const plan of plans) {
                const previousQuantity = plan.inventory.quantity;
                const decreaseQuantity = Math.min(plan.decrease, previousQuantity);
                const newQuantity = previousQuantity - decreaseQuantity;
                await tx.inventory.update({ where: { id: plan.inventory.id }, data: { quantity: newQuantity } });
                await tx.inventoryTransaction.create({ data: { productId: plan.inventory.productId, userId, type: InventoryTransactionType.SIMULATE_SALE, quantity: -decreaseQuantity, reason: note ?? 'Simulate sale' } });
                affected.push({ productId: plan.inventory.productId, inventoryId: plan.inventory.id, productName: plan.inventory.product.name, previousQuantity, decreasedQuantity: decreaseQuantity, newQuantity });
            }
            return affected;
        });
    }
};
