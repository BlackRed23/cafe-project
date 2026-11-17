import { Prisma } from '@cafe-project/database';
import { HttpError } from '../../common/http-error';
import { getUnitConversionFactor, isKnownUnit, normalizeUnitString } from '../../common/unit-conversion';
import { supplierRepository, type SupplierIngredientRecord, type SupplierProductRecord, type SupplierRecord } from './supplier.repository';
import type { CreateSupplierInput, CreateSupplierProductInput, UpdateSupplierInput, UpdateSupplierProductInput } from './supplier.validator';

const normalize = (value: string | null | undefined): string | null | undefined => value === undefined ? undefined : (!value ? null : value);
const contactFromInput = (input: { phone?: string | null; contact?: string | null }): string | null | undefined => normalize(input.phone ?? input.contact);

const toSupplierIngredientDto = (mapping: SupplierIngredientRecord) => {
    const convQty = Number(mapping.conversionQuantity || 1);
    const pricePerPack = Math.round(Number(mapping.pricePerBaseUnit || 0) * Math.max(1, convQty));
    return {
        id: mapping.id,
        supplierId: mapping.supplierId,
        supplierName: mapping.supplier.name,
        ingredientId: mapping.ingredientId,
        productId: mapping.ingredientId,
        productName: mapping.ingredient.name,
        productSku: mapping.ingredient.sku,
        price: pricePerPack,
        pricePerBaseUnit: Number(mapping.pricePerBaseUnit || 0),
        supplierSku: mapping.supplierSku,
        minOrderQuantity: mapping.minOrderQuantity,
        leadTimeDays: mapping.leadTimeDays,
        isPreferred: mapping.isPreferred,
        purchaseUnit: mapping.purchaseUnit,
        conversionQuantity: convQty,
        conversionTargetUnit: mapping.conversionTargetUnit ?? mapping.ingredient.baseUnit,
        createdAt: mapping.createdAt,
        updatedAt: mapping.updatedAt
    };
};

