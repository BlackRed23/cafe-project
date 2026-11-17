import { apiClient, unwrapApiData } from "./client";
import type {
  Recipe,
  CreateRecipePayload,
  PreviewRecipeCostPayload,
  PreviewRecipeCostResponse,
} from "../types/recipe.types";

function confirmed<T>(envelope: { success?: boolean; data?: T }, validate: (value: T) => boolean): T {
  const data = unwrapApiData<T>(envelope);
  if (envelope?.success !== true || !data || !validate(data)) throw new Error("Recipe response not confirmed");
  return data;
}
const isRecipe = (value: Recipe): boolean => typeof value.id === "string" && typeof value.version === "number" && Array.isArray(value.ingredients) && !!value.costSummary;

export const recipesApi = {
  getRecipesByProduct: async (productId: string): Promise<Recipe[]> => {
    const response = await apiClient.get(`/products/${productId}/recipes`);
    return confirmed<Recipe[]>(response.data, value => Array.isArray(value) && value.every(isRecipe));
  },

  getActiveRecipe: async (productId: string): Promise<Recipe> => {
    const response = await apiClient.get(`/products/${productId}/recipes/active`);
    return confirmed<Recipe>(response.data, isRecipe);
  },

  previewRecipeCost: async (
    productId: string,
    payload: PreviewRecipeCostPayload
  ): Promise<PreviewRecipeCostResponse> => {
    const response = await apiClient.post(`/products/${productId}/recipes/cost-preview`, payload);
    return confirmed<PreviewRecipeCostResponse>(response.data, value => Array.isArray(value.breakdown) && Number.isFinite(value.unitCost) && Number.isFinite(value.totalBatchCost));
  },

  createRecipeVersion: async (
    productId: string,
    payload: CreateRecipePayload
  ): Promise<Recipe> => {
    const response = await apiClient.post(`/products/${productId}/recipes`, payload);
    return confirmed<Recipe>(response.data, isRecipe);
  },

  activateRecipeVersion: async (
    productId: string,
    recipeId: string
  ): Promise<Recipe> => {
    const response = await apiClient.post(
      `/products/${productId}/recipes/${recipeId}/activate`, {}
    );
    return confirmed<Recipe>(response.data, isRecipe);
  },
};
