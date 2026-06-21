export type InventoryStatus = "OK" | "WARNING" | "NEED_RESTOCK";

export interface Inventory {
  id: string;
  productId: string;
  product_id?: string;
  product?: {
    id: string;
    name: string;
    unit?: string;
    imageUrl?: string;
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
  unit?: string;
}

export interface InventoryTransaction {
  id: string;
  productId: string;
  product_id?: string;
  product?: {
    id: string;
    name: string;
  };
  type: "IMPORT" | "ORDER" | "SIMULATE_SALE" | "ADJUST" | "CANCEL" | "RETURN";
  quantityChange?: number;
  quantity_change?: number;
  note?: string;
  createdAt?: string;
  created_at?: string;
}
