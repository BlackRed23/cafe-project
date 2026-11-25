import { apiClient, unwrapApiData, unwrapApiList } from "./client";
import type { Inventory, InventoryTransaction } from "../types/inventory.types";

type InventoryWire = Inventory & { inventoryId?: string; productImageUrl?: string };
type InventoryMutationWire = { inventory?: InventoryWire; warnings?: Array<{ message: string }>; message?: string };
type InventoryTransactionWire = InventoryTransaction & { createdBy?: string; createdByEmail?: string; quantity?: number };
export type ThresholdSuggestion = {
  recommendedThreshold: number;
  leadTimeDemand: number;
  safetyStock?: number;
  explanation?: string;
};
type ThresholdSuggestionWire = ThresholdSuggestion & { suggestion?: ThresholdSuggestion };

const isRecord = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === "object" && !Array.isArray(value);

const isInventoryWire = (value: unknown): value is InventoryWire =>
  isRecord(value) && typeof value.id === "string" &&
  typeof value.productId === "string" && typeof value.quantity === "number";

const normalizeInventoryMutation = (payload: unknown) => {
  const data = unwrapApiData<unknown>(payload);
  if (!isRecord(data)) throw new Error("INVALID_INVENTORY_MUTATION_RESPONSE");
  const rawInventory = data.inventory ?? data;
  if (!isInventoryWire(rawInventory)) throw new Error("INVALID_INVENTORY_MUTATION_RESPONSE");
  const rawWarnings = data.warnings;
  if (rawWarnings !== undefined &&
    (!Array.isArray(rawWarnings) || !rawWarnings.every(warning => isRecord(warning) && typeof warning.message === "string"))) {
    throw new Error("INVALID_INVENTORY_MUTATION_WARNINGS");
  }
  const warnings = rawWarnings as InventoryMutationWire["warnings"];
  if (data.message !== undefined && typeof data.message !== "string") {
    throw new Error("INVALID_INVENTORY_MUTATION_MESSAGE");
  }
  const inventory = normalizeInventory(rawInventory);

  return {
    ...data,
    warnings,
    message: typeof data.message === "string" ? data.message : undefined,
    inventory,
    quantity: inventory.quantity,
    minThreshold: inventory.minThreshold,
    min_threshold: inventory.min_threshold,
    productId: inventory.productId,
    product_id: inventory.product_id,
    product: inventory.product,
  };
};

const normalizeInventory = (inventory: InventoryWire): Inventory => {
  const quantity = Number(inventory?.quantity ?? inventory?.stock ?? 0);
  const reservedStock = Number(inventory?.reservedStock ?? inventory?.reserved_stock ?? 0);
  const availableStock = Number(inventory?.availableStock ?? inventory?.available_stock ?? quantity - reservedStock);
  const minThreshold = Number(inventory?.minThreshold ?? inventory?.min_threshold ?? inventory?.minStock ?? inventory?.min_stock ?? 0);
  const productId = inventory?.productId ?? inventory?.product_id;
  const productName = inventory?.productName ?? inventory?.product_name ?? inventory?.product?.name ?? "Sản phẩm";
  const unit = inventory?.unit ?? inventory?.product?.unit;
  const sellableQuantity = Number(inventory?.sellableQuantity ?? 0);

  const safetyStock = inventory?.safetyStock !== undefined && inventory?.safetyStock !== null ? Number(inventory.safetyStock) : undefined;
  const leadTimeDemand = inventory?.leadTimeDemand !== undefined && inventory?.leadTimeDemand !== null ? Number(inventory.leadTimeDemand) : undefined;
  const recommendedThreshold = inventory?.recommendedThreshold !== undefined && inventory?.recommendedThreshold !== null ? Number(inventory.recommendedThreshold) : (inventory?.minThreshold ?? 0);

  return {
    ...inventory,
    productId,
    product_id: inventory?.product_id ?? productId,
    productName,
    product_name: inventory?.product_name ?? productName,
    quantity,
    stock: quantity,
    reservedStock,
    reserved_stock: inventory?.reserved_stock ?? reservedStock,
    availableStock,
    available_stock: inventory?.available_stock ?? availableStock,
    sellableQuantity,
    minThreshold,
    min_threshold: inventory?.min_threshold ?? minThreshold,
    minStock: inventory?.minStock ?? minThreshold,
    min_stock: inventory?.min_stock ?? minThreshold,
    safetyStock,
    leadTimeDemand,
    recommendedThreshold,
    unit,
    product: inventory?.product ?? {
      id: productId,
      name: productName,
      unit,
      imageUrl: inventory?.productImageUrl,
      image_url: inventory?.productImageUrl,
    },
  };
};

