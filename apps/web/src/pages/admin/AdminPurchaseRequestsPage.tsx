import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { purchaseRequestsApi } from "../../api/purchaseRequests.api";
import type { PurchaseRequest } from "../../types/purchaseRequest.types";
import { formatDate } from "../../utils/formatDate";
import { Badge } from "../../components/common/Badge";
import { Loading } from "../../components/common/Loading";
import { EmptyState } from "../../components/common/EmptyState";
import { DataTable } from "../../components/admin/DataTable";
import { Eye, MailWarning, FileSpreadsheet, Plus, X } from "lucide-react";
import { productsApi } from "../../api/products.api";
import { suppliersApi } from "../../api/suppliers.api";
import { inventoryApi } from "../../api/inventory.api";

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

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isFormLoading, setIsFormLoading] = useState(false);
  const [products, setProducts] = useState<any[]>([]);
  const [suppliers, setSuppliers] = useState<any[]>([]);
  const [inventories, setInventories] = useState<any[]>([]);
  
  const [selectedProductId, setSelectedProductId] = useState("");
  const [selectedSupplierId, setSelectedSupplierId] = useState("");
  const [quantity, setQuantity] = useState("");
  const [note, setNote] = useState("");
  const [toast, setToast] = useState<{ message: string; type: "success" | "error" | "info" } | null>(null);

  const showToast = (message: string, type: "success" | "error" | "info" = "info") => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3000);
  };

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

  useEffect(() => {
    fetchPRs();
  }, []);

  const handleOpenModal = async () => {
    setIsModalOpen(true);
    setIsFormLoading(true);
    try {
      const [prodRes, suppRes, invRes] = await Promise.all([
        productsApi.getProducts(),
        suppliersApi.getSuppliers(),
        inventoryApi.getInventories(),
      ]);
      setProducts(prodRes);
      setSuppliers(suppRes);
      setInventories(invRes);
    } catch {
      showToast("Không thể tải danh sách sản phẩm hoặc nhà cung cấp.", "error");
    } finally {
      setIsFormLoading(false);
    }
  };

  const handleCloseModal = () => {
    setIsModalOpen(false);
    setSelectedProductId("");
    setSelectedSupplierId("");
    setQuantity("");
    setNote("");
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedProductId) return showToast("Vui lòng chọn sản phẩm.", "error");
    if (!selectedSupplierId) return showToast("Vui lòng chọn nhà cung cấp.", "error");
    if (!quantity) return showToast("Vui lòng nhập số lượng đề xuất.", "error");

    const qty = parseInt(quantity, 10);
    if (isNaN(qty) || qty <= 0) return showToast("Số lượng đề xuất phải lớn hơn 0.", "error");

    setIsFormLoading(true);
    showToast("Đang tạo yêu cầu nhập hàng...", "info");

    try {
      const inv = inventories.find((i: any) => i.productId === selectedProductId || i.product_id === selectedProductId);
      const inventoryId = inv?.id || selectedProductId;

      const newPr = await purchaseRequestsApi.createPurchaseRequest({
        supplierId: selectedSupplierId,
        notes: note,
        items: [{ inventoryId, quantity: qty }],
      });

      showToast("Tạo yêu cầu nhập hàng thành công.", "success");
      const newStatus = newPr.status || "PENDING";
      setStatusFilter(newStatus);
      handleCloseModal();
      fetchPRs();
    } catch (err: any) {
      const msg = err.response?.data?.message || err.message || "Không thể tạo yêu cầu nhập hàng, vui lòng thử lại.";
      showToast(msg, "error");
    } finally {
      setIsFormLoading(false);
    }
  };

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
      <div className="flex flex-wrap items-center justify-between gap-4">
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
        
        <button
          onClick={handleOpenModal}
          className="flex items-center gap-2 px-4 py-2 bg-amber-800 text-white text-sm font-semibold rounded-xl hover:bg-amber-900 transition-colors shadow-sm"
        >
          <Plus size={16} />
          Tạo yêu cầu nhập hàng
        </button>
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
              <span
                className={`ml-1.5 px-1.5 py-0.5 rounded-full text-[10px] font-bold ${
                  statusFilter === "PENDING"
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

      {toast && (
        <div className={`fixed bottom-4 right-4 px-4 py-3 rounded-lg shadow-lg text-sm font-medium z-50 flex items-center gap-2 ${
          toast.type === "success" ? "bg-emerald-100 text-emerald-800 border border-emerald-200" :
          toast.type === "error" ? "bg-rose-100 text-rose-800 border border-rose-200" :
          "bg-blue-100 text-blue-800 border border-blue-200"
        }`}>
          {toast.message}
        </div>
      )}

      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-sm p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg overflow-hidden flex flex-col max-h-[90vh]">
            <div className="flex items-center justify-between p-4 border-b border-slate-100">
              <h3 className="font-bold text-slate-800">Tạo yêu cầu nhập hàng</h3>
              <button onClick={handleCloseModal} className="p-1 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg transition-colors">
                <X size={20} />
              </button>
            </div>
            
            <div className="p-4 overflow-y-auto">
              <form id="create-pr-form" onSubmit={handleSubmit} className="flex flex-col gap-4">
                <div className="flex flex-col gap-1.5">
                  <label className="text-sm font-semibold text-slate-700">Sản phẩm <span className="text-rose-500">*</span></label>
                  <select
                    value={selectedProductId}
                    onChange={(e) => setSelectedProductId(e.target.value)}
                    disabled={isFormLoading}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500"
                  >
                    <option value="">-- Chọn sản phẩm --</option>
                    {products.map((p) => (
                      <option key={p.id} value={p.id}>{p.name}</option>
                    ))}
                  </select>
                </div>

                <div className="flex flex-col gap-1.5">
                  <label className="text-sm font-semibold text-slate-700">Nhà cung cấp <span className="text-rose-500">*</span></label>
                  <select
                    value={selectedSupplierId}
                    onChange={(e) => setSelectedSupplierId(e.target.value)}
                    disabled={isFormLoading}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500"
                  >
                    <option value="">-- Chọn nhà cung cấp --</option>
                    {suppliers.map((s) => (
                      <option key={s.id} value={s.id}>{s.name}</option>
                    ))}
                  </select>
                </div>

                <div className="flex flex-col gap-1.5">
                  <label className="text-sm font-semibold text-slate-700">Số lượng đề xuất <span className="text-rose-500">*</span></label>
                  <input
                    type="number"
                    min="1"
                    value={quantity}
                    onChange={(e) => setQuantity(e.target.value)}
                    disabled={isFormLoading}
                    placeholder="Nhập số lượng"
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500"
                  />
                </div>

                <div className="flex flex-col gap-1.5">
                  <label className="text-sm font-semibold text-slate-700">Ghi chú</label>
                  <textarea
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                    disabled={isFormLoading}
                    placeholder="Nhập ghi chú (nếu có)"
                    rows={3}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 resize-none"
                  />
                </div>
              </form>
            </div>

            <div className="flex items-center justify-end gap-3 p-4 border-t border-slate-100 bg-slate-50">
              <button
                type="button"
                onClick={handleCloseModal}
                disabled={isFormLoading}
                className="px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-200 bg-slate-100 rounded-xl transition-colors"
              >
                Hủy
              </button>
              <button
                type="submit"
                form="create-pr-form"
                disabled={isFormLoading}
                className="px-4 py-2 text-sm font-semibold text-white bg-amber-800 hover:bg-amber-900 rounded-xl transition-colors disabled:opacity-50"
              >
                {isFormLoading ? "Đang xử lý..." : "Tạo yêu cầu"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
