import { apiClient, unwrapApiData } from "./client";
import type {
  Ingredient,
  IngredientTransaction,
  CreateIngredientPayload,
  ImportIngredientPayload,
  WasteIngredientPayload,
} from "../types/ingredient.types";

export const ingredientsApi = {
  getIngredients: async (params?: {
    search?: string;
    categoryId?: string;
    lowStock?: boolean;
    includeInactive?: boolean;
  }): Promise<Ingredient[]> => {
    const query: Record<string, string> = {};
    if (params?.search) query.search = params.search;
    if (params?.categoryId) query.categoryId = params.categoryId;
    if (params?.lowStock) query.lowStock = "true";
    if (params?.includeInactive) query.includeInactive = "true";

    const response = await apiClient.get("/ingredients", { params: query });
    return unwrapApiData<Ingredient[]>(response.data) ?? [];
  },

  getIngredientById: async (id: string): Promise<Ingredient> => {
    const response = await apiClient.get(`/ingredients/${id}`);
    return unwrapApiData<Ingredient>(response.data);
  },

  getTransactions: async (id: string): Promise<IngredientTransaction[]> => {
    const response = await apiClient.get(`/ingredients/${id}/transactions`);
    return unwrapApiData<IngredientTransaction[]>(response.data) ?? [];
  },

  createIngredient: async (payload: CreateIngredientPayload): Promise<Ingredient> => {
    const response = await apiClient.post("/ingredients", payload);
    return unwrapApiData<Ingredient>(response.data);
  },

  updateIngredient: async (
    id: string,
    payload: Partial<CreateIngredientPayload>
  ): Promise<Ingredient> => {
    const response = await apiClient.patch(`/ingredients/${id}`, payload);
    return unwrapApiData<Ingredient>(response.data);
  },

  deleteIngredient: async (id: string): Promise<Ingredient> => {
    const response = await apiClient.delete(`/ingredients/${id}`);
    return unwrapApiData<Ingredient>(response.data);
  },

  importStock: async (id: string, payload: ImportIngredientPayload) => {
    const response = await apiClient.post(`/ingredients/${id}/import`, payload);
    return unwrapApiData<{
      ingredient: Ingredient;
      batch: {
        id: string;
        batchCode: string;
        importedQuantityBase: number;
        unitCostPerBase: number;
        totalCost: number;
      };
      recalculatedProductCount: number;
    }>(response.data);
  },

  recordWaste: async (id: string, payload: WasteIngredientPayload) => {
    const response = await apiClient.post(`/ingredients/${id}/waste`, payload);
    return unwrapApiData<{
      ingredient: Ingredient;
      wastedQuantityBase: number;
      totalWasteCost: number;
    }>(response.data);
  },
};
