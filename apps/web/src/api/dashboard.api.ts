import { apiClient, USE_MOCK } from "./client";
import { MockDB } from "./mockDb";

export const dashboardApi = {
  getStats: async (): Promise<any> => {
    if (USE_MOCK) {
      const products = MockDB.getProducts();
      const orders = MockDB.getOrders();
      const lowStock = MockDB.getInventories().filter((i) => i.quantity < (i.minThreshold ?? i.min_threshold ?? 5));
      const pendingPRs = MockDB.getPRs().filter((pr) => pr.status === "PENDING");
      
      return {
        totalProducts: products.length,
        totalOrders: orders.length,
        lowStockCount: lowStock.length,
        pendingPRsCount: pendingPRs.length,
      };
    }
    const response = await apiClient.get("/dashboard/stats");
    return response.data;
  },
};
