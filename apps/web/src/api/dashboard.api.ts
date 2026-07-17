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
  getStaffStats: async (): Promise<any> => {
    const response = await apiClient.get("/dashboard/staff-summary");
    const summary = unwrapApiData<any>(response.data);

    return {
      ...summary,
      todayOrders: summary?.orders?.today ?? 0,
      lowStockCount: summary?.inventory?.lowStockCount ?? 0,
      outOfStockCount: summary?.inventory?.outOfStockCount ?? 0,
      pendingReceivePRsCount: summary?.purchaseRequests?.pendingReceive ?? 0,
    };
  },
};
