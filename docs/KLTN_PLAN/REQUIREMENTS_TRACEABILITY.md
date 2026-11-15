# Ma trận truy vết

Tất cả liên kết là PROPOSED; bằng chứng là đầu ra cần thu. BR cần chủ quán/GVHD duyệt W02, không phải quy tắc đã phê duyệt. Hiện trạng component xem PROJECT_BASELINE.md.

| REQ | Yêu cầu | Quy tắc | DB/API/Agent | Task | Test | Bằng chứng |
|---|---|---|---|---|---|---|
| 01 | Sản phẩm/nguyên liệu/công thức/topping | BR01: unit/yield/version hợp lệ | Product/Ingredient/Recipe/Topping | W05-T01 | TC-05-01 | Snapshot/fixture quy đổi |
| 02 | Lô/hạn/FEFO/reservation | BR02: quantity=sum lô; 0≤reserved≤quantity | IngredientBatch/InventoryTransaction | W05-T02; W05-T04 | TC-05-02; TC-05-04 | Log PostgreSQL race/rollback |
| 03 | NCC/mua/nhận từng phần | BR03: MOQ/quy cách đúng; nhận không vượt, không lặp | SupplierIngredient/PR/Item/GoodsReceipt | W05-T03 | TC-05-03 | Receipt/lô/key replay |
| 04 | POS/pha chế/tiêu hao/hủy | BR04: reserve→commit; trước pha release, sau pha waste | Order/Item/Topping/ConsumptionStatus | W06-T01; W06-T04 | TC-06-01; TC-06-04 | E2E hủy/thiếu hàng/lặp |
| 05 | Kiểm kê/hao hụt | BR05: variance có actor/lý do, duyệt một lần | StockCount/Item/ledger | W06-T02 | TC-06-02 | Snapshot/version/phiếu |
| 06 | COGS/lợi nhuận | BR06: snapshot chi phí; thiếu lịch sử ghi unknown | OrderItem cost/report | W06-T03 | TC-06-03 | Tính tay Decimal |
| 07 | Thanh toán/đối soát | BR07: signature/amount/ref đúng, event một lần | Payment/Callback/Reconciliation | W07-T01; W07-T02; W07-T03; W07-T04 | TC-07-01…04 | Sandbox traces/mismatch report |
| 08 | Role/permissions | BR08: deny default, principal active | User/JWT/role/internal-auth | W02-T03; W08-T03; W10-T03 | TC-08-03; TC-10-03 | 401/403, zero writes |
| 09 | DB 27 bảng/16 ENUM/bảo toàn | BR09: không contract khi gate thiếu | Prisma/SQL/mapping/restore | W01-T02; W03-T01; W03-T02; W04-T02; W04-T03 | TC-04-02; TC-04-03 | ERD duyệt/diff/count/checksum/tồn/tiền |
| 10 | Registry/Calling/validate I-O | BR10: allowlist/schema trước dispatch | Gemini/registry/business adapters | W08-T01; W08-T02; W08-T04 | TC-08-01; TC-08-02; TC-08-04 | Golden tool labels/injection traces |
| 11 | Đa bước/retrieval/kho/NCC/đề xuất | BR11: read→rank→recommend→approve→draft, budget hữu hạn | Agent workflow/service adapters | W03-T03; W09-T01; W10-T01 | TC-09-01; TC-10-01 | Multi-step trace/nguồn dữ liệu |
| 12 | HITL và quyền ghi | BR12: approval gắn payload/version, recheck write | Approval server/UI/Execution | W08-T03; W10-T02 | TC-08-03; TC-10-02 | Stale/reject không write |
| 13 | Recovery/retry/idempotency | BR13: write uncertain tra key, không retry mù | Execution/ToolCall/PR keys | W09-T02; W09-T04 | TC-09-02; TC-09-04 | Timeout/restart/race tối đa một PR |
| 14 | History/log/evaluation | BR14: actor/correlation/step và redaction | Execution/ToolCall/Evaluation | W09-T03; W10-T04 | TC-09-03; TC-10-04 | Raw traces/manifest/usage missing |
| 15 | So sánh khoa học TLCN–KLTN | BR15: paired fixture/labels trước đo | Harness/raw JSONL/CSV | W03-T04; W11-T01; W11-T02; W11-T03; W11-T04 | TC-11-01…04 | Dataset/raw runs/CI/failure cases |
| 16 | Lịch/GVHD/luận văn/bàn giao | BR16: bằng chứng duyệt/nộp thật | Reports/thesis/demo | W01-T04; W02-T04; W12-T01; W12-T02; W12-T03; W12-T04 | TC-12-01…04 | Biên nhận/bản nộp/hướng dẫn |

16/16 nhóm có phương pháp xác minh dự kiến; chưa xác định tỷ lệ nghiệm thu thực tế. Chưa phát hiện yêu cầu trọng yếu bị bỏ trống trong master prompt. U01–U10 chưa xác minh; yêu cầu GVHD bổ sung phải có ID/task/test trước khi thêm phạm vi. Không coi model tồn tại là nghiệm thu chức năng.
