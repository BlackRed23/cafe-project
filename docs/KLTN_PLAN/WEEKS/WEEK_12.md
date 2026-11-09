# Tuần 12 — Luận văn, demo và bảo vệ

## Thông tin tuần

- Ngày baseline: 21/12–26/12/2026, chưa là lịch trường đã duyệt.
- Mục tiêu: Luận văn, demo và bảo vệ.
- Trạng thái PROPOSED; hiện vật liên quan PARTIAL theo [baseline](../PROJECT_BASELINE.md), chưa có chứng cứ nghiệm thu tuần.
- Chủ trì: UNASSIGNED. Công sức là ước lượng, chưa xác nhận năng lực nhóm.
- Tiền nhiệm: W11-T04; xem [phụ thuộc](../DEPENDENCIES.md).
- Rủi ro/chặn: U01–U10, R01–R10. Giảm thiểu: đóng drift P0 trước, dùng DB bản sao, giữ contract khóa, mock có nhãn, không retry write uncertain.
- Nội dung triển khai bên dưới là công việc tương lai; phiên lập kế hoạch không thực thi.

## W12-T01 — Hoàn thiện báo cáo

| Trường | Nội dung |
|---|---|
| Task ID | W12-T01 |
| Tên tác vụ | Hoàn thiện báo cáo |
| Mục đích | Hoàn thiện báo cáo để hoàn thành mục tiêu tuần với bằng chứng kiểm tra được |
| Đầu vào | Thiết kế W03, kết quả gate tiền nhiệm, source theo baseline; gemini.service.ts, agent.service.ts, agent.repository.ts và system.prisma; xem đường dẫn trong PROJECT_BASELINE.md |
| Hoạt động | 1. Xác nhận đầu vào/môi trường. 2. Kiến trúc/phương pháp/kết quả thực/giới hạn và phụ lục. 3. Đối chiếu tiêu chí và lưu lỗi/bằng chứng |
| Đầu ra | Luận văn |
| Phụ thuộc | W11-T04 |
| Ưu tiên | P0 |
| Ước lượng | 8 giờ người, chưa cam kết |
| Tiêu chí chấp nhận | Bảng số có raw evidence, không secret/PII |
| Bằng chứng | Hiện vật có version, biên bản/log TC-12-01, commit/môi trường/input/expected/actual; hiện chưa có kết quả |
| Trạng thái | PROPOSED |
| Người phụ trách | UNASSIGNED |

## W12-T02 — Đóng gói demo

| Trường | Nội dung |
|---|---|
| Task ID | W12-T02 |
| Tên tác vụ | Đóng gói demo |
| Mục đích | Đóng gói demo để hoàn thành mục tiêu tuần với bằng chứng kiểm tra được |
| Đầu vào | Thiết kế W03, kết quả gate tiền nhiệm, source theo baseline; gemini.service.ts, agent.service.ts, agent.repository.ts và system.prisma; xem đường dẫn trong PROJECT_BASELINE.md |
| Hoạt động | 1. Xác nhận đầu vào/môi trường. 2. Fixture/hướng dẫn/happy-negative-recovery, offline có nhãn. 3. Đối chiếu tiêu chí và lưu lỗi/bằng chứng |
| Đầu ra | Gói demo |
| Phụ thuộc | W12-T01 |
| Ưu tiên | P0 |
| Ước lượng | 8 giờ người, chưa cam kết |
| Tiêu chí chấp nhận | Người khác tái lập được, offline không giả provider thật |
| Bằng chứng | Hiện vật có version, biên bản/log TC-12-02, commit/môi trường/input/expected/actual; hiện chưa có kết quả |
| Trạng thái | PROPOSED |
| Người phụ trách | UNASSIGNED |

## W12-T03 — Diễn tập bảo vệ

