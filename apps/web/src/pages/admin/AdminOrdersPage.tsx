import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ordersApi } from "../../api/orders.api";
import type { Order } from "../../types/order.types";
import { formatCurrency } from "../../utils/formatCurrency";
import { formatDate } from "../../utils/formatDate";
import { getPaymentMethodLabel } from "../../utils/payment";
import { Alert } from "../../components/common/Alert";
import { Loading } from "../../components/common/Loading";
import { SalesCreateOrder } from "./SalesCreateOrder";
import {
  displayStatus,
  lifecycle,
  salesError,
  salesLabels,
} from "./salesFeedback";
import "./sales.css";

export const AdminOrdersPage = () =>
  <SalesOrders />;
function SalesOrders() {
  const navigate = useNavigate();
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [filter, setFilter] = useState("ALL");
  const [search, setSearch] = useState("");
  const [create, setCreate] = useState(false);
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    let active = true;
    ordersApi
      .getOrders()
      .then((rows) => {
        if (active) {
          setOrders(
            [...rows].sort(
              (a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt),
            ),
          );
          setError("");
        }
      })
      .catch((error) => {
        if (active) setError(salesError(error, "Không thể tải đơn hàng."));
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [revision]);
  const visible = orders.filter(
    (order) =>
      (filter === "ALL" || displayStatus(order) === filter) &&
      `${order.id} ${order.customer?.name ?? ""} ${order.customer?.email ?? ""} ${order.shippingName ?? ""} ${order.shippingPhone ?? ""}`
        .toLocaleLowerCase("vi")
        .includes(search.trim().toLocaleLowerCase("vi")),
  );
  return (
    <div className="sales-workspace">
      <header className="sales-header">
        <div>
          <p className="sales-eyebrow">VẬN HÀNH / BÁN HÀNG</p>
          <h1>Quản lý đơn hàng</h1>
          <p>Theo dõi từng đơn, từ xác nhận đến ly cà phê hoàn thiện.</p>
        </div>
        <div className="sales-actions">
          <button
            onClick={() => {
              setLoading(true);
              setRevision((v) => v + 1);
            }}
            disabled={loading}
          >
            Tải lại
          </button>
          <button className="sales-primary" onClick={() => setCreate(true)}>
            Tạo đơn hàng
          </button>
        </div>
      </header>
      <div className="sales-summary">
        {[
          ["Tổng đơn", orders.length],
          [
            "Chờ xác nhận",
            orders.filter((o) => displayStatus(o) === "PENDING").length,
          ],
          [
            "Đang pha chế",
            orders.filter((o) => displayStatus(o) === "PREPARING").length,
          ],
          [
            "Chờ duyệt",
            orders.reduce(
              (n, o) =>
                n +
                (o.operations?.filter((op) => op.status === "REQUESTED")
                  .length ?? 0),
              0,
            ),
          ],
        ].map(([label, value]) => (
          <div key={label}>
            <span>{label}</span>
            <strong>{value}</strong>
          </div>
        ))}
      </div>
      {error && <Alert tone="danger">{error}</Alert>}
      <section className="sales-panel">
        <div className="sales-toolbar">
          <label>
            Tìm đơn hàng
            <input
              type="search"
              placeholder="Mã đơn, khách hàng, số điện thoại…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </label>
          <label>
            Trạng thái
            <select value={filter} onChange={(e) => setFilter(e.target.value)}>
              {["ALL", ...lifecycle, "CANCELLED"].map((s) => (
                <option key={s} value={s}>
                  {s === "ALL" ? "Tất cả trạng thái" : salesLabels[s]}
                </option>
              ))}
            </select>
          </label>
        </div>
        {loading ? (
          <Loading message="Đang tải đơn hàng…" />
        ) : (
          <>
            <p className="sales-muted">
              {visible.length} đơn phù hợp · Lọc trên danh sách đã tải
            </p>
            <div className="sales-table-wrap">
              <table className="sales-table">
                <caption className="sr-only">Danh sách đơn hàng</caption>
                <thead>
                  <tr>
                    <th>Đơn / thời gian</th>
                    <th>Khách hàng</th>
                    <th>Thanh toán</th>
                    <th>Tổng gốc</th>
                    <th>Trạng thái</th>
                    <th>Chi tiết</th>
                  </tr>
                </thead>
                <tbody>
                  {visible.map((order) => (
                    <tr key={order.id}>
                      <td>
                        <strong>#{order.id.slice(-8).toUpperCase()}</strong>
                        <small>{formatDate(order.createdAt)}</small>
                      </td>
                      <td>
                        {order.shippingName ||
                          order.customer?.name ||
                          "Khách hàng"}
                        <small>
                          {order.shippingPhone || order.customer?.email}
                        </small>
                      </td>
                      <td>
                        {getPaymentMethodLabel(order.paymentMethod)}
                        <small>
                          {order.paymentStatus === "PENDING"
                            ? "Chờ thanh toán"
                            : salesLabels[order.paymentStatus] ||
                              order.paymentStatus}
                        </small>
                      </td>
                      <td>{formatCurrency(order.totalAmount)}</td>
                      <td>
                        <span
                          className="sales-badge"
                          data-status={displayStatus(order)}
                        >
                          {salesLabels[displayStatus(order)] ||
                            displayStatus(order)}
                        </span>
                      </td>
                      <td>
                        <Link
                          className="sales-link"
                          to={`/admin/orders/${order.id}`}
                        >
                          Xem đơn{" "}
                          <span className="sr-only">{order.id.slice(-8)}</span>{" "}
                          →
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {!visible.length && (
              <p className="sales-empty">
                Không có đơn hàng phù hợp. Thử đổi bộ lọc hoặc tạo đơn mới.
              </p>
            )}
          </>
        )}
      </section>
      <SalesCreateOrder
        open={create}
        onClose={() => setCreate(false)}
        onCreated={(order) => navigate(`/admin/orders/${order.id}`)}
      />
    </div>
  );
}
