# Tuần 08 — Registry và Tool Calling

## Thông tin tuần

- Ngày baseline: 23/11–28/11/2026, chưa là lịch trường đã duyệt.
- Mục tiêu: Registry và Tool Calling.
- Trạng thái PROPOSED; hiện vật liên quan PARTIAL theo [baseline](../PROJECT_BASELINE.md), chưa có chứng cứ nghiệm thu tuần.
- Chủ trì: UNASSIGNED. Công sức là ước lượng, chưa xác nhận năng lực nhóm.
- Tiền nhiệm: W07-T04; xem [phụ thuộc](../DEPENDENCIES.md).
- Rủi ro/chặn: U01–U10, R01–R10. Giảm thiểu: đóng drift P0 trước, dùng DB bản sao, giữ contract khóa, mock có nhãn, không retry write uncertain.
- Nội dung triển khai bên dưới là công việc tương lai; phiên lập kế hoạch không thực thi.

## W08-T01 — Registry/schema

| Trường | Nội dung |
|---|---|
| Task ID | W08-T01 |
| Tên tác vụ | Registry/schema |
| Mục đích | Registry/schema để hoàn thành mục tiêu tuần với bằng chứng kiểm tra được |
| Đầu vào | Thiết kế W03, kết quả gate tiền nhiệm, source theo baseline; gemini.service.ts, agent.service.ts, agent.repository.ts và system.prisma; xem đường dẫn trong PROJECT_BASELINE.md |
| Hoạt động | 1. Xác nhận đầu vào/môi trường. 2. Bọc service đọc kho/NCC/doanh số và nháp PR, gắn quyền. 3. Đối chiếu tiêu chí và lưu lỗi/bằng chứng |
| Đầu ra | Registry có version |
| Phụ thuộc | W07-T04 |
| Ưu tiên | P0 |
| Ước lượng | 8 giờ người, chưa cam kết |
| Tiêu chí chấp nhận | Tool lạ/sai schema bị chặn trước service; validate output |
| Bằng chứng | Hiện vật có version, biên bản/log TC-08-01, commit/môi trường/input/expected/actual; hiện chưa có kết quả |
| Trạng thái | PROPOSED |
| Người phụ trách | UNASSIGNED |

## W08-T02 — Gemini Function Calling

| Trường | Nội dung |
|---|---|
| Task ID | W08-T02 |
| Tên tác vụ | Gemini Function Calling |
| Mục đích | Gemini Function Calling để hoàn thành mục tiêu tuần với bằng chứng kiểm tra được |
| Đầu vào | Thiết kế W03, kết quả gate tiền nhiệm, source theo baseline; gemini.service.ts, agent.service.ts, agent.repository.ts và system.prisma; xem đường dẫn trong PROJECT_BASELINE.md |
| Hoạt động | 1. Xác nhận đầu vào/môi trường. 2. Tái dùng integration, xác minh SDK/model khi được phép; giới hạn loop. 3. Đối chiếu tiêu chí và lưu lỗi/bằng chứng |
| Đầu ra | Adapter và mock |
| Phụ thuộc | W08-T01 |
| Ưu tiên | P0 |
| Ước lượng | 8 giờ người, chưa cam kết |
| Tiêu chí chấp nhận | Golden prompt chọn tool theo nhãn, không dispatch hàm tùy ý |
| Bằng chứng | Hiện vật có version, biên bản/log TC-08-02, commit/môi trường/input/expected/actual; hiện chưa có kết quả |
| Trạng thái | PROPOSED |
| Người phụ trách | UNASSIGNED |

## W08-T03 — HITL server

