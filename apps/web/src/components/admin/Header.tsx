import React, { useState, useEffect, useRef } from "react";
import { Menu, X, AlertCircle, Info, CheckCircle, LogOut, User, Key, ChevronDown } from "lucide-react";
import { useAuth } from "../../contexts/AuthContext";
import { useLocation, Link } from "react-router-dom";
import { NotificationPanel } from "./NotificationPanel";

type ToastType = "success" | "error" | "warning" | "info";
interface Toast {
  id: string;
  type: ToastType;
  message: string;
}

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
  const { user, logout } = useAuth();
  const location = useLocation();

  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const userMenuRef = useRef<HTMLDivElement>(null);
  
  const [toasts, setToasts] = useState<Toast[]>([]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (userMenuRef.current && !userMenuRef.current.contains(event.target as Node)) {
        setUserMenuOpen(false);
      }
    };
    if (userMenuOpen) {
      document.addEventListener("mousedown", handleClickOutside);
    }
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [userMenuOpen]);

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
    <>
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
                {crumb === "Admin" && idx === 0 ? (
                  <Link
                    to="/admin/dashboard"
                    className="text-sm font-medium text-slate-400 hover:text-amber-800 hover:underline transition-colors"
                  >
                    {crumb}
                  </Link>
                ) : (
                  <span className={`text-sm ${
                    idx === breadcrumbs.length - 1
                      ? "font-bold text-slate-800"
                      : "font-medium text-slate-400"
                  }`}>
                    {crumb}
                  </span>
                )}
              </span>
            ))}
          </nav>

          <span className="sm:hidden text-[15px] font-bold text-slate-800 truncate">{title}</span>
        </div>

        {/* RIGHT: search + bell + user */}
        <div className="flex items-center gap-2.5">


          {/* Notification */}
          <NotificationPanel />

          <div className="h-7 w-px bg-slate-200 mx-0.5 hidden sm:block" />

          {/* User card detailed with Dropdown */}
          <div className="relative flex items-center gap-3 pl-3 py-1 cursor-pointer hover:bg-slate-50 rounded-xl transition-colors" ref={userMenuRef} onClick={() => setUserMenuOpen(!userMenuOpen)}>
            <div className="relative">
              <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-amber-600 to-amber-800 flex items-center justify-center font-black text-white text-base shadow-sm ring-2 ring-white">
                {user?.name ? user.name.charAt(0).toUpperCase() : "A"}
              </div>
              <span className="absolute -bottom-1 -right-1 w-3.5 h-3.5 rounded-full bg-emerald-500 border-2 border-white shadow-sm" title="Đang hoạt động" />
            </div>
            <div className="hidden md:flex flex-col justify-center">
              <div className="flex items-center gap-1.5 mb-1">
                <p className="text-[14px] font-bold text-slate-800 leading-none">
                  {user?.name || "Quản trị viên"}
                </p>
                <ChevronDown size={14} className={`text-slate-400 transition-transform ${userMenuOpen ? 'rotate-180' : ''}`} />
              </div>
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-bold text-amber-700 bg-amber-100 px-1.5 py-0.5 rounded uppercase tracking-wider">
                  {user?.role === "ADMIN" ? "Admin" : "Staff"}
                </span>
              </div>
            </div>
            
            {/* User Dropdown Menu */}
            {userMenuOpen && (
              <div className="absolute top-full right-0 mt-3 w-56 bg-white rounded-2xl shadow-[0_10px_40px_-10px_rgba(0,0,0,0.15)] border border-slate-100 overflow-hidden z-50 animate-in fade-in slide-in-from-top-2 duration-200">
                <div className="p-2 flex flex-col gap-1">
                  <Link
                    to="/admin/users"
                    onClick={() => setUserMenuOpen(false)}
                    className="flex items-center gap-2.5 px-3 py-2 text-[13px] font-medium text-slate-600 hover:text-amber-700 hover:bg-amber-50 rounded-xl transition-colors"
                  >
                    <User size={15} /> Thay đổi thông tin
                  </Link>
                  <Link
                    to="/admin/change-password"
                    onClick={() => setUserMenuOpen(false)}
                    className="flex items-center gap-2.5 px-3 py-2 text-[13px] font-medium text-slate-600 hover:text-amber-700 hover:bg-amber-50 rounded-xl transition-colors"
                  >
                    <Key size={15} /> Đổi mật khẩu
                  </Link>
                </div>
                <div className="p-2 border-t border-slate-100">
                  <button
                    onClick={() => {
                      setUserMenuOpen(false);
                      logout();
                    }}
                    className="flex items-center gap-2.5 px-3 py-2 w-full text-[13px] font-medium text-rose-600 hover:bg-rose-50 rounded-xl transition-colors"
                  >
                    <LogOut size={15} /> Đăng xuất
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </header>
      
      {/* Toast Container */}
      {toasts.length > 0 && (
        <div className="fixed top-4 right-4 z-[9999] flex flex-col gap-2 max-w-sm" style={{ pointerEvents: "none" }}>
          {toasts.map((t) => {
            const isError = t.type === "error";
            const isSuccess = t.type === "success";
            return (
              <div
                key={t.id}
                className={`flex items-start gap-2.5 px-4 py-3 rounded-xl border shadow-lg ${
                  isError ? "bg-rose-50 border-rose-300 text-rose-900" :
                  isSuccess ? "bg-emerald-50 border-emerald-300 text-emerald-900" :
                  "bg-sky-50 border-sky-300 text-sky-900"
                } text-sm font-medium animate-in slide-in-from-right-8 duration-300`}
                style={{ pointerEvents: "auto" }}
              >
                <div className={`mt-0.5 ${isError ? "text-rose-600" : isSuccess ? "text-emerald-600" : "text-sky-600"}`}>
                  {isError ? <AlertCircle size={18} /> : isSuccess ? <CheckCircle size={18} /> : <Info size={18} />}
                </div>
                <span className="flex-1 leading-snug">{t.message}</span>
                <button
                  onClick={() => setToasts(prev => prev.filter(x => x.id !== t.id))}
                  className="shrink-0 p-0.5 rounded hover:bg-black/5 transition-colors"
                >
                  <X size={14} />
                </button>
              </div>
            );
          })}
        </div>
      )}
    </>
  );
};
