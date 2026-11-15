# KẾ HOẠCH KIỂM THỬ TOÀN DIỆN HỆ THỐNG CAFE AGENT (KLTN)

---

## 1. MỤC TIÊU VÀ TIÊU CHÍ CHẤP NHẬN (QUALITY GATES)

| Chỉ số | Mục tiêu KLTN | Phương pháp đo kiểm / Bằng chứng |
| :--- | :--- | :--- |
| **Số tầng kiểm thử** | $\ge 4$ tầng (Thực tế: 5 tầng) | Unit, Integration, API, UI E2E, Non-functional |
| **Độ phủ dòng lệnh (Core Modules)** | $\ge 70\%$ | Báo cáo `c8` / Node coverage (LCOV, HTML, Cobertura) |
| **Tỉ lệ tự động hóa (Automation Ratio)**| $\ge 70\%$ | Bảng thống kê Test Case (Automation / Total Cases) |
| **Tỷ lệ Pass CI cuối cùng** | $100\%$ | GitHub Actions Pipeline Run (Green badge) |
| **Defect Critical/Blocker còn tồn** | $0$ | Bug Tracker (GitHub Issues / Jira) đóng toàn bộ lỗi P0/P1 |
| **Độ truy vết Acceptance Criteria (RTM)**| $100\%$ | Ma trận RTM map từ `ACCEPTANCE_CRITERIA.md` |
| **Bao phủ kịch bản** | Positive, Negative, Boundary | Tối thiểu 1 ca âm + 1 ca biên cho mỗi rule nghiệp vụ cốt lõi |

---

## 2. PHÂN TẦNG VÀ PHÂN CHIA MANUAL VS AUTOMATION

### 2.1. Phân tầng kiểm thử (5 Tầng)

```
       / \
      /   \      Tầng 5: Non-functional (Performance k6, Security, Lighthouse)
     / E2E \     Tầng 4: UI E2E (Playwright - Web flows)
    /  API  \    Tầng 3: API & Contract (Express routes, Zod validation, Auth RBAC)
   / Integr. \   Tầng 2: Integration (Repository, DB transaction, Event workflows)
  /   Unit    \  Tầng 1: Unit & Domain Core (Inventory math, Recipe policy, Token)
 /-------------\
```

### 2.2. Bảng phân định Manual vs Automation

| Tầng kiểm thử | Phân loại | Tỉ trọng | Công cụ đề xuất | Phạm vi & Kịch bản thực hiện |
| :--- | :--- | :--- | :--- | :--- |
| **Smoke Test** | Manual | ~5% | Check-list tay / Postman | Kiểm tra sau deploy: App khởi động, DB kết nối, Login admin/user, load dashboard cơ bản |
| **Exploratory & UX** | Manual | ~15% | Trình duyệt Chrome/Firefox | Giao diện Responsive trên mobile/desktop, hiển thị thông báo tiếng Việt, upload bill scan thực tế |
| **Usability / Visual** | Manual | ~5% | Manual Review | Màu sắc cảnh báo tồn kho, modal popup xác nhận duyệt phiếu mua hàng, trải nghiệm Google OAuth |
| **Tầng 1: Unit Test** | **Automation** | ~25% | `node --test`, `c8` | Hàm tính định lượng nguyên liệu, logic khấu trừ tồn kho, mã hóa token, validate receipt |
| **Tầng 2: Integration** | **Automation** | ~20% | `node --test`, Prisma mock/test DB | Giao dịch commit đơn hàng + trừ kho đồng thời, rollback khi lỗi DB, trigger log Agent |
| **Tầng 3: API Test** | **Automation** | ~15% | `supertest`, `node --test` | Toàn bộ REST endpoints: 200/201 OK, 400 Bad Request, 401 Unauthorized, 403 Forbidden, 409 Conflict |
| **Tầng 4: UI E2E** | **Automation** | ~10% | `@playwright/test` | Luồng người dùng: Khách đặt món -> Admin duyệt đơn -> Tồn kho giảm -> Agent quét thiếu -> Đề xuất nhập |
| **Tầng 5: Non-functional**| **Automation** | ~5% | `k6`, Lighthouse CI | Concurrency test: 50 đơn hàng cùng lúc không làm âm kho; tải trang < 2s; Lighthouse score > 85 |
| **TỔNG CỘNG** | **Tự động: 75%** | **Thủ công: 25%** | **Đạt tiêu chuẩn $\ge 70\%$ Automation** |

---

## 3. MA TRẬN TRUY VẾT YÊU CẦU (RTM - REQUIREMENTS TRACEABILITY MATRIX)

