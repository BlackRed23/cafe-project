import type { Category, Prisma } from '@cafe-project/database';
import { prisma } from '../../common/prisma';

export type CategoryRecord = Category;

const categoryInclude = {
    products: true
} satisfies Prisma.CategoryInclude;

export const categoryRepository = {
    async findMany(): Promise<CategoryRecord[]> {
        return prisma.category.findMany({
            include: categoryInclude,
            orderBy: {
                createdAt: 'desc'
            }
        });
    },

    async findById(id: string): Promise<CategoryRecord | null> {
        return prisma.category.findUnique({
            where: { id },
            include: categoryInclude
        });
    },

    async findByName(name: string): Promise<CategoryRecord | null> {
        return prisma.category.findUnique({
            where: { name },
            include: categoryInclude
        });
    },

    async create(data: Prisma.CategoryCreateInput): Promise<CategoryRecord> {
        return prisma.category.create({
            data,
            include: categoryInclude
        });
    },

    async update(id: string, data: Prisma.CategoryUpdateInput): Promise<CategoryRecord> {
        return prisma.category.update({
            where: { id },
            data,
            include: categoryInclude
        });
    },

    async delete(id: string): Promise<CategoryRecord> {
        return prisma.category.delete({
            where: { id },
            include: categoryInclude
        });
    },

    async hasProducts(id: string): Promise<boolean> {
        const product = await prisma.product.findFirst({
            where: {
                categoryId: id,
                isActive: true
            },
            select: { id: true }
        });

        return Boolean(product);
    }
};
