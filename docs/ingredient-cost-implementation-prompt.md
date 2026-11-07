# PROMPT: Tính chi phí nguyên liệu (Ingredient Cost / COGS) – Cafe Project

## VAI TRÒ
Bạn là Senior Fullstack Engineer (Node.js, TypeScript, Express, Prisma 6, zod, React + Vite + Tailwind). Triển khai **tính chi phí nguyên liệu**: quản lý nguyên liệu, công thức, giá vốn khi nhập, giá vốn món, giá vốn & lợi nhuận gộp trên từng dòng đơn hàng, báo cáo trên dashboard. **Bám đúng convention code hiện có** (4 dấu cách, `asyncHandler`, `validateBody`, `sendSuccess/sendError`, `HttpError(statusCode, message)`, repository pattern controller → service → repository, import `prisma` và enum từ `@cafe-project/database`).

---

## 1. HIỆN TRẠNG (đã khảo sát – KHÔNG đoán khác)

### Schema ĐÃ CÓ (`packages/database/prisma/schema/`) – KHÔNG cần sửa schema
- `inventory.prisma`
  - `Ingredient`: `sku @unique, name, categoryId?, baseUnit (default "g"), costPerBaseUnit Decimal(18,4), quantity Decimal(14,3), reserved Decimal(14,3), minThreshold, shelfLifeDays?, isActive, deletedAt?, rowVersion Int`.
  - `IngredientBatch`: `ingredientId, batchCode, quantityInitial, quantityRemaining, unitCost Decimal(18,4), expirationDate?, receivedAt, supplierId?, goodsReceiptId?, purchaseRequestItemId?, receivedQty?, receivedUnit?`.
  - `InventoryTransaction`: `ingredientId?, batchId? (→ IngredientBatch), type, quantity Decimal, unitCost, totalCost, referenceType?, referenceId?, orderItemId?, performedBy? (→ User), reason?, idempotencyKey? @unique, wasteReason?` + cột chuyển tiếp `productId?, legacyBatchId? (→ InventoryBatch)`.
  - Enum `InventoryTransactionType` đã có `CONSUME, WASTE, RETURN, RESERVE, RELEASE`.
  - Bảng chuyển tiếp `Inventory`, `InventoryBatch` (gắn theo `Product`) – vẫn đang được code dùng.
- `product.prisma`
  - `Product.costPrice Decimal(18,4)`, `servingUnit` (default "ly").
  - `Recipe`: `productId, version, isActive, effectiveFrom, effectiveTo?, yieldQuantity, laborCost, overheadCost`, `@@unique([productId, version])`.
  - `RecipeIngredient`: `recipeId, ingredientId, quantity, unit, quantityBase, isOptional, allowSubstitute`, `@@unique([recipeId, ingredientId])`.
  - `Topping` (`price`, `toppingType`), `ToppingIngredient` (`quantityBase`).
- `order.prisma`
  - `OrderItem`: `recipeId?, recipeVersion?, consumptionStatus (PENDING|COMMITTED|VOIDED), startedAt?, committedAt?, voidedAt?, ingredientCost, toppingCost, totalCost, grossProfit` (Decimal(12,2)).
  - `OrderItemTopping`: `toppingId, quantity, price, costSnapshot`.
- `purchase.prisma`: `PurchaseRequestItem.ingredientId?`, `GoodsReceipt` (`receiptNumber, status DRAFT|CONFIRMED|CANCELLED, idempotencyKey?`, `batches IngredientBatch[]`).
- `supplier.prisma`: `SupplierIngredient` (`pricePerBaseUnit, purchaseUnit, conversionQuantity Decimal, conversionTargetUnit default "g", minOrderQuantity, leadTimeDays, isPreferred`).

