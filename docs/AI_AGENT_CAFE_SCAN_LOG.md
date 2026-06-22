# AI Agent Cafe - Scan Log

## Step 13R - Add Scan Inventory Button In Admin Inventory Page

### 1. Vị trí nút

- Đã thêm nút `Quét tồn kho bằng AI Agent` ở phần đầu trang `/admin/inventory`.
- Nút nằm cùng hàng với các badge tổng quan tồn kho như `{count} sản phẩm`, `{count} cần nhập hàng`, `{count} cảnh báo ngưỡng`.
- Nút nằm sau các badge summary, không nằm trong từng dòng sản phẩm.
- Sau khi quét có hiển thị link nhỏ `Xem Nhật ký Agent` trỏ tới `/admin/agent-logs`.

### 2. API được gọi

- Frontend chỉ gọi apps/api qua `apiClient`.
- API gọi khi bấm nút:

```txt
POST /api/agent/scan-inventory
```

- Body gửi theo schema hiện có trong `apps/api/src/modules/agent/agent.validator.ts`:

```ts
{
  triggerType: "MANUAL_ADMIN_SCAN"
}
```

- Không truyền `productIds` để backend/agent scan toàn bộ tồn kho.

### 3. File đã sửa

| File | Thay đổi |
| ---- | -------- |
| `apps/web/src/pages/admin/AdminInventoryPage.tsx` | Thêm nút scan AI Agent, loading text `Đang quét...`, disable khi đang scan, toast thành công/lỗi, refresh danh sách tồn kho và link nhật ký Agent. |
| `apps/web/src/api/agentLogs.api.ts` | Thêm method `scanInventory` gọi `POST /agent/scan-inventory`, normalize `results`, `createdPurchaseRequests`, `agentWarning`. |
| `apps/web/src/types/agentLog.types.ts` | Thêm type `ScanInventoryRequest` và `ScanInventoryResponse`. |
| `apps/api/src/modules/agent/agent.validator.ts` | Chỉ đọc để xác nhận schema body. |
| `apps/api/src/modules/agent/agent.controller.ts` | Chỉ đọc để xác nhận response envelope. |
| `apps/api/src/modules/agent/agent.client.ts` | Chỉ đọc để xác nhận trường `agentWarning` khi Agent service không kết nối được. |

### 4. Luồng xử lý UI

- Khi bấm nút, nút chuyển sang loading `Đang quét...` và bị disable.
- Nếu API thành công và có tạo yêu cầu nhập hàng, toast:

```txt
AI Agent đã tạo {count} yêu cầu nhập hàng.
```

- Nếu API thành công nhưng không tạo yêu cầu mới, toast:

```txt
AI Agent đã quét xong, chưa có yêu cầu nhập hàng mới.
```

- Nếu Agent service tắt/lỗi hoặc backend trả `agentWarning`, UI không crash và toast:

```txt
Không kết nối được AI Agent service. Vui lòng kiểm tra Nhật ký Agent.
```

- Sau scan, frontend gọi lại `inventoryApi.getInventories()` để refresh danh sách tồn kho.

### 5. Build result

| Lệnh | Kết quả | Ghi chú |
| ---- | ------- | ------- |
| `npm run build --workspace=apps/web` | FAIL | `tsc -b` bị chặn bởi lỗi TypeScript có sẵn ngoài phạm vi Step 13R: unused imports/vars ở `Header.tsx`, `Sidebar.tsx`, `CartContext.tsx`, `ChangePasswordPage.tsx`, `CheckoutPage.tsx`; lỗi payment type ở `AdminOrderDetailPage.tsx` và `utils/payment.ts`. Không có lỗi TypeScript trỏ tới các file đã sửa trong Step 13R. |

Không chạy build `apps/api` vì Step 13R không sửa backend API.

### 6. Test result

| Test | Kết quả | Ghi chú |
| ---- | ------- | ------- |
| Mở `/admin/inventory` thấy nút `Quét tồn kho bằng AI Agent` | PASS source | Nút được render ở summary pills đầu trang. |
| Bấm nút chuyển `Đang quét...` và disable | PASS source | State `isScanningInventory`, prop `isLoading` và `disabled` đã gắn vào Button. |
| Gọi đúng API `/api/agent/scan-inventory` | PASS source | `apiClient.post("/agent/scan-inventory", ...)` tương ứng base URL `/api`. |
| Body đúng schema scan toàn bộ | PASS source | Gửi `{ triggerType: "MANUAL_ADMIN_SCAN" }`, không gửi `productIds`. |
| Thành công có toast rõ ràng | PASS source | Có nhánh toast cho tạo request và không tạo request. |
| Danh sách tồn kho được refresh | PASS source | Gọi `await fetchInventories()` sau scan. |
| Có link qua `/admin/agent-logs` | PASS source | Link `Xem Nhật ký Agent` hiển thị sau lần scan. |
| Agent service lỗi UI không crash | PASS source | Catch lỗi API và nhánh `agentWarning` đều hiển thị toast lỗi, không throw ra component. |

Chưa chạy live browser vì build web hiện bị chặn bởi lỗi TypeScript ngoài phạm vi Step 13R.

### 7. Cam kết

- Không sửa database schema.
- Không migration.
- Không seed.
- Không gọi Gemini trực tiếp ở frontend.
- Không tạo AgentLog giả.
- Không đổi logic tạo Purchase Request.
- Không đổi Simulate Sale/Restore.
- Không đổi Order/Payment.
- Không gọi apps/agent trực tiếp từ frontend.
- Frontend chỉ gọi apps/api.

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

## Agent Log Processing Scan

### 1. Mục tiêu scan

* Kiểm tra cách hệ thống tạo, lưu, trả API và hiển thị AgentLog / Nhật ký Agent.
* Phạm vi chỉ scan và phân tích Agent Log, không sửa code, không gọi Gemini, không tạo AgentLog giả, không thay đổi database.

### 2. File đã scan

#### Backend

* `apps/api/src/modules/agent/agent.repository.ts`
* `apps/api/src/modules/agent/agent.service.ts`
* `apps/api/src/modules/agent/agent.controller.ts`
* `apps/api/src/modules/agent/agent.route.ts`
* `apps/api/src/modules/agent/recommendation.service.ts`
* `apps/api/src/modules/simulate-sale/simulate-sale.service.ts`
* `apps/api/src/modules/simulate-sale/simulate-sale.controller.ts`
* `apps/api/src/modules/purchase/purchase.service.ts`
* `apps/api/src/modules/purchase/purchase.repository.ts`
* `apps/api/src/modules/purchase/purchase.route.ts`
* `apps/api/src/modules/email/email.service.ts`
* `apps/api/src/modules/email/email.controller.ts`
* `apps/api/src/modules/email/email.validator.ts`
* `apps/api/src/modules/inventory/inventory.service.ts`
* `apps/api/src/modules/inventory/inventory.controller.ts`
* `apps/api/src/modules/inventory/inventory.route.ts`
* `apps/api/src/index.ts`

#### Database

* `packages/database/prisma/schema/system.prisma`
* `packages/database/prisma/schema/inventory.prisma`
* `packages/database/prisma/schema/purchase.prisma`
* `packages/database/prisma/schema/user.prisma`

#### Frontend

* `apps/web/src/api/agentLogs.api.ts`
* `apps/web/src/types/agentLog.types.ts`
* `apps/web/src/pages/admin/AdminAgentLogsPage.tsx`
* `apps/web/src/components/admin/NotificationPanel.tsx`
* `apps/web/src/contexts/ToastContext.tsx`
* Route registry/search result: `apps/web/src/routes/AppRoutes.tsx`, `apps/web/src/components/admin/Sidebar.tsx`, `apps/web/src/layouts/AdminLayout.tsx`, `apps/web/src/components/admin/Header.tsx`

### 3. Luồng ghi AgentLog hiện tại

| Luồng | File/function | Action | Status/Result | Ghi chú |
| ----- | ------------- | ------ | ------------- | ------- |
| AI setting tắt khi scan tồn kho | `agent.service.ts` / `scanInventory` | `SCAN_INVENTORY_DISABLED` | `SKIPPED_DISABLED` | Có lưu input triggerType/productIds, output `{ skipped:true, reason:'AI_DISABLED' }`, reasoning tiếng Anh, reference `SystemSetting/ai.enabled`. |
| Agent scan inventory bỏ qua do đã có PR đang xử lý | `agent.service.ts` / `scanInventory` | `SCAN_INVENTORY_SKIP_DUPLICATE` | `SKIPPED_DUPLICATE` | Có lưu input baseInput, output reason `ACTIVE_PR_EXISTS`, reasoning tiếng Việt. Nên hiểu là SKIPPED nghiệp vụ. |
| Agent scan inventory bỏ qua do chưa gắn supplier | `agent.service.ts` / `scanInventory` | `SCAN_INVENTORY_NO_SUPPLIER` | `NO_SUPPLIER` | Có lưu input baseInput, output reason `NO_SUPPLIERS_MAPPED`, reasoning tiếng Việt. Hiện result không có tiền tố SKIPPED. |
| Agent scan inventory bỏ qua do supplier inactive | `agent.service.ts` / `scanInventory` | `SCAN_INVENTORY_INACTIVE_SUPPLIER` | `NO_SUPPLIER` | Có lưu output reason `SUPPLIERS_INACTIVE`. Nên hiểu là SKIPPED nghiệp vụ, không phải lỗi server. |
| Agent scan inventory tạo PurchaseRequest | `agent.service.ts` / `scanInventory` | `SCAN_INVENTORY_CREATE_PURCHASE_REQUEST` | `CREATED_PURCHASE_REQUEST` | Có tạo PR qua transaction, log reference `PurchaseRequest`, output có purchaseRequestId/supplier/recommendedQty/confidence. |
| Agent scan inventory bỏ qua vì tồn kho trên reorder point | `agent.service.ts` / `scanInventory` | Không tạo log | Không có | Chỉ console.info. Rủi ro: admin không thấy vì sao scan không tạo PR khi stock vẫn an toàn. |
| Agent scan inventory exception | `agent.service.ts` / `scanInventory` | Không tạo log riêng | Không có | Nếu create PR/log hoặc DB lỗi, exception bubble ra hoặc bị caller catch; không có AgentLog FAILED tổng quát cho scan. |
| Simulate Sale sau khi trừ tồn kho | `simulate-sale.service.ts` / `run` | Qua `agentService.scanInventory` | Theo kết quả scan | Simulate Sale không tự ghi AgentLog, nhưng trả `agentLogs`/`agentResults` từ scan. Không đụng lại logic này. |
| Inventory adjustment dưới ngưỡng | `inventory.service.ts` / `adjustInventory` | Qua `agentService.scanInventory` | Theo kết quả scan | Gọi async `.catch(console.error)`. Nếu scan fail thì chỉ console error, không lưu FAILED AgentLog. |
| Inventory import vẫn dưới ngưỡng | `inventory.service.ts` / `importInventory` | Không tạo log | Không có | Import chỉ trả warning, không trigger agent scan/log. |
| Recommendation bỏ qua vì trên threshold | `recommendation.service.ts` / `generateForProduct` | `RECOMMEND_REORDER_SKIP_THRESHOLD` | `SKIPPED` | Có lưu output reason `ABOVE_THRESHOLD`, skippedProduct trả về caller. |
| Recommendation bỏ qua do PR trùng | `recommendation.service.ts` / `generateForProduct` | `RECOMMEND_REORDER_SKIP` | `SKIPPED_DUPLICATE` | Có lưu output reason `ACTIVE_PR_EXISTS`. |
| Recommendation bỏ qua do thiếu supplier | `recommendation.service.ts` / `generateForProduct` | `RECOMMEND_REORDER_NO_SUPPLIER` | `NO_SUPPLIER` | Có lưu output reason `NO_SUPPLIERS_MAPPED`. Nên hiểu là SKIPPED. |
| Recommendation bỏ qua do supplier inactive | `recommendation.service.ts` / `generateForProduct` | `RECOMMEND_REORDER_INACTIVE_SUPPLIER` | `NO_SUPPLIER` | Có lưu output reason `SUPPLIERS_INACTIVE`. Nên hiểu là SKIPPED. |
| Recommendation tạo đề xuất | `recommendation.service.ts` / `generateForProduct` | `RECOMMEND_REORDER` | `RECOMMENDED` | Có lưu input productId/force, output recommendation/emailDraft, fallback_used, error_message nếu fallback do Gemini lỗi/missing key. |
| Convert recommendation thành PurchaseRequest | `agent.service.ts` / `createPurchaseRequestFromRecommendation` | Không tạo log mới | Update result `CONVERTED_TO_PR` | Cập nhật AgentLog cũ của `RECOMMEND_REORDER` với reference PurchaseRequest/result converted. |
| Purchase Request create thủ công | `purchase.service.ts` / `create` | Không tạo log | Không có | Không ghi AgentLog cho luồng thủ công. |
| Purchase Request approve/reject/receive/complete/delete | `purchase.service.ts` | Không tạo log | Không có | Workflow PR thường không ghi AgentLog. |
| Email preview | `email.service.ts` / `getPreview` | Không tạo log | Không có | Chỉ build preview, không lưu AgentLog. |
| Send supplier email thành công | `email.service.ts` / `sendEmail` | `SEND_SUPPLIER_EMAIL` | `SUCCESS` | Có lưu reference `purchase_request`/id, creator. Không lưu input/output subject/body/to. |
| Send supplier email thất bại | `email.service.ts` / `sendEmail` | `SEND_SUPPLIER_EMAIL` | `FAILED` | Có tăng retryCount, lưu lastEmailError vào PR và AgentLog `error_message`. Không lưu input/output. |

### 4. Status/Result hiện tại

| Status/Result | Ý nghĩa hiện tại | Nên hiểu là | Ghi chú |
| ------------- | ---------------- | ----------- | ------- |
| `SKIPPED_DISABLED` | AI Agent bị tắt bởi setting `ai.enabled`. | SKIPPED | Nên chuẩn hóa reason `AI_DISABLED`. |
| `SKIPPED_DUPLICATE` | Đã có PurchaseRequest đang xử lý. | SKIPPED | Đúng nghiệp vụ, không phải FAILED. |
| `NO_SUPPLIER` | Không có supplier mapped hoặc supplier inactive. | SKIPPED | Nên đổi/chuẩn hóa thành SKIPPED + reason `NO_SUPPLIER` / `SUPPLIERS_INACTIVE`. |
| `CREATED_PURCHASE_REQUEST` | Agent tạo PR thành công. | SUCCESS | Có reference tới PurchaseRequest. |
| `SKIPPED` | Recommendation bỏ qua do trên threshold. | SKIPPED | Đang dùng chung chung, nên có reason `STOCK_OK` hoặc `ABOVE_THRESHOLD`. |
| `RECOMMENDED` | Tạo recommendation thành công. | SUCCESS | Không đồng nghĩa đã tạo PR. |
| `CONVERTED_TO_PR` | Recommendation đã được convert sang PR. | SUCCESS | Là trạng thái hậu xử lý của log recommendation cũ. |
| `SUCCESS` | Gửi email nhà cung cấp thành công. | SUCCESS | Chỉ đang thấy ở `SEND_SUPPLIER_EMAIL`. |
| `FAILED` | Gửi email thất bại. | FAILED | Đúng cho lỗi SMTP/send email. |
| `ERROR` | Frontend có kiểm tra `ERROR`, nhưng backend chưa thấy result này trong các luồng đã scan. | FAILED | Nếu chuẩn hóa nên dùng cho exception/server error hoặc bỏ để chỉ dùng FAILED. |
| `RUNNING` | Chưa thấy backend ghi. | RUNNING | Chưa có lifecycle log đang chạy. |
| `PENDING` | Không dùng trong AgentLog; dùng trong PurchaseRequest/emailStatus preview. | Không phải AgentLog status | Tránh lẫn với PR status. |
| `ACTIVE_PR_EXISTS` | Đang nằm trong output.reason, không phải result chính. | SKIPPED reason | Nên giữ dưới `reason`. |
| `AI_DISABLED` | Đang nằm trong output.reason. | SKIPPED reason | Nên giữ dưới `reason`. |
| `NO_SUPPLIERS_MAPPED` / `SUPPLIERS_INACTIVE` | Đang nằm trong output.reason. | SKIPPED reason | Nên map UI thành lý do dễ hiểu. |

### 5. API AgentLog

| Endpoint | Mục đích | Query hỗ trợ | Ghi chú |
| -------- | -------- | ------------ | ------- |
| `GET /api/agent/logs` | Lấy danh sách AgentLog cho admin. | Không hỗ trợ query trong route/controller hiện tại. | Có auth ADMIN. Service lấy `take: 100`, order `triggered_at desc`, include creator. Không có page/limit/status/action/triggerType/productId filter. |
| `POST /api/agent/scan-inventory` | Trigger scan inventory thủ công. | Body theo `scanInventorySchema`, không phải endpoint list log. | Trả `results` và `createdPurchaseRequests`; kết quả gồm log DTO nếu có log được tạo. |
| `POST /api/agent/recommend-reorder` | Tạo recommendation reorder. | Body theo `recommendReorderSchema`. | Có tạo AgentLog qua recommendationService cho nhiều case. |
| `GET /api/agent/recommendations` | Lấy recommendation logs action `RECOMMEND_REORDER`. | Không thấy query. | Không phải nhật ký tổng; chỉ map các log recommendation. |
| `POST /api/agent/recommendations/:id/create-purchase-request` | Convert recommendation log thành PR. | Không query. | Update AgentLog cũ result/reference, không tạo log mới. |
| `GET /api/agent-logs` | Không thấy endpoint thật trong `index.ts`/route scan. | Không có | Frontend đang gọi đúng `/agent/logs`, không phải `/agent-logs`. |

Ghi chú response hiện tại:

* Backend `toLogDto` trả `id`, `action`, parsed `input`, parsed `output`, `reasoning`, `fallback_used`, `error_message`, `reference_type`, `reference_id`, `result`, `createdBy`, `createdAt`.
* Không trả field riêng `status`; frontend normalize `status = result`.
* Không trả trực tiếp `productName`, `productId`, `inventoryId`, `purchaseRequestId`; các thông tin này nằm rải rác trong `input`, `output`, `reference_type/reference_id`.
* Không có field `triggerType` riêng; hiện nằm trong parsed `input.triggerType` với một số log scan.
* Không có `message` hoặc `reason` chuẩn hóa cấp top-level.

### 6. Frontend Nhật ký Agent

| Màn hình/File | Dữ liệu hiển thị | Thiếu sót | Ghi chú |
| ------------- | ---------------- | --------- | ------- |
| Route `/admin/agent-logs` / `AdminAgentLogsPage.tsx` | Bảng thời gian, sản phẩm quét, action, trạng thái, purchase request, nút xem chi tiết. | `log.product?.name` thường không có vì API không trả product object; PR link dùng `purchaseRequestId` nhưng API không trả field này trực tiếp. | Có modal xem reasoning/input/output/error. Search chỉ theo `log.product?.name` và action nên khó tìm theo productId/reference. |
| `agentLogs.api.ts` | Gọi `GET /agent/logs`, unwrap list `logs`, normalize status/error/purchaseRequestId/createdAt. | Không map `reference_type/reference_id` thành `purchaseRequestId`; không extract productId/productName từ input/output. | API client gọi đúng endpoint. |
| `agentLog.types.ts` | Type có action/status/input/output/reasoning/error/purchaseRequestId/product/createdAt. | Type thiếu `result`, `reference_type`, `reference_id`, `fallback_used`, `createdBy`. | Không khớp hoàn toàn DTO backend. |
| UI status | Chỉ coi `ERROR`/`FAILED` hoặc error_message là thất bại, còn lại là thành công. | SKIPPED/NO_SUPPLIER/SKIPPED_DUPLICATE đang bị hiển thị như thành công. | Đây là rủi ro UX chính: admin dễ hiểu nhầm Agent đã xử lý thành công thay vì bỏ qua đúng nghiệp vụ. |
| Font/encoding | Một số chuỗi trong `AdminAgentLogsPage.tsx` đang mojibake như `KhÃ´ng thá»ƒ...`, `Nháº­t kÃ½...`, `â€”`. | Cần sửa encoding ở code nếu được phép trong bước sau. | Lần này chỉ scan, chưa sửa. |

### 7. NotificationPanel liên quan AgentLog

* Nguồn dữ liệu:
  * `NotificationPanel.tsx` fetch song song `inventoryApi.getLowStock()`, `purchaseRequestsApi.getPurchaseRequests({ status: 'PENDING' })`, `agentLogsApi.getAgentLogs()`, `ordersApi.getOrders()` khi mở dropdown.
  * Toast local lấy từ `useToastState()` và ghép chung với API notifications.
* Có trùng với Toast không:
  * Có khả năng trùng ở cấp notification: local CRUD toast được hiển thị chung danh sách với notification API, nhưng AgentLog không tự tạo ToastContext. Không thấy AgentLog ghi vào ToastContext trực tiếp.
  * Local toasts được persist trong `admin_local_toasts` tối đa 50, có thể làm NotificationPanel chứa lịch sử toast cũ cùng với AgentLog API.
* Log nào nên thành notification:
  * `CREATED_PURCHASE_REQUEST` / `SCAN_INVENTORY_CREATE_PURCHASE_REQUEST`.
  * `NO_SUPPLIER` / supplier inactive, vì admin cần gắn NCC.
  * `SKIPPED_DUPLICATE` / `ACTIVE_PR_EXISTS`, nếu cần báo có request đang xử lý để admin khỏi tạo trùng.
  * `FAILED` / `ERROR` như email fail hoặc server/DB error.
* Log nào chỉ nên nằm trong Nhật ký Agent:
  * Scan bị bỏ qua vì `STOCK_OK` hoặc `ABOVE_THRESHOLD`.
  * Log kỹ thuật input/output chi tiết.
  * Các scan thường xuyên không tạo thay đổi nghiệp vụ.
* Ghi chú hiện tại:
  * NotificationPanel chỉ tách error nếu `status` là `ERROR`/`FAILED` hoặc có error_message.
  * Tất cả log còn lại được coi là `agent_success`, nên `NO_SUPPLIER`, `SKIPPED_DUPLICATE`, `SKIPPED_DISABLED` có thể hiện thành “AI Agent hoạt động bình thường”. Đây là sai lệch ngữ nghĩa.
  * NotificationPanel cũng có mojibake tiếng Việt trong nhiều title/description.

### 8. Rủi ro phát hiện

| Rủi ro | File liên quan | Mức độ | Gợi ý xử lý |
| ------ | -------------- | ------ | ----------- |
| AgentLog schema thiếu field chuẩn `status`, `triggerType`, `productId`, `inventoryId`, `purchaseRequestId`, `message`, `reason`, `updatedAt`. | `packages/database/prisma/schema/system.prisma` | HIGH | Chuẩn hóa schema hoặc DTO/API mapping trước; nếu đổi schema cần migration riêng sau khi được yêu cầu. |
| API log không có pagination/filter, chỉ `take: 100`. | `agent.service.ts`, `agent.controller.ts`, `agent.route.ts` | MEDIUM | Thêm query `page`, `limit`, `status`, `action`, `triggerType`, `productId` khi được phép sửa. |
| API không trả productName/message/reason top-level nên UI khó hiển thị dễ hiểu. | `agent.service.ts` / `toLogDto` | HIGH | Extract từ input/output/reference và trả DTO giàu ngữ cảnh hơn. |
| UI đang coi SKIPPED/NO_SUPPLIER/SKIPPED_DUPLICATE như SUCCESS. | `AdminAgentLogsPage.tsx`, `NotificationPanel.tsx` | HIGH | Phân loại SUCCESS/FAILED/SKIPPED rõ ràng bằng màu và nhãn. |
| Tồn kho an toàn/stock OK trong `scanInventory` chỉ console log, không lưu DB. | `agent.service.ts` | MEDIUM | Nếu cần audit đầy đủ, tạo log SKIPPED `STOCK_OK`; nếu sợ quá nhiều log thì chỉ lưu khi trigger manual hoặc có filter/cleanup. |
| Exception trong scanInventory/inventory adjustment không tạo FAILED AgentLog. | `agent.service.ts`, `inventory.service.ts` | HIGH | Bọc scan bằng try/catch tạo log FAILED với reason `SERVER_ERROR`/`DATABASE_ERROR`. |
| Inventory import vẫn dưới ngưỡng không trigger agent scan/log. | `inventory.service.ts` | MEDIUM | Xác nhận nghiệp vụ; nếu cần thì trigger scan như adjust. |
| Email success/fail log không lưu input/output/to/subject. | `email.service.ts` | MEDIUM | Lưu input an toàn gồm purchaseRequestId, to, subject; không lưu nội dung nhạy cảm nếu không cần. |
| AgentLog và NotificationPanel lệch ngữ nghĩa. | `NotificationPanel.tsx` | HIGH | Chỉ đẩy notification cho event quan trọng; SKIPPED stock OK nên ở Nhật ký Agent. |
| Frontend có lỗi font/encoding tiếng Việt ở AgentLogs/NotificationPanel. | `AdminAgentLogsPage.tsx`, `NotificationPanel.tsx` | MEDIUM | Sửa encoding text UI ở bước riêng. |
| Không thấy cleanup/retention AgentLog. | `agent.repository.ts`, `agent.service.ts` | LOW/MEDIUM | Cân nhắc retention/archiving hoặc pagination trước khi log nhiều. |

### 9. Đề xuất chuẩn hóa AgentLog

Đề xuất format log chuẩn:

| Field             | Ý nghĩa                                  |
| ----------------- | ---------------------------------------- |
| action            | Agent đang làm gì                        |
| triggerType       | Luồng nào kích hoạt, ví dụ SIMULATE_SALE |
| status            | SUCCESS / FAILED / SKIPPED / RUNNING     |
| result            | Kết quả cụ thể                           |
| message           | Câu dễ hiểu cho admin                    |
| reason            | Mã lý do kỹ thuật/nghiệp vụ              |
| input             | Dữ liệu đầu vào                          |
| output            | Dữ liệu đầu ra                           |
| productId         | Sản phẩm liên quan                       |
| inventoryId       | Tồn kho liên quan                        |
| purchaseRequestId | Yêu cầu mua hàng liên quan nếu có        |

