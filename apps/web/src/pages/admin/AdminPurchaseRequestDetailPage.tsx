import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { AlertTriangle, ArrowLeft, Ban, CheckCircle, Mail, Info, Sparkles, PackageCheck, AlertOctagon, Send, X } from "lucide-react";
import { purchaseRequestsApi } from "../../api/purchaseRequests.api";
import { suppliersApi } from "../../api/suppliers.api";
import type { PurchaseRequest, PurchaseRequestEmailPreview } from "../../types/purchaseRequest.types";
import { formatDate } from "../../utils/formatDate";
import { Loading } from "../../components/common/Loading";
import { Button } from "../../components/common/Button";
import { ConfirmDialog } from "../../components/common/ConfirmDialog";
import { Modal } from "../../components/common/Modal";
import { getErrorMessage } from "../../api/client";
import { useToast } from "../../contexts/ToastContext";
import { systemSettingsApi } from "../../api/systemSettings.api";

const TOAST_DURATION = 4500;

type ToastType = "success" | "error" | "info";
type EmailModalMode = "edit" | "manual";

interface Toast {
  id: string;
  type: ToastType;
  message: string;
}

const toastStyles: Record<ToastType, { bg: string; border: string; text: string; icon: React.ReactNode }> = {
  success: {
    bg: "bg-emerald-50",
    border: "border-emerald-300",
    text: "text-emerald-900",
    icon: <CheckCircle size={18} className="shrink-0 text-emerald-600" />,
  },
  error: {
    bg: "bg-rose-50",
    border: "border-rose-300",
    text: "text-rose-900",
    icon: <AlertOctagon size={18} className="shrink-0 text-rose-600" />,
  },
  info: {
    bg: "bg-sky-50",
    border: "border-sky-300",
    text: "text-sky-900",
    icon: <Info size={18} className="shrink-0 text-sky-600" />,
  },
};

const normalizeEmailPreview = (
  pr: PurchaseRequest,
  preview: PurchaseRequestEmailPreview | null
): PurchaseRequestEmailPreview => ({
  to: pr.emailDraft?.to ?? preview?.to ?? preview?.emailTo ?? pr.emailTo ?? pr.supplierEmail ?? pr.supplier?.email,
  subject: pr.emailDraft?.subject ?? preview?.subject ?? preview?.emailSubject ?? pr.emailSubject,
  body: pr.emailDraft?.body ?? preview?.body ?? preview?.emailBody ?? pr.emailBody ?? pr.emailContent ?? pr.email_content,
  canSend: preview?.canSend,
  emailStatus:
    pr.emailDraft?.status ??
    preview?.emailStatus ??
    pr.emailStatus ??
    (pr.status === "SENT" || pr.emailSentAt || pr.sentAt ? "Đã gửi" : "Chưa gửi"),
  retryCount: preview?.retryCount ?? pr.retryCount,
  lastEmailError: preview?.lastEmailError ?? pr.lastEmailError,
  sentAt: preview?.sentAt ?? preview?.emailSentAt ?? pr.sentAt ?? pr.emailSentAt,
});

const getPrimaryProductName = (pr: PurchaseRequest): string =>
  pr.product?.name || pr.items?.[0]?.productName || "sản phẩm";

const getQuantityDisplay = (pr: PurchaseRequest): string => {
  const suggestedQty = pr.suggestedQuantity ?? pr.suggested_quantity ?? pr.items?.[0]?.quantity ?? 0;
  const purchaseQty = pr.purchaseQuantity ?? pr.items?.[0]?.purchaseQuantity;
  const purchaseUnit = pr.purchaseUnit ?? pr.items?.[0]?.purchaseUnit;
  const convertedQty = pr.convertedQuantity ?? pr.items?.[0]?.convertedQuantity ?? suggestedQty;
  const inventoryUnit =
    pr.inventoryUnit ?? pr.conversionTargetUnit ?? pr.items?.[0]?.inventoryUnit ?? pr.items?.[0]?.conversionTargetUnit;

  if (purchaseQty && purchaseUnit && inventoryUnit) {
    return `${purchaseQty} ${purchaseUnit} = ${convertedQty} ${inventoryUnit}`;
  }

  return `${suggestedQty}${inventoryUnit ? ` ${inventoryUnit}` : ""}`;
};

const buildManualEmailSubject = (pr: PurchaseRequest, storeName: string): string => {
  if ((pr.items?.length ?? 0) > 1) return `Yêu cầu báo giá/đặt hàng sản phẩm cho ${storeName}`;
  return `Yêu cầu báo giá/đặt hàng ${getPrimaryProductName(pr)} - ${getQuantityDisplay(pr)}`;
};

const buildManualEmailItemsList = (pr: PurchaseRequest): string => {
  if (!pr.items?.length) return `- ${getPrimaryProductName(pr)}: ${getQuantityDisplay(pr)}`;

  return pr.items
    .map((item) => {
      const inventoryUnit = item.inventoryUnit ?? item.conversionTargetUnit;
      if (item.purchaseQuantity && item.purchaseUnit && item.conversionQuantity && item.conversionTargetUnit) {
        return [
          `- ${item.productName}: ${item.purchaseQuantity} ${item.purchaseUnit} = ${item.convertedQuantity ?? item.quantity} ${inventoryUnit ?? item.conversionTargetUnit}`,
          `  Quy cách: 1 ${item.purchaseUnit} = ${item.conversionQuantity} ${item.conversionTargetUnit}`,
        ].join("\n");
      }

      return `- ${item.productName}: ${item.quantity}${inventoryUnit ? ` ${inventoryUnit}` : ""}`;
    })
    .join("\n");
};

