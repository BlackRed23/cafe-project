import React, { useState, useEffect, useCallback, useRef } from "react";
import { useNavigate, useParams, Link } from "react-router-dom";
import { RecipeManager } from "../../features/recipes/RecipeManager";
import { productsApi } from "../../api/products.api";
import { categoriesApi } from "../../api/categories.api";
import { uploadApi } from "../../api/upload.api";
import type { Category } from "../../types/category.types";
import { Input } from "../../components/common/Input";
import { Button } from "../../components/common/Button";
import { Loading } from "../../components/common/Loading";
import { useToast } from "../../contexts/ToastContext";
import { Alert } from "../../components/common/Alert";
import { ConfirmDialog } from "../../components/common/ConfirmDialog";
import { productFailure, validateProduct } from "./productFeedback";
import "./products.css";
import { formatCurrency } from "../../utils/formatCurrency";
import {
  ArrowLeft,
  Save,
  Image,
  Info,
  UploadCloud,
} from "lucide-react";
import { ALLOWED_PRODUCT_UNITS, isAllowedProductUnit } from "../../constants/units";

const MAX_IMAGE_SIZE = 5 * 1024 * 1024;
export const AdminProductFormPage: React.FC = () => <LegacyAdminProductFormPage />;

const LegacyAdminProductFormPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const isEdit = !!id;

  const [categories, setCategories] = useState<Category[]>([]);
  const [sku, setSku] = useState("");
  const [requiresRecipe, setRequiresRecipe] = useState<boolean | null>(null);
  const [needsReload, setNeedsReload] = useState(false);
  const [confirmReload, setConfirmReload] = useState(false);
  const submitLock = useRef(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [price, setPrice] = useState<number>(NaN);
  const [costPrice, setCostPrice] = useState<number>(0);
  const [unit, setUnit] = useState("hộp");
  const [imageUrl, setImageUrl] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [isActive, setIsActive] = useState(false);
  const [expectedUpdatedAt, setExpectedUpdatedAt] = useState<string>();
  const [nutritionFacts, setNutritionFacts] = useState("");
  const [usageInstructions, setUsageInstructions] = useState("");
  const [storageInstructions, setStorageInstructions] = useState("");
  const [origin, setOrigin] = useState("");
  const [certifications, setCertifications] = useState("");
  const [expiryInfo, setExpiryInfo] = useState("");
  const [selectedImageName, setSelectedImageName] = useState("");
  const [imageUploadError, setImageUploadError] = useState<string | null>(null);
  const [isUploadingImage, setIsUploadingImage] = useState(false);

  const [isSavingRecipe, setIsSavingRecipe] = useState(false);

  const [errors, setErrors] = useState<ReturnType<typeof validateProduct>>({});
  const [apiError, setApiError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isSaved, setIsSaved] = useState(false);
  const [isFetching, setIsFetching] = useState(false);
  const toast = useToast();
  const addToast = useCallback((type: 'success' | 'error' | 'warning' | 'info', message: string) => toast[type](message), [toast]);

  useEffect(() => {
    const fetchCategories = async () => {
      try {
        const data = await categoriesApi.getCategories();
        setCategories(data);
      } catch (err) {
        console.error(err);
        addToast("error", productFailure(err).message);
      }
    };
    fetchCategories();

    if (isEdit && id) {
      const fetchProductDetails = async () => {
        setIsFetching(true);
        try {
          const product = await productsApi.getProductById(id);
          setExpectedUpdatedAt(product.updatedAt);
          setName(product.name);
          setSku(product.sku ?? "");
          setRequiresRecipe(product.requiresRecipe ?? null);
          setDescription(product.description || "");
          setPrice(product.price);
          setCostPrice(product.costPrice ?? 0);
          setUnit(isAllowedProductUnit(product.unit) ? product.unit : "");
          setImageUrl(product.image_url || product.imageUrl || "");
          setSelectedImageName("");
          setImageUploadError(null);
          setCategoryId(product.category_id || product.categoryId || "");
          setIsActive(product.isActive === true);
          setNutritionFacts(product.nutrition_facts || product.nutritionFacts || "");
          setUsageInstructions(product.usage_instructions || product.usageInstructions || "");
          setStorageInstructions(product.storage_instructions || product.storageInstructions || "");
          setOrigin(product.origin || "");
          setCertifications(product.certifications || "");
          setExpiryInfo(product.expiry_info || product.expiryInfo || "");


        } catch (err) {
          const message = productFailure(err, "read").message;
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
      const message = productFailure(err).message || "Upload ảnh thất bại, vui lòng thử lại.";
      setImageUploadError(message);
      addToast("error", message);
    } finally {
      setIsUploadingImage(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submitLock.current || needsReload || (isEdit && !expectedUpdatedAt)) return;
    setApiError(null);
    if (isUploadingImage) {
      addToast('warning', 'Vui lòng đợi tải ảnh hoàn tất trước khi lưu.');
      return;
    }
    const newErrors = validateProduct({ name, sku, description, price, unit, categoryId, requiresRecipe, isActive });
    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors);
      addToast("error", "Vui lòng kiểm tra các trường được đánh dấu.");
      return;
    }

    setErrors({});
    submitLock.current = true;
    setIsLoading(true);
    addToast("info", "Đang lưu sản phẩm...");

    const payload = {
      name: name.trim(),
      sku: sku.trim(),
      ...(requiresRecipe === null ? {} : { requiresRecipe }),
      description: description.trim(),
      price,
      unit,
      image_url: imageUrl.trim(),
      imageUrl: imageUrl.trim(),
      category_id: categoryId || undefined,
      categoryId: categoryId || undefined,
      isActive,
      nutritionFacts: nutritionFacts.trim(),
      usageInstructions: usageInstructions.trim(),
      storageInstructions: storageInstructions.trim(),
      origin: origin.trim(),
      certifications: certifications.trim(),
      expiryInfo: expiryInfo.trim(),
    };

    let confirmed = false;
    try {
      const successMessage = isEdit ? "Cập nhật sản phẩm thành công." : "Tạo sản phẩm thành công.";

      if (isEdit && id) {
        const saved = await productsApi.updateProduct(id, { ...payload, expectedUpdatedAt: expectedUpdatedAt! });
        setExpectedUpdatedAt(saved.updatedAt);
      } else {
        await productsApi.createProduct(payload);
      }

      confirmed = true;
      setIsSaved(true);
      addToast("success", successMessage);
      window.setTimeout(() => navigate("/admin/products"), 700);
    } catch (err: unknown) {
      const failure = productFailure(err);
      if (failure.kind === "stale") setNeedsReload(true);
      if (failure.kind === "sku") setErrors(previous => ({ ...previous, sku: failure.message }));
      const message = failure.message;
      setApiError(message);
      addToast("error", message);
    } finally {
      submitLock.current = confirmed;
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
    <div className="product-workspace product-form max-w-4xl mx-auto flex flex-col gap-6 pb-12">
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
        <div className="px-6 py-5 border-b border-slate-100 bg-slate-50/50 flex items-center justify-between">
          <div>
            <h3 className="text-lg font-bold text-slate-800">
              {isEdit ? "Cập nhật sản phẩm" : "Thêm sản phẩm mới"}
            </h3>
            <p className="text-xs text-slate-400 mt-0.5">
              {isEdit ? "Chỉnh sửa thông tin sản phẩm & công thức giá vốn" : "Điền thông tin để thêm sản phẩm vào hệ thống"}
            </p>
          </div>
          {isEdit && (
            <div className="text-right">
              <span className="text-[11px] text-slate-400 block">Giá vốn hiện tại</span>
              <span className="text-base font-black text-amber-800">
                {formatCurrency(costPrice)} / {unit || "ly"}
              </span>
            </div>
          )}
        </div>

        <div className="p-6 sm:p-8">
          {apiError && <Alert tone="danger" title="Chưa thể lưu sản phẩm">{apiError}</Alert>}
          {(needsReload || (isEdit && !expectedUpdatedAt)) && (
            <Alert tone="warning" title="Cần tải lại dữ liệu">
              Công thức hoặc sản phẩm có thể đã thay đổi. Sao chép nội dung cần giữ trước khi tải lại.
              <Button type="button" variant="outline" onClick={() => setConfirmReload(true)}>Tải lại dữ liệu</Button>
            </Alert>
          )}
          <form onSubmit={handleSubmit} className="space-y-5" noValidate>
            <fieldset disabled={isLoading || isSaved || isSavingRecipe || isUploadingImage} className="space-y-5">
            <Input
              label="Tên sản phẩm"
              maxLength={255}
              required
              placeholder="Cà Phê Espresso Blend..."
              value={name}
              onChange={(e) => setName(e.target.value)}
              error={errors.name}
            />

            <Input label="Mã SKU" value={sku} maxLength={100} onChange={e => setSku(e.target.value)} error={errors.sku} placeholder="Để trống để tự tạo mã" />
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">
                Mô tả chi tiết
              </label>
              <textarea
                rows={3}
                maxLength={1000}
                aria-label="Mô tả chi tiết"
                aria-invalid={!!errors.description}
                aria-describedby={errors.description ? "product-description-error" : undefined}
                placeholder="Hương vị thơm ngon, rang xay nguyên chất..."
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                className="block w-full px-3.5 py-2.5 rounded-lg border border-slate-300 text-sm transition-colors duration-200 outline-none focus:ring-2 focus:ring-amber-700/20 focus:border-amber-700 placeholder-slate-400 text-slate-900 resize-none"
              />
            </div>

            {errors.description && <p id="product-description-error" className="ds-field-error">{errors.description}</p>}
            <div className="grid sm:grid-cols-2 gap-4">
              <Input
                label="Giá bán (VND)"
                type="number"
                min="0"
                max="9999999999.99"
                step="0.01"
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
                  aria-label="Đơn vị bán"
                  aria-invalid={!!errors.unit}
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
                  aria-label="Danh mục sản phẩm"
                  aria-invalid={!!errors.categoryId}
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

            <div>
              <label htmlFor="product-recipe-class" className="ds-label">Phân loại công thức</label>
              <select id="product-recipe-class" value={requiresRecipe === null ? 'unreviewed' : String(requiresRecipe)} onChange={e => setRequiresRecipe(e.target.value === 'unreviewed' ? null : e.target.value === 'true')} aria-invalid={!!errors.requiresRecipe} aria-describedby="product-recipe-help">
                <option value="unreviewed" disabled={requiresRecipe !== null}>Chưa đánh giá</option>
                <option value="true">Cần công thức</option>
                <option value="false">Không cần công thức</option>
              </select>
              <p id="product-recipe-help" className="product-help">{errors.requiresRecipe || 'Chưa đánh giá không đồng nghĩa với không cần công thức. Sản phẩm cần công thức phải có đúng một công thức hợp lệ trước khi bật bán.'}</p>
            </div>
            {/* Active toggle */}
            <div className="flex items-center gap-3 p-4 bg-slate-50 rounded-xl border border-slate-100">
              <label className="relative inline-flex items-center cursor-pointer">
                <input
                  type="checkbox"
                  id="isActive"
                  checked={isActive}
                  disabled={requiresRecipe === null && !isActive}
                  onChange={(e) => setIsActive(e.target.checked)}
                  className="sr-only peer"
                />
                <div className="w-10 h-5.5 bg-slate-200 peer-focus:ring-2 peer-focus:ring-amber-700/20 rounded-full peer peer-checked:bg-amber-700 peer-checked:after:translate-x-full after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border after:rounded-full after:h-4.5 after:w-4.5 after:transition-all" />
              </label>
              <label htmlFor="isActive" className="text-sm font-medium text-slate-700 cursor-pointer">
                Bật bán · máy chủ kiểm tra điều kiện công thức
              </label>
              <span className={`ml-auto text-xs font-semibold px-2 py-0.5 rounded-full ${isActive ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-500"}`}>
                {isActive ? "Đang bán" : "Ngưng bán"}
              </span>
            </div>

            {/* Additional details section */}
            <div className="pt-6 border-t border-slate-200/80 space-y-5">
              <div>
                <h4 className="text-base font-bold text-slate-900 font-serif">
                  Thông tin chi tiết sản phẩm (không bắt buộc)
                </h4>
                <p className="text-xs text-slate-500 mt-1">
                  Bổ sung các thông tin mở rộng giúp khách hàng hiểu rõ hơn về nguồn gốc, cách sử dụng và bảo quản sản phẩm.
                </p>
              </div>

              <div className="grid md:grid-cols-2 gap-5">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1.5">
                    Thành phần dinh dưỡng (Nutrition Facts)
                  </label>
                  <textarea
                    rows={2}
                    placeholder="VD: Năng lượng: 120 kcal, Chất béo: 3.5g, Đường: 18g, Protein: 2.1g / lon 240ml..."
                    value={nutritionFacts}
                    onChange={(e) => setNutritionFacts(e.target.value)}
                    className="block w-full px-3.5 py-2.5 rounded-lg border border-slate-300 text-sm outline-none focus:ring-2 focus:ring-amber-700/20 focus:border-amber-700 text-slate-900 resize-none transition-colors"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1.5">
                    Hướng dẫn sử dụng (Usage Instructions)
                  </label>
                  <textarea
                    rows={2}
                    placeholder="VD: Khuấy đều cùng đá tươi trước khi uống. Hoặc dùng nóng ở nhiệt độ 90-95°C..."
                    value={usageInstructions}
                    onChange={(e) => setUsageInstructions(e.target.value)}
                    className="block w-full px-3.5 py-2.5 rounded-lg border border-slate-300 text-sm outline-none focus:ring-2 focus:ring-amber-700/20 focus:border-amber-700 text-slate-900 resize-none transition-colors"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1.5">
                    Hướng dẫn bảo quản (Storage Instructions)
                  </label>
                  <textarea
                    rows={2}
                    placeholder="VD: Nên dùng ngay sau khi pha chế. Bảo quản trong ngăn mát tủ lạnh 2-8°C không quá 4 giờ..."
                    value={storageInstructions}
                    onChange={(e) => setStorageInstructions(e.target.value)}
                    className="block w-full px-3.5 py-2.5 rounded-lg border border-slate-300 text-sm outline-none focus:ring-2 focus:ring-amber-700/20 focus:border-amber-700 text-slate-900 resize-none transition-colors"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1.5">
                    Hạn sử dụng & Khuyên dùng (Expiry Info)
                  </label>
                  <textarea
                    rows={2}
                    placeholder="VD: Sử dụng trong ngày kể từ khi pha chế. Hoặc 12 tháng kể từ ngày sản xuất đối với hạt/lon..."
                    value={expiryInfo}
                    onChange={(e) => setExpiryInfo(e.target.value)}
                    className="block w-full px-3.5 py-2.5 rounded-lg border border-slate-300 text-sm outline-none focus:ring-2 focus:ring-amber-700/20 focus:border-amber-700 text-slate-900 resize-none transition-colors"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1.5">
                    Nguồn gốc / Xuất xứ (Place of Origin)
                  </label>
                  <textarea
                    rows={2}
                    placeholder="VD: Đà Lạt, Lâm Đồng, Việt Nam (Nông trại Cầu Đất) hoặc Nhập khẩu Ý/Nhật Bản..."
                    value={origin}
                    onChange={(e) => setOrigin(e.target.value)}
                    className="block w-full px-3.5 py-2.5 rounded-lg border border-slate-300 text-sm outline-none focus:ring-2 focus:ring-amber-700/20 focus:border-amber-700 text-slate-900 resize-none transition-colors"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1.5">
                    Tiêu chuẩn & Chứng nhận (Certifications)
                  </label>
                  <textarea
                    rows={2}
                    placeholder="VD: ISO 22000:2018, HACCP, VietGAP, Halal Certified..."
                    value={certifications}
                    onChange={(e) => setCertifications(e.target.value)}
                    className="block w-full px-3.5 py-2.5 rounded-lg border border-slate-300 text-sm outline-none focus:ring-2 focus:ring-amber-700/20 focus:border-amber-700 text-slate-900 resize-none transition-colors"
                  />
                </div>
              </div>
            </div>

            {/* Actions */}
            <div className="pt-4 border-t border-slate-100 flex justify-end gap-3">
              <Link to="/admin/products">
                <Button type="button" variant="outline">
                  Hủy
                </Button>
              </Link>
              <Button type="submit" isLoading={isLoading} disabled={isUploadingImage || isSavingRecipe || needsReload || (isEdit && !expectedUpdatedAt)} className="flex items-center gap-1.5">
                <Save size={15} /> {isEdit ? "Cập nhật sản phẩm" : "Lưu sản phẩm"}
              </Button>
            </div>
            </fieldset>
          </form>
        </div>
      </div>

      {isEdit && id && <RecipeManager key={id} productId={id} productName={name} disabled={isLoading || isSaved || isUploadingImage} onBusyChange={setIsSavingRecipe} onChanged={() => setNeedsReload(true)} />}

      <ConfirmDialog isOpen={confirmReload} onClose={() => setConfirmReload(false)} onConfirm={() => window.location.reload()} title="Tải lại sản phẩm?" message="Nội dung chưa lưu sẽ bị thay thế bằng dữ liệu mới nhất. Hãy sao chép nội dung cần giữ trước khi tiếp tục." confirmText="Tải lại" />

    </div>
  );
};
