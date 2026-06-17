import { apiClient, unwrapApiField, unwrapApiList } from "./client";
import type { CreateOrderPayload, Order } from "../types/order.types";

const normalizeOrder = (order: any): Order => ({
  ...order,
  paymentMethod: order?.paymentMethod ?? order?.payment?.method ?? "CASH",
  paymentStatus: order?.paymentStatus ?? order?.payment?.status ?? "PENDING",
  createdAt: order?.createdAt ?? order?.created_at,
  updatedAt: order?.updatedAt ?? order?.updated_at,
  items: order?.items?.map((item: any) => ({
    ...item,
    price: item?.price ?? item?.unitPrice ?? 0,
    productId: item?.productId ?? item?.product_id,
    product: item?.product ?? {
      id: item?.productId ?? item?.product_id,
      name: item?.productName ?? "Sản phẩm",
      unit: item?.unit,
    },
  })),
});

const normalizeOrderPayload = (payload: CreateOrderPayload) => ({
  items: payload.items,
  paymentMethod: payload.paymentMethod,
  note: payload.note,
});

export const ordersApi = {
  createOrder: async (payload: CreateOrderPayload): Promise<Order> => {
    const response = await apiClient.post("/orders", normalizeOrderPayload(payload));
    return normalizeOrder(unwrapApiField<any>(response.data, "order"));
  },

  getMyOrders: async (): Promise<Order[]> => {
    const response = await apiClient.get("/orders/me");
    return unwrapApiList<any>(response.data, "orders").map(normalizeOrder);
  },

  getOrderById: async (id: string): Promise<Order> => {
    const response = await apiClient.get(`/orders/${id}`);
    return normalizeOrder(unwrapApiField<any>(response.data, "order"));
  },

  getOrders: async (): Promise<Order[]> => {
    const response = await apiClient.get("/orders");
    return unwrapApiList<any>(response.data, "orders").map(normalizeOrder);
  },

  confirmOrder: async (id: string): Promise<Order> => {
    return ordersApi.updateOrderStatus(id, { status: "CONFIRMED" });
  },

  updateOrderStatus: async (id: string, payload: { status?: string; paymentStatus?: string }): Promise<Order> => {
    const response = await apiClient.patch(`/orders/${id}/status`, { status: payload.status });
    let order = unwrapApiField<any>(response.data, "order");

    if (payload.paymentStatus && order?.payment?.id) {
      const paymentResponse = await apiClient.patch(`/payments/${order.payment.id}/status`, {
        status: payload.paymentStatus,
      });
      order = {
        ...order,
        payment: unwrapApiField<any>(paymentResponse.data, "payment"),
      };
    }

    return normalizeOrder(order);
  },
};