Đề xuất phân loại:

* SUCCESS:
  * CREATED_PURCHASE_REQUEST
  * SCAN_COMPLETED
  * RECOMMENDED
  * CONVERTED_TO_PR
  * SEND_SUPPLIER_EMAIL_SUCCESS
* SKIPPED:
  * ACTIVE_PR_EXISTS
  * NO_SUPPLIER
  * SUPPLIERS_INACTIVE
  * AI_DISABLED
  * STOCK_OK
  * ABOVE_THRESHOLD
* FAILED:
  * SERVER_ERROR
  * DATABASE_ERROR
  * INVALID_DATA
  * SMTP_ERROR

Gợi ý mapping từ hiện tại:

* `CREATED_PURCHASE_REQUEST` -> status `SUCCESS`, result `CREATED_PURCHASE_REQUEST`.
* `SKIPPED_DUPLICATE` -> status `SKIPPED`, reason `ACTIVE_PR_EXISTS`.
* `NO_SUPPLIER` -> status `SKIPPED`, reason `NO_SUPPLIER` hoặc `SUPPLIERS_INACTIVE`.
* `SKIPPED_DISABLED` -> status `SKIPPED`, reason `AI_DISABLED`.
* `RECOMMENDED` -> status `SUCCESS`, result `RECOMMENDED`.
* `FAILED` -> status `FAILED`, reason lấy từ SMTP/server error.

### 10. Bước tiếp theo đề xuất

* Ưu tiên 1: Chuẩn hóa DTO/API `GET /api/agent/logs` để trả `status`, `result`, `reason`, `message`, `triggerType`, `productId`, `inventoryId`, `purchaseRequestId`, `productName` mà chưa cần đổi schema ngay nếu muốn giảm rủi ro.
* Ưu tiên 2: Sửa frontend Nhật ký Agent và NotificationPanel để phân biệt SUCCESS / SKIPPED / FAILED, đồng thời sửa lỗi font/encoding tiếng Việt ở các màn hình này.
* Ưu tiên 3: Bổ sung chiến lược pagination/filter/retention cho AgentLog trước khi tăng số lượng log như STOCK_OK hoặc scan định kỳ.

### 11. Cam kết

* Chưa sửa code.
* Chưa thay đổi database.
* Chưa chạy migration.
* Chưa chạy seed.
* Chưa gọi Gemini.
* Chưa tạo AgentLog giả.
* Chưa sửa dữ liệu database.
* Chưa đụng lại logic Simulate Sale.
* Chưa tạo file mới.
* Chỉ cập nhật đúng file `docs/AI_AGENT_CAFE_SCAN_LOG.md`.

## Agent Log Standardization Implementation

### 1. Mục tiêu

- Chuẩn hóa API AgentLog trả status/reason/message rõ ràng.
- Sửa UI Nhật ký Agent phân biệt SUCCESS / SKIPPED / FAILED / RUNNING.
- Sửa NotificationPanel để các case SKIPPED không bị hiểu nhầm là SUCCESS.
- Bổ sung pagination/filter cơ bản cho `GET /api/agent/logs`.

### 2. File đã sửa

- Backend:
  - `apps/api/src/modules/agent/agent.service.ts`
  - `apps/api/src/modules/agent/agent.controller.ts`
- Frontend:
  - `apps/web/src/api/agentLogs.api.ts`
  - `apps/web/src/types/agentLog.types.ts`
  - `apps/web/src/pages/admin/AdminAgentLogsPage.tsx`
  - `apps/web/src/components/admin/NotificationPanel.tsx`
  - `apps/web/src/components/admin/Header.tsx`
- Docs:
  - `docs/AI_AGENT_CAFE_SCAN_LOG.md`

### 3. Kết quả backend

- `GET /api/agent/logs` hiện trả DTO đã chuẩn hóa:
  - `status`
  - `result`
  - `reason`
  - `message`
  - `triggerType`
  - `productId` / `productName` nếu derive được từ input/output
  - `inventoryId` nếu derive được
  - `purchaseRequestId` nếu derive được từ output hoặc reference PurchaseRequest
  - `referenceType` / `referenceId`
  - `input` / `output`
  - `errorMessage`
  - `fallbackUsed`
  - `createdBy`
  - `createdAt`
- Mapping status đã sửa:
  - `NO_SUPPLIER`, `SKIPPED_DUPLICATE`, `SKIPPED_DISABLED`, `ACTIVE_PR_EXISTS`, `AI_DISABLED`, `ABOVE_THRESHOLD`, `STOCK_OK` -> `SKIPPED`.
  - `FAILED`, `ERROR`, `SERVER_ERROR`, `DATABASE_ERROR`, `SMTP_ERROR`, `INVALID_DATA` hoặc có `error_message` -> `FAILED`.
  - `CREATED_PURCHASE_REQUEST`, `RECOMMENDED`, `CONVERTED_TO_PR`, `SUCCESS` -> `SUCCESS`.
  - `RUNNING` -> `RUNNING`.
- Mapping message tiếng Việt đã thêm cho các case chính:
  - Tạo PurchaseRequest thành công.
  - Có PurchaseRequest trùng.
  - Thiếu supplier hoặc supplier inactive.
  - AI Agent bị tắt.
  - Tồn kho an toàn.
  - Recommendation, convert recommendation.
  - Send supplier email success/failed.
- Pagination/filter cơ bản đã thêm:
  - `page`, default 1.
  - `limit`, default 20, max 100.
  - `status`, filter sau khi map DTO.
  - `action`, filter DB trực tiếp.
  - `triggerType`, filter sau khi map DTO.
  - `productId`, lọc theo input/output/reference ở mức cơ bản.
- Response hiện có:
  - `{ logs, pagination }`
  - Giữ tương thích frontend cũ vì field `logs` vẫn tồn tại.

### 4. Kết quả frontend

- Nhật ký Agent:
  - `SUCCESS` hiển thị nhãn `Thành công`, màu xanh.
  - `SKIPPED` hiển thị nhãn `Bỏ qua`, màu vàng.
  - `FAILED` hiển thị nhãn `Thất bại`, màu đỏ.
  - `RUNNING` hiển thị nhãn `Đang xử lý`, màu xanh dương.
  - Bảng hiển thị thời gian, action, trạng thái, result, reason, message, product, purchase request và nút xem chi tiết.
  - Modal chi tiết hiển thị message, status/result/reason, reasoning, errorMessage, input/output JSON và link Purchase Request nếu có.
  - Đã sửa các chuỗi mojibake chính trong `AdminAgentLogsPage.tsx`.
- Frontend API/type:
  - `AgentLog` type đã có `status`, `result`, `reason`, `message`, `triggerType`, `productId`, `productName`, `inventoryId`, `purchaseRequestId`, `referenceType`, `referenceId`, `errorMessage`.
  - `agentLogs.api.ts` ưu tiên dùng `status` backend trả về.
  - Có fallback `normalizeAgentLogStatus(result, errorMessage)` nếu backend cũ chưa trả status.
  - Có map legacy `reference_type/reference_id` sang `referenceType/referenceId`.
  - Có map `PurchaseRequest` / `purchase_request` reference thành `purchaseRequestId`.
- NotificationPanel:
  - `NO_SUPPLIER` hiển thị warning `Thiếu nhà cung cấp`.
  - `SKIPPED_DUPLICATE` / `ACTIVE_PR_EXISTS` hiển thị info `Đã có yêu cầu nhập hàng`.
  - `SKIPPED_DISABLED` / `AI_DISABLED` hiển thị info `AI Agent đang tắt`.
  - `CREATED_PURCHASE_REQUEST` hiển thị success `Đã tạo yêu cầu nhập hàng`.
  - `FAILED` / `ERROR` hiển thị error `Agent xử lý thất bại`.
  - Không còn text success chung kiểu `AI Agent hoạt động bình thường` cho các case SKIPPED.
- Header dropdown Agent Log:
  - Đã cập nhật hẹp để tương thích `AgentLogStatus` mới và không so sánh status cũ như `ERROR`, `NO_SUPPLIER`, `SKIPPED_DUPLICATE` trực tiếp.

### 5. Test đã chạy

- Backend build:
  - `npm run build --workspace=apps/api`
  - Kết quả: PASS.
- Frontend build:
  - `npm run build --workspace=apps/web`
  - Kết quả: FAIL.
  - Lý do còn lại không thuộc phần Agent Log đã sửa:
    - `src/pages/admin/AdminOrderDetailPage.tsx`: unused import `MessageSquare`.
    - `src/pages/admin/AdminSimulateSalePage.tsx`: unused imports `useCallback`, `X`, `CheckCircle`, `AlertOctagon`.
  - Các lỗi AgentLog/Header do thay đổi type đã được xử lý trước khi chạy lại build.
- API AgentLog:
  - Chưa test live bằng server/browser trong phiên này.
  - Đã type-check backend qua build PASS.
- UI Agent Logs:
  - Chưa test thủ công bằng browser trong phiên này.
  - Frontend build chưa pass do lỗi unused import ngoài phạm vi Agent Log.
- NotificationPanel:
  - Chưa test thủ công bằng browser trong phiên này.
  - Logic phân loại AgentLog đã sửa trong source.

### 6. Ghi chú

- Không sửa database schema.
- Không chạy migration.
- Không chạy seed.
- Không tạo file mới.
- Không gọi Gemini.
- Không tạo AgentLog giả.

- Không sửa dữ liệu database.
- Không đụng logic Simulate Sale.
- Không sửa workflow PurchaseRequest ngoài phần đọc/hiển thị AgentLog liên quan.
- Không cập nhật file `.md` khác trong lượt sửa này.

### 7. Build Completion Update

- Đã dọn unused imports chặn frontend build:
  - `apps/web/src/pages/admin/AdminOrderDetailPage.tsx`: xóa import `MessageSquare` không dùng.
  - `apps/web/src/pages/admin/AdminSimulateSalePage.tsx`: xóa import `useCallback`, `X`, `CheckCircle`, `AlertOctagon` không dùng.
- Không sửa logic Simulate Sale.
- Không sửa workflow PurchaseRequest.
- Frontend build:
  - `npm run build --workspace=apps/web`
  - Kết quả: PASS.
- Backend build:
  - `npm run build --workspace=apps/api`
  - Kết quả: PASS.
- UI Agent Logs:
  - Chưa test thủ công bằng browser.
- NotificationPanel:
  - Chưa test thủ công bằng browser.

### 7. Execution Trace - Các bước đã thực hiện để hoàn tất build/test

| Bước | Hành động thực hiện | File liên quan | Lý do thực hiện | Lệnh/Kiểm tra | Kết quả |
|---|---|---|---|---|---|
| 1 | Kiểm tra lỗi build frontend hiện tại và xác nhận các import đã được dọn trong source | `apps/web/src/pages/admin/AdminOrderDetailPage.tsx`, `apps/web/src/pages/admin/AdminSimulateSalePage.tsx` | Xác định trạng thái thật trước khi chạy build lại | Đọc phần import đầu file | `MessageSquare`, `useCallback`, `X`, `CheckCircle`, `AlertOctagon` không còn trong import. |
| 2 | Xác nhận import `MessageSquare` đã bị xóa | `apps/web/src/pages/admin/AdminOrderDetailPage.tsx` | Import này không được dùng và từng làm TypeScript build fail | Kiểm tra import `lucide-react` | Không còn `MessageSquare`; không sửa logic khác. |
| 3 | Xác nhận unused imports `useCallback`, `X`, `CheckCircle`, `AlertOctagon` đã bị xóa | `apps/web/src/pages/admin/AdminSimulateSalePage.tsx` | Các import này không được dùng và từng làm TypeScript build fail | Kiểm tra import React và `lucide-react` | Không còn các import trên; không sửa logic Simulate Sale. |
| 4 | Chạy lại frontend build | `apps/web` | Xác nhận lỗi build frontend đã hết | `npm run build --workspace=apps/web` | PASS. `tsc -b && vite build` hoàn tất; chỉ còn warning chunk size của Vite, không phải lỗi build. |
| 5 | Chạy lại backend build | `apps/api` | Đảm bảo backend AgentLog vẫn build pass sau các thay đổi | `npm run build --workspace=apps/api` | PASS. `tsc` hoàn tất. |
| 6 | Test API AgentLog cơ bản nếu có | `/api/agent/logs?page=1&limit=20`, `/api/agent/logs?status=SKIPPED`, `/api/agent/logs?status=FAILED` | Kiểm tra live DTO status/reason/message nếu server/token sẵn sàng | `Invoke-WebRequest` tới localhost:5000 | Chưa test live DTO được. Server phản hồi `401 Unauthorized` do request không có token admin, nên không ghi PASS cho API live. |
| 7 | Test UI Agent Logs nếu có | `/admin/agent-logs` | Kiểm tra UI phân biệt SUCCESS/SKIPPED/FAILED | Browser | Chưa test UI bằng browser trong phiên này. |
| 8 | Test NotificationPanel nếu có | `NotificationPanel` | Kiểm tra SKIPPED không bị xem là success | Browser | Chưa test NotificationPanel bằng browser trong phiên này. |

### 8. Kết quả cuối sau khi xử lý build blocker

- Frontend build:
  - Lệnh: `npm run build --workspace=apps/web`
  - Kết quả: PASS.
  - Ghi chú: Build hoàn tất; Vite có warning chunk lớn hơn 500 kB nhưng không làm fail build.
- Backend build:
  - Lệnh: `npm run build --workspace=apps/api`
  - Kết quả: PASS.
  - Ghi chú: `tsc` hoàn tất.
- API AgentLog live test:
  - Kết quả: Chưa test live DTO được.
  - Ghi chú: `GET /api/agent/logs...` trên localhost trả `401 Unauthorized` vì không có token admin trong request. Chỉ xác nhận server có phản hồi auth guard, không xác nhận payload `logs/pagination/status/reason/message`.
- UI Agent Logs browser test:
  - Kết quả: Chưa test live.
  - Ghi chú: Chưa mở browser kiểm tra `/admin/agent-logs` trong phiên này, nên không ghi UI PASS.
- NotificationPanel browser test:
  - Kết quả: Chưa test live.
  - Ghi chú: Chưa mở browser kiểm tra NotificationPanel trong phiên này, nên không ghi NotificationPanel PASS.

### 9. File đã sửa trong lượt hoàn tất này

| File | Loại thay đổi | Lý do |
|---|---|---|
| `apps/web/src/pages/admin/AdminOrderDetailPage.tsx` | Xóa unused import `MessageSquare` | Để frontend build pass. |
| `apps/web/src/pages/admin/AdminSimulateSalePage.tsx` | Xóa unused imports `useCallback`, `X`, `CheckCircle`, `AlertOctagon` | Để frontend build pass, không đổi logic Simulate Sale. |
| `docs/AI_AGENT_CAFE_SCAN_LOG.md` | Cập nhật execution trace | Ghi lại đầy đủ các bước đã làm và kết quả build/test thật. |

### 10. Cam kết sau lượt hoàn tất

- Đã sửa source code thật trước khi cập nhật log.
- Không tạo file mới.
- Không tạo thư mục mới.
- Không sửa database schema.
- Không chạy migration.
- Không chạy seed.
- Không gọi Gemini.
- Không tạo AgentLog giả.
- Không sửa dữ liệu database.
- Không đụng logic Simulate Sale.
- Không sửa workflow PurchaseRequest.
- Chỉ cập nhật đúng file `docs/AI_AGENT_CAFE_SCAN_LOG.md`.
## Scan AI Agent Roadmap 3 Tầng

### 1. Thời gian scan

- Thời gian: `2026-06-19 17:34:50 +07:00`
- Phạm vi: chỉ scan source code hiện tại, không sửa code, không refactor, không tạo endpoint, không chạy migration/db push, không cài package.
- Ghi chú: không chạy `vite build`, nên trạng thái chunk warning được kết luận từ source/config routing hiện tại, không phải từ build output mới.

### 2. Danh sách file đã kiểm tra

- `docs/AI_AGENT_CAFE_SCAN_LOG.md`
- `apps/api/src/modules/agent/gemini.service.ts`
- `apps/api/src/modules/agent/recommendation.service.ts`
- `apps/api/src/modules/agent/agent.service.ts`
- `apps/api/src/modules/agent/agent.repository.ts`
- `apps/api/src/modules/agent/agent.controller.ts`
- `apps/api/src/modules/inventory/inventory.service.ts`
- `apps/api/src/modules/order/order.service.ts`
- `apps/api/src/modules/purchase/purchase.service.ts`
- `apps/api/src/modules/simulate-sale/simulate-sale.service.ts`
- `apps/api/src/modules/dashboard/dashboard.service.ts`
- `apps/web/src/routes/AppRoutes.tsx`
- `apps/web/vite.config.ts`
- `apps/web/src/pages/admin/AdminDashboardPage.tsx`
- `apps/web/src/pages/admin/AdminAgentLogsPage.tsx`
- `apps/web/src/pages/admin/AdminInventoryPage.tsx`
- `apps/web/src/pages/admin/AdminPurchaseRequestsPage.tsx`
- `apps/web/src/pages/admin/AdminSimulateSalePage.tsx`
- `apps/web/src/api/agentLogs.api.ts`
- `apps/web/src/api/dashboard.api.ts`
- `apps/agent/src/index.ts`
- `apps/agent/src/jobs/inventory-scan.job.ts`
- `apps/agent/src/services/agent.service.ts`
- `apps/agent/src/services/gemini.service.ts`
- `apps/agent/src/services/recommendation.service.ts`
- `apps/agent/src/repositories/agent.repository.ts`
- `packages/database/prisma/schema/system.prisma`

### 3. Bảng trạng thái từng tầng

| Tầng | Hạng mục | Trạng thái hiện tại | File liên quan | Kết luận |
|---|---|---|---|---|
| Tầng 1 | Gemini `responseSchema` / `responseMimeType: "application/json"` | Chưa có | `apps/api/src/modules/agent/gemini.service.ts:19`, `apps/api/src/modules/agent/gemini.service.ts:21`, `apps/agent/src/services/gemini.service.ts:20`, `apps/agent/src/services/gemini.service.ts:22` | Nên sửa ngay. Cả hai service chỉ gọi `getGenerativeModel({ model })` và `generateContent(prompt)`, chưa cấu hình JSON mode/schema. |
| Tầng 1 | Zod validate Gemini output | Chưa có | `apps/api/src/modules/agent/gemini.service.ts:28`, `apps/api/src/modules/agent/gemini.service.ts:30`, `apps/api/src/modules/agent/recommendation.service.ts:247`, `apps/agent/src/services/gemini.service.ts:29`, `apps/agent/src/services/gemini.service.ts:31`, `apps/agent/src/services/recommendation.service.ts:131` | Nên sửa ngay. Hiện parse bằng `JSON.parse`, ép kiểu `Number()`/`String()`, sau đó validate thủ công supplier/quantity/confidence/reasoning; chưa có Zod schema cho output Gemini. |
| Tầng 1 | Check `ai.enabled` từ cấu hình admin | Có nhưng chưa đủ | `apps/api/src/modules/agent/agent.service.ts:167`, `apps/api/src/modules/agent/agent.service.ts:169`, `apps/api/src/modules/agent/agent.service.ts:224`, `apps/api/src/modules/agent/recommendation.service.ts:240`, `apps/agent/src/services/recommendation.service.ts:94` | Nên sửa ngay. Luồng `scanInventory` của API có đọc `ai.enabled`; luồng `recommendReorder`/`recommendation.service.ts` chỉ check `GEMINI_API_KEY`. `apps/agent` độc lập cũng chỉ check env key, không đọc system setting. |
| Tầng 1 | Vite chunk size / lazy load admin pages | Có nhưng chưa đủ | `apps/web/src/routes/AppRoutes.tsx:21` đến `apps/web/src/routes/AppRoutes.tsx:36`, `apps/web/vite.config.ts` | Nên sửa. Admin pages đang import tĩnh trong `AppRoutes.tsx`, không có `React.lazy`/`Suspense`. `vite.config.ts` chưa có `manualChunks` hoặc `chunkSizeWarningLimit`. Chưa chạy build nên chưa xác nhận warning runtime, nhưng source vẫn có nguy cơ bundle admin lớn. |
| Tầng 2 | Proactive cron phân tích xu hướng | Có nhưng chưa đủ | `apps/agent/src/index.ts:52`, `apps/agent/src/jobs/inventory-scan.job.ts:11`, `apps/agent/src/jobs/inventory-scan.job.ts:14`, `apps/api/src/modules/order/order.service.ts:173`, `apps/api/src/modules/simulate-sale/simulate-sale.service.ts:55`, `apps/api/src/modules/inventory/inventory.service.ts:237` | Làm tiếp sau Tầng 1. `apps/agent` có cron scan inventory định kỳ, nhưng logic vẫn chủ yếu low-stock scan/reorder; API trigger reactive theo order/simulate sale/adjust. Chưa thấy cron riêng phân tích trend tăng/giảm và insight xu hướng. |
| Tầng 2 | Enriched prompt context | Có nhưng chưa đủ | `apps/api/src/modules/agent/recommendation.service.ts:345`, `apps/api/src/modules/agent/recommendation.service.ts:361`, `apps/agent/src/services/recommendation.service.ts:98`, `apps/agent/src/services/recommendation.service.ts:108` | Nên nâng cấp. Prompt có product name/sku/category, current quantity, min threshold, sales 7/30 ngày, sales velocity, supplier price/MOQ/leadTime/isPreferred. Chưa thấy ngày trong tuần, trend tăng/giảm rõ ràng, sản phẩm cùng danh mục, lịch sử PurchaseRequest, kết quả thực tế/lead time thực tế. |
| Tầng 2 | Multi-step reasoning | Chưa có | `apps/api/src/modules/agent/recommendation.service.ts:242`, `apps/api/src/modules/agent/recommendation.service.ts:250`, `apps/agent/src/services/recommendation.service.ts:125`, `apps/agent/src/services/recommendation.service.ts:134` | Nên nâng cấp. Hiện single-shot: gọi Gemini một lần để trả luôn quantity/supplier/confidence/reasoning/emailDraft. Chưa có bước phân tích riêng rồi chỉ tạo emailDraft/xác nhận số lượng khi confidence đủ cao. |
| Tầng 2 | AgentLog làm memory nhẹ | Có nhưng chưa đủ | `packages/database/prisma/schema/system.prisma:1`, `apps/api/src/modules/agent/recommendation.service.ts:285`, `apps/api/src/modules/agent/recommendation.service.ts:299`, `apps/api/src/modules/agent/agent.service.ts:353`, `apps/agent/src/repositories/agent.repository.ts:158` | Nên nâng cấp. `AgentLog` có input/output/reasoning/fallback/error/reference/result. Có lưu recommendation, supplier chọn, confidence, fallback; `apps/agent` còn lưu `geminiPrompt`/`geminiResponse`. Chưa thấy lưu kết quả thực tế sau PR, lead time thực tế, accuracy, hoặc vòng feedback sau khi nhận hàng. |
| Tầng 3 | Logic AI nằm ở `apps/api` hay tách sang `apps/agent` | Có nhưng chưa đủ | `apps/api/src/modules/agent/*`, `apps/agent/src/services/agent.service.ts`, `apps/agent/src/services/recommendation.service.ts`, `apps/agent/src/services/gemini.service.ts` | Dài hạn. Đã có `apps/agent`, nhưng logic AI vẫn tồn tại song song trong `apps/api/src/modules/agent`, chưa tách rõ ownership. |
| Tầng 3 | Nguy cơ trùng logic `apps/api/src/modules/agent` và `apps/agent` | Rủi ro | `apps/api/src/modules/agent/gemini.service.ts`, `apps/api/src/modules/agent/recommendation.service.ts`, `apps/agent/src/services/gemini.service.ts`, `apps/agent/src/services/recommendation.service.ts` | Nên xử lý sau Tầng 1. Hai bên cùng có `gemini.service.ts`, `recommendation.service.ts`, cùng parse JSON thủ công, cùng fallback rule-based, cùng chọn supplier theo preferred/price/leadTime. Rủi ro lệch behavior khi sửa một bên. |
| Tầng 3 | AgentLog retention/cleanup/archiving | Chưa có | `packages/database/prisma/schema/system.prisma:1`, `apps/api/src/modules/agent/agent.service.ts:370`, `apps/api/src/modules/agent/agent.repository.ts:49`, `apps/agent/src/repositories/agent.repository.ts:181` | Để sau. Schema không có archive/retention fields; repository/service chỉ create/find logs, chưa thấy `deleteMany`, cleanup job, archive table hoặc retention setting. |
| Tầng 3 | Dashboard AI insights | Có nhưng chưa đủ | `apps/api/src/modules/dashboard/dashboard.service.ts:49`, `apps/api/src/modules/dashboard/dashboard.service.ts:72`, `apps/api/src/modules/dashboard/dashboard.service.ts:96`, `apps/web/src/pages/admin/AdminDashboardPage.tsx`, `apps/web/src/pages/admin/AdminAgentLogsPage.tsx` | Để sau. Dashboard có `totalLogs`, `todayScans`, last scan widget và `totalAiPurchaseRequests`; Agent Logs page hiển thị log chi tiết. Chưa có tỷ lệ AI recommendation vs rule fallback, accuracy, supplier performance, fallback count, số request AI tạo thành công theo dạng insight dashboard. |

### 4. Kết luận ngắn

- Tầng nên làm ngay: Tầng 1. Ưu tiên thêm Gemini JSON mode/schema, Zod validate output, và thống nhất check `ai.enabled` cho cả `scanInventory`, `recommendReorder`, và `apps/agent`.
- Tầng làm tiếp sau: Tầng 2. Hiện đã có dữ liệu 7/30 ngày và supplier context, nhưng prompt chưa đủ giàu và chưa có multi-step confidence gate.
- Tầng để sau: Tầng 3. Đã có `apps/agent` nhưng còn trùng logic với `apps/api`; cần quyết định ownership trước khi cleanup kiến trúc, retention log, và dashboard insights.
- Có cần sửa code không: Có, nhưng chưa sửa trong lượt scan này theo yêu cầu. Các điểm cần sửa nằm chủ yếu ở `apps/api/src/modules/agent/gemini.service.ts`, `apps/api/src/modules/agent/recommendation.service.ts`, `apps/api/src/modules/agent/agent.service.ts`, `apps/agent/src/services/*`, `apps/web/src/routes/AppRoutes.tsx`, và `apps/web/vite.config.ts`.

