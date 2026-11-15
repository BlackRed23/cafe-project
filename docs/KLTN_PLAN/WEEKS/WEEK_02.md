# Tuần 02 — Yêu cầu nghiệp vụ

## Thông tin tuần

- Ngày baseline: 12/10–17/10/2026, chưa là lịch trường đã duyệt.
- Mục tiêu: Yêu cầu nghiệp vụ.
- Trạng thái PROPOSED; hiện vật liên quan PARTIAL theo [baseline](../PROJECT_BASELINE.md), chưa có chứng cứ nghiệm thu tuần.
- Chủ trì: UNASSIGNED. Công sức là ước lượng, chưa xác nhận năng lực nhóm.
- Tiền nhiệm: W01-T04; xem [phụ thuộc](../DEPENDENCIES.md).
- Rủi ro/chặn: U01–U10, R01–R10. Giảm thiểu: đóng drift P0 trước, dùng DB bản sao, giữ contract khóa, mock có nhãn, không retry write uncertain.
- Nội dung triển khai bên dưới là công việc tương lai; phiên lập kế hoạch không thực thi.

## W02-T01 — Khảo sát quy trình

| Trường | Nội dung |
|---|---|
| Task ID | W02-T01 |
| Tên tác vụ | Khảo sát quy trình |
| Mục đích | Khảo sát quy trình để hoàn thành mục tiêu tuần với bằng chứng kiểm tra được |
| Đầu vào | Baseline, README, Prisma và SQL gốc; inventory/order/purchase/payment modules và schema tương ứng; xem đường dẫn trong PROJECT_BASELINE.md |
| Hoạt động | 1. Xác nhận đầu vào/môi trường. 2. Phỏng vấn nhập–bán–pha–hủy–kiểm kê; ghi ngoại lệ. 3. Đối chiếu tiêu chí và lưu lỗi/bằng chứng |
| Đầu ra | Use case |
| Phụ thuộc | W01-T04 |
| Ưu tiên | P0 |
| Ước lượng | 8 giờ người, chưa cam kết |
| Tiêu chí chấp nhận | Mỗi luồng có actor, điều kiện và nhánh lỗi |
| Bằng chứng | Hiện vật có version, biên bản/log TC-02-01, commit/môi trường/input/expected/actual; hiện chưa có kết quả |
| Trạng thái | PROPOSED |
| Người phụ trách | UNASSIGNED |

## W02-T02 — Chốt quy tắc kho

| Trường | Nội dung |
|---|---|
| Task ID | W02-T02 |
| Tên tác vụ | Chốt quy tắc kho |
| Mục đích | Chốt quy tắc kho để hoàn thành mục tiêu tuần với bằng chứng kiểm tra được |
| Đầu vào | Baseline, README, Prisma và SQL gốc; inventory/order/purchase/payment modules và schema tương ứng; xem đường dẫn trong PROJECT_BASELINE.md |
| Hoạt động | 1. Xác nhận đầu vào/môi trường. 2. Định nghĩa unit, FEFO, reserve, hủy, waste, COGS. 3. Đối chiếu tiêu chí và lưu lỗi/bằng chứng |
| Đầu ra | BR01–BR08 |
| Phụ thuộc | W02-T01 |
| Ưu tiên | P0 |
| Ước lượng | 8 giờ người, chưa cam kết |
| Tiêu chí chấp nhận | Có ví dụ tính tay và không trộn đơn vị |
| Bằng chứng | Hiện vật có version, biên bản/log TC-02-02, commit/môi trường/input/expected/actual; hiện chưa có kết quả |
| Trạng thái | PROPOSED |
| Người phụ trách | UNASSIGNED |

## W02-T03 — Chốt quyền Agent

