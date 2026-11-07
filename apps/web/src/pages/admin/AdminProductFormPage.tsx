import React, { useState, useEffect, useCallback } from "react";
import { useNavigate, useParams, Link } from "react-router-dom";
import { productsApi } from "../../api/products.api";
import { categoriesApi } from "../../api/categories.api";
import { uploadApi } from "../../api/upload.api";
import { ingredientsApi } from "../../api/ingredients.api";
import { recipesApi } from "../../api/recipes.api";
import type { Category } from "../../types/category.types";
import type { Ingredient } from "../../types/ingredient.types";
import type { Recipe, PreviewRecipeCostResponse } from "../../types/recipe.types";
import { Input } from "../../components/common/Input";
import { Button } from "../../components/common/Button";
import { Loading } from "../../components/common/Loading";
import { getErrorMessage } from "../../api/client";
import { formatCurrency } from "../../utils/formatCurrency";
import { formatDate } from "../../utils/formatDate";
import {
  AlertOctagon,
  AlertTriangle,
  ArrowLeft,
  CheckCircle,
  Save,
  Image,
  Info,
  UploadCloud,
  X,
  Plus,
  Trash2,
  FlaskConical,
  History,
} from "lucide-react";
import { ALLOWED_PRODUCT_UNITS, isAllowedProductUnit } from "../../constants/units";

const MAX_IMAGE_SIZE = 5 * 1024 * 1024;
const TOAST_DURATION = 5000;

type ToastType = "success" | "error" | "warning" | "info";

interface Toast {
  id: string;
  type: ToastType;
  message: string;
}

interface EditableRecipeItem {
  ingredientId: string;
  quantity: number;
  unit: string;
  isOptional: boolean;
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
  const [costPrice, setCostPrice] = useState<number>(0);
  const [unit, setUnit] = useState("hộp");
  const [imageUrl, setImageUrl] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [isActive, setIsActive] = useState(true);
  const [nutritionFacts, setNutritionFacts] = useState("");
  const [usageInstructions, setUsageInstructions] = useState("");
  const [storageInstructions, setStorageInstructions] = useState("");
  const [origin, setOrigin] = useState("");
  const [certifications, setCertifications] = useState("");
  const [expiryInfo, setExpiryInfo] = useState("");
  const [selectedImageName, setSelectedImageName] = useState("");
  const [imageUploadError, setImageUploadError] = useState<string | null>(null);
  const [isUploadingImage, setIsUploadingImage] = useState(false);

  // Recipe & Costing states (for isEdit)
  const [allIngredients, setAllIngredients] = useState<Ingredient[]>([]);
  const [recipeVersions, setRecipeVersions] = useState<Recipe[]>([]);
  const [recipeItems, setRecipeItems] = useState<EditableRecipeItem[]>([]);
  const [yieldQuantity, setYieldQuantity] = useState<number>(1);
  const [laborCost, setLaborCost] = useState<number>(0);
  const [overheadCost, setOverheadCost] = useState<number>(0);
  const [recipeNote, setRecipeNote] = useState<string>("");
  const [costPreview, setCostPreview] = useState<PreviewRecipeCostResponse | null>(null);
  const [isSavingRecipe, setIsSavingRecipe] = useState(false);

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

