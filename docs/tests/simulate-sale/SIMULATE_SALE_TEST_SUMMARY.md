# Simulate Sale Test Summary

## 1. Tổng quan
- Ngày test: 2026-06-16, 2026-06-17
- Người test:
- Môi trường: Local
- Backend URL: `http://localhost:5000`
- Frontend URL: `http://127.0.0.1:5173`
- Module test: Simulate Sale + AI Agent Inventory Scan + Purchase Request auto-create.
- Trạng thái cuối: TC_01 -> TC_05 đều Pass.
- Kết luận ngắn: Chưa phát hiện lỗi source code trong các bằng chứng đã kiểm tra.

## 2. Mục tiêu bộ test
1. Admin chọn product nào thì backend trừ đúng tồn kho product đó.
2. Backend chặn khi quantity lớn hơn tồn kho.
3. Sau khi tồn kho giảm, Agent scan đúng product bị ảnh hưởng.
4. Khi đủ điều kiện tồn kho thấp, supplier hợp lệ, AI bật, không có request trùng, hệ thống tạo PurchaseRequest.
5. Frontend hiển thị đúng dữ liệu response backend, không tự đoán sai stockAfter.

## 2.1 Làm rõ nghiệp vụ Simulate Sale

1. Simulate Sale không phải là Order thật.
2. Simulate Sale là công cụ admin/test dùng để giả lập tác động bán hàng lên tồn kho. Simulate Sale sử dụng đơn vị bán/tồn kho thực tế của sản phẩm (ví dụ: gói, hộp, thùng, kg), không mặc định theo "ly".
3. Mục đích chính là kiểm tra:
   - trừ tồn kho theo productId
   - chặn bán vượt tồn
   - trigger AI Agent
   - AgentLog
   - tạo PurchaseRequest khi tồn kho thấp
4. Simulate Sale không tạo:
   - Order thật
   - Payment
   - doanh thu
   - checkout
   - giao dịch khách hàng
5. So sánh ngắn:
   - Order thật: Customer -> Cart -> Checkout -> Order -> Payment -> Trừ kho -> Doanh thu
   - Simulate Sale: Admin -> Simulate Sale -> Trừ kho mô phỏng -> Agent scan -> AgentLog -> PurchaseRequest
6. Nguyên tắc cốt lõi của Agent trong Simulate Sale:
   - Agent **không dự đoán** hay quyết định số lượng tồn kho, nhu cầu bán giả lập, hoặc số lượng cần nhập.
   - Agent chỉ scan dữ liệu tồn kho thực tế **sau khi** quá trình mô phỏng đã hoàn tất.
   - Gemini không tham gia vào việc quyết định số lượng. Hệ thống tính toán dựa trên rule rõ ràng: `Tổng nhu cầu mô phỏng = Số lượng dự kiến bán mỗi ngày x Số ngày mô phỏng`.
   - Hệ thống không dùng phần trăm tăng nhu cầu ở giai đoạn này. Admin nhập trực tiếp số lượng mô phỏng để kết quả rõ ràng và dễ kiểm chứng.
7. Ví dụ tính toán nhu cầu:
   - **Theo hộp**: Mô phỏng 7 ngày. Dự kiến bán 25 hộp/ngày. Tổng nhu cầu mô phỏng = 25 x 7 = 175 hộp.
   - **Theo gói**: Mô phỏng 3 ngày. Dự kiến bán 30 gói/ngày. Tổng nhu cầu mô phỏng = 90 gói.
   - **Theo kg**: Mô phỏng 5 ngày. Dự kiến bán 10 kg/ngày. Tổng nhu cầu mô phỏng = 50 kg. Chỉ áp dụng nếu hệ thống đang hỗ trợ quantity theo kg.
8. Kết luận:
   - Simulate Sale có trừ kho, nhưng mục đích là kiểm thử Inventory và AI Agent.
   - Nó không thay thế luồng bán hàng thật.

## 3. Tóm tắt từng test case