| Trường | Nội dung |
|---|---|
| Task ID | W12-T03 |
| Tên tác vụ | Diễn tập bảo vệ |
| Mục đích | Diễn tập bảo vệ để hoàn thành mục tiêu tuần với bằng chứng kiểm tra được |
| Đầu vào | Thiết kế W03, kết quả gate tiền nhiệm, source theo baseline; gemini.service.ts, agent.service.ts, agent.repository.ts và system.prisma; xem đường dẫn trong PROJECT_BASELINE.md |
| Hoạt động | 1. Xác nhận đầu vào/môi trường. 2. Slide, hỏi đáp 27/16, concurrency, quyền và hiệu quả. 3. Đối chiếu tiêu chí và lưu lỗi/bằng chứng |
| Đầu ra | Slide/biên bản |
| Phụ thuộc | W12-T02 |
| Ưu tiên | P0 |
| Ước lượng | 8 giờ người, chưa cam kết |
| Tiêu chí chấp nhận | Nêu rõ đóng góp và giới hạn quan sát được |
| Bằng chứng | Hiện vật có version, biên bản/log TC-12-03, commit/môi trường/input/expected/actual; hiện chưa có kết quả |
| Trạng thái | PROPOSED |
| Người phụ trách | UNASSIGNED |

## W12-T04 — Nộp/bàn giao

| Trường | Nội dung |
|---|---|
| Task ID | W12-T04 |
| Tên tác vụ | Nộp/bàn giao |
| Mục đích | Nộp/bàn giao để hoàn thành mục tiêu tuần với bằng chứng kiểm tra được |
| Đầu vào | Thiết kế W03, kết quả gate tiền nhiệm, source theo baseline; gemini.service.ts, agent.service.ts, agent.repository.ts và system.prisma; xem đường dẫn trong PROJECT_BASELINE.md |
| Hoạt động | 1. Xác nhận đầu vào/môi trường. 2. Theo lịch xác nhận, rubric, hash bản nộp, biên nhận. 3. Đối chiếu tiêu chí và lưu lỗi/bằng chứng |
| Đầu ra | Hồ sơ nộp |
| Phụ thuộc | W12-T03 |
| Ưu tiên | P1 |
| Ước lượng | 6 giờ người, chưa cam kết |
| Tiêu chí chấp nhận | Chỉ ghi đã nộp/duyệt khi có bằng chứng thật |
| Bằng chứng | Hiện vật có version, biên bản/log TC-12-04, commit/môi trường/input/expected/actual; hiện chưa có kết quả |
| Trạng thái | PROPOSED |
| Người phụ trách | UNASSIGNED |

## Phạm vi kỹ thuật

| Lĩnh vực | Công việc |
|---|---|
| Database | NOT APPLICABLE — không đổi DB |
| Backend | NOT APPLICABLE — đóng băng |
| Frontend | Demo giao diện đã có |
| AI Agent | Trình bày đóng góp và giới hạn |
| Bảo mật | Che PII/secret bàn giao |
| Tích hợp | Demo offline/sandbox có nhãn |
| Tài liệu | Luận văn/slide/biên nhận |

## Kiểm thử

| Loại | Kế hoạch |
|---|---|
| Unit | Validator, tính toán và chuyển trạng thái thuộc tác vụ 01; không mirror implementation |
| Integration | DB/API/tool boundary, inject lỗi giữa write, kiểm rollback trên bản sao |
| E2E | Chuỗi nghiệp vụ tuần, input cố định; lưu trace và expected/actual |
| Nghiệp vụ | Đối chiếu tiêu chí bốn tác vụ; sai actor, thiếu tồn, sai đơn vị, hết hạn, hủy, thao tác trùng |
| AI | NOT APPLICABLE — chưa đo Agent tuần này; review protocol nếu thuộc W03 |
| Biên/âm | Empty/âm/NaN, stale state, double submit, lỗi phụ thuộc và chưa được duyệt; áp dụng theo đầu ra tuần |

TC-12-01…04 ánh xạ lần lượt bốn tác vụ, dùng tiêu chí chấp nhận làm oracle. Bằng chứng phải có version, lệnh, môi trường, input, expected/actual và log đã che dữ liệu. Mock không chứng minh PostgreSQL concurrency hay provider sandbox thật. Các tuần tài liệu dùng biên bản review thay kết quả test giả.

## Cổng tuần G12

**NOT EVALUATED**. PASS khi bốn tiêu chí tác vụ đạt, kiểm tra áp dụng đã chạy, hiện vật/biên bản đủ và không còn P0. CONDITIONAL chỉ cho P1 không chặn tuần sau, có chủ trì/hạn khắc phục. FAIL khi vi phạm quyền, invariant, bảo toàn hoặc thiết kế bắt buộc. Chưa có kết quả giữ NOT EVALUATED; không coi kế hoạch là bằng chứng triển khai.

## Mẫu báo cáo GVHD

| Mục | Nội dung điền |
|---|---|
| Kế hoạch | W12-T01…T04 |
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
