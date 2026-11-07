import { apiClient, unwrapApiData } from "./client";
import type {
  Recipe,
  CreateRecipePayload,
  PreviewRecipeCostPayload,
  PreviewRecipeCostResponse,
} from "../types/recipe.types";

export const recipesApi = {
  getRecipesByProduct: async (productId: string): Promise<Recipe[]> => {
    const response = await apiClient.get(`/products/${productId}/recipes`);
    return unwrapApiData<Recipe[]>(response.data) ?? [];
  },

  getActiveRecipe: async (productId: string): Promise<Recipe | null> => {
    const response = await apiClient.get(`/products/${productId}/recipes/active`);
    return unwrapApiData<Recipe | null>(response.data);
  },

  previewRecipeCost: async (
    productId: string,
    payload: PreviewRecipeCostPayload
  ): Promise<PreviewRecipeCostResponse> => {
    const response = await apiClient.post(`/products/${productId}/recipes/cost-preview`, payload);
    return unwrapApiData<PreviewRecipeCostResponse>(response.data);
  },

  createRecipeVersion: async (
    productId: string,
    payload: CreateRecipePayload
  ): Promise<Recipe> => {
    const response = await apiClient.post(`/products/${productId}/recipes`, payload);
    return unwrapApiData<Recipe>(response.data);
  },

  activateRecipeVersion: async (
    productId: string,
    recipeId: string
  ): Promise<Recipe> => {
    const response = await apiClient.post(
      `/products/${productId}/recipes/${recipeId}/activate`
    );
    return unwrapApiData<Recipe>(response.data);
  },
};
