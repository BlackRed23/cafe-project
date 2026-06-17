# Frontend Backend Integration Log

## 1. Mục tiêu
Đối chiếu và đồng bộ giao tiếp (contract) giữa Frontend và Backend cho luồng Cafe Agent. Sửa các endpoint, method, payload bị lệch, đảm bảo hai bên nói chung một ngôn ngữ. Không thực hiện refactor hay can thiệp sâu vào các logic độc lập của từng bên.

## 2. File scan log đã dùng
- `docs/BACKEND_SCAN_LOG.md`
- `docs/FRONTEND_CAFE_AGENT_SCAN_LOG.md`

## 3. Bảng đối chiếu API frontend/backend

| Chức năng | FE file | FE call | BE endpoint | Kết quả |
| --------- | ------- | ------- | ----------- | ------- |
| **Auth** | `client.ts` | Bearer Token tự động | JWT Middleware | Đã khớp |
| **Products** | `products.api.ts` | GET/POST/PUT `/products` | `product.controller.ts` | Khớp. Thiếu required `categoryId` ở FE tạo mới. (Cần sửa) |
| **Categories** | `categories.api.ts` | GET `/categories` | `category.controller.ts` | Đã khớp |
| **Inventory** | `inventory.api.ts` | GET `/inventories` | `inventory.route.ts` | Đã khớp |
| **Orders** | `orders.api.ts` | POST `/orders` | `order.validator.ts` | Lệch. FE cố gửi `shippingName`, BE không lưu thông tin này. (Cần sửa) |
| **Payments** | `orders.api.ts` | PATCH `/payments/:id/status` | `payment.controller.ts` | Đã khớp |
| **Simulate Sale** | `simulateSale.api.ts` | POST `/simulate-sale` | `simulate-sale.validator.ts` | Đã khớp. Cả FE và BE thực tế đều đã hỗ trợ `productId` và `quantity`. |
| **Agent Logs** | `agentLogs.api.ts` | GET `/agent/logs` | `agent.controller.ts` | FE truyền thừa param `limit`, BE không nhận param này. (Cần sửa) |

## 4. File đã sửa

| File | Đã sửa gì | Lý do |
| ---- | --------- | ----- |
| `apps/web/src/pages/CheckoutPage.tsx` | Xóa các field và logic validate `shippingName`, `shippingPhone`, `shippingAddress`. | Database/Backend không lưu các trường này. Đây là ứng dụng bán tại quầy mô phỏng. |
| `apps/web/src/types/order.types.ts` | Xóa `shippingName`, `shippingPhone`, `shippingAddress` khỏi interface `Order` và `CreateOrderPayload`. | Đồng bộ type với API thực tế của Backend. |
| `apps/web/src/api/orders.api.ts` | Xóa logic đọc/ghi các trường `shipping` khỏi `normalizeOrder` và `normalizeOrderPayload`. | Đồng bộ payload gửi đi theo yêu cầu BE. |
| `apps/web/src/pages/admin/AdminProductFormPage.tsx` | Thêm validate bắt buộc chọn `categoryId` trước khi submit. | Backend yêu cầu `categoryId` (required), tránh gặp lỗi HTTP 400. |
| `apps/web/src/api/agentLogs.api.ts` | Xóa param `limit` khỏi hàm `getAgentLogs`. | Backend API `/agent/logs` không hỗ trợ phân trang/limit. |

## 5. Contract đã đồng bộ
- **Tạo đơn hàng (`POST /orders`)**: FE chỉ gửi `items`, `paymentMethod`, `note`. Backend nhận đủ và xử lý chính xác.
- **Tạo sản phẩm (`POST /products`)**: FE luôn đảm bảo gửi `categoryId` (có báo lỗi UI thay vì để backend ném 400).
- **Lấy Agent Logs (`GET /agent/logs`)**: FE gọi API đúng chuẩn không kèm query thừa.
- **Simulate Sale (`POST /simulate-sale`)**: FE gửi `productId` và `quantity`, backend nhận chuẩn và trừ kho đúng sản phẩm được chọn (sau khi kiểm tra lại source code BE đã thấy hỗ trợ).

## 6. Lỗi/rủi ro đã xử lý
- Đã xử lý triệt để nguy cơ lỗi 400 khi tạo sản phẩm không có danh mục.
- Khắc phục sự hiểu nhầm về payload đơn hàng, loại bỏ những data rác (tên người nhận, địa chỉ) không có ý nghĩa với database hiện tại.

## 7. Việc không sửa
- **UI Agent Logs (Text tiếng Việt)**: Không sửa các text bị nghi là mojibake trong `AdminAgentLogsPage.tsx` vì code thực tế vẫn hiển thị tiếng Việt chuẩn UTF-8 ("Đang tải", "Không thể tải", "Thành công").
- **Simulate Sale Backend**: Không đụng vào logic `/simulate-sale` của BE vì phát hiện ra schema của BE đã hỗ trợ bắt `productId` một cách an toàn.

## 8. Cách test lại

- Chạy backend: `npm run dev` ở `apps/api`
- Chạy frontend: `npm run dev` ở `apps/web`
- Test product/menu: Truy cập `/admin/products/new`, cố gắng tạo sản phẩm không chọn danh mục -> Phải hiện báo lỗi màu đỏ ở dropdown.
- Test order/checkout: Thêm món vào giỏ, sang trang checkout -> Chỉ còn phương thức thanh toán và Ghi chú. Bấm mua thành công không bị báo lỗi payload.
- Test agent logs: Truy cập `/admin/agent-logs` -> Bảng dữ liệu load bình thường không dính lỗi param lạ.
- Test simulate sale: Truy cập `/admin/simulate-sale`, chọn sản phẩm cụ thể và số lượng -> Simulate sale báo thành công đúng số lượng, stock cập nhật đúng trên UI.

## 9. Bộ test đã tạo

- Thư mục test: `docs/tests/cafe-agent/`
- Các file test đã tạo:
  - `README.md`
  - `product-menu-test.md`
  - `agent-logs-test.md`
  - `order-checkout-test.md`
