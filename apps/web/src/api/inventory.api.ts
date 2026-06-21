import { apiClient, unwrapApiData, unwrapApiList } from "./client";
import type { Inventory, InventoryTransaction } from "../types/inventory.types";

type ThresholdSuggestionParams = {
  salesWindowDays?: number;
  bufferDays?: number;
  delayBufferDays?: number;
  planningPeriod?: 'WEEKLY' | 'MONTHLY' | 'CUSTOM';
  planningDays?: number;
};

const normalizeInventoryMutation = (payload: any) => {
  const data = unwrapApiData<any>(payload);
  const inventory = normalizeInventory(data?.inventory ?? data);

  return {
    ...data,
    inventory,
    quantity: inventory.quantity,
    minThreshold: inventory.minThreshold,
    min_threshold: inventory.min_threshold,
    productId: inventory.productId,
    product_id: inventory.product_id,
    product: inventory.product,
  };
};

const normalizeInventory = (inventory: any): Inventory => ({
  ...inventory,
  productId: inventory?.productId ?? inventory?.product_id,
  product_id: inventory?.product_id ?? inventory?.productId,
  minThreshold: inventory?.minThreshold ?? inventory?.min_threshold,
  min_threshold: inventory?.min_threshold ?? inventory?.minThreshold,
  product: inventory?.product ?? {
    id: inventory?.productId ?? inventory?.product_id,
    name: inventory?.productName ?? "Sản phẩm",
    unit: inventory?.unit,
    imageUrl: inventory?.productImageUrl,
    image_url: inventory?.productImageUrl,
  },
});

const normalizeTransaction = (transaction: any): InventoryTransaction => ({
  ...transaction,
  productId: transaction?.productId ?? transaction?.product_id,
  product_id: transaction?.product_id ?? transaction?.productId,
  quantityChange: transaction?.quantityChange ?? transaction?.quantity_change ?? transaction?.quantity,
  quantity_change: transaction?.quantity_change ?? transaction?.quantityChange ?? transaction?.quantity,
  createdAt: transaction?.createdAt ?? transaction?.created_at,
  created_at: transaction?.created_at ?? transaction?.createdAt,
  product: transaction?.product ?? {
    id: transaction?.productId ?? transaction?.product_id,
    name: transaction?.productName ?? "Sản phẩm",
  },
});

const resolveInventoryId = async (productIdOrInventoryId: string): Promise<string> => {
  const inventories = await inventoryApi.getInventories();
  const inventory = inventories.find(
    (item) =>
      item.id === productIdOrInventoryId ||
      (item as any).inventoryId === productIdOrInventoryId ||
      item.productId === productIdOrInventoryId ||
      item.product_id === productIdOrInventoryId
  );

  return (inventory as any)?.inventoryId ?? inventory?.id ?? productIdOrInventoryId;
};

export const inventoryApi = {
  getInventories: async (): Promise<Inventory[]> => {
    const response = await apiClient.get("/inventories");
    return unwrapApiList<any>(response.data, "inventories").map(normalizeInventory);
  },

  getLowStockInventories: async (): Promise<Inventory[]> => {
    const inventories = await inventoryApi.getInventories();
    return inventories.filter((i) => i.quantity < (i.minThreshold ?? i.min_threshold ?? 5));
  },

  getLowStock: async (): Promise<Inventory[]> => inventoryApi.getLowStockInventories(),

  updateInventory: async (productId: string, payload: { minThreshold?: number; min_threshold?: number; quantity?: number }): Promise<any> => {
    const inventoryId = await resolveInventoryId(productId);
    if (payload.quantity !== undefined) {
      return inventoryApi.adjustInventory({ productId, quantity: payload.quantity });
    }

    const minThreshold = payload.minThreshold ?? payload.min_threshold;
    if (minThreshold !== undefined) {
      const response = await apiClient.post("/inventories/threshold", {
        inventoryId,
        minThreshold,
      });
      return normalizeInventoryMutation(response.data);
    }

    throw new Error("Invalid payload for updateInventory");
  },

  importInventory: async (payload: { productId: string; quantity: number; note?: string }): Promise<any> => {
    const response = await apiClient.post("/inventories/import", {
      inventoryId: await resolveInventoryId(payload.productId),
      quantity: payload.quantity,
      note: payload.note,
    });
    return normalizeInventoryMutation(response.data);
  },

  adjustInventory: async (payload: { productId: string; quantity: number; note?: string }): Promise<any> => {
    const response = await apiClient.post("/inventories/adjust", {
      inventoryId: await resolveInventoryId(payload.productId),
      quantity: payload.quantity,
      note: payload.note,
    });
    return normalizeInventoryMutation(response.data);
  },

  getInventoryTransactions: async (): Promise<InventoryTransaction[]> => {
    const response = await apiClient.get("/inventory-transactions");
    return unwrapApiList<any>(response.data, "transactions").map(normalizeTransaction);
  },

  getThresholdSuggestion: async (inventoryId: string, params?: ThresholdSuggestionParams): Promise<any> => {
    const resolvedInventoryId = await resolveInventoryId(inventoryId);
    const response = await apiClient.get(`/inventories/${resolvedInventoryId}/suggest-threshold`, { params });
    const data = unwrapApiData<any>(response.data);
    return data?.suggestion || data || {};
  },
};

