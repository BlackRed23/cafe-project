# TC_04 - Simulate Sale tạo Purchase Request

## Mục tiêu
Kiểm tra khi tồn kho sau bán thấp hơn minThreshold, hệ thống có tạo PurchaseRequest nếu đủ điều kiện.

## Điều kiện cần
- Product có Supplier hợp lệ.
- Chưa có PurchaseRequest mở bị trùng.
- AI setting cho phép tạo đề xuất nhập hàng.
- stockAfter < minThreshold.

## Dữ liệu test
- productId: `cmpzg8y1f000252s58twyiszn`
- productName: `thạch`
- supplierId: `cmpxy7c7b000pxs8bdocusg99`
- supplierName: `nhà cung cap duy`
- ai.enabled: `true`
- stockBefore: `7`
- quantity: `1`
- minThreshold: `10`
- stockAfter dự kiến: `6`

## Các bước test
1. Chuẩn bị product có supplier.
2. Simulate sale để stockAfter thấp hơn minThreshold.
3. Kiểm tra response `createdPurchaseRequests`.
4. Kiểm tra trang purchase request nếu có.
5. Kiểm tra AgentLog.

## Kết quả mong đợi
- Có PurchaseRequest nếu đủ điều kiện.
- PurchaseRequest có `aiGenerated = true` nếu logic hiện tại hỗ trợ.
- Item trong PurchaseRequest đúng productId.
- Không tạo request trùng nếu đã có request mở.

## Kết quả thực tế
- Ngày test: 2026-06-17.
- Không tìm được product khác đủ điều kiện:
  - `HIHI` có supplier nhưng đã có PurchaseRequest mở `PENDING`.
  - `THẠCH DÁTE DUY` có inventory nhưng chưa có supplier.
  - `thạch` có supplier nhưng ban đầu có PurchaseRequest mở trùng.
- Đã xử lý PurchaseRequest trùng của `thạch` qua API nghiệp vụ hiện có, không xóa dữ liệu trực tiếp:
  - purchaseRequestId: `cmpzgao7t000h52s5l4d888ot`
  - requestNumber: `AI-REC-1780574856472`
  - status trước xử lý: `PENDING`
  - action: `PATCH /api/purchase-requests/cmpzgao7t000h52s5l4d888ot/reject`
  - status sau xử lý: `REJECTED`
- PurchaseRequest mở trùng trước khi chạy lại simulate: Không, danh sách open `PENDING` / `APPROVED` / `SENT` cho product `thạch` là `[]`.
- stockAfter < minThreshold: Có, `6 < 10`.
- Product có supplier hợp lệ: Có.
- AI setting cho phép: Có, `ai.enabled = true`.
- Payload simulate sale:
```json
{
  "productId": "cmpzg8y1f000252s58twyiszn",
  "quantity": 1,
  "note": "TC_04 retest simulate sale after rejecting duplicate PR through workflow"
}
```
- Response affectedProduct:
```json
{
  "productId": "cmpzg8y1f000252s58twyiszn",
  "inventoryId": "cmpzg8y23000452s58e3qyi96",
  "productName": "thạch",
  "stockBefore": 7,
  "stockAfter": 6,
  "minThreshold": 10,
  "decreasedQuantity": 1
}
```
- Response `createdPurchaseRequests`:
```json
[
  {
    "id": "cmqhfn2ei000k3yttwyjhbs0o",
    "requestNumber": "AI-PR-1781662146267-iszn",
    "supplierName": "nhà cung cap duy",
    "status": "PENDING"
  }
]
```
- PurchaseRequest sau test:
  - purchaseRequestId: `cmqhfn2ei000k3yttwyjhbs0o`
  - requestNumber: `AI-PR-1781662146267-iszn`
  - status: `PENDING`
  - aiGenerated: `true`
  - supplierId: `cmpxy7c7b000pxs8bdocusg99`
  - supplierName: `nhà cung cap duy`
  - item productId: `cmpzg8y1f000252s58twyiszn`
  - item productName: `thạch`
  - item quantity: `24`
  - item unitPrice: `50000`
- Có tạo PurchaseRequest mới: Có.
- Không tạo sai product: Có, item đúng productId `cmpzg8y1f000252s58twyiszn`.
- AgentLog:
  - id: `cbe31230-fe68-4ec8-961c-3ed0483210b1`
  - action: `SCAN_INVENTORY_CREATE_PURCHASE_REQUEST`
  - triggerType: `SIMULATE_SALE`
  - productId: `cmpzg8y1f000252s58twyiszn`
  - currentQty: `6`
  - minThreshold: `10`
  - output.purchaseRequestId: `cmqhfn2ei000k3yttwyjhbs0o`
  - output.recommendedSupplierId: `cmpxy7c7b000pxs8bdocusg99`
  - output.recommendedQty: `24`
  - result: `CREATED_PURCHASE_REQUEST`
- Ghi chú: TC_04 dùng Cách 2 vì không có product khác đủ điều kiện. PurchaseRequest trùng cũ được chuyển trạng thái bằng API nghiệp vụ `reject`, không xóa trực tiếp database.

## Đánh giá
- [x] Pass
- [ ] Fail
- [ ] Blocked - đã có PurchaseRequest mở trùng
