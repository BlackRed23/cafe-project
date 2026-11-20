import { useEffect, useRef, useState } from "react";
import { ordersApi } from "../../api/orders.api";
import { productsApi } from "../../api/products.api";
import type {
  Order,
  OrderItemPayload,
  OrderOperationInput,
} from "../../types/order.types";
import type { Product } from "../../types/product.types";
import { useAuth } from "../../contexts/AuthContext";
import { useToast } from "../../contexts/ToastContext";
import { Modal } from "../../components/common/Modal";
import { Alert } from "../../components/common/Alert";
import { formatCurrency } from "../../utils/formatCurrency";
import { formatDate } from "../../utils/formatDate";
import { SalesItemEditor } from "./SalesCreateOrder";
import {
  beforePreparation,
  canEditItems,
  errorStatus,
  salesError,
  salesLabels,
  uncertainOutcome,
} from "./salesFeedback";

type Mode = "CANCEL" | "REMAKE" | "CORRECTION" | "EDIT" | "APPROVE" | "PREPARE";
type Intent = {
  mode: Mode;
  target: string;
  expectedVersion: number;
  requestId: string;
  reason: string;
  originalItemId?: string;
  items: OrderItemPayload[];
};
export function SalesOperations({
  order,
  onRefresh,
  disabled,
}: {
  order: Order;
  onRefresh: () => Promise<void>;
  disabled: boolean;
}) {
  const { isAdmin, isStaff } = useAuth();
  const toast = useToast();
  const [mode, setMode] = useState<Mode | null>(null);
  const [target, setTarget] = useState("");
  const [reason, setReason] = useState("");
  const [original, setOriginal] = useState("");
  const [items, setItems] = useState<OrderItemPayload[]>([
    { productId: "", quantity: 1 },
  ]);
  const [products, setProducts] = useState<Product[]>([]);
  const [intent, setIntent] = useState<Intent | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const [conflict, setConflict] = useState(false);
  const [unknown, setUnknown] = useState(false);
  const [needsRefresh, setNeedsRefresh] = useState(false);
  const lock = useRef(false);
  const role = isAdmin || isStaff;
  useEffect(() => {
    if (mode !== "EDIT" && mode !== "CORRECTION") return;
    let active = true;
    productsApi
      .getProducts()
      .then((rows) => {
        if (active)
          setProducts(
            rows.filter(
              (p) =>
                p.requiresRecipe === true &&
                p.isActive !== false &&
                !p.deletedAt,
            ),
          );
      })
      .catch((e) => {
        if (active) setError(salesError(e, "Không thể tải sản phẩm thay thế."));
      });
    return () => {
      active = false;
    };
  }, [mode]);
  const open = (value: Mode, id = "") => {
    if (intent || unknown) return;
    setMode(value);
    setTarget(id);
    setReason("");
    setOriginal("");
    setError("");
    setConfirmed(false);
    setConflict(false);
    setItems(
      value === "EDIT"
        ? (order.items ?? []).map((i) => ({
            productId: i.productId,
            quantity: i.quantity,
          }))
        : [{ productId: "", quantity: 1 }],
    );
  };
  const frozen = busy || !!intent;
  const consumed =
    !!order.stockDeductedAt &&
    ["PREPARING", "COMPLETED"].includes(order.status);
  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (
      !mode ||
      lock.current ||
      !confirmed ||
      disabled ||
      conflict ||
      order.version == null
    )
      return;
    if (
      ["CANCEL", "REMAKE", "CORRECTION", "EDIT"].includes(mode) &&
      !reason.trim()
    ) {
      setError("Vui lòng nhập lý do.");
      return;
    }
    if (["REMAKE", "CORRECTION"].includes(mode) && !original) {
      setError("Chọn món gốc đã pha.");
      return;
    }
    if (
      ["EDIT", "CORRECTION"].includes(mode) &&
      (!items.length ||
        items.some(
          (i) =>
            !i.productId ||
            !Number.isSafeInteger(i.quantity) ||
            i.quantity <= 0,
        ))
    ) {
      setError("Chọn món và số lượng nguyên dương.");
      return;
    }
    const command = intent ?? {
      mode,
      target,
      expectedVersion: order.version,
      requestId: crypto.randomUUID(),
      reason: reason.trim(),
      originalItemId: original || undefined,
      items: structuredClone(items),
    };
    setIntent(command);
    lock.current = true;
    setBusy(true);
    setError("");
    try {
      let operation;
      if (command.mode === "APPROVE")
        operation = await ordersApi.approveOperation(
          order.id,
          command.target,
          command.expectedVersion,
        );
      else if (command.mode === "PREPARE")
        operation = await ordersApi.prepareItem(order.id, command.target, {
          requestId: command.requestId,
          expectedVersion: command.expectedVersion,
        });
      else if (command.mode === "EDIT")
        operation = await ordersApi.editItems(order.id, {
          requestId: command.requestId,
          expectedVersion: command.expectedVersion,
          reason: command.reason,
          items: command.items.map(({ productId, quantity }) => ({
            productId,
            quantity,
          })),
        });
      else
        operation = await ordersApi.requestOperation(order.id, {
          requestId: command.requestId,
          expectedVersion: command.expectedVersion,
          kind: command.mode as OrderOperationInput["kind"],
          reason: command.reason,
          ...(command.originalItemId
            ? { originalItemId: command.originalItemId }
            : {}),
          ...(command.mode === "CORRECTION"
            ? { replacement: command.items[0] }
            : {}),
        });
      toast.success(
        operation.status === "REQUESTED"
          ? "Đã gửi yêu cầu. Chờ ADMIN phê duyệt."
          : "Máy chủ đã áp dụng thao tác.",
      );
      setIntent(null);
      setUnknown(false);
      setMode(null);
      try {
        await onRefresh();
        setNeedsRefresh(false);
      } catch {
        setNeedsRefresh(true);
        setError("Thao tác đã thành công. Tải lại dữ liệu trước khi tiếp tục.");
      }
    } catch (e) {
      setError(salesError(e));
      toast.error(salesError(e));
      if (errorStatus(e) === 409) setConflict(true);
      const uncertain = uncertainOutcome(e);
      setUnknown(uncertain || unknown);
      if (!uncertain && !unknown) setIntent(null);
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  const close = () => {
    if (!busy && !unknown) {
      setMode(null);
      setIntent(null);
    }
  };
  return (
    <section className="sales-panel sales-workspace">
      <div className="sales-header">
        <div>
          <p className="sales-eyebrow">KIỂM SOÁT & ĐỐI SOÁT</p>
          <h2>Yêu cầu và lịch sử thao tác</h2>
        </div>
        {role && (
          <div className="sales-actions">
            {canEditItems(order) && (
              <button
                disabled={disabled || busy || !!intent || needsRefresh}
                onClick={() => open("EDIT")}
              >
                Sửa món trước pha chế
              </button>
            )}
            {consumed &&
              (["CANCEL", "REMAKE", "CORRECTION"] as Mode[]).map((value) => (
                <button
                  key={value}
                  disabled={disabled || busy || !!intent || needsRefresh}
                  onClick={() => open(value)}
                >
                  {salesLabels[value]}
                </button>
              ))}
          </div>
        )}
      </div>
      {error && !mode && <Alert tone="danger">{error}</Alert>}
      {needsRefresh && (
        <button
          onClick={async () => {
            try {
              await onRefresh();
              setNeedsRefresh(false);
              setError("");
            } catch (e) {
              setError(salesError(e));
            }
          }}
        >
          Tải lại dữ liệu
        </button>
      )}
      {beforePreparation(order) && !canEditItems(order) && (
        <p className="sales-muted">
          Sửa món bị giới hạn khi đã thanh toán hoặc có giao dịch trực tuyến;
          cần đối soát trước.
        </p>
      )}
      {!order.operations?.length && (
        <p className="sales-muted">Chưa có thao tác điều chỉnh.</p>
      )}
      {order.operations?.map((op) => (
        <article key={op.id} className="sales-operation">
          <div className="sales-line">
            <h3>{salesLabels[op.kind] || op.kind}</h3>
            <span className="sales-badge" data-status={op.status}>
              {salesLabels[op.status] || op.status}
            </span>
          </div>
          <p>{op.reason}</p>
          <small>
            Mã #{op.id.slice(-8)} · Người yêu cầu: {op.actorId || "—"}
            {op.createdAt && ` · ${formatDate(op.createdAt)}`}
          </small>
          {op.originalItemId && (
            <p>
              Món gốc #{op.originalItemId.slice(-8)}
              {op.replacementItemId && ` → #${op.replacementItemId.slice(-8)}`}
            </p>
          )}
          {op.approvedBy && (
            <p>
              Người duyệt: {op.approvedBy}
              {op.approvedAt && ` · ${formatDate(op.approvedAt)}`}
            </p>
          )}
          {op.amountDelta != null && (
            <p>Điều chỉnh: {formatCurrency(Number(op.amountDelta))}</p>
          )}
          {isAdmin && op.status === "REQUESTED" && (
            <button
              className="sales-primary"
              disabled={disabled || busy || !!intent || needsRefresh}
              onClick={() => open("APPROVE", op.id)}
            >
              Duyệt yêu cầu
            </button>
          )}
        </article>
      ))}
      {role &&
        consumed &&
        order.itemHistory
          ?.filter(
            (i) =>
              i.originalItemId &&
              i.attemptType === "SALE" &&
              i.consumptionStatus === "PENDING" &&
              !i.replacedAt,
          )
          .map((item) => (
            <div className="sales-item" key={item.id}>
              <p>
                Món thay thế #{item.id.slice(-8)} · Chưa tiêu hao nguyên liệu
              </p>
              <button
                disabled={disabled || busy || !!intent || needsRefresh}
                onClick={() => open("PREPARE", item.id)}
              >
                Bắt đầu pha món thay thế
              </button>
            </div>
          ))}
      <Modal
        isOpen={!!mode}
        onClose={close}
        title={
          mode === "EDIT"
            ? "Sửa món trước pha chế"
            : mode === "APPROVE"
              ? "ADMIN duyệt yêu cầu"
              : mode === "PREPARE"
                ? "Pha món thay thế"
                : salesLabels[mode ?? ""] || "Thao tác đơn"
        }
        size="lg"
      >
        <form className="sales-workspace sales-form" onSubmit={submit}>
          {error && <Alert tone="danger">{error}</Alert>}
          {unknown && (
            <Alert tone="warning">
              Kết quả chưa rõ. Giữ hộp thoại này; thử lại cùng mã để máy chủ đối
              soát. Không tạo yêu cầu mới.
            </Alert>
          )}
          {conflict && (
            <button
              type="button"
              disabled={busy}
              onClick={async () => {
                try {
                  await onRefresh();
                  setConflict(false);
                  if (!unknown) {
                    setIntent(null);
                    setConfirmed(false);
                  }
                  setError(
                    unknown
                      ? "Đã tải dữ liệu. Chỉ thử lại yêu cầu cũ để đối soát."
                      : "Đã tải phiên bản mới. Kiểm tra nội dung và xác nhận lại.",
                  );
                } catch (e) {
                  setError(salesError(e));
                }
              }}
            >
              Tải lại để kiểm tra xung đột
            </button>
          )}
          <fieldset disabled={frozen}>
            {["CANCEL", "REMAKE", "CORRECTION", "EDIT"].includes(
              mode ?? "",
            ) && (
              <label>
                Lý do
                <textarea
                  required
                  maxLength={1000}
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                />
              </label>
            )}
            {["REMAKE", "CORRECTION"].includes(mode ?? "") && (
              <label>
                Món gốc đã pha
                <select
                  required
                  value={original}
                  onChange={(e) => setOriginal(e.target.value)}
                >
                  <option value="">Chọn món</option>
                  {order.items
                    ?.filter((i) => i.consumptionStatus === "COMMITTED")
                    .map((i) => (
                      <option key={i.id} value={i.id}>
                        {i.productName || i.product?.name || i.productId} · #
                        {i.id.slice(-8)} × {i.quantity}
                      </option>
                    ))}
                </select>
              </label>
            )}
            {["EDIT", "CORRECTION"].includes(mode ?? "") && (
              <>
                <SalesItemEditor
                  single={mode === "CORRECTION"}
                  items={items}
                  products={products}
                  onChange={(value) =>
                    setItems(mode === "CORRECTION" ? value.slice(0, 1) : value)
                  }
                />
                <p className="sales-muted">
                  Thay danh sách món bằng sản phẩm có công thức. Topping không
                  được chuyển sang món thay thế; món cũ vẫn giữ lịch sử.
                </p>
              </>
            )}
          </fieldset>
          <p>
            {mode === "REMAKE"
              ? "ADMIN duyệt sẽ pha lại theo công thức gốc, không thu thêm tiền khách."
              : mode === "CANCEL"
                ? "Yêu cầu ADMIN duyệt hủy; nguyên liệu đã tiêu hao không được hoàn kho."
                : mode === "APPROVE"
                  ? "Duyệt sẽ áp dụng yêu cầu trên máy chủ và có thể tiêu hao nguyên liệu. Kiểm tra lịch sử trước khi xác nhận."
                  : mode === "PREPARE"
                    ? "Tiêu hao nguyên liệu cho món thay thế đã được duyệt."
                    : "Máy chủ kiểm tra tồn kho, phiên bản và đối soát thanh toán."}
          </p>
          <label className="sales-check">
            <input
              type="checkbox"
              checked={confirmed}
              disabled={busy}
              onChange={(e) => setConfirmed(e.target.checked)}
            />
            Tôi đã kiểm tra và xác nhận thao tác.
          </label>
          <button
            type="submit"
            className="sales-primary"
            disabled={
              busy ||
              !confirmed ||
              conflict ||
              disabled ||
              order.version == null
            }
          >
            {busy
              ? "Đang xử lý…"
              : unknown
                ? "Thử lại cùng mã yêu cầu"
                : "Xác nhận"}
          </button>
        </form>
      </Modal>
    </section>
  );
}
