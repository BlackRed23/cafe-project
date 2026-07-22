# Báo cáo Scan: Tính năng Hạn sử dụng (Product Expiry / Batch tracking)

## 1. Schema & Database

### 1.1. Các bảng liên quan đến tồn kho (Inventory)
Bất ngờ là hệ thống **ĐÃ CÓ SẴN** các field và model liên quan đến Batch (Lô hàng) và Expiry (Hạn sử dụng) trong `packages/database/prisma/schema/inventory.prisma`.

- **Model `InventoryBatch` (Đã tồn tại)**:
  - `id`, `inventoryId`
  - `batchCode`: Mã lô hàng (String)
  - `quantity`: Số lượng còn lại trong lô (Int, default 0)
  - `expirationDate`: Ngày hết hạn (DateTime)
  - `createdAt`, `updatedAt`

- **Model `InventoryTransaction`**:
  - Đã có trường `batchId` (String, nullable) và quan hệ với `InventoryBatch`.

### 1.2. Quan hệ hiện tại
- `Product` - `Inventory`: Quan hệ **1 - 1** (Một sản phẩm chỉ có 1 bản ghi Inventory tổng).
- `Inventory` - `InventoryBatch`: Quan hệ **1 - Nhiều** (Một kho có nhiều lô hàng khác nhau với ngày hết hạn khác nhau).
- `PurchaseRequest` - `PurchaseRequestItem`: Quan hệ 1 - Nhiều. `PurchaseRequestItem` tham chiếu tới `Inventory` nhưng hiện tại **không chứa field expirationDate hay batchCode** ở mức đặt hàng (điều này hợp lý vì ngày hết hạn chỉ biết khi hàng thực tế giao đến).

---

## 2. Luồng Nhận hàng (Receive PR)

Luồng Nhận hàng hiện tại **CHƯA** hỗ trợ nhập lô và hạn sử dụng.

| File | Chi tiết hiện tại | Cần sửa/Rủi ro |
| ---- | ----------------- | -------------- |
| `apps/api/src/modules/purchase/purchase.repository.ts` | Hàm `receive()` chỉ đang cộng `inventory.quantity` và tạo `InventoryTransaction` loại `IMPORT`. Nó hoàn toàn bỏ qua việc tạo `InventoryBatch`. | **Phải sửa:** Khi nhận hàng, phải tạo record `InventoryBatch` mới kèm `expirationDate`, đồng thời lưu `batchId` vào `InventoryTransaction`. |
| `apps/api/src/modules/purchase/purchase.validator.ts` | `receivePurchaseRequestSchema` chỉ validate `receivedQuantity` (number). | **Phải sửa:** Thêm tuỳ chọn truyền mảng `batches: [{ batchCode, expirationDate, quantity }]` khi nhận hàng. |
| `apps/web/src/pages/admin/AdminPurchaseRequestDetailPage.tsx` | UI modal nhận hàng (`openReceiveModal`) chỉ có duy nhất ô input nhập `receivedQuantities` (số lượng). | **Phải sửa:** Thêm UI cho phép thêm các lô hàng (nhập mã lô, chọn ngày hết hạn bằng DatePicker, nhập số lượng). |

---

## 3. Luồng Trừ kho (Order + Simulate Sale)

Cực kỳ may mắn, hệ thống **ĐÃ IMPLEMENT HOÀN CHỈNH thuật toán FEFO** (First Expired, First Out - Hết hạn trước, Xuất trước).

| File | Tình trạng | Chi tiết logic đã có sẵn |
| ---- | ---------- | ------------------------ |
| `apps/api/src/modules/order/order.repository.ts` | **Không cần sửa** | Ở hàm `updateStatus` (khi chuyển Order sang COMPLETED), hệ thống lấy các lô còn hạn (`expirationDate { gte: startOfToday }`) và sort `asc`. Sau đó trừ dần từng lô và tạo `InventoryTransaction` có gắn `batchId`. |
| `apps/api/src/modules/simulate-sale/simulate-sale.repository.ts` | **Không cần sửa** | Hàm `applySale` và `applyProductSale` cũng dùng y hệt logic FEFO trên. |

**Lưu ý Lock:** Cả Order và Simulate Sale đều bọc toàn bộ logic trừ lô trong `prisma.$transaction()`, điều này giúp hạn chế race condition khi trừ tồn kho lô.

---

## 4. Agent Scan

AI Agent cũng **ĐÃ HỖ TRỢ** quét lô hàng cận hạn/hết hạn.

| File | Tình trạng | Chi tiết logic đã có sẵn |
| ---- | ---------- | ------------------------ |
| `apps/agent/src/services/agent.service.ts` | **Chỉ đọc tham chiếu** | Từ line 630-710, Agent có vòng lặp duyệt qua `activeBatches`. So sánh `daysLeft` (số ngày còn lại):<br/>- `< 0`: `EXPIRED` (Đã hết hạn)<br/>- `<= 3`: `CRITICAL_EXPIRY` (Cực kỳ cận hạn)<br/>- `<= 7`: `NEAR_EXPIRY` (Cận hạn)<br/>Agent tạo ra các `AgentLog` với kết quả `WARNING` kèm `dedupeKey` chống trùng. |

