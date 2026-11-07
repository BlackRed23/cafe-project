import React, { useState, useEffect } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  dashboardApi,
  type DailyProfitPoint,
  type ProductMarginStat,
} from "../../api/dashboard.api";
import { productsApi } from "../../api/products.api";
import { ordersApi } from "../../api/orders.api";
import { inventoryApi } from "../../api/inventory.api";
import { purchaseRequestsApi } from "../../api/purchaseRequests.api";
import type { Order } from "../../types/order.types";
import type { Product } from "../../types/product.types";
import { formatCurrency } from "../../utils/formatCurrency";
import { formatDate } from "../../utils/formatDate";
import { Loading } from "../../components/common/Loading";
import { Button } from "../../components/common/Button";
import { Badge } from "../../components/common/Badge";
import { useAuth } from "../../contexts/AuthContext";
import {
  Package,
  Receipt,
  AlertTriangle,
  FileSpreadsheet,
  ArrowRight,
  Play,
  TrendingUp,
  Clock,
  Sparkles,
  ShoppingCart,
  CheckCircle,
  Minus,
  Bot,
  Send,
  Eye,
  ChevronRight,
  DollarSign,
  Percent,
  Layers,
  BarChart3,
} from "lucide-react";

export const AdminDashboardPage: React.FC = () => {
  const navigate = useNavigate();
  const { isStaff } = useAuth();
  const [stats, setStats] = useState({
    totalProducts: 0,
    totalOrders: 0,
    lowStockCount: 0,
    pendingPRsCount: 0,
    totalRevenue: 0,
    totalCogs: 0,
    grossProfit: 0,
    grossMarginPercent: 0,
  });
  const [recentOrders, setRecentOrders] = useState<Order[]>([]);
  const [trendingCoffee, setTrendingCoffee] = useState<(Product & { soldCount: number })[]>([]);
  const [dailyProfit, setDailyProfit] = useState<DailyProfitPoint[]>([]);
  const [productMargins, setProductMargins] = useState<ProductMarginStat[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const loadDashboardData = async () => {
      try {
        setIsLoading(true);
        
        if (isStaff) {
          const statsData = await dashboardApi.getStaffStats().catch(() => ({} as any));
          setStats((prev) => ({
            ...prev,
            totalProducts: 0,
            totalOrders: statsData.todayOrders || 0,
            lowStockCount: statsData.lowStockCount || 0,
            pendingPRsCount: statsData.pendingReceivePRsCount || 0,
          }));
          return;
        }

        const [
          statsData,
          allOrders,
          allProducts,
          lowStock,
          pendingPRs,
          profitData,
          marginsData,
        ] = await Promise.all([
          dashboardApi.getStats().catch(() => ({} as any)),
          ordersApi.getOrders().catch(() => [] as Order[]),
          productsApi.getProducts().catch(() => [] as Product[]),
          inventoryApi.getLowStockInventories().catch(() => []),
          purchaseRequestsApi.getPurchaseRequests({ status: "PENDING" }).catch(() => []),
          dashboardApi.getProfit(14).catch(() => [] as DailyProfitPoint[]),
          dashboardApi.getProductMargins(30).catch(() => [] as ProductMarginStat[]),
        ]);

        setStats({
          totalProducts: allProducts.length || (statsData as any).totalProducts || 0,
          totalOrders: allOrders.length || (statsData as any).totalOrders || 0,
          lowStockCount: lowStock.length || (statsData as any).lowStockCount || 0,
          pendingPRsCount: pendingPRs.length || (statsData as any).pendingPRsCount || 0,
          totalRevenue: (statsData as any).totalRevenue || 0,
          totalCogs: (statsData as any).totalCogs || 0,
          grossProfit: (statsData as any).grossProfit || 0,
          grossMarginPercent: (statsData as any).grossMarginPercent || 0,
        });

        setDailyProfit(profitData);
        setProductMargins(marginsData.slice(0, 8));

        const sortedOrders = allOrders
          .sort((a, b) => {
            const d1 = a.createdAt || (a as any).created_at || "";
            const d2 = b.createdAt || (b as any).created_at || "";
            return new Date(d2).getTime() - new Date(d1).getTime();
          })
          .slice(0, 5);
        setRecentOrders(sortedOrders);

        const salesCount: Record<string, number> = {};
        allOrders.forEach((order) => {
          order.items?.forEach((item) => {
            const pId = item.productId || (item as any).product_id || item.product?.id;
            if (pId) salesCount[pId] = (salesCount[pId] || 0) + (item.quantity || 0);
          });
        });

        const trending = allProducts
          .map((prod) => ({ ...prod, soldCount: salesCount[prod.id] || 0 }))
          .filter((prod) => prod.soldCount > 0)
          .sort((a, b) => b.soldCount - a.soldCount)
          .slice(0, 4);

        setTrendingCoffee(trending);
      } catch {
        setError("Có lỗi xảy ra khi tải dữ liệu dashboard.");
      } finally {
        setIsLoading(false);
      }
    };

    loadDashboardData();
  }, [isStaff]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loading message="Đang tải dữ liệu tổng quan..." />
      </div>
    );
  }

  const statCards = isStaff ? [
    {
      title: "Đơn hàng hôm nay",
      val: stats.totalOrders,
      desc: "Phát sinh trong ngày",
      icon: Receipt,
      path: "/admin/orders",
      iconColor: "text-emerald-700",
      iconBg: "bg-emerald-100",
      trend: "Mới nhất",
    },
    {
      title: "Tồn kho thấp",
      val: stats.lowStockCount,
      desc: "Cần nhập hàng sớm",
      icon: AlertTriangle,
      path: "/admin/inventory",
      iconColor: "text-rose-700",
      iconBg: "bg-rose-100",
      trend: stats.lowStockCount > 0 ? "⚠ Cần xử lý" : "Ổn định",
    },
    {
      title: "PRs chờ nhận hàng",
      val: stats.pendingPRsCount,
      desc: "Hàng đang về kho",
      icon: FileSpreadsheet,
      path: "/admin/purchase-requests",
      iconColor: "text-violet-700",
      iconBg: "bg-violet-100",
      trend: stats.pendingPRsCount > 0 ? "Cần nhận hàng" : "Không có hàng về",
    },
  ] : [
    {
      title: "Tổng sản phẩm",
      val: stats.totalProducts,
      desc: "Sản phẩm trong hệ thống",
      icon: Package,
      path: "/admin/products",
      iconColor: "text-amber-700",
      iconBg: "bg-amber-100",
      trend: "Đang bán",
    },
    {
      title: "Tổng đơn hàng",
      val: stats.totalOrders,
      desc: "Đơn hàng đã phát sinh",
      icon: Receipt,
      path: "/admin/orders",
      iconColor: "text-emerald-700",
      iconBg: "bg-emerald-100",
      trend: "Tất cả trạng thái",
    },
    {
      title: "Tồn kho thấp",
      val: stats.lowStockCount,
      desc: "Cần nhập hàng sớm",
      icon: AlertTriangle,
      path: "/admin/inventory",
      iconColor: "text-rose-700",
      iconBg: "bg-rose-100",
      trend: stats.lowStockCount > 0 ? "⚠ Cần xử lý" : "Ổn định",
    },
    {
      title: "PRs chờ duyệt",
      val: stats.pendingPRsCount,
      desc: "Yêu cầu đặt hàng mới",
      icon: FileSpreadsheet,
      path: "/admin/purchase-requests",
      iconColor: "text-violet-700",
      iconBg: "bg-violet-100",
      trend: stats.pendingPRsCount > 0 ? "Cần phê duyệt" : "Đã xử lý hết",
    },
  ];

  const financialCards = [
    {
      title: "Tổng doanh thu (Đã hoàn tất)",
      val: formatCurrency(stats.totalRevenue),
      desc: "Đơn hàng COMPLETED",
      icon: DollarSign,
      iconColor: "text-amber-800",
      iconBg: "bg-amber-100",
    },
    {
      title: "Tổng giá vốn (COGS)",
      val: formatCurrency(stats.totalCogs),
      desc: "Chi phí nguyên liệu & topping",
      icon: Layers,
      iconColor: "text-rose-700",
      iconBg: "bg-rose-100",
    },
    {
      title: "Lợi nhuận gộp",
      val: formatCurrency(stats.grossProfit),
      desc: "Doanh thu trừ giá vốn",
      icon: TrendingUp,
      iconColor: "text-emerald-700",
      iconBg: "bg-emerald-100",
    },
    {
      title: "Biên lợi nhuận gộp (%)",
      val: `${stats.grossMarginPercent.toFixed(1)}%`,
      desc: stats.grossMarginPercent < 30 && stats.totalRevenue > 0 ? "⚠ Biên lợi nhuận thấp (<30%)" : "Mục tiêu >= 30%",
      icon: Percent,
      iconColor: stats.grossMarginPercent < 30 && stats.totalRevenue > 0 ? "text-rose-700" : "text-teal-700",
      iconBg: stats.grossMarginPercent < 30 && stats.totalRevenue > 0 ? "bg-rose-100" : "bg-teal-100",
    },
  ];

  const maxDailyValue = Math.max(
    1,
    ...dailyProfit.map((d) => Math.max(d.revenue, d.cogs, Math.abs(d.grossProfit)))
  );

  const demoFlow = [
    { icon: ShoppingCart, label: "Khách đặt hàng", desc: "Customer đặt qua Store", color: "bg-blue-100 text-blue-700" },
    { icon: CheckCircle, label: "Admin xác nhận", desc: "Xác nhận & trừ kho tự động", color: "bg-amber-100 text-amber-800" },
    { icon: Minus, label: "Kho giảm", desc: "Inventory trừ real-time", color: "bg-orange-100 text-orange-700" },
    { icon: Bot, label: "Agent kiểm tra", desc: "AI phân tích mức tồn kho", color: "bg-violet-100 text-violet-700" },
    { icon: FileSpreadsheet, label: "Tạo PR", desc: "AI tạo Purchase Request", color: "bg-teal-100 text-teal-700" },
    { icon: Send, label: "Gửi Email", desc: "Admin duyệt, email tự gửi", color: "bg-emerald-100 text-emerald-700" },
    { icon: Eye, label: "Xem Logs", desc: "Theo dõi qua Agent Logs", color: "bg-slate-100 text-slate-700" },
  ];

  return (
    <div className="flex flex-col gap-8 pb-10">
      {error && (
        <div className="p-4 bg-rose-50 border border-rose-200 text-rose-800 text-sm font-semibold rounded-2xl flex items-center gap-2">
          <AlertTriangle size={16} className="flex-shrink-0" />
          {error}
        </div>
      )}

      {/* ── PAGE HEADER ── */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-black text-slate-800 font-serif">Tổng quan kinh doanh</h2>
          <p className="text-slate-400 text-sm mt-1">
            Xin chào trở lại — đây là hiệu suất cửa hàng hôm nay
          </p>
        </div>
        <div className="flex items-center gap-2.5">
          {!isStaff && (
            <Button
              onClick={() => navigate("/admin/simulate-sale")}
              className="flex items-center gap-1.5 bg-amber-800 hover:bg-amber-900 border-none shadow-md shadow-amber-900/20 text-white"
            >
              <Play size={14} /> Chạy Giả Lập Bán
            </Button>
          )}
          <Button
            onClick={() => navigate("/admin/ingredients")}
            variant="outline"
            className="border-slate-200 text-slate-700 bg-white hover:bg-slate-50"
          >
            Nguyên liệu & Giá vốn
          </Button>
          <Button
            onClick={() => navigate("/admin/orders")}
            variant="outline"
            className="border-slate-200 text-slate-700 bg-white hover:bg-slate-50"
          >
            Đơn hàng
          </Button>
        </div>
      </div>

      {/* ── STAT CARDS ── */}
      <div className="grid sm:grid-cols-2 xl:grid-cols-4 gap-5">
        {statCards.map((card, idx) => {
          const Icon = card.icon;
          return (
            <div
              key={idx}
              onClick={() => navigate(card.path)}
              className="bg-white rounded-2xl border border-slate-200/80 p-5 shadow-sm hover:shadow-lg hover:-translate-y-0.5 transition-all duration-300 cursor-pointer group"
            >
              <div className="flex items-start justify-between mb-4">
                <div className={`p-2.5 rounded-xl ${card.iconBg} ${card.iconColor}`}>
                  <Icon size={20} />
                </div>
                <ChevronRight
                  size={16}
                  className="text-slate-300 group-hover:text-amber-700 group-hover:translate-x-0.5 transition-all"
                />
              </div>
              <div className="space-y-1">
                <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider block">
                  {card.title}
                </span>
                <span className="text-3xl font-black text-slate-800 block font-serif">{card.val}</span>
                <span className="text-xs text-slate-400 block">{card.desc}</span>
              </div>
              <div className="mt-3 pt-3 border-t border-slate-100">
                <span className={`text-xs font-semibold ${card.val > 0 && card.trend.includes("⚠") ? "text-rose-600" : "text-slate-400"}`}>
                  {card.trend}
                </span>
              </div>
            </div>
          );
        })}
      </div>

      {/* ── FINANCIAL / COGS SUMMARY CARDS (Admin Only) ── */}
      {!isStaff && (
        <div className="grid sm:grid-cols-2 xl:grid-cols-4 gap-5">
          {financialCards.map((card, idx) => {
            const Icon = card.icon;
            return (
              <div
                key={idx}
                className="bg-white rounded-2xl border border-slate-200/80 p-5 shadow-sm flex flex-col justify-between"
              >
                <div className="flex items-start justify-between mb-3">
                  <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">
                    {card.title}
                  </span>
                  <div className={`p-2 rounded-xl ${card.iconBg} ${card.iconColor}`}>
                    <Icon size={18} />
                  </div>
                </div>
                <div>
                  <span className="text-2xl font-black text-slate-800 block">{card.val}</span>
                  <span className="text-xs text-slate-400 mt-1 block">{card.desc}</span>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ── PROFIT CHART & PRODUCT MARGINS (Admin Only) ── */}
      {!isStaff && (
        <div className="grid lg:grid-cols-2 gap-6 items-start">
          {/* Daily Revenue vs COGS & Gross Profit */}
          <div className="bg-white rounded-2xl border border-slate-200/80 p-6 shadow-sm">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="font-bold text-slate-800 flex items-center gap-2">
                  <BarChart3 size={16} className="text-amber-800" />
                  Doanh thu, Giá vốn (COGS) & Lợi nhuận gộp (14 ngày)
                </h3>
                <p className="text-xs text-slate-400 mt-0.5">
                  Tổng hợp từ các đơn hàng hoàn tất
                </p>
              </div>
              <div className="flex items-center gap-3 text-[11px] font-semibold">
                <span className="flex items-center gap-1 text-amber-800">
                  <span className="w-2.5 h-2.5 rounded-sm bg-amber-700 inline-block" /> Doanh thu
                </span>
                <span className="flex items-center gap-1 text-rose-700">
                  <span className="w-2.5 h-2.5 rounded-sm bg-rose-500 inline-block" /> Giá vốn
                </span>
                <span className="flex items-center gap-1 text-emerald-700">
                  <span className="w-2.5 h-2.5 rounded-sm bg-emerald-600 inline-block" /> Lãi gộp
                </span>
              </div>
            </div>

            {dailyProfit.length === 0 ? (
              <div className="py-12 text-center text-slate-400 text-sm">
                Chưa có dữ liệu doanh thu & giá vốn trong 14 ngày qua
              </div>
            ) : (
              <div className="space-y-3 max-h-[340px] overflow-y-auto pr-1">
                {dailyProfit.slice(-7).map((pt) => {
                  const revPct = Math.min(100, Math.round((pt.revenue / maxDailyValue) * 100));
                  const cogsPct = Math.min(100, Math.round((pt.cogs / maxDailyValue) * 100));
                  const profitPct = Math.min(
                    100,
                    Math.round((Math.max(0, pt.grossProfit) / maxDailyValue) * 100)
                  );
                  return (
                    <div key={pt.date} className="p-3 rounded-xl bg-slate-50/70 border border-slate-100 text-xs">
                      <div className="flex items-center justify-between font-semibold text-slate-700 mb-2">
                        <span>{pt.date}</span>
                        <div className="flex items-center gap-3">
                          <span className="text-amber-800">DT: {formatCurrency(pt.revenue)}</span>
                          <span className="text-rose-700">COGS: {formatCurrency(pt.cogs)}</span>
                          <span className="text-emerald-700 font-bold">
                            Lãi: {formatCurrency(pt.grossProfit)}
                          </span>
                        </div>
                      </div>
                      <div className="space-y-1">
                        <div className="w-full bg-slate-200/70 h-1.5 rounded-full overflow-hidden">
                          <div className="bg-amber-700 h-full rounded-full" style={{ width: `${revPct}%` }} />
                        </div>
                        <div className="w-full bg-slate-200/70 h-1.5 rounded-full overflow-hidden">
                          <div className="bg-rose-500 h-full rounded-full" style={{ width: `${cogsPct}%` }} />
                        </div>
                        <div className="w-full bg-slate-200/70 h-1.5 rounded-full overflow-hidden">
                          <div className="bg-emerald-600 h-full rounded-full" style={{ width: `${profitPct}%` }} />
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Product Margins Table */}
          <div className="bg-white rounded-2xl border border-slate-200/80 p-6 shadow-sm">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="font-bold text-slate-800 flex items-center gap-2">
                  <Percent size={16} className="text-teal-700" />
                  Biên lợi nhuận theo sản phẩm (30 ngày)
                </h3>
                <p className="text-xs text-slate-400 mt-0.5">
                  So sánh giá bán, giá vốn công thức và biên lợi nhuận gộp
                </p>
              </div>
              <Link
                to="/admin/products"
                className="text-xs font-semibold text-amber-800 hover:underline flex items-center gap-1"
              >
                Sản phẩm <ArrowRight size={12} />
              </Link>
            </div>

            {productMargins.length === 0 ? (
              <div className="py-12 text-center text-slate-400 text-sm">
                Chưa có dữ liệu biên lợi nhuận sản phẩm
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full table-auto text-left text-xs">
                  <thead>
                    <tr className="text-slate-400 border-b border-slate-100 uppercase tracking-wider font-bold text-[10px]">
                      <th className="pb-2.5">Sản phẩm</th>
                      <th className="pb-2.5 text-right">Giá bán</th>
                      <th className="pb-2.5 text-right">Giá vốn</th>
                      <th className="pb-2.5 text-right">Đã bán</th>
                      <th className="pb-2.5 text-right">Lãi gộp</th>
                      <th className="pb-2.5 text-right">Margin</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100/60">
                    {productMargins.map((pm) => {
                      const isLowMargin = pm.marginPercent < 30;
                      return (
                        <tr key={pm.productId} className="hover:bg-slate-50/60">
                          <td className="py-2.5 font-bold text-slate-800">
                            <Link
                              to={`/admin/products/${pm.productId}/edit`}
                              className="hover:text-amber-800"
                            >
                              {pm.productName}
                            </Link>
                          </td>
                          <td className="py-2.5 text-right text-slate-600">
                            {formatCurrency(pm.currentPrice)}
                          </td>
                          <td className="py-2.5 text-right text-rose-700 font-medium">
                            {formatCurrency(pm.currentCostPrice)}
                          </td>
                          <td className="py-2.5 text-right font-semibold text-slate-700">
                            {pm.soldQty}
                          </td>
                          <td className="py-2.5 text-right font-bold text-emerald-700">
                            {formatCurrency(pm.grossProfit)}
                          </td>
                          <td className="py-2.5 text-right">
                            <span
                              className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-bold ${
                                isLowMargin
                                  ? "bg-rose-50 text-rose-700 border border-rose-200"
                                  : "bg-emerald-50 text-emerald-700 border border-emerald-200"
                              }`}
                            >
                              {pm.marginPercent.toFixed(1)}%
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── QUICK ACTIONS ── */}
      {!isStaff && (
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {[
            { label: "Xem Đơn hàng", path: "/admin/orders", icon: Receipt, color: "hover:border-amber-300 hover:bg-amber-50/30" },
            { label: "Mô phỏng bán", path: "/admin/simulate-sale", icon: Play, color: "hover:border-violet-300 hover:bg-violet-50/30" },
            { label: "Duyệt PR", path: "/admin/purchase-requests", icon: FileSpreadsheet, color: "hover:border-teal-300 hover:bg-teal-50/30" },
            { label: "Agent Logs", path: "/admin/agent-logs", icon: Eye, color: "hover:border-slate-300 hover:bg-slate-50/30" },
          ].map((action, idx) => {
            const Icon = action.icon;
            return (
              <button
                key={idx}
                onClick={() => navigate(action.path)}
                className={`flex items-center gap-3 p-4 bg-white rounded-xl border border-slate-200 text-sm font-semibold text-slate-700 transition-all duration-200 group ${action.color}`}
              >
                <Icon size={16} className="text-slate-400 group-hover:text-amber-800 transition-colors" />
                {action.label}
                <ArrowRight size={14} className="ml-auto text-slate-300 group-hover:text-amber-700 group-hover:translate-x-0.5 transition-all" />
              </button>
            );
          })}
        </div>
      )}

      {/* ── MAIN CONTENT GRID ── */}
      {!isStaff && (
        <div className="grid lg:grid-cols-3 gap-6 items-start">
          {/* Recent Orders */}
        <div className="lg:col-span-2 bg-white rounded-2xl border border-slate-200/80 p-6 shadow-sm">
          <div className="flex items-center justify-between mb-5">
            <h3 className="font-bold text-slate-800 flex items-center gap-2">
              <Clock size={16} className="text-amber-800" />
              Đơn hàng gần đây
            </h3>
            <Link
              to="/admin/orders"
              className="text-xs font-semibold text-amber-800 hover:text-amber-900 flex items-center gap-1 hover:underline"
            >
              Tất cả <ArrowRight size={12} />
            </Link>
          </div>

          {recentOrders.length === 0 ? (
            <div className="py-12 text-center text-slate-400 text-sm">
              <Receipt size={32} className="mx-auto mb-2 opacity-30" />
              Chưa có đơn hàng nào
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full table-auto text-left text-xs">
                <thead>
                  <tr className="text-slate-400 border-b border-slate-100 uppercase tracking-widest font-bold text-[10px]">
                    <th className="pb-3 pl-2">Mã đơn</th>
                    <th className="pb-3">Khách hàng</th>
                    <th className="pb-3">Tổng tiền</th>
                    <th className="pb-3">Thanh toán</th>
                    <th className="pb-3">Trạng thái</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100/60">
                  {recentOrders.map((order) => {
                    const dateVal = order.createdAt || (order as any).created_at || "";
                    const orderIdStr = order.id.slice(-8).toUpperCase();
                    return (
                      <tr
                        key={order.id}
                        className="hover:bg-slate-50/50 transition-colors group"
                      >
                        <td className="py-3.5 pl-2 font-bold text-slate-800 group-hover:text-amber-800 transition-colors">
                          <Link to={`/admin/orders/${order.id}`}>#{orderIdStr}</Link>
                        </td>
                        <td className="py-3.5">
                          <p className="font-semibold text-slate-700">
                            {order.customer?.name || order.customer?.email || `#${orderIdStr}`}
                          </p>
                          {dateVal && (
                            <span className="text-[10px] text-slate-400">{formatDate(dateVal)}</span>
                          )}
                        </td>
                        <td className="py-3.5 font-bold text-slate-800">
                          {formatCurrency(order.totalAmount)}
                        </td>
                        <td className="py-3.5">
                          <Badge status={order.paymentStatus || (order as any).payment_status} />
                        </td>
                        <td className="py-3.5">
                          <Badge status={order.status} />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Trending Coffee */}
        <div className="bg-white rounded-2xl border border-slate-200/80 p-6 shadow-sm">
          <div className="flex items-center justify-between mb-5">
            <h3 className="font-bold text-slate-800 flex items-center gap-2">
              <TrendingUp size={16} className="text-amber-700" />
              Bán chạy
            </h3>
            <span className="text-[10px] bg-amber-100 text-amber-800 font-bold px-2.5 py-0.5 rounded-full border border-amber-200 flex items-center gap-1">
              <Sparkles size={10} /> Hot
            </span>
          </div>

          {trendingCoffee.length === 0 ? (
            <div className="py-12 text-center text-slate-400 text-sm">
              <TrendingUp size={32} className="mx-auto mb-2 opacity-30" />
              Chưa có dữ liệu bán hàng
            </div>
          ) : (
            <div className="flex flex-col gap-3">
              {trendingCoffee.map((prod, idx) => {
                const img =
                  prod.imageUrl ||
                  (prod as any).image_url ||
                  "/images/product-fallback.jpg";
                return (
                  <div
                    key={prod.id}
                    className="flex items-center gap-3 p-3 bg-slate-50/60 border border-slate-100 rounded-xl hover:border-amber-200 hover:bg-amber-50/20 transition-all"
                  >
                    <span className="text-xs font-black text-amber-800 w-5 text-center flex-shrink-0">
                      {idx + 1}
                    </span>
                    <img
                      src={img}
                      alt={prod.name}
                      className="w-10 h-10 object-cover rounded-lg border border-slate-100 flex-shrink-0"
                      onError={(e) => {
                        e.currentTarget.src =
                          "/images/product-fallback.jpg";
                      }}
                    />
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-bold text-slate-800 truncate">{prod.name}</p>
                      <span className="text-[10px] text-slate-400">
                        {formatCurrency(prod.price)}
                      </span>
                    </div>
                    <div className="text-right flex-shrink-0">
                      <span className="text-xs font-black text-amber-800 block">{prod.soldCount}</span>
                      <span className="text-[9px] text-slate-400">đã bán</span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
      )}

      {/* ── DEMO FLOW ── */}
      {!isStaff && (
        <div className="bg-white rounded-2xl border border-slate-200/80 p-6 shadow-sm">
          <div className="mb-5">
          <h3 className="font-bold text-slate-800 flex items-center gap-2">
            <Sparkles size={16} className="text-amber-700" />
            Luồng demo hệ thống
          </h3>
          <p className="text-xs text-slate-400 mt-1">
            Quy trình tự động từ đặt hàng → AI Agent → Purchase Request → Email nhà cung cấp
          </p>
        </div>

        <div className="flex flex-wrap gap-3 items-center">
          {demoFlow.map((step, idx) => {
            const Icon = step.icon;
            return (
              <React.Fragment key={idx}>
                <div className="flex flex-col items-center gap-1.5 min-w-[80px] text-center">
                  <div className={`p-2.5 rounded-xl ${step.color}`}>
                    <Icon size={18} />
                  </div>
                  <span className="text-[10px] font-bold text-slate-700">{step.label}</span>
                  <span className="text-[9px] text-slate-400 leading-tight">{step.desc}</span>
                </div>
                {idx < demoFlow.length - 1 && (
                  <ChevronRight size={18} className="text-slate-300 flex-shrink-0 hidden sm:block" />
                )}
              </React.Fragment>
            );
          })}
        </div>

        <div className="mt-5 pt-4 border-t border-slate-100 flex flex-wrap gap-2">
          <Button
            size="sm"
            onClick={() => navigate("/admin/simulate-sale")}
            className="bg-amber-800 hover:bg-amber-900 text-white border-none text-xs"
          >
            <Play size={12} className="mr-1" /> Chạy Simulate Sale
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={() => navigate("/admin/purchase-requests")}
            className="text-xs"
          >
            <FileSpreadsheet size={12} className="mr-1" /> Xem Purchase Requests
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={() => navigate("/admin/agent-logs")}
            className="text-xs"
          >
            <Eye size={12} className="mr-1" /> Xem Agent Logs
          </Button>
        </div>
        </div>
      )}
    </div>
  );
};
