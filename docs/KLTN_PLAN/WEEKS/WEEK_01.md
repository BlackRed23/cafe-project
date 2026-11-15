# Tuần 01 — Kiểm kê TLCN

## Thông tin tuần

- Ngày baseline: 05/10–10/10/2026, chưa là lịch trường đã duyệt.
- Mục tiêu: Kiểm kê TLCN.
- Trạng thái PROPOSED; hiện vật liên quan PARTIAL theo [baseline](../PROJECT_BASELINE.md), chưa có chứng cứ nghiệm thu tuần.
- Chủ trì: UNASSIGNED. Công sức là ước lượng, chưa xác nhận năng lực nhóm.
- Tiền nhiệm: Không có; chỉ đọc; xem [phụ thuộc](../DEPENDENCIES.md).
- Rủi ro/chặn: U01–U10, R01–R10. Giảm thiểu: đóng drift P0 trước, dùng DB bản sao, giữ contract khóa, mock có nhãn, không retry write uncertain.
- Nội dung triển khai bên dưới là công việc tương lai; phiên lập kế hoạch không thực thi.

## W01-T01 — Lập danh mục hiện vật

| Trường | Nội dung |
|---|---|
| Task ID | W01-T01 |
| Tên tác vụ | Lập danh mục hiện vật |
| Mục đích | Lập danh mục hiện vật để hoàn thành mục tiêu tuần với bằng chứng kiểm tra được |
| Đầu vào | Baseline, README, Prisma và SQL gốc; inventory/order/purchase/payment modules và schema tương ứng; xem đường dẫn trong PROJECT_BASELINE.md |
| Hoạt động | 1. Xác nhận đầu vào/môi trường. 2. Quét cấu trúc/manifest/modules; ghi commit và nguồn. 3. Đối chiếu tiêu chí và lưu lỗi/bằng chứng |
| Đầu ra | Bản đồ repository |
| Phụ thuộc | Không có; chỉ đọc |
| Ưu tiên | P0 |
| Ước lượng | 8 giờ người, chưa cam kết |
| Tiêu chí chấp nhận | Mỗi phát hiện có nguồn và giới hạn |
| Bằng chứng | Hiện vật có version, biên bản/log TC-01-01, commit/môi trường/input/expected/actual; hiện chưa có kết quả |
| Trạng thái | PROPOSED |
| Người phụ trách | UNASSIGNED |

## W01-T02 — Đối chiếu DB

| Trường | Nội dung |
|---|---|
| Task ID | W01-T02 |
| Tên tác vụ | Đối chiếu DB |
| Mục đích | Đối chiếu DB để hoàn thành mục tiêu tuần với bằng chứng kiểm tra được |
| Đầu vào | Baseline, README, Prisma và SQL gốc; inventory/order/purchase/payment modules và schema tương ứng; xem đường dẫn trong PROJECT_BASELINE.md |
| Hoạt động | 1. Xác nhận đầu vào/môi trường. 2. Đếm model/ENUM; diff SQL/cột/FK/index. 3. Đối chiếu tiêu chí và lưu lỗi/bằng chứng |
| Đầu ra | Ma trận drift |
| Phụ thuộc | W01-T01 |
| Ưu tiên | P0 |
| Ước lượng | 8 giờ người, chưa cam kết |
| Tiêu chí chấp nhận | Giải thích 31 chuyển tiếp → 27 đích, không tự đổi 16 ENUM |
| Bằng chứng | Hiện vật có version, biên bản/log TC-01-02, commit/môi trường/input/expected/actual; hiện chưa có kết quả |
| Trạng thái | PROPOSED |
| Người phụ trách | UNASSIGNED |

## W01-T03 — Kiểm kê Agent/test

