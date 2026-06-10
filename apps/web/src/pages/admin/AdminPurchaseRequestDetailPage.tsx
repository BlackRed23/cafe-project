import React, { useState, useEffect } from "react";
import { useParams, Link } from "react-router-dom";
import { purchaseRequestsApi } from "../../api/purchaseRequests.api";
import type { PurchaseRequest } from "../../types/purchaseRequest.types";
import { formatDate } from "../../utils/formatDate";
import { Badge } from "../../components/common/Badge";
import { Loading } from "../../components/common/Loading";
import { Button } from "../../components/common/Button";
import { ConfirmDialog } from "../../components/common/ConfirmDialog";
import { Modal } from "../../components/common/Modal";
import { ArrowLeft, CheckCircle, Sparkles, Mail, Send, Ban } from "lucide-react";
import { getErrorMessage } from "../../api/client";

export const AdminPurchaseRequestDetailPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const [pr, setPr] = useState<PurchaseRequest | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Actions states
  const [showConfirmApprove, setShowConfirmApprove] = useState(false);
  const [isApproving, setIsApproving] = useState(false);

  const [showRejectModal, setShowRejectModal] = useState(false);
  const [rejectReason, setRejectReason] = useState("");
  const [isRejecting, setIsRejecting] = useState(false);

  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const fetchPR = async () => {
    if (!id) return;
    try {
      setIsLoading(true);
      const data = await purchaseRequestsApi.getPurchaseRequestById(id);
      setPr(data);
    } catch (err: any) {
      setError("Không thể tải chi tiết yêu cầu nhập hàng.");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchPR();
  }, [id]);

  const handleApprove = async () => {
    if (!id) return;
    setIsApproving(true);
    setSuccessMessage(null);
    setError(null);
    try {
      await purchaseRequestsApi.approvePurchaseRequest(id);
      setSuccessMessage("Đã duyệt Purchase Request thành công! Hệ thống đã gửi email đặt hàng tới nhà cung cấp.");
      await fetchPR();
    } catch (err: any) {
      const msg = getErrorMessage(err);
      if (msg.toLowerCase().includes("smtp") || msg.toLowerCase().includes("mail")) {
        setError(`Duyệt PR thành công nhưng gặp lỗi SMTP khi gửi email: ${msg}`);
      } else {
        setError(msg);
      }
    } finally {
      setIsApproving(false);
      setShowConfirmApprove(false);
    }
  };

  const handleReject = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!id || !rejectReason.trim()) return;
    setIsRejecting(true);
    setError(null);
    setSuccessMessage(null);

    try {
      await purchaseRequestsApi.rejectPurchaseRequest(id, {
        reason: rejectReason.trim(),
      });
      setSuccessMessage("Đã từ chối yêu cầu nhập hàng.");
      setShowRejectModal(false);
      setRejectReason("");
      await fetchPR();
    } catch (err: any) {
      setError(getErrorMessage(err));
    } finally {
      setIsRejecting(false);
    }
  };

  if (isLoading) {
    return <Loading message="Đang tải chi tiết yêu cầu..." />;
  }

  if (!pr) {
    return (
      <div className="max-w-xl mx-auto my-12 text-center p-8 bg-slate-50 border border-slate-200 rounded-xl">
        <p className="font-semibold text-slate-700">Yêu cầu không tồn tại.</p>
        <Link to="/admin/purchase-requests" className="mt-4 inline-block">
          <Button variant="outline">Quay lại danh sách</Button>
        </Link>
      </div>
    );
  }

  const isPending = pr.status === "PENDING";
  const aiReasonText = pr.aiReason || pr.ai_reason || pr.reason || "AI Agent đề xuất nhập hàng dựa trên hao hụt kho.";
  const emailBody = pr.emailContent || pr.email_content || "";
  const createdDate = pr.createdAt || pr.created_at || "";

  return (
    <div className="flex flex-col gap-6 max-w-4xl mx-auto">
      {/* Back button */}
      <div>
        <Link to="/admin/purchase-requests" className="inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-900">
          <ArrowLeft size={16} /> Quay lại danh sách yêu cầu
        </Link>
      </div>

      {successMessage && (
        <div className="p-4 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-2xl flex items-center gap-2.5 shadow-sm font-semibold text-sm">
          <CheckCircle size={18} className="text-emerald-600" /> {successMessage}
        </div>
      )}

      {error && (
        <div className="p-4 bg-rose-50 border border-rose-200 text-rose-800 text-sm font-medium rounded-2xl">
          {error}
        </div>
      )}

      {/* Detail info card */}
      <div className="bg-white border border-slate-100 rounded-3xl p-6 sm:p-8 shadow-sm flex flex-col gap-6">
        {/* Header row */}
        <div className="flex flex-wrap items-center justify-between border-b border-slate-100 pb-4 gap-4">
          <div>
            <h3 className="text-lg font-black text-slate-800">Yêu cầu nhập #{pr.id.slice(-8).toUpperCase()}</h3>
            <span className="text-xs text-slate-400 mt-1 block">Ngày đề xuất: {createdDate ? formatDate(createdDate) : ""}</span>
          </div>
          <Badge status={pr.status} />
        </div>

        {/* Quantities panel */}
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 text-center">
          <div className="p-4 bg-slate-50 border border-slate-100 rounded-xl">
            <span className="text-[10px] text-slate-400 block font-bold uppercase tracking-wider">Sản phẩm đề xuất</span>
            <strong className="text-sm text-slate-800 mt-1 block truncate">{pr.product?.name || "Sản phẩm"}</strong>
          </div>
          <div className="p-4 bg-amber-50/50 border border-amber-100 rounded-xl">
            <span className="text-[10px] text-amber-800 block font-bold uppercase tracking-wider">Số lượng đề xuất nhập</span>
            <strong className="text-lg text-amber-900 mt-0.5 block">{pr.suggestedQuantity ?? pr.suggested_quantity ?? 0}</strong>
          </div>
          <div className="p-4 bg-slate-50 border border-slate-100 rounded-xl col-span-2 sm:col-span-1">
            <span className="text-[10px] text-slate-400 block font-bold uppercase tracking-wider">Nhà cung cấp đề xuất</span>
            <strong className="text-sm text-slate-800 mt-1 block truncate">{pr.supplier?.name || "Chưa chọn"}</strong>
          </div>
        </div>

        {/* AI Explanation block */}
        <div className="bg-gradient-to-br from-amber-50/20 to-amber-100/10 border border-amber-700/10 p-5 rounded-2xl space-y-2">
          <h4 className="text-xs font-bold text-amber-800 flex items-center gap-1.5 uppercase tracking-wider">
            <Sparkles size={14} className="text-amber-800 animate-pulse" /> Giải thích lý do từ AI Agent
          </h4>
          <p className="text-xs sm:text-sm text-slate-650 leading-relaxed font-light">
            {aiReasonText}
          </p>
        </div>

        {/* Supplier details */}
        {pr.supplier && (
          <div className="border border-slate-100 rounded-2xl p-5 space-y-2 text-sm bg-slate-50/50">
            <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">Thông tin nhà cung cấp nhận thư</h4>
            <div className="grid sm:grid-cols-2 gap-4">
              <div>
                <span className="text-[10px] text-slate-400 font-medium block">Tên liên hệ:</span>
                <span className="font-semibold text-slate-800">{pr.supplier.name}</span>
              </div>
              <div>
                <span className="text-[10px] text-slate-400 font-medium block">Hộp thư nhận đặt hàng:</span>
                <span className="font-semibold text-slate-800">{pr.supplier.email}</span>
              </div>
            </div>
          </div>
        )}

        {/* Email Draft visualizer */}
        {emailBody && (
          <div className="border border-slate-200 rounded-2xl overflow-hidden shadow-inner">
            <div className="bg-slate-100 px-4.5 py-2.5 border-b border-slate-200 text-xs font-bold text-slate-500 flex items-center gap-1.5">
              <Mail size={13} /> Thư điện tử nháp do AI Agent biên soạn
            </div>
            <div className="p-5 bg-slate-50 font-mono text-xs text-slate-700 leading-relaxed whitespace-pre-wrap select-all">
              {emailBody}
            </div>
          </div>
        )}

        {/* Actions panel */}
        {isPending && (
          <div className="border-t border-slate-100 pt-6 mt-4 flex justify-end gap-3.5">
            <Button
              onClick={() => setShowRejectModal(true)}
              variant="outline"
              className="text-rose-600 border-rose-200 hover:bg-rose-50"
            >
              <Ban size={14} className="mr-1.5" /> Từ chối đề xuất
            </Button>
            <Button
              onClick={() => setShowConfirmApprove(true)}
              className="bg-amber-800 hover:bg-amber-900 text-white border-none"
            >
              <Send size={14} className="mr-1.5" /> Phê duyệt & Gửi Email
            </Button>
          </div>
        )}
      </div>

      {/* Confirm Approve Dialog */}
      <ConfirmDialog
        isOpen={showConfirmApprove}
        onClose={() => setShowConfirmApprove(false)}
        onConfirm={handleApprove}
        title="Duyệt yêu cầu nhập hàng"
        message="Khi phê duyệt, hệ thống sẽ tự động gửi email chi tiết đơn đặt hàng tới hòm thư của nhà cung cấp đã chọn. Bạn có chắc chắn muốn duyệt và gửi?"
        confirmText="Duyệt và Gửi"
        cancelText="Hủy"
        type="info"
        isLoading={isApproving}
      />

      {/* Reject Modal */}
      {showRejectModal && (
        <Modal isOpen={true} onClose={() => setShowRejectModal(false)} title="Lý do từ chối Purchase Request" size="sm">
          <form onSubmit={handleReject} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">Lý do từ chối</label>
              <textarea
                rows={3}
                placeholder="Vd: Không cần nhập thêm vì còn hàng trong kho phụ..."
                value={rejectReason}
                onChange={(e) => setRejectReason(e.target.value)}
                className="block w-full px-3.5 py-2.5 rounded-lg border border-slate-300 text-sm outline-none focus:ring-2 focus:ring-amber-700/20 focus:border-amber-700"
                required
              />
            </div>

            <div className="pt-3 border-t border-slate-100 flex justify-end gap-2">
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
