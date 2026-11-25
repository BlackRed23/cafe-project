export interface Category {
  id: string;
  name: string;
}

export interface Product {
  id: string;
  name: string;
  sku?: string;
  description?: string;
  price: number;
  costPrice?: number;
  unit: string;
  imageUrl?: string;
  image_url?: string;
  categoryId?: string;
  category_id?: string;
  category?: Category;
  requiresRecipe?: boolean | null;
  isActive?: boolean;
  is_active?: boolean;
  updatedAt?: string;
  expectedUpdatedAt?: string;
  availableStock?: number;
  inventory?: {
    quantity: number;
    minThreshold?: number;
    min_threshold?: number;
  };
  deletedAt?: Date | string | null;
  pendingDeleteUntil?: Date | string | null;
  nutritionFacts?: string | null;
  nutrition_facts?: string | null;
  usageInstructions?: string | null;
  usage_instructions?: string | null;
  storageInstructions?: string | null;
  storage_instructions?: string | null;
  origin?: string | null;
  certifications?: string | null;
  expiryInfo?: string | null;
  expiry_info?: string | null;
}

export type ProductWritePayload = Omit<Partial<Product>, "requiresRecipe" | "expectedUpdatedAt"> & { requiresRecipe?: boolean };
export type ProductUpdatePayload = ProductWritePayload & { expectedUpdatedAt: string };
