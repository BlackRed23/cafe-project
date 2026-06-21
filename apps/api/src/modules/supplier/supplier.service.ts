import { Prisma } from '@cafe-project/database';
import { HttpError } from '../../common/http-error';
import { supplierRepository, type SupplierProductRecord, type SupplierRecord } from './supplier.repository';
import type { CreateSupplierInput, CreateSupplierProductInput, UpdateSupplierInput, UpdateSupplierProductInput } from './supplier.validator';

const normalize = (value: string | null | undefined): string | null | undefined => value === undefined ? undefined : (!value ? null : value);
const contactFromInput = (input: { phone?: string | null; contact?: string | null }): string | null | undefined => normalize(input.phone ?? input.contact);

const toSupplierDto = (supplier: SupplierRecord) => ({
    id: supplier.id,
    name: supplier.name,
    email: supplier.email,
    phone: supplier.contact,
    contact: supplier.contact,
    address: supplier.address,
    products: supplier.products.map((mapping) => ({
        id: mapping.id,
        supplierId: mapping.supplierId,
        supplierName: supplier.name,
        productId: mapping.productId,
        productName: mapping.product.name,
        productSku: mapping.product.sku,
        price: Number(mapping.price),
        supplierSku: mapping.supplierSku,
        minOrderQuantity: mapping.minOrderQuantity,
        leadTimeDays: mapping.leadTimeDays,
        isPreferred: mapping.isPreferred,
        purchaseUnit: mapping.purchaseUnit,
        conversionQuantity: mapping.conversionQuantity,
        conversionTargetUnit: mapping.conversionTargetUnit,
        createdAt: mapping.createdAt,
        updatedAt: mapping.updatedAt
    })),
    createdAt: supplier.createdAt,
    updatedAt: supplier.updatedAt
});

const toSupplierProductDto = (mapping: SupplierProductRecord) => ({
    id: mapping.id,
    supplierId: mapping.supplierId,
    supplierName: mapping.supplier.name,
    productId: mapping.productId,
    productName: mapping.product.name,
    productSku: mapping.product.sku,
    price: Number(mapping.price),
    supplierSku: mapping.supplierSku,
    minOrderQuantity: mapping.minOrderQuantity,
    leadTimeDays: mapping.leadTimeDays,
    isPreferred: mapping.isPreferred,
    purchaseUnit: mapping.purchaseUnit,
    conversionQuantity: mapping.conversionQuantity,
    conversionTargetUnit: mapping.conversionTargetUnit,
    createdAt: mapping.createdAt,
    updatedAt: mapping.updatedAt
});

const ensureSupplier = async (id: string): Promise<SupplierRecord> => {
    const supplier = await supplierRepository.findSupplierById(id);
    if (!supplier) throw new HttpError(404, 'Supplier not found.');
    return supplier;
};

const ensureSupplierProduct = async (id: string): Promise<SupplierProductRecord> => {
    const mapping = await supplierRepository.findSupplierProductById(id);
    if (!mapping) throw new HttpError(404, 'Supplier product mapping not found.');
    return mapping;
};

const ensureProduct = async (productId: string): Promise<void> => {
    if (!(await supplierRepository.productExists(productId))) throw new HttpError(404, 'Product not found.');
};

export const supplierService = {
    async listSuppliers() { return (await supplierRepository.findSuppliers()).map(toSupplierDto); },
    async getSupplier(id: string) { return toSupplierDto(await ensureSupplier(id)); },
    async createSupplier(input: CreateSupplierInput) {
        return toSupplierDto(await supplierRepository.createSupplier({ name: input.name, email: normalize(input.email), contact: contactFromInput(input), address: normalize(input.address) }));
    },
    async updateSupplier(id: string, input: UpdateSupplierInput) {
        await ensureSupplier(id);
        return toSupplierDto(await supplierRepository.updateSupplier(id, { ...(input.name !== undefined ? { name: input.name } : {}), ...(input.email !== undefined ? { email: normalize(input.email) } : {}), ...(input.phone !== undefined || input.contact !== undefined ? { contact: contactFromInput(input) } : {}), ...(input.address !== undefined ? { address: normalize(input.address) } : {}) }));
    },
    async deleteSupplier(id: string) { await ensureSupplier(id); return toSupplierDto(await supplierRepository.deleteSupplier(id)); },

    async listSupplierProducts() { return (await supplierRepository.findSupplierProducts()).map(toSupplierProductDto); },
    async listProductsBySupplier(supplierId: string) { await ensureSupplier(supplierId); return (await supplierRepository.findSupplierProductsBySupplier(supplierId)).map(toSupplierProductDto); },
    async listSuppliersByProduct(productId: string) { await ensureProduct(productId); return (await supplierRepository.findSupplierProductsByProduct(productId)).map(toSupplierProductDto); },
    async createSupplierProduct(input: CreateSupplierProductInput) {
        await ensureSupplier(input.supplierId);
        await ensureProduct(input.productId);
        if (await supplierRepository.findSupplierProductByPair(input.supplierId, input.productId)) throw new HttpError(409, 'Supplier already provides this product.');
        try {
            return toSupplierProductDto(await supplierRepository.createSupplierProduct({
                supplierId: input.supplierId,
                productId: input.productId,
                price: input.price,
                supplierSku: normalize(input.supplierSku),
                minOrderQuantity: input.minOrderQuantity ?? 1,
                leadTimeDays: input.leadTimeDays ?? 3,
                isPreferred: input.isPreferred ?? false,
                purchaseUnit: normalize(input.purchaseUnit),
                conversionQuantity: input.conversionQuantity ?? null,
                conversionTargetUnit: normalize(input.conversionTargetUnit)
            }));
        }
        catch (error) { if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') throw new HttpError(409, 'Supplier already provides this product.'); throw error; }
    },
    async updateSupplierProduct(id: string, input: UpdateSupplierProductInput) {
        const current = await ensureSupplierProduct(id);
        const supplierId = input.supplierId ?? current.supplierId;
        const productId = input.productId ?? current.productId;
        await ensureSupplier(supplierId); await ensureProduct(productId);
        const duplicate = await supplierRepository.findSupplierProductByPair(supplierId, productId);
        if (duplicate && duplicate.id !== id) throw new HttpError(409, 'Supplier already provides this product.');
        return toSupplierProductDto(await supplierRepository.updateSupplierProduct(id, {
            ...(input.supplierId !== undefined ? { supplierId } : {}),
            ...(input.productId !== undefined ? { productId } : {}),
            ...(input.price !== undefined ? { price: input.price } : {}),
            ...(input.supplierSku !== undefined ? { supplierSku: normalize(input.supplierSku) } : {}),
            ...(input.minOrderQuantity !== undefined ? { minOrderQuantity: input.minOrderQuantity } : {}),
            ...(input.leadTimeDays !== undefined ? { leadTimeDays: input.leadTimeDays } : {}),
            ...(input.isPreferred !== undefined ? { isPreferred: input.isPreferred } : {}),
            ...(input.purchaseUnit !== undefined ? { purchaseUnit: normalize(input.purchaseUnit) } : {}),
            ...(input.conversionQuantity !== undefined ? { conversionQuantity: input.conversionQuantity } : {}),
            ...(input.conversionTargetUnit !== undefined ? { conversionTargetUnit: normalize(input.conversionTargetUnit) } : {})
        }));
    },
    async deleteSupplierProduct(id: string) { await ensureSupplierProduct(id); return toSupplierProductDto(await supplierRepository.deleteSupplierProduct(id)); }
};
