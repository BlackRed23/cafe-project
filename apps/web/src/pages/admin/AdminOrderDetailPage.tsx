import React, { useState, useEffect } from "react";
import { useParams, Link } from "react-router-dom";
import { ordersApi, getOrderErrorMessage } from "../../api/orders.api";
import { paymentsApi } from "../../api/payments.api";
import type { Order } from "../../types/order.types";
import { formatCurrency } from "../../utils/formatCurrency";
import { formatDate } from "../../utils/formatDate";
import { Badge } from "../../components/common/Badge";
import { Loading } from "../../components/common/Loading";
import { Button } from "../../components/common/Button";
import { ConfirmDialog } from "../../components/common/ConfirmDialog";
import {
  ArrowLeft,
  Check,
  Ban,
  ShieldCheck,
  Mail,
  User,
  Phone,
  MapPin,
  BadgeCheck,
  AlertTriangle,
  RotateCcw,
} from "lucide-react";
import { useToast } from "../../contexts/ToastContext";
import { useAuth } from "../../contexts/AuthContext";
import { getZoneLabel } from "../../utils/shipping";
import { getPaymentMethodLabel } from "../../utils/payment";

const MANUAL_CONFIRMABLE_METHODS = new Set(["CASH", "BANK_TRANSFER", "VIET_QR"]);

