# Quy trình kiểm thử chuẩn — Cafe Agent

**Phiên bản:** 1.0  
**Phạm vi:** Web khách hàng/admin, API, PostgreSQL/Prisma, Agent, tích hợp thanh toán và email, triển khai Docker.  
**Mục đích:** cung cấp quy trình kiểm thử lặp lại được trước mỗi lần phát hành; ghi rõ mục tiêu, công cụ, bằng chứng và tiêu chí nghiệm thu.

## 1. Tổng quan hệ thống và rủi ro cần ưu tiên

Cafe Agent là monorepo npm workspaces/Turbo gồm React + Vite + TypeScript (`apps/web`), Express + TypeScript (`apps/api`), Agent worker (`apps/agent`), PostgreSQL + Prisma (`packages/database`) và shared packages. Luồng rủi ro cao là đơn hàng/thanh toán ↔ giữ/trừ/hoàn kho ↔ nhật ký ↔ cảnh báo Agent/yêu cầu nhập; phân quyền admin/customer và webhook thanh toán cũng là phạm vi ưu tiên.

Các chức năng cần có trong phạm vi: đăng ký/đăng nhập/hồ sơ; danh mục/sản phẩm/ảnh; giỏ hàng/checkout/đơn; thanh toán COD và cổng MoMo/VNPay sandbox; nguyên liệu/công thức/chi phí; nhập, lô, điều chỉnh và giao dịch kho; nhà cung cấp/yêu cầu nhập; dashboard/thông báo/settings; Agent (rule-based/Gemini/fallback); cron; build và chạy Docker.

## 2. Mục tiêu và nguyên tắc

- Xác nhận chức năng đáp ứng nghiệp vụ, dữ liệu nhất quán xuyên UI/API/DB và lỗi phụ thuộc được xử lý có kiểm soát.
- Xác nhận quyền được kiểm tra ở server; dữ liệu khách hàng không truy cập chéo; webhook xác thực chữ ký, số tiền và tính lặp an toàn.
- Tìm lỗi trước phát hành, giữ bằng chứng đủ để tái hiện và retest.
- Không dùng dữ liệu, tài khoản hay secret production. Không gửi email thật, tạo giao dịch thật, hoặc chạy seed/reset trên DB ngoài môi trường test.
- Mỗi ca có tiền điều kiện, dữ liệu, bước, kết quả mong đợi, kết quả thực tế, trạng thái và bằng chứng. Không đánh dấu PASS chỉ vì UI hiển thị thành công: đối chiếu API/DB cho luồng trọng yếu.

## 3. Phân lớp kiểm thử

| Lớp | Mục tiêu | Công cụ áp dụng | Đầu ra |
|---|---|---|---|
| Static/build | Bắt lỗi cú pháp, type, lint, đóng gói | npm, Turbo, TypeScript, ESLint | Log lệnh, exit code, lỗi |
| Unit/contract | Hàm nghiệp vụ, validator, auth, trạng thái, fallback | Node built-in test runner (`node --test`) | Test count/pass/fail và log |
| API/integration | Route, middleware, DB, transaction, quyền và tích hợp | API, Postman/Insomnia hoặc curl, PostgreSQL test | Collection/log, request ID, DB evidence |
| UI/system E2E | Luồng người dùng từ trình duyệt qua API đến DB | Playwright (đã là dependency), DevTools | Trace/screenshot/video, dữ liệu đối chiếu |
| Security | AuthN/AuthZ, IDOR, validation, upload, secrets, webhook | Postman/curl, browser DevTools, dependency audit theo chính sách dự án | Finding có mức độ và bước tái hiện |
| Performance/reliability | Tải, latency, lỗi, cạnh tranh cập nhật, restart | k6 (nếu có), Docker logs, PostgreSQL metrics | p50/p95, error rate, tài nguyên, log |
| Release/ops | Cấu hình, build image, startup, health, recovery | Docker Compose, Docker CLI, health endpoint | Kết quả triển khai và checklist phát hành |
| Agent quality | Đúng hành động, không bịa dữ liệu, fallback và độ trễ | Bộ ca chuẩn (gold set), log Agent, bảng tính | Accuracy, lỗi nghiêm trọng, p50/p95 |

Tool ngoài repo như Postman/Insomnia, k6 và SMTP/payment sandbox chỉ dùng nếu được cài/cấu hình; ghi phiên bản và tình trạng. Playwright có trong root dependencies nhưng hiện chưa thấy cấu hình/luồng E2E chuẩn. Không coi công cụ chưa cài là đã chạy.

