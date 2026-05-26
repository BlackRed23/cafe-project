import { UploadApiResponse } from 'cloudinary';
import { cloudinary } from '../../common/cloudinary';
import { HttpError } from '../../common/http-error';
import { productRepository, type ProductRecord } from './product.repository';
import type { CreateProductInput, UpdateProductInput } from './product.validator';

const uploadProductImage = async (file: Express.Multer.File): Promise<string> => {
    return new Promise((resolve, reject) => {
        const stream = cloudinary.uploader.upload_stream(
            {
                folder: 'cafe-products',
                resource_type: 'image'
            },
            (error, result?: UploadApiResponse) => {
                if (error) {
                    reject(error);
                    return;
                }

                if (!result?.secure_url) {
                    reject(new HttpError(500, 'Image upload failed.'));
                    return;
                }

                resolve(result.secure_url);
            }
        );

        stream.end(file.buffer);
    });
};

const ensureProductExists = async (id: string): Promise<ProductRecord> => {
    const product = await productRepository.findById(id);

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

const normalizeDescription = (description: string | null | undefined): string | null | undefined => {
    if (description === undefined) {
        return undefined;
    }

    if (description === null || description === '') {
        return null;
    }

    return description;
};

export const getProducts = async (): Promise<ProductRecord[]> => {
    return productRepository.findMany();
};

export const getProductById = async (id: string): Promise<ProductRecord> => {
    return ensureProductExists(id);
};

export const createProduct = async (
    input: CreateProductInput,
    image?: Express.Multer.File
): Promise<ProductRecord> => {
    await ensureCategoryExists(input.categoryId);

    const imageUrl = image ? await uploadProductImage(image) : undefined;

    return productRepository.create({
        name: input.name,
        description: normalizeDescription(input.description),
        price: input.price,
        categoryId: input.categoryId,
        imageUrl
    });
};

export const updateProduct = async (
    id: string,
    input: UpdateProductInput,
    image?: Express.Multer.File
): Promise<ProductRecord> => {
    await ensureProductExists(id);

    if (input.categoryId) {
        await ensureCategoryExists(input.categoryId);
    }

    const imageUrl = image ? await uploadProductImage(image) : undefined;

    return productRepository.update(id, {
        ...input,
        description: normalizeDescription(input.description),
        ...(imageUrl ? { imageUrl } : {})
    });
};

export const deleteProduct = async (id: string): Promise<ProductRecord> => {
    await ensureProductExists(id);

    return productRepository.delete(id);
};
