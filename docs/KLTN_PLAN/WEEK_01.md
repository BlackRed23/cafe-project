# Tuần 01 Kiểm kê TLCN

## 1. Thông tin tuần

- **Tuần và thời gian:** 01, 05/10–10/10/2026; baseline đề xuất, chưa xác minh hạn trường. Các tuần là luồng công việc, không mặc định đã hoàn tất theo ngày.
- **Mục tiêu:** Kiểm kê TLCN, tái dùng TLCN và hoàn thiện phần thiếu, giữ AI Agent là đóng góp trung tâm.
- **Ngày kiểm kê:** 01/11/2026, Asia/Saigon; cuối khoảng W04, trước W05 ngày 02/11. Phiên này chỉ đọc source/tài liệu, không chạy build/test/SQL/migration/ứng dụng hoặc dịch vụ ngoài.
- **Tình trạng:** PARTIAL ở mức mã/schema; chưa có task nghiệm thu trọn tiêu chí. Test/runtime và duyệt GVHD: UNKNOWN.
- **Phụ thuộc:** Không có; kiểm kê chỉ đọc. Chuẩn bị thiết kế/fixture/mock có thể song song; write chờ gate tiên quyết.
- **Nhân lực:** UNASSIGNED. Công sức 30 giờ người/tuần (8+8+8+6) là ước lượng chưa cam kết, 360 giờ toàn kỳ chưa gồm dự phòng, cần tái ước lượng khi rõ nhân lực.

**Quy ước:** VERIFIED xác nhận nhận định hẹp có hiện vật/mã; PARTIAL mới có một phần; MISSING chưa tìm thấy hiện vật trong phạm vi quét; UNKNOWN thiếu bằng chứng để kết luận; PLANNED là việc dự kiến. VERIFIED schema hoặc test definition không đồng nghĩa task xong hay test PASS.

**Báo cáo tham chiếu:** chưa tìm thấy bao-cao-tuan.docx trong repository, D:/KLTN hoặc attachments đã quét (MISSING). Không coi các tuyên bố được yêu cầu kiểm tra trong prompt là nội dung báo cáo đã đọc. Mục 8 dùng đúng cấu trúc bạn cung cấp; nếu nhận bản gốc thì đối chiếu trong task hiện có.

**Đường găng chung:** yêu cầu/quy tắc W02 → DB/API/Agent design W03 → migration rehearsal W04 → Inventory Engine W05 → business services W06 → tools/quyền W08 → workflow/recovery W09 → E2E/freeze W10 → evaluation W11. Thanh toán W07 là nhánh bắt buộc trước E2E W10. Không đợi W07 để chuẩn bị read/mock tools nếu nghiệp vụ/quyền đã đủ; không chạy write tools trước gate tương ứng. Các cạnh cụ thể ở mỗi task, không có vòng.

## 2. Công việc đã hoàn thành

**Chưa xác minh hoàn thành trọn vẹn task nào của tuần.** Phần nền tảng hiện hữu được ghi dưới đây theo source, không suy từ sự tồn tại file thành nghiệm thu KLTN. Tái dùng phần phù hợp, chỉ review/hồi quy/thích nghi/tích hợp thay vì dựng lại.