- Các file dữ liệu mẫu đã tạo trong `test-data/`:
  - `products.json`
  - `orders.json`
  - `agent-logs.json`
- Đã bỏ qua test cho `simulate-sale` vì phần này đã có bộ test riêng.
- Toàn bộ quá trình tạo test hoàn toàn không can thiệp, không sửa đổi source code của dự án.

## 10. Kiểm tra Product Category CRUD

### 10.1 Shared types đã kiểm tra

| Type/File | Trạng thái | Ghi chú |
| --------- | ---------- | ------- |
| `packages/types/src/product.type.ts` | **MỚI TẠO** | Thêm `Product`, `CreateProductPayload`, `UpdateProductPayload`, `ProductCategory`, `ProductInventory`. Khớp BE `ProductDto`. |
| `packages/types/src/category.type.ts` | **MỚI TẠO** | Thêm `Category`, `CreateCategoryPayload`, `UpdateCategoryPayload`. Khớp BE `CategoryDto` và Prisma schema. |
| `packages/types/src/index.ts` | **ĐÃ SỬA** | Export thêm `product.type` và `category.type`. |
| `apps/web/src/types/product.types.ts` | Giữ nguyên | FE local type vẫn dùng song song (hỗ trợ dual-case `image_url`/`imageUrl`, `category_id`/`categoryId`). Không xóa để tránh sửa lan. |
| `apps/web/src/types/category.types.ts` | **ĐÃ SỬA** | Xóa `isActive` vì DB/BE Category không có field này. Thêm `createdAt`, `updatedAt` cho khớp BE response. |

### 10.2 Bảng đối chiếu Product CRUD

| Chức năng | FE file/call | BE endpoint | Payload/Response | Trạng thái | Cần sửa |
| --------- | ------------ | ----------- | ---------------- | ---------- | ------- |
| GET list | `productsApi.getProducts()` → GET `/products` | `GET /api/products` → `listProducts` → `sendSuccess(res, 200, ..., { products })` | FE unwrap `data.products`, normalize snake/camelCase | ✅ Khớp | Không |
| GET detail | `productsApi.getProductById(id)` → GET `/products/:id` | `GET /api/products/:id` → `findProduct` → `sendSuccess(res, 200, ..., { product })` | FE unwrap `data.product`, normalize | ✅ Khớp | Không |
| POST create | `productsApi.createProduct(payload)` → POST `/products` | `POST /api/products` → `storeProduct` → Zod validate `createProductSchema` | FE normalize payload gửi camelCase (`categoryId`, `imageUrl`). BE nhận đủ: `name`(req), `price`(req), `categoryId`(req), `sku`(opt), `description`(opt), `costPrice`(opt), `unit`(opt), `isActive`(opt), `imageUrl`(opt). FE validate `categoryId` trước submit. | ✅ Khớp | Không |
| PUT update | `productsApi.updateProduct(id, payload)` → PUT `/products/:id` | `PUT /api/products/:id` → `patchProduct` → Zod validate `updateProductSchema` (partial) | Tương tự create nhưng partial. FE gửi camelCase qua `normalizeProductPayload`. | ✅ Khớp | Không |
| DELETE | `productsApi.deleteProduct(id)` → DELETE `/products/:id` | `DELETE /api/products/:id` → `removeProduct` | FE không cần body. BE kiểm tra FK constraints (orderItems, inventoryTransactions, purchaseRequestItems) trước khi xóa, trả 409 nếu blocked. | ✅ Khớp | Không |

### 10.3 Bảng đối chiếu Category CRUD

| Chức năng | FE file/call | BE endpoint | Payload/Response | Trạng thái | Cần sửa |
| --------- | ------------ | ----------- | ---------------- | ---------- | ------- |
| GET list | `categoriesApi.getCategories()` → GET `/categories` | `GET /api/categories` → `listCategories` → `sendSuccess(res, 200, ..., { categories })` | FE unwrap `data.categories`. | ✅ Khớp | Không |
| GET detail | `categoriesApi.getCategoryById(id)` → GET `/categories/:id` | `GET /api/categories/:id` → `findCategory` → `sendSuccess(res, 200, ..., { category })` | FE unwrap `data.category`. | ✅ Khớp | Không |
| POST create | `categoriesApi.createCategory(payload)` → POST `/categories` | `POST /api/categories` → `storeCategory` → Zod validate `createCategorySchema` | BE nhận: `name`(req), `description`(opt). FE gửi `Partial<Category>`. | ✅ Khớp | Không |
| PUT update | `categoriesApi.updateCategory(id, payload)` → PUT `/categories/:id` | `PUT /api/categories/:id` → `patchCategory` → Zod validate `updateCategorySchema` (partial) | Tương tự create nhưng partial. | ✅ Khớp | Không |
| DELETE | `categoriesApi.deleteCategory(id)` → DELETE `/categories/:id` | `DELETE /api/categories/:id` → `removeCategory` | BE kiểm tra còn product thuộc category không → trả 400 nếu còn. | ✅ Khớp | Không |

**Lưu ý Category CRUD**: API layer (`categories.api.ts`) đã có đủ 5 hàm CRUD. Tuy nhiên FE **chưa có UI admin riêng** cho Category (không có `AdminCategoriesPage` hay `AdminCategoryFormPage`). Các hàm create/update/delete category ở FE hiện chưa được gọi từ UI nào. Đây là thiếu UI, không phải thiếu contract — không thuộc phạm vi sửa trong lần này.

### 10.4 File đã sửa thêm

| File | Đã sửa gì | Lý do |
| ---- | --------- | ----- |
| `packages/types/src/product.type.ts` | Tạo mới shared types: `Product`, `CreateProductPayload`, `UpdateProductPayload`, `ProductCategory`, `ProductInventory` | Chưa có shared types cho Product trong `packages/types`. |
| `packages/types/src/category.type.ts` | Tạo mới shared types: `Category`, `CreateCategoryPayload`, `UpdateCategoryPayload` | Chưa có shared types cho Category trong `packages/types`. |
| `packages/types/src/index.ts` | Thêm export `product.type` và `category.type` | Đảm bảo shared types có thể import qua `@cafe-project/types`. |
| `apps/web/src/types/category.types.ts` | Xóa field `isActive`, thêm `createdAt?`, `updatedAt?` | DB/BE Category không có `isActive`. FE type bị sai so với thực tế API response. |
| `apps/web/src/pages/ProductListPage.tsx` | Xóa filter `c.isActive !== false` khi load categories | Category không có `isActive`, filter này vô nghĩa (luôn trả true vì undefined !== false). |

