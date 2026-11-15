# Sổ rủi ro

Định tính PROPOSED, không là tần suất sự cố đã đo. 10 rủi ro: **8 P0**, 2 P1. Owner thực đều UNASSIGNED; vai trò dưới đây để phân công sau. Rà soát mỗi tuần.

| ID | Mô tả | Xác suất | Tác động | Ưu tiên | Giảm thiểu | Dự phòng | Vai trò |
|---|---|---|---|---|---|---|---|
| R01 | Migration mất dữ liệu/drift SQL | Cao | Nghiêm trọng | P0 | Diff/mapping ký duyệt, backup/restore bản sao | Dừng chuyển đổi, giữ hệ cũ; xử lý dữ liệu sau snapshot | DBA |
| R02 | Kho lệch/âm/race/trừ lặp | Cao | Nghiêm trọng | P0 | Transaction, khóa thứ tự, invariant, concurrency PostgreSQL | Chặn ghi, đối soát và điều chỉnh có duyệt | Backend |
| R03 | Vượt quyền/lộ dữ liệu | Vừa | Nghiêm trọng | P0 | Principal server, deny default, redaction, negative tests | Khóa chức năng lỗi/thu hồi quyền, xử lý secret cùng chủ hệ thống | Security |
| R04 | Callback giả/trùng/đảo thứ tự | Cao | Nghiêm trọng | P0 | Signature/amount/ref, unique event, atomic update | Giữ uncertain và đối soát tay | Backend |
| R05 | LLM sai/injection/NCC hoặc lượng không hợp lệ | Cao | Cao | P0 | Schema I/O, allowlist, finite/range, HITL | Rules có nhãn hoặc từ chối an toàn | AI |
| R06 | Agent tự mua/retry uncertain | Vừa | Nghiêm trọng | P0 | Approval hash/version, recheck quyền, key nguyên tử | Dừng write và tra kết quả trước xử lý tay | AI/Backend |
| R07 | API/model/sandbox không khả dụng/quá budget | Vừa | Cao | P1 | Timeout/budget/read backoff, xác minh model lúc triển khai | Offline mock có nhãn, không thay bằng production | Integration |
| R08 | Dataset ít/thiên lệch/baseline không tương đương | Cao | Cao | P1 | Khóa labels, paired cases, review mẫu, CI | Thu hẹp kết luận, tăng case hoặc báo giới hạn | QA/Research |
| R09 | Thiếu nghiệm thu W01–04/nhân lực | Cao | Cao | P0 | Ước lượng lại, giữ đường găng/AI/evaluation | Điều chỉnh lịch hoặc giảm phụ trợ qua GVHD | Quản lý đề tài |
| R10 | Thiếu duyệt GVHD/lịch/SQL chuẩn | Cao | Cao | P0 | Đóng U01/U06/U07 bằng văn bản | Đóng băng quyết định phá vỡ, chuẩn bị mock/design | Sinh viên/GVHD |

Vi phạm invariant/quyền/duplicate kích hoạt dừng write. Callback lệch giữ uncertain. Thiếu quyết định DB chặn migration. Nếu G04 chưa qua 09/11, tái lập lịch ở tracker. Mỗi rủi ro cần ngày review, người phụ trách thật, chứng cứ giảm thiểu và mức còn lại trong báo cáo tuần.
