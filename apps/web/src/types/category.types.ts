export interface Category {
  id: string;
  name: string;
  description?: string;
  createdAt?: string;
  updatedAt?: string;
  productCount?: number;
  products?: { id: string; name: string; sku: string }[];
}
