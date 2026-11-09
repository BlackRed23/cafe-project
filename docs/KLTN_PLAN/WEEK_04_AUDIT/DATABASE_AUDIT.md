# Current reverification — 05/11/2026 (Asia/Saigon)

27 intended tables / 16 ENUMs are declared; 27 physical tables are USER-CONFIRMED, independently UNKNOWN pending target/read-only credentials. Current Prisma recount: 31 models / 16 ENUMs. Four legacy models remain declared and used; physical presence UNKNOWN. DB02–DB08 below are source comparisons, not observed deployed defects.

See [DATABASE_REVERIFICATION.md](DATABASE_REVERIFICATION.md) for current evidence, scope, migration hashes, unresolved live checks and readiness calculation. This update supersedes conflicting assumptions in the historical 03/11/2026 audit below. The user confirms an existing 27-table database; that confirmation is distinct from independently verified PostgreSQL evidence. No database query or object change has been performed.

---

# Audit cơ sở dữ liệu tuần 04

03/11/2026, Asia/Saigon. Kết luận: **PARTIAL về hiện vật, BLOCKED về parity và SQL chuẩn**. Không kết nối DB. Tiền tố đường dẫn dùng trong báo cáo: `S = packages/database/prisma/schema/`; `M = packages/database/prisma/migration_27_tables/`; `I = S/migrations/20260718025427_init_schema_and_unique_keys/migration.sql`. Các đường dẫn là tương đối từ gốc repository.

## DB01 Kiểm kê ba lớp schema — VERIFIED tĩnh

`packages/database/package.json`, mục prisma.schema, trỏ `prisma/schema`; `S/main.prisma:1–8` dùng PostgreSQL/DATABASE_URL. Đã đọc cả 9 tệp. Không thấy `@@map`: tên model là tên bảng dự kiến, không phải bảng DB đã xác nhận.

| Lớp | Kết quả | Giới hạn |
|---|---|---|
| TLCN lịch sử | I tạo 15 bảng, 6 ENUM; migration `20260724120000_add_product_detail_fields/migration.sql:1–7` chỉ thêm 6 cột Product | Không xác nhận DB hiện hành đã áp dụng |
| Prisma chuyển tiếp | 31 model, 16 ENUM | Có 4 model legacy; generated client/runtime UNKNOWN |
| Expand ứng viên | M/01_expand.sql:168–450 tạo 16 bảng, thêm 10 ENUM tại :18–88; 15+16=31 bảng nghiệp vụ dự kiến | Không được gọi là SQL chuẩn được duyệt |
| Contract dự kiến | M/04_contract_DO_NOT_RUN_YET.sql:53–62 bỏ 4 bảng; 31−4=27 | Không chứng minh bảo toàn dữ liệu hay parity |
| DB vật lý thực | UNKNOWN | Không introspection, không tính migration_backup hoặc _prisma_migrations vào 27 |

## Danh mục 27 bảng đích ứng viên

Mọi dòng dưới đây VERIFIED về khai báo; tính đúng theo SQL chuẩn/DB thực UNKNOWN. Danh sách **không thay thế** authoritative SQL đang MISSING.

| Nhóm | Model ứng viên và nơi khai báo |
|---|---|
| Phân loại/người dùng | Category (`S/category.prisma:6`), User (`S/user.prisma:7`) |
| Menu/công thức | Product (:7), Recipe (:43), RecipeIngredient (:66), Topping (:85), ToppingIngredient (:102), đều `S/product.prisma` |
| Kho/kiểm kê | Ingredient (:29), IngredientBatch (:63), InventoryTransaction (:91), StockCount (:123), StockCountItem (:142), đều `S/inventory.prisma` |
| Bán/thanh toán | Order (:49), OrderItem (:73), OrderItemTopping (:99), Payment (:114), PaymentCallback (:140), PaymentReconciliation (:157), đều `S/order.prisma` |
| Mua/nhận | PurchaseRequest (:16), PurchaseRequestItem (:48), GoodsReceipt (:71), đều `S/purchase.prisma` |
| Nhà cung cấp | Supplier (:1), SupplierIngredient (:20), `S/supplier.prisma` |
| Agent/hệ thống | AgentExecution (:19), AgentToolCall (:44), AgentEvaluation (:61), SystemSetting (:81), `S/system.prisma` |

Bốn model chuyển tiếp: Inventory (`S/inventory.prisma:162`), InventoryBatch (:177), SupplierProduct (`S/supplier.prisma:42`), AgentLog (`S/system.prisma:88`).

16 ENUM: CategoryKind (`category:1`); InventoryTransactionType/WasteReason/StockCountStatus (`inventory:1/15/22`); OrderStatus/ConsumptionStatus/PaymentStatus/PaymentMethod/TransactionStatus/CallbackStatus (`order:1/8/14/21/29/40`); ToppingType (`product:1`); PurchaseRequestStatus/GoodsReceiptStatus (`purchase:1/10`); ExecutionStatus/ToolCallStatus (`system:1/10`); UserRole (`user:1`). Giá trị khai báo mới trong expand phù hợp các enum mới đã đọc; enum có sẵn được giả định theo lịch sử, không kiểm chứng DB thực. Bắt duplicate_object không phát hiện enum cùng tên nhưng khác giá trị.

## Drift và tính toàn vẹn

