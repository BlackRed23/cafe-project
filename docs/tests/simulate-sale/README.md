# Simulate Sale Test Suite

## Mục tiêu
Kiểm tra luồng simulate sale sau khi sửa:
Admin chọn sản phẩm nào thì backend phải trừ đúng tồn kho sản phẩm đó.

## Phạm vi test
- Frontend simulate sale page
- API /simulate-sale
- Inventory update
- Agent scan
- Agent log
- Purchase request nếu đủ điều kiện

## Không test trong phạm vi này
- Order
- Payment
- Checkout
- Product form
- Database migration
- Seed data

## Cách dùng
1. Mở từng file test case TC_*.md
2. Chuẩn bị dữ liệu theo TEST_DATA.md
3. Thực hiện từng bước
4. Ghi kết quả Pass/Fail vào cuối mỗi file
5. Tổng hợp vào SIMULATE_SALE_TEST_SUMMARY.md
