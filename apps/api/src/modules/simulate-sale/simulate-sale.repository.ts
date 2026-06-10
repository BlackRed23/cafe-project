import { InventoryTransactionType, type Prisma } from '@cafe-project/database';
import { prisma } from '../../common/prisma';

const inventoryInclude = { product: true } satisfies Prisma.InventoryInclude;
export type SaleInventoryRecord = Prisma.InventoryGetPayload<{ include: typeof inventoryInclude }>;
export type SalePlan = { inventory: SaleInventoryRecord; decrease: number };

export const simulateSaleRepository = {
    async findInventories(): Promise<SaleInventoryRecord[]> { return prisma.inventory.findMany({ where: { product: { isActive: true } }, include: inventoryInclude }); },
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