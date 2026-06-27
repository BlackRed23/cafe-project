import type { Category, Prisma } from '@cafe-project/database';
import { prisma } from '@cafe-project/database';

export type CategoryRecord = Category;

export const categoryRepository = {
    async findMany() {
        return prisma.category.findMany({
            orderBy: { createdAt: 'desc' },
            include: {
                products: {
                    select: { id: true, name: true, sku: true },
                    take: 5,
                    orderBy: { name: 'asc' }
                },
                _count: {
                    select: { products: true }
                }
            }
        });
    },

    async findById(id: string): Promise<CategoryRecord | null> {
        return prisma.category.findUnique({ where: { id } });
    },

    async findByName(name: string): Promise<CategoryRecord | null> {
        return prisma.category.findUnique({ where: { name } });
    },

    async create(data: Prisma.CategoryCreateInput): Promise<CategoryRecord> {
        return prisma.category.create({ data });
    },

    async update(id: string, data: Prisma.CategoryUpdateInput): Promise<CategoryRecord> {
        return prisma.category.update({ where: { id }, data });
    },

    async delete(id: string): Promise<CategoryRecord> {
        return prisma.category.delete({ where: { id } });
    },

    async countProducts(id: string): Promise<number> {
        return prisma.product.count({
            where: { categoryId: id }
        });
    }
};
