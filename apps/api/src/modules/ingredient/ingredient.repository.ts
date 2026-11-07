import { prisma, type Prisma } from '@cafe-project/database';

export const ingredientInclude = {
    category: {
        select: {
            id: true,
            name: true,
            kind: true
        }
    },
    batches: {
        where: {
            quantityRemaining: { gt: 0 }
        },
        orderBy: [
            { expirationDate: 'asc' },
            { receivedAt: 'asc' }
        ]
    }
} satisfies Prisma.IngredientInclude;

export type IngredientRecord = Prisma.IngredientGetPayload<{ include: typeof ingredientInclude }>;

export const ingredientTransactionInclude = {
    batch: {
        select: {
            id: true,
            batchCode: true,
            expirationDate: true
        }
    },
    performedByUser: {
        select: {
            id: true,
            name: true,
            email: true
        }
    }
} satisfies Prisma.InventoryTransactionInclude;

export type IngredientTransactionRecord = Prisma.InventoryTransactionGetPayload<{
    include: typeof ingredientTransactionInclude;
}>;

export const ingredientRepository = {
    async findMany(filters: {
        search?: string;
        categoryId?: string;
        includeInactive?: boolean;
    }): Promise<IngredientRecord[]> {
        return prisma.ingredient.findMany({
            where: {
                deletedAt: null,
                ...(filters.includeInactive ? {} : { isActive: true }),
                ...(filters.categoryId ? { categoryId: filters.categoryId } : {}),
                ...(filters.search
                    ? {
                          OR: [
                              { name: { contains: filters.search, mode: 'insensitive' } },
                              { sku: { contains: filters.search, mode: 'insensitive' } }
                          ]
                      }
                    : {})
            },
            include: ingredientInclude,
            orderBy: { name: 'asc' }
        });
    },

    async findById(id: string, tx: Prisma.TransactionClient = prisma): Promise<IngredientRecord | null> {
        return tx.ingredient.findFirst({
            where: { id, deletedAt: null },
            include: ingredientInclude
        });
    },

    async findBySku(sku: string): Promise<{ id: string } | null> {
        return prisma.ingredient.findUnique({
            where: { sku },
            select: { id: true }
        });
    },

    async findTransactions(ingredientId: string): Promise<IngredientTransactionRecord[]> {
        return prisma.inventoryTransaction.findMany({
            where: { ingredientId },
            include: ingredientTransactionInclude,
            orderBy: { createdAt: 'desc' }
        });
    },

    async countActiveRecipeUsage(ingredientId: string): Promise<number> {
        return prisma.recipeIngredient.count({
            where: {
                ingredientId,
                recipe: {
                    isActive: true
                }
            }
        });
    }
};
