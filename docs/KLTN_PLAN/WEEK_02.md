# Tuần 02 Yêu cầu nghiệp vụ

## 1. Thông tin tuần

- **Tuần và thời gian:** 02, 12/10–17/10/2026; baseline đề xuất, chưa xác minh hạn trường. Các tuần là luồng công việc, không mặc định đã hoàn tất theo ngày.
- **Mục tiêu:** Yêu cầu nghiệp vụ, tái dùng TLCN và hoàn thiện phần thiếu, giữ AI Agent là đóng góp trung tâm.
- **Ngày kiểm kê:** 01/11/2026, Asia/Saigon; cuối khoảng W04, trước W05 ngày 02/11. Phiên này chỉ đọc source/tài liệu, không chạy build/test/SQL/migration/ứng dụng hoặc dịch vụ ngoài.
- **Tình trạng:** PARTIAL ở mức mã/schema; chưa có task nghiệm thu trọn tiêu chí. Test/runtime và duyệt GVHD: UNKNOWN.
- **Phụ thuộc:** [W01-T04](WEEK_01.md#w01-t04). Chuẩn bị thiết kế/fixture/mock có thể song song; write chờ gate tiên quyết.
- **Nhân lực:** UNASSIGNED. Công sức 30 giờ người/tuần (8+8+8+6) là ước lượng chưa cam kết, 360 giờ toàn kỳ chưa gồm dự phòng, cần tái ước lượng khi rõ nhân lực.

**Quy ước:** VERIFIED xác nhận nhận định hẹp có hiện vật/mã; PARTIAL mới có một phần; MISSING chưa tìm thấy hiện vật trong phạm vi quét; UNKNOWN thiếu bằng chứng để kết luận; PLANNED là việc dự kiến. VERIFIED schema hoặc test definition không đồng nghĩa task xong hay test PASS.

**Báo cáo tham chiếu:** chưa tìm thấy bao-cao-tuan.docx trong repository, D:/KLTN hoặc attachments đã quét (MISSING). Không coi các tuyên bố được yêu cầu kiểm tra trong prompt là nội dung báo cáo đã đọc. Mục 8 dùng đúng cấu trúc bạn cung cấp; nếu nhận bản gốc thì đối chiếu trong task hiện có.

**Đường găng chung:** yêu cầu/quy tắc W02 → DB/API/Agent design W03 → migration rehearsal W04 → Inventory Engine W05 → business services W06 → tools/quyền W08 → workflow/recovery W09 → E2E/freeze W10 → evaluation W11. Thanh toán W07 là nhánh bắt buộc trước E2E W10. Không đợi W07 để chuẩn bị read/mock tools nếu nghiệp vụ/quyền đã đủ; không chạy write tools trước gate tương ứng. Các cạnh cụ thể ở mỗi task, không có vòng.

## 2. Công việc đã hoàn thành

**Chưa xác minh hoàn thành trọn vẹn task nào của tuần.** Phần nền tảng hiện hữu được ghi dưới đây theo source, không suy từ sự tồn tại file thành nghiệm thu KLTN. Tái dùng phần phù hợp, chỉ review/hồi quy/thích nghi/tích hợp thay vì dựng lại.

| Task ID liên quan | Nội dung và kết quả quan sát | File source hoặc tài liệu chứng minh | Kết quả kiểm thử | Trạng thái xác minh task |
|---|---|---|---|---|
| W02-T01 | Kho/order reservation/mua hàng đã có mã TLCN làm đầu vào khảo sát | [apps/api/src/modules/inventory/inventory.repository.ts](../../apps/api/src/modules/inventory/inventory.repository.ts); [apps/api/src/modules/order/order.repository.ts](../../apps/api/src/modules/order/order.repository.ts); [apps/api/src/modules/purchase/purchase.repository.ts](../../apps/api/src/modules/purchase/purchase.repository.ts) | UNKNOWN — chưa có log hiện hành được xác minh, phiên này không chạy test | PARTIAL; chưa nghiệm thu task |
| W02-T03 | Có JWT/role/internal token/user active, chưa có ma trận quyền được duyệt | [apps/api/src/modules/auth/auth.middleware.ts](../../apps/api/src/modules/auth/auth.middleware.ts); [apps/agent/src/internal-auth.ts](../../apps/agent/src/internal-auth.ts) | UNKNOWN — chưa có log hiện hành được xác minh, phiên này không chạy test | PARTIAL; chưa nghiệm thu task |
| W02-T04 | Kế hoạch trước không thay SRS/phê duyệt GVHD | [docs/KLTN_PLAN/MASTER_PLAN.md](../../docs/KLTN_PLAN/MASTER_PLAN.md) | UNKNOWN — chưa có log hiện hành được xác minh, phiên này không chạy test | UNKNOWN; chưa nghiệm thu task |

## 3. Công việc cần thực hiện

Các bước triển khai/kiểm thử bên dưới là kế hoạch cho đợt thực hiện riêng. Phiên này chỉ tạo 12 Markdown; không thay đổi mã hoặc tài liệu cũ. Các ID giữ tương ứng bộ kế hoạch trước để không nhân bản công việc.

<a id="w02-t01"></a>

### W02-T01 Khảo sát quy trình

- **Task ID:** W02-T01; **trạng thái:** PLANNED; **người thực hiện:** UNASSIGNED. Phần nền tảng ở mục 2 có thể PARTIAL, chưa đủ để đóng task.
- **Mục tiêu:** hoàn thiện Use case phục vụ yêu cầu nghiệp vụ, tái dùng phần hiện hữu phù hợp.
- **Đầu vào:** các source và giới hạn chứng cứ trong mục 2/4; kết quả có bằng chứng từ [W01-T04](WEEK_01.md#w01-t04); trường hợp cần nguồn ngoài chưa có giữ UNKNOWN.
- **Hoạt động từng bước:**
  1. Đọc đúng phiên bản đầu vào, xác định phần đủ để chỉ hồi quy/tích hợp.
  2. Phỏng vấn nhập–bán–pha–hủy–kiểm kê; ghi ngoại lệ.
  3. Đối chiếu ngoại lệ, quyền và invariant tại mục 4; ghi quyết định mở, không tự mở scope.
  4. Chạy kiểm tra TC-02-01 ở mục 5 trong môi trường phù hợp, lưu expected/actual và giới hạn mock.
  5. Đóng tiêu chí bằng hiện vật/log/biên bản, cập nhật mục 8 theo kết quả thật.
- **Đầu ra:** Use case, có phiên bản, danh sách tái dùng/thay đổi và lỗi còn mở.
- **Ưu tiên:** P0; **ước lượng:** 8 giờ người, chưa cam kết.
- **Phụ thuộc:** [W01-T04](WEEK_01.md#w01-t04).
- **Tiêu chí chấp nhận:** Mỗi luồng có actor, điều kiện và nhánh lỗi. Có input/expected/actual, source/version hiện vật và không còn P0 trong phạm vi task.
- **Bằng chứng cần thu:** TC-02-01, commit/schema/fixture hoặc biên bản review có ngày/version; hiện chưa có kết quả thực.

<a id="w02-t02"></a>

### W02-T02 Chốt quy tắc kho

- **Task ID:** W02-T02; **trạng thái:** PLANNED; **người thực hiện:** UNASSIGNED. Phần nền tảng ở mục 2 có thể PARTIAL, chưa đủ để đóng task.
- **Mục tiêu:** hoàn thiện BR01–BR08 phục vụ yêu cầu nghiệp vụ, tái dùng phần hiện hữu phù hợp.
- **Đầu vào:** các source và giới hạn chứng cứ trong mục 2/4; kết quả có bằng chứng từ [W02-T01](WEEK_02.md#w02-t01); trường hợp cần nguồn ngoài chưa có giữ UNKNOWN.
- **Hoạt động từng bước:**
  1. Đọc đúng phiên bản đầu vào, xác định phần đủ để chỉ hồi quy/tích hợp.
  2. Định nghĩa unit, FEFO, reserve, hủy, waste, COGS.
  3. Đối chiếu ngoại lệ, quyền và invariant tại mục 4; ghi quyết định mở, không tự mở scope.
  4. Chạy kiểm tra TC-02-02 ở mục 5 trong môi trường phù hợp, lưu expected/actual và giới hạn mock.
  5. Đóng tiêu chí bằng hiện vật/log/biên bản, cập nhật mục 8 theo kết quả thật.
- **Đầu ra:** BR01–BR08, có phiên bản, danh sách tái dùng/thay đổi và lỗi còn mở.
- **Ưu tiên:** P0; **ước lượng:** 8 giờ người, chưa cam kết.
- **Phụ thuộc:** [W02-T01](WEEK_02.md#w02-t01).
- **Tiêu chí chấp nhận:** Có ví dụ tính tay và không trộn đơn vị. Có input/expected/actual, source/version hiện vật và không còn P0 trong phạm vi task.
- **Bằng chứng cần thu:** TC-02-02, commit/schema/fixture hoặc biên bản review có ngày/version; hiện chưa có kết quả thực.

<a id="w02-t03"></a>

### W02-T03 Chốt quyền Agent

- **Task ID:** W02-T03; **trạng thái:** PLANNED; **người thực hiện:** UNASSIGNED. Phần nền tảng ở mục 2 có thể PARTIAL, chưa đủ để đóng task.
- **Mục tiêu:** hoàn thiện Ma trận quyền phục vụ yêu cầu nghiệp vụ, tái dùng phần hiện hữu phù hợp.
- **Đầu vào:** các source và giới hạn chứng cứ trong mục 2/4; kết quả có bằng chứng từ [W02-T01](WEEK_02.md#w02-t01); trường hợp cần nguồn ngoài chưa có giữ UNKNOWN.
- **Hoạt động từng bước:**
  1. Đọc đúng phiên bản đầu vào, xác định phần đủ để chỉ hồi quy/tích hợp.
  2. Lập ma trận user/system, điểm duyệt, quyền mua/gửi.
  3. Đối chiếu ngoại lệ, quyền và invariant tại mục 4; ghi quyết định mở, không tự mở scope.
  4. Chạy kiểm tra TC-02-03 ở mục 5 trong môi trường phù hợp, lưu expected/actual và giới hạn mock.
  5. Đóng tiêu chí bằng hiện vật/log/biên bản, cập nhật mục 8 theo kết quả thật.
- **Đầu ra:** Ma trận quyền, có phiên bản, danh sách tái dùng/thay đổi và lỗi còn mở.
- **Ưu tiên:** P0; **ước lượng:** 8 giờ người, chưa cam kết.
- **Phụ thuộc:** [W02-T01](WEEK_02.md#w02-t01).
- **Tiêu chí chấp nhận:** Mọi write có principal và kiểm tra server. Có input/expected/actual, source/version hiện vật và không còn P0 trong phạm vi task.
- **Bằng chứng cần thu:** TC-02-03, commit/schema/fixture hoặc biên bản review có ngày/version; hiện chưa có kết quả thực.

<a id="w02-t04"></a>

### W02-T04 Khóa phạm vi

- **Task ID:** W02-T04; **trạng thái:** PLANNED; **người thực hiện:** UNASSIGNED. Phần nền tảng ở mục 2 có thể PARTIAL, chưa đủ để đóng task.
- **Mục tiêu:** hoàn thiện SRS và truy vết phục vụ yêu cầu nghiệp vụ, tái dùng phần hiện hữu phù hợp.
- **Đầu vào:** các source và giới hạn chứng cứ trong mục 2/4; kết quả có bằng chứng từ [W02-T02](WEEK_02.md#w02-t02), [W02-T03](WEEK_02.md#w02-t03); trường hợp cần nguồn ngoài chưa có giữ UNKNOWN.
- **Hoạt động từng bước:**
  1. Đọc đúng phiên bản đầu vào, xác định phần đủ để chỉ hồi quy/tích hợp.
  2. Duyệt SRS/27-16/dataset với GVHD.
  3. Đối chiếu ngoại lệ, quyền và invariant tại mục 4; ghi quyết định mở, không tự mở scope.
  4. Chạy kiểm tra TC-02-04 ở mục 5 trong môi trường phù hợp, lưu expected/actual và giới hạn mock.
  5. Đóng tiêu chí bằng hiện vật/log/biên bản, cập nhật mục 8 theo kết quả thật.
- **Đầu ra:** SRS và truy vết, có phiên bản, danh sách tái dùng/thay đổi và lỗi còn mở.
- **Ưu tiên:** P1; **ước lượng:** 6 giờ người, chưa cam kết.
- **Phụ thuộc:** [W02-T02](WEEK_02.md#w02-t02), [W02-T03](WEEK_02.md#w02-t03).
- **Tiêu chí chấp nhận:** Mọi yêu cầu trọng yếu có test dự kiến. Có input/expected/actual, source/version hiện vật và không còn P0 trong phạm vi task.
- **Bằng chứng cần thu:** TC-02-04, commit/schema/fixture hoặc biên bản review có ngày/version; hiện chưa có kết quả thực.

### Công việc tồn và điều chỉnh lịch

Chưa có chứng cứ nghiệm thu toàn bộ task trước; giữ nguyên ID, tiếp tục task gốc thay vì tạo lại thành việc triển khai mới:

| Tuần nguồn | Task chưa đóng hoặc chờ xác minh | Xử lý |
|---|---|---|
| [Tuần 01](WEEK_01.md) | W01-T01, W01-T02, W01-T03, W01-T04 | Thu bằng chứng, đóng task gốc; chặn write hậu nhiệm nếu chưa đạt tiên quyết |

**Phục hồi có điều kiện:** 02–03/11 rà W01–02 và xin quyết định SQL/quy tắc/lịch/GVHD; 04–07/11 ưu tiên chốt W03, chuẩn bị hoặc diễn tập W04 khi đủ điều kiện. Không cam kết dồn 120 giờ chưa nghiệm thu vào một tuần. Nếu G04 chưa qua trước 09/11, dời W05 và write hậu nhiệm, chỉ chuẩn bị mock/fixture song song; xin điều chỉnh lịch/nhân lực/phụ trợ. Giữ lịch lịch sử, không đổi thành đã xong.

## 4. Thiết kế và triển khai kỹ thuật

| Lĩnh vực | Công việc |
|---|---|
| Database | Quy tắc dữ liệu và mapping |
| Backend | Use case/API contracts |
| Frontend | Wireframe POS/duyệt |
| AI Agent | Quyền/mục tiêu workflow |
| Security | Ma trận role/actor |
| Integration | Hợp đồng trạng thái |


Các yêu cầu trong bảng là PLANNED. Chi tiết nguồn, xác minh và ranh giới nghiệp vụ:

Quy tắc cần chủ quán/GVHD duyệt: BR01 unit/yield/recipe version; BR02 FEFO/reservation/không âm; BR03 nhận từng phần/MOQ/key; BR04 trước pha release, sau pha waste theo chính sách; BR05 count có actor/version; BR06 COGS snapshot; BR07 callback/reconciliation; BR08 deny default/HITL. Use case AI: tồn thấp → đọc lô/doanh số/NCC → đề xuất lượng/quy cách → người dùng xem/duyệt → PR nháp. Đây là PLANNED, chưa phải yêu cầu quán đã xác nhận. Nguồn luồng cũ: [apps/api/src/modules/inventory/inventory.repository.ts](../../apps/api/src/modules/inventory/inventory.repository.ts); [apps/api/src/modules/order/order.repository.ts](../../apps/api/src/modules/order/order.repository.ts); [apps/api/src/modules/purchase/purchase.repository.ts](../../apps/api/src/modules/purchase/purchase.repository.ts); [apps/api/src/modules/auth/auth.middleware.ts](../../apps/api/src/modules/auth/auth.middleware.ts); [apps/agent/src/internal-auth.ts](../../apps/agent/src/internal-auth.ts).

### Truy vết yêu cầu trọng yếu

Toàn bộ ánh xạ dưới đây là PLANNED. Các quy tắc chưa duyệt không được coi authoritative. 16/16 nhóm có phương pháp kiểm chứng dự kiến; không là coverage test PASS thực. Yêu cầu mới từ GVHD phải nối task/test trước nhận vào phạm vi.

| Yêu cầu | Nội dung | Quy tắc | Thành phần | Task | Test | Evidence cần có |
|---|---|---|---|---|---|---|
| REQ01 | Sản phẩm/nguyên liệu/công thức/topping | BR01 | Product/Ingredient/Recipe/Topping | W05-T01 | TC-05-01 | Fixture quy đổi/version/snapshot |
| REQ02 | Lô/hạn/FEFO/reservation | BR02 | IngredientBatch/ledger/Engine | W05-T02; W05-T04 | TC-05-02; TC-05-04 | PostgreSQL race/rollback và lô/tổng |
| REQ03 | NCC/mua/receipt từng phần | BR03 | SupplierIngredient/PR/GoodsReceipt | W05-T03 | TC-05-03 | Receipt/key replay/MOQ |
| REQ04 | POS/pha/tiêu hao/hủy | BR04 | Order/Item/consumption | W06-T01; W06-T04 | TC-06-01; TC-06-04 | E2E thiếu/hủy/trùng |
| REQ05 | Kiểm kê/waste | BR05 | StockCount/Item/ledger | W06-T02 | TC-06-02 | Phiếu/version/variance/actor |
| REQ06 | COGS/lợi nhuận | BR06 | OrderItem cost/report | W06-T03 | TC-06-03 | Ví dụ tính tay Decimal |
| REQ07 | Payment/Callback/Reconcile | BR07 | Payment/Callback/Reconciliation | W07-T01; W07-T02; W07-T03; W07-T04 | TC-07-01…04 | Sandbox và mock tách/mismatch report |
| REQ08 | Roles/permissions | BR08 | User/JWT/internal-auth | W02-T03; W08-T03; W10-T03 | TC-02-03; TC-08-03; TC-10-03 | Ma trận 401/403/zero writes |
| REQ09 | 27 bảng/16 ENUM, migration/rollback/bảo toàn | Quy tắc dữ liệu cần duyệt | Prisma/SQL/restore | W03-T01; W03-T02; W04-T02; W04-T03 | TC-03-01; TC-04-02; TC-04-03 | ERD chuẩn/diff/count/checksum/tồn/tiền/FK |
| REQ10 | Registry/Calling/validate I-O | BR08 và tool allowlist | Gemini/registry/service adapters | W08-T01; W08-T02; W08-T04 | TC-08-01; TC-08-02; TC-08-04 | Golden labels/injection/schema traces |
| REQ11 | Multi-step/retrieval/kho/NCC/đề xuất mua | Workflow có budget | Agent state machine/tools | W03-T03; W09-T01; W10-T01 | TC-09-01; TC-10-01 | Multi-step trace và nguồn dữ liệu |
| REQ12 | HITL/quyền hành động | BR08 và approval hash/version | Approval server/UI | W08-T03; W10-T02 | TC-08-03; TC-10-02 | Stale/reject/role sai không ghi |
| REQ13 | Recovery/retry/idempotency | Write uncertain tra key | Execution/ToolCall/PR service | W09-T02; W09-T04 | TC-09-02; TC-09-04 | Race/restart/timeout tối đa một PR |
| REQ14 | History/log/evaluation | Actor/correlation/redaction | Execution/ToolCall/Evaluation | W09-T03; W10-T04 | TC-09-03; TC-10-04 | Raw traces/manifest/usage missing |
| REQ15 | Đánh giá TLCN–KLTN | Protocol/labels khóa trước đo | Harness/JSONL/CSV | W03-T04; W11-T01; W11-T02; W11-T03; W11-T04 | TC-11-01…04 | Dataset/raw runs/metrics/CI/failure cases |
| REQ16 | Lịch/GVHD/báo cáo/luận văn/demo | Biên nhận thật | Reports/thesis/runbook | W01-T04; W02-T04; W12-T01; W12-T02; W12-T03; W12-T04 | TC-12-01…04 | Phê duyệt/bản nộp/demo tái lập/biên nhận |

## 5. Kiểm thử và đánh giá

**Kết quả thực: UNKNOWN.** Chưa có log nghiệm thu tuần được xác minh và phiên này không chạy test. Bảng sau là scenario/expected, không phải kết quả PASS.

| Test ID và task | Kịch bản | Kết quả kỳ vọng | Điều kiện chấp nhận và bằng chứng |
|---|---|---|---|
| TC-02-01 → W02-T01 | Nhập/quy đổi | Không trộn unit, thiếu/thừa/hỏng có nhánh | Expected khớp actual, có log hoặc biên bản review ngày/version; sai lệch trọng yếu chặn task |
| TC-02-02 → W02-T02 | Pha/hủy/cost | Quy tắc trước/sau pha và ví dụ tính tay được ghi | Expected khớp actual, có log hoặc biên bản review ngày/version; sai lệch trọng yếu chặn task |
| TC-02-03 → W02-T03 | Ma trận quyền | Actor đúng/sai có expected allow/deny; deny zero writes | Expected khớp actual, có log hoặc biên bản review ngày/version; sai lệch trọng yếu chặn task |
| TC-02-04 → W02-T04 | Coverage SRS | Requirement→BR→component→task→test→evidence, quyết định mở không coi duyệt | Expected khớp actual, có log hoặc biên bản review ngày/version; sai lệch trọng yếu chặn task |

**Mức kiểm thử:** Unit/integration/E2E chạy mã: NOT APPLICABLE ở tuần tài liệu/thiết kế; dùng review ví dụ tính tay, contract và walkthrough. W03 đặc tả test tương lai trước triển khai. Negative/edge: role sai, dữ liệu trống/âm/NaN, state stale, double submit, lỗi phụ thuộc và timeout áp dụng theo từng scenario.

**Bằng chứng tối thiểu:** commit/checksum, schema/fixture/model/prompt version khi liên quan, môi trường, command/procedure, input, expected/actual, timestamp, log che dữ liệu. Mock không chứng minh concurrency/rollback PostgreSQL hoặc provider thật. Không áp dụng ghi NOT APPLICABLE và lý do, không tự đổi thành PASS.

## 6. Rủi ro và phương án xử lý

| Rủi ro | Tác động | Giảm thiểu | Dự phòng |
|---|---|---|---|
| Quy tắc chưa duyệt | Sai unit/pha/hủy/cost | Khảo sát bằng ví dụ/ngoại lệ | Chặn phần phụ thuộc |
| Scope/owner chưa rõ | Trễ AI trọng tâm | Tái dùng TLCN/ưu tiên P0 | Xin giảm phụ trợ hoặc đổi lịch |

Lỗi quyền/mất dữ liệu/invariant/duplicate là P0 chặn gate. Người chịu trách nhiệm thực: UNASSIGNED. Lịch/GVHD/SQL chuẩn/nhân lực/sandbox còn thiếu phải xác nhận, không tự xem đã xử lý.

## 7. Điều kiện nghiệm thu tuần

**Quality gate G02: NOT EVALUATED.**

- [ ] W02-T01 đạt tiêu chí và TC-02-01 có bằng chứng.
- [ ] W02-T02 đạt tiêu chí và TC-02-02 có bằng chứng.
- [ ] W02-T03 đạt tiêu chí và TC-02-03 có bằng chứng.
- [ ] W02-T04 đạt tiêu chí và TC-02-04 có bằng chứng.
- [ ] Tiên quyết đã đóng; phần chuẩn bị song song tách khỏi write bị chặn; không còn P0.
- [ ] Artifact/input/expected/actual/log hoặc biên bản/version đầy đủ, không nhầm schema có sẵn với runtime đã nghiệm thu.
- [ ] Báo cáo GVHD theo kết quả thật; trạng thái gửi/duyệt có biên nhận nếu ghi đã thực hiện.

**Hiện vật bắt buộc:** Use case; BR01–BR08; Ma trận quyền; SRS và truy vết; TC-02-01…04 và lỗi/quyết định chưa đóng. Đây là đầu ra tương lai; phiên này không tạo thêm ngoài 12 Markdown.

**Quy tắc gate:** PASS khi mọi tiêu chí áp dụng đạt và bằng chứng đủ; CONDITIONAL chỉ với P1 không chặn tuần sau, có owner/hạn; FAIL khi vi phạm quyền/invariant/bảo toàn hoặc test bắt buộc không đạt. Chưa chạy/thiếu chứng cứ giữ NOT EVALUATED. Không báo hoàn tất từ checklist.

**Blocker còn lại:** chưa xác nhận SQL chuẩn 27/16, quy tắc/SRS, DB thực, GVHD/lịch và rehearsal migration/restore; chi tiết mục 3–6. Kế hoạch cũ không chứng minh gate đã qua.

## 8. Báo cáo gửi giảng viên

Mẫu điền tuần 02 (12/10–17/10/2026), theo cấu trúc được cung cấp vì chưa tìm thấy bao-cao-tuan.docx. Không điền kết quả kỳ vọng thành thành tích.

| Nội dung | Thông tin cần điền |
|---|---|
| Công việc đã hoàn thành | Chưa xác minh task hoàn tất; điền ID/phần việc thật/ngày/source, nền tảng mục 2 không thay nghiệm thu |
| Kỹ thuật trọng tâm | Yêu cầu nghiệp vụ; ghi phần tái dùng TLCN và thay đổi đã làm |
| Kết quả đạt được | Chỉ output/test đo thật, commit/fixture/log/biên bản; hiện UNKNOWN |
| Khó khăn và hạn chế | Blocker mục 6–7, ảnh hưởng/owner/giờ còn lại theo ID |
| Kế hoạch tuần tiếp theo | Đối chiếu [tuần 03](WEEK_03.md) sau G02; giữ ID tồn, chỉ chuẩn bị phần không bị chặn |
| Nội dung xin ý kiến GVHD | Phạm vi/SRS, SQL chuẩn 27/16, quy tắc, lịch trường và phương án phục hồi tiến độ |
| Trạng thái nộp và duyệt | UNKNOWN — chưa có biên nhận; điền ngày/người nhận hoặc duyệt/link bằng chứng/điều kiện thực |

**Cập nhật tiến độ:** ghi ID kế hoạch/thực tế/phần còn lại/bằng chứng/quyết định dời lịch. Task chỉ VERIFIED khi toàn bộ tiêu chí có chứng cứ; test definition/hiện vật chỉ xác nhận nhận định hẹp.
