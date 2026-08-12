# SEED LOG & DATABASE RESET HISTORY

## [2026-07-29 22:09:20 UTC / 15:09:20 Local] RESET TOÀN BỘ LOCAL DATABASE

- **Host target**: `localhost:5432` (Database: `cafedb`) - Docker Local PostgreSQL container.
- **Trạng thái DATABASE_URL**: `postgresql://cafedb:cafedb_password@localhost:5432/cafedb` (Xác nhận trỏ vào Local, không phải Render).
- **Các hành động đã thực hiện**:
  1. Kiểm tra và trỏ `DATABASE_URL` trong `.env` các package về PostgreSQL Local (`localhost:5432`).
  2. Khởi chạy container PostgreSQL `cafe_postgres` qua `docker-compose up -d postgres`.
  3. Thực thi `npx prisma migrate reset --force --skip-seed` tại `packages/database` để xóa sạch toàn bộ dữ liệu và tái tạo schema chuẩn từ migrations.
  4. Thực thi script truy vấn kiểm tra số lượng bản ghi trên tất cả 15 bảng trong CSDL.
  5. Xóa sạch các file dữ liệu cũ trong thư mục `packages/database/prisma/seed-data/` (`categories.json`, `products.json`, `products-retail.json`, `suppliers.json`, `supplier-products.json`, `products-batch-2.json`).

### Kết quả truy vấn kiểm tra số lượng bản ghi (Record Count)

| STT | Tên Bảng (Prisma Model) | Số lượng bản ghi | Trạng thái |
| :---: | :--- | :---: | :---: |
| 1 | `user` | **0** | Clean |
| 2 | `category` | **0** | Clean |
| 3 | `product` | **0** | Clean |
| 4 | `inventory` | **0** | Clean |
| 5 | `inventoryBatch` | **0** | Clean |
| 6 | `inventoryTransaction` | **0** | Clean |
| 7 | `supplier` | **0** | Clean |
| 8 | `supplierProduct` | **0** | Clean |
| 9 | `purchaseRequest` | **0** | Clean |
| 10 | `purchaseRequestItem` | **0** | Clean |
| 11 | `order` | **0** | Clean |
| 12 | `orderItem` | **0** | Clean |
| 13 | `payment` | **0** | Clean |
| 14 | `agentLog` | **0** | Clean |
| 15 | `systemSetting` | **0** | Clean |
| **--** | **TỔNG SỐ BẢN GHI** | **0** | **SẴN SÀNG NẠP BỘ DỮ LIỆU MỚI** |
==================================================
🚀 CÀ PHÊ PROJECT - SEED DATA RUN
📌 CHẾ ĐỘ: 🔥 CẬP NHẬT THẬT VÀO DATABASE
⏰ Thời gian: 11:15:31 29/7/2026
🔌 Database Target: postgresql://postgres:cafe123456@localhost:5433/cafedb
==================================================

📂 Đã nạp từ file:
  - categories.json : 4 danh mục
  - products.json   : 18 sản phẩm

--------------------------------------------------
1️⃣ DANH SÁCH DANH MỤC SẼ TẠO:
--------------------------------------------------

--------------------------------------------------
2️⃣ DANH SÁCH SẢN PHẨM CÀ PHÊ THẬT SẼ TẠO:
--------------------------------------------------

⚡ ĐANG THỰC HIỆN NẠP DỮ LIỆU THẬT VÀO DATABASE...

[1/3] Nạp Người Dùng...
  + Đã tạo người dùng: "admin@cafe.com" (ADMIN)
  + Đã tạo người dùng: "staff@cafe.com" (STAFF)
  + Đã tạo người dùng: "customer@cafe.com" (CUSTOMER)

[2/3] Nạp Danh Mục Cà Phê...
  + Đã tạo danh mục: "Cà phê hạt" (ID: cms6enomm0003ul3kx18eac26)
  + Đã tạo danh mục: "Cà phê bột" (ID: cms6enoms0004ul3ka1pwh27d)
  + Đã tạo danh mục: "Cà phê lon" (ID: cms6enomv0005ul3k9r6711m9)
  + Đã tạo danh mục: "Cà phê hòa tan & túi lọc" (ID: cms6enomz0006ul3k9nq684ui)

[3/3] Nạp Sản Phẩm & Khởi Tạo Kho...
  + Đã tạo sản phẩm [CPH-DALAT-001]: "Cà Phê Hạt Arabica Cầu Đất Đà Lạt Premium 500g"
    └ Tự động tạo bản ghi Kho (Tồn: 50 Gói, Ngưỡng: 10)
  + Đã tạo sản phẩm [CPH-BMT-002]: "Cà Phê Hạt Robusta Buôn Ma Thuột Nguyên Chất 500g"
    └ Tự động tạo bản ghi Kho (Tồn: 50 Gói, Ngưỡng: 10)
  + Đã tạo sản phẩm [CPH-SONLA-003]: "Cà Phê Hạt Arabica Sơn La Specialty 500g"
    └ Tự động tạo bản ghi Kho (Tồn: 50 Gói, Ngưỡng: 10)
  + Đã tạo sản phẩm [CPH-GIALAI-004]: "Cà Phê Hạt Phối Trộn Robusta & Arabica Chư Sê 1kg"
    └ Tự động tạo bản ghi Kho (Tồn: 50 Kg, Ngưỡng: 10)
  + Đã tạo sản phẩm [CPH-LAMDONG-005]: "Cà Phê Hạt Culico (Culi Robusta) Bảo Lộc 500g"
    └ Tự động tạo bản ghi Kho (Tồn: 50 Gói, Ngưỡng: 10)
  + Đã tạo sản phẩm [CPB-BMT-001]: "Cà Phê Bột Truyền Thống Pha Phin Buôn Ma Thuột 500g"
    └ Tự động tạo bản ghi Kho (Tồn: 50 Gói, Ngưỡng: 10)
  + Đã tạo sản phẩm [CPB-DALAT-002]: "Cà Phê Bột Arabica Cầu Đất Rang Vừa 250g"
    └ Tự động tạo bản ghi Kho (Tồn: 50 Gói, Ngưỡng: 10)
  + Đã tạo sản phẩm [CPB-QUANGTRI-003]: "Cà Phê Bột Khe Sanh Arabica Hướng Hóa 500g"
    └ Tự động tạo bản ghi Kho (Tồn: 50 Gói, Ngưỡng: 10)
  + Đã tạo sản phẩm [CPB-PLEIKU-004]: "Cà Phê Bột Moka Đốt Than Pleiku Premium 250g"
    └ Tự động tạo bản ghi Kho (Tồn: 50 Gói, Ngưỡng: 10)
  + Đã tạo sản phẩm [CPB-KRONG-005]: "Cà Phê Bột Robusta Mật Chiết (Honey Process) Krông Năng 500g"
    └ Tự động tạo bản ghi Kho (Tồn: 50 Gói, Ngưỡng: 10)
  + Đã tạo sản phẩm [CPL-SUADA-001]: "Cà Phê Lon Sữa Đá Đậm Vị Sài Gòn 235ml"
    └ Tự động tạo bản ghi Kho (Tồn: 50 Lon, Ngưỡng: 10)
  + Đã tạo sản phẩm [CPL-DENDA-002]: "Cà Phê Lon Đen Đá Đắk Lắk Không Đường 235ml"
    └ Tự động tạo bản ghi Kho (Tồn: 50 Lon, Ngưỡng: 10)
  + Đã tạo sản phẩm [CPL-COLDBREW-003]: "Cà Phê Lon Cold Brew Arabica Đà Lạt Nguyên Chất 250ml"
    └ Tự động tạo bản ghi Kho (Tồn: 50 Lon, Ngưỡng: 10)
  + Đã tạo sản phẩm [CPL-LATTE-004]: "Cà Phê Lon Salted Caramel Latte 240ml"
    └ Tự động tạo bản ghi Kho (Tồn: 50 Lon, Ngưỡng: 10)
  + Đã tạo sản phẩm [CPHT-3IN1-001]: "Cà Phê Hòa Tan 3in1 Đắk Lắk Hộp 20 Gói"
    └ Tự động tạo bản ghi Kho (Tồn: 50 Hộp, Ngưỡng: 10)
  + Đã tạo sản phẩm [CPHT-DRIP-002]: "Cà Phê Túi Lọc Drip Bag Arabica Cầu Đất Hộp 10 Túi"
    └ Tự động tạo bản ghi Kho (Tồn: 50 Hộp, Ngưỡng: 10)
  + Đã tạo sản phẩm [CPHT-BLACK-003]: "Cà Phê Hòa Tan Đen Sấy Lạnh Pure Black Hộp 15 Gói"
    └ Tự động tạo bản ghi Kho (Tồn: 50 Hộp, Ngưỡng: 10)
  + Đã tạo sản phẩm [CPHT-DRIP-004]: "Cà Phê Túi Lọc Fine Robusta Krông Năng Hộp 10 Túi"
    └ Tự động tạo bản ghi Kho (Tồn: 50 Hộp, Ngưỡng: 10)

