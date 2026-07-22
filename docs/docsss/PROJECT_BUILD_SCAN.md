# PROJECT_BUILD_SCAN.md
> Scan toàn bộ project — Chỉ đọc, không sửa code.  
> Thực hiện: 2026-07-19 | Không có file nào bị chỉnh sửa.

---

## Build Errors

### BE-01 — `@cafe-project/types`: `main`/`types` trỏ vào file `.ts` nguồn

| | |
|---|---|
| **File** | `packages/types/package.json` L5–6 |
| **Error** | `"main": "./src/index.ts"`, `"types": "./src/index.ts"` |
| **Severity** | 🔴 CRITICAL — runtime crash |

**Root cause:** Node.js runtime không thể execute `.ts`. Khi `@cafe-project/api` sau khi compile bởi `tsc` chạy `node dist/index.js`, nó resolve `@cafe-project/types` → `./src/index.ts` → lỗi `Cannot find module` hoặc parse error.  
**Ảnh hưởng:** `npm run start -w @cafe-project/api` crash ngay lập tức trong Docker và Render.

---

### BE-02 — `apps/api/Dockerfile` + `render.yaml`: `prisma db push --schema` trỏ vào thư mục

| | |
|---|---|
| **File** | `apps/api/Dockerfile` L23, `render.yaml` L7 |
| **Error** | `--schema=packages/database/prisma/schema` (directory, not file) |
| **Severity** | 🔴 CRITICAL — deploy crash |

**Root cause:** `prisma db push` yêu cầu `--schema` trỏ vào **file cụ thể**. Khi schema nằm trong folder với `prismaSchemaFolder` preview feature, `package.json "prisma": {"schema": "prisma/schema"}` đủ để CLI tự tìm — nhưng khi dùng `--schema` flag qua CLI bên ngoài workspace, path resolution không dùng được config đó. Cần trỏ vào `main.prisma` cụ thể.

---

### BE-03 — Cả 3 Dockerfile: `packages/types/package.json` không được COPY trong selective step

| | |
|---|---|
| **File** | `apps/api/Dockerfile` L3–8, `apps/agent/Dockerfile` L3–8, `apps/web/Dockerfile` L3–8 |
| **Error** | Không có `COPY packages/types/package.json packages/types/` |
| **Severity** | 🔴 CRITICAL — docker build: npm workspace link fail |

**Root cause:** Cả 3 Dockerfile chỉ COPY `packages/database/package.json` nhưng bỏ `packages/types/package.json`. Khi `npm install` chạy, workspace `@cafe-project/types` không được link → `Cannot resolve module '@cafe-project/types'` khi build.

---

### BE-04 — `product.service.ts`: 4 `@ts-ignore` che giấu TS2345 thực sự

| | |
|---|---|
| **File** | `apps/api/src/modules/product/product.service.ts` L281, L283, L295, L297 |
| **Error** | `// @ts-ignore` trước `deletedAt` và `pendingDeleteUntil` trong `productRepository.update()` call |
| **Severity** | 🟠 HIGH — tsc -b sẽ fail nếu bỏ ignore |

**Root cause:** `Prisma.ProductUncheckedUpdateInput` có thể không expose `deletedAt`/`pendingDeleteUntil` nếu chúng là `DateTime?` without explicit mapping. 4 `@ts-ignore` hide TS2345 errors thực sự. Upgrade Prisma/TS sẽ expose.

---

### BE-05 — `apps/agent/tsconfig.json`: thiếu `include` field

| | |
|---|---|
| **File** | `apps/agent/tsconfig.json` |
| **Error** | Không có `"include": ["src/**/*"]` |
| **Severity** | 🟠 HIGH — tsc -b compile ngoài ý muốn |

---

### BE-06 — `apps/api/tsconfig.json`: thiếu `include` field

| | |
|---|---|
| **File** | `apps/api/tsconfig.json` |
| **Error** | Không có `"include": ["src/**/*"]` |
| **Severity** | 🟠 HIGH — tsc -b compile ngoài ý muốn |

---

### FE-01 — `apps/web/package.json`: TypeScript 6.0.2 beta

| | |
|---|---|
| **File** | `apps/web/package.json` L34 |
| **Error** | `"typescript": "~6.0.2"` (pre-release/beta) |
| **Severity** | 🟠 HIGH — vite build có thể fail với TS 6 breaking changes |

---

### FE-02 — `tsconfig.app.json`: `noUnusedLocals` + `noUnusedParameters` strict

| | |
|---|---|
| **File** | `apps/web/tsconfig.app.json` L19–20 |
| **Error** | `"noUnusedLocals": true`, `"noUnusedParameters": true` |
| **Severity** | 🟡 MEDIUM — tsc -b fail nếu có unused vars trong web src |

