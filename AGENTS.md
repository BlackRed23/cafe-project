# Quy tắc làm việc và tiết kiệm token

## Phạm vi
- Áp dụng cho toàn bộ repository; đọc thêm AGENTS.md trong thư mục đích nếu có.
- Repository hiện là cafe-project (TypeScript). Quy tắc MQL5 + ML bên dưới chỉ áp dụng cho phần tương ứng khi được thêm vào; không tự chuyển đổi kiến trúc.
- Chỉ gọi MCP hoặc Skills khi tác vụ thực sự cần; tuân thủ các yêu cầu bắt buộc của môi trường.

## Đọc và xử lý
- Bắt đầu bằng git status --short, xác định phạm vi file và tiêu chí hoàn tất.
- Dùng rg --files với glob để tìm đường dẫn, rồi rg -n với mẫu cụ thể. Chỉ đọc đoạn liên quan; mở rộng sang dependency trực tiếp khi có lý do.
- Không quét toàn bộ source, dump dữ liệu, in toàn bộ file hoặc log. Giới hạn kết quả tìm kiếm và đầu ra lệnh; tóm tắt số lượng, lỗi và vị trí cần sửa.
- Không đọc secrets, dữ liệu thô, model binary, node_modules, môi trường ảo, cache hoặc build output trừ khi cần trực tiếp cho tác vụ.
- Ưu tiên Python scripts cho xử lý dữ liệu, thống kê và tính toán; dùng thư viện chuẩn nếu đủ. Xử lý dữ liệu lớn theo batch/chunk.
- Không lặp lại phân tích đã hoàn thành. Tái sử dụng kết quả còn hợp lệ; kiểm tra lại khi đầu vào, code hoặc môi trường liên quan thay đổi.

## Thay đổi và kiểm thử
- Giữ thay đổi nhỏ, đúng phạm vi; không ghi đè thay đổi chưa commit của người dùng.
- Trong quá trình sửa, chỉ chạy lại test bị ảnh hưởng và dependency trực tiếp.
- Trước khi hoàn tất thay đổi quan trọng (logic giao dịch, quản trị rủi ro, dữ liệu/features, train/inference, API/schema hoặc dependency dùng chung), chạy full test suite đã được dự án định nghĩa. Kiểm tra compile/build liên quan.
- Không coi test bị bỏ qua, thiếu runtime hoặc không có suite là đã pass. Nếu không chạy được, báo rõ lỗi và bước tiếp theo; không khẳng định thay đổi đã được xác minh đầy đủ.
- Chỉ sửa tài liệu: kiểm tra nội dung và diff; không cần chạy lại test ứng dụng.
- Dùng git diff --check và git diff --stat, sau đó xem git diff -- <các file đã sửa>. Với file mới chưa tracked, dùng git diff --no-index -- /dev/null <file> (Windows dùng NUL); exit code 1 nghĩa là có diff.
- Không stage, commit hoặc push nếu chưa được yêu cầu.

## MQL5 + ML
- MQL5: compile EA/indicator/library bị ảnh hưởng bằng công cụ dự án hiện có; kiểm tra symbol, timeframe, point/digits, lot step, spread, stop levels và mã trả về giao dịch khi có liên quan.
- Kiểm thử trading bằng Strategy Tester/demo; không tự gửi lệnh tài khoản thật hoặc thay cấu hình live.
- ML: chia dữ liệu theo thời gian; fit scaler/feature selection chỉ trên tập train. Ngăn leakage và look-ahead; kiểm tra sự thống nhất feature giữa train và inference.
- Ghi seed, phiên bản dữ liệu/model/config và khoảng thời gian đánh giá. Tính phí, spread và slippage trong đánh giá chiến lược khi có liên quan.
- Không gửi dataset, checkpoint hoặc lịch sử từng tick vào hội thoại. Trả metrics tổng hợp, số mẫu và đường dẫn artifact.

## Ngữ cảnh và đầu ra
- Dùng docs/token-workflow.md cho quy trình; docs/task-state.example.json là mẫu checkpoint, không phải trạng thái tác vụ thực tế.
- Chỉ tạo/cập nhật checkpoint khi tác vụ dài hoặc cần bàn giao; ghi kết quả đã xác minh, file liên quan và việc còn lại. Không lưu source, log đầy đủ hoặc bí mật.
- Trả lời ngắn bằng JSON hợp lệ, chỉ gồm: {"result":[],"errors":[],"next":[]}.
- Không kể lại quá trình hoặc nhắc lại phân tích. Khi cần hỏi thông tin thiết yếu, đưa câu hỏi vào next.

## Context Engine (CCE)

This project uses Code Context Engine for intelligent code retrieval and
cross-session memory.

### Searching the codebase

**Use `context_search` instead of reading files directly** when exploring
the codebase, answering questions about code, or understanding how things
work. `context_search` returns the most relevant code chunks with
confidence scores instead of whole files.

When to use `context_search`:
- Answering questions about the codebase ("how does X work?", "where is Y?")
- Exploring structure or architecture
- Finding related code, functions, or patterns

Other tools:
- `expand_chunk` for full source of a compressed result
- `related_context` for what calls/imports a function
- `session_recall` to recall past decisions

### Cross-session memory

Call `session_recall("topic phrase")` before answering non-trivial questions.
Call `record_decision(decision="...", reason="...")` after making choices.
Call `record_code_area(file_path="...", description="...")` after meaningful work.

### Output style

Respond in compressed style. Drop articles (a, an, the) in prose. Use
sentence fragments over full sentences. Use short synonyms (fix not resolve,
check not investigate). Pattern: [thing] [action] [reason]. [next step].
No filler, hedging, pleasantries, trailing summaries, or restating what
the user said. One sentence if one sentence is enough.

When suggesting code changes, show only the changed lines with 3 lines of
context. Never rewrite entire files. Multiple changes in one file: show each
change separately. Never echo back unchanged code the user already has.

Code blocks, file paths, commands, error messages: always written in full.
Security warnings and destructive action confirmations: use full clarity.