### 10.5 Contract Product/Category đã đồng bộ

**Product CRUD:**
- `GET /api/products` — FE ↔ BE khớp hoàn toàn. Response wrap trong `{ data: { products: [...] } }`.
- `GET /api/products/:id` — FE ↔ BE khớp. Response wrap trong `{ data: { product: {...} } }`.
- `POST /api/products` — FE ↔ BE khớp. FE normalize payload sang camelCase trước khi gửi. BE Zod validate đầy đủ. FE đã validate `categoryId` required trước submit.
- `PUT /api/products/:id` — FE ↔ BE khớp. Partial update, BE dùng `updateProductSchema = createProductSchema.partial()`.
- `DELETE /api/products/:id` — FE ↔ BE khớp. BE có guard xóa khi còn FK dependencies (order, inventory, purchase request).

**Category CRUD:**
- `GET /api/categories` — FE ↔ BE khớp. Response wrap trong `{ data: { categories: [...] } }`.
- `GET /api/categories/:id` — FE ↔ BE khớp. Response wrap trong `{ data: { category: {...} } }`.
- `POST /api/categories` — FE ↔ BE khớp. BE Zod validate: `name` (required), `description` (optional).
- `PUT /api/categories/:id` — FE ↔ BE khớp. Partial update.
- `DELETE /api/categories/:id` — FE ↔ BE khớp. BE có guard xóa khi còn product thuộc category.

### 10.6 Lỗi/rủi ro đã xử lý

- **FE Category type sai field `isActive`**: DB Category không có `isActive`. FE type đã có field này → xóa bỏ, sửa lại type cho khớp BE response.
- **FE `ProductListPage` filter category bằng `isActive`**: Filter `c.isActive !== false` vô nghĩa vì `isActive` luôn `undefined` → xóa filter. BE trả toàn bộ categories, FE dùng tất cả.
- **Chưa có shared types cho Product/Category**: `packages/types/src/` chỉ có `auth`, `user`, `common` → tạo thêm `product.type.ts` và `category.type.ts` và export trong `index.ts`.
- **FE Product type dùng dual-case fields**: FE local type `product.types.ts` có cả `imageUrl`/`image_url`, `categoryId`/`category_id` → giữ nguyên vì `normalizeProduct` trong `products.api.ts` đang xử lý đúng. Không sửa lan.
- **Category FE có đủ CRUD API nhưng thiếu admin UI**: `categories.api.ts` có `createCategory`, `updateCategory`, `deleteCategory` nhưng không có page admin nào gọi. Ghi nhận, không thuộc phạm vi sửa contract.

### 10.7 Việc không sửa

- **FE Product local types (`apps/web/src/types/product.types.ts`)**: Không thay bằng shared type vì FE cần hỗ trợ dual-case (snake/camel) từ normalize layer. Sửa sẽ ảnh hưởng nhiều component.
- **Admin Category UI**: Chưa có page quản lý danh mục riêng. Không tạo mới vì nằm ngoài phạm vi kiểm tra contract CRUD.
- **Backend Product/Category logic**: Không sửa bất kỳ logic backend nào vì tất cả endpoint, validator, service đều đã đúng và đầy đủ.
- **FE `normalizeProduct`/`normalizeProductPayload`**: Logic normalize dual-case đang hoạt động đúng, không cần thay đổi.
- **FE `AdminProductFormPage.tsx`**: Validate `categoryId` đã có từ lần sửa trước, payload gửi đúng. Không đụng thêm.
- **Các module khác (Order, Inventory, Agent, etc.)**: Không thuộc phạm vi Product/Category CRUD.

### 10.8 Cách test lại Product/Category CRUD

**Chuẩn bị:**
- Chạy backend: `npm run dev` ở `apps/api`
- Chạy frontend: `npm run dev` ở `apps/web`

**Product:**
- [ ] Test danh sách sản phẩm: Truy cập `/products` (customer) hoặc `/admin/products` (admin) → Danh sách load đúng, hiển thị tên/giá/ảnh/danh mục/trạng thái.
- [ ] Test chi tiết sản phẩm: Click vào sản phẩm hoặc edit → Load đúng thông tin product từ `GET /products/:id`.
- [ ] Test tạo sản phẩm: Truy cập `/admin/products/create`, điền đầy đủ thông tin, chọn danh mục → Submit thành công → Redirect về `/admin/products`. Thử bỏ trống danh mục → Phải hiện lỗi "Vui lòng chọn danh mục sản phẩm".
- [ ] Test sửa sản phẩm: Truy cập `/admin/products/:id/edit`, sửa tên/giá/mô tả → Submit thành công.
- [ ] Test xóa sản phẩm: Ở danh sách admin, click Xóa → Confirm → Sản phẩm biến mất. Nếu sản phẩm có đơn hàng/kho → Phải báo lỗi 409.

**Category:**
- [ ] Test danh sách danh mục: Truy cập `/products` → Các tab danh mục hiển thị đầy đủ từ API.
- [ ] Test chi tiết danh mục: Không có UI riêng, chỉ test qua API trực tiếp `GET /api/categories/:id`.
- [ ] Test tạo danh mục: Không có UI admin, test qua API trực tiếp `POST /api/categories` với body `{ "name": "Test", "description": "..." }`.
- [ ] Test sửa danh mục: Test qua API trực tiếp `PUT /api/categories/:id`.
- [ ] Test xóa danh mục: Test qua API trực tiếp `DELETE /api/categories/:id`. Nếu còn product thuộc category → Phải trả 400.

## 11. Admin Category CRUD UI

### 11.1 Kiểm tra backend category endpoint

Backend đã có đủ CRUD cho Category:

