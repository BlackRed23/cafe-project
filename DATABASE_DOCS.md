# Tài liệu Đặc tả Chi tiết Cơ sở Dữ liệu (Database Schema Documentation)

Tài liệu này cung cấp mô tả chi tiết cho toàn bộ 14 bảng dữ liệu (Models) trong hệ thống quản lý quán cà phê, bao gồm các thông tin về kiểu dữ liệu, các ràng buộc khóa (Khóa chính - PK, Khóa ngoại - FK) và mô tả nghiệp vụ cho từng trường dữ liệu. Cấu trúc cơ sở dữ liệu này được định nghĩa thông qua ORM Prisma và triển khai trên hệ quản trị cơ sở dữ liệu PostgreSQL.

---

### Bảng: User
- **Mô tả:** Lưu trữ thông tin tài khoản người dùng và vai trò phân quyền để quản lý quyền truy cập trong hệ thống.

| STT | Tên trường (Field) | Kiểu dữ liệu (Type) | Khóa / Ràng buộc (Constraints) | Mô tả chi tiết (Description) |
|---|---|---|---|---|
| 1 | id | String | PK (Khóa chính), Default: `cuid()` | Mã định danh duy nhất của tài khoản người dùng. |
| 2 | email | String | Unique (Duy nhất) | Địa chỉ thư điện tử của người dùng, sử dụng làm thông tin đăng nhập duy nhất vào hệ thống. |
| 3 | password | String | Bắt buộc | Mật khẩu tài khoản đã được mã hóa an toàn (bằng thuật toán băm). |
| 4 | name | String | Bắt buộc | Họ và tên đầy đủ của người dùng. |
| 5 | role | Role (Enum) | Default: `STAFF` | Vai trò và quyền hạn của tài khoản trong hệ thống bao gồm: `ADMIN` (Quản trị viên), `MANAGER` (Quản lý cửa hàng), hoặc `STAFF` (Nhân viên). |
| 6 | createdAt | DateTime | Default: `now()` | Ngày giờ khởi tạo tài khoản trên hệ thống. |
| 7 | updatedAt | DateTime | Tự động cập nhật | Ngày giờ cập nhật thông tin tài khoản gần nhất. |

---

### Bảng: Category
- **Mô tả:** Lưu trữ thông tin về các danh mục nhóm sản phẩm hoặc nguyên vật liệu hỗ trợ cho việc phân loại và quản lý thực đơn.

| STT | Tên trường (Field) | Kiểu dữ liệu (Type) | Khóa / Ràng buộc (Constraints) | Mô tả chi tiết (Description) |
|---|---|---|---|---|
| 1 | id | String | PK (Khóa chính), Default: `cuid()` | Mã định danh duy nhất của danh mục sản phẩm. |
| 2 | name | String | Bắt buộc | Tên của danh mục phân loại sản phẩm (ví dụ: Cà phê, Trà, Bánh ngọt). |
| 3 | description | String | Nullable (Cho phép rỗng) | Mô tả tóm tắt chi tiết về danh mục sản phẩm. |
| 4 | createdAt | DateTime | Default: `now()` | Ngày giờ tạo danh mục sản phẩm. |
| 5 | updatedAt | DateTime | Tự động cập nhật | Ngày giờ cập nhật thông tin danh mục gần nhất. |

---

### Bảng: Product
- **Mô tả:** Lưu trữ danh sách thông tin chi tiết về từng sản phẩm, bao gồm giá bán và mối liên kết đến danh mục sản phẩm tương ứng.

| STT | Tên trường (Field) | Kiểu dữ liệu (Type) | Khóa / Ràng buộc (Constraints) | Mô tả chi tiết (Description) |
|---|---|---|---|---|
| 1 | id | String | PK (Khóa chính), Default: `cuid()` | Mã định danh duy nhất của sản phẩm hoặc nguyên vật liệu. |
| 2 | name | String | Bắt buộc | Tên gọi chi tiết của sản phẩm. |
| 3 | price | Float | Default: `0` | Đơn giá bán của sản phẩm trên menu. |
| 4 | categoryId | String | FK (Khóa ngoại) | Mã danh mục liên kết, tham chiếu trực tiếp đến trường `id` của bảng `Category`. |
| 5 | createdAt | DateTime | Default: `now()` | Ngày giờ sản phẩm được tạo hoặc đưa vào kinh doanh. |
| 6 | updatedAt | DateTime | Tự động cập nhật | Ngày giờ cập nhật thông tin sản phẩm gần nhất. |

