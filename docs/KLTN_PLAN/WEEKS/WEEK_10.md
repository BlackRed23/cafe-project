# Tuần 10 — Tích hợp AI E2E

## Thông tin tuần

- Ngày baseline: 07/12–12/12/2026, chưa là lịch trường đã duyệt.
- Mục tiêu: Tích hợp AI E2E.
- Trạng thái PROPOSED; hiện vật liên quan PARTIAL theo [baseline](../PROJECT_BASELINE.md), chưa có chứng cứ nghiệm thu tuần.
- Chủ trì: UNASSIGNED. Công sức là ước lượng, chưa xác nhận năng lực nhóm.
- Tiền nhiệm: W09-T04; xem [phụ thuộc](../DEPENDENCIES.md).
- Rủi ro/chặn: U01–U10, R01–R10. Giảm thiểu: đóng drift P0 trước, dùng DB bản sao, giữ contract khóa, mock có nhãn, không retry write uncertain.
- Nội dung triển khai bên dưới là công việc tương lai; phiên lập kế hoạch không thực thi.

## W10-T01 — Nối Agent vào nguyên liệu

| Trường | Nội dung |
|---|---|
| Task ID | W10-T01 |
| Tên tác vụ | Nối Agent vào nguyên liệu |
| Mục đích | Nối Agent vào nguyên liệu để hoàn thành mục tiêu tuần với bằng chứng kiểm tra được |
| Đầu vào | Thiết kế W03, kết quả gate tiền nhiệm, source theo baseline; gemini.service.ts, agent.service.ts, agent.repository.ts và system.prisma; xem đường dẫn trong PROJECT_BASELINE.md |
| Hoạt động | 1. Xác nhận đầu vào/môi trường. 2. Thay truy vấn kho cũ bằng service đích, kiểm NCC/quy cách/PR. 3. Đối chiếu tiêu chí và lưu lỗi/bằng chứng |
| Đầu ra | Luồng tích hợp |
| Phụ thuộc | W09-T04 |
| Ưu tiên | P0 |
| Ước lượng | 8 giờ người, chưa cam kết |
| Tiêu chí chấp nhận | Đề xuất từ available/hạn dùng; đường đích không dùng Inventory cũ |
| Bằng chứng | Hiện vật có version, biên bản/log TC-10-01, commit/môi trường/input/expected/actual; hiện chưa có kết quả |
| Trạng thái | PROPOSED |
| Người phụ trách | UNASSIGNED |

## W10-T02 — UI duyệt/giải thích

| Trường | Nội dung |
|---|---|
| Task ID | W10-T02 |
| Tên tác vụ | UI duyệt/giải thích |
| Mục đích | UI duyệt/giải thích để hoàn thành mục tiêu tuần với bằng chứng kiểm tra được |
| Đầu vào | Thiết kế W03, kết quả gate tiền nhiệm, source theo baseline; gemini.service.ts, agent.service.ts, agent.repository.ts và system.prisma; xem đường dẫn trong PROJECT_BASELINE.md |
| Hoạt động | 1. Xác nhận đầu vào/môi trường. 2. Nguồn dữ liệu, lượng/quy cách, NCC, lý do, uncertain. 3. Đối chiếu tiêu chí và lưu lỗi/bằng chứng |
| Đầu ra | Màn hình duyệt |
| Phụ thuộc | W10-T01 |
| Ưu tiên | P0 |
| Ước lượng | 8 giờ người, chưa cam kết |
| Tiêu chí chấp nhận | Thấy payload trước duyệt; stale yêu cầu tính lại |
| Bằng chứng | Hiện vật có version, biên bản/log TC-10-02, commit/môi trường/input/expected/actual; hiện chưa có kết quả |
| Trạng thái | PROPOSED |
| Người phụ trách | UNASSIGNED |

## W10-T03 — E2E/hồi quy

