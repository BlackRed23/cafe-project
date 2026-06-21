import React, { useState, useEffect, useCallback } from "react";
import { useNavigate, useParams, Link } from "react-router-dom";
import { productsApi } from "../../api/products.api";
import { categoriesApi } from "../../api/categories.api";
import { uploadApi } from "../../api/upload.api";
import type { Category } from "../../types/category.types";
import { Input } from "../../components/common/Input";
import { Button } from "../../components/common/Button";
import { Loading } from "../../components/common/Loading";
import { getErrorMessage } from "../../api/client";
import { AlertOctagon, AlertTriangle, ArrowLeft, CheckCircle, Save, Image, Info, UploadCloud, X } from "lucide-react";
import { ALLOWED_PRODUCT_UNITS, isAllowedProductUnit } from "../../constants/units";

const MAX_IMAGE_SIZE = 5 * 1024 * 1024;
const TOAST_DURATION = 5000;

type ToastType = "success" | "error" | "warning" | "info";

interface Toast {
  id: string;
  type: ToastType;
  message: string;
}

let toastId = 0;

const toastStyles: Record<ToastType, { bg: string; border: string; text: string; icon: React.ReactNode }> = {
  success: {
    bg: "bg-emerald-50",
    border: "border-emerald-300",
    text: "text-emerald-900",
    icon: <CheckCircle size={18} className="text-emerald-600 shrink-0" />,
  },
  error: {
    bg: "bg-rose-50",
    border: "border-rose-300",
    text: "text-rose-900",
    icon: <AlertOctagon size={18} className="text-rose-600 shrink-0" />,
  },
  warning: {
    bg: "bg-amber-50",
    border: "border-amber-300",
    text: "text-amber-900",
    icon: <AlertTriangle size={18} className="text-amber-600 shrink-0" />,
  },
  info: {
    bg: "bg-sky-50",
    border: "border-sky-300",
    text: "text-sky-900",
    icon: <Info size={18} className="text-sky-600 shrink-0" />,
  },
};