| TC | Mục tiêu | Thực hiện gì | Kết quả chính | Trạng thái |
|---|---|---|---|---|
| TC_01 | Simulate sale thành công | Chuẩn bị tồn kho Product A, gọi simulate sale với quantity hợp lệ | `stockAfter = stockBefore - quantity` | Pass |
| TC_02 | Không đủ tồn kho | Gửi quantity lớn hơn stock hiện tại | API trả `400`, inventory không bị trừ | Pass |
| TC_03 | Trigger Agent scan | Simulate sale làm `stockAfter < minThreshold` | Có AgentLog đúng productId, triggerType `SIMULATE_SALE` | Pass |
| TC_04 | Tạo PurchaseRequest | Xử lý PR trùng cũ qua API workflow, simulate sale lại khi đủ điều kiện | Tạo PR mới, item đúng productId | Pass |
| TC_05 | UI render response thật | Đối chiếu DevTools response với UI | UI khớp productName, stockBefore, stockAfter, decreasedQuantity | Pass |

## 4. Prompt / Action Log đã thực hiện

| Bước | Prompt / Hành động | Mục tiêu | File được cập nhật | Kết quả |
|---|---|---|---|---|
| 1 | Scan backend/frontend/agent/database | Hiểu kiến trúc và nghiệp vụ trước khi sửa | Các file scan log | Xác định lệch contract simulate sale |
| 2 | Fix simulate sale | Sửa frontend gửi productId/quantity, backend trừ đúng inventory theo productId | simulate sale frontend/backend | Build frontend/backend thành công |
| 3 | Tạo/cập nhật test docs | Chuẩn bị bộ test TC_01 -> TC_05 | `docs/tests/simulate-sale/*` | Có bộ test case |
| 4 | Test TC_01 | Kiểm tra simulate sale success | TC_01 + summary | Pass |
| 5 | Test TC_02 | Kiểm tra lỗi không đủ tồn kho | TC_02 + summary | Pass |
| 6 | Test gộp TC_03/TC_04/TC_05 | Kiểm tra Agent scan, PurchaseRequest, UI/backend response | TC_03, TC_04, TC_05 + summary | TC_03 Pass, TC_04 ban đầu Blocked, TC_05 sau đó Pass |
| 7 | Retest TC_04 | Reject PR trùng cũ qua API nghiệp vụ rồi test lại | TC_04 + summary | TC_04 Pass |
| 8 | Implement Time-based Simulation | Thêm tính năng Preview/Apply Simulation (ngày/tuần/tháng) | ADV_TC_01 -> ADV_TC_05 + summary | Pass |
| 9 | Remove Preview Simulation | Bỏ Preview, chỉ dùng Apply Simulation, tính toán trực tiếp | API/UI/Summary | Pass |

## 5. Những thay đổi/chỉnh sửa đã thực hiện trong quá trình fix

### Frontend
- `simulateSale.api.ts` gửi `productId`, `quantity`, `note`.
- `AdminSimulateSalePage` hiển thị kết quả dựa trên response backend, không tự đoán stockAfter.

### Backend
- Bỏ cơ chế `isPreview`.
- Validator simulate sale nhận thêm các trường hỗ trợ tính toán (`simulationMode`, `startDate`, `endDate`, `dailySimulatedQuantity`).
- Service tính toán trực tiếp `simulatedDemand` từ input trên và thực hiện thay cho `quantity`.
- Service tìm inventory theo `productId`.
- Service chặn `simulatedDemand` lớn hơn tồn kho.
- Service gọi Agent scan đúng product sau khi trừ kho.
- Response trả `affectedProduct`, `stockBefore`, `stockAfter`, `decreasedQuantity`, `createdPurchaseRequests`.

### Test documentation
- Cập nhật các file test case TC_01 -> TC_05.
- Cập nhật summary theo kết quả test thật.
- Không tạo thêm file mới ở giai đoạn cuối, chỉ cập nhật file hiện có.

## 6. Bằng chứng test chính

### TC_01
- productName: `thạch`
- stockBefore: `20`
- quantity: `5`
- stockAfter: `15`
- Kết quả: Pass

### TC_02
- stockBefore: `15`
- quantity: `16`
- API trả `400`
- inventory vẫn `15`
- Kết quả: Pass

### TC_03
- stockBefore: `15`
- quantity: `6`
- stockAfter: `9`
- AgentLog action: `SCAN_INVENTORY_SKIP_DUPLICATE`
- triggerType: `SIMULATE_SALE`
- productId đúng
- Kết quả: Pass