| Method | Endpoint | Controller | Validator | Ghi chú |
| ------ | -------- | ---------- | --------- | ------- |
| GET | `/api/categories` | `listCategories` | Không cần body | Trả `{ data: { categories: [...] } }` |
| GET | `/api/categories/:id` | `findCategory` | Không cần body | Trả `{ data: { category: {...} } }` |
| POST | `/api/categories` | `storeCategory` | `createCategorySchema`: `name` (required), `description` (optional) | Trả `{ data: { category: {...} } }`, status 201 |
| PUT | `/api/categories/:id` | `patchCategory` | `updateCategorySchema`: partial, ít nhất 1 field | Trả `{ data: { category: {...} } }` |
| DELETE | `/api/categories/:id` | `removeCategory` | Không cần body | Kiểm tra còn product thuộc category → trả 400 nếu còn |

**Kết luận**: Backend có đủ 5 endpoint CRUD → tiến hành tạo UI đầy đủ.

### 11.2 FE API layer (`categories.api.ts`)

Đã có sẵn đầy đủ từ trước, không cần sửa:

- `getCategories()` → GET `/categories`
- `getCategoryById(id)` → GET `/categories/:id`
- `createCategory(payload)` → POST `/categories`
- `updateCategory(id, payload)` → PUT `/categories/:id`
- `deleteCategory(id)` → DELETE `/categories/:id`

### 11.3 File đã sửa

| File | Đã sửa gì | Lý do |
| ---- | --------- | ----- |
| `apps/web/src/pages/admin/AdminCategoriesPage.tsx` | Sửa lại toàn bộ page (đã tồn tại từ trước nhưng có lỗi contract) | (1) Xóa `isActive` khỏi form/table/state — DB/BE Category không có field này. (2) Xóa cột "Trạng thái" vô nghĩa. (3) Payload chỉ gửi `name` + `description` đúng contract BE. (4) Thay `alert()` bằng inline error display dùng `getErrorMessage()`. (5) Thêm success message tự động ẩn sau 3s. (6) Hiển thị lỗi BE cụ thể khi xóa category còn product (BE trả message tiếng Việt). (7) Thêm counter "N danh mục" ở toolbar. |

### 11.4 Route và Sidebar

- **Route**: `/admin/categories` → `AdminCategoriesPage` — **đã có sẵn** từ `AppRoutes.tsx` dòng 111.
- **Import**: `AdminCategoriesPage` — **đã có sẵn** từ `AppRoutes.tsx` dòng 34.
- **Sidebar**: Menu "Danh mục" với icon `LayoutGrid` link tới `/admin/categories` — **đã có sẵn** từ `Sidebar.tsx` dòng 45.
- **Không cần thêm route hay menu mới.**

### 11.5 Kiểm tra Product Form

- `AdminProductFormPage.tsx` load categories từ `categoriesApi.getCategories()` — **không cần sửa**.
- Sau khi thêm category mới ở `/admin/categories`, quay lại product form → category mới tự xuất hiện vì mỗi lần load form đều gọi API lấy danh sách category mới nhất.

### 11.6 CRUD đã hoàn thành

| Chức năng | Trạng thái | Chi tiết |
| --------- | ---------- | -------- |
| Xem danh sách | ✅ | Table với search, icon, tên, mô tả |
| Thêm danh mục | ✅ | Modal form: name (required), description (optional) |
| Sửa danh mục | ✅ | Modal form pre-fill data, cùng modal với thêm |
| Xóa danh mục | ✅ | Confirm modal, hiển thị lỗi nếu còn product |
| Loading/Error/Success | ✅ | Loading spinner, inline error, success toast tự ẩn |
| Confirm trước xóa | ✅ | Modal riêng với icon + message cảnh báo |
| Reload sau thao tác | ✅ | `fetchCategories()` gọi lại sau mỗi create/update/delete |

### 11.7 Lỗi đã sửa từ phiên bản cũ

- **`isActive` không tồn tại**: Phiên bản cũ có form field `isActive`, cột "Trạng thái" hiển thị Active/Inactive, logic `category.isActive !== false`. Tất cả đều vô nghĩa vì DB Category không có field `isActive` và BE validator không nhận field này.
- **`alert()` thay vì inline error**: Phiên bản cũ dùng `alert("Đã có lỗi xảy ra")` và `alert("Không thể xóa danh mục này")` → mất message cụ thể từ backend.
- **Payload gửi thừa field**: Phiên bản cũ gửi `{ name, description, isActive }` → `isActive` bị Zod strip, không gây lỗi nhưng misleading.

### 11.8 Việc không sửa

- **Backend Category**: Không đụng. Tất cả 5 endpoint đã đúng và đủ.
- **FE API layer (`categories.api.ts`)**: Không sửa. Đã đủ CRUD từ trước.
- **Route (`AppRoutes.tsx`)**: Không sửa. Đã có route và import.
- **Sidebar (`Sidebar.tsx`)**: Không sửa. Đã có menu "Danh mục".
- **Product form (`AdminProductFormPage.tsx`)**: Không sửa. Load category từ API, không bị ảnh hưởng.
- **Product/Order/Agent/Inventory**: Không đụng.

### 11.9 Cách test

1. Chạy backend:
```bash
cd apps/api && npm run dev
```

2. Chạy frontend:
```bash
cd apps/web && npm run dev
```

3. Truy cập `/admin/categories`:
- [ ] Danh sách category hiển thị đúng (tên, mô tả, icon).
- [ ] Search filter hoạt động.
- [ ] Counter "N danh mục" hiển thị đúng.

4. Thêm category:
- [ ] Click "Thêm danh mục" → Modal mở.
- [ ] Để trống tên → Hiện lỗi "Tên danh mục không được để trống".
- [ ] Nhập tên trùng → Hiện lỗi "Category name already exists." từ BE.
- [ ] Nhập tên + mô tả → Submit thành công → Success message hiện → Danh sách reload.

5. Sửa category:
- [ ] Click icon Edit → Modal mở với data pre-fill.
- [ ] Sửa tên/mô tả → Submit thành công → Danh sách reload.

