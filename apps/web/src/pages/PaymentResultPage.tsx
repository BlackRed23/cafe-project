import React, { useEffect, useState, useCallback } from "react";
import { useSearchParams, Link } from "react-router-dom";
import { paymentsApi } from "../api/payments.api";
import { getOrderErrorMessage } from "../api/orders.api";
import type { PaymentAttempt } from "../types/order.types";
import { extractOrderIdFromMerchantRef, getPaymentMethodLabel } from "../utils/payment";
import { formatCurrency } from "../utils/formatCurrency";
import { Button } from "../components/common/Button";
import { useAuth } from "../contexts/AuthContext";
import { useToast } from "../contexts/ToastContext";
import {
  CheckCircle2,
  XCircle,
  Clock,
  RefreshCw,
  ShoppingBag,
  Terminal,
  CreditCard,
} from "lucide-react";

const POLL_INTERVAL_MS = 2000;
const MAX_POLL_DURATION_MS = 30000;

export const PaymentResultPage: React.FC = () => {
  const [searchParams] = useSearchParams();
  const { isAdmin, isStaff } = useAuth();
  const toast = useToast();

  // MoMo sends orderId=<merchantRef>, VNPay sends vnp_TxnRef=<merchantRef>
  const rawRef =
    searchParams.get("orderId") ||
    searchParams.get("vnp_TxnRef") ||
    searchParams.get("merchantRef") ||
    "";
  const orderId = extractOrderIdFromMerchantRef(rawRef);

  const isMoMoSandboxFallback = searchParams.get("momoSandboxFallback") === "1";
  const canSimulateDevIpn = isMoMoSandboxFallback && isAdmin && !isStaff;

  const [payment, setPayment] = useState<PaymentAttempt | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [pollTimedOut, setPollTimedOut] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState(false);

  const fetchPaymentStatus = useCallback(async () => {
    if (!orderId) {
      setError("Không tìm thấy mã đơn hàng để kiểm tra trạng thái thanh toán.");
      setIsLoading(false);
      return null;
    }

    try {
      const data = await paymentsApi.getPaymentByOrder(orderId);
      setPayment(data);
      setError(null);
      return data;
    } catch (err: any) {
      setError(
        getOrderErrorMessage(
          err,
          "Không thể kiểm tra trạng thái thanh toán từ máy chủ. Vui lòng thử lại."
        )
      );
      return null;
    } finally {
      setIsLoading(false);
    }
  }, [orderId]);

  useEffect(() => {
    if (!orderId) {
      setIsLoading(false);
      setError("Thiếu thông tin mã đơn hàng trên đường dẫn.");
      return;
    }

    let cancelled = false;
    const startTime = Date.now();
    let timerId: ReturnType<typeof setTimeout> | null = null;

    const poll = async () => {
      const latest = await fetchPaymentStatus();
      if (cancelled) return;

      const status = latest?.status;
      const isTerminal =
        status === "PAID" ||
        status === "FAILED" ||
        status === "CANCELLED" ||
        status === "EXPIRED" ||
        status === "REFUNDED";

      if (isTerminal) {
        return;
      }

      if (Date.now() - startTime >= MAX_POLL_DURATION_MS) {
        setPollTimedOut(true);
        return;
      }

      timerId = setTimeout(poll, POLL_INTERVAL_MS);
    };

    poll();

    return () => {
      cancelled = true;
      if (timerId) clearTimeout(timerId);
    };
  }, [orderId, fetchPaymentStatus]);

  const handleManualCheck = async () => {
    setPollTimedOut(false);
    setIsLoading(true);
    await fetchPaymentStatus();
  };

  const handleRetryPayment = async () => {
    if (!orderId || actionLoading) return;
    setActionLoading(true);
    try {
      const method = payment?.method === "VNPAY" ? "VNPAY" : "MOMO";
      toast.info(`Đang tạo phiên thanh toán ${method} mới...`);
      const res = await paymentsApi.createPaymentUrl(orderId, method);
      window.location.assign(res.payUrl);
    } catch (err: any) {
      toast.error(
        getOrderErrorMessage(err, "Không thể tạo lại liên kết thanh toán. Vui lòng thử lại.")
      );
    } finally {
      setActionLoading(false);
    }
  };

  const handleDevSimulateIpn = async (success: boolean) => {
    if (!payment?.id || actionLoading) return;
    setActionLoading(true);
    try {
      const res = await paymentsApi.simulateDevMoMoIpn(payment.id, success);
      setPayment(res.payment);
      toast.success(
        success
          ? "Đã giả lập IPN MoMo thành công (PAID)."
          : "Đã giả lập IPN MoMo thất bại (FAILED)."
      );
    } catch (err: any) {
      toast.error(getOrderErrorMessage(err, "Không thể giả lập IPN MoMo."));
    } finally {
      setActionLoading(false);
    }
  };

  const status = payment?.status;
  const isPaid = status === "PAID";
  const isFailed =
    status === "FAILED" || status === "CANCELLED" || status === "EXPIRED";
  const isPending = !status || status === "INITIATED" || status === "PENDING";

  return (
    <div className="max-w-xl mx-auto my-16 px-4">
      <div className="bg-white border border-amber-900/10 rounded-3xl p-8 shadow-xl text-center space-y-6">
        {/* Status Icon & Heading */}
        {isPaid && (
          <>
            <div className="w-16 h-16 rounded-full bg-emerald-100 text-emerald-700 flex items-center justify-center mx-auto">
              <CheckCircle2 size={36} />
            </div>
            <div>
              <h1 className="text-2xl font-extrabold text-slate-800 font-serif">
                Thanh toán thành công!
              </h1>
              <p className="text-sm text-slate-500 mt-1">
                Hệ thống đã xác nhận thanh toán cho đơn hàng{" "}
                <strong className="text-slate-800">#{orderId.slice(-8).toUpperCase()}</strong>.
              </p>
            </div>
          </>
        )}

        {isFailed && (
          <>
            <div className="w-16 h-16 rounded-full bg-rose-100 text-rose-700 flex items-center justify-center mx-auto">
              <XCircle size={36} />
            </div>
            <div>
              <h1 className="text-2xl font-extrabold text-slate-800 font-serif">
                Thanh toán chưa hoàn tất
              </h1>
              <p className="text-sm text-slate-500 mt-1">
                Giao dịch cho đơn hàng{" "}
                <strong className="text-slate-800">#{orderId.slice(-8).toUpperCase()}</strong>{" "}
                không thành công hoặc đã hết hạn. Bạn có thể bấm{" "}
                <strong>Thanh toán lại</strong> bên dưới.
              </p>
            </div>
          </>
        )}

        {isPending && (
          <>
            <div className="w-16 h-16 rounded-full bg-amber-100 text-amber-800 flex items-center justify-center mx-auto">
              <Clock size={36} className={!pollTimedOut ? "animate-pulse" : ""} />
            </div>
            <div>
              <h1 className="text-2xl font-extrabold text-slate-800 font-serif">
                {pollTimedOut
                  ? "Đang chờ xác nhận từ cổng thanh toán"
                  : "Đang kiểm tra trạng thái thanh toán..."}
              </h1>
              <p className="text-sm text-slate-500 mt-1">
                {pollTimedOut
                  ? "Hệ thống chưa nhận được phản hồi IPN từ cổng thanh toán. Bạn có thể bấm Kiểm tra lại hoặc Thanh toán lại."
                  : "Vui lòng đợi trong giây lát, hệ thống đang đồng bộ kết quả từ cổng thanh toán."}
              </p>
            </div>
          </>
        )}

        {error && (
          <div className="p-3.5 bg-rose-50 border border-rose-200 text-rose-800 rounded-xl text-xs font-semibold">
            {error}
          </div>
        )}

        {/* Payment Details Box */}
        {payment && (
          <div className="bg-slate-50 border border-slate-100 rounded-2xl p-4 text-left text-xs space-y-2">
            <div className="flex justify-between">
              <span className="text-slate-500">Mã đơn hàng:</span>
              <span className="font-bold text-slate-800">#{payment.orderId.slice(-8).toUpperCase()}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500">Phương thức:</span>
              <span className="font-bold text-slate-800">
                {getPaymentMethodLabel(payment.method)} (Lần #{payment.attemptNo})
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500">Số tiền:</span>
              <span className="font-black text-amber-800">{formatCurrency(payment.amount)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500">Trạng thái xác thực DB:</span>
              <span
                className={`font-bold ${
                  isPaid
                    ? "text-emerald-700"
                    : isFailed
                    ? "text-rose-700"
                    : "text-amber-700"
                }`}
              >
                {payment.status}
              </span>
            </div>
          </div>
        )}

        {/* BUG-7: Dev Sandbox Fallback IPN Simulator (Admin only) */}
        {canSimulateDevIpn && payment && isPending && (
          <div className="p-4 bg-violet-50 border border-violet-200 rounded-2xl text-left space-y-3">
            <div className="flex items-center gap-2 text-xs font-bold text-violet-900">
              <Terminal size={14} /> Chế độ Dev Sandbox Fallback (Chỉ Admin)
            </div>
            <p className="text-[11px] text-violet-700 leading-relaxed">
              Cổng MoMo Sandbox đang trả về fallback. Bạn có thể giả lập callback IPN có chữ ký HMAC-SHA256 hợp lệ để kiểm thử:
            </p>
            <div className="flex flex-wrap gap-2">
              <Button
                size="sm"
                disabled={actionLoading}
                onClick={() => handleDevSimulateIpn(true)}
                className="bg-emerald-600 hover:bg-emerald-700 text-white text-xs"
              >
                Giả lập thanh toán thành công
              </Button>
              <Button
                size="sm"
                variant="outline"
                disabled={actionLoading}
                onClick={() => handleDevSimulateIpn(false)}
                className="border-rose-300 text-rose-700 hover:bg-rose-50 text-xs"
              >
                Giả lập thanh toán thất bại
              </Button>
            </div>
          </div>
        )}

        {/* Actions */}
        <div className="flex flex-wrap items-center justify-center gap-3 pt-2">
          {isPending && (
            <Button
              variant="outline"
              disabled={isLoading || actionLoading}
              onClick={handleManualCheck}
              className="flex items-center gap-1.5"
            >
              <RefreshCw size={14} className={isLoading ? "animate-spin" : ""} /> Kiểm tra lại
            </Button>
          )}

          {(isFailed || (isPending && pollTimedOut)) && orderId && (
            <Button
              disabled={actionLoading}
              isLoading={actionLoading}
              onClick={handleRetryPayment}
              className="bg-amber-800 hover:bg-amber-900 text-white flex items-center gap-1.5"
            >
              <CreditCard size={14} /> Thanh toán lại
            </Button>
          )}

          <Link to="/my-orders">
            <Button variant={isPaid ? "primary" : "outline"} className="flex items-center gap-1.5">
              <ShoppingBag size={14} /> Xem đơn hàng của tôi
            </Button>
          </Link>
        </div>
      </div>
    </div>
  );
};
