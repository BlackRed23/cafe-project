import type { Prisma } from '@cafe-project/database';
import { prisma } from '@cafe-project/database';

const supplierInclude = { ingredients: { include: { ingredient: true } } } satisfies Prisma.SupplierInclude;
const supplierIngredientInclude = { supplier: true, ingredient: true } satisfies Prisma.SupplierIngredientInclude;

export type SupplierRecord = Prisma.SupplierGetPayload<{ include: typeof supplierInclude }>;
export type SupplierProductRecord = Prisma.SupplierIngredientGetPayload<{ include: typeof supplierIngredientInclude }>;

export const supplierRepository = {
    async findSuppliers(): Promise<SupplierRecord[]> {
        return prisma.supplier.findMany({
            where: {
                deletedAt: null
            },
            include: supplierInclude,
            orderBy: { createdAt: 'desc' }
        });
    },
    async findSupplierById(id: string): Promise<SupplierRecord | null> { return prisma.supplier.findUnique({ where: { id }, include: supplierInclude }); },
    async createSupplier(data: Prisma.SupplierCreateInput): Promise<SupplierRecord> { return prisma.supplier.create({ data, include: supplierInclude }); },
    async updateSupplier(id: string, data: Prisma.SupplierUpdateInput): Promise<SupplierRecord> { return prisma.supplier.update({ where: { id }, data, include: supplierInclude }); },
    async deleteSupplier(id: string): Promise<SupplierRecord> {
        return prisma.supplier.update({
            where: { id },
            data: { status: 'INACTIVE', deletedAt: new Date() },
            include: supplierInclude
        });
    },
    async countPurchaseRequests(supplierId: string): Promise<number> {
        return prisma.purchaseRequest.count({ where: { supplierId } });
    },
    async countAgentLogs(supplierId: string): Promise<number> {
        return prisma.agentToolCall.count({ where: { OR: [
            { arguments: { path: ['supplierId'], equals: supplierId } },
            { arguments: { path: ['input', 'supplierId'], equals: supplierId } },
            { result: { path: ['output', 'supplierId'], equals: supplierId } },
            { result: { path: ['supplierId'], equals: supplierId } }
        ] } });
    },
    async findIngredient(id: string) { return prisma.ingredient.findFirst({ where: { id, isActive: true, deletedAt: null } }); },
    async countBatches(supplierId: string) { return prisma.ingredientBatch.count({ where: { supplierId } }); },
    async findSupplierProducts(): Promise<SupplierProductRecord[]> { return prisma.supplierIngredient.findMany({ include: supplierIngredientInclude, orderBy: { createdAt: 'desc' } }); },
    async findSupplierProductById(id: string): Promise<SupplierProductRecord | null> { return prisma.supplierIngredient.findUnique({ where: { id }, include: supplierIngredientInclude }); },
    async findSupplierProductByPair(supplierId: string, productId: string): Promise<SupplierProductRecord | null> { return prisma.supplierIngredient.findUnique({ where: { supplierId_ingredientId: { supplierId, ingredientId: productId } }, include: supplierIngredientInclude }); },
    async findSupplierProductsBySupplier(supplierId: string): Promise<SupplierProductRecord[]> { return prisma.supplierIngredient.findMany({ where: { supplierId }, include: supplierIngredientInclude, orderBy: { createdAt: 'desc' } }); },
    async findSupplierProductsByProduct(productId: string): Promise<SupplierProductRecord[]> { return prisma.supplierIngredient.findMany({ where: { ingredientId: productId }, include: supplierIngredientInclude, orderBy: { pricePerBaseUnit: 'asc' } }); },
    async createSupplierProduct(data: Prisma.SupplierIngredientUncheckedCreateInput): Promise<SupplierProductRecord> { return prisma.supplierIngredient.create({ data, include: supplierIngredientInclude }); },
    async updateSupplierProduct(id: string, data: Prisma.SupplierIngredientUncheckedUpdateInput): Promise<SupplierProductRecord> { return prisma.supplierIngredient.update({ where: { id }, data, include: supplierIngredientInclude }); },
    async deleteSupplierProduct(id: string): Promise<SupplierProductRecord> { return prisma.supplierIngredient.delete({ where: { id }, include: supplierIngredientInclude }); },
    async productExists(productId: string): Promise<boolean> { return Boolean(await prisma.ingredient.findFirst({ where: { id: productId, isActive: true, deletedAt: null }, select: { id: true } })); }
};