  const loadRecipeData = useCallback(async (productId: string) => {
    try {
      const [ingList, versions] = await Promise.all([
        ingredientsApi.getIngredients(),
        recipesApi.getRecipesByProduct(productId),
      ]);
      setAllIngredients(ingList);
      setRecipeVersions(versions);

      const active = versions.find((v) => v.isActive) || versions[0];
      if (active) {
        setYieldQuantity(active.yieldQuantity || 1);
        setLaborCost(active.laborCost || 0);
        setOverheadCost(active.overheadCost || 0);
        setRecipeNote(active.note || "");
        setRecipeItems(
          active.ingredients.map((ri) => ({
            ingredientId: ri.ingredientId,
            quantity: ri.quantity,
            unit: ri.unit,
            isOptional: ri.isOptional,
          }))
        );
      }
    } catch (err) {
      console.error("Failed to load recipe data:", err);
    }
  }, []);

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
          setCostPrice(product.costPrice ?? 0);
          setUnit(isAllowedProductUnit(product.unit) ? product.unit : "");
          setImageUrl(product.image_url || product.imageUrl || "");
          setSelectedImageName("");
          setImageUploadError(null);
          setCategoryId(product.category_id || product.categoryId || "");
          setIsActive(product.isActive !== false);
          setNutritionFacts(product.nutrition_facts || product.nutritionFacts || "");
          setUsageInstructions(product.usage_instructions || product.usageInstructions || "");
          setStorageInstructions(product.storage_instructions || product.storageInstructions || "");
          setOrigin(product.origin || "");
          setCertifications(product.certifications || "");
          setExpiryInfo(product.expiry_info || product.expiryInfo || "");

