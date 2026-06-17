import { apiClient, unwrapApiData } from "./client";

export const simulateSaleApi = {
  simulateSale: async (payload: { productId: string; quantity: number }): Promise<any> => {
    const response = await apiClient.post("/simulate-sale", {
      productId: payload.productId,
      quantity: payload.quantity,
      note: `Frontend simulate sale request for product ${payload.productId}`,
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
};
