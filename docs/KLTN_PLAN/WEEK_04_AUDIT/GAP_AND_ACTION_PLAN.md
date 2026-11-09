# Current reverification — 05/11/2026 (Asia/Saigon)

The next action is now target/role confirmation followed by read-only inspection of the existing database, not migration implementation. W04-T02 completion/applied history is UNKNOWN, not presumed unapplied. Compare actual names, ENUM labels, columns, constraints, indexes and legacy presence before deciding whether any change is needed. Keep security and backup/restore blockers; no implementation or database writes are authorized in this task.

See [DATABASE_REVERIFICATION.md](DATABASE_REVERIFICATION.md) for current evidence, scope, migration hashes, unresolved live checks and readiness calculation. This update supersedes conflicting assumptions in the historical 03/11/2026 audit below. The user confirms an existing 27-table database; that confirmation is distinct from independently verified PostgreSQL evidence. No database query or object change has been performed.

---

# Phân tích thiếu hụt và bước xử lý tuần 04

03/11/2026. Đây là kế hoạch tháo blocker, **không phải triển khai và không tự cho phép chạy migration**. Owner thực tế UNASSIGNED, hạn xử lý chưa xác nhận. Không tự giả phê duyệt của GVHD/chủ dự án.

## W04-T01 Design Review

- **Trạng thái: READY_WITH_CONDITIONS (CONDITIONAL)** cho khởi động review tài liệu; chưa đủ điều kiện nghiệm thu design.
- Tiên quyết: W03-T01…04 và SRS/BR/DB/API/Agent decisions theo `docs/KLTN_PLAN/WEEK_04.md`, mục W04-T01. W03 mục 7 vẫn NOT EVALUATED.
- Có VERIFIED: WEEK_04 Markdown và Word; schema chuyển tiếp; lịch sử TLCN và 6 SQL ứng viên; traceability. Nguồn: READINESS_REPORT bảng nguồn, DATABASE_AUDIT DB01.
- Thiếu MISSING: authoritative SQL đã duyệt, SRS/BR được duyệt, ADR drift, feedback/biên bản GVHD, nghiệm thu W03.
- Rủi ro/blocker: dùng 31 model làm DB 27 bảng đã chạy; tự chọn Payment/batch/cardinality; coi kế hoạch là approval (DB02–DB08).
- Bước an toàn: lập yêu cầu cung cấp SQL đúng phiên bản/checksum và approval, bảng quyết định mở cho mapping/unit/payment/legacy; review trực tiếp artifact đó khi nhận được. Không thay authoritative bằng expand hiện tại.
- Acceptance TC-04-01: biên bản có ngày/người duyệt/version, quyết định P0 đóng, SQL/Prisma/API parity có mapping, các ngoại lệ unknown có owner. T01 review có thể bắt đầu, việc ký duyệt vẫn chờ đầu vào thật.

## W04-T02 Schema Migration

- **Trạng thái: BLOCKED** độc lập, dù T01 có thể review.
- Tiên quyết: W04-T01 được nghiệm thu; SQL chuẩn/source fingerprint, DB isolated, runbook backup/restore và mapping đủ.
- Có VERIFIED: hai migration gốc; six-phase SQL; transaction/safety lock từng phần. Có PARTIAL: data transformation, unique/FK/index ứng viên.
- Thiếu: full DDL parity, baseline bất biến theo run, source→target map, safe replay registry, phiên bản PostgreSQL đích và xác nhận isolation.
- Rủi ro/blocker: DB02–08, MG01–06/MG09–10. Đặc biệt verify không hợp lệ, mapping tồn chưa làm, unsafe contract không được bỏ qua.
- Bước an toàn hiện tại: hoàn thiện danh sách yêu cầu sửa và review tĩnh; audit này dừng ở báo cáo. Đợt sửa riêng sau khi có authorization/scope: đồng bộ Prisma/SQL/API, backfill/mapping, verify fail closed, tách rõ contract deferred.
- Acceptance TC-04-02: clean replay expand/backfill từ fingerprint TLCN trên DB isolated, log từng pha/exit code và hash; diff không còn P0, source→target count/ID/checksum/unit/precision/FK đúng; không contract mặc định. Không yêu cầu rehearsal thành công từ trước để cho phép bắt đầu lần đầu khi mọi tiền kiểm khác đã đủ.

## W04-T03 Migration Verification and Restore

- **Trạng thái: BLOCKED**; tài liệu rollback tồn tại không làm task READY.
- Tiên quyết: W04-T02 ứng viên đạt chất lượng và DB cô lập đã xác nhận; quyền restore chỉ ở test target; backup artifact và quy trình delta/cutover rõ.
- Có PARTIAL: baseline count/tồn theo unit/tiền, verify table, cảnh báo post-backup writes trong `05_rollback_plan.sql:12–19`.
- Thiếu: backup command/procedure và artifact thật, restore test, full target reconciliation, RPO/RTO, post-snapshot write recovery, verification log hiện hành.
- Rủi ro/blocker: MG02, MG06–09; DELETE rộng, FK thứ tự sai, verify chỉ nguồn, commit rồi client báo lỗi.
- Bước an toàn: đặc tả fixture có đơn/thanh toán/lô/reservation/agent mới sau snapshot và fault injection theo từng pha; xác định expected ID/value phục hồi và delta replay. Chưa tạo/chạy fixture DB trong audit.
- Acceptance TC-04-03: backup có hash và restore thành công ở target isolated, so ID/count/checksum/tiền/tồn mỗi unit và mỗi lô, reservation, orphan=0; lỗi trước/sau commit và dữ liệu mới sau snapshot không mất ngoài RPO được duyệt. Log có version/timestamp/actual; không lấy mock sale restore làm DB restore proof.

