# Tuần 09 Workflow và recovery

## 1. Thông tin tuần

- **Tuần và thời gian:** 09, 30/11–05/12/2026; baseline đề xuất, chưa xác minh hạn trường. Các tuần là luồng công việc, không mặc định đã hoàn tất theo ngày.
- **Mục tiêu:** Workflow và recovery, tái dùng TLCN và hoàn thiện phần thiếu, giữ AI Agent là đóng góp trung tâm.
- **Ngày kiểm kê:** 01/11/2026, Asia/Saigon; cuối khoảng W04, trước W05 ngày 02/11. Phiên này chỉ đọc source/tài liệu, không chạy build/test/SQL/migration/ứng dụng hoặc dịch vụ ngoài.
- **Tình trạng:** PARTIAL ở mức mã/schema; chưa có task nghiệm thu trọn tiêu chí. Test/runtime và duyệt GVHD: UNKNOWN.
- **Phụ thuộc:** [W08-T04](WEEK_08.md#w08-t04). Chuẩn bị thiết kế/fixture/mock có thể song song; write chờ gate tiên quyết.
- **Nhân lực:** UNASSIGNED. Công sức 30 giờ người/tuần (8+8+8+6) là ước lượng chưa cam kết, 360 giờ toàn kỳ chưa gồm dự phòng, cần tái ước lượng khi rõ nhân lực.

**Quy ước:** VERIFIED xác nhận nhận định hẹp có hiện vật/mã; PARTIAL mới có một phần; MISSING chưa tìm thấy hiện vật trong phạm vi quét; UNKNOWN thiếu bằng chứng để kết luận; PLANNED là việc dự kiến. VERIFIED schema hoặc test definition không đồng nghĩa task xong hay test PASS.

**Báo cáo tham chiếu:** chưa tìm thấy bao-cao-tuan.docx trong repository, D:/KLTN hoặc attachments đã quét (MISSING). Không coi các tuyên bố được yêu cầu kiểm tra trong prompt là nội dung báo cáo đã đọc. Mục 8 dùng đúng cấu trúc bạn cung cấp; nếu nhận bản gốc thì đối chiếu trong task hiện có.

**Đường găng chung:** yêu cầu/quy tắc W02 → DB/API/Agent design W03 → migration rehearsal W04 → Inventory Engine W05 → business services W06 → tools/quyền W08 → workflow/recovery W09 → E2E/freeze W10 → evaluation W11. Thanh toán W07 là nhánh bắt buộc trước E2E W10. Không đợi W07 để chuẩn bị read/mock tools nếu nghiệp vụ/quyền đã đủ; không chạy write tools trước gate tương ứng. Các cạnh cụ thể ở mỗi task, không có vòng.

## 2. Công việc đã hoàn thành

**Chưa xác minh hoàn thành trọn vẹn task nào của tuần.** Phần nền tảng hiện hữu được ghi dưới đây theo source, không suy từ sự tồn tại file thành nghiệm thu KLTN. Tái dùng phần phù hợp, chỉ review/hồi quy/thích nghi/tích hợp thay vì dựng lại.

| Task ID liên quan | Nội dung và kết quả quan sát | File source hoặc tài liệu chứng minh | Kết quả kiểm thử | Trạng thái xác minh task |
|---|---|---|---|---|
| W09-T01 | Scan/recommendation hiện hữu, system scan LOG_ONLY; chưa phải planner đa bước | [apps/agent/src/services/agent.service.ts](../../apps/agent/src/services/agent.service.ts); [apps/agent/src/services/recommendation.service.ts](../../apps/agent/src/services/recommendation.service.ts) | UNKNOWN — chưa có log hiện hành được xác minh, phiên này không chạy test | PARTIAL; chưa nghiệm thu task |
| W09-T02 | Query PR đang mở rồi create chưa chứng minh chống race; có key Execution ở schema | [apps/agent/src/repositories/agent.repository.ts](../../apps/agent/src/repositories/agent.repository.ts); [packages/database/prisma/schema/system.prisma](../../packages/database/prisma/schema/system.prisma) | UNKNOWN — chưa có log hiện hành được xác minh, phiên này không chạy test | PARTIAL; chưa nghiệm thu task |
| W09-T03 | Có AgentLog và lịch sử đích ở schema, chưa có workflow trace thực | [apps/agent/src/repositories/agent.repository.ts](../../apps/agent/src/repositories/agent.repository.ts); [packages/database/prisma/schema/system.prisma](../../packages/database/prisma/schema/system.prisma); [packages/database/prisma/migration_27_tables/02_migrate_data.sql](../../packages/database/prisma/migration_27_tables/02_migrate_data.sql) | UNKNOWN — chưa có log hiện hành được xác minh, phiên này không chạy test | PARTIAL; chưa nghiệm thu task |

## 3. Công việc cần thực hiện

Các bước triển khai/kiểm thử bên dưới là kế hoạch cho đợt thực hiện riêng. Phiên này chỉ tạo 12 Markdown; không thay đổi mã hoặc tài liệu cũ. Các ID giữ tương ứng bộ kế hoạch trước để không nhân bản công việc.

<a id="w09-t01"></a>

### W09-T01 Điều phối đa bước

- **Task ID:** W09-T01; **trạng thái:** PLANNED; **người thực hiện:** UNASSIGNED. Phần nền tảng ở mục 2 có thể PARTIAL, chưa đủ để đóng task.
- **Mục tiêu:** hoàn thiện Workflow state machine phục vụ workflow và recovery, tái dùng phần hiện hữu phù hợp.
- **Đầu vào:** các source và giới hạn chứng cứ trong mục 2/4; kết quả có bằng chứng từ [W08-T04](WEEK_08.md#w08-t04); trường hợp cần nguồn ngoài chưa có giữ UNKNOWN.
- **Hoạt động từng bước:**
  1. Đọc đúng phiên bản đầu vào, xác định phần đủ để chỉ hồi quy/tích hợp.
  2. Goal→đọc→NCC→đề xuất→duyệt→nháp PR, giới hạn bước.
  3. Đối chiếu ngoại lệ, quyền và invariant tại mục 4; ghi quyết định mở, không tự mở scope.
  4. Chạy kiểm tra TC-09-01 ở mục 5 trong môi trường phù hợp, lưu expected/actual và giới hạn mock.
  5. Đóng tiêu chí bằng hiện vật/log/biên bản, cập nhật mục 8 theo kết quả thật.
- **Đầu ra:** Workflow state machine, có phiên bản, danh sách tái dùng/thay đổi và lỗi còn mở.
- **Ưu tiên:** P0; **ước lượng:** 8 giờ người, chưa cam kết.
- **Phụ thuộc:** [W08-T04](WEEK_08.md#w08-t04).
- **Tiêu chí chấp nhận:** Lưu từng bước, stop budget, không tự duyệt/gửi NCC. Có input/expected/actual, source/version hiện vật và không còn P0 trong phạm vi task.
- **Bằng chứng cần thu:** TC-09-01, commit/schema/fixture hoặc biên bản review có ngày/version; hiện chưa có kết quả thực.

<a id="w09-t02"></a>

### W09-T02 Retry/idempotency

- **Task ID:** W09-T02; **trạng thái:** PLANNED; **người thực hiện:** UNASSIGNED. Phần nền tảng ở mục 2 có thể PARTIAL, chưa đủ để đóng task.
- **Mục tiêu:** hoàn thiện Recovery policy phục vụ workflow và recovery, tái dùng phần hiện hữu phù hợp.
- **Đầu vào:** các source và giới hạn chứng cứ trong mục 2/4; kết quả có bằng chứng từ [W09-T01](WEEK_09.md#w09-t01); trường hợp cần nguồn ngoài chưa có giữ UNKNOWN.
- **Hoạt động từng bước:**
  1. Đọc đúng phiên bản đầu vào, xác định phần đủ để chỉ hồi quy/tích hợp.
  2. Read backoff hữu hạn; write uncertain tra key, không retry mù.
  3. Đối chiếu ngoại lệ, quyền và invariant tại mục 4; ghi quyết định mở, không tự mở scope.
  4. Chạy kiểm tra TC-09-02 ở mục 5 trong môi trường phù hợp, lưu expected/actual và giới hạn mock.
  5. Đóng tiêu chí bằng hiện vật/log/biên bản, cập nhật mục 8 theo kết quả thật.
- **Đầu ra:** Recovery policy, có phiên bản, danh sách tái dùng/thay đổi và lỗi còn mở.
- **Ưu tiên:** P0; **ước lượng:** 8 giờ người, chưa cam kết.
- **Phụ thuộc:** [W09-T01](WEEK_09.md#w09-t01).
- **Tiêu chí chấp nhận:** Hai phiên cùng key tối đa một PR; restart không lặp. Có input/expected/actual, source/version hiện vật và không còn P0 trong phạm vi task.
- **Bằng chứng cần thu:** TC-09-02, commit/schema/fixture hoặc biên bản review có ngày/version; hiện chưa có kết quả thực.

<a id="w09-t03"></a>

### W09-T03 Lịch sử/usage

- **Task ID:** W09-T03; **trạng thái:** PLANNED; **người thực hiện:** UNASSIGNED. Phần nền tảng ở mục 2 có thể PARTIAL, chưa đủ để đóng task.
- **Mục tiêu:** hoàn thiện Audit UI/log phục vụ workflow và recovery, tái dùng phần hiện hữu phù hợp.
- **Đầu vào:** các source và giới hạn chứng cứ trong mục 2/4; kết quả có bằng chứng từ [W09-T01](WEEK_09.md#w09-t01); trường hợp cần nguồn ngoài chưa có giữ UNKNOWN.
- **Hoạt động từng bước:**
  1. Đọc đúng phiên bản đầu vào, xác định phần đủ để chỉ hồi quy/tích hợp.
  2. Execution/ToolCall/Evaluation, actor/correlation/token/latency/redaction.
  3. Đối chiếu ngoại lệ, quyền và invariant tại mục 4; ghi quyết định mở, không tự mở scope.
  4. Chạy kiểm tra TC-09-03 ở mục 5 trong môi trường phù hợp, lưu expected/actual và giới hạn mock.
  5. Đóng tiêu chí bằng hiện vật/log/biên bản, cập nhật mục 8 theo kết quả thật.
- **Đầu ra:** Audit UI/log, có phiên bản, danh sách tái dùng/thay đổi và lỗi còn mở.
- **Ưu tiên:** P0; **ước lượng:** 8 giờ người, chưa cam kết.
- **Phụ thuộc:** [W09-T01](WEEK_09.md#w09-t01).
- **Tiêu chí chấp nhận:** Thiếu usage ghi unknown, không 0 giả; truy được approval. Có input/expected/actual, source/version hiện vật và không còn P0 trong phạm vi task.
- **Bằng chứng cần thu:** TC-09-03, commit/schema/fixture hoặc biên bản review có ngày/version; hiện chưa có kết quả thực.

<a id="w09-t04"></a>

### W09-T04 Fault/security test

- **Task ID:** W09-T04; **trạng thái:** PLANNED; **người thực hiện:** UNASSIGNED. Phần nền tảng ở mục 2 có thể PARTIAL, chưa đủ để đóng task.
- **Mục tiêu:** hoàn thiện Báo cáo phục hồi phục vụ workflow và recovery, tái dùng phần hiện hữu phù hợp.
- **Đầu vào:** các source và giới hạn chứng cứ trong mục 2/4; kết quả có bằng chứng từ [W09-T02](WEEK_09.md#w09-t02), [W09-T03](WEEK_09.md#w09-t03); trường hợp cần nguồn ngoài chưa có giữ UNKNOWN.
- **Hoạt động từng bước:**
  1. Đọc đúng phiên bản đầu vào, xác định phần đủ để chỉ hồi quy/tích hợp.
  2. Provider down, từ chối duyệt, tool lỗi, restart, injection.
  3. Đối chiếu ngoại lệ, quyền và invariant tại mục 4; ghi quyết định mở, không tự mở scope.
  4. Chạy kiểm tra TC-09-04 ở mục 5 trong môi trường phù hợp, lưu expected/actual và giới hạn mock.
  5. Đóng tiêu chí bằng hiện vật/log/biên bản, cập nhật mục 8 theo kết quả thật.
- **Đầu ra:** Báo cáo phục hồi, có phiên bản, danh sách tái dùng/thay đổi và lỗi còn mở.
- **Ưu tiên:** P1; **ước lượng:** 6 giờ người, chưa cam kết.
- **Phụ thuộc:** [W09-T02](WEEK_09.md#w09-t02), [W09-T03](WEEK_09.md#w09-t03).
- **Tiêu chí chấp nhận:** Không write vượt quyền, không mất trạng thái uncertain. Có input/expected/actual, source/version hiện vật và không còn P0 trong phạm vi task.
- **Bằng chứng cần thu:** TC-09-04, commit/schema/fixture hoặc biên bản review có ngày/version; hiện chưa có kết quả thực.

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

**Khi chậm:** tái ước lượng giờ còn lại theo ID gốc; dời write phụ thuộc sau gate. Thiết kế/mock/luận văn có thể chuẩn bị song song khi có owner. Nếu không đủ tới 26/12 thì xin đổi lịch hoặc giảm phụ trợ, không bỏ AI/evaluation/quyền/bảo toàn. Giữ nguyên baseline để đối chiếu.

## 4. Thiết kế và triển khai kỹ thuật

| Lĩnh vực | Công việc |
|---|---|
| Database | Execution/ToolCall history |
| Backend | Recovery/key nguyên tử |
| Frontend | Lịch sử và uncertain |
| AI Agent | Planner nhiều bước hữu hạn |
| Security | Approval version và recheck |
| Integration | Restart/resume/faults |


Các yêu cầu trong bảng là PLANNED. Chi tiết nguồn, xác minh và ranh giới nghiệp vụ:

Tái dùng fallback [apps/agent/src/services/recommendation.service.ts](../../apps/agent/src/services/recommendation.service.ts); [apps/agent/tests/rule-based-regression.test.cjs](../../apps/agent/tests/rule-based-regression.test.cjs), guards [apps/agent/src/internal-auth.ts](../../apps/agent/src/internal-auth.ts); [apps/agent/tests/principal-guards.test.cjs](../../apps/agent/tests/principal-guards.test.cjs) và models [packages/database/prisma/schema/system.prisma](../../packages/database/prisma/schema/system.prisma). Goal tồn thấp → read dữ liệu → rank NCC → đề xuất → WAITING_APPROVAL → PR nháp, có max steps/time/tokens. AgentExecution key không tự bảo đảm PR idempotency: cần key/state nguyên tử cùng commit nghiệp vụ hoặc thiết kế tương đương đã review. Read retry backoff hữu hạn; write timeout phải tra trạng thái/key trước quyết định. System scan giữ LOG_ONLY ([apps/agent/src/services/agent.service.ts](../../apps/agent/src/services/agent.service.ts)). History có actor/approval/step/result và redaction; log legacy không được giả thành tool run/token usage thật.

## 5. Kiểm thử và đánh giá

**Kết quả thực: UNKNOWN.** Chưa có log nghiệm thu tuần được xác minh và phiên này không chạy test. Bảng sau là scenario/expected, không phải kết quả PASS.

| Test ID và task | Kịch bản | Kết quả kỳ vọng | Điều kiện chấp nhận và bằng chứng |
|---|---|---|---|
| TC-09-01 → W09-T01 | Multi-step tồn→NCC→nháp PR | Không skip duyệt, budget hữu hạn, trace đủ | Expected khớp actual, có log hoặc biên bản review ngày/version; sai lệch trọng yếu chặn task |
| TC-09-02 → W09-T02 | Race/key/write timeout | Tối đa một committed PR, tra state không retry mù | Expected khớp actual, có log hoặc biên bản review ngày/version; sai lệch trọng yếu chặn task |
| TC-09-03 → W09-T03 | History/restart/redaction | Resume checkpoint hợp lệ, trace actor/approval, không secret | Expected khớp actual, có log hoặc biên bản review ngày/version; sai lệch trọng yếu chặn task |
| TC-09-04 → W09-T04 | Fault read/write/provider | Read retry hữu hạn, uncertain write không lặp, permanent từ chối an toàn | Expected khớp actual, có log hoặc biên bản review ngày/version; sai lệch trọng yếu chặn task |

**Mức kiểm thử:** Unit validator/tính toán/state machine; integration transaction/quyền/service hoặc provider boundary; E2E chuỗi nghiệp vụ tuần. Kiểm thử bắt đầu ngay trong tuần triển khai, không đợi W11. Negative/edge: role sai, dữ liệu trống/âm/NaN, state stale, double submit, lỗi phụ thuộc và timeout áp dụng theo từng scenario.

**Bằng chứng tối thiểu:** commit/checksum, schema/fixture/model/prompt version khi liên quan, môi trường, command/procedure, input, expected/actual, timestamp, log che dữ liệu. Mock không chứng minh concurrency/rollback PostgreSQL hoặc provider thật. Không áp dụng ghi NOT APPLICABLE và lý do, không tự đổi thành PASS.

**Đánh giá AI trong tuần:** theo protocol W03-T04, ghi case/run/version, allowed/actual tools, business outcome, invalid proposed action và committed write, compliance, latency/usage/fallback/recovery/duplicate. Dùng oracle fixture/DB, không lời model. Đây là kiểm tra phát triển, không benchmark chính thức W11; target không là measurement.

## 6. Rủi ro và phương án xử lý

| Rủi ro | Tác động | Giảm thiểu | Dự phòng |
|---|---|---|---|
| Write timeout/restart | PR trùng/mất state | Key/state bền, checkpoint/tra kết quả | Uncertain cho người có quyền, không blind retry |
| System/stale approval ghi mua | Sai requester/duyệt | LOG_ONLY/hash/version/recheck actor | Dừng write, tạo đề xuất mới |

Lỗi quyền/mất dữ liệu/invariant/duplicate là P0 chặn gate. Người chịu trách nhiệm thực: UNASSIGNED. Lịch/GVHD/SQL chuẩn/nhân lực/sandbox còn thiếu phải xác nhận, không tự xem đã xử lý.

## 7. Điều kiện nghiệm thu tuần

**Quality gate G09: NOT EVALUATED.**

- [ ] W09-T01 đạt tiêu chí và TC-09-01 có bằng chứng.
- [ ] W09-T02 đạt tiêu chí và TC-09-02 có bằng chứng.
- [ ] W09-T03 đạt tiêu chí và TC-09-03 có bằng chứng.
- [ ] W09-T04 đạt tiêu chí và TC-09-04 có bằng chứng.
- [ ] Tiên quyết đã đóng; phần chuẩn bị song song tách khỏi write bị chặn; không còn P0.
- [ ] Artifact/input/expected/actual/log hoặc biên bản/version đầy đủ, không nhầm schema có sẵn với runtime đã nghiệm thu.
- [ ] Báo cáo GVHD theo kết quả thật; trạng thái gửi/duyệt có biên nhận nếu ghi đã thực hiện.

**Hiện vật bắt buộc:** Workflow state machine; Recovery policy; Audit UI/log; Báo cáo phục hồi; TC-09-01…04 và lỗi/quyết định chưa đóng. Đây là đầu ra tương lai; phiên này không tạo thêm ngoài 12 Markdown.

**Quy tắc gate:** PASS khi mọi tiêu chí áp dụng đạt và bằng chứng đủ; CONDITIONAL chỉ với P1 không chặn tuần sau, có owner/hạn; FAIL khi vi phạm quyền/invariant/bảo toàn hoặc test bắt buộc không đạt. Chưa chạy/thiếu chứng cứ giữ NOT EVALUATED. Không báo hoàn tất từ checklist.

**Blocker còn lại:** chưa có bằng chứng gate tiền nhiệm, nhân lực và dữ liệu/môi trường kiểm thử phù hợp; chi tiết mục 3–6. Kế hoạch cũ không chứng minh gate đã qua.

## 8. Báo cáo gửi giảng viên

Mẫu điền tuần 09 (30/11–05/12/2026), theo cấu trúc được cung cấp vì chưa tìm thấy bao-cao-tuan.docx. Không điền kết quả kỳ vọng thành thành tích.

| Nội dung | Thông tin cần điền |
|---|---|
| Công việc đã hoàn thành | Chưa xác minh task hoàn tất; điền ID/phần việc thật/ngày/source, nền tảng mục 2 không thay nghiệm thu |
| Kỹ thuật trọng tâm | Workflow và recovery; ghi phần tái dùng TLCN và thay đổi đã làm |
| Kết quả đạt được | Chỉ output/test đo thật, commit/fixture/log/biên bản; hiện UNKNOWN |
| Khó khăn và hạn chế | Blocker mục 6–7, ảnh hưởng/owner/giờ còn lại theo ID |
| Kế hoạch tuần tiếp theo | Đối chiếu [tuần 10](WEEK_10.md) sau G09; giữ ID tồn, chỉ chuẩn bị phần không bị chặn |
| Nội dung xin ý kiến GVHD | Quyền/HITL, protocol benchmark, model/budget và gate ứng viên |
| Trạng thái nộp và duyệt | UNKNOWN — chưa có biên nhận; điền ngày/người nhận hoặc duyệt/link bằng chứng/điều kiện thực |

**Cập nhật tiến độ:** ghi ID kế hoạch/thực tế/phần còn lại/bằng chứng/quyết định dời lịch. Task chỉ VERIFIED khi toàn bộ tiêu chí có chứng cứ; test definition/hiện vật chỉ xác nhận nhận định hẹp.