const buildManualEmailBody = (pr: PurchaseRequest, storeName: string): string => {
  const supplierName = pr.supplier?.name || "nhà cung cấp";

  return `Kính gửi ${supplierName},

${storeName} đang có nhu cầu đặt hàng/báo giá cho các sản phẩm sau:

${buildManualEmailItemsList(pr)}

Vui lòng hỗ trợ xác nhận:
- Khả năng cung ứng
- Đơn giá hiện tại
- Thời gian giao hàng dự kiến
- Điều kiện thanh toán nếu có

Nếu có thay đổi về quy cách đóng gói, số lượng tối thiểu hoặc thời gian giao hàng, vui lòng phản hồi lại để chúng tôi xác nhận trước khi đặt hàng chính thức.

Trân trọng,
${storeName}`;
};

export const AdminPurchaseRequestDetailPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const globalToast = useToast();
  const [pr, setPr] = useState<PurchaseRequest | null>(null);
  const [emailPreview, setEmailPreview] = useState<PurchaseRequestEmailPreview | null>(null);
  const [manualEmailDraft, setManualEmailDraft] = useState<PurchaseRequestEmailPreview | null>(null);
  const [storeName, setStoreName] = useState("Cafe Admin");
  const [isLoading, setIsLoading] = useState(true);
  const [showConfirmApprove, setShowConfirmApprove] = useState(false);
  const [showConfirmReceive, setShowConfirmReceive] = useState(false);
  const [receivedQuantities, setReceivedQuantities] = useState<Record<string, number>>({});
  const [isReceiving, setIsReceiving] = useState(false);
  const [isApproving, setIsApproving] = useState(false);
  const [showRejectModal, setShowRejectModal] = useState(false);
  const [rejectReason, setRejectReason] = useState("");
  const [isRejecting, setIsRejecting] = useState(false);
  const [showEmailModal, setShowEmailModal] = useState(false);
  const [emailModalMode, setEmailModalMode] = useState<EmailModalMode>("edit");
  const [editEmailTo, setEditEmailTo] = useState("");
  const [editEmailSubject, setEditEmailSubject] = useState("");
  const [editEmailBody, setEditEmailBody] = useState("");
  const [isSendingEmail, setIsSendingEmail] = useState(false);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [suggestedSuppliers, setSuggestedSuppliers] = useState<any[]>([]);

  const removeToast = useCallback((toastId: string) => {
    setToasts((prev) => prev.filter((toast) => toast.id !== toastId));
  }, []);

  const showToast = useCallback(
    (toastId: string, type: ToastType, message: string, autoDismiss = true) => {
      setToasts((prev) => {
        const nextToast = { id: toastId, type, message };
        return prev.some((toast) => toast.id === toastId)
          ? prev.map((toast) => (toast.id === toastId ? nextToast : toast))
          : [...prev, nextToast];
      });

      if (autoDismiss) window.setTimeout(() => removeToast(toastId), TOAST_DURATION);
    },
    [removeToast]
  );

  const fetchEmailPreview = useCallback(
    async (request: PurchaseRequest) => {
      if (!id || (request.status !== "APPROVED" && request.status !== "SENT")) {
        setEmailPreview(null);
        return;
      }

      try {
        const preview = await purchaseRequestsApi.getEmailPreview(id);
        setEmailPreview(normalizeEmailPreview(request, preview));
      } catch {
        setEmailPreview(normalizeEmailPreview(request, null));
      }
    },
    [id]
  );

  const fetchPR = useCallback(async () => {
    if (!id) return;

    try {
      setIsLoading(true);
      const data = await purchaseRequestsApi.getPurchaseRequestById(id);
      setPr(data);
      await fetchEmailPreview(data);

      if (data.supplier?.status === 'INACTIVE' && data.items?.[0]?.productId) {
        try {
          const [supplierProducts, activeSuppliers] = await Promise.all([
            suppliersApi.getSupplierProducts(),
            suppliersApi.getSuppliers(),
          ]);
          const altSp = supplierProducts.filter((sp: any) => sp.productId === data.items![0].productId && sp.supplierId !== data.supplier?.id);
          const activeAltSp = altSp.filter((sp: any) => {
            const sup = activeSuppliers.find(s => s.id === sp.supplierId);
            return sup?.status === 'ACTIVE';
          });
          const mappedAlt = activeAltSp.map((sp: any) => {
            const sup = activeSuppliers.find(s => s.id === sp.supplierId);
            return {
              supplierId: sp.supplierId,
              supplierName: sup?.name,
              isPreferred: sp.isPreferred,
              leadTimeDays: sp.leadTimeDays ?? sp.leadTime,
              moq: sp.minOrderQuantity,
              purchasePrice: sp.price ?? sp.importPrice
            };
          }).sort((a: any, b: any) => {
            if (a.isPreferred && !b.isPreferred) return -1;
            if (!a.isPreferred && b.isPreferred) return 1;
            if (a.leadTimeDays !== b.leadTimeDays) return a.leadTimeDays - b.leadTimeDays;
            return a.purchasePrice - b.purchasePrice;
          });
          setSuggestedSuppliers(mappedAlt);
        } catch (e) {
          // Ignore error silently
        }
      }
    } catch {
      showToast("load-detail", "error", "Không thể tải chi tiết yêu cầu.");
      setPr(null);
      setEmailPreview(null);
    } finally {
      setIsLoading(false);
    }
  }, [fetchEmailPreview, id, showToast]);

  useEffect(() => {
    fetchPR();
    systemSettingsApi.getSetting('store.name').then(setting => {
      if (setting && setting.value) {
        setStoreName(setting.value);
      }
    }).catch(console.error);
  }, [fetchPR]);

  const emailDraft = useMemo(() => {
    if (!pr) return null;
    return manualEmailDraft ?? normalizeEmailPreview(pr, emailPreview);
  }, [emailPreview, manualEmailDraft, pr]);

  const handleApprove = async () => {
    if (!id) return;

    setIsApproving(true);
    showToast("approve", "info", "Đang duyệt yêu cầu...", false);

    try {
      const updated = await purchaseRequestsApi.approvePurchaseRequest(id);
      setPr(updated);
      showToast("approve", "success", "Đã duyệt yêu cầu nhập hàng. Bạn có thể gửi email cho nhà cung cấp.");
      await fetchEmailPreview(updated);
    } catch (err: any) {
      showToast("approve", "error", getErrorMessage(err) || "Không thể duyệt yêu cầu, vui lòng thử lại.");
    } finally {
      setIsApproving(false);
      setShowConfirmApprove(false);
    }
  };

  const openReceiveModal = () => {
    const init: Record<string, number> = {};
    pr?.items?.forEach(item => {
      const remaining = (item.quantity || 0) - (item.quantityReceived || 0);
      init[item.id] = remaining > 0 ? remaining : 0;
    });
    setReceivedQuantities(init);
    setShowConfirmReceive(true);
  };

  const handleReceive = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    setIsReceiving(true);
    try {
      const items = pr?.items?.map((item: any) => ({
        purchaseRequestItemId: item.id,
        receivedQuantity: receivedQuantities[item.id] || 0
      })) || [];
      const res = await purchaseRequestsApi.receivePurchaseRequest(id!, {
        notes: "Admin nhận hàng",
        items
      });
      
      const productName = pr ? getPrimaryProductName(pr) : "Sản phẩm";

      if (res.purchaseRequest.status === "RECEIVED") {
         showToast("receive", "success", "Nhận hàng thành công. Tồn kho đã được cập nhật.");
         globalToast.success("Đã nhận đủ hàng", `Đã cập nhật tồn kho cho sản phẩm ${productName}.`, `/admin/purchase-requests/${id}`);
      } else {
         showToast("receive", "success", "Đã nhận một phần. Tồn kho đã cộng.");
         globalToast.success("Đã nhận một phần", `Tồn kho đã cộng cho sản phẩm ${productName}.`, `/admin/purchase-requests/${id}`);
      }

      if (!res.isStockSafe) {
         globalToast.warning("Tồn kho vẫn thấp", `Sản phẩm ${productName} vẫn dưới ngưỡng an toàn.`, `/admin/purchase-requests/${id}`);
      }

      fetchPR();
      setShowConfirmReceive(false);
    } catch (err: any) {
      showToast("receive", "error", getErrorMessage(err) || "Không thể nhận hàng.");
    } finally {
      setIsReceiving(false);
    }
  };

  const handleReject = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!id || !rejectReason.trim()) return;

    setIsRejecting(true);

    try {
      const updated = await purchaseRequestsApi.rejectPurchaseRequest(id, { reason: rejectReason.trim() });
      setPr(updated);
      setShowRejectModal(false);
      setRejectReason("");
      setEmailPreview(null);
      showToast("reject", "success", isPending ? "Từ chối yêu cầu thành công." : "Huỷ yêu cầu thành công.");
    } catch (err: any) {
      showToast("reject", "error", getErrorMessage(err) || (isPending ? "Không thể từ chối yêu cầu, vui lòng thử lại." : "Không thể huỷ yêu cầu, vui lòng thử lại."));
    } finally {
      setIsRejecting(false);
    }
  };

  const openEmailModal = (mode: EmailModalMode = "edit") => {
    if (!pr) return;

    setEmailModalMode(mode);
    setEditEmailTo(emailDraft?.to || pr.supplier?.email || "");
    setEditEmailSubject(emailDraft?.subject?.trim() || buildManualEmailSubject(pr, storeName));
    setEditEmailBody(emailDraft?.body?.trim() || buildManualEmailBody(pr, storeName));
    setShowEmailModal(true);
  };

  const handleEmailModalSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!id || !pr) return;

    if (!editEmailTo.trim()) {
      showToast("send-email", "error", "Vui lòng nhập email người nhận.");
      return;
    }
    if (!editEmailSubject.trim()) {
      showToast("send-email", "error", "Vui lòng nhập tiêu đề email.");
      return;
    }
    if (!editEmailBody.trim()) {
      showToast("send-email", "error", "Vui lòng nhập nội dung email.");
      return;
    }

    if (!canSendEmail) {
      setManualEmailDraft({
        to: editEmailTo.trim(),
        subject: editEmailSubject.trim(),
        body: editEmailBody.trim(),
        emailStatus: emailDraft?.emailStatus || "Chưa gửi",
      });
      setShowEmailModal(false);
      showToast("send-email", "info", "Đã lưu tạm nội dung email trên màn hình. Chỉ yêu cầu đã duyệt và chưa gửi mới được gửi email.");
      return;
    }

    setIsSendingEmail(true);
    showToast("send-email", "info", "Đang gửi email đặt hàng...", false);

    try {
      const updated = await purchaseRequestsApi.sendEmail(id, {
        to: editEmailTo.trim(),
        subject: editEmailSubject.trim(),
        body: editEmailBody.trim(),
      });
      setPr((current) =>
        current
          ? {
              ...current,
              ...updated,
              supplier: updated.supplier ?? current.supplier,
              items: updated.items ?? current.items,
              product: updated.product ?? current.product,
              emailDraft: {
                to: editEmailTo.trim(),
                subject: editEmailSubject.trim(),
                body: editEmailBody.trim(),
                status: "Đã gửi",
              },
            }
          : updated
      );
      setManualEmailDraft(null);
      setShowEmailModal(false);
      showToast("send-email", "success", "Gửi email đặt hàng thành công.");
      await fetchEmailPreview(updated);
    } catch (err: any) {
      showToast("send-email", "error", getErrorMessage(err) || "Không thể gửi email đặt hàng, vui lòng thử lại.");
    } finally {
      setIsSendingEmail(false);
    }
  };

  if (isLoading) return <Loading message="Đang tải chi tiết yêu cầu..." />;

  if (!pr) {
    return (
      <div className="mx-auto my-12 max-w-xl rounded-xl border border-slate-200 bg-slate-50 p-8 text-center">
        <ToastContainer toasts={toasts} onClose={removeToast} />
        <p className="font-semibold text-slate-700">Yêu cầu không tồn tại.</p>
        <Link to="/admin/purchase-requests" className="mt-4 inline-block">
          <Button variant="outline">Quay lại danh sách</Button>
        </Link>
      </div>
    );
  }

  const isPending = pr.status === "PENDING";
  const isApproved = pr.status === "APPROVED";
  const isRejected = pr.status === "REJECTED";
  const isSent = pr.status === "SENT" || emailDraft?.emailStatus === "SENT" || emailDraft?.emailStatus === "Đã gửi";
  const hasUsableEmailDraft = Boolean(emailDraft?.subject?.trim()) && Boolean(emailDraft?.body?.trim());
  const canSendEmail = isApproved && !isSent && pr.supplier?.status !== "INACTIVE";
  const canEditEmailDraft = hasUsableEmailDraft;
  const canInputManualEmail = !hasUsableEmailDraft && !isRejected && !isSent;
  const canShowEmailBlock =
    canEditEmailDraft ||
    canInputManualEmail ||
    Boolean(emailDraft?.to || emailDraft?.subject || emailDraft?.body || emailDraft?.emailStatus);
  const createdDate = pr.createdAt || pr.created_at || "";
  const aiReasonText = pr.agentExplanation || pr.displayReasoning || pr.aiReason || pr.ai_reason || pr.reason || "AI Agent đề xuất nhập hàng dựa trên hao hụt kho.";
  const suggestedQty = pr.suggestedQuantity ?? pr.suggested_quantity ?? 0;
  const invUnit = pr.inventoryUnit ?? pr.conversionTargetUnit;
  const hasPurchaseConversion = Boolean(pr.purchaseQuantity && pr.purchaseUnit && invUnit);

  const supplierEmail = pr.supplier?.email?.trim() || "";
  const isSupplierEmailEmpty = !supplierEmail;
  const isSupplierEmailInvalid = !isSupplierEmailEmpty && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(supplierEmail);
  const hasEmailError = isSupplierEmailEmpty || isSupplierEmailInvalid;
  const emailErrorMessage = isSupplierEmailEmpty 
    ? "Nhà cung cấp chưa có email. Vui lòng cập nhật email nhà cung cấp trước khi gửi." 
    : "Email nhà cung cấp không hợp lệ.";

  const isPendingDelete = pr.items?.some(item => !!item.productPendingDelete);

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-6">
      <ToastContainer toasts={toasts} onClose={removeToast} />

      <Link
        to="/admin/purchase-requests"
        className="inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-900"
      >
        <ArrowLeft size={16} /> Quay lại danh sách yêu cầu
      </Link>

      <div className="flex flex-col gap-6 rounded-3xl border border-slate-100 bg-white p-6 shadow-sm sm:p-8">
        <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-100 pb-4">
          <div>
            <h3 className="text-lg font-black text-slate-800">Yêu cầu nhập hàng #{pr.id.slice(-8).toUpperCase()}</h3>
            <span className="mt-1 block text-xs text-slate-400">
              Ngày đề xuất: {createdDate ? formatDate(createdDate) : ""}
            </span>
          </div>
          <div className="flex items-center gap-3">
            {isPendingDelete && (
              <span className="rounded-full border border-rose-200 bg-rose-50 px-3 py-1 text-xs font-bold text-rose-700">
                Sản phẩm chờ xoá
              </span>
            )}
            <span className={`rounded-full px-2.5 py-0.5 text-xs font-bold shadow-sm ${
              pr.status === "COMPLETED" ? "bg-emerald-100 text-emerald-800 border border-emerald-200" :
              pr.status === "RECEIVED" ? "bg-emerald-50 text-emerald-700 border border-emerald-200" :
              pr.status === "REJECTED" || (pr.status as string) === "CANCELLED" ? "bg-rose-50 text-rose-700 border border-rose-200" :
              pr.status === "SENT" ? ((pr.items?.[0]?.quantityReceived || 0) > 0 ? "bg-indigo-50 text-indigo-700 border border-indigo-200" : "bg-blue-50 text-blue-700 border border-blue-200") :
              pr.status === "APPROVED" ? "bg-indigo-50 text-indigo-700 border border-indigo-200" :
              "bg-amber-100 text-amber-800 border border-amber-200"
            }`}>
              {pr.status === "COMPLETED" ? "Hoàn thành" : 
               pr.status === "RECEIVED" ? "Đã nhận hàng" : 
               pr.status === "REJECTED" || (pr.status as string) === "CANCELLED" ? "Đã huỷ/Từ chối" :
               pr.status === "SENT" ? ((pr.items?.[0]?.quantityReceived || 0) > 0 ? "Đã nhận một phần" : "Đã gửi email") : 
               pr.status === "APPROVED" ? "Đã duyệt" : 
               "Chờ duyệt"}
            </span>
            {isSent && pr.status !== "RECEIVED" && pr.status !== "COMPLETED" && !isPendingDelete && (
                <Button onClick={openReceiveModal} className="border-none bg-emerald-600 text-white hover:bg-emerald-700">
                  <PackageCheck size={14} className="mr-1.5" /> Đã nhận hàng
                </Button>
            )}
          </div>
        </div>

        {isPendingDelete && (
          <div className="flex items-start gap-2 rounded-lg bg-rose-50 border border-rose-200 px-4 py-3 text-sm font-medium text-rose-700 w-full mb-4">
            <AlertTriangle size={18} className="shrink-0 mt-0.5" />
            <div className="flex-1">
              <span className="block mb-1 text-base font-bold">Sản phẩm đang chờ xoá</span>
              <span className="block mb-2">Không thể tiếp tục xử lý yêu cầu nhập hàng vì sản phẩm đang chờ xoá. Vui lòng khôi phục sản phẩm hoặc huỷ/từ chối yêu cầu này.</span>
              <Link to="/admin/products" className="underline font-bold hover:text-rose-800">
                Khôi phục sản phẩm hoặc huỷ yêu cầu nhập hàng.
              </Link>
            </div>
          </div>
        )}

        <div className="grid grid-cols-2 gap-4 text-center sm:grid-cols-3">
          <div className="rounded-xl border border-slate-100 bg-slate-50 p-4">
            <span className="block text-[10px] font-bold uppercase tracking-wider text-slate-400">Sản phẩm đề xuất</span>
            <strong className="mt-1 block truncate text-sm text-slate-800">{getPrimaryProductName(pr)}</strong>
          </div>

          <div className="rounded-xl border border-amber-100 bg-amber-50/50 p-4">
            <span className="block text-[10px] font-bold uppercase tracking-wider text-amber-800">
              Số lượng đề xuất nhập
            </span>
            {hasPurchaseConversion ? (
              <>
                <strong className="mt-0.5 block text-lg text-amber-900">
                  {pr.purchaseQuantity} {pr.purchaseUnit}
                </strong>
                <span className="mt-0.5 block text-xs font-semibold text-slate-500">
                  = {pr.convertedQuantity ?? suggestedQty} {invUnit}
                </span>
              </>
            ) : (
              <strong className="mt-0.5 block text-lg text-amber-900">{getQuantityDisplay(pr)}</strong>
            )}
          </div>

          <div className="col-span-2 rounded-xl border border-slate-100 bg-slate-50 p-4 sm:col-span-1">
            <span className="block text-[10px] font-bold uppercase tracking-wider text-slate-400">Nhà cung cấp đề xuất</span>
            <strong className="mt-1 block truncate text-sm text-slate-800">{pr.supplier?.name || "Chưa chọn"}</strong>
          </div>
        </div>

        {pr.items && pr.items.length > 0 && (
          <div className="overflow-hidden rounded-2xl border border-slate-100">
            <div className="border-b border-slate-100 bg-slate-50 px-5 py-3">
              <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500">Danh sách sản phẩm</h4>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-100 text-left">
                    <th className="px-5 py-3 text-[11px] font-bold uppercase tracking-wider text-slate-400">Sản phẩm</th>
                    <th className="px-5 py-3 text-right text-[11px] font-bold uppercase tracking-wider text-slate-400">SL đề xuất</th>
                    <th className="px-5 py-3 text-right text-[11px] font-bold uppercase tracking-wider text-slate-400">Đơn giá</th>
                    <th className="px-5 py-3 text-right text-[11px] font-bold uppercase tracking-wider text-slate-400">Thành tiền</th>
                  </tr>
                </thead>
                <tbody>
                  {pr.items.map((item) => {
                    const hasConv = Boolean(item.purchaseQuantity && item.purchaseUnit && item.inventoryUnit);
                    const itemInvUnit = item.inventoryUnit ?? item.conversionTargetUnit;
                    return (
                      <tr key={item.id} className="border-b border-slate-50 transition-colors hover:bg-slate-50/60">
                        <td className="px-5 py-3">
                          <span className="font-semibold text-slate-800">{item.productName}</span>
                          {item.productSku && <span className="ml-2 font-mono text-[11px] text-slate-400">{item.productSku}</span>}
                        </td>
                        <td className="px-5 py-3 text-right">
                          {hasConv ? (
                            <div className="flex flex-col items-end gap-0.5">
                              <span className="font-bold text-amber-800">
                                {item.purchaseQuantity} {item.purchaseUnit}
                              </span>
                              <span className="text-[11px] text-slate-500">
                                = {item.convertedQuantity ?? item.quantity} {itemInvUnit}
                              </span>
                            </div>
                          ) : (
                            <span className="font-bold text-amber-800">
                              {item.quantity}
                              {itemInvUnit ? ` ${itemInvUnit}` : ""}
                            </span>
                          )}
                        </td>
                        <td className="px-5 py-3 text-right text-slate-600">
                          {item.unitPrice != null ? `${item.unitPrice.toLocaleString("vi-VN")} đ` : "-"}
                        </td>
                        <td className="px-5 py-3 text-right font-semibold text-slate-800">
                          {item.subtotal != null
                            ? `${item.subtotal.toLocaleString("vi-VN")} đ`
                            : item.unitPrice != null
                            ? `${(item.quantity * item.unitPrice).toLocaleString("vi-VN")} đ`
                            : "-"}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}

        <div className="space-y-2 rounded-2xl border border-amber-700/10 bg-amber-50/40 p-5">
          <h4 className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-amber-800">
            <Sparkles size={14} className="text-amber-800" /> Giải thích lý do từ AI Agent
          </h4>
          <p className="whitespace-pre-line text-xs leading-relaxed text-slate-600 sm:text-sm">{aiReasonText}</p>
        </div>



        {pr.supplier?.status === 'INACTIVE' && (
          <div className="rounded-xl border border-rose-200 bg-rose-50 p-4 mb-2 flex items-start gap-3 mt-4">
            <Ban className="text-rose-500 shrink-0 mt-0.5" size={20} />
            <div>
              <h4 className="font-bold text-rose-800 text-sm">Nhà cung cấp đã ngừng hoạt động</h4>
              <p className="text-rose-700 text-sm mt-1">
                Nhà cung cấp của yêu cầu này hiện đã bị tắt. Mở lại nhà cung cấp, đổi nhà cung cấp hoặc từ chối yêu cầu này.
              </p>
            </div>
          </div>
        )}

        {pr.supplier?.status === 'INACTIVE' && (
          <div className="rounded-xl border border-blue-200 bg-blue-50 p-4 mb-2 mt-2">
            <div className="flex items-center gap-2 mb-3">
              <Sparkles className="text-blue-600" size={18} />
              <h4 className="font-bold text-blue-900 text-sm">AI Agent đề xuất nhà cung cấp thay thế</h4>
            </div>
            
            {suggestedSuppliers.length > 0 ? (
              <div className="space-y-3">
                {suggestedSuppliers.map((sp: any, idx: number) => (
                  <div key={idx} className="flex items-center justify-between bg-white border border-blue-100 rounded-lg p-3">
                    <div>
                      <strong className="block text-sm text-slate-800 flex items-center gap-2">
                        {sp.supplierName}
                        {sp.isPreferred && <span className="px-1.5 py-0.5 bg-blue-100 text-blue-700 text-[10px] font-bold rounded uppercase">Ưu tiên</span>}
                      </strong>
                      <div className="flex items-center gap-4 mt-1 text-xs text-slate-500">
                        {sp.purchasePrice > 0 && <span>Giá nhập: <strong className="text-slate-700">{sp.purchasePrice.toLocaleString()}đ</strong></span>}
                        {sp.leadTimeDays > 0 && <span>Giao hàng: <strong className="text-slate-700">{sp.leadTimeDays} ngày</strong></span>}
                        {sp.moq > 0 && <span>MOQ: <strong className="text-slate-700">{sp.moq}</strong></span>}
                      </div>
                    </div>
                    <div className="text-right">
                      <span className="text-[10px] text-slate-400 block mb-1">Đổi nhà cung cấp chưa hỗ trợ tự động</span>
                    </div>
                  </div>
                ))}
                <p className="text-xs text-blue-800 mt-2 bg-blue-100/50 p-2 rounded">
                  Chức năng đổi nhà cung cấp trực tiếp chưa được bật. Admin có thể huỷ yêu cầu cũ và tạo yêu cầu mới với nhà cung cấp đang hoạt động ở mục Quản lý tồn kho.
                </p>
              </div>
            ) : (
              <p className="text-sm text-blue-800">
                Không có nhà cung cấp đang hoạt động thay thế. Vui lòng mở lại nhà cung cấp hiện tại hoặc gán thêm nhà cung cấp mới cho sản phẩm này.
              </p>
            )}
          </div>
        )}

        {canShowEmailBlock && (
          <div className="overflow-hidden rounded-2xl border border-slate-200">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 bg-slate-50 px-5 py-3">
              <h4 className="flex items-center gap-2 text-sm font-bold text-slate-800">
                <Mail size={16} className="text-amber-800" /> {hasUsableEmailDraft ? "Email đặt hàng do Agent đề xuất" : "Email đặt hàng"}
              </h4>
              {(canEditEmailDraft || canInputManualEmail) && (
                <div className="flex flex-wrap gap-2 w-full sm:w-auto">
                  {canEditEmailDraft ? (
                    <>
                      {isPendingDelete ? (
                        <Button
                          variant="outline"
                          disabled
                          title="Không thể gửi email vì sản phẩm đang chờ xoá."
                          className="flex-1 sm:flex-none opacity-50 cursor-not-allowed bg-rose-100 text-rose-800 border-rose-200"
                        >
                          Gửi email (Chờ xoá)
                        </Button>
                      ) : pr.supplier?.status === "INACTIVE" ? (
                        <Button
                          variant="primary"
                          disabled
                          title="Không thể gửi email vì nhà cung cấp đang bị tắt."
                          className="flex-1 sm:flex-none opacity-50 cursor-not-allowed"
                        >
                          Gửi email (Đã tắt)
                        </Button>
                      ) : hasEmailError ? (
                        <Button
                          variant="primary"
                          disabled
                          title={emailErrorMessage}
                          className="flex-1 sm:flex-none opacity-50 cursor-not-allowed bg-rose-100 text-rose-800 border-rose-200"
                        >
                          Gửi email (Lỗi Email)
                        </Button>
                      ) : (
                        <Button
                          variant="primary"
                          onClick={() => openEmailModal(canEditEmailDraft ? "edit" : "manual")}
                          className="flex-1 sm:flex-none"
                        >
                          {canEditEmailDraft ? "Xem & Gửi email" : "Gửi email cho nhà cung cấp"}
                        </Button>
                      )}
                    </>
                  ) : (
                    <Button size="sm" variant="outline" onClick={() => openEmailModal("manual")}>
                      Nhập email thủ công
                    </Button>
                  )}
                </div>
              )}
              {isSent && (
                <span className="rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-bold text-emerald-700">
                  Đã gửi email
                </span>
              )}
              {hasEmailError && (
                 <div className="flex items-start gap-2 rounded-lg bg-rose-50 border border-rose-200 px-3 py-2 text-xs font-medium text-rose-700 mt-2 w-full">
                    <AlertTriangle size={14} className="shrink-0 mt-0.5" />
                    <div className="flex-1">
                      <span className="block mb-1">{emailErrorMessage}</span>
                      <Link to="/admin/suppliers" className="underline font-bold hover:text-rose-800">Cập nhật email nhà cung cấp tại đây</Link>
                    </div>
                 </div>
              )}
            </div>

            <div className="grid gap-4 p-5 text-sm">
              {hasUsableEmailDraft && emailDraft ? (
                <>
                  <EmailField label="Người nhận" value={emailDraft.to || "Nhà cung cấp chưa có email."} />
                  <EmailField label="Tiêu đề" value={emailDraft.subject || "Chưa có email đề xuất."} />
                  <EmailField label="Trạng thái email" value={emailDraft.emailStatus || "Chưa gửi"} />
                  {emailDraft.sentAt && <EmailField label="Thời gian gửi" value={formatDate(emailDraft.sentAt)} />}
                  {emailDraft.lastEmailError && <EmailField label="Lỗi gửi gần nhất" value={emailDraft.lastEmailError} />}
                  {isPending && (
                    <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm font-medium text-amber-900">
                      Cần duyệt yêu cầu trước khi gửi email cho nhà cung cấp.
                    </div>
                  )}
                  <div>
                    <span className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-slate-400">
                      Nội dung email
                    </span>
                    <div className="whitespace-pre-wrap rounded-xl border border-slate-200 bg-slate-50 p-4 font-mono text-xs leading-relaxed text-slate-700">
                      {emailDraft.body}
                    </div>
                  </div>
                </>
              ) : (
                <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm font-medium text-amber-900">
                  Chưa có email đề xuất. Admin có thể nhập email thủ công trước khi gửi.
                </div>
              )}
            </div>
          </div>
        )}

        {(isPending || isApproved || isSent) && (
          <div className="mt-4 flex flex-wrap justify-end gap-3.5 border-t border-slate-100 pt-6">
            <Button onClick={() => setShowRejectModal(true)} variant="outline" className="border-rose-200 text-rose-600 hover:bg-rose-50">
              <Ban size={14} className="mr-1.5" /> {isPending ? "Từ chối yêu cầu" : "Huỷ yêu cầu"}
            </Button>
            {isPending && (
              isPendingDelete ? (
                <Button disabled className="border-none bg-slate-300 text-slate-500 cursor-not-allowed" title="Không thể duyệt yêu cầu vì sản phẩm đang chờ xoá.">
                  <CheckCircle size={14} className="mr-1.5" /> Duyệt yêu cầu (Chờ xoá)
                </Button>
              ) : pr.supplier?.status === 'INACTIVE' ? (
                <Button disabled className="border-none bg-slate-300 text-slate-500 cursor-not-allowed" title="Nhà cung cấp của yêu cầu này đang bị tắt. Vui lòng mở lại nhà cung cấp hoặc đổi sang nhà cung cấp khác trước khi duyệt.">
                  <CheckCircle size={14} className="mr-1.5" /> Duyệt yêu cầu (Đã tắt)
                </Button>
              ) : (
                <Button onClick={() => setShowConfirmApprove(true)} className="border-none bg-amber-800 text-white hover:bg-amber-900">
                  <CheckCircle size={14} className="mr-1.5" /> Duyệt yêu cầu
                </Button>
              )
            )}
          </div>
        )}


      </div>

      {showConfirmReceive && (
        <Modal isOpen={true} onClose={() => setShowConfirmReceive(false)} title="Xác nhận đã nhận hàng" size="md">
          <form onSubmit={handleReceive} className="space-y-4">
            {pr?.items?.map(item => {
              const total = item.quantity || 0;
              const received = item.quantityReceived || 0;
              const remaining = total - received;
              const invUnit = item.inventoryUnit ?? item.conversionTargetUnit ?? "Đơn vị";

              return (
                <div key={item.id} className="mb-4">
                  <div className="bg-white p-3 rounded-lg border border-slate-200 text-sm mb-3">
                    <div className="grid grid-cols-[130px_1fr] gap-y-2 items-center">
                      <span className="text-slate-500">Sản phẩm:</span>
                      <span className="font-medium">{item.productName || "Sản phẩm"}</span>
                      
                      <span className="text-slate-500">Nhà cung cấp:</span>
                      <span className="font-medium">{pr?.supplier?.name}</span>
                      
                      <span className="text-slate-500">Yêu cầu nhập:</span>
                      <span className="font-medium">{(pr?.purchaseQuantity ?? item.purchaseQuantity) || (pr?.suggestedQuantity ?? total)} {(pr?.purchaseUnit ?? item.purchaseUnit) || invUnit}</span>

                      {Boolean(item.purchaseQuantity && item.purchaseUnit && item.inventoryUnit) && (
                        <>
                          <span className="text-slate-500">Quy cách:</span>
                          <span className="font-medium">1 {item.purchaseUnit} = {item.conversionQuantity} {invUnit}</span>
                        </>
                      )}
                      
                      <span className="text-slate-500">Tổng cần nhập kho:</span>
                      <span className="font-medium">{total} {invUnit}</span>

                      <span className="text-slate-500">Đã nhận:</span>
                      <span className="font-medium text-emerald-600">{received} {invUnit}</span>

                      <span className="text-slate-500">Còn lại:</span>
                      <span className="font-medium text-amber-600">{remaining} {invUnit}</span>
                    </div>
                  </div>

                  {remaining > 0 ? (
                    <div>
                      <label className="mb-1.5 block text-sm font-medium text-slate-700">Số lượng thực nhận ({invUnit})</label>
                      <input
                        type="number"
                        min="1"
                        max={remaining}
                        value={receivedQuantities[item.id] === undefined ? "" : receivedQuantities[item.id]}
                        onChange={(e) => setReceivedQuantities({ ...receivedQuantities, [item.id]: parseInt(e.target.value) || 0 })}
                        className="block w-full rounded-lg border border-slate-300 px-3.5 py-2.5 text-sm outline-none focus:border-amber-700 focus:ring-2 focus:ring-amber-700/20"
                        required
                      />
                    </div>
                  ) : (
                    <div className="p-2 bg-emerald-50 text-emerald-700 text-sm rounded-lg border border-emerald-200">
                      Sản phẩm này đã được nhận đủ.
                    </div>
                  )}
                </div>
              );
            })}

            <div className="flex justify-end gap-2 border-t border-slate-100 pt-3">
              <Button type="button" variant="outline" onClick={() => setShowConfirmReceive(false)}>
                Hủy
              </Button>
              <Button type="submit" variant="primary" className="bg-emerald-600 hover:bg-emerald-700 text-white border-none" isLoading={isReceiving}>
                Xác nhận nhận hàng
              </Button>
            </div>
          </form>
        </Modal>
      )}

      <ConfirmDialog
        isOpen={showConfirmApprove}
        onClose={() => setShowConfirmApprove(false)}
        onConfirm={handleApprove}
        title="Duyệt yêu cầu nhập hàng"
        message="Sau khi duyệt, hệ thống sẽ hiển thị email đặt hàng để admin xem lại trước khi gửi."
        confirmText="Duyệt yêu cầu"
        cancelText="Hủy"
        type="info"
        isLoading={isApproving}
      />

      {showRejectModal && (
        <Modal isOpen={true} onClose={() => setShowRejectModal(false)} title={isPending ? "Lý do từ chối yêu cầu nhập hàng" : "Lý do huỷ yêu cầu nhập hàng"} size="sm">
          <form onSubmit={handleReject} className="space-y-4">
            <div>
              <label className="mb-1.5 block text-sm font-medium text-slate-700">{isPending ? "Lý do từ chối" : "Lý do huỷ"}</label>
              <textarea
                rows={3}
                placeholder="Vd: Không cần nhập thêm vì còn hàng trong kho phụ..."
                value={rejectReason}
                onChange={(e) => setRejectReason(e.target.value)}
                className="block w-full rounded-lg border border-slate-300 px-3.5 py-2.5 text-sm outline-none focus:border-amber-700 focus:ring-2 focus:ring-amber-700/20"
                required
              />
            </div>

            <div className="flex justify-end gap-2 border-t border-slate-100 pt-3">
              <Button type="button" variant="outline" onClick={() => setShowRejectModal(false)}>
                Hủy
              </Button>
              <Button type="submit" variant="danger" isLoading={isRejecting}>
                {isPending ? "Xác nhận từ chối" : "Xác nhận huỷ"}
              </Button>
            </div>
          </form>
        </Modal>
      )}

      {showEmailModal && (
        <Modal
          isOpen={true}
          onClose={() => setShowEmailModal(false)}
          title={emailModalMode === "manual" ? "Nhập email thủ công" : "Kiểm tra email đặt hàng"}
          size="lg"
        >
          <form onSubmit={handleEmailModalSubmit} className="space-y-4">
            {!canSendEmail && (
              <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm font-medium text-amber-900">
                Chỉ yêu cầu đã duyệt và chưa gửi mới được gửi email cho nhà cung cấp.
              </div>
            )}

            <div>
              <label className="mb-1.5 block text-sm font-medium text-slate-700">Người nhận</label>
              <input
                type="email"
                value={editEmailTo}
                onChange={(e) => setEditEmailTo(e.target.value)}
                className="block w-full rounded-lg border border-slate-300 px-3.5 py-2.5 text-sm outline-none focus:border-amber-700 focus:ring-2 focus:ring-amber-700/20"
                placeholder="supplier@example.com"
                required
              />
            </div>

            <div>
              <label className="mb-1.5 block text-sm font-medium text-slate-700">Tiêu đề</label>
              <input
                type="text"
                value={editEmailSubject}
                onChange={(e) => setEditEmailSubject(e.target.value)}
                className="block w-full rounded-lg border border-slate-300 px-3.5 py-2.5 text-sm outline-none focus:border-amber-700 focus:ring-2 focus:ring-amber-700/20"
                required
              />
            </div>

            <div>
              <label className="mb-1.5 block text-sm font-medium text-slate-700">Nội dung</label>
              <textarea
                rows={12}
                value={editEmailBody}
                onChange={(e) => setEditEmailBody(e.target.value)}
                className="block w-full rounded-lg border border-slate-300 px-3.5 py-2.5 font-mono text-sm leading-relaxed outline-none focus:border-amber-700 focus:ring-2 focus:ring-amber-700/20"
                required
              />
            </div>

            <div className="flex justify-end gap-2 border-t border-slate-100 pt-3">
              <Button type="button" variant="outline" onClick={() => setShowEmailModal(false)}>
                Đóng
              </Button>
              <Button type="submit" isLoading={isSendingEmail}>
                {canSendEmail ? (
                  <>
                    <Send size={14} className="mr-1.5" /> Xác nhận gửi
                  </>
                ) : (
                  "Lưu tạm trên màn hình"
                )}
              </Button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
};

const EmailField: React.FC<{ label: string; value: string }> = ({ label, value }) => (
  <div>
    <span className="mb-1 block text-xs font-bold uppercase tracking-wider text-slate-400">{label}</span>
    <span className="break-words font-semibold text-slate-800">{value}</span>
  </div>
);

const ToastContainer: React.FC<{ toasts: Toast[]; onClose: (id: string) => void }> = ({ toasts, onClose }) => {
  if (toasts.length === 0) return null;

  return (
    <div className="fixed right-4 top-4 z-50 flex w-[min(360px,calc(100vw-2rem))] flex-col gap-3">
      {toasts.map((toast) => {
        const style = toastStyles[toast.type];
        return (
          <div
            key={toast.id}
            className={`flex items-start gap-3 rounded-xl border ${style.border} ${style.bg} ${style.text} px-4 py-3 text-sm font-medium shadow-lg`}
          >
            {style.icon}
            <span className="flex-1">{toast.message}</span>
            <button
              type="button"
              onClick={() => onClose(toast.id)}
              className="rounded-md p-0.5 opacity-70 transition hover:bg-white/60 hover:opacity-100"
              aria-label="Đóng thông báo"
            >
              <X size={16} />
            </button>
          </div>
        );
      })}
    </div>
  );
};

