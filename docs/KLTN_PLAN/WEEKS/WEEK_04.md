# Tuần 04 — Review và triển khai ban đầu

## Thông tin tuần

- Ngày baseline: 26/10–31/10/2026, chưa là lịch trường đã duyệt.
- Mục tiêu: Review và triển khai ban đầu.
- Trạng thái PROPOSED; hiện vật liên quan PARTIAL theo [baseline](../PROJECT_BASELINE.md), chưa có chứng cứ nghiệm thu tuần.
- Chủ trì: UNASSIGNED. Công sức là ước lượng, chưa xác nhận năng lực nhóm.
- Tiền nhiệm: W03-T04; xem [phụ thuộc](../DEPENDENCIES.md).
- Rủi ro/chặn: U01–U10, R01–R10. Giảm thiểu: đóng drift P0 trước, dùng DB bản sao, giữ contract khóa, mock có nhãn, không retry write uncertain.
- Nội dung triển khai bên dưới là công việc tương lai; phiên lập kế hoạch không thực thi.

## W04-T01 — Review thiết kế

| Trường | Nội dung |
|---|---|
| Task ID | W04-T01 |
| Tên tác vụ | Review thiết kế |
| Mục đích | Review thiết kế để hoàn thành mục tiêu tuần với bằng chứng kiểm tra được |
| Đầu vào | Baseline, README, Prisma và SQL gốc; inventory/order/purchase/payment modules và schema tương ứng; xem đường dẫn trong PROJECT_BASELINE.md |
| Hoạt động | 1. Xác nhận đầu vào/môi trường. 2. Đóng quyết định P0 với GVHD/chủ quán. 3. Đối chiếu tiêu chí và lưu lỗi/bằng chứng |
| Đầu ra | Biên bản review |
| Phụ thuộc | W03-T04 |
| Ưu tiên | P0 |
| Ước lượng | 8 giờ người, chưa cam kết |
| Tiêu chí chấp nhận | Có quyết định thật, không giả phê duyệt |
| Bằng chứng | Hiện vật có version, biên bản/log TC-04-01, commit/môi trường/input/expected/actual; hiện chưa có kết quả |
| Trạng thái | PROPOSED |
| Người phụ trách | UNASSIGNED |

## W04-T02 — Chuẩn hóa migration

| Trường | Nội dung |
|---|---|
| Task ID | W04-T02 |
| Tên tác vụ | Chuẩn hóa migration |
| Mục đích | Chuẩn hóa migration để hoàn thành mục tiêu tuần với bằng chứng kiểm tra được |
| Đầu vào | Baseline, README, Prisma và SQL gốc; inventory/order/purchase/payment modules và schema tương ứng; xem đường dẫn trong PROJECT_BASELINE.md |
| Hoạt động | 1. Xác nhận đầu vào/môi trường. 2. Trong đợt triển khai riêng sửa drift/cú pháp, replay bản sao. 3. Đối chiếu tiêu chí và lưu lỗi/bằng chứng |
| Đầu ra | Migration ứng viên |
| Phụ thuộc | W04-T01 |
| Ưu tiên | P0 |
| Ước lượng | 8 giờ người, chưa cam kết |
| Tiêu chí chấp nhận | Compile và schema diff không còn lệch P0 |
| Bằng chứng | Hiện vật có version, biên bản/log TC-04-02, commit/môi trường/input/expected/actual; hiện chưa có kết quả |
| Trạng thái | PROPOSED |
| Người phụ trách | UNASSIGNED |

## W04-T03 — Diễn tập phục hồi

| Trường | Nội dung |
|---|---|
| Task ID | W04-T03 |
| Tên tác vụ | Diễn tập phục hồi |
| Mục đích | Diễn tập phục hồi để hoàn thành mục tiêu tuần với bằng chứng kiểm tra được |
| Đầu vào | Baseline, README, Prisma và SQL gốc; inventory/order/purchase/payment modules và schema tương ứng; xem đường dẫn trong PROJECT_BASELINE.md |
| Hoạt động | 1. Xác nhận đầu vào/môi trường. 2. Backup bản sao, inject lỗi từng pha, đối soát sau restore. 3. Đối chiếu tiêu chí và lưu lỗi/bằng chứng |
| Đầu ra | Log rehearsal |
| Phụ thuộc | W04-T02 |
| Ưu tiên | P0 |
| Ước lượng | 8 giờ người, chưa cam kết |
| Tiêu chí chấp nhận | Count/tồn theo đơn vị/tiền/FK bảo toàn; kiểm tra bắt buộc đã chạy |
| Bằng chứng | Hiện vật có version, biên bản/log TC-04-03, commit/môi trường/input/expected/actual; hiện chưa có kết quả |
| Trạng thái | PROPOSED |
| Người phụ trách | UNASSIGNED |

