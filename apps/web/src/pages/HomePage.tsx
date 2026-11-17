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
import { HomeHero, BrandMarquee, BrandStory, HomeGallery } from "../features/home/HomeEditorial";
import "../features/home/home.css";

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
    <div className="coffee-home">
      <HomeHero />
      <BrandMarquee />
      <BrandStory />

      <section className="home-featured home-container" aria-labelledby="home-products-title">
        <div className="home-section-heading">
          <div>
            <p className="home-eyebrow">03 / Bộ sưu tập</p>
            <h2 id="home-products-title">Chọn một <em>hương vị riêng.</em></h2>
          </div>
          <p>Khám phá các sản phẩm cà phê đóng gói. Chọn theo sở thích, thưởng thức theo cách của bạn.</p>
        </div>

        {isLoading ? (
          <div className="home-products-state" role="status">
            <Loading message="Đang tải menu..." />
          </div>
        ) : products.length === 0 ? (
          <p className="home-products-state" role="status">Chưa có sản phẩm nào trong menu.</p>
        ) : (
          <div className="home-products-grid">
            {products.map((product) => (
              <ProductCard
                key={product.id}
                product={product}
                onAddToCart={handleAddToCart}
              />
            ))}
          </div>
        )}

        <div className="home-products-footer">
          <Link to="/products" className="home-text-link">
            Xem toàn bộ sản phẩm <ArrowRight size={18} aria-hidden="true" />
          </Link>
        </div>
      </section>

      <HomeGallery />
    </div>
  );
};