## 4. Vai trò và trách nhiệm

- **QA/Tester:** chuẩn bị môi trường, chạy ca, lưu bằng chứng, tạo bug và retest.
- **Người phụ trách Web:** customer/admin UI, responsive, trạng thái tải/lỗi/rỗng, đối chiếu API.
- **Người phụ trách API/Data:** auth, API, Prisma/PostgreSQL, nghiệp vụ, transaction và audit.
- **Người phụ trách Agent/Integration/Ops:** scan, fallback, email/payment sandbox, cron và Docker.
- **Người nghiệm thu:** xem báo cáo, mức độ lỗi tồn, phạm vi bị chặn và quyết định phát hành.

Một người có thể kiêm nhiều vai trò; mọi thay đổi dữ liệu dùng chung phải ghi ID và phối hợp để tránh test đè nhau.

### 4.2 Phân công kiểm thử cho hai người

| Người phụ trách | Phạm vi chính | Công việc cụ thể | Bằng chứng bàn giao |
|---|---|---|---|
| **Người A — Web và hành trình khách hàng** | `apps/web`; giao diện customer và kiểm tra giao diện admin | Kiểm tra điều hướng, responsive, form/trạng thái UI; đăng ký/đăng nhập/hồ sơ; duyệt sản phẩm/giỏ/checkout/lịch sử đơn; kiểm tra route admin bằng customer; chạy các ca UI admin và ghi lỗi hiển thị; đối chiếu request/response từ DevTools | Case ID/trạng thái, screenshot/trace, browser/viewport, order ID hoặc fixture ID, request ID đã che dữ liệu |
| **Người B — API, dữ liệu, admin nghiệp vụ và Agent** | `apps/api`, `apps/agent`, `packages/database`, Docker/integration | Chạy static/build/test; kiểm tra API/auth/role/IDOR; CRUD và validation; đối soát PostgreSQL/Prisma; kiểm tra transaction/đồng thời kho, đơn và payment; supplier/purchase/email sandbox; Agent rule/Gemini/fallback/log; cron, settings, Docker và API performance/security | Lệnh/exit code, request-response, DB evidence và record IDs, logs, bug IDs, Agent gold-set kết quả |
| **Cùng thực hiện — Tích hợp và nghiệm thu** | Luồng xuyên UI → API → DB → Agent/payment | Chuẩn bị môi trường/fixture; cùng chạy smoke và end-to-end customer đặt đơn; đối chiếu tồn và trạng thái; phối hợp test webhook/Agent; retest lỗi liên module; chạy hồi quy; tổng hợp report; đại diện nghiệp vụ ký UAT | Run ID chung, RTM cập nhật, kết quả tích hợp, danh sách lỗi/rủi ro và quyết định release |

#### Cách phối hợp và thứ tự bàn giao

1. **Cùng chuẩn bị:** chốt commit, DB test, fixture, tài khoản, sandbox và run ID. Người B xác nhận API/DB/Agent sẵn sàng; Người A xác nhận web và dữ liệu hiển thị.
2. **Chạy song song phần độc lập:** Người A kiểm tra web/customer; Người B chạy static, unit/contract, API và dữ liệu. Không cùng lúc sửa đổi một SKU/đơn hàng/request; cấp fixture riêng hoặc thông báo record ID trước khi chạy.
3. **Bàn giao lỗi có thể truy vết:** Người A gửi Case ID, bước UI, screenshot/trace, request và ID bản ghi; Người B tái hiện API/DB, xác định kết quả nghiệp vụ và bổ sung log/record evidence. Không gửi token, mật khẩu, PII hay secret.
4. **Chạy tích hợp chung:** tạo đơn bằng UI, đối chiếu API/DB; kiểm tra trạng thái thanh toán và kho; kích hoạt scan Agent trên fixture riêng; xác nhận log và purchase request; không gửi email/thanh toán thật.
5. **Retest và sign-off:** người tìm lỗi xác nhận UI/API sau sửa; người phụ trách module xác nhận dữ liệu và side effect; cả hai cập nhật RTM/report. Chủ dự án/nghiệp vụ quyết định nghiệm thu.

#### Gợi ý chia lịch theo một vòng release

