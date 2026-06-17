# Kịch bản kiểm thử: Product Menu

## 1. Test danh sách sản phẩm/menu
- **Mục tiêu:** Kiểm tra xem danh sách sản phẩm có hiển thị đầy đủ và đúng định dạng không.
- **Tiền điều kiện:** Hệ thống đã có sẵn một số sản phẩm và danh mục.
- **Các bước thực hiện:**
  1. Mở trình duyệt và truy cập vào trang danh sách sản phẩm (Frontend).
  2. Quan sát danh sách hiển thị.
- **Kết quả mong đợi:**
  - Frontend gọi API `GET /products` thành công.
  - Các sản phẩm được hiển thị đúng tên, giá và thông tin đi kèm.

## 2. Test tạo sản phẩm có `categoryId`
- **Mục tiêu:** Kiểm tra tính năng thêm mới sản phẩm với đầy đủ thông tin yêu cầu.
- **Các bước thực hiện:**
  1. Truy cập vào trang thêm mới sản phẩm (`/admin/products/new`).
  2. Điền đầy đủ thông tin bắt buộc, đặc biệt là phải chọn Danh mục (`categoryId`).
  3. Bấm Submit/Lưu.
- **Kết quả mong đợi:**
  - Payload gửi đi qua API `POST /products` chứa đầy đủ các trường yêu cầu, bao gồm `categoryId`.
  - Backend trả về 200/201 (Thành công).
  - Sản phẩm mới xuất hiện trong danh sách.

## 3. Test lỗi khi thiếu `categoryId`
- **Mục tiêu:** Kiểm tra xử lý lỗi trên UI khi người dùng quên chọn danh mục.
- **Các bước thực hiện:**
  1. Truy cập vào trang thêm mới sản phẩm (`/admin/products/new`).
  2. Điền các thông tin khác nhưng **không chọn** Danh mục (`categoryId`).
  3. Bấm Submit/Lưu.
- **Kết quả mong đợi:**
  - Frontend không gọi API `POST /products`.
  - Hiển thị thông báo lỗi màu đỏ ở trường chọn Danh mục yêu cầu người dùng phải nhập `categoryId`.
