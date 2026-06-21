import { apiClient, unwrapApiField, unwrapApiList } from "./client";
import type { CreateOrderPayload, Order } from "../types/order.types";

const VALID_ORDER_STATUSES = new Set(["PENDING", "CONFIRMED", "PROCESSING", "COMPLETED", "CANCELLED"]);
const VALID_PAYMENT_STATUSES = new Set(["PENDING", "SUCCESS", "PAID", "FAILED", "REFUNDED"]);

type OrderFilters = {
  status?: string | null;
  paymentStatus?: string | null;
};

const normalizeOrderFilters = (filters?: OrderFilters) => {
  const params: Record<string, string> = {};

  if (filters?.status && VALID_ORDER_STATUSES.has(filters.status)) {
    params.status = filters.status;
  }

  if (filters?.paymentStatus && VALID_PAYMENT_STATUSES.has(filters.paymentStatus)) {
    params.paymentStatus = filters.paymentStatus;
  }

  return Object.keys(params).length > 0 ? params : undefined;
};

const extractBackendMessage = (error: any): string | undefined => {
  const data = error?.response?.data;
  const errors = data?.errors;

  if (Array.isArray(errors) && errors.length > 0) {
    return errors
      .map((item) => item?.message || item)
      .filter(Boolean)
      .join(". ");
  }

  if (errors && typeof errors === "object") {
    return Object.values(errors)
      .flat()
      .map((item: any) => item?.message || item)
      .filter(Boolean)
      .join(". ");
  }

  return data?.message || data?.error || error?.message;
};

const translateOrderErrorMessage = (message?: string): string | null => {
  if (!message) return null;

  const lower = message.toLowerCase();
  const isInventoryError =
    lower.includes("not enough inventory") ||
    lower.includes("current stock") ||
    lower.includes("requested") ||
    lower.includes("inventory") ||
    lower.includes("stock") ||
    lower.includes("not enough") ||
    lower.includes("không đủ tồn kho") ||
    lower.includes("không đủ hàng") ||
    lower.includes("vừa hết hàng");

  if (!isInventoryError) return null;

  const currentStock =
    message.match(/current stock[^0-9]*(\d+)/i)?.[1] ??
    message.match(/tồn kho[^0-9]*(\d+)/i)?.[1] ??
    message.match(/còn lại[^0-9]*(\d+)/i)?.[1];
  const requested =
    message.match(/requested[^0-9]*(\d+)/i)?.[1] ??
    message.match(/yêu cầu[^0-9]*(\d+)/i)?.[1] ??
    message.match(/bạn đặt[^0-9]*(\d+)/i)?.[1];

  if (currentStock && requested) {
    return `Không đủ tồn kho để tạo đơn hàng. Tồn kho hiện tại: ${currentStock}, số lượng yêu cầu: ${requested}. Vui lòng giảm số lượng hoặc cập nhật giỏ hàng.`;
  }

  return "Không đủ tồn kho để tạo đơn hàng, vui lòng giảm số lượng hoặc cập nhật giỏ hàng.";
};

const translateValidationErrorMessage = (message?: string): string | null => {
  if (!message) return null;

  const lower = message.toLowerCase();

  if (
    lower.includes("paymentmethod") ||
    lower.includes("invalid enum") ||
    lower.includes("payment method")
  ) {
    return "Vui lòng chọn phương thức thanh toán.";
  }

  if (lower.includes("product is required")) {
    return "Sản phẩm trong giỏ hàng không hợp lệ, vui lòng cập nhật giỏ hàng.";
  }

  if (lower.includes("order items cannot be empty")) {
    return "Giỏ hàng đang trống.";
  }

  if (lower.includes("items")) {
    return "Giỏ hàng không hợp lệ, vui lòng kiểm tra lại sản phẩm.";
  }

  if (lower.includes("quantity")) {
    return "Số lượng sản phẩm không hợp lệ.";
  }

  if (
    lower.includes("product not found") ||
    lower.includes("product is inactive") ||
    lower.includes("not available") ||
    lower.includes("inactive") ||
    lower.includes("không tìm thấy sản phẩm") ||
    lower.includes("sản phẩm không còn")
  ) {
    return "Sản phẩm không còn khả dụng, vui lòng cập nhật giỏ hàng.";
  }

  return null;
};

