# AI Agent Cafe - Scan Log

## 1. Mục tiêu scan

Scan nhanh dự án Cafe Agent trước yêu cầu tiếp theo, chỉ đọc source để xác định công nghệ, cấu trúc thư mục, file liên quan đến AI Agent/Backend/Frontend/API, luồng xử lý chính và các điểm cần kiểm tra tiếp.

## 2. Phạm vi đã scan

- Root monorepo: `package.json`, `turbo.json`, cấu trúc `apps/`, `packages/`.
- Backend API: `apps/api/src/index.ts`, route/controller/service chính của `agent`, `simulate-sale`, và danh sách module.
- Frontend: `apps/web/package.json`, `apps/web/src/routes/AppRoutes.tsx`, API client, API service liên quan agent/simulate sale, danh sách page admin/customer.
- Agent worker: `apps/agent/package.json`, `apps/agent/src/index.ts`, cấu trúc service/job/repository.
- Database schema: danh sách Prisma schema và một số model liên quan `AgentLog`, `Inventory`, `Order`, `PurchaseRequest`.
- Không scan sâu `node_modules`, `dist`, build output, toàn bộ file dài, hoặc các phần không liên quan trực tiếp.

## 3. Công nghệ phát hiện

- Monorepo: npm workspaces + Turbo.
- Backend: Express, TypeScript, Zod validation, JWT auth, Prisma, CORS.
- Frontend: React 19, Vite, TypeScript, Axios, React Router, Tailwind/PostCSS, lucide-react.
- AI/Agent: `@google/generative-ai`, agent worker TypeScript, `node-cron`, Prisma.
- Database: Prisma schema tách theo domain trong `packages/database/prisma/schema`.
- Package dùng chung: `@cafe-project/database`, `@cafe-project/types`, config packages.

## 4. Cấu trúc dự án

- `apps/api`: Express API chính.
  - `src/common`: env, prisma, response, validate, error handler.
  - `src/modules`: auth, agent, product, inventory, order, payment, purchase, supplier, simulate-sale, system-setting, dashboard, upload.
- `apps/web`: React/Vite frontend.
  - `src/api`: axios client và service theo module.
  - `src/pages`: customer pages.
  - `src/pages/admin`: admin pages.
  - `src/components`, `src/contexts`, `src/layouts`, `src/routes`, `src/types`, `src/utils`.
- `apps/agent`: agent worker chạy scan theo job/manual.
  - `src/jobs`, `src/services`, `src/repositories`, `src/config`, `src/utils`.
- `packages/database`: Prisma schema/client.
- `packages/types`, `packages/eslint-config`, `packages/typescript-config`: package dùng chung/cấu hình.

## 5. File quan trọng đã kiểm tra

- `package.json`: xác nhận monorepo, scripts `build/dev/lint/check-types/db:seed`.
- `apps/api/package.json`: backend Express/TypeScript/Prisma/Zod/Gemini.
- `apps/api/src/index.ts`: mount route `/api/auth`, `/api/agent`, `/api/products`, `/api/inventories`, `/api/orders`, `/api/payments`, `/api/purchase-requests`, `/api/simulate-sale`, v.v.
- `apps/api/src/modules/agent/agent.route.ts`: endpoint admin `/scan-inventory`, `/logs`, `/recommend-reorder`, `/recommendations`, `/recommendations/:id/create-purchase-request`.
- `apps/api/src/modules/agent/agent.controller.ts`: gọi `agentService`, trả success/error envelope.
- `apps/api/src/modules/agent/agent.service.ts`: scan inventory, đọc setting AI, tạo log, tạo purchase request khi tồn kho thấp.
- `apps/api/src/modules/simulate-sale/simulate-sale.route.ts`: POST `/api/simulate-sale`, yêu cầu ADMIN.
- `apps/api/src/modules/simulate-sale/simulate-sale.service.ts`: chọn inventory, giảm tồn kho giả lập, gọi `agentService.scanInventory`.
- `apps/web/package.json`: frontend React/Vite/Axios/Router.
- `apps/web/src/api/client.ts`: base URL, unwrap API envelope, attach Bearer token, xử lý 401 và lỗi chung.
- `apps/web/src/routes/AppRoutes.tsx`: route customer và admin, có `/admin/simulate-sale`, `/admin/agent-logs`.
- `apps/web/src/api/agentLogs.api.ts`: GET `/agent/logs`, normalize log field.
- `apps/web/src/api/simulateSale.api.ts`: POST `/simulate-sale`, map response purchase request.
- `apps/agent/package.json`: worker scripts `dev`, `build`, `start`, `scan`.
- `apps/agent/src/index.ts`: connect Prisma, tùy chọn scan once, khởi tạo cron job.
- `packages/database/prisma/schema/*.prisma`: schema domain, có `AgentLog`, `Inventory`, `Order`, `PurchaseRequest`.

