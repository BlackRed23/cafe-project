import { useEffect, useRef, useState } from "react";
import { ordersApi } from "../../api/orders.api";
import { productsApi } from "../../api/products.api";
import type {
  CreateOrderPayload,
  Order,
  OrderItemPayload,
  PaymentMethod,
} from "../../types/order.types";
import type { Product } from "../../types/product.types";
import { useAuth } from "../../contexts/AuthContext";
import { useToast } from "../../contexts/ToastContext";
import { Modal } from "../../components/common/Modal";
import { Alert } from "../../components/common/Alert";
import { formatCurrency } from "../../utils/formatCurrency";
import {
  salesError,
  submitSalesOrder,
  uncertainOutcome,
  errorStatus,
} from "./salesFeedback";

export function SalesItemEditor({
  items,
  products,
  onChange,
  disabled = false,
  single = false,
}: {
  items: OrderItemPayload[];
  products: Product[];
  onChange: (items: OrderItemPayload[]) => void;
  disabled?: boolean;
  single?: boolean;
}) {
  return (
    <fieldset disabled={disabled} className="sales-item-editor">
      <legend>Món trong đơn</legend>
      {items.map((item, index) => (
        <div className="sales-item-input" key={index}>
          <label>
            Sản phẩm {index + 1}
            <select
              required
              value={item.productId}
              onChange={(e) =>
                onChange(
                  items.map((row, i) =>
                    i === index ? { ...row, productId: e.target.value } : row,
                  ),
                )
              }
            >
              <option value="">Chọn sản phẩm</option>
              {products.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name} · {formatCurrency(p.price)}
                </option>
              ))}
            </select>
          </label>
          <label>
            Số lượng
            <input
              required
              type="number"
              min="1"
              step="1"
              value={item.quantity}
              onChange={(e) =>
                onChange(
                  items.map((row, i) =>
                    i === index
                      ? { ...row, quantity: Number(e.target.value) }
                      : row,
                  ),
                )
              }
            />
          </label>
          <button
            type="button"
            disabled={items.length === 1}
            aria-label={`Xóa món ${index + 1}`}
            onClick={() => onChange(items.filter((_, i) => i !== index))}
          >
            Xóa
          </button>
        </div>
      ))}
      {!single && (
        <button
          type="button"
          onClick={() => onChange([...items, { productId: "", quantity: 1 }])}
        >
          + Thêm món
        </button>
      )}
    </fieldset>
  );
}

