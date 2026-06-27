import React, { useState, useEffect } from "react";
import { Plus, Search, Edit2, Trash2, LayoutGrid, Info, AlertCircle, CheckCircle } from "lucide-react";
import { categoriesApi } from "../../api/categories.api";
import type { Category } from "../../types/category.types";
import { Button } from "../../components/common/Button";
import { Input } from "../../components/common/Input";
import { Loading } from "../../components/common/Loading";
import { getErrorMessage } from "../../api/client";

export const AdminCategoriesPage: React.FC = () => {
  const [categories, setCategories] = useState<Category[]>([]);
  const [search, setSearch] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Modal states
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingCategory, setEditingCategory] = useState<Category | null>(null);
  
  // Form states
  const [formData, setFormData] = useState({
    name: "",
    description: "",
  });
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Delete modal states
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [categoryToDelete, setCategoryToDelete] = useState<string | null>(null);

  const [toast, setToast] = useState<{ message: string; type: "success" | "error" | "info" } | null>(null);
  const showToast = (message: string, type: "success" | "error" | "info" = "info") => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 4000);
  };

  const fetchCategories = async () => {
    try {
      setIsLoading(true);
      setError(null);
      const data = await categoriesApi.getCategories();
      setCategories(data);
    } catch (err) {
      setError("Không thể tải danh sách danh mục.");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchCategories();
  }, []);

  const handleOpenModal = (category?: Category) => {
    if (category) {
      setEditingCategory(category);
      setFormData({
        name: category.name,
        description: category.description || "",
      });
    } else {
      setEditingCategory(null);
      setFormData({
        name: "",
        description: "",
      });
    }
    setIsModalOpen(true);
  };

  const handleCloseModal = () => {
    setIsModalOpen(false);
    setEditingCategory(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!formData.name.trim()) {
      showToast("Tên danh mục không được để trống.", "error");
      return;
    }

    const payload = {
      name: formData.name.trim(),
      description: formData.description.trim() || undefined,
    };

    try {
      setIsSubmitting(true);
      if (editingCategory) {
        await categoriesApi.updateCategory(editingCategory.id, payload);
        showToast("Cập nhật danh mục thành công.", "success");
      } else {
        await categoriesApi.createCategory(payload);
        showToast("Đã thêm danh mục mới thành công.", "success");
      }
      handleCloseModal();
      fetchCategories();
    } catch (err) {
      showToast(getErrorMessage(err) || "Không thể lưu danh mục.", "error");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleOpenDeleteModal = (id: string) => {
    setCategoryToDelete(id);
    setIsDeleteModalOpen(true);
  };

  const handleCloseDeleteModal = () => {
    setIsDeleteModalOpen(false);
    setCategoryToDelete(null);
  };

  const handleDelete = async () => {
    if (!categoryToDelete) return;
    try {
      setIsSubmitting(true);
      showToast("Đang xoá...", "info");
      await categoriesApi.deleteCategory(categoryToDelete);
      showToast("Xoá danh mục thành công.", "success");
      handleCloseDeleteModal();
      fetchCategories();
    } catch (err) {
      const errorMsg = getErrorMessage(err);
      const isGenericError = errorMsg === "Đã có lỗi xảy ra." || errorMsg === "Đã có lỗi xảy ra. Vui lòng thử lại.";
      showToast(isGenericError ? "Không thể xoá danh mục vì vẫn còn sản phẩm thuộc danh mục này. Hãy chuyển sản phẩm sang danh mục khác trước." : errorMsg, "error");
    } finally {
      setIsSubmitting(false);
    }
  };

  const filteredCategories = categories.filter(
    (c) => c.name.toLowerCase().includes(search.toLowerCase())
  );

  if (isLoading) return <Loading message="Đang tải danh sách danh mục..." />;

  return (
    <>
      <div className="space-y-6 max-w-6xl mx-auto">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Danh mục sản phẩm</h1>
          <p className="text-sm text-slate-500 mt-1">Quản lý phân loại các sản phẩm trong hệ thống</p>
        </div>
        <Button onClick={() => handleOpenModal()} className="flex items-center gap-2 px-4 py-2 bg-amber-800 hover:bg-amber-900 text-white rounded-xl shadow-sm">
          <Plus size={18} /> Thêm danh mục
        </Button>
      </div>

      {error && (
        <div className="p-4 bg-rose-50 border border-rose-200 text-rose-800 rounded-xl text-sm flex items-center gap-2">
          <Info size={18} className="flex-shrink-0" />
          {error}
        </div>
      )}

      {/* Toolbar */}
      <div className="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-sm flex flex-col sm:flex-row gap-4 items-center">
        <div className="relative flex-1">
          <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            placeholder="Tìm kiếm danh mục..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-10 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-amber-800/20 focus:border-amber-800 transition-all"
          />
        </div>
        <div className="flex items-center gap-2">
          <LayoutGrid size={16} className="text-amber-800" />
          <span className="text-sm font-semibold text-slate-600">
            {categories.length} danh mục
          </span>
        </div>
      </div>

      {/* Table */}
      <div className="bg-white border border-slate-200/80 rounded-2xl shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm whitespace-nowrap">
            <thead className="bg-slate-50 border-b border-slate-100 text-slate-600 font-medium">
              <tr>
                <th className="px-6 py-4">Tên danh mục</th>
                <th className="px-6 py-4">Mô tả</th>
                <th className="px-6 py-4">Sản phẩm thuộc danh mục</th>
                <th className="px-6 py-4 text-right">Thao tác</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredCategories.length > 0 ? (
                filteredCategories.map((cat) => (
                  <tr key={cat.id} className="hover:bg-slate-50/50 transition-colors">
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-lg bg-amber-50 text-amber-700 flex items-center justify-center flex-shrink-0">
                          <LayoutGrid size={18} />
                        </div>
                        <span className="font-semibold text-slate-800">{cat.name}</span>
                      </div>
                    </td>
                    <td className="px-6 py-4 text-slate-600 whitespace-normal min-w-[200px]">
                      {cat.description || <span className="text-slate-400 italic">Không có mô tả</span>}
                    </td>
                    <td className="px-6 py-4 min-w-[250px]">
                      {!cat.products || cat.products.length === 0 ? (
                        <span className="text-slate-400 italic text-sm">Chưa có sản phẩm</span>
                      ) : (
                        <div className="flex flex-col gap-1.5">
                          <span className="text-xs font-semibold text-amber-800 bg-amber-50 px-2 py-0.5 rounded-md w-fit">
                            {cat.productCount} sản phẩm
                          </span>
                          <div className="flex flex-wrap gap-1.5 mt-0.5">
                            {cat.products.map(p => (
                              <span key={p.id} className="text-xs text-slate-600 bg-slate-100 border border-slate-200 px-2 py-1 rounded-md truncate max-w-[150px]" title={p.name}>
                                {p.name}
                              </span>
                            ))}
                            {(cat.productCount || 0) > cat.products.length && (
                              <span className="text-xs text-slate-500 bg-slate-50 border border-slate-200 px-2 py-1 rounded-md">
                                +{(cat.productCount || 0) - cat.products.length} khác
                              </span>
                            )}
                          </div>
                        </div>
                      )}
                    </td>
                    <td className="px-6 py-4 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <button
                          onClick={() => handleOpenModal(cat)}
                          className="p-1.5 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                          title="Chỉnh sửa"
                        >
                          <Edit2 size={16} />
                        </button>
                        <button
                          onClick={() => handleOpenDeleteModal(cat.id)}
                          className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors"
                          title="Xóa"
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={4} className="px-6 py-8 text-center text-slate-500">
                    Không tìm thấy danh mục nào
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Create/Edit Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md overflow-hidden animate-in fade-in zoom-in-95 duration-200">
            <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
              <h3 className="text-lg font-bold text-slate-800">
                {editingCategory ? "Cập nhật danh mục" : "Thêm danh mục mới"}
              </h3>
            </div>
            
            <form onSubmit={handleSubmit} className="p-6 space-y-4">
              <Input
                label="Tên danh mục"
                placeholder="Ví dụ: Cà phê đóng chai"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              />
              
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">
                  Mô tả
                </label>
                <textarea
                  rows={3}
                  placeholder="Nhập mô tả cho danh mục này..."
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  className="block w-full px-3.5 py-2.5 rounded-lg border border-slate-300 text-sm transition-colors duration-200 outline-none focus:ring-2 focus:ring-amber-700/20 focus:border-amber-700 placeholder-slate-400 text-slate-900 resize-none"
                />
              </div>

              <div className="pt-4 flex gap-3">
                <Button
                  type="button"
                  variant="outline"
                  onClick={handleCloseModal}
                  className="flex-1 border-slate-200 text-slate-600 hover:bg-slate-50"
                  disabled={isSubmitting}
                >
                  Hủy
                </Button>
                <Button
                  type="submit"
                  disabled={isSubmitting || !formData.name.trim()}
                  className="flex-1 bg-amber-800 hover:bg-amber-900 text-white border-none"
                >
                  {isSubmitting ? "Đang lưu..." : (editingCategory ? "Cập nhật" : "Thêm mới")}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {isDeleteModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-6 animate-in fade-in zoom-in-95 duration-200">
            <div className="w-12 h-12 rounded-full bg-rose-100 text-rose-600 flex items-center justify-center mb-4 mx-auto">
              <Trash2 size={24} />
            </div>
            <h3 className="text-lg font-bold text-slate-800 text-center mb-2">Xóa danh mục này?</h3>
            <p className="text-sm text-slate-500 text-center mb-4">
              Lưu ý: Nếu danh mục còn sản phẩm, hệ thống sẽ không cho phép xoá.
            </p>

            <div className="flex gap-3">
              <Button
                type="button"
                variant="outline"
                onClick={handleCloseDeleteModal}
                className="flex-1"
                disabled={isSubmitting}
              >
                Hủy
              </Button>
              <Button
                type="button"
                onClick={handleDelete}
                disabled={isSubmitting}
                className="flex-1 bg-rose-600 hover:bg-rose-700 text-white border-none"
              >
                {isSubmitting ? "Đang xóa..." : "Xóa ngay"}
              </Button>
            </div>
          </div>
        </div>
      )}
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