| Trường | Nội dung |
|---|---|
| Task ID | W08-T03 |
| Tên tác vụ | HITL server |
| Mục đích | HITL server để hoàn thành mục tiêu tuần với bằng chứng kiểm tra được |
| Đầu vào | Thiết kế W03, kết quả gate tiền nhiệm, source theo baseline; gemini.service.ts, agent.service.ts, agent.repository.ts và system.prisma; xem đường dẫn trong PROJECT_BASELINE.md |
| Hoạt động | 1. Xác nhận đầu vào/môi trường. 2. Principal, approval gắn hash/version và tái kiểm write. 3. Đối chiếu tiêu chí và lưu lỗi/bằng chứng |
| Đầu ra | Duyệt có audit |
| Phụ thuộc | W08-T02 |
| Ưu tiên | P0 |
| Ước lượng | 8 giờ người, chưa cam kết |
| Tiêu chí chấp nhận | Approval stale/sai actor không ghi; system scan đọc |
| Bằng chứng | Hiện vật có version, biên bản/log TC-08-03, commit/môi trường/input/expected/actual; hiện chưa có kết quả |
| Trạng thái | PROPOSED |
| Người phụ trách | UNASSIGNED |

## W08-T04 — Đánh giá tool

| Trường | Nội dung |
|---|---|
| Task ID | W08-T04 |
| Tên tác vụ | Đánh giá tool |
| Mục đích | Đánh giá tool để hoàn thành mục tiêu tuần với bằng chứng kiểm tra được |
| Đầu vào | Thiết kế W03, kết quả gate tiền nhiệm, source theo baseline; gemini.service.ts, agent.service.ts, agent.repository.ts và system.prisma; xem đường dẫn trong PROJECT_BASELINE.md |
| Hoạt động | 1. Xác nhận đầu vào/môi trường. 2. Fixture prompt injection, JSON lỗi, số vô hạn. 3. Đối chiếu tiêu chí và lưu lỗi/bằng chứng |
| Đầu ra | Raw tool traces |
| Phụ thuộc | W08-T03 |
| Ưu tiên | P1 |
| Ước lượng | 6 giờ người, chưa cam kết |
| Tiêu chí chấp nhận | Có numerator/denominator, không tuyên bố cải thiện sớm |
| Bằng chứng | Hiện vật có version, biên bản/log TC-08-04, commit/môi trường/input/expected/actual; hiện chưa có kết quả |
| Trạng thái | PROPOSED |
| Người phụ trách | UNASSIGNED |

## Phạm vi kỹ thuật

| Lĩnh vực | Công việc |
|---|---|
| Database | Tái dùng schema Agent |
| Backend | Service adapters và schema I/O |
| Frontend | Duyệt payload tool write |
| AI Agent | Registry/Gemini function calls |
| Bảo mật | Principal/allowlist/injection |
| Tích hợp | Model→tool→service |
| Tài liệu | Tool contracts |

## Kiểm thử

| Loại | Kế hoạch |
|---|---|
| Unit | Validator, tính toán và chuyển trạng thái thuộc tác vụ 01; không mirror implementation |
| Integration | DB/API/tool boundary, inject lỗi giữa write, kiểm rollback trên bản sao |
| E2E | Chuỗi nghiệp vụ tuần, input cố định; lưu trace và expected/actual |
| Nghiệp vụ | Đối chiếu tiêu chí bốn tác vụ; sai actor, thiếu tồn, sai đơn vị, hết hạn, hủy, thao tác trùng |
| AI | Tool selection, quyền, injection, timeout và recovery theo golden labels |
| Biên/âm | Empty/âm/NaN, stale state, double submit, lỗi phụ thuộc và chưa được duyệt; áp dụng theo đầu ra tuần |

TC-08-01…04 ánh xạ lần lượt bốn tác vụ, dùng tiêu chí chấp nhận làm oracle. Bằng chứng phải có version, lệnh, môi trường, input, expected/actual và log đã che dữ liệu. Mock không chứng minh PostgreSQL concurrency hay provider sandbox thật. Các tuần tài liệu dùng biên bản review thay kết quả test giả.

## Cổng tuần G08

**NOT EVALUATED**. PASS khi bốn tiêu chí tác vụ đạt, kiểm tra áp dụng đã chạy, hiện vật/biên bản đủ và không còn P0. CONDITIONAL chỉ cho P1 không chặn tuần sau, có chủ trì/hạn khắc phục. FAIL khi vi phạm quyền, invariant, bảo toàn hoặc thiết kế bắt buộc. Chưa có kết quả giữ NOT EVALUATED; không coi kế hoạch là bằng chứng triển khai.

## Mẫu báo cáo GVHD

| Mục | Nội dung điền |
|---|---|
| Kế hoạch | W08-T01…T04 |
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
