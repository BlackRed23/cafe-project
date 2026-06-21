# Merge Branch Scan Log

## Thời gian scan

* Date: 2026-06-18 16:34:07 +07:00
* Current branch: feature/postgresql-prisma

## 1. Trạng thái Git

* Working tree: Clean trước khi ghi log scan; sau scan chỉ có file log này được tạo/cập nhật theo yêu cầu.
* Ahead/behind: `feature/postgresql-prisma` đang track `origin/feature/postgresql-prisma`, không thấy ahead/behind trong `git status --short --branch`. So với `origin/main`, nhánh hiện tại ahead 2 commit, behind 0 commit.
* Remote: `origin` = `https://github.com/BlackRed23/cafe-project.git`
* Commit gần nhất:
  * `137a74c Fix order display and user notification`
  * `573e768 feat: hoan thien gio hang + thanh toan + tich hop postgresql`
  * `edad920 dev git`

## 2. Tổng quan dự án

* Frontend: React + TypeScript + Vite trong `apps/web`, dùng Axios, React Router, Tailwind/PostCSS, ESLint.
* Backend: Express + TypeScript trong `apps/api`, module auth/product/category/inventory/order/payment/purchase/supplier/dashboard/upload/agent.
* Database: Prisma trong `packages/database`, datasource PostgreSQL, schema tách nhiều file trong `packages/database/prisma/schema`, có seed `packages/database/prisma/seed.ts`.
* Deploy/CI: Không thấy Dockerfile, docker-compose, `.github/workflows` được track trong nhánh hiện tại. Monorepo dùng npm workspaces và Turbo.

## 3. Thay đổi chính của nhánh hiện tại

* Nhóm file thay đổi:
  * UI/frontend: cập nhật `apps/web/src/App.tsx`, các API client, nhiều trang admin/customer, thêm `NotificationPanel`, `ToastContext`, `AdminNotificationsPage`, sửa `vite.config.ts`.
  * Backend/API: sửa `apps/api/src/index.ts`, module order, thêm module user controller/route/service/validator.
  * Database/schema: sửa `packages/database/prisma/schema/order.prisma`.
  * Config/env: thêm `apps/api/.env.example`, `apps/web/.env.example`, thêm thư mục `env test/`.
  * Docker/deploy/CI: không thấy thay đổi.
  * Package/dependency: không có diff ở `package.json`, `package-lock.json`, hoặc package workspace chính khi so với `origin/main`.
  * Test/log/report: thêm `env test/env-agent.txt`, `env test/env-backend.txt`, `env test/env-database.txt`, `env test/env-web.txt`; đây giống file môi trường kiểm thử hơn là source code.
* Mục đích thay đổi: tích hợp frontend dùng API thật thay mock (`USE_MOCK=false`, baseURL `/api`), thêm proxy Vite tới backend, bổ sung notification/toast admin, chỉnh flow order/payment/shipping, thêm API quản lý user, cập nhật schema order để lưu thông tin giao hàng và note.
* File quan trọng liên quan:
  * `apps/web/src/api/client.ts`
  * `apps/web/src/api/orders.api.ts`
  * `apps/web/vite.config.ts`
  * `apps/api/src/index.ts`
  * `apps/api/src/modules/order/order.repository.ts`
  * `apps/api/src/modules/order/order.service.ts`
  * `apps/api/src/modules/user/*`
  * `packages/database/prisma/schema/order.prisma`

## 4. Rủi ro khi merge

* Conflict risk: Cao nếu merge vào local `main`, vì local `main` đang ahead `origin/main` 2 commit và thay đổi trùng nhiều file: `apps/api/src/index.ts`, `apps/api/src/modules/order/order.service.ts`, `apps/web/src/api/client.ts`, `orders.api.ts`, `auth.api.ts`, `categories.api.ts`, `products.api.ts`, `Header.tsx`, nhiều trang admin và `AppRoutes.tsx`. Trung bình nếu merge vào `origin/main` hiện tại vì nhánh chỉ ahead 2 commit từ cùng merge-base `edad920`.
* Dependency risk: Thấp trên nhánh này vì không đổi manifest/lockfile so với `origin/main`. Tuy nhiên local `main` có thay đổi `apps/api/package.json`, nên khi merge vào local `main` cần kiểm tra dependency lại.
* API risk: Cao. Frontend chuyển từ mock sang API thật và đổi response mapping dạng `response.data.data.*`; order endpoint đổi `/orders/my` sang `/orders/me` và update status dùng `PATCH /orders/:id/status`. Module user mới được thêm nhưng chưa thấy đăng ký route `/api/users` trong `apps/api/src/index.ts`, có thể làm trang admin users không gọi được backend.
* Database risk: Trung bình đến cao. `order.prisma` bỏ enum payment method `CARD`, `E_WALLET`, thêm `shippingName`, `shippingPhone`, `shippingAddress`, `note` vào `Order`. Không thấy migration file, dự án dùng Prisma `db:push`; cần kiểm tra dữ liệu cũ/payment method hiện có trước khi áp schema.
* Deploy risk: Trung bình. CORS backend đang hard-code localhost origins; frontend dùng `/api` và Vite proxy chỉ áp dụng dev server. Production deploy cần reverse proxy hoặc cấu hình base URL tương ứng. Không thấy Docker/CI để bảo vệ build/test tự động.

## 5. Khuyến nghị trước khi merge

