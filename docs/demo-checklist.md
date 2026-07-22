# Hướng dẫn Demo Thủ Công (12 Bước)

Checklist này giúp kiểm tra toàn bộ các tính năng đã được chỉnh sửa (Front-end UX/UI) và hệ thống AI Agent (Backend).

## Phần 1: Kiểm tra trải nghiệm khách hàng (Customer UX/UI)

1. **Kiểm tra hiển thị Trang Chủ (Home Page):**
   - Truy cập vào trang chủ `/`.
   - Xác nhận danh sách sản phẩm hiển thị đầy đủ thông tin: Ảnh, Tên sản phẩm, Giá, Trạng thái (Còn hàng/Hết hàng).
   - Kiểm tra xem các sản phẩm "Hết hàng" (nếu có) đã bị đẩy xuống dưới cùng của danh sách hay chưa.

2. **Kiểm tra 3 cách Click vào Sản phẩm:**
   - Tại thẻ sản phẩm (Product Card), thử click vào **Ảnh sản phẩm**. Đảm bảo trang chuyển hướng đúng đến chi tiết sản phẩm.
   - Quay lại, thử click vào **Tên sản phẩm**. Đảm bảo chuyển hướng đúng.
   - Quay lại, thử click vào nút **"Chi tiết"**. Đảm bảo chuyển hướng đúng.

3. **Kiểm tra Link Sản phẩm Hết hàng:**
   - Tại thẻ sản phẩm có trạng thái "Hết hàng", thử click vào ảnh hoặc tên sản phẩm.
   - Xác nhận hệ thống vẫn chuyển hướng thành công đến trang chi tiết sản phẩm thay vì báo lỗi "404 Not Found" (Đã khắc phục lỗi lấy sản phẩm inactive).

4. **Kiểm tra Logic Thêm vào Giỏ hàng (Sản phẩm còn hàng):**
   - Chọn một sản phẩm còn hàng, giả sử tồn kho là `10`.
   - Thêm `5` sản phẩm vào giỏ.
   - Sau đó tiếp tục click "Thêm vào giỏ" thêm `6` sản phẩm nữa.
   - Xác nhận hệ thống hiển thị thông báo lỗi rõ ràng: `"Chỉ còn lại 5 hộp (bạn đã có 5 trong giỏ)."` thay vì hiển thị "Chỉ còn 10 trong kho".

5. **Kiểm tra Logic Thêm vào Giỏ hàng tại Trang Chi tiết:**
   - Vào trang chi tiết sản phẩm.
   - Nhập số lượng mua lớn hơn số lượng có thể thêm (tồn kho gốc - số lượng đã có trong giỏ).
   - Xác nhận hệ thống tự động điều chỉnh số lượng nhập về mức tối đa cho phép và hiện cảnh báo: `"Chỉ còn lại X hộp có thể thêm (đã có Y trong giỏ)."`

## Phần 2: Kiểm tra Hệ thống AI Agent (Inventory Reorder)

6. **Kiểm tra Cấu hình Agent:**
   - Đăng nhập tài khoản Admin.
   - Truy cập `/admin/settings` hoặc xem cấu hình Agent trong hệ thống.
   - (Mã nguồn đã cố định Prompt tại `apps/agent/src/config/system-prompt.ts`, đảm bảo không ai có thể override prompt của Agent từ phía giao diện).

7. **Chuẩn bị Dữ liệu Demo Tồn kho thấp:**
   - Truy cập `/admin/inventory` hoặc `/admin/products`.
   - Chọn một sản phẩm (đã có Nhà cung cấp hoạt động), điều chỉnh tồn kho (Quantity) xuống mức thấp (ví dụ: `2`), nhỏ hơn mức Tồn kho tối thiểu (Min Threshold = `10`).

8. **Kích hoạt Quét Tồn kho (AI Agent):**
   - Kích hoạt tiến trình quét tồn kho thủ công (Manual Scan) thông qua nút "Quét tồn kho" trên giao diện Admin, hoặc chờ Cronjob chạy.
   - Xem tiến trình chạy trong log của service `agent`.

9. **Kiểm tra Đề xuất Nhập hàng (Purchase Request PENDING):**
   - Truy cập `/admin/purchase-requests`.
   - Xác nhận AI Agent đã tự động tạo một Yêu cầu nhập hàng (Purchase Request) với trạng thái là `PENDING`.
   - Xác nhận cờ `aiGenerated` là `true` (Hệ thống ghi nhận do AI tạo).

10. **Kiểm tra Log Hành động của Agent:**
    - Truy cập `/admin/agent-logs`.
    - Xác nhận hệ thống có ghi lại log với Action `SCAN_INVENTORY_SESSION` và `RECOMMEND_REORDER` hoặc `CREATED_PURCHASE_REQUEST`.
    - Đọc chi tiết log để thấy "Lý do (Reasoning)" mà AI/Hệ thống đưa ra (ví dụ: "Tồn kho dưới ngưỡng...").

11. **Kiểm tra Giới hạn Quyền (Không tự động duyệt):**
    - Xác nhận Yêu cầu nhập hàng do AI tạo vẫn đang chờ duyệt (`PENDING`), hệ thống không tự động thay đổi tồn kho thực tế hay trạng thái đơn hàng khi không có sự đồng ý của Admin.

12. **Kiểm tra Kịch bản Thiếu dữ liệu / Duplicate:**
    - Quét tồn kho lần 2 (khi Yêu cầu nhập hàng trước đó vẫn đang `PENDING`).
    - Xem `/admin/agent-logs`, xác nhận Agent báo trạng thái `SKIPPED_DUPLICATE` (hoặc lý do tương tự) với thông báo: "Sản phẩm đã có yêu cầu nhập hàng đang chờ xử lý, Agent không tạo thêm".
