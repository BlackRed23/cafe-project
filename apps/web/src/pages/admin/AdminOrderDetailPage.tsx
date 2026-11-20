import { useEffect, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { mockEnabled } from "../../mock/config";
import { MockWorkspace } from "../../mock/MockWorkspace";
import { ordersApi } from "../../api/orders.api";
import { paymentsApi } from "../../api/payments.api";
import type { Order } from "../../types/order.types";
import { useAuth } from "../../contexts/AuthContext";
import { useToast } from "../../contexts/ToastContext";
import { Alert } from "../../components/common/Alert";
import { Modal } from "../../components/common/Modal";
import { Loading } from "../../components/common/Loading";
import { formatCurrency } from "../../utils/formatCurrency";
import { formatDate } from "../../utils/formatDate";
import { getPaymentMethodLabel } from "../../utils/payment";
import { getZoneLabel } from "../../utils/shipping";
import {
  beforePreparation,
  displayStatus,
  errorStatus,
  lifecycle,
  nextStatus,
  salesError,
  salesLabels,
} from "./salesFeedback";
import { SalesOperations } from "./SalesOperations";
import "./sales.css";

export const AdminOrderDetailPage = () =>
  mockEnabled ? <MockWorkspace area="orders" /> : <SalesDetail />;
type Action = {
  kind: "status" | "payment" | "refund";
  label: string;
  status?: string;
  expectedVersion?: number;
};
function SalesDetail() {
  const { id } = useParams();
  return <SalesDetailContent key={id} id={id} />;
}
function SalesDetailContent({ id }: { id?: string }) {
  const { isAdmin, isStaff } = useAuth();
  const toast = useToast();
  const [order, setOrder] = useState<Order | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [action, setAction] = useState<Action | null>(null);
  const [busy, setBusy] = useState(false);
  const [stale, setStale] = useState(false);
  const lock = useRef(false);
  const reload = async () => {
    if (id) {
      const row = await ordersApi.getOrderById(id);
      setOrder(row);
      setStale(false);
    }
  };
  useEffect(() => {
    let active = true;
    if (id)
      ordersApi
        .getOrderById(id)
        .then((row) => {
          if (active) setOrder(row);
        })
        .catch((e) => {
          if (active) setError(salesError(e, "Không thể tải đơn hàng."));
        })
        .finally(() => {
          if (active) setLoading(false);
        });
    return () => {
      active = false;
    };
  }, [id]);
  async function perform() {
    if (!order || !action || lock.current || stale) return;
    lock.current = true;
    setBusy(true);
    setError("");
    try {
      if (action.kind === "status")
        setOrder(
          await ordersApi.updateOrderStatus(order.id, {
            status: action.status,
            expectedVersion: action.expectedVersion,
          }),
        );
      else if (action.kind === "payment")
        setOrder(await ordersApi.confirmPayment(order.id));
      else if (order.payment?.id) {
        const payment = await paymentsApi.markPaymentRefunded(order.payment.id);
        if (!payment?.id || payment.status !== "REFUNDED")
          throw new Error("Refund response not confirmed");
        setOrder({ ...order, payment, paymentStatus: "REFUNDED" });
      } else throw new Error("Payment missing");
      toast.success(`${action.label}: máy chủ đã xác nhận.`);
      setAction(null);
      try {
        await reload();
      } catch {
        setError(
          "Thao tác đã thành công; chưa tải được dữ liệu mới. Vui lòng tải lại.",
        );
        setStale(true);
      }
    } catch (e) {
      setError(salesError(e));
      toast.error(salesError(e));
      if (errorStatus(e) === 409) setStale(true);
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  if (loading) return <Loading message="Đang tải đơn hàng…" />;
  if (!order)
    return (
      <div className="sales-workspace">
        <Alert tone="danger">{error || "Không tìm thấy đơn hàng."}</Alert>
        <Link to="/admin/orders">Về danh sách</Link>
      </div>
    );
  const state = displayStatus(order),
    next = nextStatus(order),
    role = isAdmin || isStaff;
  const pendingReplacement = order.itemHistory?.some(
    (item) =>
      item.originalItemId &&
      item.attemptType === "SALE" &&
      item.consumptionStatus === "PENDING" &&
      !item.replacedAt,
  ) ?? false;
  const manualPayment =
    role &&
    state !== "CANCELLED" &&
    order.paymentStatus === "PENDING" &&
    ["CASH", "BANK_TRANSFER", "VIET_QR"].includes(order.paymentMethod);
  const refund =
    isAdmin &&
    order.payment?.method === "CASH" &&
    order.payment.status === "PAID" &&
    order.payment.failureCode === "REFUND_REQUIRED";
  const openStatus = (status: string) =>
    setAction({
      kind: "status",
      status,
      label: salesLabels[status],
      expectedVersion: order.version,
    });
  return (
    <div className="sales-workspace">
      <Link className="sales-link" to="/admin/orders">
        ← Danh sách đơn hàng
      </Link>
      <header className="sales-header">
        <div>
          <p className="sales-eyebrow">
            CHI TIẾT ĐƠN HÀNG · PHIÊN BẢN {order.version ?? "—"}
          </p>
          <h1>Đơn #{order.id.slice(-8).toUpperCase()}</h1>
          <p>{formatDate(order.createdAt)}</p>
        </div>
        <div className="sales-actions">
          <span className="sales-badge" data-status={state}>
            {salesLabels[state] || state}
          </span>
          <button
            disabled={busy}
            onClick={async () => {
              try {
                await reload();
                setAction(null);
                setError("");
              } catch (e) {
                setError(salesError(e));
              }
            }}
          >
            Tải lại
          </button>
        </div>
      </header>
      {error && <Alert tone="danger">{error}</Alert>}
      <ol className="sales-timeline" aria-label="Tiến trình đơn hàng">
        {lifecycle.map((step, index) => (
          <li
            key={step}
            aria-current={state === step ? "step" : undefined}
            data-done={
              state !== "CANCELLED" &&
              index <= lifecycle.indexOf(state as (typeof lifecycle)[number])
            }
          >
            <span>{index + 1}</span>
            {salesLabels[step]}
          </li>
        ))}
      </ol>
      {state === "CANCELLED" && (
        <Alert tone="warning">
          Đơn đã hủy. Lịch sử tiêu hao và thanh toán được giữ nguyên.
        </Alert>
      )}
      <div className="sales-detail-grid">
        <div className="sales-stack">
          <section className="sales-panel">
            <h2>Thông tin đơn hàng</h2>
            <div className="sales-info-grid">
              <div>
                <h3>Khách hàng</h3>
                <p>{order.customer?.name || "Khách hàng"}</p>
                <p>{order.customer?.email}</p>
              </div>
              <div>
                <h3>Giao hàng</h3>
                <p>{order.shippingName || "Chưa cung cấp"}</p>
                <p>{order.shippingPhone}</p>
                <p>{order.shippingAddress}</p>
                {order.shippingZone && (
                  <p>{getZoneLabel(order.shippingZone)}</p>
                )}
              </div>
            </div>
            <h3>Ghi chú</h3>
            <p>{order.note || "Không có ghi chú."}</p>
          </section>
          <section className="sales-panel">
            <h2>Món trong đơn</h2>
            <p className="sales-muted">
              Giá, công thức và giá vốn theo dữ liệu đã ghi nhận.
            </p>
            {order.items?.map((item) => (
              <article className="sales-item" key={item.id}>
                <div className="sales-line">
                  <div>
                    <h3>
                      {item.productName || item.product?.name || item.productId}
                    </h3>
                    <p>
                      {item.quantity} ×{" "}
                      {formatCurrency(item.unitPrice ?? item.price)}
                    </p>
                  </div>
                  <strong>
                    {formatCurrency(
                      item.subtotal ?? item.price * item.quantity,
                    )}
                  </strong>
                </div>
                {item.toppings?.map((t) => (
                  <p key={t.id}>
                    + {t.toppingName || "Topping"} × {t.quantity} ·{" "}
                    {formatCurrency((t.unitPrice ?? t.price) * t.quantity)}
                  </p>
                ))}
                <small>
                  Công thức v{item.recipeVersion ?? "—"} ·{" "}
                  {salesLabels[item.consumptionStatus ?? ""] ||
                    item.consumptionStatus}
                </small>
                {item.totalCost != null && (
                  <p>Giá vốn: {formatCurrency(item.totalCost)}</p>
                )}
                {item.ingredientCost != null && (
                  <small>
                    Nguyên liệu: {formatCurrency(item.ingredientCost)} ·
                    Topping: {formatCurrency(item.toppingCost ?? 0)}
                  </small>
                )}
                {item.grossProfit != null && (
                  <p>Lợi nhuận gộp: {formatCurrency(item.grossProfit)}</p>
                )}
              </article>
            ))}
          </section>
          <section className="sales-panel">
            <h2>Lịch sử món</h2>
            <p className="sales-muted">
              Bao gồm món vô hiệu, món đã thay và lần pha lại.
            </p>
            <div className="sales-table-wrap">
              <table className="sales-table">
                <thead>
                  <tr>
                    <th>Món / liên kết</th>
                    <th>Loại</th>
                    <th>Giá ghi nhận</th>
                    <th>Tiêu hao</th>
                  </tr>
                </thead>
                <tbody>
                  {order.itemHistory?.map((item) => (
                    <tr key={item.id}>
                      <td>
                        {item.productId}
                        <small>
                          #{item.id.slice(-8)}
                          {item.originalItemId &&
                            ` ← #${item.originalItemId.slice(-8)}`}
                        </small>
                        <small>
                          Công thức v{item.recipeVersion ?? "—"}
                          {item.replacedAt && " · Đã thay thế"}
                        </small>
                      </td>
                      <td>
                        {salesLabels[item.attemptType ?? ""] ||
                          item.attemptType}
                      </td>
                      <td>
                        {item.quantity} × {formatCurrency(item.price)}
                      </td>
                      <td>
                        {salesLabels[item.consumptionStatus ?? ""] ||
                          item.consumptionStatus}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </div>
        <aside className="sales-stack">
          <section className="sales-panel">
            <h2>Thanh toán</h2>
            <p>
              {getPaymentMethodLabel(order.paymentMethod)} ·{" "}
              {order.paymentStatus === "PENDING"
                ? "Chờ thanh toán"
                : salesLabels[order.paymentStatus] || order.paymentStatus}
            </p>
            <dl className="sales-totals">
              {[
                ["Tiền hàng", order.totalAmount - (order.shippingFee ?? 0)],
                ["Vận chuyển", order.shippingFee],
                ["Tổng gốc", order.totalAmount],
                ["Điều chỉnh", order.adjustmentTotal],
                ["Phải trả sau điều chỉnh", order.adjustedPayable],
                ["Cần thu thêm", order.additionalAmountDue],
                ["Cần hoàn", order.refundDue],
                ["Giá vốn", order.totalCogs],
                ["Lợi nhuận gộp", order.grossProfit],
              ].map(
                ([label, value]) =>
                  value != null && (
                    <div key={String(label)}>
                      <dt>{label}</dt>
                      <dd>{formatCurrency(Number(value))}</dd>
                    </div>
                  ),
              )}
            </dl>
            {order.payment && (
              <p className="sales-muted">
                Giao dịch #{order.payment.id.slice(-8)} ·{" "}
                {formatCurrency(order.payment.amount)} ·{" "}
                {salesLabels[order.payment.status] || order.payment.status}
                {order.payment.paidAt &&
                  ` · ${formatDate(order.payment.paidAt)}`}
              </p>
            )}
            <p className="sales-muted">
              Điều chỉnh không đồng nghĩa đã thu tiền hoặc hoàn tiền.
            </p>
            {order.payment?.failureCode === "REFUND_REQUIRED" && (
              <Alert tone="warning">
                Cần hoàn tiền riêng. Hoàn tiền trực tuyến phải đối soát với nhà
                cung cấp.
              </Alert>
            )}
          </section>
          {role && (
            <section className="sales-panel">
              <h2>Thao tác đơn hàng</h2>
              <div className="sales-action-stack">
                {next && (
                  <button
                    className="sales-primary"
                    disabled={busy || stale || order.version == null || (next === "COMPLETED" && pendingReplacement)}
                    onClick={() => openStatus(next)}
                  >
                    {next === "CONFIRMED"
                      ? "Xác nhận đơn"
                      : next === "PREPARING"
                        ? "Bắt đầu pha chế"
                        : "Hoàn thành đơn"}
                  </button>
                )}
                {next === "COMPLETED" && pendingReplacement && (
                  <Alert tone="warning">
                    Còn món thay thế chưa pha. Hoàn tất pha chế các món này trước khi kết thúc đơn.
                  </Alert>
                )}
                {beforePreparation(order) && (
                  <button
                    disabled={busy || stale || order.version == null}
                    onClick={() => openStatus("CANCELLED")}
                  >
                    Hủy trước pha chế
                  </button>
                )}
                {manualPayment && (
                  <button
                    disabled={busy || stale}
                    onClick={() =>
                      setAction({
                        kind: "payment",
                        label: "Xác nhận đã nhận tiền",
                      })
                    }
                  >
                    Xác nhận đã nhận tiền
                  </button>
                )}
                {refund && (
                  <button
                    disabled={busy || stale}
                    onClick={() =>
                      setAction({
                        kind: "refund",
                        label: "Xác nhận hoàn tiền mặt",
                      })
                    }
                  >
                    Xác nhận đã hoàn tiền mặt
                  </button>
                )}
              </div>
              <p className="sales-muted">
                Xác nhận giữ nguyên tồn vật lý. Bắt đầu pha chế tiêu hao nguyên
                liệu; hoàn thành không trừ lần nữa.
              </p>
            </section>
          )}
        </aside>
      </div>
      <SalesOperations
        order={order}
        onRefresh={reload}
        disabled={busy || stale}
      />
      <Modal
        isOpen={!!action}
        onClose={() => {
          if (!busy) setAction(null);
        }}
        title={action?.label || "Xác nhận"}
      >
        <div className="sales-workspace sales-form">
          {error && <Alert tone="danger">{error}</Alert>}
          <p>
            {action?.status === "PREPARING"
              ? "Bắt đầu tiêu hao nguyên liệu theo FEFO. Xác nhận bắt đầu pha chế?"
              : action?.status === "COMPLETED"
                ? "Hoàn thành đơn, không tiêu hao kho thêm. Thanh toán được xử lý riêng."
                : action?.kind === "refund"
                  ? "Chỉ xác nhận sau khi đã thực trả tiền mặt cho khách."
                  : action?.kind === "payment"
                    ? "Chỉ xác nhận khi đã thực nhận tiền từ khách."
                    : `Xác nhận thao tác “${action?.label}”?`}
          </p>
          <button
            className="sales-primary"
            disabled={busy || stale}
            onClick={perform}
          >
            {busy ? "Đang xử lý…" : "Xác nhận"}
          </button>
        </div>
      </Modal>
    </div>
  );
}