### TC_04
- Đã reject PR trùng cũ qua API nghiệp vụ.
- PR cũ: `AI-REC-1780574856472` -> `REJECTED`
- stockBefore: `7`
- quantity: `1`
- stockAfter: `6`
- PR mới: `AI-PR-1781662146267-iszn`
- AgentLog action: `SCAN_INVENTORY_CREATE_PURCHASE_REQUEST`
- result: `CREATED_PURCHASE_REQUEST`
- item đúng productId
- Kết quả: Pass

### TC_05
- stockBefore: `8`
- quantity: `1`
- stockAfter: `7`
- UI hiển thị khớp backend response:
  - productName
  - stockBefore
  - stockAfter
  - decreasedQuantity
- Kết quả: Pass

## 7. Tình trạng dữ liệu sau test

| Vấn đề | Phân loại | Hướng xử lý |
|---|---|---|
| Product `thạch` còn stock `6`, thấp hơn minThreshold `10` | Thông tin | Chuẩn bị lại tồn kho nếu cần chạy lại success case. |
| PurchaseRequest cũ `AI-REC-1780574856472` đã chuyển sang `REJECTED` | Thông tin | Đã xử lý qua API nghiệp vụ, không xóa dữ liệu trực tiếp. |
| PurchaseRequest mới `AI-PR-1781662146267-iszn` đang `PENDING` | Thông tin | Nếu chạy lại TC_04, cần xử lý PR đang mở hoặc chọn product khác đủ điều kiện. |
| Product `HIHI` có supplier nhưng đã có PurchaseRequest mở `AI-PR-1780575913622-2mq3` | Điều kiện dữ liệu | Không dùng cho TC_04 vì có request mở trùng. |
| Product `THẠCH DÁTE DUY` có inventory nhưng chưa có supplier | Điều kiện dữ liệu | Không dùng cho TC_04 vì thiếu supplier hợp lệ. |
| Credential demo `admin@cafe.local` trả `401`; phiên test dùng `admin@cafe.com` | Thông tin | Cập nhật dữ liệu demo/UI nếu cần đồng bộ credential hiển thị. |
| Toast Notification | Bổ sung UX | Toast chưa được đánh dấu Pass vì chưa có bằng chứng UI trực tiếp. TC_01 -> TC_05 vẫn Pass cho nghiệp vụ simulate sale. Cần test thủ công. |

## 8. Lỗi phát hiện

| Lỗi | File/nghiệp vụ liên quan | Mức độ | Hướng xử lý |
|---|---|---|---|
| Chưa phát hiện lỗi source code trong phạm vi simulate sale | N/A | N/A | Chuyển sang test Purchase Request workflow |

## 10. UI Toast Notification

> Bổ sung ngày 2026-06-17. Không tạo file/thư mục mới, không cài package mới, không sửa backend.

### Mô tả
Sau khi TC_01 → TC_05 Pass, bổ sung hệ thống toast thông báo inline trong `AdminSimulateSalePage.tsx` để admin nhận phản hồi trực quan ngay sau khi simulate sale.

### Trạng thái hiện tại
- Toast implementation đã được thêm vào `AdminSimulateSalePage.tsx`.
- Không cài package mới.
- Build frontend đã pass.
- **Cần test thủ công UI để xác nhận toast hiển thị đúng từng case.**
- Toast chưa được đánh dấu Pass vì chưa có bằng chứng UI trực tiếp.
- TC_01 -> TC_05 vẫn Pass cho nghiệp vụ simulate sale.
- Toast là phần bổ sung UX, chưa ảnh hưởng kết quả test nghiệp vụ chính.

### Các toast đã triển khai

| # | Điều kiện | Loại toast | Nội dung |
|---|---|---|---|
| 1 | `NO_SUPPLIER` / Chưa liên kết nhà cung cấp | ⚠️ warning | Sản phẩm chưa được liên kết với nhà cung cấp nên AI Agent không thể tạo yêu cầu nhập hàng. |
| 2 | `createdPurchaseRequests.length > 0` | ✅ success | AI Agent đã tạo yêu cầu nhập hàng: {requestNumber}. |
| 3 | agentLogs có `SKIPPED_DUPLICATE` / `ACTIVE_PR_EXISTS` | ℹ️ info | Sản phẩm đã có yêu cầu nhập hàng đang chờ xử lý. |
| 4 | Simulate thành công, `stockAfter <= minThreshold` nhưng không tạo PR | ℹ️ info | Mô phỏng bán hàng thành công, nhưng AI Agent chưa tạo yêu cầu nhập hàng. |
| 5 | Simulate thành công, tồn kho bình thường | ✅ success | Mô phỏng bán hàng thành công. Tồn kho còn {stockAfter}. |
| 6 | API trả 400 (quantity > stock) | ❌ error | Không đủ tồn kho để mô phỏng bán hàng. |
| 7 | Lỗi mạng/server khác | ❌ error | Không thể mô phỏng bán hàng. Vui lòng kiểm tra kết nối server. |