| Chặng | Người A | Người B | Cùng làm |
|---|---|---|---|
| Phân tích/chuẩn bị | Liệt kê hành trình và thiết bị | Liệt kê API, fixture, DB và dependency | Chốt yêu cầu, rủi ro, RTM, entry criteria |
| Kiểm tra sớm | UI smoke và form | Lint/type/build/unit/API | Xử lý blocker môi trường |
| Chức năng | Customer journey, UI admin | API, auth, DB, admin/Agent | Chạy luồng tích hợp và đối chiếu |
| Phi chức năng | Responsive, keyboard, UI lỗi | Security, concurrency, recovery, performance | Chọn và ghi rủi ro release |
| Hồi quy/UAT | Retest UI, customer acceptance | Retest API/DB/Agent, Docker | Báo cáo và sign-off |

### 4.1 Phân tích yêu cầu, kế hoạch và truy vết

Trước mỗi release/Sprint, QA cùng đại diện nghiệp vụ và kỹ thuật lập danh sách yêu cầu theo module. Với mỗi yêu cầu, ghi actor/role, điều kiện trước, luồng chính, quy tắc nghiệp vụ, validation, luồng lỗi, yêu cầu phi chức năng và mức rủi ro. Khi yêu cầu chưa rõ (ví dụ thời điểm trừ kho, chính sách hủy đơn, ngưỡng Agent), ghi câu hỏi/giả định và người xác nhận; không tự coi giả định là đặc tả.

Chọn phạm vi dựa trên thay đổi, rủi ro và tác động dây chuyền. Ghi người phụ trách, môi trường, công cụ sẵn có, lịch dự kiến, entry criteria (build và môi trường ổn định, fixture sẵn) và exit criteria (mục 8). Có thể chia lịch theo Sprint: phân tích/thiết kế khi yêu cầu vào sprint; test API/UI liên tục khi chức năng khả dụng; hồi quy và nghiệm thu trước release. Không cần áp lịch 4 tuần cố định.

RTM nên được duy trì dạng bảng Markdown/CSV trong `docs/qa/` hoặc công cụ quản lý nhóm hiện có. Mỗi requirement liên kết scenario/case, mức ưu tiên và trạng thái thực thi:

| Requirement ID | Yêu cầu/quy tắc | Rủi ro | Case ID | Bằng chứng/kết quả | Trạng thái |
|---|---|---|---|---|---|
| REQ-AUTH-001 | Customer không gọi được API admin | Cao | CAFE-AUTH-001 | Run ID / bug ID | Chưa chạy |
| REQ-INV-001 | Nhập kho cập nhật tồn và lịch sử cùng transaction | Cao | CAFE-INV-001 | Run ID / DB evidence | Chưa chạy |
| REQ-ORD-001 | Tạo đơn không tính giá từ dữ liệu client | Cao | CAFE-ORD-001 | Run ID / API evidence | Chưa chạy |
| REQ-AGENT-001 | Không tạo purchase request trùng khi request còn mở | Cao | CAFE-AGENT-001 | Run ID / record ID | Chưa chạy |

Các dòng trên là ví dụ khởi tạo, cần được đối chiếu với yêu cầu nghiệp vụ thực tế. RTM phải phân biệt chưa có test, chưa chạy, blocked, pass và fail; không coi thiếu liên kết là đã được bao phủ.

**Đầu ra:** danh sách yêu cầu/rủi ro, Test Plan theo release hoặc Sprint, RTM và kế hoạch ca được chọn. Jira/TestRail/Xray là tùy chọn nếu nhóm đang dùng; repo hiện chưa xác nhận đã cấu hình các công cụ đó.

## 5. Chuẩn bị môi trường

### 5.1 Ghi nhận baseline

Trước khi chạy, ghi vào báo cáo: ngày giờ/múi giờ, commit SHA/branch, OS, Node/npm/Docker, trình duyệt/phiên bản, phiên bản PostgreSQL, URL môi trường (không chứa credential), cấu hình tích hợp bật/tắt, người chạy và mục tiêu build.

### 5.2 Khởi tạo

Tạo database/schema riêng cho test và xác nhận `DATABASE_URL` trỏ đúng DB đó trước mọi thao tác có ghi dữ liệu. Dùng `.env` cục bộ theo `.env.example`; chỉ lưu trạng thái đã cấu hình, tuyệt đối không chép giá trị secret vào report.

```powershell
npm ci
npm run generate -w @cafe-project/database
npm run db:push -w @cafe-project/database
npm run db:seed
npm run dev
```

