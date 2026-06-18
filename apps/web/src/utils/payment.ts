import type { PaymentMethod } from "../types/order.types";

// ── Thông tin tài khoản ngân hàng của cửa hàng ──────────────────────────────
export const STORE_BANK_INFO = {
  bankId: "vcb",          // Mã ngân hàng VietQR (vcb = Vietcombank)
  bankName: "Vietcombank",
  accountNo: "1234567890",
  accountName: "NGUYEN VAN A",
};

// ── Label hiển thị phương thức thanh toán ───────────────────────────────────
export const PAYMENT_METHOD_LABELS: Record<PaymentMethod, string> = {
  CASH: "💵 Tiền mặt (COD)",
  BANK_TRANSFER: "🏦 Chuyển khoản",
  VIET_QR: "📱 QR Ngân hàng",
};

export function getPaymentMethodLabel(method: PaymentMethod | string | null | undefined): string {
  if (!method) return "Không rõ";
  return PAYMENT_METHOD_LABELS[method as PaymentMethod] ?? method;
}

// ── Generate URL ảnh QR VietQR (API miễn phí, không cần token) ──────────────
export function generateVietQrUrl({
  amount,
  orderId,
}: {
  amount: number;
  orderId?: string;
}): string {
  const { bankId, accountNo, accountName } = STORE_BANK_INFO;
  const addInfo = orderId ? `Thanh toan don ${orderId}` : "Thanh toan don hang cafe";
  const params = new URLSearchParams({
    amount: String(Math.round(amount)),
    addInfo,
    accountName,
  });
  return `https://img.vietqr.io/image/${bankId}-${accountNo}-compact2.png?${params.toString()}`;
}
