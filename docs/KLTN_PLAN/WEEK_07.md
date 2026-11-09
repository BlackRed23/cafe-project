# Tuần 07 Thanh toán sandbox

## 1. Thông tin tuần

- **Tuần và thời gian:** 07, 16/11–21/11/2026; baseline đề xuất, chưa xác minh hạn trường. Các tuần là luồng công việc, không mặc định đã hoàn tất theo ngày.
- **Mục tiêu:** Thanh toán sandbox, tái dùng TLCN và hoàn thiện phần thiếu, giữ AI Agent là đóng góp trung tâm.
- **Ngày kiểm kê:** 01/11/2026, Asia/Saigon; cuối khoảng W04, trước W05 ngày 02/11. Phiên này chỉ đọc source/tài liệu, không chạy build/test/SQL/migration/ứng dụng hoặc dịch vụ ngoài.
- **Tình trạng:** PARTIAL ở mức mã/schema; chưa có task nghiệm thu trọn tiêu chí. Test/runtime và duyệt GVHD: UNKNOWN.
- **Phụ thuộc:** [W04-T03](WEEK_04.md#w04-t03), [W02-T04](WEEK_02.md#w02-t04), [W06-T01](WEEK_06.md#w06-t01). Chuẩn bị thiết kế/fixture/mock có thể song song; write chờ gate tiên quyết.
- **Nhân lực:** UNASSIGNED. Công sức 30 giờ người/tuần (8+8+8+6) là ước lượng chưa cam kết, 360 giờ toàn kỳ chưa gồm dự phòng, cần tái ước lượng khi rõ nhân lực.

**Quy ước:** VERIFIED xác nhận nhận định hẹp có hiện vật/mã; PARTIAL mới có một phần; MISSING chưa tìm thấy hiện vật trong phạm vi quét; UNKNOWN thiếu bằng chứng để kết luận; PLANNED là việc dự kiến. VERIFIED schema hoặc test definition không đồng nghĩa task xong hay test PASS.

**Báo cáo tham chiếu:** chưa tìm thấy bao-cao-tuan.docx trong repository, D:/KLTN hoặc attachments đã quét (MISSING). Không coi các tuyên bố được yêu cầu kiểm tra trong prompt là nội dung báo cáo đã đọc. Mục 8 dùng đúng cấu trúc bạn cung cấp; nếu nhận bản gốc thì đối chiếu trong task hiện có.

**Đường găng chung:** yêu cầu/quy tắc W02 → DB/API/Agent design W03 → migration rehearsal W04 → Inventory Engine W05 → business services W06 → tools/quyền W08 → workflow/recovery W09 → E2E/freeze W10 → evaluation W11. Thanh toán W07 là nhánh bắt buộc trước E2E W10. Không đợi W07 để chuẩn bị read/mock tools nếu nghiệp vụ/quyền đã đủ; không chạy write tools trước gate tương ứng. Các cạnh cụ thể ở mỗi task, không có vòng.

## 2. Công việc đã hoàn thành

**Chưa xác minh hoàn thành trọn vẹn task nào của tuần.** Phần nền tảng hiện hữu được ghi dưới đây theo source, không suy từ sự tồn tại file thành nghiệm thu KLTN. Tái dùng phần phù hợp, chỉ review/hồi quy/thích nghi/tích hợp thay vì dựng lại.

| Task ID liên quan | Nội dung và kết quả quan sát | File source hoặc tài liệu chứng minh | Kết quả kiểm thử | Trạng thái xác minh task |
|---|---|---|---|---|
| W07-T01 | VERIFIED hiện vật: Payment/Callback/Reconciliation tách schema, MOMO/VNPAY có enum | [packages/database/prisma/schema/order.prisma](../../packages/database/prisma/schema/order.prisma) | UNKNOWN — chưa có log hiện hành được xác minh, phiên này không chạy test | PARTIAL; chưa nghiệm thu task |
| W07-T02 | API PaymentStatus/findUnique(orderId) khác Prisma nhiều payments/index orderId | [apps/api/src/modules/payment/payment.service.ts](../../apps/api/src/modules/payment/payment.service.ts); [apps/api/src/modules/payment/payment.repository.ts](../../apps/api/src/modules/payment/payment.repository.ts); [packages/database/prisma/schema/order.prisma](../../packages/database/prisma/schema/order.prisma) | UNKNOWN — chưa có log hiện hành được xác minh, phiên này không chạy test | PARTIAL; chưa nghiệm thu task |
| W07-T03 | Chưa tìm thấy adapter MoMo/VNPay/callback/reconciliation ở mã ứng dụng đã quét; không có sandbox result | [apps/api/src/modules/payment/payment.route.ts](../../apps/api/src/modules/payment/payment.route.ts); [packages/database/prisma/migration_27_tables/03_verify.sql](../../packages/database/prisma/migration_27_tables/03_verify.sql) | UNKNOWN — chưa có log hiện hành được xác minh, phiên này không chạy test | UNKNOWN; chưa nghiệm thu task |

## 3. Công việc cần thực hiện

Các bước triển khai/kiểm thử bên dưới là kế hoạch cho đợt thực hiện riêng. Phiên này chỉ tạo 12 Markdown; không thay đổi mã hoặc tài liệu cũ. Các ID giữ tương ứng bộ kế hoạch trước để không nhân bản công việc.

<a id="w07-t01"></a>

### W07-T01 Adapter một provider

- **Task ID:** W07-T01; **trạng thái:** PLANNED; **người thực hiện:** UNASSIGNED. Phần nền tảng ở mục 2 có thể PARTIAL, chưa đủ để đóng task.
- **Mục tiêu:** hoàn thiện Adapter sandbox phục vụ thanh toán sandbox, tái dùng phần hiện hữu phù hợp.
- **Đầu vào:** các source và giới hạn chứng cứ trong mục 2/4; kết quả có bằng chứng từ [W04-T03](WEEK_04.md#w04-t03), [W02-T04](WEEK_02.md#w02-t04), [W06-T01](WEEK_06.md#w06-t01); trường hợp cần nguồn ngoài chưa có giữ UNKNOWN.
- **Hoạt động từng bước:**
  1. Đọc đúng phiên bản đầu vào, xác định phần đủ để chỉ hồi quy/tích hợp.
  2. Xác nhận U09, attempt/ref/amount VND, timeout.
  3. Đối chiếu ngoại lệ, quyền và invariant tại mục 4; ghi quyết định mở, không tự mở scope.
  4. Chạy kiểm tra TC-07-01 ở mục 5 trong môi trường phù hợp, lưu expected/actual và giới hạn mock.
  5. Đóng tiêu chí bằng hiện vật/log/biên bản, cập nhật mục 8 theo kết quả thật.
- **Đầu ra:** Adapter sandbox, có phiên bản, danh sách tái dùng/thay đổi và lỗi còn mở.
- **Ưu tiên:** P0; **ước lượng:** 8 giờ người, chưa cam kết.
- **Phụ thuộc:** [W04-T03](WEEK_04.md#w04-t03), [W02-T04](WEEK_02.md#w02-t04), [W06-T01](WEEK_06.md#w06-t01).
- **Tiêu chí chấp nhận:** Không production; mock thiếu quyền có nhãn riêng. Có input/expected/actual, source/version hiện vật và không còn P0 trong phạm vi task.
- **Bằng chứng cần thu:** TC-07-01, commit/schema/fixture hoặc biên bản review có ngày/version; hiện chưa có kết quả thực.

<a id="w07-t02"></a>

### W07-T02 Callback an toàn

- **Task ID:** W07-T02; **trạng thái:** PLANNED; **người thực hiện:** UNASSIGNED. Phần nền tảng ở mục 2 có thể PARTIAL, chưa đủ để đóng task.
- **Mục tiêu:** hoàn thiện Webhook phục vụ thanh toán sandbox, tái dùng phần hiện hữu phù hợp.
- **Đầu vào:** các source và giới hạn chứng cứ trong mục 2/4; kết quả có bằng chứng từ [W07-T01](WEEK_07.md#w07-t01); trường hợp cần nguồn ngoài chưa có giữ UNKNOWN.
- **Hoạt động từng bước:**
  1. Đọc đúng phiên bản đầu vào, xác định phần đủ để chỉ hồi quy/tích hợp.
  2. Signature/amount/ref/currency, dedup, atomic update.
  3. Đối chiếu ngoại lệ, quyền và invariant tại mục 4; ghi quyết định mở, không tự mở scope.
  4. Chạy kiểm tra TC-07-02 ở mục 5 trong môi trường phù hợp, lưu expected/actual và giới hạn mock.
  5. Đóng tiêu chí bằng hiện vật/log/biên bản, cập nhật mục 8 theo kết quả thật.
- **Đầu ra:** Webhook, có phiên bản, danh sách tái dùng/thay đổi và lỗi còn mở.
- **Ưu tiên:** P0; **ước lượng:** 8 giờ người, chưa cam kết.
- **Phụ thuộc:** [W07-T01](WEEK_07.md#w07-t01).
- **Tiêu chí chấp nhận:** Sai chữ ký không đổi đơn; trùng/đảo thứ tự không ghi hai lần. Có input/expected/actual, source/version hiện vật và không còn P0 trong phạm vi task.
- **Bằng chứng cần thu:** TC-07-02, commit/schema/fixture hoặc biên bản review có ngày/version; hiện chưa có kết quả thực.

<a id="w07-t03"></a>

### W07-T03 Đối soát

- **Task ID:** W07-T03; **trạng thái:** PLANNED; **người thực hiện:** UNASSIGNED. Phần nền tảng ở mục 2 có thể PARTIAL, chưa đủ để đóng task.
- **Mục tiêu:** hoàn thiện Reconciliation phục vụ thanh toán sandbox, tái dùng phần hiện hữu phù hợp.
- **Đầu vào:** các source và giới hạn chứng cứ trong mục 2/4; kết quả có bằng chứng từ [W07-T02](WEEK_07.md#w07-t02); trường hợp cần nguồn ngoài chưa có giữ UNKNOWN.
- **Hoạt động từng bước:**
  1. Đọc đúng phiên bản đầu vào, xác định phần đủ để chỉ hồi quy/tích hợp.
  2. Theo ngày Asia/Saigon; missing/orphan/mismatch; giải quyết có actor.
  3. Đối chiếu ngoại lệ, quyền và invariant tại mục 4; ghi quyết định mở, không tự mở scope.
  4. Chạy kiểm tra TC-07-03 ở mục 5 trong môi trường phù hợp, lưu expected/actual và giới hạn mock.
  5. Đóng tiêu chí bằng hiện vật/log/biên bản, cập nhật mục 8 theo kết quả thật.
- **Đầu ra:** Reconciliation, có phiên bản, danh sách tái dùng/thay đổi và lỗi còn mở.
- **Ưu tiên:** P0; **ước lượng:** 8 giờ người, chưa cam kết.
- **Phụ thuộc:** [W07-T02](WEEK_07.md#w07-t02).
- **Tiêu chí chấp nhận:** Phát hiện đủ fixture lệch; không tự ghi đã thanh toán. Có input/expected/actual, source/version hiện vật và không còn P0 trong phạm vi task.
- **Bằng chứng cần thu:** TC-07-03, commit/schema/fixture hoặc biên bản review có ngày/version; hiện chưa có kết quả thực.

<a id="w07-t04"></a>

### W07-T04 Kiểm thử thanh toán

- **Task ID:** W07-T04; **trạng thái:** PLANNED; **người thực hiện:** UNASSIGNED. Phần nền tảng ở mục 2 có thể PARTIAL, chưa đủ để đóng task.
- **Mục tiêu:** hoàn thiện Báo cáo sandbox/mock phục vụ thanh toán sandbox, tái dùng phần hiện hữu phù hợp.
- **Đầu vào:** các source và giới hạn chứng cứ trong mục 2/4; kết quả có bằng chứng từ [W07-T02](WEEK_07.md#w07-t02), [W07-T03](WEEK_07.md#w07-t03); trường hợp cần nguồn ngoài chưa có giữ UNKNOWN.
- **Hoạt động từng bước:**
  1. Đọc đúng phiên bản đầu vào, xác định phần đủ để chỉ hồi quy/tích hợp.
  2. Replay, timeout uncertain, hoàn tiền, đơn hủy.
  3. Đối chiếu ngoại lệ, quyền và invariant tại mục 4; ghi quyết định mở, không tự mở scope.
  4. Chạy kiểm tra TC-07-04 ở mục 5 trong môi trường phù hợp, lưu expected/actual và giới hạn mock.
  5. Đóng tiêu chí bằng hiện vật/log/biên bản, cập nhật mục 8 theo kết quả thật.
- **Đầu ra:** Báo cáo sandbox/mock, có phiên bản, danh sách tái dùng/thay đổi và lỗi còn mở.
- **Ưu tiên:** P1; **ước lượng:** 6 giờ người, chưa cam kết.
- **Phụ thuộc:** [W07-T02](WEEK_07.md#w07-t02), [W07-T03](WEEK_07.md#w07-t03).
- **Tiêu chí chấp nhận:** Không nhân doanh thu/tồn; trace event→payment→order. Có input/expected/actual, source/version hiện vật và không còn P0 trong phạm vi task.
- **Bằng chứng cần thu:** TC-07-04, commit/schema/fixture hoặc biên bản review có ngày/version; hiện chưa có kết quả thực.

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

**Khi chậm:** tái ước lượng giờ còn lại theo ID gốc; dời write phụ thuộc sau gate. Thiết kế/mock/luận văn có thể chuẩn bị song song khi có owner. Nếu không đủ tới 26/12 thì xin đổi lịch hoặc giảm phụ trợ, không bỏ AI/evaluation/quyền/bảo toàn. Giữ nguyên baseline để đối chiếu.

## 4. Thiết kế và triển khai kỹ thuật

| Lĩnh vực | Công việc |
|---|---|
| Database | Attempt/callback/reconcile |
| Backend | Signature và dedup |
| Frontend | Trạng thái/đối soát |
| AI Agent | NOT APPLICABLE — không giao quyền thanh toán |
| Security | Signature/replay/redaction |
| Integration | Một provider sandbox |


Các yêu cầu trong bảng là PLANNED. Chi tiết nguồn, xác minh và ranh giới nghiệp vụ:

Tuyên bố đã tích hợp MoMo/VNPay sandbox hiện MISSING ở mức adapter/route trong phạm vi mã ứng dụng quét, UNKNOWN ở mức kết quả chạy; tên enum/SQL không đủ chứng minh ([packages/database/prisma/schema/order.prisma](../../packages/database/prisma/schema/order.prisma); [apps/api/src/modules/payment/payment.route.ts](../../apps/api/src/modules/payment/payment.route.ts); [packages/database/prisma/migration_27_tables/03_verify.sql](../../packages/database/prisma/migration_27_tables/03_verify.sql)). Chốt một provider tối thiểu với GVHD; nếu bản yêu cầu chuẩn bắt buộc cả hai thì provider thứ hai là quyết định mở, không tự loại bỏ. Tái dùng Payment/Callback/Reconciliation; verify signature/amount/currency/ref, unique event, transition nguyên tử; reconcile theo ngày Asia/Saigon, phân missing/orphan/mismatch và resolve có actor/reason.

## 5. Kiểm thử và đánh giá

**Kết quả thực: UNKNOWN.** Chưa có log nghiệm thu tuần được xác minh và phiên này không chạy test. Bảng sau là scenario/expected, không phải kết quả PASS.

| Test ID và task | Kịch bản | Kết quả kỳ vọng | Điều kiện chấp nhận và bằng chứng |
|---|---|---|---|
| TC-07-01 → W07-T01 | Attempt/timeout | Ref/amount/currency đúng, attempt riêng, timeout uncertain | Expected khớp actual, có log hoặc biên bản review ngày/version; sai lệch trọng yếu chặn task |
| TC-07-02 → W07-T02 | Callback invalid/replay/order | Sai chữ ký/ref/amount không paid, trùng một lần, state đúng | Expected khớp actual, có log hoặc biên bản review ngày/version; sai lệch trọng yếu chặn task |
| TC-07-03 → W07-T03 | Reconcile lệch | Missing/orphan/mismatch đếm đủ, resolve actor/note | Expected khớp actual, có log hoặc biên bản review ngày/version; sai lệch trọng yếu chặn task |
| TC-07-04 → W07-T04 | Sandbox/cancel/refund | Không nhân tồn/doanh thu, mock khác provider thật, provider hai chưa làm không ghi xong | Expected khớp actual, có log hoặc biên bản review ngày/version; sai lệch trọng yếu chặn task |

**Mức kiểm thử:** Unit validator/tính toán/state machine; integration transaction/quyền/service hoặc provider boundary; E2E chuỗi nghiệp vụ tuần. Kiểm thử bắt đầu ngay trong tuần triển khai, không đợi W11. Negative/edge: role sai, dữ liệu trống/âm/NaN, state stale, double submit, lỗi phụ thuộc và timeout áp dụng theo từng scenario.

**Bằng chứng tối thiểu:** commit/checksum, schema/fixture/model/prompt version khi liên quan, môi trường, command/procedure, input, expected/actual, timestamp, log che dữ liệu. Mock không chứng minh concurrency/rollback PostgreSQL hoặc provider thật. Không áp dụng ghi NOT APPLICABLE và lý do, không tự đổi thành PASS.

## 6. Rủi ro và phương án xử lý

| Rủi ro | Tác động | Giảm thiểu | Dự phòng |
|---|---|---|---|
| Callback giả/trùng/đảo thứ tự | Paid sai/doanh thu lặp | Signature/amount/ref/event key/atomic transition | Uncertain/reconcile tay |
| Thiếu sandbox hoặc cả hai provider bắt buộc | Thiếu chứng cứ/quá giờ | Chốt provider/quyền/hạn mức | Mock có nhãn, gate sandbox chưa đánh giá, không tự bỏ bắt buộc |

Lỗi quyền/mất dữ liệu/invariant/duplicate là P0 chặn gate. Người chịu trách nhiệm thực: UNASSIGNED. Lịch/GVHD/SQL chuẩn/nhân lực/sandbox còn thiếu phải xác nhận, không tự xem đã xử lý.

## 7. Điều kiện nghiệm thu tuần

**Quality gate G07: NOT EVALUATED.**

- [ ] W07-T01 đạt tiêu chí và TC-07-01 có bằng chứng.
- [ ] W07-T02 đạt tiêu chí và TC-07-02 có bằng chứng.
- [ ] W07-T03 đạt tiêu chí và TC-07-03 có bằng chứng.
- [ ] W07-T04 đạt tiêu chí và TC-07-04 có bằng chứng.
- [ ] Tiên quyết đã đóng; phần chuẩn bị song song tách khỏi write bị chặn; không còn P0.
- [ ] Artifact/input/expected/actual/log hoặc biên bản/version đầy đủ, không nhầm schema có sẵn với runtime đã nghiệm thu.
- [ ] Báo cáo GVHD theo kết quả thật; trạng thái gửi/duyệt có biên nhận nếu ghi đã thực hiện.

**Hiện vật bắt buộc:** Adapter sandbox; Webhook; Reconciliation; Báo cáo sandbox/mock; TC-07-01…04 và lỗi/quyết định chưa đóng. Đây là đầu ra tương lai; phiên này không tạo thêm ngoài 12 Markdown.

**Quy tắc gate:** PASS khi mọi tiêu chí áp dụng đạt và bằng chứng đủ; CONDITIONAL chỉ với P1 không chặn tuần sau, có owner/hạn; FAIL khi vi phạm quyền/invariant/bảo toàn hoặc test bắt buộc không đạt. Chưa chạy/thiếu chứng cứ giữ NOT EVALUATED. Không báo hoàn tất từ checklist.

**Blocker còn lại:** chưa có bằng chứng gate tiền nhiệm, nhân lực và dữ liệu/môi trường kiểm thử phù hợp; chi tiết mục 3–6. Kế hoạch cũ không chứng minh gate đã qua.

## 8. Báo cáo gửi giảng viên

Mẫu điền tuần 07 (16/11–21/11/2026), theo cấu trúc được cung cấp vì chưa tìm thấy bao-cao-tuan.docx. Không điền kết quả kỳ vọng thành thành tích.

| Nội dung | Thông tin cần điền |
|---|---|
| Công việc đã hoàn thành | Chưa xác minh task hoàn tất; điền ID/phần việc thật/ngày/source, nền tảng mục 2 không thay nghiệm thu |
| Kỹ thuật trọng tâm | Thanh toán sandbox; ghi phần tái dùng TLCN và thay đổi đã làm |
| Kết quả đạt được | Chỉ output/test đo thật, commit/fixture/log/biên bản; hiện UNKNOWN |
| Khó khăn và hạn chế | Blocker mục 6–7, ảnh hưởng/owner/giờ còn lại theo ID |
| Kế hoạch tuần tiếp theo | Đối chiếu [tuần 08](WEEK_08.md) sau G07; giữ ID tồn, chỉ chuẩn bị phần không bị chặn |
| Nội dung xin ý kiến GVHD | Ngoại lệ nghiệp vụ/COGS, phạm vi provider sandbox và blocker nghiệm thu |
| Trạng thái nộp và duyệt | UNKNOWN — chưa có biên nhận; điền ngày/người nhận hoặc duyệt/link bằng chứng/điều kiện thực |

**Cập nhật tiến độ:** ghi ID kế hoạch/thực tế/phần còn lại/bằng chứng/quyết định dời lịch. Task chỉ VERIFIED khi toàn bộ tiêu chí có chứng cứ; test definition/hiện vật chỉ xác nhận nhận định hẹp.