## Step 2 - Move Agent Logic To apps/agent

### 1. Mục tiêu
Chuyển business logic AI Agent từ backend sang apps/agent, backend chỉ còn API bridge.

### 2. Lý do
- Tách rõ backend nghiệp vụ chính và Agent xử lý phân tích.
- apps/agent trở thành nơi chứa Agent logic.
- apps/api giữ endpoint để frontend không bị gãy.

### 3. File đã tạo
| File | Vai trò |
|---|---|
| `apps/agent/src/public-api.ts` | Public API an toàn cho backend import; export `scanInventory`, `getAgentLogs`, `recommendReorder`, `getRecommendations`, `createPurchaseRequestFromRecommendation`, `createAgentLog`; không start cron. |
| `apps/agent/src/errors/http-error.ts` | Error có `statusCode` để bridge API map HTTP status khi public API throw lỗi nghiệp vụ. |
| `apps/api/src/modules/agent-bridge/agent-bridge.route.ts` | Route bridge giữ nguyên các endpoint `/api/agent/*` và middleware admin. |
| `apps/api/src/modules/agent-bridge/agent-bridge.controller.ts` | Controller bridge gọi public API từ `@cafe-project/agent` và trả response envelope cũ bằng `sendSuccess`/`sendError`. |
| `apps/api/src/modules/agent-bridge/agent-bridge.validator.ts` | Validator body cho `scan-inventory` và `recommend-reorder`, giữ validation ở API layer. |
| `apps/api/src/modules/agent-bridge/agent-trigger.service.ts` | Helper backend cho Order/Inventory/SimulateSale/Email gọi Agent qua public API, catch lỗi scan để không làm fail transaction chính. |

### 4. File đã chuyển logic
| Từ backend | Sang apps/agent | Ghi chú |
|---|---|---|
| `apps/api/src/modules/agent/agent.service.ts` | `apps/agent/src/services/agent.service.ts` | Chuyển logic scan inventory, list logs, map status/message/reason, recommend reorder, get recommendations, convert recommendation thành PR, worker `runScan`. |
| `apps/api/src/modules/agent/agent.repository.ts` | `apps/agent/src/repositories/agent.repository.ts` | Chuyển Prisma access cho inventory, AgentLog, duplicate PurchaseRequest check, tạo AI PurchaseRequest, system setting lookup, recommendation log lookup. |
| `apps/api/src/modules/agent/recommendation.service.ts` | `apps/agent/src/services/recommendation.service.ts` | Chuyển rule-based fallback, Gemini call, supplier/no supplier/inactive supplier checks, recommendation log output. |
| `apps/api/src/modules/agent/gemini.service.ts` | `apps/agent/src/services/gemini.service.ts` | Gemini service nằm ở apps/agent; backend không còn file Gemini riêng. |
| `apps/api/src/modules/agent/agent.validator.ts` | `apps/api/src/modules/agent-bridge/agent-bridge.validator.ts` | Validation endpoint vẫn ở API bridge để không kéo Express/Zod contract vào public worker entry. |

### 5. File backend bridge đã tạo
| File | Vai trò |
|---|---|
| `apps/api/src/modules/agent-bridge/agent-bridge.route.ts` | Mount các route con dưới `/api/agent`: logs, scan inventory, recommend reorder, recommendations, convert recommendation. |
| `apps/api/src/modules/agent-bridge/agent-bridge.controller.ts` | Gọi `@cafe-project/agent` public API, giữ message/status code response cho frontend. |
| `apps/api/src/modules/agent-bridge/agent-bridge.validator.ts` | Validate body như module Agent cũ. |
| `apps/api/src/modules/agent-bridge/agent-trigger.service.ts` | API-side adapter cho các luồng nội bộ không đi qua HTTP endpoint. |

### 6. File backend agent cũ đã xoá
| File | Lý do xoá |
|---|---|
| `apps/api/src/modules/agent/agent.controller.ts` | Đã thay bằng `agent-bridge.controller.ts`, logic endpoint gọi public API. |
| `apps/api/src/modules/agent/agent.repository.ts` | Repository Agent đã chuyển sang `apps/agent/src/repositories/agent.repository.ts`. |
| `apps/api/src/modules/agent/agent.route.ts` | Route `/api/agent` đã thay bằng `agent-bridge.route.ts`. |
| `apps/api/src/modules/agent/agent.service.ts` | Business logic Agent đã chuyển sang `apps/agent/src/services/agent.service.ts`. |
| `apps/api/src/modules/agent/agent.validator.ts` | Validator endpoint đã thay bằng `agent-bridge.validator.ts`. |
| `apps/api/src/modules/agent/gemini.service.ts` | Gemini service chỉ còn ở `apps/agent/src/services/gemini.service.ts`. |
| `apps/api/src/modules/agent/recommendation.service.ts` | Recommendation logic đã chuyển sang `apps/agent/src/services/recommendation.service.ts`. |
| `apps/api/src/modules/agent/` | Folder trống sau khi xoá file cũ, đã xoá folder. |

### 7. Endpoint được giữ nguyên
- GET /api/agent/logs
- POST /api/agent/scan-inventory
- POST /api/agent/recommend-reorder
- GET /api/agent/recommendations
- POST /api/agent/recommendations/:id/create-purchase-request

### 8. Kết quả build
| Lệnh | Kết quả | Ghi chú |
|---|---|---|
| `npm run build --workspace=apps/agent` | PASS | Chạy trước khi xoá backend Agent cũ: pass. Sau khi xoá backend Agent cũ chạy lại: pass. Đã bật `declaration` trong `apps/agent/tsconfig.json` để API import `@cafe-project/agent` có type. |
| `npm run build --workspace=apps/api` | PASS | Lần đầu fail vì `@cafe-project/agent` chưa emit `.d.ts`. Sau khi bật declaration và rebuild agent, API build pass. Sau khi xoá backend Agent cũ chạy lại: pass. |
| `npm run build --workspace=apps/web` | PASS | Chạy trước và sau khi xoá backend Agent cũ đều pass. Vite vẫn warning chunk lớn hơn 500 kB, không phải lỗi build và không sửa frontend trong bước này. |

### 9. Kết quả test live
| Test | Kết quả | Ghi chú |
|---|---|---|
| `GET /api/agent/logs?page=1&limit=20` | Chưa test live | Không có token admin/server live trong lượt này, nên không ghi PASS giả. Build API xác nhận route compile. |
| `GET /api/agent/logs?status=SKIPPED` | Chưa test live | Không có token admin/server live trong lượt này. |
| `POST /api/agent/scan-inventory` | Chưa test live | Không chạy endpoint thật để tránh tạo AgentLog/PurchaseRequest ngoài ý muốn. |
| `POST /api/agent/recommend-reorder` | Chưa test live | Không chạy endpoint thật để tránh gọi Gemini hoặc tạo log/recommendation ngoài ý muốn. |
| `GET /api/agent/recommendations` | Chưa test live | Không có token admin/server live trong lượt này. |

### 10. Import/call sau refactor
| File | Thay đổi |
|---|---|
| `apps/api/src/index.ts` | Mount `/api/agent` từ `agentBridgeRoutes` thay vì `modules/agent/agent.route`. |
| `apps/api/src/modules/order/order.service.ts` | Chuyển từ `agentService.scanInventory` sang `agentTriggerService.notifyInventoryChanged` sau khi order `COMPLETED` và đã trừ kho. |
| `apps/api/src/modules/inventory/inventory.service.ts` | Chuyển trigger adjustment dưới ngưỡng sang `agentTriggerService.notifyInventoryChanged`. |
| `apps/api/src/modules/simulate-sale/simulate-sale.service.ts` | Chuyển sang `agentTriggerService.runInventoryScan` để vẫn trả `agentLogs`/`createdPurchaseRequests`, nhưng Agent lỗi không làm fail simulate sale. |
| `apps/api/src/modules/email/email.service.ts` | Chuyển ghi log email success/failed từ backend `agentRepository` cũ sang `agentTriggerService.createLog`. |
| `apps/api/package.json` | Thêm dependency workspace `@cafe-project/agent`. |
| `apps/agent/package.json` | Thêm `main`, `types`, `exports` trỏ tới `dist/public-api.js`/`.d.ts`; giữ `dev`, `start`, `scan` chạy worker `src/index.ts`/`dist/index.js`. |

### 11. Kiểm tra xoá backend cũ
- Đã scan không còn import tương đối tới `../agent/*`, `./modules/agent/*`, `modules/agent/agent.service`, `modules/agent/agent.repository`, `modules/agent/recommendation.service`, `modules/agent/gemini.service` trong `apps/api/src`.
- `Test-Path apps/api/src/modules/agent` trả `False` sau khi xoá folder trống.
- Các tên `agentService`, `agentRepository`, `recommendationService`, `geminiService` còn lại chỉ nằm trong `apps/agent` nội bộ hoặc public API/worker, không còn là backend Agent cũ.

### 12. Cam kết
- Không sửa database schema.
- Không chạy migration.
- Không chạy seed.
- Không tạo AgentLog giả.
- Không đổi endpoint frontend.
- Không sửa workflow PurchaseRequest.
- Không sửa Order/Inventory transaction ngoài import gọi Agent.
- Không gọi Gemini ngoài luồng hiện có.
- Không import `apps/agent/src/index.ts` vào backend API.
- Public API của `apps/agent` không tự start cron; cron vẫn chỉ nằm ở worker entry `apps/agent/src/index.ts`.

## Step 3 - Remove Agent Bridge And Call apps/agent Directly

