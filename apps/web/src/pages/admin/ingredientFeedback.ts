import type { CreateIngredientPayload, Ingredient } from '../../types/ingredient.types';

export function ingredientPatch(original: Ingredient, values: Partial<CreateIngredientPayload>): Partial<CreateIngredientPayload> {
  return Object.fromEntries(Object.entries(values).filter(([key, value]) => value !== undefined && value !== original[key as keyof Ingredient]));
}
export function ingredientError(error: unknown): string {
  const response = (error as { response?: { status?: number; data?: { message?: string } } })?.response;
  const detail = response?.data?.message?.toLowerCase() ?? '';
  switch (response?.status) {
    case 400: return /unit|đơn vị|quy đổi/.test(detail) ? 'Đơn vị không tương thích. Chọn đơn vị cùng nhóm với nguyên liệu.' : 'Dữ liệu hoặc số lượng không hợp lệ. Kiểm tra tồn khả dụng và lô đã chọn.';
    case 401: return 'Phiên đăng nhập hết hạn. Vui lòng đăng nhập lại.';
    case 403: return 'Bạn không có quyền thực hiện thao tác này. Liên hệ quản trị viên.';
    case 404: return 'Không tìm thấy dữ liệu. Kiểm tra mã hoặc tải lại danh sách.';
    case 409:
      if (/sku|đã tồn tại/.test(detail)) return 'Mã SKU đã tồn tại. Vui lòng chọn mã khác.';
      if (/base unit|đơn vị/.test(detail)) return 'Nguyên liệu đã được sử dụng: giữ nguyên đơn vị chuẩn, chọn đơn vị quy đổi khi nhập kho.';
      if (/request id/.test(detail)) return 'Mã thao tác đã dùng cho nội dung khác. Kiểm tra lịch sử trước khi tạo thao tác mới.';
      return 'Tồn kho đã thay đổi hoặc đang được giữ cho đơn. Tải lại dữ liệu và kiểm đếm lại trước khi duyệt.';
    case 500: return 'Máy chủ chưa xử lý được yêu cầu. Kiểm tra lịch sử trước khi thử lại.';
    default: return 'Chưa xác nhận được kết quả kết nối. Nội dung được giữ nguyên; kiểm tra lịch sử trước khi thử lại.';
  }
}
export const availableStock = (ingredient: Pick<Ingredient, 'availableQuantity'>) => Number.isFinite(ingredient.availableQuantity) ? Math.max(0, ingredient.availableQuantity) : 0;
