import React, { useState, useEffect } from "react";
import { inventoryApi } from "../../api/inventory.api";
import type { InventoryTransaction } from "../../types/inventory.types";
import { formatDate } from "../../utils/formatDate";
import { Loading } from "../../components/common/Loading";
import { EmptyState } from "../../components/common/EmptyState";
import { DataTable } from "../../components/admin/DataTable";

export const AdminInventoryTransactionsPage: React.FC = () => {
  const [transactions, setTransactions] = useState<InventoryTransaction[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");

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
          {tx.type}
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
    </div>
  );
};
