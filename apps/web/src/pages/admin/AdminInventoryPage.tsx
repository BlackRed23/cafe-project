import React, { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { inventoryApi } from "../../api/inventory.api";
import { suppliersApi } from "../../api/suppliers.api";
import { agentLogsApi } from "../../api/agentLogs.api";
import type { Inventory } from "../../types/inventory.types";
import type { SupplierProduct } from "../../types/supplier.types";
import type { AgentLog } from "../../types/agentLog.types";
import { Badge } from "../../components/common/Badge";
import { Button } from "../../components/common/Button";
import { Loading } from "../../components/common/Loading";
import { EmptyState } from "../../components/common/EmptyState";
import { Modal } from "../../components/common/Modal";
import { Input } from "../../components/common/Input";
import { DataTable } from "../../components/admin/DataTable";
import { AlertCircle, PlusCircle, Sliders, Settings, Package, CheckCircle, Info, X } from "lucide-react";
import { getErrorMessage } from "../../api/client";

type InventoryTab = "ALL" | "LOW_STOCK" | "WARNING";

export const AdminInventoryPage: React.FC = () => {
  const [inventories, setInventories] = useState<Inventory[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");

  const [activeInventoryTab, setActiveInventoryTab] = useState<InventoryTab>("ALL");

  const [selectedInventory, setSelectedInventory] = useState<Inventory | null>(null);
  const [modalType, setModalType] = useState<"import" | "adjust" | "threshold" | null>(null);
  const [inputValue, setInputValue] = useState<number>(0);
  const [inputNote, setInputNote] = useState("");
  const [importMode, setImportMode] = useState<"internal" | "supplier">("internal");
  const [supplierProducts, setSupplierProducts] = useState<SupplierProduct[]>([]);
  const [modalLoading, setModalLoading] = useState(false);
  const [thresholdSuggestion, setThresholdSuggestion] = useState<any>(null);
  const [isSuggesting, setIsSuggesting] = useState(false);
  const [isScanningInventory, setIsScanningInventory] = useState(false);
  const [planningPeriod, setPlanningPeriod] = useState<"WEEKLY" | "MONTHLY" | "CUSTOM">("WEEKLY");
  const [planningDays, setPlanningDays] = useState<number>(14);
  const [toast, setToast] = useState<{ message: string; type: "success" | "error" | "info" | "warning" } | null>(null);

  const [scanResultModalOpen, setScanResultModalOpen] = useState(false);
  const [scanResults, setScanResults] = useState<AgentLog[]>([]);
  const [scanSummary, setScanSummary] = useState<any>({});

  const getLogStatusText = (log: AgentLog) => {
    const result = log.result || "";
    const reason = log.reason || "";
    if (result === "CREATED_PURCHASE_REQUEST") return "Đã tạo yêu cầu nhập hàng";
    if (result === "SKIPPED_DUPLICATE" || reason === "ACTIVE_PR_EXISTS") return "Đã có yêu cầu nhập hàng";
    if (result === "NO_SUPPLIER" || reason === "NO_SUPPLIERS_MAPPED" || reason === "SUPPLIERS_INACTIVE") return "Thiếu nhà cung cấp";
    if (reason === "STOCK_OK" || reason === "ABOVE_THRESHOLD") return "Tồn kho ổn định";
    if (log.status === "FAILED" || result === "ERROR") return "Lỗi Agent";
    return log.result || log.status;
  };

  const showToast = (message: string, type: "success" | "error" | "info" | "warning" = "info") => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3000);
  };

  const handleScanInventory = async () => {
    setIsScanningInventory(true);
    setScanResultModalOpen(false);
    try {
      const res = await agentLogsApi.scanInventory({ triggerType: "MANUAL_ADMIN_SCAN" });

      if (res.cooldownRemainingSeconds) {
        showToast(`Vui lòng chờ ${res.cooldownRemainingSeconds}s trước khi quét lại.`, "warning");
        return;
      }

      if (res.activeScanSessionId) {
        showToast(`AI Agent đang quét tồn kho, vui lòng chờ hoàn tất.`, "warning");
        return;
      }

      const results = res.results || [];
      setScanResults(results);

      const createdCount = res.createdPurchaseRequests?.length || results.filter(r => r.result === "CREATED_PURCHASE_REQUEST").length;
      const duplicateCount = results.filter(r => r.result === "SKIPPED_DUPLICATE" || r.reason === "ACTIVE_PR_EXISTS").length;
      const noSupplierCount = results.filter(r => r.result === "NO_SUPPLIER" || r.reason === "NO_SUPPLIERS_MAPPED" || r.reason === "SUPPLIERS_INACTIVE").length;
      const failedCount = results.filter(r => r.status === "FAILED" || r.result === "ERROR").length;
      const lowStockCount = createdCount + duplicateCount + noSupplierCount;
      const stockOkCount = results.filter(r => r.reason === "STOCK_OK" || r.reason === "ABOVE_THRESHOLD").length;

      setScanSummary({
        createdCount,
        duplicateCount,
        noSupplierCount,
        failedCount,
        lowStockCount,
      });

      const shouldOpenModal = createdCount > 0 || duplicateCount > 0 || noSupplierCount > 0 || failedCount > 0 || (!!res.agentWarning && results.length > 0);

      if (res.agentWarning) {
        showToast("Không kết nối được AI Agent service. Vui lòng kiểm tra Nhật ký Agent.", "warning");
        if (shouldOpenModal) setScanResultModalOpen(true);
      } else if (createdCount > 0) {
        showToast(`AI Agent đã tạo ${createdCount} yêu cầu nhập hàng.`, "success");
        setScanResultModalOpen(true);
      } else if (noSupplierCount > 0) {
        showToast("AI Agent đã quét xong. Có sản phẩm thiếu nhà cung cấp hợp lệ.", "warning");
        setScanResultModalOpen(true);
      } else if (duplicateCount > 0) {
        showToast("AI Agent đã quét xong. Một số sản phẩm đã có yêu cầu nhập hàng đang xử lý.", "info");
        setScanResultModalOpen(true);
      } else if (stockOkCount > 0 && results.length > 0 && !shouldOpenModal) {
        showToast("AI Agent đã quét xong, tồn kho đang ổn định.", "success");
      } else if (!shouldOpenModal) {
        showToast("AI Agent đã quét xong, chưa có yêu cầu nhập hàng mới.", "success");
      } else {
        setScanResultModalOpen(true);
      }

      await fetchInventories();
    } catch (err: any) {
      showToast("Không kết nối được AI Agent service. Vui lòng kiểm tra Nhật ký Agent.", "error");
    } finally {
      setIsScanningInventory(false);
    }
  };

  const fetchInventories = async () => {
    try {
      setIsLoading(true);
      const data = await inventoryApi.getInventories();
      setInventories(data);
    } catch {
      setError("Không thể tải thông tin tồn kho.");
    } finally {
      setIsLoading(false);
    }
  };

  const fetchSupplierProducts = async () => {
    try {
      const data = await suppliersApi.getSupplierProducts();
      setSupplierProducts(data);
    } catch { }
  };

  useEffect(() => {
    fetchInventories();
    fetchSupplierProducts();
  }, []);

  const getInventoryStatus = (availableStock: number, threshold?: number): "OK" | "WARNING" | "NEED_RESTOCK" => {
    const min = threshold || 0;
    if (availableStock < min) return "NEED_RESTOCK";
    if (availableStock === min) return "WARNING";
    return "OK";
  };

  const getThresholdWarning = () => {
    if (modalType !== "threshold" || !thresholdSuggestion) return null;

    if (inputValue < thresholdSuggestion.leadTimeDemand) {
      return {
        type: "strong",
        message: "Ngưỡng này quá thấp so với tốc độ bán và thời gian nhập hàng.",
      };
    }

    if (inputValue < thresholdSuggestion.recommendedThreshold) {
      return {
        type: "warning",
        message: "Ngưỡng thấp hơn đề xuất, có nguy cơ thiếu hàng trong thời gian chờ nhập.",
      };
    }

    if (inputValue > thresholdSuggestion.recommendedThreshold * 3) {
      return {
        type: "warning",
        message: "Ngưỡng này cao bất thường, có thể gây tồn kho quá nhiều.",
      };
    }

    return null;
  };

  const handleOpenModal = async (inv: Inventory, type: "import" | "adjust" | "threshold") => {
    setSelectedInventory(inv);
    setModalType(type);
    setInputValue(type === "threshold" ? (inv.minThreshold ?? inv.min_threshold ?? 0) : type === "adjust" ? inv.quantity : 0);
    setInputNote("");
    if (type === "threshold") {
      setIsSuggesting(true);
      setThresholdSuggestion(null);
      setPlanningPeriod("WEEKLY");
      setPlanningDays(14);
      try {
        const suggestion = await inventoryApi.getThresholdSuggestion((inv as any).inventoryId ?? inv.id, { planningPeriod: "WEEKLY", planningDays: 14 });
        setThresholdSuggestion(suggestion);
      } catch (err) {
        console.error("Failed to load suggestion");
      } finally {
        setIsSuggesting(false);
      }
    }
  };

  const fetchSuggestion = async (period: "WEEKLY" | "MONTHLY" | "CUSTOM", days: number) => {
    if (!selectedInventory) return;
    setIsSuggesting(true);
    try {
      const suggestion = await inventoryApi.getThresholdSuggestion((selectedInventory as any).inventoryId ?? selectedInventory.id, {
        planningPeriod: period,
        planningDays: days,
      });
      setThresholdSuggestion(suggestion);
    } catch (err) {
      console.error("Failed to load suggestion");
    } finally {
      setIsSuggesting(false);
    }
  };

  const handleCloseModal = () => {
    setSelectedInventory(null);
    setModalType(null);
    setInputValue(0);
    setInputNote("");
    setImportMode("internal");
    setThresholdSuggestion(null);
  };

  const handleSaveSuggestedThreshold = async () => {
    if (!selectedInventory || !thresholdSuggestion) return;

    setModalLoading(true);
    try {
      await inventoryApi.updateInventory(selectedInventory.productId, {
        minThreshold: thresholdSuggestion.recommendedThreshold,
      });
      showToast("Đã lưu ngưỡng đề xuất.", "success");
      await fetchInventories();
      handleCloseModal();
    } catch (err: any) {
      showToast(getErrorMessage(err) || "Không thể lưu ngưỡng đề xuất.", "error");
    } finally {
      setModalLoading(false);
    }
  };

  const handleModalSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedInventory) return;

    if (modalType === "import" && inputValue <= 0) {
      showToast("Số lượng nhập thêm phải lớn hơn 0", "error");
      return;
    }
    if (modalType === "adjust" && inputValue < 0) {
      showToast("Số lượng thực tế không được âm", "error");
      return;
    }
    if (modalType === "threshold" && inputValue < 0) {
      showToast("Ngưỡng không được âm", "error");
      return;
    }

    setModalLoading(true);

    try {
      if (modalType === "import") {
        const supplierProduct = supplierProducts.find(sp => sp.productId === selectedInventory.productId);
        const hasSupplierConversion = Boolean(
          supplierProduct?.purchaseUnit &&
          supplierProduct?.conversionQuantity &&
          supplierProduct?.conversionTargetUnit
        );
        const conversionWarning = hasSupplierConversion && supplierProduct?.conversionTargetUnit !== selectedInventory.product?.unit;
        const isSupplierMode = importMode === "supplier" && hasSupplierConversion && !conversionWarning;
        const finalQuantity = isSupplierMode ? inputValue * (supplierProduct!.conversionQuantity || 1) : inputValue;

        if (inputValue <= 0) {
          showToast(isSupplierMode ? "Số lượng nhập theo NCC phải lớn hơn 0" : "Số lượng nhập thêm phải lớn hơn 0", "error");
          setModalLoading(false);
          return;
        }

        const res = await inventoryApi.importInventory({
          productId: selectedInventory.productId,
          quantity: finalQuantity,
          note: inputNote.trim() || undefined,
        });
        const minThreshold = res.minThreshold ?? res.min_threshold ?? 0;
        const warning = res.warnings?.[0]?.message;

        let successMessage = "Nhập kho thành công.";
        if (isSupplierMode) {
          successMessage = `Đã nhập ${inputValue} ${supplierProduct!.purchaseUnit}, quy đổi thành ${finalQuantity} ${selectedInventory.product?.unit || "đơn vị"}.`;
        } else if (res.message) {
          successMessage = res.message;
        }

        if (res.quantity <= minThreshold) {
          showToast(warning || "Nhập kho thành công nhưng số lượng sau nhập vẫn thấp hơn ngưỡng tối thiểu.", "warning");
        } else {
          showToast(successMessage, "success");
        }
      } else if (modalType === "adjust") {
        const diff = inputValue - selectedInventory.quantity;
        if (diff === 0) {
          showToast("Điều chỉnh tồn kho thành công.", "success");
          handleCloseModal();
          setModalLoading(false);
          return;
        }
        const res = await inventoryApi.adjustInventory({
          productId: selectedInventory.productId,
          quantity: diff,
          note: inputNote.trim() || undefined,
        });
        const minThreshold = res.minThreshold ?? res.min_threshold ?? 0;
        const warning = res.warnings?.[0]?.message;
        if (res.quantity <= minThreshold) {
          showToast(warning || "Điều chỉnh thành công. Số lượng sau điều chỉnh thấp hơn ngưỡng, cần nhập hàng.", "warning");
        } else {
          showToast(res.message || "Điều chỉnh tồn kho thành công.", "success");
        }
      } else if (modalType === "threshold") {
        const res = await inventoryApi.updateInventory(selectedInventory.productId, {
          minThreshold: inputValue,
        });
        if (res.warnings?.length) {
          showToast(res.warnings[0].message, "warning");
        } else {
          showToast(res.message || "Cập nhật ngưỡng tồn kho thành công.", "success");
        }
      }
      await fetchInventories();
      handleCloseModal();
    } catch (err: any) {
      const msg = getErrorMessage(err);
      if (modalType === "import") {
        showToast(msg || "Không thể nhập kho, vui lòng thử lại.", "error");
      } else if (modalType === "adjust") {
        showToast(msg || "Không thể điều chỉnh tồn kho, vui lòng thử lại.", "error");
      } else {
        showToast(msg || "Không thể cập nhật ngưỡng, vui lòng thử lại.", "error");
      }
    } finally {
      setModalLoading(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loading message="Đang tải danh sách tồn kho..." />
      </div>
    );
  }

  const filteredInventories = inventories.filter((inv) => {
    const matchesSearch = (inv.product?.name || "").toLowerCase().includes(search.toLowerCase());
    const threshold = inv.minThreshold ?? inv.min_threshold ?? 0;

    const available = inv.availableStock ?? inv.quantity;

    if (activeInventoryTab === "LOW_STOCK") {
      return matchesSearch && available < threshold;
    }
    if (activeInventoryTab === "WARNING") {
      return matchesSearch && available === threshold;
    }
    return matchesSearch;
  });

  // Count stats
  const lowCount = inventories.filter((inv) => {
    const threshold = inv.minThreshold ?? inv.min_threshold ?? 0;
    const available = inv.availableStock ?? inv.quantity;
    return available < threshold;
  }).length;
  const warnCount = inventories.filter((inv) => {
    const threshold = inv.minThreshold ?? inv.min_threshold ?? 0;
    const available = inv.availableStock ?? inv.quantity;
    return available === threshold;
  }).length;

  const columns = [
    {
      header: "Sản phẩm",
      render: (inv: Inventory) => {
        const threshold = inv.minThreshold ?? inv.min_threshold ?? 0;
        const available = inv.availableStock ?? inv.quantity;
        const status = getInventoryStatus(available, threshold);
        const isLow = status === "NEED_RESTOCK";
        return (
          <div className="flex items-center gap-2.5">
            {isLow && <AlertCircle className="text-rose-500 flex-shrink-0 animate-pulse" size={15} />}
            <span className={`font-semibold ${isLow ? "text-rose-700" : "text-slate-800"}`}>
              {inv.product?.name || "Sản phẩm không tên"}
            </span>
          </div>
        );
      },
    },
    {
      header: "Tồn kho",
      render: (inv: Inventory) => {
        const threshold = inv.minThreshold ?? inv.min_threshold ?? 0;
        const available = inv.availableStock ?? inv.quantity;
        const reserved = inv.reservedStock ?? 0;
        const isLow = available < threshold;
        return (
          <div className="flex flex-col">
            <span className={`font-bold ${isLow ? "text-rose-600" : "text-emerald-700"} text-[15px]`}>
              {available}{" "}
              <span className="text-xs text-slate-500 font-normal">
                khả dụng ({inv.product?.unit || "đơn vị"})
              </span>
            </span>
            <span className="text-xs text-slate-500 mt-1 font-medium bg-slate-100 px-1.5 py-0.5 rounded w-fit">
              Tổng: {inv.quantity} | Giữ: {reserved}
            </span>
          </div>
        );
      },
    },
    {
      header: "Ngưỡng tối thiểu",
      render: (inv: Inventory) => (
        <span className="font-medium text-slate-500 text-sm">
          {inv.minThreshold ?? inv.min_threshold ?? 0}
        </span>
      ),
    },
    {
      header: "Trạng thái",
      render: (inv: Inventory) => {
        const threshold = inv.minThreshold ?? inv.min_threshold ?? 0;
        const available = inv.availableStock ?? inv.quantity;
        return <Badge status={getInventoryStatus(available, threshold)} />;
      },
    },
    {
      header: "Thao tác",
      className: "text-right",
      render: (inv: Inventory) => (
        <div className="flex items-center justify-end gap-2">
          <Button
            onClick={() => handleOpenModal(inv, "import")}
            variant="outline"
            size="sm"
            className="flex items-center gap-1 text-xs hover:border-emerald-400 hover:text-emerald-700 hover:bg-emerald-50"
          >
            <PlusCircle size={13} /> Nhập kho
          </Button>
          <Button
            onClick={() => handleOpenModal(inv, "adjust")}
            variant="outline"
            size="sm"
            className="flex items-center gap-1 text-xs hover:border-amber-400 hover:text-amber-800 hover:bg-amber-50"
          >
            <Sliders size={13} /> Điều chỉnh
          </Button>
          <Button
            onClick={() => handleOpenModal(inv, "threshold")}
            variant="outline"
            size="sm"
            className="flex items-center gap-1 text-xs"
          >
            <Settings size={13} /> Ngưỡng
          </Button>
        </div>
      ),
    },
  ];

  return (
    <>
      <div className="flex flex-col gap-6">
        {/* Summary Filter Tabs */}
        <div className="flex flex-wrap gap-2 border-b border-slate-200">
          <button
            onClick={() => setActiveInventoryTab("ALL")}
            className={`flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 transition-colors ${activeInventoryTab === "ALL"
              ? "border-amber-600 text-amber-700 bg-amber-50/50"
              : "border-transparent text-slate-600 hover:text-slate-900 hover:bg-slate-50"
              }`}
          >
            <Package size={16} />
            <span>Tất cả sản phẩm ({inventories.length})</span>
          </button>

          <button
            onClick={() => setActiveInventoryTab("LOW_STOCK")}
            className={`flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 transition-colors ${activeInventoryTab === "LOW_STOCK"
              ? "border-rose-600 text-rose-700 bg-rose-50/50"
              : "border-transparent text-slate-600 hover:text-slate-900 hover:bg-slate-50"
              }`}
          >
            <AlertCircle size={16} className={activeInventoryTab === "LOW_STOCK" ? "text-rose-600" : "text-rose-500"} />
            <span>Cần nhập hàng {lowCount > 0 && `(${lowCount})`}</span>
          </button>

          <button
            onClick={() => setActiveInventoryTab("WARNING")}
            className={`flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 transition-colors ${activeInventoryTab === "WARNING"
              ? "border-orange-600 text-orange-700 bg-orange-50/50"
              : "border-transparent text-slate-600 hover:text-slate-900 hover:bg-slate-50"
              }`}
          >
            <AlertCircle size={16} className={activeInventoryTab === "WARNING" ? "text-orange-600" : "text-orange-500"} />
            <span>Cảnh báo ngưỡng {warnCount > 0 && `(${warnCount})`}</span>
          </button>

          <div className="flex flex-wrap items-center gap-3 ml-auto py-2 sm:py-0 pr-2">
            <Button
              onClick={handleScanInventory}
              disabled={isScanningInventory}
              className="flex items-center gap-2 bg-Brown-600 hover:bg-Brown-700 text-white border-transparent transition-colors shadow-sm"
              size="sm"
            >
              {isScanningInventory ? (
                <span>Đang quét...</span>
              ) : (
                <>

                  <span>Quét tồn kho bằng AI Agent</span>
                </>
              )}
            </Button>
            <Link
              to="/admin/agent-logs"
              className="text-sm font-semibold text-Brown-600 hover:text-Brown-800 hover:underline whitespace-nowrap"
            >
              Xem Nhật ký Agent
            </Link>
          </div>
        </div>

        {error && (
          <div className="p-4 bg-rose-50 border border-rose-200 text-rose-800 text-sm font-medium rounded-xl">
            {error}
          </div>
        )}

        {inventories.length === 0 ? (
          <EmptyState title="Kho trống" description="Không tìm thấy bản ghi sản phẩm tồn kho nào." />
        ) : (
          <DataTable
            columns={columns}
            data={filteredInventories}
            searchPlaceholder="Tìm theo tên sản phẩm tồn kho..."
            searchValue={search}
            onSearchChange={setSearch}
          />
        )}

        {/* Dynamic Inventory Form Modal */}
        {modalType && selectedInventory && (
          <Modal
            isOpen={true}
            onClose={handleCloseModal}
            title={
              modalType === "import"
                ? `Nhập thêm kho: ${selectedInventory.product?.name}`
                : modalType === "adjust"
                  ? `Điều chỉnh số lượng: ${selectedInventory.product?.name}`
                  : `Cập nhật ngưỡng tối thiểu: ${selectedInventory.product?.name}`
            }
            size={modalType === "threshold" ? "md" : "sm"}
          >
            <form onSubmit={handleModalSubmit} className="space-y-4">
              {modalType === "threshold" && (
                <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 mb-4 space-y-3 text-sm text-slate-700 relative overflow-hidden">
                  {isSuggesting && (
                    <div className="absolute inset-0 bg-white/50 backdrop-blur-sm flex items-center justify-center z-10">
                      <Loading message="Đang tính toán..." />
                    </div>
                  )}
                  <div className="space-y-2 pb-3 border-b border-slate-200">
                    <label className="block font-semibold text-slate-900">Chu kỳ tính ngưỡng đề xuất</label>
                    <div className="flex gap-2">
                      {(['WEEKLY', 'MONTHLY', 'CUSTOM'] as const).map(period => (
                        <button
                          key={period}
                          type="button"
                          onClick={() => {
                            setPlanningPeriod(period);
                            fetchSuggestion(period, planningDays);
                          }}
                          className={`px-3 py-1.5 rounded-lg border text-xs font-medium transition-colors ${planningPeriod === period ? 'bg-amber-100 border-amber-300 text-amber-800' : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'}`}
                        >
                          {period === 'WEEKLY' ? 'Theo tuần' : period === 'MONTHLY' ? 'Theo tháng' : 'Tùy chỉnh'}
                        </button>
                      ))}
                    </div>

                    {planningPeriod === 'CUSTOM' && (
                      <div className="mt-2 flex items-center gap-2">
                        <span className="text-xs font-medium text-slate-600">Số ngày dự trữ:</span>
                        <input
                          type="number"
                          min="1"
                          value={planningDays}
                          onChange={(e) => setPlanningDays(parseInt(e.target.value) || 1)}
                          onBlur={() => fetchSuggestion('CUSTOM', planningDays)}
                          className="w-20 px-2 py-1 text-sm border border-slate-300 rounded focus:outline-none focus:border-amber-500"
                        />
                      </div>
                    )}
                  </div>
                  <div className="flex justify-between items-center bg-white p-2 rounded border border-slate-100">
                    <span className="text-slate-500">Tồn kho thật:</span>
                    <span className="font-semibold text-slate-900">{selectedInventory.quantity}</span>
                  </div>
                  <div className="flex justify-between items-center bg-white p-2 rounded border border-slate-100">
                    <span className="text-slate-500">Đang giữ cho đơn hàng:</span>
                    <span className="font-semibold text-orange-600">{selectedInventory.reservedStock ?? 0}</span>
                  </div>
                  <div className="flex justify-between items-center bg-white p-2 rounded border border-slate-100 shadow-sm">
                    <span className="font-medium text-slate-700">Tồn kho khả dụng:</span>
                    <span className="font-bold text-emerald-700 text-lg">{selectedInventory.availableStock ?? selectedInventory.quantity}</span>
                  </div>
                  <div className="flex justify-between items-center bg-white p-2 rounded border border-slate-100">
                    <span className="text-slate-500">Ngưỡng hiện tại:</span>
                    <span className="font-semibold text-slate-900">{selectedInventory.minThreshold ?? selectedInventory.min_threshold ?? 0}</span>
                  </div>
                  {thresholdSuggestion && (
                    <div className="flex justify-between items-center bg-amber-50 p-2 rounded border border-amber-100 mt-2">
                      <span className="text-amber-800 font-medium text-xs">Hàng an toàn (dự phòng):</span>
                      <span className="font-bold text-amber-700">{thresholdSuggestion.safetyStock ?? 0}</span>
                    </div>
                  )}
                  <div className="flex flex-col pt-3 mt-3 border-t border-slate-200 gap-2">
                    <div className="flex justify-between items-center">
                      <span className="font-semibold text-emerald-700">Ngưỡng đề xuất:</span>
                      <span className="font-bold text-lg text-emerald-700">{thresholdSuggestion?.recommendedThreshold ?? 0}</span>
                    </div>
                    {thresholdSuggestion?.explanation && (
                      <div className="text-xs text-slate-600 bg-white p-2.5 rounded-lg border border-slate-200 my-2 leading-relaxed">
                        <Info size={14} className="inline mr-1 text-blue-500 mb-0.5" />
                        {thresholdSuggestion.explanation}
                      </div>
                    )}

                    {thresholdSuggestion && (
                      <div className="flex flex-col gap-2">
                        {thresholdSuggestion.recommendedThreshold > (selectedInventory.minThreshold ?? selectedInventory.min_threshold ?? 0) && (
                          <p className="text-xs text-amber-600 font-medium">
                            Hệ thống đề xuất tăng ngưỡng để tránh thiếu hàng.
                          </p>
                        )}
                        {thresholdSuggestion.recommendedThreshold === (selectedInventory.minThreshold ?? selectedInventory.min_threshold ?? 0) && (
                          <p className="text-xs text-emerald-600 font-medium">
                            Ngưỡng hiện tại đã bằng ngưỡng đề xuất.
                          </p>
                        )}
                        {thresholdSuggestion.recommendedThreshold < (selectedInventory.minThreshold ?? selectedInventory.min_threshold ?? 0) && (
                          <p className="text-xs text-blue-600 font-medium">
                            Ngưỡng hiện tại đang an toàn hơn ngưỡng đề xuất.
                          </p>
                        )}

                        <div className="flex justify-end mt-1">
                          <Button
                            type="button"
                            size="sm"
                            variant={thresholdSuggestion.recommendedThreshold === (selectedInventory.minThreshold ?? selectedInventory.min_threshold ?? 0) ? "outline" : "primary"}
                            className={`h-8 text-xs ${thresholdSuggestion.recommendedThreshold === (selectedInventory.minThreshold ?? selectedInventory.min_threshold ?? 0) ? "border-slate-300 text-slate-600 hover:bg-slate-50" : "bg-emerald-600 hover:bg-emerald-700 text-white border-transparent"}`}
                            onClick={handleSaveSuggestedThreshold}
                            disabled={isSuggesting || !thresholdSuggestion || thresholdSuggestion.recommendedThreshold === (selectedInventory.minThreshold ?? selectedInventory.min_threshold ?? 0)}
                          >
                            Lưu ngưỡng đề xuất
                          </Button>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )}



              {modalType === "import" ? (() => {
                const supplierProduct = supplierProducts.find(sp => sp.productId === selectedInventory.productId);
                const hasSupplierConversion = Boolean(
                  supplierProduct?.purchaseUnit &&
                  supplierProduct?.conversionQuantity &&
                  supplierProduct?.conversionTargetUnit
                );
                // Lấy unit theo mức ưu tiên: selectedInventory.unit -> selectedInventory.product.unit -> inv.unit -> "đơn vị"
                const inventoryUnit = (selectedInventory as any).unit || selectedInventory.product?.unit || "đơn vị";
                const conversionWarning = hasSupplierConversion && supplierProduct?.conversionTargetUnit !== inventoryUnit;
                const isSupplierMode = importMode === "supplier" && hasSupplierConversion && !conversionWarning;

                return (
                  <div className="space-y-4">
                    <div className="bg-slate-50 p-3 rounded-lg border border-slate-200 text-sm flex items-center justify-between">
                      <span className="text-slate-600 font-medium">Đơn vị tồn kho nội bộ:</span>
                      <span className="font-bold text-slate-800">{inventoryUnit}</span>
                    </div>

                    {hasSupplierConversion && (
                      <div className="space-y-2 border-b border-slate-100 pb-4">
                        <label className="block text-sm font-semibold text-slate-800 mb-1">Nhập theo</label>
                        <div className="flex gap-3">
                          <button
                            type="button"
                            onClick={() => setImportMode("internal")}
                            className={`flex-1 py-2 px-3 border rounded-lg text-sm font-medium transition-colors ${importMode === "internal" ? "border-amber-500 bg-amber-50 text-amber-800" : "border-slate-200 text-slate-600 hover:bg-slate-50"}`}
                          >
                            Đơn vị tồn kho nội bộ
                          </button>
                          <button
                            type="button"
                            onClick={() => setImportMode("supplier")}
                            disabled={conversionWarning}
                            className={`flex-1 py-2 px-3 border rounded-lg text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${importMode === "supplier" ? "border-amber-500 bg-amber-50 text-amber-800" : "border-slate-200 text-slate-600 hover:bg-slate-50"}`}
                          >
                            Quy cách nhà cung cấp
                          </button>
                        </div>

                        {conversionWarning && (
                          <div className="flex items-start gap-1.5 mt-2 text-xs text-rose-600 bg-rose-50 p-2 rounded border border-rose-100">
                            <AlertCircle size={14} className="shrink-0 mt-0.5" />
                            <span>Quy cách nhà cung cấp chưa khớp đơn vị tồn kho nội bộ, vui lòng kiểm tra lại.</span>
                          </div>
                        )}

                        {!conversionWarning && isSupplierMode && (
                          <div className="text-xs font-medium text-emerald-700 bg-emerald-50 px-3 py-2 rounded-lg border border-emerald-100 flex items-center gap-2">
                            <Info size={14} />
                            Quy đổi: 1 {supplierProduct!.purchaseUnit} = {supplierProduct!.conversionQuantity} {supplierProduct!.conversionTargetUnit}
                          </div>
                        )}
                      </div>
                    )}

                    <div>
                      <Input
                        label={isSupplierMode ? `Số lượng nhập theo NCC (${supplierProduct!.purchaseUnit})` : `Số lượng nhập thêm (${inventoryUnit})`}
                        type="number"
                        value={inputValue || ""}
                        onChange={(e) => setInputValue(parseInt(e.target.value) || 0)}
                        required
                      />

                      {isSupplierMode && inputValue > 0 ? (
                        <p className="text-sm font-bold text-emerald-700 mt-2 bg-emerald-50 px-3 py-2 rounded border border-emerald-100">
                          Số lượng sẽ cộng vào kho: {inputValue * supplierProduct!.conversionQuantity!} {inventoryUnit}
                        </p>
                      ) : (
                        <p className="text-xs text-slate-500 mt-1.5 italic">
                          Số lượng này sẽ được cộng trực tiếp vào tồn kho nội bộ.
                        </p>
                      )}
                    </div>
                  </div>
                );
              })() : (
                <div>
                  <Input
                    label={
                      modalType === "threshold"
                        ? "Ngưỡng tối thiểu mới"
                        : "Số lượng thực tế sau kiểm kê"
                    }
                    type="number"
                    value={inputValue || ""}
                    onChange={(e) => setInputValue(parseInt(e.target.value) || 0)}
                    required
                  />
                  {modalType === "threshold" && thresholdSuggestion && (
                    <div className="mt-1">
                      {getThresholdWarning() && (
                        <p className="text-xs text-amber-600 flex items-center gap-1 mt-1">
                          <AlertCircle size={12} /> {getThresholdWarning()?.message}
                        </p>
                      )}
                    </div>
                  )}
                </div>
              )}

              {modalType !== "threshold" && (
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1.5">
                    Lý do / Ghi chú
                  </label>
                  <textarea
                    rows={2}
                    placeholder="Vd: Nhập lô hàng định kỳ..."
                    value={inputNote}
                    onChange={(e) => setInputNote(e.target.value)}
                    className="block w-full px-3.5 py-2.5 rounded-lg border border-slate-300 text-sm outline-none focus:ring-2 focus:ring-amber-700/20 focus:border-amber-700 resize-none"
                  />
                </div>
              )}

              <div className="pt-3 border-t border-slate-100 flex justify-end gap-2.5">
                <Button type="button" variant="outline" onClick={handleCloseModal}>
                  Hủy
                </Button>
                <Button type="submit" isLoading={modalLoading}>
                  Xác nhận
                </Button>
              </div>
            </form>
          </Modal>
        )}

        {scanResultModalOpen && (
          <Modal
            isOpen={true}
            onClose={() => setScanResultModalOpen(false)}
            title="Kết quả quét tồn kho bằng AI Agent"
            size="xl"
          >
            <div className="space-y-4">
              <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-4">
                <div className="bg-emerald-50 text-emerald-800 p-3 rounded-xl border border-emerald-100 flex flex-col items-center justify-center">
                  <span className="text-2xl font-bold">{scanSummary.createdCount || 0}</span>
                  <span className="text-xs font-medium text-center">Tạo mới</span>
                </div>
                <div className="bg-blue-50 text-blue-800 p-3 rounded-xl border border-blue-100 flex flex-col items-center justify-center">
                  <span className="text-2xl font-bold">{scanSummary.duplicateCount || 0}</span>
                  <span className="text-xs font-medium text-center">Đang xử lý</span>
                </div>
                <div className="bg-amber-50 text-amber-800 p-3 rounded-xl border border-amber-100 flex flex-col items-center justify-center">
                  <span className="text-2xl font-bold">{scanSummary.noSupplierCount || 0}</span>
                  <span className="text-xs font-medium text-center">Thiếu NCC</span>
                </div>
                <div className="bg-rose-50 text-rose-800 p-3 rounded-xl border border-rose-100 flex flex-col items-center justify-center">
                  <span className="text-2xl font-bold">{scanSummary.lowStockCount || 0}</span>
                  <span className="text-xs font-medium text-center">Cần nhập</span>
                </div>
                {scanSummary.failedCount > 0 && (
                  <div className="bg-red-50 text-red-800 p-3 rounded-xl border border-red-100 flex flex-col items-center justify-center">
                    <span className="text-2xl font-bold">{scanSummary.failedCount || 0}</span>
                    <span className="text-xs font-medium text-center">Lỗi</span>
                  </div>
                )}
              </div>

              <div className="overflow-x-auto border border-slate-200 rounded-xl max-h-[50vh] overflow-y-auto">
                <table className="w-full text-sm text-left">
                  <thead className="bg-slate-50 text-slate-600 font-medium sticky top-0 shadow-sm z-10">
                    <tr>
                      <th className="px-4 py-3">Sản phẩm</th>
                      <th className="px-4 py-3 text-center">Tồn kho</th>
                      <th className="px-4 py-3 text-center">Ngưỡng</th>
                      <th className="px-4 py-3">Trạng thái</th>
                      <th className="px-4 py-3">Lý do / Ghi chú</th>
                      <th className="px-4 py-3 text-right">Hành động</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {scanResults.map((log, idx) => {
                      const statusText = getLogStatusText(log);
                      const isError = log.status === "FAILED" || log.result === "ERROR";
                      const isWarning = log.result === "NO_SUPPLIER" || log.reason === "NO_SUPPLIERS_MAPPED" || log.reason === "SUPPLIERS_INACTIVE" || log.reason === "EXISTING_PR_SUPPLIER_INACTIVE" || log.reason === "ACTIVE_PR_SUPPLIER_INACTIVE";
                      const isSuccess = log.result === "CREATED_PURCHASE_REQUEST";
                      const isInfo = log.result === "SKIPPED_DUPLICATE" || log.reason === "ACTIVE_PR_EXISTS";

                      const inv = inventories.find(i => i.productId === log.productId) || (log.input as any)?.inventory;
                      const stock = inv?.quantity ?? "-";
                      const threshold = inv?.minThreshold ?? inv?.min_threshold ?? "-";

                      const productName = log.productName || log.product?.name || inv?.product?.name || "Không rõ";

                      return (
                        <tr key={idx} className="hover:bg-slate-50/50">
                          <td className="px-4 py-3 font-medium text-slate-800">{productName}</td>
                          <td className="px-4 py-3 text-center font-bold text-slate-700">{stock}</td>
                          <td className="px-4 py-3 text-center text-slate-500">{threshold}</td>
                          <td className="px-4 py-3">
                            <span className={`px-2 py-1 rounded-md text-xs font-medium whitespace-nowrap ${isSuccess ? "bg-emerald-100 text-emerald-800" :
                              isWarning ? "bg-amber-100 text-amber-800" :
                                isError ? "bg-rose-100 text-rose-800" :
                                  isInfo ? "bg-blue-100 text-blue-800" :
                                    "bg-slate-100 text-slate-800"
                              }`}>
                              {statusText}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-xs text-slate-600 max-w-[200px] truncate" title={log.message || log.errorMessage || log.reasoning}>
                            {log.reason === "EXISTING_PR_SUPPLIER_INACTIVE" || log.reason === "ACTIVE_PR_SUPPLIER_INACTIVE" ? (
                              <div className="space-y-1">
                                <div>Đã có yêu cầu nhập hàng nhưng nhà cung cấp đã bị tắt.</div>
                                <div className="text-amber-700 font-medium">Admin cần mở lại nhà cung cấp, đổi nhà cung cấp hoặc huỷ yêu cầu cũ trước khi tạo yêu cầu mới.</div>
                                {(log.output as any)?.suggestedSuppliers?.length > 0 ? (
                                  <div className="text-blue-600 font-medium text-[11px] mt-1">
                                    Agent tìm thấy {(log.output as any).suggestedSuppliers.length} nhà cung cấp thay thế đang hoạt động.
                                  </div>
                                ) : (
                                  <div className="text-rose-600 font-medium text-[11px] mt-1">
                                    Không có nhà cung cấp thay thế đang hoạt động.
                                  </div>
                                )}
                              </div>
                            ) : (
                              log.message || log.errorMessage || log.reasoning || log.reason || "-"
                            )}
                          </td>
                          <td className="px-4 py-3 text-right">
                            <div className="flex flex-col gap-1 items-end">
                              {log.purchaseRequestId && (log.reason !== "EXISTING_PR_SUPPLIER_INACTIVE" && log.reason !== "ACTIVE_PR_SUPPLIER_INACTIVE") && (
                                <Link to={`/admin/purchase-requests/${log.purchaseRequestId}`} className="text-xs text-indigo-600 hover:underline whitespace-nowrap">
                                  Xem yêu cầu nhập hàng
                                </Link>
                              )}
                              {isWarning && (log.reason !== "EXISTING_PR_SUPPLIER_INACTIVE" && log.reason !== "ACTIVE_PR_SUPPLIER_INACTIVE") && (
                                <Link to={`/admin/suppliers`} className="text-xs text-amber-600 hover:underline whitespace-nowrap">
                                  Gán nhà cung cấp
                                </Link>
                              )}
                              {(log.reason === "EXISTING_PR_SUPPLIER_INACTIVE" || log.reason === "ACTIVE_PR_SUPPLIER_INACTIVE") && (
                                <>
                                  <Link to={`/admin/purchase-requests/${(log.output as any)?.existingPurchaseRequestId || (log.input as any)?.existingPurchaseRequestId}`} className="text-xs text-amber-700 hover:underline whitespace-nowrap font-medium">
                                    Xem yêu cầu nhập hàng
                                  </Link>
                                  <Link to={`/admin/suppliers`} className="text-xs text-indigo-600 hover:underline whitespace-nowrap">
                                    Quản lý nhà cung cấp
                                  </Link>
                                </>
                              )}
                              <Link to="/admin/agent-logs" className="text-xs text-indigo-600 hover:underline whitespace-nowrap">
                                Xem Nhật ký Agent
                              </Link>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                    {scanResults.length === 0 && (
                      <tr>
                        <td colSpan={6} className="px-4 py-8 text-center text-slate-500 italic">
                          Không có chi tiết kết quả quét.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>

              <div className="pt-3 flex justify-between items-center border-t border-slate-100">
                <Link to="/admin/agent-logs" className="text-sm font-medium text-indigo-600 hover:text-indigo-800 hover:underline">
                  Xem Nhật ký Agent chi tiết
                </Link>
                <Button type="button" onClick={() => setScanResultModalOpen(false)}>
                  Đóng
                </Button>
              </div>
            </div>
          </Modal>
        )}
      </div>
      {/* Toast Notification Container */}
      {toast && (
        <div className="fixed top-6 right-6 z-[60] animate-fade-in-down">
          <div
            className={`flex items-center gap-3 px-4 py-3 rounded-xl shadow-lg border ${toast.type === "success"
              ? "bg-emerald-50 border-emerald-200 text-emerald-800"
              : toast.type === "warning"
                ? "bg-amber-50 border-amber-200 text-amber-800"
                : toast.type === "error"
                  ? "bg-rose-50 border-rose-200 text-rose-800"
                  : "bg-blue-50 border-blue-200 text-blue-800"
              }`}
          >
            {toast.type === "success" ? (
              <CheckCircle size={20} className="text-emerald-600" />
            ) : toast.type === "warning" ? (
              <AlertCircle size={20} className="text-amber-600" />
            ) : toast.type === "error" ? (
              <AlertCircle size={20} className="text-rose-600" />
            ) : (
              <Info size={20} className="text-blue-600" />
            )}
            <p className="font-medium text-sm pr-6">{toast.message}</p>
            <button
              onClick={() => setToast(null)}
              className={`absolute right-3 p-1 rounded-full hover:bg-black/5 transition-colors ${toast.type === "success"
                ? "text-emerald-600"
                : toast.type === "warning"
                  ? "text-amber-600"
                  : toast.type === "error"
                    ? "text-rose-600"
                    : "text-blue-600"
                }`}
            >
              <X size={16} />
            </button>
          </div>
        </div>
      )}
    </>
  );
};