const normalizeTransaction = (transaction: InventoryTransactionWire): InventoryTransaction => ({
  ...transaction,
  productId: transaction?.productId ?? transaction?.product_id,
  product_id: transaction?.product_id ?? transaction?.productId,
  productName: transaction?.productName ?? transaction?.product?.name ?? "Nguyên liệu / Sản phẩm",
  productSku: transaction?.productSku ?? transaction?.product?.sku ?? "",
  itemType: transaction?.itemType ?? "PRODUCT",
  unit: transaction?.unit ?? transaction?.product?.unit ?? "",
  batchCode: transaction?.batchCode ?? null,
  quantityChange: transaction?.quantityChange ?? transaction?.quantity_change ?? transaction?.quantity,
  quantity_change: transaction?.quantity_change ?? transaction?.quantityChange ?? transaction?.quantity,
  createdAt: transaction?.createdAt ?? transaction?.created_at,
  created_at: transaction?.created_at ?? transaction?.createdAt,
  product: transaction?.product ?? {
    id: transaction?.productId ?? transaction?.product_id,
    name: transaction?.productName ?? "Nguyên liệu / Sản phẩm",
    sku: transaction?.productSku ?? "",
    unit: transaction?.unit ?? "",
  },
  user: transaction?.createdBy ? {
    id: "unknown",
    name: transaction.createdBy,
    email: transaction.createdByEmail ?? "",
  } : null,
});

const resolveInventoryId = async (productIdOrInventoryId: string): Promise<string> => {
  const inventories = await inventoryApi.getInventories();
  const inventory = inventories.find(
    (item) =>
      item.id === productIdOrInventoryId ||
      ("inventoryId" in item && item.inventoryId === productIdOrInventoryId) ||
      item.productId === productIdOrInventoryId ||
      item.product_id === productIdOrInventoryId
  );

  const inventoryId = inventory && "inventoryId" in inventory ? inventory.inventoryId : undefined;
  return typeof inventoryId === "string" ? inventoryId : inventory?.id ?? productIdOrInventoryId;
};

export const inventoryApi = {
  getInventories: async (): Promise<Inventory[]> => {
    const response = await apiClient.get("/inventories");
    return unwrapApiList<InventoryWire>(response.data, "inventories").map(normalizeInventory);
  },

  getLowStockInventories: async (): Promise<Inventory[]> => {
    const inventories = await inventoryApi.getInventories();
    return inventories.filter((i) => (i.availableStock ?? i.quantity) < (i.minThreshold ?? i.min_threshold ?? 5));
  },

  getInventoryById: async (id: string): Promise<Inventory> => {
    const response = await apiClient.get(`/inventories/${id}`);
    const data = unwrapApiData<unknown>(response.data);
    const inventory = isRecord(data) ? data.inventory ?? data : data;
    if (!isInventoryWire(inventory)) throw new Error("INVALID_INVENTORY_RESPONSE");
    return normalizeInventory(inventory);
  },

  getLowStock: async (): Promise<Inventory[]> => inventoryApi.getLowStockInventories(),

  updateInventory: async (productId: string, payload: { minThreshold?: number; min_threshold?: number; quantity?: number; batchId?: string }) => {
    const inventoryId = await resolveInventoryId(productId);
    if (payload.quantity !== undefined) {
      return inventoryApi.adjustInventory({ productId, quantity: payload.quantity, batchId: payload.batchId ?? "" });
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

  importInventory: async (payload: { productId: string; quantity: number; note?: string; batchCode?: string; expirationDate?: string }) => {
    const response = await apiClient.post("/inventories/import", {
      inventoryId: await resolveInventoryId(payload.productId),
      quantity: payload.quantity,
      note: payload.note,
      batchCode: payload.batchCode,
      expirationDate: payload.expirationDate,
    });
    return normalizeInventoryMutation(response.data);
  },

  adjustInventory: async (payload: { productId: string; batchId: string; quantity: number; note?: string }) => {
    if (!payload.batchId) throw new Error("Vui lòng chọn lô còn hạn để điều chỉnh.");
    const response = await apiClient.post("/inventories/adjust", {
      batchId: payload.batchId,
      inventoryId: await resolveInventoryId(payload.productId),
      quantity: payload.quantity,
      note: payload.note,
    });
    return normalizeInventoryMutation(response.data);
  },

  getInventoryTransactions: async (): Promise<InventoryTransaction[]> => {
    const response = await apiClient.get("/inventory-transactions");
    return unwrapApiList<InventoryTransactionWire>(response.data, "transactions").map(normalizeTransaction);
  },

  getThresholdSuggestion: async (inventoryId: string): Promise<ThresholdSuggestion> => {
    const resolvedInventoryId = await resolveInventoryId(inventoryId);
    const response = await apiClient.get(`/inventories/${resolvedInventoryId}/suggest-threshold`);
    const data = unwrapApiData<ThresholdSuggestionWire>(response.data);
    return data?.suggestion || data;
  },
};
