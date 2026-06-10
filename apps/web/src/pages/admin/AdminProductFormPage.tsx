import React, { useState, useEffect } from "react";
import { useNavigate, useParams, Link } from "react-router-dom";
import { productsApi } from "../../api/products.api";
import { categoriesApi } from "../../api/categories.api";
import type { Category } from "../../types/category.types";
import { Input } from "../../components/common/Input";
import { Button } from "../../components/common/Button";
import { Loading } from "../../components/common/Loading";
import { getErrorMessage } from "../../api/client";
import { ArrowLeft, Save, Image, Info } from "lucide-react";

export const AdminProductFormPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const isEdit = !!id;

  const [categories, setCategories] = useState<Category[]>([]);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [price, setPrice] = useState<number>(0);
  const [unit, setUnit] = useState("hộp");
  const [imageUrl, setImageUrl] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [isActive, setIsActive] = useState(true);

  const [errors, setErrors] = useState<{ name?: string; price?: string; unit?: string }>({});
  const [apiError, setApiError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isFetching, setIsFetching] = useState(false);

  useEffect(() => {
    const fetchCategories = async () => {
      try {
        const data = await categoriesApi.getCategories();
        setCategories(data);
      } catch (err) {
        console.error(err);
      }
    };
    fetchCategories();

    if (isEdit && id) {
      const fetchProductDetails = async () => {
        setIsFetching(true);
        try {
          const product = await productsApi.getProductById(id);
          setName(product.name);
          setDescription(product.description || "");
          setPrice(product.price);
          setUnit(product.unit);
          setImageUrl(product.image_url || product.imageUrl || "");
          setCategoryId(product.category_id || product.categoryId || "");
          setIsActive(product.isActive !== false);
        } catch {
          setApiError("Không thể tải thông tin sản phẩm.");
        } finally {
          setIsFetching(false);
        }
      };
      fetchProductDetails();
    }
  }, [id, isEdit]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setApiError(null);
    const newErrors: typeof errors = {};

    if (!name.trim()) newErrors.name = "Tên sản phẩm không được để trống";
    if (price <= 0) newErrors.price = "Giá sản phẩm phải lớn hơn 0";
    if (!unit.trim()) newErrors.unit = "Đơn vị tính không được để trống";

    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors);
      return;
    }

    setErrors({});
    setIsLoading(true);

    const payload = {
      name,
      description: description.trim() || undefined,
      price,
      unit,
      image_url: imageUrl.trim() || undefined,
      imageUrl: imageUrl.trim() || undefined,
      category_id: categoryId || undefined,
      categoryId: categoryId || undefined,
      isActive,
    };

    try {
      if (isEdit && id) {
        await productsApi.updateProduct(id, payload);
      } else {
        await productsApi.createProduct(payload);
      }
      navigate("/admin/products");
    } catch (err: any) {
      setApiError(getErrorMessage(err));
    } finally {
      setIsLoading(false);
    }
  };

  if (isFetching) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loading message="Đang tải dữ liệu sản phẩm..." />
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto flex flex-col gap-6">
      {/* Back link */}
      <div>
        <Link
          to="/admin/products"
          className="inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-900 transition-colors font-medium"
        >
          <ArrowLeft size={16} />
          Quay lại danh sách sản phẩm
        </Link>
      </div>

      <div className="bg-white border border-slate-200/80 rounded-2xl shadow-sm overflow-hidden">
        {/* Card Header */}
        <div className="px-6 py-5 border-b border-slate-100 bg-slate-50/50">
          <h3 className="text-lg font-bold text-slate-800">
            {isEdit ? "Cập nhật sản phẩm" : "Thêm sản phẩm mới"}
          </h3>
          <p className="text-xs text-slate-400 mt-0.5">
            {isEdit ? "Chỉnh sửa thông tin sản phẩm hiện có" : "Điền thông tin để thêm sản phẩm vào hệ thống"}
          </p>
        </div>

        <div className="p-6 sm:p-8">
          {apiError && (
            <div className="mb-6 p-4 bg-rose-50 border border-rose-200 text-rose-800 text-sm font-medium rounded-xl flex items-center gap-2">
              <Info size={16} className="flex-shrink-0" />
              {apiError}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-5">
            <Input
              label="Tên sản phẩm"
              placeholder="Cà Phê Espresso Blend..."
              value={name}
              onChange={(e) => setName(e.target.value)}
              error={errors.name}
            />

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">
                Mô tả chi tiết
              </label>
              <textarea
                rows={3}
                placeholder="Hương vị thơm ngon, rang xay nguyên chất..."
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                className="block w-full px-3.5 py-2.5 rounded-lg border border-slate-300 text-sm transition-colors duration-200 outline-none focus:ring-2 focus:ring-amber-700/20 focus:border-amber-700 placeholder-slate-400 text-slate-900 resize-none"
              />
            </div>

            <div className="grid sm:grid-cols-2 gap-4">
              <Input
                label="Giá bán (VND)"
                type="number"
                placeholder="120000"
                value={price || ""}
                onChange={(e) => setPrice(parseFloat(e.target.value) || 0)}
                error={errors.price}
              />
              <Input
                label="Đơn vị tính"
                placeholder="hộp / bịch / túi..."
                value={unit}
                onChange={(e) => setUnit(e.target.value)}
                error={errors.unit}
              />
            </div>

            <div className="grid sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">
                  Danh mục
                </label>
                <select
                  value={categoryId}
                  onChange={(e) => setCategoryId(e.target.value)}
                  className="block w-full px-3.5 py-2.5 rounded-lg border border-slate-300 text-slate-900 bg-white text-sm outline-none focus:ring-2 focus:ring-amber-700/20 focus:border-amber-700"
                >
                  <option value="">Chọn danh mục</option>
                  {categories.map((cat) => (
                    <option key={cat.id} value={cat.id}>
                      {cat.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">
                  <span className="flex items-center gap-1.5">
                    <Image size={13} className="text-slate-400" />
                    Đường dẫn ảnh (URL)
                  </span>
                </label>
                <input
                  type="url"
                  placeholder="https://domain.com/photo.jpg"
                  value={imageUrl}
                  onChange={(e) => setImageUrl(e.target.value)}
                  className="block w-full px-3.5 py-2.5 rounded-lg border border-slate-300 text-sm outline-none focus:ring-2 focus:ring-amber-700/20 focus:border-amber-700 placeholder-slate-400 text-slate-900"
                />
                {imageUrl && (
                  <img
                    src={imageUrl}
                    alt="Preview"
                    className="mt-2 w-16 h-16 rounded-xl object-cover border border-slate-100"
                    onError={(e) => {
                      (e.currentTarget as HTMLImageElement).style.display = "none";
                    }}
                  />
                )}
              </div>
            </div>

            {/* Active toggle */}
            <div className="flex items-center gap-3 p-4 bg-slate-50 rounded-xl border border-slate-100">
              <label className="relative inline-flex items-center cursor-pointer">
                <input
                  type="checkbox"
                  id="isActive"
                  checked={isActive}
                  onChange={(e) => setIsActive(e.target.checked)}
                  className="sr-only peer"
                />
                <div className="w-10 h-5.5 bg-slate-200 peer-focus:ring-2 peer-focus:ring-amber-700/20 rounded-full peer peer-checked:bg-amber-700 peer-checked:after:translate-x-full after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border after:rounded-full after:h-4.5 after:w-4.5 after:transition-all" />
              </label>
              <label htmlFor="isActive" className="text-sm font-medium text-slate-700 cursor-pointer">
                Sẵn sàng bán (Active)
              </label>
              <span className={`ml-auto text-xs font-semibold px-2 py-0.5 rounded-full ${isActive ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-500"}`}>
                {isActive ? "Đang bán" : "Ngưng bán"}
              </span>
            </div>

            {/* Actions */}
            <div className="pt-4 border-t border-slate-100 flex justify-end gap-3">
              <Link to="/admin/products">
                <Button type="button" variant="outline">
                  Hủy
                </Button>
              </Link>
              <Button type="submit" isLoading={isLoading} className="flex items-center gap-1.5">
                <Save size={15} /> {isEdit ? "Cập nhật sản phẩm" : "Lưu sản phẩm"}
              </Button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
};
