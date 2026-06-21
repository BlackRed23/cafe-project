# Database Scan Log

## 1. Mục tiêu scan
- Chỉ đọc Prisma schema để hiểu cấu trúc database và nghiệp vụ liên quan, chuẩn bị cho các bước sửa đổi nếu có.

## 2. Phạm vi đã scan
- File đã đọc:
  - `packages/database/package.json`
  - `packages/database/prisma/schema/*.prisma` (main, user, category, product, inventory, order, purchase, supplier, system)
- File bỏ qua: node_modules, build output, seed.ts (chưa cần thiết).

## 3. Công nghệ database
- ORM: Prisma Client
- Schema location: `packages/database/prisma/schema/` (dùng tính năng prismaSchemaFolder)
- Seed file: `prisma/seed.ts`
- Database provider: PostgreSQL (`provider = "postgresql"`)

## 4. Danh sách model

| Model | Vai trò nghiệp vụ | File schema | Ghi chú |
|---|---|---|---|
| User | Quản lý tài khoản (Admin, Staff, Customer). | `user.prisma` | Dùng cho Auth, Order, tạo AgentLog. |
| Category | Danh mục sản phẩm. | `category.prisma` | |
| Product | Thông tin cơ bản, giá cả của sản phẩm. | `product.prisma` | Liên kết chặt chẽ với Inventory. |
| Inventory | Tồn kho của một sản phẩm. | `inventory.prisma` | Có threshold (mức cảnh báo). |
| InventoryTransaction| Lịch sử xuất/nhập/điều chỉnh kho. | `inventory.prisma` | Lưu lịch sử kho mỗi khi có biến động. |
| Order | Đơn hàng của khách hàng. | `order.prisma` | |
| OrderItem | Chi tiết từng sản phẩm trong đơn. | `order.prisma` | |
| Payment | Thông tin thanh toán của đơn hàng. | `order.prisma` | Liên kết 1-1 với Order. |
| Supplier | Nhà cung cấp. | `supplier.prisma` | Cung cấp sản phẩm để nhập kho. |
| SupplierProduct | Bảng nối Supplier - Product (sản phẩm theo NCC). | `supplier.prisma` | Có giá nhập, MOQ, lead time. |
| PurchaseRequest | Yêu cầu nhập hàng từ Supplier. | `purchase.prisma` | Có thể do người tạo hoặc AI tự sinh. |
| PurchaseRequestItem| Chi tiết các món cần nhập trong request. | `purchase.prisma` | |
| AgentLog | Lưu lịch sử thao tác của AI Agent. | `system.prisma` | Phục vụ debug AI. |
| SystemSetting | Cấu hình hệ thống (key-value). | `system.prisma` | |

## 5. Quan hệ giữa các model

| Quan hệ | Mô tả | Ghi chú |
|---|---|---|
| Product -> Category | N-1 | Một sản phẩm thuộc một danh mục. |
| Product -> Inventory | 1-1 | Một sản phẩm có duy nhất một bản ghi kho (productId unique). |
| Order -> OrderItem | 1-N | Đơn hàng có nhiều chi tiết sản phẩm. Cascade Delete. |
| Order -> Payment | 1-1 | Mỗi đơn hàng có một bản ghi thanh toán. Cascade Delete. |
| PurchaseRequest -> Supplier | N-1 | Yêu cầu nhập hàng hướng tới một nhà cung cấp cụ thể. |
| PurchaseRequest -> PurchaseRequestItem | 1-N | Cascade Delete. |
| Supplier -> SupplierProduct | 1-N | Cascade Delete. Bảng trung gian n-n giữa Supplier và Product. |
| User -> Order | 1-N | User đặt nhiều đơn hàng. |

## 6. Field quan trọng theo model

### User
- Field chính: `id`, `email` (unique), `role` (UserRole), `isActive`.
- Quan hệ: `orders`, `requestedPurchaseRequests`, `approvedPurchaseRequests`, `agentLogs`.
- Ghi chú: Chứa role phân quyền.

### Product
- Field chính: `id`, `sku` (unique), `price` (Decimal), `costPrice`, `isActive`.
- Quan hệ: `categoryId`, `inventory`.
- Ghi chú: Giá tiền được định dạng Decimal(12,2).

### Inventory
- Field chính: `id`, `productId` (unique), `quantity`, `minThreshold`.
- Quan hệ: `product`.
- Ghi chú: `minThreshold` (mặc định 10) là ngưỡng để Agent cảnh báo nhập hàng.

