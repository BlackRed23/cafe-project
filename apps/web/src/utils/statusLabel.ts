const statusMap: Record<string, string> = {
  PENDING: "Chờ xử lý",
  CONFIRMED: "Đã xác nhận",
  PROCESSING: "Đang xử lý",
  PAID: "Đã thanh toán",
  COMPLETED: "Hoàn thành",
  CANCELLED: "Đã hủy",
  FAILED: "Thất bại",
  APPROVED: "Đã duyệt",
  SENT: "Đã gửi mail",
  RECEIVED: "Đã nhận",
  REJECTED: "Đã từ chối",
  WARNING: "Cảnh báo ngưỡng",
  WARNING_STOCK: "Cảnh báo ngưỡng",
  AT_THRESHOLD: "Chạm ngưỡng",
  LOW_STOCK: "Cần nhập hàng",
  OUT_OF_STOCK: "Hết hàng",
  IN_STOCK: "Bình thường",
  NEED_RESTOCK: "Cần nhập hàng",
  OK: "Bình thường",
};

export function getStatusLabel(status: string): string {
  if (!status) return "";
  return statusMap[status.toUpperCase()] || status;
}

