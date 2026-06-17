# Simulate Sale Fix Log

## 1. Mục tiêu sửa
- Sửa luồng simulate sale để frontend chọn sản phẩm nào thì backend trừ đúng tồn kho sản phẩm đó.

## 2. File đã đọc
- `apps/web/src/api/simulateSale.api.ts`
- `apps/web/src/pages/admin/AdminSimulateSalePage.tsx`
- `apps/api/src/modules/simulate-sale/simulate-sale.route.ts`
- `apps/api/src/modules/simulate-sale/simulate-sale.validator.ts`
- `apps/api/src/modules/simulate-sale/simulate-sale.controller.ts`
- `apps/api/src/modules/simulate-sale/simulate-sale.service.ts`
- `apps/api/src/modules/simulate-sale/simulate-sale.repository.ts`
- `apps/api/src/modules/agent/agent.service.ts`
- `packages/database/prisma/schema/inventory.prisma`
- `packages/database/prisma/schema/product.prisma`
- `packages/database/prisma/schema/purchase.prisma`
- `packages/database/prisma/schema/system.prisma`

## 3. File đã sửa
- `apps/web/src/api/simulateSale.api.ts`
- `apps/web/src/pages/admin/AdminSimulateSalePage.tsx`
- `apps/api/src/modules/simulate-sale/simulate-sale.validator.ts`
- `apps/api/src/modules/simulate-sale/simulate-sale.repository.ts`
- `apps/api/src/modules/simulate-sale/simulate-sale.service.ts`

## 4. Thay đổi chính
- Frontend:
  - `simulateSale.api.ts` gửi `productId`, `quantity`, `note` lên `/simulate-sale`.
  - `AdminSimulateSalePage` lấy `stockBefore`, `stockAfter`, `decreasedQuantity`, `productName`, `minThreshold` từ response backend thay vì tự đoán `stockAfter`.
- Backend validator:
  - `simulateSaleSchema` nhận `productId` và `quantity`.
  - Giữ nhánh field legacy `productCount/minDecrease/maxDecrease` nhưng bắt buộc đủ field nếu không truyền `productId`.
- Backend service:
  - Nếu có `productId`, tìm đúng inventory theo productId.
  - Chặn product inactive.
  - Nếu tồn kho không đủ, trả lỗi nghiệp vụ rõ ràng.
  - Chỉ trừ đúng inventory của product được chọn.
- Response contract:
  - Trả `affectedProduct`, `affectedProducts`, `productId`, `productName`, `stockBefore`, `stockAfter`, `decreasedQuantity`, `createdPurchaseRequests`, `agentLogs`.
- Agent scan:
  - Sau khi trừ kho, gọi `agentService.scanInventory({ productIds: [affectedProduct.productId], triggerType: "SIMULATE_SALE" }, userId)`.

## 5. Luồng sau khi sửa
1. Admin chọn product
2. Frontend gửi productId + quantity
3. Backend tìm inventory theo productId
4. Backend trừ tồn kho
5. Backend gọi agent scan
6. Backend trả kết quả thật
7. Frontend render theo response backend

## 6. Kiểm tra sau sửa
- Typecheck:
  - `npm run check-types` không chạy được vì Turbo báo thiếu task `check-types` trong project.
- Build:
  - `npm run build -w @cafe-project/api`: thành công.
  - `npm run build -w @cafe-project/web`: thành công.
- Test manual đề xuất:
  - Đăng nhập admin.
  - Vào `/admin/simulate-sale`.
  - Chọn một sản phẩm có tồn kho đủ, nhập quantity nhỏ hơn hoặc bằng tồn kho.
  - Xác nhận tồn kho sản phẩm đó giảm đúng `quantity`.
  - Kiểm tra inventory transaction có type `SIMULATE_SALE`.
  - Nếu tồn kho sau bán dưới ngưỡng, kiểm tra Agent Log và Purchase Request nếu đủ điều kiện supplier.
  - Thử quantity lớn hơn tồn kho và xác nhận API trả lỗi nghiệp vụ.

## 7. Những phần không đụng tới
- Không sửa database schema
- Không chạy migration
- Không chạy seed
- Không sửa order/payment/checkout/product form
- Không refactor ngoài phạm vi simulate sale

## 8. Rủi ro còn lại
- Nhánh simulate sale legacy không truyền `productId` vẫn còn dùng cơ chế chọn inventory ngẫu nhiên để tránh phá contract cũ, nhưng frontend admin hiện đã gửi `productId`.
- Agent chỉ tạo purchase request nếu product có tồn kho thấp, không có request mở trùng, có supplier hợp lệ và AI setting cho phép.
- Build frontend có thể cập nhật output trong `apps/web/dist` vì script build của project ghi artifact.
