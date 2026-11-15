# Tiêu chí nghiệm thu và protocol nghiên cứu

## Gate và bằng chứng

G01–G12 hiện NOT EVALUATED. PASS khi đủ bốn đầu ra tuần, test áp dụng đã chạy, log có commit/môi trường/input/expected/actual và không P0. CONDITIONAL chỉ với P1 không chặn phụ thuộc, có owner/hạn. FAIL khi vi phạm quyền/invariant/bảo toàn. Thiếu kết quả giữ NOT EVALUATED. VERIFIED hiện vật không đồng nghĩa PASS chức năng.

## Điều kiện kỹ thuật

- DB: chốt 27 bảng/16 ENUM với bản chuẩn; diff từng cột/FK/index/check. Backup/restore rehearsal; mapping chưa rõ cách ly, không tự quy đổi. Đối soát count/checksum bản ghi, tồn từng đơn vị/lô, tổng tiền, orphan. Contract khóa nếu còn kiểm tra trọng yếu chưa chạy. Không xóa lịch sử hoặc coi cost 0 là cost thật.
- Kho: quantity=sum quantityRemaining theo lô và quy tắc đã duyệt; 0≤reserved≤quantity; available=quantity-reserved. FEFO không dùng lô hết hạn. Tổng/lô/ledger commit cùng transaction; race/rollback cần PostgreSQL bản sao, mock không đủ.
- Đơn: snapshot recipe/version và cost bất biến; reserve→commit; hủy trước pha release, sau pha theo waste/return đã chốt. Nhận hàng/kiểm kê replay không tạo movement lặp; thiếu/thừa/hỏng/đổi unit có nhánh xử lý.
- Thanh toán: verify signature/amount/ref/currency; event idempotent; state không lùi trái hợp đồng; reconciliation phát hiện missing/orphan/mismatch. Timeout giữ uncertain, không tự suy ra paid/failed.
- Agent: allowlist, validate I/O, principal active, budget, approval gắn hash/version và tái kiểm write. Read retry hữu hạn; write uncertain tra key/trạng thái, không retry mù; race/restart tối đa một PR. Lưu actor/approval/step/result và che secret. Không tự duyệt/gửi NCC/thanh toán.

## Dataset, baseline và quy trình đề xuất

Chưa có kết quả thực nghiệm. Khóa snapshot TLCN bằng commit độc lập trước nâng cấp; nếu không tái tạo được bản gốc phải ghi tên baseline và giới hạn. KLTN freeze W10. Cùng fixture, quyền, phần cứng, timeout/budget, seed; ghi mọi khác biệt model/config. Offline mock đo kiểm soát faults, online sandbox đo usage/latency thật khi được phép; báo riêng.

Đề xuất 80 case: 20 retrieval/kho, 15 NCC/đề xuất, 15 đa bước/HITL, 10 quyền/injection/validation, 10 timeout/restart/recovery, 10 duplicate/concurrency. Tách 20 phát triển và 60 đánh giá khóa trước đo, stratify đủ nhóm; không tune trên tập đánh giá. Mỗi case đánh giá 3 lần/hệ thống, thứ tự hoán vị seed cố định: 360 run ước lượng, cần xác nhận ngân sách. Fixture tổng hợp có SKU/lô/hạn/recipe/đơn vị/quy cách/giá, không PII. Labels gồm allowed tool sequences tương đương, expected outcome, forbidden writes và DB invariants; review hai người nếu đủ nhân lực, một người phải báo giới hạn.

| Metric | Định nghĩa/mẫu số |
|---|---|
| Task Success Rate | Run đạt expected outcome và mọi invariant / tất cả run hợp lệ đã lên lịch; lỗi/timeout tính thất bại |
| Tool Selection Accuracy | Quyết định tool đúng nhãn / quyết định có nhãn; thêm exact sequence. TLCN không có tool ghi N/A, không gán 0 tùy tiện |
| Invalid Action Rate | Đề nghị sai schema/quyền/quy tắc / tổng đề nghị; báo riêng bị chặn và đã commit sai |
| Business Rule Compliance | Run thỏa toàn bộ BR áp dụng / run có BR áp dụng; thêm phân nhóm BR |
| Latency | ms nhận task→terminal; p50/p95 và timeout; tách thời gian đợi người duyệt khỏi compute |
| API usage/cost | Call/token input/output từ provider; cost theo đơn giá xác nhận ngày chạy và nguồn giá/tiền tệ. Thiếu usage/cost ghi UNKNOWN |
| Recovery performance | Fault-injected run phục hồi đúng trong budget, giữ invariant / mọi fault-injected run; thêm recovery time và retry count |
| Duplicate prevention | Logical transactions có >1 committed write / tổng logical transactions bị replay/race; báo cả số chặn và DB state cuối |

So sánh paired theo case; báo n từng nhóm, độ phân tán repeat và CI bootstrap 95% lấy mẫu theo case, không coi repeat cùng case độc lập. Không loại run thất bại; exclusions phải ghi lý do. Nêu giới hạn tập tổng hợp, stochastic LLM, drift provider và nhãn. Chỉ kết luận cải thiện sau đo. Mục tiêu an toàn PROPOSED: 0 unauthorized committed write, 0 duplicate committed transaction, 0 invariant violation; ngưỡng TSR/latency/budget cần GVHD duyệt trước W11, hiện UNKNOWN.

Raw JSONL: runId, caseId, repeat, seed, dataset/schema/system/model/prompt version, role, timestamps, tool/args đã che/result/status, approval, retries, expected/actual, invariant checks, timeout/error/fallback, tokens/cost hoặc missing_reason. CSV: metric/cohort/numerator/denominator/value/CI/excluded_reason. Báo cáo: môi trường → protocol → kết quả → failure taxonomy → giới hạn. Mỗi số truy được raw run; không dùng lời model làm oracle.

## Checklist cuối

- [ ] Phạm vi, SQL chuẩn, lịch trường và vai trò xác nhận.
- [ ] DB 27/16, migration/restore/bảo toàn có chứng cứ thực.
- [ ] Nghiệp vụ/quyền/payment sandbox đạt test đã định.
- [ ] Tool Calling/HITL/recovery/idempotency có E2E trace.
- [ ] Dataset/raw metrics và so sánh tái lập được.
- [ ] Luận văn/demo/hướng dẫn/biên nhận thật.

Chưa đánh dấu mục nào; đây là kế hoạch.
