import { apiClient, unwrapApiData, unwrapApiField } from "./client";
import type { PaymentAttempt } from "../types/order.types";

export interface CreatePaymentUrlResponse {
  payUrl: string;
  paymentId: string;
  merchantRef: string;
  expiresAt: string;
}

export const paymentsApi = {
  createPaymentUrl: async (
    orderId: string,
    method: "MOMO" | "VNPAY"
  ): Promise<CreatePaymentUrlResponse> => {
    const response = await apiClient.post("/payments/create-url", { orderId, method });
    return unwrapApiData<CreatePaymentUrlResponse>(response.data);
  },

  getPaymentByOrder: async (orderId: string): Promise<PaymentAttempt> => {
    const response = await apiClient.get(`/payments/order/${encodeURIComponent(orderId)}`);
    return unwrapApiField<PaymentAttempt>(response.data, "payment");
  },

  markPaymentRefunded: async (paymentId: string, note?: string): Promise<PaymentAttempt> => {
    const response = await apiClient.post(`/payments/${paymentId}/mark-refunded`, {
      ...(note ? { note } : {}),
    });
    return unwrapApiField<PaymentAttempt>(response.data, "payment");
  },

  simulateDevMoMoIpn: async (
    paymentId: string,
    success: boolean
  ): Promise<{ status: string; payment: PaymentAttempt }> => {
    const response = await apiClient.post("/payments/dev/simulate-ipn", {
      paymentId,
      success,
    });
    return unwrapApiData<{ status: string; payment: PaymentAttempt }>(response.data);
  },
};