## 6. Luồng xử lý chính

- Frontend customer:
  1. User vào các route customer như `/products`, `/cart`, `/checkout`, `/my-orders`.
  2. Frontend gọi service trong `apps/web/src/api`.
  3. `apiClient` gắn `Authorization: Bearer <token>` nếu có token.
  4. Backend route trong `apps/api/src/index.ts` chuyển request vào module tương ứng.
  5. Controller -> service -> repository/Prisma -> response envelope.
  6. Frontend unwrap data và render page/component.

- Frontend admin AI Agent:
  1. Admin vào `/admin/simulate-sale`.
  2. UI load product + inventory.
  3. UI gọi `simulateSaleApi.simulateSale`.
  4. Backend `/api/simulate-sale` chạy simulate sale, giảm tồn kho.
  5. Backend gọi `agentService.scanInventory` với product bị ảnh hưởng.
  6. Agent service kiểm tra tồn kho, supplier, duplicate purchase request, setting AI.
  7. Nếu cần nhập hàng, backend tạo purchase request AI và agent log.
  8. Frontend render kết quả, link sang purchase request và `/admin/agent-logs`.

- Agent worker độc lập:
  1. `apps/agent/src/index.ts` load env và connect Prisma.
  2. Có thể chạy scan một lần bằng `--scan-once` hoặc theo setting `RUN_ON_START`.
  3. Khởi tạo cron job inventory scan.
  4. Service/repository agent xử lý scan và ghi log.

## 7. Điểm phát hiện được

- Dự án có hai phần AI Agent: module API `apps/api/src/modules/agent` và worker riêng `apps/agent`.
- Frontend hiện có trang admin xem logs và simulate sale, chưa thấy route/page chat agent hoặc hybrid input riêng.
- API `/api/agent/logs` yêu cầu ADMIN và trả log qua `agentService.logs()`.
- Simulate sale backend chọn inventory trong service và sau đó trigger scan inventory.
- `simulateSale.api.ts` nhận `productId` từ frontend nhưng payload gửi backend chỉ gồm `productCount`, `minDecrease`, `maxDecrease`, `note`; cần kiểm tra kỹ nếu yêu cầu tiếp theo liên quan chọn đúng sản phẩm.
- Có dấu hiệu text tiếng Việt trong một số file/source output bị mojibake, cần kiểm tra encoding trước khi sửa UI text.
- Workspace hiện có nhiều thay đổi sẵn theo `git status`; khi sửa sau này cần tránh đụng các thay đổi không liên quan.

## 8. Những việc không thực hiện

- Không sửa source code.
- Không refactor.
- Không đổi logic.
- Không đổi cấu hình.
- Không cài/xóa package.
- Không xoá, đổi tên, di chuyển file.
- Không thay đổi database hoặc chạy migration/seed.
- Không chạy build/test/dev server.
- Không đọc toàn bộ file dài ngoài phần cần thiết.

## 9. Đề xuất bước tiếp theo

- Nếu yêu cầu tiếp theo liên quan AI Agent/simulate sale, nên bắt đầu từ `apps/web/src/api/simulateSale.api.ts`, `AdminSimulateSalePage.tsx`, `apps/api/src/modules/simulate-sale/*`, `apps/api/src/modules/agent/*`.
- Nếu liên quan logs/recommendations, kiểm tra `agentLogs.api.ts`, `AdminAgentLogsPage.tsx`, `agent.route.ts`, `agent.service.ts`.
- Nếu liên quan order/menu/inventory, đối chiếu frontend API/types với backend validator/schema trước khi sửa.
- Trước khi chỉnh code, nên xác nhận phạm vi file cụ thể để tránh ảnh hưởng các thay đổi đang tồn tại trong workspace.

## 10. Scan bổ sung: Gemini Safety, JSON Schema và Free Quota

### 10.1 File đã kiểm tra bổ sung
- `apps/api/src/modules/agent/gemini.service.ts`
- `apps/api/src/modules/agent/agent.service.ts`
- `apps/api/src/modules/agent/recommendation.service.ts`

