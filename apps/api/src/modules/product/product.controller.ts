import type { Request, Response } from 'express';
import { sendSuccess } from '../../common/response';
import { createProduct, deleteProduct, getProductById, getProducts, updateProduct, scheduleDelete, restore, purge } from './product.service';
import type { CreateProductInput, UpdateProductInput } from './product.validator';

export const listProducts = async (req: Request, res: Response): Promise<void> => {
    const includeInactive = req.query.includeInactive === 'true';
    const products = await getProducts(includeInactive);

    sendSuccess(res, 200, 'Get products successfully.', { products });
};

export const findProduct = async (req: Request, res: Response): Promise<void> => {
    const product = await getProductById(req.params.id);

    sendSuccess(res, 200, 'Get product successfully.', { product });
};

export const storeProduct = async (req: Request, res: Response): Promise<void> => {
    const product = await createProduct(req.body as CreateProductInput);

    sendSuccess(res, 201, 'Create product successfully.', { product });
};

export const patchProduct = async (req: Request, res: Response): Promise<void> => {
    const product = await updateProduct(req.params.id, req.body as UpdateProductInput);

    sendSuccess(res, 200, 'Update product successfully.', { product });
};

export const removeProduct = async (req: Request, res: Response): Promise<void> => {
    const product = await deleteProduct(req.params.id);

    sendSuccess(res, 200, 'Delete product successfully.', { product });
};

export const scheduleDeleteProduct = async (req: Request, res: Response): Promise<void> => {
    const product = await scheduleDelete(req.params.id);

    sendSuccess(res, 200, 'Product scheduled for deletion.', { product });
};

export const restoreProduct = async (req: Request, res: Response): Promise<void> => {
    const product = await restore(req.params.id);

    sendSuccess(res, 200, 'Product restored successfully.', { product });
};

export const purgeProduct = async (req: Request, res: Response): Promise<void> => {
    const product = await purge(req.params.id);

    sendSuccess(res, 200, 'Product purged successfully.', { product });
};
