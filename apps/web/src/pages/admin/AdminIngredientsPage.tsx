import React, { useState, useEffect, useCallback } from "react";
import { Link } from "react-router-dom";
import { ingredientsApi } from "../../api/ingredients.api";
import type {
  Ingredient,
  WasteReason,
} from "../../types/ingredient.types";
import { formatCurrency } from "../../utils/formatCurrency";
import { formatDate } from "../../utils/formatDate";
import { Loading } from "../../components/common/Loading";
import { Button } from "../../components/common/Button";
import { Input } from "../../components/common/Input";
import { Modal } from "../../components/common/Modal";
import { getErrorMessage } from "../../api/client";
import { useToast } from "../../contexts/ToastContext";
import { useAuth } from "../../contexts/AuthContext";
import {
  Plus,
  Search,
  PackagePlus,
  Flame,
  Eye,
  Edit2,
  AlertTriangle,
  Boxes,
  DollarSign,
} from "lucide-react";

const WASTE_REASON_LABELS: Record<WasteReason, string> = {
  EXPIRED: "Hết hạn sử dụng",
  DAMAGED: "Hư hỏng / Đổ vỡ",
  STAFF_ERROR: "Pha chế sai / Thao tác lỗi",
  CUSTOMER_CANCELLED: "Khách hủy sau khi pha",
};

