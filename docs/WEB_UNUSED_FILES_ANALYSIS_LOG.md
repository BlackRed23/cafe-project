# Web Unused Files Analysis Log

## 1. Mục tiêu phân tích
Quét toàn bộ tài liệu dự án và đối chiếu với source code frontend (`apps/web/`) để tìm ra các file có khả năng dư thừa, không còn được sử dụng trong phiên bản hiện tại, nhằm phục vụ cho việc dọn dẹp dự án một cách an toàn mà không làm hỏng chức năng.

## 2. Tài liệu trong docs đã scan

| File docs | Nội dung chính | Liên quan tới frontend |
| --------- | -------------- | ---------------------- |
| `FRONTEND_CAFE_AGENT_SCAN_LOG.md` | Log phân tích luồng UI, API contract, các page liên quan tới giả lập bán hàng và hiển thị product/order. | Liệt kê rõ các page, api, context, route frontend đang dùng để vận hành. |
| `FRONTEND_BACKEND_INTEGRATION_LOG.md` | Log đồng bộ payload giữa FE và BE, đặc biệt các trường bị lệch. | Nhắc tới `CheckoutPage`, `AdminProductFormPage`, `api/orders`, `api/products`, `api/agentLogs`. |
| `BACKEND_SCAN_LOG.md` | Tài liệu phân tích BE. | Có nhắc tới contract API cung cấp cho FE. |
| Các file trong `docs/tests/` | Log và kịch bản test cho các tính năng của hệ thống. | Nhắc tới các hành vi UI, các component cần test. |

## 3. Phạm vi frontend đã scan

| Thư mục | Mục đích kiểm tra |
| ------- | ----------------- |
| `src/pages` | Kiểm tra tất cả các page có đang được định nghĩa trong route không. |
| `src/components` | Kiểm tra các UI component có được import ở page hay layout nào không. |
| `src/api` | Nhóm API client (thuộc nhóm không nên đụng/Group D). |
| `src/types` | Các interface (thuộc nhóm không nên đụng/Group D). |
| `src/contexts` | State dùng chung (thuộc nhóm không nên đụng/Group D). |
| `src/routes` | Các route chính (thuộc nhóm không nên đụng/Group D). |
| `src/utils` | Hàm hỗ trợ format (thuộc nhóm không nên đụng/Group D). |
| `src/assets` | Các file ảnh, tĩnh. |

## 4. File đang được sử dụng rõ ràng

| File | Được dùng ở đâu | Bằng chứng |
| ---- | --------------- | ---------- |
| Các file trong `src/pages/` và `src/pages/admin/` | `routes/AppRoutes.tsx` | Được import và sử dụng trong component `<Routes>`. |
| Các file trong `src/layouts/` | `routes/AppRoutes.tsx` | Được import làm wrapper layout. |
| `src/components/admin/DataTable.tsx` | Các page admin (Users, Suppliers, Products...) | Có kết quả import rõ ràng qua quá trình tìm kiếm. |
| `src/components/common/...` | Khắp các page và component khác | Được import để render UI chuẩn (Badge, Button, Input, Modal...). |
| `src/components/product/ProductCard.tsx` | `ProductListPage.tsx`, `HomePage.tsx` | Có lệnh import rõ ràng để hiển thị item. |
| `src/App.tsx`, `src/main.tsx` | Root component | File khởi tạo React app cơ bản. |

## 5. File có khả năng dư cao

| File | Lý do nghi dư | Bằng chứng đã kiểm tra | Mức rủi ro nếu xoá |
| ---- | ------------- | ---------------------- | ------------------ |
| `src/components/admin/StatCard.tsx` | Không được import ở bất kỳ đâu. File `AdminDashboardPage.tsx` đang tự render inline stat cards thay vì dùng component này. | Không tìm thấy lệnh import/khai báo `StatCard` ở bất kỳ file nào khác ngoài chính nó. | Rất thấp (Chỉ là UI component tách lẻ bị bỏ trống). |
| `src/assets/hero.png` | Hình ảnh tĩnh không được gọi trong source code. | `HomePage.tsx` và các component khác đang sử dụng link ảnh Unsplash thay vì file local. | Thấp (Có thể là ảnh placeholder từ template cũ). |

## 6. File nghi ngờ dư, cần xác nhận thêm

| File | Vì sao nghi ngờ | Cần xác nhận gì |
| ---- | --------------- | --------------- |
| (Không có) | Các file đều thuộc nhóm A, C hoặc D rất rõ ràng. | |

## 7. File không nên đụng vào

| File | Lý do |
| ---- | ----- |
| Các file trong `src/api/` | Là cầu nối gọi API backend, dù có một số endpoint chưa test nhưng không nên xoá để giữ nguyên contract. |
| Các file trong `src/types/` | Định nghĩa type dùng chung cho toàn bộ frontend, rủi ro lỗi TypeScript cao nếu xoá. |
| Các file trong `src/contexts/` | Global state (Cart, Auth) là huyết mạch của ứng dụng. |
| Các file trong `src/routes/` | Logic định tuyến chính, điều hướng và bảo mật trang. |
| Các file trong `src/utils/` | Các hàm format (`formatCurrency`, `formatDate`, `statusLabel`) được sử dụng ở rất nhiều nơi. |
| `src/index.css` | File style toàn cục, chứa font chữ và reset CSS. |

## 8. Kết luận

- Có **2** file có khả năng dư cao (Nhóm A).
- Có **0** file nghi ngờ dư (Nhóm B).
- Có **toàn bộ file còn lại** chắc chắn đang dùng (Nhóm C) hoặc thuộc nhóm không nên đụng (Nhóm D).
- Hiện tại hoàn toàn KHÔNG có file nào bị xoá hay thay đổi.

## 9. Đề xuất bước tiếp theo

- Đề xuất: Xóa thử `src/components/admin/StatCard.tsx` và `src/assets/hero.png` rồi chạy lại dự án (`npm run dev` và `npm run build`) để xác nhận không lỗi.
- Không nên đụng vào các file thuộc nhóm D nếu không có yêu cầu thay đổi nghiệp vụ cụ thể.
- Đang chờ sự xác nhận của bạn trước khi thực hiện bất kỳ lệnh xoá nào.
