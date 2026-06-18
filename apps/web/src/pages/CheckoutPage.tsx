import React, { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { useCart } from "../contexts/CartContext";
import { getOrderErrorMessage, ordersApi } from "../api/orders.api";
import type { PaymentMethod } from "../types/order.types";
import { formatCurrency } from "../utils/formatCurrency";
import { Button } from "../components/common/Button";
import { ArrowLeft, ShoppingBag, Sparkles, AlertCircle } from "lucide-react";
import { useToast } from "../contexts/ToastContext";

export const CheckoutPage: React.FC = () => {
  const { items, totalAmount, clearCart } = useCart();
  const navigate = useNavigate();
  const toast = useToast();
  
  const [note, setNote] = useState("");
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod | "">("BANK_TRANSFER");
  
  const [apiError, setApiError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const getCartProductId = (item: (typeof items)[number]) => {
    return String(item.product.id ?? (item.product as any).product_id ?? "").trim();
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setApiError(null);

    if (items.length === 0) {
      toast.warning("Giỏ hàng đang trống.");
      return;
    }

    if (!paymentMethod) {
      toast.warning("Vui lòng chọn phương thức thanh toán.");
      return;
    }

    if (items.some((item) => !getCartProductId(item))) {
      toast.warning("Sản phẩm trong giỏ hàng không hợp lệ.");
      return;
    }

    if (items.some((item) => !Number.isInteger(Number(item.quantity)) || Number(item.quantity) <= 0)) {
      toast.warning("Số lượng sản phẩm không hợp lệ.");
      return;
    }

    setIsLoading(true);
    toast.info("Đang tạo đơn hàng...");

    const payload = {
      items: items.map((item) => ({
        productId: getCartProductId(item),
        quantity: Number(item.quantity),
      })),
      paymentMethod,
      note: note.trim() || undefined,
    };

    try {
      await ordersApi.createOrder(payload);
      toast.success("Tạo đơn hàng thành công.");
      clearCart();
      navigate("/my-orders?success=true");
    } catch (err: any) {
      const message = getOrderErrorMessage(err, "Không thể tạo đơn hàng, vui lòng thử lại.");
      setApiError(message);
      toast.error(message);
    } finally {
      setIsLoading(false);
    }
  };

  if (items.length === 0) {
    return (
      <div className="max-w-md mx-auto my-20 text-center p-8 bg-slate-50 border border-slate-200 rounded-2xl">
        <p className="font-semibold text-slate-700 mb-4">Giỏ hàng của bạn trống</p>
        <Link to="/products">
          <Button size="sm">Mua sắm ngay</Button>
        </Link>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-12 pb-24">
      {/* Small Hero Header */}
      <section className="relative bg-[#1e130e] text-white py-16 px-4 text-center overflow-hidden">
        <div className="absolute inset-0 opacity-10 mix-blend-overlay bg-cover bg-center" style={{ backgroundImage: "url('https://images.unsplash.com/photo-1507133750040-4a8f57021571?auto=format&fit=crop&q=80&w=800')" }}></div>
        <div className="relative z-10 flex flex-col items-center gap-2">
          <span className="text-[#c49b76] text-xs font-bold uppercase tracking-widest flex items-center gap-1">
            <Sparkles size={12} /> Hoàn tất đơn hàng
          </span>
          <h1 className="text-3xl sm:text-4xl font-extrabold font-serif">Thanh Toán Mô Phỏng</h1>
          <p className="text-sm text-amber-200/60 font-light max-w-md">Kiểm tra giỏ hàng và chọn phương thức thanh toán</p>
        </div>
      </section>

      {/* Main Content Container */}
      <div className="max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 flex flex-col gap-6">
        {/* Back button */}
        <div>
          <Link
            to="/cart"
            className="inline-flex items-center gap-1.5 text-sm font-bold text-slate-500 hover:text-amber-800 transition-colors uppercase tracking-wider"
          >
            <ArrowLeft size={16} />
            <span>Quay lại giỏ hàng</span>
          </Link>
        </div>

        <div className="grid lg:grid-cols-3 gap-8 items-start">
          {/* Left Form */}
          <form onSubmit={handleSubmit} className="lg:col-span-2 bg-white border border-amber-900/5 rounded-3xl p-6 sm:p-10 shadow-xl space-y-6">
            <h3 className="text-lg font-bold text-slate-800 border-b border-amber-900/5 pb-4 flex items-center gap-2 uppercase tracking-wider">
              <ShoppingBag size={20} className="text-amber-800" /> Thông tin đặt hàng
            </h3>

            {apiError && (
              <div className="p-4 bg-rose-50 border border-rose-100 text-rose-800 text-sm font-semibold rounded-xl flex items-center gap-2">
                <AlertCircle size={16} className="text-rose-600" />
                <span>{apiError}</span>
              </div>
            )}

            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-1.5">
                Ghi chú thêm (Tùy chọn)
              </label>
              <textarea
                rows={3}
                placeholder="Giao giờ hành chính, gọi điện trước khi giao..."
                value={note}
                onChange={(e) => setNote(e.target.value)}
                className="block w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-sm outline-none transition focus:border-amber-700 focus:ring-2 focus:ring-amber-50 placeholder-slate-400 text-slate-900"
              />
            </div>

            {/* Payment Method Selector */}
            <div className="space-y-3">
              <label className="block text-sm font-bold text-slate-800 uppercase tracking-wider">
                Phương thức thanh toán mô phỏng
              </label>
              <div className="grid sm:grid-cols-3 gap-4">
                {[
                  { id: "CASH", title: "Tiền mặt", desc: "Trả tiền mặt" },
                  { id: "BANK_TRANSFER", title: "Chuyển khoản", desc: "Chuyển khoản ngân hàng" },
                ].map((method) => (
                  <label
                    key={method.id}
                    className={`flex flex-col p-4 border rounded-2xl cursor-pointer transition-all hover:bg-slate-50
                      ${paymentMethod === method.id ? "border-amber-800 bg-amber-50/20 ring-1 ring-amber-800" : "border-slate-200"}`}
                  >
                    <input
                      type="radio"
                      name="paymentMethod"
                      value={method.id}
                      checked={paymentMethod === method.id}
                      onChange={() => setPaymentMethod(method.id as PaymentMethod)}
                      className="sr-only"
                    />
                    <span className="font-bold text-sm text-slate-850">{method.title}</span>
                    <span className="text-[10px] text-slate-400 mt-1 leading-normal font-light">{method.desc}</span>
                  </label>
                ))}
              </div>
            </div>

            {/* Simulated Warning Info */}
            <div className="p-4 bg-amber-50 border border-amber-900/5 text-amber-900 rounded-2xl text-xs font-light leading-relaxed">
              <strong>Lưu ý:</strong> Đây là thanh toán mô phỏng phục vụ demo, hệ thống không xử lý giao dịch tiền thật.
            </div>

            <div className="pt-4 border-t border-amber-900/5 flex justify-end">
              <Button
                type="submit"
                isLoading={isLoading}
                className="px-8 py-3.5 bg-amber-800 hover:bg-amber-900 border-none text-white font-bold shadow-lg shadow-amber-900/15"
              >
                Đặt hàng ngay
              </Button>
            </div>
          </form>

          {/* Right Summary */}
          <div className="bg-white border border-amber-900/5 rounded-3xl p-6 sm:p-8 shadow-xl flex flex-col gap-6">
            <h3 className="text-base font-bold text-slate-850 border-b border-amber-900/5 pb-4 uppercase tracking-wider">
              Sản phẩm đặt mua
            </h3>

            <div className="divide-y divide-amber-900/5 max-h-60 overflow-y-auto pr-1">
              {items.map((item) => (
                <div key={item.product.id} className="py-3 flex items-center justify-between text-sm gap-2">
                  <div className="flex-1 min-w-0">
                    <p className="font-bold text-slate-800 truncate">{item.product.name}</p>
                    <p className="text-slate-400 text-xs mt-0.5">
                      {item.quantity} x {formatCurrency(item.product.price)}
                    </p>
                  </div>
                  <span className="font-bold text-slate-800 flex-shrink-0">
                    {formatCurrency(item.product.price * item.quantity)}
                  </span>
                </div>
              ))}
            </div>

            <div className="border-t border-amber-900/5 pt-4 flex flex-col gap-2.5">
              <div className="flex justify-between text-base font-black text-slate-900">
                <span>Tổng cộng</span>
                <span className="text-amber-850 text-lg font-black">{formatCurrency(totalAmount)}</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
