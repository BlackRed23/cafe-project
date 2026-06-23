export interface Supplier {
  id: string;
  name: string;
  email: string;
  phone?: string;
  address?: string;
  status?: string;
}

export interface SupplierProduct {
  id: string;
  supplierId: string;
  supplier_id?: string;
  productId: string;
  product_id?: string;
  importPrice?: number;
  import_price?: number;
  minOrderQuantity?: number;
  min_order_quantity?: number;
  leadTime?: number;
  lead_time?: number;
  priorityScore?: number;
  priority_score?: number;
  purchaseUnit?: string | null;
  purchase_unit?: string | null;
  conversionQuantity?: number | null;
  conversion_quantity?: number | null;
  conversionTargetUnit?: string | null;
  conversion_target_unit?: string | null;
}