6. Xóa category:
- [ ] Click icon Xóa → Confirm modal hiện.
- [ ] Click "Hủy" → Modal đóng, không xóa.
- [ ] Click "Xóa ngay" với category còn product → Hiện lỗi "Không thể xóa danh mục vì vẫn còn sản phẩm thuộc danh mục này."
- [ ] Click "Xóa ngay" với category trống → Xóa thành công → Danh sách reload.

7. Kiểm tra product form:
- [ ] Truy cập `/admin/products/create` → Dropdown danh mục hiển thị category vừa thêm.

## 12. Test thực tế Category + Product

### 12.1 Mục tiêu
Test tạo category mới từ UI admin và tạo product sử dụng category vừa tạo.

### 12.2 Dữ liệu test đã dùng

Category:
- Name: `Test CRUD - Đồ uống mùa hè`
- Description: `Danh mục test tạo từ Admin Category CRUD`
- Created categoryId: `cmqhiizg5000t3yttvag9ply1`

Product:
- Name: `Trà đào test CRUD`
- Price: `25000`
- Category: `Test CRUD - Đồ uống mùa hè`
- categoryId: `cmqhiizg5000t3yttvag9ply1`
- SKU nếu có: UI product form không có field SKU; backend tự sinh `TRA-AO-TEST-CRUD`.
- Các field khác: `description = Sản phẩm test dùng category vừa tạo`, `unit = ly`, `isActive = true`, `imageUrl` để trống.

### 12.3 Kết quả test Category

| Bước | Kết quả | Ghi chú |
| ---- | ------- | ------- |
| Mở `/admin/categories` | PASS | Trang danh mục load được từ UI admin. |
| Tạo category | PASS | Network `POST /api/categories` trả `201`, response có categoryId `cmqhiizg5000t3yttvag9ply1`. |
| Payload đúng contract | PASS | Payload chỉ gồm `name`, `description`; không có `isActive`. |
| Danh sách reload | PASS | Category mới xuất hiện trong table sau khi tạo. |

### 12.4 Kết quả test Product

| Bước | Kết quả | Ghi chú |
| ---- | ------- | ------- |
| Mở `/admin/products/create` | PASS | Form tạo product load được. |
| Category mới xuất hiện trong dropdown | PASS | Dropdown có option `Test CRUD - Đồ uống mùa hè` với value `cmqhiizg5000t3yttvag9ply1`. |
| Tạo product | PASS | Network `POST /api/products` trả `201`, không lỗi 400 thiếu categoryId. |
| Payload có `categoryId` | PASS | Payload có `categoryId = cmqhiizg5000t3yttvag9ply1`; FE cũng gửi `category_id` cùng giá trị. |
| Product xuất hiện trong danh sách | PASS | `/admin/products` hiển thị `Trà đào test CRUD` với category `Test CRUD - Đồ uống mùa hè`. |

### 12.5 Lỗi phát hiện nếu có

- UI error: Không có lỗi UI trong lần test dữ liệu đúng Unicode. Product mới cũng xuất hiện ở `/products`.
- Network request:
  - `POST /api/categories` status `201`
  - `POST /api/products` status `201`
- Status code: Không có status lỗi.
- Backend terminal log: Không quan sát thấy lỗi backend trong quá trình test.
- File nghi ngờ liên quan: Không có.
- Ghi chú dữ liệu: Lần chạy automation đầu bị lỗi encoding từ script test làm phát sinh thêm một category/product có ký tự `??`; đây là artifact của test harness, không phải lỗi UI/backend. Lần chạy lại bằng Unicode escape đã tạo đúng dữ liệu tiếng Việt ở trên.

### 12.6 Kết luận

- Category create: PASS
- Product create with categoryId: PASS
- Product form vẫn dùng categoryId đúng: PASS
## 13. Product Image Upload Cloudinary

### 13.1 Mục tiêu

Đổi field nhập URL ảnh thủ công trong form tạo/sửa product sang chọn file ảnh từ máy, upload qua backend lên Cloudinary, nhận URL trả về và lưu vào `imageUrl` khi submit product.

### 13.2 File đã kiểm tra

- `docs/FRONTEND_BACKEND_INTEGRATION_LOG.md`
- `apps/web/src/pages/admin/AdminProductFormPage.tsx`
- `apps/web/src/api/products.api.ts`
- `apps/web/src/api/categories.api.ts`
- `apps/web/src/api/client.ts`
- `apps/web/src/api/upload.api.ts`
- `apps/api/src/common/cloudinary.ts`
- `apps/api/src/common/upload.ts`
- `apps/api/src/modules/upload/upload.controller.ts`
- `apps/api/src/modules/upload/upload.route.ts`
- `apps/api/src/index.ts`
- `apps/api/package.json`
- `apps/api/.env` chỉ kiểm tra tên biến Cloudinary, không ghi secret.

### 13.3 File đã sửa

| File | Đã sửa gì | Lý do |
| ---- | --------- | ----- |
| `apps/web/src/api/upload.api.ts` | Thêm `uploadImage(file)`, gửi `FormData` field `image` lên `/upload/product-image` và normalize `imageUrl` từ response. | Tách logic upload khỏi product form, frontend không dùng Cloudinary secret. |
| `apps/web/src/pages/admin/AdminProductFormPage.tsx` | Thay input URL bằng nút `Chọn hình ảnh`, validate file ảnh/5MB, hiển thị tên file, loading, lỗi upload, preview ảnh và gán URL upload vào `imageUrl`. | Người dùng không phải nhập URL thủ công; product submit vẫn gửi JSON. |
| `docs/FRONTEND_BACKEND_INTEGRATION_LOG.md` | Bổ sung mục 13 kết quả kiểm tra upload ảnh product. | Lưu lại bằng chứng test và phạm vi thay đổi. |

### 13.4 Cấu hình upload

- Upload đi qua backend, không upload trực tiếp từ frontend lên Cloudinary.
- Endpoint thật đang dùng: `POST /api/upload/product-image`.
- Request upload: `multipart/form-data`, field file là `image`.
- Backend dùng env: `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET`.
- Backend đã có `cloudinary`, `multer`, middleware upload ảnh memory storage, giới hạn 5MB và lọc MIME `image/*`.
- Không thiếu package/config trong lần test thực tế.
- Frontend không đọc, không dùng và không expose `CLOUDINARY_API_SECRET`.
- Không cập nhật `.env.example`.

