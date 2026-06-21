# Frontend Cafe Agent Scan Log

## 1. Mục tiêu scan

Scan frontend Cafe Agent trước khi sửa code: cấu trúc frontend, luồng UI -> state -> API -> response -> render, file liên quan đến product/menu/order/agent/simulate sale, API contract, field dữ liệu và rủi ro tích hợp.

## 2. Phạm vi đã scan

- Frontend: `apps/web/src`.
- API frontend: `apps/web/src/api`.
- Page/component/type/state liên quan: product/menu, cart/checkout/order, admin simulate sale, admin agent logs, inventory.
- Backend đối chiếu tối thiểu: `apps/api/src/index.ts`, module `agent`, `simulate-sale`, `product`, `order`, `payment`.
- Không scan sâu `node_modules`, `dist`, build artifact.

## 3. Tổng quan frontend

- Framework: React 19 + Vite + TypeScript.
- Routing: `react-router-dom`, file chính `apps/web/src/routes/AppRoutes.tsx`.
- API: Axios instance trong `apps/web/src/api/client.ts`.
- Base URL: `import.meta.env.VITE_API_URL || "http://localhost:5000/api"`.
- `.env` hiện tại: `VITE_API_URL=http://localhost:5000/api`.
- Auth token lưu `localStorage` key `access_token`, tự redirect `/login` khi API trả 401.
- Cart state nằm ở `CartContext`, lưu `localStorage` key `cart`.

## 4. Luồng Cafe Agent hiện tại

Không thấy UI chat/agent input hoặc hybrid input riêng trong frontend. Luồng Cafe Agent hiện tại đi qua admin simulate sale và agent logs:

1. Admin vào `/admin/simulate-sale`.
2. `AdminSimulateSalePage` load product từ `productsApi.getProducts()` và inventory từ `inventoryApi.getInventories()`.
3. Admin chọn product và nhập quantity.
4. UI gọi `simulateSaleApi.simulateSale({ productId, quantity })`.
5. `simulateSaleApi` POST `/simulate-sale` với `productCount`, `minDecrease`, `maxDecrease`, `note`; không gửi `productId` vào contract backend.
6. Backend `/simulate-sale` giảm tồn kho và kích hoạt `agentService.scanInventory`.
7. Frontend lấy `createdPurchaseRequests[0]`, map thành `purchaseRequestId/prCreated`.
8. UI render kết quả, link sang purchase request và `/admin/agent-logs`.
9. `/admin/agent-logs` gọi GET `/agent/logs`, normalize camelCase/snake_case rồi render table + modal JSON.

Luồng menu/order liên quan:

1. Customer vào `/products`, GET `/products`, render `ProductCard`.
2. Add cart qua `CartContext`.
3. Checkout validate local `shippingName`, `shippingPhone`, `shippingAddress`.
4. `ordersApi.createOrder()` POST `/orders` với `items`, `paymentMethod`, `shippingAddress`, `shippingPhone`, `note`.
5. Admin update order qua `/orders/:id/status`, payment qua `/payments/:id/status`.

## 5. File liên quan

