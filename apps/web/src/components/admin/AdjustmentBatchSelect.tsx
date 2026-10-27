import type { Inventory } from "../../types/inventory.types";
export const eligibleAdjustmentBatches = (inventory: Inventory, now = Date.now()) =>
  (inventory.batches ?? []).filter(batch => Number.isFinite(Date.parse(batch.expirationDate)) && Date.parse(batch.expirationDate) > now && batch.quantity >= 0);
export function AdjustmentBatchSelect({ inventory, value, onChange }: { inventory: Inventory; value: string; onChange: (id: string) => void }) {
  const batches = eligibleAdjustmentBatches(inventory);
  return <label className="block text-sm font-medium text-slate-700">
    Lô cần kiểm kê
    <select required value={value} onChange={event => onChange(event.target.value)} className="block w-full border rounded-lg p-2 my-2">
      <option value="">Chọn lô còn hạn</option>
      {batches.map(batch => <option key={batch.id} value={batch.id}>{batch.batchCode} — Tồn: {batch.quantity} {inventory.unit} — HSD: {new Date(batch.expirationDate).toLocaleString("vi-VN")}</option>)}
    </select>
    {batches.length === 0 && <span role="alert">Không có lô còn hạn để điều chỉnh. Tồn không có lô hoặc lô hết hạn cần được đối soát; không tự tạo lô thay thế.</span>}
    <span className="block text-xs">Nhập số lượng thực tế của lô đã chọn. Tổng kho thay đổi theo chênh lệch của lô; hàng đang giữ cho đơn được bảo vệ.</span>
  </label>;
}
