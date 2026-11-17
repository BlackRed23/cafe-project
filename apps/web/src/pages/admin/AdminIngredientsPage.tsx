import React, { useState, useEffect, useCallback } from "react";
import { Link } from "react-router-dom";
import { ingredientsApi } from "../../api/ingredients.api";
import { agentLogsApi } from "../../api/agentLogs.api";
import type { AgentLog } from "../../types/agentLog.types";
import type {
  Ingredient,
  WasteReason,
  ExpiryClassification,
} from "../../types/ingredient.types";
import { formatCurrency } from "../../utils/formatCurrency";
import { formatDate } from "../../utils/formatDate";
import { Loading } from "../../components/common/Loading";
import { Button } from "../../components/common/Button";
import { Input } from "../../components/common/Input";
import { Modal } from "../../components/common/Modal";
import { EmptyState } from "../../components/common/EmptyState";
import { ErrorState } from "../../components/common/ErrorState";
import { ingredientPatch, ingredientError, availableStock } from "./ingredientFeedback";
import "./ingredients.css";
import { lotError, lotImportExpiryError } from "./lotFeedback";
import { useRef } from "react";
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
  Bot,
} from "lucide-react";

const WASTE_REASON_LABELS: Record<WasteReason, string> = {
  EXPIRED: "Hết hạn sử dụng",
  DAMAGED: "Hư hỏng / Đổ vỡ",
  STAFF_ERROR: "Pha chế sai / Thao tác lỗi",
  CUSTOMER_CANCELLED: "Khách hủy sau khi pha",
};

