# Kế hoạch KLTN 12 tuần — 01/11/2026

## Mục tiêu và phạm vi

Nâng cấp TLCN quản lý quán cà phê theo nguyên liệu, với Agentic Workflow có kiểm soát là đóng góp trung tâm. Tái dùng React/Express/Prisma/Gemini và service nghiệp vụ; không tự thêm framework AI, multi-agent, training hoặc memory phức tạp. Phạm vi: sản phẩm/nguyên liệu/công thức/lô/hạn, mua/nhận, POS/pha/tiêu hao, kiểm kê/waste/COGS, một provider payment sandbox và quyền. Phiên này chỉ tạo tài liệu.

## Baseline và nâng cấp

[PROJECT_BASELINE.md](PROJECT_BASELINE.md) chứa nguồn: có CRUD/kho sản phẩm, Gemini JSON/rules, guards và mock tests. Prisma có 31 model chuyển tiếp/16 ENUM; bỏ bốn legacy dự kiến còn 27, cần xác nhận SQL chuẩn. Schema có thành phần KLTN không đồng nghĩa API/workflow hoàn tất. Payment/batch drift, SQL rehearsal và DB hiện hành chưa kiểm chứng là điểm chặn. Nâng cấp Inventory Engine nguyên liệu → service an toàn → registry/Calling → orchestration/HITL/recovery/idempotency → so sánh khoa học.

## Roadmap

| Tuần | Ngày 2026 | Trọng tâm |
|---|---|---|
| 1 | 05/10–10/10 | [Kiểm kê TLCN](WEEKS/WEEK_01.md) |
| 2 | 12/10–17/10 | [Yêu cầu nghiệp vụ](WEEKS/WEEK_02.md) |
| 3 | 19/10–24/10 | [Thiết kế DB/Agent](WEEKS/WEEK_03.md) |
| 4 | 26/10–31/10 | [Review và triển khai đầu](WEEKS/WEEK_04.md) |
| 5 | 02/11–07/11 | [Inventory Engine/công thức](WEEKS/WEEK_05.md) |
| 6 | 09/11–14/11 | [POS/kiểm kê/COGS](WEEKS/WEEK_06.md) |
| 7 | 16/11–21/11 | [Payment sandbox](WEEKS/WEEK_07.md) |
| 8 | 23/11–28/11 | [Registry/Tool Calling](WEEKS/WEEK_08.md) |
| 9 | 30/11–05/12 | [Workflow/recovery](WEEKS/WEEK_09.md) |
| 10 | 07/12–12/12 | [AI E2E và freeze](WEEKS/WEEK_10.md) |
| 11 | 14/12–19/12 | [Đánh giá so sánh](WEEKS/WEEK_11.md) |
| 12 | 21/12–26/12 | [Luận văn/demo/bảo vệ](WEEKS/WEEK_12.md) |

48 tác vụ, 30 giờ người/tuần, tổng 360 giờ người ước lượng; chưa xác nhận nhân lực, owner đều UNASSIGNED. Dự phòng đề xuất 20%=72 giờ là nhu cầu năng lực thêm, không mặc định có sẵn trong lịch. Ngày baseline chưa phải hạn trường xác nhận.

## Mốc và deliverables

G02 SRS/BR/phạm vi; G03 ERD/API/tool/protocol; G04 review và migration/restore bản sao; G05 inventory invariant; G06 POS/count/COGS; G07 payment/reconcile; G08 registry/Calling/HITL; G09 workflow/recovery/history; G10 E2E/freeze; G11 raw data/metrics; G12 luận văn/demo/biên nhận. Mọi gate hiện NOT EVALUATED.

Bộ kế hoạch: master, baseline, traceability, dependencies, risks, acceptance, tracker và 12 tuần. Đầu ra triển khai tương lai phải có hiện vật/version/test/biên bản, không lấy tài liệu kế hoạch làm bằng chứng chạy.

## Phụ thuộc và quality gates

