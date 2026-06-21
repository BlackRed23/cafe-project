import { apiClient, unwrapApiField, unwrapApiList } from "./client";
import type { Supplier, SupplierProduct } from "../types/supplier.types";

const normalizeSupplier = (supplier: any): Supplier => ({
  ...supplier,
  phone: supplier?.phone ?? supplier?.contact,
});

const normalizeSupplierProduct = (item: any): SupplierProduct => ({
  ...item,
  supplier_id: item?.supplier_id ?? item?.supplierId,
  product_id: item?.product_id ?? item?.productId,
  importPrice: item?.importPrice ?? item?.import_price ?? item?.price,
  import_price: item?.import_price ?? item?.importPrice ?? item?.price,
  minOrderQuantity: item?.minOrderQuantity ?? item?.min_order_quantity,
  min_order_quantity: item?.min_order_quantity ?? item?.minOrderQuantity,
  leadTime: item?.leadTime ?? item?.lead_time ?? item?.leadTimeDays,
  lead_time: item?.lead_time ?? item?.leadTime ?? item?.leadTimeDays,
  purchaseUnit: item?.purchaseUnit ?? item?.purchase_unit,
  purchase_unit: item?.purchase_unit ?? item?.purchaseUnit,
  conversionQuantity: item?.conversionQuantity ?? item?.conversion_quantity,
  conversion_quantity: item?.conversion_quantity ?? item?.conversionQuantity,
  conversionTargetUnit: item?.conversionTargetUnit ?? item?.conversion_target_unit,
  conversion_target_unit: item?.conversion_target_unit ?? item?.conversionTargetUnit,
});

const normalizeSupplierProductPayload = (payload: any) => ({
  supplierId: payload.supplierId ?? payload.supplier_id,
  productId: payload.productId ?? payload.product_id,
  price: payload.price ?? payload.importPrice ?? payload.import_price,
  minOrderQuantity: payload.minOrderQuantity ?? payload.min_order_quantity,
  leadTimeDays: payload.leadTimeDays ?? payload.leadTime ?? payload.lead_time,
  isPreferred: payload.isPreferred ?? false,
  supplierSku: payload.supplierSku ?? payload.supplier_sku ?? null,
  purchaseUnit: payload.purchaseUnit ?? payload.purchase_unit ?? null,
  conversionQuantity: payload.conversionQuantity ? Number(payload.conversionQuantity) : payload.conversion_quantity ? Number(payload.conversion_quantity) : null,
  conversionTargetUnit: payload.conversionTargetUnit ?? payload.conversion_target_unit ?? null,
});

export const suppliersApi = {
  getSuppliers: async (): Promise<Supplier[]> => {
    const response = await apiClient.get("/suppliers");
    return unwrapApiList<any>(response.data, "suppliers").map(normalizeSupplier);
  },

  getSupplierById: async (id: string): Promise<Supplier> => {
    const response = await apiClient.get(`/suppliers/${id}`);
    return normalizeSupplier(unwrapApiField<any>(response.data, "supplier"));
  },

  createSupplier: async (payload: Partial<Supplier>): Promise<Supplier> => {
    const response = await apiClient.post("/suppliers", payload);
    return normalizeSupplier(unwrapApiField<any>(response.data, "supplier"));
  },

  updateSupplier: async (id: string, payload: Partial<Supplier>): Promise<Supplier> => {
    const response = await apiClient.put(`/suppliers/${id}`, payload);
    return normalizeSupplier(unwrapApiField<any>(response.data, "supplier"));
  },

  deleteSupplier: async (id: string): Promise<void> => {
    await apiClient.delete(`/suppliers/${id}`);
  },

  getSupplierProducts: async (): Promise<SupplierProduct[]> => {
    const response = await apiClient.get("/supplier-products");
    return unwrapApiList<any>(response.data, "supplierProducts").map(normalizeSupplierProduct);
  },

  createSupplierProduct: async (payload: Partial<SupplierProduct>): Promise<SupplierProduct> => {
    const response = await apiClient.post("/supplier-products", normalizeSupplierProductPayload(payload));
    return normalizeSupplierProduct(unwrapApiField<any>(response.data, "supplierProduct"));
  },

  updateSupplierProduct: async (id: string, payload: Partial<SupplierProduct>): Promise<SupplierProduct> => {
    const response = await apiClient.put(`/supplier-products/${id}`, normalizeSupplierProductPayload(payload));
    return normalizeSupplierProduct(unwrapApiField<any>(response.data, "supplierProduct"));
  },

  deleteSupplierProduct: async (id: string): Promise<void> => {
    await apiClient.delete(`/supplier-products/${id}`);
  },
};