export const AdminProductFormPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const isEdit = !!id;

  const [categories, setCategories] = useState<Category[]>([]);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [price, setPrice] = useState<number>(NaN);
  const [unit, setUnit] = useState("hộp");
  const [imageUrl, setImageUrl] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [isActive, setIsActive] = useState(true);
  const [selectedImageName, setSelectedImageName] = useState("");
  const [imageUploadError, setImageUploadError] = useState<string | null>(null);
  const [isUploadingImage, setIsUploadingImage] = useState(false);

  const [errors, setErrors] = useState<{ name?: string; price?: string; unit?: string; categoryId?: string }>({});
  const [apiError, setApiError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isFetching, setIsFetching] = useState(false);
  const [toasts, setToasts] = useState<Toast[]>([]);

  const removeToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((toast) => toast.id !== id));
  }, []);

  const addToast = useCallback((type: ToastType, message: string) => {
    const id = `product-toast-${++toastId}`;

    setToasts((prev) => {
      if (prev.some((toast) => toast.type === type && toast.message === message)) {
        return prev;
      }

      return [...prev, { id, type, message }];
    });

    window.setTimeout(() => removeToast(id), TOAST_DURATION);
  }, [removeToast]);

  useEffect(() => {
    const fetchCategories = async () => {
      try {
        const data = await categoriesApi.getCategories();
        setCategories(data);
      } catch (err) {
        console.error(err);
        addToast("error", getErrorMessage(err));
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
          setUnit(isAllowedProductUnit(product.unit) ? product.unit : "");
          setImageUrl(product.image_url || product.imageUrl || "");
          setSelectedImageName("");
          setImageUploadError(null);
          setCategoryId(product.category_id || product.categoryId || "");
          setIsActive(product.isActive !== false);
        } catch (err) {
          const message = getErrorMessage(err) || "Không thể tải thông tin sản phẩm.";
          setApiError(message);
          addToast("error", message);
        } finally {
          setIsFetching(false);
        }
      };
      fetchProductDetails();
    }
  }, [id, isEdit, addToast]);

  const handleImageChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";

    if (!file) return;

    setImageUploadError(null);

    if (!file.type.startsWith("image/")) {
      const message = "Vui lòng chọn file hình ảnh hợp lệ.";
      setSelectedImageName("");
      setImageUploadError(message);
      addToast("error", message);
      return;
    }

    if (file.size > MAX_IMAGE_SIZE) {
      const message = "Ảnh quá lớn, vui lòng chọn ảnh nhỏ hơn 5MB.";
      setSelectedImageName("");
      setImageUploadError(message);
      addToast("error", message);
      return;
    }

    setSelectedImageName(file.name);
    setIsUploadingImage(true);
    addToast("info", "Đang upload ảnh...");

    try {
      const uploadedUrl = await uploadApi.uploadImage(file);
      setImageUrl(uploadedUrl);
      addToast("success", "Upload ảnh thành công.");
    } catch (err) {
      const message = getErrorMessage(err) || "Upload ảnh thất bại, vui lòng thử lại.";
      setImageUploadError(message);
      addToast("error", message);
    } finally {
      setIsUploadingImage(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setApiError(null);
    const newErrors: typeof errors = {};

    if (isUploadingImage) {
      const message = "Vui lòng đợi upload ảnh hoàn tất trước khi lưu sản phẩm.";
      setApiError(message);
      addToast("warning", message);
      return;
    }

    let validationToast: string | null = null;

    if (!name.trim()) {
      newErrors.name = "Tên sản phẩm không được để trống";
      validationToast = "Vui lòng nhập tên sản phẩm.";
    }

    if (Number.isNaN(price)) {
      newErrors.price = "Vui lòng nhập giá sản phẩm";
      validationToast = validationToast || "Vui lòng nhập giá sản phẩm.";
    } else if (price <= 0) {
      newErrors.price = "Giá sản phẩm phải lớn hơn 0";
      validationToast = validationToast || "Giá sản phẩm phải lớn hơn 0.";
    }

    if (!unit.trim()) {
      newErrors.unit = "Đơn vị tính không được để trống";
    }

    if (!categoryId) {
      newErrors.categoryId = "Vui lòng chọn danh mục sản phẩm";
      validationToast = validationToast || "Vui lòng chọn danh mục sản phẩm.";
    }

    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors);
      if (validationToast) addToast("error", validationToast);
      return;
    }

    setErrors({});
    setIsLoading(true);
    addToast("info", "Đang lưu sản phẩm...");

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
      const successMessage = isEdit ? "Cập nhật sản phẩm thành công." : "Tạo sản phẩm thành công.";

      if (isEdit && id) {
        await productsApi.updateProduct(id, payload);
      } else {
        await productsApi.createProduct(payload);
      }

      addToast("success", successMessage);
      window.setTimeout(() => navigate("/admin/products"), 700);
    } catch (err: any) {
      const message = getErrorMessage(err) || "Không thể lưu sản phẩm, vui lòng thử lại.";
      setApiError(message);
      addToast("error", message);
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
                value={Number.isNaN(price) ? "" : price}
                onChange={(e) => setPrice(e.target.value === "" ? NaN : Number(e.target.value))}
                error={errors.price}
              />
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">
                  Đơn vị bán
                </label>
                <select
                  value={unit}
                  onChange={(e) => setUnit(e.target.value)}
                  className="block w-full px-3.5 py-2.5 rounded-lg border border-slate-300 text-slate-900 bg-white text-sm outline-none focus:ring-2 focus:ring-amber-700/20 focus:border-amber-700"
                >
                  <option value="">Chọn đơn vị bán</option>
                  {ALLOWED_PRODUCT_UNITS.map((item) => (
                    <option key={item} value={item}>
                      {item}
                    </option>
                  ))}
                </select>
                {errors.unit && <p className="mt-1 text-xs text-rose-600 font-medium">{errors.unit}</p>}
                {!unit && isEdit && (
                  <p className="mt-1 text-xs text-amber-700 font-medium">
                    Đơn vị cũ không còn được khuyến nghị. Vui lòng chọn đơn vị mới.
                  </p>
                )}
              </div>
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
                {errors.categoryId && <p className="mt-1 text-xs text-rose-600 font-medium">{errors.categoryId}</p>}
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">
                  <span className="flex items-center gap-1.5">
                    <Image size={13} className="text-slate-400" />
                    Hình ảnh sản phẩm
                  </span>
                </label>
                <label className="inline-flex items-center gap-2 px-3.5 py-2.5 rounded-lg border border-slate-300 bg-white text-sm font-semibold text-slate-700 hover:bg-slate-50 cursor-pointer transition-colors">
                  <UploadCloud size={16} className="text-amber-700" />
                  {isUploadingImage ? "Đang upload..." : "Chọn hình ảnh"}
                  <input
                    type="file"
                    accept="image/*"
                    onChange={handleImageChange}
                    className="sr-only"
                    disabled={isUploadingImage}
                  />
                </label>
                {selectedImageName && (
                  <p className="mt-2 text-xs text-slate-500">
                    File đã chọn: <span className="font-medium text-slate-700">{selectedImageName}</span>
                  </p>
                )}
                {imageUploadError && (
                  <div className="mt-2 p-3 bg-rose-50 border border-rose-200 text-rose-800 text-xs rounded-lg flex items-center gap-2">
                    <Info size={14} className="flex-shrink-0" />
                    {imageUploadError}
                  </div>
                )}
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
              <Button type="submit" isLoading={isLoading} disabled={isUploadingImage} className="flex items-center gap-1.5">
                <Save size={15} /> {isEdit ? "Cập nhật sản phẩm" : "Lưu sản phẩm"}
              </Button>
            </div>
          </form>
        </div>
      </div>
      {toasts.length > 0 && (
        <div className="fixed top-4 right-4 z-50 flex w-[min(360px,calc(100vw-2rem))] flex-col gap-3">
          {toasts.map((toast) => {
            const style = toastStyles[toast.type];
            return (
              <div
                key={toast.id}
                className={`flex items-start gap-3 rounded-xl border ${style.border} ${style.bg} ${style.text} px-4 py-3 text-sm font-medium shadow-lg`}
              >
                {style.icon}
                <span className="flex-1">{toast.message}</span>
                <button
                  type="button"
                  onClick={() => removeToast(toast.id)}
                  className="rounded-md p-0.5 opacity-70 transition hover:bg-white/60 hover:opacity-100"
                  aria-label="Đóng thông báo"
                >
                  <X size={16} />
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
