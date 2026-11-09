# Tuần 05 — Inventory Engine và công thức

## Thông tin tuần

- Ngày baseline: 02/11–07/11/2026, chưa là lịch trường đã duyệt.
- Mục tiêu: Inventory Engine và công thức.
- Trạng thái PROPOSED; hiện vật liên quan PARTIAL theo [baseline](../PROJECT_BASELINE.md), chưa có chứng cứ nghiệm thu tuần.
- Chủ trì: UNASSIGNED. Công sức là ước lượng, chưa xác nhận năng lực nhóm.
- Tiền nhiệm: W04-T04; xem [phụ thuộc](../DEPENDENCIES.md).
- Rủi ro/chặn: U01–U10, R01–R10. Giảm thiểu: đóng drift P0 trước, dùng DB bản sao, giữ contract khóa, mock có nhãn, không retry write uncertain.
- Nội dung triển khai bên dưới là công việc tương lai; phiên lập kế hoạch không thực thi.

## W05-T01 — CRUD nguyên liệu/công thức

| Trường | Nội dung |
|---|---|
| Task ID | W05-T01 |
| Tên tác vụ | CRUD nguyên liệu/công thức |
| Mục đích | CRUD nguyên liệu/công thức để hoàn thành mục tiêu tuần với bằng chứng kiểm tra được |
| Đầu vào | Thiết kế W03, kết quả gate tiền nhiệm, source theo baseline; inventory/order/purchase/payment modules và schema tương ứng; xem đường dẫn trong PROJECT_BASELINE.md |
| Hoạt động | 1. Xác nhận đầu vào/môi trường. 2. Recipe version/yield, topping, unit conversion. 3. Đối chiếu tiêu chí và lưu lỗi/bằng chứng |
| Đầu ra | API/UI công thức |
| Phụ thuộc | W04-T04 |
| Ưu tiên | P0 |
| Ước lượng | 8 giờ người, chưa cam kết |
| Tiêu chí chấp nhận | Âm/NaN/sai đơn vị bị chặn; snapshot bất biến |
| Bằng chứng | Hiện vật có version, biên bản/log TC-05-01, commit/môi trường/input/expected/actual; hiện chưa có kết quả |
| Trạng thái | PROPOSED |
| Người phụ trách | UNASSIGNED |

## W05-T02 — FEFO và reservation

| Trường | Nội dung |
|---|---|
| Task ID | W05-T02 |
| Tên tác vụ | FEFO và reservation |
| Mục đích | FEFO và reservation để hoàn thành mục tiêu tuần với bằng chứng kiểm tra được |
| Đầu vào | Thiết kế W03, kết quả gate tiền nhiệm, source theo baseline; inventory/order/purchase/payment modules và schema tương ứng; xem đường dẫn trong PROJECT_BASELINE.md |
| Hoạt động | 1. Xác nhận đầu vào/môi trường. 2. Khóa lô có thứ tự, conditional/version update, ledger cùng transaction. 3. Đối chiếu tiêu chí và lưu lỗi/bằng chứng |
| Đầu ra | Inventory Engine |
| Phụ thuộc | W05-T01 |
| Ưu tiên | P0 |
| Ước lượng | 8 giờ người, chưa cam kết |
| Tiêu chí chấp nhận | Không âm; quantity=sum lô; 0≤reserved≤quantity khi tranh chấp |
| Bằng chứng | Hiện vật có version, biên bản/log TC-05-02, commit/môi trường/input/expected/actual; hiện chưa có kết quả |
| Trạng thái | PROPOSED |
| Người phụ trách | UNASSIGNED |

## W05-T03 — Mua và nhận hàng

| Trường | Nội dung |
|---|---|
| Task ID | W05-T03 |
| Tên tác vụ | Mua và nhận hàng |
| Mục đích | Mua và nhận hàng để hoàn thành mục tiêu tuần với bằng chứng kiểm tra được |
| Đầu vào | Thiết kế W03, kết quả gate tiền nhiệm, source theo baseline; inventory/order/purchase/payment modules và schema tương ứng; xem đường dẫn trong PROJECT_BASELINE.md |
| Hoạt động | 1. Xác nhận đầu vào/môi trường. 2. SupplierIngredient, MOQ, receipt từng phần, lô/hạn/key. 3. Đối chiếu tiêu chí và lưu lỗi/bằng chứng |
| Đầu ra | GoodsReceipt |
| Phụ thuộc | W05-T02 |
| Ưu tiên | P0 |
| Ước lượng | 8 giờ người, chưa cam kết |
| Tiêu chí chấp nhận | Nhận lặp không tăng tồn hai lần; chặn over-receipt |
| Bằng chứng | Hiện vật có version, biên bản/log TC-05-03, commit/môi trường/input/expected/actual; hiện chưa có kết quả |
| Trạng thái | PROPOSED |
| Người phụ trách | UNASSIGNED |