| Trường | Nội dung |
|---|---|
| Task ID | W02-T03 |
| Tên tác vụ | Chốt quyền Agent |
| Mục đích | Chốt quyền Agent để hoàn thành mục tiêu tuần với bằng chứng kiểm tra được |
| Đầu vào | Baseline, README, Prisma và SQL gốc; inventory/order/purchase/payment modules và schema tương ứng; xem đường dẫn trong PROJECT_BASELINE.md |
| Hoạt động | 1. Xác nhận đầu vào/môi trường. 2. Lập ma trận user/system, điểm duyệt, quyền mua/gửi. 3. Đối chiếu tiêu chí và lưu lỗi/bằng chứng |
| Đầu ra | Ma trận quyền |
| Phụ thuộc | W02-T02 |
| Ưu tiên | P0 |
| Ước lượng | 8 giờ người, chưa cam kết |
| Tiêu chí chấp nhận | Mọi write có principal và kiểm tra server |
| Bằng chứng | Hiện vật có version, biên bản/log TC-02-03, commit/môi trường/input/expected/actual; hiện chưa có kết quả |
| Trạng thái | PROPOSED |
| Người phụ trách | UNASSIGNED |

## W02-T04 — Khóa phạm vi

| Trường | Nội dung |
|---|---|
| Task ID | W02-T04 |
| Tên tác vụ | Khóa phạm vi |
| Mục đích | Khóa phạm vi để hoàn thành mục tiêu tuần với bằng chứng kiểm tra được |
| Đầu vào | Baseline, README, Prisma và SQL gốc; inventory/order/purchase/payment modules và schema tương ứng; xem đường dẫn trong PROJECT_BASELINE.md |
| Hoạt động | 1. Xác nhận đầu vào/môi trường. 2. Duyệt SRS/27-16/dataset với GVHD. 3. Đối chiếu tiêu chí và lưu lỗi/bằng chứng |
| Đầu ra | SRS và truy vết |
| Phụ thuộc | W02-T03 |
| Ưu tiên | P1 |
| Ước lượng | 6 giờ người, chưa cam kết |
| Tiêu chí chấp nhận | Mọi yêu cầu trọng yếu có test dự kiến |
| Bằng chứng | Hiện vật có version, biên bản/log TC-02-04, commit/môi trường/input/expected/actual; hiện chưa có kết quả |
| Trạng thái | PROPOSED |
| Người phụ trách | UNASSIGNED |

## Phạm vi kỹ thuật

| Lĩnh vực | Công việc |
|---|---|
| Database | Quy tắc dữ liệu và mapping |
| Backend | Use case/API contracts |
| Frontend | Wireframe POS/duyệt |
| AI Agent | Quyền/mục tiêu workflow |
| Bảo mật | Ma trận role/actor |
| Tích hợp | Hợp đồng trạng thái |
| Tài liệu | SRS và BR |

## Kiểm thử

| Loại | Kế hoạch |
|---|---|
| Unit | NOT APPLICABLE — review ví dụ tính tay/quy tắc, chưa có mã mới |
| Integration | Review DB/API/tool contract, không gọi dịch vụ |
| E2E | Walkthrough use case, không coi là test chạy |
| Nghiệp vụ | Đối chiếu tiêu chí bốn tác vụ; sai actor, thiếu tồn, sai đơn vị, hết hạn, hủy, thao tác trùng |
| AI | NOT APPLICABLE — chưa đo Agent tuần này; review protocol nếu thuộc W03 |
| Biên/âm | Empty/âm/NaN, stale state, double submit, lỗi phụ thuộc và chưa được duyệt; áp dụng theo đầu ra tuần |

TC-02-01…04 ánh xạ lần lượt bốn tác vụ, dùng tiêu chí chấp nhận làm oracle. Bằng chứng phải có version, lệnh, môi trường, input, expected/actual và log đã che dữ liệu. Mock không chứng minh PostgreSQL concurrency hay provider sandbox thật. Các tuần tài liệu dùng biên bản review thay kết quả test giả.

## Cổng tuần G02

**NOT EVALUATED**. PASS khi bốn tiêu chí tác vụ đạt, kiểm tra áp dụng đã chạy, hiện vật/biên bản đủ và không còn P0. CONDITIONAL chỉ cho P1 không chặn tuần sau, có chủ trì/hạn khắc phục. FAIL khi vi phạm quyền, invariant, bảo toàn hoặc thiết kế bắt buộc. Chưa có kết quả giữ NOT EVALUATED; không coi kế hoạch là bằng chứng triển khai.

## Mẫu báo cáo GVHD

| Mục | Nội dung điền |
|---|---|
| Kế hoạch | W02-T01…T04 |
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