**Root cause:** `vite build` chạy `tsc -b && vite build`. Nếu có bất kỳ unused local/param nào trong toàn bộ `src/`, bước `tsc -b` fail trước khi Vite build.

---

### FE-03 — `order.types.ts`: `OrderStatus` và `PaymentStatus` không khớp Prisma enum

| | |
|---|---|
| **File** | `apps/web/src/types/order.types.ts` L4–10 |
| **Error** | Frontend có `"CONFIRMED"` và `"SUCCESS"` — Prisma không có |
| **Severity** | 🟠 HIGH — runtime bug + potential TS2345 |

**Chi tiết:**
- `OrderStatus` frontend: `"PENDING" | "CONFIRMED" | "PROCESSING" | "COMPLETED" | "CANCELLED"`
- Prisma `OrderStatus`: `PENDING, PROCESSING, COMPLETED, CANCELLED` (thiếu `CONFIRMED`)
- `PaymentStatus` frontend: `"PENDING" | "SUCCESS" | "PAID" | "FAILED" | "REFUNDED"`
- Prisma `PaymentStatus`: `PENDING, PAID, FAILED, REFUNDED` (thiếu `SUCCESS`)

**Ghi chú:** API `order.service.ts` L15 có `displayStatus: order.status === OrderStatus.PROCESSING ? 'CONFIRMED' : order.status` — intentional display alias, nhưng frontend type không phân biệt `status` vs `displayStatus`.

---

### FE-04 — `inventory.types.ts`: `InventoryTransaction.type` có values không tồn tại trong Prisma

| | |
|---|---|
| **File** | `apps/web/src/types/inventory.types.ts` L56 |
| **Error** | `"ADJUST"` và `"RETURN"` không có trong Prisma enum; `"DAMAGE"` và `"ADJUSTMENT"` Prisma có nhưng frontend không khai báo |
| **Severity** | 🟡 MEDIUM — UI hiển thị sai cho DAMAGE transactions |

**Ghi chú:** API `inventory.service.ts` L127 map `ADJUSTMENT → "ADJUST"` khi build DTO, nhưng `DAMAGE` không được map và sẽ không match type frontend.

---

### FE-05 — `auth.types.ts`: `UserRole` có `"USER"` không tồn tại trong Prisma

| | |
|---|---|
| **File** | `apps/web/src/types/auth.types.ts` L1 |
| **Error** | `UserRole = "ADMIN" | "STAFF" | "CUSTOMER" | "USER"` — Prisma chỉ có `ADMIN, STAFF, CUSTOMER` |
| **Severity** | 🟡 MEDIUM — unreachable code branch |

---

### BE-07 — `order.validator.ts`: accept `"CONFIRMED"` không có trong Prisma `OrderStatus` enum

| | |
|---|---|
| **File** | `apps/api/src/modules/order/order.validator.ts` L17 |
| **Error** | `z.enum(['PENDING', 'CONFIRMED', ...])` — infer type không match `OrderStatus` |
| **Severity** | 🟡 MEDIUM — intentional workaround nhưng type-unsafe |

---

## Deploy Risks

### DR-01 — Render: Agent service hoàn toàn không có trong `render.yaml`

| | |
|---|---|
| **Severity** | 🔴 CRITICAL |
| **File** | `render.yaml` |

Không có agent service entry. AI scan/recommend fail toàn bộ. API tạo fallback AgentLog "AGENT_SERVICE_UNAVAILABLE" cho mọi AI call.

---

### DR-02 — Render: Thiếu env vars quan trọng

| | |
|---|---|
| **Severity** | 🔴 CRITICAL |
| **File** | `render.yaml` L8–21 |

| Env var thiếu | Consequence |
|---|---|
| `AGENT_BASE_URL` | API dùng fallback `http://127.0.0.1:5055` → không reach được agent |
| `AGENT_INTERNAL_TOKEN` | Fallback `"dev-agent-secret"` → security risk production |
| `SMTP_HOST` / `SMTP_USER` / `SMTP_PASS` | Forgot password → HTTP 500 |
| `CLOUDINARY_CLOUD_NAME` / `CLOUDINARY_API_KEY` / `CLOUDINARY_API_SECRET` | Upload ảnh fail |
| `GEMINI_API_KEY` | AI recommendation fail khi agent được deploy |

---

### DR-03 — Docker: Agent worker cron scan không được khởi động

| | |
|---|---|
| **Severity** | 🔴 CRITICAL |
| **File** | `apps/agent/Dockerfile` L23 |

`CMD ["npm", "run", "start:server"]` chỉ start `server.ts` (HTTP server). `worker.ts` (cron job) không được chạy → scheduled AI inventory scan bị disabled hoàn toàn trong Docker production.

---

### DR-04 — Docker: `packages/types` thiếu trong selective COPY

