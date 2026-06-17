import { apiClient, unwrapApiField, unwrapApiList } from "./client";
import type { Category } from "../types/category.types";

export const categoriesApi = {
  getCategories: async (): Promise<Category[]> => {
    const response = await apiClient.get("/categories");
    return unwrapApiList<Category>(response.data, "categories");
  },

  getCategoryById: async (id: string): Promise<Category> => {
    const response = await apiClient.get(`/categories/${id}`);
    return unwrapApiField<Category>(response.data, "category");
  },

  createCategory: async (payload: Partial<Category>): Promise<Category> => {
    const response = await apiClient.post("/categories", payload);
    return unwrapApiField<Category>(response.data, "category");
  },

  updateCategory: async (id: string, payload: Partial<Category>): Promise<Category> => {
    const response = await apiClient.put(`/categories/${id}`, payload);
    return unwrapApiField<Category>(response.data, "category");
  },

  deleteCategory: async (id: string): Promise<void> => {
    await apiClient.delete(`/categories/${id}`);
  },
};
