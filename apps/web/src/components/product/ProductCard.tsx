import React from "react";
import { Link } from "react-router-dom";
import type { Product } from "../../types/product.types";
import { formatCurrency } from "../../utils/formatCurrency";
import { Button } from "../common/Button";
import { ShoppingCart, Eye } from "lucide-react";

interface ProductCardProps {
  product: Product;
  onAddToCart: (product: Product) => void;
}

export const ProductCard: React.FC<ProductCardProps> = ({ product, onAddToCart }) => {
  const imgUrl = product.imageUrl || product.image_url || "https://images.unsplash.com/photo-1509042239860-f550ce710b93?auto=format&fit=crop&q=80&w=400";
  const isActive = product.isActive !== false && product.is_active !== false;
  
  // Stock check
  const quantity = product.inventory?.quantity;
  const isOutOfStock = quantity !== undefined && quantity <= 0;

  const handleImageError = (e: React.SyntheticEvent<HTMLImageElement, Event>) => {
    e.currentTarget.src = "https://images.unsplash.com/photo-1509042239860-f550ce710b93?auto=format&fit=crop&q=80&w=400";
  };

  return (
    <div className="bg-white rounded-3xl border border-amber-900/5 hover:shadow-2xl hover:shadow-amber-950/5 transition-all duration-300 overflow-hidden flex flex-col group h-full">
      {/* Product Image Wrapper */}
      <div className="relative aspect-[4/3] w-full bg-[#faf6f0] overflow-hidden">
        <img
          src={imgUrl}
          alt={product.name}
          onError={handleImageError}
          className="w-full h-full object-cover group-hover:scale-103 transition-transform duration-550"
        />
        {(!isActive || isOutOfStock) && (
          <div className="absolute inset-0 bg-[#150d0a]/65 backdrop-blur-xs flex items-center justify-center">
            <span className="bg-rose-600 text-white text-[10px] font-bold uppercase tracking-widest px-3.5 py-1.5 rounded-full shadow-md">
              Hết hàng / Tạm ngưng
            </span>
          </div>
        )}
      </div>

      {/* Product Info */}
      <div className="p-6 flex-1 flex flex-col gap-4">
        <div className="flex flex-col gap-1 flex-grow">
          <h3 className="font-bold text-slate-800 text-base line-clamp-1 group-hover:text-amber-800 transition-colors font-serif">
            {product.name}
          </h3>
          <div className="flex items-baseline gap-1.5 mt-1">
            <span className="text-lg font-black text-amber-850">
              {formatCurrency(product.price)}
            </span>
            <span className="text-xs text-slate-400 font-light">
              / {product.unit || "hộp"}
            </span>
          </div>
        </div>

        {product.description && (
          <p className="text-slate-400 text-xs line-clamp-2 leading-relaxed font-light mb-1">
            {product.description}
          </p>
        )}

        {/* Action buttons */}
        <div className="mt-auto pt-2 flex items-center gap-2">
          <Link to={`/products/${product.id}`} className="flex-1">
            <Button
              variant="outline"
              size="sm"
              className="w-full flex items-center justify-center gap-1.5 border-amber-900/10 text-slate-600 hover:bg-amber-50/40 rounded-xl"
            >
              <Eye size={13} />
              Chi tiết
            </Button>
          </Link>
          <Button
            onClick={() => onAddToCart(product)}
            size="sm"
            disabled={!isActive || isOutOfStock}
            className="flex-1 flex items-center justify-center gap-1.5 bg-amber-850 hover:bg-amber-950 text-white border-none rounded-xl"
          >
            <ShoppingCart size={13} />
            Mua
          </Button>
        </div>
      </div>
    </div>
  );
};
