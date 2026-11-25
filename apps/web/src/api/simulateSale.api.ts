import { apiClient, unwrapApiData } from "./client";

type SimulateSaleInput =
  | { productId: string; quantity: number; note?: string }
  | { items: Array<{ productId: string; quantity: number }>; note?: string };

interface SimulatedProduct {
  productId?: string;
  productName?: string;
  inventoryId?: string;
  ingredientIds?: string[];
  unit?: string;
  stockBefore?: number;
  previousQuantity?: number;
  stockAfter?: number;
  newQuantity?: number;
  decreasedQuantity?: number;
  minThreshold?: number;
  transactionId?: string;
}

export interface SimulationAgentLog {
  action?: string;
  result?: string;
  status?: string;
  reason?: string;
  reasonCode?: string;
  productId?: string;
  productName?: string;
  ingredientId?: string;
  scanSessionId?: string;
  input?: unknown;
  output?: unknown;
}

export interface SimulationPurchaseRequest {
  id: string;
  requestNumber?: string;
  productId?: string;
  inventory?: { productId?: string };
  items?: Array<{ ingredientId?: string; inventory?: { productId?: string } }>;
}

interface SimulationResult {
  [key: string]: unknown;
  affectedProduct?: SimulatedProduct;
  affectedProducts?: SimulatedProduct[];
  createdPurchaseRequests?: SimulationPurchaseRequest[];
  agentLogs?: SimulationAgentLog[];
  agentResults?: SimulationAgentLog[];
  scanSessionId?: string;
  agentWarning?: string;
  cooldownRemainingSeconds?: number;
  activeScanSessionId?: string;
  transactionId?: string;
}

interface PendingRestore {
  productId: string;
  productName?: string;
  unit?: string;
  stockAfter?: number;
  transactionId: string;
  decreasedQuantity: number;
}

export const simulateSaleApi = {
  simulateSale: async (payload: SimulateSaleInput) => {
    const response = await apiClient.post("/simulate-sale", payload);
    const result = unwrapApiData<SimulationResult>(response.data);
    const purchaseRequest = result?.createdPurchaseRequests?.[0];

    return {
      ...result,
      affectedProduct: result?.affectedProduct ?? result?.affectedProducts?.[0],
      purchaseRequest,
      purchaseRequestId: purchaseRequest?.id,
      prCreated: !!purchaseRequest,
    };
  },

  restoreSimulation: async (transactionId: string): Promise<unknown> => {
    const response = await apiClient.post(`/simulate-sale/${transactionId}/restore`);
    return unwrapApiData<unknown>(response.data);
  },

  getPendingRestore: async (): Promise<{ pendingRestores?: PendingRestore[] }> => {
    const response = await apiClient.get("/simulate-sale/pending-restore");
    return unwrapApiData<{ pendingRestores?: PendingRestore[] }>(response.data);
  },
};