## W04-T04 — Lát cắt nguyên liệu

| Trường | Nội dung |
|---|---|
| Task ID | W04-T04 |
| Tên tác vụ | Lát cắt nguyên liệu |
| Mục đích | Lát cắt nguyên liệu để hoàn thành mục tiêu tuần với bằng chứng kiểm tra được |
| Đầu vào | Baseline, README, Prisma và SQL gốc; inventory/order/purchase/payment modules và schema tương ứng; xem đường dẫn trong PROJECT_BASELINE.md |
| Hoạt động | 1. Xác nhận đầu vào/môi trường. 2. Sau gate DB thêm API/validator và fixture quyền. 3. Đối chiếu tiêu chí và lưu lỗi/bằng chứng |
| Đầu ra | API tối thiểu |
| Phụ thuộc | W04-T03 |
| Ưu tiên | P1 |
| Ước lượng | 6 giờ người, chưa cam kết |
| Tiêu chí chấp nhận | Đọc/ghi đúng quyền; lỗi rollback có chứng cứ |
| Bằng chứng | Hiện vật có version, biên bản/log TC-04-04, commit/môi trường/input/expected/actual; hiện chưa có kết quả |
| Trạng thái | PROPOSED |
| Người phụ trách | UNASSIGNED |

## Phạm vi kỹ thuật

| Lĩnh vực | Công việc |
|---|---|
| Database | Rehearsal migration/restore |
| Backend | Lát cắt nguyên liệu/validator |
| Frontend | NOT APPLICABLE — chỉ chốt contract |
| AI Agent | Review kiến trúc, chưa nối write |
| Bảo mật | Quyền fixture và che log |
| Tích hợp | Diff SQL/Prisma/API |
| Tài liệu | Biên bản review |

## Kiểm thử

| Loại | Kế hoạch |
|---|---|
| Unit | Validator, tính toán và chuyển trạng thái thuộc tác vụ 01; không mirror implementation |
| Integration | DB/API/tool boundary, inject lỗi giữa write, kiểm rollback trên bản sao |
| E2E | Chuỗi nghiệp vụ tuần, input cố định; lưu trace và expected/actual |
| Nghiệp vụ | Đối chiếu tiêu chí bốn tác vụ; sai actor, thiếu tồn, sai đơn vị, hết hạn, hủy, thao tác trùng |
| AI | NOT APPLICABLE — chưa đo Agent tuần này; review protocol nếu thuộc W03 |
| Biên/âm | Empty/âm/NaN, stale state, double submit, lỗi phụ thuộc và chưa được duyệt; áp dụng theo đầu ra tuần |

TC-04-01…04 ánh xạ lần lượt bốn tác vụ, dùng tiêu chí chấp nhận làm oracle. Bằng chứng phải có version, lệnh, môi trường, input, expected/actual và log đã che dữ liệu. Mock không chứng minh PostgreSQL concurrency hay provider sandbox thật. Các tuần tài liệu dùng biên bản review thay kết quả test giả.

## Cổng tuần G04

**NOT EVALUATED**. PASS khi bốn tiêu chí tác vụ đạt, kiểm tra áp dụng đã chạy, hiện vật/biên bản đủ và không còn P0. CONDITIONAL chỉ cho P1 không chặn tuần sau, có chủ trì/hạn khắc phục. FAIL khi vi phạm quyền, invariant, bảo toàn hoặc thiết kế bắt buộc. Chưa có kết quả giữ NOT EVALUATED; không coi kế hoạch là bằng chứng triển khai.

## Mẫu báo cáo GVHD

| Mục | Nội dung điền |
|---|---|
| Kế hoạch | W04-T01…T04 |
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
