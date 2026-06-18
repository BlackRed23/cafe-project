import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { ordersApi } from "../../api/orders.api";
import type { Order } from "../../types/order.types";
import { formatCurrency } from "../../utils/formatCurrency";
import { formatDate } from "../../utils/formatDate";
import { Badge } from "../../components/common/Badge";
import { Loading } from "../../components/common/Loading";
import { EmptyState } from "../../components/common/EmptyState";
import { DataTable } from "../../components/admin/DataTable";
import { Eye, Receipt } from "lucide-react";

const FILTER_OPTIONS = [
  { label: "Tất cả", value: "ALL" },
  { label: "Chờ xử lý", value: "PENDING" },
  { label: "Đã xác nhận", value: "CONFIRMED" },
  { label: "Đang xử lý", value: "PROCESSING" },
  { label: "Hoàn thành", value: "COMPLETED" },
  { label: "Đã hủy", value: "CANCELLED" },
];

export const AdminOrdersPage: React.FC = () => {
  const navigate = useNavigate();
  const [orders, setOrders] = useState<Order[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [search, setSearch] = useState("");

  useEffect(() => {
    const fetchOrders = async () => {
      try {
        setIsLoading(true);
        const data = await ordersApi.getOrders();
        const sorted = data.sort(
          (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
        );
        setOrders(sorted);
      } catch {
        setError("Không thể tải danh sách đơn hàng.");
      } finally {
        setIsLoading(false);
      }
    };
    fetchOrders();
  }, []);

  const filteredOrders = orders.filter((order) => {
    const matchesStatus = statusFilter === "ALL" || order.status === statusFilter;
    const customerText = `${order.customer?.name ?? ""} ${order.customer?.email ?? ""}`.toLowerCase();
    const matchesSearch =
      customerText.includes(search.toLowerCase()) ||
      order.id.toLowerCase().includes(search.toLowerCase());
    return matchesStatus && matchesSearch;
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loading message="Đang tải danh sách đơn hàng..." />
      </div>
    );
  }

  const columns = [
    {
      header: "Mã đơn hàng",
      render: (order: Order) => (
        <span className="font-bold text-slate-800 font-mono text-xs">
          #{order.id.slice(-8).toUpperCase()}
        </span>
      ),
    },
    {
      header: "Ngày đặt",
      render: (order: Order) => (
        <span className="text-slate-500 text-xs">{formatDate(order.createdAt)}</span>
      ),
    },
    {
      header: "Tổng tiền",
      render: (order: Order) => (
        <span className="font-bold text-amber-800">{formatCurrency(order.totalAmount)}</span>
      ),
    },
    {
      header: "Phương thức",
      render: (order: Order) => (
        <span className="text-slate-500 text-xs font-medium">{order.paymentMethod}</span>
      ),
    },
    {
      header: "Thanh toán",
      render: (order: Order) => <Badge status={order.paymentStatus} />,
    },
    {
      header: "Trạng thái",
      render: (order: Order) => <Badge status={order.status} />,
    },
    {
      header: "Chi tiết",
      className: "text-right",
      render: (order: Order) => (
        <button
          onClick={() => navigate(`/admin/orders/${order.id}`)}
          className="p-1.5 text-slate-400 hover:text-amber-800 hover:bg-amber-50 rounded-lg transition-all"
          title="Xem chi tiết"
        >
          <Eye size={15} />
        </button>
      ),
    },
  ];

  // Order count by status
  const pendingCount = orders.filter((o) => o.status === "PENDING").length;

  return (
    <div className="flex flex-col gap-6">
      {/* Summary */}
      <div className="flex flex-wrap gap-3">
        <div className="flex items-center gap-2 px-4 py-2 bg-white rounded-xl border border-slate-200 text-sm shadow-sm">
          <Receipt size={14} className="text-amber-700" />
          <span className="font-semibold text-slate-700">{orders.length} tổng đơn hàng</span>
        </div>
        {pendingCount > 0 && (
          <div className="flex items-center gap-2 px-4 py-2 bg-amber-50 rounded-xl border border-amber-200 text-sm shadow-sm">
            <span className="w-2 h-2 rounded-full bg-amber-500 animate-pulse" />
            <span className="font-semibold text-amber-700">{pendingCount} chờ xử lý</span>
          </div>
        )}
      </div>

      {error && (
        <div className="p-4 bg-rose-50 border border-rose-200 text-rose-800 text-sm font-medium rounded-xl">
          {error}
        </div>
      )}

      {/* Filter tab bar */}
      <div className="flex flex-wrap items-center gap-1.5 bg-white rounded-xl border border-slate-200 p-1.5 shadow-sm">
        {FILTER_OPTIONS.map((opt) => (
          <button
            key={opt.value}
            onClick={() => setStatusFilter(opt.value)}
            className={`px-4 py-1.5 text-xs font-semibold rounded-lg transition-all duration-200 ${
              statusFilter === opt.value
                ? "bg-amber-800 text-white shadow-sm"
                : "text-slate-500 hover:bg-slate-100 hover:text-slate-700"
            }`}
          >
            {opt.label}
            {opt.value === "PENDING" && pendingCount > 0 && (
              <span className={`ml-1.5 px-1.5 py-0.5 rounded-full text-[10px] font-bold ${
                statusFilter === "PENDING" ? "bg-white/30 text-white" : "bg-amber-100 text-amber-800"
              }`}>
                {pendingCount}
              </span>
            )}
          </button>
        ))}
      </div>

      {orders.length === 0 ? (
        <EmptyState
          title="Không có đơn hàng"
          description="Hệ thống chưa ghi nhận đơn hàng nào."
        />
      ) : (
        <DataTable
          columns={columns}
          data={filteredOrders}
          searchPlaceholder="Tìm theo mã đơn hoặc khách hàng..."
          searchValue={search}
          onSearchChange={setSearch}
        />
      )}
    </div>
  );
};