---

### Bảng: Inventory
- **Mô tả:** Quản lý lượng hàng tồn kho vật lý hiện tại và đơn vị đo lường tương ứng của từng sản phẩm.

| STT | Tên trường (Field) | Kiểu dữ liệu (Type) | Khóa / Ràng buộc (Constraints) | Mô tả chi tiết (Description) |
|---|---|---|---|---|
| 1 | id | String | PK (Khóa chính), Default: `cuid()` | Mã định danh duy nhất của bản ghi lưu trữ kho hàng. |
| 2 | productId | String | FK (Khóa ngoại), Unique (Duy nhất) | Mã sản phẩm, tham chiếu trực tiếp đến trường `id` của bảng `Product` (mỗi sản phẩm chỉ tồn tại một trạng thái kho duy nhất). |
| 3 | quantity | Int | Default: `0` | Số lượng sản phẩm hiện có thực tế trong kho. |
| 4 | unit | String | Bắt buộc | Đơn vị đo lường sử dụng trong kho hàng (ví dụ: Ly, Chai, Gram, Kilogram). |
| 5 | updatedAt | DateTime | Tự động cập nhật | Ngày giờ cập nhật số lượng tồn kho gần nhất. |

---

### Bảng: InventoryTransaction
- **Mô tả:** Lưu trữ chi tiết nhật ký mọi giao dịch nhập kho và xuất kho đối với từng sản phẩm cụ thể.

| STT | Tên trường (Field) | Kiểu dữ liệu (Type) | Khóa / Ràng buộc (Constraints) | Mô tả chi tiết (Description) |
|---|---|---|---|---|
| 1 | id | String | PK (Khóa chính), Default: `cuid()` | Mã định danh duy nhất của giao dịch thay đổi kho hàng. |
| 2 | productId | String | FK (Khóa ngoại) | Mã sản phẩm thực hiện giao dịch kho, tham chiếu trực tiếp đến trường `id` của bảng `Product`. |
| 3 | type | TransactionType (Enum) | Bắt buộc | Loại hình giao dịch biến động kho: `IN` (Nhập kho) hoặc `OUT` (Xuất kho). |
| 4 | quantity | Int | Bắt buộc | Số lượng sản phẩm tăng/giảm trong đợt giao dịch tương ứng. |
| 5 | reason | String | Nullable (Cho phép rỗng) | Lý do chi tiết thực hiện giao dịch (ví dụ: Nhập hàng mới từ nhà cung cấp, Xuất bán hàng, Hao hụt/hỏng hóc). |
| 6 | createdAt | DateTime | Default: `now()` | Ngày giờ thực hiện giao dịch biến động kho này. |

---

### Bảng: Order
- **Mô tả:** Lưu trữ thông tin chung về đơn hàng của khách hàng, tiến độ xử lý và tổng chi phí của hóa đơn.

| STT | Tên trường (Field) | Kiểu dữ liệu (Type) | Khóa / Ràng buộc (Constraints) | Mô tả chi tiết (Description) |
|---|---|---|---|---|
| 1 | id | String | PK (Khóa chính), Default: `cuid()` | Mã định danh duy nhất của đơn đặt hàng. |
| 2 | userId | String | FK (Khóa ngoại) | Mã định danh nhân viên khởi tạo đơn hàng, tham chiếu trực tiếp đến trường `id` của bảng `User`. |
| 3 | status | OrderStatus (Enum) | Default: `PENDING` | Trạng thái xử lý của đơn hàng bao gồm: `PENDING` (Đang chờ xử lý), `COMPLETED` (Đã hoàn thành), `CANCELLED` (Đã hủy). |
| 4 | totalAmount | Float | Default: `0` | Tổng giá trị bằng tiền của đơn hàng. |
| 5 | createdAt | DateTime | Default: `now()` | Ngày giờ thực hiện lập hóa đơn mua hàng. |
| 6 | updatedAt | DateTime | Tự động cập nhật | Ngày giờ cập nhật trạng thái đơn hàng gần nhất. |

---

### Bảng: OrderItem
- **Mô tả:** Lưu trữ danh sách chi tiết các sản phẩm nằm trong một đơn hàng cùng số lượng và đơn giá thực tế tại thời điểm mua.

