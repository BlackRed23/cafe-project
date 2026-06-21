import React, { useState, useEffect } from "react";
import { Link, useNavigate } from "react-router-dom";
import { productsApi } from "../../api/products.api";
import { categoriesApi } from "../../api/categories.api";
import { getErrorMessage } from "../../api/client";
import type { Product } from "../../types/product.types";
import type { Category } from "../../types/category.types";
import { formatCurrency } from "../../utils/formatCurrency";
import { Button } from "../../components/common/Button";
import { Loading } from "../../components/common/Loading";
import { EmptyState } from "../../components/common/EmptyState";
import { ConfirmDialog } from "../../components/common/ConfirmDialog";
import { DataTable } from "../../components/admin/DataTable";
import { Plus, Edit2, Trash2, Coffee, RefreshCw, AlertCircle, CheckCircle, Info } from "lucide-react";

export const AdminProductsPage: React.FC = () => {
  const navigate = useNavigate();
  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"ALL" | "ACTIVE" | "INACTIVE" | "PENDING_DELETE">("ALL");
  const [categoryFilter, setCategoryFilter] = useState<string>("ALL");
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const [conflictProduct, setConflictProduct] = useState<Product | null>(null);
  const [isDeactivating, setIsDeactivating] = useState(false);

  const [purgeId, setPurgeId] = useState<string | null>(null);
  const [isPurging, setIsPurging] = useState(false);

  const [toast, setToast] = useState<{ message: string; type: "success" | "error" | "info" } | null>(null);
  const showToast = (message: string, type: "success" | "error" | "info" = "info") => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 4000);
  };

  const fetchData = async () => {
    try {
      setIsLoading(true);
      const [productsData, categoriesData] = await Promise.all([
        productsApi.getProducts({ includeInactive: true }),
        categoriesApi.getCategories().catch(() => [] as Category[])
      ]);
      setProducts(productsData);
      setCategories(categoriesData);
    } catch {
      setError("Không thể tải danh sách sản phẩm.");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const handleDelete = async () => {
    if (!deleteId) return;
    setIsDeleting(true);
    try {
      await productsApi.deleteProduct(deleteId);
      setProducts((prev) => prev.filter((p) => p.id !== deleteId));
      showToast("Đã xóa sản phẩm thành công.", "success");
      setDeleteId(null);
    } catch (err: any) {
      if (err.response?.status === 409) {
        const p = products.find((product) => product.id === deleteId);
        if (p) setConflictProduct(p);
        setDeleteId(null);
      } else {
        showToast(getErrorMessage(err) || "Lỗi khi xóa sản phẩm.", "error");
        setDeleteId(null);
      }
    } finally {
      setIsDeleting(false);
    }
  };

  const handleScheduleDelete = async () => {
    if (!conflictProduct) return;
    setIsDeactivating(true);
    try {
      await productsApi.scheduleDeleteProduct(conflictProduct.id);
      showToast("Đã chuyển sản phẩm vào danh sách chờ xoá trong 7 ngày.", "success");
      setConflictProduct(null);
      fetchData();
    } catch (err: any) {
      showToast(getErrorMessage(err) || "Không thể chuyển sản phẩm vào danh sách chờ xoá.", "error");
    } finally {
      setIsDeactivating(false);
    }
  };

  const handleRestore = async (id: string) => {
    try {
      await productsApi.restoreProduct(id);
      showToast("Khôi phục sản phẩm thành công.", "success");
      fetchData();
    } catch (err: any) {
      showToast(getErrorMessage(err) || "Không thể khôi phục sản phẩm.", "error");
    }
  };

  const handlePurge = async () => {
    if (!purgeId) return;
    setIsPurging(true);
    try {
      await productsApi.purgeProduct(purgeId);
      showToast("Đã xoá vĩnh viễn sản phẩm.", "success");
      setPurgeId(null);
      fetchData();
    } catch (err: any) {
      showToast(getErrorMessage(err) || "Chưa thể xoá vĩnh viễn sản phẩm.", "error");
    } finally {
      setIsPurging(false);
    }
  };

  const handleImageError = (e: React.SyntheticEvent<HTMLImageElement>) => {
    e.currentTarget.src =
      "https://images.unsplash.com/photo-1509042239860-f550ce710b93?auto=format&fit=crop&q=80&w=200";
  };

  const activeProducts = products.filter(p => p.isActive !== false && !p.pendingDeleteUntil);
  const inactiveProducts = products.filter(p => p.isActive === false && !p.pendingDeleteUntil);
  const pendingDeleteProducts = products.filter(p => !!p.pendingDeleteUntil);

  const filteredProducts = products.filter((p) => {
    if (statusFilter === "ACTIVE" && (p.isActive === false || !!p.pendingDeleteUntil)) return false;
    if (statusFilter === "INACTIVE" && (p.isActive !== false || !!p.pendingDeleteUntil)) return false;
    if (statusFilter === "PENDING_DELETE" && !p.pendingDeleteUntil) return false;
    if (categoryFilter !== "ALL" && p.categoryId !== categoryFilter && (p as any).category_id !== categoryFilter) return false;
    if (search && !p.name.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

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
      render: (product: Product) => {
        if (product.pendingDeleteUntil) {
          const daysLeft = Math.ceil((new Date(product.pendingDeleteUntil).getTime() - Date.now()) / (1000 * 60 * 60 * 24));
          return (
            <div className="flex flex-col gap-1">
              <span className="inline-flex w-fit items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-rose-50 border border-rose-100 text-rose-700">
                Chờ xoá
              </span>
              <span className="text-[10px] text-slate-500">
                {daysLeft > 0 ? `Còn ${daysLeft} ngày` : 'Có thể xoá'}
              </span>
            </div>
          );
        }
        return product.isActive !== false ? (
          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-50 border border-emerald-100 text-emerald-700">
            ● Đang bán
          </span>
        ) : (
          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-slate-100 border border-slate-200 text-slate-500">
            ○ Ngưng bán
          </span>
        );
      },
    },
    {
      header: "Hành động",
      className: "text-right",
      render: (product: Product) => {
        if (product.pendingDeleteUntil) {
          const daysLeft = Math.ceil((new Date(product.pendingDeleteUntil).getTime() - Date.now()) / (1000 * 60 * 60 * 24));
          const isPurgable = daysLeft <= 0;
          return (
            <div className="flex items-center justify-end gap-1.5">
              <button
                onClick={() => handleRestore(product.id)}
                className="p-2 text-slate-400 hover:text-emerald-600 hover:bg-emerald-50 rounded-lg transition-all"
                title="Khôi phục"
              >
                <RefreshCw size={15} />
              </button>
              <button
                onClick={() => isPurgable ? setPurgeId(product.id) : undefined}
                className={`p-2 rounded-lg transition-all ${isPurgable ? 'text-slate-400 hover:text-rose-600 hover:bg-rose-50' : 'text-slate-300 cursor-not-allowed'}`}
                title={isPurgable ? "Xóa vĩnh viễn" : "Sản phẩm chỉ có thể xoá vĩnh viễn sau 7 ngày."}
                disabled={!isPurgable}
              >
                <Trash2 size={15} />
              </button>
            </div>
          );
        }
        return (
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
        );
      },
    },
  ];

  return (
    <>
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

      {/* Filters & Tabs */}
      {!isLoading && (
        <div className="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-sm">
          <div className="flex flex-col lg:flex-row lg:items-center gap-4">
            <div className="flex overflow-x-auto space-x-1 bg-slate-100 p-1 rounded-xl scrollbar-hide">
              {(["ALL", "ACTIVE", "INACTIVE", "PENDING_DELETE"] as const).map((status) => (
                <button
                  key={status}
                  onClick={() => setStatusFilter(status)}
                  className={`px-4 py-2 text-sm font-medium rounded-lg transition-all whitespace-nowrap flex-shrink-0 ${
                    statusFilter === status
                      ? "bg-white text-amber-800 shadow-sm"
                      : "text-slate-500 hover:text-slate-700 hover:bg-slate-200/50"
                  }`}
                >
                  {status === "ALL" && `Tất cả (${products.length})`}
                  {status === "ACTIVE" && `Đang bán (${activeProducts.length})`}
                  {status === "INACTIVE" && `Ngưng bán (${inactiveProducts.length})`}
                  {status === "PENDING_DELETE" && `Chờ xoá (${pendingDeleteProducts.length})`}
                </button>
              ))}
            </div>
            <div className="lg:ml-auto w-full lg:w-64 flex-shrink-0">
              <select
                value={categoryFilter}
                onChange={(e) => setCategoryFilter(e.target.value)}
                className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-amber-800/20 focus:border-amber-800"
              >
                <option value="ALL">Tất cả danh mục</option>
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </div>
          </div>
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

      <ConfirmDialog
        isOpen={!!purgeId}
        onClose={() => setPurgeId(null)}
        onConfirm={handlePurge}
        title="Xóa vĩnh viễn sản phẩm"
        message="Thao tác này sẽ xóa vĩnh viễn sản phẩm khỏi hệ thống. Bạn không thể hoàn tác."
        confirmText="Xóa vĩnh viễn"
        cancelText="Hủy"
        type="danger"
        isLoading={isPurging}
      />

      <ConfirmDialog
        isOpen={!!conflictProduct}
        onClose={() => setConflictProduct(null)}
        onConfirm={handleScheduleDelete}
        title="Không thể xóa sản phẩm"
        message={`Không thể xoá sản phẩm "${conflictProduct?.name}" vì đã có lịch sử kho/đơn hàng liên quan. Bạn có muốn chuyển sản phẩm sang chờ xoá trong 7 ngày không?`}
        confirmText="Chuyển vào chờ xoá"
        cancelText="Đóng"
        type="warning"
        isLoading={isDeactivating}
      />
    </div>

    {/* Toast Notification Container */}
    {toast && (
      <div
        className={`fixed top-4 right-4 z-[9999] px-4 py-3 rounded-xl border shadow-lg flex items-start gap-2.5 max-w-sm animate-in slide-in-from-right-8 duration-300 ${
          toast.type === "error"
            ? "bg-rose-50 border-rose-300 text-rose-900"
            : toast.type === "success"
            ? "bg-emerald-50 border-emerald-300 text-emerald-900"
            : "bg-sky-50 border-sky-300 text-sky-900"
        }`}
      >
        <div
          className={`mt-0.5 ${
            toast.type === "error"
              ? "text-rose-600"
              : toast.type === "success"
              ? "text-emerald-600"
              : "text-sky-600"
          }`}
        >
          {toast.type === "error" ? <AlertCircle size={18} /> : toast.type === "success" ? <CheckCircle size={18} /> : <Info size={18} />}
        </div>
        <span className="flex-1 text-sm font-medium leading-snug">{toast.message}</span>
      </div>
    )}
    </>
  );
};
