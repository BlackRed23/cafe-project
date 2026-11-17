import { mockEnabled } from '../../mock/config';
import { MockWorkspace } from '../../mock/MockWorkspace';
import React, { useState, useEffect, useRef } from "react";
import { Link, useNavigate } from "react-router-dom";
import { productsApi } from "../../api/products.api";
import { categoriesApi } from "../../api/categories.api";
import { RecipeManager } from "../../features/recipes/RecipeManager";
import { Modal } from "../../components/common/Modal";
import { useToast } from "../../contexts/ToastContext";
import { Alert } from "../../components/common/Alert";
import { productFailure } from "./productFeedback";
import "./products.css";
import type { Product } from "../../types/product.types";
import type { Category } from "../../types/category.types";
import { formatCurrency } from "../../utils/formatCurrency";
import { Button } from "../../components/common/Button";
import { Loading } from "../../components/common/Loading";
import { EmptyState } from "../../components/common/EmptyState";
import { ConfirmDialog } from "../../components/common/ConfirmDialog";
import { DataTable } from "../../components/admin/DataTable";
import { useAuth } from "../../contexts/AuthContext";
import { Plus, Edit2, Trash2, Coffee, RefreshCw, Pause } from "lucide-react";

export const AdminProductsPage: React.FC = () => mockEnabled ? <MockWorkspace area="menu" /> : <LegacyAdminProductsPage />;

