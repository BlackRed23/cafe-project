# Test Data - Simulate Sale

## Tài khoản test
- Role: ADMIN
- Email:
- Ghi chú: dùng tài khoản admin hiện có trong database

## Product test mẫu

### Product A - đủ tồn kho
- productId: `cmpzg8y1f000252s58twyiszn`
- productName: `thạch`
- stockBefore: 20
- minThreshold: 10
- quantity simulate: 5
- Kỳ vọng:
  - stockAfter = stockBefore - quantity
  - không lỗi tồn kho

### Product B - tồn kho thấp
- productId:
- productName:
- stockBefore:
- minThreshold:
- quantity simulate:
- Kỳ vọng:
  - stockAfter < minThreshold
  - Agent được kích hoạt
  - Có AgentLog
  - Có thể tạo PurchaseRequest nếu đủ Supplier và setting AI

### Product C - không đủ tồn kho
- productId:
- productName:
- stockBefore:
- quantity simulate:
- Kỳ vọng:
  - API trả lỗi nghiệp vụ
  - Inventory không bị trừ

# Cách lấy dữ liệu test thật

**Lưu ý quan trọng:** 
Đã chuẩn bị thành công dữ liệu tồn kho cho Product A (thạch) với stockBefore = 20 thông qua API `/api/inventories/adjust`. Hệ thống đã đủ điều kiện để test luồng success.

## Cách 1: Lấy qua UI
1. Đăng nhập admin.
2. Vào trang quản lý sản phẩm / inventory.
3. Chọn 3 sản phẩm:
   - Product A: tồn kho đủ
   - Product B: tồn kho gần hoặc dưới minThreshold
   - Product C: tồn kho thấp để test lỗi không đủ tồn kho
4. Ghi lại productId, productName, stockBefore, minThreshold.

## Cách 2: Lấy qua API nếu có token admin
- GET /api/products
- GET /api/inventories
- GET /api/suppliers
- GET /api/purchase-requests
- GET /api/agent/logs

## Dữ liệu cần điền
- admin email:
- frontend URL:
- backend URL:
- productId:
- productName:
- stockBefore:
- quantity simulate:
- minThreshold:
- supplierId nếu test tạo PurchaseRequest:
