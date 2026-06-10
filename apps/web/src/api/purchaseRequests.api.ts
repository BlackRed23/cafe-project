import { apiClient, USE_MOCK } from "./client";
import type { PurchaseRequest } from "../types/purchaseRequest.types";
import { MockDB } from "./mockDb";

export const purchaseRequestsApi = {
  getPurchaseRequests: async (params?: { status?: string }): Promise<PurchaseRequest[]> => {
    if (USE_MOCK) {
      const data = MockDB.getPRs();
      if (params?.status) {
        return data.filter((pr) => pr.status === params.status);
      }
      return data;
    }
    const response = await apiClient.get<PurchaseRequest[]>("/purchase-requests", { params });
    return response.data;
  },

  getPurchaseRequestById: async (id: string): Promise<PurchaseRequest> => {
    if (USE_MOCK) {
      const pr = MockDB.getPR(id);
      if (pr) return pr;
      throw new Error("Không tìm thấy yêu cầu");
    }
    const response = await apiClient.get<PurchaseRequest>(`/purchase-requests/${id}`);
    return response.data;
  },

  approvePurchaseRequest: async (id: string): Promise<PurchaseRequest> => {
    if (USE_MOCK) {
      return MockDB.approvePR(id);
    }
    const response = await apiClient.put<PurchaseRequest>(`/purchase-requests/${id}/approve`);
    return response.data;
  },

  rejectPurchaseRequest: async (id: string, payload: { reason: string }): Promise<PurchaseRequest> => {
    if (USE_MOCK) {
      return MockDB.rejectPR(id, payload.reason);
    }
    const response = await apiClient.put<PurchaseRequest>(`/purchase-requests/${id}/reject`, payload);
    return response.data;
  },
};
