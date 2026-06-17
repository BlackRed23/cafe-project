# TC_05 - UI hiển thị response thật từ backend

## Mục tiêu
Kiểm tra frontend không tự đoán stockAfter mà hiển thị theo response backend.

## Dữ liệu test
- productId: `cmpzg8y1f000252s58twyiszn`
- productName: `thạch`
- stockBefore: `8`
- quantity: `1`
- stockAfter backend trả: `7`

## Các bước test
1. Mở DevTools Network.
2. Thực hiện simulate sale.
3. Xem payload request.
4. Xem response backend.
5. Đối chiếu UI với response.

## Kết quả mong đợi
- Payload có `productId`.
- Payload có `quantity`.
- UI hiển thị `productName` từ backend.
- UI hiển thị `stockBefore` từ backend.
- UI hiển thị `stockAfter` từ backend.
- UI hiển thị `decreasedQuantity` từ backend.
- UI không hiển thị lệch sản phẩm.

## Kết quả thực tế
- Ngày test: 2026-06-17.
- Frontend URL: `http://127.0.0.1:5173`.
- Backend URL: `http://localhost:5000`.
- Payload:
```json
{
  "productId": "cmpzg8y1f000252s58twyiszn",
  "quantity": 1,
  "note": "Frontend simulate sale request for product cmpzg8y1f000252s58twyiszn"
}
```
- Response:
```json
{
  "affectedProduct": {
    "productId": "cmpzg8y1f000252s58twyiszn",
    "productName": "thạch",
    "stockBefore": 8,
    "stockAfter": 7,
    "minThreshold": 10,
    "decreasedQuantity": 1
  },
  "productId": "cmpzg8y1f000252s58twyiszn",
  "productName": "thạch",
  "stockBefore": 8,
  "stockAfter": 7,
  "decreasedQuantity": 1,
  "createdPurchaseRequests": []
}
```
- API response đúng công thức: Có, `7 = 8 - 1`.
- UI đã kiểm tra trực tiếp bằng Chrome DevTools Protocol tại `http://127.0.0.1:5173/admin/simulate-sale`.
- UI hiển thị:
  - `productName`: `thạch`
  - `decreasedQuantity`: `1`
  - `stockBefore`: `8`
  - `stockAfter`: `7`
- Đối chiếu backend response với UI:
  - `productName`: Khớp.
  - `stockBefore`: Khớp.
  - `stockAfter`: Khớp.
  - `decreasedQuantity`: Khớp.
- Ghi chú: ADMIN đăng nhập bằng `admin@cafe.com`; credential demo `admin@cafe.local` trả `401 Invalid credentials`.

## Đánh giá
- [x] Pass
- [ ] Fail
- [ ] Blocked - chưa có bằng chứng UI trực tiếp

---

## Bổ sung: UI Toast Notification (2026-06-17)

### Mục tiêu
Kiểm tra toast thông báo hiển thị đúng sau khi simulate sale, dựa trên response backend.

### Các toast kiểm tra

| Kịch bản | Toast mong đợi | Dữ liệu từ |
|---|---|---|
| Sản phẩm chưa liên kết nhà cung cấp (NO_SUPPLIER) | ⚠️ warning: "Sản phẩm chưa được liên kết với nhà cung cấp..." | `response.agentLogs` |
| `createdPurchaseRequests.length > 0` | ✅ success: "AI Agent đã tạo yêu cầu nhập hàng: {requestNumber}." | `response.createdPurchaseRequests` |
| agentLogs có `SKIPPED_DUPLICATE` / `ACTIVE_PR_EXISTS` | ℹ️ info: "Sản phẩm đã có yêu cầu nhập hàng đang chờ xử lý." | `response.agentLogs` |
| Tồn kho thấp nhưng không tạo PR | ℹ️ info: "Mô phỏng bán hàng thành công, nhưng AI Agent chưa tạo yêu cầu nhập hàng." | logic fallback |
| Simulate sale thành công, tồn kho bình thường | ✅ success: "Mô phỏng bán hàng thành công. Tồn kho còn {stockAfter}." | `response.stockAfter` |
| API trả 400 | ❌ error: "Không đủ tồn kho để mô phỏng bán hàng." | `err.response.status` |
| Lỗi mạng/server | ❌ error: "Không thể mô phỏng bán hàng. Vui lòng thử lại." | catch block |

### Chi tiết kỹ thuật
- Toast inline bằng React state, không cài package mới.
- Auto-dismiss sau 6 giây, có nút đóng thủ công.
- Animation slide-in từ phải (`@keyframes slideInRight`).
- Dữ liệu toast lấy trực tiếp từ response backend, không hard-code sản phẩm.
- Không thay đổi logic simulate sale đã Pass.

### Build
- `npx vite build`: ✅ Pass.
- Lỗi tsc ở các file không liên quan (Order/Checkout pages) — không thuộc phạm vi sửa.

### Đánh giá bổ sung
- [x] Toast implementation đã được thêm vào source code
- [x] Build frontend thành công
- [ ] Cần test thủ công trên UI để xác nhận toast hiển thị đúng

