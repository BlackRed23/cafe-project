# Kế hoạch kiểm thử toàn dự án Cafe Agent (2 người)

## 1. Mục tiêu và phạm vi

Kiểm tra hệ thống từ giao diện khách/admin đến API, PostgreSQL và Agent: đăng nhập, danh mục/sản phẩm, giỏ hàng/đơn hàng, thanh toán mô phỏng, tồn kho/lô hàng, nhà cung cấp, yêu cầu nhập, nhật ký agent, upload ảnh, cấu hình và các tích hợp email/Gemini. Bao gồm kiểm thử chức năng, phân quyền, dữ liệu biên, lỗi phụ thuộc, tương thích giao diện và đóng gói chạy bằng Docker.

Kế hoạch gồm kiểm thử tay, kiểm thử hệ thống và một vòng đánh giá định lượng Agent. Repo hiện có một số kiểm thử hợp đồng tự động ở `apps/api/tests` và `apps/agent/tests`; chúng không thay thế được kiểm thử với PostgreSQL thật, đồng thời một test ghi rõ chỉ mock persistence, không chứng minh đồng thời/rollback thực tế.

## 2. Chuẩn bị chung (cả hai cùng làm trước)

1. Dùng môi trường test riêng, không dùng dữ liệu hoặc secret production. Ghi commit/nhánh, trình duyệt/phiên bản, OS, ngày giờ, `DATABASE_URL`, cấu hình dịch vụ đã bật/tắt; không ghi giá trị secret vào báo cáo.
2. Theo README cài dependencies, generate Prisma client, áp schema và seed vào DB test. Khởi động API, web và agent theo README; kiểm tra `GET /health`, đăng nhập được bằng dữ liệu seed. Có thể dùng Docker Compose để kiểm tra triển khai local.
3. Xác nhận hai tài khoản seed (admin/customer), danh mục, sản phẩm, kho, nhà cung cấp và tồn đầu kỳ. Ghi lại ID/SKU, số lượng, ngưỡng và giá của các fixture sẽ dùng.
4. Dùng hai trình duyệt/profile riêng để kiểm tra vai trò độc lập. Chuẩn bị một email test/SMTP sandbox nếu có; nếu không, ghi rõ email là kiểm tra cấu hình/thất bại có kiểm soát. Gemini, Cloudinary và SMTP là tùy chọn; kiểm tra cả chế độ không cấu hình và chế độ được cấu hình khi môi trường cho phép.
5. Mỗi ca kiểm thử ghi: mã, bước/đầu vào, kết quả mong đợi, kết quả thực tế, PASS/FAIL/BLOCKED, ảnh màn hình hoặc request/response đã che token/PII, ID bản ghi liên quan, bug ID. Không để lộ mật khẩu, JWT, API key hoặc dữ liệu khách hàng.

### Khởi động tham khảo

```bash
npm install
npm run generate -w @cafe-project/database
npm run db:push -w @cafe-project/database
npm run db:seed
npm run dev
```

Chỉ chạy lệnh seed/reset trên DB kiểm thử đã xác nhận. Không chạy migration SQL có tên `04_contract_DO_NOT_RUN_YET.sql` trong migration 27 bảng.

## 3. Phân công

| Người | Phạm vi chính | Phần code/luồng |
|---|---|---|
| **Người A — Web và luồng khách hàng** | Điều hướng, responsive, form, UX, khách hàng từ xem hàng đến tạo/theo dõi đơn; hỗ trợ đối chiếu UI với API | `apps/web/src/pages`, `components`, `contexts`, `routes`, API client |
| **Người B — API, dữ liệu và vận hành admin/agent** | REST API, xác thực/phân quyền phía server, CRUD admin, tính đúng kho/đơn/nhập, tích hợp agent, database và Docker | `apps/api/src/modules`, `apps/agent/src`, `packages/database/prisma` |

