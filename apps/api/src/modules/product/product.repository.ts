import type { Prisma, Product } from '@cafe-project/database';
import { prisma } from '../../common/prisma';

export type ProductRecord = Product;

const productInclude = {
    category: true,
    inventory: true
} satisfies Prisma.ProductInclude;

export const productRepository = {
    async findMany(): Promise<ProductRecord[]> {
        return prisma.product.findMany({
            where: {
                isActive: true
            },
            include: productInclude,
            orderBy: {
                createdAt: 'desc'
            }
        });
    },

    async findById(id: string): Promise<ProductRecord | null> {
        return prisma.product.findUnique({
            where: {
                id,
                isActive: true
            },
            include: productInclude
        });
    },

    async create(data: Prisma.ProductUncheckedCreateInput): Promise<ProductRecord> {
        return prisma.$transaction(async (tx) => {
            const product = await tx.product.create({
                data,
                include: productInclude
            });

            await tx.inventory.create({
                data: {
                    productId: product.id,
                    quantity: 0,
                    minThreshold: 10,
                    unit: 'unit'
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

    async delete(id: string): Promise<ProductRecord> {
        return prisma.product.update({
            where: { id },
            data: {
                isActive: false
            },
            include: productInclude
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
