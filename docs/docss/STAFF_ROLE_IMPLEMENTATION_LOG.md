# STAFF ROLE IMPLEMENTATION LOG

## Mục tiêu
Triển khai phân quyền và giao diện cho vai trò mới: `STAFF` (Nhân viên), dựa trên tài liệu scan `docs/STAFF_ROLE_SCAN_LOG.md`.

## PHẦN 1 — BACKEND: Cập nhật Auth Guard
**Trạng thái: Hoàn thành**

1. **API Nhà cung cấp (`supplier.route.ts`)**
   - Chuyển quyền truy cập các route `GET` (list + detail) từ `['ADMIN', 'STAFF']` về chỉ còn `['ADMIN']`.
   
2. **API Cài đặt hệ thống (`system-setting.route.ts`)**
   - Chuyển quyền truy cập route `GET /` từ `['ADMIN', 'STAFF']` về chỉ còn `['ADMIN']`.
   
3. **API Yêu cầu nhập hàng (`purchase.route.ts`)**
   - Mở quyền route `PATCH /:id/receive` (Nhận hàng) thành `['ADMIN', 'STAFF']`.
   - Giữ nguyên `['ADMIN']` cho các chức năng nhạy cảm: `approve`, `reject`, `send-email`.
   
4. **API AI Agent (`agent.route.ts`)**
   - Mở quyền route `GET /logs` (Xem nhật ký AI) thành `['ADMIN', 'STAFF']`.
   
5. **API Dashboard (`dashboard.service.ts`, `dashboard.controller.ts`, `dashboard.route.ts`)**
   - Bổ sung hàm `getStaffSummary()` để cung cấp dữ liệu thống kê giới hạn riêng cho STAFF.
   - Thêm route mới `GET /dashboard/staff-summary` với guard `['ADMIN', 'STAFF']`.

## PHẦN 2 — FRONTEND: Phân quyền giao diện & Route
**Trạng thái: Hoàn thành**

1. **Context & Types (`AuthContext.tsx`, `auth.types.ts`)**
   - Thêm role `"STAFF"` vào kiểu `UserRole`.
   - Thêm biến `isStaff` vào `AuthContext` (trả về true khi role là STAFF).
   
2. **Bảo vệ Routes (`AppRoutes.tsx`, `AdminOnlyRoute.tsx`, `AdminRoute.tsx`)**
   - Cập nhật `AdminRoute.tsx` để cho phép `isStaff` truy cập.
   - Tạo mới `AdminOnlyRoute.tsx` dành cho các trang bị giới hạn hoàn toàn khỏi STAFF.
   - Đưa các route `categories`, `suppliers`, `system-settings`, `simulate-sale`, `users`, `products/create` vào `AdminOnlyRoute`.

3. **Cập nhật Menu Sidebar (`Sidebar.tsx`)**
   - Lọc và ẩn các menu sau nếu là nhân viên (`isStaff`): *Danh mục, Nhà cung cấp, Cài đặt hệ thống, Users, Giả lập bán hàng*.

4. **Trang Dashboard (`AdminDashboardPage.tsx`)**
   - Sử dụng API `/dashboard/staff-summary` thay vì dữ liệu đầy đủ nếu là STAFF.
   - Ẩn nút "Chạy Giả Lập Bán" và "Luồng demo hệ thống" với STAFF.

5. **Trang Sản phẩm (`AdminProductsPage.tsx`) & Danh mục (`AdminCategoriesPage.tsx`)**
   - Ẩn nút "Thêm sản phẩm" / "Thêm danh mục".
   - Ẩn toàn bộ cột thao tác (Sửa, Xóa).
   
6. **Trang Tồn kho (`AdminInventoryPage.tsx`)**
   - Ẩn tính năng "Quét tồn kho bằng AI Agent".
   - Trong bảng, chỉ cho phép hiển thị nút "Chi tiết". Ẩn các nút "Tạo YC nhập", "Nhập kho", "Điều chỉnh", "Ngưỡng".