Hai người tự thực hiện phạm vi của mình trước, sau đó cùng chạy mục 6 (kiểm thử tích hợp chéo), mục 7 (đánh giá Agent), và mục 8 (hồi quy/nghiệm thu). Người B chuẩn bị benchmark/ghi kết quả Agent; Người A chạy các ca đánh giá mù và đo quy trình thủ công. Nếu một ca cần thay đổi trạng thái dùng chung, báo người còn lại trước và ghi ID dữ liệu; không chạy song song các ca làm thay đổi cùng một SKU/đơn hàng.

## 4. Checklist Người A — Web và trải nghiệm khách hàng

### A1. Khởi động, điều hướng và giao diện

- [ ] Mở trang chủ, tải lại, dùng back/forward, mở trực tiếp URL con; không có trang trắng hoặc lỗi console nghiêm trọng.
- [ ] Kiểm tra header/footer, liên kết Home/Products/Cart/Login/Profile/My Orders và trang lỗi/URL không tồn tại.
- [ ] Kiểm tra desktop và màn hình hẹp/mobile: không tràn ngang, nút/form không bị che, modal đóng/mở và cuộn được.
- [ ] Kiểm tra loading, trạng thái rỗng, lỗi API/mất mạng, toast thành công/thất bại; nội dung tiếng Việt và định dạng ngày/tiền hợp lý.

### A2. Tài khoản khách và bảo vệ trang

- [ ] Đăng ký hợp lệ; thử email sai định dạng, email đã tồn tại, trường bắt buộc rỗng, mật khẩu ngắn/không khớp nếu có xác nhận.
- [ ] Đăng nhập đúng/sai, đăng xuất, refresh, đóng/mở tab; trạng thái tài khoản phản ánh đúng phiên đăng nhập.
- [ ] Forgot/reset password: email không tồn tại, quy trình hợp lệ khi SMTP/token khả dụng, token sai/hết hạn/đã dùng; ghi BLOCKED nếu env chưa cấu hình.
- [ ] Profile/change password: tải dữ liệu, lưu hợp lệ, dữ liệu thiếu/sai, đổi mật khẩu rồi đăng nhập lại; không hiển thị password/token.
- [ ] Truy cập route admin khi chưa đăng nhập và bằng customer: phải chặn/điều hướng; thử URL admin trực tiếp sau refresh.

### A3. Duyệt sản phẩm, danh mục và giỏ hàng

- [ ] Danh sách sản phẩm: ảnh/fallback, tên, giá, danh mục, tồn/trạng thái; mở chi tiết sản phẩm và điều hướng quay lại.
- [ ] Kiểm tra tìm kiếm/lọc/phân trang nếu giao diện cung cấp; kết quả rỗng và tên có dấu/ký tự đặc biệt.
- [ ] Thêm sản phẩm vào giỏ, sửa số lượng, xóa, xóa toàn bộ; tổng dòng/tổng giỏ cập nhật đúng.
- [ ] Giỏ tồn tại đúng theo hành vi thiết kế sau refresh/đăng nhập/đăng xuất; không giữ nhầm dữ liệu giữa người dùng.
- [ ] Thử số lượng 0/âm/số thập phân/rất lớn, sản phẩm hết hàng hoặc bị xóa sau khi thêm; UI không cho đặt vượt tồn và API vẫn phải kiểm tra lại.

### A4. Checkout, thanh toán mô phỏng và đơn khách

- [ ] Checkout với địa chỉ/thông tin bắt buộc hợp lệ; thử bỏ trống/sai định dạng, ký tự dài, khoảng trắng.
- [ ] Tạo đơn với COD, CASH/BANK_TRANSFER theo phương thức UI hỗ trợ; xác nhận đây là mô phỏng, không kỳ vọng cổng thanh toán thật.
- [ ] Double-click/nạp lại/gửi lặp thao tác tạo đơn: không tạo đơn trùng ngoài hành vi đã định nghĩa.
- [ ] Xác nhận trang kết quả, mã đơn, tổng tiền/phí giao hàng, chi tiết và trạng thái ban đầu khớp dữ liệu server.
- [ ] My Orders: chỉ thấy đơn của chính customer, xem chi tiết/trạng thái sau khi admin cập nhật; URL đơn của người khác phải bị từ chối.

