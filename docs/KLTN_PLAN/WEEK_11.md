# Tuần 11 Đánh giá so sánh

## 1. Thông tin tuần

- **Tuần và thời gian:** 11, 14/12–19/12/2026; baseline đề xuất, chưa xác minh hạn trường. Các tuần là luồng công việc, không mặc định đã hoàn tất theo ngày.
- **Mục tiêu:** Đánh giá so sánh, tái dùng TLCN và hoàn thiện phần thiếu, giữ AI Agent là đóng góp trung tâm.
- **Ngày kiểm kê:** 01/11/2026, Asia/Saigon; cuối khoảng W04, trước W05 ngày 02/11. Phiên này chỉ đọc source/tài liệu, không chạy build/test/SQL/migration/ứng dụng hoặc dịch vụ ngoài.
- **Tình trạng:** PARTIAL ở mức mã/schema; chưa có task nghiệm thu trọn tiêu chí. Test/runtime và duyệt GVHD: UNKNOWN.
- **Phụ thuộc:** [W10-T04](WEEK_10.md#w10-t04), [W03-T04](WEEK_03.md#w03-t04). Chuẩn bị thiết kế/fixture/mock có thể song song; write chờ gate tiên quyết.
- **Nhân lực:** UNASSIGNED. Công sức 30 giờ người/tuần (8+8+8+6) là ước lượng chưa cam kết, 360 giờ toàn kỳ chưa gồm dự phòng, cần tái ước lượng khi rõ nhân lực.

**Quy ước:** VERIFIED xác nhận nhận định hẹp có hiện vật/mã; PARTIAL mới có một phần; MISSING chưa tìm thấy hiện vật trong phạm vi quét; UNKNOWN thiếu bằng chứng để kết luận; PLANNED là việc dự kiến. VERIFIED schema hoặc test definition không đồng nghĩa task xong hay test PASS.

**Báo cáo tham chiếu:** chưa tìm thấy bao-cao-tuan.docx trong repository, D:/KLTN hoặc attachments đã quét (MISSING). Không coi các tuyên bố được yêu cầu kiểm tra trong prompt là nội dung báo cáo đã đọc. Mục 8 dùng đúng cấu trúc bạn cung cấp; nếu nhận bản gốc thì đối chiếu trong task hiện có.

**Đường găng chung:** yêu cầu/quy tắc W02 → DB/API/Agent design W03 → migration rehearsal W04 → Inventory Engine W05 → business services W06 → tools/quyền W08 → workflow/recovery W09 → E2E/freeze W10 → evaluation W11. Thanh toán W07 là nhánh bắt buộc trước E2E W10. Không đợi W07 để chuẩn bị read/mock tools nếu nghiệp vụ/quyền đã đủ; không chạy write tools trước gate tương ứng. Các cạnh cụ thể ở mỗi task, không có vòng.

## 2. Công việc đã hoàn thành

**Chưa xác minh hoàn thành trọn vẹn task nào của tuần.** Phần nền tảng hiện hữu được ghi dưới đây theo source, không suy từ sự tồn tại file thành nghiệm thu KLTN. Tái dùng phần phù hợp, chỉ review/hồi quy/thích nghi/tích hợp thay vì dựng lại.

| Task ID liên quan | Nội dung và kết quả quan sát | File source hoặc tài liệu chứng minh | Kết quả kiểm thử | Trạng thái xác minh task |
|---|---|---|---|---|
| W11-T01 | Có bảy tệp test TLCN, chưa có raw benchmark so sánh | [apps/api/tests/inventory-consistency.test.cjs](../../apps/api/tests/inventory-consistency.test.cjs); [apps/api/tests/inventory-ui-contract.test.cjs](../../apps/api/tests/inventory-ui-contract.test.cjs); [apps/api/tests/auth-registration.test.cjs](../../apps/api/tests/auth-registration.test.cjs); [apps/api/tests/test-db-security.test.cjs](../../apps/api/tests/test-db-security.test.cjs); [apps/agent/tests/internal-auth.test.cjs](../../apps/agent/tests/internal-auth.test.cjs); [apps/agent/tests/principal-guards.test.cjs](../../apps/agent/tests/principal-guards.test.cjs); [apps/agent/tests/rule-based-regression.test.cjs](../../apps/agent/tests/rule-based-regression.test.cjs) | UNKNOWN — chưa có log hiện hành được xác minh, phiên này không chạy test | PARTIAL; chưa nghiệm thu task |
| W11-T02 | Evaluation/token/cost có schema, default 0 không là usage thực | [packages/database/prisma/schema/system.prisma](../../packages/database/prisma/schema/system.prisma) | UNKNOWN — chưa có log hiện hành được xác minh, phiên này không chạy test | PARTIAL; chưa nghiệm thu task |
| W11-T03 | Chưa có kết quả benchmark đo; target kế hoạch không phải measurement | [apps/agent/tests/rule-based-regression.test.cjs](../../apps/agent/tests/rule-based-regression.test.cjs); [docs/KLTN_PLAN/ACCEPTANCE_CRITERIA.md](../../docs/KLTN_PLAN/ACCEPTANCE_CRITERIA.md) | UNKNOWN — chưa có log hiện hành được xác minh, phiên này không chạy test | UNKNOWN; chưa nghiệm thu task |

## 3. Công việc cần thực hiện

Các bước triển khai/kiểm thử bên dưới là kế hoạch cho đợt thực hiện riêng. Phiên này chỉ tạo 12 Markdown; không thay đổi mã hoặc tài liệu cũ. Các ID giữ tương ứng bộ kế hoạch trước để không nhân bản công việc.

<a id="w11-t01"></a>

### W11-T01 Chạy baseline/KLTN

- **Task ID:** W11-T01; **trạng thái:** PLANNED; **người thực hiện:** UNASSIGNED. Phần nền tảng ở mục 2 có thể PARTIAL, chưa đủ để đóng task.
- **Mục tiêu:** hoàn thiện Raw JSONL phục vụ đánh giá so sánh, tái dùng phần hiện hữu phù hợp.
- **Đầu vào:** các source và giới hạn chứng cứ trong mục 2/4; kết quả có bằng chứng từ [W10-T04](WEEK_10.md#w10-t04), [W03-T04](WEEK_03.md#w03-t04); trường hợp cần nguồn ngoài chưa có giữ UNKNOWN.
- **Hoạt động từng bước:**
  1. Đọc đúng phiên bản đầu vào, xác định phần đủ để chỉ hồi quy/tích hợp.
  2. Cùng case/fixture/budget, reset DB đánh giá riêng, lặp protocol.
  3. Đối chiếu ngoại lệ, quyền và invariant tại mục 4; ghi quyết định mở, không tự mở scope.
  4. Chạy kiểm tra TC-11-01 ở mục 5 trong môi trường phù hợp, lưu expected/actual và giới hạn mock.
  5. Đóng tiêu chí bằng hiện vật/log/biên bản, cập nhật mục 8 theo kết quả thật.
- **Đầu ra:** Raw JSONL, có phiên bản, danh sách tái dùng/thay đổi và lỗi còn mở.
- **Ưu tiên:** P0; **ước lượng:** 8 giờ người, chưa cam kết.
- **Phụ thuộc:** [W10-T04](WEEK_10.md#w10-t04), [W03-T04](WEEK_03.md#w03-t04).
- **Tiêu chí chấp nhận:** Ghi đủ lỗi/timeout/fallback, không dùng demo giả số đo. Có input/expected/actual, source/version hiện vật và không còn P0 trong phạm vi task.
- **Bằng chứng cần thu:** TC-11-01, commit/schema/fixture hoặc biên bản review có ngày/version; hiện chưa có kết quả thực.

<a id="w11-t02"></a>

### W11-T02 Tính metrics

- **Task ID:** W11-T02; **trạng thái:** PLANNED; **người thực hiện:** UNASSIGNED. Phần nền tảng ở mục 2 có thể PARTIAL, chưa đủ để đóng task.
- **Mục tiêu:** hoàn thiện CSV tổng hợp phục vụ đánh giá so sánh, tái dùng phần hiện hữu phù hợp.
- **Đầu vào:** các source và giới hạn chứng cứ trong mục 2/4; kết quả có bằng chứng từ [W11-T01](WEEK_11.md#w11-t01); trường hợp cần nguồn ngoài chưa có giữ UNKNOWN.
- **Hoạt động từng bước:**
  1. Đọc đúng phiên bản đầu vào, xác định phần đủ để chỉ hồi quy/tích hợp.
  2. TSR/tool/invalid/compliance/latency/cost/recovery/duplicate.
  3. Đối chiếu ngoại lệ, quyền và invariant tại mục 4; ghi quyết định mở, không tự mở scope.
  4. Chạy kiểm tra TC-11-02 ở mục 5 trong môi trường phù hợp, lưu expected/actual và giới hạn mock.
  5. Đóng tiêu chí bằng hiện vật/log/biên bản, cập nhật mục 8 theo kết quả thật.
- **Đầu ra:** CSV tổng hợp, có phiên bản, danh sách tái dùng/thay đổi và lỗi còn mở.
- **Ưu tiên:** P0; **ước lượng:** 8 giờ người, chưa cam kết.
- **Phụ thuộc:** [W11-T01](WEEK_11.md#w11-t01).
- **Tiêu chí chấp nhận:** Mọi số truy ngược run; missing/mẫu số rõ. Có input/expected/actual, source/version hiện vật và không còn P0 trong phạm vi task.
- **Bằng chứng cần thu:** TC-11-02, commit/schema/fixture hoặc biên bản review có ngày/version; hiện chưa có kết quả thực.

<a id="w11-t03"></a>

### W11-T03 Phân tích giới hạn

- **Task ID:** W11-T03; **trạng thái:** PLANNED; **người thực hiện:** UNASSIGNED. Phần nền tảng ở mục 2 có thể PARTIAL, chưa đủ để đóng task.
- **Mục tiêu:** hoàn thiện Chương kết quả phục vụ đánh giá so sánh, tái dùng phần hiện hữu phù hợp.
- **Đầu vào:** các source và giới hạn chứng cứ trong mục 2/4; kết quả có bằng chứng từ [W11-T02](WEEK_11.md#w11-t02); trường hợp cần nguồn ngoài chưa có giữ UNKNOWN.
- **Hoạt động từng bước:**
  1. Đọc đúng phiên bản đầu vào, xác định phần đủ để chỉ hồi quy/tích hợp.
  2. Paired cases, bootstrap CI, failure taxonomy; ablation nếu đủ budget.
  3. Đối chiếu ngoại lệ, quyền và invariant tại mục 4; ghi quyết định mở, không tự mở scope.
  4. Chạy kiểm tra TC-11-03 ở mục 5 trong môi trường phù hợp, lưu expected/actual và giới hạn mock.
  5. Đóng tiêu chí bằng hiện vật/log/biên bản, cập nhật mục 8 theo kết quả thật.
- **Đầu ra:** Chương kết quả, có phiên bản, danh sách tái dùng/thay đổi và lỗi còn mở.
- **Ưu tiên:** P0; **ước lượng:** 8 giờ người, chưa cam kết.
- **Phụ thuộc:** [W11-T02](WEEK_11.md#w11-t02).
- **Tiêu chí chấp nhận:** Không bỏ case thất bại hoặc kết luận vượt dữ liệu. Có input/expected/actual, source/version hiện vật và không còn P0 trong phạm vi task.
- **Bằng chứng cần thu:** TC-11-03, commit/schema/fixture hoặc biên bản review có ngày/version; hiện chưa có kết quả thực.

<a id="w11-t04"></a>

### W11-T04 Review/đóng lỗi

- **Task ID:** W11-T04; **trạng thái:** PLANNED; **người thực hiện:** UNASSIGNED. Phần nền tảng ở mục 2 có thể PARTIAL, chưa đủ để đóng task.
- **Mục tiêu:** hoàn thiện Biên bản khoa học phục vụ đánh giá so sánh, tái dùng phần hiện hữu phù hợp.
- **Đầu vào:** các source và giới hạn chứng cứ trong mục 2/4; kết quả có bằng chứng từ [W11-T03](WEEK_11.md#w11-t03); trường hợp cần nguồn ngoài chưa có giữ UNKNOWN.
- **Hoạt động từng bước:**
  1. Đọc đúng phiên bản đầu vào, xác định phần đủ để chỉ hồi quy/tích hợp.
  2. Triage P0/P1, rerun phần sửa trong đợt riêng, GVHD review.
  3. Đối chiếu ngoại lệ, quyền và invariant tại mục 4; ghi quyết định mở, không tự mở scope.
  4. Chạy kiểm tra TC-11-04 ở mục 5 trong môi trường phù hợp, lưu expected/actual và giới hạn mock.
  5. Đóng tiêu chí bằng hiện vật/log/biên bản, cập nhật mục 8 theo kết quả thật.
- **Đầu ra:** Biên bản khoa học, có phiên bản, danh sách tái dùng/thay đổi và lỗi còn mở.
- **Ưu tiên:** P1; **ước lượng:** 6 giờ người, chưa cam kết.
- **Phụ thuộc:** [W11-T03](WEEK_11.md#w11-t03).
- **Tiêu chí chấp nhận:** Phiên bản và kết quả rerun đầy đủ, approval thực. Có input/expected/actual, source/version hiện vật và không còn P0 trong phạm vi task.
- **Bằng chứng cần thu:** TC-11-04, commit/schema/fixture hoặc biên bản review có ngày/version; hiện chưa có kết quả thực.

### Công việc tồn và điều chỉnh lịch

Chưa có chứng cứ nghiệm thu toàn bộ task trước; giữ nguyên ID, tiếp tục task gốc thay vì tạo lại thành việc triển khai mới:

| Tuần nguồn | Task chưa đóng hoặc chờ xác minh | Xử lý |
|---|---|---|
| [Tuần 01](WEEK_01.md) | W01-T01, W01-T02, W01-T03, W01-T04 | Thu bằng chứng, đóng task gốc; chặn write hậu nhiệm nếu chưa đạt tiên quyết |
| [Tuần 02](WEEK_02.md) | W02-T01, W02-T02, W02-T03, W02-T04 | Thu bằng chứng, đóng task gốc; chặn write hậu nhiệm nếu chưa đạt tiên quyết |
| [Tuần 03](WEEK_03.md) | W03-T01, W03-T02, W03-T03, W03-T04 | Thu bằng chứng, đóng task gốc; chặn write hậu nhiệm nếu chưa đạt tiên quyết |
| [Tuần 04](WEEK_04.md) | W04-T01, W04-T02, W04-T03, W04-T04 | Thu bằng chứng, đóng task gốc; chặn write hậu nhiệm nếu chưa đạt tiên quyết |
| [Tuần 05](WEEK_05.md) | W05-T01, W05-T02, W05-T03, W05-T04 | Thu bằng chứng, đóng task gốc; chặn write hậu nhiệm nếu chưa đạt tiên quyết |
| [Tuần 06](WEEK_06.md) | W06-T01, W06-T02, W06-T03, W06-T04 | Thu bằng chứng, đóng task gốc; chặn write hậu nhiệm nếu chưa đạt tiên quyết |
| [Tuần 07](WEEK_07.md) | W07-T01, W07-T02, W07-T03, W07-T04 | Thu bằng chứng, đóng task gốc; chặn write hậu nhiệm nếu chưa đạt tiên quyết |
| [Tuần 08](WEEK_08.md) | W08-T01, W08-T02, W08-T03, W08-T04 | Thu bằng chứng, đóng task gốc; chặn write hậu nhiệm nếu chưa đạt tiên quyết |
| [Tuần 09](WEEK_09.md) | W09-T01, W09-T02, W09-T03, W09-T04 | Thu bằng chứng, đóng task gốc; chặn write hậu nhiệm nếu chưa đạt tiên quyết |
| [Tuần 10](WEEK_10.md) | W10-T01, W10-T02, W10-T03, W10-T04 | Thu bằng chứng, đóng task gốc; chặn write hậu nhiệm nếu chưa đạt tiên quyết |

**Khi chậm:** tái ước lượng giờ còn lại theo ID gốc; dời write phụ thuộc sau gate. Thiết kế/mock/luận văn có thể chuẩn bị song song khi có owner. Nếu không đủ tới 26/12 thì xin đổi lịch hoặc giảm phụ trợ, không bỏ AI/evaluation/quyền/bảo toàn. Giữ nguyên baseline để đối chiếu.

## 4. Thiết kế và triển khai kỹ thuật

| Lĩnh vực | Công việc |
|---|---|
| Database | DB đánh giá riêng |
| Backend | Harness và fault injector |
| Frontend | NOT APPLICABLE — không thêm UI |
| AI Agent | Paired evaluation/failure taxonomy |
| Security | Đo invalid/unauthorized |
| Integration | Mock và online báo riêng |


Các yêu cầu trong bảng là PLANNED. Chi tiết nguồn, xác minh và ranh giới nghiệp vụ:

Các benchmark là protocol/target PLANNED, chưa có measurement. [packages/database/prisma/schema/system.prisma](../../packages/database/prisma/schema/system.prisma) có token/cost default 0, không được dùng làm usage/cost đo thật. [apps/agent/tests/rule-based-regression.test.cjs](../../apps/agent/tests/rule-based-regression.test.cjs) chỉ chứa định nghĩa test fallback, không chứng minh TSR/latency cải thiện. Giữ TLCN snapshot riêng và KLTN freeze, cùng fixture/quyền/budget; mỗi số phải truy raw run.

## 5. Kiểm thử và đánh giá

**Kết quả thực: UNKNOWN.** Chưa có log nghiệm thu tuần được xác minh và phiên này không chạy test. Bảng sau là scenario/expected, không phải kết quả PASS.

| Test ID và task | Kịch bản | Kết quả kỳ vọng | Điều kiện chấp nhận và bằng chứng |
|---|---|---|---|
| TC-11-01 → W11-T01 | Paired TLCN/KLTN | Run có case/repeat/version, không bỏ lỗi/timeout | Expected khớp actual, có log hoặc biên bản review ngày/version; sai lệch trọng yếu chặn task |
| TC-11-02 → W11-T02 | Metrics/raw linkage | Mẫu số/missing đúng, usage thật không default 0 | Expected khớp actual, có log hoặc biên bản review ngày/version; sai lệch trọng yếu chặn task |
| TC-11-03 → W11-T03 | CI/failure taxonomy | Lấy mẫu theo case, TLCN không tool N/A, không kết luận vượt dữ liệu | Expected khớp actual, có log hoặc biên bản review ngày/version; sai lệch trọng yếu chặn task |
| TC-11-04 → W11-T04 | Triage/rerun/review | Sửa có version và rerun, không cherry-pick hoặc giả approval | Expected khớp actual, có log hoặc biên bản review ngày/version; sai lệch trọng yếu chặn task |

**Mức kiểm thử:** Unit validator/tính toán/state machine; integration transaction/quyền/service hoặc provider boundary; E2E chuỗi nghiệp vụ tuần. Kiểm thử bắt đầu ngay trong tuần triển khai, không đợi W11. Negative/edge: role sai, dữ liệu trống/âm/NaN, state stale, double submit, lỗi phụ thuộc và timeout áp dụng theo từng scenario.

**Bằng chứng tối thiểu:** commit/checksum, schema/fixture/model/prompt version khi liên quan, môi trường, command/procedure, input, expected/actual, timestamp, log che dữ liệu. Mock không chứng minh concurrency/rollback PostgreSQL hoặc provider thật. Không áp dụng ghi NOT APPLICABLE và lý do, không tự đổi thành PASS.

### Protocol thí nghiệm và định dạng kết quả

**PLANNED, chưa có measurements.** Khóa TLCN bằng commit/snapshot độc lập trước nâng cấp, KLTN bằng manifest W10-T04. Nếu không tái tạo được TLCN gốc thì phải ghi baseline thực sự và giới hạn; không lấy nhánh đã nâng cấp gọi là TLCN nguyên bản. Cùng fixture nghiệp vụ, quyền, phần cứng, timeout, ngân sách và seed; ghi mọi khác biệt model/prompt/config. Offline mock để kiểm soát faults và online sandbox để đo provider/usage thật báo riêng.

Dataset đề xuất 80 case tổng hợp không PII: 20 retrieval/kho, 15 NCC/đề xuất mua, 15 đa bước/HITL, 10 quyền/injection/validation, 10 recovery/timeout/restart, 10 replay/race. Stratify 20 case phát triển và 60 đánh giá khóa trước đo; không tune trên 60 case đánh giá. Labels gồm allowed tool sequences tương đương, expected business outcome, forbidden writes và oracle DB invariant. Fixture có SKU/lô/hạn/recipe/yield/đơn vị/quy cách/MOQ/lead-time/giá/NCC inactive. Review nhãn hai người nếu đủ nhân lực, nếu chỉ một người phải nêu giới hạn.

Mỗi case đánh giá chạy 3 repeat/hệ thống, hoán vị thứ tự seed cố định; 60×3×2 = 360 run ước lượng, ngân sách cần duyệt trước. Reset fixture trên DB đánh giá riêng theo run, giữ input giống nhau. Lỗi, timeout và fallback phải lưu đầy đủ; không loại run xấu để tăng chỉ số. Nếu giảm số run vì ngân sách thì chốt protocol version trước đo và báo n thực tế.

| Metric | Công thức và quy tắc đo |
|---|---|
| Task Success Rate | Run đạt expected outcome và mọi invariant / toàn bộ run hợp lệ đã lên lịch; lỗi và timeout tính không đạt |
| Tool Selection Accuracy | Quyết định tool khớp nhãn / quyết định có nhãn; thêm exact-sequence accuracy. TLCN không có Tool Calling ghi N/A thay vì tự gán 0 |
| Invalid Action Rate | Đề nghị sai schema/quyền/quy tắc / tổng đề nghị; tách số bị chặn và số đã thực thi sai |
| Business Rule Compliance | Run thỏa toàn bộ BR áp dụng / run có BR áp dụng; báo thêm phân nhóm từng BR |
| Latency | ms nhận task→terminal, p50/p95 và timeout riêng; tách thời gian đợi người duyệt với compute/end-to-end |
| API usage và cost | Số calls/token input-output từ provider usage; cost theo đơn giá có nguồn/ngày chạy/tiền tệ. Thiếu usage/cost ghi UNKNOWN, không dùng default 0 |
| Error recovery | Fault-injected run phục hồi đúng trong budget và giữ invariant / toàn bộ fault-injected run; thêm recovery time/retry count |
| Duplicate prevention | Logical transactions có hơn một committed write / tổng logical transactions bị replay/race; thêm số ngăn chặn, unique key và DB state cuối |

**Target đề xuất, không phải kết quả:** 0 unauthorized committed write, 0 duplicate committed transaction, 0 invariant violation. Target TSR/latency/cost budget hiện UNKNOWN, cần GVHD duyệt trước W11. Không báo hệ thống cải thiện cho tới khi có so sánh thực.

Raw JSONL bắt buộc: runId/caseId/repeat/seed, system/commit/schema/dataset/model/prompt/registry version, principal role, start/end time, tool names/args đã che/results/status, approval, retries, expected/actual, invariant checks, error/timeout/fallback, tokens/cost hoặc missing_reason. CSV tổng hợp: metric/cohort/numerator/denominator/value/CI/excluded_reason. Báo cáo: môi trường → dataset/protocol → kết quả → failure taxonomy → giới hạn. Mỗi con số truy ngược raw run, không lấy lời model làm oracle.

So sánh paired theo case; báo n theo nhóm và độ phân tán repeat. CI bootstrap 95% lấy mẫu theo case, không coi repeat cùng case độc lập. Công khai exclusions/missing và khác biệt TLCN/KLTN, stochastic model/provider drift/tập tổng hợp/nhân lực nhãn. Không diễn giải correlation thành cải thiện nhân quả vượt thiết kế thí nghiệm.

## 6. Rủi ro và phương án xử lý

| Rủi ro | Tác động | Giảm thiểu | Dự phòng |
|---|---|---|---|
| Dataset ít/baseline khác | Kết luận không hợp lệ | Paired cases/labels khóa/CI case | Thu hẹp kết luận, báo missing/exclusions |
| Quota/cost thiếu | Thiếu run/cost sai | Budget trước đo/provider usage | Cost UNKNOWN, mock không thay measurement |

Lỗi quyền/mất dữ liệu/invariant/duplicate là P0 chặn gate. Người chịu trách nhiệm thực: UNASSIGNED. Lịch/GVHD/SQL chuẩn/nhân lực/sandbox còn thiếu phải xác nhận, không tự xem đã xử lý.

## 7. Điều kiện nghiệm thu tuần

**Quality gate G11: NOT EVALUATED.**

- [ ] W11-T01 đạt tiêu chí và TC-11-01 có bằng chứng.
- [ ] W11-T02 đạt tiêu chí và TC-11-02 có bằng chứng.
- [ ] W11-T03 đạt tiêu chí và TC-11-03 có bằng chứng.
- [ ] W11-T04 đạt tiêu chí và TC-11-04 có bằng chứng.
- [ ] Tiên quyết đã đóng; phần chuẩn bị song song tách khỏi write bị chặn; không còn P0.
- [ ] Artifact/input/expected/actual/log hoặc biên bản/version đầy đủ, không nhầm schema có sẵn với runtime đã nghiệm thu.
- [ ] Báo cáo GVHD theo kết quả thật; trạng thái gửi/duyệt có biên nhận nếu ghi đã thực hiện.

**Hiện vật bắt buộc:** Raw JSONL; CSV tổng hợp; Chương kết quả; Biên bản khoa học; TC-11-01…04 và lỗi/quyết định chưa đóng. Đây là đầu ra tương lai; phiên này không tạo thêm ngoài 12 Markdown.

**Quy tắc gate:** PASS khi mọi tiêu chí áp dụng đạt và bằng chứng đủ; CONDITIONAL chỉ với P1 không chặn tuần sau, có owner/hạn; FAIL khi vi phạm quyền/invariant/bảo toàn hoặc test bắt buộc không đạt. Chưa chạy/thiếu chứng cứ giữ NOT EVALUATED. Không báo hoàn tất từ checklist.

**Blocker còn lại:** chưa có bằng chứng gate tiền nhiệm, nhân lực và dữ liệu/môi trường kiểm thử phù hợp; chi tiết mục 3–6. Kế hoạch cũ không chứng minh gate đã qua.

## 8. Báo cáo gửi giảng viên

Mẫu điền tuần 11 (14/12–19/12/2026), theo cấu trúc được cung cấp vì chưa tìm thấy bao-cao-tuan.docx. Không điền kết quả kỳ vọng thành thành tích.

| Nội dung | Thông tin cần điền |
|---|---|
| Công việc đã hoàn thành | Chưa xác minh task hoàn tất; điền ID/phần việc thật/ngày/source, nền tảng mục 2 không thay nghiệm thu |
| Kỹ thuật trọng tâm | Đánh giá so sánh; ghi phần tái dùng TLCN và thay đổi đã làm |
| Kết quả đạt được | Chỉ output/test đo thật, commit/fixture/log/biên bản; hiện UNKNOWN |
| Khó khăn và hạn chế | Blocker mục 6–7, ảnh hưởng/owner/giờ còn lại theo ID |
| Kế hoạch tuần tiếp theo | Đối chiếu [tuần 12](WEEK_12.md) sau G11; giữ ID tồn, chỉ chuẩn bị phần không bị chặn |
| Nội dung xin ý kiến GVHD | Tính hợp lệ kết quả/giới hạn, rubric và hồ sơ nộp/bảo vệ |
| Trạng thái nộp và duyệt | UNKNOWN — chưa có biên nhận; điền ngày/người nhận hoặc duyệt/link bằng chứng/điều kiện thực |

**Cập nhật tiến độ:** ghi ID kế hoạch/thực tế/phần còn lại/bằng chứng/quyết định dời lịch. Task chỉ VERIFIED khi toàn bộ tiêu chí có chứng cứ; test definition/hiện vật chỉ xác nhận nhận định hẹp.
