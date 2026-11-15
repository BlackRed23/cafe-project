# Baseline dự án — 01/11/2026 (Asia/Saigon)

Kiểm kê tĩnh repository; không chạy build/test/SQL/migration/API hoặc ứng dụng. VERIFIED xác nhận hiện vật/mã, không đồng nghĩa chạy thành công. PARTIAL: có một phần; MISSING: chưa tìm thấy trong phạm vi quét; UNKNOWN: thiếu chứng cứ; PROPOSED: công việc dự kiến.

Đã đọc README, manifest, SEED_LOG, toàn bộ Prisma, migration gốc và sáu SQL chuyển đổi; các module kho/đơn/mua/thanh toán/quyền/Agent, route web và test hiện có. Không tìm thấy AGENTS.md, audit TLCN độc lập, lịch trường hoặc yêu cầu GVHD được duyệt trong tập tệp đã quét. README nhắc docs nhưng lúc đầu chưa có thư mục này. Không sao chép thông tin kết nối/secret.

## Bằng chứng

| ID | Trạng thái | Phát hiện | Nguồn |
|---|---|---|---|
| B01 | VERIFIED | Monorepo npm/Turbo, React/Vite/TypeScript, Express, Prisma/PostgreSQL, Gemini; phiên bản chỉ là khai báo manifest | [package.json](../../package.json); [apps/api/package.json](../../apps/api/package.json); [apps/web/package.json](../../apps/web/package.json); [apps/agent/package.json](../../apps/agent/package.json) |
| B02 | PARTIAL | Có module sản phẩm, danh mục, NCC, mua hàng; chưa có chứng cứ nghiệm thu vận hành | [apps/api/src/modules/product/product.service.ts](../../apps/api/src/modules/product/product.service.ts); [apps/api/src/modules/category/category.service.ts](../../apps/api/src/modules/category/category.service.ts); [apps/api/src/modules/supplier/supplier.service.ts](../../apps/api/src/modules/supplier/supplier.service.ts); [apps/api/src/modules/purchase/purchase.service.ts](../../apps/api/src/modules/purchase/purchase.service.ts) |
| B03 | VERIFIED | Kho và đơn hàng còn dùng Inventory/InventoryBatch, có transaction và conditional update | [apps/api/src/modules/inventory/inventory.repository.ts](../../apps/api/src/modules/inventory/inventory.repository.ts); [apps/api/src/modules/order/order.repository.ts](../../apps/api/src/modules/order/order.repository.ts) |
| B04 | PARTIAL | Có schema Ingredient/Recipe/Topping/StockCount/GoodsReceipt/chi phí; chưa tìm thấy module chuyên biệt triển khai đầy đủ | [packages/database/prisma/schema/](../../packages/database/prisma/schema/) |
| B05 | PARTIAL | Payment service cập nhật PaymentStatus cũ; chưa thấy adapter callback/provider/reconciliation | [apps/api/src/modules/payment/payment.service.ts](../../apps/api/src/modules/payment/payment.service.ts); [apps/api/src/modules/payment/payment.route.ts](../../apps/api/src/modules/payment/payment.route.ts) |
| B06 | VERIFIED | Gemini generateContent rồi parse JSON, ép Number/String; chưa phải vòng Function Calling; rules có fallback | [apps/agent/src/services/gemini.service.ts](../../apps/agent/src/services/gemini.service.ts); [apps/agent/src/services/recommendation.service.ts](../../apps/agent/src/services/recommendation.service.ts) |
| B07 | PARTIAL | Agent truy xuất kho theo sản phẩm và SupplierProduct; chặn PR đang mở bằng truy vấn trong transaction, chưa chứng minh chống race | [apps/agent/src/repositories/agent.repository.ts](../../apps/agent/src/repositories/agent.repository.ts) |
| B08 | VERIFIED | System scan LOG_ONLY chặn purchase write, khác mô tả tự tạo PR trong README | [apps/agent/src/services/agent.service.ts](../../apps/agent/src/services/agent.service.ts); [README.md](../../README.md) |
| B09 | PARTIAL | Có JWT/role middleware, internal token timingSafeEqual, kiểm user active; chưa chứng minh tất cả quyền | [apps/agent/src/internal-auth.ts](../../apps/agent/src/internal-auth.ts); [apps/api/src/modules/auth/auth.middleware.ts](../../apps/api/src/modules/auth/auth.middleware.ts) |
| B10 | PARTIAL | Có web khách/admin, kho, PR, đơn, log; chưa tìm thấy route POS pha chế riêng | [apps/web/src/routes/AppRoutes.tsx](../../apps/web/src/routes/AppRoutes.tsx) |
| B11 | VERIFIED | Có test kho/auth/Agent dùng mocks; không phải bằng chứng PostgreSQL concurrency/rollback | [apps/api/tests/inventory-consistency.test.cjs](../../apps/api/tests/inventory-consistency.test.cjs); [apps/api/tests/auth-registration.test.cjs](../../apps/api/tests/auth-registration.test.cjs); [apps/api/tests/test-db-security.test.cjs](../../apps/api/tests/test-db-security.test.cjs); [apps/api/tests/inventory-ui-contract.test.cjs](../../apps/api/tests/inventory-ui-contract.test.cjs); [apps/agent/tests/internal-auth.test.cjs](../../apps/agent/tests/internal-auth.test.cjs); [apps/agent/tests/principal-guards.test.cjs](../../apps/agent/tests/principal-guards.test.cjs); [apps/agent/tests/rule-based-regression.test.cjs](../../apps/agent/tests/rule-based-regression.test.cjs) |
| B12 | UNKNOWN | Log seed/reset lịch sử không xác nhận dữ liệu hiện hành; cần che thông tin kết nối khi chia sẻ | [SEED_LOG.md](../../SEED_LOG.md) |

