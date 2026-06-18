import { Prisma } from '@cafe-project/database';
import { deleteCloudinaryImage, extractCloudinaryPublicId } from '../../common/cloudinary';
import { HttpError } from '../../common/http-error';
import { productRepository, type ProductRecord } from './product.repository';
import type { CreateProductInput, UpdateProductInput } from './product.validator';

export type ProductDto = {
    id: string;
    name: string;
    sku: string;
    description: string | null;
    price: number;
    costPrice: number;
    unit: string;
    imageUrl: string | null;
    isActive: boolean;
    categoryId: string;
    category: {
        id: string;
        name: string;
        description: string | null;
    };
    inventory: {
        quantity: number;
        minThreshold: number;
        unit: string;
    } | null;
    inventoryQuantity: number | null;
    deletedAt: Date | null;
    pendingDeleteUntil: Date | null;
    createdAt: Date;
    updatedAt: Date;
};

const toProductDto = (product: ProductRecord): ProductDto => ({
    id: product.id,
    name: product.name,
    sku: product.sku,
    description: product.description,
    price: Number(product.price),
    costPrice: Number(product.costPrice),
    unit: product.unit,
    imageUrl: product.imageUrl,
    isActive: product.isActive,
    categoryId: product.categoryId,
    category: {
        id: product.category.id,
        name: product.category.name,
        description: product.category.description
    },
    inventory: product.inventory
        ? {
              quantity: product.inventory.quantity,
              minThreshold: product.inventory.minThreshold,
              unit: product.inventory.unit
          }
        : null,
    inventoryQuantity: product.inventory?.quantity ?? null,
    deletedAt: (product as any).deletedAt ?? null,
    pendingDeleteUntil: (product as any).pendingDeleteUntil ?? null,
    createdAt: product.createdAt,
    updatedAt: product.updatedAt
});

const normalizeOptionalString = (value: string | null | undefined): string | null | undefined => {
    if (value === undefined) return undefined;
    if (value === null || value === '') return null;

    return value;
};

const MAX_SKU_LENGTH = 100;

const normalizeSkuInput = (value: string | null | undefined): string | undefined => {
    const sku = value?.trim();

    return sku || undefined;
};

const createSkuBase = (name: string): string => {
    const base = name
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toUpperCase()
        .replace(/[^A-Z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '');

    return base.slice(0, MAX_SKU_LENGTH).replace(/-+$/g, '') || 'PRODUCT';
};

const ensureProductExists = async (id: string, includeInactive = false): Promise<ProductRecord> => {
    const product = await productRepository.findById(id, includeInactive);

    if (!product) {
        throw new HttpError(404, 'Product not found.');
    }

    return product;
};

const ensureCategoryExists = async (categoryId: string): Promise<void> => {
    const exists = await productRepository.categoryExists(categoryId);

    if (!exists) {
        throw new HttpError(404, 'Category not found.');
    }
};

const ensureUniqueSku = async (sku: string, ignoreId?: string): Promise<void> => {
    const product = await productRepository.findBySku(sku);

    if (product && product.id !== ignoreId) {
        throw new HttpError(409, 'Product SKU already exists.');
    }
};

const generateUniqueSku = async (name: string, ignoreId?: string): Promise<string> => {
    const base = createSkuBase(name);
    let suffix = 1;

    while (true) {
        const suffixPart = suffix === 1 ? '' : `-${suffix}`;
        const prefix = base.slice(0, MAX_SKU_LENGTH - suffixPart.length).replace(/-+$/g, '') || 'PRODUCT';
        const sku = `${prefix}${suffixPart}`;
        const existing = await productRepository.findBySku(sku);

        if (!existing || existing.id === ignoreId) {
            return sku;
        }

        suffix += 1;
    }
};

const getDeleteBlockedMessage = async (productId: string): Promise<string | null> => {
    const blockers = await productRepository.getDeleteBlockers(productId);
    const hasOrderItems = blockers.orderItems > 0;
    const hasInventoryTransactions = blockers.inventoryTransactions > 0;
    const hasPurchaseRequestItems = blockers.purchaseRequestItems > 0;
    const blockerCount = [hasOrderItems, hasInventoryTransactions, hasPurchaseRequestItems].filter(Boolean).length;

    if (blockerCount > 1) {
        return 'Không thể xóa sản phẩm vì đã phát sinh đơn hàng, lịch sử kho hoặc yêu cầu nhập hàng.';
    }

    if (hasOrderItems) {
        return 'Không thể xóa sản phẩm vì sản phẩm này đã có trong đơn hàng.';
    }

    if (hasInventoryTransactions) {
        return 'Không thể xóa sản phẩm vì sản phẩm này đã có lịch sử nhập/xuất kho.';
    }

    if (hasPurchaseRequestItems) {
        return 'Không thể xóa sản phẩm vì sản phẩm này đã có trong yêu cầu nhập hàng.';
    }

    return null;
};

const deleteProductImageForPurge = async (product: ProductRecord): Promise<void> => {
    if (!product.imageUrl) {
        return;
    }

    const publicId = extractCloudinaryPublicId(product.imageUrl);

    if (!publicId) {
        console.warn(`[product] Cannot extract Cloudinary public_id for product ${product.id}; image cleanup skipped.`);
        return;
    }

    try {
        await deleteCloudinaryImage(publicId);
    } catch (error: any) {
        console.error(`[product] Failed to delete Cloudinary image for product ${product.id}. Reason: ${error.message}`);
        throw new HttpError(502, error.message || 'Failed to delete product image from Cloudinary.');
    }
};

export const getProducts = async (includeInactive = false): Promise<ProductDto[]> => {
    const products = await productRepository.findMany(includeInactive);

    return products.map(toProductDto);
};

export const getProductById = async (id: string): Promise<ProductDto> => {
    return toProductDto(await ensureProductExists(id));
};

export const createProduct = async (input: CreateProductInput): Promise<ProductDto> => {
    await ensureCategoryExists(input.categoryId);
    const sku = normalizeSkuInput(input.sku) ?? (await generateUniqueSku(input.name));

    await ensureUniqueSku(sku);

    try {
        const product = await productRepository.create({
            name: input.name,
            sku,
            description: normalizeOptionalString(input.description),
            price: input.price,
            costPrice: input.costPrice ?? 0,
            unit: input.unit?.trim() || 'Ly',
            categoryId: input.categoryId,
            imageUrl: normalizeOptionalString(input.imageUrl),
            isActive: input.isActive ?? true
        });

        return toProductDto(product);
    } catch (error) {
        if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
            throw new HttpError(409, 'Product SKU already exists.');
        }

        throw error;
    }
};

