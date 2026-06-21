import React, { useState, useMemo, useEffect } from "react";
import { useNavigate, Link } from "react-router-dom";
import { useCart } from "../contexts/CartContext";
import { getOrderErrorMessage, ordersApi } from "../api/orders.api";
import type { PaymentMethod } from "../types/order.types";
import { formatCurrency } from "../utils/formatCurrency";
import { detectShippingZone, calculateShippingFee, getZoneLabel, FREE_SHIPPING_THRESHOLD } from "../utils/shipping";
import { Button } from "../components/common/Button";
import { ArrowLeft, ShoppingBag, Sparkles, AlertCircle, User, Phone, MapPin, MessageSquare, CreditCard, Truck, Gift, Copy, CheckCheck } from "lucide-react";
import { useToast } from "../contexts/ToastContext";

export const CheckoutPage: React.FC = () => {
  const { items, totalAmount: subtotal, clearCart } = useCart();
  const navigate = useNavigate();
  const toast = useToast();

  const [shippingName, setShippingName] = useState("");
  const [shippingPhone, setShippingPhone] = useState("");
  const [address, setAddress] = useState("");
  const [note, setNote] = useState("");
  const [paymentMethod] = useState<PaymentMethod>("CASH");

  // Location states
  const [provinces, setProvinces] = useState<any[]>([]);
  const [districts, setDistricts] = useState<any[]>([]);
  const [wards, setWards] = useState<any[]>([]);

  const [selectedProvinceCode, setSelectedProvinceCode] = useState<number | "">("");
  const [selectedDistrictCode, setSelectedDistrictCode] = useState<number | "">("");
  const [selectedWardCode, setSelectedWardCode] = useState<number | "">("");

  useEffect(() => {
    fetch("https://provinces.open-api.vn/api/p/")
      .then(res => res.json())
      .then(data => setProvinces(data))
      .catch(console.error);
  }, []);

  useEffect(() => {
    if (selectedProvinceCode) {
      fetch(`https://provinces.open-api.vn/api/p/${selectedProvinceCode}?depth=2`)
        .then(res => res.json())
        .then(data => setDistricts(data.districts || []))
        .catch(console.error);
    } else {
      setDistricts([]);
    }
    setSelectedDistrictCode("");
    setSelectedWardCode("");
  }, [selectedProvinceCode]);

  useEffect(() => {
    if (selectedDistrictCode) {
      fetch(`https://provinces.open-api.vn/api/d/${selectedDistrictCode}?depth=2`)
        .then(res => res.json())
        .then(data => setWards(data.wards || []))
        .catch(console.error);
    } else {
      setWards([]);
    }
    setSelectedWardCode("");
  }, [selectedDistrictCode]);

  const provinceName = useMemo(() => provinces.find(p => p.code === selectedProvinceCode)?.name || "", [provinces, selectedProvinceCode]);
  const districtName = useMemo(() => districts.find(d => d.code === selectedDistrictCode)?.name || "", [districts, selectedDistrictCode]);
  const wardName = useMemo(() => wards.find(w => w.code === selectedWardCode)?.name || "", [wards, selectedWardCode]);

  const shippingAddress = [address, wardName, districtName, provinceName].filter(Boolean).join(", ");

  // Tính phí ship realtime
  const shippingZone = useMemo(() => detectShippingZone(shippingAddress), [shippingAddress]);
  const shippingFee = useMemo(() => calculateShippingFee(shippingZone, subtotal), [shippingZone, subtotal]);
  const grandTotal = subtotal + shippingFee;
  const remainForFreeShip = FREE_SHIPPING_THRESHOLD - subtotal;

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

    if (!shippingName.trim()) {
      toast.warning("Vui lòng nhập họ tên người nhận.");
      return;
    }

    if (!shippingPhone.trim()) {
      toast.warning("Vui lòng nhập số điện thoại người nhận.");
      return;
    }

    if (!shippingAddress.trim()) {
      toast.warning("Vui lòng nhập địa chỉ giao hàng.");
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
      shippingName: shippingName.trim(),
      shippingPhone: shippingPhone.trim(),
      shippingAddress: shippingAddress.trim(),
      paymentMethod,
      note: note.trim() || undefined,
    };
    // Lưu ý: Backend sẽ tự tính lại shippingFee từ địa chỉ để đảm bảo an toàn

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
          <h1 className="text-3xl sm:text-4xl font-extrabold font-serif">Thanh Toán</h1>
          <p className="text-sm text-amber-200/60 font-light max-w-md">Điền đầy đủ thông tin giao hàng và chọn phương thức thanh toán</p>
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
          <form onSubmit={handleSubmit} className="lg:col-span-2 bg-white border border-amber-900/5 rounded-3xl p-6 sm:p-10 shadow-xl space-y-8">

            {apiError && (
              <div className="p-4 bg-rose-50 border border-rose-100 text-rose-800 text-sm font-semibold rounded-xl flex items-center gap-2">
                <AlertCircle size={16} className="text-rose-600 shrink-0" />
                <span>{apiError}</span>
              </div>
            )}

            {/* Shipping Info Section */}
            <div className="space-y-5">
              <h3 className="text-lg font-bold text-slate-800 border-b border-amber-900/5 pb-4 flex items-center gap-2 uppercase tracking-wider">
                <ShoppingBag size={20} className="text-amber-800" /> Thông tin giao hàng
              </h3>

              {/* Shipping Name */}
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-1.5 flex items-center gap-1.5">
                  <User size={14} className="text-amber-700" />
                  Họ và tên người nhận <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  placeholder="Nguyễn Văn A"
                  value={shippingName}
                  onChange={(e) => setShippingName(e.target.value)}
                  className="block w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-sm outline-none transition focus:border-amber-700 focus:ring-2 focus:ring-amber-50 placeholder-slate-400 text-slate-900"
                />
              </div>

              {/* Phone */}
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-1.5 flex items-center gap-1.5">
                  <Phone size={14} className="text-amber-700" />
                  Số điện thoại <span className="text-rose-500">*</span>
                </label>
                <input
                  type="tel"
                  required
                  placeholder="0901 234 567"
                  value={shippingPhone}
                  onChange={(e) => setShippingPhone(e.target.value)}
                  className="block w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-sm outline-none transition focus:border-amber-700 focus:ring-2 focus:ring-amber-50 placeholder-slate-400 text-slate-900"
                />
              </div>

              {/* Address */}
              <div className="space-y-3">
                <label className="block text-sm font-semibold text-slate-700 flex items-center gap-1.5">
                  <MapPin size={14} className="text-amber-700" />
                  Địa chỉ giao hàng <span className="text-rose-500">*</span>
                </label>
                <div className="grid gap-3">
                  <select
                    required
                    value={selectedProvinceCode}
                    onChange={(e) => setSelectedProvinceCode(Number(e.target.value) || "")}
                    className="block w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-sm outline-none transition focus:border-amber-700 focus:ring-2 focus:ring-amber-50 text-slate-900 bg-white disabled:opacity-50"
                  >
                    <option value="">Chọn Tỉnh / Thành phố</option>
                    {provinces.map((p) => (
                      <option key={p.code} value={p.code}>{p.name}</option>
                    ))}
                  </select>

                  <select
                    required
                    value={selectedDistrictCode}
                    onChange={(e) => setSelectedDistrictCode(Number(e.target.value) || "")}
                    disabled={!selectedProvinceCode || districts.length === 0}
                    className="block w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-sm outline-none transition focus:border-amber-700 focus:ring-2 focus:ring-amber-50 text-slate-900 bg-white disabled:opacity-50"
                  >
                    <option value="">Chọn Quận / Huyện</option>
                    {districts.map((d) => (
                      <option key={d.code} value={d.code}>{d.name}</option>
                    ))}
                  </select>

                  <select
                    required
                    value={selectedWardCode}
                    onChange={(e) => setSelectedWardCode(Number(e.target.value) || "")}
                    disabled={!selectedDistrictCode || wards.length === 0}
                    className="block w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-sm outline-none transition focus:border-amber-700 focus:ring-2 focus:ring-amber-50 text-slate-900 bg-white disabled:opacity-50"
                  >
                    <option value="">Chọn Phường / Xã</option>
                    {wards.map((w) => (
                      <option key={w.code} value={w.code}>{w.name}</option>
                    ))}
                  </select>

                  <input
                    type="text"
                    required
                    placeholder="Địa chỉ cụ thể (Số nhà, tên đường...)"
                    value={address}
                    onChange={(e) => setAddress(e.target.value)}
                    className="block w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-sm outline-none transition focus:border-amber-700 focus:ring-2 focus:ring-amber-50 placeholder-slate-400 text-slate-900"
                  />
                </div>
              </div>

              {/* Note */}
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-1.5 flex items-center gap-1.5">
                  <MessageSquare size={14} className="text-amber-700" />
                  Ghi chú thêm <span className="text-slate-400 font-normal">(Tùy chọn)</span>
                </label>
                <textarea
                  rows={2}
                  placeholder="Giao giờ hành chính, gọi điện trước khi giao..."
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  className="block w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-sm outline-none transition focus:border-amber-700 focus:ring-2 focus:ring-amber-50 placeholder-slate-400 text-slate-900"
                />
              </div>
            </div>

            {/* Payment Method Selector */}
            <div className="space-y-4">
              <h3 className="text-lg font-bold text-slate-800 border-b border-amber-900/5 pb-4 flex items-center gap-2 uppercase tracking-wider">
                <CreditCard size={20} className="text-amber-800" /> Phương thức thanh toán
              </h3>
              <div className="p-4 border-2 border-amber-800 bg-amber-50/20 rounded-2xl flex items-center gap-3">
                <div className="text-2xl">💵</div>
                <div>
                  <p className="font-bold text-sm text-slate-800">Thanh toán tiền mặt (COD)</p>
                  <p className="text-[11px] text-slate-500 mt-0.5">Thanh toán trực tiếp cho nhân viên giao hàng khi nhận được sản phẩm.</p>
                </div>
              </div>
            </div>

            {/* Note */}
            {/* <div className="p-4 bg-amber-50 border border-amber-900/5 text-amber-900 rounded-2xl text-xs font-light leading-relaxed">
              <strong>Lưu ý:</strong> Đây là thanh toán mô phỏng phục vụ demo, hệ thống không xử lý giao dịch tiền thật.
            </div> */}

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
          <div className="bg-white border border-amber-900/5 rounded-3xl p-6 sm:p-8 shadow-xl flex flex-col gap-6 sticky top-24">
            <h3 className="text-base font-bold text-slate-850 border-b border-amber-900/5 pb-4 uppercase tracking-wider">
              Sản phẩm đặt mua
            </h3>

            <div className="divide-y divide-amber-900/5 max-h-72 overflow-y-auto pr-1">
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
              <div className="flex justify-between text-sm text-slate-500">
                <span>Tạm tính</span>
                <span>{formatCurrency(subtotal)}</span>
              </div>

              {/* Khu vực giao hàng */}
              {shippingAddress.trim() && (
                <div className="flex justify-between text-sm text-slate-400">
                  <span className="flex items-center gap-1">
                    <Truck size={12} /> Khu vực
                  </span>
                  <span className="font-medium">{getZoneLabel(shippingZone)}</span>
                </div>
              )}

              {/* Phí vận chuyển */}
              <div className="flex justify-between text-sm">
                <span className="text-slate-500">Phí vận chuyển</span>
                {shippingFee === 0 ? (
                  <span className="text-emerald-600 font-bold flex items-center gap-1">
                    <Gift size={12} /> Miễn phí
                  </span>
                ) : (
                  <span className="font-semibold text-slate-700">{formatCurrency(shippingFee)}</span>
                )}
              </div>

              {/* Gợi ý mua thêm để free ship */}
              {shippingFee > 0 && remainForFreeShip > 0 && (
                <div className="text-[11px] text-amber-700 bg-amber-50 rounded-lg px-3 py-1.5 text-center font-medium">
                  Mua thêm <strong>{formatCurrency(remainForFreeShip)}</strong> để được miễn phí ship 🎉
                </div>
              )}

              <div className="flex justify-between text-base font-black text-slate-900 border-t border-amber-900/5 pt-3">
                <span>Tổng cộng</span>
                <span className="text-amber-800 text-lg font-black">{formatCurrency(grandTotal)}</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
