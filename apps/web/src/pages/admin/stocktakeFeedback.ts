import type { StocktakeData, StocktakeStatus } from '../../types/stocktake.types';
export const labels: Record<StocktakeStatus,string> = {
  DRAFT:'Đang kiểm đếm', PENDING_APPROVAL:'Chờ phê duyệt',
  NEEDS_INVESTIGATION:'Cần điều tra', COMPLETED:'Đã hoàn tất', REJECTED:'Đã từ chối',
};
export const errorCode = (e:unknown) => (e as {response?:{status?:number}})?.response?.status;
export const uncertainError = (e:unknown) => !errorCode(e) || errorCode(e) === 408 || errorCode(e)! >= 500;
export function stocktakeError(e:unknown):string {
  const code=errorCode(e);
  if(code===401) return 'Phiên đăng nhập hết hạn. Hãy đăng nhập lại.';
  if(code===403) return 'Không đủ quyền thao tác hoặc bạn đang tự phê duyệt phiên được phân công.';
  if(code===404) return 'Không tìm thấy phiên hoặc lô. Kiểm tra mã và tải lại.';
  if(code===409) return 'Dữ liệu kho hoặc phiên đếm đã thay đổi. Giữ số đếm của bạn, tải lại phiên để đối chiếu; không gửi lại tự động.';
  if(code===400) return 'Thông tin không hợp lệ. Kiểm tra lô, lượng đếm, nhân viên và lý do.';
  return 'Chưa xác định được kết quả máy chủ. Đối soát phiên trước khi thử lại cùng mã yêu cầu.';
}
export const mayApprove = (data:StocktakeData, userId:string, isAdmin:boolean) =>
  isAdmin && data.session.status==='PENDING_APPROVAL' && data.session.assignedCounterId!==userId;
export const countIsSaved = (qty:string|null) => qty!==null;