### A5. Admin UI — kiểm tra giao diện theo luồng Người B

- [ ] Với tài khoản admin kiểm tra menu/sidebar, dashboard và thông báo; mỗi trang quản trị tải, có trạng thái rỗng/lỗi và điều hướng đúng.
- [ ] Spot-check form/tables/modal/confirm/loading/toast tại Products, Categories, Inventory, Suppliers, Orders, Purchase Requests, Agent Logs, Users, Settings.
- [ ] Kiểm tra phân trang/lọc/sắp xếp nếu có, modal không lưu khi hủy, double-submit không tạo bản ghi trùng.
- [ ] Chụp màn hình lỗi UI có URL, viewport, bước tái hiện; giao cho Người B ID bản ghi để đối chiếu API/DB.

## 5. Checklist Người B — API, dữ liệu, admin và Agent

### B1. Kiểm tra nền API, cấu hình và database

- [ ] API khởi động với env hợp lệ, `/health` trả trạng thái OK; kiểm tra lỗi rõ ràng khi thiếu/sai cấu hình bắt buộc.
- [ ] Kiểm tra kết nối DB, seed, schema Prisma, khóa ngoại/unique; dữ liệu sau restart không mất ngoài ý muốn.
- [ ] Với mọi endpoint thử method/path sai, body rỗng, JSON sai, ID không tồn tại, kiểu dữ liệu sai; response theo chuẩn, không lộ stack trace/secret.
- [ ] Kiểm tra CORS từ origin cho phép và origin không cho phép; không-origin (CLI/service) theo cấu hình dự án.
- [ ] Kiểm tra JWT thiếu/sai/hết hạn, role customer/admin; mọi quyền phải được xác thực ở server, không dựa riêng vào ẩn nút UI.
- [ ] Dữ liệu chuỗi có dấu tiếng Việt, ký tự đặc biệt, chuỗi dài, payload HTML/SQL-like được validate/lưu an toàn.

### B2. Auth, users và phân quyền

- [ ] API register/login, thông tin sai, trùng email, password hashing, token/claims và logout/refresh theo hành vi hiện có.
- [ ] Customer không được gọi endpoint admin để tạo/sửa/xóa sản phẩm, kho, user, settings, supplier, purchase request, logs.
- [ ] Admin được phép đúng phạm vi; customer chỉ đọc/tạo tài nguyên sở hữu mình (đặc biệt orders/payments/profile).
- [ ] Thử IDOR: đổi user/order/product/request ID trong URL/body; dữ liệu nhạy cảm của người khác không được trả về/sửa.
- [ ] User CRUD/role/status nếu có: cấm tự nâng quyền, validate role/status, xử lý email trùng và user không tồn tại.

### B3. Danh mục, sản phẩm, upload và nhà cung cấp

- [ ] CRUD category/product; validate tên, SKU trùng, giá âm, số lượng/threshold âm, danh mục không tồn tại, ảnh URL sai.
- [ ] Xóa danh mục/sản phẩm đang được tham chiếu bởi đơn/kho; kiểm tra quy tắc từ chối/xóa mềm và tính toàn vẹn lịch sử.
- [ ] Upload: định dạng cho phép/từ chối, file rỗng/quá lớn, giả MIME, thiếu file; kiểm tra response URL và lỗi Cloudinary khi thiếu credentials.
- [ ] Supplier CRUD, liên kết supplier-product, giá, lead time, min order quantity; xử lý liên kết trùng, supplier inactive/deleted.
- [ ] Kiểm tra lọc sản phẩm phía khách không vô tình hiển thị sản phẩm ẩn/xóa/ngừng bán.