### 10.2 Vị trí gọi Gemini hiện tại
- Gemini API (`model.generateContent`) được gọi duy nhất tại `gemini.service.ts`.
- Được trigger từ `recommendation.service.ts` (hàm `generateForProduct`) để lấy phân tích và khuyến nghị nhập hàng (số lượng, nhà cung cấp).
- **Lưu ý**: Luồng `simulate sale` gọi `agentService.scanInventory` tạo PurchaseRequest tự động bằng logic Rule-based (`Math.max(...)`) chứ **KHÔNG** gọi Gemini.

### 10.3 Kiểm tra JSON schema/response_schema
- **Chưa có**. Hiện tại hệ thống đang ép AI trả JSON bằng Text Prompt thuần túy (`Return ONLY valid JSON`).
- **Rủi ro**: Việc không dùng `responseSchema` (Structured Outputs) của Gemini có thể khiến AI trả về text có định dạng markdown rác, thiếu đóng mở ngoặc, gây lỗi `JSON.parse`. Dù có hàm `cleanJsonText` nhưng không đảm bảo an toàn tuyệt đối.

### 10.4 Kiểm tra validate response AI
- **Parse JSON**: Đã có `try/catch` bắt lỗi parse an toàn.
- **Validator/Zod**: **Chưa dùng Zod**. Hiện tại đang ép kiểu thủ công (`Number(data.recommendedQuantity)`, `String(...)`) trong `gemini.service.ts`.
- Trong `recommendation.service.ts` có check thủ công: `quantity > 0 && quantity < 1000`, `confidence` [0,1], `reasoning` không rỗng, và check `supplierId` có tồn tại trong list không.
- **Cần bổ sung**: Bổ sung schema Zod trong `gemini.service.ts` để chặn triệt để dữ liệu rác (ví dụ: NaN, null) trước khi truyền về service.

### 10.5 Kiểm tra hallucination risk
- **Bịa ID**: AI có thể bịa `recommendedSupplierId` không tồn tại. Đã được phòng ngừa vì code có check `supplierExists` sau khi nhận response.
- **Bịa số lượng**: Đã bị chặn bởi giới hạn `< 1000`.
- **Rủi ro còn lại**: `emailDraft` và `reasoning` AI tự sinh có thể chứa nội dung không mong muốn/hallucinate, chưa có cơ chế kiểm duyệt nội dung text.

### 10.6 Kiểm tra tính toán tồn kho
- **Backend có tự tính toán không**: **Có**. Hệ thống có hàm `calculateRuleBased` rất mạnh để tự tính dựa vào daily sales và lead time.
- **Gemini có tính toán không**: **Có**. Gemini vẫn được giao phân tích sales/tồn kho để đưa ra `recommendedQuantity` trong prompt.
- **Field cấm AI tự sinh**: `productId`, `inventoryId`, `stock`, `minThreshold`. Hiện tại prompt đã fix cứng truyền vào từ DB, AI chỉ sinh `recommendedQuantity` và `recommendedSupplierId` (chọn từ list cho sẵn), khá an toàn.

### 10.7 Kiểm tra tiết kiệm Gemini Free API
- **Đã làm tốt**: Trong `recommendation.service.ts`, hệ thống đã block gọi Gemini khi:
  - Tồn kho `> minThreshold` (trừ khi `force`).
  - Đã có PurchaseRequest PENDING trùng (`ACTIVE_PR_EXISTS`).
  - Không có Supplier nào hoặc Supplier đều INACTIVE.
- **Còn thiếu**: Trong `recommendation.service.ts` **chưa check System Setting `ai.enabled`** trước khi gọi Gemini (chỉ check `process.env.GEMINI_API_KEY`). Nếu Admin tắt AI trên UI, luồng Recommend Reorder vẫn có thể gọi Gemini!

### 10.8 Kiểm tra fallback khi Gemini lỗi
- **Đã có fallback rất tốt**.
- Bất cứ khi nào Gemini lỗi (rate limit, parse JSON sai, validation fail, timeout) hoặc thiếu API KEY, code sẽ set `fallbackUsed = true` và tự động chuyển sang gọi hàm `calculateRuleBased` để tính toán số lượng và chọn supplier mặc định. App không bao giờ bị crash.

### 10.9 Kết luận scan bổ sung
- **Đã an toàn chưa**: Khá an toàn về mặt logic vì hệ thống Fallback và Block Rule xử lý rất chặt chẽ, không để lọt rác vào Database.
- **Cần sửa gì tiếp theo**:
  1. Thêm `responseSchema` (Gemini API) để bắt buộc trả JSON cấu trúc.
  2. Thêm Zod Validator vào `gemini.service.ts` thay cho ép kiểu `Number()`.
  3. Bổ sung check `ai.enabled` vào `recommendation.service.ts`.
