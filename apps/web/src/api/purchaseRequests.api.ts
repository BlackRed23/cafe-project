import { apiClient, unwrapApiData, unwrapApiField, unwrapApiList } from "./client";
import type { PurchaseRequest, PurchaseRequestEmailPreview } from "../types/purchaseRequest.types";
import { fixVietnameseMojibakeText } from "../utils/textEncoding";

const cleanText = (value: unknown): string =>
  typeof value === "string" ? fixVietnameseMojibakeText(value) : "";

const cleanOptionalText = (value: unknown): string | undefined =>
  typeof value === "string" ? fixVietnameseMojibakeText(value) : undefined;

const normalizePurchaseRequest = (request: any): PurchaseRequest => {
  const firstItem = request?.items?.[0];
  const emailTo = cleanText(request?.emailDraft?.to ?? request?.emailTo ?? request?.email_to ?? request?.supplierEmail ?? request?.supplier?.email ?? "");
  const emailSubject = cleanText(request?.emailDraft?.subject ?? request?.emailSubject ?? request?.email_subject ?? "");
  const emailBody = cleanText(request?.emailDraft?.body ?? request?.emailBody ?? request?.email_body ?? request?.emailContent ?? request?.email_content ?? "");
  const emailStatus = cleanText(request?.emailDraft?.status ?? request?.emailStatus ?? request?.email_status ?? "Chưa gửi");
  const agentExplanation = cleanOptionalText(request?.agentExplanation ?? request?.displayReasoning ?? request?.agent_explanation ?? request?.display_reasoning);
  const notes = cleanOptionalText(request?.notes);
  const emailContent = cleanOptionalText(request?.emailContent ?? request?.email_content);

  return {
    ...request,
    notes,
    agentExplanation,
    displayReasoning: cleanOptionalText(request?.displayReasoning ?? request?.display_reasoning ?? agentExplanation),
    aiReason: cleanOptionalText(agentExplanation ?? request?.aiReason ?? request?.ai_reason ?? request?.notes),
    ai_reason: cleanOptionalText(request?.ai_reason ?? request?.aiReason ?? agentExplanation ?? request?.notes),
    emailContent,
    email_content: cleanOptionalText(request?.email_content ?? request?.emailContent),
    emailTo,
    emailSubject,
    emailBody,
    emailStatus,
    emailDraft: {
      to: emailTo,
      subject: emailSubject,
      body: emailBody,
      status: emailStatus,
    },
    emailSentAt: request?.emailSentAt ?? request?.email_sent_at,
    sentAt: request?.sentAt ?? request?.sent_at ?? request?.emailSentAt ?? request?.email_sent_at,
    supplierEmail: request?.supplierEmail ?? request?.supplier_email ?? request?.supplier?.email,
    retryCount: request?.retryCount ?? request?.retry_count,
    lastEmailError: cleanOptionalText(request?.lastEmailError ?? request?.last_email_error) ?? request?.lastEmailError ?? request?.last_email_error,
    suggestedQuantity: request?.suggestedQuantity ?? request?.suggested_quantity ?? firstItem?.quantity,
    suggested_quantity: request?.suggested_quantity ?? request?.suggestedQuantity ?? firstItem?.quantity,
    purchaseQuantity: request?.purchaseQuantity ?? firstItem?.purchaseQuantity,
    purchaseUnit: request?.purchaseUnit ?? firstItem?.purchaseUnit,
    conversionQuantity: request?.conversionQuantity ?? firstItem?.conversionQuantity,
    conversionTargetUnit: request?.conversionTargetUnit ?? firstItem?.conversionTargetUnit,
    convertedQuantity: request?.convertedQuantity ?? firstItem?.convertedQuantity,
    inventoryUnit: request?.inventoryUnit ?? firstItem?.inventoryUnit,
    conversionMissing: request?.conversionMissing ?? firstItem?.conversionMissing,
    product: request?.product ?? (firstItem ? { id: firstItem.productId, name: firstItem.productName } : undefined),
    items: Array.isArray(request?.items)
      ? request.items.map((item: any) => ({
          ...item,
          notes: cleanOptionalText(item?.notes) ?? item?.notes,
          purchaseQuantity: item?.purchaseQuantity ?? null,
          purchaseUnit: item?.purchaseUnit ?? null,
          conversionQuantity: item?.conversionQuantity ?? null,
          conversionTargetUnit: item?.conversionTargetUnit ?? null,
          convertedQuantity: item?.convertedQuantity ?? item?.quantity ?? null,
          inventoryUnit: item?.inventoryUnit ?? null,
          conversionMissing: item?.conversionMissing ?? true,
        }))
      : request?.items,
    createdAt: request?.createdAt ?? request?.created_at,
    created_at: request?.created_at ?? request?.createdAt,
  };
};

const normalizeEmailPreview = (preview: PurchaseRequestEmailPreview): PurchaseRequestEmailPreview => ({
  ...preview,
  to: cleanOptionalText(preview.to),
  emailTo: cleanOptionalText(preview.emailTo),
  subject: cleanOptionalText(preview.subject),
  emailSubject: cleanOptionalText(preview.emailSubject),
  body: cleanOptionalText(preview.body),
  emailBody: cleanOptionalText(preview.emailBody),
  emailStatus: cleanOptionalText(preview.emailStatus),
  lastEmailError: cleanOptionalText(preview.lastEmailError) ?? preview.lastEmailError,
});

export const purchaseRequestsApi = {
  getPurchaseRequests: async (params?: { status?: string }): Promise<PurchaseRequest[]> => {
    const response = await apiClient.get("/purchase-requests", { params });
    return unwrapApiList<any>(response.data, "purchaseRequests").map(normalizePurchaseRequest);
  },

  createPurchaseRequest: async (payload: {
    supplierId: string;
    notes?: string;
    items: Array<{ inventoryId: string; quantity: number }>;
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
    return normalizeEmailPreview(unwrapApiData<PurchaseRequestEmailPreview>(response.data));
  },

  sendEmail: async (id: string, payload: { to: string; subject: string; body: string }): Promise<PurchaseRequest> => {
    const response = await apiClient.post(`/purchase-requests/${id}/send-email`, payload);
    return normalizePurchaseRequest(unwrapApiField<any>(response.data, "purchaseRequest"));
  },

  receivePurchaseRequest: async (
    id: string,
    payload: { notes?: string; items: Array<{ purchaseRequestItemId: string; receivedQuantity: number }> }
  ): Promise<{ purchaseRequest: PurchaseRequest; isStockSafe: boolean }> => {
    const response = await apiClient.patch(`/purchase-requests/${id}/receive`, payload);
    const data = response.data;
    const purchaseRequest = normalizePurchaseRequest(unwrapApiField<any>(data, "purchaseRequest"));
    const isStockSafe = data?.data?.isStockSafe ?? true;
    return { purchaseRequest, isStockSafe };
  },
};