### B4. Tồn kho, lô, giao dịch và mô phỏng bán

- [ ] Import/nhập kho tăng đúng tồn, ghi transaction/batch; thử batch code trùng, hạn dùng, đơn vị không khớp, số lượng 0/âm/thập phân.
- [ ] Adjustment tăng/giảm; không cho tồn khả dụng thấp hơn reserved stock; lý do/actor/audit được ghi đúng.
- [ ] Gọi lặp request/double-submit và cập nhật đồng thời một SKU; không mất cập nhật, âm kho hoặc lệch tổng inventory với batches.
- [ ] Sale/confirm order trừ đúng lượng, chọn/xử lý batch theo quy tắc (FIFO/hạn dùng nếu áp dụng); thất bại giữa transaction phải rollback cả stock và history.
- [ ] Thử đơn vượt tồn, reserved stock, kho bằng ngưỡng, dưới ngưỡng, vừa chạm 0; xác nhận thông báo/lỗi nhất quán.
- [ ] Simulate sale: input hợp lệ, sản phẩm không tồn tại, lượng không hợp lệ/vượt tồn; verify tồn và transaction sau mỗi ca.
- [ ] Inventory list/detail/transactions: tổng số, đơn vị, ngưỡng và lịch sử khớp database; gợi ý threshold trả dữ liệu hợp lệ và có xử lý thiếu lịch sử bán.

### B5. Orders và payments

- [ ] Tạo order qua API: giá/tổng tiền được tính phía server, không tin giá client; sản phẩm/số lượng/địa chỉ sai bị từ chối.
- [ ] Kiểm tra status transition hợp lệ/không hợp lệ, confirm/cancel lặp, đơn đã hoàn tất/hủy, customer chỉ thao tác được đơn của mình.
- [ ] Xác nhận thời điểm trừ kho đúng với quy tắc nghiệp vụ và không trừ hai lần khi retry.
- [ ] COD/CASH/BANK_TRANSFER: trạng thái payment, số tiền, liên kết order và dữ liệu lịch sử; không giả định xử lý thanh toán thật.
- [ ] Shipping fee/địa chỉ khu vực: kiểm tra quy tắc tính phí, trường hợp thiếu/sai địa chỉ và tổng order.

### B6. Purchase requests, email và system settings

- [ ] Tạo request hợp lệ, danh sách/chi tiết, trạng thái mở/đã duyệt/đã gửi; validate supplier/product/quantity/email.
- [ ] Duyệt/sửa email/gửi: email thiếu/sai, SMTP lỗi, gửi thành công sandbox; không đánh dấu sent nếu gửi thất bại; retry không tạo request/email ngoài dự kiến.
- [ ] Đảm bảo không sinh nhiều request mở cho cùng sản phẩm theo quy tắc dedupe; hoàn tất request rồi tồn thấp lại thì hành vi đúng.
- [ ] Settings: đọc/cập nhật cấu hình trong phạm vi admin, validate dữ liệu/giá trị biên; customer/internal unauthenticated không sửa được.

### B7. Agent, nhật ký, cron và fallback

- [ ] Internal agent endpoints từ thiếu token, token sai và token đúng; external customer/admin không thể giả mạo lời gọi nội bộ.
- [ ] Scan khi tồn cao hơn/bằng/thấp threshold; xem log, actor/source, trạng thái skipped và dữ liệu recommendation.
- [ ] Rule-based mode không cần Gemini: chọn supplier hợp lệ và lượng đặt dương, tôn trọng min order/lead time/settings theo thuật toán hiện hành.
- [ ] Gemini thành công nếu key có sẵn; Gemini timeout/lỗi/key thiếu phải fallback có log, agent không crash; không ghi key vào log/response.
- [ ] Không có supplier phù hợp, supplier inactive/deleted, sản phẩm xóa mềm, request mở sẵn: không tạo request sai/trùng và log lý do phù hợp.
- [ ] Chạy scan-once trên dữ liệu test, kiểm tra kết thúc/disconnect; kiểm tra cron scan và job xóa chờ (nếu bật) không tác động dữ liệu ngoài phạm vi.
- [ ] Dashboard/notification/agent logs: count và trạng thái đồng nhất với order/inventory/purchase request thực.

