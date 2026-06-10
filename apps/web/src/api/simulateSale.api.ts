import { apiClient, USE_MOCK } from "./client";
import { MockDB } from "./mockDb";

export const simulateSaleApi = {
  simulateSale: async (payload: { productId: string; quantity: number }): Promise<any> => {
    if (USE_MOCK) {
      return MockDB.simulateSale(payload.productId, payload.quantity);
    }
    const response = await apiClient.post("/simulate-sale", payload);
    return response.data;
  },
};
