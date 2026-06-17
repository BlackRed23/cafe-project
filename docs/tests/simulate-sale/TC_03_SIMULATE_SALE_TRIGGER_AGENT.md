# TC_03 - Simulate Sale kích hoạt Agent scan

## Mục tiêu
Kiểm tra sau khi trừ tồn kho, backend gọi Agent scan đúng product vừa bị ảnh hưởng.

## Dữ liệu test
- productId: `cmpzg8y1f000252s58twyiszn`
- productName: `thạch`
- stockBefore: `15`
- quantity: `6`
- minThreshold: `10`
- stockAfter dự kiến: `9`

## Các bước test
1. Chọn product có khả năng xuống dưới hoặc gần `minThreshold`.
2. Thực hiện simulate sale.
3. Kiểm tra response có `agentLogs` nếu backend trả.
4. Vào `/admin/agent-logs`.
5. Kiểm tra log mới nhất.

## Kết quả mong đợi
- Agent scan đúng productId.
- AgentLog có action liên quan simulate sale / inventory scan.
- AgentLog không ghi nhầm product khác.
- Nếu không tạo log, phải có lý do rõ ràng.

## Kết quả thực tế
- Ngày test: 2026-06-17.
- API request: `POST /api/simulate-sale`.
- Payload:
```json
{
  "productId": "cmpzg8y1f000252s58twyiszn",
  "quantity": 6,
  "note": "TC_03_04_05 grouped simulate sale manual test"
}
```
- Simulate sale thành công: Có.
- stockBefore: `15`.
- stockAfter: `9`.
- Công thức: `9 = 15 - 6`.
- Có AgentLog: Có.
- AgentLog id: `cfb2462c-89e1-49c3-9855-0fb93682ab3d`.
- AgentLog action: `SCAN_INVENTORY_SKIP_DUPLICATE`.
- AgentLog triggerType: `SIMULATE_SALE`.
- AgentLog productId: `cmpzg8y1f000252s58twyiszn`.
- AgentLog reference: `Inventory cmpzg8y23000452s58e3qyi96`.
- AgentLog result: `SKIPPED_DUPLICATE`.
- Ghi chú: Agent scan đúng product; kết quả skip do đã có PurchaseRequest mở trùng.

## Đánh giá
- [x] Pass
- [ ] Fail
