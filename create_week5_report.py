from docx import Document
from docx.shared import Pt
from docx.oxml.ns import qn
from pathlib import Path
import shutil

SOURCE = Path(r"C:\Users\Asus\Downloads\BaoCao_tuan4.docx")
OUTPUT = Path(r"D:\CTF\NPT\cafe-project\BaoCao_tuan5_Payment_Nguyen_lieu_Ton_kho.docx")

shutil.copy2(SOURCE, OUTPUT)
doc = Document(OUTPUT)


def set_para(index, text, bold=False):
    p = doc.paragraphs[index]
    p.clear()
    run = p.add_run(text)
    run.bold = bold
    run.font.name = 'Times New Roman'
    run._element.rPr.rFonts.set(qn('w:eastAsia'), 'Times New Roman')
    return p


def set_cell(cell, text, bold=False):
    cell.text = ''
    p = cell.paragraphs[0]
    p.clear()
    r = p.add_run(text)
    r.bold = bold
    r.font.name = 'Times New Roman'
    r._element.rPr.rFonts.set(qn('w:eastAsia'), 'Times New Roman')
    r.font.size = Pt(10)


# Header block and headings
set_para(0, 'NHÓM 05 – CAFE AI SYSTEM', True)
set_para(1, 'BÁO CÁO TUẦN 05', True)
set_para(2, '02/11–07/11/2026  |  Payment, định lượng nguyên liệu, quản lý tồn kho & Plan Testing')

set_para(3, '1. Công việc đã thực hiện / ghi nhận', True)

set_para(5, '2. Kỹ thuật trọng tâm', True)
set_para(6, '• Kế thừa nền tảng tuần 04 (Đạt Gate G04): đã chốt SQL/SRS/quy tắc cùng GVHD (hoàn tất W03, review W04-T01); xử lý schema drift, replay migration trên DB bản sao kèm schema diff/checksum/expected-actual; diễn tập lỗi & restore có post-snapshot writes (đối soát khớp bản ghi, tồn theo đơn vị, tiền và FK) để mở khóa write API nguyên liệu và Payment.')
set_para(7, '• Payment API & UI (MoMo/VNPay Sandbox): đồng bộ Order–Payment 1-N (attemptNo, merchantRef), PaymentCallback, trang Checkout & /payment/result, cron hết hạn EXPIRED và đối soát PaymentReconciliation; xác thực HMAC-SHA256/SHA512 bằng timingSafeEqual, kiểm tra amount từ DB và chống trùng P2002 trong Prisma Transaction.')
set_para(8, '• Định lượng nguyên liệu & Quản lý tồn kho (FEFO): hoàn tất đồng bộ Ingredient, IngredientBatch, Recipe/RecipeIngredient, Topping và build/check-types toàn workspace; giữ chỗ nguyên tử khi tạo đơn, không trừ kho ở webhook, chỉ trừ lô FEFO & tính COGS/grossProfit khi đơn COMPLETED và hoàn trả reservedStock khi CANCELLED.')
set_para(9, '• Quy trình kiểm thử chuẩn (Plan Testing v1.0): ban hành quy trình 7 lớp kiểm thử qua 6 vòng (Phạm vi/RTM → Static/Build/Unit → Smoke → Functional/Integration → Security/Reliability → Agent Gold Set ≥20–30 ca → Hồi quy/Docker/UAT), phân công 2 người (Người A: Web/UI; Người B: API/DB/Payment/Agent) và chỉ ghi PASS khi đối chiếu đủ UI + API + DB.')

set_para(11, '3. Kiểm thử và kết quả', True)

set_para(13, '4. Khó khăn, rủi ro và vấn đề chưa đóng', True)
set_para(14, '• Máy chủ MoMo Sandbox (test-payment.momo.vn) đôi lúc bảo trì trả về HTML 502/403 thay vì JSON; đã bổ sung cơ chế bắt lỗi an toàn và tạo URL fallback trên môi trường dev để không chặn luồng kiểm thử webhook, đồng thời giữ nguyên mã lỗi 502 trên production.')
set_para(15, '• Rủi ro LLM bịa dữ liệu, gọi sai tool hoặc dùng dữ liệu tồn kho cũ (stale state) giữa lúc lập kế hoạch và lúc duyệt đơn nhập; cần khóa chặt ranh giới TV1 (AI Agent Core) và TV2 (Tool Registry, RBAC, Deterministic Reorder Engine & Human Approval) trong Tuần 06.')
set_para(16, '• Các ca kiểm thử tích hợp sâu (concurrency đặt hàng/cập nhật kho đồng thời, đối soát CHK_06–CHK_08, bộ Gold Set 30 kịch bản × 3 lượt và pipeline CI/CD tự động) cần lưu đầy đủ Run ID, request/response đã che secret và snapshot DB trước khi nghiệm thu.')

