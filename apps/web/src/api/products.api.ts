import { apiClient, USE_MOCK } from "./client";
import type { Product } from "../types/product.types";
import { MockDB } from "./mockDb";

export const productsApi = {
  getProducts: async (): Promise<Product[]> => {
    if (USE_MOCK) {
      return MockDB.getProducts();
    }
    const response = await apiClient.get("/products");
    return response.data.data.products;
  },

  getProductById: async (id: string): Promise<Product> => {
    if (USE_MOCK) {
      const prod = MockDB.getProduct(id);
      if (prod) return prod;
      throw new Error("Không tìm thấy sản phẩm");
    }
    const response = await apiClient.get(`/products/${id}`);
    return response.data.data.product;
  },

  createProduct: async (payload: Partial<Product>): Promise<Product> => {
    if (USE_MOCK) {
      return MockDB.createProduct(payload);
    }
    const response = await apiClient.post<Product>("/products", payload);
    return response.data;
  },

  updateProduct: async (id: string, payload: Partial<Product>): Promise<Product> => {
    if (USE_MOCK) {
      return MockDB.updateProduct(id, payload);
    }
    const response = await apiClient.put<Product>(`/products/${id}`, payload);
    return response.data;
  },

  deleteProduct: async (id: string): Promise<void> => {
    if (USE_MOCK) {
      MockDB.deleteProduct(id);
      return;
    }
    await apiClient.delete(`/products/${id}`);
  },
};
