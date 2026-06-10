import React, { useState, useEffect } from "react";
import { productsApi } from "../api/products.api";
import type { Product } from "../types/product.types";
import { useCart } from "../contexts/CartContext";
import { ProductCard } from "../components/product/ProductCard";
import { Loading } from "../components/common/Loading";
import { EmptyState } from "../components/common/EmptyState";
import { Search, Sparkles, ChevronLeft, ChevronRight, SlidersHorizontal } from "lucide-react";

import { categoriesApi } from "../api/categories.api";
import type { Category } from "../types/category.types";

const PRICE_RANGES = [
  { id: "all", name: "Mọi mức giá" },
  { id: "under-100", name: "Dưới 100k" },
  { id: "100-200", name: "100k - 200k" },
  { id: "over-200", name: "Trên 200k" },
];

export const ProductListPage: React.FC = () => {
  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<{ id: string; name: string }[]>([{ id: "all", name: "Tất cả" }]);
  const [search, setSearch] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("all");
  const [selectedPriceRange, setSelectedPriceRange] = useState("all");
  const [sortBy, setSortBy] = useState("default");
  
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 8;

  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { addToCart } = useCart();

  const fetchData = async () => {
    try {
      setIsLoading(true);
      setError(null);
      const [productsData, categoriesData] = await Promise.all([
        productsApi.getProducts(),
        categoriesApi.getCategories()
      ]);
      setProducts(productsData);
      
      const activeCats = categoriesData.filter(c => c.isActive !== false);
      setCategories([
        { id: "all", name: "Tất cả" },
        ...activeCats.map(c => ({ id: c.id, name: c.name }))
      ]);
    } catch (err: any) {
      setError("Không thể tải dữ liệu. Vui lòng kiểm tra lại kết nối.");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    window.scrollTo(0, 0);
    fetchData();
  }, []);

  // Reset page when any filter changes
  useEffect(() => {
    setCurrentPage(1);
  }, [search, selectedCategory, selectedPriceRange, sortBy]);

  const handleAddToCart = (product: Product) => {
    addToCart(product, 1);
  };

  // Filter and Sort Logic
  const getFilteredAndSortedProducts = () => {
    let result = [...products];

    // Search filter
    if (search.trim()) {
      result = result.filter((p) =>
        p.name.toLowerCase().includes(search.toLowerCase()) ||
        p.description?.toLowerCase().includes(search.toLowerCase())
      );
    }

    // Category filter
    if (selectedCategory !== "all") {
      result = result.filter((p) => p.categoryId === selectedCategory || p.category_id === selectedCategory);
    }

    // Price range filter
    if (selectedPriceRange !== "all") {
      if (selectedPriceRange === "under-100") {
        result = result.filter((p) => p.price < 100000);
      } else if (selectedPriceRange === "100-200") {
        result = result.filter((p) => p.price >= 100000 && p.price <= 200000);
      } else if (selectedPriceRange === "over-200") {
        result = result.filter((p) => p.price > 200000);
      }
    }

    // Sorting
    if (sortBy === "price-asc") {
      result.sort((a, b) => a.price - b.price);
    } else if (sortBy === "price-desc") {
      result.sort((a, b) => b.price - a.price);
    } else if (sortBy === "name-asc") {
      result.sort((a, b) => a.name.localeCompare(b.name));
    }

    return result;
  };

  const processedProducts = getFilteredAndSortedProducts();

  // Pagination Logic
  const totalItems = processedProducts.length;
  const totalPages = Math.ceil(totalItems / itemsPerPage);
  const startIndex = (currentPage - 1) * itemsPerPage;
  const endIndex = Math.min(startIndex + itemsPerPage, totalItems);
  const paginatedProducts = processedProducts.slice(startIndex, endIndex);

  const getPageNumbers = () => {
    const pages = [];
    for (let i = 1; i <= totalPages; i++) {
      pages.push(i);
    }
    return pages;
  };

  if (isLoading) {
    return (
      <div className="min-h-[50vh] flex items-center justify-center">
        <Loading message="Đang tải danh sách sản phẩm..." />
      </div>
    );
  }

  if (error) {
    return (
      <div className="max-w-xl mx-auto my-20 text-center p-8 bg-rose-50 border border-rose-100 text-rose-800 rounded-2xl shadow-sm">
        <p className="font-bold mb-2">Đã xảy ra lỗi</p>
        <p className="text-sm mb-6">{error}</p>
        <button
          onClick={fetchProducts}
          className="px-6 py-2.5 bg-amber-800 hover:bg-amber-900 text-white rounded-xl text-sm font-bold transition-all shadow-md active:scale-95"
        >
          Thử lại
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-10 pb-20 bg-slate-50/50">
      {/* Hero Header */}
      <section className="relative bg-[#1e130e] text-white py-20 px-4 text-center overflow-hidden">
        <div className="absolute inset-0 opacity-15 mix-blend-overlay bg-cover bg-center" style={{ backgroundImage: "url('https://images.unsplash.com/photo-1507133750040-4a8f57021571?auto=format&fit=crop&q=80&w=800')" }}></div>
        <div className="relative z-10 flex flex-col items-center gap-3">
          <span className="text-[#c49b76] text-sm font-bold uppercase tracking-widest flex items-center gap-1.5 bg-amber-950/40 px-3.5 py-1.5 rounded-full border border-amber-900/30">
            <Sparkles size={14} className="text-[#c49b76]" /> Hương vị nguyên bản
          </span>
          <h1 className="text-4xl sm:text-5xl font-extrabold font-serif tracking-tight">Menu Cà Phê</h1>
          <p className="text-[15px] text-amber-200/70 font-light max-w-md">Chọn sản phẩm cà phê đóng gói thượng hạng của bạn</p>
        </div>
      </section>

      {/* Filter and Content section */}
      <div className="max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 flex flex-col gap-8">
        
        {/* Filters Panel */}
        <div className="bg-white rounded-2xl p-4 sm:p-5 border border-slate-100 shadow-xs flex flex-col gap-4">
          {/* Top row: Search and Sort */}
          <div className="flex flex-col lg:flex-row gap-4 justify-between items-stretch lg:items-center">
            <div className="relative flex-1 max-w-md">
              <input
                type="text"
                placeholder="Tìm kiếm sản phẩm theo tên, hương vị..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full pl-10 pr-4 py-2 bg-slate-50 border border-slate-205 rounded-xl text-[14px] focus:bg-white focus:border-amber-700 focus:ring-2 focus:ring-amber-500/15 outline-none transition-all"
              />
              <Search className="absolute left-3.5 top-2.5 text-slate-400" size={16} />
            </div>

            <div className="flex flex-wrap items-center gap-3">
              {/* Sort selector */}
              <div className="flex items-center gap-2">
                <span className="text-[13.5px] text-slate-500 whitespace-nowrap">Sắp xếp:</span>
                <select
                  value={sortBy}
                  onChange={(e) => setSortBy(e.target.value)}
                  className="bg-slate-50 border border-slate-205 rounded-xl px-3 py-2 text-[14px] font-medium text-slate-750 outline-none focus:bg-white focus:border-amber-700 focus:ring-2 focus:ring-amber-500/15 transition-all"
                >
                  <option value="default">Mặc định</option>
                  <option value="price-asc">Giá: Thấp đến Cao</option>
                  <option value="price-desc">Giá: Cao đến Thấp</option>
                  <option value="name-asc">Tên: A - Z</option>
                </select>
              </div>
            </div>
          </div>

          {/* Separator */}
          <div className="h-px bg-slate-100" />

          {/* Bottom row: Category Pills & Price range */}
          <div className="flex flex-col gap-3.5">
            {/* Categories */}
            <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4">
              <span className="text-[13.5px] font-semibold text-slate-650 min-w-[130px] flex items-center gap-1.5">
                <SlidersHorizontal size={13} className="text-amber-850" /> Danh mục:
              </span>
              <div className="flex flex-wrap gap-1.5">
                {categories.map((cat) => {
                  const isActive = selectedCategory === cat.id;
                  return (
                    <button
                      key={cat.id}
                      onClick={() => setSelectedCategory(cat.id)}
                      className={`px-3 py-1.5 rounded-lg text-[13px] font-medium transition-all ${
                        isActive
                          ? "bg-amber-800 text-white shadow-sm hover:bg-amber-900"
                          : "bg-slate-50 text-slate-650 hover:bg-slate-100 border border-slate-100"
                      }`}
                    >
                      {cat.name}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Price Ranges */}
            <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4">
              <span className="text-[13.5px] font-semibold text-slate-655 min-w-[130px]">
                Khoảng giá:
              </span>
              <div className="flex flex-wrap gap-1.5">
                {PRICE_RANGES.map((range) => {
                  const isActive = selectedPriceRange === range.id;
                  return (
                    <button
                      key={range.id}
                      onClick={() => setSelectedPriceRange(range.id)}
                      className={`px-3 py-1 rounded-lg text-[12.5px] font-medium transition-all border ${
                        isActive
                          ? "bg-amber-50 text-amber-900 border-amber-300"
                          : "bg-white text-slate-550 hover:bg-slate-50 border-slate-200"
                      }`}
                    >
                      {range.name}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        </div>

        {/* Products Grid */}
        {paginatedProducts.length === 0 ? (
          <EmptyState
            title="Không tìm thấy sản phẩm"
            description="Không có sản phẩm nào phù hợp với bộ lọc và từ khóa hiện tại."
          />
        ) : (
          <div className="flex flex-col gap-12">
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-8">
              {paginatedProducts.map((product) => (
                <ProductCard
                  key={product.id}
                  product={product}
                  onAddToCart={handleAddToCart}
                />
              ))}
            </div>

            {/* Storefront Pagination Controls */}
            {totalPages > 1 && (
              <div className="flex flex-col sm:flex-row items-center justify-between gap-4 pt-6 border-t border-slate-200/60">
                <div className="text-[14px] text-slate-500">
                  Hiển thị từ <span className="font-semibold text-slate-700">{startIndex + 1}</span> đến{" "}
                  <span className="font-semibold text-slate-700">{endIndex}</span> trong số{" "}
                  <span className="font-semibold text-slate-700">{totalItems}</span> sản phẩm
                </div>

                <div className="flex items-center gap-1.5">
                  <button
                    onClick={() => setCurrentPage((p) => Math.max(p - 1, 1))}
                    disabled={currentPage === 1}
                    className="p-2.5 rounded-xl border border-slate-250 bg-white text-slate-650 hover:bg-slate-50 disabled:opacity-40 disabled:hover:bg-white transition-colors"
                  >
                    <ChevronLeft size={16} />
                  </button>

                  <div className="flex gap-1">
                    {getPageNumbers().map((page) => {
                      const isCurrent = page === currentPage;
                      return (
                        <button
                          key={page}
                          onClick={() => setCurrentPage(page)}
                          className={`min-w-10 h-10 px-3 rounded-xl text-[14.5px] font-bold transition-all ${
                            isCurrent
                              ? "bg-amber-800 text-white shadow-md shadow-amber-850/10"
                              : "border border-slate-250 bg-white text-slate-650 hover:bg-slate-50"
                          }`}
                        >
                          {page}
                        </button>
                      );
                    })}
                  </div>

                  <button
                    onClick={() => setCurrentPage((p) => Math.min(p + 1, totalPages))}
                    disabled={currentPage === totalPages}
                    className="p-2.5 rounded-xl border border-slate-250 bg-white text-slate-650 hover:bg-slate-50 disabled:opacity-40 disabled:hover:bg-white transition-colors"
                  >
                    <ChevronRight size={16} />
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