| File | Vai trò | Mức độ | Ghi chú |
| ---- | ------- | ------ | ------- |
| `apps/web/src/api/client.ts` | Axios client, base URL, unwrap response, auth/error handling | Cao | Dùng chung toàn frontend. |
| `apps/web/.env` | Cấu hình API URL | Cao | Trỏ `http://localhost:5000/api`. |
| `apps/web/src/routes/AppRoutes.tsx` | Route customer/admin | Trung bình | Có `/admin/simulate-sale`, `/admin/agent-logs`. |
| `apps/web/src/api/agentLogs.api.ts` | GET `/agent/logs` | Cao | Normalize log field. |
| `apps/web/src/pages/admin/AdminAgentLogsPage.tsx` | UI xem agent logs | Cao | Có text tiếng Việt bị mojibake. |
| `apps/web/src/types/agentLog.types.ts` | Type AgentLog | Trung bình | Hỗ trợ camelCase/snake_case. |
| `apps/web/src/api/simulateSale.api.ts` | POST `/simulate-sale` | Cao | Nhận `productId` nhưng không gửi field này. |
| `apps/web/src/pages/admin/AdminSimulateSalePage.tsx` | UI mô phỏng bán hàng/kích hoạt agent | Cao | Tự tính stock/result theo product được chọn. |
| `apps/web/src/api/products.api.ts` | CRUD `/products` | Cao | Normalize `imageUrl/image_url`, `categoryId/category_id`. |
| `apps/web/src/pages/ProductListPage.tsx` | Menu/product list customer | Trung bình | Filter local theo search/category/price. |
| `apps/web/src/components/product/ProductCard.tsx` | Render product, add cart | Trung bình | Check `inventory.quantity` nếu có. |
| `apps/web/src/pages/admin/AdminProductFormPage.tsx` | Admin product create/update | Cao | Backend yêu cầu `categoryId`, UI chưa validate bắt buộc. |
| `apps/web/src/api/orders.api.ts` | Order service | Cao | Payload gửi backend bỏ `shippingName`. |
| `apps/web/src/pages/CheckoutPage.tsx` | Checkout UI/state/validate | Cao | Validate `shippingName` nhưng backend không nhận/lưu. |
| `apps/web/src/contexts/CartContext.tsx` | Cart state/localStorage | Trung bình | Chưa guard JSON parse lỗi. |
| `apps/web/src/types/order.types.ts` | Order payload/type | Trung bình | Có `shippingName` lệch backend. |
| `apps/web/src/api/inventory.api.ts` | Inventory list/import/adjust | Cao | `updateInventory` chưa hỗ trợ threshold. |
| `apps/api/src/modules/simulate-sale/simulate-sale.validator.ts` | Backend simulate sale contract | Đối chiếu | Không có `productId`. |
| `apps/api/src/modules/simulate-sale/simulate-sale.service.ts` | Backend simulate sale logic | Đối chiếu | Chọn inventory ngẫu nhiên. |
| `apps/api/src/modules/order/order.validator.ts` | Backend order contract | Đối chiếu | Không nhận `shippingName`. |
| `apps/api/src/modules/product/product.validator.ts` | Backend product contract | Đối chiếu | `categoryId` required khi create. |

## 6. Rủi ro phát hiện

- Cao: simulate sale frontend cho admin chọn `productId`, nhưng backend `/simulate-sale` không nhận `productId` và chọn inventory ngẫu nhiên. UI có thể hiển thị sai sản phẩm bị giảm tồn kho hoặc sai purchase request.
- Cao: `AdminSimulateSalePage` tự tính `stockAfter = currentQty - sellQuantity` từ state frontend, không dựa trên `affectedProducts` backend.
- Trung bình: `CheckoutPage` và type có `shippingName`, nhưng `ordersApi` không gửi field này và backend validator cũng không nhận. Tên người nhận có thể bị mất.
- Trung bình: `AdminProductFormPage` chưa validate `categoryId`; backend create product yêu cầu `categoryId`, dễ gặp 400 khi bỏ trống danh mục.
- Trung bình: nhiều text tiếng Việt trong page đang bị mojibake (`KhÃ´ng`, `Äang`, ...), ảnh hưởng UX.
- Trung bình: `ordersApi.updateOrderStatus` update order trước rồi update payment sau; nếu payment patch lỗi có thể tạo trạng thái cập nhật một phần.
- Thấp/trung bình: `agentLogsApi.getAgentLogs({ limit })` có truyền `limit`, nhưng backend controller đã scan không dùng query này.
- Thấp: `CartContext` đọc JSON từ `localStorage` không try/catch, cart hỏng có thể làm crash init.
- Thấp: add/update cart chưa chặn số lượng theo tồn kho; lỗi tồn kho chỉ phát hiện muộn ở order/backend.

## 7. Việc đã làm

* [x] Đã scan cấu trúc
* [x] Đã kiểm tra page/component liên quan
* [x] Đã kiểm tra service/api liên quan
* [x] Đã ghi log scan

## 8. Việc chưa làm

* [ ] Chưa sửa source code
* [ ] Chưa đổi logic
* [ ] Chưa thêm API mới
* [ ] Chưa refactor

## 9. Hướng đề xuất tiếp theo

- Thống nhất contract `/simulate-sale`: backend nhận `productId` hoặc frontend bỏ giả định chọn đúng sản phẩm và render theo `affectedProducts`.
- Nếu giữ UI chọn sản phẩm, thêm backend support cho simulate sale theo product cụ thể.
- Nếu giữ backend random inventory, sửa UI để hiển thị product thực sự bị ảnh hưởng từ response.
- Đồng bộ `shippingName`: bỏ khỏi UI/type hoặc thêm backend support để lưu/hiển thị.
- Thêm validate `categoryId` ở product form để tránh API 400.
- Sửa encoding tiếng Việt sau khi được xác nhận bắt đầu sửa.
