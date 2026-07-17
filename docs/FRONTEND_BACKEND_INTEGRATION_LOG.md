
## [2026-06-27] Fix API TypeScript Build For Docker

- **Nguyên nhân Docker build fail:** Trong môi trường Docker, TypeScript check với cờ strict: true phát hiện các tham số callback bị thiếu kiểu dữ liệu (TS7006), và một số thuộc tính Prisma không infer được đúng cấu trúc (TS2339). Ngoài ra, TypeScript không nhận diện được kiểu số trong một số phép tính toán (TS2362).
- **Danh sách file đã sửa:**
  - apps/api/src/modules/dashboard/dashboard.service.ts
  - apps/api/src/modules/email/email.service.ts
  - apps/api/src/modules/inventory/inventory.repository.ts
  - apps/api/src/modules/inventory/inventory.service.ts
  - apps/api/src/modules/order/order.repository.ts
  - apps/api/src/modules/product/product.repository.ts
  - apps/api/src/modules/purchase/purchase.repository.ts
  - apps/api/src/modules/simulate-sale/simulate-sale.repository.ts
  - apps/api/src/modules/simulate-sale/simulate-sale.service.ts
- **Nhóm lỗi đã xử lý:**
  - TS7006 (Parameter implicitly has an any type): Bổ sung explicit type (bao gồm any nếu cần thiết và explicit interface) vào các tham số callback.
  - TS2339 (Property does not exist on type {}): Thêm Prisma.TransactionClient cho tham số tx trong prisma.$transaction ở các file repository để Prisma Client tự động nhận diện chuẩn xác schema type cho include.
  - TS2362 (arithmetic operation must be number): Ép kiểu qua hàm Number(...) khi chia số trong module inventory.
- **Kết quả npm run build -w @cafe-project/api:** Thành công không có lỗi (exit code 0).
- **Kết quả docker build -f apps/api/Dockerfile -t cafe-api:local .:** Build thành công, tạo image cafe-api:local.

## [2026-06-27] Fix Agent TypeScript Build For Docker

- **Nguyên nhân Agent Docker build fail:** Trong môi trường Docker, TypeScript check với cờ strict: true phát hiện các tham số callback bị thiếu kiểu dữ liệu (TS7006) và một số thuộc tính Prisma không nhận đúng type của model.
- **Danh sách file đã sửa:**
  - apps/agent/src/repositories/agent.repository.ts
  - apps/agent/src/services/agent.service.ts
- **Nhóm lỗi đã xử lý:**
  - TS7006 (Parameter implicitly has an any type): Bổ sung explicit type cho `sum`, `item`, `product`.
  - Type của tx: Thêm `Prisma.TransactionClient` cho tham số `tx` trong `prisma.$transaction`.
  - Type của log (TS7006): Sử dụng `ReturnType<typeof toLogDto>` và explicit `any` ở một phạm vi nhỏ có ghi lý do rõ ràng trong `agent.service.ts` do `findLogs` trả về model type chưa infer đầy đủ Prisma payload.
- **Kết quả npm run build -w @cafe-project/agent:** Thành công không có lỗi (exit code 0).
- **Kết quả docker build -f apps/agent/Dockerfile -t cafe-agent:local .:** Build thành công, tạo image cafe-agent:local.

## Cleanup note - Chuẩn hoá file tích hợp frontend/backend/agent

- **File được chuyển sang \	ools/test-live/\:** Các file script chạy thật để test luồng: \eproduce.js\, \un_scan.js\, \	est_api.js\, \	est_logs.js\, \	est_mojibake.js\, \	est_scan.js\.
- **File vẫn nằm trong \	ests/\:** Toàn bộ thư mục \	ests/\ chứa Playwright specs.
- **Lý do không được chỉ test frontend localhost:5173 mà phải có backend, agent và database khi test live:** Để đảm bảo tính chính xác của các luồng nghiệp vụ end-to-end (ví dụ: tạo yêu cầu nhập hàng, agent kiểm định tự động, cập nhật webhook ngược về frontend), test live bắt buộc phải chạy đồng thời cả hệ sinh thái (frontend, backend API, agent service, database) để mô phỏng đúng môi trường production.
## Latest - Add Supplier Payment Status After Receive

### Mục tiêu
Bổ sung luồng nhận hàng trước, tăng tồn kho, ghi nhận chưa thanh toán và cho phép admin thanh toán sau.

### File đã scan
- packages/database/prisma/schema/*
- apps/api/src/modules/purchase/purchase.route.ts
- apps/api/src/modules/purchase/purchase.controller.ts
- apps/api/src/modules/purchase/purchase.service.ts
- apps/api/src/modules/purchase/purchase.repository.ts
- apps/api/src/modules/inventory/inventory.service.ts
- apps/api/src/modules/inventory/inventory.repository.ts
- apps/web/src/pages/admin/AdminPurchaseRequestsPage.tsx
- apps/web/src/pages/admin/AdminPurchaseRequestDetailPage.tsx
- apps/web/src/api/purchaseRequests.api.ts
- apps/web/src/types/purchaseRequest.types.ts
- docs/FRONTEND_BACKEND_INTEGRATION_LOG.md

### File đã sửa
- packages/database/prisma/schema/purchase.prisma
- apps/api/src/modules/purchase/purchase.route.ts
- apps/api/src/modules/purchase/purchase.controller.ts
- apps/api/src/modules/purchase/purchase.service.ts
- apps/api/src/modules/purchase/purchase.repository.ts
- apps/api/src/modules/purchase/purchase.validator.ts
- apps/web/src/pages/admin/AdminPurchaseRequestsPage.tsx
- apps/web/src/pages/admin/AdminPurchaseRequestDetailPage.tsx
- apps/web/src/api/purchaseRequests.api.ts
- apps/web/src/types/purchaseRequest.types.ts
- docs/FRONTEND_BACKEND_INTEGRATION_LOG.md

### Schema/payment
PurchaseRequest chưa có field thanh toán nên đã thêm mới:
- paymentStatus
- paidAt
- paymentNote

### Luồng nhận hàng
- Nhận hàng tăng tồn kho.
- Nhận hàng ghi lịch sử kho.
- PR chuyển sang đã nhận hàng khi nhận đủ số lượng.
- paymentStatus set UNPAID.
- paidAt set null.
- Không cần thanh toán trước.

### Luồng thanh toán sau
- Admin mark paid sau khi nhận hàng.
- paymentStatus set PAID.
- paidAt được cập nhật.
- paymentNote được lưu nếu có.

### UI
- Badge Chưa thanh toán / Đã thanh toán.
- Khối Thanh toán nhà cung cấp.
- Nút Đánh dấu đã thanh toán.
- Toast nhận hàng/thanh toán.

### Không sửa
- Không sửa Order/reservedStock.
- Không sửa Agent scan logic.
- Không sửa Agent tạo PR.
- Không bắt thanh toán khi nhập kho thủ công.
- Không tích hợp cổng thanh toán.

### Build/test
- API build: PASS.
- Web build: PASS.
- Database build: PASS.
- Manual test: FAIL - chưa chạy live manual test full stack trong lượt này.
- DB push: PASS.
- DB generate: PASS bằng npm run generate -w @cafe-project/database; npm run db:generate -w @cafe-project/database FAIL vì package không có script db:generate.
