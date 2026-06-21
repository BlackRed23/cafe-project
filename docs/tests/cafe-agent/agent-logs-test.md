# Kịch bản kiểm thử: Agent Logs

## 1. Test gọi API Agent Logs
- **Mục tiêu:** Kiểm tra việc lấy danh sách nhật ký của Agent mà không truyền tham số thừa.
- **Tiền điều kiện:** Có dữ liệu log trong hệ thống.
- **Các bước thực hiện:**
  1. Truy cập vào trang quản lý Agent Logs (`/admin/agent-logs`).
  2. Mở tab Network trong Developer Tools (F12) để theo dõi API call.
- **Kết quả mong đợi:**
  - Frontend gọi API `GET /agent/logs`.
  - Tuyệt đối không truyền tham số `limit` trên URL (ví dụ: không có `?limit=10`).
  - Backend trả về dữ liệu danh sách log thành công (200 OK).

## 2. Kiểm tra hiển thị dữ liệu log trên UI
- **Mục tiêu:** Xác minh dữ liệu nhận từ API được render chính xác trên giao diện.
- **Các bước thực hiện:**
  1. Sau khi truy cập `/admin/agent-logs` và API trả về thành công.
  2. Quan sát bảng dữ liệu.
- **Kết quả mong đợi:**
  - Bảng dữ liệu hiển thị bình thường.
  - Các text trạng thái (tiếng Việt UTF-8) như "Thành công", "Đang tải", "Không thể tải" hiển thị chính xác, không bị lỗi font (mojibake).