set_para(17, '5. Kế hoạch tuần 06 và điều kiện chuyển tiếp', True)
set_para(18, '• Thực thi Plan Testing (Vòng 1 → Vòng 5) theo 2 người: khởi tạo docs/qa/ (REQUIREMENTS_RTM.csv, TEST_CASES.md); Người A chạy UI E2E customer/admin; Người B chạy kiểm thử concurrency PostgreSQL thật, kiểm thử bảo mật IDOR/HMAC/amount và thực nghiệm bộ Gold Set (20–30 kịch bản × 3 lượt) chấm chéo giữa 2 thành viên.')
set_para(19, '• Thiết kế & triển khai kiến trúc AI Agent toàn diện (TV1 & TV2): TV1 xây dựng LLM Gateway (Gemini Function Calling), Planner/Orchestrator State Machine (CREATED → PLANNED → RUNNING → WAITING_APPROVAL → COMPLETED/FAILED) và Memory Learning 6 bước (Observe → Evaluate → Learn → Consolidate → Store/Retrieve → Forget); TV2 xây dựng Tool Registry/Adapters, Deterministic Reorder Engine (FEFO/MOQ), RBAC, Human Approval và thực hiện 12 Use Cases (UC-01..UC-12) + 7 ca kiểm thử Memory (MEM-01..MEM-07).')
set_para(20, '• Thiết lập Pipeline CI/CD tự động: cấu hình workflow tự động chạy trên mỗi commit/PR gồm cài đặt sạch (npm ci), kiểm tra lint, check-types, build toàn monorepo và chạy bộ unit/integration test trên PostgreSQL test cô lập; lưu artifact log/report, quản lý biến nhạy cảm qua Secret Store và chặn merge/deploy khi có bước fail.')
set_para(21, '• Đóng gói Docker, Hồi quy & Nghiệm thu (Vòng 6): kiểm chứng docker compose up --build (web, api, agent, postgres), chuyển CHK_06_LIVE_ORDER_CONSUMPTION và CHK_07_PAYMENT_WEBHOOK_LIVE trong 03_verify.sql sang PASS, tổng hợp SUMMARY.md và ký nghiệm thu UAT với 0 lỗi P0/P1 mở.')

set_para(22, '6. Kết luận và trạng thái nghiệm thu', True)
set_para(23, 'Tuần 05 đã hoàn thành kế thừa bằng chứng G04 từ Tuần 04, hoàn tất triển khai module Payment (MoMo & VNPay Sandbox + UI Checkout/Result), đồng bộ toàn diện luồng Định lượng nguyên liệu – Quản lý tồn kho FEFO và ban hành Quy trình kiểm thử chuẩn v1.0.')
set_para(24, 'Trạng thái chuyển sang Tuần 06: Tập trung thực thi chiến dịch kiểm thử 2 người (Vòng 1 → Vòng 6), hoàn thiện kiến trúc AI Agent 2 lớp (TV1 Agent Core & TV2 Tools/Safety + Memory Learning), thiết lập pipeline CI/CD và đóng toàn bộ điều kiện nghiệm thu phát hành.')

