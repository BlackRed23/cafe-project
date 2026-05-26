import type { Request, Response } from 'express';
import { sendSuccess } from '../../common/response';
import {
    createProduct,
    deleteProduct,
    getProductById,
    getProducts,
    updateProduct
} from './product.service';
import type { CreateProductInput, UpdateProductInput } from './product.validator';

export const listProducts = async (_req: Request, res: Response): Promise<void> => {
    const products = await getProducts();

    sendSuccess(res, 200, 'Get products successfully.', { products });
};

export const findProduct = async (req: Request, res: Response): Promise<void> => {
    const product = await getProductById(req.params.id);

    sendSuccess(res, 200, 'Get product successfully.', { product });
};

export const storeProduct = async (req: Request, res: Response): Promise<void> => {
    const product = await createProduct(req.body as CreateProductInput, req.file);

    sendSuccess(res, 201, 'Create product successfully.', { product });
};

export const patchProduct = async (req: Request, res: Response): Promise<void> => {
    const product = await updateProduct(req.params.id, req.body as UpdateProductInput, req.file);

    sendSuccess(res, 200, 'Update product successfully.', { product });
};

export const removeProduct = async (req: Request, res: Response): Promise<void> => {
    const product = await deleteProduct(req.params.id);

    sendSuccess(res, 200, 'Delete product successfully.', { product });
};
