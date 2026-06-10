export interface Category {
  id: string;
  name: string;
}

export interface Product {
  id: string;
  name: string;
  description?: string;
  price: number;
  unit: string;
  imageUrl?: string;
  image_url?: string;
  categoryId?: string;
  category_id?: string;
  category?: Category;
  isActive?: boolean;
  is_active?: boolean;
  inventory?: {
    quantity: number;
    minThreshold?: number;
    min_threshold?: number;
  };
}
