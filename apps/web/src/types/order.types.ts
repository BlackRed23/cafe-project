import type { Product } from "./product.types";

export type PaymentMethod = "CASH" | "BANK_TRANSFER" | "VIET_QR";
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
  shippingName: string;
  shippingPhone: string;
  shippingAddress: string;
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
  shippingFee?: number | null;
  shippingZone?: string | null;
  status: OrderStatus;
  paymentMethod: PaymentMethod;
  paymentStatus: PaymentStatus;
  shippingName?: string | null;
  shippingPhone?: string | null;
  shippingAddress?: string | null;
  note?: string;
  stockDeductedAt?: string | null;
  createdAt: string;
  updatedAt: string;
  items?: OrderItem[];
}
