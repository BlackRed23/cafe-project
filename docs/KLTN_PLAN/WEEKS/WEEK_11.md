# Tuần 11 — Đánh giá so sánh

## Thông tin tuần

- Ngày baseline: 14/12–19/12/2026, chưa là lịch trường đã duyệt.
- Mục tiêu: Đánh giá so sánh.
- Trạng thái PROPOSED; hiện vật liên quan PARTIAL theo [baseline](../PROJECT_BASELINE.md), chưa có chứng cứ nghiệm thu tuần.
- Chủ trì: UNASSIGNED. Công sức là ước lượng, chưa xác nhận năng lực nhóm.
- Tiền nhiệm: W10-T04; xem [phụ thuộc](../DEPENDENCIES.md).
- Rủi ro/chặn: U01–U10, R01–R10. Giảm thiểu: đóng drift P0 trước, dùng DB bản sao, giữ contract khóa, mock có nhãn, không retry write uncertain.
- Nội dung triển khai bên dưới là công việc tương lai; phiên lập kế hoạch không thực thi.

## W11-T01 — Chạy baseline/KLTN

| Trường | Nội dung |
|---|---|
| Task ID | W11-T01 |
| Tên tác vụ | Chạy baseline/KLTN |
| Mục đích | Chạy baseline/KLTN để hoàn thành mục tiêu tuần với bằng chứng kiểm tra được |
| Đầu vào | Thiết kế W03, kết quả gate tiền nhiệm, source theo baseline; gemini.service.ts, agent.service.ts, agent.repository.ts và system.prisma; xem đường dẫn trong PROJECT_BASELINE.md |
| Hoạt động | 1. Xác nhận đầu vào/môi trường. 2. Cùng case/fixture/budget, reset DB đánh giá riêng, lặp protocol. 3. Đối chiếu tiêu chí và lưu lỗi/bằng chứng |
| Đầu ra | Raw JSONL |
| Phụ thuộc | W10-T04 |
| Ưu tiên | P0 |
| Ước lượng | 8 giờ người, chưa cam kết |
| Tiêu chí chấp nhận | Ghi đủ lỗi/timeout/fallback, không dùng demo giả số đo |
| Bằng chứng | Hiện vật có version, biên bản/log TC-11-01, commit/môi trường/input/expected/actual; hiện chưa có kết quả |
| Trạng thái | PROPOSED |
| Người phụ trách | UNASSIGNED |

## W11-T02 — Tính metrics

| Trường | Nội dung |
|---|---|
| Task ID | W11-T02 |
| Tên tác vụ | Tính metrics |
| Mục đích | Tính metrics để hoàn thành mục tiêu tuần với bằng chứng kiểm tra được |
| Đầu vào | Thiết kế W03, kết quả gate tiền nhiệm, source theo baseline; gemini.service.ts, agent.service.ts, agent.repository.ts và system.prisma; xem đường dẫn trong PROJECT_BASELINE.md |
| Hoạt động | 1. Xác nhận đầu vào/môi trường. 2. TSR/tool/invalid/compliance/latency/cost/recovery/duplicate. 3. Đối chiếu tiêu chí và lưu lỗi/bằng chứng |
| Đầu ra | CSV tổng hợp |
| Phụ thuộc | W11-T01 |
| Ưu tiên | P0 |
| Ước lượng | 8 giờ người, chưa cam kết |
| Tiêu chí chấp nhận | Mọi số truy ngược run; missing/mẫu số rõ |
| Bằng chứng | Hiện vật có version, biên bản/log TC-11-02, commit/môi trường/input/expected/actual; hiện chưa có kết quả |
| Trạng thái | PROPOSED |
| Người phụ trách | UNASSIGNED |

## W11-T03 — Phân tích giới hạn

