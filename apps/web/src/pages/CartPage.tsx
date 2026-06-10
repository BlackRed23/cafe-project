import React from "react";
import { Link, useNavigate } from "react-router-dom";
import { useCart } from "../contexts/CartContext";
import { formatCurrency } from "../utils/formatCurrency";
import { Button } from "../components/common/Button";
import { EmptyState } from "../components/common/EmptyState";
import { Trash2, Plus, Minus, ArrowLeft, CreditCard, Sparkles } from "lucide-react";

export const CartPage: React.FC = () => {
  const { items, totalAmount, updateQuantity, removeFromCart } = useCart();
  const navigate = useNavigate();

  const handleImageError = (e: React.SyntheticEvent<HTMLImageElement, Event>) => {
    e.currentTarget.src = "https://images.unsplash.com/photo-1509042239860-f550ce710b93?auto=format&fit=crop&q=80&w=400";
  };

  if (items.length === 0) {
    return (
      <div className="max-w-2xl mx-auto my-20 px-4">
        <EmptyState
          title="Giỏ hàng của bạn đang trống"
          description="Hãy dạo quanh cửa hàng và chọn cho mình những sản phẩm cà phê tuyệt vời nhất."
          actionText="Xem sản phẩm"
          actionPath="/products"
        />
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
            <Sparkles size={12} /> Lựa chọn của bạn
          </span>
          <h1 className="text-3xl sm:text-4xl font-extrabold font-serif">Giỏ Hàng</h1>
          <p className="text-sm text-amber-200/60 font-light max-w-md">Kiểm tra lại các mặt hàng trước khi tiến hành đặt hàng</p>
        </div>
      </section>

      {/* Cart content container */}
      <div className="max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 grid lg:grid-cols-3 gap-8 items-start">
        {/* Left: list items */}
        <div className="lg:col-span-2 flex flex-col gap-4">
          {items.map((item) => {
            const product = item.product;
            const imgUrl = product.imageUrl || product.image_url || "https://images.unsplash.com/photo-1509042239860-f550ce710b93?auto=format&fit=crop&q=80&w=400";
            return (
              <div
                key={product.id}
                className="bg-white rounded-3xl border border-amber-900/5 p-4 sm:p-6 flex items-center justify-between gap-4 shadow-xl shadow-amber-950/2"
              >
                {/* Product details */}
                <div className="flex items-center gap-4">
                  <div className="w-16 sm:w-20 aspect-square rounded-2xl bg-amber-50/20 border border-amber-900/5 overflow-hidden flex-shrink-0">
                    <img
                      src={imgUrl}
                      alt={product.name}
                      onError={handleImageError}
                      className="w-full h-full object-cover"
                    />
                  </div>
                  <div>
                    <h3 className="font-bold text-slate-800 text-sm sm:text-base line-clamp-1">
                      {product.name}
                    </h3>
                    <p className="text-xs text-slate-400 mt-0.5">Đơn vị: {product.unit || "hộp"}</p>
                    <span className="text-sm font-bold text-amber-850 block mt-1">
                      {formatCurrency(product.price)}
                    </span>
                  </div>
                </div>

                {/* Actions & subtotals */}
                <div className="flex flex-col sm:flex-row items-end sm:items-center gap-4 sm:gap-8">
                  {/* Quantity adjustments */}
                  <div className="flex items-center border border-amber-900/10 rounded-xl overflow-hidden bg-white">
                    <button
                      onClick={() => updateQuantity(product.id, item.quantity - 1)}
                      className="px-3 py-1.5 text-slate-500 hover:bg-slate-50 hover:text-slate-800 transition-colors"
                    >
                      <Minus size={13} />
                    </button>
                    <span className="w-8 text-center text-sm font-bold text-slate-850">
                      {item.quantity}
                    </span>
                    <button
                      onClick={() => updateQuantity(product.id, item.quantity + 1)}
                      className="px-3 py-1.5 text-slate-500 hover:bg-slate-50 hover:text-slate-850 transition-colors"
                    >
                      <Plus size={13} />
                    </button>
                  </div>

                  {/* Subtotal & trash */}
                  <div className="flex items-center gap-4 min-w-[120px] justify-end">
                    <span className="text-sm font-bold text-slate-800">
                      {formatCurrency(product.price * item.quantity)}
                    </span>
                    <button
                      onClick={() => removeFromCart(product.id)}
                      className="p-2 text-slate-400 hover:text-rose-600 transition-colors rounded-xl hover:bg-slate-50"
                      title="Xóa sản phẩm"
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                </div>
              </div>
            );
          })}

          <Link
            to="/products"
            className="inline-flex items-center gap-1.5 text-sm font-bold text-amber-800 hover:text-amber-950 mt-4 transition-colors w-fit uppercase tracking-wider"
          >
            <ArrowLeft size={16} /> Tiếp tục chọn sản phẩm
          </Link>
        </div>

        {/* Right: Cart Summary Panel */}
        <div className="bg-white rounded-3xl border border-amber-900/5 p-6 sm:p-8 shadow-xl flex flex-col gap-6">
          <h3 className="text-base font-bold text-slate-800 border-b border-amber-900/5 pb-4 uppercase tracking-wider">
            Tóm tắt đơn hàng
          </h3>

          <div className="space-y-4 text-sm">
            <div className="flex justify-between text-slate-500">
              <span>Tổng số lượng</span>
              <span className="font-bold text-slate-805">
                {items.reduce((sum, item) => sum + item.quantity, 0)} sản phẩm
              </span>
            </div>
            <div className="flex justify-between text-slate-500 pb-4 border-b border-amber-900/5">
              <span>Phí giao hàng</span>
              <span className="text-emerald-700 font-bold">Miễn phí</span>
            </div>
            <div className="flex justify-between text-base font-black text-slate-900 pt-2">
              <span>Tổng cộng</span>
              <span className="text-amber-850 text-lg">{formatCurrency(totalAmount)}</span>
            </div>
          </div>

          <Button
            onClick={() => navigate("/checkout")}
            className="w-full py-3.5 flex items-center justify-center gap-2 bg-amber-800 hover:bg-amber-900 border-none text-white font-bold shadow-lg shadow-amber-900/15"
          >
            <CreditCard size={18} />
            Tiến hành thanh toán
          </Button>
        </div>
      </div>
    </div>
  );
};
