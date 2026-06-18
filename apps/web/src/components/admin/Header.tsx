import React from "react";
import { Menu, Search } from "lucide-react";
import { useAuth } from "../../contexts/AuthContext";
import { useLocation } from "react-router-dom";
import { NotificationPanel } from "./NotificationPanel";

interface HeaderProps {
  sidebarOpen: boolean;
  setSidebarOpen: (arg0: boolean) => void;
  title: string;
}

const BREADCRUMB_MAP: Record<string, string[]> = {
  "/admin/dashboard": ["Admin", "Dashboard"],
  "/admin/products": ["Admin", "Sản phẩm"],
  "/admin/products/create": ["Admin", "Sản phẩm", "Thêm mới"],
  "/admin/inventory": ["Admin", "Kho hàng"],
  "/admin/inventory/transactions": ["Admin", "Kho hàng", "Lịch sử"],
  "/admin/suppliers": ["Admin", "Nhà cung cấp"],
  "/admin/orders": ["Admin", "Đơn hàng"],
  "/admin/simulate-sale": ["Admin", "Mô phỏng bán"],
  "/admin/purchase-requests": ["Admin", "Yêu cầu mua hàng"],
  "/admin/agent-logs": ["Admin", "Nhật ký Agent"],
};

export const Header: React.FC<HeaderProps> = ({ sidebarOpen, setSidebarOpen, title }) => {
  const { user } = useAuth();
  const location = useLocation();

  let breadcrumbs = BREADCRUMB_MAP[location.pathname];
  if (!breadcrumbs) {
    if (location.pathname.startsWith("/admin/products/") && location.pathname.includes("/edit")) {
      breadcrumbs = ["Admin", "Sản phẩm", "Chỉnh sửa"];
    } else if (location.pathname.startsWith("/admin/orders/")) {
      breadcrumbs = ["Admin", "Đơn hàng", "Chi tiết"];
    } else if (location.pathname.startsWith("/admin/purchase-requests/")) {
      breadcrumbs = ["Admin", "Yêu cầu mua hàng", "Chi tiết"];
    } else {
      breadcrumbs = ["Admin", title];
    }
  }

  return (
    <header className="sticky top-0 z-40 flex w-full border-b border-slate-200 bg-white shadow-sm">
      <div className="flex flex-grow items-center justify-between px-4 md:px-6 lg:px-8 h-[60px]">

        {/* LEFT: hamburger + breadcrumb */}
        <div className="flex items-center gap-4 min-w-0">
          <button
            onClick={(e) => { e.stopPropagation(); setSidebarOpen(!sidebarOpen); }}
            className="lg:hidden flex items-center justify-center w-9 h-9 rounded-xl bg-slate-100 text-slate-600 hover:bg-slate-200 hover:text-slate-900 transition-all flex-shrink-0"
            aria-label="Toggle sidebar"
          >
            <Menu size={19} />
          </button>

          {/* Breadcrumb */}
          <nav className="hidden sm:flex items-center gap-1.5 min-w-0">
            {breadcrumbs.map((crumb, idx) => (
              <span key={idx} className="flex items-center gap-1.5">
                {idx > 0 && <span className="text-sm text-slate-300">/</span>}
                <span className={`text-sm ${
                  idx === breadcrumbs.length - 1
                    ? "font-bold text-slate-800"
                    : "font-medium text-slate-400"
                }`}>
                  {crumb}
                </span>
              </span>
            ))}
          </nav>

          <span className="sm:hidden text-[15px] font-bold text-slate-800 truncate">{title}</span>
        </div>

        {/* RIGHT: search + bell + user */}
        <div className="flex items-center gap-2.5">
          {/* Search bar */}
          <button className="hidden md:flex items-center gap-2.5 px-4 py-2 text-sm text-slate-400 bg-slate-100 rounded-xl hover:bg-slate-200 transition-all border border-transparent hover:border-slate-200">
            <Search size={15} />
            <span className="font-medium">Tìm kiếm...</span>
            <kbd className="ml-1 px-1.5 py-0.5 rounded text-[11px] bg-white border border-slate-200 text-slate-400 font-mono">
              ⌘K
            </kbd>
          </button>

          {/* Notification */}
          <NotificationPanel />

          <div className="h-7 w-px bg-slate-200 mx-0.5 hidden sm:block" />

          {/* User card */}
          <div className="flex items-center gap-2.5 pl-1">
            <div className="relative">
              <div className="h-9 w-9 rounded-xl bg-gradient-to-br from-amber-600 to-amber-900 flex items-center justify-center font-black text-white text-[15px] shadow-md flex-shrink-0">
                {user?.name ? user.name.charAt(0).toUpperCase() : "A"}
              </div>
              <span className="absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full bg-emerald-400 border-2 border-white" />
            </div>
            <div className="hidden md:block">
              <p className="text-[14px] font-bold text-slate-800 leading-tight">
                {user?.name || "Quản trị viên"}
              </p>
              <p className="text-[11px] font-semibold text-amber-600 leading-tight uppercase tracking-wide">
                {user?.role === "ADMIN" ? "Admin" : "Staff"}
              </p>
            </div>
          </div>
        </div>
      </div>
    </header>
  );
};
