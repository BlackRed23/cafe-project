import { apiClient, USE_MOCK } from "./client";
import type { Supplier, SupplierProduct } from "../types/supplier.types";
import { MockDB } from "./mockDb";

export const suppliersApi = {
  getSuppliers: async (): Promise<Supplier[]> => {
    if (USE_MOCK) {
      return MockDB.getSuppliers();
    }
    const response = await apiClient.get<Supplier[]>("/suppliers");
    return response.data;
  },

  getSupplierById: async (id: string): Promise<Supplier> => {
    if (USE_MOCK) {
      const s = MockDB.getSuppliers().find((item) => item.id === id);
      if (s) return s;
      throw new Error("Không tìm thấy");
    }
    const response = await apiClient.get<Supplier>(`/suppliers/${id}`);
    return response.data;
  },

  createSupplier: async (payload: Partial<Supplier>): Promise<Supplier> => {
    if (USE_MOCK) {
      return MockDB.createSupplier(payload);
    }
    const response = await apiClient.post<Supplier>("/suppliers", payload);
    return response.data;
  },

  updateSupplier: async (id: string, payload: Partial<Supplier>): Promise<Supplier> => {
    if (USE_MOCK) {
      return MockDB.updateSupplier(id, payload);
    }
    const response = await apiClient.put<Supplier>(`/suppliers/${id}`, payload);
    return response.data;
  },

  deleteSupplier: async (id: string): Promise<void> => {
    if (USE_MOCK) {
      MockDB.deleteSupplier(id);
      return;
    }
    await apiClient.delete(`/suppliers/${id}`);
  },

  // Supplier Products links
  getSupplierProducts: async (): Promise<SupplierProduct[]> => {
    if (USE_MOCK) {
      return MockDB.getSupplierProducts();
    }
    const response = await apiClient.get<SupplierProduct[]>("/supplier-products");
    return response.data;
  },

  createSupplierProduct: async (payload: Partial<SupplierProduct>): Promise<SupplierProduct> => {
    if (USE_MOCK) {
      return MockDB.createSupplierProduct(payload);
    }
    const response = await apiClient.post<SupplierProduct>("/supplier-products", payload);
    return response.data;
  },

  updateSupplierProduct: async (id: string, payload: Partial<SupplierProduct>): Promise<SupplierProduct> => {
    if (USE_MOCK) {
      const links = MockDB.getSupplierProducts();
      const idx = links.findIndex((l) => l.id === id);
      if (idx !== -1) {
        // update simple mock
        const updated = { ...links[idx], ...payload };
        return updated;
      }
      throw new Error("Không tìm thấy liên kết");
    }
    const response = await apiClient.put<SupplierProduct>(`/supplier-products/${id}`, payload);
    return response.data;
  },

  deleteSupplierProduct: async (id: string): Promise<void> => {
    if (USE_MOCK) {
      MockDB.deleteSupplierProduct(id);
      return;
    }
    await apiClient.delete(`/supplier-products/${id}`);
  },
};
