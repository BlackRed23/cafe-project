import { Prisma, type Category } from '@cafe-project/database';
import { HttpError } from '../../common/http-error';
import { categoryRepository } from './category.repository';
import type { CreateCategoryInput, UpdateCategoryInput } from './category.validator';

export type CategoryDto = Pick<Category, 'id' | 'name' | 'description' | 'createdAt' | 'updatedAt'>;

const toCategoryDto = (category: Category): CategoryDto => ({
    id: category.id,
    name: category.name,
    description: category.description,
    createdAt: category.createdAt,
    updatedAt: category.updatedAt
});

const normalizeDescription = (description: string | null | undefined): string | null | undefined => {
    if (description === undefined) return undefined;
    if (description === null || description === '') return null;

    return description;
};

const ensureCategoryExists = async (id: string): Promise<Category> => {
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

export const getCategories = async (): Promise<CategoryDto[]> => {
    const categories = await categoryRepository.findMany();

    return categories.map(toCategoryDto);
};

export const getCategoryById = async (id: string): Promise<CategoryDto> => {
    return toCategoryDto(await ensureCategoryExists(id));
};

export const createCategory = async (input: CreateCategoryInput): Promise<CategoryDto> => {
    await ensureUniqueName(input.name);

    try {
        const category = await categoryRepository.create({
            name: input.name,
            description: normalizeDescription(input.description)
        });

        return toCategoryDto(category);
    } catch (error) {
        if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
            throw new HttpError(409, 'Category name already exists.');
        }

        throw error;
    }
};

export const updateCategory = async (id: string, input: UpdateCategoryInput): Promise<CategoryDto> => {
    const category = await ensureCategoryExists(id);

    if (input.name) {
        await ensureUniqueName(input.name, category.id);
    }

    try {
        const updatedCategory = await categoryRepository.update(id, {
            ...(input.name !== undefined ? { name: input.name } : {}),
            ...(input.description !== undefined ? { description: normalizeDescription(input.description) } : {})
        });

        return toCategoryDto(updatedCategory);
    } catch (error) {
        if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
            throw new HttpError(409, 'Category name already exists.');
        }

        throw error;
    }
};

export const deleteCategory = async (id: string): Promise<CategoryDto> => {
    const category = await ensureCategoryExists(id);
    const productCount = await categoryRepository.countProducts(category.id);

    if (productCount > 0) {
        throw new HttpError(400, 'Không thể xoá danh mục vì vẫn còn sản phẩm thuộc danh mục này. Hãy chuyển sản phẩm sang danh mục khác trước.');
    }

    return toCategoryDto(await categoryRepository.delete(category.id));
};