| STT | Tên trường (Field) | Kiểu dữ liệu (Type) | Khóa / Ràng buộc (Constraints) | Mô tả chi tiết (Description) |
|---|---|---|---|---|
| 1 | id | String | PK (Khóa chính), Default: `cuid()` | Mã định danh duy nhất của chi tiết mặt hàng trong đơn hàng. |
| 2 | orderId | String | FK (Khóa ngoại), Cascade Delete | Mã đơn hàng chứa mặt hàng này, tham chiếu đến trường `id` của bảng `Order` (khi đơn hàng bị xóa, các chi tiết này sẽ tự động xóa theo). |
| 3 | productId | String | FK (Khóa ngoại) | Mã sản phẩm được chọn bán, tham chiếu đến trường `id` của bảng `Product`. |
| 4 | quantity | Int | Bắt buộc | Số lượng của sản phẩm này được bán ra trong đơn hàng. |
| 5 | price | Float | Bắt buộc | Đơn giá thực tế áp dụng cho sản phẩm tại thời điểm giao dịch bán. |

---

### Bảng: Payment
- **Mô tả:** Lưu trữ thông tin về các giao dịch thanh toán tài chính tương ứng cho từng đơn hàng của quán.

| STT | Tên trường (Field) | Kiểu dữ liệu (Type) | Khóa / Ràng buộc (Constraints) | Mô tả chi tiết (Description) |
|---|---|---|---|---|
| 1 | id | String | PK (Khóa chính), Default: `cuid()` | Mã định danh duy nhất của giao dịch thanh toán. |
| 2 | orderId | String | FK (Khóa ngoại), Unique (Duy nhất), Cascade Delete | Mã đơn hàng cần thanh toán, tham chiếu trực tiếp đến trường `id` của bảng `Order` (một đơn hàng chỉ có một giao dịch thanh toán). |
| 3 | method | String | Bắt buộc | Phương thức thanh toán khách hàng lựa chọn (ví dụ: Tiền mặt, Chuyển khoản ngân hàng, Ví điện tử). |
| 4 | amount | Float | Bắt buộc | Tổng số tiền đã thanh toán thực tế của giao dịch này. |
| 5 | status | String | Bắt buộc | Trạng thái hiện tại của quá trình thanh toán (ví dụ: Thành công, Đang xử lý, Thất bại). |
| 6 | createdAt | DateTime | Default: `now()` | Ngày giờ thực hiện giao dịch thanh toán này. |

---

### Bảng: Supplier
- **Mô tả:** Lưu trữ thông tin hồ sơ của các nhà cung cấp nguyên vật liệu, sản phẩm đầu vào cho hệ thống quán.

| STT | Tên trường (Field) | Kiểu dữ liệu (Type) | Khóa / Ràng buộc (Constraints) | Mô tả chi tiết (Description) |
|---|---|---|---|---|
| 1 | id | String | PK (Khóa chính), Default: `cuid()` | Mã định danh duy nhất của nhà cung cấp. |
| 2 | name | String | Bắt buộc | Tên gọi chính thức của đối tác hoặc nhà cung cấp. |
| 3 | contact | String | Nullable (Cho phép rỗng) | Thông tin liên lạc của đối tác (ví dụ: Số điện thoại hoặc email liên hệ). |
| 4 | address | String | Nullable (Cho phép rỗng) | Địa chỉ trụ sở văn phòng hoặc nhà kho của nhà cung cấp. |
| 5 | createdAt | DateTime | Default: `now()` | Ngày giờ lưu hồ sơ nhà cung cấp vào hệ thống. |
| 6 | updatedAt | DateTime | Tự động cập nhật | Ngày giờ cập nhật hồ sơ nhà cung cấp gần nhất. |

---

### Bảng: SupplierProduct
- **Mô tả:** Bảng liên kết trung gian thể hiện đơn giá nhập sản phẩm của từng nhà cung cấp khác nhau.

| STT | Tên trường (Field) | Kiểu dữ liệu (Type) | Khóa / Ràng buộc (Constraints) | Mô tả chi tiết (Description) |
|---|---|---|---|---|
| 1 | id | String | PK (Khóa chính), Default: `cuid()` | Mã định danh duy nhất cho liên kết giá của sản phẩm theo nhà cung cấp. |
| 2 | supplierId | String | FK (Khóa ngoại), Cascade Delete | Mã nhà cung cấp liên đới, tham chiếu đến trường `id` của bảng `Supplier`. |
| 3 | productId | String | FK (Khóa ngoại), Cascade Delete | Mã sản phẩm được cung cấp, tham chiếu đến trường `id` của bảng `Product`. |
| 4 | price | Float | Bắt buộc | Đơn giá cung ứng/nhập hàng được áp dụng từ nhà cung cấp này cho sản phẩm. |

