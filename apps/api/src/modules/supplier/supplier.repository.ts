import type { Prisma } from '@cafe-project/database';
import { prisma } from '@cafe-project/database';

const supplierInclude = {
    products: { include: { product: true } },
    ingredients: { include: { ingredient: true } }
} satisfies Prisma.SupplierInclude;
const supplierProductInclude = { supplier: true, product: true } satisfies Prisma.SupplierProductInclude;
const supplierIngredientInclude = { supplier: true, ingredient: true } satisfies Prisma.SupplierIngredientInclude;

export type SupplierRecord = Prisma.SupplierGetPayload<{ include: typeof supplierInclude }>;
export type SupplierProductRecord = Prisma.SupplierProductGetPayload<{ include: typeof supplierProductInclude }>;
export type SupplierIngredientRecord = Prisma.SupplierIngredientGetPayload<{ include: typeof supplierIngredientInclude }>;

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
        return prisma.supplier.delete({
            where: { id },
            include: supplierInclude
        });
    },
    async countPurchaseRequests(supplierId: string): Promise<number> {
        return prisma.purchaseRequest.count({ where: { supplierId } });
    },
    async countAgentLogs(supplierId: string): Promise<number> {
        return prisma.agentLog.count({
            where: {
                OR: [
                    { input: { contains: supplierId } },
                    { output: { contains: supplierId } }
                ]
            }
        });
    },

    async findSupplierProducts(): Promise<SupplierProductRecord[]> { return prisma.supplierProduct.findMany({ include: supplierProductInclude, orderBy: { createdAt: 'desc' } }); },
    async findSupplierProductById(id: string): Promise<SupplierProductRecord | null> { return prisma.supplierProduct.findUnique({ where: { id }, include: supplierProductInclude }); },
    async findSupplierProductByPair(supplierId: string, productId: string): Promise<SupplierProductRecord | null> { return prisma.supplierProduct.findUnique({ where: { supplierId_productId: { supplierId, productId } }, include: supplierProductInclude }); },
    async findSupplierProductsBySupplier(supplierId: string): Promise<SupplierProductRecord[]> { return prisma.supplierProduct.findMany({ where: { supplierId }, include: supplierProductInclude, orderBy: { createdAt: 'desc' } }); },
    async findSupplierProductsByProduct(productId: string): Promise<SupplierProductRecord[]> { return prisma.supplierProduct.findMany({ where: { productId }, include: supplierProductInclude, orderBy: { price: 'asc' } }); },
    async createSupplierProduct(data: Prisma.SupplierProductUncheckedCreateInput): Promise<SupplierProductRecord> { return prisma.supplierProduct.create({ data, include: supplierProductInclude }); },
    async updateSupplierProduct(id: string, data: Prisma.SupplierProductUncheckedUpdateInput): Promise<SupplierProductRecord> { return prisma.supplierProduct.update({ where: { id }, data, include: supplierProductInclude }); },
    async deleteSupplierProduct(id: string): Promise<SupplierProductRecord> { return prisma.supplierProduct.delete({ where: { id }, include: supplierProductInclude }); },
    async productExists(productId: string): Promise<boolean> { return Boolean(await prisma.product.findFirst({ where: { id: productId, isActive: true }, select: { id: true } })); },

    async findSupplierIngredients(): Promise<SupplierIngredientRecord[]> { return prisma.supplierIngredient.findMany({ include: supplierIngredientInclude, orderBy: { createdAt: 'desc' } }); },
    async findSupplierIngredientById(id: string): Promise<SupplierIngredientRecord | null> { return prisma.supplierIngredient.findUnique({ where: { id }, include: supplierIngredientInclude }); },
    async findSupplierIngredientByPair(supplierId: string, ingredientId: string): Promise<SupplierIngredientRecord | null> { return prisma.supplierIngredient.findUnique({ where: { supplierId_ingredientId: { supplierId, ingredientId } }, include: supplierIngredientInclude }); },
    async findSupplierIngredientsBySupplier(supplierId: string): Promise<SupplierIngredientRecord[]> { return prisma.supplierIngredient.findMany({ where: { supplierId }, include: supplierIngredientInclude, orderBy: { createdAt: 'desc' } }); },
    async findSupplierIngredientsByIngredient(ingredientId: string): Promise<SupplierIngredientRecord[]> { return prisma.supplierIngredient.findMany({ where: { ingredientId }, include: supplierIngredientInclude, orderBy: { pricePerBaseUnit: 'asc' } }); },
    async createSupplierIngredient(data: Prisma.SupplierIngredientUncheckedCreateInput): Promise<SupplierIngredientRecord> { return prisma.supplierIngredient.create({ data, include: supplierIngredientInclude }); },
    async updateSupplierIngredient(id: string, data: Prisma.SupplierIngredientUncheckedUpdateInput): Promise<SupplierIngredientRecord> { return prisma.supplierIngredient.update({ where: { id }, data, include: supplierIngredientInclude }); },
    async deleteSupplierIngredient(id: string): Promise<SupplierIngredientRecord> { return prisma.supplierIngredient.delete({ where: { id }, include: supplierIngredientInclude }); },
    async findActiveIngredientById(ingredientId: string) { return prisma.ingredient.findFirst({ where: { id: ingredientId, isActive: true, deletedAt: null }, select: { id: true, baseUnit: true } }); }
};