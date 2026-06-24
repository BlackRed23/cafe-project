import type { Prisma } from '@cafe-project/database';
import { prisma } from '@cafe-project/database';

const supplierInclude = { products: { include: { product: true } } } satisfies Prisma.SupplierInclude;
const supplierProductInclude = { supplier: true, product: true } satisfies Prisma.SupplierProductInclude;

export type SupplierRecord = Prisma.SupplierGetPayload<{ include: typeof supplierInclude }>;
export type SupplierProductRecord = Prisma.SupplierProductGetPayload<{ include: typeof supplierProductInclude }>;

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
    async productExists(productId: string): Promise<boolean> { return Boolean(await prisma.product.findFirst({ where: { id: productId, isActive: true }, select: { id: true } })); }
};