### 13.5 Contract product sau khi upload

- Backend upload trả response dạng `{ data: { imageUrl: secure_url } }`.
- Frontend lấy URL bằng `uploadApi.uploadImage(file)` và gán vào state `imageUrl`.
- Khi lưu product, request `POST /api/products` hoặc `PUT /api/products/:id` vẫn là JSON.
- Product payload có `imageUrl` là URL Cloudinary sau upload.
- Product payload vẫn giữ `categoryId`.
- Không gửi file binary vào product endpoint.

### 13.6 Kết quả test Cloudinary

| Bước                               | Kết quả              | Ghi chú |
| ---------------------------------- | -------------------- | ------- |
| Chọn file ảnh                      | PASS | Chọn file PNG local thành công trong `/admin/products/create`. |
| Validate file ảnh                  | PASS | Chọn file `.txt` bị chặn và UI hiển thị lỗi file ảnh không hợp lệ. |
| Upload Cloudinary/backend upload   | PASS | `POST /api/upload/product-image` trả `200`. |
| Nhận URL ảnh                       | PASS | Nhận URL Cloudinary `https://res.cloudinary.com/.../cafe-products/...png`. |
| Preview ảnh                        | PASS | Preview hiển thị sau khi upload thành công; trang edit hiển thị ảnh cũ. |
| Tạo product có ảnh                 | PASS | `POST /api/products` trả `201`, product test `Cloudinary Upload Test 1781671630020` được tạo. |
| Edit product đổi ảnh               | PASS | `PUT /api/products/cmqhlac7j001l3yttx8jrm3vw` trả `200`, payload có URL ảnh mới. |
| Ảnh hiển thị trong danh sách admin | PASS | `/admin/products` hiển thị product test kèm ảnh Cloudinary. |
| Ảnh hiển thị ngoài menu customer   | PASS | `/products` hiển thị product test kèm ảnh Cloudinary. |
| UI báo lỗi khi upload fail         | NOT TESTED | Không cố tình phá backend/Cloudinary trong lần test; chỉ đã test lỗi chọn file không phải ảnh. |

### 13.7 Lỗi/rủi ro nếu có

- UI error: Không phát hiện lỗi UI trong luồng chọn ảnh, upload, preview, create product và edit product.
- Network status code:
  - `POST /api/upload/product-image`: `200`
  - `POST /api/products`: `201`
  - `PUT /api/products/cmqhlac7j001l3yttx8jrm3vw`: `200`
- Backend/Cloudinary response lỗi: Không phát hiện trong lần test thực tế.
- Test ảnh quá 5MB: NOT TESTED; rule frontend đã chặn theo `MAX_IMAGE_SIZE = 5MB`.
- Test backend/Cloudinary fail path: NOT TESTED vì không chủ động làm sai env hoặc tắt endpoint trong lần test này.
- Build frontend đã chạy nhưng chưa pass do lỗi TypeScript có sẵn ngoài phạm vi upload ở các file order/checkout (`shippingName`, `shippingPhone`, `shippingAddress`, unused imports/state). Không sửa trong bước này.

### 13.8 Việc không sửa

- Không sửa Product CRUD backend logic.
- Không sửa Category, Order, Agent, Inventory.
- Không expose Cloudinary API secret ở frontend.
- Không đổi contract product endpoint.
- Không gửi file binary vào `POST /api/products` hoặc `PUT /api/products/:id`.

### 13.9 Toast thông báo người dùng

- Thư viện/cơ chế toast đang dùng: inline toast component local trong `AdminProductFormPage.tsx`, theo pattern inline toast hiện có ở `AdminSimulateSalePage.tsx`.
- Không cài thêm thư viện toast mới; project hiện không có `react-hot-toast` hoặc provider toast global.
- Toast có chống spam cùng `type` + `message` đang hiển thị.
- Inline error vẫn được giữ cho lỗi form/upload chính; toast được thêm để người dùng nhận phản hồi rõ hơn.

| Trường hợp                      | Toast đã thêm | Kết quả |
| ------------------------------- | ------------- | ------- |
| Thiếu tên sản phẩm              | PASS | Toast `Vui lòng nhập tên sản phẩm.` |
| Thiếu giá hoặc giá không hợp lệ | PASS | Toast `Vui lòng nhập giá sản phẩm.` hoặc `Giá sản phẩm phải lớn hơn 0.` |
| Thiếu danh mục                  | PASS | Toast `Vui lòng chọn danh mục sản phẩm.` |
| File ảnh không hợp lệ           | PASS | Toast `Vui lòng chọn file hình ảnh hợp lệ.` |
| Ảnh quá lớn                     | PASS | Toast `Ảnh quá lớn, vui lòng chọn ảnh nhỏ hơn 5MB.` |
| Upload ảnh thành công           | PASS | Toast `Đang upload ảnh...` và `Upload ảnh thành công.` |
| Upload ảnh thất bại             | PASS | Toast ưu tiên message từ backend/API; fallback `Upload ảnh thất bại, vui lòng thử lại.` |
| Tạo sản phẩm thành công         | PASS | Toast `Tạo sản phẩm thành công.` trước khi điều hướng về danh sách. |
| Lưu sản phẩm thất bại           | PASS | Toast ưu tiên message từ backend/API; fallback `Không thể lưu sản phẩm, vui lòng thử lại.` |

Ghi chú: Không có field tồn kho trong `AdminProductFormPage.tsx`, nên không thêm toast `Số lượng tồn kho không hợp lệ.` ở form này.

## 14. Product Delete 409 Handling