Các lệnh schema/seed có thể ghi hoặc thay đổi dữ liệu. Chỉ chạy sau khi xác minh DB test. Kiểm tra `GET /health`, trang web, API login và log khởi động của API/Agent. Nếu dùng Docker, xem cấu hình `docker-compose.yml`, xác nhận port/volume/env phù hợp môi trường test rồi chạy `docker compose up --build`; không dùng cấu hình demo có secret mặc định làm cấu hình production.

### 5.3 Fixture và dữ liệu

Chuẩn bị hai tài khoản CUSTOMER/ADMIN, một khách hàng thứ hai để thử IDOR, sản phẩm/SKU có tồn trên ngưỡng, bằng ngưỡng, dưới ngưỡng và hết hàng; lô còn hạn/hết hạn; nhà cung cấp active/inactive; đơn hàng ở các trạng thái chính; yêu cầu nhập đang mở/đã hoàn tất. Ghi ID/SKU, tồn ban đầu, reserved, threshold và trạng thái. Dùng email sandbox/recipient nội bộ; chỉ dùng payment sandbox. Tách dữ liệu cho ca đồng thời.

### 5.4 Dừng chuẩn bị nếu

DB đích chưa xác nhận, secret lộ, schema không tương thích, seed ghi nhầm môi trường, API/Agent không thể khởi động, hoặc dữ liệu fixture không thể phân biệt với dữ liệu thật. Ghi BLOCKED cùng nguyên nhân và người cần xử lý.

## 6. Trình tự thực hiện

### Vòng 0 — Kiểm tra thay đổi và phạm vi

1. Ghi commit/branch, đọc thay đổi và xác định module/luồng bị ảnh hưởng.
2. Chọn ca smoke bắt buộc và ca hồi quy liên quan; thêm kiểm tra bảo mật/dữ liệu nếu thay đổi auth, order, payment, inventory, upload hoặc Agent.
3. Tạo run ID; xác nhận môi trường sạch, fixture, backup/khả năng reset test và tích hợp ngoài được sandbox hóa.

**Kết quả:** danh sách phạm vi, rủi ro và ca được chọn.

### Vòng 1 — Static, build và test tự động

Chạy từ root và ghi riêng exit code từng lệnh:

```powershell
npm run lint
npm run check-types
npm run build
node --test apps/api/tests/*.test.cjs
node --test apps/agent/tests/*.test.cjs
node --test apps/api/src/modules/ingredient/__tests__/*.test.mjs
node --test apps/api/src/modules/payment/__tests__/*.test.mjs
```

PowerShell wildcard có thể được truyền khác nhau theo phiên bản Node/shell; nếu Node không nhận danh sách file, liệt kê rõ từng file trong thư mục rồi gọi `node --test <file...>`. Không báo “test suite toàn dự án” nếu chưa chạy hết các test. Root hiện không khai báo script `test`; API/Agent cũng không khai báo script test riêng. Web có build/lint nhưng không có test UI tự động riêng. Các test inventory có test ghi rõ persistence mock; chúng không chứng minh PostgreSQL concurrency/rollback. Ghi test bỏ qua, lý do, và không thay bằng kết luận PASS.

**Kết quả:** log, tổng test, pass/fail/skip, lỗi lint/type/build và hạn chế môi trường.

### Vòng 2 — Smoke test hệ thống

- API health trả trạng thái thành công; API, web, DB và Agent có log startup lành mạnh.
- Trang home, danh sách/chi tiết sản phẩm, login customer/admin tải; refresh/direct URL không trắng trang.
- Admin tạo/sửa một fixture test; customer không vào được route admin.
- Thực hiện một luồng kho giảm tồn dưới threshold; xem log Agent và purchase request theo quy tắc nghiệp vụ.
- Tạo một đơn COD sandbox và xác nhận trạng thái/tồn theo thiết kế.

**Kết quả:** smoke pass/fail, URL/service, IDs bản ghi và log/screenshot.

### Vòng 3 — Kiểm thử chức năng và tích hợp

Thực hiện theo thứ tự để tránh dữ liệu lệch; mỗi nhánh success cần có nhánh validation/error. Tối thiểu một lượt UI và một lượt gọi API trực tiếp cho quyền và luồng dữ liệu trọng yếu.

