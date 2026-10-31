# PROMPT: Triển khai Payment API (MoMo + VNPay) – Cafe Project

## VAI TRÒ
Bạn là Senior Backend Engineer (Node.js, TypeScript, Express, Prisma 6, zod). Triển khai module **Payment online (MoMo Sandbox + VNPay Sandbox)** trong `apps/api/src/modules/payment/`. **Bám đúng convention code hiện có** (4 dấu cách, `asyncHandler`, `validateBody`, `sendSuccess/sendError`, `HttpError(statusCode, message, code?)`, repository pattern, import `prisma` từ `@cafe-project/database`).

---

## 1. HIỆN TRẠNG (đã khảo sát – KHÔNG đoán khác)

### Schema thực tế (`packages/database/prisma/schema/order.prisma`)
- `Order`: `status: OrderStatus (PENDING|PROCESSING|COMPLETED|CANCELLED)`, `totalAmount`, `shippingFee`, `paymentMethod?`, `paymentStatus: PaymentStatus (PENDING|PAID|FAILED|REFUNDED)`, `paidAt?`, `stockDeductedAt?`, quan hệ **`payments Payment[]`** (1-N).
- `Payment`: `id, orderId, method: PaymentMethod (CASH|BANK_TRANSFER|VIET_QR|MOMO|VNPAY), providerTxnId? @unique, merchantRef?, amount Decimal(12,2), currency, status: TransactionStatus (INITIATED|PENDING|AUTHORIZED|PAID|FAILED|CANCELLED|EXPIRED|REFUNDED), attemptNo, requestPayload?, responsePayload?, failureCode?, failureMessage?, paidAt?, expiresAt?`, `@@index([orderId])` (**orderId KHÔNG unique** → 1 order có nhiều lần thử thanh toán).
- `PaymentCallback`: `method, providerEventId? @unique` (khóa idempotent), `eventType?, paymentId?, signatureValid, rawPayload Json, headers Json?, receivedAt, processedAt?, status: CallbackStatus (RECEIVED|VERIFIED|APPLIED|DUPLICATED|REJECTED_INVALID_SIGNATURE|FAILED), errorMessage?, retryCount`.
- `PaymentReconciliation` đã có (đối soát cuối ngày, chưa cần làm ở task này).

### Code hiện có cần lưu ý
- `payment.repository.ts` dùng `prisma.payment.findUnique({ where: { orderId } })` → **SAI** với schema mới (orderId không unique). `payment.service.ts` dùng `PaymentStatus` cho `Payment.status` → **SAI** (phải là `TransactionStatus`). `updateStatus` đang ghi `paidAt` không đồng bộ Order.
- `order.repository.ts` (dòng ~20, 86) và `order.service.ts` (dòng ~19-21) dùng `order.payment` (số ít) và `payment: { create: ... }` → lệch schema (`payments[]`). Cần sửa để compile và chạy đúng, giữ nguyên hành vi API trả về cho web (`paymentStatus`, `paymentMethod`, `payment`).
- Order chuyển `COMPLETED` mới trừ kho (`stockDeductedAt`). **Webhook KHÔNG được trừ kho**; chỉ set `paymentStatus=PAID`, `paidAt`, và nếu order đang `PENDING` thì chuyển `PROCESSING`.
- `app.use(express.json())` đã có ở `apps/api/src/index.ts`; `/api/payments` đã mount. `env.ts` dùng `requireEnv`.
- Web (`apps/web/src/utils/payment.ts`) mới hỗ trợ CASH, BANK_TRANSFER → cần bổ sung label MOMO, VNPAY (làm sau cùng, phần nhỏ).

**Bước 0 bắt buộc:** chạy `npx tsc --noEmit` ở `apps/api` để xem lỗi type hiện tại trước khi sửa. Không sửa schema Prisma nếu không thật cần; nếu cần thì dừng và hỏi.

---

## 2. KIẾN TRÚC & LUỒNG

```
Client --POST /api/payments/create-url {orderId, method}--> API
API: validate order/ownership -> tạo Payment(INITIATED->PENDING, attemptNo+1, merchantRef) -> gọi MoMo/VNPay -> trả { payUrl }
Client redirect sang cổng -> user trả tiền
Cổng --IPN/webhook--> POST /api/payments/webhook/momo | GET /api/payments/webhook/vnpay-ipn
API: ghi PaymentCallback -> verify chữ ký -> idempotent -> $transaction cập nhật Payment + Order
Cổng redirect user về CLIENT /payment/result (CHỈ hiển thị, KHÔNG tin để xác nhận)
```

