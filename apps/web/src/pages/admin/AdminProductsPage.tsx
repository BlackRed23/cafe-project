import React, { useState, useEffect } from "react";
import { Link, useNavigate } from "react-router-dom";
import { productsApi } from "../../api/products.api";
import type { Product } from "../../types/product.types";
import { formatCurrency } from "../../utils/formatCurrency";
import { Button } from "../../components/common/Button";
import { Loading } from "../../components/common/Loading";
import { EmptyState } from "../../components/common/EmptyState";
import { ConfirmDialog } from "../../components/common/ConfirmDialog";
import { DataTable } from "../../components/admin/DataTable";
import { Plus, Edit2, Trash2, Coffee } from "lucide-react";

export const AdminProductsPage: React.FC = () => {
  const navigate = useNavigate();
  const [products, setProducts] = useState<Product[]>([]);
  const [search, setSearch] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const fetchProducts = async () => {
    try {
      setIsLoading(true);
      const data = await productsApi.getProducts();
      setProducts(data);
    } catch {
      setError("Không thể tải danh sách sản phẩm.");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchProducts();
  }, []);

  const handleDelete = async () => {
    if (!deleteId) return;
    setIsDeleting(true);
    try {
      await productsApi.deleteProduct(deleteId);
      setProducts((prev) => prev.filter((p) => p.id !== deleteId));
      setDeleteId(null);
    } catch {
      alert("Lỗi khi xóa sản phẩm.");
    } finally {
      setIsDeleting(false);
    }
  };

  const handleImageError = (e: React.SyntheticEvent<HTMLImageElement>) => {
    e.currentTarget.src =
      "https://images.unsplash.com/photo-1509042239860-f550ce710b93?auto=format&fit=crop&q=80&w=200";
  };

  const filteredProducts = products.filter((p) =>
    p.name.toLowerCase().includes(search.toLowerCase())
  );

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loading message="Đang tải danh sách sản phẩm..." />
      </div>
    );
  }

  const columns = [
    {
      header: "Ảnh",
      render: (product: Product) => {
        const img =
          product.image_url ||
          product.imageUrl ||
          "https://images.unsplash.com/photo-1509042239860-f550ce710b93?auto=format&fit=crop&q=80&w=200";
        return (
          <img
            src={img}
            alt={product.name}
            onError={handleImageError}
            className="w-12 h-12 rounded-xl object-cover border border-slate-100 bg-slate-50"
          />
        );
      },
    },
    {
      header: "Tên sản phẩm",
      render: (product: Product) => (
        <div>
          <p className="font-semibold text-slate-800">{product.name}</p>
          {product.description && (
            <p className="text-xs text-slate-400 truncate max-w-[180px] mt-0.5">
              {product.description}
            </p>
          )}
        </div>
      ),
    },
    {
      header: "Danh mục",
      render: (product: Product) => (
        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-amber-50 text-amber-800 border border-amber-100">
          {product.category?.name || "Khác"}
        </span>
      ),
    },
    {
      header: "Giá bán",
      render: (product: Product) => (
        <span className="font-bold text-amber-800">{formatCurrency(product.price)}</span>
      ),
    },
    {
      header: "Đơn vị",
      render: (product: Product) => (
        <span className="text-slate-500 text-xs">{product.unit || "hộp"}</span>
      ),
    },
    {
      header: "Trạng thái",
      render: (product: Product) =>
        product.isActive !== false ? (
          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-50 border border-emerald-100 text-emerald-700">
            ● Đang bán
          </span>
        ) : (
          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-slate-100 border border-slate-200 text-slate-500">
            ○ Ngưng bán
          </span>
        ),
    },
    {
      header: "Hành động",
      className: "text-right",
      render: (product: Product) => (
        <div className="flex items-center justify-end gap-1.5">
          <button
            onClick={() => navigate(`/admin/products/${product.id}/edit`)}
            className="p-2 text-slate-400 hover:text-amber-800 hover:bg-amber-50 rounded-lg transition-all"
            title="Chỉnh sửa"
          >
            <Edit2 size={15} />
          </button>
          <button
            onClick={() => setDeleteId(product.id)}
            className="p-2 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-all"
            title="Xóa"
          >
            <Trash2 size={15} />
          </button>
        </div>
      ),
    },
  ];

  return (
    <div className="flex flex-col gap-6">
      {/* Page action bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-2">
          <Coffee size={16} className="text-amber-800" />
          <span className="text-sm font-semibold text-slate-600">
            {products.length} sản phẩm trong hệ thống
          </span>
        </div>
        <Link to="/admin/products/create">
          <Button className="flex items-center gap-1.5 w-full sm:w-auto">
            <Plus size={16} /> Thêm sản phẩm
          </Button>
        </Link>
      </div>

      {error && (
        <div className="p-4 bg-rose-50 border border-rose-200 text-rose-800 text-sm font-medium rounded-xl">
          {error}
        </div>
      )}

      {products.length === 0 ? (
        <EmptyState
          title="Chưa có sản phẩm"
          description="Hệ thống chưa có sản phẩm nào. Nhấn Thêm sản phẩm để bắt đầu."
          actionText="Thêm sản phẩm đầu tiên"
          actionPath="/admin/products/create"
        />
      ) : (
        <DataTable
          columns={columns}
          data={filteredProducts}
          searchPlaceholder="Tìm theo tên sản phẩm..."
          searchValue={search}
          onSearchChange={setSearch}
        />
      )}

      <ConfirmDialog
        isOpen={!!deleteId}
        onClose={() => setDeleteId(null)}
        onConfirm={handleDelete}
        title="Xóa sản phẩm"
        message="Bạn có chắc chắn muốn xóa sản phẩm này? Thao tác này sẽ thực hiện xóa mềm khỏi hệ thống."
        confirmText="Xóa ngay"
        cancelText="Hủy"
        type="danger"
        isLoading={isDeleting}
      />
    </div>
  );
};
