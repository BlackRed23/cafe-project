import { apiClient, USE_MOCK } from "./client";
import type { CreateOrderPayload, Order } from "../types/order.types";
import { MockDB } from "./mockDb";

export const ordersApi = {
  createOrder: async (payload: CreateOrderPayload): Promise<Order> => {
    if (USE_MOCK) {
      return MockDB.createOrder(payload);
    }
    const response = await apiClient.post("/orders", payload);
    return response.data.data.order;
  },

  getMyOrders: async (): Promise<Order[]> => {
    if (USE_MOCK) {
      return MockDB.getOrders().filter((o) => o.userId === "u-customer");
    }
    const response = await apiClient.get("/orders/me");
    return response.data.data.orders;
  },

  getOrderById: async (id: string): Promise<Order> => {
    if (USE_MOCK) {
      const ord = MockDB.getOrders().find((o) => o.id === id);
      if (ord) return ord;
      throw new Error("Không tìm thấy đơn hàng");
    }
    const response = await apiClient.get(`/orders/${id}`);
    return response.data.data.order;
  },

  // Admin APIs
  getOrders: async (): Promise<Order[]> => {
    if (USE_MOCK) {
      return MockDB.getOrders();
    }
    const response = await apiClient.get("/orders");
    return response.data.data.orders;
  },

  confirmOrder: async (id: string): Promise<Order> => {
    if (USE_MOCK) {
      return MockDB.confirmOrder(id) as any;
    }
    const response = await apiClient.patch(`/orders/${id}/status`, { status: "CONFIRMED" });
    return response.data.data.order;
  },

  updateOrderStatus: async (id: string, payload: { status?: string; paymentStatus?: string }): Promise<Order> => {
    if (USE_MOCK) {
      return MockDB.updateOrderStatus(id, payload);
    }
    const response = await apiClient.patch(`/orders/${id}/status`, payload);
    return response.data.data.order;
  },
};
