import { Prisma, prisma } from '@cafe-project/database';
const include = { recipes: { include: { ingredients: { include: { ingredient: { include: { batches: true } } } } } } } satisfies Prisma.ProductInclude;
export const simulateSaleRepository = {
    async findProducts(ids: string[]) { return prisma.product.findMany({ where: { id: { in: ids }, isActive: true, deletedAt: null }, include }); },
    async findPendingRestore(userId: string) {
        return prisma.inventoryTransaction.findMany({ where: { type: 'SIMULATE_SALE', performedBy: userId },
            include: { ingredient: { select: { id: true, name: true, baseUnit: true } } }, orderBy: { createdAt: 'desc' } });
    }
};
