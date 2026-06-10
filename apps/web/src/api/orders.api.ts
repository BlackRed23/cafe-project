import { apiClient, USE_MOCK } from "./client";
import type { CreateOrderPayload, Order } from "../types/order.types";
import { MockDB } from "./mockDb";

export const ordersApi = {
  createOrder: async (payload: CreateOrderPayload): Promise<Order> => {
    if (USE_MOCK) {
      return MockDB.createOrder(payload);
    }
    const response = await apiClient.post<Order>("/orders", payload);
    return response.data;
  },

  getMyOrders: async (): Promise<Order[]> => {
    if (USE_MOCK) {
      return MockDB.getOrders().filter((o) => o.userId === "u-customer");
    }
    const response = await apiClient.get<Order[]>("/orders/my");
    return response.data;
  },

  getOrderById: async (id: string): Promise<Order> => {
    if (USE_MOCK) {
      const ord = MockDB.getOrders().find((o) => o.id === id);
      if (ord) return ord;
      throw new Error("Không tìm thấy đơn hàng");
    }
    const response = await apiClient.get<Order>(`/orders/${id}`);
    return response.data;
  },

  // Admin APIs
  getOrders: async (): Promise<Order[]> => {
    if (USE_MOCK) {
      return MockDB.getOrders();
    }
    const response = await apiClient.get<Order[]>("/orders");
    return response.data;
  },

  confirmOrder: async (id: string): Promise<Order> => {
    if (USE_MOCK) {
      return MockDB.confirmOrder(id) as any;
    }
    const response = await apiClient.put<Order>(`/orders/${id}/confirm`);
    return response.data;
  },

  updateOrderStatus: async (id: string, payload: { status?: string; paymentStatus?: string }): Promise<Order> => {
    if (USE_MOCK) {
      return MockDB.updateOrderStatus(id, payload);
    }
    const response = await apiClient.put<Order>(`/orders/${id}/status`, payload);
    return response.data;
  },
};
