# HƯỚNG DẪN VIẾT TÀI LIỆU HÓA API (API DOCUMENTATION) - CAFE AGENT

Tài liệu hóa API là một phần rất quan trọng trong báo cáo kiểm thử và phát triển phần mềm. Khi hội đồng hoặc giảng viên chấm điểm, họ sẽ đối chiếu:
1. **API Document** có định nghĩa rõ ràng Request/Response/Mã lỗi không?
2. **Test Case** (trong Postman / Code test) có bám sát đúng tài liệu này không?

Dưới đây là 3 cách viết phổ biến nhất, khuyến nghị lựa chọn cho dự án, và cấu trúc mẫu để bạn áp dụng ngay.

---

## 1. Có Cần Viết Tài Liệu Hóa API Không?

**CÓ, RẤT CẦN.** Tuy nhiên bạn **không cần viết thủ công hàng trăm trang Word**, mà nên chọn 1 trong 2 cách sau:

1. **Cách 1 (Nhanh & Tốt nhất cho Postman): Xuất Documentation trực tiếp từ Postman**
   - Postman có tính năng tự sinh Web Docs chỉ bằng 1 nút bấm (**View Documentation** / **Publish Docs**). Bạn chụp ảnh hoặc xuất file PDF đính kèm vào phụ lục báo cáo.
2. **Cách 2 (Chuẩn kỹ thuật phần mềm): Viết 1 file Markdown `docs/API_DOCUMENTATION.md`**
   - Tập trung vào các endpoint cốt lõi (Auth, Ingredients, Recipe, Inventory, Order, Agent).
   - Giảng viên mở file Markdown trên GitHub hoặc VS Code đọc rất dễ dàng.

---

## 2. Cấu Trúc Chuẩn Của 1 Endpoint Khi Viết Tài Liệu

Mỗi endpoint trong tài liệu API bắt buộc phải có đủ **6 thành phần**:

1. **Tên chức năng & Phương thức HTTP + Endpoint**: (ví dụ `POST /api/orders`)
2. **Quyền truy cập (Authentication / Authorization)**: Public, `Bearer Token` (Role: `CUSTOMER`, `ADMIN` hay `STAFF`)
3. **Mô tả ngắn gọn nghiệp vụ**: Chức năng này làm gì, tác động gì đến DB/kho?
4. **Request**:
   - Headers: `Authorization`, `Content-Type`
   - Path/Query Params (nếu có): `?page=1&limit=20`
   - Body JSON (kèm giải thích kiểu dữ liệu & điều kiện hợp lệ)
5. **Response thành công**: Status Code (`200 OK` hoặc `201 Created`) + JSON dữ liệu trả về
6. **Bảng mã lỗi (Error Responses - Rất quan trọng khi đối chiếu test ca âm)**:
   - `400 Bad Request`: Sai định dạng, số âm, thiếu trường bắt buộc.
   - `401 Unauthorized`: Chưa đăng nhập hoặc token hết hạn.
   - `403 Forbidden`: Sai vai trò (ví dụ: Customer cố gọi API Admin).
   - `409 Conflict`: Trùng email, trùng mã lô hàng, hoặc xung đột số lượng tồn kho.

---

## 3. Bản Mẫu (Template) Áp Dụng Trực Tiếp Cho Dự Án Cafe Agent

Dưới đây là mẫu chuẩn Markdown cho 2 API đại diện (1 API Nghiệp vụ đặt hàng & 1 API AI Agent) bạn có thể sao chép để dùng ngay:

### Mẫu 1: API Nghiệp vụ — Tạo Đơn Hàng

