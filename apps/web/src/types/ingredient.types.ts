export type IngredientStatus = "OUT_OF_STOCK" | "LOW_STOCK" | "IN_STOCK";
export type WasteReason = "CUSTOMER_CANCELLED" | "STAFF_ERROR" | "EXPIRED" | "DAMAGED";

export interface IngredientBatch {
  id: string;
  batchCode: string;
  quantityInitial: number;
  quantityRemaining: number;
  unitCost: number;
  batchValue: number;
  expirationDate: string | null;
  receivedAt: string;
  supplierId: string | null;
  receivedQty: number | null;
  receivedUnit: string | null;
  note: string | null;
}

export interface Ingredient {
  id: string;
  sku: string;
  name: string;
  categoryId: string | null;
  category?: {
    id: string;
    name: string;
    kind: string;
  } | null;
  baseUnit: string;
  costPerBaseUnit: number;
  quantity: number;
  reserved: number;
  availableQuantity: number;
  minThreshold: number;
  stockValue: number;
  status: IngredientStatus;
  origin: string | null;
  storageInstructions: string | null;
  expiryInfo: string | null;
  shelfLifeDays: number | null;
  imageUrl: string | null;
  isActive: boolean;
  rowVersion: number;
  batches?: IngredientBatch[];
  createdAt: string;
  updatedAt: string;
}

export interface IngredientTransaction {
  id: string;
  ingredientId: string | null;
  batchId: string | null;
  batchCode: string | null;
  type: string;
  quantity: number;
  unitCost: number;
  totalCost: number;
  referenceType: string | null;
  referenceId: string | null;
  orderItemId: string | null;
  wasteReason: WasteReason | null;
  reason: string | null;
  performedBy: string | null;
  performedByEmail: string | null;
  createdAt: string;
}

export interface CreateIngredientPayload {
  sku?: string;
  name: string;
  categoryId?: string | null;
  baseUnit: string;
  costPerBaseUnit?: number;
  minThreshold?: number;
  origin?: string | null;
  storageInstructions?: string | null;
  expiryInfo?: string | null;
  shelfLifeDays?: number | null;
  imageUrl?: string | null;
  isActive?: boolean;
}

export interface ImportIngredientPayload {
  quantity: number;
  unit?: string;
  unitCost?: number;
  totalCost?: number;
  batchCode?: string | null;
  expirationDate?: string | null;
  supplierId?: string | null;
  note?: string | null;
}

export interface WasteIngredientPayload {
  quantity: number;
  unit?: string;
  wasteReason: WasteReason;
  batchId?: string | null;
  note?: string | null;
}
