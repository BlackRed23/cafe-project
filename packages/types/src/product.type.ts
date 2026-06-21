/**
 * Shared Product types — dùng chung giữa frontend và backend.
 * Khớp với BE ProductDto trong product.service.ts.
 */

export type ProductCategory = {
  id: string;
  name: string;
  description: string | null;
};

export type ProductInventory = {
  quantity: number;
  minThreshold: number;
  unit: string;
};

export type Product = {
  id: string;
  name: string;
  sku: string;
  description: string | null;
  price: number;
  costPrice: number;
  unit: string;
  imageUrl: string | null;
  isActive: boolean;
  categoryId: string;
  category: ProductCategory;
  inventory: ProductInventory | null;
  inventoryQuantity: number | null;
  createdAt: string | Date;
  updatedAt: string | Date;
};

export type CreateProductPayload = {
  name: string;
  price: number;
  categoryId: string;
  sku?: string | null;
  description?: string | null;
  costPrice?: number;
  unit?: string;
  isActive?: boolean;
  imageUrl?: string | null;
};

export type UpdateProductPayload = Partial<CreateProductPayload>;
