export type InventoryStatus = "OK" | "WARNING" | "NEED_RESTOCK";

export type InventoryScanSeverity =
  | "STABLE"
  | "WATCH"
  | "LOW"
  | "URGENT"
  | "FAST_CONSUMPTION"
  | "DATA_ISSUE"
  | "ERROR";

export interface InventoryBatch {
  id: string;
  batchCode: string;
  quantity: number;
  expirationDate: string;
}

export interface Inventory {
  batches?: InventoryBatch[];
  inventoryId?: string;
  sku?: string;
  id: string;
  productId: string;
  product_id?: string;
  productName?: string;
  product_name?: string;
  categoryName?: string;
  category_name?: string;
  product?: {
    id: string;
    name: string;
    unit?: string;
    imageUrl?: string;
    sku?: string;
    image_url?: string;
  };
  quantity: number;
  stock?: number;
  reservedStock?: number;
  reserved_stock?: number;
  availableStock?: number;
  available_stock?: number;
  minThreshold?: number;
  min_threshold?: number;
  minStock?: number;
  min_stock?: number;
  unit?: string;
  safetyStock?: number;
  leadTimeDemand?: number;
  recommendedThreshold?: number;
  hasOpenPurchaseRequest?: boolean;
  openPurchaseRequestId?: string;
  openPurchaseRequestCode?: string;
  openPurchaseRequestStatus?: string;
  sellableQuantity?: number;
}

export interface InventoryTransaction {
  id: string;
  productId: string;
  product_id?: string;
  productName?: string;
  productSku?: string;
  itemType?: "INGREDIENT" | "PRODUCT";
  unit?: string;
  batchCode?: string | null;
  product?: {
    id: string;
    name: string;
    sku?: string;
    unit?: string;
  };
  type:
    | "IMPORT"
    | "ORDER"
    | "RESERVE"
    | "RELEASE"
    | "DEDUCT"
    | "CONSUME"
    | "WASTE"
    | "SIMULATE_SALE"
    | "RESTORE_SIMULATION"
    | "ADJUST"
    | "CANCEL"
    | "RETURN"
    | string;
  quantityChange?: number;
  quantity_change?: number;
  note?: string;
  createdAt?: string;
  created_at?: string;
  user?: {
    id: string;
    name: string;
    email: string;
  } | null;
}