Tuy nhiên, do hiện tại chức năng Nhận hàng chưa tạo `InventoryBatch`, nên luồng Agent này không bao giờ được trigger trong thực tế. Sau khi sửa bước 2 (Nhận hàng), Agent sẽ tự động chạy trơn tru mà không cần sửa code Agent.

---

## 5. Pattern PENDING_DELETE (Để tham chiếu làm tính năng Khoá/Ngưng bán lô hết hạn)

Hệ thống đang dùng pattern `pendingDeleteUntil` (Soft delete 7 ngày) rất triệt để, chúng ta có thể tham khảo để làm tính năng "Chặn xuất bán khi lô hết hạn":
- **Database:** Trường `pendingDeleteUntil` trong schema `Product`.
- **UI:** Trang danh sách sản phẩm có tab riêng `Chờ xoá` (`AdminProductsPage.tsx`), dùng hàm filter `!product.pendingDeleteUntil`. 
- **Agent:** Hàm `agentService.scanInventory` check nếu có `pendingDeleteUntil` thì `continue` bỏ qua, đồng thời sinh log `PRODUCT_PENDING_DELETE`.
- **Ứng dụng cho Hạn sử dụng:** Khi lô hết hạn, có thể dùng cron job hoặc event để tự cập nhật `product.isActive = false` nếu toàn bộ lô hàng đều hết hạn, hoặc chỉ hiển thị Badge màu đỏ "Có lô cận hạn/hết hạn" trên bảng danh sách.

---

## 6. Frontend Types & API

| File | Cần sửa | Ghi chú |
| ---- | ------- | ------- |
| `packages/types/src/product.type.ts` | **Phải sửa** | Cần bổ sung type `InventoryBatch` vào bên trong `ProductInventory` để UI có thể hiển thị danh sách các lô và ngày hết hạn. |
| `apps/web/src/api/purchaseRequests.api.ts` | **Không** | API đã hỗ trợ truyền JSON arbitrary cho `receivePurchaseRequest`, tuỳ thuộc vào payload truyền từ Component. |
| Case Naming | **Lưu ý** | Không có xung đột dual-case với các field của `InventoryBatch`. Dùng chuẩn camelCase (`batchCode`, `expirationDate`) xuyên suốt. |

---

## 7. Notification / Toast

Hiện tại ứng dụng sử dụng 2 cơ chế Toast:
- Local/Inline Toast: `const { showToast } = useToast()` kết hợp component `<ToastContainer>` nội bộ của file đó.
- Global Toast: `globalToast.success("...", "...", url)` dùng để hiển thị popup notification chung cho toàn hệ thống.

**Cho tính năng Expiry:** Có thể dùng `globalToast.warning("Lô hàng sắp hết hạn", "Sản phẩm A còn 3 ngày", "/admin/inventory/x")` để bắn thông báo ngay khi Agent quét ra lỗi (hoặc có thể tận dụng dropdown Chuông báo - Notification Bell đã tích hợp sẵn Agent Logs).

---

## 8. Kết luận & Danh sách file CẦN SỬA ở bước sau

Để tính năng hoạt động thực tế, chỉ cần làm khâu **Đầu vào (Nhận hàng)** và **Hiển thị (UI Tồn kho)**. Các khâu Trừ kho và AI Agent quét lỗi đã được làm sẵn.

**Danh sách file bắt buộc phải sửa:**
1. `apps/api/src/modules/purchase/purchase.validator.ts` (Thêm schema lô hàng khi nhận).
2. `apps/api/src/modules/purchase/purchase.repository.ts` (Lưu thông tin lô hàng vào bảng `InventoryBatch`).
3. `apps/web/src/pages/admin/AdminPurchaseRequestDetailPage.tsx` (Thêm UI nhập Hạn sử dụng & Lô).
4. `packages/types/src/product.type.ts` (Thêm Type batch).
5. (Tuỳ chọn bổ sung) `apps/web/src/pages/admin/AdminInventoryDetailPage.tsx` (Thêm bảng danh sách các lô hàng đang còn của sản phẩm để quản lý).

**Rủi ro/Lưu ý xung đột:** 
- Rủi ro duy nhất là người dùng không biết mã lô hàng thì nhập gì? -> Cần có logic tự sinh mã lô (VD: `BATCH_YYMMDD_XXX`) nếu người dùng để trống.
- Nếu người dùng bấm nhận hàng từng phần nhiều lần nhưng lại nhập cùng 1 mã lô thì phải cộng dồn `quantity` vào lô cũ hay tạo lô mới? -> Khuyến nghị nên xử lý `upsert` lô hàng dựa theo `batchCode` (nếu trùng mã lô thì cộng số lượng).