Nguyên tắc:
- Chỉ **IPN đã verify chữ ký** mới được chuyển PAID. Redirect (returnUrl) chỉ để UI; UI gọi `GET /api/payments/order/:orderId` để lấy trạng thái thật.
- Số tiền luôn lấy từ DB (`Payment.amount` = `order.totalAmount + shippingFee`; **kiểm tra lại cách order tính grandTotal ở order.repository.ts** và dùng cùng giá trị).

---

## 3. IDEMPOTENCY (theo schema thực tế)
- Khóa: `PaymentCallback.providerEventId` = `transId` (MoMo) hoặc `vnp_TransactionNo` (VNPay). Với IPN **thất bại** có thể thiếu/trùng id → dùng fallback `${method}:${merchantRef}:${resultCode}`.
- Ngoài ra `Payment.providerTxnId @unique` chống 1 giao dịch cổng gắn 2 payment.
- Quy trình: tạo callback `RECEIVED` bằng `create`; nếu Prisma lỗi `P2002` → trả `ALREADY_PROCESSED` (HTTP 200/204 cho MoMo; `{"RspCode":"00","Message":"Confirm Success"}` cho VNPay) và (nếu có thể) tăng `retryCount` của bản ghi cũ / ghi trạng thái `DUPLICATED`. Cách này chống cả race khi 2 webhook đến đồng thời (không dùng `findUnique` rồi `create`).
- Cập nhật Payment bằng `updateMany({ where: { id, status: { in: ['INITIATED','PENDING'] } }, data })` và kiểm tra `count` để chuyển trạng thái nguyên tử.

---

## 4. FILE CẦN TẠO / SỬA (trong `apps/api/src/modules/payment/`)

| File | Việc |
|---|---|
| `payment-gateway.config.ts` | Đọc env MoMo/VNPay, throw rõ ràng nếu thiếu khi dùng (không hardcode secret fallback). |
| `momo.gateway.ts` | `createMoMoPayUrl(payment, order)`, `verifyMoMoSignature(payload)`. |
| `vnpay.gateway.ts` | `createVNPayUrl(payment, order, ipAddr)`, `verifyVNPaySignature(query)`. |
| `payment.repository.ts` | Sửa theo schema mới; thêm `findLatestByOrderId`, `findByMerchantRef`, `createAttempt`, `createCallback`, `markPaidTx`... |
| `payment.service.ts` | Sửa `TransactionStatus`; thêm `createPaymentUrl`, `processMoMoWebhook`, `processVNPayIpn`. |
| `payment.controller.ts` / `payment.route.ts` | Thêm route mới (mục 7). |
| `payment.validator.ts` | zod: `createPaymentUrlSchema` (`orderId: string`, `method: z.enum(['MOMO','VNPAY'])`), `momoWebhookSchema` (passthrough). |
| `modules/order/order.repository.ts`, `order.service.ts` | Sửa `payment` → `payments` (lấy payment mới nhất), tạo Payment đúng schema khi tạo đơn (`status: 'INITIATED'` cho online, CASH giữ `PENDING`, set `Order.paymentMethod/paymentStatus`). |
| `common/env.ts` | Thêm `apiBaseUrl`, `momo`, `vnpay` (optional, validate lazily). |
| `apps/api/.env.example` | Bổ sung biến (mục 5). |
| `apps/web/src/utils/payment.ts` | Thêm label MOMO/VNPAY (nhỏ). |

---

## 5. ENV (`apps/api/.env.example`)
```
API_BASE_URL="https://xxxx.ngrok-free.app"
CLIENT_URL="http://localhost:5173"

MOMO_PARTNER_CODE=""
MOMO_ACCESS_KEY=""
MOMO_SECRET_KEY=""
MOMO_ENDPOINT="https://test-payment.momo.vn/v2/gateway/api/create"

VNPAY_TMN_CODE=""
VNPAY_HASH_SECRET=""
VNPAY_URL="https://sandbox.vnpayment.vn/paymentv2/vpcpay.html"
VNPAY_RETURN_URL="http://localhost:5173/payment/result"
```
(`CLIENT_URL` đã được index.ts đọc cho CORS.)

---

## 6. CHI TIẾT CỔNG

### 6.1 MoMo (captureWallet, HMAC-SHA256)
- `orderId` gửi MoMo phải **duy nhất mỗi lần thử** → dùng `merchantRef = ${order.id}_${attemptNo}` (lưu vào `Payment.merchantRef`); `requestId = merchantRef + '_' + Date.now()`. Webhook tra ngược Payment theo `merchantRef`, **không** coi `orderId` của MoMo là `Order.id`.
- `amount = Math.round(Number(amount)).toString()`; `ipnUrl = ${API_BASE_URL}/api/payments/webhook/momo`; `redirectUrl = ${CLIENT_URL}/payment/result`.
- Raw signature tạo (thứ tự alphabet): `accessKey, amount, extraData, ipnUrl, orderId, orderInfo, partnerCode, redirectUrl, requestId, requestType`.
- Verify IPN, raw: `accessKey, amount, extraData, message, orderId, orderInfo, orderType, partnerCode, payType, requestId, responseTime, resultCode, transId`.
- `resultCode !== 0` khi tạo → `HttpError(502, ...)`; lưu `requestPayload` (**không** chứa secret) và `responsePayload`.
- Thành công: `resultCode === 0` → PAID. Trả HTTP **204** cho MoMo.

