import { InventoryTransactionType, type Category, type Inventory, type InventoryTransaction, type Prisma, type Product, type User } from '@cafe-project/database';
import { prisma } from '../../common/prisma';

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

        await prisma.inventory.createMany({
            data: productsWithoutInventory.map((product) => ({
                productId: product.id,
                quantity: 0,
                minThreshold: 10,
                unit: product.unit || 'Ly'
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

    async importStock(inventory: InventoryRecord, quantity: number, note: string | null, userId: string): Promise<InventoryRecord> {
        return prisma.$transaction(async (tx) => {
            await tx.inventory.update({
                where: { id: inventory.id },
                data: {
                    quantity: inventory.quantity + quantity
                }
            });

            await tx.inventoryTransaction.create({
                data: {
                    productId: inventory.productId,
                    userId,
                    type: InventoryTransactionType.IMPORT,
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

    async adjustStock(inventory: InventoryRecord, quantity: number, note: string | null, userId: string): Promise<InventoryRecord> {
        const newQuantity = inventory.quantity + quantity;

        return prisma.$transaction(async (tx) => {
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
