import { apiClient, unwrapApiData } from "./client";

export const simulateSaleApi = {
  simulateSale: async (payload: any): Promise<any> => {
    const response = await apiClient.post("/simulate-sale", payload);
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