Requirements → Business Rules → DB Design → Migration verified → Inventory Engine → Business APIs → AI Tools → Agentic Workflow → Integration Tests → Evaluation. [DEPENDENCIES.md](DEPENDENCIES.md) có đồ thị, blocker và chuẩn bị song song. [ACCEPTANCE_CRITERIA.md](ACCEPTANCE_CRITERIA.md) quy định PASS/CONDITIONAL/FAIL/NOT EVALUATED và invariant. Không cho downstream vượt gate đầu vào chưa đủ chứng cứ.

## Rủi ro và lịch phục hồi

[RISK_REGISTER.md](RISK_REGISTER.md): 10 rủi ro, 8 P0. Drift/mất dữ liệu, race kho, quyền, callbacks, LLM sai/Agent write uncertain và thiếu lịch/duyệt cần kiểm soát. DB bản sao, backup/restore, validation server, approval và key nguyên tử; contract giữ khóa.

Ngày 01/11 vừa hết khoảng W04, trước W05 bắt đầu 02/11. Chưa có nghiệm thu W01–04, không suy ra hoàn thành hoặc định lượng trễ từ ngày. [Tracker](WEEKLY_PROGRESS_TRACKER.md) có rà soát 02–07/11; nếu G04 chưa qua 09/11 cần dời hậu nhiệm và xin điều chỉnh lịch/phạm vi. Bảo vệ AI/evaluation, giới hạn một provider, không bỏ quyền/bảo toàn để kịp hạn.

## Nghiên cứu và đánh giá

Baseline TLCN snapshot so KLTN freeze, paired fixture/seed/quyền/budget. Đề xuất 80 case (20 phát triển/60 đánh giá), 3 repeat/hệ thống. Đo TSR/tool selection/invalid action/compliance/latency/API usage-cost/recovery/duplicate. Mock và sandbox báo riêng, baseline không có tool ghi N/A. Protocol, mẫu số, labels, raw JSONL/CSV và CI trong ACCEPTANCE_CRITERIA.md. Chưa có số đo hoặc kết luận cải thiện.

## Báo cáo, phê duyệt và quyết định

Mỗi tuần điền kế hoạch/đã làm/bằng chứng/khó khăn/tồn/tuần tới/câu hỏi GVHD/trạng thái gửi/duyệt. Không giả approval. [Traceability](REQUIREMENTS_TRACEABILITY.md) nối 16 nhóm yêu cầu → BR → DB/API/Agent → task → test → evidence. Baseline có 10 mục U01–U10 chưa xác minh.

Cần quyết định SQL chuẩn, mapping dữ liệu, hủy/pha/waste, COGS, approval storage trong mô hình hiện có, provider/model/budget, lịch trường, nhân lực và ngưỡng thực nghiệm. Không tự thêm bảng/ENUM để né quyết định.

## Checklist cuối

- [ ] Phạm vi/SQL 27-16/lịch/vai trò có xác nhận.
- [ ] Migration/restore/bảo toàn được chứng minh.
- [ ] Nghiệp vụ/quyền/payment sandbox có test.
- [ ] Calling/HITL/recovery/idempotency có trace.
- [ ] So sánh TLCN–KLTN tái lập được và kết luận đúng dữ liệu.
- [ ] Luận văn/demo/hướng dẫn/biên nhận nộp duyệt thật.

## Kiểm tra chất lượng kế hoạch

Đã kiểm tra cấu trúc: 19 Markdown, 12 tuần, 48 task ID duy nhất, đủ trường/tiêu chí/gate/báo cáo; không thiếu task tham chiếu hoặc liên kết cục bộ. Phụ thuộc task chỉ tiến theo số tuần/tác vụ, không có vòng. Git ban đầu sạch; sau tạo tài liệu chỉ có docs/ mới, toàn bộ tệp nằm trong docs/KLTN_PLAN/. Không chạy test/build ứng dụng, SQL, migration hoặc API ngoài. Kết quả này chỉ xác nhận chất lượng cấu trúc tài liệu, không nghiệm thu triển khai.
