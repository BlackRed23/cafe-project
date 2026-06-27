# Cafe Agent

## Giới thiệu
- Hệ thống quản lý cafe/tồn kho.
- Có trang khách hàng và trang admin.
- Có AI Agent hỗ trợ quét tồn kho, cảnh báo thiếu hàng và tạo yêu cầu nhập hàng.
- Dùng monorepo.

## Công nghệ
- Frontend: React, Vite, TypeScript.
- Backend: Express, TypeScript, Prisma, Zod.
- Database: PostgreSQL.
- AI Agent: Gemini / rule-based fallback.
- Upload: Cloudinary.
- Monorepo: npm workspaces, Turbo.

## Cấu trúc thư mục
```text
apps/api            Backend API
apps/web            Frontend React
apps/agent          Agent worker
packages/database   Prisma schema/client
packages/types      Shared types
docs                Tài liệu và log kỹ thuật
```

## Chức năng chính
- Quản lý sản phẩm và danh mục.
- Upload ảnh sản phẩm.
- Quản lý tồn kho.
- Nhập kho, điều chỉnh kho, gợi ý ngưỡng tồn kho.
- Quản lý nhà cung cấp.
- Tạo và duyệt yêu cầu nhập hàng.
- Agent Log.
- Simulate sale để demo tồn kho giảm và agent cảnh báo.
- Cron xử lý sản phẩm chờ xoá.

## Luồng Agent tồn kho
1. Bán hàng hoặc simulate sale làm giảm tồn kho.
2. Backend kiểm tra tồn kho.
3. Nếu tồn thấp hơn ngưỡng, Agent ghi log.
4. Nếu chưa có yêu cầu nhập hàng đang xử lý, hệ thống tạo Purchase Request.
5. Admin duyệt, sửa email và gửi nhà cung cấp.

## Cài đặt
```bash
npm install
npm run generate -w @cafe-project/database
npm run db:push -w @cafe-project/database
npm run db:seed
```

## Cấu hình môi trường
```env
PORT=
NODE_ENV=
JWT_SECRET=
JWT_EXPIRES_IN=
CLOUDINARY_CLOUD_NAME=
CLOUDINARY_API_KEY=
CLOUDINARY_API_SECRET=
SMTP_HOST=
SMTP_PORT=
SMTP_USER=
SMTP_PASS=
SMTP_FROM=
GEMINI_API_KEY=
```

## Chạy dự án
Bạn có thể chạy toàn bộ hệ thống bằng Turbo:
```bash
npm run dev
```

Hoặc chạy từng service:
```bash
npm run dev -w @cafe-project/api
npm run dev -w @cafe-project/web
npm run dev -w @cafe-project/agent
```

## Kiểm thử nhanh
- Đăng nhập admin.
- Tạo danh mục.
- Tạo sản phẩm.
- Upload ảnh.
- Nhập kho.
- Bấm Ngưỡng để xem gợi ý.
- Simulate sale làm tồn kho thấp.
- Xem Agent Logs.
- Kiểm tra Purchase Request được tạo.
- Duyệt và gửi email nhà cung cấp nếu đã cấu hình.

## Ghi chú
- Không commit `.env`.
- Không đưa secret lên frontend.
- Một số chức năng email/Gemini/Cloudinary cần cấu hình env mới chạy đầy đủ.