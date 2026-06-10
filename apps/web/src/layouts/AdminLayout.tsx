import React, { useState } from "react";
import { Outlet, useLocation } from "react-router-dom";
import { Sidebar } from "../components/admin/Sidebar";
import { Header } from "../components/admin/Header";

const TITLE_MAP: Record<string, string> = {
  "/admin/dashboard": "Dashboard",
  "/admin/products": "Danh sách sản phẩm",
  "/admin/products/create": "Thêm sản phẩm mới",
  "/admin/inventory": "Quản lý tồn kho",
  "/admin/inventory/transactions": "Lịch sử giao dịch kho",
  "/admin/suppliers": "Nhà cung cấp",
  "/admin/orders": "Quản lý đơn hàng",
  "/admin/simulate-sale": "Mô phỏng bán hàng",
  "/admin/purchase-requests": "Yêu cầu mua hàng",
  "/admin/agent-logs": "Nhật ký Agent",
};

function getTitle(pathname: string): string {
  if (TITLE_MAP[pathname]) return TITLE_MAP[pathname];
  if (pathname.startsWith("/admin/products/") && pathname.includes("/edit")) return "Chỉnh sửa sản phẩm";
  if (pathname.startsWith("/admin/orders/")) return "Chi tiết đơn hàng";
  if (pathname.startsWith("/admin/purchase-requests/")) return "Chi tiết yêu cầu mua hàng";
  return "Quản trị hệ thống";
}

export const AdminLayout: React.FC = () => {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const location = useLocation();
  const currentTitle = getTitle(location.pathname);

  return (
    <div className="flex h-screen overflow-hidden bg-slate-50">
      {/* Mobile backdrop */}
      {sidebarOpen && (
        <div
          onClick={() => setSidebarOpen(false)}
          className="fixed inset-0 bg-black/60 backdrop-blur-sm z-40 lg:hidden"
        />
      )}

      {/* Dark sidebar */}
      <Sidebar sidebarOpen={sidebarOpen} setSidebarOpen={setSidebarOpen} />

      {/* Right column */}
      <div className="relative flex flex-1 flex-col overflow-y-auto overflow-x-hidden min-w-0">
        {/* Sticky header */}
        <Header
          sidebarOpen={sidebarOpen}
          setSidebarOpen={setSidebarOpen}
          title={currentTitle}
        />

        {/* Page content */}
        <main className="flex-1">
          <div className="mx-auto max-w-screen-2xl p-4 md:p-6 lg:p-8">
            <Outlet />
          </div>
        </main>

        {/* Mini footer */}
        <footer className="px-8 py-3 border-t border-slate-200 bg-white">
          <p className="text-[11px] text-slate-400 text-center">
            © {new Date().getFullYear()} Cafe AI System — Quản lý cửa hàng thông minh
          </p>
        </footer>
      </div>
    </div>
  );
};