export const updateProduct = async (id: string, input: UpdateProductInput): Promise<ProductDto> => {
    const product = await ensureProductExists(id, true);

    if (input.categoryId) {
        await ensureCategoryExists(input.categoryId);
    }

    if (input.sku) {
        await ensureUniqueSku(input.sku, product.id);
    }

    const sku = input.sku !== undefined ? normalizeSkuInput(input.sku) ?? (await generateUniqueSku(input.name ?? product.name, product.id)) : undefined;

    try {
        const updatedProduct = await productRepository.update(id, {
            ...(input.name !== undefined ? { name: input.name } : {}),
            ...(sku !== undefined ? { sku } : {}),
            ...(input.description !== undefined ? { description: normalizeOptionalString(input.description) } : {}),
            ...(input.price !== undefined ? { price: input.price } : {}),
            ...(input.costPrice !== undefined ? { costPrice: input.costPrice } : {}),
            ...(input.unit !== undefined ? { unit: input.unit.trim() || 'Ly' } : {}),
            ...(input.isActive !== undefined ? { isActive: input.isActive } : {}),
            ...(input.categoryId !== undefined ? { categoryId: input.categoryId } : {}),
            ...(input.imageUrl !== undefined ? { imageUrl: normalizeOptionalString(input.imageUrl) } : {})
        });

        return toProductDto(updatedProduct);
    } catch (error) {
        if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
            throw new HttpError(409, 'Product SKU already exists.');
        }

        throw error;
    }
};

export const deleteProduct = async (id: string): Promise<ProductDto> => {
    const product = await ensureProductExists(id, true);
    const blockedMessage = await getDeleteBlockedMessage(id);

    if (blockedMessage) {
        throw new HttpError(409, blockedMessage);
    }

    return toProductDto(await productRepository.delete(id));
};

export const scheduleDelete = async (id: string): Promise<ProductDto> => {
    await ensureProductExists(id, true);

    const pendingDeleteUntil = new Date();
    pendingDeleteUntil.setDate(pendingDeleteUntil.getDate() + 7);

    const updatedProduct = await productRepository.update(id, {
        isActive: false,
        // @ts-ignore
        deletedAt: new Date(),
        // @ts-ignore
        pendingDeleteUntil
    });

    return toProductDto(updatedProduct);
};

export const restore = async (id: string): Promise<ProductDto> => {
    await ensureProductExists(id, true);

    const updatedProduct = await productRepository.update(id, {
        isActive: true,
        // @ts-ignore
        deletedAt: null,
        // @ts-ignore
        pendingDeleteUntil: null
    });

    return toProductDto(updatedProduct);
};

export const purge = async (id: string): Promise<ProductDto> => {
    const product = await ensureProductExists(id, true);

    if (!product.pendingDeleteUntil || new Date(product.pendingDeleteUntil) > new Date()) {
        throw new HttpError(400, 'Sản phẩm chỉ có thể xoá vĩnh viễn sau 7 ngày.');
    }

    const blockedMessage = await getDeleteBlockedMessage(id);
    if (blockedMessage) {
        throw new HttpError(409, blockedMessage);
    }

    await deleteProductImageForPurge(product);

    return toProductDto(await productRepository.delete(id));
};
