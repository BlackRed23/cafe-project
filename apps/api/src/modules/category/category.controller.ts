import type { Request, Response } from 'express';
import { sendSuccess } from '../../common/response';
import { createCategory, deleteCategory, getCategories, getCategoryById, updateCategory } from './category.service';
import type { CreateCategoryInput, UpdateCategoryInput } from './category.validator';

export const listCategories = async (_req: Request, res: Response): Promise<void> => {
    const categories = await getCategories();

    sendSuccess(res, 200, 'Get categories successfully.', { categories });
};

export const findCategory = async (req: Request, res: Response): Promise<void> => {
    const category = await getCategoryById(req.params.id);

    sendSuccess(res, 200, 'Get category successfully.', { category });
};

export const storeCategory = async (req: Request, res: Response): Promise<void> => {
    const category = await createCategory(req.body as CreateCategoryInput);

    sendSuccess(res, 201, 'Create category successfully.', { category });
};

export const patchCategory = async (req: Request, res: Response): Promise<void> => {
    const category = await updateCategory(req.params.id, req.body as UpdateCategoryInput);

    sendSuccess(res, 200, 'Update category successfully.', { category });
};

export const removeCategory = async (req: Request, res: Response): Promise<void> => {
    const category = await deleteCategory(req.params.id);

    sendSuccess(res, 200, 'Delete category successfully.', { category });
};