## W05-T04 — Kiểm thử kho

| Trường | Nội dung |
|---|---|
| Task ID | W05-T04 |
| Tên tác vụ | Kiểm thử kho |
| Mục đích | Kiểm thử kho để hoàn thành mục tiêu tuần với bằng chứng kiểm tra được |
| Đầu vào | Thiết kế W03, kết quả gate tiền nhiệm, source theo baseline; inventory/order/purchase/payment modules và schema tương ứng; xem đường dẫn trong PROJECT_BASELINE.md |
| Hoạt động | 1. Xác nhận đầu vào/môi trường. 2. Fault injection và hai phiên PostgreSQL sao chép. 3. Đối chiếu tiêu chí và lưu lỗi/bằng chứng |
| Đầu ra | Báo cáo invariant |
| Phụ thuộc | W05-T03 |
| Ưu tiên | P1 |
| Ước lượng | 6 giờ người, chưa cam kết |
| Tiêu chí chấp nhận | Lỗi rollback toàn bộ, không bán vượt tồn |
| Bằng chứng | Hiện vật có version, biên bản/log TC-05-04, commit/môi trường/input/expected/actual; hiện chưa có kết quả |
| Trạng thái | PROPOSED |
| Người phụ trách | UNASSIGNED |

## Phạm vi kỹ thuật

| Lĩnh vực | Công việc |
|---|---|
| Database | Ledger/lô/recipe/receipt |
| Backend | FEFO/reserve/nhận hàng |
| Frontend | Form nguyên liệu/công thức |
| AI Agent | NOT APPLICABLE — giữ contract |
| Bảo mật | Quyền ghi kho |
| Tích hợp | PR→receipt→lô |
| Tài liệu | Invariant và log concurrency |

## Kiểm thử

| Loại | Kế hoạch |
|---|---|
| Unit | Validator, tính toán và chuyển trạng thái thuộc tác vụ 01; không mirror implementation |
| Integration | DB/API/tool boundary, inject lỗi giữa write, kiểm rollback trên bản sao |
| E2E | Chuỗi nghiệp vụ tuần, input cố định; lưu trace và expected/actual |
| Nghiệp vụ | Đối chiếu tiêu chí bốn tác vụ; sai actor, thiếu tồn, sai đơn vị, hết hạn, hủy, thao tác trùng |
| AI | NOT APPLICABLE — chưa đo Agent tuần này; review protocol nếu thuộc W03 |
| Biên/âm | Empty/âm/NaN, stale state, double submit, lỗi phụ thuộc và chưa được duyệt; áp dụng theo đầu ra tuần |

TC-05-01…04 ánh xạ lần lượt bốn tác vụ, dùng tiêu chí chấp nhận làm oracle. Bằng chứng phải có version, lệnh, môi trường, input, expected/actual và log đã che dữ liệu. Mock không chứng minh PostgreSQL concurrency hay provider sandbox thật. Các tuần tài liệu dùng biên bản review thay kết quả test giả.

## Cổng tuần G05

**NOT EVALUATED**. PASS khi bốn tiêu chí tác vụ đạt, kiểm tra áp dụng đã chạy, hiện vật/biên bản đủ và không còn P0. CONDITIONAL chỉ cho P1 không chặn tuần sau, có chủ trì/hạn khắc phục. FAIL khi vi phạm quyền, invariant, bảo toàn hoặc thiết kế bắt buộc. Chưa có kết quả giữ NOT EVALUATED; không coi kế hoạch là bằng chứng triển khai.

## Mẫu báo cáo GVHD

| Mục | Nội dung điền |
|---|---|
| Kế hoạch | W05-T01…T04 |
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
