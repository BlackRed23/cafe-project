# TC_01 - Simulate Sale thành công

## Mục tiêu
Kiểm tra admin chọn product nào thì backend trừ đúng inventory của product đó.

## Dữ liệu test
- productId: `cmpzg8y1f000252s58twyiszn`
- productName: `thạch`
- stockBefore: 20
- quantity: 5
- minThreshold: 10

## Các bước test
1. Đăng nhập bằng tài khoản ADMIN.
2. Vào `/admin/simulate-sale`.
3. Chọn product theo `productId` ở trên.
4. Nhập quantity.
5. Bấm simulate sale.
6. Kiểm tra response backend.
7. Kiểm tra UI hiển thị kết quả.

## Kết quả mong đợi
- Request gửi lên có `productId`.
- Request gửi lên có `quantity`.
- Response trả đúng `productId`.
- Response trả đúng `productName`.
- `stockAfter = stockBefore - quantity`.
- UI hiển thị đúng sản phẩm vừa chọn.
- Không trừ nhầm sản phẩm khác.

## Kết quả thực tế
- Status: Pass
- Ngày kiểm tra: 2026-06-16.
- Admin login: Thành công qua `POST /api/auth/login`, user role `ADMIN`.
- Chuẩn bị dữ liệu: Đã điều chỉnh qua API `/api/inventories/adjust` thành công, nâng tồn kho sản phẩm `thạch` lên 20.
- API lấy inventory: Thành công qua `GET /api/inventories`.
- Dữ liệu inventory kiểm tra:
  - `cmpzg8y1f000252s58twyiszn` - `thạch` - stockBefore `20` - minThreshold `10`.
- API request simulate sale: Gửi thành công `POST /api/simulate-sale` với payload `{ "productId": "cmpzg8y1f000252s58twyiszn", "quantity": 5 }`.
- API response simulate sale: 
  - stockBefore: 20
  - stockAfter: 15
  - decreasedQuantity: 5
- Kiểm tra công thức: stockAfter (15) = stockBefore (20) - quantity (5) -> Đúng.
- Kiểm tra không trừ nhầm sản phẩm khác: Confirm qua response chỉ trả về mảng affectedProduct đúng sản phẩm `thạch`.

## Đánh giá
- [x] Pass
- [ ] Fail
- [ ] Blocked