==================================================
🎉 HOÀN THÀNH SEED DỮ LIỆU CÀ PHÊ THẬT:
- Tổng sản phẩm đã nạp: 18/18
==================================================

---

## [2026-07-29 18:29:00 Local] KHẮC PHỤC LỖI KẾT NỐI DATABASE VÀ ĐỒNG BỘ DỮ LIỆU SẢN PHẨM TRÊN API / FRONTEND

### Nguyên nhân lỗi:
1. **Sai thông tin đăng nhập trong `apps/api/.env` và `apps/agent/.env`**:
   - Biến `DATABASE_URL` trong `apps/api/.env` bị đặt sai username/password thành `cafedb:cafee123456` thay vì `postgres:cafe123456@localhost:5433/cafedb`.
   - Biến `DATABASE_URL` trong `apps/agent/.env` bị đặt sai username/password thành `cafedb:123456`.
2. **Server API cũ chưa được cập nhật cấu hình mới**:
   - Tiến trình server API cũ khởi chạy trước khi cập nhật `.env` và seed DB, dẫn đến API trả về thông báo lỗi `"Kết nối cơ sở dữ liệu thất bại"` khi gọi `GET /api/products`.

### Các bước đã khắc phục:
1. **Cập nhật `.env`**:
   - Sửa [apps/api/.env](file:///d:/tieuluanchuyennganh/project/cafe-project/apps/api/.env): `DATABASE_URL="postgresql://postgres:cafe123456@localhost:5433/cafedb?schema=public"`
   - Sửa [apps/agent/.env](file:///d:/tieuluanchuyennganh/project/cafe-project/apps/agent/.env): `DATABASE_URL="postgresql://postgres:cafe123456@localhost:5433/cafedb?schema=public"`
2. **Restart server API & Agent**: Khởi động lại tiến trình server Backend API (`@cafe-project/api`) và Agent (`@cafe-project/agent`).
3. **Xác nhận API**: Gọi `GET http://localhost:5000/api/products` -> **Trả về thành công 18/18 sản phẩm cà phê thật (HTTP 200, `success: true`)**.
4. **Xác nhận Frontend**: Frontend (`http://localhost:5173`) hoạt động bình thường, hiển thị đúng dữ liệu 18 sản phẩm với ảnh, danh mục và giá thực tế.

---

## [2026-07-29 19:00:00 Local] DỌN DẸP TOÀN BỘ FILE RÁC & CẬP NHẬT GIAO DIỆN / CẤU HÌNH (BƯỚC E)

### 1. Xóa file dư thừa & script cũ:
- **Đã xóa 3 file script/tạm cũ**:
  - `packages/database/prisma/fetch-product-images.ts` (Script tải ảnh cũ)
  - `packages/database/prisma/pexels-mapping.json` (Log tạm Pexels API)
  - `packages/database/prisma/verify_counts.ts` (Script debug đếm record)
- **Đã xóa 46 file ảnh rác dư thừa trong `apps/web/public/images/products/`**:
  - Giải phóng ~1.03 MB bộ nhớ, giữ lại chính xác **18 file ảnh thực tế** khớp 1:1 với 18 sản phẩm cà phê trong DB.

### 2. Cập nhật cấu hình script:
- Sửa [packages/database/package.json](file:///d:/tieuluanchuyennganh/project/cafe-project/packages/database/package.json): Cập nhật lệnh `"fetch-images": "tsx prisma/fetch-pexels-images.ts"` để đồng bộ với utility tải ảnh Pexels mới.

### 3. Kiểm tra `.gitignore` & Git status:
- Không có file rác/nhạy cảm (`.env`, `node_modules`, `dist`) bị lỡ track vào Git tracking.
- Đã sẵn sàng cho lượt commit code mới với đúng 18 ảnh sản phẩm và bộ dữ liệu seed chuẩn.


==================================================
🚀 CÀ PHÊ PROJECT - SEED DATA RUN
📌 CHẾ ĐỘ: 🔥 CẬP NHẬT THẬT VÀO DATABASE
⏰ Thời gian: 23:34:06 28/7/2026
🔌 Database Target: postgresql://cafe_postgres_db_user:CUU2M8aOZVo5XvmpWwsfUWuhznECPIuK@dpg-d9hdk0eq1p3s739nuoh0-a.virginia-postgres.render.com/cafe_postgres_db
==================================================

📂 Đã nạp từ file:
  - categories.json : 4 danh mục
  - products.json   : 18 sản phẩm

--------------------------------------------------
1️⃣ DANH SÁCH DANH MỤC SẼ TẠO:
--------------------------------------------------

--------------------------------------------------
2️⃣ DANH SÁCH SẢN PHẨM CÀ PHÊ THẬT SẼ TẠO:
--------------------------------------------------

⚡ ĐANG THỰC HIỆN NẠP DỮ LIỆU THẬT VÀO DATABASE...

[1/3] Nạp Người Dùng...
  - Tồn tại người dùng: "admin@cafe.com" (ADMIN) -> Bỏ qua.
  - Tồn tại người dùng: "staff@cafe.com" (STAFF) -> Bỏ qua.
  - Tồn tại người dùng: "customer@cafe.com" (CUSTOMER) -> Bỏ qua.

[2/3] Nạp Danh Mục Cà Phê...
  + Đã tạo danh mục: "Cà phê hạt" (ID: cms5plq6k0000uleg3am9qhu3)
  + Đã tạo danh mục: "Cà phê bột" (ID: cms5plqry0001ulega997nwk8)
  + Đã tạo danh mục: "Cà phê lon" (ID: cms5plr760002ulegbqe8ng6x)
  + Đã tạo danh mục: "Cà phê hòa tan & túi lọc" (ID: cms5plrl30003uleg49coglgj)

[3/3] Nạp Sản Phẩm & Khởi Tạo Kho...
  + Đã tạo sản phẩm [CPH-DALAT-001]: "Cà Phê Hạt Arabica Cầu Đất Đà Lạt Premium 500g"
    └ Tự động tạo bản ghi Kho (Tồn: 50 Gói, Ngưỡng: 10)
  + Đã tạo sản phẩm [CPH-BMT-002]: "Cà Phê Hạt Robusta Buôn Ma Thuột Nguyên Chất 500g"
    └ Tự động tạo bản ghi Kho (Tồn: 50 Gói, Ngưỡng: 10)
  + Đã tạo sản phẩm [CPH-SONLA-003]: "Cà Phê Hạt Arabica Sơn La Specialty 500g"
    └ Tự động tạo bản ghi Kho (Tồn: 50 Gói, Ngưỡng: 10)
  + Đã tạo sản phẩm [CPH-GIALAI-004]: "Cà Phê Hạt Phối Trộn Robusta & Arabica Chư Sê 1kg"
    └ Tự động tạo bản ghi Kho (Tồn: 50 Kg, Ngưỡng: 10)
  + Đã tạo sản phẩm [CPH-LAMDONG-005]: "Cà Phê Hạt Culico (Culi Robusta) Bảo Lộc 500g"
    └ Tự động tạo bản ghi Kho (Tồn: 50 Gói, Ngưỡng: 10)
  + Đã tạo sản phẩm [CPB-BMT-001]: "Cà Phê Bột Truyền Thống Pha Phin Buôn Ma Thuột 500g"
    └ Tự động tạo bản ghi Kho (Tồn: 50 Gói, Ngưỡng: 10)
  + Đã tạo sản phẩm [CPB-DALAT-002]: "Cà Phê Bột Arabica Cầu Đất Rang Vừa 250g"
    └ Tự động tạo bản ghi Kho (Tồn: 50 Gói, Ngưỡng: 10)
  + Đã tạo sản phẩm [CPB-QUANGTRI-003]: "Cà Phê Bột Khe Sanh Arabica Hướng Hóa 500g"
    └ Tự động tạo bản ghi Kho (Tồn: 50 Gói, Ngưỡng: 10)
  + Đã tạo sản phẩm [CPB-PLEIKU-004]: "Cà Phê Bột Moka Đốt Than Pleiku Premium 250g"
    └ Tự động tạo bản ghi Kho (Tồn: 50 Gói, Ngưỡng: 10)
  + Đã tạo sản phẩm [CPB-KRONG-005]: "Cà Phê Bột Robusta Mật Chiết (Honey Process) Krông Năng 500g"
    └ Tự động tạo bản ghi Kho (Tồn: 50 Gói, Ngưỡng: 10)
  + Đã tạo sản phẩm [CPL-SUADA-001]: "Cà Phê Lon Sữa Đá Đậm Vị Sài Gòn 235ml"
    └ Tự động tạo bản ghi Kho (Tồn: 50 Lon, Ngưỡng: 10)
  + Đã tạo sản phẩm [CPL-DENDA-002]: "Cà Phê Lon Đen Đá Đắk Lắk Không Đường 235ml"
    └ Tự động tạo bản ghi Kho (Tồn: 50 Lon, Ngưỡng: 10)
  + Đã tạo sản phẩm [CPL-COLDBREW-003]: "Cà Phê Lon Cold Brew Arabica Đà Lạt Nguyên Chất 250ml"
    └ Tự động tạo bản ghi Kho (Tồn: 50 Lon, Ngưỡng: 10)
  + Đã tạo sản phẩm [CPL-LATTE-004]: "Cà Phê Lon Salted Caramel Latte 240ml"
    └ Tự động tạo bản ghi Kho (Tồn: 50 Lon, Ngưỡng: 10)
  + Đã tạo sản phẩm [CPHT-3IN1-001]: "Cà Phê Hòa Tan 3in1 Đắk Lắk Hộp 20 Gói"
    └ Tự động tạo bản ghi Kho (Tồn: 50 Hộp, Ngưỡng: 10)
  + Đã tạo sản phẩm [CPHT-DRIP-002]: "Cà Phê Túi Lọc Drip Bag Arabica Cầu Đất Hộp 10 Túi"
    └ Tự động tạo bản ghi Kho (Tồn: 50 Hộp, Ngưỡng: 10)
  + Đã tạo sản phẩm [CPHT-BLACK-003]: "Cà Phê Hòa Tan Đen Sấy Lạnh Pure Black Hộp 15 Gói"
    └ Tự động tạo bản ghi Kho (Tồn: 50 Hộp, Ngưỡng: 10)
  + Đã tạo sản phẩm [CPHT-DRIP-004]: "Cà Phê Túi Lọc Fine Robusta Krông Năng Hộp 10 Túi"
    └ Tự động tạo bản ghi Kho (Tồn: 50 Hộp, Ngưỡng: 10)

==================================================
🎉 HOÀN THÀNH SEED DỮ LIỆU CÀ PHÊ THẬT:
- Tổng sản phẩm đã nạp: 18/18
==================================================

---

## [2026-07-29 06:34:00 UTC] �?NG B? SCHEMA, X�A D? LI?U CU V� N?P L?I TR�N PRODUCTION (RENDER)

### BU?C B: �?NG B? SCHEMA L�N PRODUCTION
- **Host target**: dpg-d9hdk0eq1p3s739nuoh0-a.virginia-postgres.render.com
- **H�nh d?ng**: Ch?y 
px prisma db push --schema=packages/database/prisma/schema
- **K?t qu?**: Th�nh c�ng, database d� d?ng b? ho�n to�n v?i Prisma schema.

### BU?C C: X�A S?CH D? LI?U CU TR�N PRODUCTION
- **H�nh d?ng**: Ch?y script clean_production.ts d? x�a l?n lu?t theo th? t? kh�a ngo?i (gi? nguy�n b?ng User).
- **K?t qu? query s? lu?ng**: Category: 0, Product: 0, Supplier: 0, SupplierProduct: 0, Inventory: 0. Database s?ch s?.

### BU?C D: N?P 18 S?N PH?M C� PH� M?I V�O PRODUCTION
- **H�nh d?ng**: Ch?y 
px tsx prisma/seed_cafe.ts --apply tr? v�o Production.
- **K?t qu?**: 
  - N?p th�nh c�ng 4 danh m?c.
  - N?p th�nh c�ng 18 s?n ph?m c� ph� v� kh?i t?o kho (t?n 50, ngu?ng 10).
  - Truy v?n l?i x�c nh?n: Categories=4, Products=18, Inventories=18.

==================================================
?? HO�N TH�NH SEED D? LI?U L�N PRODUCTION
==================================================
==================================================
🚀 CÀ PHÊ PROJECT - SEED DATA RUN
📌 CHẾ ĐỘ: 🔥 CẬP NHẬT THẬT VÀO DATABASE
⏰ Thời gian: 14:00:51 12/8/2026
🔌 Database Target: postgresql://postgres:cafe123456@localhost:5433/cafedb
==================================================

📂 Đã nạp từ file:
  - categories.json : 7 danh mục
  - products.json   : 28 sản phẩm

--------------------------------------------------
1️⃣ DANH SÁCH DANH MỤC SẼ TẠO:
--------------------------------------------------

--------------------------------------------------
2️⃣ DANH SÁCH SẢN PHẨM CÀ PHÊ THẬT SẼ TẠO:
--------------------------------------------------

⚡ ĐANG THỰC HIỆN NẠP DỮ LIỆU THẬT VÀO DATABASE...

[1/3] Nạp Người Dùng...
  - Tồn tại người dùng: "admin@cafe.com" (ADMIN) -> Bỏ qua.
  - Tồn tại người dùng: "staff@cafe.com" (STAFF) -> Bỏ qua.
  - Tồn tại người dùng: "customer@cafe.com" (CUSTOMER) -> Bỏ qua.

[2/3] Nạp Danh Mục Cà Phê...
  - Đã có danh mục: "Cà phê hạt" (ID: cms6enomm0003ul3kx18eac26)
  - Đã có danh mục: "Cà phê bột" (ID: cms6enoms0004ul3ka1pwh27d)
  - Đã có danh mục: "Cà phê lon" (ID: cms6enomv0005ul3k9r6711m9)
  - Đã có danh mục: "Cà phê hòa tan & túi lọc" (ID: cms6enomz0006ul3k9nq684ui)
  + Đã tạo danh mục: "Thức uống pha chế" (ID: cmspqpyxz0000ul8w1kb6mpi3)
  + Đã tạo danh mục: "Trà & Trái cây" (ID: cmspqpyy50001ul8wn471fmnr)
  + Đã tạo danh mục: "Bánh ngọt" (ID: cmspqpyyb0002ul8wa6n95zsg)

[3/3] Nạp Sản Phẩm & Khởi Tạo Kho...
  - Sản phẩm [CPH-DALAT-001] đã tồn tại -> Bỏ qua.
  - Sản phẩm [CPH-BMT-002] đã tồn tại -> Bỏ qua.
  - Sản phẩm [CPH-SONLA-003] đã tồn tại -> Bỏ qua.
  - Sản phẩm [CPH-GIALAI-004] đã tồn tại -> Bỏ qua.
  - Sản phẩm [CPH-LAMDONG-005] đã tồn tại -> Bỏ qua.
  - Sản phẩm [CPB-BMT-001] đã tồn tại -> Bỏ qua.
  - Sản phẩm [CPB-DALAT-002] đã tồn tại -> Bỏ qua.
  - Sản phẩm [CPB-QUANGTRI-003] đã tồn tại -> Bỏ qua.
  - Sản phẩm [CPB-PLEIKU-004] đã tồn tại -> Bỏ qua.
  - Sản phẩm [CPB-KRONG-005] đã tồn tại -> Bỏ qua.
  - Sản phẩm [CPL-SUADA-001] đã tồn tại -> Bỏ qua.
  - Sản phẩm [CPL-DENDA-002] đã tồn tại -> Bỏ qua.
  - Sản phẩm [CPL-COLDBREW-003] đã tồn tại -> Bỏ qua.
  - Sản phẩm [CPL-LATTE-004] đã tồn tại -> Bỏ qua.
  - Sản phẩm [CPHT-3IN1-001] đã tồn tại -> Bỏ qua.
  - Sản phẩm [CPHT-DRIP-002] đã tồn tại -> Bỏ qua.
  - Sản phẩm [CPHT-BLACK-003] đã tồn tại -> Bỏ qua.
  - Sản phẩm [CPHT-DRIP-004] đã tồn tại -> Bỏ qua.
  + Đã tạo sản phẩm [DRK-ESP-001]: "Espresso (Nóng)"
    └ Tự động tạo bản ghi Kho (Tồn: 50 Ly, Ngưỡng: 10)
  + Đã tạo sản phẩm [DRK-AME-002]: "Americano (Đá)"
    └ Tự động tạo bản ghi Kho (Tồn: 50 Ly, Ngưỡng: 10)
  + Đã tạo sản phẩm [DRK-LAT-003]: "Latte (Nóng)"
    └ Tự động tạo bản ghi Kho (Tồn: 50 Ly, Ngưỡng: 10)
  + Đã tạo sản phẩm [DRK-CAP-004]: "Cappuccino (Nóng)"
    └ Tự động tạo bản ghi Kho (Tồn: 50 Ly, Ngưỡng: 10)
  + Đã tạo sản phẩm [DRK-MOC-005]: "Mocha (Đá)"
    └ Tự động tạo bản ghi Kho (Tồn: 50 Ly, Ngưỡng: 10)
  + Đã tạo sản phẩm [DRK-MAC-006]: "Caramel Macchiato"
    └ Tự động tạo bản ghi Kho (Tồn: 50 Ly, Ngưỡng: 10)
  + Đã tạo sản phẩm [DRK-CLB-007]: "Cold Brew Trái Cây"
    └ Tự động tạo bản ghi Kho (Tồn: 50 Ly, Ngưỡng: 10)
  + Đã tạo sản phẩm [TEA-PEA-001]: "Trà Đào Cam Sả"
    └ Tự động tạo bản ghi Kho (Tồn: 50 Ly, Ngưỡng: 10)
  + Đã tạo sản phẩm [BAK-CRO-001]: "Bánh Sừng Bò (Croissant)"
    └ Tự động tạo bản ghi Kho (Tồn: 50 Cái, Ngưỡng: 10)
  + Đã tạo sản phẩm [BAK-TIR-002]: "Bánh Tiramisu"
    └ Tự động tạo bản ghi Kho (Tồn: 50 Phần, Ngưỡng: 10)

==================================================
🎉 HOÀN THÀNH SEED DỮ LIỆU CÀ PHÊ THẬT:
- Tổng sản phẩm đã nạp: 10/28
==================================================
==================================================
🚀 CÀ PHÊ PROJECT - SEED DATA RUN
📌 CHẾ ĐỘ: 🔥 CẬP NHẬT THẬT VÀO DATABASE
⏰ Thời gian: 14:04:11 12/8/2026
🔌 Database Target: postgresql://postgres:cafe123456@localhost:5433/cafedb
==================================================

📂 Đã nạp từ file:
  - categories.json : 5 danh mục
  - products.json   : 25 sản phẩm

--------------------------------------------------
1️⃣ DANH SÁCH DANH MỤC SẼ TẠO:
--------------------------------------------------

--------------------------------------------------
2️⃣ DANH SÁCH SẢN PHẨM CÀ PHÊ THẬT SẼ TẠO:
--------------------------------------------------

⚡ ĐANG THỰC HIỆN NẠP DỮ LIỆU THẬT VÀO DATABASE...

[1/3] Nạp Người Dùng...
  - Tồn tại người dùng: "admin@cafe.com" (ADMIN) -> Bỏ qua.
  - Tồn tại người dùng: "staff@cafe.com" (STAFF) -> Bỏ qua.
  - Tồn tại người dùng: "customer@cafe.com" (CUSTOMER) -> Bỏ qua.

[2/3] Nạp Danh Mục Cà Phê...
  - Đã có danh mục: "Cà phê hạt" (ID: cms6enomm0003ul3kx18eac26)
  - Đã có danh mục: "Cà phê bột" (ID: cms6enoms0004ul3ka1pwh27d)
  - Đã có danh mục: "Cà phê lon" (ID: cms6enomv0005ul3k9r6711m9)
  - Đã có danh mục: "Cà phê hòa tan & túi lọc" (ID: cms6enomz0006ul3k9nq684ui)
  - Đã có danh mục: "Thức uống pha chế" (ID: cmspqpyxz0000ul8w1kb6mpi3)

[3/3] Nạp Sản Phẩm & Khởi Tạo Kho...
  - Sản phẩm [CPH-DALAT-001] đã tồn tại -> Bỏ qua.
  - Sản phẩm [CPH-BMT-002] đã tồn tại -> Bỏ qua.
  - Sản phẩm [CPH-SONLA-003] đã tồn tại -> Bỏ qua.
  - Sản phẩm [CPH-GIALAI-004] đã tồn tại -> Bỏ qua.
  - Sản phẩm [CPH-LAMDONG-005] đã tồn tại -> Bỏ qua.
  - Sản phẩm [CPB-BMT-001] đã tồn tại -> Bỏ qua.
  - Sản phẩm [CPB-DALAT-002] đã tồn tại -> Bỏ qua.
  - Sản phẩm [CPB-QUANGTRI-003] đã tồn tại -> Bỏ qua.
  - Sản phẩm [CPB-PLEIKU-004] đã tồn tại -> Bỏ qua.
  - Sản phẩm [CPB-KRONG-005] đã tồn tại -> Bỏ qua.
  - Sản phẩm [CPL-SUADA-001] đã tồn tại -> Bỏ qua.
  - Sản phẩm [CPL-DENDA-002] đã tồn tại -> Bỏ qua.
  - Sản phẩm [CPL-COLDBREW-003] đã tồn tại -> Bỏ qua.
  - Sản phẩm [CPL-LATTE-004] đã tồn tại -> Bỏ qua.
  - Sản phẩm [CPHT-3IN1-001] đã tồn tại -> Bỏ qua.
  - Sản phẩm [CPHT-DRIP-002] đã tồn tại -> Bỏ qua.
  - Sản phẩm [CPHT-BLACK-003] đã tồn tại -> Bỏ qua.
  - Sản phẩm [CPHT-DRIP-004] đã tồn tại -> Bỏ qua.
  - Sản phẩm [DRK-ESP-001] đã tồn tại -> Bỏ qua.
  - Sản phẩm [DRK-AME-002] đã tồn tại -> Bỏ qua.
  - Sản phẩm [DRK-LAT-003] đã tồn tại -> Bỏ qua.
  - Sản phẩm [DRK-CAP-004] đã tồn tại -> Bỏ qua.
  - Sản phẩm [DRK-MOC-005] đã tồn tại -> Bỏ qua.
  - Sản phẩm [DRK-MAC-006] đã tồn tại -> Bỏ qua.
  - Sản phẩm [DRK-CLB-007] đã tồn tại -> Bỏ qua.

==================================================
🎉 HOÀN THÀNH SEED DỮ LIỆU CÀ PHÊ THẬT:
- Tổng sản phẩm đã nạp: 0/25
==================================================
==================================================
🚀 CÀ PHÊ PROJECT - SEED DATA RUN
📌 CHẾ ĐỘ: 🔥 CẬP NHẬT THẬT VÀO DATABASE
⏰ Thời gian: 14:09:58 12/8/2026
🔌 Database Target: postgresql://postgres:cafe123456@localhost:5433/cafedb
==================================================

📂 Đã nạp từ file:
  - categories.json : 5 danh mục
  - products.json   : 25 sản phẩm

--------------------------------------------------
1️⃣ DANH SÁCH DANH MỤC SẼ TẠO:
--------------------------------------------------

--------------------------------------------------
2️⃣ DANH SÁCH SẢN PHẨM CÀ PHÊ THẬT SẼ TẠO:
--------------------------------------------------

⚡ ĐANG THỰC HIỆN NẠP DỮ LIỆU THẬT VÀO DATABASE...

[1/3] Nạp Người Dùng...
  - Tồn tại người dùng: "admin@cafe.com" (ADMIN) -> Bỏ qua.
  - Tồn tại người dùng: "staff@cafe.com" (STAFF) -> Bỏ qua.
  - Tồn tại người dùng: "customer@cafe.com" (CUSTOMER) -> Bỏ qua.

[2/3] Nạp Danh Mục Cà Phê...
  - Đã có danh mục: "Cà phê hạt" (ID: cms6enomm0003ul3kx18eac26)
  - Đã có danh mục: "Cà phê bột" (ID: cms6enoms0004ul3ka1pwh27d)
  - Đã có danh mục: "Cà phê lon" (ID: cms6enomv0005ul3k9r6711m9)
  - Đã có danh mục: "Cà phê hòa tan & túi lọc" (ID: cms6enomz0006ul3k9nq684ui)
  - Đã có danh mục: "Thức uống pha chế" (ID: cmspqpyxz0000ul8w1kb6mpi3)

[3/3] Nạp Sản Phẩm & Khởi Tạo Kho...
  - Sản phẩm [CPH-DALAT-001] đã tồn tại -> Bỏ qua.
  - Sản phẩm [CPH-BMT-002] đã tồn tại -> Bỏ qua.
  - Sản phẩm [CPH-SONLA-003] đã tồn tại -> Bỏ qua.
  - Sản phẩm [CPH-GIALAI-004] đã tồn tại -> Bỏ qua.
  - Sản phẩm [CPH-LAMDONG-005] đã tồn tại -> Bỏ qua.
  - Sản phẩm [CPB-BMT-001] đã tồn tại -> Bỏ qua.
  - Sản phẩm [CPB-DALAT-002] đã tồn tại -> Bỏ qua.
  - Sản phẩm [CPB-QUANGTRI-003] đã tồn tại -> Bỏ qua.
  - Sản phẩm [CPB-PLEIKU-004] đã tồn tại -> Bỏ qua.
  - Sản phẩm [CPB-KRONG-005] đã tồn tại -> Bỏ qua.
  - Sản phẩm [CPL-SUADA-001] đã tồn tại -> Bỏ qua.
  - Sản phẩm [CPL-DENDA-002] đã tồn tại -> Bỏ qua.
  - Sản phẩm [CPL-COLDBREW-003] đã tồn tại -> Bỏ qua.
  - Sản phẩm [CPL-LATTE-004] đã tồn tại -> Bỏ qua.
  - Sản phẩm [CPHT-3IN1-001] đã tồn tại -> Bỏ qua.
  - Sản phẩm [CPHT-DRIP-002] đã tồn tại -> Bỏ qua.
  - Sản phẩm [CPHT-BLACK-003] đã tồn tại -> Bỏ qua.
  - Sản phẩm [CPHT-DRIP-004] đã tồn tại -> Bỏ qua.
  - Sản phẩm [DRK-ESP-001] đã tồn tại -> Bỏ qua.
  - Sản phẩm [DRK-AME-002] đã tồn tại -> Bỏ qua.
  - Sản phẩm [DRK-LAT-003] đã tồn tại -> Bỏ qua.
  - Sản phẩm [DRK-CAP-004] đã tồn tại -> Bỏ qua.
  - Sản phẩm [DRK-MOC-005] đã tồn tại -> Bỏ qua.
  - Sản phẩm [DRK-MAC-006] đã tồn tại -> Bỏ qua.
  - Sản phẩm [DRK-CLB-007] đã tồn tại -> Bỏ qua.

==================================================
🎉 HOÀN THÀNH SEED DỮ LIỆU CÀ PHÊ THẬT:
- Tổng sản phẩm đã nạp: 0/25
==================================================
==================================================
🚀 CÀ PHÊ PROJECT - SEED DATA RUN
📌 CHẾ ĐỘ: 🔥 CẬP NHẬT THẬT VÀO DATABASE
⏰ Thời gian: 15:39:59 12/8/2026
🔌 Database Target: postgresql://postgres:cafe123456@localhost:5433/cafedb
==================================================

📂 Đã nạp từ file:
  - categories.json : 5 danh mục
  - products.json   : 25 sản phẩm

--------------------------------------------------
1️⃣ DANH SÁCH DANH MỤC SẼ TẠO:
--------------------------------------------------

--------------------------------------------------
2️⃣ DANH SÁCH SẢN PHẨM CÀ PHÊ THẬT SẼ TẠO:
--------------------------------------------------

⚡ ĐANG THỰC HIỆN NẠP DỮ LIỆU THẬT VÀO DATABASE...

[1/3] Nạp Người Dùng...
  - Tồn tại người dùng: "admin@cafe.com" (ADMIN) -> Bỏ qua.
  - Tồn tại người dùng: "staff@cafe.com" (STAFF) -> Bỏ qua.
  - Tồn tại người dùng: "customer@cafe.com" (CUSTOMER) -> Bỏ qua.

[2/3] Nạp Danh Mục Cà Phê...
  - Đã có danh mục: "Cà phê hạt" (ID: cms6enomm0003ul3kx18eac26)
  - Đã có danh mục: "Cà phê bột" (ID: cms6enoms0004ul3ka1pwh27d)
  - Đã có danh mục: "Cà phê lon" (ID: cms6enomv0005ul3k9r6711m9)
  - Đã có danh mục: "Cà phê hòa tan & túi lọc" (ID: cms6enomz0006ul3k9nq684ui)
  - Đã có danh mục: "Thức uống pha chế" (ID: cmspqpyxz0000ul8w1kb6mpi3)

[3/3] Nạp Sản Phẩm & Khởi Tạo Kho...
  - Sản phẩm [CPH-DALAT-001] đã tồn tại -> Bỏ qua.
  - Sản phẩm [CPH-BMT-002] đã tồn tại -> Bỏ qua.
  - Sản phẩm [CPH-SONLA-003] đã tồn tại -> Bỏ qua.
  - Sản phẩm [CPH-GIALAI-004] đã tồn tại -> Bỏ qua.
  - Sản phẩm [CPH-LAMDONG-005] đã tồn tại -> Bỏ qua.
  - Sản phẩm [CPB-BMT-001] đã tồn tại -> Bỏ qua.
  - Sản phẩm [CPB-DALAT-002] đã tồn tại -> Bỏ qua.
  - Sản phẩm [CPB-QUANGTRI-003] đã tồn tại -> Bỏ qua.
  - Sản phẩm [CPB-PLEIKU-004] đã tồn tại -> Bỏ qua.
  - Sản phẩm [CPB-KRONG-005] đã tồn tại -> Bỏ qua.
  - Sản phẩm [CPL-SUADA-001] đã tồn tại -> Bỏ qua.
  - Sản phẩm [CPL-DENDA-002] đã tồn tại -> Bỏ qua.
  - Sản phẩm [CPL-COLDBREW-003] đã tồn tại -> Bỏ qua.
  - Sản phẩm [CPL-LATTE-004] đã tồn tại -> Bỏ qua.
  - Sản phẩm [CPHT-3IN1-001] đã tồn tại -> Bỏ qua.
  - Sản phẩm [CPHT-DRIP-002] đã tồn tại -> Bỏ qua.
  - Sản phẩm [CPHT-BLACK-003] đã tồn tại -> Bỏ qua.
  - Sản phẩm [CPHT-DRIP-004] đã tồn tại -> Bỏ qua.
  - Sản phẩm [DRK-ESP-001] đã tồn tại -> Bỏ qua.
  - Sản phẩm [DRK-AME-002] đã tồn tại -> Bỏ qua.
  - Sản phẩm [DRK-LAT-003] đã tồn tại -> Bỏ qua.
  - Sản phẩm [DRK-CAP-004] đã tồn tại -> Bỏ qua.
  - Sản phẩm [DRK-MOC-005] đã tồn tại -> Bỏ qua.
  - Sản phẩm [DRK-MAC-006] đã tồn tại -> Bỏ qua.
  - Sản phẩm [DRK-CLB-007] đã tồn tại -> Bỏ qua.

[4/4] Nạp Dữ Liệu Luồng Nghiệp Vụ (Orders, Purchase Requests, Batches)...
  + Đã tạo Order: PENDING / Payment: PENDING
  + Đã tạo Order: PROCESSING / Payment: PAID
  + Đã tạo Order: COMPLETED / Payment: PAID
  + Đã tạo Order: COMPLETED / Payment: PENDING
  + Đã tạo Order: CANCELLED / Payment: FAILED
  + Đã tạo Order: CANCELLED / Payment: REFUNDED
  + Đã tạo PR: PENDING / Payment: UNPAID (AI: true)
  + Đã tạo PR: PENDING / Payment: UNPAID (AI: false)
  + Đã tạo PR: APPROVED / Payment: UNPAID (AI: false)
  + Đã tạo PR: SENT / Payment: UNPAID (AI: false)
  + Đã tạo PR: SENT (Partial Receive) / Payment: UNPAID
  + Đã tạo PR: RECEIVED / Payment: UNPAID (AI: false)
  + Đã tạo PR: COMPLETED / Payment: PAID (AI: false)
  + Đã tạo PR: REJECTED / Payment: UNPAID (AI: false)
  + Đã tạo PR: REJECTED / Payment: UNPAID (AI: false)

==================================================
🎯 TỔNG KẾT WORKFLOW SEED:
- Đơn hàng (Order):
  * PENDING: 1
  * PROCESSING: 1
  * COMPLETED: 2
  * CANCELLED: 2
- Yêu cầu nhập hàng (Purchase Request):
  * PENDING: 2
  * APPROVED: 1
  * SENT: 1
  * SENT (Partial): 1
  * RECEIVED: 1
  * COMPLETED: 1
  * REJECTED: 2
- Lô hàng (Batches):
  * Đã tạo 0 lô hàng EXPIRED để test.
==================================================

==================================================
🎉 HOÀN THÀNH SEED DỮ LIỆU CÀ PHÊ THẬT:
- Tổng sản phẩm đã nạp: 0/25
==================================================
==================================================
🚀 CÀ PHÊ PROJECT - SEED DATA RUN
📌 CHẾ ĐỘ: 🔥 CẬP NHẬT THẬT VÀO DATABASE
⏰ Thời gian: 15:40:45 12/8/2026
🔌 Database Target: postgresql://postgres:cafe123456@localhost:5433/cafedb
==================================================

📂 Đã nạp từ file:
  - categories.json : 5 danh mục
  - products.json   : 25 sản phẩm

--------------------------------------------------
1️⃣ DANH SÁCH DANH MỤC SẼ TẠO:
--------------------------------------------------

--------------------------------------------------
2️⃣ DANH SÁCH SẢN PHẨM CÀ PHÊ THẬT SẼ TẠO:
--------------------------------------------------

⚡ ĐANG THỰC HIỆN NẠP DỮ LIỆU THẬT VÀO DATABASE...

[1/3] Nạp Người Dùng...
  - Tồn tại người dùng: "admin@cafe.com" (ADMIN) -> Bỏ qua.
  - Tồn tại người dùng: "staff@cafe.com" (STAFF) -> Bỏ qua.
  - Tồn tại người dùng: "customer@cafe.com" (CUSTOMER) -> Bỏ qua.

[2/3] Nạp Danh Mục Cà Phê...
  - Đã có danh mục: "Cà phê hạt" (ID: cms6enomm0003ul3kx18eac26)
  - Đã có danh mục: "Cà phê bột" (ID: cms6enoms0004ul3ka1pwh27d)
  - Đã có danh mục: "Cà phê lon" (ID: cms6enomv0005ul3k9r6711m9)
  - Đã có danh mục: "Cà phê hòa tan & túi lọc" (ID: cms6enomz0006ul3k9nq684ui)
  - Đã có danh mục: "Thức uống pha chế" (ID: cmspqpyxz0000ul8w1kb6mpi3)

[3/3] Nạp Sản Phẩm & Khởi Tạo Kho...
  - Sản phẩm [CPH-DALAT-001] đã tồn tại -> Bỏ qua.
  - Sản phẩm [CPH-BMT-002] đã tồn tại -> Bỏ qua.
  - Sản phẩm [CPH-SONLA-003] đã tồn tại -> Bỏ qua.
  - Sản phẩm [CPH-GIALAI-004] đã tồn tại -> Bỏ qua.
  - Sản phẩm [CPH-LAMDONG-005] đã tồn tại -> Bỏ qua.
  - Sản phẩm [CPB-BMT-001] đã tồn tại -> Bỏ qua.
  - Sản phẩm [CPB-DALAT-002] đã tồn tại -> Bỏ qua.
  - Sản phẩm [CPB-QUANGTRI-003] đã tồn tại -> Bỏ qua.
  - Sản phẩm [CPB-PLEIKU-004] đã tồn tại -> Bỏ qua.
  - Sản phẩm [CPB-KRONG-005] đã tồn tại -> Bỏ qua.
  - Sản phẩm [CPL-SUADA-001] đã tồn tại -> Bỏ qua.
  - Sản phẩm [CPL-DENDA-002] đã tồn tại -> Bỏ qua.
  - Sản phẩm [CPL-COLDBREW-003] đã tồn tại -> Bỏ qua.
  - Sản phẩm [CPL-LATTE-004] đã tồn tại -> Bỏ qua.
  - Sản phẩm [CPHT-3IN1-001] đã tồn tại -> Bỏ qua.
  - Sản phẩm [CPHT-DRIP-002] đã tồn tại -> Bỏ qua.
  - Sản phẩm [CPHT-BLACK-003] đã tồn tại -> Bỏ qua.
  - Sản phẩm [CPHT-DRIP-004] đã tồn tại -> Bỏ qua.
  - Sản phẩm [DRK-ESP-001] đã tồn tại -> Bỏ qua.
  - Sản phẩm [DRK-AME-002] đã tồn tại -> Bỏ qua.
  - Sản phẩm [DRK-LAT-003] đã tồn tại -> Bỏ qua.
  - Sản phẩm [DRK-CAP-004] đã tồn tại -> Bỏ qua.
  - Sản phẩm [DRK-MOC-005] đã tồn tại -> Bỏ qua.
  - Sản phẩm [DRK-MAC-006] đã tồn tại -> Bỏ qua.
  - Sản phẩm [DRK-CLB-007] đã tồn tại -> Bỏ qua.

[4/4] Nạp Dữ Liệu Luồng Nghiệp Vụ (Orders, Purchase Requests, Batches)...
  + Đã tạo Order: PENDING / Payment: PENDING
  + Đã tạo Order: PROCESSING / Payment: PAID
  + Đã tạo Order: COMPLETED / Payment: PAID
  + Đã tạo Order: COMPLETED / Payment: PENDING
  + Đã tạo Order: CANCELLED / Payment: FAILED
  + Đã tạo Order: CANCELLED / Payment: REFUNDED
  + Đã tạo PR: PENDING / Payment: UNPAID (AI: true)
  + Đã tạo PR: PENDING / Payment: UNPAID (AI: false)
  + Đã tạo PR: APPROVED / Payment: UNPAID (AI: false)
  + Đã tạo PR: SENT / Payment: UNPAID (AI: false)
  + Đã tạo PR: SENT (Partial Receive) / Payment: UNPAID
  + Đã tạo PR: RECEIVED / Payment: UNPAID (AI: false)
  + Đã tạo PR: COMPLETED / Payment: PAID (AI: false)
  + Đã tạo PR: REJECTED / Payment: UNPAID (AI: false)
  + Đã tạo PR: REJECTED / Payment: UNPAID (AI: false)

==================================================
🎯 TỔNG KẾT WORKFLOW SEED:
- Đơn hàng (Order):
  * PENDING: 1
  * PROCESSING: 1
  * COMPLETED: 2
  * CANCELLED: 2
- Yêu cầu nhập hàng (Purchase Request):
  * PENDING: 2
  * APPROVED: 1
  * SENT: 1
  * SENT (Partial): 1
  * RECEIVED: 1
  * COMPLETED: 1
  * REJECTED: 2
- Lô hàng (Batches):
  * Đã tạo 0 lô hàng EXPIRED để test.
- Sản phẩm được tham chiếu (Re-used existing products):
  * CPH-DALAT-001 - Cà Phê Hạt Arabica Cầu Đất Đà Lạt Premium 500g
  * CPH-BMT-002 - Cà Phê Hạt Robusta Buôn Ma Thuột Nguyên Chất 500g
==================================================

==================================================
🎉 HOÀN THÀNH SEED DỮ LIỆU CÀ PHÊ THẬT:
- Tổng sản phẩm đã nạp: 0/25
==================================================
==================================================
🚀 CÀ PHÊ PROJECT - SEED DATA RUN
📌 CHẾ ĐỘ: 🔥 CẬP NHẬT THẬT VÀO DATABASE
⏰ Thời gian: 15:44:07 12/8/2026
🔌 Database Target: postgresql://postgres:cafe123456@localhost:5433/cafedb
==================================================

📂 Đã nạp từ file:
  - categories.json : 5 danh mục
  - products.json   : 25 sản phẩm

--------------------------------------------------
1️⃣ DANH SÁCH DANH MỤC SẼ TẠO:
--------------------------------------------------

--------------------------------------------------
2️⃣ DANH SÁCH SẢN PHẨM CÀ PHÊ THẬT SẼ TẠO:
--------------------------------------------------

⚡ ĐANG THỰC HIỆN NẠP DỮ LIỆU THẬT VÀO DATABASE...

[1/3] Nạp Người Dùng...
  - Tồn tại người dùng: "admin@cafe.com" (ADMIN) -> Bỏ qua.
  - Tồn tại người dùng: "staff@cafe.com" (STAFF) -> Bỏ qua.
  - Tồn tại người dùng: "customer@cafe.com" (CUSTOMER) -> Bỏ qua.

[2/3] Nạp Danh Mục Cà Phê...
  - Đã có danh mục: "Cà phê hạt" (ID: cms6enomm0003ul3kx18eac26)
  - Đã có danh mục: "Cà phê bột" (ID: cms6enoms0004ul3ka1pwh27d)
  - Đã có danh mục: "Cà phê lon" (ID: cms6enomv0005ul3k9r6711m9)
  - Đã có danh mục: "Cà phê hòa tan & túi lọc" (ID: cms6enomz0006ul3k9nq684ui)
  - Đã có danh mục: "Thức uống pha chế" (ID: cmspqpyxz0000ul8w1kb6mpi3)

[3/3] Nạp Sản Phẩm & Khởi Tạo Kho...
  - Sản phẩm [CPH-DALAT-001] đã tồn tại -> Bỏ qua.
  - Sản phẩm [CPH-BMT-002] đã tồn tại -> Bỏ qua.
  - Sản phẩm [CPH-SONLA-003] đã tồn tại -> Bỏ qua.
  - Sản phẩm [CPH-GIALAI-004] đã tồn tại -> Bỏ qua.
  - Sản phẩm [CPH-LAMDONG-005] đã tồn tại -> Bỏ qua.
  - Sản phẩm [CPB-BMT-001] đã tồn tại -> Bỏ qua.
  - Sản phẩm [CPB-DALAT-002] đã tồn tại -> Bỏ qua.
  - Sản phẩm [CPB-QUANGTRI-003] đã tồn tại -> Bỏ qua.
  - Sản phẩm [CPB-PLEIKU-004] đã tồn tại -> Bỏ qua.
  - Sản phẩm [CPB-KRONG-005] đã tồn tại -> Bỏ qua.
  - Sản phẩm [CPL-SUADA-001] đã tồn tại -> Bỏ qua.
  - Sản phẩm [CPL-DENDA-002] đã tồn tại -> Bỏ qua.
  - Sản phẩm [CPL-COLDBREW-003] đã tồn tại -> Bỏ qua.
  - Sản phẩm [CPL-LATTE-004] đã tồn tại -> Bỏ qua.
  - Sản phẩm [CPHT-3IN1-001] đã tồn tại -> Bỏ qua.
  - Sản phẩm [CPHT-DRIP-002] đã tồn tại -> Bỏ qua.
  - Sản phẩm [CPHT-BLACK-003] đã tồn tại -> Bỏ qua.
  - Sản phẩm [CPHT-DRIP-004] đã tồn tại -> Bỏ qua.
  - Sản phẩm [DRK-ESP-001] đã tồn tại -> Bỏ qua.
  - Sản phẩm [DRK-AME-002] đã tồn tại -> Bỏ qua.
  - Sản phẩm [DRK-LAT-003] đã tồn tại -> Bỏ qua.
  - Sản phẩm [DRK-CAP-004] đã tồn tại -> Bỏ qua.
  - Sản phẩm [DRK-MOC-005] đã tồn tại -> Bỏ qua.
  - Sản phẩm [DRK-MAC-006] đã tồn tại -> Bỏ qua.
  - Sản phẩm [DRK-CLB-007] đã tồn tại -> Bỏ qua.

[4/4] Nạp Dữ Liệu Luồng Nghiệp Vụ (Orders, Purchase Requests, Batches)...
  + Đã tạo Order: PENDING / Payment: PENDING
  + Đã tạo Order: PROCESSING / Payment: PAID
  + Đã tạo Order: COMPLETED / Payment: PAID
  + Đã tạo Order: COMPLETED / Payment: PENDING
  + Đã tạo Order: CANCELLED / Payment: FAILED
  + Đã tạo Order: CANCELLED / Payment: REFUNDED
  + Đã tạo PR: PENDING / Payment: UNPAID (AI: true)
  + Đã tạo PR: PENDING / Payment: UNPAID (AI: false)
  + Đã tạo PR: APPROVED / Payment: UNPAID (AI: false)
  + Đã tạo PR: SENT / Payment: UNPAID (AI: false)
  + Đã tạo PR: SENT (Partial Receive) / Payment: UNPAID
  + Đã tạo PR: RECEIVED / Payment: UNPAID (AI: false)
  + Đã tạo PR: COMPLETED / Payment: PAID (AI: false)
  + Đã tạo PR: REJECTED / Payment: UNPAID (AI: false)
  + Đã tạo PR: REJECTED / Payment: UNPAID (AI: false)

==================================================
🎯 TỔNG KẾT WORKFLOW SEED:
- Đơn hàng (Order):
  * PENDING: 1
  * PROCESSING: 1
  * COMPLETED: 2
  * CANCELLED: 2
- Yêu cầu nhập hàng (Purchase Request):
  * PENDING: 2
  * APPROVED: 1
  * SENT: 1
  * SENT (Partial): 1
  * RECEIVED: 1
  * COMPLETED: 1
  * REJECTED: 2
- Lô hàng (Batches):
  * Đã tạo 0 lô hàng EXPIRED để test.
- Sản phẩm được tham chiếu (Re-used existing products):
  * CPH-DALAT-001 - Cà Phê Hạt Arabica Cầu Đất Đà Lạt Premium 500g
  * CPH-BMT-002 - Cà Phê Hạt Robusta Buôn Ma Thuột Nguyên Chất 500g
==================================================

==================================================
🎉 HOÀN THÀNH SEED DỮ LIỆU CÀ PHÊ THẬT:
- Tổng sản phẩm đã nạp: 0/25
==================================================
==================================================
🚀 CÀ PHÊ PROJECT - SEED DATA RUN
📌 CHẾ ĐỘ: 🔥 CẬP NHẬT THẬT VÀO DATABASE
⏰ Thời gian: 15:46:46 12/8/2026
🔌 Database Target: postgresql://postgres:cafe123456@localhost:5433/cafedb
==================================================

📂 Đã nạp từ file:
  - categories.json : 5 danh mục
  - products.json   : 25 sản phẩm

--------------------------------------------------
1️⃣ DANH SÁCH DANH MỤC SẼ TẠO:
--------------------------------------------------

--------------------------------------------------
2️⃣ DANH SÁCH SẢN PHẨM CÀ PHÊ THẬT SẼ TẠO:
--------------------------------------------------

⚡ ĐANG THỰC HIỆN NẠP DỮ LIỆU THẬT VÀO DATABASE...

[1/3] Nạp Người Dùng...
  - Tồn tại người dùng: "admin@cafe.com" (ADMIN) -> Bỏ qua.
  - Tồn tại người dùng: "staff@cafe.com" (STAFF) -> Bỏ qua.
  - Tồn tại người dùng: "customer@cafe.com" (CUSTOMER) -> Bỏ qua.

[2/3] Nạp Danh Mục Cà Phê...
  - Đã có danh mục: "Cà phê hạt" (ID: cms6enomm0003ul3kx18eac26)
  - Đã có danh mục: "Cà phê bột" (ID: cms6enoms0004ul3ka1pwh27d)
  - Đã có danh mục: "Cà phê lon" (ID: cms6enomv0005ul3k9r6711m9)
  - Đã có danh mục: "Cà phê hòa tan & túi lọc" (ID: cms6enomz0006ul3k9nq684ui)
  - Đã có danh mục: "Thức uống pha chế" (ID: cmspqpyxz0000ul8w1kb6mpi3)

[3/3] Nạp Sản Phẩm & Khởi Tạo Kho...
  - Sản phẩm [CPH-DALAT-001] đã tồn tại -> Bỏ qua.
  - Sản phẩm [CPH-BMT-002] đã tồn tại -> Bỏ qua.
  - Sản phẩm [CPH-SONLA-003] đã tồn tại -> Bỏ qua.
  - Sản phẩm [CPH-GIALAI-004] đã tồn tại -> Bỏ qua.
  - Sản phẩm [CPH-LAMDONG-005] đã tồn tại -> Bỏ qua.
  - Sản phẩm [CPB-BMT-001] đã tồn tại -> Bỏ qua.
  - Sản phẩm [CPB-DALAT-002] đã tồn tại -> Bỏ qua.
  - Sản phẩm [CPB-QUANGTRI-003] đã tồn tại -> Bỏ qua.
  - Sản phẩm [CPB-PLEIKU-004] đã tồn tại -> Bỏ qua.
  - Sản phẩm [CPB-KRONG-005] đã tồn tại -> Bỏ qua.
  - Sản phẩm [CPL-SUADA-001] đã tồn tại -> Bỏ qua.
  - Sản phẩm [CPL-DENDA-002] đã tồn tại -> Bỏ qua.
  - Sản phẩm [CPL-COLDBREW-003] đã tồn tại -> Bỏ qua.
  - Sản phẩm [CPL-LATTE-004] đã tồn tại -> Bỏ qua.
  - Sản phẩm [CPHT-3IN1-001] đã tồn tại -> Bỏ qua.
  - Sản phẩm [CPHT-DRIP-002] đã tồn tại -> Bỏ qua.
  - Sản phẩm [CPHT-BLACK-003] đã tồn tại -> Bỏ qua.
  - Sản phẩm [CPHT-DRIP-004] đã tồn tại -> Bỏ qua.
  - Sản phẩm [DRK-ESP-001] đã tồn tại -> Bỏ qua.
  - Sản phẩm [DRK-AME-002] đã tồn tại -> Bỏ qua.
  - Sản phẩm [DRK-LAT-003] đã tồn tại -> Bỏ qua.
  - Sản phẩm [DRK-CAP-004] đã tồn tại -> Bỏ qua.
  - Sản phẩm [DRK-MOC-005] đã tồn tại -> Bỏ qua.
  - Sản phẩm [DRK-MAC-006] đã tồn tại -> Bỏ qua.
  - Sản phẩm [DRK-CLB-007] đã tồn tại -> Bỏ qua.

[4/4] Nạp Dữ Liệu Luồng Nghiệp Vụ (Orders, Purchase Requests, Batches)...
  + Đã tạo Order: PENDING / Payment: PENDING
  + Đã tạo Order: PROCESSING / Payment: PAID
  + Đã tạo Order: COMPLETED / Payment: PAID
  + Đã tạo Order: COMPLETED / Payment: PENDING
  + Đã tạo Order: CANCELLED / Payment: FAILED
  + Đã tạo Order: CANCELLED / Payment: REFUNDED
  + Đã tạo PR: PENDING / Payment: UNPAID (AI: true)
  + Đã tạo PR: PENDING / Payment: UNPAID (AI: false)
  + Đã tạo PR: APPROVED / Payment: UNPAID (AI: false)
  + Đã tạo PR: SENT / Payment: UNPAID (AI: false)
  + Đã tạo PR: SENT (Partial Receive) / Payment: UNPAID
  + Đã tạo PR: RECEIVED / Payment: UNPAID (AI: false)
  + Đã tạo PR: COMPLETED / Payment: PAID (AI: false)
  + Đã tạo PR: REJECTED / Payment: UNPAID (AI: false)
  + Đã tạo PR: REJECTED / Payment: UNPAID (AI: false)

==================================================
🎯 TỔNG KẾT WORKFLOW SEED:
- Đơn hàng (Order):
  * PENDING: 1
  * PROCESSING: 1
  * COMPLETED: 2
  * CANCELLED: 2
- Yêu cầu nhập hàng (Purchase Request):
  * PENDING: 2
  * APPROVED: 1
  * SENT: 1
  * SENT (Partial): 1
  * RECEIVED: 1
  * COMPLETED: 1
  * REJECTED: 2
- Lô hàng (Batches):
  * Đã tạo 0 lô hàng EXPIRED để test.
- Sản phẩm được tham chiếu (Re-used existing products):
  * CPH-DALAT-001 - Cà Phê Hạt Arabica Cầu Đất Đà Lạt Premium 500g
  * CPH-BMT-002 - Cà Phê Hạt Robusta Buôn Ma Thuột Nguyên Chất 500g
==================================================

==================================================
🎉 HOÀN THÀNH SEED DỮ LIỆU CÀ PHÊ THẬT:
- Tổng sản phẩm đã nạp: 0/25
==================================================
==================================================
🚀 CÀ PHÊ PROJECT - SEED DATA RUN
📌 CHẾ ĐỘ: 🔥 CẬP NHẬT THẬT VÀO DATABASE
⏰ Thời gian: 16:06:11 12/8/2026
🔌 Database Target: postgresql://postgres:cafe123456@localhost:5433/cafedb
==================================================

📂 Đã nạp từ file:
  - categories.json : 5 danh mục
  - products.json   : 25 sản phẩm

--------------------------------------------------
1️⃣ DANH SÁCH DANH MỤC SẼ TẠO:
--------------------------------------------------

--------------------------------------------------
2️⃣ DANH SÁCH SẢN PHẨM CÀ PHÊ THẬT SẼ TẠO:
--------------------------------------------------

⚡ ĐANG THỰC HIỆN NẠP DỮ LIỆU THẬT VÀO DATABASE...

[1/3] Nạp Người Dùng...
  - Tồn tại người dùng: "admin@cafe.com" (ADMIN) -> Bỏ qua.
  - Tồn tại người dùng: "staff@cafe.com" (STAFF) -> Bỏ qua.
  - Tồn tại người dùng: "customer@cafe.com" (CUSTOMER) -> Bỏ qua.

[2/3] Nạp Danh Mục Cà Phê...
  - Đã có danh mục: "Cà phê hạt" (ID: cms6enomm0003ul3kx18eac26)
  - Đã có danh mục: "Cà phê bột" (ID: cms6enoms0004ul3ka1pwh27d)
  - Đã có danh mục: "Cà phê lon" (ID: cms6enomv0005ul3k9r6711m9)
  - Đã có danh mục: "Cà phê hòa tan & túi lọc" (ID: cms6enomz0006ul3k9nq684ui)
  - Đã có danh mục: "Thức uống pha chế" (ID: cmspqpyxz0000ul8w1kb6mpi3)

[3/3] Nạp Sản Phẩm & Khởi Tạo Kho...
  - Sản phẩm [CPH-DALAT-001] đã tồn tại -> Bỏ qua.
  - Sản phẩm [CPH-BMT-002] đã tồn tại -> Bỏ qua.
  - Sản phẩm [CPH-SONLA-003] đã tồn tại -> Bỏ qua.
  - Sản phẩm [CPH-GIALAI-004] đã tồn tại -> Bỏ qua.
  - Sản phẩm [CPH-LAMDONG-005] đã tồn tại -> Bỏ qua.
  - Sản phẩm [CPB-BMT-001] đã tồn tại -> Bỏ qua.
  - Sản phẩm [CPB-DALAT-002] đã tồn tại -> Bỏ qua.
  - Sản phẩm [CPB-QUANGTRI-003] đã tồn tại -> Bỏ qua.
  - Sản phẩm [CPB-PLEIKU-004] đã tồn tại -> Bỏ qua.
  - Sản phẩm [CPB-KRONG-005] đã tồn tại -> Bỏ qua.
  - Sản phẩm [CPL-SUADA-001] đã tồn tại -> Bỏ qua.
  - Sản phẩm [CPL-DENDA-002] đã tồn tại -> Bỏ qua.
  - Sản phẩm [CPL-COLDBREW-003] đã tồn tại -> Bỏ qua.
  - Sản phẩm [CPL-LATTE-004] đã tồn tại -> Bỏ qua.
  - Sản phẩm [CPHT-3IN1-001] đã tồn tại -> Bỏ qua.
  - Sản phẩm [CPHT-DRIP-002] đã tồn tại -> Bỏ qua.
  - Sản phẩm [CPHT-BLACK-003] đã tồn tại -> Bỏ qua.
  - Sản phẩm [CPHT-DRIP-004] đã tồn tại -> Bỏ qua.
  - Sản phẩm [DRK-ESP-001] đã tồn tại -> Bỏ qua.
  - Sản phẩm [DRK-AME-002] đã tồn tại -> Bỏ qua.
  - Sản phẩm [DRK-LAT-003] đã tồn tại -> Bỏ qua.
  - Sản phẩm [DRK-CAP-004] đã tồn tại -> Bỏ qua.
  - Sản phẩm [DRK-MOC-005] đã tồn tại -> Bỏ qua.
  - Sản phẩm [DRK-MAC-006] đã tồn tại -> Bỏ qua.
  - Sản phẩm [DRK-CLB-007] đã tồn tại -> Bỏ qua.

[4/4] Nạp Dữ Liệu Luồng Nghiệp Vụ (Orders, Purchase Requests, Batches)...
  + Đã tạo Order: PENDING / Payment: PENDING
  + Đã tạo Order: PROCESSING / Payment: PAID
  + Đã tạo Order: COMPLETED / Payment: PAID
  + Đã tạo Order: COMPLETED / Payment: PENDING
  + Đã tạo Order: CANCELLED / Payment: FAILED
  + Đã tạo Order: CANCELLED / Payment: REFUNDED
  + Đã tạo PR: PENDING / Payment: UNPAID (AI: true)
  + Đã tạo PR: PENDING / Payment: UNPAID (AI: false)
  + Đã tạo PR: APPROVED / Payment: UNPAID (AI: false)
  + Đã tạo PR: SENT / Payment: UNPAID (AI: false)
  + Đã tạo PR: SENT (Partial Receive) / Payment: UNPAID
  + Đã tạo PR: RECEIVED / Payment: UNPAID (AI: false)
  + Đã tạo PR: COMPLETED / Payment: PAID (AI: false)
  + Đã tạo PR: REJECTED / Payment: UNPAID (AI: false)
  + Đã tạo PR: REJECTED / Payment: UNPAID (AI: false)

==================================================
🎯 TỔNG KẾT WORKFLOW SEED:
- Đơn hàng (Order):
  * PENDING: 1
  * PROCESSING: 1
  * COMPLETED: 2
  * CANCELLED: 2
- Yêu cầu nhập hàng (Purchase Request):
  * PENDING: 2
  * APPROVED: 1
  * SENT: 1
  * SENT (Partial): 1
  * RECEIVED: 1
  * COMPLETED: 1
  * REJECTED: 2
- Lô hàng (Batches):
  * Đã tạo 0 lô hàng EXPIRED để test.
- Sản phẩm được tham chiếu (Re-used existing products):
  * CPH-DALAT-001 - Cà Phê Hạt Arabica Cầu Đất Đà Lạt Premium 500g
  * CPH-BMT-002 - Cà Phê Hạt Robusta Buôn Ma Thuột Nguyên Chất 500g
==================================================

==================================================
🎉 HOÀN THÀNH SEED DỮ LIỆU CÀ PHÊ THẬT:
- Tổng sản phẩm đã nạp: 0/25
==================================================