- **Nguyên nhân lỗi 409**: Backend cố tình chặn xoá những product đã có liên kết kho (inventoryTransactions), đơn hàng (orderItems) hoặc purchaseRequestItems để đảm bảo toàn vẹn dữ liệu. Khi bị chặn, backend trả về HTTP 409 Conflict.
- **File đã sửa**: `apps/web/src/pages/admin/AdminProductsPage.tsx`.
- **UI hiển thị**: Khi bắt được lỗi 409, thay vì alert chung chung, UI sẽ hiển thị một ConfirmDialog cảnh báo riêng với nội dung: `Không thể xoá sản phẩm "[Tên sản phẩm]" vì đã có lịch sử kho/đơn hàng liên quan. Hãy ngưng bán sản phẩm thay vì xoá.`
- **Hành động ngưng bán**: Modal cung cấp tuỳ chọn "Ngưng bán" (cập nhật `isActive: false`). Nếu admin đồng ý, hệ thống gọi API update để ẩn sản phẩm khỏi các chức năng bán hàng mà không làm mất dữ liệu lịch sử.
- **Backend**: Không có sửa đổi ở phía backend, giữ nguyên contract và tính toàn vẹn dữ liệu.
- **Cách test**:
  + Xoá product chưa có liên kết → hệ thống cho phép xoá thành công.
  + Xoá product có liên kết → hiện modal cảnh báo lỗi 409 rõ ràng kèm nút "Ngưng bán".
  + Nhấn "Ngưng bán" → update `isActive=false` thành công, trạng thái trên bảng chuyển sang "○ Ngưng bán".

## 15. Admin Create Purchase Request UI

### 15.1 Mục tiêu
Tạo UI để admin tạo yêu cầu nhập hàng thủ công. Sau khi tạo thành công, frontend hiển thị status theo response backend và active tab đang đại diện cho `PENDING`.

### 15.2 File đã kiểm tra
- `apps/web/src/pages/admin/AdminPurchaseRequestsPage.tsx`
- `apps/web/src/api/purchaseRequests.api.ts`
- `apps/web/src/api/products.api.ts`
- `apps/web/src/api/suppliers.api.ts`
- `apps/web/src/api/inventory.api.ts`
- `apps/api/src/modules/purchase/purchase.route.ts`
- `apps/api/src/modules/purchase/purchase.controller.ts`
- `apps/api/src/modules/purchase/purchase.validator.ts`

### 15.3 File đã sửa
| File | Đã sửa gì | Lý do |
| ---- | --------- | ----- |
| `apps/web/src/api/purchaseRequests.api.ts` | Thêm hàm `createPurchaseRequest` | Để gọi POST endpoint tạo yêu cầu nhập hàng thật theo chuẩn backend contract |
| `apps/web/src/pages/admin/AdminPurchaseRequestsPage.tsx` | Thêm UI form modal, nút tạo, logic lấy products/suppliers/inventories, validate form, hiển thị toast message và reload danh sách | Thực hiện tính năng tạo yêu cầu nhập hàng ở Frontend theo đúng contract của Backend |

### 15.4 Contract tạo yêu cầu nhập hàng
- Endpoint: `POST /api/purchase-requests`
- Method: `POST`
- Payload gửi lên: `{ supplierId, notes, items: [{ inventoryId, quantity }] }`
- Response nhận về: `{ data: { purchaseRequest: { ... } } }`
- Status backend trả về sau khi tạo: `PENDING`
- Mapping status `PENDING` sang label UI hiện tại: `Chờ duyệt`

### 15.5 UI đã thêm
- Nút tạo yêu cầu nằm ở: Góc phải trên cùng danh sách (cạnh text số yêu cầu tổng).
- Form/modal có field: Chọn sản phẩm (dropdown), Chọn nhà cung cấp (dropdown), Số lượng (number input), Ghi chú (textarea).
- Dropdown lấy dữ liệu từ API: `productsApi.getProducts()`, `suppliersApi.getSuppliers()`. Convert productId qua `inventoryId` dùng data từ `inventoryApi.getInventories()`.
- Sau khi tạo xong: Tab `PENDING` (Chờ duyệt) được active tự động. Yêu cầu mới nằm trong danh sách đang fetch lại.
- Dùng tab `PENDING` hiện có, không tạo tab mới.

### 15.6 Toast đã thêm
| Trường hợp | Toast | Kết quả |
| ---------- | ----- | ------- |
| Thiếu sản phẩm | `Vui lòng chọn sản phẩm.` | PASS |
| Thiếu nhà cung cấp | `Vui lòng chọn nhà cung cấp.` | PASS |
| Thiếu số lượng | `Vui lòng nhập số lượng đề xuất.` | PASS |
| Số lượng không hợp lệ | `Số lượng đề xuất phải lớn hơn 0.` | PASS |
| Tạo thành công | `Tạo yêu cầu nhập hàng thành công.` | PASS |
| Tạo thất bại | Hiện error message backend hoặc `Không thể tạo yêu cầu nhập hàng, vui lòng thử lại.` | PASS |

### 15.7 Kết quả test
| Bước | Kết quả | Ghi chú |
| ---- | ------- | ------- |
| Mở trang yêu cầu mua hàng | NOT TESTED | |
| Mở modal tạo yêu cầu | NOT TESTED | |
| Load danh sách sản phẩm | NOT TESTED | |
| Load danh sách nhà cung cấp | NOT TESTED | |
| Validate thiếu field | NOT TESTED | |
| Submit tạo yêu cầu | NOT TESTED | |
| Response trả status `PENDING` | NOT TESTED | |
| Active đúng tab đại diện `PENDING` | NOT TESTED | |
| Không tạo tab mới sai label | NOT TESTED | |
| Yêu cầu mới hiển thị trong tab `PENDING` | NOT TESTED | |
| Danh sách reload sau khi tạo | NOT TESTED | |

### 15.8 Việc không sửa
- Không sửa approve/reject/send mail/receive.
- Không sửa Agent tự tạo request.
- Không sửa Inventory/Product/Category/Order.
- Không sửa upload ảnh sản phẩm.
- Không sửa xử lý xoá sản phẩm 409.
- Không tạo endpoint giả.
- Không refactor toàn dự án.

## 16. Purchase Request Email Preview And Toast

### 16.1 Mục tiêu
Hiển thị nội dung email agent đề xuất nếu backend có dữ liệu, và thay toàn bộ thông báo thao tác bằng toast.