### B8. Docker/đóng gói và tích hợp

- [ ] Build/start các service bằng Compose; kiểm tra web, API, agent và PostgreSQL lên, endpoint health và truy cập từ web.
- [ ] Kiểm tra cấu hình port/origin/API URL khi chạy Compose; restart service không mất DB volume, migration/seed được thực hiện theo quy trình dự án.
- [ ] Tắt agent/DB/API lần lượt: service phụ thuộc báo lỗi có thể hiểu, phục hồi sau khi service bật lại; không để dữ liệu giao dịch nửa vời.
- [ ] Xác nhận frontend bundle không chứa `JWT_SECRET`, SMTP password, Gemini key, Cloudinary secret hay token nội bộ.

## 6. Kịch bản tích hợp chéo — hai người cùng kiểm tra

### E1. Luồng mua hàng đầu cuối

1. Người A đăng nhập customer, chọn sản phẩm có đủ kho, thêm giỏ và checkout.
2. Người B ghi tồn ban đầu, giá, phí giao hàng và stock reserved (nếu có) của SKU.
3. Người A tạo đơn một lần; Người B đối chiếu order/items/tổng tiền/payment trong API/DB.
4. Người B xác nhận đơn qua admin; Người A refresh My Orders và xác nhận trạng thái mới.
5. Người B đối chiếu tồn, batch, transaction; kiểm tra chỉ trừ đúng một lần.
6. Lặp với thiếu tồn/đơn bị hủy để xác nhận lỗi và hoàn tồn theo quy tắc nghiệp vụ.

### E2. Luồng tồn thấp → Agent → nhập hàng

1. Chọn SKU test, ghi tồn, threshold, supplier và trạng thái các purchase request đang mở.
2. Người B nhập kho hoặc Người A tạo đơn để đưa tồn xuống dưới ngưỡng; không đồng thời thao tác cùng SKU.
3. Chạy scan agent hoặc simulate sale; Người B kiểm tra request/log/quantity/source; Người A kiểm tra thông báo và trang admin.
4. Thử chạy scan lần hai; không sinh request mở trùng. Thử Gemini tắt để xác nhận fallback rule-based.
5. Admin duyệt và gửi qua SMTP sandbox nếu có; xác nhận trạng thái, nội dung email, recipient và audit log. Nếu SMTP chưa cấu hình, ghi BLOCKED riêng cho giao nhận thật, vẫn kiểm tra lỗi có kiểm soát.

### E3. Luồng admin CRUD → storefront

1. Người B tạo/cập nhật category/product/price/stock; Người A kiểm tra storefront phản ánh thay đổi sau reload.
2. Thử upload ảnh; kiểm tra link từ storefront và fallback khi link không khả dụng.
3. Ẩn/xóa mềm sản phẩm theo quy tắc; xác nhận customer không thể mua sản phẩm không bán, đơn cũ vẫn giữ lịch sử.

## 7. Bộ đánh giá Agent và so sánh với làm thủ công

Mục tiêu là đo xem Agent chọn đúng hành động/hàm, trả khuyến nghị dựa trên dữ liệu thật hay bịa, và phản hồi nhanh đến đâu; sau đó so sánh kết quả và chi phí với quy trình nhân viên tự tra cứu và tạo yêu cầu nhập. Đánh giá trên dữ liệu test cô lập, không gửi email thật và không dùng đầu ra của Agent làm nhãn chuẩn.

### 7.1 Bộ ca chuẩn (gold set)