| | |
|---|---|
| **Severity** | 🟠 HIGH |
| **File** | `apps/api/Dockerfile`, `apps/agent/Dockerfile`, `apps/web/Dockerfile` |

Xem BE-03.

---

### DR-05 — Prisma: `--schema` flag sai path trong Dockerfile/render

| | |
|---|---|
| **Severity** | 🔴 CRITICAL |
| **File** | `apps/api/Dockerfile` L23, `render.yaml` L7 |

Xem BE-02.

---

### DR-06 — Prisma: `AgentLog` dùng snake_case fields trực tiếp (không có `@map`)

| | |
|---|---|
| **Severity** | 🟡 MEDIUM |
| **File** | `packages/database/prisma/schema/system.prisma` |

Fields như `fallback_used`, `error_message`, `reference_type`, `reference_id`, `triggered_at` dùng snake_case trực tiếp trong schema. Prisma client sẽ generate với chính tên đó (không convert sang camelCase). Cần verify với generated Prisma types.

---

### DR-07 — Prisma: `PurchaseRequest.paymentStatus` là plain `String` thay vì enum

| | |
|---|---|
| **Severity** | 🟡 MEDIUM |
| **File** | `packages/database/prisma/schema/purchase.prisma` L29 |

`paymentStatus String @default("UNPAID")` — không type-safe. Typo `'PAID'` vs `'paid'` không được catch.

---

### DR-08 — Agent: `DATABASE_URL` missing không gây `process.exit(1)`

| | |
|---|---|
| **Severity** | 🟡 MEDIUM |
| **File** | `apps/agent/src/config/env.ts` L16–18 |

Agent log error nhưng tiếp tục chạy với `DATABASE_URL = undefined as string` → Prisma crash với message không rõ ràng.

---

### DR-09 — Agent: `GEMINI_API_KEY` không validate khi startup

| | |
|---|---|
| **Severity** | 🟡 MEDIUM |
| **File** | `apps/agent/src/config/env.ts` L9 |

`as string` cast che undefined → fail at runtime khi call Gemini API.

---

### DR-10 — Docker: `bcrypt` (native) + `bcryptjs` (pure JS) tồn tại đồng thời; Alpine thiếu build tools

| | |
|---|---|
| **Severity** | 🟠 HIGH |
| **File** | `apps/api/package.json` L14–15 |

`bcrypt@^6.0.0` yêu cầu `node-gyp`, `python`, `make` → `node:20-alpine` không có sẵn → `npm install` fail. `bcryptjs` là dead dependency (code dùng `bcrypt`).

---

### DR-11 — Web: `VITE_API_URL` baked vào bundle lúc Docker build

| | |
|---|---|
| **Severity** | 🟡 MEDIUM |
| **File** | `apps/web/Dockerfile` L14–15 |

URL API được bake vào static bundle tại build time. Default `http://localhost:5000/api` fail trong cloud environments.

---

### DR-12 — Render: `npm run build -w @cafe-project/types` bị bỏ qua trong build command

| | |
|---|---|
| **Severity** | 🟠 HIGH |
| **File** | `render.yaml` L6 |

Build command không build `@cafe-project/types` → runtime crash (liên quan BE-01).

---

### DR-13 — Nginx: thiếu `/api` proxy block

| | |
|---|---|
| **Severity** | 🟡 MEDIUM |
| **File** | `apps/web/nginx.conf` |

Nginx chỉ serve static files. Không reverse proxy `/api` → cần URL API cố định baked vào bundle.

---

### DR-14 — Security: Google OAuth Client ID hard-coded

| | |
|---|---|
| **Severity** | 🟡 MEDIUM |
| **File** | `apps/web/src/App.tsx` L9 |

Real Google Client ID làm fallback trong source code.

---

### DR-15 — Agent: `@types/nodemailer` thiếu trong devDependencies

| | |
|---|---|
| **Severity** | 🟡 MEDIUM |
| **File** | `apps/agent/package.json` |

`tsc` có thể báo "Could not find declaration file for 'nodemailer'". Hiện bypass được bằng `skipLibCheck: true`.

---

### DR-16 — `turbo.json` thiếu task `check-types`

| | |
|---|---|
| **Severity** | 🟢 LOW |
| **File** | `turbo.json` |

`turbo run check-types` không có cache/dependency config.

---

### DR-17 — `apps/agent/.env` có thể bị tracked bởi git

| | |
|---|---|
| **Severity** | 🟡 MEDIUM |
| **File** | `apps/agent/.env` |

Secret leakage nếu `.gitignore` không exclude.

---

## Root Cause Summary