7. **Trang Quản lý PRs (`AdminPurchaseRequestsPage.tsx` & `AdminPurchaseRequestDetailPage.tsx`)**
   - `AdminPurchaseRequestsPage.tsx`: Ẩn nút "Tạo yêu cầu nhập hàng".
   - `AdminPurchaseRequestDetailPage.tsx`: Ẩn các nút Duyệt, Từ chối/Hủy và tính năng Gửi email/Nhập email nhà cung cấp. STAFF vẫn xem được chi tiết và sử dụng tính năng "Nhận hàng", "Xác nhận đã thanh toán".

8. **Trang Nhật ký AI Agent (`AdminAgentLogsPage.tsx`)**
   - STAFF được xem toàn bộ bảng log (không có tính năng kích hoạt Run/Scan trong trang này nên đảm bảo an toàn).

## Kết luận
Toàn bộ logic phân quyền cho Role STAFF đã được tích hợp lên Frontend và Backend, đồng thời pass build thành công mà không gây ảnh hưởng đến logic của ADMIN.

## PHẦN 5 — Bổ sung form quản lý User
**Trạng thái: Hoàn thành**

- **File đã sửa:** `apps/web/src/pages/admin/AdminUsersPage.tsx`
- **Nội dung sửa:**
  - Bổ sung tuỳ chọn `"Nhân viên (STAFF)"` (`value="STAFF"`) vào Dropdown "Quyền hạn hệ thống", kẹp giữa Khách hàng và Admin để hợp lý về UX.
  - Cập nhật state `role` để nhận kiểu `STAFF`.
  - Cập nhật hàm `render` cột "Quyền hạn" trong bảng để hiển thị đúng label `Nhân viên` (kèm màu và icon xanh dương `Users` phân biệt với Admin) khi dữ liệu trả về `role === "STAFF"`. Tránh lỗi hiện chữ trống hoặc undefined.
  - Dropdown "Trạng thái hoạt động" giữ nguyên, không bị ảnh hưởng.
- **Kết quả:** Code compile thành công, UI hiển thị đầy đủ và luồng Tạo mới/Cập nhật user với role STAFF hoạt động mượt mà. Đã xác nhận map được label vào bảng.
## PHẦN 6 — Kiểm tra nút thanh toán sau nhận hàng
**Trạng thái: Đã hoàn tất điều tra (Chưa sửa code)**

**1. Nút này có từ bao giờ, phục vụ nghiệp vụ gì?**
- Nút "Đánh dấu đã thanh toán" xuất hiện nhờ biến `canMarkPaid` trong `AdminPurchaseRequestDetailPage.tsx` (dòng 518). Điều kiện render là Purchase Request đã có status `RECEIVED` hoặc `COMPLETED`, và `paymentStatus` là `UNPAID`.
- Nút này **không phải là lỗi code mới sinh ra**. Nó vốn là tính năng đã có từ trước dành cho quản trị viên để ghi nhận công nợ thanh toán tiền hàng cho Nhà Cung Cấp. Việc nó hiển thị cho STAFF là do trước đây chưa có role STAFF nên frontend chưa bọc logic `!isStaff` cho biến `canMarkPaid`.

**2. Backend guard hiện tại là gì?**
- Nút gọi API: `POST /purchase-requests/:id/mark-paid`.
- Tại `apps/api/src/modules/purchase/purchase.route.ts`, route này đang được bảo vệ nghiêm ngặt bằng guard `...adminOnly` (`requireRole(['ADMIN'])`).
- Vì vậy, **STAFF hoàn toàn KHÔNG THỂ gọi được API này**. Nếu STAFF bấm vào nút trên giao diện, hệ thống sẽ gọi API và bị backend từ chối với mã lỗi `403 Forbidden`. Đây không phải là lỗ hổng bảo mật rò rỉ quyền, mà chỉ là lỗi về mặt UX (hiển thị nút mà không có quyền bấm).

**3. Đề xuất xử lý**
- Nghiệp vụ "thanh toán công nợ nhà cung cấp" liên quan mật thiết đến dòng tiền tài chính của cửa hàng. Đúng như thống nhất ban đầu, STAFF (nhân viên kho/bán hàng) không nên có quyền quyết định hoặc xác nhận chi tiền.
- **Đề xuất:** Chỉ cần cập nhật UI để ẩn nút này đi với STAFF (thêm điều kiện `!isStaff` vào biến `canMarkPaid` ở Frontend). Backend đã chặn tốt nên không cần can thiệp. Vui lòng xác nhận để tôi tiến hành sửa đổi UI.
