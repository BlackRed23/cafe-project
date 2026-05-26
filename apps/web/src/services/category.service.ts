import apiClient from '../api/axios';

export type Category = {
    id: string;
    name: string;
    description: string | null;
    createdAt: string;
    updatedAt: string;
};

export type CategoryPayload = {
    name: string;
    description?: string | null;
};

type ApiResponse<T> = {
    success: boolean;
    message: string;
    data: T;
};

export const getCategories = async (): Promise<Category[]> => {
    const response = await apiClient.get<ApiResponse<{ categories: Category[] }>>('/categories');

    return response.data.data.categories;
};

export const getCategoryById = async (id: string): Promise<Category> => {
    const response = await apiClient.get<ApiResponse<{ category: Category }>>(`/categories/${id}`);

    return response.data.data.category;
};

export const createCategory = async (payload: CategoryPayload): Promise<Category> => {
    const response = await apiClient.post<ApiResponse<{ category: Category }>>('/categories', payload);

    return response.data.data.category;
};

export const updateCategory = async (id: string, payload: Partial<CategoryPayload>): Promise<Category> => {
    const response = await apiClient.patch<ApiResponse<{ category: Category }>>(`/categories/${id}`, payload);

    return response.data.data.category;
};

export const deleteCategory = async (id: string): Promise<Category> => {
    const response = await apiClient.delete<ApiResponse<{ category: Category }>>(`/categories/${id}`);

    return response.data.data.category;
};