export const getOrderErrorMessage = (error: any, fallback: string): string => {
  const raw = error?.friendlyMessage || extractBackendMessage(error);
  return translateOrderErrorMessage(raw) ?? translateValidationErrorMessage(raw) ?? raw ?? fallback;
};

const normalizeOrder = (order: any): Order => ({
  ...order,
  paymentMethod: order?.paymentMethod ?? order?.payment?.method ?? "CASH",
  paymentStatus: order?.paymentStatus ?? order?.payment?.status ?? "PENDING",
  createdAt: order?.createdAt ?? order?.created_at,
  updatedAt: order?.updatedAt ?? order?.updated_at,
  items: order?.items?.map((item: any) => ({
    ...item,
    price: item?.price ?? item?.unitPrice ?? 0,
    productId: item?.productId ?? item?.product_id,
    product: item?.product ?? {
      id: item?.productId ?? item?.product_id,
      name: item?.productName ?? "Sản phẩm",
      unit: item?.unit,
    },
  })),
});

const normalizeOrderPayload = (payload: CreateOrderPayload): CreateOrderPayload => {
  const normalized = {
    items: payload.items.map((item) => ({
      productId: String(item.productId ?? "").trim(),
      quantity: Number(item.quantity),
    })),
    paymentMethod: payload.paymentMethod,
    shippingName: payload.shippingName.trim(),
    shippingPhone: payload.shippingPhone.trim(),
    shippingAddress: payload.shippingAddress.trim(),
  } as CreateOrderPayload;

  const note = payload.note?.trim();
  if (note) normalized.note = note;

  return normalized;
};

export const ordersApi = {
  createOrder: async (payload: CreateOrderPayload): Promise<Order> => {
    try {
      const response = await apiClient.post("/orders", normalizeOrderPayload(payload));
      return normalizeOrder(unwrapApiField<any>(response.data, "order"));
    } catch (error: any) {
      error.friendlyMessage = getOrderErrorMessage(
        error,
        "Không thể tạo đơn hàng, vui lòng thử lại."
      );
      throw error;
    }
  },

  getMyOrders: async (): Promise<Order[]> => {
    const response = await apiClient.get("/orders/me");
    return unwrapApiList<any>(response.data, "orders").map(normalizeOrder);
  },

  getOrderById: async (id: string): Promise<Order> => {
    const response = await apiClient.get(`/orders/${id}`);
    return normalizeOrder(unwrapApiField<any>(response.data, "order"));
  },

  getOrders: async (filters?: OrderFilters): Promise<Order[]> => {
    const response = await apiClient.get("/orders", { params: normalizeOrderFilters(filters) });
    return unwrapApiList<any>(response.data, "orders").map(normalizeOrder);
  },

  confirmOrder: async (id: string): Promise<Order> => {
    return ordersApi.updateOrderStatus(id, { status: "PROCESSING" });
  },

  updateOrderStatus: async (id: string, payload: { status?: string; paymentStatus?: string }): Promise<Order> => {
    try {
      const response = await apiClient.patch(`/orders/${id}/status`, { status: payload.status });
      let order = unwrapApiField<any>(response.data, "order");

      if (payload.paymentStatus && order?.payment?.id) {
        try {
          const paymentResponse = await apiClient.patch(`/payments/${order.payment.id}/status`, {
            status: payload.paymentStatus,
          });
          order = {
            ...order,
            payment: unwrapApiField<any>(paymentResponse.data, "payment"),
          };
        } catch (error: any) {
          error.partialPaymentUpdateFailed = true;
          error.friendlyMessage =
            "Đã cập nhật đơn hàng nhưng cập nhật thanh toán thất bại. Vui lòng kiểm tra lại trạng thái thanh toán.";
          throw error;
        }
      }

      return normalizeOrder(order);
    } catch (error: any) {
      if (!error.friendlyMessage) {
        error.friendlyMessage = getOrderErrorMessage(
          error,
          "Không thể cập nhật trạng thái đơn hàng, vui lòng thử lại."
        );
      }
      throw error;
    }
  },
};