| Trường | Nội dung |
|---|---|
| Task ID | W10-T03 |
| Tên tác vụ | E2E/hồi quy |
| Mục đích | E2E/hồi quy để hoàn thành mục tiêu tuần với bằng chứng kiểm tra được |
| Đầu vào | Thiết kế W03, kết quả gate tiền nhiệm, source theo baseline; gemini.service.ts, agent.service.ts, agent.repository.ts và system.prisma; xem đường dẫn trong PROJECT_BASELINE.md |
| Hoạt động | 1. Xác nhận đầu vào/môi trường. 2. Auth→nhập→POS→Agent→duyệt→nhận, âm/quyền. 3. Đối chiếu tiêu chí và lưu lỗi/bằng chứng |
| Đầu ra | Traces/video che dữ liệu |
| Phụ thuộc | W10-T02 |
| Ưu tiên | P0 |
| Ước lượng | 8 giờ người, chưa cam kết |
| Tiêu chí chấp nhận | PR/ledger/execution liên kết; mock và sandbox tách |
| Bằng chứng | Hiện vật có version, biên bản/log TC-10-03, commit/môi trường/input/expected/actual; hiện chưa có kết quả |
| Trạng thái | PROPOSED |
| Người phụ trách | UNASSIGNED |

## W10-T04 — Freeze đánh giá

| Trường | Nội dung |
|---|---|
| Task ID | W10-T04 |
| Tên tác vụ | Freeze đánh giá |
| Mục đích | Freeze đánh giá để hoàn thành mục tiêu tuần với bằng chứng kiểm tra được |
| Đầu vào | Thiết kế W03, kết quả gate tiền nhiệm, source theo baseline; gemini.service.ts, agent.service.ts, agent.repository.ts và system.prisma; xem đường dẫn trong PROJECT_BASELINE.md |
| Hoạt động | 1. Xác nhận đầu vào/môi trường. 2. Khóa commit/schema/seed/prompt/model/budget/fixture. 3. Đối chiếu tiêu chí và lưu lỗi/bằng chứng |
| Đầu ra | Manifest tái lập |
| Phụ thuộc | W10-T03 |
| Ưu tiên | P1 |
| Ước lượng | 6 giờ người, chưa cam kết |
| Tiêu chí chấp nhận | Không P0; sửa sau freeze phải version và rerun |
| Bằng chứng | Hiện vật có version, biên bản/log TC-10-04, commit/môi trường/input/expected/actual; hiện chưa có kết quả |
| Trạng thái | PROPOSED |
| Người phụ trách | UNASSIGNED |

## Phạm vi kỹ thuật

| Lĩnh vực | Công việc |
|---|---|
| Database | Đối soát dữ liệu E2E |
| Backend | Nối service nguyên liệu |
| Frontend | Màn hình duyệt/giải thích |
| AI Agent | Workflow tích hợp |
| Bảo mật | Negative E2E |
| Tích hợp | Chuỗi nhập→POS→Agent→nhận |
| Tài liệu | Freeze manifest |

## Kiểm thử

| Loại | Kế hoạch |
|---|---|
| Unit | Validator, tính toán và chuyển trạng thái thuộc tác vụ 01; không mirror implementation |
| Integration | DB/API/tool boundary, inject lỗi giữa write, kiểm rollback trên bản sao |
| E2E | Chuỗi nghiệp vụ tuần, input cố định; lưu trace và expected/actual |
| Nghiệp vụ | Đối chiếu tiêu chí bốn tác vụ; sai actor, thiếu tồn, sai đơn vị, hết hạn, hủy, thao tác trùng |
| AI | Tool selection, quyền, injection, timeout và recovery theo golden labels |
| Biên/âm | Empty/âm/NaN, stale state, double submit, lỗi phụ thuộc và chưa được duyệt; áp dụng theo đầu ra tuần |

TC-10-01…04 ánh xạ lần lượt bốn tác vụ, dùng tiêu chí chấp nhận làm oracle. Bằng chứng phải có version, lệnh, môi trường, input, expected/actual và log đã che dữ liệu. Mock không chứng minh PostgreSQL concurrency hay provider sandbox thật. Các tuần tài liệu dùng biên bản review thay kết quả test giả.

## Cổng tuần G10

**NOT EVALUATED**. PASS khi bốn tiêu chí tác vụ đạt, kiểm tra áp dụng đã chạy, hiện vật/biên bản đủ và không còn P0. CONDITIONAL chỉ cho P1 không chặn tuần sau, có chủ trì/hạn khắc phục. FAIL khi vi phạm quyền, invariant, bảo toàn hoặc thiết kế bắt buộc. Chưa có kết quả giữ NOT EVALUATED; không coi kế hoạch là bằng chứng triển khai.

## Mẫu báo cáo GVHD

| Mục | Nội dung điền |
|---|---|
| Kế hoạch | W10-T01…T04 |
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
