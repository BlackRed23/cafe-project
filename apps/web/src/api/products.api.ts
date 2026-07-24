import { apiClient, unwrapApiField, unwrapApiList } from "./client";
import type { Product } from "../types/product.types";

const normalizeProduct = (product: any): Product => ({
  ...product,
  image_url: product?.image_url ?? product?.imageUrl,
  category_id: product?.category_id ?? product?.categoryId,
  nutrition_facts: product?.nutrition_facts ?? product?.nutritionFacts,
  nutritionFacts: product?.nutritionFacts ?? product?.nutrition_facts,
  usage_instructions: product?.usage_instructions ?? product?.usageInstructions,
  usageInstructions: product?.usageInstructions ?? product?.usage_instructions,
  storage_instructions: product?.storage_instructions ?? product?.storageInstructions,
  storageInstructions: product?.storageInstructions ?? product?.storage_instructions,
  origin: product?.origin,
  certifications: product?.certifications,
  expiry_info: product?.expiry_info ?? product?.expiryInfo,
  expiryInfo: product?.expiryInfo ?? product?.expiry_info,
});

const normalizeProductPayload = (payload: Partial<Product>) => ({
  ...payload,
  imageUrl: payload.imageUrl ?? payload.image_url,
  categoryId: payload.categoryId ?? payload.category_id,
  nutritionFacts: payload.nutritionFacts ?? payload.nutrition_facts,
  usageInstructions: payload.usageInstructions ?? payload.usage_instructions,
  storageInstructions: payload.storageInstructions ?? payload.storage_instructions,
  origin: payload.origin,
  certifications: payload.certifications,
  expiryInfo: payload.expiryInfo ?? payload.expiry_info,
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