Người B tạo **ít nhất 30 ca độc lập**, mỗi ca có fixture cố định và nhãn chuẩn do hai người thống nhất trước khi chạy:

| Nhóm | Số ca tối thiểu | Bao gồm |
|---|---:|---|
| Hành động/tool đúng | 10 | Tồn thấp cần scan/recommend; tồn đủ thì không tạo request; đọc đúng SKU; chọn supplier đang active; ghi log; không gửi/duyệt nếu chưa được yêu cầu hoặc thiếu thông tin |
| Tính đúng và chống ảo giác | 10 | Tồn/threshold bằng ngưỡng, tồn 0, không có lịch sử bán, không có supplier, supplier inactive/deleted, request mở sẵn, dữ liệu thiếu/xung đột |
| Lỗi và fallback | 5 | Gemini key thiếu/lỗi/timeout; DB/agent unavailable; input sai; retry; lỗi email; kỳ vọng lỗi rõ ràng hoặc fallback rule-based, không bịa kết quả |
| Độ khó/biên | 5 | SKU/tên gần giống, đơn vị khác nhau, số lượng lớn, dữ liệu tiếng Việt, sản phẩm xóa mềm hoặc không tồn tại |

Mỗi ca lưu: `case_id`, fixture/SKU giả lập, trạng thái kho/threshold/batch, supplier và open request, prompt/input, hành động mong đợi (tool/action và arguments), giá trị mong đợi, bằng chứng nguồn dữ liệu, kết quả kỳ vọng, mode (rule-based/Gemini), trạng thái tích hợp, thời gian. Lưu snapshot dữ liệu trước/sau để xác định tác dụng phụ. Hai người duyệt nhãn chuẩn trước khi chạy; khi bất đồng, làm rõ nghiệp vụ rồi mới đưa ca vào benchmark.

Chạy từng ca **3 lần** trong cùng cấu hình và ghi riêng từng lần; không gộp mất lỗi không ổn định. Giữ nguyên model/config/prompt/seed dữ liệu trong một vòng so sánh. Nếu Gemini không có credentials, đánh giá rule-based và fallback đầy đủ, đánh dấu Gemini live là BLOCKED thay vì suy diễn kết quả.

### 7.2 Cách chấm ba chỉ số

1. **Độ chính xác gọi tool/action**
   - Trước mỗi ca, nhãn chuẩn ghi rõ tool/action cần dùng (ví dụ scan inventory, đọc SKU/supplier, tạo recommendation/log, tạo purchase request, hoặc không gọi tool) và arguments hợp lệ.
   - `Tool accuracy = số ca có đúng tập tool/action và arguments / tổng ca × 100%`. Ca được xem đúng chỉ khi gọi đúng action, đúng tài nguyên/ID, đúng tham số và không phát sinh side effect cấm. Trường hợp không nên gọi tool mà Agent vẫn gọi được tính sai.
   - Nếu implementation hiện tại không expose lời gọi tool có cấu trúc, ghi nhận action quan sát được qua API/DB/log; không tuyên bố đo chính xác call nội bộ. Khi đó báo cáo chỉ số là **action accuracy**, kèm giới hạn quan sát.

2. **Tỷ lệ ảo giác / sai nội dung**
   - Đối chiếu mọi dữ kiện trong output (tồn, threshold, supplier, giá/lead time, sales velocity, số lượng đề xuất, trạng thái request) với fixture/DB và log nguồn.
   - `Hallucination rate = số kết quả có ít nhất một dữ kiện bịa hoặc sai / số kết quả có output nội dung × 100%`. Ghi thêm số **lỗi nghiêm trọng**: bịa SKU/supplier/tồn, khuyến nghị lượng gây vượt tồn/ràng buộc hoặc khẳng định đã gửi/tạo request khi không có bản ghi tương ứng.
   - Nội dung không đủ bằng chứng nhưng được trình bày như sự thật tính là ảo giác; câu trả lời từ chối rõ ràng khi dữ liệu thiếu không tính là ảo giác, nhưng được chấm riêng về hữu ích/hoàn thành.