const LegacyAdminProductsPage: React.FC = () => {
  const navigate = useNavigate();
  const { isStaff } = useAuth();
  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [recipeProduct, setRecipeProduct] = useState<Product | null>(null);
  const [recipeBusy, setRecipeBusy] = useState(false);
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

  const toast = useToast();
  const mutationLock = useRef(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [restoreId, setRestoreId] = useState<string | null>(null);
  const [stale, setStale] = useState(false);
  const showToast = (message: string, type: 'success' | 'error' | 'info' = 'info') => toast[type](message);

  const fetchData = async () => {
    try {
      setIsLoading(true);
      setError(null);
      const [productsData, categoriesData] = await Promise.all([
        productsApi.getProducts({ includeInactive: true }),
        categoriesApi.getCategories().catch(() => [] as Category[])
      ]);
      setProducts(productsData);
      setStale(false);
      setCategories(categoriesData);
    } catch (err) {
      setError(productFailure(err, "read").message);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const handleDelete = async () => {
    if (!deleteId || mutationLock.current || stale) return;
    mutationLock.current = true;
    setIsDeleting(true);
    try {
      await productsApi.deleteProduct(deleteId);
      setProducts((prev) => prev.filter((p) => p.id !== deleteId));
      showToast("Đã xóa sản phẩm thành công.", "success");
      setDeleteId(null);
    } catch (err: unknown) {
      if (productFailure(err, "delete").kind === "history") {
        const p = products.find((product) => product.id === deleteId);
        if (p) setConflictProduct(p);
        setDeleteId(null);
      } else {
        showToast(productFailure(err, "delete").message, "error");
        setDeleteId(null);
      }
    } finally {
      mutationLock.current = false;
      setIsDeleting(false);
    }
  };

  const handleDeactivate = async () => {
    if (!conflictProduct || mutationLock.current || stale) return;
    if (!conflictProduct.updatedAt) { setStale(true); setError('Thiếu phiên bản sản phẩm. Tải lại trước khi ngưng bán.'); return; }
    mutationLock.current = true;
    setIsDeactivating(true);
    try {
      const updated = await productsApi.updateProduct(conflictProduct.id, { expectedUpdatedAt: conflictProduct.updatedAt, isActive: false });
      setProducts(previous => previous.map(product => product.id === updated.id ? updated : product));
      showToast('Đã ngưng bán sản phẩm. Dữ liệu lịch sử được giữ nguyên.', 'success');
      setConflictProduct(null);
    } catch (err) {
      const failure = productFailure(err);
      if (failure.kind === 'stale') setStale(true);
      setError(failure.message);
      showToast(failure.message, 'error');
    } finally {
      mutationLock.current = false;
      setIsDeactivating(false);
    }
  };

  const handleRestore = async () => {
    if (!restoreId || mutationLock.current || stale) return;
    mutationLock.current = true;
    setBusyId(restoreId);
    try {
      const restored = await productsApi.restoreProduct(restoreId);
      setProducts(previous => previous.map(product => product.id === restored.id ? restored : product));
      showToast("Khôi phục sản phẩm thành công.", "success");
    } catch (err: unknown) {
      const failure = productFailure(err);
      if (failure.kind === "stale") setStale(true);
      setError(failure.message);
      showToast(failure.message, "error");
    } finally {
      mutationLock.current = false;
      setBusyId(null);
    }
  };

  const handlePurge = async () => {
    if (!purgeId || mutationLock.current || stale) return;
    mutationLock.current = true;
    setIsPurging(true);
    try {
      await productsApi.purgeProduct(purgeId);
      showToast("Đã xoá vĩnh viễn sản phẩm.", "success");
      setPurgeId(null);
      fetchData();
    } catch (err: unknown) {
      showToast(productFailure(err, "delete").message, "error");
    } finally {
      mutationLock.current = false;
      setIsPurging(false);
    }
  };

  const handleImageError = (e: React.SyntheticEvent<HTMLImageElement>) => {
    e.currentTarget.onerror = null;
    e.currentTarget.src =
      "/images/product-fallback.jpg";
  };

  const activeProducts = products.filter(p => p.isActive !== false && !p.pendingDeleteUntil);
  const inactiveProducts = products.filter(p => p.isActive === false && !p.pendingDeleteUntil);
  const pendingDeleteProducts = products.filter(p => !!p.pendingDeleteUntil);

  const filteredProducts = products.filter((p) => {
    if (statusFilter === "ACTIVE" && (p.isActive === false || !!p.pendingDeleteUntil)) return false;
    if (statusFilter === "INACTIVE" && (p.isActive !== false || !!p.pendingDeleteUntil)) return false;
    if (statusFilter === "PENDING_DELETE" && !p.pendingDeleteUntil) return false;
    if (categoryFilter !== "ALL" && p.categoryId !== categoryFilter && p.category_id !== categoryFilter) return false;
    if (search.trim() && !`${p.name} ${p.sku ?? ""}`.toLocaleLowerCase("vi").includes(search.trim().toLocaleLowerCase("vi"))) return false;
    return true;
  });

  if (isLoading) {
    return (
      <div className="product-workspace flex items-center justify-center py-24" role="status">
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
          "/images/product-fallback.jpg";
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
          <p className="product-help">{product.sku || "Chưa có mã SKU"}</p>
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
        <span className="product-category inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium">
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
      header: "Công thức",
      render: (product: Product) => <span className="product-classification" data-review={product.requiresRecipe === null || product.requiresRecipe === undefined ? 'pending' : 'reviewed'}>{product.requiresRecipe === true ? 'Cần công thức' : product.requiresRecipe === false ? 'Không cần công thức' : 'Chưa đánh giá'}</span>,
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
                {daysLeft > 0 ? `Còn ${daysLeft} ngày` : 'Đã hết thời hạn chờ'}
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
        const recipeLink = <Button size="sm" variant="outline" onClick={() => setRecipeProduct(product)}>Công thức</Button>;
        if (isStaff) return recipeLink;
        if (product.pendingDeleteUntil) {
          const daysLeft = Math.ceil((new Date(product.pendingDeleteUntil).getTime() - Date.now()) / (1000 * 60 * 60 * 24));
          const isPurgable = daysLeft <= 0;
          return (
            <div className="flex items-center justify-end gap-1.5">
              {recipeLink}
              <button
                onClick={() => setRestoreId(product.id)}
                disabled={!!busyId || stale}
                className="p-2 text-slate-400 hover:text-emerald-600 hover:bg-emerald-50 rounded-lg transition-all"
                title="Khôi phục"
              >
                <RefreshCw size={15} />
              </button>
              <button
                onClick={() => isPurgable ? setPurgeId(product.id) : undefined}
                className={`p-2 rounded-lg transition-all ${isPurgable ? 'text-slate-400 hover:text-rose-600 hover:bg-rose-50' : 'text-slate-300 cursor-not-allowed'}`}
                title={isPurgable ? "Yêu cầu xóa vĩnh viễn; máy chủ kiểm tra lịch sử" : "Chưa hết thời hạn chờ 7 ngày."}
                disabled={!isPurgable || stale || isPurging}
              >
                <Trash2 size={15} />
              </button>
            </div>
          );
        }
        return (
          <div className="flex items-center justify-end gap-1.5">
              {recipeLink}
            <button
              onClick={() => navigate(`/admin/products/${product.id}/edit`)}
              className="p-2 text-slate-400 hover:text-amber-800 hover:bg-amber-50 rounded-lg transition-all"
              title="Chỉnh sửa"
            >
              <Edit2 size={15} />
            </button>
            {product.isActive && <button onClick={() => setConflictProduct(product)} title="Ngưng bán" aria-label={`Ngưng bán ${product.name}`} disabled={stale || isDeactivating} className="p-2 text-slate-500"><Pause size={15} /></button>}
            <button
              disabled={stale || isDeleting}
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
    <div className="product-workspace flex flex-col gap-6">
      <div className="product-heading">
        <div><p className="product-eyebrow">COFFEE INV / Danh mục kinh doanh</p><h1>Quản lý sản phẩm</h1><p>Thông tin rõ ràng. Hương vị nhất quán.</p></div>
        <Button variant="outline" onClick={fetchData} disabled={isDeleting || isDeactivating || isPurging || !!busyId}><RefreshCw size={16} /> Tải lại</Button>
      </div>
      {/* Page action bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-2">
          <Coffee size={16} className="text-amber-800" />
          <span className="text-sm font-semibold text-slate-600">
            {products.length} sản phẩm trong hệ thống
          </span>
        </div>
        {!isStaff && (
          <Link to="/admin/products/create">
            <Button className="flex items-center gap-1.5 w-full sm:w-auto">
              <Plus size={16} /> Thêm sản phẩm
            </Button>
          </Link>
        )}
      </div>

      {error && <Alert tone="danger" title="Không thể hoàn tất yêu cầu">{error}</Alert>}
      {stale && <Alert tone="warning">Cần tải lại danh sách trước khi tiếp tục thay đổi sản phẩm.</Alert>}

      {/* Filters & Tabs */}
      {!isLoading && (
        <div className="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-sm">
          <div className="flex flex-col lg:flex-row lg:items-center gap-4">
            <div className="flex overflow-x-auto space-x-1 bg-slate-100 p-1 rounded-xl scrollbar-hide">
              {(["ALL", "ACTIVE", "INACTIVE", "PENDING_DELETE"] as const).map((status) => (
                <button
                  key={status}
                  aria-pressed={statusFilter === status}
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
                aria-label="Lọc theo danh mục"
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

      {error && products.length === 0 ? null : products.length === 0 ? (
        <EmptyState
          title="Chưa có sản phẩm"
          description="Hệ thống chưa có sản phẩm nào. Nhấn Thêm sản phẩm để bắt đầu."
          actionText={isStaff ? undefined : "Thêm sản phẩm đầu tiên"}
          actionPath="/admin/products/create"
        />
      ) : (
        <DataTable
          columns={columns}
          data={filteredProducts}
          caption="Danh sách sản phẩm · lọc và phân trang trên dữ liệu đã tải"
          searchPlaceholder="Tìm tên hoặc SKU..."
          searchValue={search}
          onSearchChange={setSearch}
        />
      )}

      <Modal isOpen={!!recipeProduct} onClose={() => { if (!recipeBusy) setRecipeProduct(null); }} title={`Công thức · ${recipeProduct?.name ?? ''}`} size="xl">
        {recipeProduct && <RecipeManager key={recipeProduct.id} productId={recipeProduct.id} productName={recipeProduct.name} onBusyChange={setRecipeBusy} onChanged={() => setStale(true)} />}
      </Modal>
      <ConfirmDialog isOpen={!!restoreId} onClose={() => { if (!mutationLock.current) setRestoreId(null); }} onConfirm={handleRestore} title="Khôi phục sản phẩm?" message="Sản phẩm sẽ được bật bán nếu phân loại và công thức đáp ứng kiểm tra của máy chủ." confirmText="Khôi phục" isLoading={!!busyId} />
      <ConfirmDialog
        isOpen={!!deleteId}
        onClose={() => { if (!mutationLock.current) setDeleteId(null); }}
        onConfirm={handleDelete}
        title="Xóa sản phẩm"
        message="Xóa vĩnh viễn sản phẩm chưa có lịch sử liên quan. Thao tác không thể hoàn tác. Sản phẩm đã bán không thể xóa; hãy chọn ngưng bán để giữ dữ liệu lịch sử."
        confirmText="Xóa ngay"
        cancelText="Hủy"
        type="danger"
        isLoading={isDeleting}
      />

      <ConfirmDialog
        isOpen={!!purgeId}
        onClose={() => { if (!mutationLock.current) setPurgeId(null); }}
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
        onClose={() => { if (!mutationLock.current) setConflictProduct(null); }}
        onConfirm={handleDeactivate}
        title="Ngưng bán sản phẩm"
        message={`Ngưng bán "${conflictProduct?.name}"? Sản phẩm sẽ không nhận đơn mới. Đơn hàng đã xác nhận, giá lịch sử và dữ liệu kho được giữ nguyên.`}
        confirmText="Ngưng bán"
        cancelText="Đóng"
        type="warning"
        isLoading={isDeactivating}
      />
    </div>

    </>
  );
};