| Mã AC | Tiêu chí chấp nhận | Loại ca | Kịch bản kiểm thử (Test Scenario) | Tầng test | File Test / Thực thi |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **AC-INV-01** | Trừ kho chính xác theo công thức định lượng (recipe) | Positive | Đặt 2 Cà phê sữa -> trừ đúng $2 \times 20g$ cà phê, $2 \times 30ml$ sữa | Unit / Integration | `apps/api/tests/inventory-core.test.cjs` |
| **AC-INV-02** | Không cho phép tồn kho âm | Negative | Tồn kho còn 30ml sữa, khách đặt món cần 40ml -> Từ chối đơn, báo lỗi thiếu nguyên liệu | Unit / API | `apps/api/tests/ingredient-policy.test.cjs` |
| **AC-INV-03** | Khấu trừ tồn kho chạm ngưỡng biên (Boundary) | Boundary | Tồn kho còn đúng 40ml, order cần 40ml -> Trừ thành công, stock còn đúng 0, bật cờ Low Stock | Unit | `apps/api/tests/inventory-core.test.cjs` |
| **AC-ORD-01** | Tính toán tổng tiền đơn hàng | Positive | Đơn gồm 2 món + Topping -> Tổng tiền khớp đúng công thức | Unit / API | `apps/api/tests/order-after-commit.test.cjs` |
| **AC-ORD-02** | Chặn số lượng âm hoặc số thập phân không hợp lệ | Negative | Đặt số lượng `-1` hoặc `abc` -> Zod validator trả về HTTP 400 | API | `apps/api/tests/mock-http.test.cjs` |
| **AC-AGENT-01**| Agent tự động quét và đề xuất nguyên liệu dưới minThreshold | Positive | Nguyên liệu A tồn kho < ngưỡng tối thiểu -> Agent tạo Purchase Suggestion | Integration | `apps/agent/tests/replenishment.test.cjs` |
| **AC-AGENT-02**| Agent không spam tạo phiếu trùng lặp | Negative | Đã có phiếu Purchase Request pending cho nguyên liệu A -> Agent không tạo thêm phiếu mới | Integration | `apps/agent/tests/mock-agent-workflow.test.cjs` |
| **AC-AUTH-01** | Phân quyền Admin và Nhân viên (RBAC) | Negative | Nhân viên cố tình gọi API duyệt phiếu nhập kho -> Trả về HTTP 403 Forbidden | API | `apps/api/tests/internal-auth.test.cjs` |
| **AC-E2E-01** | Chu trình khép kín Đặt hàng -> Nhập kho | E2E Positive | Khách đặt món -> Kho cảnh báo -> Quản lý tạo phiếu nhập -> Hoàn tất nhập kho -> Stock tăng lại | UI E2E | `tests/e2e/order-to-replenish.spec.ts` |

---

## 4. CHI TIẾT CÁC TẦNG KIỂM THỬ & ĐỘ PHỦ DÒNG LỆNH (CODE COVERAGE)

### 4.1. Tầng 1: Unit Test & Đo Coverage Core Modules ($\ge 70\%$)
- **Mô-đun cốt lõi cần đo:**
  1. `apps/api/src/common/inventory-core.ts`: Tính toán tồn kho, quy đổi đơn vị (kg $\leftrightarrow$ g, l $\leftrightarrow$ ml).
  2. `apps/api/src/common/ingredient-policy.ts`: Chính sách cảnh báo cận date, ngưỡng tối thiểu (safety stock).
  3. `apps/api/src/modules/purchase/purchase.receipt-validation.ts`: Kiểm tra hợp lệ hóa đơn nhập kho.
  4. `apps/api/src/modules/auth/auth.tokens.ts`: Ký và giải mã JWT token.
  5. `apps/agent/src/workflows/replenishment.ts`: Thuật toán tính lượng nhập bù.
- **Tiêu chuẩn Coverage (c8 / v8):**
  - Statements: $\ge 70\%$
  - Branches: $\ge 65\%$
  - Functions: $\ge 75\%$
  - Lines: $\ge 70\%$

### 4.2. Tầng 2: Integration Test (Tích hợp dịch vụ & CSDL)
- Kiểm tra tính toàn vẹn dữ liệu (Data Consistency): Chạy giao dịch DB trong `Prisma.$transaction`.
- Kiểm tra rollback: Nếu việc trừ 1 nguyên liệu thất bại giữa chừng, toàn bộ đơn hàng phải hủy, tồn kho không bị trừ dở dang.

### 4.3. Tầng 3: API & Contract Test
- Kiểm tra toàn bộ Request Body & Params theo Schema Zod.
- Kiểm tra Header Authorization (Bearer Token), kiểm tra Token hết hạn (401), Role không đủ quyền (403).

