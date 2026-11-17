export type ProductFailure = { message: string; kind: 'sku' | 'stale' | 'recipe' | 'history' | 'other' };

// Match known business failures only; never display server diagnostics.
export function productFailure(error: unknown, action: 'read' | 'save' | 'delete' = 'save'): ProductFailure {
  const response = (error as { response?: { status?: number; data?: { message?: string; code?: string } } })?.response;
  const status = response?.status;
  const detail = `${response?.data?.code ?? ''} ${response?.data?.message ?? ''}`.toLowerCase();
  if (status === 409) {
    if (/sku/.test(detail)) return { kind: 'sku', message: 'Mã SKU đã được sử dụng. Vui lòng chọn mã khác.' };
    if (/changed|reload|stale|version|concurr|đã thay đổi|phiên bản/.test(detail)) return { kind: 'stale', message: 'Sản phẩm đã thay đổi. Tải lại dữ liệu trước khi lưu; nội dung đang nhập được giữ nguyên cho đến khi bạn tải lại.' };
    if (action === 'delete') return { kind: 'history', message: 'Sản phẩm có lịch sử liên quan nên không thể xóa. Bạn có thể ngưng bán để giữ nguyên dữ liệu lịch sử.' };
    if (/recipe|classification|unreviewed|ingredient|công thức|phân loại/.test(detail)) return { kind: 'recipe', message: 'Chưa đủ điều kiện bán. Cần phân loại sản phẩm và kiểm tra công thức đang hoạt động, nguyên liệu cùng định lượng hợp lệ.' };
    return { kind: 'other', message: 'Thao tác xung đột với dữ liệu hiện tại. Kiểm tra sản phẩm và tải lại trước khi thử lại.' };
  }
  const messages: Record<number, string> = {
    400: 'Dữ liệu chưa hợp lệ hoặc chưa đủ điều kiện thực hiện. Kiểm tra các trường và thời hạn chờ xóa.',
    401: 'Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.',
    403: 'Bạn không có quyền thực hiện thao tác này.',
    404: 'Không tìm thấy sản phẩm hoặc danh mục. Vui lòng tải lại danh sách.',
    500: 'Hệ thống chưa thể xử lý yêu cầu. Vui lòng thử lại sau.',
    502: 'Dịch vụ liên quan chưa sẵn sàng. Vui lòng thử lại sau.',
    503: 'Dịch vụ tạm thời không khả dụng. Vui lòng thử lại sau.',
  };
  return { kind: 'other', message: status ? messages[status] ?? 'Không thể hoàn tất yêu cầu. Vui lòng thử lại sau.' : action === 'read' ? 'Không thể kết nối để tải sản phẩm. Kiểm tra kết nối rồi thử lại.' : 'Chưa nhận được xác nhận từ máy chủ. Dữ liệu nhập vẫn được giữ; kiểm tra lại sản phẩm trước khi gửi lại.' };
}

export function validateProduct(fields: { name: string; sku: string; description: string; price: number; unit: string; categoryId: string; requiresRecipe: boolean | null; isActive: boolean }) {
  const errors: Partial<Record<keyof typeof fields, string>> = {};
  if (!fields.name.trim() || fields.name.trim().length > 255) errors.name = 'Tên sản phẩm cần từ 1 đến 255 ký tự.';
  if (fields.sku.trim().length > 100) errors.sku = 'Mã SKU tối đa 100 ký tự.';
  if (fields.description.trim().length > 1000) errors.description = 'Mô tả tối đa 1.000 ký tự.';
  if (!Number.isFinite(fields.price) || fields.price < 0 || fields.price > 9999999999.99 || Math.abs(fields.price * 100 - Math.round(fields.price * 100)) > 0.0001) errors.price = 'Giá từ 0 đến 9.999.999.999,99; tối đa 2 chữ số thập phân.';
  if (!['gói', 'hộp', 'thùng', 'bao', 'kg', 'gram', 'chai'].includes(fields.unit)) errors.unit = 'Chọn đơn vị bán hợp lệ.';
  if (!fields.categoryId) errors.categoryId = 'Vui lòng chọn danh mục sản phẩm.';
  if (fields.isActive && fields.requiresRecipe === null) errors.requiresRecipe = 'Cần phân loại công thức trước khi bật bán.';
  return errors;
}
