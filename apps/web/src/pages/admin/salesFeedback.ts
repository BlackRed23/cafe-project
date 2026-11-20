import type { CreateOrderPayload, Order } from "../../types/order.types";

export const lifecycle = [
  "PENDING",
  "CONFIRMED",
  "PREPARING",
  "COMPLETED",
] as const;
export const salesLabels: Record<string, string> = {
  PENDING: "Chờ xác nhận",
  CONFIRMED: "Đã xác nhận",
  PROCESSING: "Đã xác nhận",
  PREPARING: "Đang pha chế",
  COMPLETED: "Hoàn thành",
  CANCELLED: "Đã hủy",
  PAID: "Đã thanh toán",
  SUCCESS: "Thành công",
  FAILED: "Thất bại",
  REFUNDED: "Đã hoàn tiền",
  REQUESTED: "Chờ ADMIN duyệt",
  APPLIED: "Đã áp dụng",
  CANCEL: "Hủy đơn",
  REMAKE: "Pha lại",
  CORRECTION: "Sửa món sau pha chế",
  EDIT: "Thay đổi món",
  PREPARE_REPLACEMENT: "Pha món thay thế",
  VOIDED: "Đã vô hiệu",
  COMMITTED: "Đã tiêu hao",
  SALE: "Món bán",
};
export const displayStatus = (order: Order) =>
  order.displayStatus ??
  (order.status === "PROCESSING" ? "CONFIRMED" : order.status);
export const nextStatus = (order: Order) => {
  const index = lifecycle.indexOf(
    displayStatus(order) as (typeof lifecycle)[number],
  );
  return index >= 0 && index < lifecycle.length - 1
    ? lifecycle[index + 1]
    : undefined;
};
export const beforePreparation = (order: Order) =>
  ["PENDING", "CONFIRMED"].includes(displayStatus(order)) &&
  !order.stockDeductedAt;
export const canEditItems = (order: Order) =>
  beforePreparation(order) &&
  order.paymentMethod === "CASH" &&
  !["PAID", "SUCCESS", "REFUNDED"].includes(order.paymentStatus) &&
  order.payment?.status !== "PAID";
export function errorStatus(error: unknown): number | undefined {
  return (error as { response?: { status?: number } })?.response?.status;
}
export function uncertainOutcome(error: unknown) {
  const status = errorStatus(error);
  return status == null || status === 408 || status === 429 || status >= 500;
}
export function salesError(
  error: unknown,
  fallback = "Không thể thực hiện. Vui lòng thử lại.",
): string {
  const status = errorStatus(error);
  const raw = String(
    (error as { response?: { data?: { message?: string } } })?.response?.data
      ?.message ?? "",
  ).toLowerCase();
  if (status === 401) return "Phiên đăng nhập hết hạn. Vui lòng đăng nhập lại.";
  if (status === 403)
    return "Bạn không có quyền thực hiện thao tác này. Cần tài khoản được cấp quyền.";
  if (status === 404) return "Không tìm thấy dữ liệu. Tải lại để kiểm tra.";
  if (/requestid|request id|payload.*conflict/.test(raw))
    return "Mã yêu cầu đã dùng với nội dung khác. Đối soát yêu cầu cũ trước khi tạo thao tác mới.";
  if (/version|stale/.test(raw))
    return "Đơn đã thay đổi. Tải lại, kiểm tra nội dung rồi xác nhận lại; không tự gửi lại.";
  if (/reconcil|payment before|paid.*edit/.test(raw))
    return "Cần đối soát thanh toán trước khi sửa món. Liên hệ ADMIN.";
  if (/stock|ingredient|inventory/.test(raw))
    return "Không đủ nguyên liệu khả dụng hoặc dữ liệu giữ kho không khớp. Kiểm tra tồn kho trước khi thử lại.";
  if (/transition|status|prepared|eligible|consumed|replaced/.test(raw))
    return "Trạng thái đơn hoặc món không còn phù hợp. Tải lại và chọn thao tác hợp lệ.";
  if (status === 409)
    return "Dữ liệu xung đột. Tải lại và đối soát trước khi tạo yêu cầu mới.";
  if (status === 400)
    return "Yêu cầu không hợp lệ. Kiểm tra sản phẩm, số lượng và lý do.";
  if (uncertainOutcome(error))
    return "Chưa xác định kết quả máy chủ. Giữ nguyên nội dung; đối soát hoặc thử lại cùng mã yêu cầu.";
  return fallback;
}

// Caller owns immutable intent; lookup first after any uncertain outcome.
export async function submitSalesOrder(
  api: {
    createOrder: (payload: CreateOrderPayload) => Promise<Order>;
    getOrderByRequest: (id: string) => Promise<Order>;
  },
  payload: CreateOrderPayload,
  reconcile: boolean,
) {
  if (!payload.requestId) throw new Error("requestId required");
  if (reconcile) {
    try {
      return await api.getOrderByRequest(payload.requestId);
    } catch (error) {
      if (errorStatus(error) !== 404) throw error;
    }
  }
  try {
    return await api.createOrder(payload);
  } catch (error) {
    if (uncertainOutcome(error)) {
      try {
        return await api.getOrderByRequest(payload.requestId);
      } catch {
        /* preserve original outcome and intent */
      }
    }
    throw error;
  }
}