3. **Thời gian phản hồi**
   - Đo từ lúc gửi yêu cầu đến lúc nhận phản hồi hoàn chỉnh; chạy cùng máy/mạng/cấu hình, ghi latency từng lượt tính bằng ms, timeout/lỗi là lượt thất bại (không loại khỏi thống kê).
   - Báo cáo median (p50), p95 và tỷ lệ timeout; nếu xử lý bất đồng bộ, ghi riêng thời gian nhận phản hồi và thời gian hoàn tất side effect.

### 7.3 Barem và ngưỡng đạt

| Hạng mục | Trọng số | Điểm tối đa khi đạt | Cách quy đổi |
|---|---:|---|---|
| Tool/action accuracy | 40 | ≥95% | Điểm thành phần = tỷ lệ thực tế / 95% × 40, tối đa 40 |
| Không ảo giác | 35 | Hallucination ≤2%, và 0 lỗi nghiêm trọng | Điểm thành phần = max(0, (1 − tỷ lệ ảo giác / 2%) × 35); có lỗi nghiêm trọng thì tổng kết quả không đạt |
| Latency | 25 | p50 ≤2 giây, p95 ≤5 giây, timeout ≤1% | Đủ cả ba: 25; p95 ≤10 giây và timeout ≤5%: 15; còn lại: 0 |

**Đạt:** tổng từ 85/100, tool/action accuracy ≥90%, hallucination ≤2%, không có lỗi nghiêm trọng và timeout ≤5%. **Đạt tốt:** từ 95/100, tool/action accuracy ≥95%, hallucination = 0%, p95 ≤5 giây và timeout ≤1%. Barem là ngưỡng nghiệm thu ban đầu; nếu nghiệp vụ yêu cầu chặt hơn, hai người ghi ngưỡng mới trước khi xem kết quả, không nới sau khi thấy điểm.

### 7.4 So sánh Agent với quy trình thủ công

Với cùng **ít nhất 20 kịch bản tồn kho/đặt nhập** (lấy từ gold set), đo theo cặp:

1. Người A thực hiện thủ công theo SOP viết sẵn: mở trang tồn kho, kiểm tra ngưỡng và supplier, tính lượng đề nghị, ghi yêu cầu nhập/nhật ký. Bấm giờ từ lúc nhận ca đến khi hoàn thành; ghi lỗi và số bước. Người thực hiện không xem kết quả Agent trước.
2. Chạy Agent trên snapshot tương đương và ghi thời gian tới kết quả, mức can thiệp cần thiết, có phải sửa output hay không, kết quả request/log cuối.
3. Hoán đổi người giữa các nhóm ca (A làm thủ công nhóm đầu, B làm thủ công nhóm sau) để giảm thiên lệch tốc độ cá nhân. Dùng cùng tiêu chí hoàn thành và cùng dữ liệu gốc; reset fixture trước lượt kế tiếp.
4. Tính chi phí theo công thức thống nhất, dùng số liệu nội bộ do nhóm cung cấp:
   - `Chi phí thủ công/ca = phút thao tác × đơn giá lao động/phút + chi phí lỗi/sửa lại`.
   - `Chi phí Agent/ca = (phút giám sát + phút sửa lỗi) × đơn giá lao động/phút + chi phí model/API + hạ tầng phân bổ + chi phí lỗi`.
   - `Tiết kiệm ròng/ca = chi phí thủ công − chi phí Agent`; `Tỷ lệ tiết kiệm = tiết kiệm ròng / chi phí thủ công × 100%` (nếu mẫu số bằng 0 thì ghi N/A).
5. So sánh median và p95 thời gian, tỷ lệ hoàn thành đúng không cần sửa, tỷ lệ lỗi/ảo giác, số phút can thiệp, chi phí trung bình/ca và tổng chi phí của 20+ ca. Báo riêng mọi giả định giá model/hạ tầng; không tự bịa đơn giá.