### 6.2 VNPay (HMAC-SHA512)
- Params: `vnp_Version=2.1.0, vnp_Command=pay, vnp_TmnCode, vnp_Amount = amount*100, vnp_CurrCode=VND, vnp_TxnRef=merchantRef (duy nhất mỗi lần thử, ≤100 ký tự, chỉ [A-Za-z0-9_-] → dùng attempt id/cuid thay vì ký tự lạ), vnp_OrderInfo (không dấu), vnp_OrderType=other, vnp_Locale=vn, vnp_ReturnUrl, vnp_IpAddr, vnp_CreateDate (yyyyMMddHHmmss, múi giờ GMT+7), vnp_ExpireDate`.
- Ký: sort key alphabet, bỏ `vnp_SecureHash/vnp_SecureHashType`, encode value bằng `encodeURIComponent` thay `%20` → `+`, nối `k=v&...`, `HMAC-SHA512(secret)` hex → thêm `vnp_SecureHash` vào URL. Verify IPN theo đúng cách ký tương tự trên query nhận được.
- IPN (`GET /webhook/vnpay-ipn`) phải trả JSON: `RspCode 00` (OK), `01` (không thấy đơn), `02` (đã xác nhận), `04` (sai amount), `97` (sai chữ ký), `99` (lỗi khác).
- Thành công khi `vnp_ResponseCode === '00' && vnp_TransactionStatus === '00'`. Amount từ cổng chia 100 rồi so với DB.
- `expiresAt` = now + 15 phút (set vào Payment). Có thể cron đánh dấu `EXPIRED` (tùy chọn, nếu `cron.service.ts` dễ mở rộng).

---

## 7. ROUTES
```ts
// Public (không JWT) – bảo vệ bằng chữ ký
router.post('/webhook/momo', asyncHandler(momoWebhook));         // 204
router.get('/webhook/vnpay-ipn', asyncHandler(vnpayIpn));        // JSON RspCode

// Có JWT
router.post('/create-url', authenticate, validateBody(createPaymentUrlSchema), asyncHandler(createUrl)); // { payUrl }
router.get('/order/:orderId', ...giữ nguyên, trả payment mới nhất);
router.patch('/:id/status', ...giữ nguyên (ADMIN/STAFF) nhưng chuyển sang TransactionStatus và đồng bộ Order.paymentStatus);
```
**Đặt route webhook TRƯỚC `/:id/status`** để không bị nhầm. Route webhook phải được đăng ký ở router nhưng **không** gọi `authenticate`.

---

## 8. LOGIC CHI TIẾT

### `createPaymentUrl(user, {orderId, method})`
1. Lấy Order (kèm payments). 404 nếu không có; `CUSTOMER` chỉ được thao tác đơn của mình (403).
2. 409 nếu `order.paymentStatus === 'PAID'` hoặc `status === 'CANCELLED'`; Nếu đang có Payment `INITIATED/PENDING` chưa hết hạn → **luôn tạo attempt mới** (không tái sử dụng URL cũ, không trả 409). Trong cùng transaction, đánh dấu các attempt cũ còn `INITIATED/PENDING` là `CANCELLED` (`failureCode='SUPERSEDED'`) để mỗi order chỉ có 1 attempt active.
   - Webhook đến muộn cho attempt đã `CANCELLED`/`EXPIRED`: vẫn verify và ghi callback. Nếu thành công thật (`resultCode=0`) và order **chưa PAID** → chấp nhận, set Payment `PAID` + Order `PAID` (tiền đã trừ của khách). Nếu order **đã PAID** bởi attempt khác → ghi callback `FAILED` với `errorMessage='DUPLICATE_PAYMENT'`, giữ nguyên trạng thái và log cảnh báo để xử lý hoàn tiền thủ công.
3. Tạo Payment mới `attemptNo = max+1`, `status INITIATED`, `amount` từ DB, `merchantRef`, `expiresAt`.
4. Gọi cổng → thành công: `status PENDING`, lưu payload; thất bại: `status FAILED` + `failureCode/Message`, ném 502.
5. Cập nhật `Order.paymentMethod = method`. Trả `{ payUrl, paymentId, expiresAt }`.

