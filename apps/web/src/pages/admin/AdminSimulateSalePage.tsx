import React, { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { productsApi } from "../../api/products.api";
import { inventoryApi } from "../../api/inventory.api";
import { simulateSaleApi } from "../../api/simulateSale.api";
import type { Product } from "../../types/product.types";
import type { Inventory } from "../../types/inventory.types";
import { Button } from "../../components/common/Button";
import { Loading } from "../../components/common/Loading";
import { ConfirmDialog } from "../../components/common/ConfirmDialog";
import { Play, Sparkles, Terminal, Mail, RefreshCw, AlertTriangle, ShieldCheck, Info } from "lucide-react";

import { useToast } from "../../contexts/ToastContext";

const LAST_SIMULATION_TRANSACTION_KEY = "lastSimulationTransactionId";

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
  const [isRestoring, setIsRestoring] = useState(false);
  const [apiError, setApiError] = useState<string | null>(null);

  const toast = useToast();

  // Result state
  const [result, setResult] = useState<{
    success: boolean;
    productId?: string;
    inventoryId?: string;
    transactionId?: string;
    productName?: string;
    stockBefore: number;
    stockAfter: number;
    decreasedQuantity: number;
    restored?: boolean;
    restoredStock?: number;
    restoreTransactionId?: string;
    statusAfter: "OK" | "WARNING" | "NEED_RESTOCK";
    minThreshold: number;
    prCreated: boolean;
    prId?: string;
    prNumber?: string;
    hasNoSupplierSkip?: boolean;
    hasDuplicateSkip?: boolean;
  } | null>(null);

  const [pendingRestores, setPendingRestores] = useState<any[]>([]);
  const [selectedRestoreId, setSelectedRestoreId] = useState("");

  const loadData = async (hydratePendingRestore = false) => {
    try {
      setIsLoading(true);
      const [prods, invs, pendingResponse] = await Promise.all([
        productsApi.getProducts(),
        inventoryApi.getInventories().catch(() => [] as Inventory[]),
        hydratePendingRestore ? simulateSaleApi.getPendingRestore().catch(() => null) : Promise.resolve(null),
      ]);
      setProducts(prods.filter((p) => p.isActive !== false));
      setInventories(invs);

      const pendingList = pendingResponse?.pendingRestores || [];
      if (pendingList.length > 0) {
        const grouped = new Map<string, any>();
        for (const t of pendingList) {
          if (!grouped.has(t.productId)) {
            grouped.set(t.productId, {
              productId: t.productId,
              productName: t.productName,
              unit: t.unit || "đơn vị",
              totalDecreasedQuantity: 0,
              transactionIds: [],
              stockAfter: t.stockAfter,
            });
          }
          const g = grouped.get(t.productId);
          g.totalDecreasedQuantity += t.decreasedQuantity;
          g.transactionIds.push(t.transactionId);
        }
        setPendingRestores(Array.from(grouped.values()));
        localStorage.setItem(LAST_SIMULATION_TRANSACTION_KEY, pendingList[0].transactionId);
      } else {
        setPendingRestores([]);
        if (hydratePendingRestore) {
          localStorage.removeItem(LAST_SIMULATION_TRANSACTION_KEY);
        }
      }
    } catch (err) {
      setApiError("Không thể tải thông tin sản phẩm và kho.");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadData(true);
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
    if (isSimulating || !selectedProductId || localSimulatedDemand <= 0) return;
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
        inventoryId: affected.inventoryId ?? res?.inventoryId,
        transactionId: affected.transactionId ?? res?.transactionId,
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

      const simulationTransactionId = affected.transactionId ?? res?.transactionId;
      if (simulationTransactionId) {
        localStorage.setItem(LAST_SIMULATION_TRANSACTION_KEY, simulationTransactionId);
      }
      await loadData(false);
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

  const handleRestoreSimulation = async () => {
    if (!selectedRestoreId || isRestoring) return;
    
    const itemToRestore = pendingRestores.find(r => r.productId === selectedRestoreId);
    if (!itemToRestore || !itemToRestore.transactionIds.length) return;

    setIsRestoring(true);
    setApiError(null);

    try {
      for (const tId of itemToRestore.transactionIds) {
        await simulateSaleApi.restoreSimulation(tId);
      }
      toast.success("Khôi phục sản phẩm mô phỏng thành công.");
      
      setSelectedRestoreId("");
      localStorage.removeItem(LAST_SIMULATION_TRANSACTION_KEY);
      await loadData(true);
    } catch (err: any) {
      const status = err.response?.status;
      const message = err.response?.data?.message || err.message || "Không thể khôi phục mô phỏng.";
      if (status === 409) {
        toast.warning("Mô phỏng đã được khôi phục", message);
      } else {
        toast.error("Khôi phục thất bại", message);
      }
      setApiError(message);
    } finally {
      setIsRestoring(false);
    }
  };

  if (isLoading) {
    return <Loading message="Đang tải cấu hình bán giả lập..." />;
  }

  return (
    <div className="max-w-7xl mx-auto flex flex-col gap-6">
      {apiError && (
        <div className="p-4 bg-rose-50 border border-rose-200 text-rose-800 text-sm font-semibold rounded-2xl">
          {apiError}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Left Column: Mô phỏng bán */}
        <section className="bg-white border border-slate-100 rounded-3xl p-6 sm:p-8 shadow-sm flex flex-col h-full">
          <div className="border-b border-slate-100 pb-3 mb-6">
            <h3 className="text-lg font-black text-slate-800 flex items-center gap-2">
              <Play size={20} className="text-amber-800" /> Mô phỏng bán
            </h3>
            <p className="text-xs text-slate-500 mt-2 leading-relaxed">
              Chọn sản phẩm và nhập số lượng để mô phỏng bán hàng. Hệ thống sẽ dùng logic mô phỏng hiện có và kích hoạt AI Agent sau khi tồn kho thay đổi.
            </p>
          </div>

          <div className="flex-1 space-y-6">
            {/* Select Product */}
            <div>
              <label className="block text-sm font-medium text-slate-750 mb-1.5 font-semibold">Chọn sản phẩm</label>
              <select
                value={selectedProductId}
                onChange={(e) => {
                  setSelectedProductId(e.target.value);
                }}
                className="block w-full px-3.5 py-2.5 rounded-lg border border-slate-300 bg-white text-sm outline-none focus:ring-2 focus:ring-amber-700/20 focus:border-amber-700"
              >
                <option value="">-- Chọn sản phẩm cần mô phỏng --</option>
                {products.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </div>

            {!selectedProductId ? (
              <div className="p-4 bg-slate-50 border border-slate-200 text-slate-600 text-sm rounded-xl">
                Vui lòng chọn sản phẩm cần mô phỏng.
              </div>
            ) : (
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
                  {localSimulatedDemand <= 0 && (
                    <p className="text-sm text-rose-600 mt-2 font-medium">Số lượng mô phỏng phải lớn hơn 0.</p>
                  )}
                  {localSimulatedDemand > currentQty && (
                    <p className="text-sm text-rose-600 mt-2 font-medium">Số lượng mô phỏng không được vượt quá tồn kho hiện tại ({currentQty} {unit}).</p>
                  )}
                </div>
              </div>
            )}

            {/* PR Status Result inside the left column */}
            {result && result.productId === selectedProductId && !result.restored && (
              <div className="mt-6">
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
          </div>

          <div className="pt-6 mt-6 border-t border-slate-100 flex justify-end">
            <Button
              onClick={() => setShowConfirm(true)}
              className="px-6 py-3"
              disabled={!selectedProductId || localSimulatedDemand <= 0 || localSimulatedDemand > currentQty || isSimulating}
            >
              Apply Simulation
            </Button>
          </div>
        </section>

        {/* Right Column: Khôi phục sản phẩm */}
        <section className="bg-white border border-slate-100 rounded-3xl p-6 sm:p-8 shadow-sm flex flex-col h-full">
          <div className="flex items-start justify-between border-b border-slate-100 pb-3 mb-6">
            <div>
              <h3 className="text-lg font-black text-slate-800 flex items-center gap-2">
                <RefreshCw size={20} className="text-blue-600" /> Khôi phục sản phẩm
              </h3>
              <p className="text-xs text-slate-500 mt-2 leading-relaxed">
                Khôi phục lại số lượng tồn kho đã bị trừ trong lần mô phỏng gần nhất chưa khôi phục.
              </p>
            </div>
            <button onClick={() => loadData(true)} className="p-1.5 text-slate-400 hover:text-slate-700 rounded-lg hover:bg-slate-50 shrink-0">
              <RefreshCw size={14} />
            </button>
          </div>

          <div className="flex-1 flex flex-col">
            {pendingRestores.length === 0 ? (
              <div className="flex-1 flex items-center justify-center p-6 border-2 border-dashed border-slate-200 rounded-xl bg-slate-50 min-h-[200px]">
                <p className="text-slate-500 text-sm font-medium">Chưa có mô phỏng nào cần khôi phục.</p>
              </div>
            ) : (
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-slate-750 mb-1.5 font-semibold">Chọn sản phẩm cần khôi phục</label>
                  <select
                    value={selectedRestoreId}
                    onChange={(e) => setSelectedRestoreId(e.target.value)}
                    className="block w-full px-3.5 py-2.5 rounded-lg border border-slate-300 bg-white text-sm outline-none focus:ring-2 focus:ring-amber-700/20 focus:border-amber-700"
                  >
                    <option value="">-- Chọn sản phẩm cần khôi phục --</option>
                    {pendingRestores.map((r) => (
                      <option key={r.productId} value={r.productId}>
                        {r.productName} (Cần khôi phục: {r.totalDecreasedQuantity} {r.unit})
                      </option>
                    ))}
                  </select>
                </div>

                {selectedRestoreId && pendingRestores.find(r => r.productId === selectedRestoreId) && (() => {
                  const r = pendingRestores.find(item => item.productId === selectedRestoreId)!;
                  return (
                    <div className="p-5 bg-slate-50 border border-slate-200 rounded-xl space-y-4">
                      <div className="flex justify-between items-start gap-2">
                        <div>
                            <span className="text-xs text-slate-500 block mb-1">Tên sản phẩm</span>
                            <strong className="text-slate-800 text-sm">{r.productName || "Sản phẩm không tên"}</strong>
                        </div>
                        <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold bg-amber-50 border border-amber-200 text-amber-800 shrink-0">
                          Chưa khôi phục
                        </span>
                      </div>

                      <div className="grid grid-cols-2 gap-3">
                        <div className="bg-white p-3 rounded-lg border border-slate-150 text-center">
                          <span className="text-[10px] text-slate-400 block font-medium mb-1">Tổng cần khôi phục</span>
                          <strong className="text-base text-rose-600">{r.totalDecreasedQuantity} {r.unit}</strong>
                        </div>
                        <div className="bg-white p-3 rounded-lg border border-slate-150 text-center">
                          <span className="text-[10px] text-slate-400 block font-medium mb-1">Số lần mô phỏng</span>
                          <strong className="text-base text-slate-700">{r.transactionIds.length}</strong>
                        </div>
                      </div>
                      
                      {r.transactionIds.length > 0 && (
                        <div className="text-[10px] text-slate-400 break-all bg-white p-2 rounded border border-slate-150 max-h-24 overflow-y-auto">
                          <strong>Các mã giao dịch:</strong>
                          <ul className="list-disc pl-4 mt-1">
                            {r.transactionIds.map((tid: string) => (
                              <li key={tid}>{tid}</li>
                            ))}
                          </ul>
                        </div>
                      )}
                    </div>
                  );
                })()}
              </div>
            )}
          </div>

          <div className="pt-6 mt-6 border-t border-slate-100 flex justify-end gap-3">
            <Button
              onClick={handleRestoreSimulation}
              disabled={!selectedRestoreId || isRestoring}
              className="px-6 py-3"
              isLoading={isRestoring}
            >
              Khôi phục sản phẩm
            </Button>
          </div>
        </section>
      </div>

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
