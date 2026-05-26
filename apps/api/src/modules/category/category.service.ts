import { Prisma } from '@cafe-project/database';
import { HttpError } from '../../common/http-error';
import { categoryRepository, type CategoryRecord } from './category.repository';
import type { CreateCategoryInput, UpdateCategoryInput } from './category.validator';

const ensureCategoryExists = async (id: string): Promise<CategoryRecord> => {
    const category = await categoryRepository.findById(id);

    if (!category) {
        throw new HttpError(404, 'Category not found.');
    }

    return category;
};

const ensureUniqueName = async (name: string, ignoreId?: string): Promise<void> => {
    const category = await categoryRepository.findByName(name);

    if (category && category.id !== ignoreId) {
        throw new HttpError(409, 'Category name already exists.');
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

export const getCategories = async (): Promise<CategoryRecord[]> => {
    return categoryRepository.findMany();
};

export const getCategoryById = async (id: string): Promise<CategoryRecord> => {
    return ensureCategoryExists(id);
};

export const createCategory = async (input: CreateCategoryInput): Promise<CategoryRecord> => {
    await ensureUniqueName(input.name);

    try {
        return await categoryRepository.create({
            name: input.name,
            description: normalizeDescription(input.description)
        });
    } catch (error) {
        if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
            throw new HttpError(409, 'Category name already exists.');
        }

        throw error;
    }
};

export const updateCategory = async (id: string, input: UpdateCategoryInput): Promise<CategoryRecord> => {
    const category = await ensureCategoryExists(id);

    if (input.name) {
        await ensureUniqueName(input.name, category.id);
    }

    try {
        return await categoryRepository.update(id, {
            ...input,
            description: normalizeDescription(input.description)
        });
    } catch (error) {
        if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
            throw new HttpError(409, 'Category name already exists.');
        }

        throw error;
    }
};

export const deleteCategory = async (id: string): Promise<CategoryRecord> => {
    await ensureCategoryExists(id);

    const hasProducts = await categoryRepository.hasProducts(id);

    if (hasProducts) {
        throw new HttpError(409, 'Cannot delete category with active products.');
    }

    return categoryRepository.delete(id);
};