| ID | Trạng thái / mức độ | Bằng chứng, tác động và việc cần chốt |
|---|---|---|
| DB02 | VERIFIED / HIGH | `S/order.prisma:119–137`: Payment.status TransactionStatus, providerTxnId @unique, orderId chỉ index. `M/01:127–137` giữ status PaymentStatus cũ và thêm transactionStatus; không thêm unique providerTxnId. I:279 giữ Payment_orderId_key; `apps/api/src/modules/payment/payment.repository.ts:11–24` dùng findUnique(orderId)/PaymentStatus. Mâu thuẫn kiểu và một-nhiều; cần quyết định migration, Prisma, API đồng bộ |
| DB03 | VERIFIED / HIGH | `S/inventory.prisma:93–113` batchId→IngredientBatch, legacyBatchId→InventoryBatch, actor performedBy. I:61–62,312–315 dùng batchId→InventoryBatch và userId. M/01:149–160,578–580 chỉ thêm ingredient/actor, không chuyển FK batchId hoặc thêm legacyBatchId/backfill actor. Contract DROP CASCADE gỡ FK cũ mà không tạo FK đích. Repository inventory :38–47,149–157 vẫn dùng product/user/userId/batchId cũ |
| DB04 | VERIFIED / HIGH | `S/inventory.prisma:74–77` có relation GoodsReceipt/PurchaseRequestItem; M/01:203–204 có scalar cột nhưng toàn bộ FK block :489–581 thiếu hai FK này và thiếu PurchaseRequestItem.ingredientId FK. `InventoryTransaction.batchId` thiếu FK mới. Cần diff toàn bộ FK/onDelete/onUpdate; không kết luận thiếu cột receipt (cột thực sự đã có) |
| DB05 | VERIFIED / HIGH | `S/product.prisma:14` servingUnit non-null, không unit; M/01:102 cho phép null/default ly; `inventory.repository.ts:59–60` vẫn select unit. M/02:43–50 chỉ backfill khi NULL, thường bỏ qua unit gốc vì default đã điền ly. Contract :41 xóa unit. Chốt nullability và mapping từng sản phẩm |
| DB06 | VERIFIED / MEDIUM | I:264 unique Category.name còn tồn tại, M/01:457 chỉ thêm unique(name,kind); Prisma category:19 chỉ composite. I:276 giữ OrderItem(orderId,productId) unique nhưng Prisma không khai báo; hạn chế các dòng cùng món khác topping/recipe. M/01:479 index receipt chỉ purchaseRequestId, Prisma purchase:88–89 đòi composite(receivedAt) và status; ledger Prisma inventory:118–120 có thêm index thiếu trong expand. Cần diff đầy đủ, không suy index tên giống là định nghĩa đúng |
| DB07 | PARTIAL / HIGH | Ingredient quantity/reserved NUMERIC(14,3), unit cost (18,4), ledger total (14,2), tiền order/payment (12,2), recipe yield (10,2), Agent cost (10,6). PK có trên các model/bảng mới. Unique SKU, recipe-version, recipe-ingredient, count-ingredient, receipt/key, execution-step có trong M/01:457–471. Không thấy CHECK cho 0≤reserved≤quantity, quantityRemaining≤quantityInitial, yield/conversion>0, variance=actual−system hoặc chỉ một recipe active. S/product:62–63 chỉ unique phiên bản và index active. Chưa có engine đích chứng minh các invariant này |
| DB08 | PARTIAL / HIGH | S/supplier:26–31 có đơn vị mua/hệ số Decimal, nhưng MOQ Int; S/purchase:54–56 quantities Int, price (12,2) so với tồn (14,3), unit cost (18,4). Cần quyết định lượng theo bao/gói hay base unit, precision/rounding và snapshot. `IngredientBatch.supplierId`, ledger.orderItemId, GoodsReceipt.receivedBy là scalar chưa có relation; phải chốt chính sách FK, không tự gọi đây là lỗi Prisma |

## Quan hệ và bảo toàn

Recipe→Product, RecipeIngredient→Recipe/Ingredient; ToppingIngredient→Topping/Ingredient; OrderItem→Recipe; StockCount→creator/approver và StockCountItem→count/ingredient đã có PK/FK ứng viên (`M/01:502–531,551–559`). StockCountItem unique(count,ingredient) ngăn trùng dòng nhưng không bảo đảm approve một lần hoặc snapshot đúng. GoodsReceipt→PurchaseRequest có FK và idempotencyKey unique có điều kiện (`M/01:348–363,463–464,546–547`), chưa có service đích thực hiện nhận từng phần và ledger nguyên liệu cùng transaction.

Inventory tổng và lô legacy có transaction/row lock trong `inventory.repository.ts:124–170,178–226`; không chứng minh engine nguyên liệu hoạt động. M/02:220–238 chỉ ghi backlog Inventory cần quyết định, không INSERT Ingredient/IngredientBatch/SupplierIngredient, không chuyển ledger tồn cũ. Dữ liệu-preservation strategy **PARTIAL**, chưa có mapping ID/SKU/unit/cost/reservation/FK và đối soát nguồn→đích. Migration mới nằm ngoài thư mục Prisma migrations: thứ tự/registry/checksum triển khai **MISSING**, không tự xem Prisma migrate sẽ chạy sáu tệp này.

**Kết luận phê duyệt:** SQL chuẩn và approval MISSING; tính nhất quán kỹ thuật của ứng viên chưa đạt; DB thực UNKNOWN. Không có căn cứ xác nhận đã chuyển 15→27. Đóng DB02–DB08 và MG findings trước mở gate rehearsal; hoãn contract tới sau chuyển backend/Agent và chứng cứ live phù hợp.
