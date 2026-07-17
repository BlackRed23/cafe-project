import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Eye, FileSpreadsheet, MailWarning, Plus, X } from "lucide-react";
import { purchaseRequestsApi } from "../../api/purchaseRequests.api";
import { productsApi } from "../../api/products.api";
import { suppliersApi } from "../../api/suppliers.api";
import { inventoryApi } from "../../api/inventory.api";
import type { PurchaseRequest } from "../../types/purchaseRequest.types";
import { formatDate } from "../../utils/formatDate";
import { Badge } from "../../components/common/Badge";
import { Loading } from "../../components/common/Loading";
import { EmptyState } from "../../components/common/EmptyState";
import { DataTable } from "../../components/admin/DataTable";

const paymentStatusLabel = (status?: string) => (status === "PAID" ? "Đã thanh toán" : "Chưa thanh toán");
const paymentStatusClassName = (status?: string) =>
  status === "PAID"
    ? "border-emerald-200 bg-emerald-50 text-emerald-700"
    : "border-amber-200 bg-amber-50 text-amber-700";

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
    if (Number.isNaN(qty) || qty <= 0) return showToast("Số lượng đề xuất phải lớn hơn 0.", "error");

    setIsFormLoading(true);
    showToast("Đang tạo yêu cầu nhập hàng...", "info");

    try {
      const inv = inventories.find((item: any) => item.productId === selectedProductId || item.product_id === selectedProductId);
      const inventoryId = inv?.id || selectedProductId;

      const newPr = await purchaseRequestsApi.createPurchaseRequest({
        supplierId: selectedSupplierId,
        notes: note,
        items: [{ inventoryId, quantity: qty }],
      });

      showToast("Tạo yêu cầu nhập hàng thành công.", "success");
      setStatusFilter(newPr.status || "PENDING");
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
        <Loading message="Đang tải danh sách yêu cầu nhập hàng..." />
      </div>
    );
  }

  const columns = [
    {
      header: "Mã yêu cầu",
      render: (pr: PurchaseRequest) => (
        <span className="font-mono text-xs font-bold text-slate-800">#{pr.id.slice(-8).toUpperCase()}</span>
      ),
    },
    {
      header: "Sản phẩm đề xuất",
      render: (pr: PurchaseRequest) => {
        const isPending = pr.status === "PENDING";
        const isPendingDelete = pr.items?.some((item: any) => !!item.productPendingDelete);
        return (
          <div className="flex flex-col gap-1">
            <div className="flex items-center gap-2">
              {isPending && <MailWarning className="flex-shrink-0 animate-bounce text-amber-700" size={13} />}
              <span className={`font-semibold ${isPending ? "text-amber-900" : "text-slate-800"}`}>
                {pr.product?.name || "Sản phẩm"}
              </span>
            </div>
            {isPendingDelete && (
              <span className="w-fit rounded bg-rose-100 px-1.5 py-0.5 text-[10px] font-bold text-rose-700">
                Sản phẩm chờ xoá
              </span>
            )}
          </div>
        );
      },
    },
    {
      header: "Nhà cung cấp",
      render: (pr: PurchaseRequest) => (
        <div className="flex flex-col gap-0.5">
          <span className="text-sm font-medium text-slate-600">{pr.supplier?.name || "Chưa gán"}</span>
          {pr.supplier?.status === 'INACTIVE' && (
            <span className="text-[10px] font-bold text-rose-600 bg-rose-50 px-1.5 py-0.5 rounded w-fit">Ngừng hoạt động</span>
          )}
        </div>
      ),
    },
    {
      header: "SL đề xuất",
      render: (pr: PurchaseRequest) => {
        const qty = pr.suggestedQuantity ?? (pr as any).suggested_quantity ?? 0;
        const purchaseQty = pr.purchaseQuantity;
        const purchaseUnit = pr.purchaseUnit;
        const convertedQty = pr.convertedQuantity ?? qty;
        const invUnit = pr.inventoryUnit ?? pr.conversionTargetUnit;

        if (purchaseQty && purchaseUnit && invUnit) {
          return (
            <div className="flex flex-col gap-0.5">
              <span className="font-bold text-amber-800">
                {purchaseQty} {purchaseUnit}
              </span>
              <span className="text-[11px] font-medium text-slate-500">
                = {convertedQty} {invUnit}
              </span>
            </div>
          );
        }

        return (
          <div className="flex flex-col gap-0.5">
            <span className="font-bold text-amber-800">
              {qty}
              {invUnit ? ` ${invUnit}` : ""}
            </span>
            {pr.conversionMissing && (
              <span className="text-[11px] font-medium text-amber-700">Chưa có quy cách nhập hàng</span>
            )}
          </div>
        );
      },
    },
    {
      header: "Trạng thái",
      render: (pr: PurchaseRequest) => <Badge status={pr.status} />,
    },
    {
      header: "Thanh toán",
      render: (pr: PurchaseRequest) => (
        <span className={`inline-flex rounded-full border px-2.5 py-0.5 text-xs font-bold ${paymentStatusClassName(pr.paymentStatus)}`}>
          {paymentStatusLabel(pr.paymentStatus)}
        </span>
      ),
    },
    {
      header: "Ngày tạo",
      render: (pr: PurchaseRequest) => {
        const dateStr = pr.createdAt || (pr as any).created_at || "";
        return <span className="text-xs text-slate-500">{dateStr ? formatDate(dateStr) : ""}</span>;
      },
    },
    {
      header: "Chi tiết",
      className: "text-right",
      render: (pr: PurchaseRequest) => (
        <button
          onClick={() => navigate(`/admin/purchase-requests/${pr.id}`)}
          className="rounded-lg p-1.5 text-slate-400 transition-all hover:bg-amber-50 hover:text-amber-800"
          title="Xem chi tiết"
        >
          <Eye size={15} />
        </button>
      ),
    },
  ];

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex flex-wrap gap-3">
          <div className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm shadow-sm">
            <FileSpreadsheet size={14} className="text-amber-700" />
            <span className="font-semibold text-slate-700">{purchaseRequests.length} yêu cầu tổng</span>
          </div>
          {pendingCount > 0 && (
            <div className="flex animate-pulse items-center gap-2 rounded-xl border border-amber-200 bg-amber-50 px-4 py-2 text-sm shadow-sm">
              <MailWarning size={14} className="text-amber-700" />
              <span className="font-semibold text-amber-800">{pendingCount} chờ phê duyệt</span>
            </div>
          )}
        </div>

        <button
          onClick={handleOpenModal}
          className="flex items-center gap-2 rounded-xl bg-amber-800 px-4 py-2 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-amber-900"
        >
          <Plus size={16} />
          Tạo yêu cầu nhập hàng
        </button>
      </div>

      {error && <div className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm font-medium text-rose-800">{error}</div>}

      <div className="flex flex-wrap items-center gap-1.5 rounded-xl border border-slate-200 bg-white p-1.5 shadow-sm">
        {FILTER_OPTIONS.map((opt) => (
          <button
            key={opt.value}
            onClick={() => setStatusFilter(opt.value)}
            className={`rounded-lg px-4 py-1.5 text-xs font-semibold transition-all duration-200 ${statusFilter === opt.value
                ? "bg-amber-800 text-white shadow-sm"
                : "text-slate-500 hover:bg-slate-100 hover:text-slate-700"
              }`}
          >
            {opt.label}
            {opt.value === "PENDING" && pendingCount > 0 && (
              <span
                className={`ml-1.5 rounded-full px-1.5 py-0.5 text-[10px] font-bold ${statusFilter === "PENDING" ? "bg-white/30 text-white" : "bg-amber-100 text-amber-800"
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
        <div
          className={`fixed bottom-4 right-4 z-50 flex items-center gap-2 rounded-lg px-4 py-3 text-sm font-medium shadow-lg ${toast.type === "success"
              ? "border border-emerald-200 bg-emerald-100 text-emerald-800"
              : toast.type === "error"
                ? "border border-rose-200 bg-rose-100 text-rose-800"
                : "border border-blue-200 bg-blue-100 text-blue-800"
            }`}
        >
          {toast.message}
        </div>
      )}

      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4 backdrop-blur-sm">
          <div className="flex max-h-[90vh] w-full max-w-lg flex-col overflow-hidden rounded-2xl bg-white shadow-xl">
            <div className="flex items-center justify-between border-b border-slate-100 p-4">
              <h3 className="font-bold text-slate-800">Tạo yêu cầu nhập hàng</h3>
              <button onClick={handleCloseModal} className="rounded-lg p-1 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600">
                <X size={20} />
              </button>
            </div>

            <div className="overflow-y-auto p-4">
              <form id="create-pr-form" onSubmit={handleSubmit} className="flex flex-col gap-4">
                <div className="flex flex-col gap-1.5">
                  <label className="text-sm font-semibold text-slate-700">
                    Sản phẩm <span className="text-rose-500">*</span>
                  </label>
                  <select
                    value={selectedProductId}
                    onChange={(e) => setSelectedProductId(e.target.value)}
                    disabled={isFormLoading}
                    className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm focus:border-amber-500 focus:outline-none focus:ring-2 focus:ring-amber-500/20"
                  >
                    <option value="">-- Chọn sản phẩm --</option>
                    {products.map((product) => (
                      <option key={product.id} value={product.id}>
                        {product.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="flex flex-col gap-1.5">
                  <label className="text-sm font-semibold text-slate-700">
                    Nhà cung cấp <span className="text-rose-500">*</span>
                  </label>
                  <select
                    value={selectedSupplierId}
                    onChange={(e) => setSelectedSupplierId(e.target.value)}
                    disabled={isFormLoading}
                    className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm focus:border-amber-500 focus:outline-none focus:ring-2 focus:ring-amber-500/20"
                  >
                    <option value="">-- Chọn nhà cung cấp --</option>
                    {suppliers.map((supplier) => (
                      <option key={supplier.id} value={supplier.id}>
                        {supplier.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="flex flex-col gap-1.5">
                  <label className="text-sm font-semibold text-slate-700">
                    Số lượng đề xuất <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="number"
                    min="1"
                    value={quantity}
                    onChange={(e) => setQuantity(e.target.value)}
                    disabled={isFormLoading}
                    placeholder="Nhập số lượng"
                    className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm focus:border-amber-500 focus:outline-none focus:ring-2 focus:ring-amber-500/20"
                  />
                </div>

                <div className="flex flex-col gap-1.5">
                  <label className="text-sm font-semibold text-slate-700">Ghi chú</label>
                  <textarea
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                    disabled={isFormLoading}
                    placeholder="Nhập ghi chú nếu có"
                    rows={3}
                    className="w-full resize-none rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm focus:border-amber-500 focus:outline-none focus:ring-2 focus:ring-amber-500/20"
                  />
                </div>
              </form>
            </div>

            <div className="flex items-center justify-end gap-3 border-t border-slate-100 bg-slate-50 p-4">
              <button
                type="button"
                onClick={handleCloseModal}
                disabled={isFormLoading}
                className="rounded-xl bg-slate-100 px-4 py-2 text-sm font-semibold text-slate-600 transition-colors hover:bg-slate-200"
              >
                Hủy
              </button>
              <button
                type="submit"
                form="create-pr-form"
                disabled={isFormLoading}
                className="rounded-xl bg-amber-800 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-amber-900 disabled:opacity-50"
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