| Task ID liên quan | Nội dung và kết quả quan sát | File source hoặc tài liệu chứng minh | Kết quả kiểm thử | Trạng thái xác minh task |
|---|---|---|---|---|
| W01-T01 | Monorepo npm/Turbo, web/API/Agent có mã làm đầu vào audit | [package.json](../../package.json) | UNKNOWN — chưa có log hiện hành được xác minh, phiên này không chạy test | PARTIAL; chưa nghiệm thu task |
| W01-T02 | Migration gốc có 15 bảng; Prisma có schema chuyển tiếp, chưa có log DB thực | [packages/database/prisma/schema/migrations/20260718025427_init_schema_and_unique_keys/migration.sql](../../packages/database/prisma/schema/migrations/20260718025427_init_schema_and_unique_keys/migration.sql); [packages/database/package.json](../../packages/database/package.json); [packages/database/prisma/schema/inventory.prisma](../../packages/database/prisma/schema/inventory.prisma); [packages/database/prisma/schema/order.prisma](../../packages/database/prisma/schema/order.prisma); [packages/database/prisma/schema/system.prisma](../../packages/database/prisma/schema/system.prisma) | UNKNOWN — chưa có log hiện hành được xác minh, phiên này không chạy test | PARTIAL; chưa nghiệm thu task |
| W01-T03 | Có tests kho/guards/fallback dùng mocks, chưa có kết quả chạy hiện hành | [apps/api/tests/inventory-consistency.test.cjs](../../apps/api/tests/inventory-consistency.test.cjs); [apps/agent/tests/internal-auth.test.cjs](../../apps/agent/tests/internal-auth.test.cjs); [apps/agent/tests/rule-based-regression.test.cjs](../../apps/agent/tests/rule-based-regression.test.cjs) | UNKNOWN — chưa có log hiện hành được xác minh, phiên này không chạy test | PARTIAL; chưa nghiệm thu task |

## 3. Công việc cần thực hiện

Các bước triển khai/kiểm thử bên dưới là kế hoạch cho đợt thực hiện riêng. Phiên này chỉ tạo 12 Markdown; không thay đổi mã hoặc tài liệu cũ. Các ID giữ tương ứng bộ kế hoạch trước để không nhân bản công việc.

<a id="w01-t01"></a>

### W01-T01 Lập danh mục hiện vật

- **Task ID:** W01-T01; **trạng thái:** PLANNED; **người thực hiện:** UNASSIGNED. Phần nền tảng ở mục 2 có thể PARTIAL, chưa đủ để đóng task.
- **Mục tiêu:** hoàn thiện Bản đồ repository phục vụ kiểm kê tlcn, tái dùng phần hiện hữu phù hợp.
- **Đầu vào:** các source và giới hạn chứng cứ trong mục 2/4; kết quả có bằng chứng từ Không có; kiểm kê chỉ đọc; trường hợp cần nguồn ngoài chưa có giữ UNKNOWN.
- **Hoạt động từng bước:**
  1. Đọc đúng phiên bản đầu vào, xác định phần đủ để chỉ hồi quy/tích hợp.
  2. Quét cấu trúc/manifest/modules; ghi commit và nguồn.
  3. Đối chiếu ngoại lệ, quyền và invariant tại mục 4; ghi quyết định mở, không tự mở scope.
  4. Chạy kiểm tra TC-01-01 ở mục 5 trong môi trường phù hợp, lưu expected/actual và giới hạn mock.
  5. Đóng tiêu chí bằng hiện vật/log/biên bản, cập nhật mục 8 theo kết quả thật.
- **Đầu ra:** Bản đồ repository, có phiên bản, danh sách tái dùng/thay đổi và lỗi còn mở.
- **Ưu tiên:** P0; **ước lượng:** 8 giờ người, chưa cam kết.
- **Phụ thuộc:** Không có; kiểm kê chỉ đọc.
- **Tiêu chí chấp nhận:** Mỗi phát hiện có nguồn và giới hạn. Có input/expected/actual, source/version hiện vật và không còn P0 trong phạm vi task.
- **Bằng chứng cần thu:** TC-01-01, commit/schema/fixture hoặc biên bản review có ngày/version; hiện chưa có kết quả thực.

<a id="w01-t02"></a>

### W01-T02 Đối chiếu DB