## Đối chiếu DB

Prisma khai báo **31 model / 16 ENUM**, không chứng minh DB thật có cùng số lượng.

Models: Category, Ingredient, IngredientBatch, InventoryTransaction, StockCount, StockCountItem, Inventory, InventoryBatch, Order, OrderItem, OrderItemTopping, Payment, PaymentCallback, PaymentReconciliation, Product, Recipe, RecipeIngredient, Topping, ToppingIngredient, PurchaseRequest, PurchaseRequestItem, GoodsReceipt, Supplier, SupplierIngredient, SupplierProduct, AgentExecution, AgentToolCall, AgentEvaluation, SystemSetting, AgentLog, User.

ENUM: CategoryKind, InventoryTransactionType, WasteReason, StockCountStatus, OrderStatus, ConsumptionStatus, PaymentStatus, PaymentMethod, TransactionStatus, CallbackStatus, ToppingType, PurchaseRequestStatus, GoodsReceiptStatus, ExecutionStatus, ToolCallStatus, UserRole.

Bốn model chuyển tiếp Inventory, InventoryBatch, SupplierProduct, AgentLog: 31 − 4 = 27. Giữ yêu cầu đích 27 bảng/16 ENUM; chưa xác nhận SQL được duyệt. Hai migration TLCN ở [migrations](../../packages/database/prisma/schema/migrations/) khác bộ SQL chuyển đổi nằm ngoài lịch sử migration.

| Ánh xạ TLCN → KLTN | Quy tắc cần duyệt (PROPOSED) |
|---|---|
| User/Category/Product/SystemSetting | Giữ ID/lịch sử; phân biệt menu và nguyên liệu; giữ cấu hình nghiệp vụ |
| Inventory/InventoryBatch → Ingredient/IngredientBatch | Mapping SKU/lô/base unit thủ công; không tự biến sản phẩm bán lẻ thành nguyên liệu |
| SupplierProduct → SupplierIngredient | Giữ NCC, quy cách, MOQ, giá theo base unit |
| Order/Item + Recipe/RecipeIngredient/Topping/ToppingIngredient/OrderItemTopping | Snapshot phiên bản, lượng tiêu hao và chi phí; thiếu COGS lịch sử phải ghi unknown |
| PurchaseRequest/Item + GoodsReceipt | ingredientId; giữ nhận từng phần/công nợ/lịch sử |
| Payment + Callback/Reconciliation | Tách attempt và tổng đơn; giữ provider IDs |
| InventoryTransaction + StockCount/Item | Ledger có dấu, lô nguồn, actor, idempotency |
| AgentLog → Execution/ToolCall/Evaluation | Giữ nguồn gốc, không ngụy tạo tool run hoặc token usage từ log cũ |

## Sai lệch quan trọng