const toSupplierDto = (supplier: SupplierRecord) => {
    const mappedProducts = supplier.products.map((mapping) => ({
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
    }));
    const mappedIngredients = (supplier.ingredients ?? []).map((mapping) => {
        const convQty = Number(mapping.conversionQuantity || 1);
        const pricePerPack = Math.round(Number(mapping.pricePerBaseUnit || 0) * Math.max(1, convQty));
        return {
            id: mapping.id,
            supplierId: mapping.supplierId,
            supplierName: supplier.name,
            ingredientId: mapping.ingredientId,
            productId: mapping.ingredientId,
            productName: mapping.ingredient.name,
            productSku: mapping.ingredient.sku,
            price: pricePerPack,
            pricePerBaseUnit: Number(mapping.pricePerBaseUnit || 0),
            supplierSku: mapping.supplierSku,
            minOrderQuantity: mapping.minOrderQuantity,
            leadTimeDays: mapping.leadTimeDays,
            isPreferred: mapping.isPreferred,
            purchaseUnit: mapping.purchaseUnit,
            conversionQuantity: convQty,
            conversionTargetUnit: mapping.conversionTargetUnit ?? mapping.ingredient.baseUnit,
            createdAt: mapping.createdAt,
            updatedAt: mapping.updatedAt
        };
    });

    return {
        id: supplier.id,
        name: supplier.name,
        email: supplier.email,
        phone: supplier.contact,
        contact: supplier.contact,
        address: supplier.address,
        status: supplier.status,
        products: [...mappedProducts, ...mappedIngredients],
        ingredients: mappedIngredients,
        createdAt: supplier.createdAt,
        updatedAt: supplier.updatedAt
    };
};

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
    /** Tool read policy: no legacy Product fallback; informational prices only. */
    async findIngredientSuppliers(ingredientId: string) {
        const ingredient = await supplierRepository.findActiveIngredientById(ingredientId);
        if (!ingredient) throw new HttpError(404, 'Ingredient not found.');
        const mappings = await supplierRepository.findSupplierIngredientsByIngredient(ingredientId);
        return mappings.filter(row => row.supplier.status === 'ACTIVE' && row.supplier.deletedAt === null).map(row => {
            const conversion = Number(row.conversionQuantity);
            const price = Number(row.pricePerBaseUnit);
            const purchaseUnit = normalizeUnitString(row.purchaseUnit);
            if (row.ingredientId !== ingredientId || row.conversionTargetUnit !== ingredient.baseUnit || !purchaseUnit ||
                row.conversionQuantity == null || row.pricePerBaseUnit == null ||
                !Number.isFinite(conversion) || conversion <= 0 || !Number.isFinite(price) || price < 0 ||
                (ingredient.baseUnit === 'piece' && !Number.isInteger(conversion))) {
                throw new HttpError(409, 'Invalid supplier ingredient conversion.');
            }
            if ((isKnownUnit(purchaseUnit) || purchaseUnit === ingredient.baseUnit) && !getUnitConversionFactor(purchaseUnit, ingredient.baseUnit).eq(row.conversionQuantity)) {
                throw new HttpError(409, 'Supplier conversion differs from standard unit.');
            }
            return { ...toSupplierIngredientDto(row), purchaseUnit };
        });
    },
    async listSuppliers() { return (await supplierRepository.findSuppliers()).map(toSupplierDto); },
    async getSupplier(id: string) { return toSupplierDto(await ensureSupplier(id)); },
    async createSupplier(input: CreateSupplierInput) {
        return toSupplierDto(await supplierRepository.createSupplier({ name: input.name, email: normalize(input.email), contact: contactFromInput(input), address: normalize(input.address) }));
    },
    async updateSupplier(id: string, input: UpdateSupplierInput) {
        await ensureSupplier(id);
        return toSupplierDto(await supplierRepository.updateSupplier(id, {
            ...(input.name !== undefined ? { name: input.name } : {}),
            ...(input.email !== undefined ? { email: normalize(input.email) } : {}),
            ...(input.phone !== undefined || input.contact !== undefined ? { contact: contactFromInput(input) } : {}),
            ...(input.address !== undefined ? { address: normalize(input.address) } : {}),
            ...(input.status !== undefined ? { status: input.status } : {})
        }));
    },
    async deleteSupplier(id: string) {
        const supplier = await ensureSupplier(id);
        const supplierProductsCount = supplier.products.length + (supplier.ingredients?.length ?? 0);
        const purchaseRequestsCount = await supplierRepository.countPurchaseRequests(id);
        const agentLogsCount = await supplierRepository.countAgentLogs(id);

        if (supplierProductsCount > 0 || purchaseRequestsCount > 0 || agentLogsCount > 0) {
            throw new HttpError(409, 'Không thể xoá nhà cung cấp vì đã có dữ liệu liên quan. Hãy chuyển nhà cung cấp sang trạng thái ngưng hoạt động.', 'SUPPLIER_HAS_RELATIONS');
        }

        return toSupplierDto(await supplierRepository.deleteSupplier(id));
    },

    async listSupplierProducts() {
        const [products, ingredients] = await Promise.all([
            supplierRepository.findSupplierProducts(),
            supplierRepository.findSupplierIngredients()
        ]);
        return [
            ...products.map(toSupplierProductDto),
            ...ingredients.map(toSupplierIngredientDto)
        ];
    },
    async listProductsBySupplier(supplierId: string) {
        await ensureSupplier(supplierId);
        const [products, ingredients] = await Promise.all([
            supplierRepository.findSupplierProductsBySupplier(supplierId),
            supplierRepository.findSupplierIngredientsBySupplier(supplierId)
        ]);
        return [
            ...products.map(toSupplierProductDto),
            ...ingredients.map(toSupplierIngredientDto)
        ];
    },
    async listSuppliersByProduct(productId: string) {
        const ingredient = await supplierRepository.findActiveIngredientById(productId);
        if (ingredient) {
            return (await supplierRepository.findSupplierIngredientsByIngredient(productId)).map(toSupplierIngredientDto);
        }
        await ensureProduct(productId);
        return (await supplierRepository.findSupplierProductsByProduct(productId)).map(toSupplierProductDto);
    },
    async createSupplierProduct(input: CreateSupplierProductInput) {
        await ensureSupplier(input.supplierId);
        const ingredient = await supplierRepository.findActiveIngredientById(input.productId);
        if (ingredient) {
            if (await supplierRepository.findSupplierIngredientByPair(input.supplierId, input.productId)) {
                throw new HttpError(409, 'Nhà cung cấp này đã được gán cho nguyên liệu này.');
            }
            const convQty = input.conversionQuantity && input.conversionQuantity > 0 ? input.conversionQuantity : 1;
            const pricePerBaseUnit = Number(input.price || 0) / convQty;
            try {
                return toSupplierIngredientDto(await supplierRepository.createSupplierIngredient({
                    supplierId: input.supplierId,
                    ingredientId: input.productId,
                    pricePerBaseUnit: new Prisma.Decimal(pricePerBaseUnit),
                    supplierSku: normalize(input.supplierSku),
                    minOrderQuantity: input.minOrderQuantity ?? 1,
                    leadTimeDays: input.leadTimeDays ?? 2,
                    isPreferred: input.isPreferred ?? true,
                    purchaseUnit: normalize(input.purchaseUnit) ?? ingredient.baseUnit,
                    conversionQuantity: new Prisma.Decimal(convQty),
                    conversionTargetUnit: normalize(input.conversionTargetUnit) ?? ingredient.baseUnit
                }));
            } catch (error) {
                if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
                    throw new HttpError(409, 'Nhà cung cấp này đã được gán cho nguyên liệu này.');
                }
                throw error;
            }
        }

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
        const existingIngMapping = await supplierRepository.findSupplierIngredientById(id);
        if (existingIngMapping) {
            const supplierId = input.supplierId ?? existingIngMapping.supplierId;
            const ingredientId = input.productId ?? existingIngMapping.ingredientId;
            await ensureSupplier(supplierId);
            const ingredient = await supplierRepository.findActiveIngredientById(ingredientId);
            if (!ingredient) throw new HttpError(404, 'Ingredient not found.');
            const duplicate = await supplierRepository.findSupplierIngredientByPair(supplierId, ingredientId);
            if (duplicate && duplicate.id !== id) throw new HttpError(409, 'Nhà cung cấp này đã được gán cho nguyên liệu này.');

            const convQty = input.conversionQuantity !== undefined
                ? (input.conversionQuantity && input.conversionQuantity > 0 ? input.conversionQuantity : 1)
                : Number(existingIngMapping.conversionQuantity || 1);
            const packPrice = input.price !== undefined
                ? Number(input.price)
                : Number(existingIngMapping.pricePerBaseUnit || 0) * Number(existingIngMapping.conversionQuantity || 1);
            const pricePerBaseUnit = packPrice / convQty;

            return toSupplierIngredientDto(await supplierRepository.updateSupplierIngredient(id, {
                ...(input.supplierId !== undefined ? { supplierId } : {}),
                ...(input.productId !== undefined ? { ingredientId } : {}),
                pricePerBaseUnit: new Prisma.Decimal(pricePerBaseUnit),
                ...(input.supplierSku !== undefined ? { supplierSku: normalize(input.supplierSku) } : {}),
                ...(input.minOrderQuantity !== undefined ? { minOrderQuantity: input.minOrderQuantity } : {}),
                ...(input.leadTimeDays !== undefined ? { leadTimeDays: input.leadTimeDays } : {}),
                ...(input.isPreferred !== undefined ? { isPreferred: input.isPreferred } : {}),
                ...(input.purchaseUnit !== undefined ? { purchaseUnit: normalize(input.purchaseUnit) ?? ingredient.baseUnit } : {}),
                ...(input.conversionQuantity !== undefined ? { conversionQuantity: new Prisma.Decimal(convQty) } : {}),
                ...(input.conversionTargetUnit !== undefined ? { conversionTargetUnit: normalize(input.conversionTargetUnit) ?? ingredient.baseUnit } : {})
            }));
        }

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
    async deleteSupplierProduct(id: string) {
        const existingIngMapping = await supplierRepository.findSupplierIngredientById(id);
        if (existingIngMapping) {
            return toSupplierIngredientDto(await supplierRepository.deleteSupplierIngredient(id));
        }
        await ensureSupplierProduct(id);
        return toSupplierProductDto(await supplierRepository.deleteSupplierProduct(id));
    }
};
