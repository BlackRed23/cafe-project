import type { PaymentMethod } from "../types/order.types";

// ── Thông tin tài khoản ngân hàng của cửa hàng ──────────────────────────────
export const STORE_BANK_INFO = {
  bankId: "vcb",          // Mã ngân hàng (vcb = Vietcombank)
  bankName: "Vietcombank",
  accountNo: "1234567890",
  accountName: "NGUYEN VAN A",
};

// ── Label hiển thị phương thức thanh toán ───────────────────────────────────
export const PAYMENT_METHOD_LABELS: Record<PaymentMethod, string> = {
  CASH: "💵 Tiền mặt (COD)",
  BANK_TRANSFER: "🏦 Chuyển khoản",
};

export function getPaymentMethodLabel(method: PaymentMethod | string | null | undefined): string {
  if (!method) return "Không rõ";
  return PAYMENT_METHOD_LABELS[method as PaymentMethod] ?? method;
}

