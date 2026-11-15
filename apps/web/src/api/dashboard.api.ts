import { apiClient, unwrapApiData } from "./client";

export interface DailyProfitPoint {
  date: string;
  revenue: number;
  cogs: number;
  grossProfit: number;
}

export interface ProductMarginStat {
  productId: string;
  productName: string;
  productSku: string;
  currentPrice: number;
  currentCostPrice: number;
  soldQty: number;
  revenue: number;
  cogs: number;
  grossProfit: number;
  marginPercent: number;
}

export interface IngredientUsageStat {
  ingredientId: string;
  ingredientName: string;
  ingredientSku: string;
  baseUnit: string;
  costPerBaseUnit: number;
  consumeQty: number;
  consumeCost: number;
  wasteQty: number;
  wasteCost: number;
  currentQuantity: number;
  currentStockValue: number;
}

export const dashboardApi = {
  getStats: async (): Promise<any> => {
    const response = await apiClient.get("/dashboard/summary");
    const summary = unwrapApiData<any>(response.data);

    return {
      ...summary,
      totalProducts: summary?.products?.total ?? 0,
      totalOrders:
        (summary?.orders?.today ?? 0) +
        (summary?.orders?.pending ?? 0) +
        (summary?.orders?.completed ?? 0),
      lowStockCount: summary?.inventory?.lowStockCount ?? 0,
      pendingPRsCount: summary?.purchaseRequests?.pending ?? 0,
      totalRevenue: summary?.orders?.totalRevenue ?? 0,
      totalCogs: summary?.orders?.totalCogs ?? 0,
      grossProfit: summary?.orders?.grossProfit ?? 0,
      grossMarginPercent: summary?.orders?.grossMarginPercent ?? 0,
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

  getProfit: async (days = 30): Promise<DailyProfitPoint[]> => {
    const response = await apiClient.get("/dashboard/profit", { params: { days } });
    return unwrapApiData<DailyProfitPoint[]>(response.data) ?? [];
  },

  getProductMargins: async (days = 30): Promise<ProductMarginStat[]> => {
    const response = await apiClient.get("/dashboard/product-margins", {
      params: { days },
    });
    return unwrapApiData<ProductMarginStat[]>(response.data) ?? [];
  },

  getIngredientUsage: async (days = 30): Promise<IngredientUsageStat[]> => {
    const response = await apiClient.get("/dashboard/ingredient-usage", {
      params: { days },
    });
    return unwrapApiData<IngredientUsageStat[]>(response.data) ?? [];
  },
};
