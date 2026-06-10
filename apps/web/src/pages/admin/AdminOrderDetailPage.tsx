import React, { useState, useEffect } from "react";
import { useParams, Link } from "react-router-dom";
import { ordersApi } from "../../api/orders.api";
import type { Order } from "../../types/order.types";
import { formatCurrency } from "../../utils/formatCurrency";
import { formatDate } from "../../utils/formatDate";
import { Badge } from "../../components/common/Badge";
import { Loading } from "../../components/common/Loading";
import { Button } from "../../components/common/Button";
import { ConfirmDialog } from "../../components/common/ConfirmDialog";
import { ArrowLeft, Check, Play, Ban, ShieldCheck, Mail } from "lucide-react";
import { getErrorMessage } from "../../api/client";

export const AdminOrderDetailPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const [order, setOrder] = useState<Order | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  // Action state managers
  const [actionType, setActionType] = useState<"confirm" | "processing" | "completed" | "cancel" | null>(null);
  const [actionLoading, setActionLoading] = useState(false);
  const [successInfo, setSuccessInfo] = useState<{ message: string; prId?: string } | null>(null);

  const fetchOrder = async () => {
    if (!id) return;
    try {
      setIsLoading(true);
      const data = await ordersApi.getOrderById(id);
      setOrder(data);
    } catch (err: any) {
      setError("Không thể tải thông tin chi tiết đơn hàng.");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchOrder();
  }, [id]);

  const handleActionConfirm = async () => {
    if (!order || !id) return;
    setActionLoading(true);
    setSuccessInfo(null);
    setError(null);

    try {
      if (actionType === "confirm") {
        const res: any = await ordersApi.confirmOrder(id);
        setSuccessInfo({
          message: "Đơn hàng đã xác nhận thành công. Tồn kho đã được trừ tương ứng.",
          prId: res?.purchaseRequestId || res?.purchaseRequest?.id || undefined,
        });
      } else if (actionType === "processing") {
        await ordersApi.updateOrderStatus(id, { status: "PROCESSING" });
      } else if (actionType === "completed") {
        await ordersApi.updateOrderStatus(id, { status: "COMPLETED", paymentStatus: "PAID" });
      } else if (actionType === "cancel") {
        await ordersApi.updateOrderStatus(id, { status: "CANCELLED" });
      }
      
      const updated = await ordersApi.getOrderById(id);
      setOrder(updated);
    } catch (err: any) {
      const msg = getErrorMessage(err);
      if (msg.toLowerCase().includes("stock") || msg.toLowerCase().includes("tồn kho")) {
        setError("Không đủ tồn kho để xác nhận đơn hàng. AI Agent sẽ đề xuất tạo Purchase Request.");
      } else {
        setError(msg);
      }
    } finally {
      setActionLoading(false);
      setActionType(null);
    }
  };

  if (isLoading) {
    return <Loading message="Đang tải thông tin đơn hàng..." />;
  }

  if (!order) {
    return (
      <div className="max-w-xl mx-auto my-12 text-center p-8 bg-slate-50 border border-slate-200 rounded-xl">
        <p className="font-semibold text-slate-700">Đơn hàng không tồn tại.</p>
        <Link to="/admin/orders" className="mt-4 inline-block">
          <Button variant="outline">Quay lại danh sách</Button>
        </Link>
      </div>
    );
  }

  const isPending = order.status === "PENDING";
  const isConfirmed = order.status === "CONFIRMED";
  const isProcessing = order.status === "PROCESSING";
  const isCancelled = order.status === "CANCELLED";
  const isCompleted = order.status === "COMPLETED";

  return (
    <div className="flex flex-col gap-6 max-w-4xl mx-auto">
      {/* Back link */}
      <div>
        <Link to="/admin/orders" className="inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-900">
          <ArrowLeft size={16} /> Quay lại danh sách đơn hàng
        </Link>
      </div>

      {/* Success info banner */}
      {successInfo && (
        <div className="p-4 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-2xl flex flex-col gap-2.5 shadow-sm">
          <div className="flex items-center gap-2 font-bold text-sm">
            <Check size={18} className="text-emerald-600" /> {successInfo.message}
          </div>
          {successInfo.prId && (
            <div className="pl-6">
              <Link
                to={`/admin/purchase-requests/${successInfo.prId}`}
                className="inline-flex items-center gap-1.5 text-xs font-bold text-amber-800 hover:underline uppercase"
              >
                <Mail size={12} /> Xem Purchase Request đề xuất từ AI Agent
              </Link>
            </div>
          )}
        </div>
      )}

      {error && (
        <div className="p-4 bg-rose-50 border border-rose-200 text-rose-850 text-sm font-semibold rounded-2xl">
          {error}
        </div>
      )}

      {/* Main detail card */}
      <div className="bg-white border border-slate-100 rounded-3xl p-6 sm:p-8 shadow-sm flex flex-col gap-6">
        {/* Title row */}
        <div className="flex flex-wrap items-center justify-between border-b border-slate-100 pb-4 gap-4">
          <div>
            <h3 className="text-lg font-black text-slate-800">Đơn hàng #{order.id.slice(-8).toUpperCase()}</h3>
            <span className="text-xs text-slate-400 mt-1 block">Ngày đặt: {formatDate(order.createdAt)}</span>
          </div>
          <div className="flex items-center gap-2">
            <Badge status={order.paymentStatus} />
            <Badge status={order.status} />
          </div>
        </div>

        {/* Client & Shipping info */}
        <div className="grid sm:grid-cols-2 gap-6 bg-slate-50/50 p-5 rounded-2xl border border-slate-100/50">
          <div className="space-y-1.5 text-sm">
            <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider">Khách hàng nhận</h4>
            <p className="font-bold text-slate-800">{order.shippingName}</p>
            <p className="text-slate-500 font-medium">{order.shippingPhone}</p>
          </div>
          <div className="space-y-1.5 text-sm">
            <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider">Địa chỉ nhận hàng</h4>
            <p className="text-slate-700 leading-relaxed font-semibold">{order.shippingAddress}</p>
            {order.note && (
              <p className="text-xs text-slate-400 italic mt-1 block">Ghi chú: {order.note}</p>
            )}
          </div>
        </div>

        {/* Products list */}
        <div>
          <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3">Sản phẩm chi tiết</h4>
          <div className="border border-slate-100 rounded-2xl divide-y divide-slate-100 overflow-hidden">
            {order.items?.map((item) => (
              <div key={item.id} className="p-4 flex items-center justify-between text-sm gap-4">
                <div>
                  <p className="font-bold text-slate-800">{item.product?.name || "Sản phẩm"}</p>
                  <p className="text-slate-400 text-xs mt-0.5">
                    Đơn giá: {formatCurrency(item.price)} / {item.product?.unit || "hộp"}
                  </p>
                </div>
                <div className="text-right">
                  <p className="font-semibold text-slate-700">x {item.quantity}</p>
                  <p className="font-black text-amber-800 text-sm mt-0.5">
                    {formatCurrency(item.price * item.quantity)}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Calculation details */}
        <div className="border-t border-slate-100 pt-4 flex flex-col gap-2.5 max-w-sm ml-auto w-full">
          <div className="flex justify-between text-sm text-slate-500">
            <span>Phương thức</span>
            <span className="font-semibold text-slate-700">{order.paymentMethod}</span>
          </div>
          <div className="flex justify-between text-base font-black text-slate-800 border-t border-slate-100 pt-3">
            <span>Tổng thanh toán</span>
            <span className="text-amber-800 text-lg">{formatCurrency(order.totalAmount)}</span>
          </div>
        </div>

        {/* Processing Actions */}
        {!isCancelled && !isCompleted && (
          <div className="border-t border-slate-100 pt-6 mt-4 flex flex-wrap gap-3 justify-end">
            <Button
              onClick={() => setActionType("cancel")}
              variant="outline"
              className="text-rose-600 border-rose-250 hover:bg-rose-50/50"
            >
              <Ban size={14} className="mr-1.5" /> Hủy đơn hàng
            </Button>

            {isPending && (
              <Button
                onClick={() => setActionType("confirm")}
                className="bg-amber-800 hover:bg-amber-900 text-white"
              >
                <Check size={14} className="mr-1.5" /> Xác nhận & Trừ kho
              </Button>
            )}

            {isConfirmed && (
              <Button
                onClick={() => setActionType("processing")}
                className="bg-amber-800 hover:bg-amber-900 text-white"
              >
                <Play size={14} className="mr-1.5" /> Bắt đầu chế biến
              </Button>
            )}

            {isProcessing && (
              <Button
                onClick={() => setActionType("completed")}
                className="bg-emerald-600 hover:bg-emerald-700 text-white"
              >
                <ShieldCheck size={14} className="mr-1.5" /> Hoàn thành đơn hàng
              </Button>
            )}
          </div>
        )}
      </div>

      {/* Confirmation Modal */}
      <ConfirmDialog
        isOpen={!!actionType}
        onClose={() => setActionType(null)}
        onConfirm={handleActionConfirm}
        title={
          actionType === "confirm"
            ? "Xác nhận đơn hàng"
            : actionType === "processing"
            ? "Chuyển trạng thái chế biến"
            : actionType === "completed"
            ? "Hoàn thành đơn hàng"
            : "Hủy bỏ đơn hàng"
        }
        message={
          actionType === "confirm"
            ? "Khi xác nhận đơn hàng, hệ thống sẽ tự động trừ sản phẩm tương ứng trong kho và kích hoạt AI Agent kiểm tra tồn kho. Bạn có muốn duyệt ngay?"
            : actionType === "cancel"
            ? "Bạn có chắc chắn muốn hủy đơn hàng này?"
            : "Bạn có muốn thay đổi trạng thái đơn hàng này?"
        }
        confirmText="Xác nhận"
        cancelText="Hủy"
        type={actionType === "cancel" ? "danger" : "info"}
        isLoading={actionLoading}
      />
    </div>
  );
};
