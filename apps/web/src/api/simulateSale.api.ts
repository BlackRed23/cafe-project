import { apiClient, unwrapApiData } from "./client";

export const simulateSaleApi = {
  simulateSale: async (payload: {
    productId: string;
    quantity?: number;
    simulationMode?: string;
    startDate?: string;
    endDate?: string;
    dailySimulatedQuantity?: number;
    note?: string;
  }): Promise<any> => {
    const response = await apiClient.post("/simulate-sale", {
      productId: payload.productId,
      quantity: payload.quantity,
      simulationMode: payload.simulationMode,
      startDate: payload.startDate,
      endDate: payload.endDate,
      dailySimulatedQuantity: payload.dailySimulatedQuantity,
      note: payload.note || `Frontend simulate sale request for product ${payload.productId}`,
    });
    const result = unwrapApiData<any>(response.data);
    const purchaseRequest = result?.createdPurchaseRequests?.[0];

    return {
      ...result,
      affectedProduct: result?.affectedProduct ?? result?.affectedProducts?.[0],
      purchaseRequest,
      purchaseRequestId: purchaseRequest?.id,
      prCreated: !!purchaseRequest,
    };
  },

  restoreSimulation: async (transactionId: string): Promise<any> => {
    const response = await apiClient.post(`/simulate-sale/${transactionId}/restore`);
    return unwrapApiData<any>(response.data);
  },

  getPendingRestore: async (): Promise<any> => {
    const response = await apiClient.get("/simulate-sale/pending-restore");
    return unwrapApiData<any>(response.data);
  },
};