- **Task ID:** W01-T02; **trạng thái:** PLANNED; **người thực hiện:** UNASSIGNED. Phần nền tảng ở mục 2 có thể PARTIAL, chưa đủ để đóng task.
- **Mục tiêu:** hoàn thiện Ma trận drift phục vụ kiểm kê tlcn, tái dùng phần hiện hữu phù hợp.
- **Đầu vào:** các source và giới hạn chứng cứ trong mục 2/4; kết quả có bằng chứng từ [W01-T01](WEEK_01.md#w01-t01); trường hợp cần nguồn ngoài chưa có giữ UNKNOWN.
- **Hoạt động từng bước:**
  1. Đọc đúng phiên bản đầu vào, xác định phần đủ để chỉ hồi quy/tích hợp.
  2. Đếm model/ENUM; diff SQL/cột/FK/index.
  3. Đối chiếu ngoại lệ, quyền và invariant tại mục 4; ghi quyết định mở, không tự mở scope.
  4. Chạy kiểm tra TC-01-02 ở mục 5 trong môi trường phù hợp, lưu expected/actual và giới hạn mock.
  5. Đóng tiêu chí bằng hiện vật/log/biên bản, cập nhật mục 8 theo kết quả thật.
- **Đầu ra:** Ma trận drift, có phiên bản, danh sách tái dùng/thay đổi và lỗi còn mở.
- **Ưu tiên:** P0; **ước lượng:** 8 giờ người, chưa cam kết.
- **Phụ thuộc:** [W01-T01](WEEK_01.md#w01-t01).
- **Tiêu chí chấp nhận:** Giải thích 31 chuyển tiếp → 27 đích, không tự đổi 16 ENUM. Có input/expected/actual, source/version hiện vật và không còn P0 trong phạm vi task.
- **Bằng chứng cần thu:** TC-01-02, commit/schema/fixture hoặc biên bản review có ngày/version; hiện chưa có kết quả thực.

<a id="w01-t03"></a>

### W01-T03 Kiểm kê Agent/test

- **Task ID:** W01-T03; **trạng thái:** PLANNED; **người thực hiện:** UNASSIGNED. Phần nền tảng ở mục 2 có thể PARTIAL, chưa đủ để đóng task.
- **Mục tiêu:** hoàn thiện Danh mục năng lực và test phục vụ kiểm kê tlcn, tái dùng phần hiện hữu phù hợp.
- **Đầu vào:** các source và giới hạn chứng cứ trong mục 2/4; kết quả có bằng chứng từ [W01-T01](WEEK_01.md#w01-t01); trường hợp cần nguồn ngoài chưa có giữ UNKNOWN.
- **Hoạt động từng bước:**
  1. Đọc đúng phiên bản đầu vào, xác định phần đủ để chỉ hồi quy/tích hợp.
  2. Đọc Gemini/rules, quyền, mocks.
  3. Đối chiếu ngoại lệ, quyền và invariant tại mục 4; ghi quyết định mở, không tự mở scope.
  4. Chạy kiểm tra TC-01-03 ở mục 5 trong môi trường phù hợp, lưu expected/actual và giới hạn mock.
  5. Đóng tiêu chí bằng hiện vật/log/biên bản, cập nhật mục 8 theo kết quả thật.
- **Đầu ra:** Danh mục năng lực và test, có phiên bản, danh sách tái dùng/thay đổi và lỗi còn mở.
- **Ưu tiên:** P0; **ước lượng:** 8 giờ người, chưa cam kết.
- **Phụ thuộc:** [W01-T01](WEEK_01.md#w01-t01).
- **Tiêu chí chấp nhận:** Phân biệt mã test với kết quả chạy và JSON với Tool Calling. Có input/expected/actual, source/version hiện vật và không còn P0 trong phạm vi task.
- **Bằng chứng cần thu:** TC-01-03, commit/schema/fixture hoặc biên bản review có ngày/version; hiện chưa có kết quả thực.

<a id="w01-t04"></a>

### W01-T04 Xác nhận lịch/quản trị

- **Task ID:** W01-T04; **trạng thái:** PLANNED; **người thực hiện:** UNASSIGNED. Phần nền tảng ở mục 2 có thể PARTIAL, chưa đủ để đóng task.
- **Mục tiêu:** hoàn thiện Sổ U01–U10 phục vụ kiểm kê tlcn, tái dùng phần hiện hữu phù hợp.
- **Đầu vào:** các source và giới hạn chứng cứ trong mục 2/4; kết quả có bằng chứng từ [W01-T02](WEEK_01.md#w01-t02), [W01-T03](WEEK_01.md#w01-t03); trường hợp cần nguồn ngoài chưa có giữ UNKNOWN.
- **Hoạt động từng bước:**
  1. Đọc đúng phiên bản đầu vào, xác định phần đủ để chỉ hồi quy/tích hợp.
  2. Thu thập audit, lịch, vai trò, yêu cầu GVHD.
  3. Đối chiếu ngoại lệ, quyền và invariant tại mục 4; ghi quyết định mở, không tự mở scope.
  4. Chạy kiểm tra TC-01-04 ở mục 5 trong môi trường phù hợp, lưu expected/actual và giới hạn mock.
  5. Đóng tiêu chí bằng hiện vật/log/biên bản, cập nhật mục 8 theo kết quả thật.
- **Đầu ra:** Sổ U01–U10, có phiên bản, danh sách tái dùng/thay đổi và lỗi còn mở.
- **Ưu tiên:** P1; **ước lượng:** 6 giờ người, chưa cam kết.
- **Phụ thuộc:** [W01-T02](WEEK_01.md#w01-t02), [W01-T03](WEEK_01.md#w01-t03).
- **Tiêu chí chấp nhận:** Thiếu nguồn ghi UNKNOWN, không giả duyệt. Có input/expected/actual, source/version hiện vật và không còn P0 trong phạm vi task.
- **Bằng chứng cần thu:** TC-01-04, commit/schema/fixture hoặc biên bản review có ngày/version; hiện chưa có kết quả thực.

### Công việc tồn và điều chỉnh lịch

Không có task tuần trước. Hiện vật TLCN không tự chứng minh nghiệm thu.

**Phục hồi có điều kiện:** 02–03/11 rà W01–02 và xin quyết định SQL/quy tắc/lịch/GVHD; 04–07/11 ưu tiên chốt W03, chuẩn bị hoặc diễn tập W04 khi đủ điều kiện. Không cam kết dồn 120 giờ chưa nghiệm thu vào một tuần. Nếu G04 chưa qua trước 09/11, dời W05 và write hậu nhiệm, chỉ chuẩn bị mock/fixture song song; xin điều chỉnh lịch/nhân lực/phụ trợ. Giữ lịch lịch sử, không đổi thành đã xong.

## 4. Thiết kế và triển khai kỹ thuật

| Lĩnh vực | Công việc |
|---|---|
| Database | Kiểm kê model/ENUM/SQL |
| Backend | Kiểm kê service và middleware |
| Frontend | Kiểm kê route khách/admin |
| AI Agent | Đọc Gemini/rules và worker |
| Security | Kiểm kê guards và rò rỉ log |
| Integration | NOT APPLICABLE — chưa chạy hệ thống |


Các yêu cầu trong bảng là PLANNED. Chi tiết nguồn, xác minh và ranh giới nghiệp vụ:

Đọc manifest, README, toàn bộ Prisma, hai migration TLCN, sáu SQL chuyển đổi, module nghiệp vụ/Agent/quyền, route web và bảy tệp test. Không tìm thấy audit TLCN độc lập hoặc lịch/approval trong phạm vi quét. [apps/agent/src/services/agent.service.ts](../../apps/agent/src/services/agent.service.ts) xác nhận system scan LOG_ONLY, không suy từ [README.md](../../README.md) rằng system được tự tạo PR.

**Kiểm tra yêu cầu 27 bảng và 16 ENUM:** [packages/database/package.json](../../packages/database/package.json); [packages/database/prisma/schema/main.prisma](../../packages/database/prisma/schema/main.prisma) xác nhận schema modular. Đếm tĩnh 9 tệp Prisma: 31 model/16 ENUM. [packages/database/prisma/schema/migrations/20260718025427_init_schema_and_unique_keys/migration.sql](../../packages/database/prisma/schema/migrations/20260718025427_init_schema_and_unique_keys/migration.sql) tạo 15 bảng gốc; [packages/database/prisma/migration_27_tables/01_expand.sql](../../packages/database/prisma/migration_27_tables/01_expand.sql) tạo 16 bảng mới, dự kiến 31 bảng nghiệp vụ ở pha mở rộng; [packages/database/prisma/migration_27_tables/04_contract_DO_NOT_RUN_YET.sql](../../packages/database/prisma/migration_27_tables/04_contract_DO_NOT_RUN_YET.sql) bỏ Inventory, InventoryBatch, SupplierProduct, AgentLog để còn 27. Không gộp migration_backup vào chỉ tiêu bảng nghiệp vụ. Chưa có bản SQL được duyệt là nguồn chuẩn hoặc introspection/log DB hiện hành, nên “migration đã hoàn tất 15→27” là UNKNOWN. Không tự đổi số đích hay thêm/xóa bảng/ENUM để né mâu thuẫn.

## 5. Kiểm thử và đánh giá

**Kết quả thực: UNKNOWN.** Chưa có log nghiệm thu tuần được xác minh và phiên này không chạy test. Bảng sau là scenario/expected, không phải kết quả PASS.

| Test ID và task | Kịch bản | Kết quả kỳ vọng | Điều kiện chấp nhận và bằng chứng |
|---|---|---|---|
| TC-01-01 → W01-T01 | Manifest/module map | Mỗi công nghệ/module có source, không chỉ README | Expected khớp actual, có log hoặc biên bản review ngày/version; sai lệch trọng yếu chặn task |
| TC-01-02 → W01-T02 | Đếm/diff DB | 15 bảng gốc,31 model,16 ENUM; giải thích đích27, DB thật UNKNOWN | Expected khớp actual, có log hoặc biên bản review ngày/version; sai lệch trọng yếu chặn task |
| TC-01-03 → W01-T03 | Phân loại suite | Tách mocks/in-process/DB concurrency, không tự báo PASS | Expected khớp actual, có log hoặc biên bản review ngày/version; sai lệch trọng yếu chặn task |
| TC-01-04 → W01-T04 | Nguồn report/lịch/approval | Thiếu ghi MISSING/UNKNOWN và bước xin xác nhận | Expected khớp actual, có log hoặc biên bản review ngày/version; sai lệch trọng yếu chặn task |

**Mức kiểm thử:** Unit/integration/E2E chạy mã: NOT APPLICABLE ở tuần tài liệu/thiết kế; dùng review ví dụ tính tay, contract và walkthrough. W03 đặc tả test tương lai trước triển khai. Negative/edge: role sai, dữ liệu trống/âm/NaN, state stale, double submit, lỗi phụ thuộc và timeout áp dụng theo từng scenario.

**Bằng chứng tối thiểu:** commit/checksum, schema/fixture/model/prompt version khi liên quan, môi trường, command/procedure, input, expected/actual, timestamp, log che dữ liệu. Mock không chứng minh concurrency/rollback PostgreSQL hoặc provider thật. Không áp dụng ghi NOT APPLICABLE và lý do, không tự đổi thành PASS.

## 6. Rủi ro và phương án xử lý

| Rủi ro | Tác động | Giảm thiểu | Dự phòng |
|---|---|---|---|
| Nhầm tài liệu với kết quả | Sai baseline và lịch | Đọc source và phân cấp bằng chứng | Giữ UNKNOWN/xin nguồn thiếu |
| Thiếu report/lịch/GVHD | Không biết hạn/duyệt | Tìm báo cáo gốc và xin rubric | Dùng mục8 đã cung cấp, không giả approval |

Lỗi quyền/mất dữ liệu/invariant/duplicate là P0 chặn gate. Người chịu trách nhiệm thực: UNASSIGNED. Lịch/GVHD/SQL chuẩn/nhân lực/sandbox còn thiếu phải xác nhận, không tự xem đã xử lý.

## 7. Điều kiện nghiệm thu tuần

**Quality gate G01: NOT EVALUATED.**

- [ ] W01-T01 đạt tiêu chí và TC-01-01 có bằng chứng.
- [ ] W01-T02 đạt tiêu chí và TC-01-02 có bằng chứng.
- [ ] W01-T03 đạt tiêu chí và TC-01-03 có bằng chứng.
- [ ] W01-T04 đạt tiêu chí và TC-01-04 có bằng chứng.
- [ ] Tiên quyết đã đóng; phần chuẩn bị song song tách khỏi write bị chặn; không còn P0.
- [ ] Artifact/input/expected/actual/log hoặc biên bản/version đầy đủ, không nhầm schema có sẵn với runtime đã nghiệm thu.
- [ ] Báo cáo GVHD theo kết quả thật; trạng thái gửi/duyệt có biên nhận nếu ghi đã thực hiện.

**Hiện vật bắt buộc:** Bản đồ repository; Ma trận drift; Danh mục năng lực và test; Sổ U01–U10; TC-01-01…04 và lỗi/quyết định chưa đóng. Đây là đầu ra tương lai; phiên này không tạo thêm ngoài 12 Markdown.

**Quy tắc gate:** PASS khi mọi tiêu chí áp dụng đạt và bằng chứng đủ; CONDITIONAL chỉ với P1 không chặn tuần sau, có owner/hạn; FAIL khi vi phạm quyền/invariant/bảo toàn hoặc test bắt buộc không đạt. Chưa chạy/thiếu chứng cứ giữ NOT EVALUATED. Không báo hoàn tất từ checklist.

**Blocker còn lại:** chưa xác nhận SQL chuẩn 27/16, quy tắc/SRS, DB thực, GVHD/lịch và rehearsal migration/restore; chi tiết mục 3–6. Kế hoạch cũ không chứng minh gate đã qua.

## 8. Báo cáo gửi giảng viên

Mẫu điền tuần 01 (05/10–10/10/2026), theo cấu trúc được cung cấp vì chưa tìm thấy bao-cao-tuan.docx. Không điền kết quả kỳ vọng thành thành tích.

| Nội dung | Thông tin cần điền |
|---|---|
| Công việc đã hoàn thành | Chưa xác minh task hoàn tất; điền ID/phần việc thật/ngày/source, nền tảng mục 2 không thay nghiệm thu |
| Kỹ thuật trọng tâm | Kiểm kê TLCN; ghi phần tái dùng TLCN và thay đổi đã làm |
| Kết quả đạt được | Chỉ output/test đo thật, commit/fixture/log/biên bản; hiện UNKNOWN |
| Khó khăn và hạn chế | Blocker mục 6–7, ảnh hưởng/owner/giờ còn lại theo ID |
| Kế hoạch tuần tiếp theo | Đối chiếu [tuần 02](WEEK_02.md) sau G01; giữ ID tồn, chỉ chuẩn bị phần không bị chặn |
| Nội dung xin ý kiến GVHD | Phạm vi/SRS, SQL chuẩn 27/16, quy tắc, lịch trường và phương án phục hồi tiến độ |
| Trạng thái nộp và duyệt | UNKNOWN — chưa có biên nhận; điền ngày/người nhận hoặc duyệt/link bằng chứng/điều kiện thực |

**Cập nhật tiến độ:** ghi ID kế hoạch/thực tế/phần còn lại/bằng chứng/quyết định dời lịch. Task chỉ VERIFIED khi toàn bộ tiêu chí có chứng cứ; test definition/hiện vật chỉ xác nhận nhận định hẹp.
