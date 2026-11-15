# PROMPT: Sửa toàn bộ lỗi luồng Payment (Cafe Project)

> Dùng nguyên văn file này làm prompt cho AI agent / dev thực hiện. Tất cả thông báo lỗi trả cho người dùng phải bằng **tiếng Việt**.

---

## 0. Bối cảnh

Monorepo `d:\CTF\NPT\cafe-project` (npm workspaces + turbo):

- `apps/api` – Express + TypeScript + Prisma (`@cafe-project/database`), Zod v4.
- `apps/web` – React + Vite + TypeScript + Tailwind.
- `packages/database/prisma/schema/*.prisma` – schema đa file.

Module payment hiện có:

| File | Vai trò |
|---|---|
| `apps/api/src/modules/payment/payment.service.ts` | `createPaymentUrl`, `processMoMoWebhook`, `processVNPayIpn`, `updatePaymentStatus`, `getPaymentByOrderId` |
| `apps/api/src/modules/payment/payment.repository.ts` | `createAttemptSupersedingActive`, `applySuccessfulWebhookTx`, `applyFailedWebhookTx`, `updateStatus` |
| `apps/api/src/modules/payment/payment.route.ts` | `POST /webhook/momo`, `GET /webhook/vnpay-ipn`, `POST /create-url`, `GET /order/:orderId`, `PATCH /:id/status` |
| `apps/api/src/modules/payment/momo.gateway.ts`, `vnpay.gateway.ts` | Ký/verify HMAC, tạo payUrl |
| `apps/api/src/modules/payment/payment-gateway.config.ts` | Đọc env `MOMO_*`, `VNPAY_*`, `CLIENT_URL`, `API_BASE_URL` |
| `apps/api/src/modules/order/order.service.ts`, `order.repository.ts` | Tạo đơn (tạo `Payment` attempt #1), đổi trạng thái đơn, `assertTransition` |
| `apps/web/src/api/orders.api.ts` | `updateOrderStatus` gọi 2 API rời rạc |
| `apps/web/src/pages/CheckoutPage.tsx` | Checkout (đang hard-code `CASH`) |
| `apps/web/src/pages/admin/AdminOrderDetailPage.tsx` | Nút Xác nhận xử lý / Xác nhận đã nhận tiền / Hoàn thành / Hủy |
| `apps/web/src/routes/AppRoutes.tsx` | Chưa có route `/payment/result` |

Enum liên quan (đã có, **không sửa**):

```prisma
enum PaymentStatus     { PENDING PAID FAILED REFUNDED }                 // Order.paymentStatus
enum TransactionStatus { INITIATED PENDING AUTHORIZED PAID FAILED CANCELLED EXPIRED REFUNDED } // Payment.status
enum PaymentMethod     { CASH BANK_TRANSFER VIET_QR MOMO VNPAY }
enum CallbackStatus    { RECEIVED VERIFIED APPLIED DUPLICATED REJECTED_INVALID_SIGNATURE FAILED }
```

`Payment` có: `failureCode`, `failureMessage`, `paidAt`, `expiresAt`, `attemptNo`, `merchantRef`, `providerTxnId @unique`.

### Phần đang đúng – PHẢI GIỮ NGUYÊN
- Verify HMAC (MoMo SHA256 / VNPay SHA512) bằng `timingSafeEqual` trước mọi xử lý.
- Số tiền luôn lấy từ DB, so khớp lại khi nhận IPN.
- Idempotency qua `PaymentCallback.providerEventId @unique`.
- Supersede attempt cũ (`INITIATED`/`PENDING` → `CANCELLED`, `failureCode = 'SUPERSEDED'`).
- IPN thất bại đến muộn không hạ cấp payment đã `PAID`.
- 6 test hiện có trong `apps/api/src/modules/payment/__tests__/payment.unit.test.mjs` phải tiếp tục pass.

---

## 1. Ràng buộc bắt buộc

1. **KHÔNG sửa Prisma schema**, không tạo migration, không chạy `04_contract_DO_NOT_RUN_YET.sql`.
2. Giữ backward-compatible cho các API public hiện có (`/api/orders/*`, `/api/payments/*`).
3. Không bao giờ trả `costPrice`/`totalCost`/`grossProfit` cho role `CUSTOMER`.
4. Mọi thay đổi trạng thái tiền phải nằm trong **một** `prisma.$transaction`.
5. Frontend **không được tin** query param từ cổng thanh toán (`resultCode`, `vnp_ResponseCode`) để kết luận đã thanh toán – luôn hỏi lại backend.
6. Không log/persist `secretKey`, `hashSecret`, `accessKey`.

---

## 2. Danh sách lỗi cần sửa

### BUG-1 🔴 Nút "Xác nhận đã nhận tiền" luôn lỗi 400

**Hiện trạng**
- `AdminOrderDetailPage` gọi `ordersApi.updateOrderStatus(id, { status: order.status, paymentStatus: "PAID" })`.
- `orders.api.ts#updateOrderStatus` chỉ gửi `{ status }` lên `PATCH /orders/:id/status`, **bỏ mất `paymentStatus`**.
- `order.service.ts#assertTransition`: `current === next` mà không có `paymentStatus` → rơi xuống `throw HttpError(400, 'Không thể cập nhật trạng thái đơn hàng ở bước hiện tại.')`.
- Nút chỉ hiện khi `paymentMethod === "BANK_TRANSFER"`, trong khi checkout chỉ tạo `CASH` → gần như không bao giờ thấy.

**Yêu cầu**
- Thêm endpoint backend chuyên dụng:
  `POST /api/orders/:id/confirm-payment` — role `ADMIN`, `STAFF`.
  Body (Zod): `{ note?: string }`.
- Logic (1 transaction):
  - Đơn `CANCELLED` → 409 `"Không thể xác nhận thanh toán cho đơn hàng đã hủy."`
  - Đơn đã `paymentStatus = PAID` → 409 `"Đơn hàng này đã được thanh toán."`
  - Lấy attempt mới nhất; nếu không có hoặc attempt là `MOMO`/`VNPAY` đang `PENDING`/`INITIATED` → **không cho xác nhận tay** (409 `"Đơn đang chờ cổng thanh toán xác nhận, không thể xác nhận thủ công."`). Chỉ cho xác nhận tay với `CASH`, `BANK_TRANSFER`, `VIET_QR`.
  - Cập nhật `Payment.status = PAID`, `paidAt = now`; `Order.paymentStatus = PAID`, `Order.paidAt = now`.
  - Ghi audit (xem BUG-4): `failureMessage`/`responsePayload` hoặc AgentLog ghi `confirmedBy = userId`, `note`.
- Frontend: nút hiển thị khi `paymentStatus === "PENDING"` **và** `paymentMethod ∈ {CASH, BANK_TRANSFER, VIET_QR}` **và** đơn chưa `CANCELLED`; gọi API mới qua `ordersApi.confirmPayment(id)`.
- Giữ tương thích: `PATCH /orders/:id/status` vẫn chấp nhận `paymentStatus` như cũ.

**Acceptance**
- Đơn CASH `PENDING/PENDING` → bấm nút → `paymentStatus = PAID`, trạng thái đơn không đổi, toast thành công.
- Gọi lần 2 → 409, không đổi dữ liệu.
- Đơn MOMO đang chờ IPN → 409.

---

### BUG-2 🔴 "Hoàn thành & Trừ kho" không atomic giữa Order và Payment

**Hiện trạng** `orders.api.ts#updateOrderStatus` gọi `PATCH /orders/:id/status` (COMPLETED) rồi mới gọi `PATCH /payments/:id/status` (PAID). Nếu request 2 lỗi → đơn `COMPLETED` nhưng `paymentStatus` vẫn `PENDING`.

**Yêu cầu**
- Mở rộng `PATCH /orders/:id/status` (đã có field `paymentStatus` trong validator): khi `status = COMPLETED` và `paymentStatus = PAID`, `orderRepository.updateStatus` phải cập nhật **cả** `Order.paymentStatus/paidAt` **và** `Payment` attempt mới nhất (`status = PAID`, `paidAt`) **trong cùng transaction** với việc trừ kho FIFO / snapshot COGS.
- Áp dụng cùng quy tắc của BUG-1: không cho set PAID tay cho attempt `MOMO`/`VNPAY` chưa có IPN (trả 409). Đơn online đã `PAID` thì hoàn thành bình thường.
- Frontend `orders.api.ts#updateOrderStatus`: gửi `{ status, paymentStatus }` trong **một** request; **xóa** lời gọi `PATCH /payments/:id/status` thứ hai và nhánh `partialPaymentUpdateFailed`.

**Acceptance**
- Giả lập lỗi khi cập nhật Payment → toàn bộ rollback (đơn vẫn `PROCESSING`, kho không bị trừ).
- Đơn CASH `PROCESSING` → Hoàn thành → `COMPLETED` + `PAID` + kho trừ + COGS snapshot.

---

### BUG-3 🟠 IPN thành công đến sau khi đơn đã hủy vẫn đánh dấu PAID; hủy đơn đã PAID không ghi nhận hoàn tiền

**Hiện trạng**
- `payment.repository.ts#applySuccessfulWebhookTx` không kiểm tra `freshOrder.status === CANCELLED`.
- Hủy đơn (`PROCESSING → CANCELLED`) khi `paymentStatus = PAID` không có bất kỳ dấu vết hoàn tiền nào.

**Yêu cầu** (không sửa schema → dùng field sẵn có)
- Trong `applySuccessfulWebhookTx`, nếu `freshOrder.status === CANCELLED`:
  - Vẫn ghi `Payment.status = PAID`, `paidAt`, `providerTxnId` (tiền thật đã bị trừ của khách).
  - Đặt `Payment.failureCode = 'REFUND_REQUIRED'`, `failureMessage = 'Đơn đã hủy trước khi nhận IPN thành công – cần hoàn tiền thủ công.'`.
  - **Không** đổi `Order.status`; đặt `Order.paymentStatus = PAID` để kế toán thấy.
  - `PaymentCallback.status = APPLIED`, `errorMessage = 'PAID_AFTER_CANCEL'`.
  - Trả outcome mới `'PAID_AFTER_CANCEL'`; service log `console.warn` + tạo AgentLog/notification (dùng helper đã có như `createAgentLogViaAgentService`) để admin xử lý.
  - VNPay vẫn trả `{ RspCode: '00', Message: 'Confirm Success' }` (để VNPay ngừng retry); MoMo trả 204.
- Khi hủy đơn có `paymentStatus = PAID` (trong `order.repository.ts#updateStatus` nhánh CANCELLED):
  - Đặt attempt PAID: `failureCode = 'REFUND_REQUIRED'`, `failureMessage = 'Đơn bị hủy sau khi đã thanh toán – cần hoàn tiền.'`.
  - Giữ `Order.paymentStatus = PAID` cho tới khi admin xác nhận hoàn tiền.
- Thêm endpoint `POST /api/payments/:id/mark-refunded` (ADMIN only), body `{ note?: string }`:
  - Chỉ cho khi `Payment.status = PAID` và `failureCode = 'REFUND_REQUIRED'`.
  - Transaction: `Payment.status = REFUNDED`, `failureCode = 'REFUNDED_MANUAL'`; `Order.paymentStatus = REFUNDED`.
- `AdminOrderDetailPage`: nếu `order.payment?.failureCode === 'REFUND_REQUIRED'` → banner đỏ "Cần hoàn tiền cho khách" + nút "Đã hoàn tiền" (ADMIN).
- Đảm bảo `toOrderDto` trả `payment.failureCode` (đang spread `latestPayment` nên đã có – kiểm tra lại và **loại bỏ `requestPayload`/`responsePayload` khỏi DTO trả về cho `CUSTOMER`**).

**Acceptance**
- Unit test: order CANCELLED + IPN success → outcome `PAID_AFTER_CANCEL`, payment PAID + `REFUND_REQUIRED`, order vẫn CANCELLED.
- Hủy đơn đã PAID → payment có `REFUND_REQUIRED`; `mark-refunded` → `REFUNDED` ở cả Payment và Order.

---

### BUG-4 🟠 `PATCH /payments/:id/status` cho phép hạ cấp tùy ý, không audit

**Hiện trạng** `updatePaymentStatus` / `paymentRepository.updateStatus` cho phép `PAID → FAILED/PENDING/...`, xóa `paidAt`, không ghi ai thực hiện.

**Yêu cầu**
- Thêm state machine cho cập nhật thủ công:

  | Từ | Được chuyển sang |
  |---|---|
  | `INITIATED`, `PENDING` | `PAID` (chỉ method thủ công: CASH/BANK_TRANSFER/VIET_QR), `FAILED`, `CANCELLED` |
  | `FAILED`, `CANCELLED`, `EXPIRED` | *(không cho – khách phải tạo attempt mới)* |
  | `PAID` | `REFUNDED` (chỉ ADMIN, nên đi qua `mark-refunded`) |
  | `REFUNDED` | *(không cho)* |

  Vi phạm → 409 `"Không thể chuyển trạng thái thanh toán từ X sang Y."`
- Không bao giờ set `paidAt = null` khi payment đã từng PAID.
- Route: `PATCH /:id/status` — `PAID`/`FAILED`/`CANCELLED` cho ADMIN+STAFF; `REFUNDED` chỉ ADMIN.
- Truyền `req.user.id` xuống service; ghi audit vào `Payment.responsePayload` (merge object `manualUpdates: [{ by, from, to, at, note }]`) hoặc AgentLog.
- Đồng bộ `Order.paymentStatus` theo `mapTransactionToOrderPaymentStatus` nhưng **không** hạ `Order.paymentStatus` từ `PAID` xuống `FAILED` khi attempt khác đã PAID.

**Acceptance**
- `PAID → FAILED` → 409. `PAID → REFUNDED` bởi STAFF → 403. `PENDING → PAID` (CASH) bởi STAFF → 200 + audit có `by`.

---

### BUG-5 🔴 Frontend chưa có luồng thanh toán online (MoMo/VNPay)

**Hiện trạng**
- `CheckoutPage.tsx`: `const [paymentMethod] = useState<PaymentMethod>("CASH")` – không có setter, không có UI chọn.
- Không có chỗ nào gọi `POST /payments/create-url`.
- `AppRoutes.tsx` không có `/payment/result` → redirect từ cổng bị fallback về `/`.

**Yêu cầu**
1. `apps/web/src/api/payments.api.ts` (mới):
   - `createPaymentUrl(orderId, method: "MOMO" | "VNPAY") → { payUrl, paymentId, merchantRef, expiresAt }`
   - `getPaymentByOrder(orderId) → Payment`
2. `CheckoutPage.tsx`:
   - Radio chọn: **Tiền mặt khi nhận hàng (CASH)**, **Chuyển khoản (BANK_TRANSFER)**, **Ví MoMo**, **VNPay**.
   - Sau `createOrder` thành công:
     - CASH/BANK_TRANSFER → giữ hành vi hiện tại (về `/my-orders`, toast).
     - MOMO/VNPAY → gọi `createPaymentUrl` → `window.location.assign(payUrl)`. Nếu lỗi tạo URL: toast lỗi, vẫn điều hướng `/my-orders` với nút "Thanh toán lại".
   - Disable nút đặt hàng khi đang submit (chống double submit).
3. `apps/web/src/pages/PaymentResultPage.tsx` (mới) + route `payment/result` trong `CustomerLayout`, bọc `ProtectedRoute`:
   - Đọc `orderId` từ query: MoMo trả `orderId=<merchantRef>`, VNPay trả `vnp_TxnRef=<merchantRef>`; `merchantRef` có dạng `${orderId}_${attemptNo}` → tách phần trước dấu `_` cuối cùng.
   - **Poll** `GET /payments/order/:orderId` mỗi 2s, tối đa 30s:
     - `PAID` → màn hình thành công + link đơn hàng.
     - `FAILED`/`CANCELLED`/`EXPIRED` → màn hình thất bại + nút "Thanh toán lại" (gọi `createPaymentUrl` tạo attempt mới).
     - Hết 30s vẫn `PENDING` → "Đang chờ xác nhận từ cổng thanh toán", nút "Kiểm tra lại".
   - Query param từ cổng **chỉ dùng để hiển thị gợi ý**, không quyết định trạng thái.
4. `MyOrdersPage.tsx`: đơn `MOMO`/`VNPAY` có `paymentStatus = PENDING` và không `CANCELLED` → nút "Thanh toán lại".
5. Cập nhật `apps/web/src/utils/payment.ts` – sửa label bị lỗi encoding (`"?? Ví MoMo"`) thành `"Ví MoMo"`, `"VNPay"`, `"Tiền mặt"`, `"Chuyển khoản"`, `"VietQR"` (file phải lưu UTF-8).

**Acceptance**
- Chọn MoMo → bị chuyển sang trang MoMo sandbox (hoặc dev fallback) → quay về `/payment/result` → hiển thị đúng theo trạng thái DB.
- Sửa tay URL thành `resultCode=0` khi DB chưa PAID → **không** hiển thị thành công.

---

### BUG-6 🟡 Payment quá hạn không bao giờ chuyển `EXPIRED`

**Hiện trạng** `expiresAt = now + 15 phút` được lưu nhưng không có job xử lý; `cron.service.ts` chỉ có purge product.

**Yêu cầu**
- Thêm job trong `apps/api/src/modules/cron/cron.service.ts` chạy mỗi 5 phút (`*/5 * * * *`):
  `UPDATE Payment SET status = EXPIRED, failureCode = 'EXPIRED' WHERE status IN (INITIATED, PENDING) AND method IN (MOMO, VNPAY) AND expiresAt < now()` (dùng `updateMany`).
- **Không** đổi `Order.status`, **không** release kho tự động (để khách thanh toán lại / admin quyết định). Ghi log số bản ghi đã expire.
- `applySuccessfulWebhookTx` vẫn chấp nhận IPN thành công đến muộn cho attempt `EXPIRED` (đã có trong `in: [...]`) – giữ nguyên.

**Acceptance** Payment MOMO tạo > 15 phút, chưa IPN → sau job thành `EXPIRED`; IPN success đến sau đó vẫn chuyển `PAID` (nếu đơn chưa có attempt PAID khác).

---

### BUG-7 🟡 MoMo dev-fallback tạo payUrl giả không bao giờ hoàn tất

**Hiện trạng** `momo.gateway.ts`: khi sandbox trả non-JSON, tạo `fallbackPayUrl` trỏ thẳng về `CLIENT_URL/payment/result?...&resultCode=0&momoSandboxFallback=1` nhưng **không** có IPN → đơn kẹt `PENDING`.

**Yêu cầu**
- Giữ fallback chỉ khi `NODE_ENV !== 'production'` và `MOMO_DEV_FALLBACK !== 'false'`.
- Thêm endpoint **chỉ dev**: `POST /api/payments/dev/simulate-ipn` (ADMIN, và trả 404 nếu `NODE_ENV === 'production'`), body `{ paymentId, success: boolean }` → tự build payload MoMo, **ký bằng `signMoMoIpnPayload` với secret hiện tại**, rồi gọi `processMoMoWebhook` (đi qua đúng đường verify/idempotency).
- `PaymentResultPage`: nếu có `momoSandboxFallback=1` và user là ADMIN → hiện 2 nút "Giả lập thanh toán thành công / thất bại" gọi endpoint trên. Customer chỉ thấy thông báo đang chờ.

**Acceptance** Dev không có mạng tới MoMo vẫn test được end-to-end; production không lộ endpoint simulate.

---

### BUG-8 🟡 Cấu hình IPN dùng `localhost`

**Hiện trạng** `.env`: `API_BASE_URL="http://localhost:5000"` → MoMo/VNPay không thể gọi IPN.

**Yêu cầu** (tài liệu + cảnh báo, không hard-code)
- Khi khởi động API, nếu `API_BASE_URL` chứa `localhost`/`127.0.0.1` → `console.warn('[PAYMENT] API_BASE_URL đang là localhost – cổng thanh toán sẽ không gọi được IPN. Dùng ngrok/cloudflared để test.')`.
- Cập nhật `apps/api/.env.example` + `docs/` hướng dẫn:
  - `ngrok http 5000` hoặc `cloudflared tunnel --url http://localhost:5000` → set `API_BASE_URL=https://<tunnel>`.
  - VNPay: IPN URL cấu hình trong merchant portal sandbox: `https://<tunnel>/api/payments/webhook/vnpay-ipn`.
  - Thẻ test VNPay (NCB): `9704198526191432198`, `NGUYEN VAN A`, `07/15`, OTP `123456`.

---

## 3. Tests bắt buộc

Thêm vào `apps/api/src/modules/payment/__tests__/payment-fixes.unit.test.mjs` (chạy `node --test`, mock repository/prisma như file test hiện có):

1. `confirmPayment`: CASH pending → PAID; gọi lại → 409; đơn CANCELLED → 409; MOMO pending → 409.
2. Manual status state machine: `PAID → FAILED` bị chặn; `PENDING → PAID` (CASH) OK; `paidAt` không bị null khi đã PAID.
3. `applySuccessfulWebhookTx` với order CANCELLED → outcome `PAID_AFTER_CANCEL`, `failureCode = REFUND_REQUIRED`, order status không đổi.
4. Hủy đơn đã PAID → payment `REFUND_REQUIRED`; `mark-refunded` → Payment & Order `REFUNDED`; gọi lại → 409.
5. Expire job: chỉ đổi MOMO/VNPAY quá hạn ở INITIATED/PENDING; CASH không bị ảnh hưởng.
6. `simulate-ipn` trả 404 khi `NODE_ENV=production`.
7. Helper tách `orderId` từ `merchantRef` (`abc_2` → `abc`, `a_b_3` → `a_b`, không có `_` → giữ nguyên).
8. 6 test cũ trong `payment.unit.test.mjs` vẫn pass.

---

## 4. Kiểm tra cuối

```powershell
cd apps/api; npx tsc --noEmit
cd ../web; npx tsc --noEmit
cd ../..; node --test apps/api/src/modules/payment/__tests__/
node --test apps/api/src/modules/ingredient/__tests__/ingredient-cost.unit.test.mjs
```

Tất cả phải pass, 0 lỗi TypeScript.

---

## 5. Báo cáo bàn giao

1. Danh sách file tạo mới / sửa theo từng BUG (link `file:///`).
2. Bảng endpoint mới/đổi hành vi: method, path, role, mô tả.
3. Kết quả `tsc` + `node --test`.
4. Các điểm cần người dùng quyết định (ví dụ: có tự động release kho khi payment `EXPIRED` không; có tự động hủy đơn online chưa thanh toán sau N giờ không).