### Code hiện có – CHƯA dùng các bảng trên
- `apps/api/src/index.ts`: **chưa có** module `ingredient`, `recipe`, `topping`.
- `product.service.ts`: `costPrice` chỉ nhập tay (seed từ `seed-data/products.json`), không tính từ công thức. Còn dùng `product.unit` trong khi schema là `servingUnit`.
- `inventory.repository.ts`, `purchase.repository.ts`, `simulate-sale.repository.ts`: chỉ thao tác `Inventory` / `InventoryBatch` / `SupplierProduct` theo `Product`; **không ghi** `unitCost/totalCost`; ghi `InventoryTransaction` bằng field `userId` và `batchId` cho lô cũ → **lệch schema** (đúng phải là `performedBy` và `legacyBatchId` cho `InventoryBatch`).
- `order.repository.ts`: tạo `OrderItem` chỉ với `{ productId, quantity, price }`; khi `COMPLETED` trừ `Inventory`/`InventoryBatch` theo FIFO hạn dùng; **không** tính `ingredientCost/toppingCost/totalCost/grossProfit`, không set `consumptionStatus`.
- `order.validator.ts`: `items[]` chỉ có `productId, quantity` (chưa có topping).
- `dashboard.service.ts`: chỉ có `totalRevenue`, `getRevenue(days)`; chưa có giá vốn / lợi nhuận gộp.
- Web: `AdminProductFormPage.tsx` không có phần công thức/giá vốn; chưa có trang nguyên liệu; `AdminDashboardPage.tsx` chưa có COGS/lợi nhuận.
- `migration_27_tables/02_migrate_data.sql` ghi các `Inventory` cũ vào `unmapped_migration_records` với `NEED_INGREDIENT_RECIPE_MAPPING` → dữ liệu nguyên liệu/công thức **chưa có**.

**Bước 0 bắt buộc:** chạy `npx tsc --noEmit` ở `apps/api` và `apps/web`, ghi lại lỗi type hiện có (đặc biệt `userId`/`batchId`/`unit` lệch schema). Sửa các lỗi chặn compile ở những file mình đụng tới. **Không sửa schema Prisma**; nếu thật sự cần thì DỪNG và hỏi.

---

## 2. NGUYÊN TẮC TÍNH GIÁ VỐN (bắt buộc tuân thủ)

1. **Đơn vị**: mọi số lượng lưu theo `Ingredient.baseUnit` (g, ml, cái). `RecipeIngredient.quantity + unit` là giá trị người dùng nhập; `quantityBase` = quy đổi sang `baseUnit` (bảng quy đổi: kg↔g ×1000, l↔ml ×1000, cùng đơn vị ×1; khác nhóm → `HttpError(400)`). Tạo helper `common/unit-conversion.ts`.
2. **Giá vốn khi nhập** (`IngredientBatch.unitCost`) = giá mua / số lượng base nhận được (`unitPrice / conversionQuantity`).
3. **`Ingredient.costPerBaseUnit`** = **bình quân gia quyền di động**, cập nhật mỗi lần nhập:
   `newCost = (qtyTồn × costCũ + qtyNhập × unitCostNhập) / (qtyTồn + qtyNhập)` (nếu tồn ≤ 0 thì lấy `unitCostNhập`). Dùng để **ước tính** giá vốn công thức.
4. **Giá vốn thực tế khi tiêu hao** (order COMPLETED, waste…) = trừ lô theo **FIFO hạn dùng** (`expirationDate asc NULLS LAST, receivedAt asc`), `cost = Σ(qtyTrừ × batch.unitCost)`. Ghi vào `InventoryTransaction.unitCost/totalCost`.
5. **Giá vốn món ước tính** (`Product.costPrice`) =
   `(Σ quantityBase × costPerBaseUnit (bỏ isOptional) + laborCost + overheadCost) / yieldQuantity` của recipe đang active. Tự tính lại khi: lưu recipe, nhập kho làm đổi `costPerBaseUnit`.
