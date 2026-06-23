
## 27. Threshold Suggestion Zero Value Fix

**Nguyên nhân hiển thị 0:**
- Backend fallback khi `leadTimeDays` là 0 đang dùng toán tử `?? 3` nên vẫn nhận 0.
- Frontend gọi `getThresholdSuggestion` lấy kết quả bằng `unwrapApiField` nhưng có thể fail mapping do response lồng ghép.
- Biến `bufferDays` trên UI bị nhầm sang `delayBufferDays` khiến `delayBufferDays` không hiển thị.

**Backend fallback đã sửa:**
- `inventory.service.ts` đổi từ `?? 3` thành `|| 3` để nhận 3 ngày khi `leadTimeDays` là 0.
- Đã thêm warning khi `supplierProducts.length === 0`.

**Frontend response mapping đã sửa:**
- Cập nhật `getThresholdSuggestion` trong `inventory.api.ts` an toàn hơn.
- UI modal hiển thị rõ `delayBufferDays` (Thời gian dự phòng) và `leadTimeDays` (Thời gian nhập hàng).

**Trường hợp chưa có lịch sử bán:**
- UI hiển thị cảnh báo: 'Chưa có dữ liệu bán trong 30 ngày gần nhất. Hệ thống đang đề xuất ngưỡng an toàn mặc định.'

**File đã sửa:**
- `apps/api/src/modules/inventory/inventory.service.ts`
- `apps/web/src/api/inventory.api.ts`
- `apps/web/src/pages/admin/AdminInventoryPage.tsx`

## 28. Fix AdminInventoryPage Parse Error After Threshold Suggestion

**Lỗi là gì:** Lỗi `[PARSE_ERROR] Unexpected token. Did you mean {'}'} or &rbrace;?` khi build/chạy frontend.
**Nguyên nhân:** Do sửa nhầm mã JSX khiến mất thẻ `</div>`.
**File đã sửa:** `apps/web/src/pages/admin/AdminInventoryPage.tsx`
**Kết quả:** Đã bổ sung lại thẻ `</div>`, lỗi cú pháp đã được xử lý triệt để.

## 29. Simplify Inventory Threshold Modal UI

**Đã rút gọn modal Ngưỡng:**
- Giao diện chính của modal chỉ tập trung vào các chỉ số quyết định: Tồn hiện tại, Ngưỡng hiện tại, Bán trung bình/ngày, Thời gian chờ nhập, Ngưỡng đề xuất.
- Đã thêm trạng thái đánh giá nhanh bằng chữ (VD: 'Nên tăng ngưỡng để tránh thiếu hàng').
- Nút 'Lưu ngưỡng đề xuất' sẽ thay đổi màu sắc và không còn nổi bật nếu ngưỡng đề xuất thấp hơn hoặc bằng ngưỡng hiện tại.

**Thông tin chi tiết đã ẩn:**
- Đã đưa toàn bộ các chỉ số như Tổng bán 30 ngày, Lead time nhà cung cấp, Thời gian dự phòng, Safety stock, Nhu cầu chờ nhập, Nhà cung cấp chính, và các warning vào trong một block có thể mở rộng (collapse) với tiêu đề 'Xem chi tiết tính toán'.

**Không thay đổi logic:**
- Hoàn toàn không sửa backend, API hay logic tính toán, chỉ tổ chức lại UI ở Frontend.

**File đã sửa:**
- `apps/web/src/pages/admin/AdminInventoryPage.tsx`

## 30. Simplify Inventory Threshold Modal For Admin

**Thay đổi UI:**
- Đã bỏ hoàn toàn phần 'Xem chi tiết tính toán' và các chỉ số kỹ thuật phức tạp (Bán trung bình/ngày, Thời gian chờ nhập, Tổng bán 30 ngày, Lead time, Safety stock, Warning).
- Modal hiện tại rất gọn gàng, chỉ tập trung hiển thị: Tồn kho hiện tại, Ngưỡng hiện tại, Ngưỡng đề xuất và Trạng thái gợi ý ngắn gọn.
- Nút 'Lưu ngưỡng đề xuất' được enable cho cả trường hợp tăng hoặc giảm ngưỡng (recommendedThreshold khác currentThreshold), và chỉ bị disable khi hai giá trị bằng nhau.
- Không thay đổi bất kỳ logic tính toán ngưỡng nào ở backend hay API.

**File đã sửa:**
- `apps/web/src/pages/admin/AdminInventoryPage.tsx`

**Kết quả:**
- Frontend chạy thành công, UI gọn và thân thiện với Admin hơn.
