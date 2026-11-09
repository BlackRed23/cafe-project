# Current reverification — 05/11/2026 (Asia/Saigon)

Applied migration status is UNKNOWN pending target metadata/checksum inspection. Two historical Prisma migrations and six standalone scripts do not prove migrations are pending. MG findings below describe conditional script hazards; they do not establish current database state. Do not run precheck/verify (they write), expand, backfill, contract or rollback in this audit.

See [DATABASE_REVERIFICATION.md](DATABASE_REVERIFICATION.md) for current evidence, scope, migration hashes, unresolved live checks and readiness calculation. This update supersedes conflicting assumptions in the historical 03/11/2026 audit below. The user confirms an existing 27-table database; that confirmation is distinct from independently verified PostgreSQL evidence. No database query or object change has been performed.

---

# Audit an toàn migration và khôi phục

03/11/2026. **NO-GO thực thi bộ SQL hiện tại.** Chỉ đọc, không chạy bất kỳ SQL nào. Tiền tố `M = packages/database/prisma/migration_27_tables/`; `I = packages/database/prisma/schema/migrations/20260718025427_init_schema_and_unique_keys/migration.sql`.

## Kiểm kê mọi migration

| Script | Nhận định tĩnh / trạng thái |
|---|---|
| I | VERIFIED: CREATE 15 bảng/6 ENUM, indexes/FK; source assumption của precheck. Áp dụng thực UNKNOWN |
| `.../20260724120000_add_product_detail_fields/migration.sql:1–7` | VERIFIED: thêm 6 cột Product, không idempotent khi chạy trực tiếp lần hai; cần registry Prisma, không replay mù |
| M/00_precheck.sql | PARTIAL: ON_ERROR_STOP, BEGIN/COMMIT, version≥12, tồn tại 15 bảng và 3 orphan checks; không xác nhận schema fingerprint/DDL/source isolation. Tạo schema và 4 bảng baseline bền vững, TRUNCATE/INSERT; không phải bảng TEMP |
| M/01_expand.sql | PARTIAL: BEGIN/COMMIT, 16 bảng/10 ENUM mới; thêm cột, còn ALTER TYPE/precision. Không hoàn toàn “không sửa cấu trúc cũ”. Drift DB02–DB08 và RAISE ngoài block |
| M/02_migrate_data.sql | PARTIAL: transaction, chuyển category/product/order/payment/Agent và backlog; chưa migrate tồn/nguyên liệu/lô/nhà cung cấp; lỗi RAISE và bảo toàn unit |
| M/03_verify.sql | PARTIAL: transaction, ghi verification_results; có lỗi tham chiếu tên cột; chưa đối soát đích hoặc thanh toán đầy đủ |
| M/04_contract_DO_NOT_RUN_YET.sql | VERIFIED: safety lock true ngăn chạy mặc định (:14–21), yêu cầu written approval/maintenance ở comment (:3–8). Sau mở khóa, kiểm FAIL chưa đủ, DROP COLUMN/TABLE CASCADE có nguy cơ mất dữ liệu |
| M/05_rollback_plan.sql | PARTIAL: có cảnh báo mất writes sau backup, kịch bản 1 là DELETE/UPDATE thực thi không có safety lock; kịch bản 2 chỉ comment, không phải restore đầy đủ |

## Phát hiện có bằng chứng