| Nhóm/ca | Mục tiêu và thao tác chính | Công cụ | Kết quả mong đợi/bằng chứng |
|---|---|---|---|
| Auth/profile | Đăng ký hợp lệ/trùng/sai; login sai/đúng; refresh/logout; profile/password; reset token hợp lệ, sai, hết hạn | UI + API client | Mã HTTP/trạng thái đúng, password hash, không lộ token; ghi ID user |
| Role/IDOR | Gọi route admin bằng anonymous/customer; thay user/order/request ID; sửa role ở body/token giả | API client + UI | 401/403 theo contract; không đọc/ghi dữ liệu trái quyền; DB không đổi |
| Catalog/upload | CRUD category/product; SKU trùng, giá/threshold âm, category thiếu; file rỗng/sai MIME/quá cỡ; Cloudinary lỗi | UI + API client | Validation thống nhất, quan hệ nguyên vẹn, fallback/lỗi an toàn |
| Cart/order | Số lượng 0/âm/thập phân/quá tồn; đổi giá từ client; gửi tạo đơn lặp; hủy/chuyển trạng thái sai | UI + API + DB | Server tính tiền; không tạo đơn/trừ kho trùng; trạng thái hợp lệ |
| Payment | COD; tạo URL sandbox; webhook chữ ký sai, amount sai, duplicate, out-of-order, timeout | API + sandbox/script simulate-webhook khi phù hợp | Chỉ webhook hợp lệ cập nhật; idempotent; đối chiếu payment/order/reserved stock |
| Inventory/batches | Nhập, điều chỉnh tăng/giảm, lô hết hạn, vượt reserved; batch trùng; cùng SKU cập nhật song song; rollback khi lỗi | Admin UI + API + PostgreSQL | Tồn aggregate/batch/history khớp; không âm/mất cập nhật; transaction rollback thực trên DB |
| Ingredient/recipe/cost | CRUD, đơn vị chuyển đổi, công thức thiếu nguyên liệu/đơn vị sai, tính giá vốn | UI + API + DB | Tính toán đúng theo precision/đơn vị; validation và audit đúng |
| Supplier/purchase | Supplier active/inactive; tạo/duyệt/đổi email/gửi; SMTP success/fail; request mở trùng | UI + API + SMTP sandbox | Request đúng trạng thái; không đánh dấu sent khi SMTP lỗi; không gửi trùng |
| Agent | Tồn >/=/< threshold; thiếu supplier; request mở sẵn; rule-based; Gemini success/timeout/invalid; fallback; internal token thiếu/sai | Agent scan/API/log | Không bịa hoặc ghi sai; fallback có audit; không có side effect trái phép; không lộ key |
| Cron/settings/dashboard | Cấu hình, quyền sửa, lịch cron, payment expiry/cancel và dashboard counts | API + DB + log | Đúng quyền/thời điểm; nhả giữ kho đúng; số liệu đồng nhất |
| UI/accessibility | Desktop/mobile, bàn phím, labels, focus, loading/empty/error, back/forward, console | Browser/DevTools | Không tràn/che nút; lỗi có hướng xử lý; không có lỗi console nghiêm trọng |

Không phát email hay thanh toán thật. Với tích hợp không cấu hình, xác nhận hệ thống báo lỗi/fallback có kiểm soát và đánh dấu phần kiểm tra thành công sandbox là BLOCKED, không suy diễn.

### Vòng 4 — Security và reliability

- Kiểm tra input sai kiểu/thiếu/chuỗi dài/ký tự đặc biệt; response không lộ stack trace, token, key hoặc PII.
- CORS origin hợp lệ/không hợp lệ; upload MIME/size; brute-force/rate-limit chỉ khi chính sách đã xác định; dependency audit theo quy trình tổ chức.
- Webhook: chữ ký, amount, transaction ID, replay, gửi lặp và thứ tự callback.
- Khởi động lại API/Agent/DB trong môi trường thử, quan sát phục hồi; thử mất kết nối dependency có kiểm soát.
- Tải đo trên dữ liệu test, không gây ảnh hưởng môi trường dùng chung. Ghi concurrency, duration, virtual users/requests, p50/p95, error rate, CPU/memory/DB. Không đặt ngưỡng tùy ý: lấy SLO/tiêu chí dự án; nếu chưa có thì báo số đo tham khảo và đề xuất chủ sản phẩm xác lập baseline.

**Kết quả:** finding bảo mật, lỗi phục hồi, số liệu hiệu năng và điều kiện chạy.

### Vòng 5 — Agent gold set (định lượng)

Tạo tối thiểu 20 tình huống có đáp án chuẩn được xác định độc lập: stock trên/bằng/dưới ngưỡng; không có supplier; supplier inactive; request đang mở; dữ liệu thiếu/sai; Gemini timeout; đầu vào tiếng Việt; quantity/min-order; action bị cấm. Chạy rule-based và Gemini/fallback riêng trên cùng dữ liệu cô lập. Mỗi ca lưu input snapshot, expected action, actual action, grounding evidence, latency, side effect, người đánh giá.

