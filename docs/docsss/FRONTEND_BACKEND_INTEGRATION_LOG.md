# Frontend–Backend Integration Log

Tài liệu này ghi lại các quyết định tích hợp, bug fix và thay đổi logic liên quan đến module AI Agent và quản lý tồn kho.

---

## [2026-07-18] Fix Bug Logic AI Agent — Đồng bộ tiêu chí "cần đặt hàng" + Cảnh báo NCC backup

### Vấn đề phát hiện (từ audit scan 2026-07-18)

Scan toàn bộ codebase AI Agent phát hiện 2 bug logic trong hai service xử lý tồn kho tự động:

**BUG 1 — Hai luồng scan dùng tiêu chí skip khác nhau:**
- `agentService.scanInventory()` (trong `apps/agent/src/services/agent.service.ts`):  
  Skip khi `availableStock > reorderPoint` — `reorderPoint` là giá trị **động**, tính từ: `leadTimeDemand + safetyStock` dựa trên lịch sử bán 30 ngày + leadTimeDays của NCC + buffer.
- `recommendationService.generateForProduct()` (trong `apps/agent/src/services/recommendation.service.ts`):  
  Skip khi `inventory.quantity > inventory.minThreshold` — `minThreshold` là giá trị **cố định** lưu trong DB, mặc định = 10.
- **Hậu quả:** Cùng 1 sản phẩm có `quantity` nằm giữa `minThreshold` và `reorderPoint` — `scanInventory` tự tạo PR nhưng `recommendReorder` lại bỏ qua (ABOVE_THRESHOLD), hoặc ngược lại.

**BUG 2 — `backupSuppliers` được tính nhưng không dùng:**
- `agentService.scanInventory()` tính danh sách `backupSuppliers` (các NCC hoạt động khác NCC được chọn) và ghi vào log.
- Nhưng thông tin này không được dùng để đưa ra bất kỳ cảnh báo hay quyết định nào.
- **Hậu quả:** Admin không biết có NCC nào giao nhanh hơn đáng kể, trong khi agent vẫn chọn NCC chậm hơn do `isPreferred = true`.

---

### Files đã sửa

| File | Loại thay đổi |
|---|---|
| `apps/agent/src/utils/inventory.utils.ts` | **[NEW]** Hàm `calculateReorderPoint()` dùng chung |
| `apps/agent/src/services/agent.service.ts` | [MODIFY] Import + refactor reorderPoint + thêm backup supplier warning |
| `apps/agent/src/services/recommendation.service.ts` | [MODIFY] Import + đổi skip condition + fetch sales sớm hơn |

---

### Chi tiết thay đổi

#### `apps/agent/src/utils/inventory.utils.ts` — File mới

Hàm `calculateReorderPoint(averageDailySales, leadTimeDays, ...)` với công thức:
```
baseDailySales      = max(averageDailySales, 1)
effectiveLeadTime   = leadTimeDays + delayBufferDays (mặc định: 2)
safetyStock         = max(10, ceil(baseDailySales × bufferDays))    (bufferDays mặc định: 2)
leadTimeDemand      = ceil(baseDailySales × effectiveLeadTime)
reorderPoint        = leadTimeDemand + safetyStock
```
Constants xuất ra: `DELAY_BUFFER_DAYS = 2`, `SAFETY_BUFFER_DAYS = 2`, `DEFAULT_SAFETY_STOCK = 10`.

#### `apps/agent/src/services/agent.service.ts` — BUG 1 + BUG 2

**BUG 1 (phần refactor):** Thay thế 5 dòng tính inline `baseDailySales / delayBufferDays / effectiveLeadTimeDays / safetyStock / reorderPoint` bằng một dòng gọi `calculateReorderPoint()`. Logic KHÔNG thay đổi — chỉ tái cấu trúc để dùng hàm chung.

**BUG 2 (cảnh báo NCC backup):** Ngay trước khi build `reasoning` text cho `createAiPurchaseRequest()`, thêm logic:
- Tìm NCC trong `backupSuppliers` có `leadTimeDays` nhanh hơn NCC được chọn.
- Nếu `selectedLeadTime > fasterBackup.leadTimeDays * 2` (NCC được chọn chậm hơn gấp đôi), ghi `backupSupplierWarning` vào `withOptionalText(...)`.
- **Không thay đổi NCC được chọn** — chỉ thêm cảnh báo vào `reasoning` trong AgentLog và notes của PurchaseRequest.

