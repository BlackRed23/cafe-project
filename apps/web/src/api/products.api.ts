import { apiClient, unwrapApiField } from "./client";
import type { Product, ProductWritePayload, ProductUpdatePayload } from "../types/product.types";

const normalizeProduct = (product: Product): Product => ({
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

const normalizeProductPayload = (payload: ProductWritePayload) => ({
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
    const products = unwrapApiField<Product[]>(response.data, "products");
    if (response.data?.success === false || !Array.isArray(products)) throw new Error("Product list not confirmed");
    return products.map(normalizeProduct);
  },

  getProductById: async (id: string): Promise<Product> => {
    const response = await apiClient.get(`/products/${id}`);
    const product = unwrapApiField<Product>(response.data, "product");
    if (response.data?.success === false || !product?.id) throw new Error("Product response not confirmed");
    return normalizeProduct(product);
  },

  createProduct: async (payload: ProductWritePayload): Promise<Product> => {
    const response = await apiClient.post("/products", normalizeProductPayload(payload));
    const product = unwrapApiField<Product>(response.data, "product");
    if (response.data?.success === false || !product?.id) throw new Error("Product response not confirmed");
    return normalizeProduct(product);
  },

  updateProduct: async (id: string, payload: ProductUpdatePayload): Promise<Product> => {
    if (!payload.expectedUpdatedAt) throw new Error("Product version required");
    const response = await apiClient.put(`/products/${id}`, normalizeProductPayload(payload));
    const product = unwrapApiField<Product>(response.data, "product");
    if (response.data?.success === false || !product?.id) throw new Error("Product response not confirmed");
    return normalizeProduct(product);
  },

  deleteProduct: async (id: string): Promise<void> => {
    const response = await apiClient.delete(`/products/${id}`);
    if (response.data?.success === false || !unwrapApiField<Product>(response.data, "product")?.id) throw new Error("Product deletion not confirmed");
  },

  scheduleDeleteProduct: async (id: string): Promise<Product> => {
    const response = await apiClient.patch(`/products/${id}/schedule-delete`);
    const product = unwrapApiField<Product>(response.data, "product");
    if (response.data?.success === false || !product?.id) throw new Error("Product response not confirmed");
    return normalizeProduct(product);
  },

  restoreProduct: async (id: string): Promise<Product> => {
    const response = await apiClient.patch(`/products/${id}/restore`);
    const product = unwrapApiField<Product>(response.data, "product");
    if (response.data?.success === false || !product?.id) throw new Error("Product response not confirmed");
    return normalizeProduct(product);
  },

  purgeProduct: async (id: string): Promise<void> => {
    const response = await apiClient.delete(`/products/${id}/purge`);
    if (response.data?.success === false || !unwrapApiField<Product>(response.data, "product")?.id) throw new Error("Product deletion not confirmed");
  },
};
