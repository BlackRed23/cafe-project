import type { LotBatch, LotOutbound, LotReturn } from '../../types/ingredient-batch.types';
export const expiryLabels: Record<string, string> = { VALID: 'Còn hạn', NEAR_EXPIRY: 'Sắp hết hạn', EXPIRED: 'Đã hết hạn', NO_EXPIRY: 'Không có hạn dùng' };
export const qualityLabels: Record<string, string> = { AVAILABLE: 'Đạt điều kiện chất lượng', QUARANTINED: 'Cách ly', RECALLED: 'Đã thu hồi', UNKNOWN: 'Chưa xác minh' };
export const lotNumber = (n: number | string) => Number.isFinite(Number(n)) ? Number(n).toLocaleString('vi-VN', { maximumFractionDigits: 3 }) : '—';
export const lotDate = (s: string | null) => s && Number.isFinite(Date.parse(s)) ? new Date(s).toLocaleString('vi-VN') : '—';
export function filterLots(batches: LotBatch[], quality: string, expiry: string) {
  return batches.filter(b => (!quality || b.qualityStatus === quality) && (!expiry || b.expiryStatus === expiry));
}
export function returnCapacity(source: LotOutbound, returns: LotReturn[]) {
  if (source.type !== 'CONSUME' || !source.batchId || !Number.isFinite(Number(source.quantity)) || Number(source.quantity) >= 0) return 0;
  const returned = returns.filter(r => r.sourceTransactionId === source.id).reduce((sum, r) => sum + Number(r.quantity), 0);
  return Number.isFinite(returned) ? Math.max(0, Math.round((-Number(source.quantity) - returned) * 1000) / 1000) : 0;
}
export function validReturnQuantity(value: string, maximum: number) {
  const n = Number(value);
  return value.trim() !== '' && Number.isFinite(n) && n > 0 && n <= maximum && Math.abs(n * 1000 - Math.round(n * 1000)) < 0.000001;
}
export function lotError(error: unknown): string {
  const r = (error as { response?: { status?: number; data?: { message?: string } } })?.response;
  const message = r?.data?.message?.toLowerCase() ?? '';
  if (r?.status === 401) return 'Phiên đăng nhập hết hạn. Vui lòng đăng nhập lại.';
  if (r?.status === 403) return 'Bạn không có quyền thực hiện thao tác này. Cần tài khoản ADMIN.';
  if (r?.status === 404) return 'Không tìm thấy nguyên liệu hoặc lô. Tải lại danh sách để kiểm tra.';
  if (r?.status === 409) {
    if (/exceeds unreturned/.test(message)) return 'Lượng hoàn vượt lượng đã xuất còn được phép hoàn. Tải lại truy xuất và giảm số lượng.';
    if (/request id/.test(message)) return 'Mã thao tác đã gắn với nội dung khác. Đối chiếu lịch sử và mã thao tác trước khi tạo yêu cầu mới.';
    if (/cannot be deleted|deletion is disabled/.test(message)) return 'Lô có lịch sử hoặc liên kết nghiệp vụ, không hỗ trợ xóa. Dùng cách ly hoặc thu hồi có lý do.';
    if (/classify/.test(message)) return 'Nguyên liệu mới chưa được phân loại hạn dùng. ADMIN cần chọn phân loại trước khi nhập kho.';
    if (/original consume/.test(message)) return 'Giao dịch nguồn không khớp nguyên liệu và lô. Tải lại truy xuất, chọn đúng giao dịch CONSUME.';
    return 'Dữ liệu đã thay đổi hoặc thao tác xung đột. Tải lại truy xuất, đối chiếu lịch sử trước khi thử lại.';
  }
  if (r?.status === 400) return 'Dữ liệu không hợp lệ. Kiểm tra số lượng tối đa 3 chữ số thập phân và lý do.';
  return 'Chưa xác nhận được kết quả từ máy chủ. Giữ mã thao tác và nội dung; thử lại cùng mã hoặc đối chiếu lịch sử.';
}
export function keepLotIntent(error: unknown) {
  const status = (error as { response?: { status?: number } })?.response?.status;
  return !status || status >= 500 || status === 408 || status === 409 || status === 429;
}

export function lotImportExpiryError(ingredient: { expiryClassification?: string | null; expiryClassificationRequired?: boolean }, value: string): string {
  if (!ingredient.expiryClassification && ingredient.expiryClassificationRequired) return 'Nguyên liệu mới cần được ADMIN phân loại hạn dùng trước khi nhập kho.';
  if (ingredient.expiryClassification === 'PERISHABLE' && !value) return 'Nguyên liệu dễ hỏng cần ngày hết hạn hợp lệ được nhập rõ ràng.';
  if (value && (!/^\d{4}-\d{2}-\d{2}$/.test(value) || !Number.isFinite(Date.parse(value)) || new Date(value).toISOString().slice(0,10) !== value)) return 'Ngày hết hạn không hợp lệ. Kiểm tra đúng ngày, tháng và năm.';
  return '';
}