6. **Snapshot trên `OrderItem`** (khi COMPLETED):
   - `ingredientCost` = tổng `totalCost` các transaction CONSUME của recipe × quantity.
   - `toppingCost` = Σ `OrderItemTopping.costSnapshot`.
   - `totalCost = ingredientCost + toppingCost + (laborCost + overheadCost)/yieldQuantity × quantity`.
   - `grossProfit = price × quantity + Σ topping.price × topping.quantity − totalCost`.
   - Đơn đã COMPLETED **không** tính lại khi giá nguyên liệu thay đổi.
7. Toàn bộ tính toán tiền dùng `Prisma.Decimal` (không dùng `number` cộng dồn), làm tròn 2 chữ số khi ghi vào cột Decimal(12,2), 4 chữ số cho cost/unit.
8. **Tương thích ngược**: sản phẩm **chưa có recipe active** → giữ nguyên luồng `Inventory` cũ, `OrderItem` cost lấy `Product.costPrice × quantity` và đánh dấu bằng `recipeId = null`. Không được làm vỡ luồng đặt hàng/thanh toán hiện tại.

---

## 3. PHẠM VI THEO GIAI ĐOẠN (làm tuần tự, mỗi giai đoạn phải compile + test xong mới sang bước sau)

### Giai đoạn A – Module Ingredient (API)
`apps/api/src/modules/ingredient/` (controller, route, service, repository, validator), mount `/api/ingredients` (ADMIN cho ghi, ADMIN/STAFF cho đọc – theo middleware hiện có trong `auth.middleware.ts`).
- `GET /` (lọc `search`, `categoryId`, `lowStock`), `GET /:id` (kèm batches còn hàng), `POST /`, `PATCH /:id`, `DELETE /:id` (soft delete `deletedAt`; chặn nếu đang dùng trong recipe active).
- `POST /:id/import` – nhập thủ công: `{ quantity, unit, unitCost | totalCost, batchCode?, expirationDate?, supplierId?, note? }` → tạo `IngredientBatch`, transaction `IMPORT` có `unitCost/totalCost`, cập nhật `quantity` + `costPerBaseUnit` (mục 2.3) trong `$transaction`, khóa dòng `SELECT ... FOR UPDATE` hoặc `updateMany` theo `rowVersion`.
- `POST /:id/waste` – `{ quantity, wasteReason, batchId?, note? }` → trừ FIFO, transaction `WASTE` có cost.
- `GET /:id/transactions`.
- DTO trả: `availableQuantity = quantity − reserved`, `stockValue = Σ quantityRemaining × unitCost`.

### Giai đoạn B – Module Recipe & Topping (API)
`apps/api/src/modules/recipe/`, mount `/api/products/:productId/recipes` và `/api/toppings`.
- `GET /api/products/:productId/recipes` (tất cả version), `GET .../recipes/active`.
- `POST .../recipes` – tạo **version mới** (`version = max+1`), validate ingredient tồn tại & đơn vị quy đổi được, tính `quantityBase`; nếu `activate=true` thì trong cùng transaction: version cũ `isActive=false, effectiveTo=now()`, version mới `isActive=true`. **Không sửa recipe đã có OrderItem tham chiếu** – chỉ tạo version mới.
- `POST .../recipes/:recipeId/activate`.
- `GET .../recipes/cost-preview` (hoặc `POST` với body chưa lưu) → trả breakdown từng nguyên liệu: `quantityBase, costPerBaseUnit, lineCost`, cộng `laborCost, overheadCost`, `unitCost`, `price`, `marginPercent`.
- Service `recalculateProductCost(productId, tx?)` cập nhật `Product.costPrice` (mục 2.5). Gọi lại cho mọi product dùng ingredient khi `costPerBaseUnit` thay đổi (`recalculateCostsForIngredient(ingredientId, tx)`).
- Topping CRUD + `ToppingIngredient`, hàm `estimateToppingCost(toppingId)`.

