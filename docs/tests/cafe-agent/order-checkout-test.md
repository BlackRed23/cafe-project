# Kịch bản kiểm thử: Order Checkout

## 1. Test tạo đơn hàng (Checkout)
- **Mục tiêu:** Đảm bảo quá trình tạo đơn hàng chỉ gửi những thông tin cần thiết theo đúng contract backend, không chứa các thông tin rác.
- **Tiền điều kiện:** Giỏ hàng có ít nhất 1 sản phẩm.
- **Các bước thực hiện:**
  1. Ở giao diện Frontend, thêm các món đồ uống vào giỏ hàng.
  2. Chuyển sang trang thanh toán (Checkout).
  3. Điền thông tin Ghi chú (`note`) và chọn Phương thức thanh toán (`paymentMethod`).
  4. Mở tab Network (F12) để theo dõi payload.
  5. Bấm nút Đặt hàng / Thanh toán.
- **Kết quả mong đợi:**
  - Frontend gửi request API `POST /orders`.
  - Payload gửi đi chỉ bao gồm:
    - `items` (danh sách sản phẩm và số lượng).
    - `paymentMethod` (phương thức thanh toán).
    - `note` (ghi chú của khách hàng).
  - Payload **tuyệt đối không** chứa các trường: `shippingName`, `shippingPhone`, `shippingAddress`.
  - Backend xử lý thành công và trả về mã đơn hàng (200/201 OK).
  - Không gặp lỗi validation từ phía Backend.
