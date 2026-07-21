import React from "react";
import { getStatusLabel } from "../../utils/statusLabel";

interface BadgeProps {
  status: string;
  className?: string;
  context?: "order" | "payment";
}

export const Badge: React.FC<BadgeProps> = ({ status, className = "", context }) => {
  const cleanStatus = (status || "").toUpperCase();
  const label = getStatusLabel(cleanStatus, context);

  const colorsMap: Record<string, string> = {
    // Shared
    PENDING: "bg-amber-50 text-amber-800 border-amber-200 dark:bg-amber-950/20 dark:text-amber-400 dark:border-amber-900/30",
    
    // Order
    CONFIRMED: "bg-blue-50 text-blue-800 border-blue-200 dark:bg-blue-950/20 dark:text-blue-400 dark:border-blue-900/30",
    PROCESSING: "bg-amber-50 text-amber-900 border-amber-250 dark:bg-amber-950/20 dark:text-amber-450 dark:border-amber-900/30",
    COMPLETED: "bg-emerald-50 text-emerald-800 border-emerald-200 dark:bg-emerald-950/20 dark:text-emerald-400 dark:border-emerald-900/30",
    CANCELLED: "bg-rose-50 text-rose-800 border-rose-200 dark:bg-rose-950/20 dark:text-rose-400 dark:border-rose-900/30",

    // Payment
    PAID: "bg-emerald-50 text-emerald-850 border-emerald-200 dark:bg-emerald-950/20 dark:text-emerald-400 dark:border-emerald-900/30",
    FAILED: "bg-rose-50 text-rose-800 border-rose-200 dark:bg-rose-950/20 dark:text-rose-400 dark:border-rose-900/30",

    // Inventory
    OK: "bg-emerald-50 text-emerald-800 border-emerald-200 dark:bg-emerald-950/20 dark:text-emerald-400 dark:border-emerald-900/30",
    IN_STOCK: "bg-emerald-50 text-emerald-800 border-emerald-200 dark:bg-emerald-950/20 dark:text-emerald-400 dark:border-emerald-900/30",
    WARNING: "bg-orange-50 text-orange-850 border-orange-250 dark:bg-orange-950/20 dark:text-orange-400 dark:border-orange-900/30",
    WARNING_STOCK: "bg-orange-50 text-orange-850 border-orange-250 dark:bg-orange-950/20 dark:text-orange-400 dark:border-orange-900/30",
    AT_THRESHOLD: "bg-amber-50 text-amber-800 border-amber-250 dark:bg-amber-950/20 dark:text-amber-400 dark:border-amber-900/30",
    LOW_STOCK: "bg-rose-50 text-rose-800 border-rose-200 dark:bg-rose-950/20 dark:text-rose-400 dark:border-rose-900/30",
    OUT_OF_STOCK: "bg-red-100 text-red-900 border-red-300 dark:bg-red-950/40 dark:text-red-400 dark:border-red-900/50",
    NEED_RESTOCK: "bg-red-50 text-red-800 border-red-200 dark:bg-red-950/20 dark:text-red-400 dark:border-red-900/30",

    // Purchase Request
    APPROVED: "bg-emerald-50 text-emerald-800 border-emerald-200 dark:bg-emerald-950/20 dark:text-emerald-400 dark:border-emerald-900/30",
    SENT: "bg-teal-50 text-teal-800 border-teal-200 dark:bg-teal-950/20 dark:text-teal-400 dark:border-teal-900/30",
    RECEIVED: "bg-sky-50 text-sky-850 border-sky-200 dark:bg-sky-950/20 dark:text-sky-400 dark:border-sky-900/30",
    REJECTED: "bg-rose-50 text-rose-800 border-rose-200 dark:bg-rose-950/20 dark:text-rose-400 dark:border-rose-900/30",
  };

  const colorClasses = colorsMap[cleanStatus] || "bg-slate-50 text-slate-800 border-slate-200 dark:bg-slate-900 dark:text-slate-400 dark:border-slate-800";

  return (
    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-[13px] font-bold border transition-colors ${colorClasses} ${className}`}>
      {label}
    </span>
  );
};
