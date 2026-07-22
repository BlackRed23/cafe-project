# Frontend–Backend Integration Log

Ghi chép các thay đổi tích hợp giữa Frontend và Backend trong dự án Cafe Project System.

---

## [2026-07-20] Xoá section "Công nợ nhà cung cấp" khỏi trang chi tiết yêu cầu nhập hàng

**Lý do:**
Đơn giản hoá giao diện thanh toán để tập trung phạm vi dự án vào chức năng quản lý tồn kho bằng AI Agent. Section "Công nợ nhà cung cấp" (hiển thị Đã nhận / Đã trả / Còn nợ) dựa trên các trường `receivedAmount` và `amountPaid` chưa được tính toán chính xác ở backend trong giai đoạn hiện tại, gây hiển thị sai lệch (luôn = 0đ). Xoá phần hiển thị này giúp tránh nhầm lẫn cho người dùng.

**Thay đổi:**
- Xoá card "Công nợ nhà cung cấp" (JSX block với `PaymentField` Đã nhận / Đã trả / Còn nợ)
- Đổi wrapper từ `grid grid-cols-1 md:grid-cols-2` sang `div` đơn vì chỉ còn 1 card
- Giữ nguyên: card "Thanh toán nhà cung cấp", badge trạng thái, button "Đánh dấu đã thanh toán"
- Không đổi: `receivedAmount` / `amountPaid` trong `purchaseRequest.types.ts` và `purchaseRequests.api.ts` (vẫn giữ định nghĩa và normalize, sẵn sàng tái sử dụng khi backend hoàn thiện logic)

**File đã chỉnh:**
- `apps/web/src/pages/admin/AdminPurchaseRequestDetailPage.tsx` — dòng 703–735 (trước khi sửa)

**Build result:** PASS (5/5 successful)

## [2026-07-21] Xoá lại section "Công nợ nhà cung cấp" khỏi trang chi tiết yêu cầu nhập hàng

**Lý do:**
Đơn giản hoá giao diện thanh toán để tập trung phạm vi dự án vào chức năng quản lý tồn kho bằng AI Agent. Các trường `receivedAmount` và `amountPaid` không cần thiết phải hiển thị ở giao diện hiện tại.

**Thay đổi:**
- Xoá block "Công nợ nhà cung cấp" hiển thị Đã nhận / Đã trả / Còn nợ.
- Các thành phần khác (badge trạng thái, button đánh dấu đã thanh toán) giữ nguyên.
- Không thay đổi backend hay types.

**File đã chỉnh:**
- `apps/web/src/pages/admin/AdminPurchaseRequestDetailPage.tsx`

**Build result:** PASS

## Latest - Unify Pending Payment Status Label
- File scan: statusLabel.ts, Badge.tsx, AdminOrdersPage.tsx, AdminOrderDetailPage.tsx
- File sửa: apps/web/src/utils/statusLabel.ts, apps/web/src/components/common/Badge.tsx, apps/web/src/pages/admin/AdminOrdersPage.tsx, apps/web/src/pages/admin/AdminOrderDetailPage.tsx
- Giải pháp: thêm context "order"/"payment" vào getStatusLabel + Badge, tránh ảnh hưởng domain khác dùng chung statusMap PENDING
- Đổi "Chờ xử lý" → "Chờ xử lý thanh toán" tại: Order List (Badge + filter + pending count nếu áp dụng), Order Detail (Payment Badge, Order Badge)
- Không đổi enum, không đổi DB, không đổi statusMap gốc dùng chung
- Build: PASS