- **Mức độ ưu tiên**: Trung bình (hệ thống hiện tại vẫn chạy ổn định nhờ rule-based fallback).

### 10.10 Những việc không thực hiện
- Không sửa source code.
- Không tạo file log mới.
- Không tạo file log ở root.
- Không đổi database/schema.
- Không chạy migration/seed.

## 11. Purchase Request Detail - Encoding Fix and Editable Email Draft

- **File đã kiểm tra**:
  - `apps/web/src/pages/admin/AdminPurchaseRequestDetailPage.tsx`
  - `apps/api/src/modules/agent/agent.service.ts`
  - `apps/api/src/modules/email/email.controller.ts`, `email.service.ts`, `email.validator.ts`
  - `apps/web/src/api/purchaseRequests.api.ts`
- **File đã sửa**:
  - `apps/api/src/modules/agent/agent.service.ts`
  - `apps/web/src/pages/admin/AdminPurchaseRequestDetailPage.tsx`
  - `apps/api/src/modules/email/email.controller.ts`, `email.service.ts`, `email.validator.ts`
  - `apps/web/src/api/purchaseRequests.api.ts`
- **Nguyên nhân lỗi encoding tìm được**:
  - Do string hardcode lỗi trong `reasoningText` của `agent.service.ts` (ví dụ "Sáº£n pháº©m..."). Code này được dùng khi agent sinh Purchase Request fallback tự động.
- **Cách xử lý encoding**:
  - Viết lại hàm `reasoningText` trong `agent.service.ts` dùng string tiếng Việt chuẩn UTF-8.
- **Dữ liệu cũ trong DB có cần tạo lại/cập nhật lại không**:
  - Có. Dữ liệu cũ bị lưu cứng vào column `notes`/`aiGenerated` dạng mojibake. Cần update thủ công db hoặc tạo request mới thì sẽ hiển thị đúng chuẩn.
- **Luồng email trước khi sửa**:
  - Request APPROVED có nút "Gửi email" và khi nhấn sẽ gửi ngay bằng nội dung không thể chỉnh sửa. Không sửa được To, Subject, Body.
- **Luồng email sau khi sửa**:
  - Request APPROVED sẽ hiện nút "Gửi email nhà cung cấp". Khi bấm mở ra modal cho phép sửa To (Người nhận), Subject (Tiêu đề) và Body (Nội dung) trước khi confirm gửi.
- **API/backend đã thay đổi gì**:
  - Thêm optional field `to` vào `sendEmailSchema` (`email.validator.ts`).
  - `emailService.sendEmail` và `retryEmail` hỗ trợ tham số `to` override supplier email gốc.
  - Controller truyền thông tin `to` từ payload xuống service.
- **UI/frontend đã thay đổi gì**:
  - Cập nhật payload `sendEmail` trong `purchaseRequests.api.ts` để nhận optional `to`.
  - Thêm modal form chỉnh sửa Email trong `AdminPurchaseRequestDetailPage.tsx` với state để quản lý input `editEmailTo`, `editEmailSubject`, `editEmailBody`.
- **Test case cần chạy**:
  1. Mở detail request có tiếng Việt (tạo mới) -> không còn lỗi mojibake.
  2. Request PENDING chỉ hiện "Phê duyệt" và "Từ chối".
  3. Bấm "Phê duyệt" -> status chuyển APPROVED, không gửi email ngay.
  4. Request APPROVED hiện nút gửi email.
  5. Bấm gửi email -> mở modal email draft.
  6. Admin sửa subject/body/to được.
  7. Bấm xác nhận gửi -> backend gửi email và status chuyển SENT/EMAIL_SENT.
  8. Request REJECTED không hiện nút gửi email.
  9. Request chưa APPROVED không gửi email được.
  10. Toast báo lỗi rõ nếu API lỗi.
- **Những việc không thực hiện**:
  - Không sửa các phần khác ngoài chức năng email và agent purchase request. Không tự cài package mới hoặc tạo data migration/seed để migrate dữ liệu cũ.

## 12. Inventory Threshold Suggestion and Stock Warning Flow

- **File đã kiểm tra**:
  - `apps/api/src/modules/inventory/inventory.repository.ts`
  - `apps/api/src/modules/inventory/inventory.service.ts`
  - `apps/web/src/pages/admin/AdminInventoryPage.tsx`
  - `apps/api/src/modules/agent/agent.service.ts`
