import React, { useState, useEffect, useRef } from "react";
import { Link } from "react-router-dom";
import {
  Bell,
  AlertTriangle,
  ShoppingCart,
  Bot,
  CheckCircle,
  X,
  ArrowRight,
  Inbox,
  ClipboardList,
} from "lucide-react";
import { inventoryApi } from "../../api/inventory.api";
import { purchaseRequestsApi } from "../../api/purchaseRequests.api";
import { agentLogsApi } from "../../api/agentLogs.api";
import { ordersApi } from "../../api/orders.api";
import type { Inventory } from "../../types/inventory.types";
import type { PurchaseRequest } from "../../types/purchaseRequest.types";
import type { AgentLog } from "../../types/agentLog.types";
import type { Order } from "../../types/order.types";
import { useToastState } from "../../contexts/ToastContext";

interface Notification {
  id: string;
  type: "low_stock" | "purchase_request" | "agent_error" | "agent_success" | "new_order";
  title: string;
  description: string;
  link?: string;
  time?: string;
  read?: boolean;
}

const STORAGE_KEY = "admin_read_notifications";

function buildNotifications(
  lowStock: Inventory[],
  pendingPRs: PurchaseRequest[],
  agentLogs: AgentLog[],
  orders: Order[]
): Notification[] {
  const items: Notification[] = [];

  // Orders
  const pendingOrders = orders.filter((o) => o.status === "PENDING" || o.status === "CONFIRMED");
  pendingOrders.slice(0, 5).forEach((order) => {
    items.push({
      id: `order-${order.id}`,
      type: "new_order",
      title: order.status === "PENDING" ? "Đơn hàng mới chờ duyệt" : "Đơn hàng đang chờ xử lý",
      description: `Đơn hàng của ${order.shippingName} trị giá ${order.totalAmount.toLocaleString()}đ`,
      link: `/admin/orders/${order.id}`,
      time: order.createdAt
        ? new Date(order.createdAt).toLocaleTimeString("vi-VN", {
            hour: "2-digit",
            minute: "2-digit",
          })
        : "",
    });
  });

  // Low stock alerts
  lowStock.slice(0, 5).forEach((inv) => {
    const name = inv.product?.name || "Sản phẩm không rõ";
    const qty = inv.quantity;
    const min = inv.minThreshold ?? inv.min_threshold ?? 5;
    items.push({
      id: `low-${inv.id}`,
      type: "low_stock",
      title: "Tồn kho sắp hết",
      description: `"${name}" chỉ còn ${qty} đơn vị (ngưỡng tối thiểu: ${min})`,
      link: "/admin/inventory",
      time: "Vừa cập nhật",
    });
  });

  // Pending purchase requests
  pendingPRs.slice(0, 3).forEach((pr) => {
    const name = pr.product?.name || "Sản phẩm không rõ";
    items.push({
      id: `pr-${pr.id}`,
      type: "purchase_request",
      title: "Yêu cầu mua hàng mới",
      description: `Yêu cầu nhập "${name}" đang chờ phê duyệt`,
      link: `/admin/purchase-requests/${pr.id}`,
      time: pr.createdAt || pr.created_at
        ? new Date(pr.createdAt || pr.created_at || "").toLocaleTimeString("vi-VN", {
            hour: "2-digit",
            minute: "2-digit",
          })
        : "",
    });
  });

  // Agent error logs (last 3)
  const errorLogs = agentLogs.filter(
    (log) =>
      (log.status || "").toUpperCase() === "ERROR" ||
      (log.status || "").toUpperCase() === "FAILED" ||
      !!log.error ||
      !!log.error_message
  );
  errorLogs.slice(0, 3).forEach((log) => {
    items.push({
      id: `agent-err-${log.id}`,
      type: "agent_error",
      title: "Lỗi AI Agent",
      description:
        log.errorMessage ||
        log.error ||
        log.error_message ||
        `Agent gặp lỗi khi xử lý sản phẩm "${log.product?.name || "không rõ"}"`,
      link: "/admin/agent-logs",
      time: log.createdAt || log.created_at
        ? new Date(log.createdAt || log.created_at || "").toLocaleTimeString("vi-VN", {
            hour: "2-digit",
            minute: "2-digit",
          })
        : "",
    });
  });

  // Recent agent success (last 1)
  const successLogs = agentLogs.filter(
    (log) =>
      !((log.status || "").toUpperCase() === "ERROR") &&
      !((log.status || "").toUpperCase() === "FAILED") &&
      !log.error &&
      !log.error_message
  );
  if (successLogs.length > 0) {
    const log = successLogs[0];
    items.push({
      id: `agent-ok-${log.id}`,
      type: "agent_success",
      title: "AI Agent hoạt động bình thường",
      description: `Đã kiểm tra tồn kho sản phẩm "${log.product?.name || "không rõ"}" thành công`,
      link: "/admin/agent-logs",
      time: log.createdAt || log.created_at
        ? new Date(log.createdAt || log.created_at || "").toLocaleTimeString("vi-VN", {
            hour: "2-digit",
            minute: "2-digit",
          })
        : "",
    });
  }

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

  // Close panel on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    if (open) document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  // Fetch notifications when opening
  useEffect(() => {
    if (!open) return;
    const fetch = async () => {
      setLoading(true);
      try {
        const [inv, prs, logs, ords] = await Promise.allSettled([
          inventoryApi.getLowStock(),
          purchaseRequestsApi.getPurchaseRequests({ status: "PENDING" }),
          agentLogsApi.getAgentLogs(),
          ordersApi.getOrders(),
        ]);

        const lowStock = inv.status === "fulfilled" ? inv.value : [];
        const pendingPRs = prs.status === "fulfilled" ? prs.value : [];
        const agentLogs = logs.status === "fulfilled" ? logs.value : [];
        const ordersList = ords.status === "fulfilled" ? ords.value : [];

        setApiNotifications(buildNotifications(lowStock, pendingPRs, agentLogs, ordersList));
      } finally {
        setLoading(false);
      }
    };
    fetch();
  }, [open]);

  // Combine local CRUD toasts with API notifications
  const localNotifications: Notification[] = toasts.map((t) => ({
    id: t.id,
    type: t.type as any,
    title: t.title,
    description: t.message || "",
    time: "Vừa xong",
  }));

  const notifications = [...localNotifications.reverse(), ...apiNotifications];

  const unreadCount = notifications.filter((n) => !readIds.has(n.id)).length;

  const markAllRead = () => {
    const allIds = new Set(notifications.map((n) => n.id));
    setReadIds(allIds);
    localStorage.setItem(STORAGE_KEY, JSON.stringify([...allIds]));
  };

  const markRead = (id: string) => {
    const next = new Set(readIds).add(id);
    setReadIds(next);
    localStorage.setItem(STORAGE_KEY, JSON.stringify([...next]));
    // Also dismiss it from local state so it doesn't linger forever if we wanted to clear it
    // But since it's an ephemeral state, we don't strictly need to dismiss from context
    // unless we want it totally gone. Let's keep it visible but marked as read.
  };

  return (
    <div className="relative" ref={panelRef}>
      {/* Bell Button */}
      <button
        id="notification-bell-btn"
        onClick={() => setOpen((prev) => !prev)}
        className={`relative w-9 h-9 flex items-center justify-center rounded-xl text-slate-500 transition-all ${
          open
            ? "bg-amber-100 text-amber-800"
            : "bg-slate-100 hover:bg-slate-200 hover:text-slate-800"
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

      {/* Dropdown Panel */}
      {open && (
        <div
          id="notification-panel"
          className="absolute right-0 top-12 w-96 max-w-[calc(100vw-1rem)] z-[999]"
          style={{
            animation: "notif-slide-in 0.18s cubic-bezier(.22,1,.36,1) both",
          }}
        >
          <style>{`
            @keyframes notif-slide-in {
              from { opacity: 0; transform: translateY(-8px) scale(0.98); }
              to   { opacity: 1; transform: translateY(0) scale(1); }
            }
          `}</style>

          <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 overflow-hidden">
            {/* Header */}
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

            {/* Content */}
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
                notifications.map((notif) => {
                  const style = ICON_MAP[notif.type];
                  const isRead = readIds.has(notif.id);

                  const inner = (
                    <div
                      key={notif.id}
                      className={`flex items-start gap-3.5 px-5 py-3.5 transition-colors cursor-pointer group ${
                        isRead ? "bg-white hover:bg-slate-50" : "bg-amber-50/30 hover:bg-amber-50/60"
                      }`}
                      onClick={() => markRead(notif.id)}
                    >
                      {/* Icon */}
                      <div
                        className={`flex-shrink-0 w-8 h-8 rounded-xl border ${style.bg} ${style.border} ${style.color} flex items-center justify-center mt-0.5`}
                      >
                        {style.icon}
                      </div>

                      {/* Text */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-start justify-between gap-2">
                          <p className={`text-[13px] font-bold leading-tight ${isRead ? "text-slate-600" : "text-slate-900"}`}>
                            {notif.title}
                          </p>
                          {!isRead && (
                            <span className={`flex-shrink-0 w-2 h-2 mt-1 rounded-full ${style.dot}`} />
                          )}
                        </div>
                        <p className="text-xs text-slate-500 mt-0.5 leading-relaxed line-clamp-2">
                          {notif.description}
                        </p>
                        {notif.time && (
                          <p className="text-[11px] text-slate-400 mt-1 font-medium">{notif.time}</p>
                        )}
                      </div>

                      {/* Arrow on hover */}
                      {notif.link && (
                        <ArrowRight
                          size={13}
                          className="flex-shrink-0 text-slate-300 group-hover:text-slate-500 transition-colors mt-1"
                        />
                      )}
                    </div>
                  );

                  return notif.link ? (
                    <Link key={notif.id} to={notif.link} onClick={() => { markRead(notif.id); setOpen(false); }}>
                      {inner}
                    </Link>
                  ) : (
                    <div key={notif.id}>{inner}</div>
                  );
                })
              )}
            </div>

            {/* Footer */}
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
