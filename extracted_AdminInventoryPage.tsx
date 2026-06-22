import React, { useState, useEffect } from "react";
import { inventoryApi } from "../../api/inventory.api";
import type { Inventory } from "../../types/inventory.types";
import { Badge } from "../../components/common/Badge";
import { Button } from "../../components/common/Button";
import { Loading } from "../../components/common/Loading";
import { EmptyState } from "../../components/common/EmptyState";
import { Modal } from "../../components/common/Modal";
import { Input } from "../../components/common/Input";
import { DataTable } from "../../components/admin/DataTable";
import { AlertCircle, PlusCircle, Sliders, Settings, Package, CheckCircle, Info, X } from "lucide-react";
import { getErrorMessage } from "../../api/client";

export const AdminInventoryPage: React.FC = () => {
  const [inventories, setInventories] = useState<Inventory[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");

  const [selectedInventory, setSelectedInventory] = useState<Inventory | null>(null);
  const [modalType, setModalType] = useState<"import" | "adjust" | "threshold" | null>(null);
  const [inputValue, setInputValue] = useState<number>(0);
  const [inputNote, setInputNote] = useState("");
  const [modalLoading, setModalLoading] = useState(false);
  const [thresholdSuggestion, setThresholdSuggestion] = useState<any
  message: string;
  action: string;
  purchaseRequestId?: string;
  hasDuplicateRequest?: boolean;
};

const SCAN_SEVERITY_LABELS: Record<InventoryScanSeverity, string> = {
  STABLE: "Tồn kho ổn định",
  WATCH: "Sắp cần nhập hàng",
  LOW: "Cần nhập hàng",
  URGENT: "Cần nhập gấp",
  FAST_CONSUMPTION: "Tốc độ tiêu thụ cao",
  DATA_ISSUE: "Dữ liệu cần kiểm tra",
  ERROR: "Lỗi quét tồn kho",
};

const SCAN_PRIORITY: Record<InventoryScanSeverity, number> = {
  DATA_ISSUE: 1,
  URGENT: 2,
  LOW: 3,
  FAST_CONSUMPTION: 4,
  WATCH: 5,
  ERROR: 6,
  STABLE: 7,
};

const severityClassName: Record<InventoryScanSeverity, string> = {
  DATA_ISSUE: "bg-violet-50 text-violet-700 border-violet-200",
  URGENT: "bg-rose-50 text-rose-700 border-rose-200",
    if (qty === min) return "WARNING";
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
    });

    const items = inventoryList.map((inv) => {
      const productId = inv.productId ?? inv.product_id ?? inv.product?.id;
      const log = productId ? logsByProductId.get(productId) : undefined;
      const output = asRecord(log?.output);
      const input = asRecord(log?.input);
      const quantity = toNumber(inv.quantity ?? inv.stock);
      const reservedStock = toNumber(inv.reservedStock ?? inv.reserved_stock);
      const availableStock = toNumber(inv.availableStock ?? inv.available_stock, quantity - reservedStock);
      const threshold = toNumber(inv.minThreshold ?? inv.min_threshold ?? inv.minStock ?? inv.min_stock);
      const unit = inv.unit || inv.product?.unit || "";
      const productName = inv.product?.name || inv.productName || inv.product_name || output.productName || "Sản phẩm không tên";
      const salesHistoryCount = toNumber(output.salesHistoryCount ?? input.salesHistoryCount);
      const avgDailySales = toNumber(output.avgDailySales ?? input.avgDailySales);
      const fastConsumption = Boolean(output.fastConsumption ?? input.fastConsumption);
      const purchaseRequestId = String(log?.purchaseRequestId || output.purchaseRequestId || "");
      const hasDuplicateRequest = output.reason === "ACTIVE_PR_EXISTS" || log?.result === "SKIPPED_DUPLICATE";
      const dataIssues: string[] = [];

      if (quantity < 0) dataIssues.push("Tồn kho thực tế âm");
      if
      if (threshold <= 0) dataIssues.push("Thiếu ngưỡng tồn kho");
      if (!productName.trim() || productName === "Sản phẩm không tên") dataIssues.push("Thiếu tên sản phẩm");
      if (!unit.trim()) dataIssues.push("Thiếu đơn vị tính");
      if (!(inv.categoryName || inv.category_name)) dataIssues.push("Thiếu danh mục sản phẩm");
      if (output.reason === "DATA_ISSUE") dataIssues.push("Agent báo dữ liệu cần kiểm tra");

      let severity: InventoryScanSeverity = "STABLE";
      let message = "Tồn kho đang ổn định.";
      let action = "Chưa cần nhập thêm.";

      if (dataIssues.length > 0) {
        severity = "DATA_ISSUE";
        message = "Dữ liệu tồn kho bất thường, admin cần kiểm tra trước khi Agent đề xuất nhập hàng.";
        action = dataIssues.join("; ");
      } else if (log?.status === "FAILED" || log?.result === "FAILED") {
        severity = "ERROR";
        message = "Một số sản phẩm chưa quét được do lỗi hệ thống.";
        action = "Kiểm tra Nhật ký Agent.";
      } else if (availableStock <= 0) {
        severity = "URGENT";
        message = "Sản phẩm đã hết hàng, cần nhập gấp.";
        action = "Tạo hoặc kiểm tra yêu cầu nhập hàng.";
      } else if (availableStock <= threshold) {
        severity = "LOW";
        message = reservedStock > 0
          ? "Sản phẩm còn hàng trong kho nhưng phần có thể bán đang thấp do có hàng đang giữ cho đơn hàng."
          : "Sản phẩm đang dưới ngưỡng cảnh báo.";
        action = "Tạo hoặc kiểm tra yêu cầu nhập hàng.";
    });

    errorLogs.forEach((log) => {
      const productId = String(log?.productId || asRecord(log?.output).productId || "");
      const exists = items.some((item) => item.productId === productId);
      if (!exists) {
        items.push({
          id: String(log?.id || productId || Math.random()),
          productId,
          productName: log?.productName || asRecord(log?.output).productName || "Sản phẩm chưa xác định",
          unit: "đơn vị",
          quantity: 0,
          reservedStock: 0,
          availableStock: 0,
          threshold: 0,
          severity: "ERROR",
          message: "Một số sản phẩm chưa quét được do lỗi hệ thống.",
          action: "Kiểm tra Nhật ký Agent.",
          purchaseRequestId: undefined,
          hasDuplicateRequest: false,
        });
      }
    });

    return items
      .filter((item) => item.severity !== "STABLE")
      .sort((a, b) => SCAN_PRIORITY[a.severity] - SCAN_PRIORITY[b.severity] || a.productName.localeCompare(b.productName));
  };

  const showScanToast = (items: ScanModalItem[]) => {
    const dataIssueCount = items.filter((item) => item.severity === "DATA_ISSUE").length;
    const urgentCount = items.filter((item) => item.severity === "URGENT").length;
    const lowCount = items.filter((item) => item.severity === "LOW").length;
    const watchCount = items.filter((item) => item.severity === "WATCH").length;
    const fastCount = items.filter((item) => item.severity === "FAST_CONSUMPTION").length;

    if (dataIssueCount > 0) {
      showToast(`Có ${dataIssueCount} sản phẩm có dữ liệu tồn kho bất thường, cần kiểm tra.`, "warning");
    } else if (urgentCount > 0) {
      showToast(`Có ${urgentCount} sản phẩm đã hết hàng, cần nhập gấp.`, "error");
    } else if (lowCount > 0) {
      showToast(`AI Agent phát hiện ${lowCount} sản phẩm cần nhập hàng.`, "warning");
    } else if (fastCount > 0) {
      showToast(`AI Agent phát hiện ${fastCount} sản phẩm có tốc độ tiêu thụ cao.`, "warning");
    } else if (watchCount > 0) {
      showToast(`AI Agent phát hiện ${watchCount} sản phẩm sắp cần nhập hàng.`, "info");
    } else {
      showToast("Tồn kho đang ổn định, chưa cần nhập thêm.", "success");
    }
  };

  const handleScanInventory = async () => {
    setIsScanningInventory(true);
    setShowAgentLogsLink(false);
    setScanModalOpen(false);
    setScanPartialError(false);

    try {
      const result = await agentLogsApi.scanInventory({
        triggerType: "MANUAL_ADMIN_SCAN",
      });
      setShowAgentLogsLink(true);

      if (result.agentWarning) {
        showToast("Không quét được tồn kho bằng AI Agent. Vui lòng kiểm tra Nhật ký Agent.", "error");
        return;
      }

      const refreshedInventories = await inventoryApi.getInventories();
      setInventories(refreshedInventories);

      const scanResults = result.results ?? [];
      const allFailed = scanResults.length > 0 && scanResults.every((log) => log.status === "FAILED" || log.result === "FAILED");
      if (allFailed) {
        showToast("Không quét được tồn kho bằng AI Agent. Vui lòng kiểm tra Nhật ký Agent.", "error");
        return;
      }

      const partialError = scanResults.some((log) => log.status === "FAILED" || log.result === "FAILED");
      const items = buildScanItems(refreshedInventories, scanResults);
      setScanItems(items);
      setScanPartialError(partialError);
      showScanToast(items);
      if (items.length > 0) setScanModalOpen(true);
    } catch {
      setShowAgentLogsLink(true);
      showToast("Không quét được tồn kho bằng AI Agent. Vui lòng kiểm tra Nhật ký Agent.", "error");
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

  useEffect(() => {
    fetchInventories();
  }, []);

  const getInventoryStatus = (qty: number, threshold?: number): "OK" | "WARNING" | "NEED_RESTOCK" => {
    const min = threshold || 0;
    if (qty < min) return "NEED_RESTOCK";
    }
  };

  const handleCloseModal = () => {
    setSelectedInventory(null);
    setModalType(null);
    setInputValue(0);
    setInputNote("");
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

    if (modalType === "import") {
      const supplierProduct = supplierProducts.find(sp => sp.productId === selectedInventory.productId);
      const hasSupplierConversion = Boolean(
        supplierProduct?.purchaseUnit &&
        supplierProduct?.conversionQuantity &&
        supplierProduct?.conversionTargetUnit
      );
      const conversionWarning = hasSupplierConversion && supplierProduct?.conversionTargetUnit !== selectedInventory.unit;
      const isSupplierMode = importMode === "supplier" && hasSupplierConversion && !conversionWarning;
      const finalQuantity = isSupplierMode ? inputValue * (supplierProduct!.conversionQuantity || 1) : inputValue;

      if (inputValue <= 0) {
        showToast(isSupplierMode ? "Số lượng nhập theo NCC phải lớn hơn 0" : "Số lượng nhập thêm phải lớn hơn 0", "error");
        return;
      }
      
      setModalLoading(true);

      try {
        const res = await inventoryApi.importInventory({
          productId: selectedInvento
        });
        const minThreshold = res.minThreshold ?? res.min_threshold ?? 0;
        const warning = res.warnings?.[0]?.message;
        if (res.quantity <= minThreshold) {
          showToast(warning || "Nhập kho thành công nhưng số lượng sau nhập vẫn thấp hơn ngưỡng tối thiểu.", "warning");
        } else {
          showToast(res.message || "Nhập kho thành công. Đủ hàng.", "success");
        }
      } else if (modalType === "adjust") {
        const diff = inputValue - selectedInventory.quantity;
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
                Xác nhận
              </Button>
            </div>
          </form>
        </Modal>
      )}
      </div>
      {/* Toast Notification Container */}
      {toast && (
        <div className="fixed bottom-6 right-6 z-50 animate-fade-in-up">
          <div
            className={`flex items-center gap-3 px-4 py-3 rounded-xl shadow-lg border ${
              toast.type === "success"
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
              className={`absolute right-3 p-1 rounded-full hover:bg-black/5 transition-colors ${
                toast.type === "success"
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

          size="sm"
          className="gap-2 bg-slate-900 hover:bg-slate-800 text-white focus:ring-slate-500"
        >
          {isScanningInventory ? (
            "Đang quét..."
          ) : (
            <>
              <Bot size={15} />
              Quét tồn kho bằng AI Agent
            </>
          )}
        </Button>
        {showAgentLogsLink && (
          <Link
            to="/admin/agent-logs"
            className="text-sm font-semibold text-amber-800 hover:text-amber-950 hover:underline"
          >
            Xem Nhật ký Agent
          </Link>
        )}
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
                          className={`h-8 text-xs ${thresholdSuggestion.recommendedThreshold === (selectedInventory.minThreshold ?? selectedInventory.min_threshold ?? 0) ? "border-slate-300 text-
                        >
                          Lưu ngưỡng đề xuất
                        </Button>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}
            


            <div>
              <Input
                label={
                  modalType === "threshold"
                    ? "Ngưỡng tối thiểu mới"
                    : modalType === "import"
                    ? "Số lượng nhập thêm"
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
                  {false && (
                    <p className="text-xs text-amber-600 flex items-center gap-1 mt-1">
                      <AlertCircle size={12} /> Cảnh báo: Ngưỡng này quá thấp (nhỏ hơn lượng dự phòng {thresholdSuggestion.safetyStock}).
                    </p>
                  )}
                  {false && (
                    <p className="text-xs text-amber-600 flex items-center gap-1 mt-1">
                      <AlertCircle size={12} /> Cảnh báo: Ngưỡng này khá cao so với mức đề xuất.
                    </p>
                  )}
                </div>
              )}
            </div>

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