### Giai đoạn C – Giá vốn khi nhận hàng từ nhà cung cấp
- Mở rộng `purchase` để hỗ trợ item theo `ingredientId` (giữ nguyên item theo `inventoryId` cũ). Validator: mỗi item có đúng **một** trong `inventoryId` | `ingredientId`.
- `receive` với item nguyên liệu: tạo `GoodsReceipt` (CONFIRMED, `idempotencyKey` từ client để chống nhận trùng), tạo `IngredientBatch` (`unitCost` mục 2.2, `goodsReceiptId`, `purchaseRequestItemId`, `receivedQty/receivedUnit`), transaction `IMPORT` có cost, cập nhật `costPerBaseUnit` + `recalculateCostsForIngredient`.
- Lấy quy cách từ `SupplierIngredient` (`purchaseUnit`, `conversionQuantity`, `pricePerBaseUnit`).
- Sửa luôn các chỗ ghi `InventoryTransaction` lệch schema trong các file đụng tới (`userId` → `performedBy`, lô cũ → `legacyBatchId`).

### Giai đoạn D – Giá vốn trên đơn hàng
Sửa `order.validator.ts`, `order.repository.ts`, `order.service.ts`:
- `createOrderSchema.items[]` thêm `toppings?: { toppingId, quantity }[]` (optional – web cũ không gửi vẫn chạy).
- **Tạo đơn**: với sản phẩm có recipe active → snapshot `recipeId, recipeVersion`; tính nhu cầu nguyên liệu (recipe + topping) × quantity, **giữ chỗ** `Ingredient.reserved` bằng `UPDATE ... WHERE quantity - reserved >= need` (atomic như cách hiện làm với `Inventory`), ghi transaction `RESERVE` (`orderItemId`, `referenceType='Order'`). Thiếu nguyên liệu → lỗi thân thiện giống message hiện có. Tạo `OrderItemTopping` (`price` từ `Topping.price`).
- **COMPLETED**: trừ `quantity` và `reserved`, trừ lô FIFO, ghi transaction `CONSUME` có `unitCost/totalCost`, `idempotencyKey = consume:${orderItemId}:${ingredientId}:${batchId}`; tính & ghi snapshot cost (mục 2.6), `consumptionStatus=COMMITTED`, `committedAt`. Sản phẩm không có recipe → luồng cũ + cost theo `Product.costPrice` (mục 2.8).
- **CANCELLED** (từ PENDING/PROCESSING): nhả `reserved`, transaction `RELEASE`, `consumptionStatus=VOIDED`, `voidedAt`.
- Tất cả trong `prisma.$transaction` hiện có, giữ nguyên `updateMany where status` chống xử lý trùng.
- `toOrderDto` trả thêm `ingredientCost, toppingCost, totalCost, grossProfit` cho từng item và tổng ở cấp order – **chỉ khi người gọi là ADMIN/STAFF** (customer không thấy giá vốn).

### Giai đoạn E – Báo cáo (Dashboard)
`dashboard.service.ts` / route:
- `getSummary()` thêm `orders.totalCogs`, `orders.grossProfit`, `orders.grossMarginPercent` (đơn COMPLETED).
- `GET /api/dashboard/profit?days=30` → theo ngày: `{ date, revenue, cogs, grossProfit }` (revenue = Σ price×qty item, **không** gồm phí ship).
- `GET /api/dashboard/product-margins?days=30` → theo sản phẩm: `soldQty, revenue, cogs, grossProfit, marginPercent, currentCostPrice`, sort theo grossProfit.
- `GET /api/dashboard/ingredient-usage?days=30` → nguyên liệu: tổng CONSUME, WASTE (qty + cost), giá trị tồn hiện tại.

