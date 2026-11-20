import React, { useState, useEffect } from "react";
import { Link, useNavigate, useLocation } from "react-router-dom";
import { ArrowRight } from "lucide-react";
import { productsApi } from "../api/products.api";
import { useCart } from "../contexts/CartContext";
import type { Product } from "../types/product.types";
import { ProductCard } from "../components/product/ProductCard";
import { Loading } from "../components/common/Loading";
import { useToast } from "../contexts/ToastContext";
import { useAuth } from "../contexts/AuthContext";
import { sortProductsInStockFirst } from "../utils/productStock";
import { HomeHero, BrandStory, HomeGallery } from "../features/home/HomeEditorial";

export const HomePage: React.FC = () => {
  const { addToCart, items } = useCart();
  const toast = useToast();
  const { isAuthenticated } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [products, setProducts] = useState<Product[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadFailed, setLoadFailed] = useState(false);

  useEffect(() => {
    window.scrollTo(0, 0);
    const fetchProducts = async () => {
      try {
        const data = await productsApi.getProducts();
        const inStockFirst = sortProductsInStockFirst(data);
        setProducts(inStockFirst.slice(0, 3));
        setLoadFailed(false);
      } catch (err) {
        console.error("Error fetching preview products:", err);
        setLoadFailed(true);
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
        `Chỉ còn lại ${availableQuantity} ${product.unit || "hộp"} (bạn đã có ${cartQuantity} trong giỏ).`
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
    <div className="min-w-0 overflow-x-clip bg-[var(--sf-paper)] font-['Be_Vietnam_Pro',sans-serif] text-[var(--sf-ink)]">
      <HomeHero />
      <BrandStory />

      <section className="mx-auto w-[calc(100%-2.25rem)] max-w-6xl py-16 md:w-[calc(100%-3rem)] md:py-20 xl:w-[calc(100%-4rem)] xl:py-28" aria-labelledby="home-products-title">
        <div className="mb-9 grid items-end gap-5 md:grid-cols-[1fr_.55fr] md:gap-10">
          <div>
            <p className="text-xs font-bold uppercase tracking-widest text-[var(--sf-green)]">02 / CHỌN MÓN</p>
            <h2 id="home-products-title" className="mt-4 max-w-md text-3xl leading-snug font-semibold tracking-tight md:text-4xl">Một vài món <em className="font-['Playfair_Display',Georgia,serif] font-normal text-[var(--sf-green)]">để bắt đầu.</em></h2>
          </div>
          <p className="max-w-sm text-sm leading-7 text-[var(--sf-muted)]">Thực đơn được cập nhật từ cửa hàng. Xem món còn bán, giá hiện tại và chọn thứ bạn muốn thưởng thức.</p>
        </div>

        {isLoading ? (
          <div className="flex min-h-40 items-center justify-center border-y border-[var(--sf-line)] p-8 text-center" role="status">
            <Loading message="Đang tải menu..." />
          </div>
        ) : loadFailed ? (
          <div className="flex min-h-40 items-center justify-center border-y border-[var(--sf-line)] p-8 text-center" role="alert">
            <p>Chưa tải được thực đơn. Bạn có thể thử lại tại <Link to="/products" className="font-semibold underline underline-offset-4">trang sản phẩm</Link>.</p>
          </div>
        ) : products.length === 0 ? (
          <p className="flex min-h-40 items-center justify-center border-y border-[var(--sf-line)] p-8 text-center text-[var(--sf-muted)]" role="status">Chưa có sản phẩm nào trong menu.</p>
        ) : (
          <div className="grid min-w-0 grid-cols-1 gap-10 md:grid-cols-3 md:gap-5 lg:gap-9">
            {products.map((product) => (
              <div key={product.id} className="min-w-0 [&>div]:min-w-0 [&>div]:rounded-none [&>div]:border-0 [&>div]:bg-transparent [&>div]:shadow-none [&>div>a]:aspect-square [&>div>a]:overflow-hidden [&>div>a]:bg-[var(--sf-soft)] [&>div>div]:px-0 [&>div>div]:pt-4 [&_h3]:font-['Be_Vietnam_Pro',sans-serif] [&_h3]:text-[var(--sf-ink)] [&_[data-ds=button]]:rounded-none">
                <ProductCard product={product} onAddToCart={handleAddToCart} />
              </div>
            ))}
          </div>
        )}

        <div className="mt-10 text-right">
          <Link to="/products" className="inline-flex min-h-11 items-center gap-3 text-sm font-semibold underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-current">
            Xem toàn bộ sản phẩm <ArrowRight size={18} aria-hidden="true" />
          </Link>
        </div>
      </section>

      <HomeGallery />
    </div>
  );
};
