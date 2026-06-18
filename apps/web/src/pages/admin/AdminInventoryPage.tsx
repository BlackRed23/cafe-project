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
  const [thresholdSuggestion, setThresholdSuggestion] = useState<any>(null);
  const [isSuggesting, setIsSuggesting] = useState(false);
  const [toast, setToast] = useState<{ message: string; type: "success" | "error" | "info" | "warning" } | null>(null);

  const showToast = (message: string, type: "success" | "error" | "info" | "warning" = "info") => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3000);
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
      try {
        const suggestion = await inventoryApi.getThresholdSuggestion((inv as any).inventoryId ?? inv.id);
        setThresholdSuggestion(suggestion);
      } catch (err) {
        console.error("Failed to load suggestion");
      } finally {
        setIsSuggesting(false);
      }
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
        const res = await inventoryApi.importInventory({
          productId: selectedInventory.productId,
          quantity: inputValue,
          note: inputNote.trim() || undefined,
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

  const filteredInventories = inventories.filter((inv) =>
    (inv.product?.name || "").toLowerCase().includes(search.toLowerCase())
  );

  // Count stats
  const lowCount = inventories.filter((inv) => {
    const threshold = inv.minThreshold ?? inv.min_threshold ?? 0;
    return inv.quantity < threshold;
  }).length;
  const warnCount = inventories.filter((inv) => {
    const threshold = inv.minThreshold ?? inv.min_threshold ?? 0;
    return inv.quantity === threshold;
  }).length;

  const columns = [
    {
      header: "Sản phẩm",
      render: (inv: Inventory) => {
        const threshold = inv.minThreshold ?? inv.min_threshold ?? 0;
        const status = getInventoryStatus(inv.quantity, threshold);
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
      header: "Số lượng",
      render: (inv: Inventory) => {
        const threshold = inv.minThreshold ?? inv.min_threshold ?? 0;
        const isLow = inv.quantity < threshold;
        return (
          <span className={`font-bold ${isLow ? "text-rose-600" : "text-slate-700"}`}>
            {inv.quantity}{" "}
            <span className="text-xs text-slate-400 font-normal">
              ({inv.product?.unit || "hộp"})
            </span>
          </span>
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
      header: "Trạng thái kho",
      render: (inv: Inventory) => {
        const threshold = inv.minThreshold ?? inv.min_threshold ?? 0;
        return <Badge status={getInventoryStatus(inv.quantity, threshold)} />;
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
      {/* Summary pills */}
      <div className="flex flex-wrap gap-3">
        <div className="flex items-center gap-2 px-4 py-2 bg-white rounded-xl border border-slate-200 text-sm shadow-sm">
          <Package size={14} className="text-amber-700" />
          <span className="font-semibold text-slate-700">{inventories.length} sản phẩm</span>
        </div>
        {lowCount > 0 && (
          <div className="flex items-center gap-2 px-4 py-2 bg-rose-50 rounded-xl border border-rose-200 text-sm shadow-sm">
            <AlertCircle size={14} className="text-rose-600" />
            <span className="font-semibold text-rose-700">{lowCount} cần nhập hàng</span>
          </div>
        )}
        {warnCount > 0 && (
          <div className="flex items-center gap-2 px-4 py-2 bg-orange-50 rounded-xl border border-orange-200 text-sm shadow-sm">
            <AlertCircle size={14} className="text-orange-600" />
            <span className="font-semibold text-orange-700">{warnCount} cảnh báo ngưỡng</span>
          </div>
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
              <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 mb-4 space-y-2 text-sm text-slate-700 relative overflow-hidden">
                {isSuggesting && (
                  <div className="absolute inset-0 bg-white/50 backdrop-blur-sm flex items-center justify-center z-10">
                    <Loading message="Đang tính toán..." />
                  </div>
                )}
                <div className="flex justify-between border-b border-slate-200 pb-2 mb-2">
                  <span className="font-semibold text-slate-900">Thông tin đề xuất</span>
                </div>
                <div className="flex justify-between">
                  <span>Tồn kho hiện tại:</span>
                  <span className="font-medium text-slate-900">{selectedInventory.quantity}</span>
                </div>
                <div className="flex justify-between">
                  <span>Ngưỡng hiện tại:</span>
                  <span className="font-medium text-slate-900">{selectedInventory.minThreshold ?? selectedInventory.min_threshold ?? 0}</span>
                </div>
                <div className="flex flex-col pt-3 mt-3 border-t border-slate-200 gap-2">
                  <div className="flex justify-between items-center">
                    <span className="font-semibold text-emerald-700">Ngưỡng đề xuất:</span>
                    <span className="font-bold text-lg text-emerald-700">{thresholdSuggestion?.recommendedThreshold ?? 0}</span>
                  </div>
                  
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