### Giai đoạn F – Web (`apps/web`)
Bám style hiện có (Tailwind, `components/common/*`, `api/*.api.ts`, `types/*.types.ts`, toast).
- `types/ingredient.types.ts`, `types/recipe.types.ts`, `api/ingredients.api.ts`, `api/recipes.api.ts`.
- `pages/admin/AdminIngredientsPage.tsx`: bảng nguyên liệu (tồn, khả dụng, đơn vị, giá vốn/đơn vị, giá trị tồn, trạng thái thấp), modal tạo/sửa, modal nhập kho (có đơn giá), modal hao hụt. `AdminIngredientDetailPage.tsx`: lô + lịch sử giao dịch có cost.
- `AdminProductFormPage.tsx`: thêm section **Công thức & giá vốn** (chỉ khi edit): chọn nguyên liệu + định lượng + đơn vị, labor/overhead/yield, xem breakdown chi phí realtime (gọi cost-preview), giá vốn/ly, % lợi nhuận so với giá bán (cảnh báo nếu margin < 30%), lưu thành version mới, xem lịch sử version.
- `AdminOrderDetailPage.tsx`: cột giá vốn & lợi nhuận gộp mỗi dòng + tổng.
- `AdminDashboardPage.tsx`: thẻ Giá vốn, Lợi nhuận gộp, Biên lợi nhuận; biểu đồ revenue vs cogs theo ngày; bảng top margin sản phẩm.
- Thêm route trong `routes/AppRoutes.tsx` + menu trong `layouts/AdminLayout.tsx`.

### Giai đoạn G – Seed dữ liệu mẫu
- `packages/database/prisma/seed_ingredients.ts` (idempotent, `upsert` theo `sku`): ~10–15 nguyên liệu (cà phê hạt, sữa đặc, sữa tươi, đường, đá, ly nhựa, nắp, ống hút, trân châu…) có `costPerBaseUnit` và 1 lô nhập; recipe cho các món cà phê pha trong `products.json`; vài topping. Thêm script vào `packages/database/package.json`.
- Không xóa/ghi đè dữ liệu cũ.

---

## 4. KIỂM THỬ BẮT BUỘC
Đặt cạnh test hiện có (`*.test.mjs` / `*.test.cjs`, `node --test`). Tách logic thuần ra file riêng (`ingredient-cost.utils.ts`) để test không cần DB:
- Quy đổi đơn vị (kg→g, l→ml, khác nhóm báo lỗi).
- Bình quân gia quyền: tồn 0, tồn âm, nhập nhiều lần.
- FIFO nhiều lô khác giá → `totalCost` đúng; thiếu lô → lỗi.
- Giá vốn recipe: bỏ `isOptional`, chia `yieldQuantity`, cộng labor/overhead.
- Snapshot OrderItem: có/không topping, sản phẩm không recipe (fallback `costPrice`).
- Idempotency: gọi COMPLETED 2 lần không trừ kho/không tính cost 2 lần; receive cùng `idempotencyKey` 2 lần chỉ nhập 1 lần.
- Hủy đơn nhả `reserved` đúng.

Cuối mỗi giai đoạn: `npx tsc --noEmit` (api + web) sạch lỗi ở file đã sửa, test pass.

---

## 5. RÀNG BUỘC
- Không sửa schema Prisma, không chạy `04_contract_DO_NOT_RUN_YET.sql`, không xóa bảng/cột chuyển tiếp.
- Không thay đổi hành vi API public đang được web dùng (chỉ **thêm** field).
- Không để customer nhìn thấy giá vốn/lợi nhuận.
- Message lỗi trả người dùng bằng tiếng Việt, giống giọng văn hiện có.
- Giữ nguyên comment/docstring cũ không liên quan.

## 6. ĐẦU RA MONG MUỐN
1. Danh sách file tạo/sửa theo từng giai đoạn.
2. Bảng endpoint mới (method, path, quyền, body, response mẫu).
3. Kết quả `tsc` + test.
4. Các điểm cần người dùng quyết định (nếu có), ví dụ: có muốn chuyển hẳn món pha chế sang trừ kho theo nguyên liệu không, ngưỡng cảnh báo margin.
