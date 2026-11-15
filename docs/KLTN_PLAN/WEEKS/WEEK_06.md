# Tuần 06 — POS, kiểm kê và COGS

## Thông tin tuần

- Ngày baseline: 09/11–14/11/2026, chưa là lịch trường đã duyệt.
- Mục tiêu: POS, kiểm kê và COGS.
- Trạng thái PROPOSED; hiện vật liên quan PARTIAL theo [baseline](../PROJECT_BASELINE.md), chưa có chứng cứ nghiệm thu tuần.
- Chủ trì: UNASSIGNED. Công sức là ước lượng, chưa xác nhận năng lực nhóm.
- Tiền nhiệm: W05-T04; xem [phụ thuộc](../DEPENDENCIES.md).
- Rủi ro/chặn: U01–U10, R01–R10. Giảm thiểu: đóng drift P0 trước, dùng DB bản sao, giữ contract khóa, mock có nhãn, không retry write uncertain.
- Nội dung triển khai bên dưới là công việc tương lai; phiên lập kế hoạch không thực thi.

## W06-T01 — POS/pha chế

| Trường | Nội dung |
|---|---|
| Task ID | W06-T01 |
| Tên tác vụ | POS/pha chế |
| Mục đích | POS/pha chế để hoàn thành mục tiêu tuần với bằng chứng kiểm tra được |
| Đầu vào | Thiết kế W03, kết quả gate tiền nhiệm, source theo baseline; inventory/order/purchase/payment modules và schema tương ứng; xem đường dẫn trong PROJECT_BASELINE.md |
| Hoạt động | 1. Xác nhận đầu vào/môi trường. 2. Snapshot recipe, reserve→commit; hủy trước pha release, sau pha waste. 3. Đối chiếu tiêu chí và lưu lỗi/bằng chứng |
| Đầu ra | POS tối thiểu |
| Phụ thuộc | W05-T04 |
| Ưu tiên | P0 |
| Ước lượng | 8 giờ người, chưa cam kết |
| Tiêu chí chấp nhận | Lặp/hủy không trừ hoặc hoàn hai lần |
| Bằng chứng | Hiện vật có version, biên bản/log TC-06-01, commit/môi trường/input/expected/actual; hiện chưa có kết quả |
| Trạng thái | PROPOSED |
| Người phụ trách | UNASSIGNED |

## W06-T02 — Kiểm kê/hao hụt

| Trường | Nội dung |
|---|---|
| Task ID | W06-T02 |
| Tên tác vụ | Kiểm kê/hao hụt |
| Mục đích | Kiểm kê/hao hụt để hoàn thành mục tiêu tuần với bằng chứng kiểm tra được |
| Đầu vào | Thiết kế W03, kết quả gate tiền nhiệm, source theo baseline; inventory/order/purchase/payment modules và schema tương ứng; xem đường dẫn trong PROJECT_BASELINE.md |
| Hoạt động | 1. Xác nhận đầu vào/môi trường. 2. Phiếu có snapshot/version, duyệt, variance ledger. 3. Đối chiếu tiêu chí và lưu lỗi/bằng chứng |
| Đầu ra | StockCount/Waste |
| Phụ thuộc | W06-T01 |
| Ưu tiên | P0 |
| Ước lượng | 8 giờ người, chưa cam kết |
| Tiêu chí chấp nhận | Duyệt lặp không nhân đôi; actor/lý do đủ |
| Bằng chứng | Hiện vật có version, biên bản/log TC-06-02, commit/môi trường/input/expected/actual; hiện chưa có kết quả |
| Trạng thái | PROPOSED |
| Người phụ trách | UNASSIGNED |

## W06-T03 — COGS/lợi nhuận

| Trường | Nội dung |
|---|---|
| Task ID | W06-T03 |
| Tên tác vụ | COGS/lợi nhuận |
| Mục đích | COGS/lợi nhuận để hoàn thành mục tiêu tuần với bằng chứng kiểm tra được |
| Đầu vào | Thiết kế W03, kết quả gate tiền nhiệm, source theo baseline; inventory/order/purchase/payment modules và schema tương ứng; xem đường dẫn trong PROJECT_BASELINE.md |
| Hoạt động | 1. Xác nhận đầu vào/môi trường. 2. Snapshot giá lô, topping, quy tắc labor/overhead. 3. Đối chiếu tiêu chí và lưu lỗi/bằng chứng |
| Đầu ra | Báo cáo chi phí |
| Phụ thuộc | W06-T02 |
| Ưu tiên | P0 |
| Ước lượng | 8 giờ người, chưa cam kết |
| Tiêu chí chấp nhận | Ví dụ Decimal khớp tính tay; thiếu cost lịch sử ghi unknown |
| Bằng chứng | Hiện vật có version, biên bản/log TC-06-03, commit/môi trường/input/expected/actual; hiện chưa có kết quả |
| Trạng thái | PROPOSED |
| Người phụ trách | UNASSIGNED |

