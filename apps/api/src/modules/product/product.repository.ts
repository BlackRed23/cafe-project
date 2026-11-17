import type { Category, Inventory, Prisma, Product } from '@cafe-project/database';
import { prisma } from '@cafe-project/database';
import { HttpError } from '../../common/http-error';

export type ProductRecord = Product & {
    category: Category;
    inventory: Inventory | null;
    recipes?: Array<{
        id: string;
        isActive: boolean;
        ingredients: Array<{
            id: string;
            quantity: Prisma.Decimal;
            quantityBase: Prisma.Decimal;
            unit: string;
            isOptional: boolean;
            ingredient: {
                id: string;
                name: string;
                sku: string;
                quantity: Prisma.Decimal;
                reserved: Prisma.Decimal;
                baseUnit: string;
            };
        }>;
    }>;
};

export type ProductDeleteBlockers = {
    orderItems: number;
    purchaseRequestItems: number;
    inventoryTransactions: number;
};

const productInclude = {
    category: true,
    inventory: true,
    recipes: {
        where: { isActive: true },
        include: {
            ingredients: {
                include: {
                    ingredient: true
                }
            }
        }
    }
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
        return prisma.$transaction(async (tx: Prisma.TransactionClient) => {
            const product = await tx.product.create({ data });

            const productWithRelations = await tx.product.findUnique({
                where: { id: product.id },
                include: productInclude
            });

            if (!productWithRelations) {
                throw new Error('Product creation failed.');
            }

            return productWithRelations;
        });
    },

    async update(id: string, data: Prisma.ProductUncheckedUpdateInput, expectedUpdatedAt?: Date): Promise<ProductRecord> {
        return prisma.$transaction(async tx => {
            const current = await tx.product.findUnique({ where: { id }, select: { updatedAt: true } });
            if (!current) throw new HttpError(404, 'Product not found.');
            const version = expectedUpdatedAt ?? current.updatedAt;
            const result = await tx.product.updateMany({
                where: { id, updatedAt: version },
                data: { ...data, updatedAt: new Date(Math.max(Date.now(), version.getTime() + 1)) }
            });
            if (result.count !== 1) throw new HttpError(409, 'Product changed. Reload before updating.');
            if (data.isActive === true) {
                const recipes = await tx.recipe.findMany({
                    where: { productId: id, isActive: true },
                    include: { ingredients: { include: { ingredient: true } } }
                });
                const now = new Date();
                if (recipes.length > 1 || recipes.some(recipe => !recipe.ingredients.length ||
                    !recipe.yieldQuantity.gt(0) || recipe.effectiveFrom > now ||
                    (recipe.effectiveTo !== null && recipe.effectiveTo <= now) ||
                    recipe.ingredients.some(item => !item.quantityBase.gt(0) ||
                        !item.ingredient.isActive || item.ingredient.deletedAt !== null))) {
                    throw new HttpError(409, 'Product recipe is invalid or unavailable.');
                }
            }
            return tx.product.findUniqueOrThrow({ where: { id }, include: productInclude });
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
        return prisma.$transaction(async (tx: Prisma.TransactionClient) => {
            const inventory = await tx.inventory.findUnique({ where: { productId: id } });
            
            if (inventory) {
                await tx.inventoryBatch.deleteMany({ where: { inventoryId: inventory.id } });
                await tx.inventory.delete({ where: { id: inventory.id } });
            }
            
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
