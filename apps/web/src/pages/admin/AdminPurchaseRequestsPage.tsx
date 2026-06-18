import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { purchaseRequestsApi } from "../../api/purchaseRequests.api";
import type { PurchaseRequest } from "../../types/purchaseRequest.types";
import { formatDate } from "../../utils/formatDate";
import { Badge } from "../../components/common/Badge";
import { Loading } from "../../components/common/Loading";
import { EmptyState } from "../../components/common/EmptyState";
import { DataTable } from "../../components/admin/DataTable";
import { Eye, MailWarning, FileSpreadsheet } from "lucide-react";

const FILTER_OPTIONS = [
  { label: "Tất cả", value: "ALL" },
  { label: "Chờ duyệt", value: "PENDING" },
  { label: "Đã duyệt", value: "APPROVED" },
  { label: "Đã gửi mail", value: "SENT" },
  { label: "Đã từ chối", value: "REJECTED" },
];

export const AdminPurchaseRequestsPage: React.FC = () => {
  const navigate = useNavigate();
  const [purchaseRequests, setPurchaseRequests] = useState<PurchaseRequest[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [search, setSearch] = useState("");

  useEffect(() => {
    const fetchPRs = async () => {
      try {
        setIsLoading(true);
        const data = await purchaseRequestsApi.getPurchaseRequests();
        const sorted = data.sort((a, b) => {
          const t1 = a.createdAt || (a as any).created_at || "";
          const t2 = b.createdAt || (b as any).created_at || "";
          return new Date(t2).getTime() - new Date(t1).getTime();
        });
        setPurchaseRequests(sorted);
      } catch {
        setError("Không thể tải danh sách yêu cầu mua hàng.");
      } finally {
        setIsLoading(false);
      }
    };
    fetchPRs();
  }, []);

  const filteredPRs = purchaseRequests.filter((pr) => {
    const matchesStatus = statusFilter === "ALL" || pr.status === statusFilter;
    const matchesSearch =
      (pr.product?.name || "").toLowerCase().includes(search.toLowerCase()) ||
      pr.id.toLowerCase().includes(search.toLowerCase());
    return matchesStatus && matchesSearch;
  });

  const pendingCount = purchaseRequests.filter((pr) => pr.status === "PENDING").length;

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loading message="Đang tải danh sách Purchase Request..." />
      </div>
    );
  }

  const columns = [
    {
      header: "Mã yêu cầu",
      render: (pr: PurchaseRequest) => (
        <span className="font-bold text-slate-800 font-mono text-xs">
          #{pr.id.slice(-8).toUpperCase()}
        </span>
      ),
    },
    {
      header: "Sản phẩm đề xuất",
      render: (pr: PurchaseRequest) => {
        const isPending = pr.status === "PENDING";
        return (
          <div className="flex items-center gap-2">
            {isPending && (
              <MailWarning className="text-amber-700 flex-shrink-0 animate-bounce" size={13} />
            )}
            <span className={`font-semibold ${isPending ? "text-amber-900" : "text-slate-800"}`}>
              {pr.product?.name || "Sản phẩm"}
            </span>
          </div>
        );
      },
    },
    {
      header: "Nhà cung cấp",
      render: (pr: PurchaseRequest) => (
        <span className="text-slate-600 font-medium text-sm">
          {pr.supplier?.name || "Chưa gán"}
        </span>
      ),
    },
    {
      header: "SL đề xuất",
      render: (pr: PurchaseRequest) => {
        const qty = pr.suggestedQuantity ?? (pr as any).suggested_quantity ?? 0;
        return <span className="font-bold text-amber-800">{qty}</span>;
      },
    },
    {
      header: "Trạng thái",
      render: (pr: PurchaseRequest) => <Badge status={pr.status} />,
    },
    {
      header: "Ngày tạo",
      render: (pr: PurchaseRequest) => {
        const dateStr = pr.createdAt || (pr as any).created_at || "";
        return (
          <span className="text-slate-500 text-xs">{dateStr ? formatDate(dateStr) : ""}</span>
        );
      },
    },
    {
      header: "Chi tiết",
      className: "text-right",
      render: (pr: PurchaseRequest) => (
        <button
          onClick={() => navigate(`/admin/purchase-requests/${pr.id}`)}
          className="p-1.5 text-slate-400 hover:text-amber-800 hover:bg-amber-50 rounded-lg transition-all"
          title="Xem chi tiết"
        >
          <Eye size={15} />
        </button>
      ),
    },
  ];

  return (
    <div className="flex flex-col gap-6">
      {/* Summary */}
      <div className="flex flex-wrap gap-3">
        <div className="flex items-center gap-2 px-4 py-2 bg-white rounded-xl border border-slate-200 text-sm shadow-sm">
          <FileSpreadsheet size={14} className="text-amber-700" />
          <span className="font-semibold text-slate-700">
            {purchaseRequests.length} yêu cầu tổng
          </span>
        </div>
        {pendingCount > 0 && (
          <div className="flex items-center gap-2 px-4 py-2 bg-amber-50 rounded-xl border border-amber-200 text-sm shadow-sm animate-pulse">
            <MailWarning size={14} className="text-amber-700" />
            <span className="font-semibold text-amber-800">
              {pendingCount} chờ phê duyệt
            </span>
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
            className={`px-4 py-1.5 text-xs font-semibold rounded-lg transition-all duration-200 ${statusFilter === opt.value
                ? "bg-amber-800 text-white shadow-sm"
                : "text-slate-500 hover:bg-slate-100 hover:text-slate-700"
              }`}
          >
            {opt.label}
            {opt.value === "PENDING" && pendingCount > 0 && (
              <span
                className={`ml-1.5 px-1.5 py-0.5 rounded-full text-[10px] font-bold ${statusFilter === "PENDING"
                    ? "bg-white/30 text-white"
                    : "bg-amber-100 text-amber-800"
                  }`}
              >
                {pendingCount}
              </span>
            )}
          </button>
        ))}
      </div>

      {purchaseRequests.length === 0 ? (
        <EmptyState
          title="Không có yêu cầu nhập hàng"
          description="Hệ thống chưa ghi nhận yêu cầu nhập hàng nào từ AI Agent."
        />
      ) : (
        <DataTable
          columns={columns}
          data={filteredPRs}
          searchPlaceholder="Tìm theo tên sản phẩm..."
          searchValue={search}
          onSearchChange={setSearch}
        />
      )}
    </div>
  );
};
