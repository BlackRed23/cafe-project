# Tuần 04 Migration schema và xác minh bảo toàn

## 1. Thông tin tuần

- **Tuần và thời gian:** 04, 26/10–31/10/2026; baseline đề xuất, chưa xác minh hạn trường. Các tuần là luồng công việc, không mặc định đã hoàn tất theo ngày.
- **Mục tiêu:** Migration schema và xác minh bảo toàn, tái dùng TLCN và hoàn thiện phần thiếu, giữ AI Agent là đóng góp trung tâm.
- **Ngày kiểm kê:** 01/11/2026, Asia/Saigon; cuối khoảng W04, trước W05 ngày 02/11. Phiên này chỉ đọc source/tài liệu, không chạy build/test/SQL/migration/ứng dụng hoặc dịch vụ ngoài.
- **Tình trạng:** PARTIAL ở mức mã/schema; chưa có task nghiệm thu trọn tiêu chí. Test/runtime và duyệt GVHD: UNKNOWN.
- **Phụ thuộc:** [W03-T01](WEEK_03.md#w03-t01), [W03-T02](WEEK_03.md#w03-t02), [W03-T03](WEEK_03.md#w03-t03), [W03-T04](WEEK_03.md#w03-t04). Chuẩn bị thiết kế/fixture/mock có thể song song; write chờ gate tiên quyết.
- **Nhân lực:** UNASSIGNED. Công sức 30 giờ người/tuần (8+8+8+6) là ước lượng chưa cam kết, 360 giờ toàn kỳ chưa gồm dự phòng, cần tái ước lượng khi rõ nhân lực.

**Quy ước:** VERIFIED xác nhận nhận định hẹp có hiện vật/mã; PARTIAL mới có một phần; MISSING chưa tìm thấy hiện vật trong phạm vi quét; UNKNOWN thiếu bằng chứng để kết luận; PLANNED là việc dự kiến. VERIFIED schema hoặc test definition không đồng nghĩa task xong hay test PASS.

**Báo cáo tham chiếu:** chưa tìm thấy bao-cao-tuan.docx trong repository, D:/KLTN hoặc attachments đã quét (MISSING). Không coi các tuyên bố được yêu cầu kiểm tra trong prompt là nội dung báo cáo đã đọc. Mục 8 dùng đúng cấu trúc bạn cung cấp; nếu nhận bản gốc thì đối chiếu trong task hiện có.

**Đường găng chung:** yêu cầu/quy tắc W02 → DB/API/Agent design W03 → migration rehearsal W04 → Inventory Engine W05 → business services W06 → tools/quyền W08 → workflow/recovery W09 → E2E/freeze W10 → evaluation W11. Thanh toán W07 là nhánh bắt buộc trước E2E W10. Không đợi W07 để chuẩn bị read/mock tools nếu nghiệp vụ/quyền đã đủ; không chạy write tools trước gate tương ứng. Các cạnh cụ thể ở mỗi task, không có vòng.

## 2. Công việc đã hoàn thành

**Chưa xác minh hoàn thành trọn vẹn task nào của tuần.** Phần nền tảng hiện hữu được ghi dưới đây theo source, không suy từ sự tồn tại file thành nghiệm thu KLTN. Tái dùng phần phù hợp, chỉ review/hồi quy/thích nghi/tích hợp thay vì dựng lại.

| Task ID liên quan | Nội dung và kết quả quan sát | File source hoặc tài liệu chứng minh | Kết quả kiểm thử | Trạng thái xác minh task |
|---|---|---|---|---|
| W04-T02 | SQL mở rộng thêm 16 bảng từ 15, contract bỏ bốn legacy; chưa có log migrate 15→27 | [packages/database/prisma/schema/migrations/20260718025427_init_schema_and_unique_keys/migration.sql](../../packages/database/prisma/schema/migrations/20260718025427_init_schema_and_unique_keys/migration.sql); [packages/database/prisma/migration_27_tables/01_expand.sql](../../packages/database/prisma/migration_27_tables/01_expand.sql); [packages/database/prisma/migration_27_tables/04_contract_DO_NOT_RUN_YET.sql](../../packages/database/prisma/migration_27_tables/04_contract_DO_NOT_RUN_YET.sql) | UNKNOWN — chưa có log hiện hành được xác minh, phiên này không chạy test | PARTIAL; chưa nghiệm thu task |
| W04-T03 | Có verify/rollback; script ghi CHK_06–08 NOT_EXECUTED; chưa có rehearsal log | [packages/database/prisma/migration_27_tables/03_verify.sql](../../packages/database/prisma/migration_27_tables/03_verify.sql); [packages/database/prisma/migration_27_tables/05_rollback_plan.sql](../../packages/database/prisma/migration_27_tables/05_rollback_plan.sql) | UNKNOWN — chưa có log hiện hành được xác minh, phiên này không chạy test | PARTIAL; chưa nghiệm thu task |
| W04-T04 | Kho vẫn dùng Inventory/InventoryBatch, chưa nghiệm thu API ingredient | [apps/api/src/modules/inventory/inventory.repository.ts](../../apps/api/src/modules/inventory/inventory.repository.ts) | UNKNOWN — chưa có log hiện hành được xác minh, phiên này không chạy test | PARTIAL; chưa nghiệm thu task |

## 3. Công việc cần thực hiện

Các bước triển khai/kiểm thử bên dưới là kế hoạch cho đợt thực hiện riêng. Phiên này chỉ tạo 12 Markdown; không thay đổi mã hoặc tài liệu cũ. Các ID giữ tương ứng bộ kế hoạch trước để không nhân bản công việc.

<a id="w04-t01"></a>

### W04-T01 Review thiết kế

- **Task ID:** W04-T01; **trạng thái:** PLANNED; **người thực hiện:** UNASSIGNED. Phần nền tảng ở mục 2 có thể PARTIAL, chưa đủ để đóng task.
- **Mục tiêu:** hoàn thiện Biên bản review phục vụ migration schema và xác minh bảo toàn, tái dùng phần hiện hữu phù hợp.
- **Đầu vào:** các source và giới hạn chứng cứ trong mục 2/4; kết quả có bằng chứng từ [W03-T01](WEEK_03.md#w03-t01), [W03-T02](WEEK_03.md#w03-t02), [W03-T03](WEEK_03.md#w03-t03), [W03-T04](WEEK_03.md#w03-t04); trường hợp cần nguồn ngoài chưa có giữ UNKNOWN.
- **Hoạt động từng bước:**
  1. Đọc đúng phiên bản đầu vào, xác định phần đủ để chỉ hồi quy/tích hợp.
  2. Đóng quyết định P0 với GVHD/chủ quán.
  3. Đối chiếu ngoại lệ, quyền và invariant tại mục 4; ghi quyết định mở, không tự mở scope.
  4. Chạy kiểm tra TC-04-01 ở mục 5 trong môi trường phù hợp, lưu expected/actual và giới hạn mock.
  5. Đóng tiêu chí bằng hiện vật/log/biên bản, cập nhật mục 8 theo kết quả thật.
- **Đầu ra:** Biên bản review, có phiên bản, danh sách tái dùng/thay đổi và lỗi còn mở.
- **Ưu tiên:** P0; **ước lượng:** 8 giờ người, chưa cam kết.
- **Phụ thuộc:** [W03-T01](WEEK_03.md#w03-t01), [W03-T02](WEEK_03.md#w03-t02), [W03-T03](WEEK_03.md#w03-t03), [W03-T04](WEEK_03.md#w03-t04).
- **Tiêu chí chấp nhận:** Có quyết định thật, không giả phê duyệt. Có input/expected/actual, source/version hiện vật và không còn P0 trong phạm vi task.
- **Bằng chứng cần thu:** TC-04-01, commit/schema/fixture hoặc biên bản review có ngày/version; hiện chưa có kết quả thực.

<a id="w04-t02"></a>

### W04-T02 Chuẩn hóa migration

- **Task ID:** W04-T02; **trạng thái:** PLANNED; **người thực hiện:** UNASSIGNED. Phần nền tảng ở mục 2 có thể PARTIAL, chưa đủ để đóng task.
- **Mục tiêu:** hoàn thiện Migration ứng viên phục vụ migration schema và xác minh bảo toàn, tái dùng phần hiện hữu phù hợp.
- **Đầu vào:** các source và giới hạn chứng cứ trong mục 2/4; kết quả có bằng chứng từ [W04-T01](WEEK_04.md#w04-t01); trường hợp cần nguồn ngoài chưa có giữ UNKNOWN.
- **Hoạt động từng bước:**
  1. Đọc đúng phiên bản đầu vào, xác định phần đủ để chỉ hồi quy/tích hợp.
  2. Trong đợt triển khai riêng sửa drift/cú pháp, replay bản sao.
  3. Đối chiếu ngoại lệ, quyền và invariant tại mục 4; ghi quyết định mở, không tự mở scope.
  4. Chạy kiểm tra TC-04-02 ở mục 5 trong môi trường phù hợp, lưu expected/actual và giới hạn mock.
  5. Đóng tiêu chí bằng hiện vật/log/biên bản, cập nhật mục 8 theo kết quả thật.
- **Đầu ra:** Migration ứng viên, có phiên bản, danh sách tái dùng/thay đổi và lỗi còn mở.
- **Ưu tiên:** P0; **ước lượng:** 8 giờ người, chưa cam kết.
- **Phụ thuộc:** [W04-T01](WEEK_04.md#w04-t01).
- **Tiêu chí chấp nhận:** Compile và schema diff không còn lệch P0. Có input/expected/actual, source/version hiện vật và không còn P0 trong phạm vi task.
- **Bằng chứng cần thu:** TC-04-02, commit/schema/fixture hoặc biên bản review có ngày/version; hiện chưa có kết quả thực.

<a id="w04-t03"></a>

### W04-T03 Diễn tập phục hồi

- **Task ID:** W04-T03; **trạng thái:** PLANNED; **người thực hiện:** UNASSIGNED. Phần nền tảng ở mục 2 có thể PARTIAL, chưa đủ để đóng task.
- **Mục tiêu:** hoàn thiện Log rehearsal phục vụ migration schema và xác minh bảo toàn, tái dùng phần hiện hữu phù hợp.
- **Đầu vào:** các source và giới hạn chứng cứ trong mục 2/4; kết quả có bằng chứng từ [W04-T02](WEEK_04.md#w04-t02); trường hợp cần nguồn ngoài chưa có giữ UNKNOWN.
- **Hoạt động từng bước:**
  1. Đọc đúng phiên bản đầu vào, xác định phần đủ để chỉ hồi quy/tích hợp.
  2. Backup bản sao, inject lỗi từng pha, đối soát sau restore.
  3. Đối chiếu ngoại lệ, quyền và invariant tại mục 4; ghi quyết định mở, không tự mở scope.
  4. Chạy kiểm tra TC-04-03 ở mục 5 trong môi trường phù hợp, lưu expected/actual và giới hạn mock.
  5. Đóng tiêu chí bằng hiện vật/log/biên bản, cập nhật mục 8 theo kết quả thật.
- **Đầu ra:** Log rehearsal, có phiên bản, danh sách tái dùng/thay đổi và lỗi còn mở.
- **Ưu tiên:** P0; **ước lượng:** 8 giờ người, chưa cam kết.
- **Phụ thuộc:** [W04-T02](WEEK_04.md#w04-t02).
- **Tiêu chí chấp nhận:** Count/tồn theo đơn vị/tiền/FK bảo toàn; kiểm tra bắt buộc đã chạy. Có input/expected/actual, source/version hiện vật và không còn P0 trong phạm vi task.
- **Bằng chứng cần thu:** TC-04-03, commit/schema/fixture hoặc biên bản review có ngày/version; hiện chưa có kết quả thực.

<a id="w04-t04"></a>

### W04-T04 Lát cắt nguyên liệu

- **Task ID:** W04-T04; **trạng thái:** PLANNED; **người thực hiện:** UNASSIGNED. Phần nền tảng ở mục 2 có thể PARTIAL, chưa đủ để đóng task.
- **Mục tiêu:** hoàn thiện API tối thiểu phục vụ migration schema và xác minh bảo toàn, tái dùng phần hiện hữu phù hợp.
- **Đầu vào:** các source và giới hạn chứng cứ trong mục 2/4; kết quả có bằng chứng từ [W04-T03](WEEK_04.md#w04-t03); trường hợp cần nguồn ngoài chưa có giữ UNKNOWN.
- **Hoạt động từng bước:**
  1. Đọc đúng phiên bản đầu vào, xác định phần đủ để chỉ hồi quy/tích hợp.
  2. Sau gate DB thêm API/validator và fixture quyền.
  3. Đối chiếu ngoại lệ, quyền và invariant tại mục 4; ghi quyết định mở, không tự mở scope.
  4. Chạy kiểm tra TC-04-04 ở mục 5 trong môi trường phù hợp, lưu expected/actual và giới hạn mock.
  5. Đóng tiêu chí bằng hiện vật/log/biên bản, cập nhật mục 8 theo kết quả thật.
- **Đầu ra:** API tối thiểu, có phiên bản, danh sách tái dùng/thay đổi và lỗi còn mở.
- **Ưu tiên:** P1; **ước lượng:** 6 giờ người, chưa cam kết.
- **Phụ thuộc:** [W04-T03](WEEK_04.md#w04-t03).
- **Tiêu chí chấp nhận:** Đọc/ghi đúng quyền; lỗi rollback có chứng cứ. Có input/expected/actual, source/version hiện vật và không còn P0 trong phạm vi task.
- **Bằng chứng cần thu:** TC-04-04, commit/schema/fixture hoặc biên bản review có ngày/version; hiện chưa có kết quả thực.

### Công việc tồn và điều chỉnh lịch

Chưa có chứng cứ nghiệm thu toàn bộ task trước; giữ nguyên ID, tiếp tục task gốc thay vì tạo lại thành việc triển khai mới:

| Tuần nguồn | Task chưa đóng hoặc chờ xác minh | Xử lý |
|---|---|---|
| [Tuần 01](WEEK_01.md) | W01-T01, W01-T02, W01-T03, W01-T04 | Thu bằng chứng, đóng task gốc; chặn write hậu nhiệm nếu chưa đạt tiên quyết |
| [Tuần 02](WEEK_02.md) | W02-T01, W02-T02, W02-T03, W02-T04 | Thu bằng chứng, đóng task gốc; chặn write hậu nhiệm nếu chưa đạt tiên quyết |
| [Tuần 03](WEEK_03.md) | W03-T01, W03-T02, W03-T03, W03-T04 | Thu bằng chứng, đóng task gốc; chặn write hậu nhiệm nếu chưa đạt tiên quyết |

**Phục hồi có điều kiện:** 02–03/11 rà W01–02 và xin quyết định SQL/quy tắc/lịch/GVHD; 04–07/11 ưu tiên chốt W03, chuẩn bị hoặc diễn tập W04 khi đủ điều kiện. Không cam kết dồn 120 giờ chưa nghiệm thu vào một tuần. Nếu G04 chưa qua trước 09/11, dời W05 và write hậu nhiệm, chỉ chuẩn bị mock/fixture song song; xin điều chỉnh lịch/nhân lực/phụ trợ. Giữ lịch lịch sử, không đổi thành đã xong.

## 4. Thiết kế và triển khai kỹ thuật

| Lĩnh vực | Công việc |
|---|---|
| Database | Rehearsal migration/restore |
| Backend | Lát cắt nguyên liệu/validator |
| Frontend | NOT APPLICABLE — chỉ chốt contract |
| AI Agent | Review kiến trúc, chưa nối write |
| Security | Quyền fixture và che log |
| Integration | Diff SQL/Prisma/API |


Các yêu cầu trong bảng là PLANNED. Chi tiết nguồn, xác minh và ranh giới nghiệp vụ:

**Kiểm tra yêu cầu 27 bảng và 16 ENUM:** [packages/database/package.json](../../packages/database/package.json); [packages/database/prisma/schema/main.prisma](../../packages/database/prisma/schema/main.prisma) xác nhận schema modular. Đếm tĩnh 9 tệp Prisma: 31 model/16 ENUM. [packages/database/prisma/schema/migrations/20260718025427_init_schema_and_unique_keys/migration.sql](../../packages/database/prisma/schema/migrations/20260718025427_init_schema_and_unique_keys/migration.sql) tạo 15 bảng gốc; [packages/database/prisma/migration_27_tables/01_expand.sql](../../packages/database/prisma/migration_27_tables/01_expand.sql) tạo 16 bảng mới, dự kiến 31 bảng nghiệp vụ ở pha mở rộng; [packages/database/prisma/migration_27_tables/04_contract_DO_NOT_RUN_YET.sql](../../packages/database/prisma/migration_27_tables/04_contract_DO_NOT_RUN_YET.sql) bỏ Inventory, InventoryBatch, SupplierProduct, AgentLog để còn 27. Không gộp migration_backup vào chỉ tiêu bảng nghiệp vụ. Chưa có bản SQL được duyệt là nguồn chuẩn hoặc introspection/log DB hiện hành, nên “migration đã hoàn tất 15→27” là UNKNOWN. Không tự đổi số đích hay thêm/xóa bảng/ENUM để né mâu thuẫn.

[packages/database/prisma/migration_27_tables/01_expand.sql](../../packages/database/prisma/migration_27_tables/01_expand.sql); [packages/database/prisma/migration_27_tables/02_migrate_data.sql](../../packages/database/prisma/migration_27_tables/02_migrate_data.sql); [packages/database/prisma/migration_27_tables/04_contract_DO_NOT_RUN_YET.sql](../../packages/database/prisma/migration_27_tables/04_contract_DO_NOT_RUN_YET.sql); [packages/database/prisma/migration_27_tables/05_rollback_plan.sql](../../packages/database/prisma/migration_27_tables/05_rollback_plan.sql) có RAISE NOTICE ngoài DO/function; cần review cú pháp khi triển khai, không coi dòng thông báo trong file là log chạy thành công. [packages/database/prisma/migration_27_tables/00_precheck.sql](../../packages/database/prisma/migration_27_tables/00_precheck.sql); [packages/database/prisma/migration_27_tables/03_verify.sql](../../packages/database/prisma/migration_27_tables/03_verify.sql) có CREATE/TRUNCATE/INSERT migration_backup, không phải kiểm tra chỉ đọc. [packages/database/prisma/migration_27_tables/03_verify.sql](../../packages/database/prisma/migration_27_tables/03_verify.sql); [packages/database/prisma/migration_27_tables/04_contract_DO_NOT_RUN_YET.sql](../../packages/database/prisma/migration_27_tables/04_contract_DO_NOT_RUN_YET.sql) có CHK_06–08 NOT_EXECUTED nhưng contract chỉ đếm FAIL. G04 nghiệm thu schema/backfill/restore; kiểm tiêu hao/payment/count thật chuyển G05–G07/G10. **Contract hoãn tới khi các gate live trọng yếu đó đã đạt**, tránh phụ thuộc vòng giữa triển khai service và migration. [packages/database/prisma/migration_27_tables/01_expand.sql](../../packages/database/prisma/migration_27_tables/01_expand.sql); [packages/database/prisma/migration_27_tables/02_migrate_data.sql](../../packages/database/prisma/migration_27_tables/02_migrate_data.sql) đặt servingUnit mặc định ly rồi chỉ map khi NULL, cần fixture bảo toàn unit cũ. Rollback phải xử lý dữ liệu mới sau snapshot và FK, không chạy DELETE rộng mù.

## 5. Kiểm thử và đánh giá

**Kết quả thực: UNKNOWN.** Chưa có log nghiệm thu tuần được xác minh và phiên này không chạy test. Bảng sau là scenario/expected, không phải kết quả PASS.

| Test ID và task | Kịch bản | Kết quả kỳ vọng | Điều kiện chấp nhận và bằng chứng |
|---|---|---|---|
| TC-04-01 → W04-T01 | Review thiết kế | Drift P0 được quyết định, GVHD duyệt bằng chứng thật | Expected khớp actual, có log hoặc biên bản review ngày/version; sai lệch trọng yếu chặn task |
| TC-04-02 → W04-T02 | Replay/compile/diff | TLCN→expand/migrate trên bản sao không lỗi, SQL/Prisma/API thống nhất | Expected khớp actual, có log hoặc biên bản review ngày/version; sai lệch trọng yếu chặn task |
| TC-04-03 → W04-T03 | Inject lỗi/restore | Có write sau snapshot, không mất tiền/tồn/lịch sử, orphan=0, không nhân dữ liệu | Expected khớp actual, có log hoặc biên bản review ngày/version; sai lệch trọng yếu chặn task |
| TC-04-04 → W04-T04 | Smoke nguyên liệu | Đúng role write, legacy regression giữ được, contract chờ live gates | Expected khớp actual, có log hoặc biên bản review ngày/version; sai lệch trọng yếu chặn task |

**Mức kiểm thử:** Unit validator/tính toán/state machine; integration transaction/quyền/service hoặc provider boundary; E2E chuỗi nghiệp vụ tuần. Kiểm thử bắt đầu ngay trong tuần triển khai, không đợi W11. Negative/edge: role sai, dữ liệu trống/âm/NaN, state stale, double submit, lỗi phụ thuộc và timeout áp dụng theo từng scenario.

**Bằng chứng tối thiểu:** commit/checksum, schema/fixture/model/prompt version khi liên quan, môi trường, command/procedure, input, expected/actual, timestamp, log che dữ liệu. Mock không chứng minh concurrency/rollback PostgreSQL hoặc provider thật. Không áp dụng ghi NOT APPLICABLE và lý do, không tự đổi thành PASS.

## 6. Rủi ro và phương án xử lý

| Rủi ro | Tác động | Giảm thiểu | Dự phòng |
|---|---|---|---|
| SQL syntax/drift/FK | Replay lỗi/dữ liệu sai | Review/rehearsal bản sao | Dừng pha lỗi, chưa contract |
| Rollback mất dữ liệu mới | Mất đơn/tiền/lô hoặc lỗi FK | Test restore có post-snapshot writes | Forward fix/restore có kế hoạch, không DELETE rộng mù |

Lỗi quyền/mất dữ liệu/invariant/duplicate là P0 chặn gate. Người chịu trách nhiệm thực: UNASSIGNED. Lịch/GVHD/SQL chuẩn/nhân lực/sandbox còn thiếu phải xác nhận, không tự xem đã xử lý.

## 7. Điều kiện nghiệm thu tuần

**Quality gate G04: NOT EVALUATED.**

- [ ] W04-T01 đạt tiêu chí và TC-04-01 có bằng chứng.
- [ ] W04-T02 đạt tiêu chí và TC-04-02 có bằng chứng.
- [ ] W04-T03 đạt tiêu chí và TC-04-03 có bằng chứng.
- [ ] W04-T04 đạt tiêu chí và TC-04-04 có bằng chứng.
- [ ] Tiên quyết đã đóng; phần chuẩn bị song song tách khỏi write bị chặn; không còn P0.
- [ ] Artifact/input/expected/actual/log hoặc biên bản/version đầy đủ, không nhầm schema có sẵn với runtime đã nghiệm thu.
- [ ] Báo cáo GVHD theo kết quả thật; trạng thái gửi/duyệt có biên nhận nếu ghi đã thực hiện.

**Hiện vật bắt buộc:** Biên bản review; Migration ứng viên; Log rehearsal; API tối thiểu; TC-04-01…04 và lỗi/quyết định chưa đóng. Đây là đầu ra tương lai; phiên này không tạo thêm ngoài 12 Markdown.

**Quy tắc gate:** PASS khi mọi tiêu chí áp dụng đạt và bằng chứng đủ; CONDITIONAL chỉ với P1 không chặn tuần sau, có owner/hạn; FAIL khi vi phạm quyền/invariant/bảo toàn hoặc test bắt buộc không đạt. Chưa chạy/thiếu chứng cứ giữ NOT EVALUATED. Không báo hoàn tất từ checklist.

**Blocker còn lại:** chưa xác nhận SQL chuẩn 27/16, quy tắc/SRS, DB thực, GVHD/lịch và rehearsal migration/restore; chi tiết mục 3–6. Kế hoạch cũ không chứng minh gate đã qua.

## 8. Báo cáo gửi giảng viên

Mẫu điền tuần 04 (26/10–31/10/2026), theo cấu trúc được cung cấp vì chưa tìm thấy bao-cao-tuan.docx. Không điền kết quả kỳ vọng thành thành tích.

| Nội dung | Thông tin cần điền |
|---|---|
| Công việc đã hoàn thành | Chưa xác minh task hoàn tất; điền ID/phần việc thật/ngày/source, nền tảng mục 2 không thay nghiệm thu |
| Kỹ thuật trọng tâm | Migration schema và xác minh bảo toàn; ghi phần tái dùng TLCN và thay đổi đã làm |
| Kết quả đạt được | Chỉ output/test đo thật, commit/fixture/log/biên bản; hiện UNKNOWN |
| Khó khăn và hạn chế | Blocker mục 6–7, ảnh hưởng/owner/giờ còn lại theo ID |
| Kế hoạch tuần tiếp theo | Đối chiếu [tuần 05](WEEK_05.md) sau G04; giữ ID tồn, chỉ chuẩn bị phần không bị chặn |
| Nội dung xin ý kiến GVHD | Phạm vi/SRS, SQL chuẩn 27/16, quy tắc, lịch trường và phương án phục hồi tiến độ |
| Trạng thái nộp và duyệt | UNKNOWN — chưa có biên nhận; điền ngày/người nhận hoặc duyệt/link bằng chứng/điều kiện thực |

**Cập nhật tiến độ:** ghi ID kế hoạch/thực tế/phần còn lại/bằng chứng/quyết định dời lịch. Task chỉ VERIFIED khi toàn bộ tiêu chí có chứng cứ; test definition/hiện vật chỉ xác nhận nhận định hẹp.
