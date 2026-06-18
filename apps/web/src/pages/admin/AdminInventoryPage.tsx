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
import { useToast } from "../../contexts/ToastContext";
import { AlertCircle, PlusCircle, Sliders, Settings, Package } from "lucide-react";

export const AdminInventoryPage: React.FC = () => {
  const toast = useToast();
  const [inventories, setInventories] = useState<Inventory[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");

  const [selectedInventory, setSelectedInventory] = useState<Inventory | null>(null);
  const [modalType, setModalType] = useState<"import" | "adjust" | "threshold" | null>(null);
  const [inputValue, setInputValue] = useState<number>(0);
  const [inputNote, setInputNote] = useState("");
  const [modalLoading, setModalLoading] = useState(false);

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

  const handleOpenModal = (inv: Inventory, type: "import" | "adjust" | "threshold") => {
    setSelectedInventory(inv);
    setModalType(type);
    setInputValue(type === "threshold" ? (inv.minThreshold ?? inv.min_threshold ?? 0) : 0);
    setInputNote("");
  };

  const handleCloseModal = () => {
    setSelectedInventory(null);
    setModalType(null);
    setInputValue(0);
    setInputNote("");
  };

  const handleModalSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedInventory) return;
    setModalLoading(true);

    try {
      if (modalType === "import") {
        await inventoryApi.importInventory({
          productId: selectedInventory.productId,
          quantity: inputValue,
          note: inputNote.trim() || undefined,
        });
      } else if (modalType === "adjust") {
        await inventoryApi.adjustInventory({
          productId: selectedInventory.productId,
          quantity: inputValue,
          note: inputNote.trim() || undefined,
        });
      } else if (modalType === "threshold") {
        await inventoryApi.updateInventory(selectedInventory.productId, {
          minThreshold: inputValue,
          min_threshold: inputValue,
        });
      }
      toast.success("Thao tác thành công", "Kho hàng đã được cập nhật.");
      await fetchInventories();
      handleCloseModal();
    } catch {
      toast.error("Thao tác thất bại", "Đã xảy ra lỗi khi thực hiện thao tác kho.");
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
          size="sm"
        >
          <form onSubmit={handleModalSubmit} className="space-y-4">
            <Input
              label={
                modalType === "threshold"
                  ? "Ngưỡng tối thiểu mới"
                  : modalType === "import"
                  ? "Số lượng nhập thêm"
                  : "Số lượng điều chỉnh (dương để tăng, âm để giảm)"
              }
              type="number"
              value={inputValue || ""}
              onChange={(e) => setInputValue(parseInt(e.target.value) || 0)}
              required
            />

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
  );
};
