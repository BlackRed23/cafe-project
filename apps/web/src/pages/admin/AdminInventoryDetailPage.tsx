import React, { useState, useEffect } from "react";
import { useParams, Link, useNavigate } from "react-router-dom";
import { inventoryApi } from "../../api/inventory.api";
import { suppliersApi } from "../../api/suppliers.api";
import { purchaseRequestsApi } from "../../api/purchaseRequests.api";
import type { Inventory } from "../../types/inventory.types";
import type { SupplierProduct } from "../../types/supplier.types";
import { Badge } from "../../components/common/Badge";
import { Button } from "../../components/common/Button";
import { Loading } from "../../components/common/Loading";
import { AlertCircle, ArrowLeft, PlusCircle, Sliders, Settings, Package, Info } from "lucide-react";
import { getErrorMessage } from "../../api/client";
import { Modal } from "../../components/common/Modal";
import { Input } from "../../components/common/Input";
import { useAuth } from "../../contexts/AuthContext";

export const AdminInventoryDetailPage: React.FC = () => {
  const { inventoryId } = useParams<{ inventoryId: string }>();
  const navigate = useNavigate();
  const { isStaff } = useAuth();
  const [inventory, setInventory] = useState<Inventory | null>(null);
  const [supplierProducts, setSupplierProducts] = useState<SupplierProduct[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Modal states
  const [modalType, setModalType] = useState<"import" | "adjust" | "threshold" | "create_pr" | null>(null);
  const [inputValue, setInputValue] = useState<number>(0);
  const [inputNote, setInputNote] = useState("");
  const [batchCode, setBatchCode] = useState("");
  const [expirationDate, setExpirationDate] = useState("");
  const [prQuantity, setPrQuantity] = useState<number>(0);
  const [prSupplierId, setPrSupplierId] = useState<string>("");
  const [modalLoading, setModalLoading] = useState(false);
  const [thresholdSuggestion, setThresholdSuggestion] = useState<any>(null);
  const [isSuggesting, setIsSuggesting] = useState(false);
  const [toast, setToast] = useState<{ message: string; type: "success" | "error" | "info" | "warning" } | null>(null);

  const showToast = (message: string, type: "success" | "error" | "info" | "warning" = "info") => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3000);
  };

  const fetchData = async () => {
    if (!inventoryId) return;
    try {
      setIsLoading(true);
      // Fallback to getInventories to get all computed fields (safetyStock, PR info, etc.)
      const [inventories, suppliers] = await Promise.all([
        inventoryApi.getInventories(),
        !isStaff ? suppliersApi.getSupplierProducts() : Promise.resolve([]),
      ]);
      const found = inventories.find((i) => i.id === inventoryId || (i as any).inventoryId === inventoryId || i.productId === inventoryId);
      if (!found) {
        setError("Không tìm thấy tồn kho.");
      } else {
        setInventory(found);
        setSupplierProducts(suppliers.filter((sp) => sp.productId === found.productId));
      }
    } catch (err) {
      setError("Không thể tải dữ liệu chi tiết.");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [inventoryId]);



  const getInventoryStatusView = (inv: Inventory) => {
    const availableStock = Number(inv.availableStock ?? inv.quantity ?? 0);
    const minThreshold = Number(inv.minThreshold ?? inv.min_threshold ?? 0);
    if (availableStock <= 0) {
      return { label: "Hết hàng", className: "border-red-200 bg-red-50 text-red-700" };
    }
    if (availableStock < minThreshold) {
      return { label: "Cần nhập hàng", className: "border-rose-200 bg-rose-50 text-rose-700" };
    }
    if (availableStock === minThreshold) {
      return { label: "Chạm ngưỡng", className: "border-amber-200 bg-amber-50 text-amber-700" };
    }
    return { label: "Bình thường", className: "border-emerald-200 bg-emerald-50 text-emerald-700" };
  };

  const handleOpenModal = async (type: "import" | "adjust" | "threshold" | "create_pr") => {
    if (!inventory) return;
    setModalType(type);
    setInputValue(type === "threshold" ? (inventory.minThreshold ?? inventory.min_threshold ?? 0) : type === "adjust" ? inventory.quantity : 0);
    setInputNote("");
    
    if (type === "create_pr") {
      if (supplierProducts.length > 0) {
        setPrSupplierId(supplierProducts[0].supplierId);
      } else {
        setPrSupplierId("");
      }
      const available = inventory.availableStock ?? inventory.quantity;
      const minThreshold = inventory.minThreshold ?? inventory.min_threshold ?? 0;
      const moq = supplierProducts[0]?.minOrderQuantity ?? 1;
      const suggestedQuantity = Math.max(minThreshold - available, moq);
      setPrQuantity(suggestedQuantity);
    }
    if (type === "threshold") {
      setIsSuggesting(true);
      setThresholdSuggestion(null);
      try {
        const suggestion = await inventoryApi.getThresholdSuggestion((inventory as any).inventoryId ?? inventory.id);
        setThresholdSuggestion(suggestion);
      } catch (err) {
        console.error("Failed to load suggestion");
      } finally {
        setIsSuggesting(false);
      }
    }
  };

  const handleCloseModal = () => {
    setModalType(null);
    setInputValue(0);
    setInputNote("");
    setBatchCode("");
    setExpirationDate("");
    setPrQuantity(0);
    setPrSupplierId("");
    setThresholdSuggestion(null);
  };

  const handleSaveSuggestedThreshold = async () => {
    if (!inventory || !thresholdSuggestion) return;
    setModalLoading(true);
    try {
      await inventoryApi.updateInventory(inventory.productId, {
        minThreshold: thresholdSuggestion.recommendedThreshold,
      });
      showToast("Đã lưu ngưỡng đề xuất.", "success");
      await fetchData();
      handleCloseModal();
    } catch (err: any) {
      showToast(getErrorMessage(err) || "Không thể lưu ngưỡng.", "error");
    } finally {
      setModalLoading(false);
    }
  };

  const handleModalSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inventory) return;

    if (modalType === "import" && inputValue <= 0) {
      showToast("Số lượng nhập phải lớn hơn 0", "error");
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
    if (modalType === "create_pr") {
      if (!prSupplierId) {
        showToast("Vui lòng chọn nhà cung cấp", "error");
        return;
      }
      if (prQuantity <= 0) {
        showToast("Số lượng phải lớn hơn 0", "error");
        return;
      }
      setModalLoading(true);
      try {
        const response = await purchaseRequestsApi.createPurchaseRequest({
          supplierId: prSupplierId,
          notes: inputNote.trim() || undefined,
          items: [{
            inventoryId: (inventory as any).inventoryId ?? inventory.id,
            quantity: prQuantity
          }]
        });
        const createdRequest = (response as any)?.purchaseRequest || (response as any)?.data?.purchaseRequest || response;
        const createdRequestId = createdRequest?.id;
        if (createdRequestId) {
          showToast("Tạo yêu cầu thành công.", "success");
          handleCloseModal();
          navigate(`/admin/purchase-requests/${createdRequestId}`);
        } else {
          showToast("Tạo yêu cầu thành công.", "success");
          handleCloseModal();
          await fetchData();
        }
      } catch (err: any) {
        showToast(getErrorMessage(err) || "Không thể tạo yêu cầu.", "error");
      } finally {
        setModalLoading(false);
      }
      return;
    }

    setModalLoading(true);
    try {
      if (modalType === "import") {
        if (!expirationDate) {
          showToast("Vui lòng nhập ngày hết hạn", "error");
          setModalLoading(false);
          return;
        }
        await inventoryApi.importInventory({ productId: inventory.productId, quantity: inputValue, note: inputNote.trim() || undefined, batchCode: batchCode.trim() || undefined, expirationDate });
        showToast("Nhập kho thành công.", "success");
      } else if (modalType === "adjust") {
        const diff = inputValue - inventory.quantity;
        if (diff === 0) {
          showToast("Không có thay đổi.", "success");
          handleCloseModal();
          setModalLoading(false);
          return;
        }
        await inventoryApi.adjustInventory({ productId: inventory.productId, quantity: diff, note: inputNote.trim() || undefined });
        showToast("Điều chỉnh thành công.", "success");
      } else if (modalType === "threshold") {
        await inventoryApi.updateInventory(inventory.productId, { minThreshold: inputValue });
        showToast("Cập nhật ngưỡng thành công.", "success");
      }
      await fetchData();
      handleCloseModal();
    } catch (err: any) {
      showToast(getErrorMessage(err) || "Có lỗi xảy ra.", "error");
    } finally {
      setModalLoading(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loading message="Đang tải chi tiết tồn kho..." />
      </div>
    );
  }

  if (error || !inventory) {
    return (
      <div className="flex flex-col items-center justify-center py-24 gap-4">
        <AlertCircle size={48} className="text-rose-500" />
        <h2 className="text-lg font-semibold text-slate-800">{error || "Không tìm thấy dữ liệu"}</h2>
        <Button onClick={() => navigate("/admin/inventory")} variant="outline">
          Quay lại danh sách
        </Button>
      </div>
    );
  }

  const threshold = inventory.minThreshold ?? inventory.min_threshold ?? 0;
  const available = inventory.availableStock ?? inventory.quantity;
  const safetyStock = inventory.safetyStock ?? 0;
  const warningThreshold = threshold + safetyStock;
  const shouldShowPRBtn = available <= warningThreshold;

  const actionButtonClass = "inline-flex h-9 items-center justify-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-700 transition hover:bg-slate-50";
  const primaryButtonClass = "inline-flex h-9 items-center justify-center gap-1.5 rounded-lg border border-amber-600 bg-amber-600 px-3 text-xs font-semibold text-white transition hover:bg-amber-700";

  const Metric = ({ label, value, highlight }: { label: string; value: React.ReactNode; highlight?: boolean }) => (
    <div className="flex flex-col rounded-xl border border-slate-100 bg-slate-50 p-4">
      <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">{label}</span>
      <span className={`mt-1 text-2xl font-bold ${highlight ? "text-amber-600" : "text-slate-900"}`}>{value}</span>
    </div>
  );

  return (
    <div className="mx-auto w-full max-w-6xl space-y-5 px-4 py-5">
      {toast && (
        <div className={`fixed top-4 right-4 z-50 p-4 rounded-lg shadow-lg border ${toast.type === "success" ? "bg-emerald-50 border-emerald-200 text-emerald-800" : toast.type === "error" ? "bg-rose-50 border-rose-200 text-rose-800" : toast.type === "warning" ? "bg-amber-50 border-amber-200 text-amber-800" : "bg-blue-50 border-blue-200 text-blue-800"}`}>
          {toast.message}
        </div>
      )}

      {/* Header tối giản */}
      <div className="flex flex-col gap-3 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm lg:flex-row lg:items-center lg:justify-between">
        <div>
          <button onClick={() => navigate("/admin/inventory")} className="flex items-center gap-1.5 text-sm font-medium text-slate-500 hover:text-slate-800 transition-colors">
            <ArrowLeft size={16} /> Quay lại danh sách tồn kho
          </button>
          <div className="mt-2 flex items-center gap-3">
            <h1 className="text-2xl font-bold text-slate-900">{inventory.product?.name || "Sản phẩm không tên"}</h1>
            <span className={`inline-flex h-7 items-center rounded-full border px-3 text-xs font-semibold ${getInventoryStatusView(inventory).className}`}>
              {getInventoryStatusView(inventory).label}
            </span>
          </div>
          <p className="mt-1 text-sm text-slate-500">Chi tiết tồn kho và cảnh báo nhập hàng</p>
        </div>

        <div className="flex flex-wrap gap-2">
          {shouldShowPRBtn && !inventory.hasOpenPurchaseRequest && (
            supplierProducts.length > 0 ? (
              <button onClick={() => handleOpenModal("create_pr")} className={primaryButtonClass}>
                <PlusCircle size={15} /> Tạo YC nhập
              </button>
            ) : (
              <span className="inline-flex h-9 items-center justify-center rounded-lg border border-slate-200 bg-slate-100 px-3 text-xs font-medium text-slate-600">
                Thiếu NCC
              </span>
            )
          )}
          <button onClick={() => handleOpenModal("import")} className={actionButtonClass}>
            <PlusCircle size={15} /> Nhập kho
          </button>
          <button onClick={() => handleOpenModal("adjust")} className={actionButtonClass}>
            <Sliders size={15} /> Điều chỉnh
          </button>
          <button onClick={() => handleOpenModal("threshold")} className={actionButtonClass}>
            <Settings size={15} /> Cập nhật ngưỡng
          </button>
        </div>
      </div>

      {/* Tổng quan tồn kho */}
      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="text-base font-bold text-slate-900">Tổng quan tồn kho</h2>
        <div className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-3">
          <Metric label="Tồn kho thật" value={`${inventory.quantity} ${inventory.unit || inventory.product?.unit || ""}`.trim()} />
          <Metric label="Đang giữ" value={inventory.reservedStock ?? 0} />
          <Metric label="Khả dụng" value={available} highlight />
          <Metric label="Ngưỡng tối thiểu" value={threshold} />
          <Metric label="Hàng an toàn" value={safetyStock || "—"} />
          <Metric label="Ngưỡng đề xuất" value={inventory.recommendedThreshold ?? "—"} />
        </div>
      </div>

      {/* Thông tin sản phẩm */}
      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="mb-3 text-base font-bold text-slate-900">Thông tin sản phẩm</h2>
        <div className="flex flex-wrap gap-6 text-sm">
          <div className="flex flex-col gap-1">
            <span className="text-slate-500">SKU</span>
            <span className="font-semibold text-slate-800">{(inventory.product as any)?.sku || (inventory as any).sku || "—"}</span>
          </div>
          <div className="flex flex-col gap-1">
            <span className="text-slate-500">Đơn vị</span>
            <span className="font-semibold text-slate-800">{inventory.product?.unit || "—"}</span>
          </div>
          <div className="flex flex-col gap-1">
            <span className="text-slate-500">Danh mục</span>
            <span className="font-semibold text-slate-800">{(inventory as any).categoryName || "—"}</span>
          </div>
        </div>
      </div>

      {/* Danh sách lô hàng */}
      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="mb-4 text-base font-bold text-slate-900">Danh sách lô hàng</h2>
        {(inventory as any).batches && (inventory as any).batches.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm text-slate-600">
              <thead className="border-b border-slate-200 bg-slate-50 text-xs uppercase text-slate-500">
                <tr>
                  <th className="px-4 py-3 font-medium">Mã lô (Batch)</th>
                  <th className="px-4 py-3 font-medium">Số lượng</th>
                  <th className="px-4 py-3 font-medium">Ngày hết hạn</th>
                  <th className="px-4 py-3 font-medium">Trạng thái</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {(inventory as any).batches.map((batch: any) => {
                  const startOfToday = new Date();
                  startOfToday.setHours(0, 0, 0, 0);
                  const expDate = new Date(batch.expirationDate);
                  const daysLeft = Math.ceil((expDate.getTime() - startOfToday.getTime()) / (1000 * 60 * 60 * 24));
                  let statusLabel = "Còn hạn";
                  let statusClass = "bg-emerald-100 text-emerald-700";
                  let rowClass = "";
                  
                  if (daysLeft < 0) {
                    statusLabel = "Đã hết hạn";
                    statusClass = "bg-rose-100 text-rose-700 font-bold";
                    rowClass = "bg-rose-50/50";
                  } else if (daysLeft <= 3) {
                    statusLabel = "Cận hạn";
                    statusClass = "bg-red-100 text-red-700 font-bold";
                    rowClass = "bg-red-50/30";
                  } else if (daysLeft <= 7) {
                    statusLabel = "Sắp hết hạn";
                    statusClass = "bg-orange-100 text-orange-700 font-bold";
                    rowClass = "bg-orange-50/30";
                  } else if (daysLeft < 30) {
                    statusLabel = "Gần hết hạn";
                    statusClass = "bg-amber-100 text-amber-700";
                    rowClass = "bg-amber-50/20";
                  }

                  return (
                    <tr key={batch.id} className={`hover:bg-slate-50 transition-colors ${rowClass}`}>
                      <td className="px-4 py-3 font-medium text-slate-900">{batch.batchCode}</td>
                      <td className="px-4 py-3">{batch.quantity}</td>
                      <td className="px-4 py-3">{expDate.toLocaleDateString("vi-VN")}</td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex rounded-full px-2 py-0.5 text-xs ${statusClass}`}>
                          {statusLabel}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-6 text-center text-sm text-slate-500">
            Chưa có lô hàng nào.
          </div>
        )}
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        {/* Nhà cung cấp */}
        <div className="flex flex-col rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="mb-4 text-base font-bold text-slate-900">Nhà cung cấp</h2>
          {supplierProducts.length > 0 ? (
            <div className="flex flex-col gap-3">
              {supplierProducts.map((sp, idx) => (
                <div key={sp.supplierId} className="flex flex-col rounded-xl border border-slate-100 bg-slate-50 p-3">
                  <div className="mb-2 flex items-center justify-between">
                    <span className="font-bold text-slate-800">{sp.supplier?.name || "Nhà cung cấp"}</span>
                    {idx === 0 && <span className="rounded bg-emerald-100 px-2 py-0.5 text-[10px] font-bold uppercase text-emerald-700">Chính</span>}
                  </div>
                  <div className="grid grid-cols-2 gap-2 text-sm text-slate-600">
                    <div>Thời gian giao: <span className="font-medium text-slate-900">{(sp as any).leadTimeDays || sp.leadTime || "—"} ngày</span></div>
                    <div>MOQ: <span className="font-medium text-slate-900">{sp.minOrderQuantity || "—"}</span></div>
                    {(sp as any).purchasePrice && <div>Giá nhập: <span className="font-medium text-slate-900">{Number((sp as any).purchasePrice).toLocaleString()}đ</span></div>}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-medium text-rose-700">
              Sản phẩm chưa có nhà cung cấp.
            </div>
          )}
        </div>

        {/* Yêu cầu nhập hàng */}
        <div className="flex flex-col rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="mb-4 text-base font-bold text-slate-900">Yêu cầu nhập hàng</h2>
          {inventory.hasOpenPurchaseRequest ? (
            <div className="flex flex-col gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4">
              <div className="flex items-center justify-between">
                <span className="text-sm font-bold text-amber-900">Đang xử lý</span>
                <Badge status={(inventory.openPurchaseRequestStatus as any) || "PENDING"} />
              </div>
              <div className="text-sm text-amber-800">Mã yêu cầu: <span className="font-semibold">{inventory.openPurchaseRequestCode || "—"}</span></div>
              <Link to={`/admin/purchase-requests/${inventory.openPurchaseRequestId}`} className="mt-1 text-sm font-bold text-amber-700 underline hover:text-amber-900">
                Xem yêu cầu
              </Link>
            </div>
          ) : shouldShowPRBtn ? (
            <div className="flex flex-col items-start gap-3 rounded-xl border border-slate-100 bg-slate-50 p-4">
              <p className="text-sm text-slate-600">Tồn kho đang thấp, bạn có thể tạo yêu cầu nhập hàng ngay.</p>
              {supplierProducts.length > 0 ? (
                <button onClick={() => handleOpenModal("create_pr")} className={primaryButtonClass}>
                  Tạo yêu cầu nhập hàng
                </button>
              ) : (
                <p className="text-sm font-medium text-rose-600">Sản phẩm chưa có nhà cung cấp, không thể tạo yêu cầu.</p>
              )}
            </div>
          ) : (
            <div className="flex min-h-[120px] flex-col items-center justify-center rounded-xl bg-slate-50 px-4 py-6 text-center">
              <p className="text-sm text-slate-500">Chưa cần tạo yêu cầu nhập hàng.</p>
            </div>
          )}
        </div>
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        {/* Lịch sử kho */}
        <div className="flex flex-col rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-base font-bold text-slate-900">Lịch sử kho gần đây</h2>
          </div>
          <div className="flex min-h-[120px] flex-col items-center justify-center rounded-xl bg-slate-50 px-4 py-6 text-center">
            <Package size={24} className="mb-2 text-slate-300" />
            <Link to="/admin/inventory/transactions" className="text-sm font-medium text-blue-600 hover:underline">Xem lịch sử kho</Link>
          </div>
        </div>

        {/* Nhật ký AI */}
        <div className="flex flex-col rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-base font-bold text-slate-900">Nhật ký AI Agent</h2>
          </div>
          <div className="flex min-h-[120px] flex-col items-center justify-center rounded-xl bg-slate-50 px-4 py-6 text-center">
            <Info size={24} className="mb-2 text-slate-300" />
            <Link to="/admin/agent-logs" className="text-sm font-medium text-blue-600 hover:underline">Xem Nhật ký AI</Link>
          </div>
        </div>
      </div>

      {/* Dynamic Modal */}
      {modalType && inventory && (
        <Modal
          isOpen={true}
          onClose={handleCloseModal}
          title={
            modalType === "import"
              ? `Nhập thêm kho: ${inventory.product?.name}`
              : modalType === "adjust"
                ? `Điều chỉnh số lượng: ${inventory.product?.name}`
                : modalType === "threshold"
                  ? `Cập nhật ngưỡng tối thiểu: ${inventory.product?.name}`
                  : `Tạo yêu cầu nhập hàng: ${inventory.product?.name}`
          }
          size={modalType === "threshold" ? "md" : "sm"}
        >
          <form onSubmit={handleModalSubmit} className="space-y-4">
            {modalType === "threshold" && (
              <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 mb-4 space-y-3 text-sm text-slate-700 relative overflow-hidden">
                {isSuggesting && (
                  <div className="absolute inset-0 bg-white/50 backdrop-blur-sm flex items-center justify-center z-10">
                    <Loading message="Đang tính toán..." />
                  </div>
                )}
                <div className="pb-3 border-b border-slate-200">
                  <p className="text-xs text-slate-500 italic">Hệ thống tự tính dựa trên lịch sử bán gần đây và thời gian chờ nhập hàng.</p>
                </div>
                <div className="flex justify-between items-center bg-white p-2 rounded border border-slate-100">
                  <span className="text-slate-500">Tồn kho thật:</span>
                  <span className="font-semibold text-slate-900">{inventory.quantity}</span>
                </div>
                <div className="flex justify-between items-center bg-white p-2 rounded border border-slate-100">
                  <span className="text-slate-500">Đang giữ cho đơn hàng:</span>
                  <span className="font-semibold text-orange-600">{inventory.reservedStock ?? 0}</span>
                </div>
                <div className="flex justify-between items-center bg-white p-2 rounded border border-slate-100 shadow-sm">
                  <span className="font-medium text-slate-700">Tồn kho khả dụng:</span>
                  <span className="font-bold text-emerald-700 text-lg">{available}</span>
                </div>
                <div className="flex justify-between items-center bg-white p-2 rounded border border-slate-100">
                  <span className="text-slate-500">Ngưỡng hiện tại:</span>
                  <span className="font-semibold text-slate-900">{threshold}</span>
                </div>
                {thresholdSuggestion && (
                  <div className="flex justify-between items-center bg-amber-50 p-2 rounded border border-amber-100 mt-2">
                    <span className="text-amber-800 font-medium text-xs">Hàng an toàn (dự phòng):</span>
                    <span className="font-bold text-amber-700">{thresholdSuggestion.safetyStock ?? 0}</span>
                  </div>
                )}
                <div className="flex flex-col pt-3 mt-3 border-t border-slate-200 gap-2">
                  <div className="flex justify-between items-center">
                    <span className="font-semibold text-emerald-700">Ngưỡng đề xuất:</span>
                    <span className="font-bold text-lg text-emerald-700">{thresholdSuggestion?.recommendedThreshold ?? 0}</span>
                  </div>
                  {thresholdSuggestion?.explanation && (
                    <div className="text-xs text-slate-600 bg-white p-2.5 rounded-lg border border-slate-200 my-2 leading-relaxed">
                      {thresholdSuggestion.explanation}
                    </div>
                  )}
                  {thresholdSuggestion && (
                    <div className="flex justify-end mt-1">
                      <Button
                        type="button" size="sm"
                        variant={thresholdSuggestion.recommendedThreshold === threshold ? "outline" : "primary"}
                        className={`h-8 text-xs ${thresholdSuggestion.recommendedThreshold === threshold ? "border-slate-300 text-slate-600 hover:bg-slate-50" : "bg-emerald-600 hover:bg-emerald-700 text-white border-transparent"}`}
                        onClick={handleSaveSuggestedThreshold}
                        disabled={isSuggesting || !thresholdSuggestion || thresholdSuggestion.recommendedThreshold === threshold}
                      >
                        Lưu ngưỡng đề xuất
                      </Button>
                    </div>
                  )}
                </div>
              </div>
            )}

            {modalType === "create_pr" && (
              <div className="space-y-4">
                <div className="bg-slate-50 p-3 rounded-lg border border-slate-200 text-sm">
                  <div className="flex justify-between items-center mb-1">
                    <span className="text-slate-500">Tồn kho khả dụng:</span>
                    <span className="font-semibold text-slate-800">{available}</span>
                  </div>
                  <div className="flex justify-between items-center mb-1">
                    <span className="text-slate-500">Ngưỡng tối thiểu:</span>
                    <span className="font-semibold text-slate-800">{threshold}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-slate-500">Hàng an toàn:</span>
                    <span className="font-semibold text-slate-800">{safetyStock || "—"}</span>
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1.5">Nhà cung cấp</label>
                  <select
                    value={prSupplierId}
                    onChange={(e) => setPrSupplierId(e.target.value)}
                    className="block w-full px-3 py-2 rounded-lg border border-slate-300 text-sm focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500"
                    required
                  >
                    <option value="">-- Chọn nhà cung cấp --</option>
                    {supplierProducts.map(sp => (
                      <option key={sp.supplierId} value={sp.supplierId}>{sp.supplier?.name || "Nhà cung cấp"}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <Input
                    label={`Số lượng đề xuất nhập hàng (${inventory.unit || inventory.product?.unit || "đơn vị"})`}
                    type="number" value={prQuantity || ""} onChange={(e) => setPrQuantity(parseInt(e.target.value) || 0)}
                    required min={1}
                  />
                </div>
                <div>
                  <Input
                    label="Ghi chú (tùy chọn)"
                    type="text" value={inputNote} onChange={(e) => setInputNote(e.target.value)}
                    placeholder="VD: Cần nhập gấp để kịp bán lễ"
                  />
                </div>
              </div>
            )}

            {(modalType === "import" || modalType === "adjust" || modalType === "threshold") && (
              <>
                <Input
                  label={
                    modalType === "import"
                      ? `Số lượng nhập thêm (${inventory.product?.unit || "đơn vị"})`
                      : modalType === "adjust"
                        ? `Số lượng thực tế mới (${inventory.product?.unit || "đơn vị"})`
                        : `Ngưỡng tối thiểu mới (${inventory.product?.unit || "đơn vị"})`
                  }
                  type="number"
                  value={inputValue || ""}
                  onChange={(e) => setInputValue(Number(e.target.value))}
                  required
                  min={modalType === "adjust" ? 0 : 1}
                />
                {(modalType === "import" || modalType === "adjust") && (
                  <Input label="Ghi chú (tùy chọn)" value={inputNote} onChange={(e) => setInputNote(e.target.value)} />
                )}
                {modalType === "import" && (
                  <>
                    <Input label="Mã lô (Tùy chọn, để trống sẽ tự sinh)" value={batchCode} onChange={(e) => setBatchCode(e.target.value)} />
                    <Input label="Ngày hết hạn" type="date" value={expirationDate} onChange={(e) => setExpirationDate(e.target.value)} required />
                  </>
                )}
              </>
            )}

            <div className="flex justify-end gap-3 pt-4 border-t border-slate-100">
              <Button type="button" variant="outline" onClick={handleCloseModal} disabled={modalLoading}>
                Hủy
              </Button>
              <Button type="submit" disabled={modalLoading} className="bg-emerald-600 hover:bg-emerald-700 text-white">
                {modalLoading ? "Đang xử lý..." : "Xác nhận"}
              </Button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
};
