import { apiClient, unwrapApiData, unwrapApiField, unwrapApiList } from "./client";
import type { PurchaseRequest, PurchaseRequestEmailPreview } from "../types/purchaseRequest.types";

const normalizePurchaseRequest = (request: any): PurchaseRequest => {
  const firstItem = request?.items?.[0];

  return {
    ...request,
    aiReason: request?.aiReason ?? request?.ai_reason ?? request?.notes,
    ai_reason: request?.ai_reason ?? request?.aiReason ?? request?.notes,
    emailContent: request?.emailContent ?? request?.email_content,
    email_content: request?.email_content ?? request?.emailContent,
    emailTo: request?.emailTo ?? request?.email_to ?? request?.supplierEmail ?? request?.supplier?.email,
    emailSubject: request?.emailSubject ?? request?.email_subject,
    emailBody: request?.emailBody ?? request?.email_body ?? request?.emailContent ?? request?.email_content,
    emailStatus: request?.emailStatus ?? request?.email_status,
    emailSentAt: request?.emailSentAt ?? request?.email_sent_at,
    sentAt: request?.sentAt ?? request?.sent_at ?? request?.emailSentAt ?? request?.email_sent_at,
    supplierEmail: request?.supplierEmail ?? request?.supplier_email ?? request?.supplier?.email,
    retryCount: request?.retryCount ?? request?.retry_count,
    lastEmailError: request?.lastEmailError ?? request?.last_email_error,
    suggestedQuantity: request?.suggestedQuantity ?? request?.suggested_quantity ?? firstItem?.quantity,
    suggested_quantity: request?.suggested_quantity ?? request?.suggestedQuantity ?? firstItem?.quantity,
    product: request?.product ?? (firstItem
      ? {
          id: firstItem.productId,
          name: firstItem.productName,
        }
      : undefined),
    createdAt: request?.createdAt ?? request?.created_at,
    created_at: request?.created_at ?? request?.createdAt,
  };
};

export const purchaseRequestsApi = {
  getPurchaseRequests: async (params?: { status?: string }): Promise<PurchaseRequest[]> => {
    const response = await apiClient.get("/purchase-requests", { params });
    return unwrapApiList<any>(response.data, "purchaseRequests").map(normalizePurchaseRequest);
  },

  createPurchaseRequest: async (payload: {
    supplierId: string;
    notes?: string;
    items: Array<{
      inventoryId: string;
      quantity: number;
    }>;
  }): Promise<PurchaseRequest> => {
    const response = await apiClient.post("/purchase-requests", payload);
    return normalizePurchaseRequest(unwrapApiField<any>(response.data, "purchaseRequest"));
  },

  getPurchaseRequestById: async (id: string): Promise<PurchaseRequest> => {
    const response = await apiClient.get(`/purchase-requests/${id}`);
    return normalizePurchaseRequest(unwrapApiField<any>(response.data, "purchaseRequest"));
  },

  approvePurchaseRequest: async (id: string): Promise<PurchaseRequest> => {
    const response = await apiClient.patch(`/purchase-requests/${id}/approve`);
    return normalizePurchaseRequest(unwrapApiField<any>(response.data, "purchaseRequest"));
  },

  rejectPurchaseRequest: async (id: string, payload: { reason: string }): Promise<PurchaseRequest> => {
    const response = await apiClient.patch(`/purchase-requests/${id}/reject`, payload);
    return normalizePurchaseRequest(unwrapApiField<any>(response.data, "purchaseRequest"));
  },

  getEmailPreview: async (id: string): Promise<PurchaseRequestEmailPreview> => {
    const response = await apiClient.get(`/purchase-requests/${id}/email-preview`);
    return unwrapApiData<PurchaseRequestEmailPreview>(response.data);
  },

  sendEmail: async (id: string, payload: { subject: string; body: string }): Promise<PurchaseRequest> => {
    const response = await apiClient.post(`/purchase-requests/${id}/send-email`, payload);
    return normalizePurchaseRequest(unwrapApiField<any>(response.data, "purchaseRequest"));
  },
};