export const AdminOrderDetailPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const toast = useToast();
  const { isStaff } = useAuth();
  const [order, setOrder] = useState<Order | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Action state managers
  const [actionType, setActionType] = useState<
    "confirm" | "processing" | "completed" | "cancel" | "confirm_payment" | "mark_refunded" | null
  >(null);
  const [actionLoading, setActionLoading] = useState(false);
  const [successInfo, setSuccessInfo] = useState<{ message: string; prId?: string } | null>(null);

  const fetchOrder = async () => {
    if (!id) return;
    try {
      setIsLoading(true);
      const data = await ordersApi.getOrderById(id);
      setOrder(data);
    } catch {
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
    toast.info("Đang cập nhật đơn hàng...");

    try {
      let actionMessage = "Cập nhật trạng thái đơn hàng thành công.";

      if (actionType === "confirm") {
        const res: any = await ordersApi.confirmOrder(id);
        actionMessage = "Đơn hàng đã chuyển sang đang xử lý. Hàng vẫn đang được giữ.";
        setSuccessInfo({
          message: actionMessage,
          prId: res?.purchaseRequestId || res?.purchaseRequest?.id || undefined,
        });
      } else if (actionType === "confirm_payment") {
        await ordersApi.confirmPayment(id);
        actionMessage = "Đã xác nhận thanh toán thành công.";
        setSuccessInfo({ message: actionMessage });
      } else if (actionType === "mark_refunded") {
        if (order.payment?.id) {
          await paymentsApi.markPaymentRefunded(order.payment.id);
        }
        actionMessage = "Đã xác nhận hoàn tiền cho khách hàng thành công.";
        setSuccessInfo({ message: actionMessage });
      } else if (actionType === "processing") {
        await ordersApi.updateOrderStatus(id, { status: "PROCESSING" });
        actionMessage = "Đơn hàng đã chuyển sang đang xử lý. Hàng vẫn đang được giữ.";
        setSuccessInfo({ message: actionMessage });
      } else if (actionType === "completed") {
        const isManualMethod = MANUAL_CONFIRMABLE_METHODS.has(order.paymentMethod || "CASH");
        await ordersApi.updateOrderStatus(id, {
          status: "COMPLETED",
          ...(order.paymentStatus !== "PAID" && isManualMethod ? { paymentStatus: "PAID" } : {}),
        });
        actionMessage = "Đơn hàng đã hoàn thành. Tồn kho thật đã được trừ.";
        setSuccessInfo({ message: actionMessage });
      } else if (actionType === "cancel") {
        await ordersApi.updateOrderStatus(id, { status: "CANCELLED" });
        actionMessage = "Đơn hàng đã hủy. Hàng đang giữ đã được hoàn lại vào khả dụng.";
        setSuccessInfo({ message: actionMessage });
      }

      const updated = await ordersApi.getOrderById(id);
      setOrder(updated);
      toast.success(actionMessage);
    } catch (err: any) {
      const msg = getOrderErrorMessage(
        err,
        "Không thể cập nhật trạng thái đơn hàng, vui lòng thử lại."
      );
      if (msg.toLowerCase().includes("stock") || msg.toLowerCase().includes("tồn kho")) {
        setError("Không đủ tồn kho để xác nhận đơn hàng. AI Agent sẽ đề xuất tạo Purchase Request.");
        toast.error("Không đủ tồn kho", "AI Agent sẽ tự động tạo đề xuất nhập hàng.");
      } else {
        setError(msg);
        toast.error(msg);
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
  const isProcessing = order.status === "PROCESSING";
  const isCancelled = order.status === "CANCELLED";
  const isCompleted = order.status === "COMPLETED";

  const canConfirmManualPayment =
    !isCancelled &&
    order.paymentStatus === "PENDING" &&
    MANUAL_CONFIRMABLE_METHODS.has(order.paymentMethod || "CASH");

  const needsManualRefund = order.payment?.failureCode === "REFUND_REQUIRED";

  const hasCostData = order.items?.some(
    (item) => item.totalCost != null || item.ingredientCost != null || item.grossProfit != null
  );

  const totalOrderCogs = order.items?.reduce((sum, item) => sum + (item.totalCost ?? 0), 0) ?? 0;
  const totalOrderProfit = order.items?.reduce((sum, item) => sum + (item.grossProfit ?? 0), 0) ?? 0;

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

      {/* BUG-3: Banner cảnh báo cần hoàn tiền thủ công */}
      {needsManualRefund && (
        <div className="p-4 bg-rose-50 border border-rose-300 text-rose-900 rounded-2xl flex flex-wrap items-center justify-between gap-4 shadow-sm">
          <div className="flex items-start gap-3">
            <AlertTriangle size={20} className="text-rose-600 shrink-0 mt-0.5" />
            <div>
              <h4 className="font-bold text-sm text-rose-800">Cần hoàn tiền cho khách</h4>
              <p className="text-xs text-rose-700 mt-0.5">
                {order.payment?.failureMessage ||
                  "Đơn hàng đã bị hủy nhưng giao dịch thanh toán đã trừ tiền khách hàng. Vui lòng hoàn tiền thủ công."}
              </p>
            </div>
          </div>
          {!isStaff && order.payment?.id && (
            <Button
              onClick={() => setActionType("mark_refunded")}
              className="bg-rose-600 hover:bg-rose-700 text-white text-xs"
            >
              <RotateCcw size={14} className="mr-1.5" /> Đã hoàn tiền
            </Button>
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
            <Badge status={order.paymentStatus} context="payment" />
            <Badge status={order.status} context="order" />
          </div>
        </div>

        {/* Order info */}
        <div className="grid sm:grid-cols-2 gap-6 bg-slate-50/50 p-5 rounded-2xl border border-slate-100/50">
          <div className="space-y-1.5 text-sm">
            <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider">Khách hàng đặt hàng</h4>
            <p className="font-bold text-slate-800">{order.customer?.name || "Không rõ"}</p>
            <p className="text-slate-500 font-medium">{order.customer?.email || "Không rõ"}</p>
          </div>
          <div className="space-y-1.5 text-sm">
            <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider">Ghi chú đơn hàng</h4>
            {order.note && (
              <p className="text-slate-700 leading-relaxed font-semibold">{order.note}</p>
            )}
            {!order.note && <p className="text-slate-500 font-medium">Không có ghi chú</p>}
          </div>
        </div>

        {/* Shipping Info */}
        {(order.shippingName || order.shippingPhone || order.shippingAddress) && (
          <div className="bg-amber-50/40 border border-amber-900/5 rounded-2xl p-5">
            <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3 flex items-center gap-1.5">
              <MapPin size={12} className="text-amber-700" /> Thông tin giao hàng
            </h4>
            <div className="space-y-2.5">
              {order.shippingName && (
                <div className="flex items-center gap-2.5 text-sm">
                  <User size={14} className="text-amber-700 shrink-0" />
                  <span className="text-slate-500 font-medium w-32 shrink-0">Người nhận:</span>
                  <span className="font-bold text-slate-800">{order.shippingName}</span>
                </div>
              )}
              {order.shippingPhone && (
                <div className="flex items-center gap-2.5 text-sm">
                  <Phone size={14} className="text-amber-700 shrink-0" />
                  <span className="text-slate-500 font-medium w-32 shrink-0">Số điện thoại:</span>
                  <span className="font-bold text-slate-800">{order.shippingPhone}</span>
                </div>
              )}
              {order.shippingAddress && (
                <div className="flex items-start gap-2.5 text-sm">
                  <MapPin size={14} className="text-amber-700 shrink-0 mt-0.5" />
                  <span className="text-slate-500 font-medium w-32 shrink-0">Địa chỉ:</span>
                  <span className="font-bold text-slate-800 leading-relaxed">{order.shippingAddress}</span>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Products list */}
        <div>
          <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3">Sản phẩm chi tiết</h4>
          <div className="border border-slate-100 rounded-2xl divide-y divide-slate-100 overflow-hidden">
            {order.items?.map((item) => {
              const unitPrice = item.unitPrice ?? item.price ?? (item as any).Price ?? 0;
              const lineSubtotal = item.subtotal ?? unitPrice * item.quantity;
              return (
                <div key={item.id} className="p-4 flex flex-col gap-2 text-sm">
                  <div className="flex items-center justify-between gap-4">
                    <div>
                      <p className="font-bold text-slate-800">{item.product?.name || (item as any).Product?.name || "Sản phẩm"}</p>
                      <p className="text-slate-400 text-xs mt-0.5">
                        Đơn giá: {formatCurrency(unitPrice)} / {item.product?.unit || (item as any).Product?.unit || "ly"}
                      </p>
                      {item.toppings && item.toppings.length > 0 && (
                        <div className="mt-1.5 flex flex-wrap gap-1.5">
                          {item.toppings.map((t) => (
                            <span
                              key={t.id}
                              className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] bg-amber-50 text-amber-800 border border-amber-200 font-medium"
                            >
                              + {t.toppingName || "Topping"} x{t.quantity} ({formatCurrency((t.unitPrice ?? t.price ?? 0) * t.quantity)})
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                    <div className="text-right">
                      <p className="font-semibold text-slate-700">x {item.quantity}</p>
                      <p className="font-black text-amber-800 text-sm mt-0.5">
                        {formatCurrency(lineSubtotal)}
                      </p>
                    </div>
                  </div>

                  {/* Cost & Gross Profit Snapshot (visible to Admin/Staff when recorded) */}
                  {(item.totalCost != null || item.ingredientCost != null || item.grossProfit != null) && (
                    <div className="pt-2 border-t border-slate-100/80 flex flex-wrap items-center justify-between gap-2 text-xs bg-slate-50/70 px-3 py-1.5 rounded-xl">
                      <div className="flex flex-wrap items-center gap-3 text-slate-500">
                        {item.ingredientCost != null && (
                          <span>
                            Nguyên liệu: <strong className="text-slate-700">{formatCurrency(item.ingredientCost)}</strong>
                          </span>
                        )}
                        {item.toppingCost != null && item.toppingCost > 0 && (
                          <span>
                            Giá vốn Topping: <strong className="text-slate-700">{formatCurrency(item.toppingCost)}</strong>
                          </span>
                        )}
                        {item.totalCost != null && (
                          <span>
                            Tổng giá vốn (COGS): <strong className="text-rose-700">{formatCurrency(item.totalCost)}</strong>
                          </span>
                        )}
                      </div>
                      {item.grossProfit != null && (
                        <span className={`font-bold ${item.grossProfit >= 0 ? "text-emerald-700" : "text-rose-600"}`}>
                          Lợi nhuận gộp: {formatCurrency(item.grossProfit)}
                        </span>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* Calculation details */}
        <div className="border-t border-slate-100 pt-4 flex flex-col gap-2.5 max-w-sm ml-auto w-full">
          <div className="flex justify-between text-sm text-slate-500">
            <span>Tiền hàng</span>
            <span>{formatCurrency(order.totalAmount - (order.shippingFee ?? 0))}</span>
          </div>
          {order.shippingFee != null && (
            <div className="flex justify-between text-sm text-slate-500">
              <span className="flex items-center gap-1.5">
                Phí vận chuyển
                {order.shippingZone && (
                  <span className="text-[10px] bg-slate-100 px-1.5 py-0.5 rounded text-slate-400">
                    {getZoneLabel(order.shippingZone)}
                  </span>
                )}
              </span>
              {order.shippingFee === 0 ? (
                <span className="text-emerald-600 font-bold">Miễn phí</span>
              ) : (
                <span className="font-semibold text-slate-700">{formatCurrency(order.shippingFee)}</span>
              )}
            </div>
          )}
          <div className="flex justify-between text-sm text-slate-500">
            <span>Phương thức</span>
            <span className="font-semibold text-slate-700">{getPaymentMethodLabel(order.paymentMethod)}</span>
          </div>
          {hasCostData && (
            <>
              <div className="flex justify-between text-sm text-rose-700 pt-1 border-t border-dashed border-slate-200">
                <span>Tổng giá vốn (COGS)</span>
                <span className="font-bold">{formatCurrency(totalOrderCogs)}</span>
              </div>
              <div className="flex justify-between text-sm text-emerald-700">
                <span>Lợi nhuận gộp đơn hàng</span>
                <span className="font-bold">{formatCurrency(totalOrderProfit)}</span>
              </div>
            </>
          )}
          <div className="flex justify-between text-base font-black text-slate-800 border-t border-slate-100 pt-3">
            <span>Tổng thanh toán</span>
            <span className="text-amber-800 text-lg">{formatCurrency(order.totalAmount || (order as any).total_amount || 0)}</span>
          </div>
        </div>

        {/* Processing Actions */}
        {(!isCancelled && !isCompleted) || canConfirmManualPayment ? (
          <div className="border-t border-slate-100 pt-6 mt-4 flex flex-wrap gap-3 justify-end">
            {!isCancelled && !isCompleted && (
              <Button
                onClick={() => setActionType("cancel")}
                variant="outline"
                className="text-rose-600 border-rose-250 hover:bg-rose-50/50"
              >
                <Ban size={14} className="mr-1.5" /> Hủy đơn hàng
              </Button>
            )}

            {/* BUG-1: Xác nhận đã nhận tiền cho CASH / BANK_TRANSFER / VIET_QR khi đang PENDING */}
            {canConfirmManualPayment && (
              <Button
                onClick={() => setActionType("confirm_payment")}
                className="bg-emerald-600 hover:bg-emerald-700 text-white"
              >
                <BadgeCheck size={14} className="mr-1.5" /> Xác nhận đã nhận tiền
              </Button>
            )}

            {isPending && (
              <Button
                onClick={() => setActionType("confirm")}
                className="bg-amber-800 hover:bg-amber-900 text-white"
              >
                <Check size={14} className="mr-1.5" /> Xác nhận xử lý
              </Button>
            )}

            {isProcessing && (
              <Button
                onClick={() => setActionType("completed")}
                className="bg-emerald-600 hover:bg-emerald-700 text-white"
              >
                <ShieldCheck size={14} className="mr-1.5" /> Hoàn thành & Trừ kho
              </Button>
            )}
          </div>
        ) : null}
      </div>

      {/* Confirmation Modal */}
      <ConfirmDialog
        isOpen={!!actionType}
        onClose={() => setActionType(null)}
        onConfirm={handleActionConfirm}
        title={
          actionType === "confirm"
            ? "Xác nhận xử lý"
            : actionType === "confirm_payment"
            ? "Xác nhận đã nhận tiền"
            : actionType === "mark_refunded"
            ? "Xác nhận đã hoàn tiền cho khách"
            : actionType === "processing"
            ? "Chuyển trạng thái chế biến"
            : actionType === "completed"
            ? "Hoàn thành đơn hàng"
            : "Hủy bỏ đơn hàng"
        }
        message={
          actionType === "confirm"
            ? "Đơn hàng sẽ chuyển sang Đang xử lý. Hàng vẫn được giữ trong reservedStock và chưa trừ tồn kho thật."
            : actionType === "confirm_payment"
            ? "Xác nhận đã nhận được tiền từ khách hàng. Trạng thái thanh toán của đơn hàng sẽ được cập nhật thành ĐÃ THANH TOÁN."
            : actionType === "mark_refunded"
            ? "Xác nhận bạn đã hoàn trả lại tiền cho khách hàng. Trạng thái thanh toán sẽ chuyển sang ĐÃ HOÀN TIỀN (REFUNDED)."
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
