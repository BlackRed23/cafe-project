import { apiClient, unwrapApiData } from "./client";
import type {
  Ingredient,
  IngredientTransaction,
  CreateIngredientPayload,
  ImportIngredientPayload,
  WasteIngredientPayload,
  InternalUsagePayload,
  IngredientIncident,
  StockCountRequest,
  ReconciliationResult,
} from "../types/ingredient.types";

const ingredientPath = (id: string) => `/ingredients/${encodeURIComponent(id)}`;
const adjustmentPath = (id: string, requestId: string) =>
  `${ingredientPath(id)}/adjustments/${encodeURIComponent(requestId)}`;

export const ingredientsApi = {
  createAdjustment: async (id: string, payload: { requestId: string; batchId: string; measuredQuantity: number; reason: string }) => {
    const res = await apiClient.post(`${ingredientPath(id)}/adjustments`, payload);
    return unwrapApiData<{ request: StockCountRequest; replayed: boolean }>(res.data);
  },
  getAdjustment: async (id: string, requestId: string) => {
    const res = await apiClient.get(adjustmentPath(id, requestId));
    return unwrapApiData<StockCountRequest>(res.data);
  },
  approveAdjustment: async (id: string, requestId: string) => {
    const res = await apiClient.post(`${adjustmentPath(id, requestId)}/approve`, {});
    return unwrapApiData<{ request: StockCountRequest; replayed: boolean }>(res.data);
  },
  rejectAdjustment: async (id: string, requestId: string) => {
    const res = await apiClient.post(`${adjustmentPath(id, requestId)}/reject`, {});
    return unwrapApiData<StockCountRequest>(res.data);
  },
  getReconciliation: async (id: string) => {
    const res = await apiClient.get(`${ingredientPath(id)}/reconciliation`);
    return unwrapApiData<ReconciliationResult>(res.data);
  },
  correctTransaction: async (id: string, transactionId: string, payload: { requestId: string; reason: string }) => {
    const res = await apiClient.post(`${ingredientPath(id)}/transactions/${encodeURIComponent(transactionId)}/corrections`, payload);
    return unwrapApiData<{ transaction: IngredientTransaction; originalTransactionId: string; replayed: boolean; approvedBy: string; approvedAt: string }>(res.data);
  },
  internalUse: async (id: string, payload: InternalUsagePayload) => {
    const response = await apiClient.post(`/ingredients/${id}/internal-use`, payload);
    return unwrapApiData<{ ingredient: Ingredient; consumedQuantityBase: number; totalCost: number; transactionIds: string[]; replayed: boolean }>(response.data);
  },
  createIncident: async (id: string, payload: { actualQuantity: number; reason: string }) => {
    const response = await apiClient.post(`/ingredients/${id}/incidents`, payload);
    return unwrapApiData<IngredientIncident>(response.data);
  },
  getIncident: async (id: string, incidentId: string) => {
    const response = await apiClient.get(`/ingredients/${id}/incidents/${encodeURIComponent(incidentId)}`);
    return unwrapApiData<IngredientIncident>(response.data);
  },
  approveIncident: async (id: string, incidentId: string) => {
    const response = await apiClient.post(`/ingredients/${id}/incidents/${encodeURIComponent(incidentId)}/approve`, {});
    return unwrapApiData<IngredientIncident>(response.data);
  },
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
      replayed?: boolean;
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