---

### Bảng: PurchaseRequest
- **Mô tả:** Quản lý các phiếu đề xuất mua hoặc nhập thêm hàng hóa/nguyên vật liệu được tạo bởi nhân viên.

| STT | Tên trường (Field) | Kiểu dữ liệu (Type) | Khóa / Ràng buộc (Constraints) | Mô tả chi tiết (Description) |
|---|---|---|---|---|
| 1 | id | String | PK (Khóa chính), Default: `cuid()` | Mã định danh duy nhất của phiếu yêu cầu nhập hàng. |
| 2 | status | RequestStatus (Enum) | Default: `PENDING` | Trạng thái phê duyệt của phiếu yêu cầu nhập hàng, bao gồm: `DRAFT` (Nháp), `PENDING` (Chờ duyệt), `APPROVED` (Đã duyệt), `REJECTED` (Từ chối). |
| 3 | requestedBy | String | FK (Khóa ngoại) | Mã nhân viên chịu trách nhiệm đề xuất, tham chiếu trực tiếp đến trường `id` của bảng `User`. |
| 4 | createdAt | DateTime | Default: `now()` | Ngày giờ phiếu yêu cầu nhập hàng được khởi tạo. |
| 5 | updatedAt | DateTime | Tự động cập nhật | Ngày giờ cập nhật tiến trình phê duyệt của phiếu yêu cầu nhập hàng gần nhất. |

---

### Bảng: PurchaseRequestItem
- **Mô tả:** Lưu trữ thông tin chi tiết số lượng sản phẩm được đề xuất cụ thể trong mỗi phiếu yêu cầu mua hàng.

| STT | Tên trường (Field) | Kiểu dữ liệu (Type) | Khóa / Ràng buộc (Constraints) | Mô tả chi tiết (Description) |
|---|---|---|---|---|
| 1 | id | String | PK (Khóa chính), Default: `cuid()` | Mã định danh duy nhất của chi tiết hàng hóa cần nhập. |
| 2 | requestId | String | FK (Khóa ngoại), Cascade Delete | Mã phiếu yêu cầu mua hàng liên đới, tham chiếu đến trường `id` của bảng `PurchaseRequest` (khi phiếu yêu cầu bị xóa, chi tiết sẽ tự động xóa). |
| 3 | productId | String | FK (Khóa ngoại) | Mã sản phẩm cần nhập thêm, tham chiếu đến trường `id` của bảng `Product`. |
| 4 | quantity | Int | Bắt buộc | Số lượng mặt hàng được đề xuất mua thêm. |

---

### Bảng: SystemSetting
- **Mô tả:** Lưu trữ các cấu hình, thông số thiết lập chung vận hành toàn bộ hệ thống quán cà phê dưới dạng Key-Value.

| STT | Tên trường (Field) | Kiểu dữ liệu (Type) | Khóa / Ràng buộc (Constraints) | Mô tả chi tiết (Description) |
|---|---|---|---|---|
| 1 | key | String | PK (Khóa chính) | Khóa định danh duy nhất của cấu hình thiết lập hệ thống. |
| 2 | value | String | Bắt buộc | Giá trị thiết lập tương ứng định dạng chuỗi. |
| 3 | updatedAt | DateTime | Tự động cập nhật | Ngày giờ chỉnh sửa thay đổi giá trị cấu hình gần nhất. |

---

### Bảng: AgentLog
- **Mô tả:** Ghi nhận nhật ký lịch sử hoạt động và phản hồi kết quả của các tác vụ do AI Agent xử lý phục vụ cho công tác kiểm tra và giám sát.

| STT | Tên trường (Field) | Kiểu dữ liệu (Type) | Khóa / Ràng buộc (Constraints) | Mô tả chi tiết (Description) |
|---|---|---|---|---|
| 1 | id | String | PK (Khóa chính), Default: `uuid()` | Mã định danh duy nhất của bản ghi nhật ký. |
| 2 | action | String | Bắt buộc | Tên hành động hoặc thao tác kỹ thuật AI Agent đã thực hiện. |
| 3 | result | String | Bắt buộc | Kết quả hoặc phản hồi thu được sau khi thực hiện thao tác. |
| 4 | triggered_at | DateTime | Default: `now()` | Ngày giờ kích hoạt sự kiện/hành động của AI Agent. |
