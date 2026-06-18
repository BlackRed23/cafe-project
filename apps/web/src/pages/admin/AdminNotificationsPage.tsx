import React, { useEffect, useState } from "react";
import {
  Bell,
  AlertTriangle,
  ShoppingCart,
  Bot,
  CheckCircle,
  ClipboardList,
  X,
  Inbox,
  ArrowRight,
} from "lucide-react";
import { Link } from "react-router-dom";
import { inventoryApi } from "../../api/inventory.api";
import { purchaseRequestsApi } from "../../api/purchaseRequests.api";
import { agentLogsApi } from "../../api/agentLogs.api";
import { ordersApi } from "../../api/orders.api";
import { useToastState } from "../../contexts/ToastContext";
import { Loading } from "../../components/common/Loading";

export const AdminNotificationsPage: React.FC = () => {
  const { toasts } = useToastState();
  const [apiNotifications, setApiNotifications] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchAll = async () => {
      setLoading(true);
      try {
        const [inv, prs, logs, ords] = await Promise.allSettled([
          inventoryApi.getLowStock(),
          purchaseRequestsApi.getPurchaseRequests(),
          agentLogsApi.getAgentLogs({ limit: 50 }),
          ordersApi.getOrders(),
        ]);

        const items: any[] = [];

        // Low stock
        if (inv.status === "fulfilled") {
          inv.value.forEach((i: any) => {
            const name = i.product?.name || "Sản phẩm";
            const min = i.minThreshold ?? i.min_threshold ?? 5;
            items.push({
              id: `low-${i.id}`,
              type: "low_stock",
              title: "Tồn kho sắp hết",
              description: `"${name}" chỉ còn ${i.quantity} (ngưỡng: ${min})`,
              link: "/admin/inventory",
              time: new Date().toISOString(),
            });
          });
        }

        // PRs
        if (prs.status === "fulfilled") {
          prs.value.forEach((pr: any) => {
            const name = pr.product?.name || "Sản phẩm";
            items.push({
              id: `pr-${pr.id}`,
              type: "purchase_request",
              title: pr.status === "PENDING" ? "Yêu cầu mua hàng" : `Yêu cầu nhập hàng: ${pr.status}`,
              description: `Yêu cầu nhập "${name}"`,
              link: `/admin/purchase-requests/${pr.id}`,
              time: pr.createdAt || pr.created_at,
            });
          });
        }

        // Logs
        if (logs.status === "fulfilled") {
          logs.value.forEach((log: any) => {
            const isError = (log.status || "").toUpperCase() === "ERROR" || (log.status || "").toUpperCase() === "FAILED" || !!log.error || !!log.error_message;
            items.push({
              id: `log-${log.id}`,
              type: isError ? "agent_error" : "agent_success",
              title: isError ? "Lỗi AI Agent" : "AI Agent",
              description: log.errorMessage || log.error || log.error_message || `Xử lý thành công "${log.product?.name || "không rõ"}"`,
              link: "/admin/agent-logs",
              time: log.createdAt || log.created_at,
            });
          });
        }

        // Orders
        if (ords.status === "fulfilled") {
          ords.value.forEach((o: any) => {
            items.push({
              id: `order-${o.id}`,
              type: "new_order",
              title: `Đơn hàng: ${o.status}`,
              description: `Đơn hàng của ${o.shippingName} - ${o.totalAmount.toLocaleString()}đ`,
              link: `/admin/orders/${o.id}`,
              time: o.createdAt || o.created_at,
            });
          });
        }

        setApiNotifications(items);
      } finally {
        setLoading(false);
      }
    };
    fetchAll();
  }, []);

  const localNotifications = toasts.map((t) => ({
    id: t.id,
    type: t.type,
    title: t.title,
    description: t.message || "",
    time: new Date().toISOString(),
  }));

  const all = [...localNotifications.reverse(), ...apiNotifications].sort((a, b) => {
    return new Date(b.time).getTime() - new Date(a.time).getTime();
  });

  const ICON_MAP: any = {
    low_stock: { icon: <AlertTriangle size={20} />, bg: "bg-amber-50 text-amber-700" },
    purchase_request: { icon: <ShoppingCart size={20} />, bg: "bg-blue-50 text-blue-700" },
    agent_error: { icon: <Bot size={20} />, bg: "bg-rose-50 text-rose-700" },
    agent_success: { icon: <CheckCircle size={20} />, bg: "bg-emerald-50 text-emerald-700" },
    new_order: { icon: <ClipboardList size={20} />, bg: "bg-purple-50 text-purple-700" },
    success: { icon: <CheckCircle size={20} />, bg: "bg-emerald-50 text-emerald-700" },
    error: { icon: <X size={20} />, bg: "bg-rose-50 text-rose-700" },
    warning: { icon: <AlertTriangle size={20} />, bg: "bg-amber-50 text-amber-700" },
    info: { icon: <Bell size={20} />, bg: "bg-blue-50 text-blue-700" },
  };

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-black text-slate-800">Tất cả thông báo</h1>
      </div>

      <div className="bg-white rounded-3xl border border-slate-100 shadow-sm overflow-hidden">
        {loading ? (
          <div className="py-24">
            <Loading message="Đang tải thông báo..." />
          </div>
        ) : all.length === 0 ? (
          <div className="py-24 flex flex-col items-center gap-4 text-slate-400">
            <div className="w-16 h-16 bg-slate-50 rounded-2xl flex items-center justify-center">
              <Inbox size={32} className="text-slate-300" />
            </div>
            <p className="font-semibold text-slate-500">Không có thông báo nào</p>
          </div>
        ) : (
          <div className="divide-y divide-slate-50">
            {all.map((notif) => {
              const style = ICON_MAP[notif.type] || ICON_MAP.info;
              const inner = (
                <div key={notif.id} className="flex items-start gap-4 p-5 hover:bg-slate-50 transition-colors cursor-pointer group">
                  <div className={`w-12 h-12 rounded-2xl flex items-center justify-center flex-shrink-0 ${style.bg}`}>
                    {style.icon}
                  </div>
                  <div className="flex-1 min-w-0 pt-1">
                    <div className="flex justify-between items-start">
                      <p className="font-bold text-slate-800">{notif.title}</p>
                      {notif.time && (
                        <span className="text-xs font-medium text-slate-400">
                          {new Date(notif.time).toLocaleString("vi-VN")}
                        </span>
                      )}
                    </div>
                    <p className="text-sm text-slate-500 mt-1">{notif.description}</p>
                  </div>
                  {notif.link && (
                    <div className="pt-2">
                      <ArrowRight size={16} className="text-slate-300 group-hover:text-slate-500 transition-colors" />
                    </div>
                  )}
                </div>
              );

              return notif.link ? (
                <Link key={notif.id} to={notif.link} className="block">
                  {inner}
                </Link>
              ) : (
                <div key={notif.id}>{inner}</div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};