## W04-T04 Ingredient API Preparation

- **Trạng thái: READY_WITH_CONDITIONS (CONDITIONAL)** chỉ với tài liệu contract, validator design, fixture/mock test plan độc lập DB; API thực và nghiệm thu full task **BLOCKED** theo phụ thuộc W04-T03 trong WEEK_04.
- Tiên quyết phần chuẩn bị: phạm vi read/write dự kiến, role matrix sơ bộ và danh sách quyết định unit. Tiên quyết tích hợp: DB gate đã đạt, contract/BR duyệt, principal active/role được kiểm lại, mock và regression phù hợp.
- Có PARTIAL: inventory transaction/lock/CAS, Zod, route RBAC, batch ownership, tests mock legacy. Nguồn BE01–BE04 và TEST_READINESS.
- Thiếu: Ingredient module/API, Decimal unit contract, lỗi/idempotency chuẩn, schema đích đã xác minh, tests role/revoke/concurrency thực.
- Rủi ro/blocker: sao chép kho cũ thành engine mới, dùng Math.ceil/int làm sai nguyên liệu, stale JWT, side effects, duplicate nhận hàng. SEC01–06; DB03/05/08.
- Bước an toàn: thiết kế adapter và phương thức tái dùng để aggregate/lô/ledger trong một transaction; mock allow/deny/validation/error cases, ghi rõ chưa chứng minh PostgreSQL. Không tạo code/test mới trong audit.
- Acceptance TC-04-04: contract/validator có version, read/write đúng role với inactive/demoted token bị deny/zero writes, Decimal/unit chính xác, IDOR bị chặn, rollback lỗi có chứng cứ DB isolated, regression legacy pass; dependency W04-T03 đóng trước tích hợp.

## Thứ tự tháo blocker và bằng chứng

| Ưu tiên / gate | Việc cần làm ở đợt phù hợp | Bằng chứng đóng | Owner cần chỉ định |
|---|---|---|---|
| P0 G01/G07 | Thu SQL chuẩn, approval SRS/BR/kiến trúc và nghiệm thu W03; chốt mục tiêu 27/16 | SQL hash/version + biên bản thật, ADR mapping/units/payment/batch | Chủ dự án + GVHD/chủ quán |
| P0 G02/G03 | Sửa ứng viên schema/SQL/API drift, syntax, verify, baseline/run ID và fail-closed gate | Diff có review, mapping đầy đủ, expected checks; chưa tự ghi PASS | DB/backend owner |
| P0 G04/G05 | Xác nhận test target/role/network; runbook backup/restore/cutover/delta; giữ contract khóa | Target identity đã che secret, isolation proof, quyền tối thiểu, backup/restore procedure và tiêu chí RPO/RTO | DB/ops owner |
| P0 G06 | Xác nhận credential đã revoke/redact khi cần, revoke quyền JWT; chống duplicate receive trước tái dùng | Metadata xử lý secret, regression deny/zero writes, race/idempotency design và kết quả ở đợt test | Security/backend owner |
| P0 mở gate rehearsal | Review lại G01–G07, cấp phạm vi rehearsal isolated cụ thể | Biên bản GO cho rehearsal, không bao gồm production hoặc contract | Người chịu trách nhiệm hệ thống |
| P0 sau gate | Chạy TC-04-02/03, tests thích hợp và restore faults/post-backup writes | Log/hash/expected-actual, tất cả required checks PASS, không NOT_EXECUTED trá hình | QA + DB owner |
| P1 chuẩn bị độc lập | Review contract/mock plan Ingredient và reuse inventory logic | TC-04-04 plan, acceptance mapping, open issues có owner | Backend + QA |
| Deferred contract | Chuyển hết legacy readers/writers, đáp ứng live gates phù hợp và explicit approval riêng | Usage inventory=0 cho legacy, data mapping 100%, fresh required PASS, maintenance/recovery proof | Backend/Agent/DB owners |

Không làm vòng phụ thuộc: chưa cần live payment/order/count xong để diễn tập expand/backfill/restore đầu tiên; nhưng NOT_EXECUTED của các kiểm tra đó không được xem là đáp ứng contract. Không dùng điểm readiness để cho phép DROP.

## Bước tiếp theo đầu tiên

**Thu và xác nhận bản SQL chuẩn 27 bảng/16 ENUM cùng biên bản duyệt/version/checksum**, đồng thời chỉ định owner để đóng các quyết định DB02–DB08. Khi chưa có, chỉ tiếp tục review tài liệu/mapping/mock plan; không triển khai Week 04, không chạy bất kỳ script SQL hiện hữu nào.
