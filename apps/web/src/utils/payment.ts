import type { PaymentMethod } from "../types/order.types";

// ── Thông tin tài khoản ngân hàng của cửa hàng ──────────────────────────────
export const STORE_BANK_INFO = {
  bankId: "vcb",          // Mã ngân hàng (vcb = Vietcombank)
  bankName: "Vietcombank",
  accountNo: "1234567890",
  accountName: "NGUYEN VAN A",
};

// ── Label hiển thị phương thức thanh toán (UTF-8 chuẩn) ─────────────────────
export const PAYMENT_METHOD_LABELS: Record<PaymentMethod, string> = {
  CASH: "Tiền mặt",
  BANK_TRANSFER: "Chuyển khoản",
  VIET_QR: "VietQR",
  MOMO: "Ví MoMo",
  VNPAY: "VNPay",
};

export function getPaymentMethodLabel(method: PaymentMethod | string | null | undefined): string {
  if (!method) return "Không rõ";
  return PAYMENT_METHOD_LABELS[method as PaymentMethod] ?? method;
}

/**
 * Tách orderId từ merchantRef có dạng `${orderId}_${attemptNo}`.
 */
export function extractOrderIdFromMerchantRef(merchantRef: string | null | undefined): string {
  const raw = String(merchantRef ?? "").trim();
  if (!raw) return "";
  const lastUnderscore = raw.lastIndexOf("_");
  if (lastUnderscore <= 0) return raw;
  const suffix = raw.slice(lastUnderscore + 1);
  if (/^\d+$/.test(suffix)) {
    return raw.slice(0, lastUnderscore);
  }
  return raw;
}