#### `apps/agent/src/services/recommendation.service.ts` — BUG 1

- Thêm `import { calculateReorderPoint }` từ utils mới.
- Move `const sales = await this.getSalesData(productId)` lên **trước** threshold check.
- Tính `primaryLeadTimeDays` từ NCC active đầu tiên (hoặc 0 nếu chưa có NCC).
- Tính `reorderPoint = calculateReorderPoint(sales.salesVelocity30d, primaryLeadTimeDays).reorderPoint`.
- Tính `availableStock = inventory.quantity - (inventory.reservedStock ?? 0)`.
- Thay `if (inventory.quantity > inventory.minThreshold)` bằng `if (availableStock > reorderPoint)`.
- Xóa dòng `const sales = await this.getSalesData(productId)` ở cuối hàm (đã fetch sớm hơn).
- Log output của ABOVE_THRESHOLD được bổ sung thêm `availableStock`, `reorderPoint`, `minThreshold` để dễ debug.

---

### Kết quả build

| Scope | Kết quả |
|---|---|
| `apps/agent` TypeScript check (`npx tsc --noEmit`) | ✅ PASS |
| `apps/api` TypeScript check (`npx tsc --noEmit`) | ✅ PASS |

---

### Test thủ công xác nhận (hướng dẫn)

Để verify 2 luồng đã đồng thuận sau khi fix, chọn một sản phẩm thỏa mãn điều kiện:

```
inventory.minThreshold < inventory.quantity ≤ reorderPoint
```

Ví dụ: sản phẩm có `minThreshold = 10`, bán 5 đơn/ngày, NCC có `leadTimeDays = 3`:
- `effectiveLeadTimeDays = 3 + 2 = 5`
- `safetyStock = max(10, ceil(5 × 2)) = 10`
- `leadTimeDemand = ceil(5 × 5) = 25`
- `reorderPoint = 25 + 10 = 35`
- Nếu `quantity = 20` → nằm giữa `minThreshold (10)` và `reorderPoint (35)`

**Trước fix:**
- `scanInventory` → `availableStock=20 < reorderPoint=35` → TẠO PR
- `recommendReorder` → `quantity=20 > minThreshold=10` → SKIP (ABOVE_THRESHOLD) ← Không nhất quán

**Sau fix:**
- `scanInventory` → `availableStock=20 < reorderPoint=35` → TẠO PR
- `recommendReorder` → `availableStock=20 ≤ reorderPoint=35` → TẠO RECOMMENDATION ← Nhất quán

Để test BUG 2: gán một sản phẩm với 2 NCC, NCC preferred có `leadTimeDays = 10`, NCC thứ 2 có `leadTimeDays = 3`. Sau khi agent tạo PR cho NCC preferred, xem `notes` của PR — phải có dòng cảnh báo `[Goi y NCC thay the] ... giao nhanh hon 7 ngay...`.

---

### Quyết định nghiệp vụ đã ghi nhận

1. **Tiêu chí "cần đặt hàng"** cho cả 2 luồng là: `availableStock ≤ reorderPoint` (dynamic), **không** phải `quantity ≤ minThreshold` (static).
2. `minThreshold` vẫn được giữ nguyên trong schema — dùng như "sàn an toàn" tối thiểu trong công thức `safetyStock`, không phải điểm kích hoạt đặt hàng.
3. **Lựa chọn NCC** vẫn theo thứ tự: `isPreferred DESC → price ASC → leadTimeDays ASC`. Không thay đổi thứ tự ưu tiên này trong sprint này.
4. **Backup supplier warning** chỉ ghi vào `reasoning`/`notes` — không tự động đổi NCC. Admin cần xem xét thủ công.
5. Ngưỡng so sánh để trigger cảnh báo NCC backup: `selectedLeadTime > fasterBackup.leadTimeDays * 2` (chậm hơn gấp đôi).
