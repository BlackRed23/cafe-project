import { InventoryTransactionType, type Category, type Inventory, type InventoryTransaction, type Prisma, type Product, type User } from '@cafe-project/database';
import { prisma } from '@cafe-project/database';
import { getOptionalSettingValue } from '../system-setting/system-setting.service';

type ProductWithCategory = Product & {
    category: Category;
};

export type InventoryRecord = Inventory & {
    product: ProductWithCategory;
};

export type InventoryTransactionRecord = InventoryTransaction & {
    product: Product;
    user: Pick<User, 'id' | 'name' | 'email'> | null;
};

const inventoryInclude = {
    product: {
        include: {
            category: true
        }
    },
    batches: {
        orderBy: {
            expirationDate: 'asc'
        }
    }
} satisfies Prisma.InventoryInclude;

const transactionInclude = {
    product: true,
    user: {
        select: {
            id: true,
            name: true,
            email: true
        }
    }
} satisfies Prisma.InventoryTransactionInclude;

export const inventoryRepository = {
    async createMissingForActiveProducts(): Promise<void> {
        const productsWithoutInventory = await prisma.product.findMany({
            where: {
                isActive: true,
                inventory: {
                    is: null
                }
            },
            select: {
                id: true,
                unit: true
            }
        });

        if (productsWithoutInventory.length === 0) {
            return;
        }

        const defaultMinThresholdSetting = await getOptionalSettingValue('inventory.defaultMinThreshold');
        const defaultMinThreshold = parseInt(defaultMinThresholdSetting || '10', 10);
        const minThreshold = isNaN(defaultMinThreshold) ? 10 : defaultMinThreshold;

        await prisma.inventory.createMany({
            data: productsWithoutInventory.map((product: any) => ({
                productId: product.id,
                quantity: 0,
                minThreshold,
                unit: product.unit || 'hộp'
            })),
            skipDuplicates: true
        });
    },

    async findMany(): Promise<InventoryRecord[]> {
        return prisma.inventory.findMany({
            where: {
                product: {
                    isActive: true
                }
            },
            include: inventoryInclude,
            orderBy: {
                updatedAt: 'desc'
            }
        });
    },

    async findById(id: string): Promise<InventoryRecord | null> {
        return prisma.inventory.findFirst({
            where: {
                id,
                product: {
                    isActive: true
                }
            },
            include: inventoryInclude
        });
    },

    async findTransactions(): Promise<InventoryTransactionRecord[]> {
        return prisma.inventoryTransaction.findMany({
            include: transactionInclude,
            orderBy: {
                createdAt: 'desc'
            }
        });
    },

    async importStock(inventory: InventoryRecord, quantity: number, note: string | null, userId: string, batchCode?: string, expirationDate?: string): Promise<InventoryRecord> {
        return prisma.$transaction(async (tx: Prisma.TransactionClient) => {
            await tx.inventory.update({
                where: { id: inventory.id },
                data: {
                    quantity: inventory.quantity + quantity
                }
            });

            let batchId = null;
            if (expirationDate) {
                const finalBatchCode = batchCode?.trim() || `${inventory.productId.slice(0, 8)}-${Date.now()}`;
                const batch = await tx.inventoryBatch.create({
                    data: {
                        inventoryId: inventory.id,
                        batchCode: finalBatchCode,
                        quantity,
                        expirationDate: new Date(expirationDate)
                    }
                });
                batchId = batch.id;
            }

            await tx.inventoryTransaction.create({
                data: {
                    productId: inventory.productId,
                    userId,
                    type: InventoryTransactionType.IMPORT,
                    quantity,
                    reason: note,
                    batchId
                }
            });

            const updatedInventory = await tx.inventory.findUnique({
                where: { id: inventory.id },
                include: inventoryInclude
            });

            if (!updatedInventory) {
                throw new Error('Inventory update failed.');
            }

            return updatedInventory;
        });
    },

    async adjustStock(inventory: InventoryRecord, quantity: number, note: string | null, userId: string): Promise<InventoryRecord> {
        const newQuantity = inventory.quantity + quantity;

        return prisma.$transaction(async (tx: Prisma.TransactionClient) => {
            await tx.inventory.update({
                where: { id: inventory.id },
                data: {
                    quantity: newQuantity
                }
            });

            await tx.inventoryTransaction.create({
                data: {
                    productId: inventory.productId,
                    userId,
                    type: InventoryTransactionType.ADJUSTMENT,
                    quantity,
                    reason: note
                }
            });

            const updatedInventory = await tx.inventory.findUnique({
                where: { id: inventory.id },
                include: inventoryInclude
            });

            if (!updatedInventory) {
                throw new Error('Inventory update failed.');
            }

            return updatedInventory;
        });
    },

    async updateThreshold(inventory: InventoryRecord, minThreshold: number): Promise<InventoryRecord> {
        return prisma.inventory.update({
            where: { id: inventory.id },
            data: { minThreshold },
            include: inventoryInclude
        });
    }
};
