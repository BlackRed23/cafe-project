import type { Product } from "./product.types";

export type PaymentMethod =
  | "CASH"
  | "BANK_TRANSFER"
  | "VIET_QR"
  | "MOMO"
  | "VNPAY";
export type PaymentStatus =
  | "PENDING"
  | "SUCCESS"
  | "PAID"
  | "FAILED"
  | "REFUNDED";
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
  | "PREPARING"
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
  requestId?: string;
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
  product_id?: string;
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
  Product?: Pick<Product, "name" | "unit">;
  Price?: number;
}

export interface Order {
  version?: number;
  displayStatus?: OrderStatus;
  adjustmentTotal?: number;
  adjustedPayable?: number;
  additionalAmountDue?: number;
  refundDue?: number;
  operations?: OrderOperation[];
  itemHistory?: OrderItemHistory[];
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
  payment_method?: PaymentMethod;
  paymentStatus: PaymentStatus;
  payment_status?: PaymentStatus;
  payment?: PaymentAttempt | null;
  shippingName?: string | null;
  shippingPhone?: string | null;
  shippingAddress?: string | null;
  note?: string;
  stockDeductedAt?: string | null;
  createdAt: string;
  created_at?: string;
  updatedAt: string;
  items?: OrderItem[];
}

export interface OrderItemHistory {
  id: string;
  productId: string;
  recipeId?: string | null;
  recipeVersion?: number | null;
  price: number;
  quantity: number;
  originalItemId?: string | null;
  attemptType?: string;
  replacedAt?: string | null;
  consumptionStatus?: "PENDING" | "COMMITTED" | "VOIDED";
}

export interface OrderOperation {
  id: string;
  kind: string;
  status: string;
  reason: string;
  actorId?: string;
  approvedBy?: string | null;
  approvedAt?: string | null;
  createdAt?: string;
  originalItemId?: string | null;
  replacementItemId?: string | null;
  amountDelta?: number | string;
}

export interface OrderOperationInput {
  requestId: string;
  expectedVersion: number;
  kind: "CANCEL" | "REMAKE" | "CORRECTION";
  reason: string;
  originalItemId?: string;
  replacement?: { productId: string; quantity: number };
}

export interface EditOrderItemsInput {
  requestId: string;
  expectedVersion: number;
  reason: string;
  items: Array<{ productId: string; quantity: number }>;
}
