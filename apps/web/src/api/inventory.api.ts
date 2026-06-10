import { apiClient, USE_MOCK } from "./client";
import type { Inventory, InventoryTransaction } from "../types/inventory.types";
import { MockDB } from "./mockDb";

export const inventoryApi = {
  getInventories: async (): Promise<Inventory[]> => {
    if (USE_MOCK) {
      return MockDB.getInventories();
    }
    const response = await apiClient.get<Inventory[]>("/inventories");
    return response.data;
  },

  getLowStockInventories: async (): Promise<Inventory[]> => {
    if (USE_MOCK) {
      return MockDB.getInventories().filter((i) => i.quantity < (i.minThreshold ?? i.min_threshold ?? 5));
    }
    const response = await apiClient.get<Inventory[]>("/inventories/low-stock");
    return response.data;
  },

  updateInventory: async (productId: string, payload: { minThreshold?: number; min_threshold?: number; quantity?: number }): Promise<Inventory> => {
    if (USE_MOCK) {
      const val = payload.minThreshold ?? payload.min_threshold ?? 5;
      return MockDB.updateInventory(productId, val);
    }
    const response = await apiClient.put<Inventory>(`/inventories/${productId}`, payload);
    return response.data;
  },

  importInventory: async (payload: { productId: string; quantity: number; note?: string }): Promise<any> => {
    if (USE_MOCK) {
      return MockDB.adjustInventory(payload.productId, payload.quantity, "IMPORT", payload.note);
    }
    const response = await apiClient.post("/inventories/import", payload);
    return response.data;
  },

  adjustInventory: async (payload: { productId: string; quantity: number; note?: string }): Promise<any> => {
    if (USE_MOCK) {
      return MockDB.adjustInventory(payload.productId, payload.quantity, "ADJUST", payload.note);
    }
    const response = await apiClient.post("/inventories/adjust", payload);
    return response.data;
  },

  getInventoryTransactions: async (): Promise<InventoryTransaction[]> => {
    if (USE_MOCK) {
      return MockDB.getTransactions();
    }
    const response = await apiClient.get<InventoryTransaction[]>("/inventory-transactions");
    return response.data;
  },
};
