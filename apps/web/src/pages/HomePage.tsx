import React, { useState, useEffect } from "react";
import { Link, useNavigate, useLocation } from "react-router-dom";
import { Cpu, ArrowRight, ShoppingBag, Play, ChevronRight } from "lucide-react";
import { productsApi } from "../api/products.api";
import { useCart } from "../contexts/CartContext";
import type { Product } from "../types/product.types";
import { ProductCard } from "../components/product/ProductCard";
import { Loading } from "../components/common/Loading";
import { useToast } from "../contexts/ToastContext";
import { useAuth } from "../contexts/AuthContext";

export const HomePage: React.FC = () => {
  const { addToCart } = useCart();
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
        // Take maximum 4 or 6 products
        setProducts(data.slice(0, 4));
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

    const stockQuantity = product.inventory?.quantity;

    if (typeof stockQuantity === "number" && stockQuantity <= 0) {
      toast.warning("Sản phẩm hiện đã hết hàng.");
      return;
    }

    const didAdd = addToCart(product, 1);
    if (!didAdd) {
      toast.warning("Số lượng trong giỏ không được vượt quá tồn kho hiện tại.");
    }
  };

  return (
    <div className="flex flex-col pb-0">
      {/* 1. Hero Section - Exactly like ThemeWagon Coffee */}
      <section 
        className="relative h-[90vh] flex items-center justify-start bg-cover bg-center text-white px-4 sm:px-12 md:px-24"
        style={{ 
          backgroundImage: "linear-gradient(to right, rgba(0, 0, 0, 0.75) 40%, rgba(0, 0, 0, 0.3)), url('https://images.unsplash.com/photo-1507133750040-4a8f57021571?auto=format&fit=crop&q=80&w=1600')" 
        }}
      >
        <div className="max-w-xl flex flex-col gap-5">
          <span className="text-[#c49b76] text-xs font-bold uppercase tracking-widest">
            Năng lượng mới cho ngày làm việc
          </span>
          <h1 className="text-4xl sm:text-6xl font-black tracking-tight leading-none font-serif text-white">
            Bắt đầu ngày mới <br />
            cùng Cà phê hảo hạng
          </h1>
          <p className="text-sm sm:text-base text-slate-350 leading-relaxed font-light">
            Cafe System cung cấp các sản phẩm cà phê đóng gói cao cấp nguyên chất, đồng thời tích hợp Hệ thống tự động tự động giám sát tồn kho và gửi đề xuất nhập hàng thông minh.
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
      </section>

      {/* 2. Video / Story Section - ThemeWagon style */}
      <section id="about" className="py-24 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 grid md:grid-cols-2 gap-12 items-center">
        {/* Left Side: Mock Video Play */}
        <div 
          className="relative aspect-[16/10] w-full bg-cover bg-center shadow-2xl flex items-center justify-center group cursor-pointer overflow-hidden border border-amber-955/10"
          style={{ backgroundImage: "url('https://images.unsplash.com/photo-1495474472287-4d71bcdd2085?auto=format&fit=crop&q=80&w=800')" }}
        >
          <div className="absolute inset-0 bg-[#150d0a]/30 group-hover:bg-[#150d0a]/40 transition-colors"></div>
          <div className="relative z-10 w-20 h-20 bg-[#c49b76] text-amber-955 rounded-full flex items-center justify-center shadow-2xl group-hover:scale-105 transition-transform">
            <Play size={28} className="fill-current ml-1" />
          </div>
        </div>

        {/* Right Side: Description */}
        <div className="flex flex-col gap-6">
          <span className="text-[#c49b76] text-xs font-bold uppercase tracking-wider">Quy trình vận hành</span>
          <h2 className="text-3xl font-extrabold text-slate-900 font-serif leading-tight">
            Live Coffee making process. <br />
            <span className="text-amber-800">Quy trình tự động hóa thông minh</span>
          </h2>
          <p className="text-sm text-slate-500 leading-relaxed font-light">
            Chúng tôi không chỉ phân phối cà phê đóng gói nguyên chất chất lượng cao, mà còn xây dựng quy trình khép kín tối ưu cho doanh nghiệp của bạn nhờ trợ lý Hệ thống tự động.
          </p>
          
          <div className="flex flex-col gap-4 mt-2">
            <div className="flex gap-4 items-start">
              <div className="p-2 bg-amber-100 text-amber-850 rounded-lg">
                <ShoppingBag size={18} />
              </div>
              <div>
                <h4 className="font-bold text-sm text-slate-800 uppercase tracking-wider">Đặt hàng & Trừ kho</h4>
                <p className="text-xs text-slate-400 font-light mt-0.5">Khách đặt hàng, hệ thống lập tức cập nhật số lượng tồn kho theo thời gian thực.</p>
              </div>
            </div>
            <div className="flex gap-4 items-start">
              <div className="p-2 bg-amber-100 text-amber-850 rounded-lg">
                <Cpu size={18} />
              </div>
              <div>
                <h4 className="font-bold text-sm text-slate-800 uppercase tracking-wider">Hệ thống tự động Cảnh Báo</h4>
                <p className="text-xs text-slate-400 font-light mt-0.5">Hệ thống tự động quét cảnh báo kho dưới ngưỡng an toàn và tạo yêu cầu mua hàng PR.</p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* 3. Menu Section - What kind of Coffee we serve */}
      <section className="py-24 bg-[#faf6f0] border-t border-b border-amber-900/5">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex flex-col gap-16">
          <div className="text-center max-w-xl mx-auto flex flex-col gap-3">
            <span className="text-[#c49b76] text-xs font-bold uppercase tracking-wider">Thực đơn hảo hạng</span>
            <h2 className="text-3xl font-extrabold text-slate-900 font-serif">What kind of Coffee we serve for you</h2>
            <p className="text-sm text-slate-400 font-light">Các dòng cà phê đóng gói nguyên hạt và bột rang xay ngon nhất.</p>
          </div>

          {isLoading ? (
            <div className="py-12 flex justify-center">
              <Loading message="Đang tải menu..." />
            </div>
          ) : products.length === 0 ? (
            <div className="text-center py-10 text-slate-400 text-sm">Chưa có sản phẩm nào trong menu.</div>
          ) : (
            <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-8">
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
              <span>Xem toàn bộ menu</span>
              <ArrowRight size={14} />
            </Link>
          </div>
        </div>
      </section>

      {/* 4. Gallery Section - ThemeWagon style */}
      <section id="gallery" className="py-24 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex flex-col gap-12">
        <div className="text-center max-w-xl mx-auto flex flex-col gap-2">
          <span className="text-[#c49b76] text-xs font-bold uppercase tracking-wider">Bộ sưu tập</span>
          <h2 className="text-3xl font-extrabold text-slate-900 font-serif">Hình ảnh từ cửa hàng</h2>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="aspect-[3/4] overflow-hidden shadow-md">
            <img src="https://images.unsplash.com/photo-1509042239860-f550ce710b93?auto=format&fit=crop&q=80&w=400" alt="Gallery 1" className="w-full h-full object-cover hover:scale-105 transition-transform duration-500" />
          </div>
          <div className="aspect-[3/4] overflow-hidden shadow-md">
            <img src="https://images.unsplash.com/photo-1514432324607-a09d9b4aefdd?auto=format&fit=crop&q=80&w=400" alt="Gallery 2" className="w-full h-full object-cover hover:scale-105 transition-transform duration-500" />
          </div>
          <div className="aspect-[3/4] overflow-hidden shadow-md">
            <img src="https://images.unsplash.com/photo-1498804103079-a6351b050096?auto=format&fit=crop&q=80&w=400" alt="Gallery 3" className="w-full h-full object-cover hover:scale-105 transition-transform duration-500" />
          </div>
          <div className="aspect-[3/4] overflow-hidden shadow-md">
            <img src="https://images.unsplash.com/photo-1497515114629-f71d768fd07c?auto=format&fit=crop&q=80&w=400" alt="Gallery 4" className="w-full h-full object-cover hover:scale-105 transition-transform duration-500" />
          </div>
        </div>
      </section>
    </div>
  );
};
