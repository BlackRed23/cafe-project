import React, { useState, useEffect } from "react";
import { Link, useNavigate, useLocation } from "react-router-dom";
import { ArrowRight, ShoppingCart, ShoppingBag, Play, ChevronRight, Sparkles } from "lucide-react";
import { productsApi } from "../api/products.api";
import { useCart } from "../contexts/CartContext";
import type { Product } from "../types/product.types";
import { ProductCard } from "../components/product/ProductCard";
import { Loading } from "../components/common/Loading";
import { useToast } from "../contexts/ToastContext";
import { useAuth } from "../contexts/AuthContext";
import { sortProductsInStockFirst } from "../utils/productStock";

export const HomePage: React.FC = () => {
  const { addToCart, items } = useCart();
  const toast = useToast();
  const { isAuthenticated } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [products, setProducts] = useState<Product[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    window.scrollTo(0, 0);
    const fetchProducts = async () => {
      try {
        const data = await productsApi.getProducts();
        const inStockFirst = sortProductsInStockFirst(data);
        setProducts(inStockFirst.slice(0, 3));
      } catch (err) {
        console.error("Error fetching preview products:", err);
      } finally {
        setIsLoading(false);
      }
    };
    fetchProducts();
  }, []);

  const handleAddToCart = (product: Product) => {
    if (!isAuthenticated) {
      toast.warning("Vui lòng đăng nhập để thêm sản phẩm vào giỏ hàng!");
      navigate("/login", { state: { returnUrl: location.pathname } });
      return;
    }

    // Nếu inventory hoặc quantity không có thì mặc định = 0
    const stockQuantity = product.inventory?.quantity ?? 0;

    // Kiểm tra hết hàng
    if (stockQuantity <= 0) {
      toast.warning("Sản phẩm hiện đã hết hàng.");
      return;
    }

    // Số lượng đã có trong giỏ
    const cartQuantity =
      items.find((item) => item.product.id === product.id)?.quantity ?? 0;

    // Số lượng còn có thể thêm
    const availableQuantity = stockQuantity - cartQuantity;

    // Nếu trong giỏ đã đủ số lượng tồn kho
    if (availableQuantity <= 0) {
      toast.warning(
        `Chỉ còn ${stockQuantity} ${product.unit || "hộp"} trong kho.`
      );
      return;
    }

    // Thêm vào giỏ
    const didAdd = addToCart(product, 1);

    if (!didAdd) {
      toast.warning(
        `Chỉ còn ${availableQuantity} ${product.unit || "hộp"} có thể thêm vào giỏ.`
      );
    }
  };

  return (
    <div className="flex flex-col pb-0">
      {/* 1. Hero Section - Exactly like ThemeWagon Coffee */}
      <section
        className="relative h-[90vh] flex items-center bg-cover bg-center text-white"
        style={{
          backgroundImage: "linear-gradient(to right, rgba(0, 0, 0, 0.75) 40%, rgba(0, 0, 0, 0.3)), url('https://images.unsplash.com/photo-1507133750040-4a8f57021571?auto=format&fit=crop&q=80&w=1600')"
        }}
      >
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 w-full">
          <div className="max-w-xl flex flex-col gap-5">
            <span className="text-[#c49b76] text-xs font-bold uppercase tracking-widest">
              Năng lượng mới cho ngày làm việc
            </span>
            <h1 className="text-4xl sm:text-6xl font-black tracking-tight leading-none font-serif text-white">
              Bắt đầu ngày mới <br />
              cùng Cà phê hảo hạng
            </h1>
            <p className="text-sm sm:text-base text-slate-350 leading-relaxed font-light">
              Cafe INV cung cấp các sản phẩm cà phê đóng gói cao cấp nguyên chất, đồng thời tích hợp Hệ thống tự động giám sát tồn kho và gửi đề xuất nhập hàng thông minh.
            </p>
            <div className="mt-4">
              <Link
                to="/products"
                className="inline-flex items-center gap-2 px-8 py-4 font-bold text-xs uppercase tracking-wider bg-[#c49b76] text-amber-955 rounded-none hover:bg-[#c49b76] transition-colors shadow-lg"
              >
                <span>Xem sản phẩm</span>
                <ChevronRight size={14} />
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* 2. Video / Story Section - ThemeWagon style */}
      <section id="about" className="py-24 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 grid md:grid-cols-2 gap-12 items-center">
        {/* Left Side: Mock Video Play */}
        <div
          className="relative aspect-[16/10] w-full bg-cover bg-center shadow-2xl flex items-center justify-center group cursor-pointer overflow-hidden rounded-3xl border border-amber-900/10 bg-black/10"
          style={{ backgroundImage: "url('https://images.unsplash.com/photo-1495474472287-4d71bcdd2085?auto=format&fit=crop&q=80&w=800')" }}
        >
          <div className="absolute inset-0 bg-[#150d0a]/30 group-hover:bg-[#150d0a]/40 transition-colors"></div>
          <div className="relative z-10 w-16 h-16 sm:w-20 sm:h-20 bg-[#c49b76] text-amber-955 rounded-full flex items-center justify-center shadow-2xl group-hover:scale-105 transition-transform">
            <Play size={28} className="fill-current ml-1" />
          </div>
        </div>

        {/* Right Side: Description */}
        <div className="flex flex-col gap-6">
          <span className="text-[#c49b76] text-xs font-bold uppercase tracking-wider">Trải nghiệm cà phê mỗi ngày</span>
          <h2 className="text-3xl font-extrabold text-slate-900 font-serif leading-tight">
            Thưởng thức cà phê chất lượng, <br />
            <span className="text-amber-800">đặt hàng dễ dàng</span>
          </h2>
          <p className="text-sm text-slate-600 leading-relaxed font-light">
            Cafe INV mang đến các dòng cà phê chọn lọc, đóng gói chỉn chu và luôn sẵn sàng để bạn đặt mua nhanh chóng cho nhu cầu cá nhân, văn phòng hoặc kinh doanh.
          </p>

          <div className="flex flex-col gap-4 mt-2">
            <div className="flex gap-4 items-start">
              <div className="p-2 bg-amber-100 text-amber-850 rounded-lg shrink-0">
                <ShoppingBag size={18} />
              </div>
              <div>
                <h4 className="font-bold text-sm text-slate-800 uppercase tracking-wider">Sản phẩm luôn sẵn sàng</h4>
                <p className="text-xs text-slate-600 font-light mt-0.5">Các sản phẩm được cập nhật rõ ràng, giúp bạn dễ dàng chọn đúng loại cà phê phù hợp với nhu cầu.</p>
              </div>
            </div>
            <div className="flex gap-4 items-start">
              <div className="p-2 bg-amber-100 text-amber-850 rounded-lg shrink-0">
                <ShoppingCart size={18} />
              </div>
              <div>
                <h4 className="font-bold text-sm text-slate-800 uppercase tracking-wider">Đặt hàng nhanh chóng</h4>
                <p className="text-xs text-slate-600 font-light mt-0.5">Thao tác chọn sản phẩm, thêm vào giỏ hàng và thanh toán được tối ưu để quá trình mua hàng đơn giản hơn.</p>
              </div>
            </div>
            <div className="flex gap-4 items-start">
              <div className="p-2 bg-amber-100 text-amber-850 rounded-lg shrink-0">
                <Sparkles size={18} />
              </div>
              <div>
                <h4 className="font-bold text-sm text-slate-800 uppercase tracking-wider">Chất lượng ổn định</h4>
                <p className="text-xs text-slate-600 font-light mt-0.5">Cafe INV chú trọng nguồn hàng, quy cách đóng gói và trải nghiệm mua sắm để mỗi đơn hàng đều đáng tin cậy.</p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* 3. Menu Section - What kind of Coffee we serve */}
      <section className="py-24 bg-[#faf6f0] border-t border-b border-amber-900/5">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 w-full flex flex-col gap-16">
          <div className="text-center max-w-xl mx-auto flex flex-col gap-3">
            <span className="text-[#c49b76] text-xs font-bold uppercase tracking-wider">Thực đơn hảo hạng</span>
            <h2 className="text-3xl font-extrabold text-slate-900 font-serif">Những dòng cà phê dành cho bạn</h2>
            <p className="text-sm text-slate-400 font-light">Các dòng cà phê đóng gói nguyên hạt và bột rang xay được chọn lọc cho nhu cầu thưởng thức mỗi ngày.</p>
          </div>

          {isLoading ? (
            <div className="py-12 flex justify-center">
              <Loading message="Đang tải menu..." />
            </div>
          ) : products.length === 0 ? (
            <div className="text-center py-10 text-slate-400 text-sm">Chưa có sản phẩm nào trong menu.</div>
          ) : (
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-8">
              {products.map((product) => (
                <ProductCard
                  key={product.id}
                  product={product}
                  onAddToCart={handleAddToCart}
                />
              ))}
            </div>
          )}

          <div className="flex justify-center">
            <Link
              to="/products"
              className="inline-flex items-center gap-2 px-8 py-4 font-bold text-xs uppercase tracking-wider border border-amber-800/20 text-amber-850 hover:bg-amber-50 transition-colors"
            >
              <span>Xem toàn bộ sản phẩm</span>
              <ArrowRight size={14} />
            </Link>
          </div>
        </div>
      </section>

      {/* 4. Gallery Section - ThemeWagon style */}
      <section id="gallery" className="py-24 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 w-full flex flex-col gap-12">
        <div className="text-center max-w-xl mx-auto flex flex-col gap-2">
          <span className="text-[#c49b76] text-xs font-bold uppercase tracking-wider">Bộ sưu tập</span>
          <h2 className="text-3xl font-extrabold text-slate-900 font-serif">Hình ảnh từ cửa hàng</h2>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
          <div className="aspect-[3/4] overflow-hidden shadow-lg rounded-3xl">
            <img src="https://images.unsplash.com/photo-1509042239860-f550ce710b93?auto=format&fit=crop&q=80&w=400" alt="Gallery 1" className="w-full h-full object-cover hover:scale-105 transition-transform duration-500" />
          </div>
          <div className="aspect-[3/4] overflow-hidden shadow-lg rounded-3xl">
            <img src="https://images.unsplash.com/photo-1514432324607-a09d9b4aefdd?auto=format&fit=crop&q=80&w=400" alt="Gallery 2" className="w-full h-full object-cover hover:scale-105 transition-transform duration-500" />
          </div>
          <div className="aspect-[3/4] overflow-hidden shadow-lg rounded-3xl">
            <img src="https://images.unsplash.com/photo-1498804103079-a6351b050096?auto=format&fit=crop&q=80&w=400" alt="Gallery 3" className="w-full h-full object-cover hover:scale-105 transition-transform duration-500" />
          </div>
          <div className="aspect-[3/4] overflow-hidden shadow-lg rounded-3xl">
            <img src="https://images.unsplash.com/photo-1497515114629-f71d768fd07c?auto=format&fit=crop&q=80&w=400" alt="Gallery 4" className="w-full h-full object-cover hover:scale-105 transition-transform duration-500" />
          </div>
        </div>
      </section>
    </div>
  );
};
