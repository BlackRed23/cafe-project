import React, { useState, useEffect, useCallback } from "react";
import { Link } from "react-router-dom";
import { productsApi } from "../../api/products.api";
import { inventoryApi } from "../../api/inventory.api";
import { simulateSaleApi } from "../../api/simulateSale.api";
import type { Product } from "../../types/product.types";
import type { Inventory } from "../../types/inventory.types";
import { Button } from "../../components/common/Button";
import { Loading } from "../../components/common/Loading";
import { ConfirmDialog } from "../../components/common/ConfirmDialog";
import { Play, Sparkles, Terminal, Mail, RefreshCw, AlertTriangle, ShieldCheck, X, CheckCircle, Info, AlertOctagon } from "lucide-react";

import { useToast } from "../../contexts/ToastContext";

export const AdminSimulateSalePage: React.FC = () => {
  const [products, setProducts] = useState<Product[]>([]);
  const [inventories, setInventories] = useState<Inventory[]>([]);
  const [selectedProductId, setSelectedProductId] = useState("");
  const [simulationMode, setSimulationMode] = useState<"ONE_DAY" | "WEEK" | "MONTH" | "CUSTOM_RANGE">("ONE_DAY");
  const [dailySimulatedQuantity, setDailySimulatedQuantity] = useState(5);
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [note, setNote] = useState("");

  const [isLoading, setIsLoading] = useState(true);
  const [showConfirm, setShowConfirm] = useState(false);
  const [isSimulating, setIsSimulating] = useState(false);
  const [apiError, setApiError] = useState<string | null>(null);

  const toast = useToast();

  // Result state
  const [result, setResult] = useState<{
    success: boolean;
    productId?: string;
    productName?: string;
    stockBefore: number;
    stockAfter: number;
    decreasedQuantity: number;
    statusAfter: "OK" | "WARNING" | "NEED_RESTOCK";
    minThreshold: number;
    prCreated: boolean;
    prId?: string;
    prNumber?: string;
    hasNoSupplierSkip?: boolean;
    hasDuplicateSkip?: boolean;
  } | null>(null);

  const loadData = async () => {
    try {
      setIsLoading(true);
      const [prods, invs] = await Promise.all([
        productsApi.getProducts(),
        inventoryApi.getInventories().catch(() => [] as Inventory[]),
      ]);
      setProducts(prods.filter((p) => p.isActive !== false));
      setInventories(invs);
    } catch (err) {
      setApiError("Không thể tải thông tin sản phẩm và kho.");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const selectedInventory = inventories.find((inv) => inv.productId === selectedProductId);
  const selectedProduct = products.find((p) => p.id === selectedProductId);

  const currentQty = selectedInventory?.quantity ?? 0;
  const threshold = selectedInventory?.minThreshold ?? selectedInventory?.min_threshold ?? 0;
  let unit = selectedProduct?.unit || "đơn vị";
  if (unit.toLowerCase() === "ly") unit = "đơn vị";

  let localNumberOfDays = 1;
  if (simulationMode === "WEEK") localNumberOfDays = 7;
  else if (simulationMode === "MONTH") localNumberOfDays = 30;
  else if (simulationMode === "CUSTOM_RANGE" && startDate && endDate) {
      const start = new Date(startDate);
      const end = new Date(endDate);
      const diffTime = end.getTime() - start.getTime();
      const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
      localNumberOfDays = diffDays >= 0 ? diffDays + 1 : 0;
  } else if (simulationMode === "CUSTOM_RANGE") {
      localNumberOfDays = 0;
  }
  const localSimulatedDemand = localNumberOfDays * (dailySimulatedQuantity || 0);

  const handleSimulate = async () => {
    if (!selectedProductId || localSimulatedDemand <= 0) return;
    setIsSimulating(true);
    setApiError(null);
    setResult(null);

    try {
      const res: any = await simulateSaleApi.simulateSale({
        productId: selectedProductId,
        simulationMode,
        startDate: startDate || undefined,
        endDate: endDate || undefined,
        dailySimulatedQuantity,
        note: note
      });

      const affected = res?.affectedProduct ?? res?.affectedProducts?.[0] ?? {};
      const stockBefore = affected.stockBefore ?? res?.stockBefore ?? currentQty;
      const stockAfter = affected.stockAfter ?? res?.stockAfter ?? stockBefore;
      const decreasedQuantity = affected.decreasedQuantity ?? res?.decreasedQuantity ?? localSimulatedDemand;
      const minThreshold = affected.minThreshold ?? res?.minThreshold ?? threshold;
      let status: "OK" | "WARNING" | "NEED_RESTOCK" = "OK";
      if (stockAfter < minThreshold) {
        status = "NEED_RESTOCK";
      } else if (stockAfter === minThreshold) {
        status = "WARNING";
      }

      const createdPRs = res?.createdPurchaseRequests ?? [];
      const logs: any[] = res?.agentLogs ?? res?.agentResults ?? [];

      const hasDuplicateSkip = logs.some((log: any) => {
        const output = typeof log?.output === "string"
          ? (() => { try { return JSON.parse(log.output); } catch { return null; } })()
          : log?.output;
        return (
          log?.result === "SKIPPED_DUPLICATE" ||
          output?.reason === "ACTIVE_PR_EXISTS" ||
          log?.reasonCode === "ACTIVE_PR_EXISTS"
        );
      });

      const hasNoSupplierSkip = logs.some((log: any) => {
        const output = typeof log?.output === "string"
          ? (() => { try { return JSON.parse(log.output); } catch { return null; } })()
          : log?.output;
        return (
          log?.result === "NO_SUPPLIER" ||
          log?.result === "SUPPLIER_NOT_FOUND" ||
          log?.result === "SUPPLIER_PRODUCTS_EMPTY" ||
          output?.reason === "NO_SUPPLIERS_MAPPED" ||
          output?.reason === "SUPPLIERS_INACTIVE" ||
          log?.reasoning?.includes("Sản phẩm chưa được liên kết với nhà cung cấp") ||
          log?.reasoning?.includes("Nhà cung cấp của sản phẩm đang bị vô hiệu hóa") ||
          output?.reason === "SUPPLIER_MISSING"
        );
      });

      setResult({
        success: true,
        productId: affected.productId ?? res?.productId ?? selectedProductId,
        productName: affected.productName ?? res?.productName ?? selectedProduct?.name,
        stockBefore,
        stockAfter,
        decreasedQuantity,
        statusAfter: status,
        minThreshold,
        prCreated: !!(res?.purchaseRequestId || res?.purchaseRequest || createdPRs.length > 0),
        prId: res?.purchaseRequestId || res?.purchaseRequest?.id || createdPRs[0]?.id || undefined,
        prNumber: createdPRs[0]?.requestNumber || createdPRs[0]?.id || undefined,
        hasNoSupplierSkip,
        hasDuplicateSkip
      });

      /* ─── Toast notifications based on response ─── */

      toast.success("Mô phỏng thành công", `Tồn kho còn ${stockAfter} ${unit}.`);

      if (createdPRs.length > 0) {
        const prNumber = createdPRs[0]?.requestNumber || createdPRs[0]?.id || "";
        toast.success("Tạo yêu cầu tự động", `AI Agent đã tạo yêu cầu nhập hàng: ${prNumber}.`);
      } else if (hasNoSupplierSkip) {
        toast.warning("Chưa có nhà cung cấp", "Sản phẩm chưa được liên kết với nhà cung cấp nên AI Agent không thể tạo yêu cầu nhập hàng.");
      } else if (hasDuplicateSkip) {
        toast.info("Yêu cầu nhập hàng tồn tại", "Sản phẩm đã có yêu cầu nhập hàng đang chờ xử lý.");
      }
      
      if (stockAfter <= 0) {
        toast.error("Sản phẩm hết hàng", "Vui lòng kiểm tra yêu cầu nhập hàng.");
      } else if (stockAfter < minThreshold) {
        toast.warning("Sản phẩm sắp hết hàng", `Tồn kho hiện tại: ${stockAfter} ${unit}, ngưỡng cảnh báo: ${minThreshold} ${unit}.`);
      }

      // Refresh inventory stock values locally
      await loadData();
    } catch (err: any) {
      // Case Error toasts
      const status = err.response?.status;
      const message = err.response?.data?.message || err.message || "";

      if (status === 400 && (message.toLowerCase().includes("not enough") || message.toLowerCase().includes("inventory") || message.toLowerCase().includes("stock") || message.toLowerCase().includes("không đủ"))) {
        toast.error("Không đủ tồn kho", message || `Không đủ tồn kho để mô phỏng bán hàng. Tồn kho hiện tại: ${currentQty} ${unit}, yêu cầu: ${localSimulatedDemand} ${unit}.`);
      } else {
        toast.error("Lỗi giả lập", "Không thể mô phỏng bán hàng. Vui lòng kiểm tra kết nối server.");
      }

      setApiError(message || "Lỗi khi chạy giả lập bán hàng.");
    } finally {
      setIsSimulating(false);
      setShowConfirm(false);
    }
  };

  if (isLoading) {
    return <Loading message="Đang tải cấu hình bán giả lập..." />;
  }

  return (
    <div className="max-w-2xl mx-auto flex flex-col gap-6">

      {apiError && (
        <div className="p-4 bg-rose-50 border border-rose-200 text-rose-800 text-sm font-semibold rounded-2xl">
          {apiError}
        </div>
      )}

      {/* Main Form container */}
      <div className="bg-white border border-slate-100 rounded-3xl p-6 sm:p-8 shadow-sm space-y-6">
        <div className="flex items-center justify-between border-b border-slate-100 pb-3">
          <h3 className="text-lg font-black text-slate-800 flex items-center gap-2">
            <Play size={20} className="text-amber-800" /> Giả lập bán hàng (Simulate Sale)
          </h3>
          <button onClick={loadData} className="p-1.5 text-slate-400 hover:text-slate-700 rounded-lg hover:bg-slate-50">
            <RefreshCw size={14} />
          </button>
        </div>

        <div className="space-y-4">
          {/* Select Product */}
          <div>
            <label className="block text-sm font-medium text-slate-750 mb-1.5 font-semibold">Chọn sản phẩm</label>
            <select
              value={selectedProductId}
              onChange={(e) => {
                setSelectedProductId(e.target.value);
                setResult(null);
              }}
              className="block w-full px-3.5 py-2.5 rounded-lg border border-slate-300 bg-white text-sm outline-none focus:ring-2 focus:ring-amber-700/20 focus:border-amber-700"
            >
              <option value="">-- Chọn sản phẩm --</option>
              {products.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </div>

          {/* Form and Preview */}
          {selectedProductId && (
            <div className="space-y-6">
              <div>
                <label className="block text-sm font-medium text-slate-750 mb-1.5 font-semibold">Số lượng dự kiến bán mỗi ngày</label>
                <div className="flex gap-2 items-center">
                  <input
                    type="number"
                    min={1}
                    value={dailySimulatedQuantity || ""}
                    onChange={(e) => { setDailySimulatedQuantity(parseInt(e.target.value) || 0); }}
                    className="block w-full px-3.5 py-2.5 rounded-lg border border-slate-300 text-sm outline-none focus:ring-2 focus:ring-amber-700/20 focus:border-amber-700"
                  />
                  <span className="text-sm font-medium text-slate-600 whitespace-nowrap">{unit}/ngày</span>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-750 mb-1.5 font-semibold">Thời gian mô phỏng</label>
                  <select
                    value={simulationMode}
                    onChange={(e) => { setSimulationMode(e.target.value as any); }}
                    className="block w-full px-3.5 py-2.5 rounded-lg border border-slate-300 bg-white text-sm outline-none focus:ring-2 focus:ring-amber-700/20 focus:border-amber-700"
                  >
                    <option value="ONE_DAY">1 Ngày</option>
                    <option value="WEEK">1 Tuần (7 ngày)</option>
                    <option value="MONTH">1 Tháng (30 ngày)</option>
                    <option value="CUSTOM_RANGE">Tùy chọn khoảng thời gian</option>
                  </select>
                </div>
                {simulationMode === "CUSTOM_RANGE" && (
                  <div className="flex gap-2 items-end">
                    <div className="flex-1">
                      <label className="block text-xs font-medium text-slate-500 mb-1">Từ ngày</label>
                      <input
                        type="date"
                        value={startDate}
                        onChange={(e) => { setStartDate(e.target.value); }}
                        className="block w-full px-2 py-2.5 rounded-lg border border-slate-300 text-sm outline-none focus:ring-2 focus:ring-amber-700/20"
                      />
                    </div>
                    <div className="flex-1">
                      <label className="block text-xs font-medium text-slate-500 mb-1">Đến ngày</label>
                      <input
                        type="date"
                        value={endDate}
                        onChange={(e) => { setEndDate(e.target.value); }}
                        className="block w-full px-2 py-2.5 rounded-lg border border-slate-300 text-sm outline-none focus:ring-2 focus:ring-amber-700/20"
                      />
                    </div>
                  </div>
                )}
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-750 mb-1.5 font-semibold">Ghi chú (Tùy chọn)</label>
                <input
                  type="text"
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  placeholder="Vd: Mô phỏng bán dịp lễ"
                  className="block w-full px-3.5 py-2.5 rounded-lg border border-slate-300 text-sm outline-none focus:ring-2 focus:ring-amber-700/20 focus:border-amber-700"
                />
              </div>

              <div className="p-4 bg-amber-50 border border-amber-200 rounded-xl mb-4">
                <div className="flex items-start gap-2">
                  <Info size={18} className="text-amber-600 mt-0.5 shrink-0" />
                  <p className="text-sm text-amber-800 font-medium">
                    Apply Simulation sẽ cập nhật tồn kho thật và kích hoạt Agent scan. Chức năng này không tạo Order, không tạo Payment và không tính doanh thu.
                  </p>
                </div>
              </div>

              <div className="p-5 bg-slate-50 border border-slate-200 rounded-xl">
                <h4 className="text-sm font-semibold text-slate-700 mb-3">Tính toán dự kiến</h4>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="bg-white p-3 rounded-lg border border-slate-150">
                    <span className="text-xs text-slate-400 font-medium block">Số ngày mô phỏng</span>
                    <strong className="text-base text-slate-700">{localNumberOfDays} ngày</strong>
                  </div>
                  <div className="bg-white p-3 rounded-lg border border-slate-150">
                    <span className="text-xs text-slate-400 font-medium block">Dự kiến bán</span>
                    <strong className="text-base text-slate-700">{dailySimulatedQuantity} {unit}/ngày</strong>
                  </div>
                  <div className="bg-white p-3 rounded-lg border border-amber-200">
                    <span className="text-xs text-slate-400 font-medium block">Tổng nhu cầu mô phỏng</span>
                    <strong className="text-lg text-amber-600">{localSimulatedDemand} {unit}</strong>
                  </div>
                </div>
              </div>

            </div>
          )}
        </div>

        {selectedProductId && (
          <div className="pt-4 border-t border-slate-100 flex justify-end">
            <Button
              onClick={() => setShowConfirm(true)}
              className="px-6 py-3"
              disabled={localSimulatedDemand <= 0}
            >
              Apply Simulation
            </Button>
          </div>
        )}
      </div>

      {/* Result Container */}
      {result && (
        <div className="bg-white border border-slate-100 rounded-3xl p-6 sm:p-8 shadow-md space-y-5">
          <h4 className="font-bold text-slate-800 border-b border-slate-100 pb-2">Kết quả mô phỏng bán</h4>
          <p className="text-xs text-slate-500">
            {result.productName ? `${result.productName} - ` : ""}Đã trừ {result.decreasedQuantity} sản phẩm từ dữ liệu backend.
          </p>

          <div className="grid grid-cols-3 gap-4 text-center">
            <div className="p-3 bg-slate-50 border border-slate-100 rounded-xl">
              <span className="text-[10px] text-slate-400 block font-medium">Kho trước bán</span>
              <strong className="text-base text-slate-700">{result.stockBefore}</strong>
            </div>
            <div className="p-3 bg-slate-50 border border-slate-100 rounded-xl">
              <span className="text-[10px] text-slate-400 block font-medium">Kho sau bán</span>
              <strong className="text-base text-slate-700">{result.stockAfter}</strong>
            </div>
            <div className="p-3 bg-slate-50 border border-slate-100 rounded-xl">
              <span className="text-[10px] text-slate-400 block font-medium">Trạng thái kho</span>
              <div className="mt-0.5">
                {result.statusAfter === "NEED_RESTOCK" ? (
                  <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold bg-rose-50 border border-rose-200 text-rose-800">Cần nhập hàng</span>
                ) : result.statusAfter === "WARNING" ? (
                  <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold bg-orange-50 border border-orange-250 text-orange-850">Cảnh báo</span>
                ) : (
                  <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-50 border border-emerald-200 text-emerald-800">Bình thường</span>
                )}
              </div>
            </div>
          </div>

          {result.prCreated ? (
            <div className="p-4 bg-amber-50 border border-amber-250 text-amber-900 rounded-xl space-y-3">
              <p className="text-xs font-semibold flex items-center gap-1.5">
                <Sparkles size={14} className="text-amber-700 animate-pulse" />
                AI Agent đã tạo yêu cầu nhập hàng: {result.prNumber || result.prId}
              </p>
              <div className="flex items-center gap-3">
                <Link to={result.prId ? `/admin/purchase-requests/${result.prId}` : `/admin/purchase-requests`}>
                  <Button size="sm" className="bg-amber-800 hover:bg-amber-900 text-xs flex items-center gap-1 border-none text-white">
                    <Mail size={12} /> Xem yêu cầu mua hàng
                  </Button>
                </Link>
                <Link to="/admin/agent-logs">
                  <Button size="sm" variant="outline" className="text-xs flex items-center gap-1 border-amber-300 text-amber-900 hover:bg-amber-50/50 bg-white">
                    <Terminal size={12} /> Xem Agent Logs
                  </Button>
                </Link>
              </div>
            </div>
          ) : result.hasNoSupplierSkip ? (
            <div className="p-4 bg-orange-50 border border-orange-200 text-orange-900 rounded-xl space-y-3">
              <p className="text-xs font-semibold flex items-center gap-1.5">
                <AlertTriangle size={14} className="text-orange-600" />
                Sản phẩm chưa được liên kết với nhà cung cấp nên AI Agent không thể tạo yêu cầu nhập hàng.
              </p>
              <div className="flex items-center gap-3">
                <Link to="/admin/suppliers">
                  <Button size="sm" className="bg-orange-600 hover:bg-orange-700 text-xs flex items-center gap-1 border-none text-white">
                    Đi đến Nhà cung cấp
                  </Button>
                </Link>
              </div>
            </div>
          ) : result.hasDuplicateSkip ? (
            <div className="p-4 bg-blue-50 border border-blue-200 text-blue-900 rounded-xl space-y-3">
              <p className="text-xs font-semibold flex items-center gap-1.5">
                <Info size={14} className="text-blue-600" />
                Sản phẩm đã có yêu cầu nhập hàng đang chờ xử lý.
              </p>
              <div className="flex items-center gap-3">
                <Link to="/admin/purchase-requests">
                  <Button size="sm" className="bg-blue-600 hover:bg-blue-700 text-xs flex items-center gap-1 border-none text-white">
                    <Mail size={12} /> Xem yêu cầu mua hàng
                  </Button>
                </Link>
              </div>
            </div>
          ) : (
            <div className="p-4 bg-slate-50 border border-slate-200 text-slate-650 rounded-xl text-xs flex items-center gap-1.5">
              <ShieldCheck size={14} className="text-emerald-600" />
              Tồn kho sau bán vẫn ở mức an toàn. AI Agent không tạo Purchase Request mới.
            </div>
          )}
        </div>
      )}

      {/* Confirmation Dialog */}
      <ConfirmDialog
        isOpen={showConfirm}
        onClose={() => setShowConfirm(false)}
        onConfirm={handleSimulate}
        title="Xác nhận Apply Simulation"
        message={`Bạn muốn thực hiện Apply Simulation mô phỏng bán ${localSimulatedDemand} ${unit} cho sản phẩm ${selectedProduct?.name}? Giao dịch này sẽ cập nhật kho thực tế và kích hoạt AI Agent kiểm định.`}
        confirmText="Apply Simulation"
        cancelText="Hủy"
        type="warning"
        isLoading={isSimulating}
      />
    </div>
  );
};
