import React, { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import {
  AlertTriangle,
  ArrowRight,
  Bell,
  Bot,
  CheckCircle,
  ClipboardList,
  Inbox,
  ShoppingCart,
  X,
} from "lucide-react";
import { agentLogsApi } from "../../api/agentLogs.api";
import { inventoryApi } from "../../api/inventory.api";
import { ordersApi } from "../../api/orders.api";
import { purchaseRequestsApi } from "../../api/purchaseRequests.api";
import { useToastState } from "../../contexts/ToastContext";
import type { AgentLog, AgentLogNotification } from "../../types/agentLog.types";
import type { Inventory } from "../../types/inventory.types";
import type { Order } from "../../types/order.types";
import type { PurchaseRequest } from "../../types/purchaseRequest.types";

interface Notification {
  id: string;
  type: "low_stock" | "purchase_request" | "agent_error" | "agent_success" | "new_order" | "success" | "error" | "warning" | "info";
  title: string;
  description: string;
  link?: string;
  time?: string;
}

const STORAGE_KEY = "admin_read_notifications";
const IMPORTANT_AGENT_SUCCESS = new Set(["CREATED_PURCHASE_REQUEST", "RECOMMENDED", "SUCCESS"]);
const HIDDEN_AGENT_RESULTS = new Set(["STOCK_OK", "ABOVE_THRESHOLD"]);
const AGENT_NOTIFICATION_TYPES = new Set(["success", "info", "warning", "error"]);

const timeOf = (value?: string) =>
  value
    ? new Date(value).toLocaleTimeString("vi-VN", {
        hour: "2-digit",
        minute: "2-digit",
      })
    : "";

const asRecord = (value: unknown): Record<string, unknown> | null =>
  value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : null;

const getAgentOutputNotification = (log: AgentLog): AgentLogNotification | null => {
  const output = asRecord(log.output);
  const notification = asRecord(output?.notification);
  if (!notification) return null;

  const type = typeof notification.type === "string" ? notification.type : "";
  const title = typeof notification.title === "string" ? notification.title : "";
  const description = typeof notification.description === "string" ? notification.description : "";

  if (!AGENT_NOTIFICATION_TYPES.has(type) || !title || !description) return null;

  return {
    type: type as AgentLogNotification["type"],
    title,
    description,
    actionLabel: typeof notification.actionLabel === "string" ? notification.actionLabel : undefined,
    actionUrl: typeof notification.actionUrl === "string" ? notification.actionUrl : undefined,
  };
};

function buildAgentNotification(log: AgentLog): Notification | null {
  const status = (log.status || "").toUpperCase();
  const result = (log.result || "").toUpperCase();
  const reason = (log.reason || "").toUpperCase();
  const time = timeOf(log.createdAt || log.created_at);

  if (HIDDEN_AGENT_RESULTS.has(result) || HIDDEN_AGENT_RESULTS.has(reason)) {
    return null;
  }

  const notification = getAgentOutputNotification(log);
  if (notification) {
    return {
      id: `agent-notification-${log.id}`,
      type: notification.type,
      title: notification.title,
      description: notification.description,
      link: notification.actionUrl || "/admin/agent-logs",
      time,
    };
  }

  if (status === "FAILED" || result === "FAILED" || result === "ERROR") {
    return {
      id: `agent-failed-${log.id}`,
      type: "agent_error",
      title: "Agent xử lý thất bại",
      description: log.message || log.errorMessage || log.error || log.error_message || "Agent gặp lỗi khi xử lý.",
      link: "/admin/agent-logs",
      time,
    };
  }

  if (reason === "NO_SUPPLIER" || reason === "NO_SUPPLIERS_MAPPED" || result === "NO_SUPPLIER") {
    return {
      id: `agent-no-supplier-${log.id}`,
      type: "warning",
      title: "Thiếu nhà cung cấp",
      description: "Sản phẩm chưa được liên kết với nhà cung cấp nên Agent không thể tạo yêu cầu nhập hàng.",
      link: "/admin/agent-logs",
      time,
    };
  }

  if (reason === "ACTIVE_PR_EXISTS" || result === "SKIPPED_DUPLICATE") {
    return {
      id: `agent-duplicate-${log.id}`,
      type: "info",
      title: "Đã có yêu cầu nhập hàng",
      description: "Sản phẩm đã có yêu cầu nhập hàng đang chờ xử lý nên Agent không tạo thêm.",
      link: "/admin/agent-logs",
      time,
    };
  }

  if (reason === "AI_DISABLED" || result === "SKIPPED_DISABLED") {
    return {
      id: `agent-disabled-${log.id}`,
      type: "info",
      title: "AI Agent đang tắt",
      description: "AI Agent đang bị tắt trong cài đặt hệ thống.",
      link: "/admin/agent-logs",
      time,
    };
  }

  if (result === "CREATED_PURCHASE_REQUEST") {
    return {
      id: `agent-pr-${log.id}`,
      type: "agent_success",
      title: "Đã tạo yêu cầu nhập hàng",
      description: "AI Agent đã tạo yêu cầu nhập hàng thành công.",
      link: log.purchaseRequestId ? `/admin/purchase-requests/${log.purchaseRequestId}` : "/admin/purchase-requests",
      time,
    };
  }

  if (status === "SUCCESS" && IMPORTANT_AGENT_SUCCESS.has(result)) {
    return {
      id: `agent-success-${log.id}`,
      type: "agent_success",
      title: result === "SUCCESS" ? "Email đã gửi" : "Agent xử lý thành công",
      description: log.message || "AI Agent đã xử lý thành công.",
      link: "/admin/agent-logs",
      time,
    };
  }

  if (status === "RUNNING") {
    return {
      id: `agent-running-${log.id}`,
      type: "info",
      title: "Agent đang xử lý",
      description: log.message || "AI Agent đang xử lý tác vụ.",
      link: "/admin/agent-logs",
      time,
    };
  }

  return null;
}

function buildNotifications(
  lowStock: Inventory[],
  pendingPRs: PurchaseRequest[],
  agentLogs: AgentLog[],
  orders: Order[]
): Notification[] {
  const items: Notification[] = [];

  orders
    .filter((order) => order.status === "PENDING" || order.status === "CONFIRMED")
    .slice(0, 5)
    .forEach((order) => {
      items.push({
        id: `order-${order.id}`,
        type: "new_order",
        title: order.status === "PENDING" ? "Đơn hàng mới chờ duyệt" : "Đơn hàng đang chờ xử lý",
        description: `Đơn hàng #${order.id.slice(-8).toUpperCase()} trị giá ${order.totalAmount.toLocaleString()}đ`,
        link: `/admin/orders/${order.id}`,
        time: timeOf(order.createdAt),
      });
    });

  lowStock.slice(0, 5).forEach((inventory) => {
    const name = inventory.product?.name || "Sản phẩm không rõ";
    const min = inventory.minThreshold ?? inventory.min_threshold ?? 5;
    items.push({
      id: `low-${inventory.id}`,
      type: "low_stock",
      title: "Tồn kho sắp hết",
      description: `"${name}" chỉ còn ${inventory.quantity} đơn vị (ngưỡng tối thiểu: ${min})`,
      link: "/admin/inventory",
      time: "Vừa cập nhật",
    });
  });

  pendingPRs.slice(0, 3).forEach((request) => {
    const name = request.product?.name || "Sản phẩm không rõ";
    items.push({
      id: `pr-${request.id}`,
      type: "purchase_request",
      title: "Yêu cầu mua hàng mới",
      description: `Yêu cầu nhập "${name}" đang chờ phê duyệt`,
      link: `/admin/purchase-requests/${request.id}`,
      time: timeOf(request.createdAt || request.created_at),
    });
  });

  agentLogs.slice(0, 10).forEach((log) => {
    const notification = buildAgentNotification(log);
    if (notification) items.push(notification);
  });

  return items;
}

const ICON_MAP = {
  low_stock: {
    icon: <AlertTriangle size={16} />,
    bg: "bg-amber-50",
    border: "border-amber-200",
    color: "text-amber-700",
    dot: "bg-amber-500",
  },
  purchase_request: {
    icon: <ShoppingCart size={16} />,
    bg: "bg-blue-50",
    border: "border-blue-200",
    color: "text-blue-700",
    dot: "bg-blue-500",
  },
  agent_error: {
    icon: <Bot size={16} />,
    bg: "bg-rose-50",
    border: "border-rose-200",
    color: "text-rose-700",
    dot: "bg-rose-500",
  },
  agent_success: {
    icon: <CheckCircle size={16} />,
    bg: "bg-emerald-50",
    border: "border-emerald-200",
    color: "text-emerald-700",
    dot: "bg-emerald-500",
  },
  new_order: {
    icon: <ClipboardList size={16} />,
    bg: "bg-purple-50",
    border: "border-purple-200",
    color: "text-purple-700",
    dot: "bg-purple-500",
  },
  success: {
    icon: <CheckCircle size={16} />,
    bg: "bg-emerald-50",
    border: "border-emerald-200",
    color: "text-emerald-700",
    dot: "bg-emerald-500",
  },
  error: {
    icon: <X size={16} />,
    bg: "bg-rose-50",
    border: "border-rose-200",
    color: "text-rose-700",
    dot: "bg-rose-500",
  },
  warning: {
    icon: <AlertTriangle size={16} />,
    bg: "bg-amber-50",
    border: "border-amber-200",
    color: "text-amber-700",
    dot: "bg-amber-500",
  },
  info: {
    icon: <Bell size={16} />,
    bg: "bg-blue-50",
    border: "border-blue-200",
    color: "text-blue-700",
    dot: "bg-blue-500",
  },
};

export const NotificationPanel: React.FC = () => {
  const { toasts } = useToastState();
  const [open, setOpen] = useState(false);
  const [apiNotifications, setApiNotifications] = useState<Notification[]>([]);
  const [readIds, setReadIds] = useState<Set<string>>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      return saved ? new Set(JSON.parse(saved)) : new Set();
    } catch {
      return new Set();
    }
  });
  const [loading, setLoading] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (event: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(event.target as Node)) setOpen(false);
    };
    if (open) document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  useEffect(() => {
    if (!open) return;

    const fetchNotifications = async () => {
      setLoading(true);
      try {
        const [inventoryResult, purchaseResult, logResult, orderResult] = await Promise.allSettled([
          inventoryApi.getLowStock(),
          purchaseRequestsApi.getPurchaseRequests({ status: "PENDING" }),
          agentLogsApi.getAgentLogs({ page: 1, limit: 20 }),
          ordersApi.getOrders(),
        ]);

        setApiNotifications(
          buildNotifications(
            inventoryResult.status === "fulfilled" ? inventoryResult.value : [],
            purchaseResult.status === "fulfilled" ? purchaseResult.value : [],
            logResult.status === "fulfilled" ? logResult.value : [],
            orderResult.status === "fulfilled" ? orderResult.value : []
          )
        );
      } finally {
        setLoading(false);
      }
    };

    fetchNotifications();
  }, [open]);

  const localNotifications: Notification[] = toasts.map((toast) => ({
    id: toast.id,
    type: toast.type,
    title: toast.title,
    description: toast.message || "",
    time: "Vừa xong",
  }));

  const notifications = [...localNotifications.slice().reverse(), ...apiNotifications];
  const unreadCount = notifications.filter((notification) => !readIds.has(notification.id)).length;

  const markAllRead = () => {
    const allIds = new Set(notifications.map((notification) => notification.id));
    setReadIds(allIds);
    localStorage.setItem(STORAGE_KEY, JSON.stringify([...allIds]));
  };

  const markRead = (id: string) => {
    const next = new Set(readIds).add(id);
    setReadIds(next);
    localStorage.setItem(STORAGE_KEY, JSON.stringify([...next]));
  };

  return (
    <div className="relative" ref={panelRef}>
      <button
        id="notification-bell-btn"
        onClick={() => setOpen((prev) => !prev)}
        className={`relative w-9 h-9 flex items-center justify-center rounded-xl text-slate-500 transition-all ${
          open ? "bg-amber-100 text-amber-800" : "bg-slate-100 hover:bg-slate-200 hover:text-slate-800"
        }`}
        aria-label="Thông báo"
      >
        <Bell size={17} />
        {unreadCount > 0 && (
          <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] rounded-full bg-rose-500 border-2 border-white text-white text-[10px] font-black flex items-center justify-center px-0.5 animate-pulse">
            {unreadCount > 9 ? "9+" : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div id="notification-panel" className="absolute right-0 top-12 w-96 max-w-[calc(100vw-1rem)] z-[999]">
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 overflow-hidden">
            <div className="flex items-center justify-between px-5 py-3.5 border-b border-slate-100 bg-gradient-to-r from-slate-50 to-white">
              <div className="flex items-center gap-2">
                <Bell size={15} className="text-slate-500" />
                <span className="font-bold text-slate-800 text-sm">Thông báo</span>
                {unreadCount > 0 && (
                  <span className="px-1.5 py-0.5 bg-rose-100 text-rose-700 text-[11px] font-black rounded-full">
                    {unreadCount} mới
                  </span>
                )}
              </div>
              <div className="flex items-center gap-2">
                {unreadCount > 0 && (
                  <button
                    onClick={markAllRead}
                    className="text-[11px] font-semibold text-amber-700 hover:text-amber-900 hover:underline transition-colors"
                  >
                    Đánh dấu tất cả đã đọc
                  </button>
                )}
                <button
                  onClick={() => setOpen(false)}
                  className="p-1 rounded-lg hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition-all"
                >
                  <X size={14} />
                </button>
              </div>
            </div>

            <div className="max-h-[420px] overflow-y-auto divide-y divide-slate-50">
              {loading ? (
                <div className="py-12 flex flex-col items-center gap-3 text-slate-400">
                  <div className="w-8 h-8 border-2 border-slate-200 border-t-amber-500 rounded-full animate-spin" />
                  <span className="text-xs font-medium">Đang tải thông báo...</span>
                </div>
              ) : notifications.length === 0 ? (
                <div className="py-14 flex flex-col items-center gap-3 text-slate-400">
                  <div className="w-14 h-14 bg-slate-100 rounded-2xl flex items-center justify-center">
                    <Inbox size={26} className="text-slate-300" />
                  </div>
                  <div className="text-center">
                    <p className="text-sm font-semibold text-slate-500">Không có thông báo</p>
                    <p className="text-xs text-slate-400 mt-0.5">Hệ thống đang hoạt động bình thường</p>
                  </div>
                </div>
              ) : (
                notifications.map((notification) => {
                  const style = ICON_MAP[notification.type];
                  const isRead = readIds.has(notification.id);
                  const content = (
                    <div
                      className={`flex items-start gap-3.5 px-5 py-3.5 transition-colors cursor-pointer group ${
                        isRead ? "bg-white hover:bg-slate-50" : "bg-amber-50/30 hover:bg-amber-50/60"
                      }`}
                      onClick={() => markRead(notification.id)}
                    >
                      <div className={`flex-shrink-0 w-8 h-8 rounded-xl border ${style.bg} ${style.border} ${style.color} flex items-center justify-center mt-0.5`}>
                        {style.icon}
                      </div>

                      <div className="flex-1 min-w-0">
                        <div className="flex items-start justify-between gap-2">
                          <p className={`text-[13px] font-bold leading-tight ${isRead ? "text-slate-600" : "text-slate-900"}`}>
                            {notification.title}
                          </p>
                          {!isRead && <span className={`flex-shrink-0 w-2 h-2 mt-1 rounded-full ${style.dot}`} />}
                        </div>
                        <p className="text-xs text-slate-500 mt-0.5 leading-relaxed line-clamp-2">
                          {notification.description}
                        </p>
                        {notification.time && (
                          <p className="text-[11px] text-slate-400 mt-1 font-medium">{notification.time}</p>
                        )}
                      </div>

                      {notification.link && (
                        <ArrowRight size={13} className="flex-shrink-0 text-slate-300 group-hover:text-slate-500 transition-colors mt-1" />
                      )}
                    </div>
                  );

                  return notification.link ? (
                    <Link
                      key={notification.id}
                      to={notification.link}
                      onClick={() => {
                        markRead(notification.id);
                        setOpen(false);
                      }}
                    >
                      {content}
                    </Link>
                  ) : (
                    <div key={notification.id}>{content}</div>
                  );
                })
              )}
            </div>

            {notifications.length > 0 && (
              <div className="border-t border-slate-100 px-5 py-3 bg-slate-50/80">
                <Link
                  to="/admin/notifications"
                  onClick={() => setOpen(false)}
                  className="w-full flex items-center justify-center gap-1.5 text-xs font-bold text-amber-800 hover:text-amber-900 transition-colors group"
                >
                  Xem tất cả thông báo
                  <ArrowRight size={12} className="group-hover:translate-x-0.5 transition-transform" />
                </Link>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