* Việc cần làm trước khi merge:
  * Commit file log này nếu muốn giữ lịch sử scan; ngoài file log, working tree trước scan đang clean.
  * Quyết định target merge: `origin/main` hay local `main`. Local `main` có 2 commit riêng (`4b596a3`, `150005e`) và rất nhiều thay đổi, nên không nên coi local `main` giống remote main.
  * Kiểm tra/đăng ký route user nếu frontend cần `/api/users`.
  * Kiểm tra API contract cho auth/categories/products/orders vì frontend đang vừa có endpoint trả trực tiếp `response.data`, vừa có endpoint đọc `response.data.data.*`.
  * Kiểm tra schema order với dữ liệu payment method cũ trước khi chạy `prisma db push`.
  * Xem lại thư mục `env test/`; không nên merge nếu có thông tin môi trường nhạy cảm hoặc chỉ là file máy local.
* Thứ tự merge đề xuất:
  * Nếu mục tiêu là remote chính: merge/test nhánh `feature/postgresql-prisma` vào nhánh staging/dev tách từ `origin/main` trước.
  * Sau khi ổn định feature này, mới hợp nhất với local `main` hoặc nhánh chứa 2 commit `4b596a3`, `150005e`, vì nhóm thay đổi ở local `main` có conflict risk cao.
  * Nếu bắt buộc merge nhiều nhánh, ưu tiên merge nhánh nền/deploy/config trước, sau đó merge nhánh frontend/API lớn, cuối cùng xử lý log/report/test docs.
* Lệnh test nên chạy sau merge:
  * `npm install`
  * `npm run check-types`
  * `npm run build`
  * `npm run lint`
  * `npm run db:seed` chỉ chạy trên database test/dev phù hợp.
  * Kiểm tra thủ công flow login, checkout, my orders, admin orders, admin users, admin notifications.

## 6. Kết luận

* Có thể merge ngay không: Chưa nên merge thẳng vào local `main`.
* Lý do: Local `main` đang diverge và thay đổi trùng nhiều file quan trọng. Nhánh hiện tại cũng có rủi ro API contract, schema Prisma không kèm migration, route user chưa được đăng ký trong `index.ts`, và deploy production cần xử lý `/api`/CORS.
* Cần xử lý gì trước:
  * Chọn rõ target merge (`origin/main`, staging/dev, hoặc local `main`).
  * Resolve trước các điểm API contract và route `/api/users`.
  * Kiểm tra database dev/test với schema order mới.
  * Rà soát `env test/` trước khi merge.
  * Sau merge, chạy typecheck/build/lint và test flow chính.

---

## Post Merge Scan - feature/postgresql-prisma into dateduy

Thoi gian scan: 2026-06-18 17:29:29 +07:00.
Current branch: dateduy.
Trang thai working tree: dang co thay doi staged cua merge va sau scan co cap nhat log nay; working tree khong sach.
Merge da commit hay chua: chua commit. Git bao: All conflicts fixed but you are still merging.
Backup branch: backup/dateduy-before-merge-postgresql-prisma.

File env/test bi cam co xuat hien khong:
- apps/api/.env.example: khong ton tai, khong staged.
- apps/web/.env.example: khong ton tai, khong staged.
- env test/: khong ton tai, khong staged.
- env test/env-agent.txt, env-backend.txt, env-database.txt, env-web.txt: khong staged.

2 file log trong docs:
- docs/FRONTEND_BACKEND_INTEGRATION_LOG.md: co ton tai; co section Log merged from feature/postgresql-prisma va Merge feature/postgresql-prisma into dateduy.
- docs/MERGE_BRANCH_SCAN_LOG.md: co ton tai; duoc copy/dua lai vao docs tren dateduy va section scan hien tai duoc append vao file nay.

Cac file chinh da merge co du chua: du tat ca path yeu cau deu ton tai:
- apps/web/src/App.tsx
- apps/web/src/api/client.ts
- apps/web/src/api/orders.api.ts
- apps/web/src/api/inventory.api.ts
- apps/web/vite.config.ts
- apps/web/src/pages/admin/AdminInventoryPage.tsx
- apps/api/src/index.ts
- apps/api/src/modules/order/order.repository.ts
- apps/api/src/modules/order/order.service.ts
- apps/api/src/modules/user/
- apps/api/src/modules/inventory/inventory.service.ts
- packages/database/prisma/schema/order.prisma

Ket qua kiem tra route /api/users: da co import userRoutes tu ./modules/user/user.route va app.use('/api/users', userRoutes) trong apps/api/src/index.ts.

Ket qua kiem tra order API: frontend goi /orders/me va PATCH /orders/:id/status. Backend mount /api/orders, co router.get('/me') va router.patch('/:id/status'). Khong thay frontend goi /orders/my.

Ket qua kiem tra inventory threshold: backend dung leadTimeDays fallback primarySupplierProduct?.leadTimeDays || 3, co delayBufferDays va recommendedThreshold. Frontend co getThresholdSuggestion goi /inventories/{id}/suggest-threshold va unwrapApiData mapping. UI admin hien thi Ton kho hien tai, Nguong hien tai, Nguong de xuat, Trang thai kho; khong thay chuoi Xem chi tiet.

Ket qua kiem tra Prisma schema: Order co shippingName, shippingPhone, shippingAddress, note. PaymentMethod khong con CARD/E_WALLET trong order.prisma, nen co rui ro voi du lieu cu neu database dang co cac gia tri enum nay. Khong chay migration/db push production.

Ket qua build/type/lint:
- npm install: da chay truoc do va thanh cong; npm audit bao 13 vulnerabilities.
- npm run check-types: fail do Turbo khong tim thay task check-types trong project.
- npm run build: pass.
- npm run lint: fail trong @cafe-project/web voi 193 problems, chu yeu no-explicit-any, set-state-in-effect va unused vars tren nhieu file.

Ket luan: merge chua hoan tat commit. Conflict da resolve, nhung merge dang pending. Cac file bi cam khong bi dua vao. Build pass, check-types va lint chua pass; can quyet dinh sua cau hinh/script lint/type hoac chap nhan commit pending merge sau khi danh gia.