- **File đã sửa**:
  - `apps/api/src/modules/inventory/inventory.service.ts`
  - `apps/api/src/modules/inventory/inventory.controller.ts`
  - `apps/api/src/modules/inventory/inventory.route.ts`
  - `apps/web/src/api/inventory.api.ts`
  - `apps/web/src/pages/admin/AdminInventoryPage.tsx`
- **Công thức gợi ý ngưỡng**:
  - Tính `avgDailySales` = Tổng lượng xuất kho (loại ORDER và SIMULATE_SALE) trong 30 ngày qua chia cho 30.
  - Lấy thời gian nhập hàng trung bình (`leadTimeDays`) từ bảng `SupplierProduct` (chọn nhà cung cấp ưu tiên hoặc nhỏ nhất). Nếu không có thì fallback là 3.
  - Tính `safetyStock` = `avgDailySales * bufferDays` (trong đó bufferDays = 2). Nếu `avgDailySales == 0`, fallback = 10.
  - `recommendedThreshold = avgDailySales * leadTimeDays + safetyStock` (làm tròn lên).
- **Cảnh báo sau nhập kho**:
  - Nếu sau khi nhập kho, số lượng thực tế vẫn `<= minThreshold`, hiển thị toast cảnh báo màu đỏ: *"Số lượng sau nhập vẫn thấp hơn ngưỡng tối thiểu."*
  - Nếu `> minThreshold`, hiển thị toast xanh: *"Nhập kho thành công. Đủ hàng."*
- **Cảnh báo sau điều chỉnh kho**:
  - Tương tự nhập kho, so sánh quantity sau điều chỉnh với `minThreshold` để đưa ra các cảnh báo phù hợp.
- **Agent scan được trigger khi nào**:
  - Kích hoạt ngầm (`async`) sau khi gọi hàm điều chỉnh tồn kho (`adjustInventory`) thành công. Agent sẽ quét mã sản phẩm và tạo Purchase Request nếu thiếu hàng và không có request trùng.
- **Test case cần chạy**:
  - Bấm nút Ngưỡng trên UI, xem có xuất hiện gợi ý từ hệ thống chưa.
  - Test thay đổi Input threshold thấp hơn dự phòng hoặc cao gấp 3 lần xem có cảnh báo không.
  - Bấm nút Lưu ngưỡng đề xuất.
  - Thực hiện điều chỉnh/nhập kho một số lượng sao cho sau khi nhập vẫn thấp hơn ngưỡng để xem cảnh báo màu đỏ xuất hiện.
  - Check xem sau điều chỉnh tồn kho thấp, hệ thống có tự sinh Purchase Request mới (nếu chưa có).
- **Những việc không thực hiện**:
  - Không sửa giao diện ngoài trang AdminInventoryPage.
  - Không tạo log file mới.

## 13. Inventory Threshold Suggestion and Stock Warning Flow

- **Công thức tính**: `avgDailySales = totalSalesInWindow / salesWindowDays`, `effectiveLeadTimeDays = leadTimeDays + delayBufferDays`, `safetyStock = ceil(avgDailySales * bufferDays)` hoặc fallback `10`, `leadTimeDemand = ceil(avgDailySales * effectiveLeadTimeDays)`, `recommendedThreshold = ceil(leadTimeDemand + safetyStock)`.
- **Trigger Agent**: Order sau khi chuyển `PROCESSING`, simulate sale sau khi trừ tồn, và điều chỉnh kho khi `stockAfter <= minThreshold` đều gọi `agentService.scanInventory` bất đồng bộ. Lỗi Agent không làm fail thao tác kho.
- **Chống tạo request trùng**: Agent vẫn dùng `agentRepository.hasOpenPurchaseRequest` để chặn request trùng cho cùng inventory/product khi có PR trạng thái `PENDING`, `APPROVED`, hoặc `SENT`.
- **Nhà cung cấp dự phòng**: Dựa trên `SupplierProduct` thật, chọn supplier chính theo `isPreferred`, `leadTimeDays`, `price`; backup suppliers là các mapping active còn lại. Schema hiện chưa có `availableQuantity/capacity`, nên Agent không tự kết luận supplier đủ hay thiếu.
- **Cảnh báo sau nhập/điều chỉnh**: API nhập kho/điều chỉnh trả `stockAfter`, `minThreshold`, `message`, `warnings`; frontend hiển thị toast warning nếu tồn sau thao tác vẫn thấp hơn ngưỡng.
- **Việc không thực hiện**: Không hard-code supplier/product, không tạo endpoint giả, không thêm migration capacity, không refactor toàn dự án.
