# Tuần 03 — Thiết kế DB và Agent

## Thông tin tuần

- Ngày baseline: 19/10–24/10/2026, chưa là lịch trường đã duyệt.
- Mục tiêu: Thiết kế DB và Agent.
- Trạng thái PROPOSED; hiện vật liên quan PARTIAL theo [baseline](../PROJECT_BASELINE.md), chưa có chứng cứ nghiệm thu tuần.
- Chủ trì: UNASSIGNED. Công sức là ước lượng, chưa xác nhận năng lực nhóm.
- Tiền nhiệm: W02-T04; xem [phụ thuộc](../DEPENDENCIES.md).
- Rủi ro/chặn: U01–U10, R01–R10. Giảm thiểu: đóng drift P0 trước, dùng DB bản sao, giữ contract khóa, mock có nhãn, không retry write uncertain.
- Nội dung triển khai bên dưới là công việc tương lai; phiên lập kế hoạch không thực thi.

## W03-T01 — Chốt DB/API

| Trường | Nội dung |
|---|---|
| Task ID | W03-T01 |
| Tên tác vụ | Chốt DB/API |
| Mục đích | Chốt DB/API để hoàn thành mục tiêu tuần với bằng chứng kiểm tra được |
| Đầu vào | Baseline, README, Prisma và SQL gốc; inventory/order/purchase/payment modules và schema tương ứng; xem đường dẫn trong PROJECT_BASELINE.md |
| Hoạt động | 1. Xác nhận đầu vào/môi trường. 2. Giải quyết Payment/batch/Decimal; thiết kế FK/index/check. 3. Đối chiếu tiêu chí và lưu lỗi/bằng chứng |
| Đầu ra | ERD và data dictionary |
| Phụ thuộc | W02-T04 |
| Ưu tiên | P0 |
| Ước lượng | 8 giờ người, chưa cam kết |
| Tiêu chí chấp nhận | Đủ 27 bảng/16 ENUM được đối chiếu và ADR P0 |
| Bằng chứng | Hiện vật có version, biên bản/log TC-03-01, commit/môi trường/input/expected/actual; hiện chưa có kết quả |
| Trạng thái | PROPOSED |
| Người phụ trách | UNASSIGNED |

## W03-T02 — Thiết kế migration/restore

| Trường | Nội dung |
|---|---|
| Task ID | W03-T02 |
| Tên tác vụ | Thiết kế migration/restore |
| Mục đích | Thiết kế migration/restore để hoàn thành mục tiêu tuần với bằng chứng kiểm tra được |
| Đầu vào | Baseline, README, Prisma và SQL gốc; inventory/order/purchase/payment modules và schema tương ứng; xem đường dẫn trong PROJECT_BASELINE.md |
| Hoạt động | 1. Xác nhận đầu vào/môi trường. 2. Mapping SKU/unit, backup, expand/migrate/verify/contract. 3. Đối chiếu tiêu chí và lưu lỗi/bằng chứng |
| Đầu ra | Runbook |
| Phụ thuộc | W03-T01 |
| Ưu tiên | P0 |
| Ước lượng | 8 giờ người, chưa cam kết |
| Tiêu chí chấp nhận | Có ngưỡng dừng, bảo toàn dữ liệu mới, contract khóa |
| Bằng chứng | Hiện vật có version, biên bản/log TC-03-02, commit/môi trường/input/expected/actual; hiện chưa có kết quả |
| Trạng thái | PROPOSED |
| Người phụ trách | UNASSIGNED |

## W03-T03 — Thiết kế Agent

| Trường | Nội dung |
|---|---|
| Task ID | W03-T03 |
| Tên tác vụ | Thiết kế Agent |
| Mục đích | Thiết kế Agent để hoàn thành mục tiêu tuần với bằng chứng kiểm tra được |
| Đầu vào | Baseline, README, Prisma và SQL gốc; inventory/order/purchase/payment modules và schema tương ứng; xem đường dẫn trong PROJECT_BASELINE.md |
| Hoạt động | 1. Xác nhận đầu vào/môi trường. 2. Registry/schema, state machine, budget, duyệt và key. 3. Đối chiếu tiêu chí và lưu lỗi/bằng chứng |
| Đầu ra | Tool contracts |
| Phụ thuộc | W03-T02 |
| Ưu tiên | P0 |
| Ước lượng | 8 giờ người, chưa cam kết |
| Tiêu chí chấp nhận | Không có write bỏ qua quyền hoặc approval |
| Bằng chứng | Hiện vật có version, biên bản/log TC-03-03, commit/môi trường/input/expected/actual; hiện chưa có kết quả |
| Trạng thái | PROPOSED |
| Người phụ trách | UNASSIGNED |