# Table 0: Work-status table (7 rows: 1 header + 6 data rows)
t0 = doc.tables[0]
rows0 = [
    ('Hạng mục', 'Nội dung trọng tâm', 'Tình trạng bằng chứng'),
    (
        'Kế thừa tuần 04 (Gate G04)',
        'Chốt SQL/SRS/quy tắc với GVHD; hoàn tất W03, review W04-T01; sửa drift, replay migration và diễn tập restore có post-snapshot writes.',
        'HOÀN TẤT (PASS G04): đủ schema diff, checksum, đối soát count/tồn/tiền/FK để mở khóa Write API.'
    ),
    (
        'Payment (MoMo & VNPay)',
        'Đồng bộ Payment 1-N (attemptNo, merchantRef), PaymentCallback; API create-url (SUPERSEDED), webhook MoMo/VNPay, UI Checkout/Result & cron EXPIRED.',
        'HOÀN TẤT: Pass 6/6 unit test & live E2E PostgreSQL; đã đồng bộ UI và đối soát.'
    ),
    (
        'Định lượng nguyên liệu (Recipe)',
        'Vận hành Ingredient (baseUnit, costPerBaseUnit), RecipeIngredient, ToppingIngredient; tính giá vốn snapshot (COGS, grossProfit) và xử lý sạch lỗi type.',
        'HOÀN TẤT: đã mở sau G04, đồng bộ định lượng công thức và build/check-types toàn workspace.'
    ),
    (
        'Quản lý tồn kho & Lô (FEFO)',
        'Giữ chỗ nguyên tử khi tạo đơn (reservedStock), không trừ kho ở webhook, trừ lô FEFO khi COMPLETED và hoàn kho khi CANCELLED.',
        'HOÀN TẤT: đã đồng bộ order.repository & order.service; sẵn sàng chạy test concurrency ở Tuần 06.'
    ),
    (
        'Plan Testing v1.0 (2 người)',
        'Quy trình 6 vòng / 7 lớp kiểm thử; bảng truy vết RTM; phân công Người A (Web/UI) và Người B (API/DB/Payment/Agent).',
        'HOÀN TẤT TÀI LIỆU: đã xuất file quy trình (.docx & .md); chạy thực tế theo Run ID ở Tuần 06.'
    ),
    (
        'Thiết kế AI Agent & CI/CD',
        'Đặc tả kiến trúc TV1 (Planner/Function Calling/Memory) & TV2 (Tool Registry/Reorder Engine/RBAC/Approval), 12 UC và thiết kế pipeline CI/CD.',
        'ĐÃ CHỐT THIẾT KẾ: sẵn sàng triển khai sâu, đo Gold Set (30 ca × 3 lượt) & bật CI/CD ở Tuần 06.'
    )
]
for ri, row in enumerate(rows0):
    for ci, text in enumerate(row):
        set_cell(t0.rows[ri].cells[ci], text, ri == 0)

# Table 1: Testing summary table (5 rows: 1 header + 4 data rows)
t1 = doc.tables[1]
rows1 = [
    ('Hạng mục', 'Kết quả thực hiện / kế hoạch kiểm thử', 'Đánh giá'),
    (
        'Payment Unit & Live E2E',
        'Chạy payment.unit.test.mjs (6/6 ca) và e2e-payment-live.ts trên PostgreSQL (create-url, sai chữ ký 400/97, IPN chuẩn 204/00, retry trùng).',
        'PASS (6/6 unit test & live E2E DB); đã ghép luồng UI Checkout & Result.'
    ),
    (
        'Migration & Restore (G04)',
        'Replay 00_precheck → 03_verify trên bản sao; diễn tập lỗi & restore có post-snapshot writes; đối soát count, tồn theo đơn vị, tiền, FK.',
        'PASS Gate G04; còn CHK_06 & CHK_07 sẽ đóng trong đợt chạy E2E Vòng 6 ở Tuần 06.'
    ),
    (
        'Định lượng & Tồn kho FEFO',
        'Đã đồng bộ giữ hàng (reserve), hoàn hàng (cancel), trừ lô FEFO & tính COGS khi COMPLETED; dọn sạch lỗi type giữa các module.',
        'PASS BUILD & LOGIC: tiếp tục chạy kiểm thử đồng thời (concurrency) ở Vòng 3–4 Tuần 06.'
    ),
    (
        'Plan Testing, Agent & CI/CD',
        'Chạy Vòng 1–6 theo 2 người, kiểm thử 12 UC + 7 ca Memory (MEM-01..07), đo Gold Set Agent và kích hoạt pipeline CI/CD tự động.',
        'TRỌNG TÂM TUẦN 06: chỉ nghiệm thu khi đủ Run ID, DB snapshot và 0 lỗi P0/P1.'
    )
]
for ri, row in enumerate(rows1):
    for ci, text in enumerate(row):
        set_cell(t1.rows[ri].cells[ci], text, ri == 0)

doc.core_properties.title = 'Báo cáo tuần 05 - Payment, định lượng nguyên liệu, quản lý tồn kho và Plan Testing'
doc.core_properties.subject = 'Cafe AI System Weekly Report - Week 05 & Week 06 Plan'
doc.core_properties.author = 'Nhóm 05 Cafe AI System'
doc.save(OUTPUT)
print(OUTPUT)
