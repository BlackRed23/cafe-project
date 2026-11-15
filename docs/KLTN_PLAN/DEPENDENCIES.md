# Phụ thuộc và đường găng

Mỗi tuần T01→T02→T03→T04, tuần kế T01 phụ thuộc T04 tuần trước. Baseline bảo thủ khi nhân lực chưa rõ. Chỉ triển khai downstream khi gate đầu vào có chứng cứ thật.

~~~mermaid
graph TD
 A[W01 Baseline] --> B[W02 Requirements và Rules]
 B --> C[W03 DB và Agent Design]
 C --> D[W04 Migration verified]
 D --> E[W05 Inventory Engine]
 E --> F[W06 Business APIs POS COGS]
 F --> G[W07 Payment sandbox]
 G --> H[W08 AI Tools]
 H --> I[W09 Agentic Workflow]
 I --> J[W10 Integration Tests và freeze]
 J --> K[W11 Evaluation]
 K --> L[W12 Luận văn demo]
 B --> M[Chuẩn bị fixture và labels]
 C --> N[Mock contracts và viết luận văn]
 M --> K
 N --> H
~~~

Đường găng: Requirements → Business Rules → Database Design → Migration → Inventory Engine → Business APIs → AI Tools → Agentic Workflow → Integration Tests → Evaluation. Task chặn: W02-T04 → W03-T01/T02 → W04-T02/T03 → W05-T02/T04 → W06-T04 → W08-T01/T03 → W09-T02/T04 → W10-T03/T04 → W11-T01…T04. W07 là nhánh thanh toán bắt buộc trước G10, xếp tuần riêng để giới hạn tải.

| Blocker | Điều kiện mở |
|---|---|
| U01/U05/U07 → DB | SQL chuẩn và mapping/quy tắc được xác nhận |
| G04 → W05 | Schema diff sạch P0, backup/restore/bảo toàn chứng minh |
| G05/G06 → tool write | Service và transaction tự an toàn trước LLM |
| G08 → W09 | Registry/schema/quyền/HITL đủ |
| G10 → W11 | Freeze commit/model/prompt/fixture trước phép đo |

Chuẩn bị song song được phép: khảo sát và đọc mã; golden labels và ERD; mock tools và rehearsal DB; luận văn và phát triển; adapter payment độc lập sau DB contract. Cần phân công thật, không giả định nhiều nhóm. Không nối Agent trước invariant, không chạy sandbox thiếu U09, không tính kết quả trước raw data, không contract khi kiểm tra trọng yếu NOT_EXECUTED.

Mốc rủi ro cao: G04 migration, G05 concurrency, G07 callback, G09 uncertain write, G11 validity thí nghiệm. Khi chậm: giữ hệ cũ, fixture/mock có nhãn; giới hạn một provider; xin GVHD giảm phụ trợ hoặc đổi hạn, không bỏ quyền/restore/evaluation. Lịch phục hồi ở WEEKLY_PROGRESS_TRACKER.md. Các cạnh đều tiến, không vòng phụ thuộc.
