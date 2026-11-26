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

export const AdminInventoryTransactionsPage: React.FC = () => <LegacyAdminInventoryTransactionsPage />;

const LegacyAdminInventoryTransactionsPage: React.FC = () => {
  const [transactions, setTransactions] = useState<InventoryTransaction[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [txTypeFilter, setTxTypeFilter] = useState<string>("ALL");
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
      } catch {
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
      DEDUCT: "bg-indigo-50 text-indigo-800 border-indigo-200 dark:bg-indigo-950/20 dark:text-indigo-400",
      CONSUME: "bg-indigo-50 text-indigo-800 border-indigo-200 dark:bg-indigo-950/20 dark:text-indigo-400",
      ORDER: "bg-blue-50 text-blue-800 border-blue-200 dark:bg-blue-950/20 dark:text-blue-450",
      RESERVE: "bg-amber-50 text-amber-800 border-amber-200 dark:bg-amber-950/20 dark:text-amber-450",
      RELEASE: "bg-teal-50 text-teal-800 border-teal-200 dark:bg-teal-950/20 dark:text-teal-450",
      WASTE: "bg-rose-50 text-rose-800 border-rose-200 dark:bg-rose-950/20 dark:text-rose-450",
      EXPIRE: "bg-rose-50 text-rose-800 border-rose-200 dark:bg-rose-950/20 dark:text-rose-450",
      VOID: "bg-rose-50 text-rose-800 border-rose-200 dark:bg-rose-950/20 dark:text-rose-450",
      SIMULATE_SALE: "bg-amber-50 text-amber-800 border-amber-200 dark:bg-amber-950/20 dark:text-amber-450",
      RESTORE_SIMULATION: "bg-teal-50 text-teal-800 border-teal-200 dark:bg-teal-950/20 dark:text-teal-450",
      ADJUST: "bg-purple-50 text-purple-900 border-purple-200 dark:bg-purple-950/20 dark:text-purple-400",
      CANCEL: "bg-teal-50 text-teal-800 border-teal-200 dark:bg-teal-950/20 dark:text-teal-450",
      RETURN: "bg-slate-50 text-slate-800 border-slate-200 dark:bg-slate-900/20 dark:text-slate-450",
    };
    return map[type] || "bg-slate-50 text-slate-800 border-slate-200";
  };

  const getTransactionTypeLabel = (type: string) => {
    switch (type) {
      case "IMPORT":
        return "Nhập kho";
      case "DEDUCT":
      case "CONSUME":
        return "Xuất kho pha chế";
      case "RESERVE":
        return "Giữ chỗ đơn hàng";
      case "RELEASE":
      case "CANCEL_ORDER":
      case "CANCEL":
        return "Hoàn trả giữ chỗ";
      case "WASTE":
        return "Hủy / Hao hụt";
      case "EXPIRE":
        return "Hủy hàng hết hạn";
      case "VOID":
        return "Hủy giao dịch";
      case "ADJUST":
        return "Điều chỉnh kiểm kê";
      case "ORDER":
        return "Xuất bán hàng";
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
      default:
        return "Hoạt động kho";
    }
  };

  if (isLoading) {
    return <Loading message="Đang tải lịch sử giao dịch..." />;
  }

  const filteredTransactions = transactions.filter((tx) => {
    const q = search.trim().toLowerCase();
    const matchesSearch =
      !q ||
      (tx.product?.name || tx.productName || "").toLowerCase().includes(q) ||
      (tx.productSku || "").toLowerCase().includes(q) ||
      (tx.batchCode || "").toLowerCase().includes(q) ||
      (tx.note || "").toLowerCase().includes(q);
    const matchesTxType =
      txTypeFilter === "ALL" || tx.type === txTypeFilter;
    return matchesSearch && matchesTxType;
  });

  const columns = [
    {
      header: "Ngày giao dịch",
      render: (tx: InventoryTransaction) => {
        const dateStr = tx.createdAt || tx.created_at || "";
        return <span className="text-slate-500 font-light">{dateStr ? formatDate(dateStr) : "N/A"}</span>;
      },
    },
    {
      header: "Nguyên liệu pha chế",
      render: (tx: InventoryTransaction) => {
        return (
          <div className="flex flex-col gap-0.5">
            <span className="font-semibold text-slate-800">
              {tx.product?.name || tx.productName || "Không xác định"}
            </span>
            <div className="flex items-center gap-1.5 text-xs">
              <span className="px-1.5 py-0.5 rounded font-medium bg-amber-50 text-amber-800 border border-amber-200">
                Nguyên liệu pha chế
              </span>
              {tx.productSku && (
                <span className="text-slate-400 font-mono">{tx.productSku}</span>
              )}
              {tx.batchCode && (
                <span className="text-slate-500 font-mono bg-slate-50 px-1.5 py-0.5 rounded border border-slate-200">
                  Lô: {tx.batchCode}
                </span>
              )}
            </div>
          </div>
        );
      },
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
        const unitLabel = tx.unit ? ` ${tx.unit}` : "";
        return (
          <span className={`font-bold ${isPositive ? "text-emerald-600" : "text-rose-600"}`}>
            {formattedQty}
            {unitLabel && <span className="text-xs font-medium text-slate-500 ml-0.5">{unitLabel}</span>}
          </span>
        );
      },
    },
    {
      header: "Ghi chú / Tham chiếu",
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

      <div className="flex flex-wrap items-center justify-between gap-3 bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
        <div className="flex items-center gap-2">
          <span className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-amber-800 text-white">
            Nguyên liệu pha chế ({transactions.length})
          </span>
        </div>

        <div className="flex items-center gap-2">
          <span className="text-xs font-medium text-slate-500">Loại giao dịch:</span>
          <select
            value={txTypeFilter}
            onChange={(e) => setTxTypeFilter(e.target.value)}
            className="px-3 py-1.5 rounded-lg border border-slate-200 text-xs font-medium text-slate-700 bg-white focus:outline-none focus:ring-2 focus:ring-amber-500/20"
          >
            <option value="ALL">Tất cả hoạt động</option>
            <option value="IMPORT">Nhập kho nguyên liệu</option>
            <option value="DEDUCT">Xuất kho pha chế (FEFO)</option>
            <option value="RESERVE">Giữ chỗ đơn hàng</option>
            <option value="RELEASE">Hoàn trả giữ chỗ</option>
            <option value="ADJUST">Điều chỉnh kiểm kê</option>
            <option value="WASTE">Hủy / Hao hụt</option>
          </select>
        </div>
      </div>

      {transactions.length === 0 ? (
        <EmptyState title="Lịch sử trống" description="Chưa ghi nhận giao dịch nhập xuất kho nguyên liệu nào." />
      ) : (
        <DataTable
          columns={columns}
          data={filteredTransactions}
          searchPlaceholder="Tìm theo tên nguyên liệu, mã SKU, mã lô, ghi chú..."
          searchValue={search}
          onSearchChange={setSearch}
        />
      )}

      {isModalOpen && selectedTx && (
        <Modal
          isOpen={isModalOpen}
          onClose={() => setIsModalOpen(false)}
          title="Chi tiết giao dịch kho nguyên liệu"
        >
          <div className="space-y-4 text-sm min-w-0 [overflow-wrap:anywhere]">
            <div className="grid grid-cols-3 gap-4 border-b border-slate-100 pb-4">
              <div className="col-span-1 text-slate-500">Nguyên liệu</div>
              <div className="col-span-2 font-semibold text-slate-800">
                {selectedTx.product?.name || selectedTx.productName || "Không xác định"}
              </div>
            </div>
            <div className="grid grid-cols-3 gap-4 border-b border-slate-100 pb-4">
              <div className="col-span-1 text-slate-500">Phân loại & SKU</div>
              <div className="col-span-2 min-w-0 flex flex-wrap items-center gap-2">
                <span className="px-2 py-0.5 rounded text-xs font-medium bg-amber-50 text-amber-800 border border-amber-200">
                  Nguyên liệu pha chế
                </span>
                {selectedTx.productSku && (
                  <span className="font-mono text-xs text-slate-500">{selectedTx.productSku}</span>
                )}
              </div>
            </div>
            {selectedTx.batchCode && (
              <div className="grid grid-cols-3 gap-4 border-b border-slate-100 pb-4">
                <div className="col-span-1 text-slate-500">Mã lô (FEFO)</div>
                <div className="col-span-2 min-w-0 font-mono text-xs font-semibold text-slate-700">
                  {selectedTx.batchCode}
                </div>
              </div>
            )}
            <div className="grid grid-cols-3 gap-4 border-b border-slate-100 pb-4">
              <div className="col-span-1 text-slate-500">Loại hoạt động</div>
              <div className="col-span-2 min-w-0">
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
                      {selectedTx.unit ? ` ${selectedTx.unit}` : ""}
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
                  <span className="font-medium text-slate-500 italic">Hệ thống / Tự động theo đơn</span>
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
