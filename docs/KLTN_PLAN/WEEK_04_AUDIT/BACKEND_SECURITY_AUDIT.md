# Current reverification — 05/11/2026 (Asia/Saigon)

Reverified static incompatibilities: Payment.orderId unique lookup/PaymentStatus versus Prisma ordinary index/TransactionStatus; Product.unit and ledger product/user/userId versus servingUnit/performedBy. API/Agent still use all four legacy models. Correct integration of all 27 intended tables is NOT VERIFIED; deployed PostgreSQL compatibility and generated client runtime remain UNKNOWN. SEC blockers remain unchanged.

See [DATABASE_REVERIFICATION.md](DATABASE_REVERIFICATION.md) for current evidence, scope, migration hashes, unresolved live checks and readiness calculation. This update supersedes conflicting assumptions in the historical 03/11/2026 audit below. The user confirms an existing 27-table database; that confirmation is distinct from independently verified PostgreSQL evidence. No database query or object change has been performed.

---

# Audit backend và bảo mật tuần 04

03/11/2026. Chỉ phân tích tĩnh, không khai thác, không gọi HTTP/DB/LLM. VERIFIED mô tả mã, không xác nhận triển khai thực. Tiền tố `A = apps/api/src/`; `G = apps/agent/src/`; `S = packages/database/prisma/schema/`.

## Khả năng tái dùng

| ID | Trạng thái | Thành phần, bằng chứng và giới hạn |
|---|---|---|
| BE01 | PARTIAL | `A/modules/inventory/inventory.repository.ts:118–170,173–226`: transaction, row lock aggregate, kiểm lô thuộc kho, update có điều kiện, ledger cùng transaction, từ chối lô hết hạn khi adjust. Có thể tái dùng mẫu kiểm soát; persistence vẫn Inventory/InventoryBatch integer, không phải Ingredient Decimal |
| BE02 | PARTIAL | `A/modules/inventory/inventory.service.ts:312–356`: kiểm supplier-product và conversionTargetUnit, Math.ceil conversion. `inventory.validator.ts:5–46`: Zod int/positive, note max, date nonempty; repository kiểm date parse. Chưa có unit engine Decimal g/ml/base unit, không dùng rounding số nguyên cho nguyên liệu mà chưa có BR |
| BE03 | MISSING | Không tìm module/service/route chuyên biệt ingredient, recipe, stock-count, goods-receipt trong danh mục `A/modules`. Prisma có model nhưng không chứng minh API/engine. Cần adapter từ nghiệp vụ mới vào transaction pattern hiện hữu, tránh xây thêm luồng kho song song không thống nhất |
| BE04 | VERIFIED drift / UNKNOWN build | `inventory.repository.ts:38–47,59–60,149–157` dùng ledger.product/user/userId và Product.unit; `S/inventory.prisma:91–113` không còn relations/cột đó như API mong đợi, `S/product.prisma:7–40` dùng servingUnit. `payment.repository.ts:11–24` dùng unique orderId/PaymentStatus trong khi `S/order.prisma:114–137` dùng index orderId/TransactionStatus. Generated client đang chạy UNKNOWN; không chạy build hay generate |

RBAC hiện hữu `A/modules/inventory/inventory.route.ts:10–20`: ADMIN/STAFF đọc, ADMIN ghi; Zod validateBody tại `A/common/validate.ts:5–15`. Public register bị giới hạn CUSTOMER tại `auth.validation.ts:13` và service `auth.service.ts:158–159`; không báo lại lỗ hổng đăng ký ADMIN đã được chặn trong mã. Order/payment có ownership checks (`order.service.ts:61,148–152`; `payment.service.ts:31–34`); batch adjust kiểm cả batchId+inventoryId (`inventory.repository.ts:182–183`). Chưa thấy IDOR trong các đường đã đọc; phạm vi khác UNKNOWN.

Agent có `G/internal-auth.ts:5–24`: secret shape check, timingSafeEqual, query principal/role/isActive; không suy kiểm soát này đã áp dụng cho middleware API thông thường. Không cần nhân bản toàn bộ auth; cần thống nhất policy và tái dùng quyết định quyền tại boundary thích hợp.

## Findings bảo mật

