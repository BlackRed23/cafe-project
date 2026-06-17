import { apiClient, unwrapApiField, unwrapApiList } from "./client";
import type { Inventory, InventoryTransaction } from "../types/inventory.types";

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

  updateInventory: async (productId: string, payload: { minThreshold?: number; min_threshold?: number; quantity?: number }): Promise<Inventory> => {
    if (payload.quantity !== undefined) {
      return inventoryApi.adjustInventory({ productId, quantity: payload.quantity });
    }

    throw new Error("Backend hiện tại chưa hỗ trợ cập nhật ngưỡng tồn kho từ frontend.");
  },

  importInventory: async (payload: { productId: string; quantity: number; note?: string }): Promise<any> => {
    const response = await apiClient.post("/inventories/import", {
      inventoryId: await resolveInventoryId(payload.productId),
      quantity: payload.quantity,
      note: payload.note,
    });
    return normalizeInventory(unwrapApiField<any>(response.data, "inventory"));
  },

  adjustInventory: async (payload: { productId: string; quantity: number; note?: string }): Promise<any> => {
    const response = await apiClient.post("/inventories/adjust", {
      inventoryId: await resolveInventoryId(payload.productId),
      quantity: payload.quantity,
      note: payload.note,
    });
    return normalizeInventory(unwrapApiField<any>(response.data, "inventory"));
  },

  getInventoryTransactions: async (): Promise<InventoryTransaction[]> => {
    const response = await apiClient.get("/inventory-transactions");
    return unwrapApiList<any>(response.data, "transactions").map(normalizeTransaction);
  },
};
