import React, { useState, useEffect } from "react";
import { useParams, useNavigate, Link, useLocation } from "react-router-dom";
import { productsApi } from "../api/products.api";
import type { Product } from "../types/product.types";
import { useCart } from "../contexts/CartContext";
import { formatCurrency } from "../utils/formatCurrency";
import { Button } from "../components/common/Button";
import { Loading } from "../components/common/Loading";
import { ArrowLeft, ShoppingCart, ShieldCheck, AlertCircle, Sparkles, BookOpen, Clock, Globe, Award } from "lucide-react";
import { useToast } from "../contexts/ToastContext";
import { useAuth } from "../contexts/AuthContext";

export const ProductDetailPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const { isAuthenticated } = useAuth();
  const [product, setProduct] = useState<Product | null>(null);
  const [quantity, setQuantity] = useState(1);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<string>("");
  const { addToCart, items } = useCart();
  const toast = useToast();

  useEffect(() => {
    window.scrollTo(0, 0);
    const fetchProduct = async () => {
      if (!id) return;
      try {
        setIsLoading(true);
        const data = await productsApi.getProductById(id);
        setProduct(data);
      } catch (err: any) {
        setError("Không tìm thấy thông tin sản phẩm. Vui lòng thử lại sau.");
      } finally {
        setIsLoading(false);
      }
    };
    fetchProduct();
  }, [id]);

  const handleImageError = (e: React.SyntheticEvent<HTMLImageElement, Event>) => {
    e.currentTarget.src = "https://images.unsplash.com/photo-1509042239860-f550ce710b93?auto=format&fit=crop&q=80&w=600";
  };

  const handleQtyChange = (val: number) => {
    let num = val;
    if (isNaN(num) || num < 1) {
      num = 1;
    }
    
    // Check inventory stock if available
    const maxQty = product?.inventory?.quantity;
    const cartQuantity = items.find(item => item.product.id === product?.id)?.quantity || 0;
    const availableQuantity = maxQty !== undefined ? maxQty - cartQuantity : undefined;

    if (availableQuantity !== undefined && num > availableQuantity) {
      num = Math.max(1, availableQuantity);
      if (availableQuantity <= 0) {
        toast.warning(`Sản phẩm đã đạt giới hạn tồn kho (đã có ${cartQuantity} trong giỏ).`);
        num = 1; // Keep input at 1, but they won't be able to add
      } else {
        toast.warning(`Chỉ còn lại ${availableQuantity} ${product?.unit || "hộp"} có thể thêm (đã có ${cartQuantity} trong giỏ).`);
      }
    }
    
    setQuantity(num);
  };

  if (isLoading) {
    return (
      <div className="min-h-[50vh] flex items-center justify-center">
        <Loading message="Đang tải chi tiết sản phẩm..." />
      </div>
    );
  }

  if (error || !product) {
    return (
      <div className="max-w-xl mx-auto my-20 text-center p-8 bg-rose-50 border border-rose-100 text-rose-800 rounded-2xl shadow-sm">
        <p className="font-bold mb-2">Đã xảy ra lỗi</p>
        <p className="text-sm mb-6">{error || "Sản phẩm không khả dụng."}</p>
        <Link to="/products">
          <Button variant="outline" className="flex items-center gap-1.5 mx-auto">
            <ArrowLeft size={16} /> Quay lại danh sách
          </Button>
        </Link>
      </div>
    );
  }

  const imgUrl = product.imageUrl || product.image_url || "https://images.unsplash.com/photo-1509042239860-f550ce710b93?auto=format&fit=crop&q=80&w=600";
  const stockCount = product.inventory?.quantity;
  const isOutOfStock = stockCount !== undefined && stockCount <= 0;
  const cartQuantity = items.find(item => item.product.id === product.id)?.quantity || 0;

  const nutrition = product.nutritionFacts || product.nutrition_facts;
  const usage = product.usageInstructions || product.usage_instructions;
  const storage = product.storageInstructions || product.storage_instructions;
  const expiry = product.expiryInfo || product.expiry_info;
  const origin = product.origin;
  const certs = product.certifications;

  const availableTabs: { id: string; label: string; icon: React.ReactNode }[] = [];
  if (nutrition && nutrition.trim()) {
    availableTabs.push({ id: "nutrition", label: "Thành phần dinh dưỡng", icon: <Sparkles size={16} /> });
  }
  if (usage && usage.trim()) {
    availableTabs.push({ id: "usage", label: "Hướng dẫn sử dụng", icon: <BookOpen size={16} /> });
  }
  if ((storage && storage.trim()) || (expiry && expiry.trim())) {
    availableTabs.push({ id: "storage", label: "Bảo quản & HSD", icon: <Clock size={16} /> });
  }
  if ((origin && origin.trim()) || (certs && certs.trim())) {
    availableTabs.push({ id: "origin", label: "Xuất xứ & Chứng nhận", icon: <Globe size={16} /> });
  }

  const currentActiveTab = availableTabs.some(t => t.id === activeTab)
    ? activeTab
    : (availableTabs[0]?.id || "");

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12 flex flex-col gap-8 pb-24">
      {/* Back button */}
      <div>
        <Link
          to="/products"
          className="inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-amber-800 transition-colors uppercase tracking-wider font-semibold"
        >
          <ArrowLeft size={16} />
          <span>Quay lại cửa hàng</span>
        </Link>
      </div>

      {/* Detail grid */}
      <div className="bg-white rounded-3xl border border-amber-900/5 p-6 sm:p-10 grid md:grid-cols-2 gap-8 sm:gap-14 shadow-xl">
        {/* Left: Product Image */}
        <div className="aspect-[4/3] w-full rounded-2xl bg-amber-50/20 border border-amber-900/5 overflow-hidden shadow-inner flex items-center justify-center">
          <img
            src={imgUrl}
            alt={product.name}
            onError={handleImageError}
            className="w-full h-full object-cover hover:scale-102 transition-transform duration-500"
          />
        </div>

        {/* Right: Info */}
        <div className="flex flex-col justify-between py-2 gap-6">
          <div className="flex flex-col gap-4">
            <div>
              {product.category && (
                <span className="text-xs font-bold text-amber-800 uppercase tracking-widest block mb-2">
                  {product.category.name}
                </span>
              )}
              <h1 className="text-3xl font-black text-slate-900 font-serif leading-tight">
                {product.name}
              </h1>
            </div>

            <div className="flex items-baseline gap-2">
              <span className="text-3xl font-black text-amber-850">
                {formatCurrency(product.price)}
              </span>
              <span className="text-xs text-slate-400">/ {product.unit || "hộp"}</span>
            </div>

            {/* Stock indicator */}
            <div className="flex items-center gap-2">
              {stockCount !== undefined ? (
                isOutOfStock ? (
                  <span className="inline-flex items-center gap-1 text-xs font-semibold text-rose-700 bg-rose-50 px-3 py-1 rounded-xl">
                    <AlertCircle size={14} /> Hết hàng
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-800 bg-emerald-50 px-3 py-1 rounded-xl">
                    <ShieldCheck size={14} /> Còn lại {stockCount} {product.unit || "hộp"}
                    {cartQuantity > 0 && (
                      <span className="text-emerald-600/70 font-normal"> (đã có {cartQuantity} trong giỏ)</span>
                    )}
                  </span>
                )
              ) : (
                <span className="inline-flex items-center gap-1 text-xs font-semibold text-amber-800 bg-amber-50 px-3 py-1 rounded-xl">
                  Sẵn sàng phục vụ
                </span>
              )}
            </div>

            {product.description && (
              <div className="border-t border-amber-900/5 pt-5 mt-2">
                <h4 className="text-sm font-bold text-slate-800 uppercase tracking-wider mb-2">Mô tả sản phẩm</h4>
                <p className="text-slate-500 text-sm leading-relaxed font-light">
                  {product.description}
                </p>
              </div>
            )}
          </div>

          {/* Action form */}
          <div className="border-t border-amber-900/5 pt-6 mt-4 flex flex-col gap-4 sm:flex-row sm:items-end">
            <div className="flex flex-col gap-1.5">
              <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">Số lượng mua</span>
              <div className="flex items-center border border-amber-900/10 rounded-xl overflow-hidden bg-white max-w-[140px]">
                <button
                  type="button"
                  onClick={() => handleQtyChange(quantity - 1)}
                  disabled={quantity <= 1 || isOutOfStock}
                  className="px-4 py-2.5 text-slate-500 hover:bg-slate-50 hover:text-slate-850 disabled:opacity-30 disabled:pointer-events-none text-sm font-bold"
                >
                  -
                </button>
                <input
                  type="number"
                  value={quantity}
                  onChange={(e) => handleQtyChange(parseInt(e.target.value))}
                  disabled={isOutOfStock}
                  className="w-12 text-center border-none text-sm font-bold text-slate-850 focus:outline-none focus:ring-0 p-0"
                />
                <button
                  type="button"
                  onClick={() => handleQtyChange(quantity + 1)}
                  disabled={isOutOfStock}
                  className="px-4 py-2.5 text-slate-500 hover:bg-slate-50 hover:text-slate-850 disabled:opacity-30 disabled:pointer-events-none text-sm font-bold"
                >
                  +
                </button>
              </div>
            </div>

            <Button
              onClick={() => {
                if (!isAuthenticated) {
                  toast.warning("Vui lòng đăng nhập để thêm sản phẩm vào giỏ hàng!");
                  navigate("/login", { state: { returnUrl: location.pathname } });
                  return;
                }
                const availableQuantity = stockCount ? stockCount - cartQuantity : undefined;
                const didAdd = addToCart(product, quantity);
                if (!didAdd) {
                  toast.warning(availableQuantity !== undefined
                    ? `Chỉ còn lại ${availableQuantity} ${product.unit || "hộp"} (bạn đã có ${cartQuantity} trong giỏ).`
                    : "Số lượng trong giỏ không được vượt quá tồn kho hiện tại.");
                  return;
                }
                navigate("/cart");
              }}
              disabled={isOutOfStock || product.isActive === false || product.is_active === false}
              className="flex-1 py-3.5 flex items-center justify-center gap-2 bg-amber-800 hover:bg-amber-900 border-none text-white shadow-lg shadow-amber-900/15"
            >
              <ShoppingCart size={18} />
              Thêm vào giỏ hàng
            </Button>
          </div>
        </div>
      </div>

      {/* Product Detail Tabs */}
      {availableTabs.length > 0 && (
        <div className="bg-white rounded-3xl border border-amber-900/5 p-6 sm:p-10 shadow-xl flex flex-col gap-6">
          {/* Tab buttons */}
          <div className="border-b border-amber-900/10 flex items-center gap-2 sm:gap-4 overflow-x-auto pb-3 scrollbar-none">
            {availableTabs.map((tab) => {
              const isActive = currentActiveTab === tab.id;
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setActiveTab(tab.id)}
                  className={`inline-flex items-center gap-2 px-5 py-3 rounded-2xl font-bold text-sm transition-all whitespace-nowrap ${
                    isActive
                      ? "bg-amber-800 text-white shadow-lg shadow-amber-900/15 scale-[1.02]"
                      : "text-slate-600 hover:text-amber-900 hover:bg-amber-50/60"
                  }`}
                >
                  {tab.icon}
                  <span>{tab.label}</span>
                </button>
              );
            })}
          </div>

          {/* Tab Content */}
          <div className="pt-2">
            {currentActiveTab === "nutrition" && nutrition && (
              <div className="space-y-3">
                <h3 className="text-lg font-bold text-slate-900 font-serif flex items-center gap-2">
                  <Sparkles size={18} className="text-amber-700" />
                  Thành phần dinh dưỡng
                </h3>
                <div className="bg-amber-50/30 p-5 rounded-2xl border border-amber-900/5 text-slate-700 text-sm leading-relaxed whitespace-pre-line">
                  {nutrition}
                </div>
              </div>
            )}

            {currentActiveTab === "usage" && usage && (
              <div className="space-y-3">
                <h3 className="text-lg font-bold text-slate-900 font-serif flex items-center gap-2">
                  <BookOpen size={18} className="text-amber-700" />
                  Hướng dẫn sử dụng
                </h3>
                <div className="bg-amber-50/30 p-5 rounded-2xl border border-amber-900/5 text-slate-700 text-sm leading-relaxed whitespace-pre-line">
                  {usage}
                </div>
              </div>
            )}

            {currentActiveTab === "storage" && (
              <div className="space-y-4">
                <h3 className="text-lg font-bold text-slate-900 font-serif flex items-center gap-2">
                  <Clock size={18} className="text-amber-700" />
                  Bảo quản & Hạn sử dụng
                </h3>
                <div className="grid md:grid-cols-2 gap-4">
                  {storage && (
                    <div className="bg-amber-50/30 p-5 rounded-2xl border border-amber-900/5 space-y-1.5">
                      <span className="text-xs font-bold text-amber-850 uppercase tracking-wider block">
                        Hướng dẫn bảo quản
                      </span>
                      <p className="text-slate-700 text-sm leading-relaxed">{storage}</p>
                    </div>
                  )}
                  {expiry && (
                    <div className="bg-amber-50/30 p-5 rounded-2xl border border-amber-900/5 space-y-1.5">
                      <span className="text-xs font-bold text-amber-850 uppercase tracking-wider block">
                        Hạn sử dụng & Khuyên dùng
                      </span>
                      <p className="text-slate-700 text-sm leading-relaxed">{expiry}</p>
                    </div>
                  )}
                </div>
              </div>
            )}

            {currentActiveTab === "origin" && (
              <div className="space-y-4">
                <h3 className="text-lg font-bold text-slate-900 font-serif flex items-center gap-2">
                  <Globe size={18} className="text-amber-700" />
                  Xuất xứ & Chứng nhận chất lượng
                </h3>
                <div className="grid md:grid-cols-2 gap-4">
                  {origin && (
                    <div className="bg-amber-50/30 p-5 rounded-2xl border border-amber-900/5 space-y-1.5">
                      <span className="text-xs font-bold text-amber-850 uppercase tracking-wider block flex items-center gap-1.5">
                        <Globe size={14} /> Nguồn gốc & Xuất xứ
                      </span>
                      <p className="text-slate-800 font-medium text-sm leading-relaxed">{origin}</p>
                    </div>
                  )}
                  {certs && (
                    <div className="bg-amber-50/30 p-5 rounded-2xl border border-amber-900/5 space-y-1.5">
                      <span className="text-xs font-bold text-amber-850 uppercase tracking-wider block flex items-center gap-1.5">
                        <Award size={14} /> Tiêu chuẩn & Chứng nhận
                      </span>
                      <p className="text-slate-800 font-medium text-sm leading-relaxed">{certs}</p>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