Tính: `accuracy = ca đúng / tổng ca chạy`; tỷ lệ hallucination; tỷ lệ side effect sai; p50/p95 latency; timeout/fallback; và nếu có dữ liệu đáng tin cậy thì chi phí. Không tự gán giá model. Một lỗi nghiêm trọng về tồn, nhà cung cấp hoặc ghi nhận hành động phải được nêu riêng dù điểm trung bình cao.

**Kết quả:** gold set, bảng số liệu theo mode/model/config và kết luận phạm vi sử dụng.

### Vòng 6 — Hồi quy, triển khai và nghiệm thu

1. Retest mọi bug đã sửa trên commit ứng viên; chạy thêm ca success lân cận.
2. Chạy lại static/build/test và smoke liên quan; ghi lệnh, exit code, commit.
3. Build/start Docker Compose trong môi trường test; xác nhận web/API/Agent/PostgreSQL, health, kết nối và log.
4. Đối chiếu order/payment/inventory/batch/request/audit trên DB; không còn sai lệch trọng yếu.
5. QA lập báo cáo; chủ sản phẩm/tech lead chấp thuận phát hành hoặc hoãn với bug/rủi ro được chấp nhận bằng văn bản.

## 7. Quy tắc ghi nhận ca kiểm thử

Mã ca khuyến nghị `CAFE-{AREA}-{NNN}`; ví dụ `CAFE-INV-012`. Mỗi run dùng ID duy nhất. Chỉ dùng một trạng thái:

- **PASS:** kết quả thực tế khớp mong đợi, đã lưu bằng chứng cần thiết.
- **FAIL:** kết quả khác mong đợi; mở bug và liên kết bằng chứng.
- **BLOCKED:** không thể chạy vì dependency/quyền/môi trường/dữ liệu; ghi nguyên nhân và điều kiện gỡ chặn.
- **NOT RUN:** nằm trong phạm vi nhưng chưa chạy; không tính là pass.
- **N/A:** ngoài phạm vi đã thống nhất, phải có lý do.

Mẫu ca:

```text
Run ID / Case ID / phiên bản:
Mục tiêu:
Tiền điều kiện, role, dữ liệu fixture (không ghi secret/PII):
Bước và input:
Kết quả mong đợi:
Kết quả thực tế:
Trạng thái: PASS | FAIL | BLOCKED | NOT RUN | N/A
Bằng chứng: screenshot/trace, request-response đã che dữ liệu, log, record ID:
Bug ID / ghi chú:
Người chạy / thời gian:
```

Khi thiết kế ca, dùng kỹ thuật phù hợp: phân vùng tương đương và giá trị biên cho input (quantity, price, threshold); bảng quyết định cho role × trạng thái × action; state transition cho order/payment/purchase request; exploratory testing cho UI và lỗi phục hồi. Tập trung các giá trị biên 0, 1, bằng threshold, vượt tồn, ngày hết hạn và thao tác lặp. Đây là hướng thiết kế, không yêu cầu tạo tài liệu riêng cho mọi kỹ thuật.

Mẫu trường dữ liệu nên có cho Test Case/Sheet: `Case ID`, `Requirement ID`, module, scenario, mục tiêu, priority, tiền điều kiện, role, test data/fixture ID, bước và input, expected result, actual result, trạng thái, run/commit, evidence, bug ID, người chạy và thời gian. Mỗi bước phải đủ cụ thể để người khác chạy lại; expected result nêu cả UI/API và DB khi liên quan.

## 8. Phân mức lỗi và tiêu chí phát hành

| Mức | Ý nghĩa | Ví dụ |
|---|---|---|
| P0 Blocker | Lộ dữ liệu/secret nghiêm trọng, mất/hỏng dữ liệu lớn, bypass auth diện rộng, không thể vận hành | Customer truy cập trái phép toàn bộ admin, DB bị phá |
| P1 Critical | Luồng cốt lõi sai, ảnh hưởng đơn/thanh toán/kho/quyền riêng tư; không có workaround an toàn | Trừ kho sai, duplicate payment, IDOR đơn hàng |
| P2 Major | Chức năng quan trọng lỗi, có workaround hạn chế hoặc dữ liệu phụ trợ không nhất quán | Không gửi được request nhập dù có thể xử lý thủ công |
| P3 Minor | Ảnh hưởng nhỏ về hiển thị/nội dung/biên, không chặn nghiệp vụ | Label hoặc căn chỉnh sai |

