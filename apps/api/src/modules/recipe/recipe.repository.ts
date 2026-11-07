import { prisma, type Prisma } from '@cafe-project/database';

export const recipeInclude = {
    product: {
        select: {
            id: true,
            name: true,
            sku: true,
            price: true,
            costPrice: true,
            servingUnit: true
        }
    },
    ingredients: {
        include: {
            ingredient: true
        },
        orderBy: {
            createdAt: 'asc'
        }
    }
} satisfies Prisma.RecipeInclude;

export type RecipeRecord = Prisma.RecipeGetPayload<{ include: typeof recipeInclude }>;

export const toppingInclude = {
    ingredients: {
        include: {
            ingredient: true
        }
    }
} satisfies Prisma.ToppingInclude;

export type ToppingRecord = Prisma.ToppingGetPayload<{ include: typeof toppingInclude }>;

export const recipeRepository = {
    async findByProductId(productId: string, tx: Prisma.TransactionClient = prisma): Promise<RecipeRecord[]> {
        return tx.recipe.findMany({
            where: { productId },
            include: recipeInclude,
            orderBy: { version: 'desc' }
        });
    },

    async findActiveByProductId(productId: string, tx: Prisma.TransactionClient = prisma): Promise<RecipeRecord | null> {
        return tx.recipe.findFirst({
            where: { productId, isActive: true },
            include: recipeInclude,
            orderBy: { version: 'desc' }
        });
    },

    async findById(id: string, tx: Prisma.TransactionClient = prisma): Promise<RecipeRecord | null> {
        return tx.recipe.findUnique({
            where: { id },
            include: recipeInclude
        });
    },

    async getMaxVersion(productId: string, tx: Prisma.TransactionClient = prisma): Promise<number> {
        const agg = await tx.recipe.aggregate({
            where: { productId },
            _max: { version: true }
        });
        return agg._max.version ?? 0;
    },

    async findToppings(includeInactive = false, productId?: string): Promise<ToppingRecord[]> {
        return prisma.topping.findMany({
            where: {
                ...(includeInactive ? {} : { isActive: true }),
                ...(productId ? { OR: [{ productId: null }, { productId }] } : {})
            },
            include: toppingInclude,
            orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }]
        });
    },

    async findToppingById(id: string, tx: Prisma.TransactionClient = prisma): Promise<ToppingRecord | null> {
        return tx.topping.findUnique({
            where: { id },
            include: toppingInclude
        });
    }
};
