import { apiClient, unwrapApiField, unwrapApiList } from "./client";
import type { Product } from "../types/product.types";

const normalizeProduct = (product: any): Product => ({
  ...product,
  image_url: product?.image_url ?? product?.imageUrl,
  category_id: product?.category_id ?? product?.categoryId,
});

const normalizeProductPayload = (payload: Partial<Product>) => ({
  ...payload,
  imageUrl: payload.imageUrl ?? payload.image_url,
  categoryId: payload.categoryId ?? payload.category_id,
});

export const productsApi = {
  getProducts: async (params?: { includeInactive?: boolean }): Promise<Product[]> => {
    const response = await apiClient.get("/products", { params });
    return unwrapApiList<any>(response.data, "products").map(normalizeProduct);
  },

  getProductById: async (id: string): Promise<Product> => {
    const response = await apiClient.get(`/products/${id}`);
    return normalizeProduct(unwrapApiField<any>(response.data, "product"));
  },

  createProduct: async (payload: Partial<Product>): Promise<Product> => {
    const response = await apiClient.post("/products", normalizeProductPayload(payload));
    return normalizeProduct(unwrapApiField<any>(response.data, "product"));
  },

  updateProduct: async (id: string, payload: Partial<Product>): Promise<Product> => {
    const response = await apiClient.put(`/products/${id}`, normalizeProductPayload(payload));
    return normalizeProduct(unwrapApiField<any>(response.data, "product"));
  },

  deleteProduct: async (id: string): Promise<void> => {
    await apiClient.delete(`/products/${id}`);
  },

  scheduleDeleteProduct: async (id: string): Promise<Product> => {
    const response = await apiClient.patch(`/products/${id}/schedule-delete`);
    return normalizeProduct(unwrapApiField<any>(response.data, "product"));
  },

  restoreProduct: async (id: string): Promise<Product> => {
    const response = await apiClient.patch(`/products/${id}/restore`);
    return normalizeProduct(unwrapApiField<any>(response.data, "product"));
  },

  purgeProduct: async (id: string): Promise<void> => {
    await apiClient.delete(`/products/${id}/purge`);
  },
};