| Trường | Nội dung |
|---|---|
| Task ID | W11-T03 |
| Tên tác vụ | Phân tích giới hạn |
| Mục đích | Phân tích giới hạn để hoàn thành mục tiêu tuần với bằng chứng kiểm tra được |
| Đầu vào | Thiết kế W03, kết quả gate tiền nhiệm, source theo baseline; gemini.service.ts, agent.service.ts, agent.repository.ts và system.prisma; xem đường dẫn trong PROJECT_BASELINE.md |
| Hoạt động | 1. Xác nhận đầu vào/môi trường. 2. Paired cases, bootstrap CI, failure taxonomy; ablation nếu đủ budget. 3. Đối chiếu tiêu chí và lưu lỗi/bằng chứng |
| Đầu ra | Chương kết quả |
| Phụ thuộc | W11-T02 |
| Ưu tiên | P0 |
| Ước lượng | 8 giờ người, chưa cam kết |
| Tiêu chí chấp nhận | Không bỏ case thất bại hoặc kết luận vượt dữ liệu |
| Bằng chứng | Hiện vật có version, biên bản/log TC-11-03, commit/môi trường/input/expected/actual; hiện chưa có kết quả |
| Trạng thái | PROPOSED |
| Người phụ trách | UNASSIGNED |

## W11-T04 — Review/đóng lỗi

| Trường | Nội dung |
|---|---|
| Task ID | W11-T04 |
| Tên tác vụ | Review/đóng lỗi |
| Mục đích | Review/đóng lỗi để hoàn thành mục tiêu tuần với bằng chứng kiểm tra được |
| Đầu vào | Thiết kế W03, kết quả gate tiền nhiệm, source theo baseline; gemini.service.ts, agent.service.ts, agent.repository.ts và system.prisma; xem đường dẫn trong PROJECT_BASELINE.md |
| Hoạt động | 1. Xác nhận đầu vào/môi trường. 2. Triage P0/P1, rerun phần sửa trong đợt riêng, GVHD review. 3. Đối chiếu tiêu chí và lưu lỗi/bằng chứng |
| Đầu ra | Biên bản khoa học |
| Phụ thuộc | W11-T03 |
| Ưu tiên | P1 |
| Ước lượng | 6 giờ người, chưa cam kết |
| Tiêu chí chấp nhận | Phiên bản và kết quả rerun đầy đủ, approval thực |
| Bằng chứng | Hiện vật có version, biên bản/log TC-11-04, commit/môi trường/input/expected/actual; hiện chưa có kết quả |
| Trạng thái | PROPOSED |
| Người phụ trách | UNASSIGNED |

## Phạm vi kỹ thuật

| Lĩnh vực | Công việc |
|---|---|
| Database | DB đánh giá riêng |
| Backend | Harness và fault injector |
| Frontend | NOT APPLICABLE — không thêm UI |
| AI Agent | Paired evaluation/failure taxonomy |
| Bảo mật | Đo invalid/unauthorized |
| Tích hợp | Mock và online báo riêng |
| Tài liệu | Metrics/raw evidence/CI |

## Kiểm thử

| Loại | Kế hoạch |
|---|---|
| Unit | Validator, tính toán và chuyển trạng thái thuộc tác vụ 01; không mirror implementation |
| Integration | DB/API/tool boundary, inject lỗi giữa write, kiểm rollback trên bản sao |
| E2E | Chuỗi nghiệp vụ tuần, input cố định; lưu trace và expected/actual |
| Nghiệp vụ | Đối chiếu tiêu chí bốn tác vụ; sai actor, thiếu tồn, sai đơn vị, hết hạn, hủy, thao tác trùng |
| AI | Tool selection, quyền, injection, timeout và recovery theo golden labels |
| Biên/âm | Empty/âm/NaN, stale state, double submit, lỗi phụ thuộc và chưa được duyệt; áp dụng theo đầu ra tuần |

TC-11-01…04 ánh xạ lần lượt bốn tác vụ, dùng tiêu chí chấp nhận làm oracle. Bằng chứng phải có version, lệnh, môi trường, input, expected/actual và log đã che dữ liệu. Mock không chứng minh PostgreSQL concurrency hay provider sandbox thật. Các tuần tài liệu dùng biên bản review thay kết quả test giả.

## Cổng tuần G11

**NOT EVALUATED**. PASS khi bốn tiêu chí tác vụ đạt, kiểm tra áp dụng đã chạy, hiện vật/biên bản đủ và không còn P0. CONDITIONAL chỉ cho P1 không chặn tuần sau, có chủ trì/hạn khắc phục. FAIL khi vi phạm quyền, invariant, bảo toàn hoặc thiết kế bắt buộc. Chưa có kết quả giữ NOT EVALUATED; không coi kế hoạch là bằng chứng triển khai.

## Mẫu báo cáo GVHD

| Mục | Nội dung điền |
|---|---|
| Kế hoạch | W11-T01…T04 |
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
