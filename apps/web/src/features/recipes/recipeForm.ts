import type { Ingredient } from '../../types/ingredient.types';
import type { CreateRecipePayload } from '../../types/recipe.types';

export type RecipeDraft = Required<Pick<CreateRecipePayload, 'yieldQuantity' | 'laborCost' | 'overheadCost' | 'note' | 'ingredients'>>;

export function recipeUnits(baseUnit: string): string[] {
  return baseUnit === 'g' ? ['g', 'kg'] : baseUnit === 'ml' ? ['ml', 'l'] : baseUnit ? [baseUnit] : [];
}

export function normalizedQuantity(quantity: number, unit: string, baseUnit: string): number | null {
  if (!Number.isFinite(quantity) || quantity <= 0 || !recipeUnits(baseUnit).includes(unit)) return null;
  return quantity * (unit === baseUnit ? 1 : 1000);
}

export function validateRecipe(draft: RecipeDraft, ingredients: Ingredient[]) {
  const fields: Record<string, string> = {};
  if (!draft.ingredients.length) fields.ingredients = 'Công thức cần ít nhất một nguyên liệu.';
  if (!Number.isFinite(draft.yieldQuantity) || draft.yieldQuantity <= 0) fields.yieldQuantity = 'Sản lượng phải lớn hơn 0.';
  for (const key of ['laborCost', 'overheadCost'] as const) {
    if (!Number.isFinite(draft[key]) || draft[key] < 0) fields[key] = 'Chi phí phải là số không âm.';
  }
  const used = new Set<string>();
  draft.ingredients.forEach((row, index) => {
    const ingredient = ingredients.find(item => item.id === row.ingredientId);
    if (!ingredient || !ingredient.isActive) fields[`row-${index}`] = 'Chọn nguyên liệu đang hoạt động.';
    else if (normalizedQuantity(row.quantity, row.unit, ingredient.baseUnit) === null) fields[`row-${index}`] = 'Định lượng phải lớn hơn 0; đơn vị phải cùng chiều khối lượng hoặc thể tích với nguyên liệu.';
    else if (used.has(row.ingredientId)) fields[`row-${index}`] = 'Nguyên liệu bị lặp. Gộp định lượng trong một dòng.';
    used.add(row.ingredientId);
  });
  return fields;
}

export function recipeError(error: unknown): string {
  const response = (error as { response?: { status?: number; data?: { message?: string } } })?.response;
  if (response?.status === 400) {
    const message = response.data?.message?.toLowerCase() ?? '';
    if (/unit|dimension|convert/.test(message)) return 'Đơn vị không hợp lệ hoặc khác chiều khối lượng/thể tích. Kiểm tra từng nguyên liệu.';
    if (/quantity|positive/.test(message)) return 'Định lượng và sản lượng phải lớn hơn 0.';
    if (/ingredient|empty|at least/.test(message)) return 'Công thức cần ít nhất một nguyên liệu hợp lệ.';
    return 'Dữ liệu công thức chưa hợp lệ. Kiểm tra định lượng, đơn vị và chi phí.';
  }
  const messages: Record<number, string> = {
    401: 'Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.',
    403: 'Bạn không có quyền thực hiện thao tác này. Chỉ ADMIN được tạo và kích hoạt công thức.',
    404: 'Không tìm thấy sản phẩm, nguyên liệu hoặc phiên bản công thức. Vui lòng tải lại dữ liệu.',
    409: 'Công thức xung đột với dữ liệu hiện tại. Kiểm tra trạng thái nguyên liệu và tải lại trước khi thử lại.',
    500: 'Máy chủ chưa thể xử lý công thức. Vui lòng thử lại sau.',
  };
  return response?.status ? messages[response.status] ?? 'Không thể hoàn tất thao tác công thức. Vui lòng thử lại sau.' : 'Chưa nhận được xác nhận từ máy chủ. Nội dung nhập được giữ nguyên; tải lại danh sách phiên bản trước khi gửi lại.';
}