```markdown
### 1. Tạo đơn hàng mới (Create Order)
- **Method:** `POST`
- **URL:** `/api/orders`
- **Quyền truy cập:** `CUSTOMER` (Bearer Token)
- **Mô tả:** Khách hàng đặt mua sản phẩm. Hệ thống sẽ kiểm tra tồn kho nguyên liệu (nếu có công thức) và giữ chỗ (`RESERVE`).

#### Request Headers
| Header | Giá trị | Bắt buộc | Mô tả |
| :--- | :--- | :---: | :--- |
| `Authorization` | `Bearer <access_token>` | Có | Token của tài khoản khách hàng |
| `Content-Type` | `application/json` | Có | Định dạng dữ liệu gửi lên |

#### Request Body (JSON)
```json
{
  "items": [
    {
      "productId": "prod_cf_den_01",
      "quantity": 2
    }
  ],
  "paymentMethod": "COD",
  "shippingAddress": "123 Đường Nguyễn Huệ, Quận 1, TP.HCM",
  "phone": "0901234567"
}
```

#### Tham số Request
| Tên trường | Kiểu dữ liệu | Điều kiện hợp lệ | Mô tả |
| :--- | :--- | :--- | :--- |
| `items` | Array | Tối thiểu 1 phần tử | Danh sách sản phẩm mua |
| `items[].productId` | String | Phải tồn tại trong DB | ID sản phẩm |
| `items[].quantity` | Integer | Số nguyên dương $\ge 1$ | Số lượng mua |
| `paymentMethod` | Enum | `COD`, `BANK_TRANSFER`, `CASH` | Phương thức thanh toán |
| `phone` | String | 10 số, đầu số hợp lệ | Số điện thoại nhận hàng |

#### Response Thành công (`201 Created`)
```json
{
  "success": true,
  "data": {
    "orderId": "ord_20261106_001",
    "status": "PENDING",
    "totalAmount": 70000,
    "paymentMethod": "COD",
    "createdAt": "2026-11-06T10:00:00.000Z"
  }
}
```

#### Các mã lỗi thường gặp (Error Cases)
| Mã HTTP | Tình huống xảy ra | Ví dụ Response JSON |
| :---: | :--- | :--- |
| `400` | Số lượng không hợp lệ ($\le 0$, số thập phân) | `{"success": false, "message": "Số lượng phải là số nguyên dương"}` |
| `400` | Tồn kho không đủ để giữ chỗ | `{"success": false, "message": "Nguyên liệu không đủ để pha chế món này"}` |
| `401` | Không truyền token hoặc token hết hạn | `{"success": false, "message": "Unauthorized"}` |
| `403` | Gọi API bằng quyền không hợp lệ | `{"success": false, "message": "Forbidden"}` |
```

---

### Mẫu 2: API AI Agent — Kích hoạt quét tồn kho & tạo đề xuất nhập hàng

```markdown
### 2. Quét tồn kho qua AI Agent (Scan Inventory)
- **Method:** `POST`
- **URL:** `/internal/agent/scan-inventory`
- **Quyền truy cập:** Nội bộ / `ADMIN` (`x-agent-internal-token` hoặc Bearer Admin)
- **Mô tả:** AI Agent quét các mặt hàng có tồn khả dụng thấp hơn ngưỡng tái đặt hàng (`reorderPoint`), phân tích tốc độ bán 30 ngày và tự động tạo đề xuất Purchase Request.

#### Request Headers
| Header | Giá trị | Bắt buộc |
| :--- | :--- | :---: |
| `x-agent-internal-token` | `<internal_secret>` | Có |
| `x-agent-user-id` | `admin_user_id` | Có |
| `Content-Type` | `application/json` | Có |

#### Request Body (JSON)
```json
{
  "input": {
    "triggerType": "MANUAL_ADMIN_SCAN",
    "productIds": ["prod_cf_den_01"]
  }
}
```

#### Response Thành công (`200 OK`)
```json
{
  "data": {
    "scanSessionId": "scan_1730900000_abc123",
    "results": [
      {
        "productId": "prod_cf_den_01",
        "action": "RECOMMEND_REORDER",
        "result": "CREATED_PURCHASE_REQUEST",
        "availableStock": 2,
        "reorderPoint": 10,
        "recommendedQuantity": 50,
        "recommendedSupplierId": "supp_trung_nguyen_01",
        "fallbackUsed": false
      }
    ]
  }
}
```

#### Mã lỗi thường gặp (Error Cases)
| Mã HTTP | Tình huống |
| :---: | :--- |
| `401` | Thiếu hoặc sai header `x-agent-internal-token` |
| `403` | User ID truyền vào không có quyền ADMIN |
| `500` | Lỗi kết nối DB hoặc lỗi logic xử lý |
```

---

## 4. Cách Tự Động Hóa Tài Liệu Bằng Postman (Nhanh Nhất)

Nếu bạn không muốn ngồi gõ Markdown từng API:
1. Mở **Postman**, ở mỗi request, bạn click vào mục **Description** (hình cây bút) viết 1-2 dòng giải thích.
2. Lưu các **Example Response** (cả ca thành công `200` và ca lỗi `400, 401, 403, 409`).
3. Click vào menu Collection (dấu 3 chấm `...`) $\rightarrow$ Chọn **View documentation**.
4. Bấm **Export** hoặc chụp ảnh giao diện Postman Document $\rightarrow$ Giao diện hiển thị cực kỳ đẹp mắt, tự động render ra mẫu cURL, Body, Response và bảng mã lỗi.