export const AdminIngredientsPage: React.FC = () => {
  const toast = useToast();
  const { isAdmin } = useAuth();
  const submitLock = useRef(false);
  const [formError, setFormError] = useState("");
  const [includeInactive, setIncludeInactive] = useState(false);
  const [confirmedWaste, setConfirmedWaste] = useState(false);
  const [ingredients, setIngredients] = useState<Ingredient[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [onlyLowStock, setOnlyLowStock] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  // Create / Edit Modal
  const [formOpen, setFormOpen] = useState(false);
  const [editingIng, setEditingIng] = useState<Ingredient | null>(null);
  const [name, setName] = useState("");
  const [active, setActive] = useState(true);
  const [sku, setSku] = useState("");
  const [baseUnit, setBaseUnit] = useState("g");
  const [costPerBaseUnit, setCostPerBaseUnit] = useState("0");
  const [minThreshold, setMinThreshold] = useState("100");
  const [shelfLifeDays, setShelfLifeDays] = useState("180");
  const [expiryClassification, setExpiryClassification] = useState<ExpiryClassification | ''>('');
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

  // AI Agent Scan state
  const [isScanningAgent, setIsScanningAgent] = useState(false);
  const [scanModalOpen, setScanModalOpen] = useState(false);
  const [scanResults, setScanResults] = useState<AgentLog[]>([]);
  const [scanSummary, setScanSummary] = useState<{
    createdCount: number;
    duplicateCount: number;
    noSupplierCount: number;
    expiryWarningCount: number;
    failedCount: number;
  }>({
    createdCount: 0,
    duplicateCount: 0,
    noSupplierCount: 0,
    expiryWarningCount: 0,
    failedCount: 0,
  });

  const loadData = useCallback(() => {
    setIsLoading(true);
    setLoadError(null);
    return ingredientsApi.getIngredients({
      search: search.trim() || undefined,
      lowStock: onlyLowStock || undefined,
      includeInactive,
    }).then(data => { setIngredients(data); }).catch((err: unknown) => {
      setLoadError(ingredientError(err));
      toast.error(ingredientError(err));
    }).finally(() => { setIsLoading(false); });
  }, [search, onlyLowStock, includeInactive, toast]);

  useEffect(() => {
    const timer = window.setTimeout(() => { void loadData(); }, 200);
    return () => window.clearTimeout(timer);
  }, [loadData]);

  const handleScanIngredients = async () => {
    setIsScanningAgent(true);
    setScanModalOpen(false);
    toast.info("AI Agent đang quét kho nguyên liệu pha chế...");
    try {
      const res = await agentLogsApi.scanInventory({
        triggerType: "MANUAL_ADMIN_SCAN",
        scope: "INGREDIENT",
      });

      if (res.cooldownRemainingSeconds) {
        toast.warning(`Vui lòng chờ ${res.cooldownRemainingSeconds}s trước khi quét lại.`);
        return;
      }

      if (res.activeScanSessionId) {
        toast.warning("AI Agent đang thực hiện phiên quét khác, vui lòng chờ hoàn tất.");
        return;
      }

      const results = (res.results || []).filter(
        (r) =>
          r.itemType === "INGREDIENT" ||
          String(r.action || "").startsWith("SCAN_INGREDIENT") ||
          Boolean(r.ingredientId)
      );
      setScanResults(results);

      const createdCount = results.filter((r) => r.result === "CREATED_PURCHASE_REQUEST").length;
      const duplicateCount = results.filter(
        (r) => r.result === "SKIPPED_DUPLICATE" || r.reason === "ACTIVE_PR_EXISTS"
      ).length;
      const noSupplierCount = results.filter(
        (r) =>
          r.result === "NO_SUPPLIER" ||
          r.reason === "NO_SUPPLIER" ||
          r.reason === "SUPPLIERS_INACTIVE"
      ).length;
      const expiryWarningCount = results.filter(
        (r) =>
          r.reason === "EXPIRED" ||
          r.reason === "CRITICAL_EXPIRY" ||
          r.reason === "NEAR_EXPIRY"
      ).length;
      const failedCount = results.filter(
        (r) => r.status === "FAILED" || r.result === "ERROR"
      ).length;

      setScanSummary({
        createdCount,
        duplicateCount,
        noSupplierCount,
        expiryWarningCount,
        failedCount,
      });

      const hasActionable =
        createdCount > 0 ||
        duplicateCount > 0 ||
        noSupplierCount > 0 ||
        expiryWarningCount > 0 ||
        failedCount > 0;

      if (res.agentWarning) {
        toast.warning("Không kết nối được AI Agent service.");
      } else if (createdCount > 0) {
        toast.success(`AI Agent đã tạo ${createdCount} phiếu yêu cầu nhập nguyên liệu.`);
        setScanModalOpen(true);
      } else if (expiryWarningCount > 0) {
        toast.warning(`AI Agent phát hiện ${expiryWarningCount} lô nguyên liệu cận/hết hạn.`);
        setScanModalOpen(true);
      } else if (noSupplierCount > 0) {
        toast.warning("Có nguyên liệu sắp hết nhưng chưa gán nhà cung cấp hợp lệ.");
        setScanModalOpen(true);
      } else if (duplicateCount > 0) {
        toast.info("Nguyên liệu cần nhập đã có phiếu yêu cầu đang chờ duyệt.");
        setScanModalOpen(true);
      } else if (!hasActionable) {
        toast.success("AI Agent đã kiểm tra xong, tồn kho nguyên liệu đều ở mức an toàn.");
      } else {
        setScanModalOpen(true);
      }

      await loadData();
    } catch (err) {
      toast.error(ingredientError(err) || "AI Agent quét nguyên liệu thất bại.");
    } finally {
      setIsScanningAgent(false);
      window.dispatchEvent(new CustomEvent("refresh-notifications"));
      window.dispatchEvent(new CustomEvent("agent-logs-updated"));
    }
  };

  const openCreateModal = () => {
    setFormError("");
    setActive(true);
    setEditingIng(null);
    setExpiryClassification('');
    setName("");
    setSku("");
    setBaseUnit("g");
    setCostPerBaseUnit("0");
    setMinThreshold("500");
    setShelfLifeDays("180");
    setFormOpen(true);
  };

  const openEditModal = (ing: Ingredient) => {
    setFormError("");
    setActive(ing.isActive);
    setEditingIng(ing);
    setExpiryClassification(ing.expiryClassification ?? '');
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
    if (submitLock.current || !isAdmin) return;
    setFormError("");
    if (!name.trim() || !baseUnit.trim() || !Number.isFinite(Number(costPerBaseUnit)) || Number(costPerBaseUnit) < 0 || !Number.isFinite(Number(minThreshold)) || Number(minThreshold) < 0 || (shelfLifeDays && (!Number.isInteger(Number(shelfLifeDays)) || Number(shelfLifeDays) <= 0))) {
      setFormError("Kiểm tra tên, đơn vị, giá vốn và ngưỡng không âm; hạn bảo quản phải là số nguyên dương.");
      return;
    }
    submitLock.current = true;
    setSubmittingForm(true);
    try {
      const payload = {
        ...(expiryClassification ? { expiryClassification } : {}),
        isActive: active,
        name: name.trim(),
        sku: sku.trim() || undefined,
        baseUnit: baseUnit.trim() || "g",
        costPerBaseUnit: Number(costPerBaseUnit) || 0,
        minThreshold: Number(minThreshold) || 0,
        shelfLifeDays: shelfLifeDays ? Number(shelfLifeDays) : null,
      };
      if (editingIng) {
        const saved = await ingredientsApi.updateIngredient(editingIng.id, ingredientPatch(editingIng, payload));
        setEditingIng(saved);
        toast.success("Cập nhật nguyên liệu thành công.");
      } else {
        await ingredientsApi.createIngredient(payload);
        toast.success("Tạo nguyên liệu mới thành công.");
      }
      setFormOpen(false);
      await loadData();
    } catch (err) {
      setFormError(ingredientError(err));
      toast.error(ingredientError(err));
    } finally {
      submitLock.current = false;
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
    setImportExpiry('');
    setImportNote("");
  };

  const handleImportSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!importTarget || submitLock.current || !isAdmin) return;
    const expiryError = lotImportExpiryError(importTarget, importExpiry);
    if (expiryError) { toast.error(expiryError); return; }
    const qty = Number(importQty);
    const cost = Number(importCostVal);
    if (!Number.isFinite(qty) || qty <= 0) {
      toast.error("Số lượng nhập phải lớn hơn 0.");
      return;
    }
    if (!importCostVal.trim() || !Number.isFinite(cost) || cost < 0) {
      toast.error("Vui lòng nhập chi phí hợp lệ.");
      return;
    }

    submitLock.current = true;
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
      toast.error(lotError(err));
    } finally {
      submitLock.current = false;
      setSubmittingImport(false);
    }
  };

  const openWasteModal = (ing: Ingredient) => {
    setConfirmedWaste(false);
    setWasteTarget(ing);
    setWasteQty("");
    setWasteReason("EXPIRED");
    setWasteBatchId("");
    setWasteNote("");
  };

  const handleWasteSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!wasteTarget || submitLock.current || !confirmedWaste) return;
    const qty = Number(wasteQty);
    if (!Number.isFinite(qty) || qty <= 0) {
      toast.error("Số lượng hao hụt phải lớn hơn 0.");
      return;
    }
    const selectedBatch = wasteTarget.batches?.find(batch => batch.id === wasteBatchId);
    if (qty > availableStock(wasteTarget) || (selectedBatch && qty > selectedBatch.quantityRemaining)) {
      toast.error("Số lượng vượt tồn khả dụng hoặc lô đã chọn. Tải lại tồn trước khi thử lại."); return;
    }
    submitLock.current = true;
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
      toast.error(ingredientError(err) || "Ghi nhận hao hụt thất bại.");
    } finally {
      submitLock.current = false;
      setSubmittingWaste(false);
    }
  };

  const totalInventoryValue = ingredients.reduce((s, i) => s + (i.stockValue || 0), 0);
  const lowStockCount = ingredients.filter(
    (i) => i.status === "LOW_STOCK" || i.status === "OUT_OF_STOCK"
  ).length;

  return (
    <div className="inventory-workspace ingredients-workspace flex flex-col gap-5">
      <label className="ingredient-confirm"><input type="checkbox" checked={includeInactive} onChange={e => setIncludeInactive(e.target.checked)} />Hiển thị cả nguyên liệu ngừng hoạt động</label>
      {/* Header */}
      <div className="inventory-heading ingredients-heading flex flex-col gap-4">
        <div>
          <span className="ingredients-eyebrow">Quản lý kho</span>
          <h1>
            Nguyên liệu & Giá vốn
          </h1>
          <p className="text-sm text-slate-500 mt-0.5">
            Quản lý tồn kho nguyên liệu pha chế, lô nhập FIFO và đơn giá vốn bình quân gia quyền
          </p>
        </div>
        {isAdmin && (
          <div className="ingredients-actions flex flex-wrap items-center gap-2">
            <Button
              variant="outline"
              onClick={handleScanIngredients}
              isLoading={isScanningAgent}
              className="ingredients-agent-action flex items-center gap-1.5"
            >
              <Bot size={16} /> Quét nguyên liệu bằng AI Agent
            </Button>
            <Button
              onClick={openCreateModal}
              className="ingredients-create-action flex items-center gap-1.5"
            >
              <Plus size={16} /> Thêm nguyên liệu
            </Button>
          </div>
        )}
      </div>

      {/* Summary cards */}
      <div className="ingredient-summary ingredients-summary grid sm:grid-cols-3 gap-0" aria-label="Tóm tắt danh sách đang hiển thị">
        <div className="bg-white rounded-2xl border border-slate-200/80 p-5 shadow-sm flex items-center gap-4">
          <div className="p-3 rounded-xl bg-amber-100 text-amber-800">
            <Boxes size={22} />
          </div>
          <div>
            <span className="text-xs font-bold uppercase text-slate-400">
              Nguyên liệu đang hiển thị
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
              Giá trị tồn đang hiển thị
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

      <section className="ingredients-records" aria-labelledby="ingredients-records-title">
        <div className="ingredients-records-heading">
          <h2 id="ingredients-records-title">Danh sách nguyên liệu</h2>
          <p>Theo dõi tồn kho, giá vốn và trạng thái nhập hàng.</p>
        </div>
      {/* Filters */}
      <div className="inventory-filters ingredients-toolbar flex flex-wrap items-end justify-between gap-4">
        <div className="ingredients-search relative flex-1 min-w-0">
          <Search
            size={16}
            className="ingredients-search-icon"
          />
          <Input
            type="text"
            label="Tìm nguyên liệu"
            aria-label="Tìm nguyên liệu"
            placeholder="Tìm theo tên hoặc mã SKU nguyên liệu..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <label className="ingredients-low-stock inline-flex items-center gap-2 text-sm font-medium cursor-pointer">
          <input
            type="checkbox"
            checked={onlyLowStock}
            onChange={(e) => setOnlyLowStock(e.target.checked)}
            className="ingredients-stock-checkbox"
          />
          Chỉ hiện nguyên liệu chạm ngưỡng thấp
        </label>
      </div>

      {/* Table */}
      <div className="ds-table ingredients-table overflow-hidden" aria-busy={isLoading}>
        {isLoading ? (
          <div className="py-16">
            <Loading message="Đang tải danh sách nguyên liệu..." />
          </div>
        ) : loadError ? (
          <ErrorState message={loadError} onRetry={() => void loadData()} />
        ) : ingredients.length === 0 ? (
          <EmptyState title="Chưa có nguyên liệu nào phù hợp." description="Thử đổi từ khóa hoặc bỏ bộ lọc ngưỡng thấp." />
        ) : (
          <div className="ingredients-table-scroll overflow-x-auto" role="region" aria-label="Tồn kho nguyên liệu" tabIndex={0}>
            <table className="w-full text-left text-sm">
              <caption className="sr-only">Tồn kho, giá vốn và thao tác nguyên liệu</caption>
              <thead>
                <tr className="bg-slate-50/80 border-b border-slate-100 text-[11px] font-bold uppercase text-slate-400 tracking-wider">
                  <th scope="col" className="py-3.5 px-4">Nguyên liệu</th>
                  <th scope="col" className="py-3.5 px-4 text-right">Tồn thực tế</th>
                  <th scope="col" className="py-3.5 px-4 text-right">Đang giữ</th>
                  <th scope="col" className="py-3.5 px-4 text-right">Khả dụng</th>
                  <th scope="col" className="py-3.5 px-4 text-right">Giá vốn / ĐV chuẩn</th>
                  <th scope="col" className="py-3.5 px-4 text-right">Giá trị tồn</th>
                  <th scope="col" className="py-3.5 px-4 text-center">Trạng thái</th>
                  <th scope="col" className="py-3.5 px-4 text-right">Thao tác</th>
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
                    <td className="ingredients-available py-3.5 px-4 text-right font-bold text-slate-900">
                      {availableStock(ing).toLocaleString("vi-VN")} {ing.baseUnit}
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
                        <span className="ingredients-status ingredients-status-danger px-2.5 py-1 rounded-full text-xs font-bold">
                          Hết hàng
                        </span>
                      ) : ing.status === "LOW_STOCK" ? (
                        <span className="ingredients-status ingredients-status-warning px-2.5 py-1 rounded-full text-xs font-bold">
                          Sắp hết (&le; {ing.minThreshold})
                        </span>
                      ) : (
                        <span className="ingredients-status ingredients-status-success px-2.5 py-1 rounded-full text-xs font-bold">
                          Đủ hàng
                        </span>
                      )}
                    </td>
                    <td className="py-3.5 px-4 text-right">
                      <div className="inline-flex items-center gap-1.5">
                        <button
                          onClick={() => openImportModal(ing)}
                          title="Nhập kho có giá vốn"
                          className="ingredients-row-action ingredients-import px-2.5 py-1.5 text-xs inline-flex items-center gap-1"
                        >
                          <PackagePlus size={14} /> Nhập
                        </button>
                        <button
                          onClick={() => openWasteModal(ing)}
                          title="Ghi nhận hao hụt"
                          className="ingredients-row-action ingredients-waste px-2.5 py-1.5 text-xs inline-flex items-center gap-1"
                        >
                          <Flame size={14} /> Hao hụt
                        </button>
                        {isAdmin && (
                          <button
                            onClick={() => openEditModal(ing)}
                            aria-label={`Sửa nguyên liệu ${ing.name}`}
                            title="Sửa nguyên liệu"
                            className="p-1.5 rounded-lg text-slate-500 hover:bg-slate-100 hover:text-slate-800"
                          >
                            <Edit2 size={15} />
                          </button>
                        )}
                        <Link
                          to={`/admin/ingredients/${ing.id}`}
                          aria-label={`Chi tiết lô và lịch sử ${ing.name}`}
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
      <p className="ingredients-table-hint">Cuộn ngang để xem đầy đủ tồn kho và thao tác.</p>
      </section>

      <Link to="/admin/ingredient-batches" className="text-sm underline">Quản lý lô, cách ly, thu hồi & truy xuất →</Link>
      {/* Create / Edit Modal */}
      <Modal
        isOpen={formOpen}
        onClose={() => { if (!submittingForm) setFormOpen(false); }}
        title={editingIng ? "Cập nhật nguyên liệu" : "Thêm nguyên liệu mới"}
      >
        <form onSubmit={handleSaveIngredient} className="ingredient-dialog space-y-4">
          {formError && <p role="alert" className="ingredient-error">{formError}</p>}
          <label className="ingredient-confirm"><input type="checkbox" checked={active} onChange={e => setActive(e.target.checked)} />Đang hoạt động</label>
          {editingIng && <p className="text-xs">Phiên bản {editingIng.rowVersion}. Đơn vị đã sử dụng được máy chủ bảo vệ.</p>}
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
                Đơn vị chuẩn
              </label>
              <select
                value={baseUnit}
                disabled={!!editingIng && (editingIng.quantity !== 0 || editingIng.reserved !== 0 || !!editingIng.batches?.length)}
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
          <label className="block text-sm">Phân loại hạn dùng
            <select className="w-full border rounded-lg p-2.5 mt-1" value={expiryClassification} onChange={e => setExpiryClassification(e.target.value as ExpiryClassification | '')}>
              <option value="" disabled={!!editingIng?.expiryClassification}>Chưa phân loại — giữ nguyên dữ liệu cũ</option>
              <option value="PERISHABLE">PERISHABLE · Dễ hỏng, bắt buộc hạn dùng</option>
              <option value="NON_PERISHABLE">NON_PERISHABLE · Có thể không ghi hạn dùng</option>
            </select>
          </label>
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
            <Button type="button" variant="outline" disabled={submittingForm} onClick={() => setFormOpen(false)}>
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
        onClose={() => { if (!submittingImport) setImportTarget(null); }}
        title={`Nhập kho nguyên liệu: ${importTarget?.name ?? ""}`}
      >
        {importTarget && (
          <form onSubmit={handleImportSubmit} className="ingredient-dialog space-y-4">
            <p className="text-sm">Phân loại: {importTarget.expiryClassification ?? 'Chưa phân loại (giữ nguyên)'}. NON_PERISHABLE có thể bỏ hạn dùng; hạn bảo quản đã lưu vẫn có thể tạo hạn dùng theo Backend. Nhập kho không có mã chống lặp: nếu mất kết nối, kiểm tra lịch sử trước khi gửi lại.</p>
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
                label={importTarget.expiryClassification === 'PERISHABLE' ? 'Hạn sử dụng (bắt buộc)' : 'Hạn sử dụng (tùy chọn)'}
                required={importTarget.expiryClassification === 'PERISHABLE'}
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
                disabled={submittingImport} onClick={() => setImportTarget(null)}
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
        onClose={() => { if (!submittingWaste) setWasteTarget(null); }}
        title={`Ghi nhận hao hụt: ${wasteTarget?.name ?? ""}`}
      >
        {wasteTarget && (
          <form onSubmit={handleWasteSubmit} className="ingredient-dialog space-y-4">
            <label className="ingredient-confirm"><input type="checkbox" checked={confirmedWaste} onChange={e => setConfirmedWaste(e.target.checked)} />Tôi xác nhận hao hụt thực tế; sẽ trừ tồn và ghi sổ.</label>
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
                disabled={submittingWaste} onClick={() => setWasteTarget(null)}
              >
                Hủy
              </Button>
              <Button
                type="submit"
                isLoading={submittingWaste}
                disabled={!confirmedWaste || submittingWaste}
                className="bg-rose-600 hover:bg-rose-700 text-white"
              >
                Xác nhận trừ hao hụt
              </Button>
            </div>
          </form>
        )}
      </Modal>

      {/* AI Agent Scan Result Modal */}
      <Modal
        isOpen={scanModalOpen}
        onClose={() => setScanModalOpen(false)}
        title="Kết quả AI Agent quét kho nguyên liệu"
        size="lg"
      >
        <div className="space-y-4 text-sm">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="p-3 rounded-xl border border-emerald-200 bg-emerald-50">
              <span className="text-xs font-bold uppercase text-emerald-700">Tạo phiếu nhập</span>
              <p className="text-xl font-black text-emerald-800 mt-1">{scanSummary.createdCount}</p>
            </div>
            <div className="p-3 rounded-xl border border-amber-200 bg-amber-50">
              <span className="text-xs font-bold uppercase text-amber-700">Lô cận/hết hạn</span>
              <p className="text-xl font-black text-amber-800 mt-1">{scanSummary.expiryWarningCount}</p>
            </div>
            <div className="p-3 rounded-xl border border-indigo-200 bg-indigo-50">
              <span className="text-xs font-bold uppercase text-indigo-700">Đã có PR chờ</span>
              <p className="text-xl font-black text-indigo-800 mt-1">{scanSummary.duplicateCount}</p>
            </div>
            <div className="p-3 rounded-xl border border-rose-200 bg-rose-50">
              <span className="text-xs font-bold uppercase text-rose-700">Thiếu NCC / Lỗi</span>
              <p className="text-xl font-black text-rose-800 mt-1">
                {scanSummary.noSupplierCount + scanSummary.failedCount}
              </p>
            </div>
          </div>

          <div className="max-h-80 overflow-y-auto divide-y divide-slate-100 border border-slate-200 rounded-xl">
            {scanResults
              .filter((r) => r.reason !== "STOCK_OK" && r.result !== "STOCK_OK")
              .map((log) => (
                <div key={log.id} className="p-3 space-y-1 hover:bg-slate-50">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-bold text-slate-800">
                      {log.ingredientName || log.productName || "Nguyên liệu"}
                    </span>
                    <span
                      className={`text-xs font-bold px-2 py-0.5 rounded-full ${
                        log.result === "CREATED_PURCHASE_REQUEST"
                          ? "bg-emerald-100 text-emerald-800"
                          : log.result === "WARNING"
                          ? "bg-amber-100 text-amber-800"
                          : "bg-slate-100 text-slate-700"
                      }`}
                    >
                      {log.result === "CREATED_PURCHASE_REQUEST"
                        ? "Đã tạo PR"
                        : log.result === "WARNING"
                        ? "Cảnh báo HSD"
                        : log.reason === "ACTIVE_PR_EXISTS"
                        ? "Đã có PR"
                        : log.reason === "NO_SUPPLIER" || log.reason === "SUPPLIERS_INACTIVE"
                        ? "Thiếu NCC"
                        : log.status}
                    </span>
                  </div>
                  <p className="text-xs text-slate-600">{log.message || log.reasoning}</p>
                  {log.purchaseRequestId && (
                    <Link
                      to={`/admin/purchase-requests/${log.purchaseRequestId}`}
                      className="inline-block text-xs font-bold text-amber-800 hover:underline"
                    >
                      Xem phiếu yêu cầu nhập #{log.purchaseRequestId.slice(-8).toUpperCase()} →
                    </Link>
                  )}
                </div>
              ))}
          </div>

          <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
            <Link to="/admin/agent-logs">
              <Button variant="outline">Xem Nhật ký AI Agent</Button>
            </Link>
            <Link to="/admin/purchase-requests">
              <Button className="bg-amber-800 hover:bg-amber-900 text-white">
                Quản lý Yêu cầu nhập hàng
              </Button>
            </Link>
            <Button variant="outline" onClick={() => setScanModalOpen(false)}>
              Đóng
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
};
