import React, { useState } from "react";
import { Link, useLocation } from "react-router-dom";
import {
  LayoutDashboard,
  Coffee,
  History,
  Truck,
  Receipt,
  Play,
  FileSpreadsheet,
  Terminal,
  X,
  ChevronRight,
  Boxes,
  Users,
  LayoutGrid,
  Settings,
} from "lucide-react";

interface SidebarProps {
  sidebarOpen: boolean;
  setSidebarOpen: (arg0: boolean) => void;
}

const MENU_GROUPS = [
  {
    label: "Tổng quan",
    items: [
      { label: "Dashboard", path: "/admin/dashboard", icon: LayoutDashboard },
    ],
  },
  {
    label: "Cấu hình & Hệ thống",
    items: [
      { label: "Thành viên", path: "/admin/users", icon: Users },
      { label: "Cài đặt hệ thống", path: "/admin/system-settings", icon: Settings },
    ],
  },
  {
    label: "Kho & Sản phẩm",
    items: [
      { label: "Danh mục", path: "/admin/categories", icon: LayoutGrid },
      { label: "Sản phẩm", path: "/admin/products", icon: Coffee },
      { label: "Tồn kho", path: "/admin/inventory", icon: Boxes },
      { label: "Lịch sử kho", path: "/admin/inventory/transactions", icon: History },
      { label: "Nhà cung cấp", path: "/admin/suppliers", icon: Truck },
    ],
  },
  {
    label: "Bán hàng",
    items: [
      { label: "Đơn hàng", path: "/admin/orders", icon: Receipt },
      { label: "Mô phỏng bán", path: "/admin/simulate-sale", icon: Play },
    ],
  },
  {
    label: "Hệ thống tự động",
    items: [
      { label: "Yêu cầu mua hàng", path: "/admin/purchase-requests", icon: FileSpreadsheet },
      { label: "Nhật ký Agent", path: "/admin/agent-logs", icon: Terminal },
    ],
  },
];

export const Sidebar: React.FC<SidebarProps> = ({ sidebarOpen, setSidebarOpen }) => {
  const location = useLocation();
  const [collapsedGroups, setCollapsedGroups] = useState<Record<string, boolean>>({});

  const isActive = (path: string) => {
    if (path === "/admin/inventory" && location.pathname.startsWith("/admin/inventory/transactions")) {
      return false;
    }
    return location.pathname === path || location.pathname.startsWith(path + "/");
  };

  const toggleGroup = (label: string) => {
    setCollapsedGroups((prev) => ({ ...prev, [label]: !prev[label] }));
  };

  return (
    <aside
      className={`fixed lg:static left-0 top-0 z-50 flex h-screen w-[272px] flex-col overflow-hidden
        bg-[#1c1008] duration-300 ease-in-out lg:translate-x-0
        ${sidebarOpen ? "translate-x-0 shadow-2xl shadow-black/60" : "-translate-x-full"}`}
    >
      {/* ── LOGO ── */}
      <div className="flex items-center justify-between px-5 py-5 border-b border-white/5">
        <Link
          to="/admin/dashboard"
          onClick={() => setSidebarOpen(false)}
          className="flex items-center  group"
        >
          <div className="p-2.5 bg-white-300 text-white  group-hover:bg-white-600 transition-all ">
            <img className="w-20 h-20" src="../src/assets/logo-inventory1.png" alt="" />
          </div>
          <div>
            <span className="text-[14px] font-black text-white tracking-wide uppercase font-serif leading-none block">
              Cafe Admin
            </span>
            <span className="text-[11px] font-medium text-amber-400/60 tracking-widest block mt-0.5">
              Management System
            </span>
          </div>
        </Link>

        <button
          onClick={() => setSidebarOpen(false)}
          className="lg:hidden p-1.5 text-white/30 hover:text-white hover:bg-white/10 rounded-lg transition-all"
        >
          <X size={18} />
        </button>
      </div>



      {/* ── NAV MENU ── */}
      <div className="no-scrollbar flex flex-col overflow-y-auto flex-1 px-3 py-3 gap-1">
        {MENU_GROUPS.map((group) => {
          const isCollapsed = collapsedGroups[group.label];
          return (
            <div key={group.label} className="mb-1">
              {/* Group header */}
              <button
                onClick={() => toggleGroup(group.label)}
                className="flex items-center justify-between w-full px-3 py-2 mb-0.5 text-left group"
              >
                <span className="text-[11px] font-bold text-white/30 uppercase tracking-[0.12em]">
                  {group.label}
                </span>
                <ChevronRight
                  size={12}
                  className={`text-white/20 transition-transform duration-200 group-hover:text-white/40 ${isCollapsed ? "" : "rotate-90"
                    }`}
                />
              </button>

              {/* Items */}
              {!isCollapsed && (
                <ul className="flex flex-col gap-0.5">
                  {group.items.map((item) => {
                    const Icon = item.icon;
                    const active = isActive(item.path);
                    return (
                      <li key={item.path}>
                        <Link
                          to={item.path}
                          onClick={() => setSidebarOpen(false)}
                          className={`relative flex items-center gap-3 rounded-xl px-3 py-2.5 text-[13.5px] font-medium transition-all duration-150 group
                            ${active
                              ? "bg-gradient-to-r from-amber-700/80 to-amber-800/60 text-white shadow-md shadow-amber-900/30"
                              : "text-white/50 hover:text-white/90 hover:bg-white/5"
                            }`}
                        >
                          {active && (
                            <span className="absolute left-0 inset-y-2.5 w-[3px] bg-amber-400 rounded-r-full" />
                          )}
                          <span className={`flex-shrink-0 transition-colors ${active ? "text-amber-300" : "text-white/30 group-hover:text-amber-400"
                            }`}>
                            <Icon size={16} />
                          </span>
                          <span className="flex-1 truncate">{item.label}</span>
                          {active && (
                            <ChevronRight size={14} className="text-amber-400/70 flex-shrink-0" />
                          )}
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          );
        })}
      </div>


    </aside>
  );
};