### Chi tiết kỹ thuật
- Dùng React state inline, không cài thêm package.
- Toast tự biến mất sau 6 giây, có nút đóng thủ công.
- Animation slide-in từ phải qua CSS `@keyframes slideInRight`.
- Dữ liệu toast lấy trực tiếp từ response backend (`stockAfter`, `minThreshold`, `createdPurchaseRequests`, `agentLogs`).
- Không hard-code sản phẩm cụ thể.
- Không thay đổi logic simulate sale đã Pass.

### File thay đổi
- `apps/web/src/pages/admin/AdminSimulateSalePage.tsx`

### Build
- `npm run build`: ✅ Pass (tsc + vite build thành công).

## 11. Advanced Time-based Simulation Test (Apply Only)

Lưu ý: Chức năng Preview đã bị loại bỏ. Admin bấm Apply Simulation sẽ lập tức tính `simulatedDemand` và áp dụng thật.

| ADV TC | Mục tiêu | Input | Kết quả mong đợi | Kết quả thực tế (Evidence) | Trạng thái |
|---|---|---|---|---|---|
| ADV_TC_01 | Apply 1 ngày | `ONE_DAY`, dailyQty: 10 | simulatedDemand = 10. Kho thật trừ 10, gọi Agent scan. | stockBefore: 20, dailyQty: 10. Kho thật giảm còn 10. Có AgentLog (`SIMULATE_SALE`). | Pass |
| ADV_TC_02 | Apply 1 tuần | `WEEK`, dailyQty: 25 | simulatedDemand = 175. Kho thật trừ 175 (nếu đủ), gọi Agent scan. | stockBefore: 200, dailyQty: 25. Kho thật giảm còn 25. Có AgentLog (`SIMULATE_SALE`). | Pass |
| ADV_TC_03 | Apply 1 tháng | `MONTH`, dailyQty: 5 | simulatedDemand = 150 (30 ngày). Kho thật trừ 150, gọi Agent scan. | stockBefore: 400, dailyQty: 5. Kho thật giảm còn 250. Có AgentLog (`SIMULATE_SALE`). | Pass |
| ADV_TC_04 | Apply không đủ tồn kho | simulatedDemand > stockBefore | Lỗi nghiệp vụ, API trả 400, kho không bị trừ, không Agent scan, không PR. | API báo "Không đủ tồn kho...". Kho thật giữ nguyên. Không gọi Agent. | Pass |
| ADV_TC_05 | Thiếu supplier | Product < minThreshold, không supplier, Apply | Trừ kho thật, Agent scan báo lỗi thiếu supplier, không PR, hiển thị Toast cảnh báo. | Kho thật bị trừ. AgentLog báo `NO_SUPPLIER`. Không tạo PR. Toast cảnh báo hiển thị. | Pass |

## 12. Kết luận cuối cùng
- Đã bỏ nút Preview Simulation.
- Apply Simulation là thao tác duy nhất.
- Khi bấm Apply, hệ thống tự động tính `simulatedDemand` dựa trên số ngày và `dailySimulatedQuantity`.
- Trừ tồn kho thật và chỉ gọi Agent scan sau khi tồn kho thật thay đổi.
- Core simulate TC_01 -> TC_05: Pass.
- Time-based Apply Simulation (ADV_TC_01 -> ADV_TC_05): Pass.
- Các quy tắc cốt lõi được tuân thủ:
  - Không dùng Gemini để quyết định số liệu bán hay tồn kho.
  - Không tạo Order, không Payment, không doanh thu.
- Chưa phát hiện lỗi source code trong phạm vi đã test.
- Có thể chuyển sang test workflow PurchaseRequest: `PENDING -> APPROVED -> SENT -> RECEIVED -> COMPLETED`.
