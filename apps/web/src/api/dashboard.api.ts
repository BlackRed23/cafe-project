import { apiClient, unwrapApiData } from "./client";

export const dashboardApi = {
  getStats: async (): Promise<any> => {
    const response = await apiClient.get("/dashboard/summary");
    const summary = unwrapApiData<any>(response.data);

    return {
      ...summary,
      totalProducts: summary?.products?.total ?? 0,
      totalOrders: (summary?.orders?.today ?? 0) + (summary?.orders?.pending ?? 0) + (summary?.orders?.completed ?? 0),
      lowStockCount: summary?.inventory?.lowStockCount ?? 0,
      pendingPRsCount: summary?.purchaseRequests?.pending ?? 0,
    };
  },
};
