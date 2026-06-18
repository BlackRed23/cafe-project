import type { Product } from "./product.types";

export type PaymentMethod = "CASH" | "BANK_TRANSFER";
export type PaymentStatus = "PENDING" | "SUCCESS" | "PAID" | "FAILED" | "REFUNDED";
export type OrderStatus =
  | "PENDING"
  | "CONFIRMED"
  | "PROCESSING"
  | "COMPLETED"
  | "CANCELLED";

export interface OrderItemPayload {
  productId: string;
  quantity: number;
}

export interface CreateOrderPayload {
  items: OrderItemPayload[];
  paymentMethod: PaymentMethod;
  note?: string;
}

export interface OrderItem {
  id: string;
  orderId: string;
  productId: string;
  quantity: number;
  price: number;
  product?: Product;
}

export interface Order {
  id: string;
  userId: string;
  customer?: {
    id?: string;
    name?: string | null;
    email?: string | null;
  } | null;
  totalAmount: number;
  status: OrderStatus;
  paymentMethod: PaymentMethod;
  paymentStatus: PaymentStatus;
  note?: string;
  createdAt: string;
  updatedAt: string;
  items?: OrderItem[];
}