| Ca | Người làm tay | Thời gian tay | Kết quả tay đúng? | Agent latency | Agent đúng/sửa? | Chi phí tay | Chi phí Agent | Ghi chú/bug |
|---|---|---:|---|---:|---|---:|---:|---|
|  |  |  |  |  |  |  |  |  |

### 7.5 Báo cáo đánh giá Agent

| Mode/model/config | Số ca/lượt | Tool/action accuracy | Hallucination | Lỗi nghiêm trọng | p50 | p95 | Timeout | Điểm/100 | Kết luận |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---|
| Rule-based |  |  |  |  |  |  |  |  |  |
| Gemini (nếu cấu hình) |  |  |  |  |  |  |  |  |  |
| Fallback khi Gemini lỗi |  |  |  |  |  |  |  |  |  |

Đính kèm danh sách ca và log đã ẩn secret; ghi rõ lỗi bị loại khỏi benchmark (nếu có) và lý do. Không dùng tổng điểm để che một lỗi nghiêm trọng về dữ kiện/tác dụng phụ.

## 8. Hồi quy và nghiệm thu

- [ ] Cả hai rà lại bug đã ghi, tái hiện trên commit cuối; bug đã sửa cần chạy lại ca lỗi và ca thành công kế cận.
- [ ] Chạy các kiểm tra build/lint/type-check hiện có nếu được giao trong phiên kiểm thử; ghi chính xác lệnh và kết quả. Lưu ý workspace scripts hiện có build/lint/check-types cấp root; API/agent có test Node ở `apps/api/tests` và `apps/agent/tests`, còn web package khai báo build/lint nhưng không có script test riêng.
- [ ] Không còn lỗi blocker/critical; lỗi còn lại có mức độ, workaround, phạm vi và người nhận xử lý.
- [ ] Không có sai lệch tồn, transaction, order total, payment, purchase request hay quyền truy cập trong các ca đã chạy.
- [ ] Tổng hợp tỷ lệ PASS/FAIL/BLOCKED, môi trường/tích hợp chưa cấu hình, bug ID, bằng chứng và đề xuất retest.

### Mức độ lỗi

- **P0 — Blocker:** mất dữ liệu/sai lệch nghiêm trọng, lộ secret, bỏ qua xác thực hoặc không thể khởi động hệ thống.
- **P1 — Critical:** luồng mua hàng/kho/đặt nhập hỏng, trừ kho sai, customer truy cập dữ liệu người khác.
- **P2 — Major:** chức năng quan trọng lỗi nhưng có workaround, trạng thái/log không nhất quán.
- **P3 — Minor:** lỗi giao diện/nội dung/biên không cản luồng chính.

### Mẫu ghi lỗi

```text
ID: BUG-___ | Mức độ: P__ | Người phát hiện: A/B
Môi trường/commit:
Tiền điều kiện và dữ liệu (SKU/order ID, không ghi PII/secret):
Bước tái hiện:
Kết quả mong đợi:
Kết quả thực tế:
Tần suất:
Bằng chứng (ảnh hoặc request/response đã che dữ liệu nhạy cảm):
```

### Bảng tổng kết

| Phạm vi | Tổng ca | Pass | Fail | Blocked | Bug ID |
|---|---:|---:|---:|---:|---|
| Người A — Web/khách hàng |  |  |  |  |  |
| Người A — UI admin |  |  |  |  |  |
| Người B — API/auth/data |  |  |  |  |  |
| Người B — Agent/integrations/ops |  |  |  |  |  |
| Tích hợp chéo |  |  |  |  |  |
| Đánh giá Agent (gold set) |  |  |  |  |  |
| So sánh thủ công vs Agent |  |  |  |  |  |
| Hồi quy/nghiệm thu |  |  |  |  |  |
