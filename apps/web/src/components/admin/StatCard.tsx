import React from "react";
import type { LucideIcon } from "lucide-react";

interface StatCardProps {
  title: string;
  value: string | number;
  icon: LucideIcon;
  iconColor?: string;
  iconBg?: string;
  subtitle?: string;
  onClick?: () => void;
}

export const StatCard: React.FC<StatCardProps> = ({
  title,
  value,
  icon: Icon,
  iconColor = "text-amber-850",
  iconBg = "bg-amber-50",
  subtitle,
  onClick,
}) => {
  return (
    <div
      onClick={onClick}
      className={`rounded-2xl border border-slate-100 bg-white p-6 shadow-sm dark:border-strokedark dark:bg-boxdark transition-all duration-300 ${
        onClick ? "cursor-pointer hover:shadow-md hover:border-slate-200 hover:-translate-y-0.5" : ""
      }`}
    >
      <div className="flex items-center justify-between">
        <div className="flex flex-col gap-1.5">
          <span className="text-sm font-semibold text-slate-400 uppercase tracking-wider">{title}</span>
          <h4 className="text-2xl font-black text-slate-800 dark:text-white">{value}</h4>
          {subtitle && <p className="text-xs text-slate-500 mt-1">{subtitle}</p>}
        </div>
        <div className={`flex h-11.5 w-11.5 items-center justify-center rounded-full ${iconBg} ${iconColor} shadow-inner`}>
          <Icon size={22} />
        </div>
      </div>
    </div>
  );
};
