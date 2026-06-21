# Backend Scan Log

## Mục tiêu

Scan để hiểu kiến trúc và luồng xử lý của backend trước khi tiến hành bất kỳ thay đổi nào, nhằm đảm bảo việc sửa code không làm hỏng logic hiện tại.

## File đã kiểm tra

- `apps/api/src/index.ts` (Đăng ký routes tổng, cấu hình server)
- `apps/api/src/common/error-handler.ts` (Xử lý lỗi toàn cục)
- `apps/api/src/common/validate.ts` (Middleware validate input)
- `apps/api/src/modules/product/product.route.ts`, `product.controller.ts`, `product.service.ts` (Mẫu tham chiếu cấu trúc module)
- `apps/api/src/modules/order/order.controller.ts`, `order.service.ts` (Mẫu tham chiếu logic nghiệp vụ)
- `packages/database/prisma/schema/` (Kiến trúc DB - Prisma split schema)

## Kết quả scan

- **Kiến trúc**: Dựa trên Express + TypeScript, phân tách theo từng tính năng (Module-based). Mỗi module chứa đầy đủ Route, Controller, Validator (Zod), Service, Repository.
- **Validation**: Sử dụng Zod để validate request body trước khi tới Controller.
- **Xử lý bất đồng bộ**: Các Controller được bọc qua `asyncHandler` để chuyển tiếp lỗi tới Error Handler tập trung.
- **Database ORM**: Prisma. Việc thao tác dữ liệu được thực hiện ở lớp Repository và Database schema được chia nhỏ theo file (`order.prisma`, `product.prisma`, v.v.).

## Vấn đề phát hiện (Nguyên nhân tiềm ẩn gây lỗi)

- **Lỗi 400 (Bad Request)**: 
  - Sai định dạng đầu vào bị Zod chặn lại (ví dụ thiếu trường bắt buộc).
  - Vi phạm logic nghiệp vụ trong Service (VD: Không đủ tồn kho, chuyển trạng thái đơn hàng bị cấm).
- **Lỗi 404 (Not Found)**:
  - Gọi các endpoint bị sai URL.
  - Các hàm kiểu `ensureOrderExists`, `ensureProductExists` không tìm thấy dữ liệu có ID tương ứng trong database.
- **Lỗi 409 (Conflict)**:
  - Mã (VD: SKU) đã tồn tại (Lỗi Prisma P2002).
  - Không thể xóa sản phẩm do đang có liên kết khóa ngoại với Đơn hàng / Lịch sử kho.
- **Lỗi 500 (Internal Server Error)**:
  - Lỗi cấu hình, lỗi mất kết nối database, hoặc các exception không phải là `HttpError` thoát khỏi Service.

## File đề xuất sửa

*(Chưa có, cần chờ người dùng cung cấp thông tin mô tả chi tiết về lỗi hoặc tính năng cần thêm để xác định chính xác Module / File sẽ can thiệp).*

## Kết luận

- Backend cấu trúc rất tốt, rõ ràng (Layered Architecture). 
- Các lỗi nghiệp vụ đều được kiểm soát và quăng ra dưới dạng `HttpError`.
- **Sẵn sàng tiếp nhận yêu cầu.** Khi có yêu cầu sửa đổi, sẽ chỉ tập trung vào lớp tương ứng (VD: sửa logic vào Service, sửa query vào Repository) để tránh lan man và giữ độ ổn định cho dự án.