## W06-T04 — E2E nghiệp vụ

| Trường | Nội dung |
|---|---|
| Task ID | W06-T04 |
| Tên tác vụ | E2E nghiệp vụ |
| Mục đích | E2E nghiệp vụ để hoàn thành mục tiêu tuần với bằng chứng kiểm tra được |
| Đầu vào | Thiết kế W03, kết quả gate tiền nhiệm, source theo baseline; inventory/order/purchase/payment modules và schema tương ứng; xem đường dẫn trong PROJECT_BASELINE.md |
| Hoạt động | 1. Xác nhận đầu vào/môi trường. 2. Nhận→pha→hủy→kiểm kê→báo cáo và quyền. 3. Đối chiếu tiêu chí và lưu lỗi/bằng chứng |
| Đầu ra | Traces nghiệp vụ |
| Phụ thuộc | W06-T03 |
| Ưu tiên | P1 |
| Ước lượng | 6 giờ người, chưa cam kết |
| Tiêu chí chấp nhận | Lô/ledger/COGS khớp; vượt quyền không ghi |
| Bằng chứng | Hiện vật có version, biên bản/log TC-06-04, commit/môi trường/input/expected/actual; hiện chưa có kết quả |
| Trạng thái | PROPOSED |
| Người phụ trách | UNASSIGNED |

## Phạm vi kỹ thuật

| Lĩnh vực | Công việc |
|---|---|
| Database | Snapshot/StockCount |
| Backend | Commit/void/waste/COGS |
| Frontend | POS/hàng chờ pha/kiểm kê |
| AI Agent | NOT APPLICABLE — chưa nối workflow |
| Bảo mật | Quyền pha chế/duyệt |
| Tích hợp | Đơn→lô→ledger→chi phí |
| Tài liệu | Test nghiệp vụ |

## Kiểm thử

| Loại | Kế hoạch |
|---|---|
| Unit | Validator, tính toán và chuyển trạng thái thuộc tác vụ 01; không mirror implementation |
| Integration | DB/API/tool boundary, inject lỗi giữa write, kiểm rollback trên bản sao |
| E2E | Chuỗi nghiệp vụ tuần, input cố định; lưu trace và expected/actual |
| Nghiệp vụ | Đối chiếu tiêu chí bốn tác vụ; sai actor, thiếu tồn, sai đơn vị, hết hạn, hủy, thao tác trùng |
| AI | NOT APPLICABLE — chưa đo Agent tuần này; review protocol nếu thuộc W03 |
| Biên/âm | Empty/âm/NaN, stale state, double submit, lỗi phụ thuộc và chưa được duyệt; áp dụng theo đầu ra tuần |

TC-06-01…04 ánh xạ lần lượt bốn tác vụ, dùng tiêu chí chấp nhận làm oracle. Bằng chứng phải có version, lệnh, môi trường, input, expected/actual và log đã che dữ liệu. Mock không chứng minh PostgreSQL concurrency hay provider sandbox thật. Các tuần tài liệu dùng biên bản review thay kết quả test giả.

## Cổng tuần G06

**NOT EVALUATED**. PASS khi bốn tiêu chí tác vụ đạt, kiểm tra áp dụng đã chạy, hiện vật/biên bản đủ và không còn P0. CONDITIONAL chỉ cho P1 không chặn tuần sau, có chủ trì/hạn khắc phục. FAIL khi vi phạm quyền, invariant, bảo toàn hoặc thiết kế bắt buộc. Chưa có kết quả giữ NOT EVALUATED; không coi kế hoạch là bằng chứng triển khai.

## Mẫu báo cáo GVHD

| Mục | Nội dung điền |
|---|---|
| Kế hoạch | W06-T01…T04 |
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
