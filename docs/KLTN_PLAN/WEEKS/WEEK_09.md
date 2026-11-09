# Tuần 09 — Workflow và recovery

## Thông tin tuần

- Ngày baseline: 30/11–05/12/2026, chưa là lịch trường đã duyệt.
- Mục tiêu: Workflow và recovery.
- Trạng thái PROPOSED; hiện vật liên quan PARTIAL theo [baseline](../PROJECT_BASELINE.md), chưa có chứng cứ nghiệm thu tuần.
- Chủ trì: UNASSIGNED. Công sức là ước lượng, chưa xác nhận năng lực nhóm.
- Tiền nhiệm: W08-T04; xem [phụ thuộc](../DEPENDENCIES.md).
- Rủi ro/chặn: U01–U10, R01–R10. Giảm thiểu: đóng drift P0 trước, dùng DB bản sao, giữ contract khóa, mock có nhãn, không retry write uncertain.
- Nội dung triển khai bên dưới là công việc tương lai; phiên lập kế hoạch không thực thi.

## W09-T01 — Điều phối đa bước

| Trường | Nội dung |
|---|---|
| Task ID | W09-T01 |
| Tên tác vụ | Điều phối đa bước |
| Mục đích | Điều phối đa bước để hoàn thành mục tiêu tuần với bằng chứng kiểm tra được |
| Đầu vào | Thiết kế W03, kết quả gate tiền nhiệm, source theo baseline; gemini.service.ts, agent.service.ts, agent.repository.ts và system.prisma; xem đường dẫn trong PROJECT_BASELINE.md |
| Hoạt động | 1. Xác nhận đầu vào/môi trường. 2. Goal→đọc→NCC→đề xuất→duyệt→nháp PR, giới hạn bước. 3. Đối chiếu tiêu chí và lưu lỗi/bằng chứng |
| Đầu ra | Workflow state machine |
| Phụ thuộc | W08-T04 |
| Ưu tiên | P0 |
| Ước lượng | 8 giờ người, chưa cam kết |
| Tiêu chí chấp nhận | Lưu từng bước, stop budget, không tự duyệt/gửi NCC |
| Bằng chứng | Hiện vật có version, biên bản/log TC-09-01, commit/môi trường/input/expected/actual; hiện chưa có kết quả |
| Trạng thái | PROPOSED |
| Người phụ trách | UNASSIGNED |

## W09-T02 — Retry/idempotency

| Trường | Nội dung |
|---|---|
| Task ID | W09-T02 |
| Tên tác vụ | Retry/idempotency |
| Mục đích | Retry/idempotency để hoàn thành mục tiêu tuần với bằng chứng kiểm tra được |
| Đầu vào | Thiết kế W03, kết quả gate tiền nhiệm, source theo baseline; gemini.service.ts, agent.service.ts, agent.repository.ts và system.prisma; xem đường dẫn trong PROJECT_BASELINE.md |
| Hoạt động | 1. Xác nhận đầu vào/môi trường. 2. Read backoff hữu hạn; write uncertain tra key, không retry mù. 3. Đối chiếu tiêu chí và lưu lỗi/bằng chứng |
| Đầu ra | Recovery policy |
| Phụ thuộc | W09-T01 |
| Ưu tiên | P0 |
| Ước lượng | 8 giờ người, chưa cam kết |
| Tiêu chí chấp nhận | Hai phiên cùng key tối đa một PR; restart không lặp |
| Bằng chứng | Hiện vật có version, biên bản/log TC-09-02, commit/môi trường/input/expected/actual; hiện chưa có kết quả |
| Trạng thái | PROPOSED |
| Người phụ trách | UNASSIGNED |

## W09-T03 — Lịch sử/usage

| Trường | Nội dung |
|---|---|
| Task ID | W09-T03 |
| Tên tác vụ | Lịch sử/usage |
| Mục đích | Lịch sử/usage để hoàn thành mục tiêu tuần với bằng chứng kiểm tra được |
| Đầu vào | Thiết kế W03, kết quả gate tiền nhiệm, source theo baseline; gemini.service.ts, agent.service.ts, agent.repository.ts và system.prisma; xem đường dẫn trong PROJECT_BASELINE.md |
| Hoạt động | 1. Xác nhận đầu vào/môi trường. 2. Execution/ToolCall/Evaluation, actor/correlation/token/latency/redaction. 3. Đối chiếu tiêu chí và lưu lỗi/bằng chứng |
| Đầu ra | Audit UI/log |
| Phụ thuộc | W09-T02 |
| Ưu tiên | P0 |
| Ước lượng | 8 giờ người, chưa cam kết |
| Tiêu chí chấp nhận | Thiếu usage ghi unknown, không 0 giả; truy được approval |
| Bằng chứng | Hiện vật có version, biên bản/log TC-09-03, commit/môi trường/input/expected/actual; hiện chưa có kết quả |
| Trạng thái | PROPOSED |
| Người phụ trách | UNASSIGNED |