Phát hành khi: tất cả build/static và smoke bắt buộc pass; không có P0/P1 chưa xử lý; các ca trọng yếu về auth, đơn, thanh toán, kho và side effect Agent pass; không có sai lệch DB; mọi BLOCKED/NOT RUN và P2/P3 được nêu rõ, có owner/biện pháp; người có thẩm quyền nghiệm thu ghi nhận quyết định. Mọi ngoại lệ phải ghi người chấp thuận, lý do, phạm vi và thời hạn xử lý.

### 8.1 UAT và release sign-off

UAT do đại diện nghiệp vụ/người dùng được chỉ định thực hiện trên môi trường và dữ liệu đã thống nhất. Với Cafe Agent, tối thiểu walkthrough các luồng: admin cập nhật sản phẩm/tồn; customer tạo đơn theo phương thức được hỗ trợ; admin xem và xử lý đơn; hệ thống cập nhật kho; Agent ghi log/cảnh báo hoặc đề xuất nhập; admin xem dashboard. Thanh toán online chỉ dùng sandbox. Người nghiệm thu ghi phiên bản, ca UAT, kết quả, ngoại lệ được chấp nhận, người ký và ngày giờ. QA không tự ký thay nghiệp vụ.

### 8.2 Metrics và điều kiện kết thúc

Tính và ghi rõ mẫu số:

- **Execution rate** = (Pass + Fail) / tổng ca trong phạm vi; báo Blocked, Not run và N/A riêng.
- **Pass rate** = Pass / (Pass + Fail); không tính Blocked/Not run.
- **Requirement coverage** = yêu cầu có ít nhất một ca liên kết / tổng yêu cầu trong phạm vi.
- **Defect summary** = lỗi đang mở theo severity và priority; ghi lỗi reopened riêng nếu hữu ích.
- Coverage mã, latency và hiệu năng chỉ báo cáo khi công cụ/configuration thực sự chạy và baseline/ngưỡng được thống nhất.

Không đặt ngưỡng coverage 70%, pass rate 95% hay latency 500 ms làm chuẩn project nếu chủ dự án chưa phê duyệt. Exit criteria ưu tiên: 100% ca critical đã chạy và pass; không có P0/P1 mở (hoặc có chấp thuận rủi ro chính thức); các ca trọng yếu pass; DB và side effect được đối soát; mọi blocked/not run và rủi ro được công khai; UAT sign-off hoàn tất khi release cần UAT.

## 9. Mẫu bug report

```text
Bug ID / tiêu đề ngắn:
Severity (P0-P3) / trạng thái / người phụ trách:
Run ID / Case ID / commit / môi trường:
Tiền điều kiện và fixture ID (không có PII/secret):
Bước tái hiện:
Kết quả mong đợi:
Kết quả thực tế và tần suất:
Ảnh hưởng nghiệp vụ/dữ liệu/bảo mật:
Bằng chứng đã che secret/token/PII:
Workaround (nếu có):
Retest commit / kết quả:
```

### 9.1 Vòng đời lỗi và ưu tiên xử lý

Workflow đề xuất: `New/Open → Assigned → In Progress → Fixed → Retest → Verified/Closed`; nếu retest vẫn lỗi thì `Reopened`. Lỗi duplicate hoặc không tái hiện cần QA bổ sung phiên bản, dữ liệu và bằng chứng trước khi đóng.

Severity mô tả mức tác động kỹ thuật/nghiệp vụ; priority mô tả mức khẩn cấp xử lý. Bảng P0–P3 ở trên dùng severity để phân loại tác động; priority có thể ghi riêng `Now / High / Normal / Low` theo quyết định của team. Không suy ra priority tự động chỉ từ severity.

## 10. Mẫu báo cáo tổng kết

### Thông tin lần kiểm thử

| Thuộc tính | Giá trị |
|---|---|
| Run ID, ngày giờ, QA | |
| Branch/commit ứng viên | |
| Môi trường/OS/Node/npm/DB/Docker | |
| Browser/device | |
| Tích hợp bật / tắt / sandbox | |
| Phạm vi build và thay đổi | |

### Tổng kết kết quả

