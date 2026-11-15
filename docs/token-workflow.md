# Quy trình tiết kiệm token

1. Xác định yêu cầu, phạm vi file và tiêu chí hoàn tất. Xem trạng thái Git để bảo vệ thay đổi có sẵn.
2. Tìm đường dẫn theo tên/glob, tìm symbol theo mẫu, đọc từng đoạn cần thiết. Không nạp toàn bộ repository vào ngữ cảnh.
3. Thực hiện thay đổi nhỏ. Dùng Python để tổng hợp dữ liệu và tính metrics; lưu artifact lớn trên đĩa, chỉ đưa số liệu cần thiết vào kết quả.
4. Chạy test bị ảnh hưởng. Khi thay đổi quan trọng, chạy full suite được repository định nghĩa trước khi hoàn tất. Không tự đoán lệnh test hoặc tuyên bố pass khi chưa chạy.
5. Kiểm tra whitespace, thống kê và diff của từng file thay đổi theo AGENTS.md. Không đưa toàn bộ diff hoặc log vào câu trả lời.
6. Trả JSON ngắn với result, errors, next. Nếu không có lỗi hoặc bước tiếp theo thì dùng mảng rỗng.

## Checkpoint cho tác vụ dài

Sao chép task-state.example.json sang vị trí checkpoint đã thống nhất khi cần. Giữ tối đa khoảng 40 dòng; thay thế trạng thái cũ thay vì nối lịch sử vô hạn. Không thêm checkpoint của tác vụ thường lệ nếu hội thoại hiện tại đã đủ ngữ cảnh.

- scope: đường dẫn thực tế cần đọc/sửa.
- verified: kết luận đã kiểm chứng cùng bằng chứng ngắn hoặc đường dẫn.
- checks: lệnh, phạm vi và trạng thái pass/fail/blocked/not_run; không chứa log đầy đủ.
- next: phần việc chưa xong, không chép lại phần đã hoàn thành.
- invalidation: thay đổi nào khiến kết quả cũ cần kiểm tra lại.

Chỉ đọc lại file liên quan khi tiếp tục. Checkpoint là gợi ý ngữ cảnh, không thay thế trạng thái Git và kiểm chứng hiện tại.

## Giới hạn đầu ra

Giới hạn một lần tìm kiếm ở khoảng 50 dòng, một đoạn đọc ở khoảng 120 dòng; thu hẹp truy vấn hoặc phân trang nếu chưa đủ. Với subprocess/test, giữ log đầy đủ trong artifact cục bộ khi cần, chỉ trích lỗi đầu tiên liên quan và đường dẫn log. Luôn giữ exit code gốc, không để cắt log che lỗi test.

Hiện repository chưa xác định có mã MQL5/ML. Khi thêm phần này, ghi rõ đường dẫn source, lệnh compile, test chọn lọc và full suite trong tài liệu module; không tạo lệnh giả định.