## W09-T04 — Fault/security test

| Trường | Nội dung |
|---|---|
| Task ID | W09-T04 |
| Tên tác vụ | Fault/security test |
| Mục đích | Fault/security test để hoàn thành mục tiêu tuần với bằng chứng kiểm tra được |
| Đầu vào | Thiết kế W03, kết quả gate tiền nhiệm, source theo baseline; gemini.service.ts, agent.service.ts, agent.repository.ts và system.prisma; xem đường dẫn trong PROJECT_BASELINE.md |
| Hoạt động | 1. Xác nhận đầu vào/môi trường. 2. Provider down, từ chối duyệt, tool lỗi, restart, injection. 3. Đối chiếu tiêu chí và lưu lỗi/bằng chứng |
| Đầu ra | Báo cáo phục hồi |
| Phụ thuộc | W09-T03 |
| Ưu tiên | P1 |
| Ước lượng | 6 giờ người, chưa cam kết |
| Tiêu chí chấp nhận | Không write vượt quyền, không mất trạng thái uncertain |
| Bằng chứng | Hiện vật có version, biên bản/log TC-09-04, commit/môi trường/input/expected/actual; hiện chưa có kết quả |
| Trạng thái | PROPOSED |
| Người phụ trách | UNASSIGNED |

## Phạm vi kỹ thuật

| Lĩnh vực | Công việc |
|---|---|
| Database | Execution/ToolCall history |
| Backend | Recovery/key nguyên tử |
| Frontend | Lịch sử và uncertain |
| AI Agent | Planner nhiều bước hữu hạn |
| Bảo mật | Approval version và recheck |
| Tích hợp | Restart/resume/faults |
| Tài liệu | Recovery policy |

## Kiểm thử

| Loại | Kế hoạch |
|---|---|
| Unit | Validator, tính toán và chuyển trạng thái thuộc tác vụ 01; không mirror implementation |
| Integration | DB/API/tool boundary, inject lỗi giữa write, kiểm rollback trên bản sao |
| E2E | Chuỗi nghiệp vụ tuần, input cố định; lưu trace và expected/actual |
| Nghiệp vụ | Đối chiếu tiêu chí bốn tác vụ; sai actor, thiếu tồn, sai đơn vị, hết hạn, hủy, thao tác trùng |
| AI | Tool selection, quyền, injection, timeout và recovery theo golden labels |
| Biên/âm | Empty/âm/NaN, stale state, double submit, lỗi phụ thuộc và chưa được duyệt; áp dụng theo đầu ra tuần |

TC-09-01…04 ánh xạ lần lượt bốn tác vụ, dùng tiêu chí chấp nhận làm oracle. Bằng chứng phải có version, lệnh, môi trường, input, expected/actual và log đã che dữ liệu. Mock không chứng minh PostgreSQL concurrency hay provider sandbox thật. Các tuần tài liệu dùng biên bản review thay kết quả test giả.

## Cổng tuần G09

**NOT EVALUATED**. PASS khi bốn tiêu chí tác vụ đạt, kiểm tra áp dụng đã chạy, hiện vật/biên bản đủ và không còn P0. CONDITIONAL chỉ cho P1 không chặn tuần sau, có chủ trì/hạn khắc phục. FAIL khi vi phạm quyền, invariant, bảo toàn hoặc thiết kế bắt buộc. Chưa có kết quả giữ NOT EVALUATED; không coi kế hoạch là bằng chứng triển khai.

## Mẫu báo cáo GVHD

| Mục | Nội dung điền |
|---|---|
| Kế hoạch | W09-T01…T04 |
| Đã hoàn thành | Chưa xác minh; điền ID/kết quả thật |
| Bằng chứng | Tệp, commit, log, ngày kiểm tra |
| Khó khăn | … |
| Tồn đọng | … |
| Tuần tiếp theo | ID, công sức và gate phụ thuộc |
| Câu hỏi GVHD | Phạm vi/thiết kế/dữ liệu/lịch cần xác nhận |
| Tình trạng gửi | UNKNOWN; điền ngày/biên nhận |
| Phê duyệt | UNKNOWN; điền người/ngày/điều kiện |


## Nguồn truy cập độc lập

- [Baseline và chỉ mục nguồn](../PROJECT_BASELINE.md).
- [Schema Prisma](../../../packages/database/prisma/schema/).
- [SQL chuyển đổi — chỉ tham chiếu](../../../packages/database/prisma/migration_27_tables/).
- [Backend modules](../../../apps/api/src/modules/).
- [Agent services](../../../apps/agent/src/services/).
- [Test API](../../../apps/api/tests/) và [test Agent](../../../apps/agent/tests/).
- [Tiêu chí và protocol](../ACCEPTANCE_CRITERIA.md), [rủi ro](../RISK_REGISTER.md).
