import React, { useState, useEffect } from "react";
import { useSearchParams } from "react-router-dom";
import { ordersApi } from "../api/orders.api";
import type { Order } from "../types/order.types";
import { formatCurrency } from "../utils/formatCurrency";
import { getZoneLabel } from "../utils/shipping";
import { getPaymentMethodLabel } from "../utils/payment";
import { formatDate } from "../utils/formatDate";
import { Badge } from "../components/common/Badge";
import { Loading } from "../components/common/Loading";
import { EmptyState } from "../components/common/EmptyState";
import { Button } from "../components/common/Button";
import { CheckCircle2, ChevronDown, ChevronUp, Package, Calendar, CreditCard, DollarSign, Sparkles, User, Phone, MapPin, MessageSquare } from "lucide-react";

export const MyOrdersPage: React.FC = () => {
  const [orders, setOrders] = useState<Order[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchParams] = useSearchParams();
  const showSuccessBanner = searchParams.get("success") === "true";
  
  // State to toggle expanded order items view
  const [expandedOrderId, setExpandedOrderId] = useState<string | null>(null);

  useEffect(() => {
    const fetchOrders = async () => {
      try {
        setIsLoading(true);
        const data = await ordersApi.getMyOrders();
        // Sort orders by newest first
        const sorted = data.sort((a, b) => {
          const d1 = a.createdAt || (a as any).created_at || "";
          const d2 = b.createdAt || (b as any).created_at || "";
          return new Date(d2).getTime() - new Date(d1).getTime();
        });
        setOrders(sorted);
      } catch (err: any) {
        setError("Không thể tải danh sách đơn hàng của bạn. Vui lòng tải lại.");
      } finally {
        setIsLoading(false);
      }
    };
    fetchOrders();
  }, []);

  const toggleExpand = (id: string) => {
    if (expandedOrderId === id) {
      setExpandedOrderId(null);
    } else {
      setExpandedOrderId(id);
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-[50vh] flex items-center justify-center">
        <Loading message="Đang tải lịch sử mua hàng..." />
      </div>
    );
  }

  if (error) {
    return (
      <div className="max-w-xl mx-auto my-20 text-center p-8 bg-rose-50 border border-rose-100 text-rose-800 rounded-2xl shadow-sm">
        <p className="font-bold mb-2">Đã xảy ra lỗi</p>
        <p className="text-sm mb-6">{error}</p>
        <Button onClick={() => window.location.reload()} size="sm">Tải lại</Button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-12 pb-24">
      {/* Small Hero Header */}
      <section className="relative bg-[#1e130e] text-white py-16 px-4 text-center overflow-hidden">
        <div className="absolute inset-0 opacity-10 mix-blend-overlay bg-cover bg-center" style={{ backgroundImage: "url('/images/page-header-bg.jpg')" }}></div>
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 w-full relative z-10 flex flex-col items-center gap-2">
          <span className="text-[#c49b76] text-xs font-bold uppercase tracking-widest flex items-center gap-1">
            <Sparkles size={12} /> Lịch sử của bạn
          </span>
          <h1 className="text-3xl sm:text-4xl font-extrabold font-serif">Đơn Hàng Của Tôi</h1>
          <p className="text-sm text-amber-200/60 font-light max-w-md">Theo dõi chi tiết trạng thái giao nhận và thanh toán</p>
        </div>
      </section>

      <div className="max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 flex flex-col gap-6">
        {/* Banner đặt hàng thành công */}
        {showSuccessBanner && (
          <div className="flex items-center gap-4 p-5 bg-emerald-50 border border-emerald-100 text-emerald-800 rounded-2xl shadow-sm">
            <div className="p-2.5 bg-emerald-600 text-white rounded-xl">
              <CheckCircle2 size={20} />
            </div>
            <div>
              <h4 className="font-bold text-sm sm:text-base">Đặt hàng thành công!</h4>
              <p className="text-xs sm:text-sm text-emerald-700 mt-0.5 font-light">
                Đơn hàng đã được tạo thành công trên hệ thống. Hệ thống tự động đang theo dõi tiến độ xử lý.
              </p>
            </div>
          </div>
        )}

        {orders.length === 0 ? (
          <EmptyState
            title="Bạn chưa có đơn hàng nào"
            description="Lịch sử mua hàng của bạn trống. Hãy đặt những sản phẩm cà phê đầu tiên."
            actionText="Xem sản phẩm"
            actionPath="/products"
          />
        ) : (
          <div className="space-y-4">
            {orders.map((order) => {
              const isExpanded = expandedOrderId === order.id;
              const orderIdStr = order.id.slice(-8).toUpperCase();
              const dateVal = order.createdAt || (order as any).created_at || "";

              return (
                <div
                  key={order.id}
                  className="bg-white border border-amber-900/5 rounded-3xl overflow-hidden shadow-xl"
                >
                  {/* Order Summary Line */}
                  <div
                    onClick={() => toggleExpand(order.id)}
                    className="p-5 sm:p-6 flex flex-col md:flex-row md:items-center justify-between gap-4 cursor-pointer hover:bg-slate-50/50 transition-colors"
                  >
                    <div className="grid grid-cols-2 md:flex md:items-center gap-4 md:gap-8 flex-1">
                      {/* Order ID */}
                      <div className="flex flex-col">
                        <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Mã đơn</span>
                        <span className="text-sm font-bold text-slate-800 truncate">
                          #{orderIdStr}
                        </span>
                      </div>

                      {/* Date */}
                      <div className="flex flex-col">
                        <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider flex items-center gap-1">
                          <Calendar size={10} /> Ngày đặt
                        </span>
                        <span className="text-xs text-slate-600 font-bold">
                          {dateVal ? formatDate(dateVal) : ""}
                        </span>
                      </div>

                      {/* Total Amount */}
                      <div className="flex flex-col">
                        <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider flex items-center gap-1">
                          <DollarSign size={10} /> Tổng tiền
                        </span>
                        <span className="text-sm font-black text-amber-850">
                          {formatCurrency(order.totalAmount)}
                        </span>
                      </div>

                      {/* Payment Method */}
                      <div className="flex flex-col">
                        <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider flex items-center gap-1">
                          <CreditCard size={10} /> Thanh toán
                        </span>
                        <span className="text-xs text-slate-700 font-bold">
                          {getPaymentMethodLabel(order.paymentMethod || (order as any).payment_method)}
                        </span>
                      </div>
                    </div>

                    {/* Badges & Arrow */}
                    <div className="flex items-center gap-3.5 justify-between md:justify-end border-t border-slate-100 pt-3 md:border-t-0 md:pt-0">
                      <Badge status={order.status} />
                      <div className="text-slate-400">
                        {isExpanded ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
                      </div>
                    </div>
                  </div>

                  {/* Expanded Details */}
                  {isExpanded && (
                    <div className="border-t border-amber-900/5 bg-[#faf6f0]/50 p-5 sm:p-6 space-y-4">

                      {/* Shipping Info */}
                      {(order.shippingName || order.shippingPhone || order.shippingAddress) && (
                        <div>
                          <h4 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-3 flex items-center gap-1.5">
                            <MapPin size={12} /> Thông tin giao hàng
                          </h4>
                          <div className="bg-white border border-amber-900/5 rounded-2xl p-4 shadow-sm space-y-2.5">
                            {order.shippingName && (
                              <div className="flex items-center gap-2.5 text-sm">
                                <User size={14} className="text-amber-700 shrink-0" />
                                <span className="text-slate-500 font-medium w-28 shrink-0">Người nhận:</span>
                                <span className="font-bold text-slate-800">{order.shippingName}</span>
                              </div>
                            )}
                            {order.shippingPhone && (
                              <div className="flex items-center gap-2.5 text-sm">
                                <Phone size={14} className="text-amber-700 shrink-0" />
                                <span className="text-slate-500 font-medium w-28 shrink-0">Số điện thoại:</span>
                                <span className="font-bold text-slate-800">{order.shippingPhone}</span>
                              </div>
                            )}
                            {order.shippingAddress && (
                              <div className="flex items-start gap-2.5 text-sm">
                                <MapPin size={14} className="text-amber-700 shrink-0 mt-0.5" />
                                <span className="text-slate-500 font-medium w-28 shrink-0">Địa chỉ:</span>
                                <span className="font-bold text-slate-800 leading-relaxed">{order.shippingAddress}</span>
                              </div>
                            )}
                          </div>
                        </div>
                      )}

                      {/* Products details */}
                      <div>
                        <h4 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-3 flex items-center gap-1.5">
                          <Package size={12} /> Sản phẩm đặt mua
                        </h4>
                        <div className="bg-white border border-amber-900/5 rounded-2xl divide-y divide-amber-900/5 overflow-hidden shadow-sm">
                          {order.items?.map((item) => (
                            <div key={item.id} className="p-4 flex items-center justify-between text-sm">
                              <div>
                                <p className="font-bold text-slate-800">
                                  {item.product?.name || (item as any).Product?.name || "Sản phẩm"}
                                </p>
                                <p className="text-slate-400 text-xs mt-0.5 font-light">
                                  Số lượng: {item.quantity} {item.product?.unit || (item as any).Product?.unit || "hộp"}
                                </p>
                              </div>
                              <span className="font-bold text-slate-800">
                                {formatCurrency((item.price || (item as any).Price || 0) * item.quantity)}
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>

                      {order.note && (
                        <div className="text-sm bg-white p-4 border border-amber-900/5 rounded-2xl shadow-sm">
                          <div className="flex items-center gap-1.5 text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">
                            <MessageSquare size={12} /> Ghi chú đơn hàng
                          </div>
                          <p className="text-slate-600 leading-relaxed font-bold mt-1">{order.note}</p>
                        </div>
                      )}

                      {/* Tổng tiền chi tiết */}
                      <div className="bg-white border border-amber-900/5 rounded-2xl p-4 shadow-sm">
                        <div className="flex flex-col gap-2">
                          <div className="flex justify-between text-sm text-slate-500">
                            <span>Tiền hàng</span>
                            <span>{formatCurrency(order.totalAmount - (order.shippingFee ?? 0))}</span>
                          </div>
                          {order.shippingFee != null && (
                            <div className="flex justify-between text-sm text-slate-500">
                              <span className="flex items-center gap-1">
                                Phí ship
                                {order.shippingZone && (
                                  <span className="text-[10px] bg-slate-100 px-1.5 py-0.5 rounded font-medium text-slate-500">
                                    {getZoneLabel(order.shippingZone)}
                                  </span>
                                )}
                              </span>
                              {order.shippingFee === 0 ? (
                                <span className="text-emerald-600 font-bold">Miễn phí</span>
                              ) : (
                                <span className="font-semibold">{formatCurrency(order.shippingFee)}</span>
                              )}
                            </div>
                          )}
                          <div className="flex justify-between text-sm font-black text-slate-900 border-t border-slate-100 pt-2">
                            <span>Tổng thanh toán</span>
                            <span className="text-amber-800">{formatCurrency(order.totalAmount)}</span>
                          </div>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};
