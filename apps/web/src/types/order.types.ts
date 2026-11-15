import type { Product } from "./product.types";

export type PaymentMethod = "CASH" | "BANK_TRANSFER" | "VIET_QR" | "MOMO" | "VNPAY";
export type PaymentStatus = "PENDING" | "SUCCESS" | "PAID" | "FAILED" | "REFUNDED";
export type TransactionStatus =
  | "INITIATED"
  | "PENDING"
  | "AUTHORIZED"
  | "PAID"
  | "FAILED"
  | "CANCELLED"
  | "EXPIRED"
  | "REFUNDED";

export type OrderStatus =
  | "PENDING"
  | "CONFIRMED"
  | "PROCESSING"
  | "COMPLETED"
  | "CANCELLED";

export interface PaymentAttempt {
  id: string;
  orderId: string;
  method: PaymentMethod;
  merchantRef?: string | null;
  providerTxnId?: string | null;
  attemptNo: number;
  amount: number;
  status: TransactionStatus;
  failureCode?: string | null;
  failureMessage?: string | null;
  paidAt?: string | null;
  expiresAt?: string | null;
  createdAt?: string;
  updatedAt?: string;
}

export interface OrderItemPayload {
  productId: string;
  quantity: number;
  toppings?: Array<{
    toppingId: string;
    quantity: number;
  }>;
}

export interface CreateOrderPayload {
  items: OrderItemPayload[];
  paymentMethod: PaymentMethod;
  shippingName: string;
  shippingPhone: string;
  shippingAddress: string;
  note?: string;
}

export interface OrderItemTopping {
  id: string;
  toppingId: string;
  toppingName?: string;
  quantity: number;
  price: number;
  unitPrice?: number;
  costSnapshot?: number;
}

export interface OrderItem {
  id: string;
  orderId: string;
  productId: string;
  productName?: string;
  productSku?: string;
  recipeId?: string | null;
  recipeVersion?: number | null;
  consumptionStatus?: "PENDING" | "COMMITTED" | "VOIDED";
  quantity: number;
  price: number;
  unitPrice?: number;
  subtotal?: number;
  ingredientCost?: number;
  toppingCost?: number;
  totalCost?: number;
  grossProfit?: number;
  toppings?: OrderItemTopping[];
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
  totalCogs?: number;
  grossProfit?: number;
  status: OrderStatus;
  paymentMethod: PaymentMethod;
  paymentStatus: PaymentStatus;
  payment?: PaymentAttempt | null;
  shippingName?: string | null;
  shippingPhone?: string | null;
  shippingAddress?: string | null;
  note?: string;
  stockDeductedAt?: string | null;
  createdAt: string;
  updatedAt: string;
  items?: OrderItem[];
}
