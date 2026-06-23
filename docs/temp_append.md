
## [2026-06-23 10:22] Nhận hàng theo số lượng thực nhận
- Đã cập nhật `purchase.repository.ts` để hỗ trợ nhận số lượng một phần và cập nhật `quantityReceived`. Chặn nhận hàng vượt quá số lượng yêu cầu.
- Đã cập nhật UI `AdminPurchaseRequestDetailPage.tsx` bằng custom modal có input số lượng thực nhận cho từng sản phẩm. Modal hiển thị rõ số lượng tổng, đã nhận, còn lại và quy cách.
- Cập nhật badge status: PR ở trạng thái `SENT` có `quantityReceived > 0` sẽ hiện `Đã nhận một phần`.
- Đã thêm `AgentLog` action `RECEIVE_PURCHASE_REQUEST` ở backend có đính kèm object `notification` để hiển thị trên chuông báo hệ thống cho admin (Đã nhận hàng hoặc Đã nhận một phần).
- Chống nhận lặp được thực hiện ở backend và frontend tự động chặn nút khi số lượng đã nhận đủ.
- Đã build thành công dự án web và api.
