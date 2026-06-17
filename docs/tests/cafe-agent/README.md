# Bộ test tài liệu cho Cafe Agent

## Mục tiêu
Bộ tài liệu này cung cấp các kịch bản kiểm thử (test cases) và dữ liệu mẫu (test data) để xác minh tính chính xác của quá trình giao tiếp (contract) giữa Frontend và Backend cho luồng Cafe Agent.

## Hướng dẫn chạy

1. **Chạy Backend**:
   - Mở terminal, di chuyển vào thư mục dự án.
   - Chạy lệnh: `npm run dev` ở thư mục `apps/api`.
2. **Chạy Frontend**:
   - Mở terminal khác, di chuyển vào thư mục dự án.
   - Chạy lệnh: `npm run dev` ở thư mục `apps/web`.

## Thứ tự test đề xuất

Để đảm bảo luồng hoạt động mượt mà, đề xuất thực hiện test theo thứ tự sau:
1. Test Danh sách sản phẩm / Menu (`product-menu-test.md`)
2. Test Tạo đơn hàng / Checkout (`order-checkout-test.md`)
3. Test Xem Agent Logs (`agent-logs-test.md`)

*Lưu ý: Bộ test này không bao gồm kịch bản test cho tính năng `simulate-sale` vì phần này đã có bộ test riêng biệt.*
