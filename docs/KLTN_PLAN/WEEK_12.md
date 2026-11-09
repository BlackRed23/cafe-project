# Tuần 12 Luận văn, demo và bảo vệ

## 1. Thông tin tuần

- **Tuần và thời gian:** 12, 21/12–26/12/2026; baseline đề xuất, chưa xác minh hạn trường. Các tuần là luồng công việc, không mặc định đã hoàn tất theo ngày.
- **Mục tiêu:** Luận văn, demo và bảo vệ, tái dùng TLCN và hoàn thiện phần thiếu, giữ AI Agent là đóng góp trung tâm.
- **Ngày kiểm kê:** 01/11/2026, Asia/Saigon; cuối khoảng W04, trước W05 ngày 02/11. Phiên này chỉ đọc source/tài liệu, không chạy build/test/SQL/migration/ứng dụng hoặc dịch vụ ngoài.
- **Tình trạng:** PARTIAL ở mức mã/schema; chưa có task nghiệm thu trọn tiêu chí. Test/runtime và duyệt GVHD: UNKNOWN.
- **Phụ thuộc:** [W11-T04](WEEK_11.md#w11-t04), [W10-T04](WEEK_10.md#w10-t04), [W01-T04](WEEK_01.md#w01-t04). Chuẩn bị thiết kế/fixture/mock có thể song song; write chờ gate tiên quyết.
- **Nhân lực:** UNASSIGNED. Công sức 30 giờ người/tuần (8+8+8+6) là ước lượng chưa cam kết, 360 giờ toàn kỳ chưa gồm dự phòng, cần tái ước lượng khi rõ nhân lực.

**Quy ước:** VERIFIED xác nhận nhận định hẹp có hiện vật/mã; PARTIAL mới có một phần; MISSING chưa tìm thấy hiện vật trong phạm vi quét; UNKNOWN thiếu bằng chứng để kết luận; PLANNED là việc dự kiến. VERIFIED schema hoặc test definition không đồng nghĩa task xong hay test PASS.

**Báo cáo tham chiếu:** chưa tìm thấy bao-cao-tuan.docx trong repository, D:/KLTN hoặc attachments đã quét (MISSING). Không coi các tuyên bố được yêu cầu kiểm tra trong prompt là nội dung báo cáo đã đọc. Mục 8 dùng đúng cấu trúc bạn cung cấp; nếu nhận bản gốc thì đối chiếu trong task hiện có.

**Đường găng chung:** yêu cầu/quy tắc W02 → DB/API/Agent design W03 → migration rehearsal W04 → Inventory Engine W05 → business services W06 → tools/quyền W08 → workflow/recovery W09 → E2E/freeze W10 → evaluation W11. Thanh toán W07 là nhánh bắt buộc trước E2E W10. Không đợi W07 để chuẩn bị read/mock tools nếu nghiệp vụ/quyền đã đủ; không chạy write tools trước gate tương ứng. Các cạnh cụ thể ở mỗi task, không có vòng.

## 2. Công việc đã hoàn thành

**Chưa xác minh hoàn thành trọn vẹn task nào của tuần.** Phần nền tảng hiện hữu được ghi dưới đây theo source, không suy từ sự tồn tại file thành nghiệm thu KLTN. Tái dùng phần phù hợp, chỉ review/hồi quy/thích nghi/tích hợp thay vì dựng lại.

| Task ID liên quan | Nội dung và kết quả quan sát | File source hoặc tài liệu chứng minh | Kết quả kiểm thử | Trạng thái xác minh task |
|---|---|---|---|---|
| W12-T01 | Có kế hoạch/Word trước, không phải luận văn hoàn tất hay nghiệm thu chức năng | [docs/KLTN_PLAN/MASTER_PLAN.md](../../docs/KLTN_PLAN/MASTER_PLAN.md); [docs/KLTN_PLAN/KE_HOACH_KLTN_12_TUAN.docx](../../docs/KLTN_PLAN/KE_HOACH_KLTN_12_TUAN.docx) | UNKNOWN — chưa có log hiện hành được xác minh, phiên này không chạy test | PARTIAL; chưa nghiệm thu task |
| W12-T02 | Có README TLCN, chưa chứng minh demo KLTN tái lập được | [README.md](../../README.md) | UNKNOWN — chưa có log hiện hành được xác minh, phiên này không chạy test | PARTIAL; chưa nghiệm thu task |
| W12-T04 | Chưa có biên nhận nộp/duyệt, tracker trước giữ UNKNOWN | [docs/KLTN_PLAN/WEEKLY_PROGRESS_TRACKER.md](../../docs/KLTN_PLAN/WEEKLY_PROGRESS_TRACKER.md) | UNKNOWN — chưa có log hiện hành được xác minh, phiên này không chạy test | UNKNOWN; chưa nghiệm thu task |

## 3. Công việc cần thực hiện

Các bước triển khai/kiểm thử bên dưới là kế hoạch cho đợt thực hiện riêng. Phiên này chỉ tạo 12 Markdown; không thay đổi mã hoặc tài liệu cũ. Các ID giữ tương ứng bộ kế hoạch trước để không nhân bản công việc.

<a id="w12-t01"></a>

### W12-T01 Hoàn thiện báo cáo

- **Task ID:** W12-T01; **trạng thái:** PLANNED; **người thực hiện:** UNASSIGNED. Phần nền tảng ở mục 2 có thể PARTIAL, chưa đủ để đóng task.
- **Mục tiêu:** hoàn thiện Luận văn phục vụ luận văn, demo và bảo vệ, tái dùng phần hiện hữu phù hợp.
- **Đầu vào:** các source và giới hạn chứng cứ trong mục 2/4; kết quả có bằng chứng từ [W11-T04](WEEK_11.md#w11-t04); trường hợp cần nguồn ngoài chưa có giữ UNKNOWN.
- **Hoạt động từng bước:**
  1. Đọc đúng phiên bản đầu vào, xác định phần đủ để chỉ hồi quy/tích hợp.
  2. Kiến trúc/phương pháp/kết quả thực/giới hạn và phụ lục.
  3. Đối chiếu ngoại lệ, quyền và invariant tại mục 4; ghi quyết định mở, không tự mở scope.
  4. Chạy kiểm tra TC-12-01 ở mục 5 trong môi trường phù hợp, lưu expected/actual và giới hạn mock.
  5. Đóng tiêu chí bằng hiện vật/log/biên bản, cập nhật mục 8 theo kết quả thật.
- **Đầu ra:** Luận văn, có phiên bản, danh sách tái dùng/thay đổi và lỗi còn mở.
- **Ưu tiên:** P0; **ước lượng:** 8 giờ người, chưa cam kết.
- **Phụ thuộc:** [W11-T04](WEEK_11.md#w11-t04).
- **Tiêu chí chấp nhận:** Bảng số có raw evidence, không secret/PII. Có input/expected/actual, source/version hiện vật và không còn P0 trong phạm vi task.
- **Bằng chứng cần thu:** TC-12-01, commit/schema/fixture hoặc biên bản review có ngày/version; hiện chưa có kết quả thực.

<a id="w12-t02"></a>

### W12-T02 Đóng gói demo

- **Task ID:** W12-T02; **trạng thái:** PLANNED; **người thực hiện:** UNASSIGNED. Phần nền tảng ở mục 2 có thể PARTIAL, chưa đủ để đóng task.
- **Mục tiêu:** hoàn thiện Gói demo phục vụ luận văn, demo và bảo vệ, tái dùng phần hiện hữu phù hợp.
- **Đầu vào:** các source và giới hạn chứng cứ trong mục 2/4; kết quả có bằng chứng từ [W10-T04](WEEK_10.md#w10-t04), [W11-T04](WEEK_11.md#w11-t04); trường hợp cần nguồn ngoài chưa có giữ UNKNOWN.
- **Hoạt động từng bước:**
  1. Đọc đúng phiên bản đầu vào, xác định phần đủ để chỉ hồi quy/tích hợp.
  2. Fixture/hướng dẫn/happy-negative-recovery, offline có nhãn.
  3. Đối chiếu ngoại lệ, quyền và invariant tại mục 4; ghi quyết định mở, không tự mở scope.
  4. Chạy kiểm tra TC-12-02 ở mục 5 trong môi trường phù hợp, lưu expected/actual và giới hạn mock.
  5. Đóng tiêu chí bằng hiện vật/log/biên bản, cập nhật mục 8 theo kết quả thật.
- **Đầu ra:** Gói demo, có phiên bản, danh sách tái dùng/thay đổi và lỗi còn mở.
- **Ưu tiên:** P0; **ước lượng:** 8 giờ người, chưa cam kết.
- **Phụ thuộc:** [W10-T04](WEEK_10.md#w10-t04), [W11-T04](WEEK_11.md#w11-t04).
- **Tiêu chí chấp nhận:** Người khác tái lập được, offline không giả provider thật. Có input/expected/actual, source/version hiện vật và không còn P0 trong phạm vi task.
- **Bằng chứng cần thu:** TC-12-02, commit/schema/fixture hoặc biên bản review có ngày/version; hiện chưa có kết quả thực.

<a id="w12-t03"></a>

### W12-T03 Diễn tập bảo vệ

- **Task ID:** W12-T03; **trạng thái:** PLANNED; **người thực hiện:** UNASSIGNED. Phần nền tảng ở mục 2 có thể PARTIAL, chưa đủ để đóng task.
- **Mục tiêu:** hoàn thiện Slide/biên bản phục vụ luận văn, demo và bảo vệ, tái dùng phần hiện hữu phù hợp.
- **Đầu vào:** các source và giới hạn chứng cứ trong mục 2/4; kết quả có bằng chứng từ [W12-T01](WEEK_12.md#w12-t01), [W12-T02](WEEK_12.md#w12-t02); trường hợp cần nguồn ngoài chưa có giữ UNKNOWN.
- **Hoạt động từng bước:**
  1. Đọc đúng phiên bản đầu vào, xác định phần đủ để chỉ hồi quy/tích hợp.
  2. Slide, hỏi đáp 27/16, concurrency, quyền và hiệu quả.
  3. Đối chiếu ngoại lệ, quyền và invariant tại mục 4; ghi quyết định mở, không tự mở scope.
  4. Chạy kiểm tra TC-12-03 ở mục 5 trong môi trường phù hợp, lưu expected/actual và giới hạn mock.
  5. Đóng tiêu chí bằng hiện vật/log/biên bản, cập nhật mục 8 theo kết quả thật.
- **Đầu ra:** Slide/biên bản, có phiên bản, danh sách tái dùng/thay đổi và lỗi còn mở.
- **Ưu tiên:** P0; **ước lượng:** 8 giờ người, chưa cam kết.
- **Phụ thuộc:** [W12-T01](WEEK_12.md#w12-t01), [W12-T02](WEEK_12.md#w12-t02).
- **Tiêu chí chấp nhận:** Nêu rõ đóng góp và giới hạn quan sát được. Có input/expected/actual, source/version hiện vật và không còn P0 trong phạm vi task.
- **Bằng chứng cần thu:** TC-12-03, commit/schema/fixture hoặc biên bản review có ngày/version; hiện chưa có kết quả thực.

<a id="w12-t04"></a>

### W12-T04 Nộp/bàn giao

- **Task ID:** W12-T04; **trạng thái:** PLANNED; **người thực hiện:** UNASSIGNED. Phần nền tảng ở mục 2 có thể PARTIAL, chưa đủ để đóng task.
- **Mục tiêu:** hoàn thiện Hồ sơ nộp phục vụ luận văn, demo và bảo vệ, tái dùng phần hiện hữu phù hợp.
- **Đầu vào:** các source và giới hạn chứng cứ trong mục 2/4; kết quả có bằng chứng từ [W12-T03](WEEK_12.md#w12-t03), [W01-T04](WEEK_01.md#w01-t04); trường hợp cần nguồn ngoài chưa có giữ UNKNOWN.
- **Hoạt động từng bước:**
  1. Đọc đúng phiên bản đầu vào, xác định phần đủ để chỉ hồi quy/tích hợp.
  2. Theo lịch xác nhận, rubric, hash bản nộp, biên nhận.
  3. Đối chiếu ngoại lệ, quyền và invariant tại mục 4; ghi quyết định mở, không tự mở scope.
  4. Chạy kiểm tra TC-12-04 ở mục 5 trong môi trường phù hợp, lưu expected/actual và giới hạn mock.
  5. Đóng tiêu chí bằng hiện vật/log/biên bản, cập nhật mục 8 theo kết quả thật.
- **Đầu ra:** Hồ sơ nộp, có phiên bản, danh sách tái dùng/thay đổi và lỗi còn mở.
- **Ưu tiên:** P1; **ước lượng:** 6 giờ người, chưa cam kết.
- **Phụ thuộc:** [W12-T03](WEEK_12.md#w12-t03), [W01-T04](WEEK_01.md#w01-t04).
- **Tiêu chí chấp nhận:** Chỉ ghi đã nộp/duyệt khi có bằng chứng thật. Có input/expected/actual, source/version hiện vật và không còn P0 trong phạm vi task.
- **Bằng chứng cần thu:** TC-12-04, commit/schema/fixture hoặc biên bản review có ngày/version; hiện chưa có kết quả thực.

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
| [Tuần 11](WEEK_11.md) | W11-T01, W11-T02, W11-T03, W11-T04 | Thu bằng chứng, đóng task gốc; chặn write hậu nhiệm nếu chưa đạt tiên quyết |

**Khi chậm:** tái ước lượng giờ còn lại theo ID gốc; dời write phụ thuộc sau gate. Thiết kế/mock/luận văn có thể chuẩn bị song song khi có owner. Nếu không đủ tới 26/12 thì xin đổi lịch hoặc giảm phụ trợ, không bỏ AI/evaluation/quyền/bảo toàn. Giữ nguyên baseline để đối chiếu.

## 4. Thiết kế và triển khai kỹ thuật

| Lĩnh vực | Công việc |
|---|---|
| Database | NOT APPLICABLE — không đổi DB |
| Backend | NOT APPLICABLE — đóng băng |
| Frontend | Demo giao diện đã có |
| AI Agent | Trình bày đóng góp và giới hạn |
| Security | Che PII/secret bàn giao |
| Integration | Demo offline/sandbox có nhãn |


Các yêu cầu trong bảng là PLANNED. Chi tiết nguồn, xác minh và ranh giới nghiệp vụ:

Kế hoạch và Word trước là tài liệu tham khảo, không là luận văn hoàn tất hoặc biên nhận. Chỉ trích metrics có raw evidence sau W11; target không đưa vào kết quả đạt được. Nếu lịch trường khác baseline, ghi quyết định mới và giữ lịch lịch sử. Demo offline/mock phải có nhãn, không trình bày thành sandbox/live thật. Nguồn tham khảo hiện có: [README.md](../../README.md); [docs/KLTN_PLAN/MASTER_PLAN.md](../../docs/KLTN_PLAN/MASTER_PLAN.md); [docs/KLTN_PLAN/ACCEPTANCE_CRITERIA.md](../../docs/KLTN_PLAN/ACCEPTANCE_CRITERIA.md).

## 5. Kiểm thử và đánh giá

**Kết quả thực: UNKNOWN.** Chưa có log nghiệm thu tuần được xác minh và phiên này không chạy test. Bảng sau là scenario/expected, không phải kết quả PASS.

| Test ID và task | Kịch bản | Kết quả kỳ vọng | Điều kiện chấp nhận và bằng chứng |
|---|---|---|---|
| TC-12-01 → W12-T01 | Luận văn/phụ lục | Claim/số đo có raw source, target khác measurement, không PII/secret | Expected khớp actual, có log hoặc biên bản review ngày/version; sai lệch trọng yếu chặn task |
| TC-12-02 → W12-T02 | Người khác chạy demo | Happy/negative/recovery tái lập, offline không giả sandbox | Expected khớp actual, có log hoặc biên bản review ngày/version; sai lệch trọng yếu chặn task |
| TC-12-03 → W12-T03 | Diễn tập | Giải thích 27/16/concurrency/quyền/AI và giới hạn | Expected khớp actual, có log hoặc biên bản review ngày/version; sai lệch trọng yếu chặn task |
| TC-12-04 → W12-T04 | Rubric/bản nộp/biên nhận | Hash/version rõ, chỉ ghi nộp/duyệt khi có bằng chứng | Expected khớp actual, có log hoặc biên bản review ngày/version; sai lệch trọng yếu chặn task |

**Mức kiểm thử:** Unit mới: NOT APPLICABLE; smoke/integration/E2E demo và review bằng chứng cuối. Nếu bắt buộc sửa mã do lỗi phải chạy lại bộ liên quan. Negative/edge: role sai, dữ liệu trống/âm/NaN, state stale, double submit, lỗi phụ thuộc và timeout áp dụng theo từng scenario.

**Bằng chứng tối thiểu:** commit/checksum, schema/fixture/model/prompt version khi liên quan, môi trường, command/procedure, input, expected/actual, timestamp, log che dữ liệu. Mock không chứng minh concurrency/rollback PostgreSQL hoặc provider thật. Không áp dụng ghi NOT APPLICABLE và lý do, không tự đổi thành PASS.

## 6. Rủi ro và phương án xử lý

| Rủi ro | Tác động | Giảm thiểu | Dự phòng |
|---|---|---|---|
| Demo mạng/lộ dữ liệu | Không trình diễn/lộ secret | Offline có nhãn/fixture tổng hợp/rà slide | Recorded/mock đúng nhãn, không giả live |
| Thiếu biên nhận/lịch | Không xác nhận nộp/duyệt | Rubric/hash/biên nhận thật | UNKNOWN và xin GVHD hạn thực |

Lỗi quyền/mất dữ liệu/invariant/duplicate là P0 chặn gate. Người chịu trách nhiệm thực: UNASSIGNED. Lịch/GVHD/SQL chuẩn/nhân lực/sandbox còn thiếu phải xác nhận, không tự xem đã xử lý.

## 7. Điều kiện nghiệm thu tuần

**Quality gate G12: NOT EVALUATED.**

- [ ] W12-T01 đạt tiêu chí và TC-12-01 có bằng chứng.
- [ ] W12-T02 đạt tiêu chí và TC-12-02 có bằng chứng.
- [ ] W12-T03 đạt tiêu chí và TC-12-03 có bằng chứng.
- [ ] W12-T04 đạt tiêu chí và TC-12-04 có bằng chứng.
- [ ] Tiên quyết đã đóng; phần chuẩn bị song song tách khỏi write bị chặn; không còn P0.
- [ ] Artifact/input/expected/actual/log hoặc biên bản/version đầy đủ, không nhầm schema có sẵn với runtime đã nghiệm thu.
- [ ] Báo cáo GVHD theo kết quả thật; trạng thái gửi/duyệt có biên nhận nếu ghi đã thực hiện.

**Hiện vật bắt buộc:** Luận văn; Gói demo; Slide/biên bản; Hồ sơ nộp; TC-12-01…04 và lỗi/quyết định chưa đóng. Đây là đầu ra tương lai; phiên này không tạo thêm ngoài 12 Markdown.

**Quy tắc gate:** PASS khi mọi tiêu chí áp dụng đạt và bằng chứng đủ; CONDITIONAL chỉ với P1 không chặn tuần sau, có owner/hạn; FAIL khi vi phạm quyền/invariant/bảo toàn hoặc test bắt buộc không đạt. Chưa chạy/thiếu chứng cứ giữ NOT EVALUATED. Không báo hoàn tất từ checklist.

**Blocker còn lại:** chưa có bằng chứng gate tiền nhiệm, nhân lực và dữ liệu/môi trường kiểm thử phù hợp; chi tiết mục 3–6. Kế hoạch cũ không chứng minh gate đã qua.

## 8. Báo cáo gửi giảng viên

Mẫu điền tuần 12 (21/12–26/12/2026), theo cấu trúc được cung cấp vì chưa tìm thấy bao-cao-tuan.docx. Không điền kết quả kỳ vọng thành thành tích.

| Nội dung | Thông tin cần điền |
|---|---|
| Công việc đã hoàn thành | Chưa xác minh task hoàn tất; điền ID/phần việc thật/ngày/source, nền tảng mục 2 không thay nghiệm thu |
| Kỹ thuật trọng tâm | Luận văn, demo và bảo vệ; ghi phần tái dùng TLCN và thay đổi đã làm |
| Kết quả đạt được | Chỉ output/test đo thật, commit/fixture/log/biên bản; hiện UNKNOWN |
| Khó khăn và hạn chế | Blocker mục 6–7, ảnh hưởng/owner/giờ còn lại theo ID |
| Kế hoạch tuần tiếp theo | Bàn giao/xử lý phản hồi theo lịch trường xác nhận, không giả định đã nộp/bảo vệ |
| Nội dung xin ý kiến GVHD | Tính hợp lệ kết quả/giới hạn, rubric và hồ sơ nộp/bảo vệ |
| Trạng thái nộp và duyệt | UNKNOWN — chưa có biên nhận; điền ngày/người nhận hoặc duyệt/link bằng chứng/điều kiện thực |

**Cập nhật tiến độ:** ghi ID kế hoạch/thực tế/phần còn lại/bằng chứng/quyết định dời lịch. Task chỉ VERIFIED khi toàn bộ tiêu chí có chứng cứ; test definition/hiện vật chỉ xác nhận nhận định hẹp.