| Root Cause | Lỗi liên quan |
|---|---|
| `@cafe-project/types` không build → trỏ vào `.ts` nguồn | BE-01, DR-12 |
| `--schema` flag CLI trỏ vào directory không phải file | BE-02, DR-05 |
| `packages/types` không được COPY trong Docker selective step | BE-03, DR-04 |
| Agent worker (`worker.ts`) không được start trong Docker | DR-03 |
| Agent service không có trong `render.yaml` | DR-01 |
| Enum mismatch giữa frontend types và Prisma schema | FE-03, FE-04, FE-05, BE-07 |
| `@ts-ignore` che TS2345 trong product.service | BE-04 |
| `tsconfig` thiếu `include` | BE-05, BE-06 |
| `bcrypt` native deps trên Alpine | DR-10 |
| Thiếu `process.exit` khi missing env vars | DR-08, DR-09 |
| TypeScript 6.0.2 beta trong web | FE-01 |

---

## Fix Order

| Priority | Fix | Refs | Lý do |
|---|---|---|---|
| **1** | Build `@cafe-project/types`: thêm tsconfig, sửa `main`/`types` → `./dist/` | BE-01, DR-12 | Runtime crash ngay lập tức |
| **2** | Sửa `--schema` → `packages/database/prisma/schema/main.prisma` trong cả Dockerfile và render.yaml | BE-02, DR-05 | Mọi deploy fail ở migration step |
| **3** | Thêm `COPY packages/types/package.json packages/types/` vào cả 3 Dockerfile | BE-03, DR-04 | Docker build workspace link fail |
| **4** | Thêm agent service vào `render.yaml` + env vars còn thiếu | DR-01, DR-02 | AI và email non-functional trên Render |
| **5** | Agent Dockerfile: start cả `server.ts` và `worker.ts` | DR-03 | Scheduled scan disabled |
| **6** | Fix enum mismatch: `OrderStatus`, `PaymentStatus`, `InventoryTransactionType`, `UserRole` | FE-03, FE-04, FE-05, BE-07 | Type safety + UI correctness |
| **7** | Thêm `"include": ["src/**/*"]` vào `apps/api/tsconfig.json` và `apps/agent/tsconfig.json` | BE-05, BE-06 | Unexpected compile scope |
| **8** | Fix 4 `@ts-ignore` trong `product.service.ts` | BE-04 | Hidden type errors |
| **9** | Xóa `bcryptjs` khỏi API deps; thêm Alpine build tools nếu cần `bcrypt` | DR-10 | Alpine native build |
| **10** | Thêm `process.exit(1)` cho missing `DATABASE_URL` và `GEMINI_API_KEY` trong agent | DR-08, DR-09 | Startup fail rõ ràng |
| **11** | Pin TypeScript về `~5.8.x` trong `apps/web/package.json` | FE-01 | TS 6 beta breaking changes |
| **12** | Xóa hard-coded Google Client ID khỏi `App.tsx` | DR-14 | Security |
| **13** | Thêm `check-types` task vào `turbo.json` | DR-16 | CI reliability |
| **14** | Đổi `PurchaseRequest.paymentStatus` thành enum trong Prisma | DR-07 | Type safety |
| **15** | Verify `.gitignore` exclude `apps/agent/.env` | DR-17 | Secret leakage |
| **16** | Thêm `/api` proxy block vào `nginx.conf` | DR-13 | Cloud URL flexibility |

---

## Estimated Files Affected

**Tổng số file cần sửa: ~21 files**

| File | Issues |
|---|---|
| `packages/types/package.json` | BE-01, DR-12 |
| `packages/types/tsconfig.json` *(cần tạo mới)* | BE-01 |
| `apps/api/Dockerfile` | BE-02, BE-03, DR-10 |
| `apps/agent/Dockerfile` | BE-02, BE-03, DR-03 |
| `apps/web/Dockerfile` | BE-03 |
| `render.yaml` | DR-01, DR-02, BE-02, DR-12 |
| `apps/web/src/types/order.types.ts` | FE-03 |
| `apps/web/src/types/inventory.types.ts` | FE-04 |
| `apps/web/src/types/auth.types.ts` | FE-05 |
| `apps/api/src/modules/order/order.validator.ts` | BE-07 |
| `apps/api/tsconfig.json` | BE-06 |
| `apps/agent/tsconfig.json` | BE-05 |
| `apps/api/src/modules/product/product.service.ts` | BE-04 |
| `apps/api/package.json` | DR-10 |
| `apps/agent/src/config/env.ts` | DR-08, DR-09 |
| `apps/web/package.json` | FE-01 |
| `apps/web/src/App.tsx` | DR-14 |
| `turbo.json` | DR-16 |
| `packages/database/prisma/schema/purchase.prisma` | DR-07 |
| `apps/web/nginx.conf` | DR-13 |
| `.gitignore` (root hoặc apps/agent) | DR-17 |

---

> ✅ Scan hoàn thành — 0 file nào bị chỉnh sửa.
