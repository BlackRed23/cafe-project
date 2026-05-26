import apiClient from '../api/axios';
import type { Category } from './category.service';

export type Product = {
    id: string;
    name: string;
    description: string | null;
    imageUrl: string | null;
    price: number;
    isActive: boolean;
    categoryId: string;
    category?: Category;
    createdAt: string;
    updatedAt: string;
};

export type ProductPayload = {
    name: string;
    description?: string | null;
    price: number;
    categoryId: string;
    image?: File | null;
};

type ApiResponse<T> = {
    success: boolean;
    message: string;
    data: T;
};

const toProductFormData = (payload: Partial<ProductPayload>): FormData => {
    const formData = new FormData();

    if (payload.name !== undefined) formData.append('name', payload.name);
    if (payload.description !== undefined) formData.append('description', payload.description ?? '');
    if (payload.price !== undefined) formData.append('price', String(payload.price));
    if (payload.categoryId !== undefined) formData.append('categoryId', payload.categoryId);
    if (payload.image) formData.append('image', payload.image);

    return formData;
};

export const getProducts = async (): Promise<Product[]> => {
    const response = await apiClient.get<ApiResponse<{ products: Product[] }>>('/products');

    return response.data.data.products;
};

export const getProductById = async (id: string): Promise<Product> => {
    const response = await apiClient.get<ApiResponse<{ product: Product }>>(`/products/${id}`);

    return response.data.data.product;
};

export const createProduct = async (payload: ProductPayload): Promise<Product> => {
    const response = await apiClient.post<ApiResponse<{ product: Product }>>('/products', toProductFormData(payload));

    return response.data.data.product;
};

export const updateProduct = async (id: string, payload: Partial<ProductPayload>): Promise<Product> => {
    const response = await apiClient.patch<ApiResponse<{ product: Product }>>(`/products/${id}`, toProductFormData(payload));

    return response.data.data.product;
};

export const deleteProduct = async (id: string): Promise<Product> => {
    const response = await apiClient.delete<ApiResponse<{ product: Product }>>(`/products/${id}`);

    return response.data.data.product;
};
