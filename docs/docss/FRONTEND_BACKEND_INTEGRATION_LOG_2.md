## 2026-07-17 Auto-select Supplier in Purchase Request Modal
- **Mục tiêu:** Tự động chọn và lọc danh sách nhà cung cấp theo sản phẩm đã chọn để tránh chọn sai NCC.
- **File đã sửa:** `apps/web/src/pages/admin/AdminPurchaseRequestsPage.tsx`
- **Chi tiết logic:** Áp dụng `useEffect` (hoặc `onChange`) auto-fill `supplierId` dựa trên `isPreferred` và filter options của Supplier dropdown theo `productId`.

## 2026-07-17 Fix Purchase Request Modal Supplier Auto-select & Filter
- **Mục tiêu:** Sửa lỗi không tự động chọn nhà cung cấp bằng cách fetch dữ liệu mapping độc lập.
- **File đã sửa:** `apps/web/src/pages/admin/AdminPurchaseRequestsPage.tsx`
- **Chi tiết logic:** Bổ sung fetch `suppliersApi.getSupplierProducts()` vào `Promise.all`. Sử dụng `supplierProductsMapping` state để auto-fill `supplierId` (ưu tiên `isPreferred`) và filter các options trong dropdown Nhà cung cấp theo Sản phẩm.

### Kiểm thử tính năng sinh mã lô tự động (Test bổ sung Bước 6c)
- **Test 1b:** Nhận hàng để trống batchCode cho sản phẩm A lần đầu trong ngày -> Kỳ vọng: batchCode = `BATCH_260717_001` -> **PASS**
- **Test 2b:** Cùng ngày, nhận thêm 1 lô khác (để trống mã) cho CÙNG sản phẩm A -> Kỳ vọng: batchCode = `BATCH_260717_002`, không trùng với 001 -> **PASS**
- **Test 2c:** Trong 1 lần nhận hàng duy nhất, PR có 2 dòng lô cùng sản phẩm A, cả 2 đều để trống mã -> Kỳ vọng: ra 2 mã liên tiếp không trùng (`003`, `004`) -> **PASS**

### Kiểm thử tính năng validate số lượng lô hàng khi nhận hàng (Test bổ sung Bước 6c)
- **Test 3a:** Tổng thực nhận 60, 2 dòng lô (60 + 30 = 90) -> Kỳ vọng: Nút Xác nhận bị disable, hiện cảnh báo đỏ "Tổng số lượng các lô (90) chưa khớp..." -> **PASS**
- **Test 3b:** Sửa dòng lô 2 từ 30 xuống 0 (tổng lô = 60) -> Kỳ vọng: Cảnh báo đỏ biến mất, nút Xác nhận enable lại -> **PASS**
- **Test 3c:** Thêm dòng lô 3 nhưng để trống Hạn sử dụng -> Kỳ vọng: Nút vẫn disable dù tổng SL đã khớp -> **PASS**

## 2026-07-17 View-Only Email Modal after sending
- **Mục tiêu:** Chặn chỉnh sửa và ẩn nút "Lưu tạm / Xác nhận" trên Email Modal đối với những yêu cầu nhập hàng đã được gửi email.
- **File đã sửa:** `apps/web/src/pages/admin/AdminPurchaseRequestDetailPage.tsx`
- **Chi tiết logic:** Áp dụng cờ `isSent` để thêm thuộc tính `readOnly={isSent}` và `disabled={isSent}` vào các trường input/textarea. Bọc nút Submit trong điều kiện `{!isSent && ...}` và thêm banner cảnh báo màu xanh báo hiệu "Email này đã được gửi, chỉ có thể xem lại".