### Order
- Field chính: `id`, `status` (OrderStatus), `totalAmount`.
- Quan hệ: `userId`, `items` (OrderItem), `payment`.
- Ghi chú: Không thấy lưu thông tin địa chỉ giao hàng, có thể là mua tại quầy.

### PurchaseRequest
- Field chính: `id`, `requestNumber` (unique), `status`, `aiGenerated`, `requestedBy`, `approvedBy`.
- Quan hệ: `supplier`, `items`.
- Ghi chú: Có tracking gửi email (`emailSentAt`, `retryCount`).

### Supplier
- Field chính: `id`, `name`, `status`.
- Quan hệ: `products` (SupplierProduct), `purchaseRequests`.
- Ghi chú: `status` là String (mặc định "ACTIVE"), không phải Enum.

### SystemSetting / AgentLog
- Field chính (AgentLog): `action`, `input`, `output`, `reference_id`.
- Quan hệ (AgentLog): `createdBy` (User).
- Ghi chú: `reference_id` dùng lưu ID động (chưa xác định là orderId hay productId), không có khóa ngoại cứng.

## 7. Enum / Status phát hiện được

| Enum | Giá trị | Dùng cho nghiệp vụ |
|---|---|---|
| UserRole | ADMIN, STAFF, CUSTOMER | Phân quyền truy cập. |
| InventoryTransactionType | IMPORT, ORDER, CANCEL, DAMAGE, ADJUSTMENT, SIMULATE_SALE | Phân loại lý do biến động kho. |
| OrderStatus | PENDING, PROCESSING, COMPLETED, CANCELLED | Trạng thái đơn hàng. |
| PaymentStatus | PENDING, PAID, FAILED, REFUNDED | Trạng thái thanh toán. |
| PaymentMethod | CASH, CARD, BANK_TRANSFER, E_WALLET | Phương thức thanh toán. |
| PurchaseRequestStatus | PENDING, APPROVED, SENT, RECEIVED, COMPLETED, REJECTED | Trạng thái yêu cầu nhập kho. |

## 8. Rủi ro nghiệp vụ phát hiện được

| Vấn đề | Model/File liên quan | Mức độ | Gợi ý kiểm tra tiếp |
|---|---|---|---|
| `Supplier.status` là String, không phải Enum | `supplier.prisma` | Thấp | Kiểm tra backend/frontend có validate tập giá trị ("ACTIVE", "INACTIVE") không. |
| Truy vết kho từ Order/Purchase hơi lỏng | `inventory.prisma` | Trung bình | `InventoryTransaction` có `reason` (String) nhưng thiếu reference_id chỉ định rõ ID của Order/Purchase, có thể gây khó khi đối soát kho và đơn. |
| `PurchaseRequestItem` lưu cả `inventoryId` và `productId` | `purchase.prisma` | Thấp | Dư thừa do Product-Inventory là 1-1, nhưng giúp truy vấn nhanh hơn. |

## 9. Luồng nghiệp vụ database chính

### 9.1 Luồng sản phẩm
`Category` (1) -> (N) `Product` (1) -> (1) `Inventory`

### 9.2 Luồng bán hàng
`User` -> `Order` -> `OrderItem` (kéo theo `Product`) -> (Trừ kho) `Inventory` -> Ghi log `InventoryTransaction` -> Cập nhật `Payment`.

### 9.3 Luồng AI Agent tồn kho
`Inventory` (< minThreshold) -> Agent scan -> Ghi `AgentLog` -> Tạo `PurchaseRequest` (aiGenerated: true) -> Duyệt -> `Supplier`.

## 10. Kết luận
- **Database hiện hỗ trợ những nghiệp vụ nào**: Bán hàng, Quản lý kho, Gợi ý nhập hàng (AI Agent), Quản lý NCC.
- **Phần nào đang rõ**: Quan hệ cơ bản giữa các thực thể rất mạch lạc, có phân biệt trạng thái rõ ràng bằng Enum.
- **Phần nào cần kiểm tra thêm**: Cách backend ghi `reason` trong `InventoryTransaction` khi có Order.
- **File nên đối chiếu tiếp với backend**: Service xử lý Order và PurchaseRequest để xem luồng trừ/cộng kho.

## 11. Cam kết
- Chưa sửa database schema.
- Chưa chạy migration/seed hay bất cứ câu lệnh prisma nào làm thay đổi dữ liệu.
- Mọi quan sát chỉ ghi log phân tích vào `DATABASE_SCAN_LOG.md`.