export const AdminIngredientsPage: React.FC = () => {
  const toast = useToast();
  const { isStaff } = useAuth();
  const [ingredients, setIngredients] = useState<Ingredient[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [onlyLowStock, setOnlyLowStock] = useState(false);

  // Create / Edit Modal
  const [formOpen, setFormOpen] = useState(false);
  const [editingIng, setEditingIng] = useState<Ingredient | null>(null);
  const [name, setName] = useState("");
  const [sku, setSku] = useState("");
  const [baseUnit, setBaseUnit] = useState("g");
  const [costPerBaseUnit, setCostPerBaseUnit] = useState("0");
  const [minThreshold, setMinThreshold] = useState("100");
  const [shelfLifeDays, setShelfLifeDays] = useState("180");
  const [submittingForm, setSubmittingForm] = useState(false);

  // Import Modal
  const [importTarget, setImportTarget] = useState<Ingredient | null>(null);
  const [importQty, setImportQty] = useState("");
  const [importUnit, setImportUnit] = useState("");
  const [importCostMode, setImportCostMode] = useState<"unitCost" | "totalCost">("totalCost");
  const [importCostVal, setImportCostVal] = useState("");
  const [importBatchCode, setImportBatchCode] = useState("");
  const [importExpiry, setImportExpiry] = useState("");
  const [importNote, setImportNote] = useState("");
  const [submittingImport, setSubmittingImport] = useState(false);

  // Waste Modal
  const [wasteTarget, setWasteTarget] = useState<Ingredient | null>(null);
  const [wasteQty, setWasteQty] = useState("");
  const [wasteReason, setWasteReason] = useState<WasteReason>("EXPIRED");
  const [wasteBatchId, setWasteBatchId] = useState("");
  const [wasteNote, setWasteNote] = useState("");
  const [submittingWaste, setSubmittingWaste] = useState(false);

  const loadData = useCallback(async () => {
    try {
      setIsLoading(true);
      const data = await ingredientsApi.getIngredients({
        search: search.trim() || undefined,
        lowStock: onlyLowStock || undefined,
      });
      setIngredients(data);
    } catch (err) {
      toast.error(getErrorMessage(err) || "Không thể tải danh sách nguyên liệu.");
    } finally {
      setIsLoading(false);
    }
  }, [search, onlyLowStock, toast]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const openCreateModal = () => {
    setEditingIng(null);
    setName("");
    setSku("");
    setBaseUnit("g");
    setCostPerBaseUnit("0");
    setMinThreshold("500");
    setShelfLifeDays("180");
    setFormOpen(true);
  };

  const openEditModal = (ing: Ingredient) => {
    setEditingIng(ing);
    setName(ing.name);
    setSku(ing.sku);
    setBaseUnit(ing.baseUnit);
    setCostPerBaseUnit(String(ing.costPerBaseUnit));
    setMinThreshold(String(ing.minThreshold));
    setShelfLifeDays(ing.shelfLifeDays ? String(ing.shelfLifeDays) : "");
    setFormOpen(true);
  };

  const handleSaveIngredient = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      toast.error("Vui lòng nhập tên nguyên liệu.");
      return;
    }
    setSubmittingForm(true);
    try {
      const payload = {
        name: name.trim(),
        sku: sku.trim() || undefined,
        baseUnit: baseUnit.trim() || "g",
        costPerBaseUnit: Number(costPerBaseUnit) || 0,
        minThreshold: Number(minThreshold) || 0,
        shelfLifeDays: shelfLifeDays ? Number(shelfLifeDays) : null,
      };
      if (editingIng) {
        await ingredientsApi.updateIngredient(editingIng.id, payload);
        toast.success("Cập nhật nguyên liệu thành công.");
      } else {
        await ingredientsApi.createIngredient(payload);
        toast.success("Tạo nguyên liệu mới thành công.");
      }
      setFormOpen(false);
      await loadData();
    } catch (err) {
      toast.error(getErrorMessage(err) || "Không thể lưu nguyên liệu.");
    } finally {
      setSubmittingForm(false);
    }
  };

  const openImportModal = (ing: Ingredient) => {
    setImportTarget(ing);
    setImportQty("");
    setImportUnit(ing.baseUnit);
    setImportCostMode("totalCost");
    setImportCostVal("");
    setImportBatchCode("");
    const defaultExp = new Date();
    defaultExp.setDate(defaultExp.getDate() + (ing.shelfLifeDays || 180));
    setImportExpiry(defaultExp.toISOString().split("T")[0] || "");
    setImportNote("");
  };

  const handleImportSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!importTarget) return;
    const qty = Number(importQty);
    const cost = Number(importCostVal);
    if (!qty || qty <= 0) {
      toast.error("Số lượng nhập phải lớn hơn 0.");
      return;
    }
    if (Number.isNaN(cost) || cost < 0) {
      toast.error("Vui lòng nhập chi phí hợp lệ.");
      return;
    }

    setSubmittingImport(true);
    try {
      const res = await ingredientsApi.importStock(importTarget.id, {
        quantity: qty,
        unit: importUnit || importTarget.baseUnit,
        ...(importCostMode === "totalCost" ? { totalCost: cost } : { unitCost: cost }),
        batchCode: importBatchCode.trim() || undefined,
        expirationDate: importExpiry || undefined,
        note: importNote.trim() || undefined,
      });
      toast.success(
        `Đã nhập kho ${res.batch.importedQuantityBase} ${importTarget.baseUnit}. Đã cập nhật giá vốn cho ${res.recalculatedProductCount} món.`
      );
      setImportTarget(null);
      await loadData();
    } catch (err) {
      toast.error(getErrorMessage(err) || "Nhập kho nguyên liệu thất bại.");
    } finally {
      setSubmittingImport(false);
    }
  };

  const openWasteModal = (ing: Ingredient) => {
    setWasteTarget(ing);
    setWasteQty("");
    setWasteReason("EXPIRED");
    setWasteBatchId("");
    setWasteNote("");
  };

  const handleWasteSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!wasteTarget) return;
    const qty = Number(wasteQty);
    if (!qty || qty <= 0) {
      toast.error("Số lượng hao hụt phải lớn hơn 0.");
      return;
    }
    setSubmittingWaste(true);
    try {
      const res = await ingredientsApi.recordWaste(wasteTarget.id, {
        quantity: qty,
        unit: wasteTarget.baseUnit,
        wasteReason,
        batchId: wasteBatchId || undefined,
        note: wasteNote.trim() || undefined,
      });
      toast.success(
        `Đã ghi nhận hao hụt ${res.wastedQuantityBase} ${wasteTarget.baseUnit} (Chi phí: ${formatCurrency(res.totalWasteCost)}).`
      );
      setWasteTarget(null);
      await loadData();
    } catch (err) {
      toast.error(getErrorMessage(err) || "Ghi nhận hao hụt thất bại.");
    } finally {
      setSubmittingWaste(false);
    }
  };

  const totalInventoryValue = ingredients.reduce((s, i) => s + (i.stockValue || 0), 0);
  const lowStockCount = ingredients.filter(
    (i) => i.status === "LOW_STOCK" || i.status === "OUT_OF_STOCK"
  ).length;

  return (
    <div className="flex flex-col gap-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-black text-slate-800 font-serif">
            Nguyên liệu & Giá vốn
          </h2>
          <p className="text-sm text-slate-500 mt-0.5">
            Quản lý tồn kho nguyên liệu pha chế, lô nhập FIFO và đơn giá vốn bình quân gia quyền
          </p>
        </div>
        {!isStaff && (
          <Button
            onClick={openCreateModal}
            className="bg-amber-800 hover:bg-amber-900 text-white flex items-center gap-1.5"
          >
            <Plus size={16} /> Thêm nguyên liệu
          </Button>
        )}
      </div>

      {/* Summary cards */}
      <div className="grid sm:grid-cols-3 gap-4">
        <div className="bg-white rounded-2xl border border-slate-200/80 p-5 shadow-sm flex items-center gap-4">
          <div className="p-3 rounded-xl bg-amber-100 text-amber-800">
            <Boxes size={22} />
          </div>
          <div>
            <span className="text-xs font-bold uppercase text-slate-400">
              Tổng số nguyên liệu
            </span>
            <p className="text-2xl font-black text-slate-800 font-serif">
              {ingredients.length}
            </p>
          </div>
        </div>
        <div className="bg-white rounded-2xl border border-slate-200/80 p-5 shadow-sm flex items-center gap-4">
          <div className="p-3 rounded-xl bg-emerald-100 text-emerald-700">
            <DollarSign size={22} />
          </div>
          <div>
            <span className="text-xs font-bold uppercase text-slate-400">
              Tổng giá trị tồn nguyên liệu
            </span>
            <p className="text-2xl font-black text-emerald-700 font-serif">
              {formatCurrency(totalInventoryValue)}
            </p>
          </div>
        </div>
        <div className="bg-white rounded-2xl border border-slate-200/80 p-5 shadow-sm flex items-center gap-4">
          <div className="p-3 rounded-xl bg-rose-100 text-rose-700">
            <AlertTriangle size={22} />
          </div>
          <div>
            <span className="text-xs font-bold uppercase text-slate-400">
              Sắp hết / Hết hàng
            </span>
            <p className="text-2xl font-black text-rose-600 font-serif">
              {lowStockCount}
            </p>
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-white rounded-2xl border border-slate-200/80 p-4 shadow-sm flex flex-wrap items-center justify-between gap-4">
        <div className="relative flex-1 min-w-[240px] max-w-md">
          <Search
            size={16}
            className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400"
          />
          <input
            type="text"
            placeholder="Tìm theo tên hoặc mã SKU nguyên liệu..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-9 pr-4 py-2 text-sm rounded-xl border border-slate-200 focus:outline-none focus:border-amber-700"
          />
        </div>
        <label className="inline-flex items-center gap-2 text-sm font-medium text-slate-700 cursor-pointer">
          <input
            type="checkbox"
            checked={onlyLowStock}
            onChange={(e) => setOnlyLowStock(e.target.checked)}
            className="rounded border-slate-300 text-amber-800 focus:ring-amber-700"
          />
          Chỉ hiện nguyên liệu chạm ngưỡng thấp
        </label>
      </div>

      {/* Table */}
      <div className="bg-white rounded-2xl border border-slate-200/80 shadow-sm overflow-hidden">
        {isLoading ? (
          <div className="py-16">
            <Loading message="Đang tải danh sách nguyên liệu..." />
          </div>
        ) : ingredients.length === 0 ? (
          <div className="py-16 text-center text-slate-400 text-sm">
            Chưa có nguyên liệu nào phù hợp.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="bg-slate-50/80 border-b border-slate-100 text-[11px] font-bold uppercase text-slate-400 tracking-wider">
                  <th className="py-3.5 px-4">Nguyên liệu</th>
                  <th className="py-3.5 px-4 text-right">Tồn thực tế</th>
                  <th className="py-3.5 px-4 text-right">Đang giữ</th>
                  <th className="py-3.5 px-4 text-right">Khả dụng</th>
                  <th className="py-3.5 px-4 text-right">Giá vốn / ĐV chuẩn</th>
                  <th className="py-3.5 px-4 text-right">Giá trị tồn</th>
                  <th className="py-3.5 px-4 text-center">Trạng thái</th>
                  <th className="py-3.5 px-4 text-right">Thao tác</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {ingredients.map((ing) => (
                  <tr key={ing.id} className="hover:bg-slate-50/60 transition-colors">
                    <td className="py-3.5 px-4">
                      <p className="font-bold text-slate-800">{ing.name}</p>
                      <span className="text-xs text-slate-400 font-mono">
                        {ing.sku} • ĐV chuẩn: {ing.baseUnit}
                      </span>
                    </td>
                    <td className="py-3.5 px-4 text-right font-semibold text-slate-700">
                      {ing.quantity.toLocaleString("vi-VN")} {ing.baseUnit}
                    </td>
                    <td className="py-3.5 px-4 text-right text-amber-700 font-medium">
                      {ing.reserved.toLocaleString("vi-VN")} {ing.baseUnit}
                    </td>
                    <td className="py-3.5 px-4 text-right font-bold text-slate-900">
                      {ing.availableQuantity.toLocaleString("vi-VN")} {ing.baseUnit}
                    </td>
                    <td className="py-3.5 px-4 text-right font-semibold text-amber-800">
                      {ing.costPerBaseUnit.toLocaleString("vi-VN", {
                        minimumFractionDigits: 0,
                        maximumFractionDigits: 4,
                      })}
                      đ / {ing.baseUnit}
                    </td>
                    <td className="py-3.5 px-4 text-right font-bold text-emerald-700">
                      {formatCurrency(ing.stockValue)}
                    </td>
                    <td className="py-3.5 px-4 text-center">
                      {ing.status === "OUT_OF_STOCK" ? (
                        <span className="px-2.5 py-1 rounded-full text-xs font-bold bg-rose-100 text-rose-700">
                          Hết hàng
                        </span>
                      ) : ing.status === "LOW_STOCK" ? (
                        <span className="px-2.5 py-1 rounded-full text-xs font-bold bg-amber-100 text-amber-800">
                          Sắp hết (&le; {ing.minThreshold})
                        </span>
                      ) : (
                        <span className="px-2.5 py-1 rounded-full text-xs font-bold bg-emerald-100 text-emerald-700">
                          Đủ hàng
                        </span>
                      )}
                    </td>
                    <td className="py-3.5 px-4 text-right">
                      <div className="inline-flex items-center gap-1.5">
                        <button
                          onClick={() => openImportModal(ing)}
                          title="Nhập kho có giá vốn"
                          className="px-2.5 py-1.5 rounded-lg bg-emerald-50 text-emerald-700 hover:bg-emerald-100 text-xs font-bold inline-flex items-center gap-1"
                        >
                          <PackagePlus size={14} /> Nhập
                        </button>
                        <button
                          onClick={() => openWasteModal(ing)}
                          title="Ghi nhận hao hụt"
                          className="px-2.5 py-1.5 rounded-lg bg-rose-50 text-rose-700 hover:bg-rose-100 text-xs font-bold inline-flex items-center gap-1"
                        >
                          <Flame size={14} /> Hao hụt
                        </button>
                        {!isStaff && (
                          <button
                            onClick={() => openEditModal(ing)}
                            title="Sửa nguyên liệu"
                            className="p-1.5 rounded-lg text-slate-500 hover:bg-slate-100 hover:text-slate-800"
                          >
                            <Edit2 size={15} />
                          </button>
                        )}
                        <Link
                          to={`/admin/ingredients/${ing.id}`}
                          title="Chi tiết lô & lịch sử"
                          className="p-1.5 rounded-lg text-slate-500 hover:bg-slate-100 hover:text-amber-800"
                        >
                          <Eye size={15} />
                        </Link>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Create / Edit Modal */}
      <Modal
        isOpen={formOpen}
        onClose={() => setFormOpen(false)}
        title={editingIng ? "Cập nhật nguyên liệu" : "Thêm nguyên liệu mới"}
      >
        <form onSubmit={handleSaveIngredient} className="space-y-4">
          <Input
            label="Tên nguyên liệu"
            placeholder="VD: Cà phê hạt Arabica Cầu Đất..."
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
          <div className="grid grid-cols-2 gap-3">
            <Input
              label="Mã SKU (để trống tự tạo)"
              placeholder="ING-ARABICA"
              value={sku}
              onChange={(e) => setSku(e.target.value)}
            />
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">
                Đơn vị chuẩn (baseUnit)
              </label>
              <select
                value={baseUnit}
                onChange={(e) => setBaseUnit(e.target.value)}
                className="w-full px-3.5 py-2.5 rounded-lg border border-slate-300 text-sm"
              >
                <option value="g">g (gram)</option>
                <option value="ml">ml (mililít)</option>
                <option value="cái">cái</option>
                <option value="gói">gói</option>
                <option value="viên">viên</option>
              </select>
            </div>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <Input
              label={`Giá vốn / 1 ${baseUnit} (đ)`}
              type="number"
              step="0.0001"
              value={costPerBaseUnit}
              onChange={(e) => setCostPerBaseUnit(e.target.value)}
            />
            <Input
              label={`Ngưỡng tối thiểu (${baseUnit})`}
              type="number"
              value={minThreshold}
              onChange={(e) => setMinThreshold(e.target.value)}
            />
            <Input
              label="Hạn bảo quản (ngày)"
              type="number"
              value={shelfLifeDays}
              onChange={(e) => setShelfLifeDays(e.target.value)}
            />
          </div>
          <div className="flex justify-end gap-2 pt-3 border-t border-slate-100">
            <Button type="button" variant="outline" onClick={() => setFormOpen(false)}>
              Hủy
            </Button>
            <Button type="submit" isLoading={submittingForm}>
              Lưu nguyên liệu
            </Button>
          </div>
        </form>
      </Modal>

      {/* Import Modal */}
      <Modal
        isOpen={!!importTarget}
        onClose={() => setImportTarget(null)}
        title={`Nhập kho nguyên liệu: ${importTarget?.name ?? ""}`}
      >
        {importTarget && (
          <form onSubmit={handleImportSubmit} className="space-y-4">
            <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl text-xs text-amber-900">
              Tồn hiện tại: <b>{importTarget.quantity.toLocaleString("vi-VN")} {importTarget.baseUnit}</b> •
              Giá vốn BQGQ hiện tại:{" "}
              <b>
                {importTarget.costPerBaseUnit.toLocaleString("vi-VN", {
                  maximumFractionDigits: 4,
                })}
                đ/{importTarget.baseUnit}
              </b>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Input
                label="Số lượng nhập"
                type="number"
                step="0.001"
                placeholder="VD: 1000 hoặc 1"
                value={importQty}
                onChange={(e) => setImportQty(e.target.value)}
              />
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">
                  Đơn vị nhập
                </label>
                <select
                  value={importUnit}
                  onChange={(e) => setImportUnit(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-lg border border-slate-300 text-sm"
                >
                  <option value={importTarget.baseUnit}>{importTarget.baseUnit}</option>
                  {importTarget.baseUnit === "g" && <option value="kg">kg (1 kg = 1000 g)</option>}
                  {importTarget.baseUnit === "ml" && <option value="l">lít (1 l = 1000 ml)</option>}
                </select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">
                  Cách tính giá nhập
                </label>
                <select
                  value={importCostMode}
                  onChange={(e) =>
                    setImportCostMode(e.target.value as "unitCost" | "totalCost")
                  }
                  className="w-full px-3.5 py-2.5 rounded-lg border border-slate-300 text-sm"
                >
                  <option value="totalCost">Nhập tổng tiền lô hàng (VND)</option>
                  <option value="unitCost">Nhập đơn giá / 1 {importUnit}</option>
                </select>
              </div>
              <Input
                label={
                  importCostMode === "totalCost"
                    ? "Tổng tiền lô nhập (VND)"
                    : `Đơn giá / 1 ${importUnit} (VND)`
                }
                type="number"
                step="0.01"
                placeholder="VD: 350000"
                value={importCostVal}
                onChange={(e) => setImportCostVal(e.target.value)}
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <Input
                label="Mã lô (tùy chọn)"
                placeholder="Tự sinh nếu để trống"
                value={importBatchCode}
                onChange={(e) => setImportBatchCode(e.target.value)}
              />
              <Input
                label="Hạn sử dụng"
                type="date"
                value={importExpiry}
                onChange={(e) => setImportExpiry(e.target.value)}
              />
            </div>

            <Input
              label="Ghi chú nhập kho"
              placeholder="VD: Nhập lô mới từ NCC..."
              value={importNote}
              onChange={(e) => setImportNote(e.target.value)}
            />

            <div className="flex justify-end gap-2 pt-3 border-t border-slate-100">
              <Button
                type="button"
                variant="outline"
                onClick={() => setImportTarget(null)}
              >
                Hủy
              </Button>
              <Button type="submit" isLoading={submittingImport}>
                Xác nhận nhập kho
              </Button>
            </div>
          </form>
        )}
      </Modal>

      {/* Waste Modal */}
      <Modal
        isOpen={!!wasteTarget}
        onClose={() => setWasteTarget(null)}
        title={`Ghi nhận hao hụt: ${wasteTarget?.name ?? ""}`}
      >
        {wasteTarget && (
          <form onSubmit={handleWasteSubmit} className="space-y-4">
            <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-800">
              Khả dụng hiện tại:{" "}
              <b>
                {wasteTarget.availableQuantity.toLocaleString("vi-VN")}{" "}
                {wasteTarget.baseUnit}
              </b>{" "}
              (Hệ thống tự động trừ theo lô FIFO hạn dùng sớm nhất nếu không chọn lô cụ thể)
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Input
                label={`Số lượng hao hụt (${wasteTarget.baseUnit})`}
                type="number"
                step="0.001"
                value={wasteQty}
                onChange={(e) => setWasteQty(e.target.value)}
              />
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">
                  Lý do hao hụt
                </label>
                <select
                  value={wasteReason}
                  onChange={(e) => setWasteReason(e.target.value as WasteReason)}
                  className="w-full px-3.5 py-2.5 rounded-lg border border-slate-300 text-sm"
                >
                  {(Object.keys(WASTE_REASON_LABELS) as WasteReason[]).map((r) => (
                    <option key={r} value={r}>
                      {WASTE_REASON_LABELS[r]}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {wasteTarget.batches && wasteTarget.batches.length > 0 && (
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">
                  Chọn lô (để trống để tự trừ FIFO)
                </label>
                <select
                  value={wasteBatchId}
                  onChange={(e) => setWasteBatchId(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-lg border border-slate-300 text-sm"
                >
                  <option value="">Tự động trừ theo FIFO hạn dùng</option>
                  {wasteTarget.batches.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.batchCode} — Còn {b.quantityRemaining} {wasteTarget.baseUnit} (HSD:{" "}
                      {b.expirationDate ? formatDate(b.expirationDate) : "KGH"})
                    </option>
                  ))}
                </select>
              </div>
            )}

            <Input
              label="Ghi chú chi tiết"
              placeholder="VD: Đổ hỏng khi pha ca sáng..."
              value={wasteNote}
              onChange={(e) => setWasteNote(e.target.value)}
            />

            <div className="flex justify-end gap-2 pt-3 border-t border-slate-100">
              <Button
                type="button"
                variant="outline"
                onClick={() => setWasteTarget(null)}
              >
                Hủy
              </Button>
              <Button
                type="submit"
                isLoading={submittingWaste}
                className="bg-rose-600 hover:bg-rose-700 text-white"
              >
                Xác nhận trừ hao hụt
              </Button>
            </div>
          </form>
        )}
      </Modal>
    </div>
  );
};