          await loadRecipeData(id);
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
  }, [id, isEdit, addToast, loadRecipeData]);

  // Realtime cost preview when recipe items or price/costs change
  useEffect(() => {
    if (!isEdit || !id) return;
    const validItems = recipeItems.filter(
      (it) => it.ingredientId && it.quantity > 0 && it.unit.trim()
    );
    if (validItems.length === 0) {
      setCostPreview(null);
      return;
    }

    const timer = window.setTimeout(async () => {
      try {
        const res = await recipesApi.previewRecipeCost(id, {
          yieldQuantity: yieldQuantity > 0 ? yieldQuantity : 1,
          laborCost: laborCost >= 0 ? laborCost : 0,
          overheadCost: overheadCost >= 0 ? overheadCost : 0,
          productPrice: Number.isNaN(price) ? 0 : price,
          ingredients: validItems,
        });
        setCostPreview(res);
      } catch {
        // Ignore transient validation errors while typing
      }
    }, 250);

    return () => window.clearTimeout(timer);
  }, [isEdit, id, recipeItems, yieldQuantity, laborCost, overheadCost, price]);

  const handleAddRecipeRow = () => {
    const firstAvailable = allIngredients.find(
      (ing) => !recipeItems.some((r) => r.ingredientId === ing.id)
    );
    setRecipeItems((prev) => [
      ...prev,
      {
        ingredientId: firstAvailable?.id || "",
        quantity: 20,
        unit: firstAvailable?.baseUnit || "g",
        isOptional: false,
      },
    ]);
  };

  const handleRemoveRecipeRow = (idx: number) => {
    setRecipeItems((prev) => prev.filter((_, i) => i !== idx));
  };

  const handleSaveRecipeVersion = async () => {
    if (!id) return;
    const validItems = recipeItems.filter(
      (it) => it.ingredientId && it.quantity > 0 && it.unit.trim()
    );
    if (validItems.length === 0) {
      addToast("error", "Công thức phải có ít nhất 1 nguyên liệu hợp lệ.");
      return;
    }

    setIsSavingRecipe(true);
    try {
      const saved = await recipesApi.createRecipeVersion(id, {
        yieldQuantity: yieldQuantity > 0 ? yieldQuantity : 1,
        laborCost: laborCost >= 0 ? laborCost : 0,
        overheadCost: overheadCost >= 0 ? overheadCost : 0,
        note: recipeNote.trim() || undefined,
        activate: true,
        ingredients: validItems,
      });
      setCostPrice(saved.costSummary.unitCost);
      addToast(
        "success",
        `Đã lưu công thức v${saved.version} và cập nhật giá vốn món: ${formatCurrency(saved.costSummary.unitCost)}`
      );
      await loadRecipeData(id);
    } catch (err) {
      addToast("error", getErrorMessage(err) || "Không thể lưu phiên bản công thức.");
    } finally {
      setIsSavingRecipe(false);
    }
  };

  const handleActivateVersion = async (recipeId: string) => {
    if (!id) return;
    try {
      const activated = await recipesApi.activateRecipeVersion(id, recipeId);
      setCostPrice(activated.costSummary.unitCost);
      addToast(
        "success",
        `Đã kích hoạt công thức v${activated.version} (Giá vốn: ${formatCurrency(activated.costSummary.unitCost)}).`
      );
      await loadRecipeData(id);
    } catch (err) {
      addToast("error", getErrorMessage(err) || "Không thể kích hoạt phiên bản công thức.");
    }
  };

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
      nutritionFacts: nutritionFacts.trim() || undefined,
      usageInstructions: usageInstructions.trim() || undefined,
      storageInstructions: storageInstructions.trim() || undefined,
      origin: origin.trim() || undefined,
      certifications: certifications.trim() || undefined,
      expiryInfo: expiryInfo.trim() || undefined,
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
    <div className="max-w-4xl mx-auto flex flex-col gap-6 pb-12">
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
              <Button type="submit" isLoading={isLoading} disabled={isUploadingImage} className="flex items-center gap-1.5">
                <Save size={15} /> {isEdit ? "Cập nhật sản phẩm" : "Lưu sản phẩm"}
              </Button>
            </div>
          </form>
        </div>
      </div>

      {/* ── SECTION: CÔNG THỨC & GIÁ VỐN (chỉ hiển thị khi Edit sản phẩm) ── */}
      {isEdit && id && (
        <div className="bg-white border border-slate-200/80 rounded-2xl shadow-sm overflow-hidden">
          <div className="px-6 py-5 border-b border-slate-100 bg-amber-50/40 flex flex-wrap items-center justify-between gap-3">
            <div>
              <h3 className="text-lg font-bold text-slate-800 flex items-center gap-2">
                <FlaskConical size={18} className="text-amber-800" />
                Công thức & Giá vốn nguyên liệu
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">
                Thiết lập định lượng nguyên liệu pha chế, tính giá vốn tự động và kiểm soát biên lợi nhuận
              </p>
            </div>
            <Button
              type="button"
              variant="outline"
              onClick={handleAddRecipeRow}
              className="flex items-center gap-1.5 text-xs"
            >
              <Plus size={14} /> Thêm dòng nguyên liệu
            </Button>
          </div>

          <div className="p-6 sm:p-8 space-y-6">
            {/* Ingredient rows */}
            {recipeItems.length === 0 ? (
              <div className="py-8 text-center border border-dashed border-slate-200 rounded-xl text-slate-400 text-sm">
                Sản phẩm này chưa có công thức nguyên liệu. Nhấn <b>Thêm dòng nguyên liệu</b> để bắt đầu tính giá vốn tự động.
              </div>
            ) : (
              <div className="space-y-3">
                {recipeItems.map((row, idx) => {
                  const selectedIng = allIngredients.find((i) => i.id === row.ingredientId);
                  const previewLine = costPreview?.breakdown?.[idx];
                  return (
                    <div
                      key={idx}
                      className="grid sm:grid-cols-12 gap-3 items-center p-3 bg-slate-50/80 border border-slate-200/70 rounded-xl text-sm"
                    >
                      <div className="sm:col-span-5">
                        <label className="text-[11px] font-semibold text-slate-400 block mb-1">
                          Nguyên liệu
                        </label>
                        <select
                          value={row.ingredientId}
                          onChange={(e) => {
                            const newIng = allIngredients.find((i) => i.id === e.target.value);
                            setRecipeItems((prev) =>
                              prev.map((item, i) =>
                                i === idx
                                  ? {
                                      ...item,
                                      ingredientId: e.target.value,
                                      unit: newIng?.baseUnit || item.unit,
                                    }
                                  : item
                              )
                            );
                          }}
                          className="w-full px-3 py-2 rounded-lg border border-slate-300 bg-white text-sm"
                        >
                          <option value="">-- Chọn nguyên liệu --</option>
                          {allIngredients.map((ing) => (
                            <option key={ing.id} value={ing.id}>
                              {ing.name} ({ing.costPerBaseUnit.toLocaleString("vi-VN")}đ/{ing.baseUnit})
                            </option>
                          ))}
                        </select>
                      </div>

                      <div className="sm:col-span-2">
                        <label className="text-[11px] font-semibold text-slate-400 block mb-1">
                          Định lượng
                        </label>
                        <input
                          type="number"
                          step="0.1"
                          value={row.quantity}
                          onChange={(e) =>
                            setRecipeItems((prev) =>
                              prev.map((item, i) =>
                                i === idx ? { ...item, quantity: Number(e.target.value) } : item
                              )
                            )
                          }
                          className="w-full px-3 py-2 rounded-lg border border-slate-300 bg-white text-sm"
                        />
                      </div>

                      <div className="sm:col-span-2">
                        <label className="text-[11px] font-semibold text-slate-400 block mb-1">
                          Đơn vị
                        </label>
                        <select
                          value={row.unit}
                          onChange={(e) =>
                            setRecipeItems((prev) =>
                              prev.map((item, i) =>
                                i === idx ? { ...item, unit: e.target.value } : item
                              )
                            )
                          }
                          className="w-full px-3 py-2 rounded-lg border border-slate-300 bg-white text-sm"
                        >
                          <option value={selectedIng?.baseUnit || "g"}>
                            {selectedIng?.baseUnit || "g"}
                          </option>
                          {selectedIng?.baseUnit === "g" && <option value="kg">kg</option>}
                          {selectedIng?.baseUnit === "ml" && <option value="l">l</option>}
                        </select>
                      </div>

                      <div className="sm:col-span-2 text-right">
                        <span className="text-[11px] font-semibold text-slate-400 block mb-1">
                          Chi phí dòng
                        </span>
                        <span className="font-bold text-amber-800">
                          {formatCurrency(previewLine?.lineCost ?? 0)}
                        </span>
                        <label className="flex items-center justify-end gap-1 text-[11px] text-slate-500 mt-1 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={row.isOptional}
                            onChange={(e) =>
                              setRecipeItems((prev) =>
                                prev.map((item, i) =>
                                  i === idx ? { ...item, isOptional: e.target.checked } : item
                                )
                              )
                            }
                          />
                          Tùy chọn
                        </label>
                      </div>

                      <div className="sm:col-span-1 text-right">
                        <button
                          type="button"
                          onClick={() => handleRemoveRecipeRow(idx)}
                          className="p-2 text-rose-500 hover:bg-rose-50 rounded-lg"
                          title="Xóa nguyên liệu"
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {/* Extra recipe costs */}
            <div className="grid sm:grid-cols-3 gap-4 pt-2">
              <Input
                label="Sản lượng mẻ (yieldQuantity)"
                type="number"
                step="0.1"
                value={yieldQuantity}
                onChange={(e) => setYieldQuantity(Number(e.target.value) || 1)}
              />
              <Input
                label="Chi phí nhân công / mẻ (VND)"
                type="number"
                value={laborCost}
                onChange={(e) => setLaborCost(Number(e.target.value) || 0)}
              />
              <Input
                label="Chi phí vận hành / mẻ (VND)"
                type="number"
                value={overheadCost}
                onChange={(e) => setOverheadCost(Number(e.target.value) || 0)}
              />
            </div>

            <Input
              label="Ghi chú phiên bản công thức"
              placeholder="VD: Công thức chuẩn mùa hè, giảm 5g đường..."
              value={recipeNote}
              onChange={(e) => setRecipeNote(e.target.value)}
            />

            {/* Realtime Cost Summary & Margin Warning */}
            {costPreview && (
              <div className="p-5 rounded-2xl bg-slate-50 border border-slate-200 space-y-4">
                <div className="grid sm:grid-cols-4 gap-4 text-sm">
                  <div>
                    <span className="text-xs text-slate-400 block">Chi phí nguyên liệu chính</span>
                    <span className="font-bold text-slate-800 text-base">
                      {formatCurrency(costPreview.ingredientsCost)}
                    </span>
                  </div>
                  <div>
                    <span className="text-xs text-slate-400 block">Giá vốn ước tính / 1 {unit || "ly"}</span>
                    <span className="font-black text-amber-800 text-lg">
                      {formatCurrency(costPreview.unitCost)}
                    </span>
                  </div>
                  <div>
                    <span className="text-xs text-slate-400 block">Lợi nhuận gộp / 1 {unit || "ly"}</span>
                    <span
                      className={`font-black text-lg ${
                        costPreview.marginAmount >= 0 ? "text-emerald-700" : "text-rose-600"
                      }`}
                    >
                      {formatCurrency(costPreview.marginAmount)}
                    </span>
                  </div>
                  <div>
                    <span className="text-xs text-slate-400 block">% Biên lợi nhuận (Margin)</span>
                    <span
                      className={`font-black text-lg ${
                        costPreview.lowMarginWarning ? "text-rose-600" : "text-emerald-700"
                      }`}
                    >
                      {costPreview.marginPercent}%
                    </span>
                  </div>
                </div>

                {costPreview.lowMarginWarning && (
                  <div className="p-3.5 rounded-xl bg-amber-100/80 border border-amber-300 text-amber-900 text-xs font-semibold flex items-center gap-2">
                    <AlertTriangle size={16} className="text-amber-700 shrink-0" />
                    Cảnh báo: Biên lợi nhuận hiện tại ({costPreview.marginPercent}%) thấp hơn ngưỡng khuyến nghị 30% giá bán! Vui lòng cân nhắc điều chỉnh định lượng hoặc giá bán.
                  </div>
                )}
              </div>
            )}

            <div className="flex justify-end">
              <Button
                type="button"
                onClick={handleSaveRecipeVersion}
                isLoading={isSavingRecipe}
                className="bg-amber-800 hover:bg-amber-900 text-white"
              >
                <Save size={15} className="mr-1.5" /> Lưu thành phiên bản công thức mới
              </Button>
            </div>

            {/* Version History */}
            {recipeVersions.length > 0 && (
              <div className="pt-6 border-t border-slate-100">
                <h4 className="text-sm font-bold text-slate-700 flex items-center gap-1.5 mb-3">
                  <History size={15} className="text-amber-800" />
                  Lịch sử phiên bản công thức ({recipeVersions.length})
                </h4>
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead>
                      <tr className="border-b border-slate-100 text-slate-400 uppercase font-bold">
                        <th className="py-2 px-3">Phiên bản</th>
                        <th className="py-2 px-3">Số nguyên liệu</th>
                        <th className="py-2 px-3 text-right">Giá vốn / ĐV</th>
                        <th className="py-2 px-3 text-right">Margin</th>
                        <th className="py-2 px-3">Ngày hiệu lực</th>
                        <th className="py-2 px-3 text-center">Trạng thái</th>
                        <th className="py-2 px-3 text-right">Thao tác</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {recipeVersions.map((ver) => (
                        <tr key={ver.id} className="hover:bg-slate-50/60">
                          <td className="py-2.5 px-3 font-bold text-slate-800">v{ver.version}</td>
                          <td className="py-2.5 px-3 text-slate-600">
                            {ver.ingredients.length} nguyên liệu
                          </td>
                          <td className="py-2.5 px-3 text-right font-bold text-amber-800">
                            {formatCurrency(ver.costSummary.unitCost)}
                          </td>
                          <td className="py-2.5 px-3 text-right font-semibold text-emerald-700">
                            {ver.costSummary.marginPercent}%
                          </td>
                          <td className="py-2.5 px-3 text-slate-500">
                            {formatDate(ver.effectiveFrom)}
                          </td>
                          <td className="py-2.5 px-3 text-center">
                            {ver.isActive ? (
                              <span className="px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700 font-bold">
                                Đang áp dụng
                              </span>
                            ) : (
                              <span className="px-2 py-0.5 rounded-full bg-slate-100 text-slate-500">
                                Lịch sử
                              </span>
                            )}
                          </td>
                          <td className="py-2.5 px-3 text-right">
                            {!ver.isActive && (
                              <button
                                type="button"
                                onClick={() => handleActivateVersion(ver.id)}
                                className="text-amber-800 hover:underline font-bold"
                              >
                                Kích hoạt lại
                              </button>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

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