| Trường | Nội dung |
|---|---|
| Task ID | W01-T03 |
| Tên tác vụ | Kiểm kê Agent/test |
| Mục đích | Kiểm kê Agent/test để hoàn thành mục tiêu tuần với bằng chứng kiểm tra được |
| Đầu vào | Baseline, README, Prisma và SQL gốc; inventory/order/purchase/payment modules và schema tương ứng; xem đường dẫn trong PROJECT_BASELINE.md |
| Hoạt động | 1. Xác nhận đầu vào/môi trường. 2. Đọc Gemini/rules, quyền, mocks. 3. Đối chiếu tiêu chí và lưu lỗi/bằng chứng |
| Đầu ra | Danh mục năng lực và test |
| Phụ thuộc | W01-T02 |
| Ưu tiên | P0 |
| Ước lượng | 8 giờ người, chưa cam kết |
| Tiêu chí chấp nhận | Phân biệt mã test với kết quả chạy và JSON với Tool Calling |
| Bằng chứng | Hiện vật có version, biên bản/log TC-01-03, commit/môi trường/input/expected/actual; hiện chưa có kết quả |
| Trạng thái | PROPOSED |
| Người phụ trách | UNASSIGNED |

## W01-T04 — Xác nhận lịch/quản trị

| Trường | Nội dung |
|---|---|
| Task ID | W01-T04 |
| Tên tác vụ | Xác nhận lịch/quản trị |
| Mục đích | Xác nhận lịch/quản trị để hoàn thành mục tiêu tuần với bằng chứng kiểm tra được |
| Đầu vào | Baseline, README, Prisma và SQL gốc; inventory/order/purchase/payment modules và schema tương ứng; xem đường dẫn trong PROJECT_BASELINE.md |
| Hoạt động | 1. Xác nhận đầu vào/môi trường. 2. Thu thập audit, lịch, vai trò, yêu cầu GVHD. 3. Đối chiếu tiêu chí và lưu lỗi/bằng chứng |
| Đầu ra | Sổ U01–U10 |
| Phụ thuộc | W01-T03 |
| Ưu tiên | P1 |
| Ước lượng | 6 giờ người, chưa cam kết |
| Tiêu chí chấp nhận | Thiếu nguồn ghi UNKNOWN, không giả duyệt |
| Bằng chứng | Hiện vật có version, biên bản/log TC-01-04, commit/môi trường/input/expected/actual; hiện chưa có kết quả |
| Trạng thái | PROPOSED |
| Người phụ trách | UNASSIGNED |

## Phạm vi kỹ thuật

| Lĩnh vực | Công việc |
|---|---|
| Database | Kiểm kê model/ENUM/SQL |
| Backend | Kiểm kê service và middleware |
| Frontend | Kiểm kê route khách/admin |
| AI Agent | Đọc Gemini/rules và worker |
| Bảo mật | Kiểm kê guards và rò rỉ log |
| Tích hợp | NOT APPLICABLE — chưa chạy hệ thống |
| Tài liệu | Baseline có dẫn nguồn |

## Kiểm thử

| Loại | Kế hoạch |
|---|---|
| Unit | NOT APPLICABLE — review ví dụ tính tay/quy tắc, chưa có mã mới |
| Integration | Review DB/API/tool contract, không gọi dịch vụ |
| E2E | Walkthrough use case, không coi là test chạy |
| Nghiệp vụ | Đối chiếu tiêu chí bốn tác vụ; sai actor, thiếu tồn, sai đơn vị, hết hạn, hủy, thao tác trùng |
| AI | NOT APPLICABLE — chưa đo Agent tuần này; review protocol nếu thuộc W03 |
| Biên/âm | Empty/âm/NaN, stale state, double submit, lỗi phụ thuộc và chưa được duyệt; áp dụng theo đầu ra tuần |

TC-01-01…04 ánh xạ lần lượt bốn tác vụ, dùng tiêu chí chấp nhận làm oracle. Bằng chứng phải có version, lệnh, môi trường, input, expected/actual và log đã che dữ liệu. Mock không chứng minh PostgreSQL concurrency hay provider sandbox thật. Các tuần tài liệu dùng biên bản review thay kết quả test giả.

## Cổng tuần G01

**NOT EVALUATED**. PASS khi bốn tiêu chí tác vụ đạt, kiểm tra áp dụng đã chạy, hiện vật/biên bản đủ và không còn P0. CONDITIONAL chỉ cho P1 không chặn tuần sau, có chủ trì/hạn khắc phục. FAIL khi vi phạm quyền, invariant, bảo toàn hoặc thiết kế bắt buộc. Chưa có kết quả giữ NOT EVALUATED; không coi kế hoạch là bằng chứng triển khai.

## Mẫu báo cáo GVHD

| Mục | Nội dung điền |
|---|---|
| Kế hoạch | W01-T01…T04 |
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