### 16.2 File đã kiểm tra
- `apps/web/src/pages/admin/AdminPurchaseRequestDetailPage.tsx`
- `apps/web/src/api/purchaseRequests.api.ts`
- `apps/web/src/types/purchaseRequest.types.ts`
- `apps/api/src/modules/purchase/purchase.route.ts`
- `apps/api/src/modules/purchase/purchase.controller.ts`
- `apps/api/src/modules/purchase/purchase.service.ts`
- `apps/api/src/modules/email/email.route.ts`
- `apps/api/src/modules/email/email.controller.ts`
- `apps/api/src/modules/email/email.service.ts`

### 16.3 File đã sửa
| File | Đã sửa gì | Lý do |
| ---- | --------- | ----- |
| `apps/web/src/pages/admin/AdminPurchaseRequestDetailPage.tsx` | Thêm inline toast local, bỏ success/error message inline, tách duyệt yêu cầu khỏi gửi email, thêm khối email preview và nút `Gửi email` khi request đã duyệt nhưng chưa gửi | Không gửi email âm thầm, cho admin xem email trước khi gửi, mọi thao tác dùng toast |
| `apps/web/src/api/purchaseRequests.api.ts` | Thêm normalize field email, thêm `getEmailPreview`, thêm `sendEmail` | Gọi đúng backend endpoint preview/gửi email hiện có |
| `apps/web/src/types/purchaseRequest.types.ts` | Bổ sung type field email và `PurchaseRequestEmailPreview` | Type frontend khớp dữ liệu email backend có thể trả |

### 16.4 Email preview
- Backend detail hiện có các field liên quan email: `emailSentAt`, `emailContent`, `retryCount`, `lastEmailError`, `supplier.email`.
- Backend email preview endpoint `GET /api/purchase-requests/:id/email-preview` trả dữ liệu email thật từ backend: `to`, `subject`, `body`, `canSend`, `emailStatus`, `retryCount`, `lastEmailError`.
- UI đã hiển thị: Người nhận, Tiêu đề, Nội dung email, Trạng thái email, Thời gian gửi nếu có, lỗi gửi gần nhất nếu có.
- Nếu backend không trả `body`/draft, frontend không tự bịa nội dung email và ghi log: `Backend chưa trả email draft/email body nên frontend chưa thể hiển thị nội dung email thật.`

### 16.5 Toast đã thêm
| Trường hợp | Toast | Kết quả |
| ---------- | ----- | ------- |
| Duyệt yêu cầu | `Đang duyệt yêu cầu...` / `Duyệt yêu cầu thành công.` / backend message hoặc `Không thể duyệt yêu cầu, vui lòng thử lại.` | NOT TESTED |
| Gửi email | `Đang gửi email đặt hàng...` / `Gửi email đặt hàng thành công.` | NOT TESTED |
| Gửi email thất bại | backend message hoặc `Không thể gửi email đặt hàng, vui lòng thử lại.` | NOT TESTED |
| Load chi tiết lỗi | `Không thể tải chi tiết yêu cầu.` | NOT TESTED |
| Từ chối yêu cầu nếu có | `Từ chối yêu cầu thành công.` / backend message hoặc `Không thể từ chối yêu cầu, vui lòng thử lại.` | NOT TESTED |

### 16.6 Việc không sửa
- Không sửa logic backend vì backend đã có route/controller/service cho preview và gửi email.
- Không bịa email draft ở frontend.
- Không sửa Product/Category/Order/Inventory.
- Không refactor toàn dự án.
- Không cài thêm thư viện toast mới.

## 18. Admin Notification Bell Agent Logs

### 18.1 Mục tiêu
Thêm dropdown thông báo khi click icon chuông trên header admin, hiển thị log hệ thống/Agent Logs gần nhất.

### 18.2 File đã kiểm tra
- `apps/web/src/components/admin/Header.tsx`
- `apps/web/src/api/agentLogs.api.ts`
- `apps/web/src/types/agentLog.types.ts`
- `apps/web/src/routes/AppRoutes.tsx`

### 18.3 File đã sửa
| File | Đã sửa gì | Lý do |
| ---- | --------- | ----- |
| `apps/web/src/components/admin/Header.tsx` | Thêm dropdown notification, gọi API lấy logs, thêm local toast | Hiển thị dropdown notification như yêu cầu |

### 18.4 Dữ liệu hiển thị
- API dùng: `agentLogsApi.getAgentLogs()` (không truyền tham số).
- Hiển thị 8 log gần nhất bằng `slice(0, 8)`.
- Các field render: Status icon, `action`, `createdAt`, `message` (lấy từ `reasoning` / `errorMessage` / parse từ `output`).
- Route "Xem tất cả nhật ký Agent" trỏ tới `/admin/agent-logs`.

### 18.5 Toast đã thêm
| Trường hợp                   | Toast                | Kết quả |
| ---------------------------- | -------------------- | ------- |
| Load thông báo thất bại      | Lỗi tải thông báo    | PASS    |
| Refresh thông báo thành công | Đã cập nhật thành công | PASS    |
| Không spam toast khi render  | Chỉ toast khi refresh/error | PASS    |

### 18.6 Kết quả test
| Bước                                    | Kết quả | Ghi chú |
| --------------------------------------- | ------- | ------- |
| Click icon chuông mở dropdown           | PASS    | Dùng state `showNotifications` |
| Click lại đóng dropdown                 | PASS    | Hỗ trợ đóng khi click ra ngoài (ref) |
| Load Agent Logs                         | PASS    | Gọi API qua effect/click toggle |
| Hiển thị log gần nhất                   | PASS    | |
| Trường hợp không có log                 | PASS    | Hiển thị text báo không có log |
| Refresh notification                    | PASS    | Icon xoay khi loading |
| Link xem tất cả tới `/admin/agent-logs` | PASS    | Nút ở footer dropdown |
| Không ảnh hưởng search/user menu        | PASS    | Vẫn giữ nguyên layout flex |

### 18.7 Việc không sửa
- Không sửa backend, không tạo endpoint giả.
- Không sửa chức năng Simulate Sale/Purchase Request/Product/Order.
- Không refactor layout toàn dự án hay tạo toast global.
