import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { purchaseRequestsApi } from "../../api/purchaseRequests.api";
import type { PurchaseRequest, PurchaseRequestEmailPreview } from "../../types/purchaseRequest.types";
import { formatDate } from "../../utils/formatDate";
import { Badge } from "../../components/common/Badge";
import { Loading } from "../../components/common/Loading";
import { Button } from "../../components/common/Button";
import { ConfirmDialog } from "../../components/common/ConfirmDialog";
import { Modal } from "../../components/common/Modal";
import {
  AlertOctagon,
  ArrowLeft,
  Ban,
  CheckCircle,
  Info,
  Mail,
  Send,
  Sparkles,
  X,
} from "lucide-react";
import { getErrorMessage } from "../../api/client";

const TOAST_DURATION = 4500;

type ToastType = "success" | "error" | "info";

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
  to: preview?.to ?? preview?.emailTo ?? pr.emailTo ?? pr.supplierEmail ?? pr.supplier?.email,
  subject: preview?.subject ?? preview?.emailSubject ?? pr.emailSubject,
  body: preview?.body ?? preview?.emailBody ?? pr.emailBody ?? pr.emailContent ?? pr.email_content,
  canSend: preview?.canSend,
  emailStatus:
    preview?.emailStatus ??
    pr.emailStatus ??
    (pr.status === "SENT" || pr.emailSentAt || pr.sentAt ? "SENT" : pr.status === "APPROVED" ? "PENDING" : undefined),
  retryCount: preview?.retryCount ?? pr.retryCount,
  lastEmailError: preview?.lastEmailError ?? pr.lastEmailError,
  sentAt: preview?.sentAt ?? preview?.emailSentAt ?? pr.sentAt ?? pr.emailSentAt,
});

export const AdminPurchaseRequestDetailPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const [pr, setPr] = useState<PurchaseRequest | null>(null);
  const [emailPreview, setEmailPreview] = useState<PurchaseRequestEmailPreview | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [showConfirmApprove, setShowConfirmApprove] = useState(false);
  const [isApproving, setIsApproving] = useState(false);
  const [showRejectModal, setShowRejectModal] = useState(false);
  const [rejectReason, setRejectReason] = useState("");
  const [isRejecting, setIsRejecting] = useState(false);
  const [isSendingEmail, setIsSendingEmail] = useState(false);
  const [toasts, setToasts] = useState<Toast[]>([]);

  const removeToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((toast) => toast.id !== id));
  }, []);

  const showToast = useCallback(
    (id: string, type: ToastType, message: string, autoDismiss = true) => {
      setToasts((prev) => {
        const nextToast = { id, type, message };
        const exists = prev.some((toast) => toast.id === id);
        return exists ? prev.map((toast) => (toast.id === id ? nextToast : toast)) : [...prev, nextToast];
      });

      if (autoDismiss) {
        window.setTimeout(() => removeToast(id), TOAST_DURATION);
      }
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
        const normalized = normalizeEmailPreview(request, preview);
        setEmailPreview(normalized);

        if (!normalized.body) {
          console.info(
            "Backend chưa trả email draft/email body nên frontend chưa thể hiển thị nội dung email thật."
          );
        }
      } catch {
        const normalized = normalizeEmailPreview(request, null);
        setEmailPreview(normalized);

        if (!normalized.body) {
          console.info(
            "Backend chưa trả email draft/email body nên frontend chưa thể hiển thị nội dung email thật."
          );
        }
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
      if (!data.emailBody && !data.emailContent && !data.email_content && data.status !== "APPROVED" && data.status !== "SENT") {
        console.info(
          "Backend chưa trả email draft/email body nên frontend chưa thể hiển thị nội dung email thật."
        );
      }
      await fetchEmailPreview(data);
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
  }, [fetchPR]);

  const handleApprove = async () => {
    if (!id) return;

    setIsApproving(true);
    showToast("approve", "info", "Đang duyệt yêu cầu...", false);

    try {
      const updated = await purchaseRequestsApi.approvePurchaseRequest(id);
      setPr(updated);
      showToast("approve", "success", "Duyệt yêu cầu thành công.");
      await fetchEmailPreview(updated);
    } catch (err: any) {
      showToast(
        "approve",
        "error",
        getErrorMessage(err) || "Không thể duyệt yêu cầu, vui lòng thử lại."
      );
    } finally {
      setIsApproving(false);
      setShowConfirmApprove(false);
    }
  };

  const handleReject = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!id || !rejectReason.trim()) return;

    setIsRejecting(true);

    try {
      const updated = await purchaseRequestsApi.rejectPurchaseRequest(id, {
        reason: rejectReason.trim(),
      });
      setPr(updated);
      setShowRejectModal(false);
      setRejectReason("");
      setEmailPreview(null);
      showToast("reject", "success", "Từ chối yêu cầu thành công.");
    } catch (err: any) {
      showToast(
        "reject",
        "error",
        getErrorMessage(err) || "Không thể từ chối yêu cầu, vui lòng thử lại."
      );
    } finally {
      setIsRejecting(false);
    }
  };

  const handleSendEmail = async () => {
    const draft = emailDraft;
    if (!id || !draft?.body || !draft.subject) return;

    setIsSendingEmail(true);
    showToast("send-email", "info", "Đang gửi email đặt hàng...", false);

    try {
      const updated = await purchaseRequestsApi.sendEmail(id, {
        subject: draft.subject,
        body: draft.body,
      });
      setPr(updated);
      showToast("send-email", "success", "Gửi email đặt hàng thành công.");
      await fetchEmailPreview(updated);
    } catch (err: any) {
      showToast(
        "send-email",
        "error",
        getErrorMessage(err) || "Không thể gửi email đặt hàng, vui lòng thử lại."
      );
    } finally {
      setIsSendingEmail(false);
    }
  };

  const emailDraft = useMemo(() => {
    if (!pr) return null;
    return normalizeEmailPreview(pr, emailPreview);
  }, [emailPreview, pr]);

  if (isLoading) {
    return <Loading message="Đang tải chi tiết yêu cầu..." />;
  }

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
  const isSent = pr.status === "SENT" || emailDraft?.emailStatus === "SENT";
  const canShowEmailBlock = Boolean(emailDraft?.to || emailDraft?.subject || emailDraft?.body || emailDraft?.emailStatus);
  const canSendEmail = pr.status === "APPROVED" && Boolean(emailDraft?.to && emailDraft?.subject && emailDraft?.body);
  const aiReasonText = pr.aiReason || pr.ai_reason || pr.reason || "AI Agent đề xuất nhập hàng dựa trên hao hụt kho.";
  const createdDate = pr.createdAt || pr.created_at || "";

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-6">
      <ToastContainer toasts={toasts} onClose={removeToast} />

      <div>
        <Link
          to="/admin/purchase-requests"
          className="inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-900"
        >
          <ArrowLeft size={16} /> Quay lại danh sách yêu cầu
        </Link>
      </div>

      <div className="flex flex-col gap-6 rounded-3xl border border-slate-100 bg-white p-6 shadow-sm sm:p-8">
        <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-100 pb-4">
          <div>
            <h3 className="text-lg font-black text-slate-800">
              Yêu cầu nhập #{pr.id.slice(-8).toUpperCase()}
            </h3>
            <span className="mt-1 block text-xs text-slate-400">
              Ngày đề xuất: {createdDate ? formatDate(createdDate) : ""}
            </span>
          </div>
          <Badge status={pr.status} />
        </div>

        <div className="grid grid-cols-2 gap-4 text-center sm:grid-cols-3">
          <div className="rounded-xl border border-slate-100 bg-slate-50 p-4">
            <span className="block text-[10px] font-bold uppercase tracking-wider text-slate-400">
              Sản phẩm đề xuất
            </span>
            <strong className="mt-1 block truncate text-sm text-slate-800">{pr.product?.name || "Sản phẩm"}</strong>
          </div>
          <div className="rounded-xl border border-amber-100 bg-amber-50/50 p-4">
            <span className="block text-[10px] font-bold uppercase tracking-wider text-amber-800">
              Số lượng đề xuất nhập
            </span>
            <strong className="mt-0.5 block text-lg text-amber-900">
              {pr.suggestedQuantity ?? pr.suggested_quantity ?? 0}
            </strong>
          </div>
          <div className="col-span-2 rounded-xl border border-slate-100 bg-slate-50 p-4 sm:col-span-1">
            <span className="block text-[10px] font-bold uppercase tracking-wider text-slate-400">
              Nhà cung cấp đề xuất
            </span>
            <strong className="mt-1 block truncate text-sm text-slate-800">{pr.supplier?.name || "Chưa chọn"}</strong>
          </div>
        </div>

        <div className="space-y-2 rounded-2xl border border-amber-700/10 bg-amber-50/40 p-5">
          <h4 className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-amber-800">
            <Sparkles size={14} className="text-amber-800" /> Giải thích lý do từ AI Agent
          </h4>
          <p className="text-xs leading-relaxed text-slate-600 sm:text-sm">{aiReasonText}</p>
        </div>

        {pr.supplier && (
          <div className="space-y-2 rounded-2xl border border-slate-100 bg-slate-50/50 p-5 text-sm">
            <h4 className="mb-2 text-xs font-bold uppercase tracking-wider text-slate-400">
              Thông tin nhà cung cấp nhận thư
            </h4>
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <span className="block text-[10px] font-medium text-slate-400">Tên liên hệ:</span>
                <span className="font-semibold text-slate-800">{pr.supplier.name}</span>
              </div>
              <div>
                <span className="block text-[10px] font-medium text-slate-400">Hộp thư nhận đặt hàng:</span>
                <span className="font-semibold text-slate-800">{pr.supplier.email || "Chưa có email"}</span>
              </div>
            </div>
          </div>
        )}

        {canShowEmailBlock && emailDraft && (
          <div className="overflow-hidden rounded-2xl border border-slate-200">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 bg-slate-50 px-5 py-3">
              <h4 className="flex items-center gap-2 text-sm font-bold text-slate-800">
                <Mail size={16} className="text-amber-800" /> Email đặt hàng do Agent đề xuất
              </h4>
              {isSent ? (
                <span className="rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-bold text-emerald-700">
                  Đã gửi email
                </span>
              ) : (
                canSendEmail && (
                  <Button size="sm" onClick={handleSendEmail} isLoading={isSendingEmail}>
                    <Send size={14} className="mr-1.5" /> Gửi email
                  </Button>
                )
              )}
            </div>

            <div className="grid gap-4 p-5 text-sm">
              <EmailField label="Người nhận" value={emailDraft.to || "Chưa có email nhà cung cấp"} />
              <EmailField label="Tiêu đề" value={emailDraft.subject || "Backend chưa trả tiêu đề email."} />
              <EmailField label="Trạng thái email" value={emailDraft.emailStatus || "Chưa gửi"} />
              {emailDraft.sentAt && <EmailField label="Thời gian gửi" value={formatDate(emailDraft.sentAt)} />}
              {emailDraft.lastEmailError && <EmailField label="Lỗi gửi gần nhất" value={emailDraft.lastEmailError} />}
              {emailDraft.body ? (
                <div>
                  <span className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-slate-400">
                    Nội dung email
                  </span>
                  <div className="whitespace-pre-wrap rounded-xl border border-slate-200 bg-slate-50 p-4 font-mono text-xs leading-relaxed text-slate-700">
                    {emailDraft.body}
                  </div>
                </div>
              ) : (
                <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm font-medium text-amber-900">
                  Backend chưa trả email draft/email body nên frontend chưa thể hiển thị nội dung email thật.
                </div>
              )}
            </div>
          </div>
        )}

        {isPending && (
          <div className="mt-4 flex justify-end gap-3.5 border-t border-slate-100 pt-6">
            <Button
              onClick={() => setShowRejectModal(true)}
              variant="outline"
              className="border-rose-200 text-rose-600 hover:bg-rose-50"
            >
              <Ban size={14} className="mr-1.5" /> Từ chối đề xuất
            </Button>
            <Button
              onClick={() => setShowConfirmApprove(true)}
              className="border-none bg-amber-800 text-white hover:bg-amber-900"
            >
              <CheckCircle size={14} className="mr-1.5" /> Duyệt yêu cầu
            </Button>
          </div>
        )}
      </div>

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
        <Modal isOpen={true} onClose={() => setShowRejectModal(false)} title="Lý do từ chối Purchase Request" size="sm">
          <form onSubmit={handleReject} className="space-y-4">
            <div>
              <label className="mb-1.5 block text-sm font-medium text-slate-700">Lý do từ chối</label>
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
                Xác nhận từ chối
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