| ID | Mức độ / trạng thái | Bằng chứng, tác động, điều kiện xử lý |
|---|---|---|
| SEC01 | HIGH / VERIFIED | `A/modules/auth/auth.middleware.ts:21–52` chỉ verify JWT/role claim; `auth.service.ts:307–323` không query trạng thái/role hiện hành. `getCurrentUser:293–305` có check active nhưng inventory routes không gọi hàm này. ADMIN cũ bị khóa/hạ quyền vẫn có thể đi qua middleware ghi kho bằng token chưa hết hạn; runtime chưa thử. Default expiry 7d tại `A/common/env.ts:26`, cấu hình thật UNKNOWN. Cần revoke/version hoặc kiểm principal hiện hành và test deny/zero writes |
| SEC02 | HIGH / PARTIAL | `SEED_LOG.md:6,38,122–123,152,252,331,395,459,559,662,765,868` chứa URI dạng user:password@host (phát hiện bằng pattern, không chép giá trị). Đây là credential material trong log; hiệu lực, quyền và việc revoke UNKNOWN. `docker-compose.yml:24,42`, `apps/api/.env.example:2` cũng có URI credential-shaped, có thể là mẫu/local, không kết luận secret production. Cần chủ dự án kiểm tra/revoke khi cần, redact và rà lịch sử ở đợt riêng. Không dùng credential để thử kết nối |
| SEC03 | HIGH / VERIFIED rủi ro tĩnh | `A/modules/purchase/purchase.repository.ts:83–122` kiểm remaining bằng request.items snapshot từ ngoài transaction, rồi increment không compare-and-set. Hai lần nhận đồng thời hoặc cùng purchaseRequestItemId lặp trong payload có thể vượt remaining. `purchase.validator.ts:29–53` không unique item ID; không thấy GoodsReceipt/idempotency được sử dụng ở đây. Cần ID uniqueness, fresh read/lock/CAS, key nhận hàng và test PostgreSQL race trước tái dùng |
| SEC04 | HIGH / PARTIAL | `G/repositories/agent.repository.ts:231–257,280–303` check active PR bằng findFirst rồi create trong transaction, không có uniqueness theo business key hoặc isolation/lock thể hiện tại đường đó. Hai request có thể cùng thấy chưa có PR. Unique requestNumber không đồng nghĩa unique operation. Chưa quan sát duplicate runtime; cần key/lock/serializable có retry kiểm soát và tests |
| SEC05 | MEDIUM / VERIFIED | `A/modules/inventory/inventory.service.ts:215–217` GET list gọi createMissingForActiveProducts; repository :50–80 createMany inventory. STAFF được đọc nhưng GET có thể tạo dữ liệu. Không coi smoke GET là read-only; cần chuyển write sang thao tác được cấp quyền hoặc phê duyệt rõ side effect |
| SEC06 | MEDIUM / VERIFIED | `A/modules/inventory/inventory.service.ts:362–388,431–458` gọi Agent sau write; `A/modules/order/order.repository.ts:226–235` gọi scan trong callback transaction trước commit. External side effect có thể xảy ra khi transaction chưa commit/rollback sau đó. Cần after-commit/outbox/idempotency và mock failure tests. Audit không gọi các đường này |
| SEC07 | MEDIUM / VERIFIED | `G/services/gemini.service.ts:31–38` ép Number và đính raw provider response vào Error khi parse lỗi; chưa đảm bảo finite/range/supplier hợp lệ ở điểm parse. `A/common/error-handler.ts:61–65` trả stack ở development, log raw error; :40–52 trả hướng dẫn DB nội bộ. Khả năng lộ nội dung phụ thuộc deploy/log pipeline UNKNOWN. Cần validation schema/redaction và test output; không gọi provider |
| SEC08 | LOW / PARTIAL | `A/modules/auth/auth.routes.ts:16–17`, `auth.controller.ts:65–91` profile/change-password không dùng validateBody như register; controller chỉ kiểm một phần. Repository profile dùng allowlist name/phone (`auth.repository.ts`, updateProfile), chưa thấy mass assignment role. Cần schema type/length/password policy; không suy đây là privilege escalation |

SQL injection: tại `inventory.repository.ts:126,179,192–197` dùng tagged template tham số hóa; không tìm `$queryRawUnsafe`/`$executeRawUnsafe` trong apps/packages TypeScript. **VERIFIED phạm vi quét**, không bảo đảm toàn bộ hệ thống không injection. Chưa có kiểm thử fuzz/exploit, không thực hiện audit runtime.

Race kho: row lock/CAS ở inventory là kiểm soát hữu ích, test hiện có dùng mock, chưa chứng minh PostgreSQL locking/deadlock/rollback thật. Import batchCode :129–131 từ chối trùng trong kho dưới lock nhưng batchCode mặc định Date.now không phải idempotency của request; retry không có cùng key vẫn có thể nhận thêm lần nữa. Tính idempotent toàn luồng **PARTIAL**.

## CRITICAL và ranh giới gate

CRITICAL an toàn DB được ghi tại MIGRATION_SAFETY_AUDIT MG05/MG07: contract có nguy cơ xóa nguồn chưa mapping, rollback DELETE rộng có thể mất writes mới. Đó là nguy cơ vận hành có lệnh cụ thể, không phải chứng cứ khai thác từ mạng. Không có lỗ hổng HTTP CRITICAL đã xác minh trong phạm vi đọc. Chưa thể kết luận môi trường an toàn khi credential còn hiệu lực UNKNOWN, API revoke còn hở và migration dữ liệu chưa kiểm soát.

SEC01/02/03 phải có quyết định và kiểm soát trước đường triển khai có liên quan; SEC04/06 trước tích hợp Agent/live write; các vấn đề ngoài phạm vi lát cắt có thể được hoãn bằng quyết định có owner và acceptance, không dùng hoãn để hợp thức hóa contract. Không sửa nguồn hoặc credential trong audit này.
