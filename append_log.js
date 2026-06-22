const fs = require('fs');
fs.appendFileSync('docs/FRONTEND_BACKEND_INTEGRATION_LOG.md', `

### Step 41: Inventory Import Modal Unit Clarity And Supplier Conversion
- **Mục tiêu**: Làm rõ đơn vị khi nhập kho và hỗ trợ quy đổi tự động từ quy cách Nhà cung cấp sang đơn vị tồn kho nội bộ.
- **Frontend**: \`apps/web/src/pages/admin/AdminInventoryPage.tsx\` Thêm tuỳ chọn "Nhập theo Đơn vị tồn kho nội bộ / Quy cách nhà cung cấp" trong modal nhập kho (nếu sản phẩm có cấu hình \`SupplierProduct\`). Tính toán \`finalQuantity\` và truyền đúng payload \`quantity\` cho API \`importInventory\`. Hiển thị cảnh báo nếu \`conversionTargetUnit\` không khớp với đơn vị nội bộ.
- **Backend**: Giữ nguyên API \`importInventory\`.
- **Trạng thái**: Hoàn thành.
`);
