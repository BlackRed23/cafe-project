# TC_02 - Simulate Sale lỗi không đủ tồn kho

## Mục tiêu
Kiểm tra backend chặn khi quantity lớn hơn tồn kho hiện tại.

## Dữ liệu test
- productId: `cmpzg8y1f000252s58twyiszn`
- productName: `thạch`
- stockBefore: `15`
- quantity lớn hơn tồn kho: `16`
- minThreshold: `10`

## Các bước test
1. Đăng nhập ADMIN.
2. Vào `/admin/simulate-sale`.
3. Chọn product có tồn kho thấp.
4. Nhập quantity lớn hơn `stockBefore`.
5. Bấm simulate sale.

## Kết quả mong đợi
- API trả lỗi nghiệp vụ rõ ràng.
- Inventory không bị trừ.
- UI hiển thị lỗi dễ hiểu.
- Không tạo AgentLog sai.
- Không tạo PurchaseRequest sai.

## Kết quả thực tế
- Ngày test: 2026-06-17.
- Backend URL: `http://localhost:5000`.
- API request: `POST /api/simulate-sale`.
- Payload:
```json
{
  "productId": "cmpzg8y1f000252s58twyiszn",
  "quantity": 16,
  "note": "TC_02 insufficient stock manual test"
}
```
- HTTP status: `400`.
- Error message: `Not enough inventory for thạch. Current stock: 15, requested: 16.`
- Inventory sau test: `15`.
- Inventory không bị trừ: Có.
- AgentLog sai: Không thấy tăng số lượng log trong bước kiểm tra API.
- PurchaseRequest sai: Không thấy tăng số lượng request trong bước kiểm tra API.
- UI hiển thị lỗi: Chưa kiểm tra trực tiếp bằng DevTools trong bước này; backend đã trả message rõ ràng cho frontend hiển thị.
- Ghi chú: Không sửa code, không sửa schema, không chạy migration, không seed, không refactor.

## Đánh giá
- [x] Pass
- [ ] Fail
