Sử dụng Turborepo để quản lý code tập trung nhưng vẫn chia tách rõ ràng trách nhiệm.

Cấu trúc chốt hạ hiện tại:

apps/web: Frontend React + TSX.

apps/api: Backend Express + TypeScript (Chỉ xử lý REST API).

apps/agent: Node.js Worker (Chuyên chạy Cron Job, Queue và gọi Gemini API).

packages/database: Chứa schema.prisma dùng chung.

packages/types/src/shared: Chứa các TypeScript interface/types dùng chung để đảm bảo đồng bộ kiểu dữ liệu toàn dự án.