| ID | Trạng thái / mức độ | Phát hiện, hệ quả và điều kiện sửa ở đợt riêng |
|---|---|---|
| MG01 | VERIFIED / HIGH | RAISE NOTICE ở SQL top-level: M/01:585; M/02:35,52,99,122,214,242; M/04:66; M/05:74. Đây là cú pháp PL/pgSQL đặt ngoài DO/function. M/02 lỗi đầu nằm trước COMMIT nên transaction không hoàn tất; M/01,04,05 có NOTICE lỗi **sau COMMIT**, có thể đã ghi/đã xóa dù client báo lỗi. Không xem ON_ERROR_STOP là rollback toàn bộ các pha đã commit. Chưa chạy parser/PostgreSQL trong audit |
| MG02 | VERIFIED / HIGH | M/03:84,105 dùng diff_qty/diff_res/diff_amount/diff_count trong FILTER nhưng FROM chỉ có baseline b và subquery curr (qty/res hoặc amount/count). Những tên diff chỉ là key JSON, không phải cột được định nghĩa. Verify sẽ không hoàn tất theo schema tự tạo này; cần biểu thức diff/subquery rõ ràng và fixture fail thật |
| MG03 | VERIFIED / MEDIUM | M/03:4 ghi “Chỉ đọc” nhưng :12–23 CREATE/TRUNCATE/INSERT rồi :191 COMMIT. M/00:5 nói tạo bảng tạm, thực tế :53–64 tạo schema/bảng thường, :90/108/126 TRUNCATE. Không được chạy trong audit chỉ đọc. Chạy lại 00 làm mất baseline trước đó; chạy lại 03 thay thế kết quả cũ, cần run ID/retention |
| MG04 | VERIFIED / HIGH | M/01:102 default ly khiến M/02:50 WHERE servingUnit IS NULL bỏ sót unit cũ. M/02:107–120 mặc định cost=0 và grossProfit=price*quantity−0, không phân biệt COGS unknown với zero dù comment :122 tuyên bố không tính khống. Agent migration :154–168 suy WAITING_APPROVAL cho unknown và token/cost=0; :173–212 tạo tool call tổng hợp không có trace thật. Phải giữ provenance/unknown và mapping nghiệp vụ được duyệt |
| MG05 | VERIFIED / CRITICAL về an toàn dữ liệu | M/02:220–238 chỉ ghi Inventory chưa mapping; không chuyển Ingredient/Batch/SupplierIngredient hoặc ledger cũ. M/04:41–62 xóa unit/product links và 4 bảng legacy. Nếu mở khóa trước mapping/đối soát, có nguy cơ mất tồn/lô/NCC/log. Gate phải chặn unresolved mapping và dependencies legacy; khóa mặc định hiện có không đủ để phê duyệt thực thi |
| MG06 | VERIFIED / HIGH | M/03:187–189 ghi CHK_06–08 NOT_EXECUTED; M/04:30–35 chỉ đếm FAIL, không kiểm đủ danh sách, PASS, freshness/run ID hoặc bảng kết quả rỗng. Sau mở khóa có thể contract dù chưa chạy test quan trọng. Cần required checks theo từng gate; deferred live checks vẫn phải chặn contract, không bắt chúng hoàn tất để bắt đầu isolated expand rehearsal |
| MG07 | VERIFIED / CRITICAL về an toàn dữ liệu | M/05:29–72 là transaction xóa toàn bộ dữ liệu mới và reset toàn bộ Order/Item/Payment, không WHERE migration run/ID, không phân biệt post-backup writes. Có thể mất dữ liệu hợp lệ sau cutover. FK OrderItem.recipeId có thể chặn DELETE Recipe trước khi :53 reset recipeId; reference từ PR items/ledger cũng chưa gỡ. Cần restore giới hạn/provenance và thứ tự FK đã thử, không chạy file vì tên là plan |
| MG08 | PARTIAL / HIGH | M/05:12–19 thừa nhận restore backup mất writes, nhưng không có pg_dump command/procedure, artifact hash/retention/encryption, target restore, role/version/extensions, RPO/RTO, quiesce/delta replay/PITR hay xử lý cutover. Baseline count không phải backup. Phần expand rollback :83–147 là comment, không hoàn nguyên precision/enum/constraint đầy đủ; không có phục hồi schema legacy sau contract |
| MG09 | UNKNOWN / HIGH | Isolation chưa có bằng chứng được xác nhận. M/00 chỉ version/table/orphan, không kiểm endpoint/database/role nguồn, production denylist hoặc permission. Transaction từng file không tạo consistent snapshot qua mọi pha; writes giữa baseline/backfill/verify vẫn có thể làm sai số. Maintenance chỉ là comment M/04:8, không kiểm soát kỹ thuật |
| MG10 | PARTIAL / MEDIUM | IF NOT EXISTS/duplicate_object bỏ qua object cùng tên sai definition. M/02 có ON CONFLICT cho Agent và NOT EXISTS backlog nhưng không unique(source_table,source_id) nên chưa chống race; Category :29–33 ép mọi kind khác PRODUCT về PRODUCT khi chạy lại, có thể ghi đè danh mục mới. Payment ranking :67–71 không tie-break ID khi timestamp bằng nhau. Chưa có registry/checksum/phase state và chính sách retry sau commit nhưng NOTICE lỗi |

## Verify đang kiểm gì và bỏ gì

M/03:23–76 đếm 15 bảng nguồn, :94–97 vẫn cộng Inventory legacy theo unit; **không chứng minh tồn đích Ingredient và từng lô được bảo toàn**. FULL OUTER JOIN :92–97/:114–119 dùng baseline bên trái để dựng JSON; phải xử lý group mới và NULL rõ ràng sau sửa alias. :123–138 so tổng Agent counts không phân biệt execution mới với migrated IDs. :149–179 chỉ kiểm bốn loại orphan, không toàn bộ FK. Baseline_payment_summary tạo bởi 00:118–134 nhưng 03 không có đối soát tổng Payment tương ứng. Chưa có checksum/so từng ID, mapping reservation/quantity/cost/unit hoặc schema diff 27/16.

Không có VERIFIED PASS/FAIL từ chạy SQL. Những lỗi ở đây là bằng chứng tĩnh, không phải log migration đã thất bại.

## Điều kiện mở rehearsal và hạn chế rollback

1. Chốt authoritative SQL/version/approval, source fingerprint, mapping và các drift trong DATABASE_AUDIT.
2. Ở đợt triển khai riêng, sửa ứng viên/verify/gate và viết runbook đầy đủ; mỗi pha ghi trạng thái trước/sau commit, checksum và cách retry. Dùng psql đúng vì có meta-command `\set`; không giả định chạy được nguyên tệp qua Prisma raw query.
3. Xác nhận DB isolated với role riêng, không credential production, snapshot/fixture đã che thông tin, ngăn mạng ngoài; xác nhận PostgreSQL thực tế và client tương thích. Enum additions trong transaction, lock/ALTER TYPE, precision và mọi DDL phải được diễn tập đúng version, không duyệt chỉ từ đọc.
4. Có backup thực sự và phương pháp restore, xử lý writes sau snapshot, định nghĩa RPO/RTO và người quyết định restore/forward fix. Chứng minh trên bản sao cả lỗi giữa pha và lỗi sau COMMIT.
5. Chạy expand/backfill/verify/restore có kiểm soát sau mở gate riêng, so ID/count/checksum/tiền/tồn từng unit và lô/reservation/FK. Chỉ tuyên bố migration VERIFIED khi có kết quả này.
6. Contract vẫn khóa tới khi legacy readers/writers biến mất và required live gates đạt; không gộp contract vào lần rehearsal đầu mặc định. Sau contract không có rollback tương đương “xóa bảng mới”; cần restore/forward recovery đã chứng minh.
