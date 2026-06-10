# Cafe AI System - Frontend

Frontend cho hệ thống quản lý bán hàng cà phê tích hợp AI Agent theo dõi tồn kho.

## Công nghệ

- React
- TypeScript
- Vite
- Tailwind CSS
- Axios
- React Router DOM

## Cài đặt

```bash
npm install
```

## Cấu hình môi trường

Tạo file `.env` trong `apps/web`:

```env
VITE_API_URL=http://localhost:4000/api
```

## Chạy frontend

```bash
npm run dev
```

## Build kiểm tra lỗi

```bash
npm run build
```

## Tài khoản demo

**Admin:**
- Email: `admin@cafe.local`
- Mật khẩu: `123456`

**Customer:**
- Email: `customer@cafe.local`
- Mật khẩu: `123456`

## Luồng demo đầy đủ

1. Đăng nhập Customer.
2. Vào trang Sản phẩm.
3. Thêm sản phẩm vào giỏ hàng.
4. Vào Checkout.
5. Chọn COD hoặc BANK_TRANSFER.
6. Tạo đơn hàng.
7. Đăng nhập Admin.
8. Vào Orders.
9. Mở chi tiết đơn hàng.
10. Bấm Confirm Order.
11. Hệ thống trừ tồn kho.
12. Nếu tồn kho thấp, AI Agent tạo Purchase Request.
13. Admin vào Purchase Requests.
14. Mở chi tiết Purchase Request.
15. Xem lý do AI đề xuất và nội dung email.
16. Bấm Approve and Send Email.
17. Vào Agent Logs để xem log AI.

## Luồng demo nhanh

1. Đăng nhập Admin.
2. Vào Simulate Sale.
3. Chọn sản phẩm gần ngưỡng.
4. Nhập số lượng giả lập bán.
5. Bấm Run Simulate Sale.
6. Hệ thống trừ tồn kho.
7. AI Agent tạo Purchase Request nếu tồn kho thấp.
8. Admin mở Purchase Request.
9. Admin duyệt.
10. Admin xem Agent Logs.

## Lưu ý

- Frontend không chứa API key Gemini.
- Frontend không chứa SMTP password.
- Frontend chỉ gọi backend REST API.
- Thanh toán trong MVP chỉ là mô phỏng: COD, CASH, BANK_TRANSFER.
