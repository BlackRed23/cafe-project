import React, { useState, useEffect } from "react";
import { inventoryApi } from "../../api/inventory.api";
import type { InventoryTransaction } from "../../types/inventory.types";
import { formatDate } from "../../utils/formatDate";
import { Loading } from "../../components/common/Loading";
import { EmptyState } from "../../components/common/EmptyState";
import { DataTable } from "../../components/admin/DataTable";
import { Modal } from "../../components/common/Modal";
import { Button } from "../../components/common/Button";
import { Eye, User as UserIcon } from "lucide-react";

export const AdminInventoryTransactionsPage: React.FC = () => {
  const [transactions, setTransactions] = useState<InventoryTransaction[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [selectedTx, setSelectedTx] = useState<InventoryTransaction | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);

  useEffect(() => {
    const fetchTransactions = async () => {
      try {
        setIsLoading(true);
        const data = await inventoryApi.getInventoryTransactions();
        // Sort transactions by newest first
        const sorted = data.sort((a, b) => {
          const t1 = a.createdAt || a.created_at || "";
          const t2 = b.createdAt || b.created_at || "";
          return new Date(t2).getTime() - new Date(t1).getTime();
        });
        setTransactions(sorted);
      } catch (err: any) {
        setError("Không thể tải lịch sử giao dịch kho.");
      } finally {
        setIsLoading(false);
      }
    };
    fetchTransactions();
  }, []);

  const getTypeBadgeColor = (type: string) => {
    const map: Record<string, string> = {
      IMPORT: "bg-emerald-50 text-emerald-800 border-emerald-200 dark:bg-emerald-950/20 dark:text-emerald-450",
      ORDER: "bg-blue-50 text-blue-800 border-blue-200 dark:bg-blue-950/20 dark:text-blue-450",
      SIMULATE_SALE: "bg-amber-50 text-amber-800 border-amber-200 dark:bg-amber-950/20 dark:text-amber-450",
      ADJUST: "bg-amber-50 text-amber-900 border-amber-200 dark:bg-amber-950/20 dark:text-amber-450",
      CANCEL: "bg-rose-50 text-rose-800 border-rose-200 dark:bg-rose-950/20 dark:text-rose-450",
      RETURN: "bg-slate-50 text-slate-800 border-slate-200 dark:bg-slate-900/20 dark:text-slate-450",
    };
    return map[type] || "bg-slate-50 text-slate-800 border-slate-200";
  };

  const getTransactionTypeLabel = (type: string) => {
    switch (type) {
      case "IMPORT":
        return "Nhập kho";
      case "ADJUST":
        return "Điều chỉnh kho";
      case "ORDER":
        return "Bán hàng";
      case "SIMULATE_SALE":
        return "Mô phỏng bán";
      case "RESTORE_SIMULATION":
        return "Khôi phục mô phỏng";
      case "THRESHOLD_UPDATE":
        return "Cập nhật ngưỡng";
      case "PURCHASE_RECEIVE":
        return "Nhận hàng nhập";
      case "RETURN":
        return "Hoàn hàng";
      case "CANCEL_ORDER":
      case "CANCEL":
        return "Huỷ đơn";
      default:
        return "Hoạt động kho";
    }
  };

  if (isLoading) {
    return <Loading message="Đang tải lịch sử giao dịch..." />;
  }

  const filteredTransactions = transactions.filter((tx) =>
    (tx.product?.name || "").toLowerCase().includes(search.toLowerCase())
  );

  const columns = [
    {
      header: "Ngày giao dịch",
      render: (tx: InventoryTransaction) => {
        const dateStr = tx.createdAt || tx.created_at || "";
        return <span className="text-slate-500 font-light">{dateStr ? formatDate(dateStr) : "N/A"}</span>;
      },
    },
    {
      header: "Sản phẩm",
      render: (tx: InventoryTransaction) => <span className="font-semibold text-slate-800">{tx.product?.name || "Sản phẩm không tên"}</span>,
    },
    {
      header: "Loại hoạt động",
      render: (tx: InventoryTransaction) => (
        <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold border ${getTypeBadgeColor(tx.type)}`}>
          {getTransactionTypeLabel(tx.type)}
        </span>
      ),
    },
    {
      header: "Số lượng biến động",
      render: (tx: InventoryTransaction) => {
        const qtyChange = tx.quantityChange ?? tx.quantity_change ?? 0;
        const isPositive = qtyChange > 0;
        const formattedQty = isPositive ? `+${qtyChange}` : `${qtyChange}`;
        return (
          <span className={`font-bold ${isPositive ? "text-emerald-600" : "text-rose-600"}`}>
            {formattedQty}
          </span>
        );
      },
    },
    {
      header: "Ghi chú",
      render: (tx: InventoryTransaction) => <span className="text-slate-500 font-light truncate block max-w-xs">{tx.note || "—"}</span>,
    },
    {
      header: "Người thực hiện",
      render: (tx: InventoryTransaction) => (
        <span className="text-slate-600 font-medium flex items-center gap-1.5">
          <UserIcon size={14} className="text-slate-400" />
          {tx.user?.name || "Hệ thống"}
        </span>
      ),
    },
    {
      header: "",
      render: (tx: InventoryTransaction) => (
        <div className="flex justify-end">
          <button
            onClick={() => {
              setSelectedTx(tx);
              setIsModalOpen(true);
            }}
            className="p-1.5 text-slate-400 hover:text-amber-800 hover:bg-amber-50 rounded-lg transition-colors"
            title="Xem chi tiết"
          >
            <Eye size={18} />
          </button>
        </div>
      ),
    },
  ];

  return (
    <div className="flex flex-col gap-6">
      {error && (
        <div className="p-4 bg-rose-50 border border-rose-200 text-rose-800 text-sm font-medium rounded-xl">
          {error}
        </div>
      )}

      {transactions.length === 0 ? (
        <EmptyState title="Lịch sử trống" description="Chưa ghi nhận giao dịch nhập xuất kho nào." />
      ) : (
        <DataTable
          columns={columns}
          data={filteredTransactions}
          searchPlaceholder="Tìm theo tên sản phẩm..."
          searchValue={search}
          onSearchChange={setSearch}
        />
      )}

      {isModalOpen && selectedTx && (
        <Modal
          isOpen={isModalOpen}
          onClose={() => setIsModalOpen(false)}
          title="Chi tiết giao dịch tồn kho"
        >
          <div className="space-y-4 text-sm">
            <div className="grid grid-cols-3 gap-4 border-b border-slate-100 pb-4">
              <div className="col-span-1 text-slate-500">Sản phẩm</div>
              <div className="col-span-2 font-semibold text-slate-800">{selectedTx.product?.name || "Sản phẩm không tên"}</div>
            </div>
            <div className="grid grid-cols-3 gap-4 border-b border-slate-100 pb-4">
              <div className="col-span-1 text-slate-500">Loại hoạt động</div>
              <div className="col-span-2">
                <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold border ${getTypeBadgeColor(selectedTx.type)}`}>
                  {getTransactionTypeLabel(selectedTx.type)}
                </span>
              </div>
            </div>
            <div className="grid grid-cols-3 gap-4 border-b border-slate-100 pb-4">
              <div className="col-span-1 text-slate-500">Số lượng biến động</div>
              <div className="col-span-2 font-bold">
                {(() => {
                  const qtyChange = selectedTx.quantityChange ?? selectedTx.quantity_change ?? 0;
                  const isPositive = qtyChange > 0;
                  return (
                    <span className={isPositive ? "text-emerald-600" : "text-rose-600"}>
                      {isPositive ? `+${qtyChange}` : `${qtyChange}`}
                    </span>
                  );
                })()}
              </div>
            </div>
            <div className="grid grid-cols-3 gap-4 border-b border-slate-100 pb-4">
              <div className="col-span-1 text-slate-500">Ngày giao dịch</div>
              <div className="col-span-2 font-medium text-slate-700">
                {(selectedTx.createdAt || selectedTx.created_at) ? formatDate(selectedTx.createdAt || selectedTx.created_at || "") : "N/A"}
              </div>
            </div>
            <div className="grid grid-cols-3 gap-4 border-b border-slate-100 pb-4">
              <div className="col-span-1 text-slate-500">Người thực hiện</div>
              <div className="col-span-2">
                {selectedTx.user ? (
                  <div className="flex flex-col">
                    <span className="font-semibold text-slate-800">{selectedTx.user.name}</span>
                    <span className="text-xs text-slate-500">{selectedTx.user.email}</span>
                  </div>
                ) : (
                  <span className="font-medium text-slate-500 italic">Hệ thống / Không xác định</span>
                )}
              </div>
            </div>
            <div className="grid grid-cols-3 gap-4">
              <div className="col-span-1 text-slate-500">Ghi chú</div>
              <div className="col-span-2 text-slate-700 whitespace-pre-wrap">
                {selectedTx.note || "—"}
              </div>
            </div>
          </div>
          <div className="mt-6 flex justify-end">
            <Button onClick={() => setIsModalOpen(false)}>Đóng</Button>
          </div>
        </Modal>
      )}
    </div>
  );
};