export function SalesCreateOrder({
  open,
  onClose,
  onCreated,
}: {
  open: boolean;
  onClose: () => void;
  onCreated: (order: Order) => void;
}) {
  const { user } = useAuth();
  return (
    <SalesCreateForm
      key={user?.id ?? "anonymous"}
      storageKey={`sales-create-intent:${user?.id ?? "anonymous"}`}
      open={open}
      onClose={onClose}
      onCreated={onCreated}
    />
  );
}
function SalesCreateForm({
  storageKey,
  open,
  onClose,
  onCreated,
}: {
  storageKey: string;
  open: boolean;
  onClose: () => void;
  onCreated: (order: Order) => void;
}) {
  const toast = useToast();
  const [saved] = useState(() => {
    try {
      const raw = sessionStorage.getItem(storageKey);
      if (!raw) return { payload: null, error: "" };
      const payload = JSON.parse(raw) as CreateOrderPayload;
      if (!payload.requestId || !Array.isArray(payload.items))
        throw new Error("Invalid intent");
      return { payload, error: "" };
    } catch {
      return {
        payload: null,
        error:
          "Không thể khôi phục yêu cầu trước. Kiểm tra danh sách trước khi tạo đơn.",
      };
    }
  });
  const [products, setProducts] = useState<Product[]>([]);
  const [items, setItems] = useState<OrderItemPayload[]>(
    saved.payload?.items ?? [{ productId: "", quantity: 1 }],
  );
  const [method, setMethod] = useState<PaymentMethod>(
    saved.payload?.paymentMethod ?? "CASH",
  );
  const [name, setName] = useState(saved.payload?.shippingName ?? "");
  const [phone, setPhone] = useState(saved.payload?.shippingPhone ?? "");
  const [address, setAddress] = useState(saved.payload?.shippingAddress ?? "");
  const [note, setNote] = useState(saved.payload?.note ?? "");
  const [error, setError] = useState(saved.error);
  const [busy, setBusy] = useState(false);
  const [intent, setIntent] = useState<CreateOrderPayload | null>(
    saved.payload,
  );
  const [uncertain, setUncertain] = useState(!!saved.payload);
  const locked = useRef(false);
  useEffect(() => {
    if (!open) return;
    let active = true;
    productsApi
      .getProducts()
      .then((rows) => {
        if (active)
          setProducts(
            rows.filter(
              (p) =>
                p.isActive !== false && p.is_active !== false && !p.deletedAt,
            ),
          );
      })
      .catch((e) => {
        if (active)
          setError(
            salesError(e, "Không thể tải sản phẩm. Đóng và mở lại để thử."),
          );
      });
    return () => {
      active = false;
    };
  }, [open]);
  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (locked.current) return;
    if (
      !items.length ||
      items.some(
        (i) =>
          !i.productId || !Number.isSafeInteger(i.quantity) || i.quantity <= 0,
      )
    ) {
      setError("Chọn sản phẩm và số lượng nguyên dương.");
      return;
    }
    const payload = intent ?? {
      requestId: crypto.randomUUID(),
      items: structuredClone(items),
      paymentMethod: method,
      shippingName: name.trim(),
      shippingPhone: phone.trim(),
      shippingAddress: address.trim(),
      note: note.trim(),
    };
    // Persist before network; closing/reloading must not lose uncertain submission identity.
    try {
      sessionStorage.setItem(storageKey, JSON.stringify(payload));
    } catch {
      setError(
        "Không thể lưu mã yêu cầu an toàn. Cho phép lưu trữ phiên rồi thử lại.",
      );
      return;
    }
    setIntent(payload);
    locked.current = true;
    setBusy(true);
    setError("");
    try {
      const order = await submitSalesOrder(ordersApi, payload, uncertain);
      sessionStorage.removeItem(storageKey);
      setIntent(null);
      setUncertain(false);
      toast.success("Đã xác nhận tạo đơn trên máy chủ.");
      onCreated(order);
    } catch (e) {
      const preserve = uncertainOutcome(e) || uncertain || errorStatus(e) === 409;
      setUncertain(preserve);
      setError(salesError(e));
      if (!preserve) {
        sessionStorage.removeItem(storageKey);
        setIntent(null);
      }
    } finally {
      locked.current = false;
      setBusy(false);
    }
  }
  return (
    <Modal
      isOpen={open}
      onClose={() => {
        if (!busy) onClose();
      }}
      title="Tạo đơn hàng"
      size="lg"
    >
      <form className="sales-workspace sales-form" onSubmit={submit}>
        <p>Giá và nguyên liệu được máy chủ xác nhận khi tạo đơn.</p>
        {error && <Alert tone="danger">{error}</Alert>}
        {uncertain && (
          <Alert tone="warning">
            Yêu cầu trước chưa được đối soát. Nội dung được giữ nguyên. Nút bên
            dưới sẽ tra cứu mã cũ trước khi gửi lại.
          </Alert>
        )}
        <fieldset disabled={busy || !!intent}>
          <SalesItemEditor
            items={items}
            products={products}
            onChange={setItems}
          />
          <div className="sales-form-grid">
            <label>
              Người nhận
              <input value={name} onChange={(e) => setName(e.target.value)} />
            </label>
            <label>
              Số điện thoại
              <input
                type="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
              />
            </label>
          </div>
          <label>
            Địa chỉ
            <input
              value={address}
              onChange={(e) => setAddress(e.target.value)}
            />
          </label>
          <label>
            Phương thức
            <select
              value={method}
              onChange={(e) => setMethod(e.target.value as PaymentMethod)}
            >
              <option value="CASH">Tiền mặt</option>
              <option value="BANK_TRANSFER">Chuyển khoản</option>
              <option value="VIET_QR">VietQR</option>
              <option value="MOMO">MoMo</option>
              <option value="VNPAY">VNPAY</option>
            </select>
          </label>
          <label>
            Ghi chú
            <textarea value={note} onChange={(e) => setNote(e.target.value)} />
          </label>
        </fieldset>
        <button type="submit" className="sales-primary" disabled={busy}>
          {busy
            ? "Đang xác nhận…"
            : uncertain
              ? "Đối soát và thử lại yêu cầu cũ"
              : "Xác nhận tạo đơn"}
        </button>
      </form>
    </Modal>
  );
}
