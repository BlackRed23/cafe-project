import { apiClient, USE_MOCK } from "./client";
import type { Category } from "../types/category.types";
import { MockDB } from "./mockDb";

export const categoriesApi = {
  getCategories: async (): Promise<Category[]> => {
    if (USE_MOCK) {
      return MockDB.getCategories();
    }
    const response = await apiClient.get("/categories");
    return response.data.data.categories;
  },

  getCategoryById: async (id: string): Promise<Category> => {
    if (USE_MOCK) {
      const cat = MockDB.getCategory(id);
      if (cat) return cat;
      throw new Error("Không tìm thấy danh mục");
    }
    const response = await apiClient.get(`/categories/${id}`);
    return response.data.data.category;
  },

  createCategory: async (payload: Partial<Category>): Promise<Category> => {
    if (USE_MOCK) {
      return MockDB.createCategory(payload);
    }
    const response = await apiClient.post<Category>("/categories", payload);
    return response.data;
  },

  updateCategory: async (id: string, payload: Partial<Category>): Promise<Category> => {
    if (USE_MOCK) {
      return MockDB.updateCategory(id, payload);
    }
    const response = await apiClient.put<Category>(`/categories/${id}`, payload);
    return response.data;
  },

  deleteCategory: async (id: string): Promise<void> => {
    if (USE_MOCK) {
      MockDB.deleteCategory(id);
      return;
    }
    await apiClient.delete(`/categories/${id}`);
  },
};
