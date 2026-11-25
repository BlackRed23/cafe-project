import { schedulePageLoad } from "../../utils/schedulePageLoad";
import { isAxiosError } from "axios";
import { mockEnabled } from '../../mock/config';
import { MockWorkspace } from '../../mock/MockWorkspace';
import React, { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Eye, FileSpreadsheet, MailWarning, Plus, X } from "lucide-react";
import { purchaseRequestsApi } from "../../api/purchaseRequests.api";
import { ingredientsApi } from "../../api/ingredients.api";
import { suppliersApi } from "../../api/suppliers.api";
import { purchasingApi } from "../../api/purchasing.api";
import type { PurchaseRequest } from "../../types/purchaseRequest.types";
import { formatDate } from "../../utils/formatDate";
import { Badge } from "../../components/common/Badge";
import { Loading } from "../../components/common/Loading";
import { EmptyState } from "../../components/common/EmptyState";
import { DataTable } from "../../components/admin/DataTable";
import { useAuth } from "../../contexts/AuthContext";
import { useToast } from "../../contexts/ToastContext";

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

export const AdminPurchaseRequestsPage: React.FC = () => mockEnabled ? <MockWorkspace area="purchases" /> : <LegacyAdminPurchaseRequestsPage />;

const LegacyAdminPurchaseRequestsPage: React.FC = () => {
  const navigate = useNavigate();
  const { isStaff } = useAuth();
  const [purchaseRequests, setPurchaseRequests] = useState<PurchaseRequest[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [search, setSearch] = useState("");
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isFormLoading, setIsFormLoading] = useState(false);
  const [products, setProducts] = useState<Awaited<ReturnType<typeof ingredientsApi.getIngredients>>>([]);
  const [suppliers, setSuppliers] = useState<Awaited<ReturnType<typeof suppliersApi.getSuppliers>>>([]);
  const [selectedProductId, setSelectedProductId] = useState("");
  const [selectedSupplierId, setSelectedSupplierId] = useState("");
  const [quantity, setQuantity] = useState("");
  const [unitPrice, setUnitPrice] = useState("");
  const [eligibility, setEligibility] = useState<Awaited<ReturnType<typeof purchasingApi.eligibleSuppliers>> | null>(null);
  const [eligibilityIngredient, setEligibilityIngredient] = useState("");
  const [uncertainCreate, setUncertainCreate] = useState(false);
  const createIntent = useRef<Parameters<typeof purchaseRequestsApi.createPurchaseRequest>[0] | null>(null);
  const [note, setNote] = useState("");
  const toast = useToast();

  const fetchPRs = async () => {
    try {
      setIsLoading(true);
      const data = await purchaseRequestsApi.getPurchaseRequests();
      const sorted = data.sort((a, b) => {
        const t1 = a.createdAt || a.created_at || "";
        const t2 = b.createdAt || b.created_at || "";
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
    return schedulePageLoad(fetchPRs);
  }, []);

  const handleOpenModal = async () => {
    setIsModalOpen(true);
    setIsFormLoading(true);
    try {
      const [ingRes, suppRes] = await Promise.all([
        ingredientsApi.getIngredients(),
        suppliersApi.getSuppliers(),
      ]);
      setProducts(ingRes);
      setSuppliers(suppRes);
    } catch {
      toast.error("Không thể tải danh sách nguyên liệu hoặc nhà cung cấp.");
    } finally {
      setIsFormLoading(false);
    }
  };

  const handleCloseModal = () => {
    if (uncertainCreate) return;
    setIsModalOpen(false);
    setSelectedProductId("");
    setSelectedSupplierId("");
    setQuantity("");
    setUnitPrice("");
    setEligibility(null);
    setEligibilityIngredient("");
    createIntent.current = null;
    setNote("");
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedProductId) return toast.error("Vui lòng chọn nguyên liệu.");
    if (!selectedSupplierId) return toast.error("Vui lòng chọn nhà cung cấp.");
    if (!quantity) return toast.error("Vui lòng nhập số lượng đề xuất.");

    const qty = Number(quantity);
    if (!Number.isSafeInteger(qty) || qty <= 0) return toast.error("Số lượng đề xuất phải là số nguyên dương.");
    const price = Number(unitPrice);
    if (unitPrice.trim() && (!Number.isFinite(price) || price < 0)) return toast.error("Đơn giá phải không âm.");
    if (eligibilityIngredient !== selectedProductId || !eligibility?.eligible.some(s=>s.supplierId===selectedSupplierId))
      return toast.error("Nhà cung cấp chưa được xác minh hợp lệ cho nguyên liệu này. Hãy chọn lại hoặc tạo sourcing hold.");
    if (!window.confirm(uncertainCreate
      ? 'Xác nhận thử lại yêu cầu cũ với cùng demandSourceKey và nội dung?'
      : 'Xác nhận tạo Purchase Request đang chờ ADMIN phê duyệt?')) return;

    setIsFormLoading(true);
    toast.info("Đang tạo yêu cầu nhập nguyên liệu...");

    try {
      const payload = createIntent.current ?? {
        supplierId: selectedSupplierId,
        demandSourceKey: `manual-pr:${crypto.randomUUID()}`,
        notes: note,
        items: [{ ingredientId: selectedProductId, quantity: qty, ...(unitPrice.trim()?{unitPrice:price}:{}) }],
      };
      createIntent.current=payload;
      const newPr = await purchaseRequestsApi.createPurchaseRequest(payload);

      createIntent.current=null;
      setUncertainCreate(false);
      toast.success("Đã tạo yêu cầu mua hàng. Đang chờ phê duyệt.");
      setStatusFilter(newPr.status || "PENDING");
      handleCloseModal();
      fetchPRs();
    } catch (err) {
      const response = isAxiosError<{ message?: string }>(err) ? err.response : undefined;
      if (!response?.status || response.status >= 500 || response.status === 408) setUncertainCreate(true);
      else {createIntent.current=null;setUncertainCreate(false);}
      const msg = response?.data?.message || (err instanceof Error ? err.message : undefined) || "Không thể tạo yêu cầu nhập hàng, vui lòng thử lại.";
      toast.error(msg);
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
      header: "Nguyên liệu đề xuất",
      render: (pr: PurchaseRequest) => {
        const isPending = pr.status === "PENDING";
        const isPendingDelete = pr.items?.some((item) => !!item.productPendingDelete);
        return (
          <div className="flex flex-col gap-1">
            <div className="flex items-center gap-2">
              {isPending && <MailWarning className="flex-shrink-0 animate-bounce text-amber-700" size={13} />}
              <span className={`font-semibold ${isPending ? "text-amber-900" : "text-slate-800"}`}>
                {pr.product?.name || "Nguyên liệu"}
              </span>
            </div>
            {isPendingDelete && (
              <span className="w-fit rounded bg-rose-100 px-1.5 py-0.5 text-[10px] font-bold text-rose-700">
                Nguyên liệu đã ngừng
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
        const qty = pr.suggestedQuantity ?? pr.suggested_quantity ?? 0;
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
        const dateStr = pr.createdAt || pr.created_at || "";
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

        {!isStaff && (
          <button
            onClick={handleOpenModal}
            className="flex items-center gap-2 rounded-xl bg-amber-800 px-4 py-2 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-amber-900"
          >
            <Plus size={16} />
            Tạo yêu cầu nhập hàng
          </button>
        )}
        <button onClick={()=>navigate('/admin/purchasing')} className="rounded-xl border border-emerald-300 bg-emerald-50 px-4 py-2 text-sm font-semibold text-emerald-900">Đơn mua & nhập theo PO</button>
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
          searchPlaceholder="Tìm theo tên nguyên liệu..."
          searchValue={search}
          onSearchChange={setSearch}
        />
      )}



      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4 backdrop-blur-sm">
          <div className="flex max-h-[90vh] w-full max-w-lg flex-col overflow-hidden rounded-2xl bg-white shadow-xl">
            <div className="flex items-center justify-between border-b border-slate-100 p-4">
              <h3 className="font-bold text-slate-800">Tạo yêu cầu nhập nguyên liệu</h3>
              <button onClick={handleCloseModal} className="rounded-lg p-1 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600">
                <X size={20} />
              </button>
            </div>

            <div className="overflow-y-auto p-4">
              <form id="create-pr-form" onSubmit={handleSubmit} className="flex flex-col gap-4">
                <div className="flex flex-col gap-1.5">
                  <label className="text-sm font-semibold text-slate-700">
                    Nguyên liệu <span className="text-rose-500">*</span>
                  </label>
                  <select
                    value={selectedProductId}
                    onChange={(e) => {
                      const newProductId = e.target.value;
                      setSelectedProductId(newProductId);
                      setSelectedSupplierId("");
                      setEligibility(null);
                      setEligibilityIngredient("");
                      if(newProductId) purchasingApi.eligibleSuppliers(newProductId)
                        .then(data=>{setEligibility(data);setEligibilityIngredient(newProductId);})
                        .catch(()=>toast.error("Không xác minh được nhà cung cấp; không thể tạo PR với nguồn chưa kiểm tra."));
                    }}
                    disabled={isFormLoading||uncertainCreate}
                    className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm focus:border-amber-500 focus:outline-none focus:ring-2 focus:ring-amber-500/20"
                  >
                    <option value="">-- Chọn nguyên liệu --</option>
                    {products.map((product) => (
                      <option key={product.id} value={product.id}>
                        {product.name} ({product.baseUnit || product.unit || ""})
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
                    disabled={isFormLoading||uncertainCreate||!eligibility}
                    className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm focus:border-amber-500 focus:outline-none focus:ring-2 focus:ring-amber-500/20"
                  >
                    <option value="">-- Chọn nhà cung cấp --</option>
                    {suppliers.filter(supplier => eligibilityIngredient===selectedProductId &&
                      eligibility?.eligible.some(e=>e.supplierId===supplier.id)).map((supplier) => (
                      <option key={supplier.id} value={supplier.id}>
                        {supplier.name}
                      </option>
                    ))}
                  </select>
                </div>
                {selectedProductId&&eligibilityIngredient===selectedProductId&&!eligibility?.createPOAllowed&&<p className="text-sm text-amber-800">Chưa có nhà cung cấp hợp lệ. Sử dụng Sourcing hold trong trang Mua hàng & đối soát.</p>}

                <div className="flex flex-col gap-1.5">
                  <label className="text-sm font-semibold text-slate-700">
                    Số lượng đề xuất <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="number"
                    min="1"
                    value={quantity}
                    onChange={(e) => setQuantity(e.target.value)}
                    disabled={isFormLoading||uncertainCreate}
                    placeholder="Nhập số lượng"
                    className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm focus:border-amber-500 focus:outline-none focus:ring-2 focus:ring-amber-500/20"
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <label className="text-sm font-semibold text-slate-700">Đơn giá theo đơn vị mua (VND, nếu có)</label>
                  <input type="number" min="0" step="0.01" value={unitPrice} onChange={e=>setUnitPrice(e.target.value)}
                    disabled={isFormLoading||uncertainCreate} className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm"/>
                </div>
                {uncertainCreate&&<p role="alert" className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm">Chưa xác định kết quả tạo PR. Giữ nguyên biểu mẫu và demandSourceKey; kiểm tra danh sách trước khi thử lại đúng yêu cầu cũ.</p>}

                <div className="flex flex-col gap-1.5">
                  <label className="text-sm font-semibold text-slate-700">Ghi chú</label>
                  <textarea
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                    disabled={isFormLoading||uncertainCreate}
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
                disabled={isFormLoading||uncertainCreate}
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
                {isFormLoading ? "Đang xử lý..." : uncertainCreate ? "Xác nhận thử lại cùng mã yêu cầu" : "Tạo yêu cầu"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