### 4.4. Tầng 4: UI End-to-End Test (Playwright)
- Kịch bản 1: Đăng nhập Admin -> Xem Báo cáo tồn kho -> Lọc danh sách nguyên liệu cạn kiệt.
- Kịch bản 2: Đăng nhập Khách hàng -> Chọn món -> Đặt hàng -> Xác nhận đơn thành công.
- Kịch bản 3: Admin xác nhận đơn -> Kiểm tra trang Tồn kho trừ tương ứng.

### 4.5. Tầng 5: Non-Functional Test (Phi chức năng)
- **Concurrency / Load Test (k6):** Giả lập 50 request đặt hàng đồng thời tới cùng một sản phẩm có tồn kho giới hạn để xác minh không bị Race Condition / Âm kho.
- **Security Test:** 
  - Thử SQL Injection, XSS trong ô tìm kiếm.
  - Thử bypass API bằng cách không truyền JWT hoặc truyền JWT của user thường.
- **Frontend Performance (Lighthouse CI):** First Contentful Paint < 1.8s, Performance Score $\ge 85$.

---

## 5. QUY TRÌNH QUẢN LÝ LỖI (BUG LIFECYCLE & REGRESSION)

### 5.1. Vòng đời lỗi (Bug Tracker)

```
[Mới phát hiện (New)]
        │
        ▼
[Phân loại (Triage: Severity & Priority)]
  ├── Blocker (P0)  -> Chặn toàn bộ luồng chính, fix ngay lập tức
  ├── Critical (P1) -> Lỗi tính toán tiền, âm kho, sai lệch dữ liệu
  ├── Major (P2)    -> Lỗi chức năng phụ, có workaround tạm thời
  └── Minor (P3)    -> Lỗi chính tả, căn lề UI, màu sắc
        │
        ▼
[Đang sửa (In Progress)] ──> [Đã sửa (Fixed)]
                                   │
                                   ▼
                        [Kiểm thử hồi quy (Regression Test)]
                                   │
                    ┌──────────────┴──────────────┐
                    ▼                             ▼
           [Fail -> Re-open]              [Pass -> Closed]
```

### 5.2. Chính sách bảo vệ KLTN
- **Tiêu chí Zero Critical/Blocker:** Trước ngày bảo vệ 7 ngày, đóng toàn bộ issue mức `P0` và `P1`.
- **Regression Suite:** Mỗi khi fix một bug, bắt buộc phải viết thêm 1 unit/integration test case để kiểm tra bug đó không bị lặp lại trước khi merge code.

---

## 6. LỘ TRÌNH HỌC TẬP, CÔNG CỤ VÀ SCRIPT TRIỂN KHAI

### 6.1. Kiến thức cần học

| Lĩnh vực | Chủ đề trọng tâm cần nắm | Tài liệu tham khảo |
| :--- | :--- | :--- |
| **Kỹ thuật thiết kế Test** | Phân vùng tương đương (EP), Giá trị biên (BVA), Bảng quyết định | ISTQB Foundation Level Syllabus |
| **Automated Testing** | Node.js Test Runner (`node --test`), Assert library, Mocking/Stubbing | Tài liệu chính thức Node.js Test Runner |
| **Code Coverage** | Cách tính Line/Branch coverage, cấu hình `c8` / Istanbul | Trang chủ c8 / istanbuljs |
| **E2E Automation** | Playwright Test: Locators, Page Object Model (POM), Auto-waiting | Playwright.dev Documentation |
| **Load Testing** | Viết script k6 (Virtual Users, Thresholds, Checks, RPS) | K6.io Documentation |

### 6.2. Công cụ sử dụng trong dự án
- **Runner chính:** Node.js Built-in Test Runner (`node --test`) — nhẹ, nhanh, không cần cài đặt Jest phức tạp.
- **Coverage Tool:** `c8` (dựa trên V8 engine của Node.js).
- **E2E Testing:** `@playwright/test` (đã có sẵn trong package.json).
- **Load Testing:** `k6` (chạy script js độc lập).
- **Bug Tracker & CI/CD:** GitHub Issues + GitHub Actions.

### 6.3. Bộ Scripts cấu hình cho `package.json`

```json
{
  "scripts": {
    "test": "node --test apps/api/tests/*.test.cjs apps/agent/tests/*.test.cjs apps/web/tests/*.test.cjs",
    "test:coverage": "npx c8 --all --src apps/api/src/common --src apps/api/src/modules --lines 70 --branches 65 --reporter=text --reporter=html --reporter=lcov node --test apps/api/tests/*.test.cjs apps/agent/tests/*.test.cjs",
    "test:e2e": "playwright test",
    "test:e2e:ui": "playwright test --ui",
    "test:perf": "k6 run tests/perf/load-test.js",
    "test:ci": "npm run check-types && npm run build && npm run test:coverage && npm run test:e2e"
  }
}
```