### `processWebhook` (chung cho 2 cổng, thứ tự bắt buộc)
1. Lưu `PaymentCallback` (RECEIVED, `rawPayload`, `headers`) càng sớm càng tốt – kể cả chữ ký sai (đánh `REJECTED_INVALID_SIGNATURE`, `signatureValid=false`, trả lỗi, không đổi trạng thái đơn). Với chữ ký sai không có `providerEventId` hợp lệ → để null.
2. Verify chữ ký bằng `crypto.timingSafeEqual` (kiểm tra độ dài trước). Đúng → `signatureValid=true`, `VERIFIED`.
3. Idempotency (mục 3) → `DUPLICATED` nếu đã xử lý.
4. Tìm Payment theo `merchantRef`; không có → callback `FAILED` + 404 (MoMo) / `01` (VNPay).
5. Đối chiếu amount với `Payment.amount`; lệch → callback `FAILED`, errorMessage, **không** PAID.
6. `prisma.$transaction`:
   - Thành công: `updateMany` Payment sang `PAID` (`paidAt`, `providerTxnId`) với điều kiện đang INITIATED/PENDING; nếu `count === 1` → `Order.update`: `paymentStatus PAID`, `paidAt`, `paymentMethod`, và `status: PROCESSING` nếu đang `PENDING`.
   - Thất bại: Payment `FAILED` (`failureCode/Message`); Order giữ `paymentStatus PENDING` (hoặc `FAILED` nếu không còn attempt nào PENDING/PAID) – cho phép thanh toán lại.
   - Cập nhật callback `APPLIED`, `processedAt`.
7. Trả response nhanh (<5s); không làm việc nặng đồng bộ. Mọi exception không mong muốn: ghi callback `FAILED`, trả 5xx để cổng retry (idempotent đảm bảo an toàn).
8. Payment đã `PAID` mà nhận IPN thất bại muộn → bỏ qua, không hạ trạng thái.
9. Điều kiện `updateMany` ở bước 6 mở rộng: Payment ở `INITIATED/PENDING/CANCELLED/EXPIRED` đều được phép chuyển `PAID` khi IPN thành công hợp lệ (xem quy tắc attempt muộn ở mục `createPaymentUrl`).

---

## 9. BẢO MẬT
- Không log `secretKey/accessKey/hashSecret`; không lưu vào `requestPayload`.
- So sánh chữ ký timing-safe. Không tin `amount` client.
- Webhook không auth nhưng chỉ chấp nhận khi chữ ký hợp lệ.
- Giới hạn body size hợp lý; zod `passthrough()` cho payload cổng (cổng có thể thêm field).

---

## 10. TEST
1. Unit test (vitest/jest theo project; nếu chưa có thì dùng script ts + `node:test`): sign/verify MoMo & VNPay, idempotent (gửi 2 lần cùng `transId` → 1 callback APPLIED + 1 DUPLICATED/ALREADY), 2 webhook song song, amount lệch, `resultCode != 0`, chữ ký sai, order đã CANCELLED.
2. Script giả lập webhook: `apps/api/scripts/simulate-webhook.ts` (tự ký bằng secret trong `.env`) để test không cần app MoMo.
3. Test thật sandbox: `npx ngrok http 5000` (**port API là 5000**, không phải 3001) → copy URL HTTPS vào `API_BASE_URL` → restart server → cấu hình IPN URL VNPay trên portal sandbox (`/api/payments/webhook/vnpay-ipn`). Thẻ test VNPay: NCB `9704198526191432198`, tên `NGUYEN VAN A`, ngày `07/15`, OTP `123456`.
4. Chạy `npx tsc --noEmit` và lint, đảm bảo luồng tạo đơn CASH cũ vẫn chạy.

---

## 11. ĐẦU RA YÊU CẦU
- Code hoàn chỉnh, type rõ ràng (định nghĩa `MoMoIpnPayload`, `VNPayIpnQuery`, hạn chế `any`).
- Danh sách file thay đổi + lý do; liệt kê các chỗ đã sửa do lệch schema.
- Hướng dẫn chạy thử từng bước + lệnh curl mẫu.
- Nêu các giả định/quyết định (cách xử lý attempt cũ, expiry, v.v.).

---

## 12. LUẬN ĐIỂM BÁO CÁO GIẢNG VIÊN
1. **Tách bạch**: `Payment` (từng lần thử, trạng thái logic) và `PaymentCallback` (nhật ký thô mọi webhook, có `signatureValid`, `retryCount`) + `PaymentReconciliation` phục vụ đối soát.
2. **Bảo mật**: HMAC-SHA256 (MoMo) / HMAC-SHA512 (VNPay), timing-safe compare, đối chiếu amount từ DB, chỉ tin IPN không tin redirect.
3. **Idempotency**: `providerEventId @unique` + `providerTxnId @unique` + cập nhật trạng thái nguyên tử (`updateMany` có điều kiện) → miễn nhiễm webhook retry và race condition.
