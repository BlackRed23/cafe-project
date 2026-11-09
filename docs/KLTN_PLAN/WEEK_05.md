# Tuần 05 Inventory Engine và công thức

## 1. Thông tin tuần

- **Tuần và thời gian:** 05, 02/11–07/11/2026; baseline đề xuất, chưa xác minh hạn trường. Các tuần là luồng công việc, không mặc định đã hoàn tất theo ngày.
- **Mục tiêu:** Inventory Engine và công thức, tái dùng TLCN và hoàn thiện phần thiếu, giữ AI Agent là đóng góp trung tâm.
- **Ngày kiểm kê:** 01/11/2026, Asia/Saigon; cuối khoảng W04, trước W05 ngày 02/11. Phiên này chỉ đọc source/tài liệu, không chạy build/test/SQL/migration/ứng dụng hoặc dịch vụ ngoài.
- **Tình trạng:** PARTIAL ở mức mã/schema; chưa có task nghiệm thu trọn tiêu chí. Test/runtime và duyệt GVHD: UNKNOWN.
- **Phụ thuộc:** [W04-T04](WEEK_04.md#w04-t04). Chuẩn bị thiết kế/fixture/mock có thể song song; write chờ gate tiên quyết.
- **Nhân lực:** UNASSIGNED. Công sức 30 giờ người/tuần (8+8+8+6) là ước lượng chưa cam kết, 360 giờ toàn kỳ chưa gồm dự phòng, cần tái ước lượng khi rõ nhân lực.

**Quy ước:** VERIFIED xác nhận nhận định hẹp có hiện vật/mã; PARTIAL mới có một phần; MISSING chưa tìm thấy hiện vật trong phạm vi quét; UNKNOWN thiếu bằng chứng để kết luận; PLANNED là việc dự kiến. VERIFIED schema hoặc test definition không đồng nghĩa task xong hay test PASS.

**Báo cáo tham chiếu:** chưa tìm thấy bao-cao-tuan.docx trong repository, D:/KLTN hoặc attachments đã quét (MISSING). Không coi các tuyên bố được yêu cầu kiểm tra trong prompt là nội dung báo cáo đã đọc. Mục 8 dùng đúng cấu trúc bạn cung cấp; nếu nhận bản gốc thì đối chiếu trong task hiện có.

**Đường găng chung:** yêu cầu/quy tắc W02 → DB/API/Agent design W03 → migration rehearsal W04 → Inventory Engine W05 → business services W06 → tools/quyền W08 → workflow/recovery W09 → E2E/freeze W10 → evaluation W11. Thanh toán W07 là nhánh bắt buộc trước E2E W10. Không đợi W07 để chuẩn bị read/mock tools nếu nghiệp vụ/quyền đã đủ; không chạy write tools trước gate tương ứng. Các cạnh cụ thể ở mỗi task, không có vòng.

## 2. Công việc đã hoàn thành

**Chưa xác minh hoàn thành trọn vẹn task nào của tuần.** Phần nền tảng hiện hữu được ghi dưới đây theo source, không suy từ sự tồn tại file thành nghiệm thu KLTN. Tái dùng phần phù hợp, chỉ review/hồi quy/thích nghi/tích hợp thay vì dựng lại.

| Task ID liên quan | Nội dung và kết quả quan sát | File source hoặc tài liệu chứng minh | Kết quả kiểm thử | Trạng thái xác minh task |
|---|---|---|---|---|
| W05-T01 | Recipe/Ingredient/Topping có version/yield/Decimal cần tái dùng | [packages/database/prisma/schema/product.prisma](../../packages/database/prisma/schema/product.prisma); [packages/database/prisma/schema/inventory.prisma](../../packages/database/prisma/schema/inventory.prisma) | UNKNOWN — chưa có log hiện hành được xác minh, phiên này không chạy test | PARTIAL; chưa nghiệm thu task |
| W05-T02 | Có transaction/conditional update TLCN, chưa chứng minh consume theo recipe | [apps/api/src/modules/inventory/inventory.repository.ts](../../apps/api/src/modules/inventory/inventory.repository.ts); [apps/api/src/modules/order/order.repository.ts](../../apps/api/src/modules/order/order.repository.ts); [apps/api/tests/inventory-consistency.test.cjs](../../apps/api/tests/inventory-consistency.test.cjs) | UNKNOWN — chưa có log hiện hành được xác minh, phiên này không chạy test | PARTIAL; chưa nghiệm thu task |
| W05-T03 | Có PR/nhận kho legacy và GoodsReceipt trong schema; chưa nghiệm thu nhận nguyên liệu | [apps/api/src/modules/purchase/purchase.repository.ts](../../apps/api/src/modules/purchase/purchase.repository.ts); [packages/database/prisma/schema/purchase.prisma](../../packages/database/prisma/schema/purchase.prisma); [packages/database/prisma/schema/inventory.prisma](../../packages/database/prisma/schema/inventory.prisma) | UNKNOWN — chưa có log hiện hành được xác minh, phiên này không chạy test | PARTIAL; chưa nghiệm thu task |

## 3. Công việc cần thực hiện

Các bước triển khai/kiểm thử bên dưới là kế hoạch cho đợt thực hiện riêng. Phiên này chỉ tạo 12 Markdown; không thay đổi mã hoặc tài liệu cũ. Các ID giữ tương ứng bộ kế hoạch trước để không nhân bản công việc.

<a id="w05-t01"></a>

### W05-T01 CRUD nguyên liệu/công thức

- **Task ID:** W05-T01; **trạng thái:** PLANNED; **người thực hiện:** UNASSIGNED. Phần nền tảng ở mục 2 có thể PARTIAL, chưa đủ để đóng task.
- **Mục tiêu:** hoàn thiện API/UI công thức phục vụ inventory engine và công thức, tái dùng phần hiện hữu phù hợp.
- **Đầu vào:** các source và giới hạn chứng cứ trong mục 2/4; kết quả có bằng chứng từ [W04-T04](WEEK_04.md#w04-t04); trường hợp cần nguồn ngoài chưa có giữ UNKNOWN.
- **Hoạt động từng bước:**
  1. Đọc đúng phiên bản đầu vào, xác định phần đủ để chỉ hồi quy/tích hợp.
  2. Recipe version/yield, topping, unit conversion.
  3. Đối chiếu ngoại lệ, quyền và invariant tại mục 4; ghi quyết định mở, không tự mở scope.
  4. Chạy kiểm tra TC-05-01 ở mục 5 trong môi trường phù hợp, lưu expected/actual và giới hạn mock.
  5. Đóng tiêu chí bằng hiện vật/log/biên bản, cập nhật mục 8 theo kết quả thật.
- **Đầu ra:** API/UI công thức, có phiên bản, danh sách tái dùng/thay đổi và lỗi còn mở.
- **Ưu tiên:** P0; **ước lượng:** 8 giờ người, chưa cam kết.
- **Phụ thuộc:** [W04-T04](WEEK_04.md#w04-t04).
- **Tiêu chí chấp nhận:** Âm/NaN/sai đơn vị bị chặn; snapshot bất biến. Có input/expected/actual, source/version hiện vật và không còn P0 trong phạm vi task.
- **Bằng chứng cần thu:** TC-05-01, commit/schema/fixture hoặc biên bản review có ngày/version; hiện chưa có kết quả thực.

<a id="w05-t02"></a>

### W05-T02 FEFO và reservation

- **Task ID:** W05-T02; **trạng thái:** PLANNED; **người thực hiện:** UNASSIGNED. Phần nền tảng ở mục 2 có thể PARTIAL, chưa đủ để đóng task.
- **Mục tiêu:** hoàn thiện Inventory Engine phục vụ inventory engine và công thức, tái dùng phần hiện hữu phù hợp.
- **Đầu vào:** các source và giới hạn chứng cứ trong mục 2/4; kết quả có bằng chứng từ [W05-T01](WEEK_05.md#w05-t01); trường hợp cần nguồn ngoài chưa có giữ UNKNOWN.
- **Hoạt động từng bước:**
  1. Đọc đúng phiên bản đầu vào, xác định phần đủ để chỉ hồi quy/tích hợp.
  2. Khóa lô có thứ tự, conditional/version update, ledger cùng transaction.
  3. Đối chiếu ngoại lệ, quyền và invariant tại mục 4; ghi quyết định mở, không tự mở scope.
  4. Chạy kiểm tra TC-05-02 ở mục 5 trong môi trường phù hợp, lưu expected/actual và giới hạn mock.
  5. Đóng tiêu chí bằng hiện vật/log/biên bản, cập nhật mục 8 theo kết quả thật.
- **Đầu ra:** Inventory Engine, có phiên bản, danh sách tái dùng/thay đổi và lỗi còn mở.
- **Ưu tiên:** P0; **ước lượng:** 8 giờ người, chưa cam kết.
- **Phụ thuộc:** [W05-T01](WEEK_05.md#w05-t01).
- **Tiêu chí chấp nhận:** Không âm; quantity=sum lô; 0≤reserved≤quantity khi tranh chấp. Có input/expected/actual, source/version hiện vật và không còn P0 trong phạm vi task.
- **Bằng chứng cần thu:** TC-05-02, commit/schema/fixture hoặc biên bản review có ngày/version; hiện chưa có kết quả thực.

<a id="w05-t03"></a>

### W05-T03 Mua và nhận hàng

- **Task ID:** W05-T03; **trạng thái:** PLANNED; **người thực hiện:** UNASSIGNED. Phần nền tảng ở mục 2 có thể PARTIAL, chưa đủ để đóng task.
- **Mục tiêu:** hoàn thiện GoodsReceipt phục vụ inventory engine và công thức, tái dùng phần hiện hữu phù hợp.
- **Đầu vào:** các source và giới hạn chứng cứ trong mục 2/4; kết quả có bằng chứng từ [W05-T02](WEEK_05.md#w05-t02); trường hợp cần nguồn ngoài chưa có giữ UNKNOWN.
- **Hoạt động từng bước:**
  1. Đọc đúng phiên bản đầu vào, xác định phần đủ để chỉ hồi quy/tích hợp.
  2. SupplierIngredient, MOQ, receipt từng phần, lô/hạn/key.
  3. Đối chiếu ngoại lệ, quyền và invariant tại mục 4; ghi quyết định mở, không tự mở scope.
  4. Chạy kiểm tra TC-05-03 ở mục 5 trong môi trường phù hợp, lưu expected/actual và giới hạn mock.
  5. Đóng tiêu chí bằng hiện vật/log/biên bản, cập nhật mục 8 theo kết quả thật.
- **Đầu ra:** GoodsReceipt, có phiên bản, danh sách tái dùng/thay đổi và lỗi còn mở.
- **Ưu tiên:** P0; **ước lượng:** 8 giờ người, chưa cam kết.
- **Phụ thuộc:** [W05-T02](WEEK_05.md#w05-t02).
- **Tiêu chí chấp nhận:** Nhận lặp không tăng tồn hai lần; chặn over-receipt. Có input/expected/actual, source/version hiện vật và không còn P0 trong phạm vi task.
- **Bằng chứng cần thu:** TC-05-03, commit/schema/fixture hoặc biên bản review có ngày/version; hiện chưa có kết quả thực.

<a id="w05-t04"></a>

### W05-T04 Kiểm thử kho

- **Task ID:** W05-T04; **trạng thái:** PLANNED; **người thực hiện:** UNASSIGNED. Phần nền tảng ở mục 2 có thể PARTIAL, chưa đủ để đóng task.
- **Mục tiêu:** hoàn thiện Báo cáo invariant phục vụ inventory engine và công thức, tái dùng phần hiện hữu phù hợp.
- **Đầu vào:** các source và giới hạn chứng cứ trong mục 2/4; kết quả có bằng chứng từ [W05-T02](WEEK_05.md#w05-t02), [W05-T03](WEEK_05.md#w05-t03); trường hợp cần nguồn ngoài chưa có giữ UNKNOWN.
- **Hoạt động từng bước:**
  1. Đọc đúng phiên bản đầu vào, xác định phần đủ để chỉ hồi quy/tích hợp.
  2. Fault injection và hai phiên PostgreSQL sao chép.
  3. Đối chiếu ngoại lệ, quyền và invariant tại mục 4; ghi quyết định mở, không tự mở scope.
  4. Chạy kiểm tra TC-05-04 ở mục 5 trong môi trường phù hợp, lưu expected/actual và giới hạn mock.
  5. Đóng tiêu chí bằng hiện vật/log/biên bản, cập nhật mục 8 theo kết quả thật.
- **Đầu ra:** Báo cáo invariant, có phiên bản, danh sách tái dùng/thay đổi và lỗi còn mở.
- **Ưu tiên:** P1; **ước lượng:** 6 giờ người, chưa cam kết.
- **Phụ thuộc:** [W05-T02](WEEK_05.md#w05-t02), [W05-T03](WEEK_05.md#w05-t03).
- **Tiêu chí chấp nhận:** Lỗi rollback toàn bộ, không bán vượt tồn. Có input/expected/actual, source/version hiện vật và không còn P0 trong phạm vi task.
- **Bằng chứng cần thu:** TC-05-04, commit/schema/fixture hoặc biên bản review có ngày/version; hiện chưa có kết quả thực.

### Công việc tồn và điều chỉnh lịch

Chưa có chứng cứ nghiệm thu toàn bộ task trước; giữ nguyên ID, tiếp tục task gốc thay vì tạo lại thành việc triển khai mới:

| Tuần nguồn | Task chưa đóng hoặc chờ xác minh | Xử lý |
|---|---|---|
| [Tuần 01](WEEK_01.md) | W01-T01, W01-T02, W01-T03, W01-T04 | Thu bằng chứng, đóng task gốc; chặn write hậu nhiệm nếu chưa đạt tiên quyết |
| [Tuần 02](WEEK_02.md) | W02-T01, W02-T02, W02-T03, W02-T04 | Thu bằng chứng, đóng task gốc; chặn write hậu nhiệm nếu chưa đạt tiên quyết |
| [Tuần 03](WEEK_03.md) | W03-T01, W03-T02, W03-T03, W03-T04 | Thu bằng chứng, đóng task gốc; chặn write hậu nhiệm nếu chưa đạt tiên quyết |
| [Tuần 04](WEEK_04.md) | W04-T01, W04-T02, W04-T03, W04-T04 | Thu bằng chứng, đóng task gốc; chặn write hậu nhiệm nếu chưa đạt tiên quyết |

**Phục hồi có điều kiện:** 02–03/11 rà W01–02 và xin quyết định SQL/quy tắc/lịch/GVHD; 04–07/11 ưu tiên chốt W03, chuẩn bị hoặc diễn tập W04 khi đủ điều kiện. Không cam kết dồn 120 giờ chưa nghiệm thu vào một tuần. Nếu G04 chưa qua trước 09/11, dời W05 và write hậu nhiệm, chỉ chuẩn bị mock/fixture song song; xin điều chỉnh lịch/nhân lực/phụ trợ. Giữ lịch lịch sử, không đổi thành đã xong.

## 4. Thiết kế và triển khai kỹ thuật

| Lĩnh vực | Công việc |
|---|---|
| Database | Ledger/lô/recipe/receipt |
| Backend | FEFO/reserve/nhận hàng |
| Frontend | Form nguyên liệu/công thức |
| AI Agent | NOT APPLICABLE — giữ contract |
| Security | Quyền ghi kho |
| Integration | PR→receipt→lô |


Các yêu cầu trong bảng là PLANNED. Chi tiết nguồn, xác minh và ranh giới nghiệp vụ:

Recipe-based inventory mới VERIFIED ở mức schema ([packages/database/prisma/schema/product.prisma](../../packages/database/prisma/schema/product.prisma); [packages/database/prisma/schema/inventory.prisma](../../packages/database/prisma/schema/inventory.prisma)); [apps/api/src/modules/order/order.repository.ts](../../apps/api/src/modules/order/order.repository.ts); [apps/api/src/modules/inventory/inventory.repository.ts](../../apps/api/src/modules/inventory/inventory.repository.ts) vẫn thao tác kho legacy, không chứng minh consume recipe hoàn tất. Tái dùng Decimal/version/relations/conditional update, không dựng lại bảng. Invariant cần duyệt: quantity bằng tổng quantityRemaining các lô có số dư vật lý, kể cả lô hết hạn còn kho; khả dụng để pha chỉ lấy lô còn hạn và trừ reservation đúng phạm vi. Lô hết hạn phải qua waste/quarantine có dấu vết, không tự biến mất khỏi đối soát. Giữ 0≤reserved≤quantity; không cộng g/ml/cái. Receipt/lô/tổng/ledger commit cùng transaction, key bền vững, race và rollback cần test PostgreSQL bản sao.

## 5. Kiểm thử và đánh giá

**Kết quả thực: UNKNOWN.** Chưa có log nghiệm thu tuần được xác minh và phiên này không chạy test. Bảng sau là scenario/expected, không phải kết quả PASS.

| Test ID và task | Kịch bản | Kết quả kỳ vọng | Điều kiện chấp nhận và bằng chứng |
|---|---|---|---|
| TC-05-01 → W05-T01 | Unit conversion/recipe/topping | Yield dương/số hữu hạn, snapshot/version bất biến | Expected khớp actual, có log hoặc biên bản review ngày/version; sai lệch trọng yếu chặn task |
| TC-05-02 → W05-T02 | Hai phiên FEFO/reserve | Lô hết hạn không pha, không âm, lô/tổng khớp | Expected khớp actual, có log hoặc biên bản review ngày/version; sai lệch trọng yếu chặn task |
| TC-05-03 → W05-T03 | Receipt partial/replay | Đúng số nhận, key replay không tăng tồn, chặn over-receipt | Expected khớp actual, có log hoặc biên bản review ngày/version; sai lệch trọng yếu chặn task |
| TC-05-04 → W05-T04 | Lỗi giữa lô/tổng/ledger | PostgreSQL rollback toàn bộ, không side effect trước commit | Expected khớp actual, có log hoặc biên bản review ngày/version; sai lệch trọng yếu chặn task |

**Mức kiểm thử:** Unit validator/tính toán/state machine; integration transaction/quyền/service hoặc provider boundary; E2E chuỗi nghiệp vụ tuần. Kiểm thử bắt đầu ngay trong tuần triển khai, không đợi W11. Negative/edge: role sai, dữ liệu trống/âm/NaN, state stale, double submit, lỗi phụ thuộc và timeout áp dụng theo từng scenario.

**Bằng chứng tối thiểu:** commit/checksum, schema/fixture/model/prompt version khi liên quan, môi trường, command/procedure, input, expected/actual, timestamp, log che dữ liệu. Mock không chứng minh concurrency/rollback PostgreSQL hoặc provider thật. Không áp dụng ghi NOT APPLICABLE và lý do, không tự đổi thành PASS.

## 6. Rủi ro và phương án xử lý

| Rủi ro | Tác động | Giảm thiểu | Dự phòng |
|---|---|---|---|
| Race/hết hạn/unit sai | Âm tồn/sai COGS | Khóa thứ tự/version/Decimal/FEFO | Rollback toàn transaction, chặn bán khi invariant sai |
| Receipt trùng/thừa | Nhân tồn/công nợ | Key nguyên tử/lượng đã nhận/MOQ | Từ chối hoặc pending review |

Lỗi quyền/mất dữ liệu/invariant/duplicate là P0 chặn gate. Người chịu trách nhiệm thực: UNASSIGNED. Lịch/GVHD/SQL chuẩn/nhân lực/sandbox còn thiếu phải xác nhận, không tự xem đã xử lý.

## 7. Điều kiện nghiệm thu tuần

**Quality gate G05: NOT EVALUATED.**

- [ ] W05-T01 đạt tiêu chí và TC-05-01 có bằng chứng.
- [ ] W05-T02 đạt tiêu chí và TC-05-02 có bằng chứng.
- [ ] W05-T03 đạt tiêu chí và TC-05-03 có bằng chứng.
- [ ] W05-T04 đạt tiêu chí và TC-05-04 có bằng chứng.
- [ ] Tiên quyết đã đóng; phần chuẩn bị song song tách khỏi write bị chặn; không còn P0.
- [ ] Artifact/input/expected/actual/log hoặc biên bản/version đầy đủ, không nhầm schema có sẵn với runtime đã nghiệm thu.
- [ ] Báo cáo GVHD theo kết quả thật; trạng thái gửi/duyệt có biên nhận nếu ghi đã thực hiện.

**Hiện vật bắt buộc:** API/UI công thức; Inventory Engine; GoodsReceipt; Báo cáo invariant; TC-05-01…04 và lỗi/quyết định chưa đóng. Đây là đầu ra tương lai; phiên này không tạo thêm ngoài 12 Markdown.

**Quy tắc gate:** PASS khi mọi tiêu chí áp dụng đạt và bằng chứng đủ; CONDITIONAL chỉ với P1 không chặn tuần sau, có owner/hạn; FAIL khi vi phạm quyền/invariant/bảo toàn hoặc test bắt buộc không đạt. Chưa chạy/thiếu chứng cứ giữ NOT EVALUATED. Không báo hoàn tất từ checklist.

**Blocker còn lại:** chưa có bằng chứng gate tiền nhiệm, nhân lực và dữ liệu/môi trường kiểm thử phù hợp; chi tiết mục 3–6. Kế hoạch cũ không chứng minh gate đã qua.

## 8. Báo cáo gửi giảng viên

Mẫu điền tuần 05 (02/11–07/11/2026), theo cấu trúc được cung cấp vì chưa tìm thấy bao-cao-tuan.docx. Không điền kết quả kỳ vọng thành thành tích.

| Nội dung | Thông tin cần điền |
|---|---|
| Công việc đã hoàn thành | Chưa xác minh task hoàn tất; điền ID/phần việc thật/ngày/source, nền tảng mục 2 không thay nghiệm thu |
| Kỹ thuật trọng tâm | Inventory Engine và công thức; ghi phần tái dùng TLCN và thay đổi đã làm |
| Kết quả đạt được | Chỉ output/test đo thật, commit/fixture/log/biên bản; hiện UNKNOWN |
| Khó khăn và hạn chế | Blocker mục 6–7, ảnh hưởng/owner/giờ còn lại theo ID |
| Kế hoạch tuần tiếp theo | Đối chiếu [tuần 06](WEEK_06.md) sau G05; giữ ID tồn, chỉ chuẩn bị phần không bị chặn |
| Nội dung xin ý kiến GVHD | Ngoại lệ nghiệp vụ/COGS, phạm vi provider sandbox và blocker nghiệm thu |
| Trạng thái nộp và duyệt | UNKNOWN — chưa có biên nhận; điền ngày/người nhận hoặc duyệt/link bằng chứng/điều kiện thực |

**Cập nhật tiến độ:** ghi ID kế hoạch/thực tế/phần còn lại/bằng chứng/quyết định dời lịch. Task chỉ VERIFIED khi toàn bộ tiêu chí có chứng cứ; test definition/hiện vật chỉ xác nhận nhận định hẹp.