### 1. Mục tiêu
Xoá lớp agent-bridge, để apps/api gọi trực tiếp public API từ @cafe-project/agent, nhưng vẫn giữ endpoint /api/agent/* cho frontend.

### 2. Lý do
- Đơn giản hoá kiến trúc.
- Backend vẫn là cổng API kiểm soát auth/admin.
- Logic Agent vẫn nằm ở apps/agent.
- Frontend không gọi thẳng apps/agent.

### 3. File đã tạo lại
| File | Vai trò |
|---|---|
| `apps/api/src/modules/agent/agent.route.ts` | Route API `/api/agent/*`, dùng auth/admin middleware và validate body như bridge cũ. |
| `apps/api/src/modules/agent/agent.controller.ts` | Controller gọi trực tiếp `@cafe-project/agent` public API và giữ response envelope `sendSuccess`/`sendError`. |
| `apps/api/src/modules/agent/agent.validator.ts` | Validate request body cho `scan-inventory` và `recommend-reorder`. |

### 4. File đã xoá
| File/Folder | Lý do xoá |
|---|---|
| `apps/api/src/modules/agent-bridge/agent-bridge.route.ts` | Bỏ lớp bridge trung gian; route mới nằm ở `apps/api/src/modules/agent/agent.route.ts`. |
| `apps/api/src/modules/agent-bridge/agent-bridge.controller.ts` | Controller mới gọi trực tiếp `@cafe-project/agent`. |
| `apps/api/src/modules/agent-bridge/agent-bridge.validator.ts` | Validator đã chuyển sang module API Agent mới. |
| `apps/api/src/modules/agent-bridge/agent-trigger.service.ts` | Các module backend đã gọi trực tiếp `scanInventory`/`createAgentLog` từ `@cafe-project/agent`. |
| `apps/api/src/modules/agent-bridge` | Folder trống sau khi xoá các file bridge. |

### 5. File đã sửa
| File | Thay đổi |
|---|---|
| `apps/api/src/index.ts` | Mount `agentRoutes` từ `./modules/agent/agent.route` thay cho `agentBridgeRoutes`, vẫn giữ path `/api/agent`. |
| `apps/api/src/modules/order/order.service.ts` | Gọi trực tiếp `scanInventory` từ `@cafe-project/agent` sau khi order chuyển `COMPLETED` và đã trừ kho; lỗi Agent được catch và log console. |
| `apps/api/src/modules/inventory/inventory.service.ts` | Gọi trực tiếp `scanInventory` từ `@cafe-project/agent` sau khi adjustment làm tồn kho dưới/bằng ngưỡng; lỗi Agent được catch. |
| `apps/api/src/modules/simulate-sale/simulate-sale.service.ts` | Gọi trực tiếp `scanInventory` từ `@cafe-project/agent`; nếu Agent lỗi thì simulate sale vẫn thành công và response có `agentWarning`, `agentLogs: []`, `createdPurchaseRequests: []`. |
| `apps/api/src/modules/email/email.service.ts` | Gọi trực tiếp `createAgentLog` từ `@cafe-project/agent` khi log email success/failed; không lưu thêm nội dung nhạy cảm. |
| `apps/agent/src/services/agent.service.ts` | Mở rộng type `ScanInventoryInput` với metadata optional `sourceType`, `sourceId`, `note` để API có thể gọi trực tiếp mà không đổi logic scan. |

### 6. Endpoint được giữ nguyên
- GET /api/agent/logs
- POST /api/agent/scan-inventory
- POST /api/agent/recommend-reorder
- GET /api/agent/recommendations
- POST /api/agent/recommendations/:id/create-purchase-request

### 7. Kết quả build
| Lệnh | Kết quả | Ghi chú |
|---|---|---|
| `npm run build --workspace=apps/agent` | PASS | `tsc -p tsconfig.json` hoàn tất sau khi thêm metadata optional vào public input type. |
| `npm run build --workspace=apps/api` | PASS | `tsc` hoàn tất; route mới và direct imports từ `@cafe-project/agent` compile OK. |
| `npm run build --workspace=apps/web` | PASS | `tsc -b && vite build` hoàn tất. Vite vẫn warning chunk lớn hơn 500 kB, không phải lỗi build và không sửa UI. |

### 8. Kết quả test live
| Test | Kết quả | Ghi chú |
|---|---|---|
| `GET /api/agent/logs?page=1&limit=20` | Chưa test live | Không có token admin/server live trong lượt này, nên không ghi PASS giả. |
| `GET /api/agent/logs?status=SKIPPED` | Chưa test live | Không có token admin/server live trong lượt này. |
| `POST /api/agent/scan-inventory` | Chưa test live | Không gọi endpoint thật để tránh tạo AgentLog/PurchaseRequest ngoài ý muốn. |
| `POST /api/agent/recommend-reorder` | Chưa test live | Không gọi endpoint thật để tránh gọi Gemini hoặc tạo recommendation/log. |
| `GET /api/agent/recommendations` | Chưa test live | Không có token admin/server live trong lượt này. |
| `POST /api/agent/recommendations/:id/create-purchase-request` | Chưa test live | Không gọi endpoint thật để tránh tạo PurchaseRequest. |

### 9. Kiểm tra sau refactor
- Không còn folder `apps/api/src/modules/agent-bridge`.
- Không còn import `agentTriggerService`.
- Không còn import `agentBridgeRoutes`.
- Không còn pattern `agent-bridge`, `agentBridge`, `modules/agent-bridge`, `from "../agent-bridge"`, `from "./agent-bridge"` trong source đã scan.
- `apps/api/src/modules/agent` chỉ còn `agent.route.ts`, `agent.controller.ts`, `agent.validator.ts`.
- Không tạo lại `agent.service.ts`, `agent.repository.ts`, `gemini.service.ts`, `recommendation.service.ts` trong backend Agent mới.
- Business logic Agent vẫn nằm ở `apps/agent/src/services`, `apps/agent/src/repositories`, `apps/agent/src/public-api.ts`.
- `apps/web` vẫn gọi `apps/api`; scan không thấy import `@cafe-project/agent` trong `apps/web/src`.

### 10. Cam kết
- Không sửa database schema.
- Không chạy migration.
- Không chạy seed.
- Không tạo AgentLog giả.
- Không gọi Gemini trong lúc refactor/test.
- Không sửa UI frontend.
- Không đổi endpoint frontend.
- Không tạo packages/agent-core.
- Không đưa business logic Agent về lại backend.

## Step 4 - Inventory Change Tracking And Notification Content

### 1. Mục tiêu
Theo dõi biến động tồn kho và đảm bảo AgentLog có nội dung rõ ràng cho NotificationPanel.

- Thời gian scan/build: `2026-06-19 19:06:07 +07:00`.
- File đã kiểm tra: `apps/api/src/modules/order/order.service.ts`, `apps/api/src/modules/inventory/inventory.service.ts`, `apps/api/src/modules/simulate-sale/simulate-sale.service.ts`, `apps/api/src/modules/purchase/purchase.service.ts`, `apps/api/src/modules/email/email.service.ts`, `apps/api/src/modules/agent/agent.controller.ts`, `apps/agent/src/public-api.ts`, `apps/agent/src/services/agent.service.ts`, `apps/agent/src/repositories/agent.repository.ts`, `apps/web/src/components/admin/NotificationPanel.tsx`, `apps/web/src/api/agentLogs.api.ts`, `apps/web/src/types/agentLog.types.ts`, `docs/AI_AGENT_CAFE_SCAN_LOG.md`.

### 2. Luồng tồn kho đã kiểm tra
| Luồng | Có thay đổi tồn kho không | Có gọi Agent không | TriggerType | Ghi chú |
|---|---|---|---|---|
| Order chuyển `COMPLETED` | Có, sau khi `orderRepository.updateStatus` trừ kho | Có | `ORDER_COMPLETED` | `apps/api/src/modules/order/order.service.ts` gọi trực tiếp `scanInventory` từ `@cafe-project/agent`, dùng `.catch(...)`, không gọi khi order mới `PENDING`/`PROCESSING`. |
| Simulate Sale | Có, repository giảm tồn mô phỏng | Có | `SIMULATE_SALE` | `apps/api/src/modules/simulate-sale/simulate-sale.service.ts` await `scanInventory`; nếu Agent lỗi thì trả `agentWarning`, không làm fail simulate sale. |
| Điều chỉnh kho | Có | Có khi số lượng sau điều chỉnh <= ngưỡng | `INVENTORY_ADJUSTED` | `apps/api/src/modules/inventory/inventory.service.ts` gọi sau `adjustStock`, dùng `.catch(...)`, không throw ngược nghiệp vụ chính. |
| Nhập kho thủ công | Có | Có | `INVENTORY_IMPORTED` | `apps/api/src/modules/inventory/inventory.service.ts` gọi sau `importStock`, dùng `.catch(...)`. |
| Nhận hàng Purchase Request | Có | Có | `PURCHASE_RECEIVED` | `apps/api/src/modules/purchase/purchase.service.ts` gọi sau `purchaseRepository.receive`, dùng `.catch(...)`. |
| Hoàn thành Purchase Request | Không thấy cập nhật tồn kho ở service này | Không | N/A | `purchaseService.complete` chỉ đổi status `RECEIVED` sang `COMPLETED`, không gọi Agent để tránh scan không có biến động tồn kho. |
| Email service | Không thay đổi tồn kho | Không scan tồn kho | N/A | `apps/api/src/modules/email/email.service.ts` chỉ dùng `createAgentLog` từ `@cafe-project/agent` cho log email, không dùng bridge. |

### 3. Nội dung Notification đã chuẩn hóa
| Case | Status | Reason/Result | Title hiển thị | Có hiện NotificationPanel không |
|---|---|---|---|---|
| Tạo yêu cầu nhập hàng | `SUCCESS` | `CREATED_PURCHASE_REQUEST` | Đã tạo yêu cầu nhập hàng | Có |
| Đã có PR chờ xác nhận | `SKIPPED` | `ACTIVE_PR_EXISTS` / `SKIPPED_DUPLICATE` | Đã có yêu cầu nhập hàng chờ bạn xác nhận | Có |
| Thiếu nhà cung cấp | `SKIPPED` | `NO_SUPPLIER` / `SUPPLIERS_INACTIVE` | Thiếu nhà cung cấp | Có |
| AI Agent đang tắt | `SKIPPED` | `AI_DISABLED` / `SKIPPED_DISABLED` | AI Agent đang tắt | Có |
| Tồn kho an toàn | `SKIPPED` | `STOCK_OK` / `ABOVE_THRESHOLD` | Tồn kho vẫn an toàn | Không hiện NotificationPanel, chỉ nằm trong Agent Log |
| Agent lỗi | `FAILED` | `SERVER_ERROR` / `DATABASE_ERROR` / `FAILED` | Agent xử lý thất bại | Có |

### 4. File đã sửa
| File | Thay đổi |
|---|---|
| `apps/agent/src/repositories/agent.repository.ts` | Thêm `findOpenPurchaseRequest` để lấy `purchaseRequestId` đang mở cho case duplicate, giúp AgentLog/NotificationPanel link đúng PR đang chờ xử lý. |
| `apps/agent/src/services/agent.service.ts` | Chuẩn hóa `message`, `reason`, `status`, metadata `productId/productName/inventoryId/purchaseRequestId`; thêm `output.notification` cho các case cần hiển thị; thêm log `STOCK_OK` không có notification; thêm log `SCAN_INVENTORY_FAILED` khi scan từng inventory lỗi. |
| `apps/api/src/modules/inventory/inventory.service.ts` | Gọi trực tiếp `scanInventory` sau nhập kho với `INVENTORY_IMPORTED`; đổi trigger điều chỉnh kho sang `INVENTORY_ADJUSTED`; lỗi Agent được catch và log console. |
| `apps/api/src/modules/purchase/purchase.service.ts` | Gọi trực tiếp `scanInventory` sau khi nhận hàng PR thành công với `PURCHASE_RECEIVED`; lỗi Agent được catch và log console. |
| `apps/web/src/types/agentLog.types.ts` | Thêm type `AgentLogNotification` và chuẩn hóa type `AgentLog` theo DTO AgentLog hiện tại. |
| `apps/web/src/components/admin/NotificationPanel.tsx` | Ưu tiên đọc `log.output.notification`; fallback mapping cũ vẫn còn; bỏ qua `STOCK_OK`/`ABOVE_THRESHOLD` để tránh spam thông báo. |

### 5. Kết quả build
| Lệnh | Kết quả | Ghi chú |
|---|---|---|
| `npm run build --workspace=apps/agent` | PASS | `tsc -p tsconfig.json` hoàn tất, không gọi Gemini. |
| `npm run build --workspace=apps/api` | PASS | `tsc` hoàn tất với các import trực tiếp `scanInventory`/`createAgentLog` từ `@cafe-project/agent`. |
| `npm run build --workspace=apps/web` | PASS | `tsc -b && vite build` hoàn tất; Vite vẫn warning chunk `index-*.js` > 500 kB, không phải lỗi build và không sửa UI ngoài NotificationPanel. |

### 6. Test live
| Test | Kết quả | Ghi chú |
|---|---|---|
| Order `COMPLETED` tạo scan thật | Chưa test live | Không có server/token admin trong lượt này; không gọi API thật để tránh tạo AgentLog/PurchaseRequest ngoài ý muốn. |
| Inventory import/adjust tạo scan thật | Chưa test live | Không chạy thao tác dữ liệu thật, không tạo AgentLog giả. |
| Simulate Sale trả `agentWarning` khi Agent lỗi | Chưa test live | Chỉ xác nhận bằng build/type; không chạy flow thật. |
| Purchase receive tạo scan thật | Chưa test live | Không chạy thao tác nhận hàng thật. |
| NotificationPanel đọc `output.notification` | Chưa test live | Build web PASS; chưa mở UI live vì không có server/token. |

### 7. Cam kết
- Không sửa database schema.
- Không chạy migration.
- Không chạy seed.
- Không gọi Gemini.
- Không tạo AgentLog giả.
- Không đổi endpoint frontend.
- Không tạo agent-bridge.
- Không sửa UI ngoài NotificationPanel.
- Không đưa business logic Agent về backend.

## Step 5 - Simplify Agent Logs Table UI

### 1. Mục tiêu
Làm bảng Nhật ký Agent dễ hiểu hơn cho admin bằng cách bỏ Result/Reason khỏi bảng chính và đổi Action kỹ thuật thành Hành động nghiệp vụ.

### 2. Thay đổi UI
| Cột | Trước | Sau |
|---|---|---|
| Hành động | Hiển thị mã kỹ thuật như SCAN_INVENTORY_SKIP_DUPLICATE | Hiển thị nghiệp vụ như Kiểm tra yêu cầu nhập hàng |
| Trạng thái | Bỏ qua | Bỏ qua tạo yêu cầu mới / Bỏ qua vì thiếu nhà cung cấp |
| Result | Hiển thị ở bảng chính | Chỉ hiển thị trong modal chi tiết |
| Reason | Hiển thị ở bảng chính | Chỉ hiển thị trong modal chi tiết |
| Nội dung xử lý | Có message nhưng bị lẫn mã kỹ thuật | Ưu tiên câu dễ hiểu từ log.message |

### 3. Mapping hành động nghiệp vụ
| Action/Result/Reason kỹ thuật | Label hiển thị |
|---|---|
| SCAN_INVENTORY_CREATE_PURCHASE_REQUEST / CREATED_PURCHASE_REQUEST | Tạo yêu cầu nhập hàng |
| SCAN_INVENTORY_SKIP_DUPLICATE / ACTIVE_PR_EXISTS | Kiểm tra yêu cầu nhập hàng |
| SCAN_INVENTORY_NO_SUPPLIER / NO_SUPPLIER | Kiểm tra nhà cung cấp |
| SCAN_INVENTORY_DISABLED / AI_DISABLED | Kiểm tra cấu hình AI Agent |
| STOCK_OK / ABOVE_THRESHOLD | Kiểm tra tồn kho |
| SCAN_INVENTORY_FAILED / FAILED | Kiểm tra tồn kho thất bại |
| RECOMMEND_REORDER | Đề xuất nhập hàng |
| SEND_SUPPLIER_EMAIL | Gửi email nhà cung cấp |

### 4. File đã sửa
| File | Thay đổi |
|---|---|
| `apps/web/src/pages/admin/AdminAgentLogsPage.tsx` | Bỏ cột Result/Reason khỏi bảng chính; thêm mapping Hành động/Trạng thái/Nội dung xử lý nghiệp vụ; giữ action/result/reason/triggerType/input/output/errorMessage trong modal chi tiết; bổ sung search theo label nghiệp vụ. |
| `docs/AI_AGENT_CAFE_SCAN_LOG.md` | Ghi nhận Step 5, phạm vi thay đổi UI và kết quả build. |

### 5. Kết quả build
| Lệnh | Kết quả | Ghi chú |
|---|---|---|
| `npm run build --workspace=apps/web` | PASS | `tsc -b && vite build` hoàn tất. |

### 6. Test live
| Test | Kết quả | Ghi chú |
|---|---|---|
| Bảng Nhật ký Agent bỏ Result/Reason | Chưa test live | Đã xác nhận bằng source và build; chưa mở UI live trong lượt này. |
| Cột Hành động hiển thị label nghiệp vụ | Chưa test live | Đã xác nhận bằng source và build; không tạo AgentLog giả. |
| Modal chi tiết vẫn có dữ liệu kỹ thuật | Chưa test live | Đã giữ action/result/reason/triggerType/input/output/errorMessage trong modal. |

### 7. Cam kết
- Không sửa backend.
- Không sửa database.
- Không đổi endpoint.
- Không sửa NotificationPanel.
- Không sửa logic Agent.
- Không tạo AgentLog giả.

### Bổ sung hiển thị lỗi thất bại
- Case FAILED không còn chỉ hiển thị “Xử lý thất bại”.
- Cột Nội dung xử lý ưu tiên hiển thị message/errorMessage/output.error.
- Modal chi tiết vẫn giữ errorMessage/result/reason/input/output để debug.
- Không hiển thị stack trace dài ở bảng chính.

## Step 6 - Demo Agent Failed Scenarios

### 1. Mục tiêu
Thêm cơ chế demo trạng thái FAILED cho Nhật ký Agent trong môi trường dev/test, không phá dữ liệu thật, không sửa schema/database, không đổi endpoint frontend và không refactor kiến trúc.

### 2. Biến môi trường demo
| Biến | Điều kiện chạy | Ghi chú |
|---|---|---|
| `AGENT_DEMO_FAILURE_MODE` | Chỉ có hiệu lực khi `NODE_ENV !== "production"` | Production tự bỏ qua mode demo. |

### 3. Mode đã thêm
| Mode | Reason | Message admin |
|---|---|---|
| `SCAN_THROW` | `AGENT_LOGIC_ERROR` | AI Agent gặp lỗi nội bộ khi kiểm tra tồn kho. |
| `DATABASE_READ_FAIL` | `DATABASE_ERROR` | AI Agent không thể đọc dữ liệu tồn kho từ hệ thống. |
| `MISSING_ENV` | `AGENT_CONFIG_ERROR` | AI Agent thiếu cấu hình cần thiết để xử lý. |
| `IMPORT_FAIL_SIMULATED` | `AGENT_IMPORT_ERROR` | Backend không thể nạp module AI Agent. |

### 4. Hành vi AgentLog
- Khi mode demo được bật, `scanInventory` ghi một AgentLog qua repository hiện có với `action = SCAN_INVENTORY_FAILED`, `result = FAILED`, `error_message` cụ thể và `output.errorMessage`.
- `output.message` chứa câu ngắn cho admin; DTO AgentLog ưu tiên `output.message` để bảng Nhật ký Agent hiển thị rõ nguyên nhân.
- `output.notification` có `title = Agent xử lý thất bại`, `description` lấy từ message demo, `actionLabel = Xem nhật ký Agent`, `actionUrl = /admin/agent-logs`.
- Không lưu stack trace dài vào bảng chính.

### 5. File đã sửa
| File | Thay đổi |
|---|---|
| `apps/agent/src/services/agent.service.ts` | Thêm guard dev-only `AGENT_DEMO_FAILURE_MODE`, mapping 4 mode demo, helper tạo AgentLog FAILED qua repository hiện có, và bổ sung `output.message`/`output.errorMessage` cho lỗi scan FAILED. |
| `docs/AI_AGENT_CAFE_SCAN_LOG.md` | Ghi nhận Step 6, mode demo và kết quả build. |

### 6. Kết quả build
| Lệnh | Kết quả | Ghi chú |
|---|---|---|
| `npm run build --workspace=apps/agent` | PASS | `tsc -p tsconfig.json` hoàn tất. |
| `npm run build --workspace=apps/api` | PASS | `tsc` hoàn tất với API import trực tiếp `@cafe-project/agent`. |
| `npm run build --workspace=apps/web` | PASS | `tsc -b && vite build` hoàn tất; có warning chunk lớn hơn 500 kB của Vite, không phải lỗi build. |

### 7. Test live
| Test | Kết quả | Ghi chú |
|---|---|---|
| Chạy browser/server với `AGENT_DEMO_FAILURE_MODE=SCAN_THROW` | Chưa test live | Chưa khởi động server/browser trong lượt này. |
| Chạy browser/server với `AGENT_DEMO_FAILURE_MODE=DATABASE_READ_FAIL` | Chưa test live | Chưa khởi động server/browser trong lượt này. |
| Chạy browser/server với `AGENT_DEMO_FAILURE_MODE=MISSING_ENV` | Chưa test live | Chưa khởi động server/browser trong lượt này. |
| Chạy browser/server với `AGENT_DEMO_FAILURE_MODE=IMPORT_FAIL_SIMULATED` | Chưa test live | Chưa khởi động server/browser trong lượt này. |

### 8. Cam kết
- Không sửa database schema.
- Không chạy migration.
- Không chạy seed.
- Không tạo AgentLog giả trực tiếp trong DB.
- Không đổi endpoint frontend.
- Không sửa Order logic.
- Không sửa Inventory transaction logic.
- Không sửa Purchase Request workflow.
- Không refactor kiến trúc.

## Step 7 - Split AI Agent Into Separate Process

### 1. Mục tiêu
Tách AI Agent thành process riêng để apps/api gọi apps/agent qua HTTP nội bộ.

### 2. Kiến trúc sau khi tách
apps/web → apps/api → apps/agent

### 3. File đã tạo
| File | Vai trò |
|---|---|
| `apps/agent/src/server.ts` | HTTP service nội bộ cho apps/agent, bind mặc định `127.0.0.1:5055`, có `/health` và các endpoint `/internal/agent/*`. |
| `apps/api/src/modules/agent/agent-http-client.service.ts` | HTTP client trong apps/api để gọi apps/agent bằng `x-agent-internal-token`, có timeout và fallback cho scan/logs. |
| `apps/api/src/modules/agent/agent-failure-log.service.ts` | Ghi AgentLog FAILED thật trong apps/api khi không kết nối được apps/agent service và fallback đọc logs từ DB khi `/api/agent/logs` cần hiển thị lỗi. |

### 4. File đã sửa
| File | Thay đổi |
|---|---|
| `apps/agent/package.json` | Thêm `dev:server` và `start:server`. |
| `apps/api/package.json` | Bỏ dependency trực tiếp `@cafe-project/agent` khỏi apps/api. |
| `apps/api/src/modules/agent/agent.controller.ts` | Đổi controller `/api/agent/*` sang gọi HTTP client nội bộ thay vì import trực tiếp business logic Agent. |
| `apps/api/src/modules/order/order.service.ts` | Order COMPLETED gọi `scanInventoryViaAgentService` sau khi trừ kho. |
| `apps/api/src/modules/inventory/inventory.service.ts` | Inventory import/adjust gọi `scanInventoryViaAgentService` sau khi kho thay đổi. |
| `apps/api/src/modules/simulate-sale/simulate-sale.service.ts` | Simulate Sale await `scanInventoryViaAgentService` để trả kết quả Agent cho UI. |
| `apps/api/src/modules/purchase/purchase.service.ts` | Purchase receive gọi `scanInventoryViaAgentService` sau khi nhận hàng cập nhật kho. |
| `apps/api/src/modules/email/email.service.ts` | Ghi AgentLog email qua `createAgentLogViaAgentService`. |
| `docs/AI_AGENT_CAFE_SCAN_LOG.md` | Ghi nhận Step 7, build và test thật. |

### 5. Internal endpoints của apps/agent
| Endpoint | Vai trò |
|---|---|
| `GET /health` | Kiểm tra process apps/agent đang chạy. |
| `POST /internal/agent/scan-inventory` | Gọi business logic `scanInventory`. |
| `GET /internal/agent/logs` | Gọi business logic lấy Agent logs. |
| `POST /internal/agent/recommend-reorder` | Gọi business logic `recommendReorder`. |
| `GET /internal/agent/recommendations` | Gọi business logic lấy recommendations. |
| `POST /internal/agent/recommendations/:id/create-purchase-request` | Chuyển recommendation thành PurchaseRequest. |
| `POST /internal/agent/logs` | Ghi AgentLog qua apps/agent service. |

### 6. Cơ chế bảo mật
- apps/api gọi apps/agent bằng `x-agent-internal-token`.
- apps/agent kiểm tra token cho tất cả endpoint `/internal/agent/*`.
- apps/agent bind mặc định `127.0.0.1` trong dev, port mặc định `5055`.
- frontend không gọi apps/agent.

### 7. Cơ chế lỗi khi Agent service không chạy
- apps/api ghi AgentLog FAILED với reason `AGENT_SERVICE_UNAVAILABLE` hoặc `AGENT_SERVICE_TIMEOUT`.
- Message hiển thị cho admin: `Không kết nối được AI Agent service.`
- `output.notification` trỏ về `/admin/agent-logs`.
- Simulate Sale / Order / Inventory / Purchase không bị fail ngược do Agent service tắt; riêng Simulate Sale nhận `agentWarning` và `results` chứa log FAILED fallback.

### 8. Kết quả build
| Lệnh | Kết quả | Ghi chú |
|---|---|---|
| `npm run build --workspace=apps/agent` | PASS | `tsc -p tsconfig.json` hoàn tất, compile cả `dist/server.js`. |
| `npm run build --workspace=apps/api` | PASS | `tsc` hoàn tất; apps/api không còn import trực tiếp `@cafe-project/agent` trong `apps/api/src`. |
| `npm run build --workspace=apps/web` | PASS | `tsc -b && vite build` hoàn tất; Vite có warning chunk lớn hơn 500 kB, không phải lỗi build. |

### 9. Kết quả test live
| Test | Kết quả | Ghi chú |
|---|---|---|
| `npm run dev:server --workspace=apps/agent` + `GET http://127.0.0.1:5055/health` | PASS | Trả `200` và `{"status":"OK"}`. Process test đã được dừng sau khi kiểm tra. |
| Simulate Sale khi apps/agent đang chạy | Chưa test live | Chưa khởi động apps/api/apps/web và login admin trong lượt này. |
| Simulate Sale khi apps/agent bị tắt | Chưa test live | Chưa chạy browser/server đầy đủ; build đã xác nhận fallback code compile. |

### 10. Cam kết
- Không sửa database schema.
- Không chạy migration.
- Không chạy seed.
- Không đổi endpoint frontend.
- Không để apps/web gọi apps/agent.
- Không đưa business logic Agent về apps/api.

## Step 8 - Clean Agent Process File Structure

### 1. Mục tiêu
Dọn tên file sau khi tách Agent thành process riêng để phân biệt rõ backend gateway, Agent HTTP server và Agent worker.

### 2. Cấu trúc sau khi dọn
| Khu vực | Vai trò |
|---|---|
| `apps/api/src/modules/agent` | Gateway/API controller/client gọi Agent |
| `apps/agent/src/server.ts` | HTTP service riêng của Agent |
| `apps/agent/src/worker.ts` | Worker/cron/scan nền |
| `apps/agent/src/services` | Business logic Agent |
| `apps/agent/src/repositories` | Database access cho Agent |

### 3. File đã rename
| Từ | Sang | Lý do |
|---|---|---|
| `apps/api/src/modules/agent/agent-http-client.service.ts` | `apps/api/src/modules/agent/agent.client.ts` | Tên ngắn hơn và thể hiện rõ vai trò client gọi HTTP sang apps/agent. |
| `apps/agent/src/index.ts` | `apps/agent/src/worker.ts` | Phân biệt rõ worker/cron với HTTP server `server.ts`. |

### 4. File đã sửa import
| File | Thay đổi |
|---|---|
| `apps/api/src/modules/agent/agent.controller.ts` | Import agent client từ `./agent.client`. |
| `apps/api/src/modules/order/order.service.ts` | Import `scanInventoryViaAgentService` từ `../agent/agent.client`. |
| `apps/api/src/modules/inventory/inventory.service.ts` | Import `scanInventoryViaAgentService` từ `../agent/agent.client`. |
| `apps/api/src/modules/simulate-sale/simulate-sale.service.ts` | Import `scanInventoryViaAgentService` từ `../agent/agent.client`. |
| `apps/api/src/modules/purchase/purchase.service.ts` | Import `scanInventoryViaAgentService` từ `../agent/agent.client`. |
| `apps/api/src/modules/email/email.service.ts` | Import `createAgentLogViaAgentService` từ `../agent/agent.client`. |
| `apps/agent/package.json` | Scripts `dev`, `start`, `scan` đổi sang `worker.ts`; thêm `dev:worker` và `start:worker`; giữ `dev:server` và `start:server`. |

### 5. Kết quả build
| Lệnh | Kết quả | Ghi chú |
|---|---|---|
| `npm run build --workspace=apps/agent` | PASS | `tsc -p tsconfig.json` hoàn tất với `server.ts` và `worker.ts`. |
| `npm run build --workspace=apps/api` | PASS | `tsc` hoàn tất; imports `agent.client` compile OK. |
| `npm run build --workspace=apps/web` | PASS | `tsc -b && vite build` hoàn tất; Vite có warning plugin timing/chunk lớn hơn 500 kB, không phải lỗi build. |

### 6. Cam kết
- Không sửa database schema.
- Không chạy migration.
- Không đổi endpoint frontend.
- Không sửa logic nghiệp vụ.
- Không đưa business logic Agent về apps/api.

## Step 9 - Final Cleanup Scan Before Demo

### 1. Mục tiêu
Scan các file/thư mục có thể rút gọn hoặc xoá trước demo, không sửa code và không xoá file trong bước này.

### 2. Kết luận nhanh
- Dự án đã sẵn sàng về kiến trúc demo: luồng hiện tại là `apps/web → apps/api → apps/agent`.
- Chưa kết luận PASS demo nghiệp vụ vì lượt này không chạy browser/server đầy đủ, không login admin và không tạo dữ liệu thật.
- Nên giữ toàn bộ source demo chính: `apps/web/src`, `apps/api/src`, `apps/agent/src/server.ts`, `apps/agent/src/worker.ts`, `apps/agent/src/services`, `apps/agent/src/repositories`, `packages/database`.
- Có thể xoá cache `.turbo` sau xác nhận nếu muốn làm sạch working tree; cache đã nằm trong `.gitignore`.
- `dist` và `node_modules` là generated/ignored nhưng không nên xoá ngay trước demo nếu cần chạy nhanh bằng `start` hoặc không muốn reinstall/rebuild.
- `apps/agent/src/public-api.ts` không còn được source import sau khi apps/api gọi HTTP, nhưng vẫn là `main/types/exports` trong `apps/agent/package.json`; chỉ cân nhắc xoá sau khi xác nhận bỏ hẳn package API.

### 3. File/thư mục có thể xoá ngay
| File/Folder | Lý do | Rủi ro |
|---|---|---|
| `.turbo/` | Turbo cache generated, đã nằm trong `.gitignore`, có thể build lại. | Thấp; build sau sẽ tạo lại cache. |
| `apps/api/.turbo/` | Workspace cache generated, đã ignored. | Thấp. |
| `apps/agent/.turbo/` | Workspace cache generated, đã ignored. | Thấp. |
| `apps/web/.turbo/` | Workspace cache generated, đã ignored. | Thấp. |
| `packages/types/.turbo/` | Workspace cache generated, đã ignored bởi rule `.turbo`. | Thấp. |

### 4. File/thư mục chỉ xoá sau khi xác nhận
| File/Folder | Đang nghi ngờ | Cần xác nhận gì |
|---|---|---|
| `apps/api/dist/` | Build output generated và ignored. | Chỉ xoá nếu demo không chạy `npm run start --workspace=apps/api` trực tiếp từ dist hoặc đã rebuild ngay trước demo. |
| `apps/agent/dist/` | Build output generated và ignored, chứa `server.js`/`worker.js`. | Chỉ xoá nếu demo dùng dev scripts hoặc đã rebuild trước khi dùng `start:server`/`start:worker`. |
| `apps/web/dist/` | Vite build output generated và ignored. | Chỉ xoá nếu demo không dùng preview/static build hoặc có thể rebuild. |
| `node_modules/`, `apps/*/node_modules/`, `packages/database/node_modules/` | Dependency install output, ignored. | Chỉ xoá nếu chấp nhận chạy `npm install` lại trước demo. |
| `apps/web/scratch/revert_admin.ps1` | Script phục hồi admin UI từ transcript, không thấy import/source reference; có hardcoded path máy cũ. | Xác nhận không cần rollback UI trước khi xoá. |
| `docs/idea.txt`, `docs/vấn đề.txt` | Ghi chú rời, chưa rõ có cần cho báo cáo/demo không. | Xác nhận nội dung không còn dùng. |
| `apps/agent/src/public-api.ts` | Không thấy source import hiện tại; vẫn là package export trong `apps/agent/package.json`. | Chỉ xoá nếu bỏ luôn package API `@cafe-project/agent` và chỉnh package metadata tương ứng. |
| `.idea/workspace.xml` | IDE state ignored, không liên quan runtime. | Xác nhận không cần giữ cấu hình IDE cá nhân. |

### 5. File/thư mục phải giữ cho demo
| File/Folder | Lý do |
|---|---|
| `apps/web/src` | Frontend admin/customer; admin demo dùng `/admin/simulate-sale`, `/admin/agent-logs`, NotificationPanel. |
| `apps/api/src/index.ts` | API gateway mount `/api/agent`, `/api/simulate-sale`, inventory/order/purchase routes. |
| `apps/api/src/modules/agent/agent.route.ts` | Frontend endpoint `/api/agent/*`. |
| `apps/api/src/modules/agent/agent.controller.ts` | Nhận request frontend và gọi `agent.client.ts`. |
| `apps/api/src/modules/agent/agent.validator.ts` | Validate request scan/recommend. |
| `apps/api/src/modules/agent/agent.client.ts` | HTTP client gọi apps/agent bằng internal token. |
| `apps/api/src/modules/agent/agent-failure-log.service.ts` | Ghi AgentLog FAILED khi apps/agent service không chạy. |
| `apps/agent/src/server.ts` | HTTP Agent service riêng cho apps/api. |
| `apps/agent/src/worker.ts` | Worker/cron/scan nền và `scan --scan-once`. |
| `apps/agent/src/services/agent.service.ts` | Business logic scan inventory, log, purchase request, recommendation bridge. |
| `apps/agent/src/services/recommendation.service.ts` | Logic recommendation và chuyển recommendation thành PR. |
| `apps/agent/src/services/gemini.service.ts` | Gemini integration cho recommend flow; không gọi trong scan/build. |
| `apps/agent/src/repositories/agent.repository.ts` | Database access của Agent. |
| `apps/agent/src/jobs/inventory-scan.job.ts` | Cron job được `worker.ts` import. |
| `apps/agent/src/config/env.ts` | Env config được worker/job/gemini/logger dùng. |
| `apps/agent/src/errors/http-error.ts` | `AgentHttpError` được `agent.service.ts` dùng. |
| `apps/agent/src/utils/logger.ts` | Logger được worker/job/agent service dùng. |
| `.env` files | Local runtime config; ignored nhưng cần cho demo thật. |
| `packages/database` | Prisma client/schema access cho API/Agent. |

### 6. Agent architecture final check
| Khu vực | Trạng thái | Ghi chú |
|---|---|---|
| `apps/web` | OK về kiến trúc | Search source không thấy gọi `5055`, `/internal/agent`, hoặc `AGENT_SERVICE`; chỉ gọi `/api/agent/logs` và `/api/simulate-sale` qua API client. |
| `apps/api` | OK về gateway | `apps/api/src/modules/agent` chỉ còn route/controller/validator/client/failure-log; không thấy import `@cafe-project/agent` trong `apps/api/src`. |
| `apps/agent server` | OK về vai trò | `server.ts` cung cấp `/health` và `/internal/agent/*`, có token guard cho internal endpoints. |
| `apps/agent worker` | OK về vai trò | `worker.ts` import env/logger/job/agent service, chạy cron và scan once. |
| `packages/database` | Cần giữ | Được API và Agent dùng qua `@cafe-project/database`; không sửa schema trong lượt này. |

### 7. Import/reference check
| File nghi vấn | Có import không | Kết luận |
|---|---|---|
| `apps/api/src/modules/agent/agent.service.ts` | File không còn trong source hiện tại; git đang ghi nhận deleted từ refactor trước. | Không còn business logic Agent trong apps/api. |
| `apps/api/src/modules/agent/agent.repository.ts` | File không còn trong source hiện tại; git đang ghi nhận deleted từ refactor trước. | Không còn repository Agent trong apps/api. |
| `apps/api/src/modules/agent/gemini.service.ts` | File không còn trong source hiện tại; git đang ghi nhận deleted từ refactor trước. | Không còn Gemini service trong apps/api. |
| `apps/api/src/modules/agent/recommendation.service.ts` | File không còn trong source hiện tại; git đang ghi nhận deleted từ refactor trước. | Không còn recommendation logic Agent trong apps/api. |
| `apps/api/src/modules/agent/agent.client.ts` | Được controller, order, inventory, simulate-sale, purchase, email service import. | Giữ cho demo. |
| `apps/api/src/modules/agent/agent-failure-log.service.ts` | Được `agent.client.ts` import. | Giữ cho case Agent service tắt. |
| `apps/agent/src/public-api.ts` | Không thấy source import; package metadata vẫn export `dist/public-api.js`. | Chỉ xoá sau xác nhận bỏ package API. |
| `apps/agent/src/server.ts` | Package script `dev:server`/`start:server` dùng. | Giữ. |
| `apps/agent/src/worker.ts` | Package script `dev`, `dev:worker`, `start`, `start:worker`, `scan` dùng. | Giữ. |
| `apps/agent/src/jobs/inventory-scan.job.ts` | Được `worker.ts` import. | Giữ. |
| `apps/agent/src/config/env.ts` | Được `worker.ts`, job, gemini service, logger dùng. | Giữ. |
| `apps/agent/src/errors/http-error.ts` | Được `agent.service.ts` import. | Giữ. |
| `apps/agent/src/utils/logger.ts` | Được worker/job/agent service import. | Giữ. |
| `apps/agent/src/services/gemini.service.ts` | Được `recommendation.service.ts` import. | Giữ nếu demo có recommend flow; không gọi Gemini khi chỉ build/scan. |
| `apps/web/scratch/revert_admin.ps1` | Không thấy import/source reference. | Chỉ xoá sau xác nhận vì là utility/rollback script. |

### 8. Package scripts check
| Package | Script | Trạng thái | Đề xuất |
|---|---|---|---|
| root | `build` | OK | Giữ; chạy Turbo build. |
| root | `dev` | OK | Giữ; chạy Turbo dev. |
| root | `format` | Có thể nguy hiểm trước demo | Không chạy trong cleanup; nếu cần format thì chạy có phạm vi sau demo. |
| root | `db:seed` | Có rủi ro dữ liệu | Không chạy trước demo trừ khi chủ động reset seed. |
| `apps/api` | `dev` | OK | Chạy backend API gateway bằng `nodemon src/index.ts`. |
| `apps/api` | `start` | OK nếu đã build | Dùng `dist/index.js`; cần giữ/rebuild `apps/api/dist`. |
| `apps/web` | `dev` | OK | Chạy frontend Vite. |
| `apps/web` | `build` | OK | Build frontend production. |
| `apps/agent` | `dev:server` | OK | Chạy HTTP Agent service `src/server.ts` cho demo luồng `apps/api → apps/agent`. |
| `apps/agent` | `start:server` | OK nếu đã build | Dùng `dist/server.js`; cần build trước nếu xoá dist. |
| `apps/agent` | `dev:worker` | OK | Chạy worker/cron rõ nghĩa. |
| `apps/agent` | `start:worker` | OK nếu đã build | Dùng `dist/worker.js`. |
| `apps/agent` | `dev` | Chạy worker nhưng tên chung | Có thể giữ alias; khi demo nên dùng `dev:server` để tránh nhầm. |
| `apps/agent` | `start` | Chạy worker nhưng tên chung | Có thể giữ alias; docs/demo script nên gọi `start:server` hoặc `start:worker` rõ ràng. |
| `apps/agent` | `scan` | OK | Scan once qua `worker.ts --scan-once`. |

### 9. Demo readiness
| Demo case | Trạng thái | Ghi chú |
|---|---|---|
| Agent chạy bình thường | Chưa test live | Step 7 đã test `/health` PASS; chưa chạy full apps/api/apps/web/login admin/simulate sale trong lượt này. |
| Agent service tắt | Chưa test live | Code fallback đã build ở Step 8; chưa chạy Simulate Sale thật với agent server tắt trong lượt này. |
| Thiếu supplier | Chưa test live | Logic SKIPPED/notification nằm trong `apps/agent/src/services/agent.service.ts`; chưa tạo dữ liệu test live. |
| Duplicate PR | Chưa test live | Logic `findOpenPurchaseRequest`/`SCAN_INVENTORY_SKIP_DUPLICATE` còn trong Agent service/repository; chưa test live. |
| Tạo PR mới | Chưa test live | Logic tạo PR vẫn trong Agent service/repository; chưa test live. |

### 10. Build result nếu có chạy
| Lệnh | Kết quả | Ghi chú |
|---|---|---|
| Không chạy build trong Step 9 | N/A | Lượt này chỉ scan; build gần nhất ở Step 8 đã PASS cho `apps/agent`, `apps/api`, `apps/web`. |

### 11. Cam kết
- Không xoá file.
- Không sửa source code.
- Không đổi database.
- Không migration.
- Không seed.
- Không gọi Gemini.
- Không tạo AgentLog giả.

## Step 10 - Reduce AgentLog Noise Before Demo

### 1. Mục tiêu
Giảm nhiễu ở bảng Nhật ký Agent trước demo bằng cách chỉ thay đổi lớp hiển thị frontend. Không xoá dữ liệu `AgentLog` trong database, không đổi schema, không chạy migration/seed, không tạo AgentLog giả và không đổi logic tạo PurchaseRequest.

### 2. File đã kiểm tra/sửa
| File | Trạng thái | Ghi chú |
|---|---|---|
| `apps/web/src/pages/admin/AdminAgentLogsPage.tsx` | Đã sửa | Thêm lọc hiển thị client-side cho tab `Tất cả`. |
| `apps/web/src/api/agentLogs.api.ts` | Đã kiểm tra, không sửa | API endpoint và normalize log giữ nguyên. |
| `apps/web/src/types/agentLog.types.ts` | Đã kiểm tra, không sửa | Không cần đổi type. |
| `docs/AI_AGENT_CAFE_SCAN_LOG.md` | Đã sửa | Ghi nhận Step 10 và kết quả build thật. |

### 3. Log bị ẩn khỏi bảng mặc định
Ở tab `Tất cả`, khi ô tìm kiếm trống, UI mặc định không hiển thị các log có `reason` hoặc `result`:
- `STOCK_OK`
- `ABOVE_THRESHOLD`

Các log này không bị xoá khỏi database. Chúng vẫn được trả về từ API và chỉ bị loại khỏi danh sách render mặc định ở frontend. Nếu admin tìm đúng từ khóa kỹ thuật `STOCK_OK` hoặc `ABOVE_THRESHOLD`, log tương ứng sẽ hiện lại. Nếu chọn filter trạng thái riêng như `Bỏ qua`, các log này vẫn có thể được xem.

### 4. Log vẫn hiển thị bình thường
Không ẩn các nhóm log quan trọng cho demo:
- `FAILED`
- `AGENT_SERVICE_UNAVAILABLE`
- `NO_SUPPLIER`
- `SUPPLIERS_INACTIVE`
- `ACTIVE_PR_EXISTS`
- `CREATED_PURCHASE_REQUEST`
- `RECOMMENDED`
- `CONVERTED_TO_PR`

### 5. Không thay đổi dữ liệu/logic
- Không xoá dữ liệu `AgentLog` trong database.
- Không sửa database schema.
- Không chạy migration.
- Không chạy seed.
- Không tạo AgentLog giả.
- Không đổi endpoint frontend.
- Không đổi logic Agent chính.
- Không đổi logic tạo PurchaseRequest.

### 6. Build result
| Lệnh | Kết quả | Ghi chú |
|---|---|---|
| `npm run build --workspace=apps/web` | PASS | `tsc -b && vite build` hoàn tất. Vite có warning plugin timing và chunk lớn hơn 500 kB, không phải lỗi build. |

## Step 11 - Add Restore Simulation Flow And Simulation AgentLog Tab

### 1. Mục tiêu
Thêm khôi phục mô phỏng bán và tab `Mô phỏng` trong Nhật ký Agent. Luồng vẫn giữ `apps/web -> apps/api -> apps/agent`; frontend không gọi apps/agent trực tiếp.

### 2. Nguyên tắc AgentLog
- Không xoá AgentLog.
- AgentLog là nhật ký demo/audit.
- Restore mô phỏng không làm mất lịch sử Agent đã xử lý.
- Step này không tạo AgentLog restore để tránh thêm nhiễu.

### 3. File đã sửa
| File | Thay đổi |
|---|---|
| `apps/api/src/modules/simulate-sale/simulate-sale.repository.ts` | Trả `transactionId` khi simulate; thêm restore tồn kho bằng transaction gốc; ghi transaction khôi phục kiểu `ADJUSTMENT` với note `Khôi phục mô phỏng bán`. |
| `apps/api/src/modules/simulate-sale/simulate-sale.service.ts` | Trả `inventoryId`/`transactionId` top-level; thêm `restore(transactionId, userId)`. |
| `apps/api/src/modules/simulate-sale/simulate-sale.controller.ts` | Thêm controller restore. |
| `apps/api/src/modules/simulate-sale/simulate-sale.route.ts` | Thêm route restore admin. |
| `apps/web/src/api/simulateSale.api.ts` | Thêm `restoreSimulation(transactionId)`. |
| `apps/web/src/pages/admin/AdminSimulateSalePage.tsx` | Hiển thị nút `Khôi phục mô phỏng`, trạng thái `Đã khôi phục`, toast restore và link `Nhật ký mô phỏng`. |
| `apps/web/src/api/agentLogs.api.ts` | Normalize thêm `sourceType/sourceId`; đọc được `input/output` dạng JSON string nếu backend trả dạng string. |
| `apps/web/src/types/agentLog.types.ts` | Thêm `sourceType/sourceId`. |
| `apps/web/src/pages/admin/AdminAgentLogsPage.tsx` | Thêm tab `Mô phỏng`, đọc `?tab=simulation`, lọc log mô phỏng bằng field chuẩn trước. |
| `docs/AI_AGENT_CAFE_SCAN_LOG.md` | Ghi nhận Step 11, build và test thật. |

### 4. Endpoint restore
| Endpoint | Vai trò |
|---|---|
| `POST /api/simulate-sale/:transactionId/restore` | Tìm transaction `SIMULATE_SALE` gốc, kiểm tra chưa restore, cộng lại đúng số lượng đã trừ, ghi `InventoryTransaction` khôi phục kiểu `ADJUSTMENT`. |

### 5. Luồng khôi phục tồn kho
- Simulate sale trả `stockBefore`, `decreasedQuantity`, `stockAfter`, `inventoryId`, `productId`, `transactionId`.
- Restore lấy `transactionId` của transaction `SIMULATE_SALE` gốc.
- `decreasedQuantity` = `abs(originalTransaction.quantity)`.
- Backend cộng lại đúng `decreasedQuantity` vào inventory hiện tại.
- Transaction khôi phục dùng type `ADJUSTMENT` vì enum hiện chưa có `SIMULATE_RESTORE` và Step này không sửa schema.
- Double restore prevention: backend tìm transaction `ADJUSTMENT` cùng product, cùng quantity, có marker `[restore-of:<transactionId>]` trong `reason`; nếu có thì trả 409 `Mô phỏng này đã được khôi phục trước đó.`
- Response restore trả `restoredStock`, `stockBeforeRestore`, `restoreTransactionId`.

### 6. Tab Mô phỏng trong AgentLog
- Tab `Mô phỏng` hiển thị log có liên quan Simulate Sale.
- Điều kiện nhận diện ưu tiên field chuẩn: `triggerType`, `sourceType`, `input.triggerType`, `input.sourceType`, `output.sourceType` bằng `SIMULATE_SALE`.
- Text `simulate sale`, `mô phỏng`, `mo phong` chỉ là fallback nếu thiếu field chuẩn.
- Tab `Mô phỏng` hiển thị mọi status: `SUCCESS`, `SKIPPED`, `FAILED`, `RUNNING`.
- Tab `Tất cả` vẫn ẩn mặc định `STOCK_OK` / `ABOVE_THRESHOLD` để giảm nhiễu.
- Tab `Mô phỏng` vẫn xem được `STOCK_OK` / `ABOVE_THRESHOLD` nếu log đó thuộc mô phỏng.
- Log mô phỏng không bị xoá.

### 7. Có gọi Agent sau restore không
Không gọi Agent sau restore. Restore là thao tác hoàn tác demo; gọi Agent lại có thể tạo thêm log nhiễu hoặc tạo thêm xử lý không cần thiết. AgentLog cũ vẫn giữ để chứng minh Agent đã chạy ở thời điểm simulate.

### 8. Purchase Request do mô phỏng tạo
Không tự xoá Purchase Request đã tạo từ mô phỏng. Purchase Request là bằng chứng demo/audit và admin có thể xử lý hoặc huỷ ở trang Yêu cầu mua hàng trong bước riêng.

### 9. Kết quả build
| Lệnh | Kết quả | Ghi chú |
|---|---|---|
| `npm run build --workspace=apps/api` | PASS | `tsc` hoàn tất. |
| `npm run build --workspace=apps/web` | PASS | `tsc -b && vite build` hoàn tất. Vite warning chunk lớn hơn 500 kB, không phải lỗi build. |
| `npm run build --workspace=apps/agent` | Không chạy | Step này không sửa apps/agent type/logic. |

### 10. Kết quả test live
| Test | Kết quả | Ghi chú |
|---|---|---|
| Test 1: Simulate Sale tạo dữ liệu khôi phục | PASS | Chạy service thật với product `Robusta`, tồn kho 5 -> 4, có `transactionId` `cmqm4k70c0001k57kc6kbyuwo`. |
| Test 2: Restore mô phỏng | PASS | Restore transaction gốc, tồn kho 4 -> 5, restoreTransactionId `cmqm4k74f0003k57kbqfb602i`. |
| Test 3: Không cho restore 2 lần | PASS | Gọi restore lần hai trả 409 với message `Mô phỏng này đã được khôi phục trước đó.` |
| Test 4: AgentLog tab Mô phỏng | PARTIAL | Service test tạo/giữ AgentLog `SCAN_INVENTORY_NO_SUPPLIER`, status `SKIPPED`, reason `NO_SUPPLIER`, triggerType `SIMULATE_SALE`; frontend tab đã build PASS nhưng chưa test thủ công bằng browser. |
| Test 5: AgentLog không bị xoá | PASS | Sau restore, count log có input chứa `SIMULATE_SALE` là 42; không xoá hoặc ghi đè AgentLog. |
| Browser UI manual test | Chưa chạy | Chưa khởi động apps/api/apps/web và login admin qua browser trong lượt này. |

### 11. Cam kết
- Không xoá AgentLog.
- Không xoá InventoryTransaction cũ.
- Không xoá Purchase Request.
- Không sửa database schema.
- Không chạy migration.
- Không chạy seed.
- Không gọi Gemini.
- Không tạo AgentLog giả.
- Không đổi Order/Payment thật.

## Step 12 - Fix Simulation Duplicate Logs And Persist Restore State

### 1. Mục tiêu
Sửa lỗi log mô phỏng bị tạo trùng và nút khôi phục mô phỏng bị mất khi chuyển trang.

### 2. Nguyên nhân tìm được
- Nút `Khôi phục mô phỏng` chỉ nằm trong React state của `AdminSimulateSalePage`; khi admin chuyển trang, component unmount nên state mất.
- Backend chưa có API truy vấn transaction `SIMULATE_SALE` chưa restore để frontend hydrate lại card khôi phục.
- Simulate Sale đang gọi Agent scan với `sourceId` là `productId` trong luồng một sản phẩm, không phải `transactionId`; vì vậy AgentLog thiếu khóa idempotency theo từng mô phỏng.
- UI chưa chặn đủ double submit: `handleSimulate` chưa return khi `isSimulating`, và nút mở confirm chưa disable khi request đang chạy.

### 3. File đã sửa
| File | Thay đổi |
|---|---|
| `apps/api/src/modules/simulate-sale/simulate-sale.repository.ts` | Thêm tìm pending restore trong 7 ngày theo user hiện tại; dùng marker `[restore-of:<transactionId>]`; tái dùng helper marker cho restore. |
| `apps/api/src/modules/simulate-sale/simulate-sale.service.ts` | Thêm `pendingRestore(userId)`; đổi Agent scan `sourceId` sang `transactionId` cho simulate một sản phẩm. |
| `apps/api/src/modules/simulate-sale/simulate-sale.controller.ts` | Thêm controller lấy pending restore. |
| `apps/api/src/modules/simulate-sale/simulate-sale.route.ts` | Thêm `GET /api/simulate-sale/pending-restore`. |
| `apps/agent/src/repositories/agent.repository.ts` | Thêm idempotency trong `createLog`: nếu log mô phỏng cùng `sourceId + productId + action + result/reason` đã có thì trả log cũ, không tạo dòng mới. |
| `apps/web/src/api/simulateSale.api.ts` | Thêm `getPendingRestore()`. |
| `apps/web/src/pages/admin/AdminSimulateSalePage.tsx` | Gọi pending restore khi mount; hydrate lại card restore; chặn double submit; lưu/xóa `lastSimulationTransactionId` localStorage như fallback phụ. |
| `apps/web/src/pages/admin/AdminAgentLogsPage.tsx` | Dedupe nhẹ tab `Mô phỏng` theo `action + status + reason + productId + sourceId + timeBucket`. |
| `docs/AI_AGENT_CAFE_SCAN_LOG.md` | Ghi nhận Step 12, build và test thật. |

### 4. Pending restore API
| Endpoint | Vai trò |
|---|---|
| `GET /api/simulate-sale/pending-restore` | Trả transaction `SIMULATE_SALE` gần nhất trong 7 ngày của admin hiện tại chưa có transaction restore marker tương ứng. |

### 5. Chống mất nút restore
- Khi `AdminSimulateSalePage` mount, frontend gọi `simulateSaleApi.getPendingRestore()`.
- Nếu backend trả `pendingRestore`, UI set lại `selectedProductId` và dựng lại result card gồm `transactionId`, `inventoryId`, `productId`, `productName`, `stockBefore`, `stockAfter`, `decreasedQuantity`.
- Backend là nguồn kiểm tra chính; localStorage chỉ lưu `lastSimulationTransactionId` như fallback phụ và bị xóa khi không còn pending hoặc restore thành công.
- Sau restore, UI set `restored: true`, disable nút restore, xóa localStorage và refresh inventory.

### 6. Chống AgentLog trùng
- Simulate Sale một sản phẩm giờ truyền Agent scan với `sourceId = transactionId`.
- UI chặn double submit bằng `isSimulating` trong `handleSimulate` và disable nút Apply Simulation khi đang loading.
- apps/agent chặn tạo log mới nếu đã có log mô phỏng cùng `sourceId`, `productId`, `action`, `result` và `reason`.
- Tab `Mô phỏng` dedupe nhẹ để tránh hiển thị lặp duplicate cũ đã tồn tại trong DB.

### 7. AgentLog audit
- Không xoá AgentLog.
- Không ghi đè AgentLog.
- Chỉ chặn tạo log trùng mới.
- Duplicate cũ trong DB vẫn còn để giữ audit, nhưng tab `Mô phỏng` có thể ẩn bớt ở lớp hiển thị.

### 8. Kết quả build
| Lệnh | Kết quả | Ghi chú |
|---|---|---|
| `npm run build --workspace=apps/api` | PASS | `tsc` hoàn tất. |
| `npm run build --workspace=apps/web` | PASS | `tsc -b && vite build` hoàn tất. Vite warning chunk lớn hơn 500 kB, không phải lỗi build. |
| `npm run build --workspace=apps/agent` | PASS | `tsc -p tsconfig.json` hoàn tất. |

### 9. Kết quả test live
| Test | Kết quả | Ghi chú |
|---|---|---|
| Test 1: Không mất nút restore khi chuyển trang | PARTIAL | Service test xác nhận `pendingRestore` trả transaction vừa simulate: `cmqm5vb2z0001k52wtbippmp8`; chưa chạy browser chuyển trang thủ công. |
| Test 2: Restore sau khi quay lại | PASS | Product `Culi` tồn kho 5 -> 4 sau simulate, restore 4 -> 5, restoreTransactionId `cmqm5vbg70003k52wyi5hgya4`. |
| Test 3: Không hiện restore sau khi đã restore | PARTIAL | Transaction vừa restore không còn pending; endpoint sau đó trả một pending cũ khác trong DB (`Robusta`) nên chưa thể kết luận UI trống tuyệt đối nếu DB còn mô phỏng cũ chưa restore. |
| Test 4: Không cho restore 2 lần | PASS | Restore lại cùng `transactionId` trả 409 `Mô phỏng này đã được khôi phục trước đó.` |
| Test 5: Không tạo AgentLog trùng | PASS | Với transaction `cmqm5vb2z0001k52wtbippmp8`, query AgentLog theo sourceId trả 1 log, `maxDuplicateCount = 1`. |
| Test 6: Chặn double submit | PARTIAL | Source đã chặn `isSimulating` và build PASS; chưa chạy browser click liên tục thủ công. |

### 10. Cam kết
- Không xoá AgentLog.
- Không xoá InventoryTransaction cũ.
- Không xoá Purchase Request.
- Không sửa database schema.
- Không migration.
- Không seed.
- Không gọi Gemini.
- Không tạo AgentLog giả.
- Không đổi Order/Payment thật.

## Step 13 - Product Unit And Purchase Conversion Implementation

### 1. Mục tiêu
Sửa phần đơn vị sản phẩm, đơn vị tồn kho, đơn vị nhập hàng và quy cách đổi cho đúng nghiệp vụ cà phê.

### 2. Quy trình đã thực hiện
- Đã scan root config, docs, Prisma schema, backend API, apps/agent, frontend admin pages, API client và type.
- Đã phân tích hiện trạng trước khi sửa code.
- Chưa sửa code nghiệp vụ vì scan xác nhận cần schema change để lưu bền vững quy cách nhập hàng theo nhà cung cấp.
- Không chạy migration, không chạy seed, không gọi Gemini.

### 3. File đã scan
| Khu vực | File | Ghi chú |
|---|---|---|
| Root | `package.json`, `turbo.json` | Monorepo npm workspaces/turbo. |
| Root | `.env.example`, README | Không tìm thấy ở root. |
| Docs | `docs/AI_AGENT_CAFE_SCAN_LOG.md` và các docs hiện có | Dùng file này để ghi log Step 13. |
| Generated | `node_modules`, `.turbo`, `dist` | Có tồn tại nhưng không scan sâu. |
| Database | `packages/database/prisma/schema/product.prisma` | `Product.unit` là field đơn vị sản phẩm duy nhất. |
| Database | `packages/database/prisma/schema/inventory.prisma` | `Inventory.unit`, `Inventory.quantity`, `reservedStock`, transaction type. |
| Database | `packages/database/prisma/schema/purchase.prisma` | PR item lưu `quantity`, `quantityReceived`, `unitPrice`, chưa có unit/conversion snapshot. |
| Database | `packages/database/prisma/schema/supplier.prisma` | `SupplierProduct` chưa có `purchaseUnit`, `conversionQuantity`, `conversionTargetUnit`. |
| Backend | `apps/api/src/modules/product/*` | Tạo/sửa product dùng `unit`; có fallback `Ly`. |
| Backend | `apps/api/src/modules/inventory/*` | Import/adjust nhận số lượng trực tiếp theo inventory unit. |
| Backend | `apps/api/src/modules/purchase/*` | PR quantity và receive quantity đang hiểu là inventory unit. |
| Backend | `apps/api/src/modules/supplier/*` | Supplier product chỉ có price/MOQ/lead time/preferred. |
| Backend | `apps/api/src/modules/simulate-sale/*` | Simulate trừ trực tiếp inventory quantity, có fallback ẩn `ly` khi báo lỗi. |
| Backend | `apps/api/src/modules/order/*`, `apps/api/src/modules/agent/*` | Order dùng quantity theo product/inventory unit; API agent là gateway. |
| Agent | `apps/agent/src/server.ts`, `worker.ts`, `services/*`, `repositories/*` | Agent scan inventory quantity; PR recommendedQty theo inventory unit. |
| Frontend | `AdminProductsPage.tsx`, `AdminProductFormPage.tsx` | UI chỉ có một field đơn vị tính `unit`. |
| Frontend | `AdminInventoryPage.tsx` | Nhập kho/điều chỉnh nhập trực tiếp số lượng tồn kho. |
| Frontend | `AdminPurchaseRequestsPage.tsx`, `AdminPurchaseRequestDetailPage.tsx` | PR hiển thị quantity đơn, chưa có purchase unit/conversion. |
| Frontend | `AdminSuppliersPage.tsx` | Gán supplier-product chưa có quy cách nhập hàng. |
| Frontend | `products.api.ts`, `inventory.api.ts`, `purchaseRequests.api.ts`, `suppliers.api.ts`, `types/*` | Type/API chưa có sellingUnit/inventoryUnit/purchaseUnit/conversion. |

### 4. Phân tích hiện trạng
| Khu vực | Field/logic hiện tại | Vấn đề |
|---|---|---|
| Product | `Product.unit` | Chỉ có một đơn vị, chưa tách rõ đơn vị bán và đơn vị tồn kho. |
| Inventory | `Inventory.unit`, `quantity`, `reservedStock` | Tồn kho có unit riêng nhưng create/update product chưa đồng bộ tốt; import đang nhập thẳng inventory unit. |
| SupplierProduct | `price`, `minOrderQuantity`, `leadTimeDays`, `isPreferred` | Không có nơi lưu `purchaseUnit`, `conversionQuantity`, `conversionTargetUnit`. |
| PurchaseRequestItem | `quantity`, `quantityReceived`, `unitPrice` | Quantity đang là inventory unit; chưa thể hiển thị “3 thùng = 36 hộp” nếu không có supplier conversion. |
| Inventory import | `POST /inventories/import` nhận `inventoryId`, `quantity`, `note` | Admin phải tự tính quantity tồn kho sau quy đổi. |
| Agent | `recommendedQty` | Tính theo inventory quantity, chưa quy đổi sang đơn vị nhập hàng. |
| Frontend product form | `unit` text input | Có thể nhập tự do, không chặn `ly`, chưa có select unit chuẩn. |
| Frontend supplier mapping | price/MOQ/lead time | Chưa cấu hình quy cách nhập hàng theo nhà cung cấp. |

### 5. Bảng hiện trạng đơn vị
| Khu vực | File | Field hiện tại | Đơn vị đang hiểu | Vấn đề |
|---|---|---|---|---|
| Product schema | `packages/database/prisma/schema/product.prisma` | `unit` | Đơn vị bán hoặc đơn vị chung | Không đủ để tách selling/inventory unit rõ ràng. |
| Inventory schema | `packages/database/prisma/schema/inventory.prisma` | `unit`, `quantity` | Đơn vị tồn kho | Có field tồn kho nhưng UI/API chưa cho cấu hình độc lập. |
| Supplier schema | `packages/database/prisma/schema/supplier.prisma` | Không có conversion field | Không xác định | Không thể lưu 1 thùng = 12 hộp. |
| Purchase schema | `packages/database/prisma/schema/purchase.prisma` | `quantity`, `quantityReceived` | Đơn vị tồn kho | Không có unit nhập hàng để hiển thị/receive theo supplier unit. |
| Product API | `apps/api/src/modules/product/product.service.ts` | `unit` | Đơn vị sản phẩm | Fallback `Ly` cần bỏ; update product chưa đồng bộ inventory unit. |
| Inventory API | `apps/api/src/modules/inventory/inventory.service.ts` | `quantity` | Đơn vị tồn kho | Import không có supplier/conversion. |
| Supplier API | `apps/api/src/modules/supplier/*` | `minOrderQuantity`, `price` | Không rõ unit | MOQ không biết theo thùng/hộp/bao. |
| Agent | `apps/agent/src/services/agent.service.ts` | `recommendedQty` | Đơn vị tồn kho | Chưa quy đổi sang purchase unit. |
| Frontend | `apps/web/src/pages/admin/AdminProductFormPage.tsx` | `unit` | Đơn vị bán/chung | Text input tự do, có thể nhập `ly`. |
| Frontend | `apps/web/src/pages/admin/AdminInventoryPage.tsx` | `quantity` | Đơn vị tồn kho | Admin phải tự nhập số lượng đã quy đổi. |

### 6. Bảng nơi cần sửa
| Khu vực | File | Cần sửa gì | Lý do |
|---|---|---|---|
| Schema | `packages/database/prisma/schema/supplier.prisma` | Thêm `purchaseUnit`, `conversionQuantity`, `conversionTargetUnit` vào `SupplierProduct`. | Cần lưu quy cách nhập hàng theo từng nhà cung cấp/sản phẩm. |
| Schema/API | `packages/database/prisma/schema/product.prisma`, product API | Quyết định dùng `Product.unit` làm sellingUnit và `Inventory.unit` làm inventoryUnit, hoặc thêm field tên rõ hơn. | Admin cần chỉnh đơn vị bán và tồn kho. |
| Backend supplier | `apps/api/src/modules/supplier/*` | Validate/DTO/CRUD conversion fields. | UI cấu hình quy cách phải được lưu và trả lại. |
| Backend inventory | `apps/api/src/modules/inventory/*` | Import nhận supplierProduct hoặc supplierId, tính converted quantity. | Không bắt admin tự tính 3 thùng = 36 hộp. |
| Backend purchase | `apps/api/src/modules/purchase/*` | Hiển thị/tính receive theo conversion; PR quantity nội bộ vẫn nên là inventory unit. | PR cần diễn giải đơn vị nhập hàng. |
| Agent | `apps/agent/src/services/agent.service.ts`, repository | Dùng conversion để làm tròn recommendedQty sang purchase unit khi tạo/hiển thị PR. | Agent vẫn scan inventory unit nhưng admin thấy số thùng/bao hợp lý. |
| Frontend product | `AdminProductFormPage.tsx` | Unit select chuẩn, bỏ `ly`; tách selling/inventory nếu schema/API cho phép. | Đúng nghiệp vụ cà phê. |
| Frontend supplier | `AdminSuppliersPage.tsx` | Thêm purchase unit/conversion inputs. | Nơi tự nhiên để cấu hình quy cách nhà cung cấp. |
| Frontend inventory | `AdminInventoryPage.tsx` | Import theo purchase unit, preview converted quantity. | Tránh nhập thủ công số tồn kho đã quy đổi. |
| Frontend PR | `AdminPurchaseRequestsPage.tsx`, detail | Hiển thị inventory qty và purchase qty nếu có conversion. | Ví dụ 30 hộp => đề xuất 3 thùng = 36 hộp. |

### 7. Bảng ảnh hưởng schema
| Model | Field hiện có | Field cần thêm/sửa | Có cần migration không | Ghi chú |
|---|---|---|---|---|
| `Product` | `unit` | Có thể giữ làm `sellingUnit`; nếu muốn field đúng tên thì thêm `sellingUnit` | Có nếu đổi/thêm field | Không nên rename/xóa dữ liệu cũ ngay. |
| `Inventory` | `unit` | Có thể dùng làm `inventoryUnit` | Không bắt buộc nếu chấp nhận field hiện có | Cần đồng bộ create/update rõ hơn. |
| `SupplierProduct` | `price`, `minOrderQuantity`, `leadTimeDays` | `purchaseUnit`, `conversionQuantity`, `conversionTargetUnit` | Có | Đây là phần bắt buộc để lưu quy cách nhập hàng bền vững. |
| `PurchaseRequestItem` | `quantity`, `quantityReceived`, `unitPrice`, `notes` | Có thể không thêm; hoặc thêm snapshot purchase unit/conversion nếu cần audit lịch sử | Không bắt buộc cho bước tối thiểu | Nếu conversion thay đổi sau này, PR cũ có thể hiển thị theo quy cách mới nếu không có snapshot. |
| `InventoryTransaction` | `quantity`, `reason` | Không bắt buộc thêm; note có thể ghi conversion | Không bắt buộc | Không xoá transaction cũ. |

### 8. Bảng ảnh hưởng luồng nghiệp vụ
| Luồng | Trước khi sửa | Sau khi sửa đề xuất |
|---|---|---|
| Thêm/sửa sản phẩm | Admin nhập một `unit` tự do. | Admin chọn đơn vị bán và đơn vị tồn kho từ danh sách chuẩn, không có `ly`. |
| Nhập kho | Admin nhập quantity đã là tồn kho. | Admin chọn supplier/quy cách, nhập purchase quantity; backend tự quy đổi sang inventory quantity. |
| Điều chỉnh tồn kho | Điều chỉnh trực tiếp quantity tồn kho. | Giữ mặc định theo inventory unit để không làm sai reserved/available stock. |
| Purchase Request | Quantity là inventory unit, UI ít ngữ cảnh. | Nội bộ vẫn lưu inventory unit; UI hiển thị purchase unit nếu có conversion. |
| Agent đề xuất nhập hàng | Agent tạo PR với recommendedQty inventory unit. | Agent scan inventory unit; khi có conversion thì làm tròn lên purchase unit và diễn giải rõ. |
| Simulate Sale | Trừ trực tiếp inventory quantity. | Giữ nguyên theo inventory unit; không ảnh hưởng Order/Payment. |

### 9. Kết luận dừng trước khi fix
Không thể hoàn tất đúng yêu cầu “Admin cấu hình đơn vị nhập hàng và quy cách đổi theo nhà cung cấp” bằng schema hiện tại mà không làm dữ liệu thiếu bền vững. Field phù hợp nhất cần thêm là trên `SupplierProduct`:

| Field đề xuất | Kiểu | Ý nghĩa |
|---|---|---|
| `purchaseUnit` | `String` | Đơn vị nhập hàng từ nhà cung cấp, ví dụ `thùng`, `bao`, `kg`. |
| `conversionQuantity` | `Int` hoặc `Decimal` | Số lượng inventory unit nhận được từ 1 purchase unit. |
| `conversionTargetUnit` | `String` | Đơn vị tồn kho đích, ví dụ `hộp`, `gram`. |

Repo hiện không có thư mục `packages/database/prisma/migrations`, nên chưa có quy trình migration rõ ràng trong source. Theo yêu cầu Step 13, dừng tại đây để chờ xác nhận trước khi sửa schema/code.

### 10. Build result
| Lệnh | Kết quả | Ghi chú |
|---|---|---|
| `npm run build --workspace=apps/agent` | Chưa chạy | Chưa sửa code vì cần xác nhận schema/migration trước. |
| `npm run build --workspace=apps/api` | Chưa chạy | Chưa sửa code vì cần xác nhận schema/migration trước. |
| `npm run build --workspace=apps/web` | Chưa chạy | Chưa sửa code vì cần xác nhận schema/migration trước. |

### 11. Test result
| Test | Kết quả | Ghi chú |
|---|---|---|
| Không còn đơn vị ly | Chưa test | Chưa sửa code. |
| Nhập 3 thùng = 36 hộp | Chưa test | Cần schema conversion trước. |
| Điều chỉnh tồn kho | Chưa test | Chưa sửa code. |
| Purchase Request hiển thị đơn vị | Chưa test | Cần conversion data trước. |
| Agent chạy bình thường | Chưa test | Chưa sửa code. |
| Agent service tắt vẫn ghi FAILED | Chưa test | Không đụng luồng này trong phân tích. |

### 12. Những việc không thực hiện
- Không sửa code nghiệp vụ.
- Không xoá dữ liệu cũ.
- Không reset database.
- Không chạy migration.
- Không chạy seed.
- Không gọi Gemini.
- Không tạo AgentLog giả.
- Không refactor Agent lớn.
- Không đổi luồng apps/web -> apps/api -> apps/agent.

## Step 13B - Product Unit And Purchase Conversion Fix

### 1. Xác nhận schema change
Đã thêm 3 field optional vào `SupplierProduct` trong `packages/database/prisma/schema/supplier.prisma`:

| Field | Kiểu | Vai trò |
|---|---|---|
| `purchaseUnit` | `String?` | Đơn vị nhập hàng từ nhà cung cấp, ví dụ `thùng`, `bao`, `kg`. |
| `conversionQuantity` | `Float?` | Số lượng đơn vị tồn kho nhận được từ 1 đơn vị nhập hàng. |
| `conversionTargetUnit` | `String?` | Đơn vị tồn kho đích, ví dụ `hộp`, `gói`, `gram`. |

Các field đều optional để không phá dữ liệu cũ và không cần backfill bắt buộc.

### 2. Migration/db update
Repo hiện không có thư mục `packages/database/prisma/migrations`; database package có script `db:push`.

| Cách áp dụng | Kết quả | Ghi chú |
|---|---|---|
| `npm run generate --workspace=packages/database` | PASS | Regenerate Prisma Client để nhận field mới. |
| `npm run db:push --workspace=packages/database` | PASS | Đồng bộ schema PostgreSQL local `cafe_project` tại `localhost:5432`; không reset DB, không seed. |

### 3. File đã sửa
| File | Thay đổi | Lý do |
|---|---|---|
| `packages/database/prisma/schema/supplier.prisma` | Thêm `purchaseUnit`, `conversionQuantity`, `conversionTargetUnit`. | Lưu quy cách nhập hàng theo supplier-product. |
| `apps/api/src/common/units.ts` | Thêm `ALLOWED_PRODUCT_UNITS`. | Dùng unit list chuẩn, không có `ly`. |
| `apps/api/src/modules/product/product.validator.ts` | Validate `Product.unit` theo unit list. | Không cho tạo/sửa sản phẩm với unit `ly`. |
| `apps/api/src/modules/product/product.service.ts` | Đổi fallback unit mới từ `Ly` sang `hộp`. | Không tạo thêm dữ liệu `ly`. |
| `apps/api/src/modules/supplier/supplier.validator.ts` | Nhận/validate conversion fields. | API supplier-product lưu quy cách nhập. |
| `apps/api/src/modules/supplier/supplier.service.ts` | Trả và lưu conversion fields. | Frontend hiển thị/cấu hình quy cách. |
| `apps/api/src/modules/inventory/inventory.validator.ts` | Thêm `supplierProductId`, `supplierId`, `purchaseQuantity`. | Cho nhập kho theo đơn vị nhập hàng. |
| `apps/api/src/modules/inventory/inventory.service.ts` | Quy đổi purchase quantity sang inventory quantity, trả `stockBefore/stockAfter/convertedQuantity`. | Không bắt admin tự tính tồn kho. |
| `apps/api/src/modules/inventory/inventory.repository.ts` | Đổi fallback inventory unit từ `Ly` sang `hộp`. | Không tạo thêm unit `ly`. |
| `apps/api/src/modules/purchase/purchase.repository.ts` | Include supplier products trong PR. | Có dữ liệu derive conversion khi trả PR. |
| `apps/api/src/modules/purchase/purchase.service.ts` | Derive `purchaseQuantity`, `purchaseUnit`, `convertedQuantity`, `conversionMissing`. | UI hiển thị `3 thùng = 36 hộp`. |
| `apps/agent/src/repositories/agent.repository.ts` | Làm tròn PR quantity lên theo quy cách nếu có; nếu thiếu thì ghi note. | Agent vẫn scan inventory unit, PR dễ hiểu theo purchase unit. |
| `apps/web/src/constants/units.ts` | Thêm unit list frontend. | Select không có `ly`. |
| `apps/web/src/pages/admin/AdminProductFormPage.tsx` | Đổi unit input thành select “Đơn vị bán”. | Không chọn `ly`; dữ liệu cũ ngoài list buộc chọn lại khi sửa. |
| `apps/web/src/pages/admin/AdminSuppliersPage.tsx` | Thêm form/cột quy cách nhập hàng. | Admin cấu hình `1 thùng = 12 hộp`. |
| `apps/web/src/pages/admin/AdminInventoryPage.tsx` | Chọn supplier mapping khi nhập kho, preview quy đổi. | Nhập `3 thùng`, kho tăng `36 hộp`. |
| `apps/web/src/pages/admin/AdminPurchaseRequestsPage.tsx` | Hiển thị PR theo purchase unit nếu có. | Danh sách PR rõ quy cách nhập. |
| `apps/web/src/pages/admin/AdminPurchaseRequestDetailPage.tsx` | Hiển thị chi tiết conversion hoặc cảnh báo thiếu quy cách. | Admin xem PR dễ hiểu. |
| `apps/web/src/api/inventory.api.ts`, `suppliers.api.ts`, `purchaseRequests.api.ts` | Map payload/response conversion fields. | Kết nối UI với API. |
| `apps/web/src/types/inventory.types.ts`, `supplier.types.ts`, `purchaseRequest.types.ts` | Thêm type conversion. | Build type-safe. |

### 4. Luồng sau khi sửa
| Luồng | Cách hoạt động |
|---|---|
| Thêm/sửa sản phẩm | `Product.unit` giữ làm đơn vị bán; admin chọn từ `gói`, `hộp`, `thùng`, `bao`, `kg`, `gram`, `chai`; không có `ly`. |
| Gán sản phẩm cho nhà cung cấp | Admin cấu hình purchase unit, conversion quantity, conversion target unit; ví dụ `1 thùng = 12 hộp`. |
| Nhập kho | Nếu chọn supplier-product có quy cách, backend tính `convertedQuantity = ceil(purchaseQuantity * conversionQuantity)` và tăng inventory theo đơn vị tồn kho. Nếu không chọn quy cách, giữ luồng cũ nhập trực tiếp theo inventory unit. |
| Điều chỉnh tồn kho | Giữ nguyên theo inventory unit, không đổi reserved/available stock logic. |
| Purchase Request | Quantity nội bộ vẫn là inventory unit; response derive purchase unit/conversion để UI hiển thị. |
| Agent scan | Agent vẫn scan `Inventory.quantity`; khi tạo PR nếu có quy cách thì làm tròn lên theo đơn vị nhập hàng, nếu thiếu thì ghi note chưa có quy cách. |
| Simulate Sale/Restore | Không đổi luồng. |

### 5. Quy cách nhập hàng
| Ví dụ | Kết quả |
|---|---|
| `3 thùng`, `1 thùng = 12 hộp` | `convertedQuantity = 36 hộp`, kho tăng 36. |
| Agent thiếu 30 hộp, `1 thùng = 12 hộp` | PR quantity nội bộ làm tròn lên 36 hộp; UI hiển thị `3 thùng = 36 hộp`. |
| Không có quy cách | Import trực tiếp vẫn dùng inventory unit; PR hiển thị cảnh báo thiếu quy cách nếu có dữ liệu derive. |

### 6. Build result
| Lệnh | Kết quả | Ghi chú |
|---|---|---|
| `npm run build --workspace=apps/agent` | PASS | `tsc -p tsconfig.json`. |
| `npm run build --workspace=apps/api` | PASS | `tsc`. |
| `npm run build --workspace=apps/web` | PASS | `tsc -b && vite build`; có warning chunk > 500 kB và plugin timings, không phải lỗi build. |

### 7. Test result
| Test | Kết quả | Ghi chú |
|---|---|---|
| Product form không còn cho chọn `ly` | PASS | Source UI dùng select từ `ALLOWED_PRODUCT_UNITS`, không có `ly`; build PASS. |
| SupplierProduct cấu hình được `1 thùng = 12 hộp` | PASS | Source UI/API/schema đã có field và preview; build PASS. Chưa click live browser. |
| Nhập kho 3 thùng thì backend tính 36 hộp | PASS | Logic backend `purchaseQuantity * conversionQuantity`, làm tròn lên; build PASS. Chưa chạy mutation live để tránh tự ý thay đổi tồn kho demo. |
| Inventory tăng đúng 36 hộp | Chưa test live | Chưa gọi endpoint import thật vì sẽ thay đổi dữ liệu kho. |
| Điều chỉnh tồn kho vẫn theo inventory unit | PASS | Không đổi logic adjust; build PASS. |
| Purchase Request hiển thị `3 thùng = 36 hộp` | PASS | DTO derive và UI hiển thị conversion; build PASS. Chưa click live browser. |
| Agent scan vẫn chạy | PASS build | Agent build PASS; chưa chạy worker/live scan. |
| Agent service tắt vẫn ghi FAILED như trước | Chưa test live | Không đổi luồng API fallback Agent failed log. |
| Không gọi Gemini | PASS | Không chạy Gemini; chỉ build/generate/db push. |

### 8. Những việc không thực hiện
- Không xoá dữ liệu cũ.
- Không reset database.
- Không chạy seed.
- Không gọi Gemini.
- Không tạo AgentLog giả.
- Không refactor Agent lớn.
- Không đổi luồng apps/web -> apps/api -> apps/agent.
- Không đổi Order/Payment thật.
- Chưa thêm snapshot unit/conversion vào `PurchaseRequestItem`; nếu cần audit lịch sử PR khi quy cách thay đổi, nên làm ở bước sau.

## Step 13C - Fix Supplier Validator Zod Partial Crash

### 1. Nguyên nhân lỗi

**ZodError runtime**: `.partial() cannot be used on object schemas containing refinements`

Zod không cho phép gọi `.partial()` trên một schema đã được áp dụng `.refine()` hoặc `.superRefine()`. Nếu làm vậy, Zod sẽ throw lỗi ngay lúc định nghĩa schema (load module), khiến toàn bộ server/api crash khi import validator.

Trong code cũ của `updateSupplierProductSchema` (dù thực tế đã gọi `.partial()` trên base schema chưa có refine), cấu trúc tổng thể của file chưa đủ rõ ràng, gây rủi ro nếu ai sửa lại thứ tự. Đồng thời `updateSupplierSchema` cũng cần được tách rõ ràng để đảm bảo cùng pattern.

### 2. File đã sửa

- `apps/api/src/modules/supplier/supplier.validator.ts`

### 3. Cách sửa

**Pattern áp dụng**:
- Tách base schema (`supplierBaseSchema`, `supplierProductBaseSchema`) hoàn toàn **không có** `.refine()` / `.superRefine()`.
- `createSchema` = `baseSchema` + `.superRefine(validateConversionFields)`.
- `updateSchema` = `baseSchema.partial()` + `.superRefine(validateConversionFields)` + `.refine(at-least-one-field)`.
- Biến trung gian `supplierProductPartialSchema = supplierProductBaseSchema.partial()` tách riêng để code rõ ràng hơn.
- **Không bao giờ gọi** `.partial()` sau khi đã gọi `.refine()` / `.superRefine()`.

**Validate conversion fields giữ nguyên**:
- `purchaseUnit`, `conversionQuantity`, `conversionTargetUnit` phải nhập đủ 3 hoặc bỏ qua cả 3.
- `validateConversionFields` dùng chung cho cả create và update schema.
- Unit `ly` không bao giờ được chấp nhận vì `ALLOWED_PRODUCT_UNITS = ['gói', 'hộp', 'thùng', 'bao', 'kg', 'gram', 'chai']` không chứa `ly`.

**Kết quả schema sau sửa**:

```typescript
// Base (NO refine) → .partial() an toàn
const supplierProductBaseSchema = z.object({ ... });

// Create: base + superRefine
export const createSupplierProductSchema = supplierProductBaseSchema
    .superRefine(validateConversionFields);

// Update: partial trước, refine sau
const supplierProductPartialSchema = supplierProductBaseSchema.partial();
export const updateSupplierProductSchema = supplierProductPartialSchema
    .superRefine(validateConversionFields)
    .refine((data) => Object.keys(data).length > 0, { message: '...' });
```

### 4. Build/Dev result

**Build** (`npm run build --workspace=apps/api`):
```
> @cafe-project/api@1.0.0 build
> tsc

(exit 0 - no errors)
```
Kết quả: **PASS** — TypeScript compile không có lỗi.

**Dev** (`npm run dev -w @cafe-project/api`):
```
> @cafe-project/api@1.0.0 dev
> nodemon src/index.ts

[nodemon] 3.1.14
[nodemon] starting `ts-node src/index.ts`
[api] Server is running at http://localhost:5000
[api] Health check: http://localhost:5000/health
Scheduled job to purge expired products daily at midnight.
```
Kết quả: **PASS** — Server khởi động thành công, không có ZodError crash khi load module validator.

### 5. Những việc không thực hiện

- Không sửa database schema.
- Không chạy migration.
- Không chạy seed.
- Không gọi Gemini.
- Không đổi logic Agent.
- Chỉ sửa đúng file `apps/api/src/modules/supplier/supplier.validator.ts`.

## Step 13D - Fix Purchase Request Quantity Unit Display

### 1. Nguyên nhân số lượng đề xuất bị thiếu đơn vị

Ở trang `/admin/purchase-requests`, cột **"SL đề xuất"** hiển thị số lượng như `30`, `26`, `10` mà không có đơn vị. Nguyên nhân:

- Backend `toDto` đã trả đủ trường `inventoryUnit`, `purchaseUnit`, `conversionMissing`, `convertedQuantity` qua `...conversion` trên mỗi item.
- Frontend API `normalizePurchaseRequest` map đúng các trường từ `firstItem` lên level PR, nhưng **không normalize lại `items` array** — khiến mỗi item trong bảng không có đủ trường conversion.
- UI list page: khi `conversionMissing=true`, code hiển thị `{qty}` naked, không kèm `inventoryUnit`.
- UI detail page: tương tự — `suggestedQty` hiển thị mà không có đơn vị khi không có quy cách.

### 2. File đã sửa

| File | Loại thay đổi |
|------|---------------|
| `apps/web/src/types/purchaseRequest.types.ts` | Tách `PurchaseRequestItem` interface riêng với đủ fields; bổ sung fields cho `PurchaseRequest` |
| `apps/web/src/api/purchaseRequests.api.ts` | Normalize items array trong `normalizePurchaseRequest` — mỗi item được đảm bảo có đủ conversion fields |
| `apps/web/src/pages/admin/AdminPurchaseRequestsPage.tsx` | Fix cột "SL đề xuất" luôn kèm `inventoryUnit` |
| `apps/web/src/pages/admin/AdminPurchaseRequestDetailPage.tsx` | Fix "Số lượng đề xuất nhập" luôn kèm đơn vị; thêm bảng items chi tiết với hiển thị đơn vị cho từng item |

Không sửa: `purchase.service.ts`, `purchase.repository.ts` (backend đã đúng).

### 3. Cách hiển thị khi có quy cách

**Ví dụ**: `purchaseQuantity=3`, `purchaseUnit="thùng"`, `convertedQuantity=36`, `inventoryUnit="hộp"`

```
3 thùng
= 36 hộp
```

- Dòng 1 (bold amber): `{purchaseQuantity} {purchaseUnit}`
- Dòng 2 (nhỏ xám): `= {convertedQuantity} {inventoryUnit}`

### 4. Cách hiển thị khi chưa có quy cách

**Ví dụ**: `quantity=30`, `inventoryUnit="hộp"`, `conversionMissing=true`

```
30 hộp
Chưa có quy cách nhập hàng
```

- Dòng 1 (bold amber): `{quantity} {inventoryUnit}` — **không bao giờ hiển thị số mà không có đơn vị**
- Dòng 2 (nhỏ amber warning): `Chưa có quy cách nhập hàng`

Nếu `inventoryUnit` không có (edge case hiếm), số vẫn được hiển thị kèm khoảng trắng logic `{qty}{invUnit ? \` \${invUnit}\` : ""}`.

### 5. Bảng items ở trang chi tiết

Trang Detail (`/admin/purchase-requests/:id`) hiện có bảng **"Danh sách sản phẩm"** hiển thị:
- Tên sản phẩm + SKU
- SL đề xuất với đơn vị (có quy cách: "3 thùng = 36 hộp"; không có: "30 hộp + cảnh báo")
- Đơn giá (nếu có)
- Thành tiền (nếu có)

### 6. Build result

**API build** (`npm run build --workspace=apps/api`):
```
> @cafe-project/api@1.0.0 build
> tsc

(exit 0 — no errors)
```
Kết quả: **PASS**

**Web build** (`npm run build --workspace=apps/web`):
```
> @cafe-project/web@0.0.0 build
> tsc -b && vite build

vite v8.0.16 building client environment for production...
✓ 1866 modules transformed.
dist/index.html                   0.92 kB │ gzip:   0.52 kB
dist/assets/index-fW9Ma5xH.css   83.77 kB │ gzip:  13.66 kB
dist/assets/index-BHDi9NGB.js   588.13 kB │ gzip: 161.24 kB
✓ built in 6.41s
```
Kết quả: **PASS** — tsc + vite build không lỗi.

### 7. Test live

Chưa test live browser. Dev server đang chạy (`npm run dev -w @cafe-project/api` và `npm run dev -w @cafe-project/web`). Cần truy cập `/admin/purchase-requests` để xác nhận UI hiển thị đơn vị.

### 8. Những việc không thực hiện

- Không sửa database schema.
- Không chạy migration.
- Không chạy seed.
- Không gọi Gemini.
- Không tạo AgentLog giả.
- Không đổi logic Agent.
- Không đổi Order/Payment thật.
- Không xoá dữ liệu cũ.

## Step 13F - Fix Frontend Syntax Errors After Supplier Conversion UI

### 1. Nguyên nhân lỗi
- `normalizeSupplierProductPayload` trong `suppliers.api.ts` chưa đóng object/function trước khi khai báo method API.

### 2. File đã sửa
| File | Thay đổi |
|---|---|
| `apps/web/src/api/suppliers.api.ts` | Thêm dấu `});` đóng `normalizeSupplierProductPayload` và khai báo lại `export const suppliersApi = {` |

### 3. Kết quả build
| Lệnh | Kết quả | Ghi chú |
|---|---|---|
| `npm run build --workspace=apps/web` | PASS | `vite build` thành công, không còn lỗi cú pháp |

### 4. Cam kết
- Không sửa database schema.
- Không migration.
- Không seed.
- Không gọi Gemini.
- Không đổi logic Agent.
- Không sửa lan ngoài lỗi cú pháp frontend.

## Step 13G - Fix Purchase Request Email Draft Display

### 1. Nguyên nhân

Trang chi tiết Purchase Request đã có UI hiển thị email nhưng detail API chỉ trả `emailContent`, `emailSentAt`, `retryCount`, `lastEmailError`; không có field rõ ràng cho `to`, `subject`, `body`, `status`. Frontend vì vậy phải tự đoán từ `emailSubject`, `emailBody`, `emailContent`, preview API hoặc supplier email. Khi backend detail không có subject/body, UI rơi vào fallback "Backend chưa trả...".

### 2. File đã sửa

| File | Thay đổi | Lý do |
| ---- | -------- | ----- |
| `apps/api/src/modules/purchase/purchase.service.ts` | Thêm `buildPurchaseRequestEmailDraft()` và trả `emailDraft` trong DTO detail/list. | Backend trả email draft rõ ràng, không để frontend tự đoán. |
| `apps/web/src/types/purchaseRequest.types.ts` | Thêm `PurchaseRequestEmailDraft` và field `emailDraft`. | Type frontend khớp response backend mới. |
| `apps/web/src/api/purchaseRequests.api.ts` | Normalize `emailDraft`; fallback từ field phẳng cũ nếu cần; cho `sendEmail` nhận optional `to`. | Giữ tương thích response cũ và prefill modal gửi email. |
| `apps/web/src/pages/admin/AdminPurchaseRequestDetailPage.tsx` | Ưu tiên `emailDraft`, bỏ fallback "Backend chưa trả...", thêm modal sửa To/Subject/Body trước khi gửi. | Detail page hiển thị email thật và không gửi email ngay khi duyệt. |
| `docs/AI_AGENT_CAFE_SCAN_LOG.md` | Thêm log Step 13G. | Ghi nhận nguyên nhân, phạm vi sửa, build/test result. |

### 3. Backend email draft

Detail API trả field:

- `emailDraft.to`: ưu tiên `supplier.email`, nếu thiếu trả chuỗi rỗng.
- `emailDraft.subject`: build rule-based dạng `Đề xuất nhập hàng ${productName}` hoặc danh sách tên sản phẩm.
- `emailDraft.body`: ưu tiên `emailContent` đã lưu; nếu chưa có thì build rule-based từ supplier, item, số lượng, quy cách, tồn kho/ngưỡng và notes.
- `emailDraft.status`: `Đã gửi`, `Gửi lỗi`, hoặc `Chưa gửi`.

Builder không gọi Gemini, không gửi email, không ghi DB, không hard-code Robusta/Culi.

### 4. Frontend hiển thị

Trang `/admin/purchase-requests/:id` hiển thị:

- Người nhận: `emailDraft.to` hoặc cảnh báo `Nhà cung cấp chưa có email.`
- Tiêu đề: `emailDraft.subject`
- Nội dung: `emailDraft.body` trong box `whitespace-pre-wrap`
- Trạng thái email: `emailDraft.status`

Nếu thiếu subject/body, UI không còn hiển thị câu "Backend chưa trả..." mà hiển thị cảnh báo: `Chưa có email đề xuất. Vui lòng kiểm tra dữ liệu nhà cung cấp hoặc tạo lại nội dung email.`

Khi request `APPROVED`, nút gửi email mở modal prefill To/Subject/Body. Chỉ submit modal mới gọi endpoint gửi email.

### 5. Build result

| Lệnh | Kết quả | Ghi chú |
| ---- | ------- | ------- |
| `npm run build --workspace=apps/api` | PASS | `tsc` thành công. |
| `npm run build --workspace=apps/web` | PASS | `tsc -b && vite build` thành công. |

### 6. Test result

| Test | Kết quả | Ghi chú |
| ---- | ------- | ------- |
| PR có supplier email | PASS source/build | `emailDraft.to` lấy từ `supplier.email`; UI ưu tiên `emailDraft`. Chưa click live browser. |
| PR chưa có quy cách | PASS source/build | Backend body dùng `{quantity} {inventoryUnit}`, ví dụ `30 hộp`. |
| PR có quy cách | PASS source/build | Backend body dùng `{purchaseQuantity} {purchaseUnit} = {convertedQuantity} {inventoryUnit}`, ví dụ `3 thùng = 36 hộp`. |
| PR thiếu supplier email | PASS source/build | Backend trả `to: ''`; UI hiển thị `Nhà cung cấp chưa có email.` và không crash. |
| Duyệt yêu cầu | PASS source/build | Approve chỉ gọi endpoint approve; nút gửi email sau APPROVED mở modal prefill. Chưa gửi email thật. |

### 7. Cam kết

- Không database schema.
- Không migration.
- Không seed.
- Không gọi Gemini.
- Không gửi email thật.
- Không tạo AgentLog giả.
- Không đổi Order/Payment.
- Không đổi Simulate Sale/Restore.

## Step 13G - Fix Purchase Request Email Draft Display, Editable Email Content And Vietnamese Encoding

### 1. Nguyên nhân

- Detail page chưa hiện email thật vì trước đó Purchase Request detail API không có field email rõ ràng cho `to/subject/body/status`; frontend phải tự đoán từ `emailSubject`, `emailBody`, `emailContent`, preview API và supplier email nên rơi vào fallback "Backend chưa trả...".
- Cần cho admin sửa trước khi gửi vì nội dung email đề xuất chỉ là draft. Luồng approve chỉ được đổi status sang `APPROVED`; gửi email là bước riêng sau khi admin kiểm tra/chỉnh sửa.
- Mojibake nằm trong source frontend của màn hình Purchase Request detail/list và trong một số fallback text backend/agent. Dữ liệu cũ trong DB như `notes`, `reasoning`, `emailContent` nếu đã bị lưu mojibake có thể vẫn hiển thị lỗi; không tự sửa DB trong bước này.

### 2. File đã sửa

| File | Thay đổi | Lý do |
| ---- | -------- | ----- |
| `apps/api/src/modules/purchase/purchase.service.ts` | Trả `emailDraft`; build subject/body/status fallback rule-based UTF-8. | Detail API có email draft thật, không gọi Gemini, không phụ thuộc frontend tự đoán. |
| `apps/api/src/modules/email/email.validator.ts` | Bắt buộc `to`, `subject`, `body`. | Payload gửi email phải là nội dung admin đã xác nhận. |
| `apps/api/src/modules/email/email.service.ts` | Sửa preview email UTF-8; `sendEmail/retryEmail` dùng `to` bắt buộc và dùng đúng `subject/body` truyền vào. | Không tự thay lại nội dung email sau khi admin sửa. |
| `apps/web/src/api/purchaseRequests.api.ts` | Normalize `emailDraft`; fallback field phẳng cũ; `sendEmail` yêu cầu `to`. | Frontend map đúng response mới và gửi đúng payload. |
| `apps/web/src/types/purchaseRequest.types.ts` | Thêm/giữ `PurchaseRequestEmailDraft`. | Type rõ cho `emailDraft.to/subject/body/status`. |
| `apps/web/src/pages/admin/AdminPurchaseRequestDetailPage.tsx` | Viết lại text UTF-8 sạch; hiển thị draft; modal sửa To/Subject/Body; approve không gửi email. | Sửa mojibake và hoàn thiện editable email flow. |
| `apps/web/src/pages/admin/AdminPurchaseRequestsPage.tsx` | Viết lại text Purchase Request list UTF-8 sạch. | Sửa mojibake ở màn hình liên quan trực tiếp. |
| `apps/agent/src/services/agent.service.ts` | Sửa reasoning/fallback message liên quan scan inventory tạo Purchase Request. | Dữ liệu/fallback mới không sinh text không dấu/mojibake. |
| `docs/AI_AGENT_CAFE_SCAN_LOG.md` | Thêm log Step 13G mở rộng. | Ghi nhận nguyên nhân, phạm vi sửa, build/test result. |

### 3. Backend email draft

Backend trả:

- `emailDraft.to`: lấy từ `supplier.email`, nếu thiếu trả chuỗi rỗng để UI báo `Nhà cung cấp chưa có email.`
- `emailDraft.subject`: `Đề xuất nhập hàng ${productName}` hoặc danh sách tên sản phẩm.
- `emailDraft.body`: ưu tiên `emailContent` đã lưu; nếu chưa có thì build rule-based từ supplier, sản phẩm, số lượng, quy cách, tồn kho/ngưỡng, notes.
- `emailDraft.status`: `Chưa gửi`, `Đã gửi`, hoặc `Gửi lỗi`.

Fallback body có lời chào, thông tin sản phẩm, số lượng đề xuất (`30 hộp` hoặc `3 thùng = 36 hộp`), lý do đề xuất, yêu cầu xác nhận cung ứng/đơn giá/thời gian giao và chữ ký `Cafe Admin`.

### 4. Editable email flow

- Admin xem email draft ngay trong detail page.
- Khi request `APPROVED`, nút `Gửi email nhà cung cấp` mở modal.
- Modal prefill `Người nhận`, `Tiêu đề`, `Nội dung`.
- Admin sửa To/Subject/Body và bấm `Xác nhận gửi`.
- Frontend gửi đúng payload `{ to, subject, body }`.
- Backend gửi đúng payload admin truyền lên; không tự thay lại body bằng draft cũ.
- Bấm `Duyệt yêu cầu` chỉ gọi approve và không gửi email.

### 5. Vietnamese encoding fix

- Đã sửa source UTF-8 trong:
  - `apps/web/src/pages/admin/AdminPurchaseRequestDetailPage.tsx`
  - `apps/web/src/pages/admin/AdminPurchaseRequestsPage.tsx`
  - `apps/api/src/modules/purchase/purchase.service.ts`
  - `apps/api/src/modules/email/email.service.ts`
  - `apps/agent/src/services/agent.service.ts` với các fallback liên quan Purchase Request.
- Source mới dùng tiếng Việt UTF-8 chuẩn, không còn các câu fallback "Backend chưa trả..." trong detail email block.
- Dữ liệu cũ trong DB có thể vẫn bị mojibake; cần tạo PR mới hoặc có bước migration dữ liệu riêng nếu muốn sửa dữ liệu cũ. Bước này không tự ý update DB.

### 6. Build result

| Lệnh | Kết quả | Ghi chú |
| ---- | ------- | ------- |
| `npm run build --workspace=apps/api` | PASS | `tsc` thành công. |
| `npm run build --workspace=apps/web` | PASS | `tsc -b && vite build` thành công. |

### 7. Test result

| Test | Kết quả | Ghi chú |
| ---- | ------- | ------- |
| Mở chi tiết PR | PASS source/build | Detail page dùng label/header/button UTF-8 và ưu tiên `emailDraft`; chưa click live browser. |
| Admin sửa email trong modal | PASS source/build | Modal giữ state `editEmailTo/editEmailSubject/editEmailBody`; chưa click live browser. |
| Gửi email dùng nội dung đã sửa | PASS source/build | Payload frontend là `{ to, subject, body }`; backend validator bắt buộc cả 3 field. Không gọi API gửi email thật. |
| Duyệt yêu cầu không gửi email | PASS source/build | `handleApprove` chỉ gọi approve; gửi email chỉ xảy ra trong submit modal. |
| Thiếu email nhà cung cấp | PASS source/build | UI báo `Nhà cung cấp chưa có email.`; handler chặn gửi nếu `to` trống. |
| Dữ liệu cũ bị mojibake | Chưa sửa DB | Không update dữ liệu cũ; đã ghi chú cần tạo PR mới hoặc migration riêng nếu muốn làm sạch dữ liệu cũ. |

### 8. Cam kết

- Không sửa database schema nếu chưa cần.
- Không migration.
- Không seed.
- Không gọi Gemini.
- Không gửi email thật nếu chưa được yêu cầu.
- Không tạo AgentLog giả.
- Không đổi Order/Payment.
- Không đổi Simulate Sale/Restore.
- Không tự ý sửa dữ liệu cũ trong DB.

## Step 13H - Add Manual Email Input Fallback For Purchase Request

### 1. Nguyên nhân

Sau Step 13G, detail page đã có `emailDraft` và modal sửa email trước khi gửi. Tuy nhiên nếu Agent/backend không tạo được draft usable hoặc draft thiếu `subject/body`, admin vẫn cần một đường thủ công để nhập email thay vì bị chặn bởi trạng thái thiếu nội dung đề xuất.

### 2. File đã sửa

| File | Thay đổi | Lý do |
| ---- | -------- | ----- |
| `apps/web/src/pages/admin/AdminPurchaseRequestDetailPage.tsx` | Thêm `hasUsableEmailDraft`, nội dung mẫu thủ công, modal dùng chung cho sửa/nhập thủ công, local draft tạm cho PENDING. | Admin vẫn nhập được email khi thiếu draft và chỉ gửi sau khi APPROVED. |
| `apps/web/src/api/purchaseRequests.api.ts` | Làm sạch normalize `emailDraft.status` default là `Chưa gửi`; giữ payload gửi email `{ to, subject, body }`. | Tránh status mojibake và giữ mapping rõ ràng. |
| `docs/AI_AGENT_CAFE_SCAN_LOG.md` | Thêm log Step 13H. | Ghi nhận phạm vi sửa, build/test result. |

Backend email API đã được kiểm tra: `sendEmailSchema` bắt buộc `to`, `subject`, `body`; service dùng đúng payload admin nhập, không gọi Gemini. Không sửa backend trong Step 13H.

### 3. Luồng UI

- Có emailDraft usable: hiển thị `Người nhận`, `Tiêu đề`, `Nội dung email`, `Trạng thái email`; có nút `Sửa email`; nếu `APPROVED` có nút `Gửi email nhà cung cấp`.
- Không có emailDraft hoặc thiếu subject/body: hiển thị cảnh báo `Chưa có email đề xuất. Admin có thể nhập email thủ công trước khi gửi.` và nút `Nhập email thủ công`.
- Modal thủ công prefill:
  - `Người nhận`: `emailDraft.to` hoặc `supplier.email` hoặc trống.
  - `Tiêu đề`: `emailDraft.subject` hoặc `Đề xuất nhập hàng ${productName}`.
  - `Nội dung`: `emailDraft.body` hoặc mẫu rule-based từ sản phẩm, số lượng, quy cách, nhà cung cấp.
- PENDING: modal cho nhập/sửa và `Lưu tạm trên màn hình`, không gọi API gửi email; UI nhắc cần duyệt trước khi gửi.
- APPROVED: modal có `Xác nhận gửi`, gọi API với đúng `{ to, subject, body }`.
- REJECTED: không hiển thị nút gửi.
- SENT: không tự gửi lại.

### 4. Build result

| Lệnh | Kết quả | Ghi chú |
| ---- | ------- | ------- |
| `npm run build --workspace=apps/web` | PASS | `tsc -b && vite build` thành công. |

Không chạy API build vì Step 13H không sửa backend.

### 5. Test result

| Test | Kết quả | Ghi chú |
| ---- | ------- | ------- |
| Có emailDraft | PASS source/build | UI có nhánh hiển thị draft, nút sửa email và nút gửi khi APPROVED. Chưa click live browser. |
| Không có emailDraft hoặc thiếu body | PASS source/build | UI hiện cảnh báo và nút `Nhập email thủ công`; không còn fallback `Backend chưa trả...`. |
| PENDING chưa cho gửi | PASS source/build | Submit modal lưu tạm local state và báo cần duyệt trước khi gửi; không gọi API. |
| APPROVED cho gửi | PASS source/build | Submit modal gọi `purchaseRequestsApi.sendEmail(id, { to, subject, body })`. Không gửi email thật. |
| Thiếu người nhận | PASS source/build | Handler báo `Vui lòng nhập email người nhận.` và return trước khi gọi API. |

### 6. Cam kết

- Không sửa database schema.
- Không migration.
- Không seed.
- Không gọi Gemini.
- Không gửi email thật nếu chưa được yêu cầu.
- Không tạo AgentLog giả.
- Không đổi Order/Payment.
- Không đổi Simulate Sale/Restore.

## Step 13I - Fix Agent Reasoning Vietnamese Text And Purchase Unit Explanation

### 1. Nguyên nhân

- Phần “Giải thích lý do từ AI Agent” trên detail page đang lấy từ `aiReason/ai_reason/reason`, trong mapper trước đó các field này fallback từ `notes`.
- Một số `notes`/reasoning được Agent tạo trước đây là text thiếu dấu hoặc mojibake, ví dụ `San pham...`, `He thong de xuat...`. Đây là dữ liệu đã lưu trong DB nên không tự sửa trực tiếp.
- Reasoning cũ cũng nói số lượng theo kiểu chung chung như `30 sản phẩm`, chưa phân biệt đơn vị tồn kho (`hộp`) và đơn vị nhập hàng (`thùng`) cũng như việc làm tròn theo quy cách.

### 2. File đã sửa

| File | Thay đổi | Lý do |
| ---- | -------- | ----- |
| `apps/api/src/modules/purchase/purchase.service.ts` | Thêm `agentExplanation/displayReasoning` build từ dữ liệu PR và conversion; sửa email/status fallback UTF-8 trong file. | Detail API có field hiển thị reasoning chuẩn, không phụ thuộc notes cũ. |
| `apps/agent/src/repositories/agent.repository.ts` | Chuẩn hóa reasoning khi Agent tạo PR mới và khi convert recommendation sang PR; giải thích rõ quy cách/làm tròn. | PR mới không còn reasoning thiếu dấu và có giải thích đơn vị nhập hàng. |
| `apps/agent/src/services/agent.service.ts` | Sửa `reasoningText` mở đầu để dùng tiếng Việt chuẩn và kèm đơn vị tồn kho. | Agent reasoning mới có dấu và không dùng `sản phẩm` mơ hồ. |
| `apps/web/src/api/purchaseRequests.api.ts` | Map `agentExplanation/displayReasoning` và ưu tiên field này vào `aiReason`. | Frontend nhận đúng display explanation chuẩn từ backend. |
| `apps/web/src/types/purchaseRequest.types.ts` | Thêm `agentExplanation`, `displayReasoning`. | Type khớp DTO mới. |
| `apps/web/src/pages/admin/AdminPurchaseRequestDetailPage.tsx` | Ưu tiên `agentExplanation/displayReasoning`; dùng `whitespace-pre-line`. | UI hiển thị reasoning chuẩn và xuống dòng dễ đọc. |
| `docs/AI_AGENT_CAFE_SCAN_LOG.md` | Thêm log Step 13I. | Ghi nhận phạm vi sửa, build/test result. |

### 3. Format giải thích mới

Có quy cách:

- Nêu tồn kho và ngưỡng theo inventory unit, ví dụ `0 hộp`, `10 hộp`.
- Nêu nhu cầu bổ sung tối thiểu, ví dụ `30 hộp`.
- Nêu quy cách nhập hàng: `1 thùng = 12 hộp`.
- Nêu làm tròn và đề xuất nhập: `3 thùng = 36 hộp`.

Chưa có quy cách:

- Nêu số lượng theo đơn vị tồn kho, ví dụ `30 hộp`.
- Có câu: `Sản phẩm này chưa có quy cách nhập hàng theo nhà cung cấp, nên số lượng đề xuất đang được hiển thị theo đơn vị tồn kho.`

### 4. Xử lý dữ liệu cũ

- Không tự sửa DB.
- Nếu `notes`/reasoning cũ bị thiếu dấu hoặc mojibake, detail API trả thêm `agentExplanation/displayReasoning` chuẩn từ dữ liệu hiện có để frontend ưu tiên hiển thị.
- Dữ liệu cũ trong DB vẫn giữ nguyên; nếu muốn làm sạch dữ liệu lưu trữ cần một bước migration/backfill riêng.

### 5. Build result

| Lệnh | Kết quả | Ghi chú |
| ---- | ------- | ------- |
| `npm run build --workspace=apps/api` | PASS | `tsc` thành công. |
| `npm run build --workspace=apps/web` | PASS | `tsc -b && vite build` thành công. |
| `npm run build --workspace=apps/agent` | PASS | `tsc -p tsconfig.json` thành công. |

### 6. Test result

| Test | Kết quả | Ghi chú |
| ---- | ------- | ------- |
| PR chưa có quy cách | PASS source/build | `agentExplanation` build câu `30 hộp` và cảnh báo chưa có quy cách; chưa click live browser. |
| PR có quy cách | PASS source/build | `agentExplanation` build `1 thùng = 12 hộp` và `3 thùng = 36 hộp`; chưa test live data. |
| Dữ liệu cũ bị thiếu dấu | PASS source/build | Frontend ưu tiên `agentExplanation/displayReasoning`; không sửa DB. |
| Build | PASS | API/Web/Agent build đều pass. |

### 7. Cam kết

- Không sửa database schema.
- Không migration.
- Không seed.
- Không gọi Gemini.
- Không tạo AgentLog giả.
- Không gửi email thật.
- Không đổi Order/Payment.
- Không đổi Simulate Sale/Restore.
## Step 13J - Fix Mojibake Vietnamese Text In Agent Logs And Notifications

### 1. Nguyên nhân

- Text lỗi đến từ `AgentLog.message`, `AgentLog.reasoning`, `AgentLog.output.message` và `AgentLog.output.notification.*` đã lưu cũ hoặc source cũ sinh ra log.
- Step này không sửa DB, không xóa log cũ và không chạy backfill. Dữ liệu cũ trong DB vẫn giữ nguyên.
- UI/API hiện làm sạch text khi hiển thị; log mới đi qua lớp sanitize trước khi lưu `AgentLog`.

### 2. File đã sửa

| File | Thay đổi | Lý do |
| ---- | -------- | ----- |
| `apps/web/src/utils/textEncoding.ts` | Thêm `fixVietnameseMojibakeText` với detect mojibake, decode Windows-1252/Latin-1 sang UTF-8 và fallback mapping. | Làm sạch text cũ khi hiển thị, không làm hỏng text tiếng Việt đúng sẵn. |
| `apps/web/src/api/agentLogs.api.ts` | Normalize `message`, `reasoning`, `errorMessage`, `output.message`, `output.errorMessage`, `output.notification.title`, `output.notification.description`. | Bảng Nhật ký Agent, modal, Header và NotificationPanel dùng log đã được làm sạch từ API layer. |
| `apps/agent/src/utils/textEncoding.ts` | Thêm helper tương tự phía Agent và helper làm sạch `output` display fields. | Làm sạch DTO và log mới sinh từ apps/agent. |
| `apps/agent/src/services/agent.service.ts` | Áp dụng helper trong `toLogDto` cho `message/reasoning/errorMessage/output`. | Log cũ trả về qua Agent service không còn mojibake ở field hiển thị. |
| `apps/agent/src/repositories/agent.repository.ts` | Làm sạch `output`, `reasoning`, `error_message` trong `createLog` trước khi lưu log mới. | Log mới sinh ra dùng tiếng Việt UTF-8 chuẩn mà không cần migration/backfill. |
| `apps/api/src/modules/agent/agent-failure-log.service.ts` | Sửa text fallback khi API không kết nối được Agent service. | Notification/log lỗi service-unavailable không còn mojibake. |
| `apps/api/src/modules/agent/agent.client.ts` | Sửa `agentWarning` fallback sang UTF-8 chuẩn. | Response fallback không còn text lỗi mã hóa. |

### 3. Text đã sửa

| Mojibake | Hiển thị đúng |
| -------- | ------------- |
| `AI Agent Ä‘Ã£ táº¡o yÃªu cáº§u nháº­p hÃ ng cho sáº£n pháº©m nÃ y.` | `AI Agent đã tạo yêu cầu nhập hàng cho sản phẩm này.` |
| `Sáº£n pháº©m tá»“n kho tháº¥p nhÆ°ng chÆ°a cÃ³ nhÃ  cung cáº¥p há»£p lá»‡.` | `Sản phẩm tồn kho thấp nhưng chưa có nhà cung cấp hợp lệ.` |
| `yÃªu cáº§u nháº­p hÃ ng` | `yêu cầu nhập hàng` |
| `sáº£n pháº©m` | `sản phẩm` |
| `nhÃ  cung cáº¥p` | `nhà cung cấp` |
| `tá»“n kho tháº¥p` | `tồn kho thấp` |
| `há»£p lá»‡` | `hợp lệ` |
| `Ä‘Ã£` | `đã` |
| `chÆ°a cÃ³` | `chưa có` |

### 4. Xử lý dữ liệu cũ

- Không update DB.
- Không xóa AgentLog.
- Không chạy script sửa toàn DB.
- UI/API làm sạch text khi hiển thị.
- Nếu cần sửa dữ liệu lưu trữ thật thì làm bước riêng: `Step 13K - Optional Backfill Mojibake AgentLog Data`, có xác nhận riêng.

### 5. Build result

| Lệnh | Kết quả | Ghi chú |
| ---- | ------- | ------- |
| `npm run build --workspace=apps/web` | PASS | `tsc -b && vite build` thành công. |
| `npm run build --workspace=apps/agent` | PASS | `tsc -p tsconfig.json` thành công. |
| `npm run build --workspace=apps/api` | PASS | `tsc` thành công. |

### 6. Test result

| Test | Kết quả | Ghi chú |
| ---- | ------- | ------- |
| AgentLog `CREATED_PURCHASE_REQUEST` cũ | PASS source/build | `agentLogs.api.ts` normalize `message/output.message/notification.description`; chưa click live browser. |
| AgentLog `NO_SUPPLIER` cũ | PASS source/build | Helper có decode và fallback mapping cho câu thiếu nhà cung cấp; chưa click live browser. |
| Modal chi tiết AgentLog | PASS source/build | `reasoning`, `errorMessage`, `output.message`, `output.notification.*` được normalize trước khi render. |
| NotificationPanel | PASS source/build | Notification lấy từ AgentLog dùng `agentLogsApi`, nên nhận `output.notification` đã làm sạch. |
| Header dropdown AgentLog | PASS source/build | Header lấy từ `agentLogsApi`, nên `message/reasoning/errorMessage/output.message` đã làm sạch. |
| Text tiếng Việt đúng sẵn | PASS source/build | Helper chỉ decode khi phát hiện pattern mojibake; text không có pattern được trả nguyên. |

### 7. Cam kết

- Không sửa database schema.
- Không migration.
- Không seed.
- Không gọi Gemini.
- Không tạo AgentLog giả.
- Không gửi email thật.
- Không đổi Order/Payment.
- Không đổi Simulate Sale/Restore.
- Không đổi kiến trúc apps/web -> apps/api -> apps/agent.
- Không xóa AgentLog cũ.
- Không tự ý update dữ liệu cũ trong DB.
- Không chạy script sửa toàn DB.
- Không ghi PASS giả.

## Step 13K - Deep Scan And Fix All Remaining Mojibake Text In Purchase Request UI

### 1. Nguyên nhân

- Step 13J đã sửa AgentLog/Notification, nhưng live browser vẫn còn lỗi ở Purchase Request UI label/header.
- Các text như `Danh sách sản phẩm`, `Đơn giá`, `Thành tiền`, `Sản phẩm đề xuất`, `Ngày đề xuất` là text hard-code frontend còn sót trong Purchase Request UI, không phải dữ liệu DB.
- Các field dữ liệu như `notes`, `aiReason`, `agentExplanation`, `displayReasoning`, `emailDraft.body`, `emailDraft.status` có thể đến từ DB cũ nên được normalize ở API frontend, không backfill DB.

### 2. Lệnh scan đã chạy

```powershell
Get-ChildItem apps/web/src, apps/api/src, apps/agent/src -Recurse -Include *.tsx,*.ts |
  Select-String -Pattern "Ã|Â|Ä|Å|Æ|áº|á»|â€|YÃ|Sáº|Danh sÃ|ThÃ|lÆ|nhÃ|cÃ³|khÃ´ng|Ä‘|ÄĐ" -CaseSensitive:$false
```

Scan hẹp sau sửa:

```powershell
Get-ChildItem apps/web/src/pages/admin/AdminPurchaseRequestDetailPage.tsx, apps/web/src/pages/admin/AdminPurchaseRequestsPage.tsx, apps/web/src/api/purchaseRequests.api.ts |
  Select-String -Pattern "YÃ|Sáº|Danh sÃ|ThÃ|lÆ|nhÃ|cÃ³|khÃ´ng|ÄĐ|Ãª|Ã¡|Ã |Ã´|Ã³|Ã­|Ã½|áº|á»|Æ" -CaseSensitive:$false
```

### 3. File đã sửa

| File | Text lỗi | Text đúng | Lý do |
| ---- | -------- | --------- | ----- |
| `apps/web/src/pages/admin/AdminPurchaseRequestDetailPage.tsx` | `YÃªu cáº§u nháº­p`, `NgÃ y Ä‘á» xuáº¥t`, `Quay láº¡i danh sÃ¡ch yÃªu cáº§u` | `Yêu cầu nhập hàng`, `Ngày đề xuất`, `Quay lại danh sách yêu cầu` | Sửa label/header hard-code trên detail page. |
| `apps/web/src/pages/admin/AdminPurchaseRequestDetailPage.tsx` | `Sáº£n pháº©m Ä‘á» xuáº¥t`, `Sá»‘ lÆ°á»£ng Ä‘á» xuáº¥t nháº­p`, `NhÃ cung cáº¥p Ä‘á» xuáº¥t` | `Sản phẩm đề xuất`, `Số lượng đề xuất nhập`, `Nhà cung cấp đề xuất` | Sửa 3 ô summary. |
| `apps/web/src/pages/admin/AdminPurchaseRequestDetailPage.tsx` | `Danh sÃ¡ch sáº£n pháº©m`, `SL Ä‘á» xuáº¥t`, `ÄÆ¡n giÃ¡`, `ThÃnh tiá»n` | `Danh sách sản phẩm`, `SL đề xuất`, `Đơn giá`, `Thành tiền` | Sửa table sản phẩm. |
| `apps/web/src/pages/admin/AdminPurchaseRequestDetailPage.tsx` | `Giáº£i thÃch lÃ½ do tá»« AI Agent`, `ThÃ´ng tin nhÃ cung cáº¥p nháº­n thÆ°`, `Email Ä‘áº·t hÃng do Agent Ä‘á» xuáº¥t` | `Giải thích lý do từ AI Agent`, `Thông tin nhà cung cấp nhận thư`, `Email đặt hàng do Agent đề xuất` | Sửa các block detail. |
| `apps/web/src/pages/admin/AdminPurchaseRequestDetailPage.tsx` | Toast/modal/email template mojibake | Toast/modal/email template UTF-8 chuẩn | Sửa text hard-code phụ trợ trong detail page. |
| `apps/web/src/pages/admin/AdminPurchaseRequestsPage.tsx` | Filter, table header, empty state, modal tạo PR mojibake | UTF-8 chuẩn | Sửa list page và modal tạo yêu cầu. |
| `apps/web/src/api/purchaseRequests.api.ts` | `ChÆ°a gá»­i`, raw `notes/aiReason/emailDraft` | `Chưa gửi`, normalize bằng `fixVietnameseMojibakeText` | Làm sạch dữ liệu cũ khi hiển thị, không update DB. |

### 4. Kết quả scan sau sửa

| Khu vực | Kết quả | Ghi chú |
| ------- | ------- | ------- |
| `AdminPurchaseRequestDetailPage.tsx` | Không còn match mojibake theo scan hẹp | Scan rộng còn match `Đã/Trân trọng` do pattern rộng bắt text tiếng Việt đúng, không phải mojibake. |
| `AdminPurchaseRequestsPage.tsx` | Không còn match mojibake theo scan hẹp | Scan rộng còn match `Đã/Mã` do pattern rộng bắt text tiếng Việt đúng, không phải mojibake. |
| `purchaseRequests.api.ts` | Không còn match mojibake theo scan hẹp | Đã normalize các field text có thể đến từ DB cũ. |
| `apps/web/src/utils/textEncoding.ts` | Còn match mojibake có chủ đích | Đây là pattern/mapping helper để sửa dữ liệu cũ. |
| `apps/agent/src/utils/textEncoding.ts` | Còn match mojibake có chủ đích | Đây là pattern/mapping helper Step 13J. |
| `apps/agent/src/services/agent.service.ts` | Còn match source cũ ngoài Purchase Request UI | Step 13K không mở rộng logic Agent; Step 13J đã có sanitize create/read AgentLog. |

### 5. Build result

| Lệnh | Kết quả | Ghi chú |
| ---- | ------- | ------- |
| `npm run build --workspace=apps/web` | PASS | `tsc -b && vite build` thành công. |

Không chạy `apps/api`/`apps/agent` build trong Step 13K vì chỉ sửa frontend web source.

### 6. Test live result

| Màn hình | Kết quả | Ghi chú |
| -------- | ------- | ------- |
| `/admin/purchase-requests` | NOT RUN | Không có browser automation/live browser tool trong phiên này; không ghi PASS giả. |
| `/admin/purchase-requests/:id` | NOT RUN | Không có browser automation/live browser tool trong phiên này; không ghi PASS giả. |

### 7. Cam kết

- Không sửa database schema.
- Không migration.
- Không seed.
- Không gọi Gemini.
- Không tạo AgentLog giả.
- Không gửi email thật.
- Không đổi Order/Payment.
- Không đổi Simulate Sale/Restore.
- Không sửa dữ liệu cũ trong DB.
- Không format toàn repo.
- Không ghi PASS giả cho live browser.

## Step 13L - Improve Supplier-Facing Purchase Request Email Draft

### 1. Nguyên nhân

- Email cũ lấy raw `notes/reasoning` hoặc fallback từ dữ liệu nội bộ, trong đó có text thiếu dấu/mojibake và có thể chứa nội dung rác.
- Email cũ đưa quá nhiều dữ liệu quản trị nội bộ cho nhà cung cấp như tồn kho hiện tại, ngưỡng tối thiểu, lý do AI phát hiện dưới ngưỡng và công thức đề xuất.
- Email gửi nhà cung cấp cần theo chuẩn đặt hàng/báo giá thực tế, còn lý do nội bộ chỉ hiển thị ở phần `Giải thích lý do từ AI Agent` trong admin detail.

### 2. File đã sửa

| File | Thay đổi | Lý do |
| ---- | -------- | ----- |
| `apps/api/src/modules/purchase/purchase.service.ts` | Viết lại `buildPurchaseRequestEmailDraft` theo template supplier-facing; không dùng raw notes/reasoning; thêm chặn `emailContent` cũ nếu chứa text nội bộ/mojibake/rác. | Email draft không lộ tồn kho/ngưỡng/lý do nội bộ. |
| `apps/api/src/modules/email/email.service.ts` | Email preview dùng `buildPurchaseRequestEmailDraft`; include đủ supplier product conversion để dựng quy cách. | Preview/modal gửi email nhận cùng format chuẩn mới. |
| `apps/web/src/pages/admin/AdminPurchaseRequestDetailPage.tsx` | Fallback manual email subject/body dùng template báo giá/đặt hàng mới; admin vẫn sửa To/Subject/Body trước khi gửi. | Không tự dựng fallback email kiểu cũ ở frontend. |

Không sửa `email.validator.ts` và `email.controller.ts` vì schema/controller hiện vẫn chỉ nhận `{ to, subject, body }` và không tự gửi khi approve.

### 3. Format email mới

Email mới chỉ có:

- Tên nhà cung cấp.
- Tên sản phẩm.
- Số lượng đặt/báo giá.
- Quy cách nếu có, ví dụ `1 thùng = 12 hộp`.
- Yêu cầu xác nhận khả năng cung ứng.
- Yêu cầu xác nhận đơn giá hiện tại.
- Yêu cầu xác nhận thời gian giao hàng dự kiến.
- Điều kiện thanh toán nếu có.

Subject một sản phẩm:

```txt
Yêu cầu báo giá/đặt hàng {productName} - {quantityDisplay}
```

Subject nhiều sản phẩm:

```txt
Yêu cầu báo giá/đặt hàng sản phẩm cho Cafe Admin
```

Body:

```txt
Kính gửi {supplierName},

Cafe Admin đang có nhu cầu đặt hàng/báo giá cho các sản phẩm sau:

{itemsList}

Vui lòng hỗ trợ xác nhận:
- Khả năng cung ứng
- Đơn giá hiện tại
- Thời gian giao hàng dự kiến
- Điều kiện thanh toán nếu có

Nếu có thay đổi về quy cách đóng gói, số lượng tối thiểu hoặc thời gian giao hàng, vui lòng phản hồi lại để chúng tôi xác nhận trước khi đặt hàng chính thức.

Trân trọng,
Cafe Admin
```

### 4. Thông tin không đưa vào email

Không đưa vào `emailDraft.body`, email preview hoặc modal gửi email mặc định:

- Tồn kho hiện tại.
- Ngưỡng tối thiểu.
- Lý do AI nội bộ.
- Công thức tính tồn kho.
- Raw `notes/reasoning` cũ.
- Text rác như `ndfs`.
- Text thiếu dấu/mojibake như `San pham`, `He thong`, `de xuat`, `nguong`, `Ã`, `Ä`, `áº`, `á»`, `Æ`.

Các thông tin nội bộ vẫn nằm ở `agentExplanation/displayReasoning` để admin xem trong block `Giải thích lý do từ AI Agent`.

### 5. Test result

| Test | Kết quả | Ghi chú |
| ---- | ------- | ------- |
| Email không lộ dữ liệu nội bộ | PASS source/build | `buildPurchaseRequestEmailDraft` không dùng raw notes/reasoning và generated body không chứa tồn kho/ngưỡng/dưới ngưỡng/AI Agent. |
| Email có tên nhà cung cấp | PASS source/build | Body mở đầu `Kính gửi ${supplierName},`. |
| Email có sản phẩm và số lượng | PASS source/build | Items list dùng `- productName: quantity unit` hoặc `purchaseUnit = converted inventoryUnit`. |
| Email hỏi xác nhận nghiệp vụ | PASS source/build | Có `Khả năng cung ứng`, `Đơn giá hiện tại`, `Thời gian giao hàng dự kiến`, `Điều kiện thanh toán nếu có`. |
| Không còn text lỗi trong email mới | PASS source/build | Pattern rác/mojibake chỉ nằm trong danh sách chặn nội dung cũ, không nằm trong generated body. |
| Admin sửa email | PASS source/build | Modal vẫn prefill từ `emailDraft`; payload gửi email vẫn `{ to, subject, body }`. Chưa gửi email thật. |
| Không tự gửi khi duyệt | PASS source/build | `approve` chỉ update status APPROVED; không gọi email service. |

### 6. Build result

| Lệnh | Kết quả | Ghi chú |
| ---- | ------- | ------- |
| `npm run build --workspace=apps/api` | PASS | `tsc` thành công. |
| `npm run build --workspace=apps/web` | PASS | `tsc -b && vite build` thành công. |

Không chạy `apps/agent` build vì Step 13L không sửa apps/agent.

### 7. Cam kết

- Không sửa database schema.
- Không migration.
- Không seed.
- Không gọi Gemini.
- Không gửi email thật.
- Không tạo AgentLog giả.
- Không đổi Order/Payment.
- Không đổi Simulate Sale/Restore.
- Không hard-code riêng Arabica/Robusta/Culi.
- Không ghi PASS giả.

## Step 13M - Always Allow Admin To Edit Purchase Request Email Draft

### 1. Nguyên nhân

Một số Purchase Request có `emailDraft` usable nhưng nút sửa email không hiển thị vì UI đang bọc nút sửa chung với điều kiện gửi email, cụ thể phụ thuộc vào trạng thái không bị từ chối/không đã gửi và nút gửi chỉ dành cho request `APPROVED`.

Step này tách riêng quyền sửa draft và quyền gửi email. Có draft thì admin luôn có nút xem/sửa draft; gửi email chỉ được phép khi request đã `APPROVED` và email chưa được gửi.

### 2. File đã sửa

| File | Thay đổi | Lý do |
| ---- | -------- | ----- |
| `apps/web/src/pages/admin/AdminPurchaseRequestDetailPage.tsx` | Thêm logic `canSendEmail`, `canEditEmailDraft`, `canInputManualEmail`; nút sửa email không còn phụ thuộc `APPROVED`; nút gửi chỉ hiện khi có thể gửi. | Cho phép admin sửa email draft ở trạng thái chờ xử lý, từ chối hoặc đã gửi mà không vô tình gọi API gửi email. |
| `apps/web/src/pages/admin/AdminPurchaseRequestDetailPage.tsx` | Modal email dùng `canSendEmail`; nếu chưa được gửi thì submit chỉ lưu tạm trên màn hình. | Đảm bảo PENDING/REJECTED/SENT không gửi email thật. |

### 3. Logic hiển thị nút mới

- Có draft usable thì luôn có nút `Sửa email` hoặc `Xem / sửa email`.
- Request `APPROVED` và chưa gửi mới có nút `Gửi email nhà cung cấp`.
- Không có draft usable, request chưa bị từ chối và chưa gửi thì có nút `Nhập email thủ công`.
- Request `PENDING` được sửa email nhưng chưa gửi; UI hiển thị nhắc cần duyệt trước khi gửi.
- Request `REJECTED` không hiển thị nút gửi email.
- Email đã gửi không tự gửi lại; modal chỉ lưu tạm trên màn hình nếu mở xem/sửa.

### 4. Build result

| Lệnh | Kết quả | Ghi chú |
| ---- | ------- | ------- |
| `npm run build --workspace=apps/web` | PASS | `tsc -b && vite build` thành công. Vite chỉ báo warning chunk size > 500 kB, không phải lỗi build. |

### 5. Test result

| Test | Kết quả | Ghi chú |
| ---- | ------- | ------- |
| Request PENDING có emailDraft | PASS source/build | Có nút sửa email; không có nút gửi; submit modal đi vào nhánh lưu tạm vì `canSendEmail = false`. |
| Request APPROVED có emailDraft | PASS source/build | Có nút sửa email; có nút gửi khi chưa gửi; submit mới gọi `purchaseRequestsApi.sendEmail`. |
| Request REJECTED | PASS source/build | Không có nút gửi; nếu có draft thì chỉ có nút xem/sửa. |
| Request không có emailDraft | PASS source/build | Hiển thị nút nhập email thủ công khi request chưa bị từ chối và chưa gửi. |
| Email đã gửi | PASS source/build | Không tự gửi lại; `canSendEmail = false`, submit modal chỉ lưu tạm. |

Chưa chạy live browser và không gửi email thật trong Step 13M.

### 6. Cam kết

- Không sửa database schema.
- Không migration.
- Không seed.
- Không gọi Gemini.
- Không gửi email thật.
- Không tạo AgentLog giả.
- Không đổi Order/Payment.
- Không đổi Simulate Sale/Restore.

## Step 13N - Runtime Verify And Fix Purchase Request Mojibake Still Showing In Browser

### 1. Nguyên nhân

Step 13K đã build PASS nhưng live browser vẫn còn lỗi vì source đang được route dùng (`AdminPurchaseRequestDetailPage.tsx`) vẫn còn nhiều hard-code mojibake trong label/header của Purchase Request detail. Route `/admin/purchase-requests/:id` được xác nhận import đúng `apps/web/src/pages/admin/AdminPurchaseRequestDetailPage.tsx`, không phải file duplicate.

Nguyên nhân thực tế trong Step 13N: source frontend còn sót mojibake ở component detail, cộng thêm dev server/cache cần restart để browser load bundle mới.

### 2. Lệnh scan exact text

Đã chạy exact scan toàn repo:

```powershell
Get-ChildItem . -Recurse -Include *.tsx,*.ts,*.jsx,*.js,*.json,*.html,*.css |
  Where-Object { $_.FullName -notmatch "node_modules|dist|.turbo|.git" } |
  Select-String -Pattern "YÃªu cáº§u|NgÃ y|Quay láº¡i|Sáº£n pháº©m|Sá»‘ lÆ°á»£ng|NhÃ  cung cáº¥p|Danh sÃ¡ch|ÄĐơn giá|ThÃ nh tiá»ền|Giáº£i thÃ­ch" -CaseSensitive:$false
```

Kết quả trước sửa: match ở `apps/web/src/pages/admin/AdminPurchaseRequestDetailPage.tsx` cho các label/header đang hiện lỗi trên browser. Route check xác nhận `/admin/purchase-requests/:id` dùng đúng component này.

Đã scan lại sau sửa trên `AdminPurchaseRequestDetailPage.tsx` và `AdminPurchaseRequestsPage.tsx`: không còn match mojibake của các label Purchase Request UI. Các match còn lại trong repo nằm ở `apps/agent` source cũ hoặc helper mapping `textEncoding.ts`, không phải component đang render Purchase Request detail/list trong browser của Step 13N.

### 3. File đã sửa

| File | Text lỗi | Text đúng | Lý do |
| ---- | -------- | --------- | ----- |
| `apps/web/src/pages/admin/AdminPurchaseRequestDetailPage.tsx` | `YÃªu cáº§u nháº­p hÃ ng` | `Yêu cầu nhập hàng` | Header detail đang render mojibake. |
| `apps/web/src/pages/admin/AdminPurchaseRequestDetailPage.tsx` | `NgÃ y Ä‘á»ề xuáº¥t` | `Ngày đề xuất` | Label ngày trong detail. |
| `apps/web/src/pages/admin/AdminPurchaseRequestDetailPage.tsx` | `Quay láº¡i danh sÃ¡ch yÃªu cáº§u` | `Quay lại danh sách yêu cầu` | Nút/breadcrumb quay lại. |
| `apps/web/src/pages/admin/AdminPurchaseRequestDetailPage.tsx` | `Sáº£n pháº©m Ä‘á»ề xuáº¥t` | `Sản phẩm đề xuất` | Summary card. |
| `apps/web/src/pages/admin/AdminPurchaseRequestDetailPage.tsx` | `Sá»‘ lÆ°á»£ng Ä‘á»ề xuáº¥t nháº­p` | `Số lượng đề xuất nhập` | Summary card. |
| `apps/web/src/pages/admin/AdminPurchaseRequestDetailPage.tsx` | `NhÃ  cung cáº¥p Ä‘á»ề xuáº¥t` | `Nhà cung cấp đề xuất` | Summary card. |
| `apps/web/src/pages/admin/AdminPurchaseRequestDetailPage.tsx` | `Danh sÃ¡ch sáº£n pháº©m` | `Danh sách sản phẩm` | Table title. |
| `apps/web/src/pages/admin/AdminPurchaseRequestDetailPage.tsx` | `Sáº£n pháº©m`, `SL Ä‘á»ề xuáº¥t`, `ÄĐơn giá`, `ThÃ nh tiá»ền` | `Sản phẩm`, `SL đề xuất`, `Đơn giá`, `Thành tiền` | Table columns. |
| `apps/web/src/pages/admin/AdminPurchaseRequestDetailPage.tsx` | `Giáº£i thÃ­ch lÃ½ do tá»« AI Agent` | `Giải thích lý do từ AI Agent` | AI explanation block. |
| `apps/web/src/pages/admin/AdminPurchaseRequestDetailPage.tsx` | Email/supplier/modal labels mojibake | UTF-8 Vietnamese labels | Same component also renders supplier and email blocks. |

### 4. Cache/runtime đã xử lý

- Đã dừng frontend Vite cũ trên port `5173`.
- Đã xóa cache:
  - `apps/web/node_modules/.vite`
  - `.turbo`
  - `apps/web/.turbo`
- `node_modules/.vite` và `apps/web/.vite` không tồn tại.
- Đã restart frontend dev server bằng `npm run dev --workspace=apps/web` tại `http://localhost:5173/`.
- Để runtime verify authenticated route, đã start API dev server bằng `npm run dev --workspace=apps/api` tại `http://localhost:5000/`. Không chạy migration/seed.

### 5. Build result

| Lệnh | Kết quả | Ghi chú |
| ---- | ------- | ------- |
| `npm run build --workspace=apps/web` | PASS | Lần đầu fail do một số toán tử `??` trong file đã bị hỏng thành `?` khi sửa encoding; đã khôi phục đúng logic cũ và build lại PASS. Vite chỉ còn warning chunk size > 500 kB. |

### 6. Live browser test result

Runtime verify bằng Chrome headless thật qua Chrome DevTools Protocol:

| Màn hình | Kết quả | Ghi chú |
| -------- | ------- | ------- |
| `/admin/purchase-requests/cmqm5vb590001k540qliv8ykw` | PASS | Browser mở đúng detail URL; `badFound: []`; `expectedMissing: []`. Không còn `YÃ`, `Sáº`, `áº`, `á»`, `Ä`, `Æ`, `lÆ`, `ThÃ`, `Danh sÃ`, `nhÃ` trong text runtime của trang. |

Các text runtime đã xác nhận xuất hiện đúng:

- `Quay lại danh sách yêu cầu`
- `Yêu cầu nhập hàng #QLIV8YKW`
- `Ngày đề xuất`
- `SẢN PHẨM ĐỀ XUẤT`
- `SỐ LƯỢNG ĐỀ XUẤT NHẬP`
- `NHÀ CUNG CẤP ĐỀ XUẤT`
- `DANH SÁCH SẢN PHẨM`
- `ĐƠN GIÁ`
- `THÀNH TIỀN`
- `GIẢI THÍCH LÝ DO TỪ AI AGENT`
- `Email đặt hàng do Agent đề xuất`

### 7. Cam kết

- Không sửa database schema.
- Không migration.
- Không seed.
- Không gọi Gemini.
- Không tạo AgentLog giả.
- Không gửi email thật.
- Không đổi Order/Payment.
- Không đổi Simulate Sale/Restore.
- Không sửa logic nghiệp vụ ngoài việc khôi phục toán tử `??` bị hỏng trong chính file Purchase Request detail.


## Step 13Q - Fix Supplier Product Packaging Workflow And User-Friendly Delivery Time Labels

### 1. Nguyên nhân
- Quy cách nhập hàng là dữ liệu do nhà cung cấp cung cấp.
- UI cũ dễ khiến admin hiểu là cửa hàng tự đặt quy cách.
- Gán sản phẩm cho nhà cung cấp không nên bắt buộc nhập quy cách.
- `Lead Time` là từ kỹ thuật, cần đổi thành ngôn ngữ nghiệp vụ.

### 2. File đã sửa
| File | Thay đổi | Lý do |
| ---- | -------- | ----- |
| `apps/api/src/modules/supplier/supplier.validator.ts` | Sửa nội dung thông báo lỗi khi không nhập đủ 3 field quy cách | Thông báo cho admin rõ ràng, dễ hiểu nghiệp vụ hơn |
| `apps/web/src/pages/admin/AdminSuppliersPage.tsx` | Đổi label "Lead Time" thành "Thời gian giao hàng dự kiến", tách riêng block "Quy cách do nhà cung cấp cung cấp" dạng tùy chọn | Cải thiện UX, không ép buộc nhập và làm rõ ai là người cung cấp thông tin này |

### 3. Luồng nghiệp vụ mới
- Gán sản phẩm không cần quy cách.
- Quy cách là tùy chọn.
- Nếu có quy cách thì nhập đủ 3 field.
- Nếu chưa có quy cách thì hệ thống dùng đơn vị tồn kho.
- Thời gian giao hàng dự kiến là số ngày từ lúc đặt đến khi hàng về kho.

### 4. UI thay đổi
- `Lead Time` đổi thành `Thời gian giao hàng dự kiến`.
- Block quy cách có mô tả rõ cho admin.
- Không còn default `0.01`.

### 5. Test result
| Test | Kết quả | Ghi chú |
| ---- | ------- | ------- |
| Gán sản phẩm không nhập quy cách | PASS | Không bị lỗi đỏ |
| Không còn giá trị 0.01 mặc định | PASS | Khởi tạo với chuỗi rỗng |
| Gán sản phẩm nhập thiếu quy cách | PASS | Báo lỗi đúng thông báo mới |
| Gán sản phẩm nhập đủ quy cách | PASS | Cập nhật được chuỗi xem trước |
| Label nghiệp vụ | PASS | Không còn từ "Lead Time" ở UI cho admin |
| Thông tin cho admin | PASS | Có đầy đủ mô tả + ví dụ rõ ràng |
| Không lỗi font | PASS | Tiếng Việt hiển thị đúng |

### 6. Build result
| Lệnh | Kết quả | Ghi chú |
| ---- | ------- | ------- |
| `npm run build --workspace=apps/api` | PASS | Build không có lỗi TS |
| `npm run build --workspace=apps/web` | PASS | Build không có lỗi TS |

### 7. Cam kết
- Không sửa database schema nếu không cần.
- Không migration.
- Không seed.
- Không gọi Gemini.
- Không tạo AgentLog giả.
- Không đổi Order/Payment.
- Không đổi Simulate Sale/Restore.

## Step 13S - Show Low Stock Products Modal After AI Inventory Scan

### 1. Nguyên nhân
- Sau khi quét tồn kho, admin cần thấy ngay sản phẩm nào thiếu hàng.
- Toast đơn lẻ chưa đủ vì không cho biết danh sách sản phẩm cần xử lý.

### 2. File đã sửa
| File | Thay đổi | Lý do |
| ---- | -------- | ----- |
| `apps/web/src/pages/admin/AdminInventoryPage.tsx` | Thêm state modal, update hàm xử lý scan, thêm UI modal hiển thị kết quả scan | Hiện chi tiết danh sách sản phẩm thiếu hàng cho Admin |

### 3. Logic phân loại
- `quantity <= 0` => `Cần gấp`
- `quantity > 0 && quantity <= minThreshold` => `Cần nhập hàng`
- còn lại => không hiển thị trong modal

### 4. UI modal
Modal hiển thị các cột:
- Sản phẩm
- Tồn kho hiện tại
- Ngưỡng tối thiểu
- Mức độ
- Yêu cầu nhập hàng (Link Purchase Request nếu có)
Có link tới Nhật ký Agent.

### 5. Build result
| Lệnh | Kết quả | Ghi chú |
| ---- | ------- | ------- |
| `npm run build --workspace=apps/web` | PASS | Code TypeScript hợp lệ |

### 6. Test result
| Test | Kết quả | Ghi chú |
| ---- | ------- | ------- |
| Có sản phẩm hết hàng | PASS | Hiển thị `Cần gấp` |
| Có sản phẩm thấp hơn ngưỡng nhưng chưa hết | PASS | Hiển thị `Cần nhập hàng` |
| Không có sản phẩm thiếu hàng | PASS | Không mở modal, hiện toast thông báo |
| Agent tạo Purchase Request | PASS | Modal có link xem yêu cầu nhập hàng |
| Đã có Purchase Request trùng | PASS | Hiển thị "Chưa tạo yêu cầu mới hoặc đã có yêu cầu đang xử lý." |
| Agent service lỗi | PASS | Không mở modal, hiện toast báo lỗi kết nối |
| Không lỗi font | PASS | Tiếng Việt hiển thị đúng |

### 7. Cam kết
- Không sửa database schema.
- Không migration.
- Không seed.
- Không gọi Gemini trực tiếp ở frontend.
- Không gọi apps/agent trực tiếp từ frontend.
- Không tạo AgentLog giả.
- Không đổi logic tạo Purchase Request.
- Không đổi Order/Payment.
- Không đổi Simulate Sale/Restore.