1. Payment.status trong order.prisma là TransactionStatus; SQL 01_expand thêm transactionStatus nhưng giữ status cũ; API dùng PaymentStatus. Cần chốt kiểu và contract, compile/diff trên bản sao. Nguồn: [packages/database/prisma/schema/](../../packages/database/prisma/schema/); [packages/database/prisma/migration_27_tables/](../../packages/database/prisma/migration_27_tables/); [apps/api/src/modules/payment/payment.service.ts](../../apps/api/src/modules/payment/payment.service.ts).
2. InventoryTransaction.batchId/legacyBatchId trong Prisma liên kết hai loại lô; SQL expand chưa thể hiện đầy đủ chuyển đổi này. IngredientBatch có goodsReceiptId/purchaseRequestItemId trong Prisma, cần diff cột/FK SQL. Nguồn: [packages/database/prisma/schema/](../../packages/database/prisma/schema/); [packages/database/prisma/migration_27_tables/](../../packages/database/prisma/migration_27_tables/).
3. 02_migrate_data, 04_contract, 05_rollback có RAISE NOTICE ngoài DO/function: nghi vấn lỗi cú pháp cần diễn tập, không được xem script sẵn sàng. 01 đặt servingUnit mặc định ly, 02 chỉ map khi NULL có thể bỏ sót unit cũ. Nguồn: [packages/database/prisma/migration_27_tables/](../../packages/database/prisma/migration_27_tables/).
4. 00_precheck và 03_verify có CREATE/TRUNCATE/INSERT migration_backup, không phải chỉ đọc. 03 có CHK_06–08 NOT_EXECUTED; 04 chỉ chặn FAIL, chưa chặn kiểm tra chưa chạy. Nguồn: [packages/database/prisma/migration_27_tables/](../../packages/database/prisma/migration_27_tables/).
5. 05 rollback xóa rộng dữ liệu mới/reset trạng thái, cần đánh giá FK và dữ liệu phát sinh sau snapshot. Contract có DROP CASCADE; chưa có bằng chứng restore rehearsal. Nguồn: [packages/database/prisma/migration_27_tables/](../../packages/database/prisma/migration_27_tables/).
6. Có unique SKU, recipe/version, idempotencyKey, execution/step, count/ingredient; cần quy tắc quantity≥reserved≥0, một recipe active, FEFO và đối soát tổng/lô. Scalar supplierId/orderItemId phải đối chiếu chính sách FK. Nguồn: [packages/database/prisma/schema/](../../packages/database/prisma/schema/); [packages/database/prisma/migration_27_tables/](../../packages/database/prisma/migration_27_tables/).
7. Gemini ép kiểu chưa đảm bảo số hữu hạn/NCC hợp lệ/giới hạn mua; raw response được đính lỗi, cần redaction. Không kết luận đã bị khai thác. Nguồn: [apps/agent/src/services/gemini.service.ts](../../apps/agent/src/services/gemini.service.ts).

## Nguồn chưa xác minh

- U01: UNKNOWN — SQL chuẩn 27/16 được GVHD/chủ dự án duyệt — xác nhận bản và checksum.
- U02: UNKNOWN — Schema và dữ liệu DB đang chạy — snapshot/introspection trong đợt riêng được phép.
- U03: UNKNOWN — Migration/restore thành công — diễn tập trên DB sao chép và đối soát.
- U04: UNKNOWN — Build/tests hiện hành pass — chạy riêng, lưu commit/môi trường/log.
- U05: UNKNOWN — Quy trình quán và ngoại lệ — khảo sát và ký quy tắc.
- U06: UNKNOWN — Lịch học vụ và hạn nộp — xin văn bản trường.
- U07: UNKNOWN — Phê duyệt GVHD về phạm vi — biên bản thật.
- U08: UNKNOWN — Phân công nhóm và giờ khả dụng — xác nhận nhân lực.
- U09: UNKNOWN — Quyền sandbox, model Gemini và hạn mức — xác nhận khi triển khai.
- U10: UNKNOWN — Dataset và kết quả baseline — khóa fixture, golden labels rồi đo.

## Chỉ mục nguồn

- stack: [package.json](../../package.json); [apps/api/package.json](../../apps/api/package.json); [apps/web/package.json](../../apps/web/package.json); [apps/agent/package.json](../../apps/agent/package.json)
- db: [packages/database/prisma/schema/](../../packages/database/prisma/schema/)
- sql: [packages/database/prisma/migration_27_tables/](../../packages/database/prisma/migration_27_tables/)
- inv: [apps/api/src/modules/inventory/inventory.repository.ts](../../apps/api/src/modules/inventory/inventory.repository.ts)
- order: [apps/api/src/modules/order/order.repository.ts](../../apps/api/src/modules/order/order.repository.ts)
- purchase: [apps/api/src/modules/purchase/purchase.repository.ts](../../apps/api/src/modules/purchase/purchase.repository.ts)
- payment: [apps/api/src/modules/payment/payment.service.ts](../../apps/api/src/modules/payment/payment.service.ts)
- gemini: [apps/agent/src/services/gemini.service.ts](../../apps/agent/src/services/gemini.service.ts)
- agent: [apps/agent/src/services/agent.service.ts](../../apps/agent/src/services/agent.service.ts)
- repo: [apps/agent/src/repositories/agent.repository.ts](../../apps/agent/src/repositories/agent.repository.ts)
- auth: [apps/agent/src/internal-auth.ts](../../apps/agent/src/internal-auth.ts)
- web: [apps/web/src/routes/AppRoutes.tsx](../../apps/web/src/routes/AppRoutes.tsx)
