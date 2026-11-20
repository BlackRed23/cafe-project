import { apiClient, unwrapApiField } from "./client";
import type {
  CreateOrderPayload,
  Order,
  OrderOperation,
  OrderOperationInput,
  EditOrderItemsInput,
} from "../types/order.types";

const VALID_ORDER_STATUSES = new Set([
  "PENDING",
  "PROCESSING",
  "PREPARING",
  "COMPLETED",
  "CANCELLED",
]);
const VALID_PAYMENT_STATUSES = new Set([
  "PENDING",
  "SUCCESS",
  "PAID",
  "FAILED",
  "REFUNDED",
]);

type OrderFilters = {
  status?: string | null;
  paymentStatus?: string | null;
};

const normalizeOrderFilters = (filters?: OrderFilters) => {
  const params: Record<string, string> = {};

  if (
    filters?.status &&
    (filters.status === "CONFIRMED" || VALID_ORDER_STATUSES.has(filters.status))
  ) {
    params.status =
      filters.status === "CONFIRMED" ? "PROCESSING" : filters.status;
  }

  if (
    filters?.paymentStatus &&
    VALID_PAYMENT_STATUSES.has(filters.paymentStatus)
  ) {
    params.paymentStatus = filters.paymentStatus;
  }

  return Object.keys(params).length > 0 ? params : undefined;
};

export { salesError as getOrderErrorMessage } from "../pages/admin/salesFeedback";

const confirmedField = <T>(data: unknown, key: string): T => {
  if (
    !data ||
    typeof data !== "object" ||
    ("success" in data && data.success === false)
  )
    throw new Error("Sales response not confirmed");
  return unwrapApiField<T>(data, key);
};
const orderList = (data: unknown): Order[] => {
  const rows = confirmedField<Order[]>(data, "orders");
  if (!Array.isArray(rows))
    throw new Error("Order list response not confirmed");
  return rows.map(normalizeOrder);
};

const normalizeOrder = (order: Order): Order => {
  if (!order?.id) throw new Error("Order response not confirmed");
  return {
    ...order,
    paymentMethod: order?.paymentMethod ?? order?.payment?.method ?? "CASH",
    paymentStatus: order?.paymentStatus ?? order?.payment?.status ?? "PENDING",
    items: order?.items?.map((item: NonNullable<Order["items"]>[number]) => ({
      ...item,
      price: item?.price ?? item?.unitPrice ?? 0,
      product: item?.product ?? {
        id: item.productId,
        name: item?.productName ?? "Sản phẩm",
        unit: "ly",
        price: item.price,
      },
    })),
  };
};

const normalizeOrderPayload = (
  payload: CreateOrderPayload,
): CreateOrderPayload => {
  const normalized = {
    ...(payload.requestId ? { requestId: payload.requestId } : {}),
    items: payload.items.map((item) => ({
      productId: String(item.productId ?? "").trim(),
      quantity: Number(item.quantity),
      ...(item.toppings && item.toppings.length > 0
        ? { toppings: item.toppings }
        : {}),
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

const operationResult = (data: unknown): OrderOperation => {
  const operation = confirmedField<OrderOperation>(data, "operation");
  if (!operation?.id || !["REQUESTED", "APPLIED"].includes(operation.status))
    throw new Error("Operation response not confirmed");
  return operation;
};
const path = (id: string) => `/orders/${encodeURIComponent(id)}`;

export const ordersApi = {
  getOrderByRequest: async (requestId: string): Promise<Order> =>
    normalizeOrder(
      confirmedField<Order>(
        (
          await apiClient.get(
            `/orders/by-request/${encodeURIComponent(requestId)}`,
          )
        ).data,
        "order",
      ),
    ),
  requestOperation: async (
    id: string,
    payload: OrderOperationInput,
  ): Promise<OrderOperation> =>
    operationResult(
      (await apiClient.post(`${path(id)}/operations`, payload)).data,
    ),
  approveOperation: async (
    id: string,
    operationId: string,
    expectedVersion: number,
  ): Promise<OrderOperation> =>
    operationResult(
      (
        await apiClient.post(
          `${path(id)}/operations/${encodeURIComponent(operationId)}/approve`,
          { expectedVersion },
        )
      ).data,
    ),
  editItems: async (
    id: string,
    payload: EditOrderItemsInput,
  ): Promise<OrderOperation> =>
    operationResult((await apiClient.patch(`${path(id)}/items`, payload)).data),
  prepareItem: async (
    id: string,
    itemId: string,
    payload: { requestId: string; expectedVersion: number },
  ): Promise<OrderOperation> =>
    operationResult(
      (
        await apiClient.post(
          `${path(id)}/items/${encodeURIComponent(itemId)}/prepare`,
          payload,
        )
      ).data,
    ),
  createOrder: async (payload: CreateOrderPayload): Promise<Order> => {
    const response = await apiClient.post(
      "/orders",
      normalizeOrderPayload(payload),
    );
    return normalizeOrder(confirmedField<Order>(response.data, "order"));
  },

  getMyOrders: async (): Promise<Order[]> => {
    const response = await apiClient.get("/orders/me");
    return orderList(response.data);
  },

  getOrderById: async (id: string): Promise<Order> => {
    const response = await apiClient.get(path(id));
    return normalizeOrder(confirmedField<Order>(response.data, "order"));
  },

  getOrders: async (filters?: OrderFilters): Promise<Order[]> => {
    const response = await apiClient.get("/orders", {
      params: normalizeOrderFilters(filters),
    });
    return orderList(response.data);
  },

  confirmOrder: async (id: string): Promise<Order> => {
    return ordersApi.updateOrderStatus(id, { status: "CONFIRMED" });
  },

  confirmPayment: async (id: string, note?: string): Promise<Order> => {
    const response = await apiClient.post(`${path(id)}/confirm-payment`, {
      ...(note ? { note } : {}),
    });
    return normalizeOrder(confirmedField<Order>(response.data, "order"));
  },

  updateOrderStatus: async (
    id: string,
    payload: {
      status?: string;
      paymentStatus?: string;
      expectedVersion?: number;
    },
  ): Promise<Order> => {
    const response = await apiClient.patch(`${path(id)}/status`, {
      status: payload.status,
      ...(payload.expectedVersion != null
        ? { expectedVersion: payload.expectedVersion }
        : {}),
      ...(payload.paymentStatus
        ? { paymentStatus: payload.paymentStatus }
        : {}),
    });
    const order = confirmedField<Order>(response.data, "order");
    return normalizeOrder(order);
  },
};
