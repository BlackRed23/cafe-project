import type { Prisma, Product } from '@cafe-project/database';
import { prisma } from '@cafe-project/database';
import { HttpError } from '../../common/http-error';

const productInclude = {
    category: true, recipes: { include: { ingredients: { include: { ingredient: { include: { batches: true } } } } } }
} satisfies Prisma.ProductInclude;
export type ProductRecord = Prisma.ProductGetPayload<{ include: typeof productInclude }>;
export type ProductDeleteBlockers = { orderItems: number; recipes: number; toppings: number };

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
        return prisma.product.create({ data, include: productInclude });
    },

    async update(id: string, data: Prisma.ProductUncheckedUpdateInput): Promise<ProductRecord> {
        return prisma.product.update({
            where: { id },
            data,
            include: productInclude
        });
    },

    async getDeleteBlockers(productId: string): Promise<ProductDeleteBlockers> {
        const [orderItems, recipes, toppings] = await Promise.all([
            prisma.orderItem.count({ where: { productId } }), prisma.recipe.count({ where: { productId } }), prisma.topping.count({ where: { productId } })
        ]);
        return { orderItems, recipes, toppings };
    },
    async delete(id: string): Promise<ProductRecord> {
        return prisma.$transaction(async (tx: Prisma.TransactionClient) => {
            await tx.$queryRaw`SELECT "id" FROM "Product" WHERE "id" = ${id} FOR UPDATE`;
            if (await tx.orderItem.count({ where: { productId: id } }) || await tx.recipe.count({ where: { productId: id } }) || await tx.topping.count({ where: { productId: id } })) {
                throw new HttpError(409, 'Sản phẩm có đơn hàng/công thức/topping; chỉ được ngưng hoạt động.');
            }
            return tx.product.delete({ where: { id }, include: productInclude });
        });
    },

    async categoryExists(categoryId: string): Promise<boolean> {
        const category = await prisma.category.findUnique({
            where: { id: categoryId, kind: 'PRODUCT' },
            select: { id: true }
        });

        return Boolean(category);
    }
};