## W03-T04 — Thiết kế thí nghiệm

| Trường | Nội dung |
|---|---|
| Task ID | W03-T04 |
| Tên tác vụ | Thiết kế thí nghiệm |
| Mục đích | Thiết kế thí nghiệm để hoàn thành mục tiêu tuần với bằng chứng kiểm tra được |
| Đầu vào | Baseline, README, Prisma và SQL gốc; inventory/order/purchase/payment modules và schema tương ứng; xem đường dẫn trong PROJECT_BASELINE.md |
| Hoạt động | 1. Xác nhận đầu vào/môi trường. 2. Khóa baseline, fixture, labels, metrics và seed. 3. Đối chiếu tiêu chí và lưu lỗi/bằng chứng |
| Đầu ra | Protocol v1 |
| Phụ thuộc | W03-T03 |
| Ưu tiên | P1 |
| Ước lượng | 6 giờ người, chưa cam kết |
| Tiêu chí chấp nhận | Định nghĩa mẫu số, timeout và raw format trước đo |
| Bằng chứng | Hiện vật có version, biên bản/log TC-03-04, commit/môi trường/input/expected/actual; hiện chưa có kết quả |
| Trạng thái | PROPOSED |
| Người phụ trách | UNASSIGNED |

## Phạm vi kỹ thuật

| Lĩnh vực | Công việc |
|---|---|
| Database | ERD/FK/index/check/transaction |
| Backend | Hợp đồng API và kiểu dữ liệu |
| Frontend | Wireframe duyệt/POS |
| AI Agent | Registry/state machine/budget |
| Bảo mật | Threat model và stale approval |
| Tích hợp | Thiết kế callback/tool |
| Tài liệu | ADR và protocol |

## Kiểm thử

| Loại | Kế hoạch |
|---|---|
| Unit | NOT APPLICABLE — review ví dụ tính tay/quy tắc, chưa có mã mới |
| Integration | Review DB/API/tool contract, không gọi dịch vụ |
| E2E | Walkthrough use case, không coi là test chạy |
| Nghiệp vụ | Đối chiếu tiêu chí bốn tác vụ; sai actor, thiếu tồn, sai đơn vị, hết hạn, hủy, thao tác trùng |
| AI | NOT APPLICABLE — chưa đo Agent tuần này; review protocol nếu thuộc W03 |
| Biên/âm | Empty/âm/NaN, stale state, double submit, lỗi phụ thuộc và chưa được duyệt; áp dụng theo đầu ra tuần |

TC-03-01…04 ánh xạ lần lượt bốn tác vụ, dùng tiêu chí chấp nhận làm oracle. Bằng chứng phải có version, lệnh, môi trường, input, expected/actual và log đã che dữ liệu. Mock không chứng minh PostgreSQL concurrency hay provider sandbox thật. Các tuần tài liệu dùng biên bản review thay kết quả test giả.

## Cổng tuần G03

**NOT EVALUATED**. PASS khi bốn tiêu chí tác vụ đạt, kiểm tra áp dụng đã chạy, hiện vật/biên bản đủ và không còn P0. CONDITIONAL chỉ cho P1 không chặn tuần sau, có chủ trì/hạn khắc phục. FAIL khi vi phạm quyền, invariant, bảo toàn hoặc thiết kế bắt buộc. Chưa có kết quả giữ NOT EVALUATED; không coi kế hoạch là bằng chứng triển khai.

## Mẫu báo cáo GVHD

| Mục | Nội dung điền |
|---|---|
| Kế hoạch | W03-T01…T04 |
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
