# Tuần 03 Thiết kế DB và Agent

## 1. Thông tin tuần

- **Tuần và thời gian:** 03, 19/10–24/10/2026; baseline đề xuất, chưa xác minh hạn trường. Các tuần là luồng công việc, không mặc định đã hoàn tất theo ngày.
- **Mục tiêu:** Thiết kế DB và Agent, tái dùng TLCN và hoàn thiện phần thiếu, giữ AI Agent là đóng góp trung tâm.
- **Ngày kiểm kê:** 01/11/2026, Asia/Saigon; cuối khoảng W04, trước W05 ngày 02/11. Phiên này chỉ đọc source/tài liệu, không chạy build/test/SQL/migration/ứng dụng hoặc dịch vụ ngoài.
- **Tình trạng:** PARTIAL ở mức mã/schema; chưa có task nghiệm thu trọn tiêu chí. Test/runtime và duyệt GVHD: UNKNOWN.
- **Phụ thuộc:** [W02-T04](WEEK_02.md#w02-t04), [W02-T03](WEEK_02.md#w02-t03), [W01-T03](WEEK_01.md#w01-t03). Chuẩn bị thiết kế/fixture/mock có thể song song; write chờ gate tiên quyết.
- **Nhân lực:** UNASSIGNED. Công sức 30 giờ người/tuần (8+8+8+6) là ước lượng chưa cam kết, 360 giờ toàn kỳ chưa gồm dự phòng, cần tái ước lượng khi rõ nhân lực.

**Quy ước:** VERIFIED xác nhận nhận định hẹp có hiện vật/mã; PARTIAL mới có một phần; MISSING chưa tìm thấy hiện vật trong phạm vi quét; UNKNOWN thiếu bằng chứng để kết luận; PLANNED là việc dự kiến. VERIFIED schema hoặc test definition không đồng nghĩa task xong hay test PASS.

**Báo cáo tham chiếu:** chưa tìm thấy bao-cao-tuan.docx trong repository, D:/KLTN hoặc attachments đã quét (MISSING). Không coi các tuyên bố được yêu cầu kiểm tra trong prompt là nội dung báo cáo đã đọc. Mục 8 dùng đúng cấu trúc bạn cung cấp; nếu nhận bản gốc thì đối chiếu trong task hiện có.

**Đường găng chung:** yêu cầu/quy tắc W02 → DB/API/Agent design W03 → migration rehearsal W04 → Inventory Engine W05 → business services W06 → tools/quyền W08 → workflow/recovery W09 → E2E/freeze W10 → evaluation W11. Thanh toán W07 là nhánh bắt buộc trước E2E W10. Không đợi W07 để chuẩn bị read/mock tools nếu nghiệp vụ/quyền đã đủ; không chạy write tools trước gate tương ứng. Các cạnh cụ thể ở mỗi task, không có vòng.

## 2. Công việc đã hoàn thành

**Chưa xác minh hoàn thành trọn vẹn task nào của tuần.** Phần nền tảng hiện hữu được ghi dưới đây theo source, không suy từ sự tồn tại file thành nghiệm thu KLTN. Tái dùng phần phù hợp, chỉ review/hồi quy/thích nghi/tích hợp thay vì dựng lại.

| Task ID liên quan | Nội dung và kết quả quan sát | File source hoặc tài liệu chứng minh | Kết quả kiểm thử | Trạng thái xác minh task |
|---|---|---|---|---|
| W03-T01 | VERIFIED hiện vật: cấu hình modular và 9 tệp Prisma tồn tại; DDL parity chưa nghiệm thu | [packages/database/package.json](../../packages/database/package.json); [packages/database/prisma/schema/main.prisma](../../packages/database/prisma/schema/main.prisma); [packages/database/prisma/schema/inventory.prisma](../../packages/database/prisma/schema/inventory.prisma); [packages/database/prisma/schema/product.prisma](../../packages/database/prisma/schema/product.prisma); [packages/database/prisma/schema/order.prisma](../../packages/database/prisma/schema/order.prisma); [packages/database/prisma/schema/system.prisma](../../packages/database/prisma/schema/system.prisma) | UNKNOWN — chưa có log hiện hành được xác minh, phiên này không chạy test | PARTIAL; chưa nghiệm thu task |
| W03-T03 | VERIFIED hiện vật: có Execution/ToolCall/Evaluation; chưa thấy service runtime ghi các model đích | [packages/database/prisma/schema/system.prisma](../../packages/database/prisma/schema/system.prisma); [apps/agent/src/services/agent.service.ts](../../apps/agent/src/services/agent.service.ts); [apps/agent/src/repositories/agent.repository.ts](../../apps/agent/src/repositories/agent.repository.ts) | UNKNOWN — chưa có log hiện hành được xác minh, phiên này không chạy test | PARTIAL; chưa nghiệm thu task |
| W03-T04 | Gemini/rules và fallback test có mã; chưa có dataset/benchmark đo được | [apps/agent/src/services/gemini.service.ts](../../apps/agent/src/services/gemini.service.ts); [apps/agent/src/services/recommendation.service.ts](../../apps/agent/src/services/recommendation.service.ts); [apps/agent/tests/rule-based-regression.test.cjs](../../apps/agent/tests/rule-based-regression.test.cjs) | UNKNOWN — chưa có log hiện hành được xác minh, phiên này không chạy test | PARTIAL; chưa nghiệm thu task |

## 3. Công việc cần thực hiện

Các bước triển khai/kiểm thử bên dưới là kế hoạch cho đợt thực hiện riêng. Phiên này chỉ tạo 12 Markdown; không thay đổi mã hoặc tài liệu cũ. Các ID giữ tương ứng bộ kế hoạch trước để không nhân bản công việc.

<a id="w03-t01"></a>

### W03-T01 Chốt DB/API

- **Task ID:** W03-T01; **trạng thái:** PLANNED; **người thực hiện:** UNASSIGNED. Phần nền tảng ở mục 2 có thể PARTIAL, chưa đủ để đóng task.
- **Mục tiêu:** hoàn thiện ERD và data dictionary phục vụ thiết kế db và agent, tái dùng phần hiện hữu phù hợp.
- **Đầu vào:** các source và giới hạn chứng cứ trong mục 2/4; kết quả có bằng chứng từ [W02-T04](WEEK_02.md#w02-t04); trường hợp cần nguồn ngoài chưa có giữ UNKNOWN.
- **Hoạt động từng bước:**
  1. Đọc đúng phiên bản đầu vào, xác định phần đủ để chỉ hồi quy/tích hợp.
  2. Giải quyết Payment/batch/Decimal; thiết kế FK/index/check.
  3. Đối chiếu ngoại lệ, quyền và invariant tại mục 4; ghi quyết định mở, không tự mở scope.
  4. Chạy kiểm tra TC-03-01 ở mục 5 trong môi trường phù hợp, lưu expected/actual và giới hạn mock.
  5. Đóng tiêu chí bằng hiện vật/log/biên bản, cập nhật mục 8 theo kết quả thật.
- **Đầu ra:** ERD và data dictionary, có phiên bản, danh sách tái dùng/thay đổi và lỗi còn mở.
- **Ưu tiên:** P0; **ước lượng:** 8 giờ người, chưa cam kết.
- **Phụ thuộc:** [W02-T04](WEEK_02.md#w02-t04).
- **Tiêu chí chấp nhận:** Đủ 27 bảng/16 ENUM được đối chiếu và ADR P0. Có input/expected/actual, source/version hiện vật và không còn P0 trong phạm vi task.
- **Bằng chứng cần thu:** TC-03-01, commit/schema/fixture hoặc biên bản review có ngày/version; hiện chưa có kết quả thực.

<a id="w03-t02"></a>

### W03-T02 Thiết kế migration/restore

- **Task ID:** W03-T02; **trạng thái:** PLANNED; **người thực hiện:** UNASSIGNED. Phần nền tảng ở mục 2 có thể PARTIAL, chưa đủ để đóng task.
- **Mục tiêu:** hoàn thiện Runbook phục vụ thiết kế db và agent, tái dùng phần hiện hữu phù hợp.
- **Đầu vào:** các source và giới hạn chứng cứ trong mục 2/4; kết quả có bằng chứng từ [W03-T01](WEEK_03.md#w03-t01); trường hợp cần nguồn ngoài chưa có giữ UNKNOWN.
- **Hoạt động từng bước:**
  1. Đọc đúng phiên bản đầu vào, xác định phần đủ để chỉ hồi quy/tích hợp.
  2. Mapping SKU/unit, backup, expand/migrate/verify/contract.
  3. Đối chiếu ngoại lệ, quyền và invariant tại mục 4; ghi quyết định mở, không tự mở scope.
  4. Chạy kiểm tra TC-03-02 ở mục 5 trong môi trường phù hợp, lưu expected/actual và giới hạn mock.
  5. Đóng tiêu chí bằng hiện vật/log/biên bản, cập nhật mục 8 theo kết quả thật.
- **Đầu ra:** Runbook, có phiên bản, danh sách tái dùng/thay đổi và lỗi còn mở.
- **Ưu tiên:** P0; **ước lượng:** 8 giờ người, chưa cam kết.
- **Phụ thuộc:** [W03-T01](WEEK_03.md#w03-t01).
- **Tiêu chí chấp nhận:** Có ngưỡng dừng, bảo toàn dữ liệu mới, contract khóa. Có input/expected/actual, source/version hiện vật và không còn P0 trong phạm vi task.
- **Bằng chứng cần thu:** TC-03-02, commit/schema/fixture hoặc biên bản review có ngày/version; hiện chưa có kết quả thực.

<a id="w03-t03"></a>

### W03-T03 Thiết kế Agent

- **Task ID:** W03-T03; **trạng thái:** PLANNED; **người thực hiện:** UNASSIGNED. Phần nền tảng ở mục 2 có thể PARTIAL, chưa đủ để đóng task.
- **Mục tiêu:** hoàn thiện Tool contracts phục vụ thiết kế db và agent, tái dùng phần hiện hữu phù hợp.
- **Đầu vào:** các source và giới hạn chứng cứ trong mục 2/4; kết quả có bằng chứng từ [W03-T01](WEEK_03.md#w03-t01), [W02-T03](WEEK_02.md#w02-t03); trường hợp cần nguồn ngoài chưa có giữ UNKNOWN.
- **Hoạt động từng bước:**
  1. Đọc đúng phiên bản đầu vào, xác định phần đủ để chỉ hồi quy/tích hợp.
  2. Registry/schema, state machine, budget, duyệt và key.
  3. Đối chiếu ngoại lệ, quyền và invariant tại mục 4; ghi quyết định mở, không tự mở scope.
  4. Chạy kiểm tra TC-03-03 ở mục 5 trong môi trường phù hợp, lưu expected/actual và giới hạn mock.
  5. Đóng tiêu chí bằng hiện vật/log/biên bản, cập nhật mục 8 theo kết quả thật.
- **Đầu ra:** Tool contracts, có phiên bản, danh sách tái dùng/thay đổi và lỗi còn mở.
- **Ưu tiên:** P0; **ước lượng:** 8 giờ người, chưa cam kết.
- **Phụ thuộc:** [W03-T01](WEEK_03.md#w03-t01), [W02-T03](WEEK_02.md#w02-t03).
- **Tiêu chí chấp nhận:** Không có write bỏ qua quyền hoặc approval. Có input/expected/actual, source/version hiện vật và không còn P0 trong phạm vi task.
- **Bằng chứng cần thu:** TC-03-03, commit/schema/fixture hoặc biên bản review có ngày/version; hiện chưa có kết quả thực.

<a id="w03-t04"></a>

### W03-T04 Thiết kế thí nghiệm

- **Task ID:** W03-T04; **trạng thái:** PLANNED; **người thực hiện:** UNASSIGNED. Phần nền tảng ở mục 2 có thể PARTIAL, chưa đủ để đóng task.
- **Mục tiêu:** hoàn thiện Protocol v1 phục vụ thiết kế db và agent, tái dùng phần hiện hữu phù hợp.
- **Đầu vào:** các source và giới hạn chứng cứ trong mục 2/4; kết quả có bằng chứng từ [W01-T03](WEEK_01.md#w01-t03), [W02-T04](WEEK_02.md#w02-t04); trường hợp cần nguồn ngoài chưa có giữ UNKNOWN.
- **Hoạt động từng bước:**
  1. Đọc đúng phiên bản đầu vào, xác định phần đủ để chỉ hồi quy/tích hợp.
  2. Khóa baseline, fixture, labels, metrics và seed.
  3. Đối chiếu ngoại lệ, quyền và invariant tại mục 4; ghi quyết định mở, không tự mở scope.
  4. Chạy kiểm tra TC-03-04 ở mục 5 trong môi trường phù hợp, lưu expected/actual và giới hạn mock.
  5. Đóng tiêu chí bằng hiện vật/log/biên bản, cập nhật mục 8 theo kết quả thật.
- **Đầu ra:** Protocol v1, có phiên bản, danh sách tái dùng/thay đổi và lỗi còn mở.
- **Ưu tiên:** P1; **ước lượng:** 6 giờ người, chưa cam kết.
- **Phụ thuộc:** [W01-T03](WEEK_01.md#w01-t03), [W02-T04](WEEK_02.md#w02-t04).
- **Tiêu chí chấp nhận:** Định nghĩa mẫu số, timeout và raw format trước đo. Có input/expected/actual, source/version hiện vật và không còn P0 trong phạm vi task.
- **Bằng chứng cần thu:** TC-03-04, commit/schema/fixture hoặc biên bản review có ngày/version; hiện chưa có kết quả thực.

### Công việc tồn và điều chỉnh lịch

Chưa có chứng cứ nghiệm thu toàn bộ task trước; giữ nguyên ID, tiếp tục task gốc thay vì tạo lại thành việc triển khai mới:

| Tuần nguồn | Task chưa đóng hoặc chờ xác minh | Xử lý |
|---|---|---|
| [Tuần 01](WEEK_01.md) | W01-T01, W01-T02, W01-T03, W01-T04 | Thu bằng chứng, đóng task gốc; chặn write hậu nhiệm nếu chưa đạt tiên quyết |
| [Tuần 02](WEEK_02.md) | W02-T01, W02-T02, W02-T03, W02-T04 | Thu bằng chứng, đóng task gốc; chặn write hậu nhiệm nếu chưa đạt tiên quyết |

**Phục hồi có điều kiện:** 02–03/11 rà W01–02 và xin quyết định SQL/quy tắc/lịch/GVHD; 04–07/11 ưu tiên chốt W03, chuẩn bị hoặc diễn tập W04 khi đủ điều kiện. Không cam kết dồn 120 giờ chưa nghiệm thu vào một tuần. Nếu G04 chưa qua trước 09/11, dời W05 và write hậu nhiệm, chỉ chuẩn bị mock/fixture song song; xin điều chỉnh lịch/nhân lực/phụ trợ. Giữ lịch lịch sử, không đổi thành đã xong.

## 4. Thiết kế và triển khai kỹ thuật

| Lĩnh vực | Công việc |
|---|---|
| Database | ERD/FK/index/check/transaction |
| Backend | Hợp đồng API và kiểu dữ liệu |
| Frontend | Wireframe duyệt/POS |
| AI Agent | Registry/state machine/budget |
| Security | Threat model và stale approval |
| Integration | Thiết kế callback/tool |


Các yêu cầu trong bảng là PLANNED. Chi tiết nguồn, xác minh và ranh giới nghiệp vụ:

**Kiểm tra yêu cầu 27 bảng và 16 ENUM:** [packages/database/package.json](../../packages/database/package.json); [packages/database/prisma/schema/main.prisma](../../packages/database/prisma/schema/main.prisma) xác nhận schema modular. Đếm tĩnh 9 tệp Prisma: 31 model/16 ENUM. [packages/database/prisma/schema/migrations/20260718025427_init_schema_and_unique_keys/migration.sql](../../packages/database/prisma/schema/migrations/20260718025427_init_schema_and_unique_keys/migration.sql) tạo 15 bảng gốc; [packages/database/prisma/migration_27_tables/01_expand.sql](../../packages/database/prisma/migration_27_tables/01_expand.sql) tạo 16 bảng mới, dự kiến 31 bảng nghiệp vụ ở pha mở rộng; [packages/database/prisma/migration_27_tables/04_contract_DO_NOT_RUN_YET.sql](../../packages/database/prisma/migration_27_tables/04_contract_DO_NOT_RUN_YET.sql) bỏ Inventory, InventoryBatch, SupplierProduct, AgentLog để còn 27. Không gộp migration_backup vào chỉ tiêu bảng nghiệp vụ. Chưa có bản SQL được duyệt là nguồn chuẩn hoặc introspection/log DB hiện hành, nên “migration đã hoàn tất 15→27” là UNKNOWN. Không tự đổi số đích hay thêm/xóa bảng/ENUM để né mâu thuẫn.

**Drift cần quyết định:** [packages/database/prisma/schema/order.prisma](../../packages/database/prisma/schema/order.prisma); [apps/api/src/modules/payment/payment.service.ts](../../apps/api/src/modules/payment/payment.service.ts); [apps/api/src/modules/payment/payment.repository.ts](../../apps/api/src/modules/payment/payment.repository.ts); [packages/database/prisma/migration_27_tables/01_expand.sql](../../packages/database/prisma/migration_27_tables/01_expand.sql) cho thấy Payment.status là TransactionStatus ở Prisma, SQL thêm transactionStatus giữ status cũ; API dùng PaymentStatus và findUnique(orderId) trong khi Prisma có payments[]/index orderId. [packages/database/prisma/schema/inventory.prisma](../../packages/database/prisma/schema/inventory.prisma); [packages/database/prisma/migration_27_tables/01_expand.sql](../../packages/database/prisma/migration_27_tables/01_expand.sql) cần đối chiếu batchId/legacyBatchId, goodsReceiptId/purchaseRequestItemId và FK.

**27 bảng đích cần xác nhận:** User, Category, Product, Recipe, RecipeIngredient, Topping, ToppingIngredient, Ingredient, IngredientBatch, InventoryTransaction, StockCount, StockCountItem, Supplier, SupplierIngredient, PurchaseRequest, PurchaseRequestItem, GoodsReceipt, Order, OrderItem, OrderItemTopping, Payment, PaymentCallback, PaymentReconciliation, AgentExecution, AgentToolCall, AgentEvaluation, SystemSetting.

**16 ENUM hiện khai báo:** UserRole, CategoryKind, OrderStatus, ConsumptionStatus, PaymentStatus, PaymentMethod, TransactionStatus, CallbackStatus, PurchaseRequestStatus, GoodsReceiptStatus, InventoryTransactionType, StockCountStatus, ToppingType, ExecutionStatus, WasteReason, ToolCallStatus.

**Ranh giới transaction:** receipt+lô+tổng+ledger; order reserve/commit/release+state/key; count approve+variance+ledger; callback event+attempt+tổng đơn phải nguyên tử. PR key+execution checkpoint cần cùng transaction hoặc cơ chế tương đương được review. Tái dùng unique SKU/recipe version/count-ingredient/provider event/key/execution-step; review check quantity≥reserved≥0, recipe active và index theo query. Nguồn: [packages/database/prisma/schema/inventory.prisma](../../packages/database/prisma/schema/inventory.prisma); [packages/database/prisma/schema/product.prisma](../../packages/database/prisma/schema/product.prisma); [packages/database/prisma/schema/purchase.prisma](../../packages/database/prisma/schema/purchase.prisma); [packages/database/prisma/schema/supplier.prisma](../../packages/database/prisma/schema/supplier.prisma); [packages/database/prisma/schema/order.prisma](../../packages/database/prisma/schema/order.prisma); [packages/database/prisma/schema/system.prisma](../../packages/database/prisma/schema/system.prisma); [packages/database/prisma/migration_27_tables/01_expand.sql](../../packages/database/prisma/migration_27_tables/01_expand.sql). Approval storage ưu tiên mô hình hiện có, không tự thêm bảng.

## 5. Kiểm thử và đánh giá

**Kết quả thực: UNKNOWN.** Chưa có log nghiệm thu tuần được xác minh và phiên này không chạy test. Bảng sau là scenario/expected, không phải kết quả PASS.

| Test ID và task | Kịch bản | Kết quả kỳ vọng | Điều kiện chấp nhận và bằng chứng |
|---|---|---|---|
| TC-03-01 → W03-T01 | ERD/DDL parity | 27 bảng/16 ENUM và Payment/batch/cardinality có quyết định | Expected khớp actual, có log hoặc biên bản review ngày/version; sai lệch trọng yếu chặn task |
| TC-03-02 → W03-T02 | Runbook migrate/restore | Có mapping/backup/count/checksum/tồn từng unit/tiền/FK/post-snapshot data | Expected khớp actual, có log hoặc biên bản review ngày/version; sai lệch trọng yếu chặn task |
| TC-03-03 → W03-T03 | Tool/state/approval | Schema I-O/principal/budget/stale/key đủ | Expected khớp actual, có log hoặc biên bản review ngày/version; sai lệch trọng yếu chặn task |
| TC-03-04 → W03-T04 | Protocol | Baseline/fixtures/labels/mẫu số/raw formats chốt trước đo | Expected khớp actual, có log hoặc biên bản review ngày/version; sai lệch trọng yếu chặn task |

**Mức kiểm thử:** Unit/integration/E2E chạy mã: NOT APPLICABLE ở tuần tài liệu/thiết kế; dùng review ví dụ tính tay, contract và walkthrough. W03 đặc tả test tương lai trước triển khai. Negative/edge: role sai, dữ liệu trống/âm/NaN, state stale, double submit, lỗi phụ thuộc và timeout áp dụng theo từng scenario.

**Bằng chứng tối thiểu:** commit/checksum, schema/fixture/model/prompt version khi liên quan, môi trường, command/procedure, input, expected/actual, timestamp, log che dữ liệu. Mock không chứng minh concurrency/rollback PostgreSQL hoặc provider thật. Không áp dụng ghi NOT APPLICABLE và lý do, không tự đổi thành PASS.

### Protocol thí nghiệm và định dạng kết quả

**PLANNED, chưa có measurements.** Khóa TLCN bằng commit/snapshot độc lập trước nâng cấp, KLTN bằng manifest W10-T04. Nếu không tái tạo được TLCN gốc thì phải ghi baseline thực sự và giới hạn; không lấy nhánh đã nâng cấp gọi là TLCN nguyên bản. Cùng fixture nghiệp vụ, quyền, phần cứng, timeout, ngân sách và seed; ghi mọi khác biệt model/prompt/config. Offline mock để kiểm soát faults và online sandbox để đo provider/usage thật báo riêng.

Dataset đề xuất 80 case tổng hợp không PII: 20 retrieval/kho, 15 NCC/đề xuất mua, 15 đa bước/HITL, 10 quyền/injection/validation, 10 recovery/timeout/restart, 10 replay/race. Stratify 20 case phát triển và 60 đánh giá khóa trước đo; không tune trên 60 case đánh giá. Labels gồm allowed tool sequences tương đương, expected business outcome, forbidden writes và oracle DB invariant. Fixture có SKU/lô/hạn/recipe/yield/đơn vị/quy cách/MOQ/lead-time/giá/NCC inactive. Review nhãn hai người nếu đủ nhân lực, nếu chỉ một người phải nêu giới hạn.

Mỗi case đánh giá chạy 3 repeat/hệ thống, hoán vị thứ tự seed cố định; 60×3×2 = 360 run ước lượng, ngân sách cần duyệt trước. Reset fixture trên DB đánh giá riêng theo run, giữ input giống nhau. Lỗi, timeout và fallback phải lưu đầy đủ; không loại run xấu để tăng chỉ số. Nếu giảm số run vì ngân sách thì chốt protocol version trước đo và báo n thực tế.

| Metric | Công thức và quy tắc đo |
|---|---|
| Task Success Rate | Run đạt expected outcome và mọi invariant / toàn bộ run hợp lệ đã lên lịch; lỗi và timeout tính không đạt |
| Tool Selection Accuracy | Quyết định tool khớp nhãn / quyết định có nhãn; thêm exact-sequence accuracy. TLCN không có Tool Calling ghi N/A thay vì tự gán 0 |
| Invalid Action Rate | Đề nghị sai schema/quyền/quy tắc / tổng đề nghị; tách số bị chặn và số đã thực thi sai |
| Business Rule Compliance | Run thỏa toàn bộ BR áp dụng / run có BR áp dụng; báo thêm phân nhóm từng BR |
| Latency | ms nhận task→terminal, p50/p95 và timeout riêng; tách thời gian đợi người duyệt với compute/end-to-end |
| API usage và cost | Số calls/token input-output từ provider usage; cost theo đơn giá có nguồn/ngày chạy/tiền tệ. Thiếu usage/cost ghi UNKNOWN, không dùng default 0 |
| Error recovery | Fault-injected run phục hồi đúng trong budget và giữ invariant / toàn bộ fault-injected run; thêm recovery time/retry count |
| Duplicate prevention | Logical transactions có hơn một committed write / tổng logical transactions bị replay/race; thêm số ngăn chặn, unique key và DB state cuối |

**Target đề xuất, không phải kết quả:** 0 unauthorized committed write, 0 duplicate committed transaction, 0 invariant violation. Target TSR/latency/cost budget hiện UNKNOWN, cần GVHD duyệt trước W11. Không báo hệ thống cải thiện cho tới khi có so sánh thực.

Raw JSONL bắt buộc: runId/caseId/repeat/seed, system/commit/schema/dataset/model/prompt/registry version, principal role, start/end time, tool names/args đã che/results/status, approval, retries, expected/actual, invariant checks, error/timeout/fallback, tokens/cost hoặc missing_reason. CSV tổng hợp: metric/cohort/numerator/denominator/value/CI/excluded_reason. Báo cáo: môi trường → dataset/protocol → kết quả → failure taxonomy → giới hạn. Mỗi con số truy ngược raw run, không lấy lời model làm oracle.

So sánh paired theo case; báo n theo nhóm và độ phân tán repeat. CI bootstrap 95% lấy mẫu theo case, không coi repeat cùng case độc lập. Công khai exclusions/missing và khác biệt TLCN/KLTN, stochastic model/provider drift/tập tổng hợp/nhân lực nhãn. Không diễn giải correlation thành cải thiện nhân quả vượt thiết kế thí nghiệm.

## 6. Rủi ro và phương án xử lý

| Rủi ro | Tác động | Giảm thiểu | Dự phòng |
|---|---|---|---|
| SQL/Prisma drift | DDL/API sai/mất data | Diff cột/type/FK/index/default | Chặn migration tới ADR đóng |
| Approval/key thiếu | Agent vượt quyền/thêm bảng tùy ý | Thiết kế principal/version trong model hiện có | Write tắt, xin quyết định nếu thiếu |

Lỗi quyền/mất dữ liệu/invariant/duplicate là P0 chặn gate. Người chịu trách nhiệm thực: UNASSIGNED. Lịch/GVHD/SQL chuẩn/nhân lực/sandbox còn thiếu phải xác nhận, không tự xem đã xử lý.

## 7. Điều kiện nghiệm thu tuần

**Quality gate G03: NOT EVALUATED.**

- [ ] W03-T01 đạt tiêu chí và TC-03-01 có bằng chứng.
- [ ] W03-T02 đạt tiêu chí và TC-03-02 có bằng chứng.
- [ ] W03-T03 đạt tiêu chí và TC-03-03 có bằng chứng.
- [ ] W03-T04 đạt tiêu chí và TC-03-04 có bằng chứng.
- [ ] Tiên quyết đã đóng; phần chuẩn bị song song tách khỏi write bị chặn; không còn P0.
- [ ] Artifact/input/expected/actual/log hoặc biên bản/version đầy đủ, không nhầm schema có sẵn với runtime đã nghiệm thu.
- [ ] Báo cáo GVHD theo kết quả thật; trạng thái gửi/duyệt có biên nhận nếu ghi đã thực hiện.

**Hiện vật bắt buộc:** ERD và data dictionary; Runbook; Tool contracts; Protocol v1; TC-03-01…04 và lỗi/quyết định chưa đóng. Đây là đầu ra tương lai; phiên này không tạo thêm ngoài 12 Markdown.

**Quy tắc gate:** PASS khi mọi tiêu chí áp dụng đạt và bằng chứng đủ; CONDITIONAL chỉ với P1 không chặn tuần sau, có owner/hạn; FAIL khi vi phạm quyền/invariant/bảo toàn hoặc test bắt buộc không đạt. Chưa chạy/thiếu chứng cứ giữ NOT EVALUATED. Không báo hoàn tất từ checklist.

**Blocker còn lại:** chưa xác nhận SQL chuẩn 27/16, quy tắc/SRS, DB thực, GVHD/lịch và rehearsal migration/restore; chi tiết mục 3–6. Kế hoạch cũ không chứng minh gate đã qua.

## 8. Báo cáo gửi giảng viên

Mẫu điền tuần 03 (19/10–24/10/2026), theo cấu trúc được cung cấp vì chưa tìm thấy bao-cao-tuan.docx. Không điền kết quả kỳ vọng thành thành tích.

| Nội dung | Thông tin cần điền |
|---|---|
| Công việc đã hoàn thành | Chưa xác minh task hoàn tất; điền ID/phần việc thật/ngày/source, nền tảng mục 2 không thay nghiệm thu |
| Kỹ thuật trọng tâm | Thiết kế DB và Agent; ghi phần tái dùng TLCN và thay đổi đã làm |
| Kết quả đạt được | Chỉ output/test đo thật, commit/fixture/log/biên bản; hiện UNKNOWN |
| Khó khăn và hạn chế | Blocker mục 6–7, ảnh hưởng/owner/giờ còn lại theo ID |
| Kế hoạch tuần tiếp theo | Đối chiếu [tuần 04](WEEK_04.md) sau G03; giữ ID tồn, chỉ chuẩn bị phần không bị chặn |
| Nội dung xin ý kiến GVHD | Phạm vi/SRS, SQL chuẩn 27/16, quy tắc, lịch trường và phương án phục hồi tiến độ |
| Trạng thái nộp và duyệt | UNKNOWN — chưa có biên nhận; điền ngày/người nhận hoặc duyệt/link bằng chứng/điều kiện thực |

**Cập nhật tiến độ:** ghi ID kế hoạch/thực tế/phần còn lại/bằng chứng/quyết định dời lịch. Task chỉ VERIFIED khi toàn bộ tiêu chí có chứng cứ; test definition/hiện vật chỉ xác nhận nhận định hẹp.
