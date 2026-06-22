import { InventoryTransactionType, type Prisma } from '@cafe-project/database';
import { prisma } from '../../common/prisma';
import { HttpError } from '../../common/http-error';

const inventoryInclude = { product: true } satisfies Prisma.InventoryInclude;
export type SaleInventoryRecord = Prisma.InventoryGetPayload<{ include: typeof inventoryInclude }>;
export type SalePlan = { inventory: SaleInventoryRecord; decrease: number };
const RESTORE_LOOKBACK_DAYS = 7;

const restoreMarker = (transactionId: string) => `[restore-of:${transactionId}]`;

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
            const transaction = await tx.inventoryTransaction.create({ data: { productId: current.productId, userId, type: InventoryTransactionType.SIMULATE_SALE, quantity: -quantity, reason: note ?? 'Simulate sale' } });

            return {
                productId: current.productId,
                inventoryId: current.id,
                transactionId: transaction.id,
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
                const transaction = await tx.inventoryTransaction.create({ data: { productId: plan.inventory.productId, userId, type: InventoryTransactionType.SIMULATE_SALE, quantity: -decreaseQuantity, reason: note ?? 'Simulate sale' } });
                affected.push({
                    productId: plan.inventory.productId,
                    inventoryId: plan.inventory.id,
                    transactionId: transaction.id,
                    productName: plan.inventory.product.name,
                    stockBefore: previousQuantity,
                    previousQuantity,
                    decreasedQuantity: decreaseQuantity,
                    stockAfter: newQuantity,
                    newQuantity
                });
            }
            return affected;
        });
    },
    async restoreSale(transactionId: string, userId: string) {
        return prisma.$transaction(async (tx) => {
            const originalTransaction = await tx.inventoryTransaction.findUnique({
                where: { id: transactionId },
                include: { product: true }
            });

            if (!originalTransaction) {
                throw new HttpError(404, 'Simulation transaction not found.');
            }

            if (originalTransaction.type !== InventoryTransactionType.SIMULATE_SALE || originalTransaction.quantity >= 0) {
                throw new HttpError(400, 'Transaction is not a valid simulate sale transaction.');
            }

            const marker = restoreMarker(originalTransaction.id);
            const existingRestore = await tx.inventoryTransaction.findFirst({
                where: {
                    productId: originalTransaction.productId,
                    type: InventoryTransactionType.ADJUSTMENT,
                    quantity: Math.abs(originalTransaction.quantity),
                    reason: { contains: marker }
                }
            });

            if (existingRestore) {
                throw new HttpError(409, 'Mô phỏng này đã được khôi phục trước đó.');
            }

            const inventory = await tx.inventory.findUnique({
                where: { productId: originalTransaction.productId },
                include: inventoryInclude
            });

            if (!inventory) {
                throw new HttpError(404, 'Inventory not found for simulation transaction.');
            }

            const restoredQuantity = Math.abs(originalTransaction.quantity);
            const stockBeforeRestore = inventory.quantity;
            const restoredStock = stockBeforeRestore + restoredQuantity;

            await tx.inventory.update({
                where: { id: inventory.id },
                data: { quantity: restoredStock }
            });

            const restoreTransaction = await tx.inventoryTransaction.create({
                data: {
                    productId: originalTransaction.productId,
                    userId,
                    type: InventoryTransactionType.ADJUSTMENT,
                    quantity: restoredQuantity,
                    reason: `Khôi phục mô phỏng bán ${marker}`
                }
            });

            return {
                transactionId: originalTransaction.id,
                restoreTransactionId: restoreTransaction.id,
                productId: inventory.productId,
                inventoryId: inventory.id,
                productName: inventory.product.name,
                decreasedQuantity: restoredQuantity,
                stockBeforeRestore,
                restoredStock,
                restored: true
            };
        });
    },
    async findPendingRestore(userId: string) {
        const createdAfter = new Date();
        createdAfter.setDate(createdAfter.getDate() - RESTORE_LOOKBACK_DAYS);

        const transactions = await prisma.inventoryTransaction.findMany({
            where: {
                userId,
                type: InventoryTransactionType.SIMULATE_SALE,
                quantity: { lt: 0 },
                createdAt: { gte: createdAfter }
            },
            include: { product: { include: { inventory: true } } },
            orderBy: { createdAt: 'desc' },
            take: 25
        });

        const pendingRestores = [];

        for (const transaction of transactions) {
            const marker = restoreMarker(transaction.id);
            const existingRestore = await prisma.inventoryTransaction.findFirst({
                where: {
                    productId: transaction.productId,
                    type: InventoryTransactionType.ADJUSTMENT,
                    quantity: Math.abs(transaction.quantity),
                    reason: { contains: marker }
                },
                select: { id: true }
            });

            if (!existingRestore) {
                const inventory = transaction.product.inventory;
                const decreasedQuantity = Math.abs(transaction.quantity);
                const stockAfter = inventory?.quantity;

                pendingRestores.push({
                    transactionId: transaction.id,
                    inventoryId: inventory?.id ?? '',
                    productId: transaction.productId,
                    productName: transaction.product.name,
                    stockBefore: typeof stockAfter === 'number' ? stockAfter + decreasedQuantity : undefined,
                    stockAfter,
                    decreasedQuantity,
                    unit: transaction.product.unit || 'đơn vị',
                    createdAt: transaction.createdAt,
                    type: transaction.type,
                    restored: false
                });
            }
        }

        return pendingRestores;
    }
};