| Phạm vi | Tổng | Pass | Fail | Blocked | Not run | Bug P0/P1/P2/P3 |
|---|---:|---:|---:|---:|---:|---|
| Static/build/unit/contract | | | | | | |
| Web customer/admin | | | | | | |
| API/auth/security | | | | | | |
| Orders/payment | | | | | | |
| Inventory/ingredients/database | | | | | | |
| Agent/purchase/email/cron | | | | | | |
| Docker/ops/performance | | | | | | |
| Regression/retest | | | | | | |

**Lệnh tự động và exit code:**  
**Các lỗi P0/P1 và tác động:**  
**Tích hợp hoặc ca bị BLOCKED/NOT RUN cùng lý do:**  
**Số liệu Agent/performance và điều kiện đo:**  
**Sai lệch DB/side effect:**  
**Bug còn mở, owner, workaround, hạn xử lý:**  
**Kết luận:** PASS / PASS CÓ ĐIỀU KIỆN / FAIL / BLOCKED  
**Quyết định nghiệm thu, người quyết định, thời gian:**

### Hạn chế đã biết của bộ kiểm thử trong repo

- Root có `lint`, `check-types`, `build`, nhưng chưa khai báo script `test` chung; ghi rõ từng lệnh và file test thực chạy.
- API/Agent hiện có Node test files; một số test mock repository/transaction. Cần test tích hợp trên PostgreSQL thật cho transaction, concurrency, rollback và đối soát dữ liệu.
- Web có build/lint, chưa thấy suite E2E UI chuẩn; có thể dùng Playwright dependency để thực hiện thủ công/automation riêng, nhưng không tuyên bố đã có coverage E2E nếu chưa cấu hình và chạy.
- SMTP, Gemini, Cloudinary, MoMo và VNPay phụ thuộc env/credentials; tách kết quả mock, fallback và sandbox khỏi kết quả production-like.
- `docker-compose.yml` chứa credential demo; chỉ dành cho môi trường local/test và cần đánh giá cấu hình riêng trước khi dùng cho triển khai thật.

### CI/CD, coverage và tương thích

Hiện tài liệu này chưa giả định repo đã có pipeline CI/CD. Khi nhóm bổ sung, pipeline tối thiểu nên chạy install sạch, lint, type-check, build và các test tự động được chọn; kết quả fail chặn bước deploy theo policy đã thống nhất. Test dùng DB/integration cần service PostgreSQL test và dữ liệu cô lập. Lưu artifact log/JUnit/HTML nếu runner hỗ trợ; bảo vệ secrets bằng secret store của CI, không commit env thật.

Coverage có thể thêm sau khi có test baseline và công cụ (ví dụ `c8` cho Node), chọn phạm vi module cốt lõi và thống nhất ngưỡng dựa trên baseline. Coverage chỉ cho biết mã được thực thi, không chứng minh nghiệp vụ đúng; không đặt ngưỡng giả định hoặc báo số liệu khi chưa chạy.

Với UI, lập ma trận gọn theo trình duyệt/thiết bị người dùng mục tiêu. Tối thiểu kiểm tra viewport desktop và mobile, keyboard/focus/label, zoom và trạng thái lỗi. Chỉ mở rộng sang Firefox/Safari/iOS/Android hoặc dịch vụ BrowserStack/LambdaTest khi sản phẩm hỗ trợ các nền tảng đó; lưu browser/version/viewport trong report. Accessibility scanner như axe/Lighthouse là công cụ tùy chọn, không thay thế kiểm tra thủ công.

## 11. Bộ hồ sơ cần lưu cho mỗi lần chạy

1. Bản báo cáo tổng kết và danh sách ca đã chạy.
2. Log lệnh tự động, phiên bản công cụ, exit code.
3. Ảnh/trace/video hoặc HTTP evidence đã che dữ liệu nhạy cảm.
4. Bug reports, liên kết commit sửa và kết quả retest.
5. Danh sách fixture/record ID test và bằng chứng cleanup/reset nếu áp dụng.
6. Agent gold set, bảng kết quả và dữ liệu đo hiệu năng nếu nằm trong phạm vi.

Gợi ý cấu trúc gọn trong repo (chỉ tạo artefact cần dùng; không lưu dữ liệu khách hàng/secret):

```text
docs/qa/
  TEST_PLAN.md
  REQUIREMENTS_RTM.csv
  TEST_CASES.md
  runs/<run-id>/SUMMARY.md
  runs/<run-id>/evidence/       # ảnh/log đã làm sạch
  runs/<run-id>/agent-gold-set.csv
```

Nếu nhóm dùng Jira/TestRail hoặc kho report bên ngoài, lưu liên kết và run ID trong summary; không nhân đôi tài liệu nếu không cần.
