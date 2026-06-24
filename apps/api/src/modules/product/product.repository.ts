import type { Category, Inventory, Prisma, Product } from '@cafe-project/database';
import { prisma } from '@cafe-project/database';

export type ProductRecord = Product & {
    category: Category;
    inventory: Inventory | null;
};

export type ProductDeleteBlockers = {
    orderItems: number;
    purchaseRequestItems: number;
    inventoryTransactions: number;
};

const productInclude = {
    category: true,
    inventory: true
} satisfies Prisma.ProductInclude;

export const productRepository = {
    async findMany(includeInactive = false): Promise<ProductRecord[]> {
        return prisma.product.findMany({
            where: includeInactive ? undefined : { isActive: true },
            include: productInclude,
            orderBy: { createdAt: 'desc' }
        });
    },

    async findExpiredPendingDeleteProducts(now: Date = new Date()): Promise<ProductRecord[]> {
        return prisma.product.findMany({
            where: {
                pendingDeleteUntil: {
                    not: null,
                    lte: now,
                },
            },
            include: productInclude,
        });
    },

    async findById(id: string, includeInactive = false): Promise<ProductRecord | null> {
        return prisma.product.findFirst({
            where: includeInactive ? { id } : { id, isActive: true },
            include: productInclude
        });
    },

    async findBySku(sku: string): Promise<Pick<Product, 'id'> | null> {
        return prisma.product.findUnique({
            where: { sku },
            select: { id: true }
        });
    },

    async create(data: Prisma.ProductUncheckedCreateInput): Promise<ProductRecord> {
        return prisma.$transaction(async (tx) => {
            const product = await tx.product.create({ data });

            await tx.inventory.create({
                data: {
                    productId: product.id,
                    quantity: 0,
                    minThreshold: 10,
                    unit: product.unit
                }
            });

            const productWithInventory = await tx.product.findUnique({
                where: { id: product.id },
                include: productInclude
            });

            if (!productWithInventory) {
                throw new Error('Product creation failed.');
            }

            return productWithInventory;
        });
    },

    async update(id: string, data: Prisma.ProductUncheckedUpdateInput): Promise<ProductRecord> {
        return prisma.product.update({
            where: { id },
            data,
            include: productInclude
        });
    },

    async getDeleteBlockers(productId: string): Promise<ProductDeleteBlockers> {
        const [orderItems, purchaseRequestItems, inventoryTransactions] = await Promise.all([
            prisma.orderItem.count({ where: { productId } }),
            prisma.purchaseRequestItem.count({ where: { productId } }),
            prisma.inventoryTransaction.count({ where: { productId } })
        ]);

        return { orderItems, purchaseRequestItems, inventoryTransactions };
    },

    async delete(id: string): Promise<ProductRecord> {
        return prisma.$transaction(async (tx) => {
            await tx.inventory.deleteMany({ where: { productId: id } });
            await tx.supplierProduct.deleteMany({ where: { productId: id } });

            return tx.product.delete({
                where: { id },
                include: productInclude
            });
        });
    },

    async categoryExists(categoryId: string): Promise<boolean> {
        const category = await prisma.category.findUnique({
            where: { id: categoryId },
            select: { id: true }
        });

        return Boolean(category);
    }
};
