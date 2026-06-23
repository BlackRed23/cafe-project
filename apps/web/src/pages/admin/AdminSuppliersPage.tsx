import React, { useState, useEffect } from "react";
import { suppliersApi } from "../../api/suppliers.api";
import { productsApi } from "../../api/products.api";
import { purchaseRequestsApi } from "../../api/purchaseRequests.api";
import type { Supplier, SupplierProduct } from "../../types/supplier.types";
import type { Product } from "../../types/product.types";
import { formatCurrency } from "../../utils/formatCurrency";
import { Button } from "../../components/common/Button";
import { Loading } from "../../components/common/Loading";
import { EmptyState } from "../../components/common/EmptyState";
import { Modal } from "../../components/common/Modal";
import { Input } from "../../components/common/Input";
import { ConfirmDialog } from "../../components/common/ConfirmDialog";
import { DataTable } from "../../components/admin/DataTable";
import { useToast } from "../../contexts/ToastContext";
import { Plus, Edit2, Trash2, Link2, Truck, Coffee, AlertTriangle, Ban, CheckCircle } from "lucide-react";
import { ALLOWED_PRODUCT_UNITS } from "../../constants/units";

// ─── Helpers ────────────────────────────────────────────────────────────────

const calculateConversionQty = (weightStr: string, weightUnit: string, targetUnit: string) => {
  const weight = Number(weightStr);
  if (!weight || weight <= 0) return { qty: 0, error: "Khối lượng phải lớn hơn 0" };
  if (!weightUnit || !targetUnit) return { qty: 0, error: "" };
  if (weightUnit.toLowerCase() === "kg" && targetUnit.toLowerCase() === "gram") return { qty: weight * 1000, error: "" };
  if (weightUnit.toLowerCase() === "gram" && targetUnit.toLowerCase() === "gram") return { qty: weight, error: "" };
  if (weightUnit.toLowerCase() === targetUnit.toLowerCase()) return { qty: weight, error: "" };
  return { qty: 0, error: "Chưa hỗ trợ tự quy đổi giữa hai đơn vị này, vui lòng kiểm tra lại." };
};

/** Returns true nếu admin đã nhập ít nhất 1 field quy cách */
const hasAnyConversionField = (pu: string, cq: string, wu: string, ctu: string) =>
  pu !== "" || cq !== "" || wu !== "" || ctu !== "";

/** Returns true nếu admin đã nhập đủ 4 field quy cách hợp lệ */
const hasAllConversionFields = (pu: string, cq: string, wu: string, ctu: string) =>
  pu !== "" && cq !== "" && Number(cq) > 0 && wu !== "" && ctu !== "";

// ─── Component ──────────────────────────────────────────────────────────────

export const AdminSuppliersPage: React.FC = () => {
  const toast = useToast();
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [supplierProducts, setSupplierProducts] = useState<SupplierProduct[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [purchaseRequests, setPurchaseRequests] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchSup, setSearchSup] = useState("");
  const [searchProd, setSearchProd] = useState("");
  const [activeTab, setActiveTab] = useState<"ACTIVE" | "INACTIVE">("ACTIVE");

  // Supplier modal states
  const [selectedSupplier, setSelectedSupplier] = useState<Supplier | null>(null);
  const [isSupplierModalOpen, setIsSupplierModalOpen] = useState(false);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [address, setAddress] = useState("");
  const [modalLoading, setModalLoading] = useState(false);
  const [enableLinkProduct, setEnableLinkProduct] = useState(false);
  const [rightColumnMode, setRightColumnMode] = useState<"LIST" | "ADD" | "EDIT">("LIST");
  const [editingSupplierProductId, setEditingSupplierProductId] = useState<string | null>(null);

  // Link product modal states
  const [isLinkModalOpen, setIsLinkModalOpen] = useState(false);
  const [linkSupplierId, setLinkSupplierId] = useState("");
  const [linkProductId, setLinkProductId] = useState("");
  const [importPrice, setImportPrice] = useState(0);
  const [minOrderQty, setMinOrderQty] = useState(1);
  const [leadTime, setLeadTime] = useState(3);
  // Conversion fields — all optional; must be all-or-nothing
  const [purchaseUnit, setPurchaseUnit] = useState("");
  const [conversionQtyStr, setConversionQtyStr] = useState("");
  const [weightUnit, setWeightUnit] = useState("");
  const [conversionTargetUnit, setConversionTargetUnit] = useState("");
  const [linkLoading, setLinkLoading] = useState(false);

  // Confirm delete states
  const [deleteType, setDeleteType] = useState<"link" | "supplier_deactivate" | "supplier_activate" | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const fetchData = async () => {
    try {
      setIsLoading(true);
      const [sups, prodLinks, prods, prs] = await Promise.all([
        suppliersApi.getSuppliers(),
        suppliersApi.getSupplierProducts().catch(() => [] as SupplierProduct[]),
        productsApi.getProducts().catch(() => [] as Product[]),
        purchaseRequestsApi.getPurchaseRequests().catch(() => []),
      ]);
      setSuppliers(sups);
      setSupplierProducts(prodLinks);
      setProducts(prods);
      setPurchaseRequests(prs);
    } catch (err: any) {
      setError("Không thể tải thông tin nhà cung cấp.");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const handleOpenSupplierModal = (sup?: Supplier) => {
    if (sup) {
      setSelectedSupplier(sup);
      setName(sup.name);
      setEmail(sup.email);
      setPhone(sup.phone || "");
      setAddress(sup.address || "");
      setEnableLinkProduct(false);
      setRightColumnMode("LIST");
      setEditingSupplierProductId(null);
    } else {
      setSelectedSupplier(null);
      setName("");
      setEmail("");
      setPhone("");
      setAddress("");
      setEnableLinkProduct(false);
    }
    setLinkProductId("");
    setImportPrice(50000);
    setMinOrderQty(10);
    setLeadTime(3);
    setPurchaseUnit("");
    setConversionQtyStr("");
    setWeightUnit("");
    setConversionTargetUnit("");
    setIsSupplierModalOpen(true);
  };

  const handleCloseSupplierModal = () => {
    setIsSupplierModalOpen(false);
    setSelectedSupplier(null);
  };

  const handleSupplierSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (enableLinkProduct) {
      if (!linkProductId) {
        toast.error("Thiếu thông tin", "Vui lòng chọn sản phẩm để gán.");
        return;
      }
      const hasAny = hasAnyConversionField(purchaseUnit, conversionQtyStr, weightUnit, conversionTargetUnit);
      const hasAll = hasAllConversionFields(purchaseUnit, conversionQtyStr, weightUnit, conversionTargetUnit);
      if (hasAny && !hasAll) {
        toast.error(
          "Thiếu thông tin quy cách",
          "Nếu nhập quy cách, vui lòng nhập đủ Đơn vị NCC, Khối lượng, Đơn vị khối lượng và Đơn vị tồn kho."
        );
        return;
      }
    }

    setModalLoading(true);
    const payload = { name, email, phone, address };

    try {
      let supId = selectedSupplier?.id;
      if (selectedSupplier) {
        await suppliersApi.updateSupplier(selectedSupplier.id, payload);
        toast.success("Cập nhật thành công", `Nhà cung cấp "${payload.name}" đã được cập nhật.`);
      } else {
        const createdSup = await suppliersApi.createSupplier(payload);
        supId = createdSup.id;
        toast.success("Tạo thành công", `Nhà cung cấp "${payload.name}" đã được thêm mới.`);
      }

      if (enableLinkProduct && supId) {
        const hasAll = hasAllConversionFields(purchaseUnit, conversionQtyStr, weightUnit, conversionTargetUnit);
        
        let finalQty = 0;
        if (hasAll) {
          const calc = calculateConversionQty(conversionQtyStr, weightUnit, conversionTargetUnit);
          if (calc.error) {
            toast.error("Lỗi quy cách", calc.error);
            setModalLoading(false);
            return;
          }
          finalQty = calc.qty;
        }

        const conversionPayload = hasAll
          ? {
              purchaseUnit,
              conversionQuantity: finalQty,
              conversionTargetUnit,
            }
          : {
              purchaseUnit: null,
              conversionQuantity: null,
              conversionTargetUnit: null,
            };

        const linkPayload = {
          supplierId: supId,
          productId: linkProductId,
          price: importPrice,
          minOrderQuantity: minOrderQty,
          leadTimeDays: leadTime,
          isPreferred: false,
          ...conversionPayload,
        };
        await suppliersApi.createSupplierProduct(linkPayload as any);
        toast.success("Gán thành công", "Sản phẩm đã được gán cho nhà cung cấp.");
      }

      await fetchData();
      handleCloseSupplierModal();
    } catch (err) {
      toast.error("Thao tác thất bại", "Lỗi khi lưu thông tin nhà cung cấp.");
    } finally {
      setModalLoading(false);
    }
  };

  const handleInlineLinkSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedSupplier || !linkProductId) return;

    const hasAny = hasAnyConversionField(purchaseUnit, conversionQtyStr, weightUnit, conversionTargetUnit);
    const hasAll = hasAllConversionFields(purchaseUnit, conversionQtyStr, weightUnit, conversionTargetUnit);

    if (hasAny && !hasAll) {
      toast.error(
        "Thiếu thông tin quy cách",
        "Nếu nhập quy cách, vui lòng nhập đủ Đơn vị NCC, Khối lượng, Đơn vị khối lượng và Đơn vị tồn kho."
      );
      return;
    }

    setLinkLoading(true);

    let finalQty = 0;
    if (hasAll) {
      const calc = calculateConversionQty(conversionQtyStr, weightUnit, conversionTargetUnit);
      if (calc.error) {
        toast.error("Lỗi quy cách", calc.error);
        setLinkLoading(false);
        return;
      }
      finalQty = calc.qty;
    }

    const conversionPayload = hasAll
      ? {
          purchaseUnit,
          conversionQuantity: finalQty,
          conversionTargetUnit,
        }
      : {
          purchaseUnit: null,
          conversionQuantity: null,
          conversionTargetUnit: null,
        };

    const payload = {
      supplierId: selectedSupplier.id,
      productId: linkProductId,
      price: importPrice,
      minOrderQuantity: minOrderQty,
      leadTimeDays: leadTime,
      isPreferred: false,
      ...conversionPayload,
    };

    try {
      if (rightColumnMode === "EDIT" && editingSupplierProductId) {
        await suppliersApi.updateSupplierProduct(editingSupplierProductId, payload as any);
        toast.success("Cập nhật thành công", "Điều kiện cung cấp đã được lưu.");
      } else {
        await suppliersApi.createSupplierProduct(payload as any);
        toast.success("Gán thành công", "Sản phẩm đã được gán cho nhà cung cấp.");
      }
      await fetchData();
      setRightColumnMode("LIST");
      setEditingSupplierProductId(null);
    } catch (err) {
      toast.error("Thao tác thất bại", "Lỗi khi lưu thông tin liên kết.");
    } finally {
      setLinkLoading(false);
    }
  };

  const handleOpenLinkModal = (supplierId: string) => {
    setLinkSupplierId(supplierId);
    setLinkProductId("");
    setImportPrice(50000);
    setMinOrderQty(10);
    setLeadTime(3);
    // Reset conversion fields — default empty (not configured)
    setPurchaseUnit("");
    setConversionQtyStr("");
    setWeightUnit("");
    setConversionTargetUnit("");
    setIsLinkModalOpen(true);
  };

  const handleLinkSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!linkProductId) return;

    const hasAny = hasAnyConversionField(purchaseUnit, conversionQtyStr, weightUnit, conversionTargetUnit);
    const hasAll = hasAllConversionFields(purchaseUnit, conversionQtyStr, weightUnit, conversionTargetUnit);

    if (hasAny && !hasAll) {
      toast.error(
        "Thiếu thông tin quy cách",
        "Nếu nhập quy cách, vui lòng nhập đủ Đơn vị NCC, Khối lượng, Đơn vị khối lượng và Đơn vị tồn kho."
      );
      return;
    }

    setLinkLoading(true);

    let finalQty = 0;
    if (hasAll) {
      const calc = calculateConversionQty(conversionQtyStr, weightUnit, conversionTargetUnit);
      if (calc.error) {
        toast.error("Lỗi quy cách", calc.error);
        setLinkLoading(false);
        return;
      }
      finalQty = calc.qty;
    }

    const conversionPayload = hasAll
      ? {
          purchaseUnit,
          conversionQuantity: finalQty,
          conversionTargetUnit,
        }
      : {
          purchaseUnit: null,
          conversionQuantity: null,
          conversionTargetUnit: null,
        };

    const payload = {
      supplierId: linkSupplierId,
      productId: linkProductId,
      price: importPrice,
      minOrderQuantity: minOrderQty,
      leadTimeDays: leadTime,
      isPreferred: false,
      ...conversionPayload,
    };

    try {
      await suppliersApi.createSupplierProduct(payload as any);
      toast.success("Gán thành công", "Sản phẩm đã được gán cho nhà cung cấp.");
      await fetchData();
      setIsLinkModalOpen(false);
    } catch (err) {
      toast.error("Gán thất bại", "Lỗi khi gán sản phẩm cho nhà cung cấp.");
    } finally {
      setLinkLoading(false);
    }
  };

  const handleConfirmDelete = async () => {
    if (!deleteId) return;
    setIsDeleting(true);
    try {
      if (deleteType === "link") {
        await suppliersApi.deleteSupplierProduct(deleteId);
        toast.success("Gỡ liên kết thành công", "Đã gỡ sản phẩm khỏi nhà cung cấp.");
      }
      await fetchData();
      setDeleteId(null);
      setDeleteType(null);
    } catch (err: any) {
      toast.error("Thao tác thất bại", "Lỗi khi thực hiện xóa.");
    } finally {
      setIsDeleting(false);
    }
  };

  const handleMakeInactive = async () => {
      if (!deleteId) return;
      setIsDeleting(true);
      try {
          await suppliersApi.updateSupplier(deleteId, { status: "INACTIVE" });
          toast.success("Thành công", "Đã ngừng hoạt động nhà cung cấp.");
          await fetchData();
          setDeleteId(null);
          setDeleteType(null);
      } catch (err) {
          toast.error("Thất bại", "Lỗi khi cập nhật trạng thái.");
      } finally {
          setIsDeleting(false);
      }
  };

  const handleMakeActive = async () => {
      if (!deleteId) return;
      setIsDeleting(true);
      try {
          await suppliersApi.updateSupplier(deleteId, { status: "ACTIVE" });
          toast.success("Thành công", "Đã mở hoạt động nhà cung cấp.");
          await fetchData();
          setDeleteId(null);
          setDeleteType(null);
      } catch (err) {
          toast.error("Thất bại", "Lỗi khi cập nhật trạng thái.");
      } finally {
          setIsDeleting(false);
      }
  };

  if (isLoading) {
    return <Loading message="Đang tải danh sách nhà cung cấp..." />;
  }

  const filteredSuppliers = suppliers.filter((sup) => {
    const matchesSearch = sup.name.toLowerCase().includes(searchSup.toLowerCase());
    const matchesTab = activeTab === 'ACTIVE' ? sup.status !== 'INACTIVE' : sup.status === 'INACTIVE';
    return matchesSearch && matchesTab;
  });

  const filteredSupplierProducts = supplierProducts.filter((sp) => {
    const sName = suppliers.find((s) => s.id === (sp.supplierId || sp.supplier_id))?.name || "";
    const pName = products.find((p) => p.id === (sp.productId || sp.product_id))?.name || "";
    return sName.toLowerCase().includes(searchProd.toLowerCase()) || pName.toLowerCase().includes(searchProd.toLowerCase());
  });

  // ── Conversion preview helpers ──────────────────────────────────────────
  const isAnyConv = hasAnyConversionField(purchaseUnit, conversionQtyStr, weightUnit, conversionTargetUnit);
  const isAllConv = hasAllConversionFields(purchaseUnit, conversionQtyStr, weightUnit, conversionTargetUnit);
  const convCalcResult = isAllConv ? calculateConversionQty(conversionQtyStr, weightUnit, conversionTargetUnit) : null;
  const linkConversionWarning = isAnyConv && !isAllConv;
  const linkConversionError = isAllConv && convCalcResult?.error;
  const linkConversionPreview = isAllConv && convCalcResult && !convCalcResult.error
    ? `1 ${purchaseUnit} = ${convCalcResult.qty} ${conversionTargetUnit}`
    : null;

  const supplierColumns = [
    {
      header: "Nhà cung cấp",
      render: (sup: Supplier) => (
        <div className="flex flex-col gap-1">
          <div className="flex items-center gap-2">
            <Truck className="text-slate-400" size={16} />
            <span className="font-semibold text-slate-800">{sup.name}</span>
          </div>
          {sup.status === 'INACTIVE' ? (
             <span className="w-fit px-2 py-0.5 rounded-md bg-rose-100 text-rose-700 text-[10px] font-bold uppercase">Ngưng hoạt động</span>
          ) : (
             <span className="w-fit px-2 py-0.5 rounded-md bg-emerald-100 text-emerald-700 text-[10px] font-bold uppercase">Đang hoạt động</span>
          )}
        </div>
      ),
    },
    {
      header: "Email",
      render: (sup: Supplier) => <span className="text-slate-600 font-medium">{sup.email}</span>,
    },
    {
      header: "Số điện thoại",
      render: (sup: Supplier) => <span className="text-slate-500">{sup.phone || "—"}</span>,
    },
    {
      header: "Địa chỉ",
      render: (sup: Supplier) => <span className="text-slate-500 block max-w-xs truncate">{sup.address || "—"}</span>,
    },
    {
      header: "Hành động",
      className: "text-right",
      render: (sup: Supplier) => (
        <div className="flex items-center justify-end gap-2">
          <Button
            onClick={() => handleOpenLinkModal(sup.id)}
            variant="outline"
            size="sm"
            className="flex items-center gap-1 hover:border-amber-800 hover:text-amber-800 hover:bg-amber-50/20"
          >
            <Link2 size={12} /> Gán sản phẩm
          </Button>
          <button
            onClick={() => handleOpenSupplierModal(sup)}
            className="p-1.5 text-slate-400 hover:text-amber-800 hover:bg-slate-100 rounded-lg"
            title="Sửa"
          >
            <Edit2 size={15} />
          </button>
          {sup.status !== "INACTIVE" && (
            <button
              onClick={() => {
                setDeleteType("supplier_deactivate");
                setDeleteId(sup.id);
              }}
              className="p-1.5 text-slate-400 hover:text-amber-600 hover:bg-amber-50 rounded-lg"
              title="Ngừng hoạt động"
            >
              <Ban size={15} />
            </button>
          )}
          {sup.status === "INACTIVE" && (
            <button
              onClick={() => {
                setDeleteType("supplier_activate");
                setDeleteId(sup.id);
              }}
              className="p-1.5 text-slate-400 hover:text-emerald-600 hover:bg-emerald-50 rounded-lg"
              title="Mở hoạt động"
            >
              <CheckCircle size={15} />
            </button>
          )}
        </div>
      ),
    },
  ];

  const supplierProductColumns = [
    {
      header: "Nhà cung cấp",
      render: (sp: SupplierProduct) => {
        const sName = suppliers.find((s) => s.id === (sp.supplierId || sp.supplier_id))?.name || "N/A";
        return <span className="font-bold text-slate-700">{sName}</span>;
      },
    },
    {
      header: "Trạng thái NCC",
      render: (sp: SupplierProduct) => {
        const sup = suppliers.find((s) => s.id === (sp.supplierId || sp.supplier_id));
        if (!sup) return null;
        const isInactive = sup.status === 'INACTIVE';
        return (
          <>
            {isInactive ? (
              <>
                <span className="w-fit px-2 py-0.5 rounded-md bg-rose-100 text-rose-700 text-[10px] font-bold uppercase">Đã tắt</span>
                <div className="text-xs text-rose-600 mt-0.5">Agent không chọn</div>
              </>
            ) : (
              <span className="w-fit px-2 py-0.5 rounded-md bg-emerald-100 text-emerald-700 text-[10px] font-bold uppercase">Đang hoạt động</span>
            )}
          </>
        );
      },
    },
    {
      header: "Sản phẩm gán",
      render: (sp: SupplierProduct) => {
        const pName = products.find((p) => p.id === (sp.productId || sp.product_id))?.name || "N/A";
        return <span className="font-semibold text-slate-800">{pName}</span>;
      },
    },
    {
      header: "Giá nhập đề xuất",
      render: (sp: SupplierProduct) => {
        const priceVal = sp.importPrice ?? sp.import_price ?? 0;
        return <span className="font-bold text-amber-800">{formatCurrency(priceVal)}</span>;
      },
    },
    {
      header: "MOQ",
      render: (sp: SupplierProduct) => <span>{sp.minOrderQuantity ?? sp.min_order_quantity ?? 0}</span>,
    },
    {
      header: "Thời gian giao hàng",
      render: (sp: SupplierProduct) => <span>{sp.leadTime ?? sp.lead_time ?? 0} ngày</span>,
    },
    {
      header: "Quy cách nhập",
      render: (sp: SupplierProduct) => {
        const unit = sp.purchaseUnit ?? sp.purchase_unit;
        const qty = sp.conversionQuantity ?? sp.conversion_quantity;
        const target = sp.conversionTargetUnit ?? sp.conversion_target_unit;
        return unit && qty && target ? (
          <span className="font-semibold text-slate-700">
            Quy cách: 1 {unit} = {qty} {target}
          </span>
        ) : (
          <span className="text-xs text-slate-500">Chưa có quy cách từ nhà cung cấp</span>
        );
      },
    },
    {
      header: "Gỡ bỏ",
      className: "text-right",
      render: (sp: SupplierProduct) => (
        <button
          onClick={() => {
            setDeleteType("link");
            setDeleteId(sp.id);
          }}
          className="p-1 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded"
        >
          <Trash2 size={14} />
        </button>
      ),
    },
  ];

  return (
    <div className="flex flex-col gap-8">
      {error && (
        <div className="p-4 bg-rose-50 border border-rose-200 text-rose-800 text-sm font-medium rounded-xl">
          {error}
        </div>
      )}

      {/* Suppliers Section */}
      <div className="space-y-4">
        <div className="flex justify-between items-center">
          <h3 className="text-base font-extrabold text-slate-800">Danh mục đối tác nhà cung cấp</h3>
          <Button onClick={() => handleOpenSupplierModal()} className="flex items-center gap-1.5">
            <Plus size={16} /> Thêm nhà cung cấp
          </Button>
        </div>

        <div className="flex gap-4 border-b border-slate-200">
          <button
            className={`pb-2 text-sm font-semibold border-b-2 transition-colors ${activeTab === 'ACTIVE' ? 'border-amber-700 text-amber-800' : 'border-transparent text-slate-500 hover:text-slate-700'}`}
            onClick={() => setActiveTab('ACTIVE')}
          >
            Đang hoạt động
          </button>
          <button
            className={`pb-2 text-sm font-semibold border-b-2 transition-colors ${activeTab === 'INACTIVE' ? 'border-amber-700 text-amber-800' : 'border-transparent text-slate-500 hover:text-slate-700'}`}
            onClick={() => setActiveTab('INACTIVE')}
          >
            Đã tắt / Ngừng hoạt động
          </button>
        </div>

        {suppliers.length === 0 ? (
          <EmptyState title="Không có nhà cung cấp" description="Hệ thống chưa ghi nhận đối tác nhà cung cấp nào." />
        ) : (
          <DataTable
            columns={supplierColumns}
            data={filteredSuppliers}
            searchPlaceholder="Tìm theo tên nhà cung cấp..."
            searchValue={searchSup}
            onSearchChange={setSearchSup}
          />
        )}
      </div>

      {/* Linked products import price mapping list */}
      <div className="space-y-4">
        <h3 className="text-base font-extrabold text-slate-800 flex items-center gap-2">
          <Coffee size={18} className="text-amber-800" /> Bảng gán sản phẩm &amp; Giá nhập
        </h3>

        {supplierProducts.length === 0 ? (
          <div className="p-8 text-center bg-white border border-dashed border-slate-250 rounded-2xl text-slate-400">
            Chưa gán sản phẩm nào cho nhà cung cấp. Click "Gán sản phẩm" ở bảng trên để thêm liên kết.
          </div>
        ) : (
          <DataTable
            columns={supplierProductColumns}
            data={filteredSupplierProducts}
            searchPlaceholder="Tìm theo nhà cung cấp hoặc sản phẩm..."
            searchValue={searchProd}
            onSearchChange={setSearchProd}
          />
        )}
      </div>

      {/* Supplier Modal */}
      {isSupplierModalOpen && (
        <Modal
          isOpen={true}
          onClose={handleCloseSupplierModal}
          title={selectedSupplier ? "Sửa thông tin nhà cung cấp" : "Thêm nhà cung cấp mới"}
          size="xl"
        >
          <form onSubmit={handleSupplierSubmit} className="space-y-6">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Cột trái */}
              <div className="bg-slate-50 border border-slate-200 rounded-xl p-5 space-y-4 h-fit">
                <h4 className="font-bold text-slate-800 text-sm border-b border-slate-200 pb-2">Thông tin nhà cung cấp</h4>
                <Input label="Tên nhà cung cấp" value={name} onChange={(e) => setName(e.target.value)} required />
                <Input label="Email liên hệ" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
                <Input label="Số điện thoại" value={phone} onChange={(e) => setPhone(e.target.value)} />
                <Input label="Địa chỉ" value={address} onChange={(e) => setAddress(e.target.value)} />
              </div>

              {/* Cột phải */}
              <div className="bg-slate-50 border border-slate-200 rounded-xl p-5 space-y-4 h-fit">
                <div className="flex items-center justify-between border-b border-slate-200 pb-2">
                  <h4 className="font-bold text-slate-800 text-sm">Liên kết sản phẩm cung cấp</h4>
                  {!selectedSupplier && (
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input 
                        type="checkbox" 
                        checked={enableLinkProduct} 
                        onChange={(e) => setEnableLinkProduct(e.target.checked)} 
                        className="rounded border-slate-300 text-amber-700 focus:ring-amber-700 w-4 h-4" 
                      />
                      <span className="text-sm font-medium text-slate-700">Gán sản phẩm ngay</span>
                    </label>
                  )}
                  {selectedSupplier && rightColumnMode === "LIST" && (
                    <Button
                      type="button"
                      size="sm"
                      onClick={() => {
                        setRightColumnMode("ADD");
                        setLinkProductId("");
                        setImportPrice(50000);
                        setMinOrderQty(10);
                        setLeadTime(3);
                        setPurchaseUnit("");
                        setConversionQtyStr("");
                        setWeightUnit("");
                        setConversionTargetUnit("");
                      }}
                      className="!py-1.5 !px-3 text-xs bg-amber-100 text-amber-800 hover:bg-amber-200 border-none"
                    >
                      <Plus size={14} className="mr-1" /> Gắn thêm sản phẩm
                    </Button>
                  )}
                </div>

                {!selectedSupplier && !enableLinkProduct && (
                  <div className="p-4 bg-white border border-slate-200 rounded-lg text-sm text-slate-500 italic">
                    Bạn có thể tạo nhà cung cấp trước, sau đó gán sản phẩm sau ở nút "Gán sản phẩm".
                  </div>
                )}

                {selectedSupplier && selectedSupplier.status === 'INACTIVE' && rightColumnMode === "LIST" && (
                  <div className="flex items-start gap-2 rounded-lg bg-rose-50 border border-rose-200 px-3 py-2 text-xs font-medium text-rose-700 mb-2">
                    <Ban size={14} className="shrink-0 mt-0.5" />
                    Nhà cung cấp đang ngừng hoạt động. Agent sẽ không chọn nhà cung cấp này cho yêu cầu nhập hàng mới.
                  </div>
                )}

                {selectedSupplier && rightColumnMode === "LIST" && (
                  <div className="space-y-3 max-h-[500px] overflow-y-auto pr-2">
                    {supplierProducts.filter(sp => sp.supplierId === selectedSupplier.id).length === 0 ? (
                      <div className="text-center text-slate-500 text-sm py-4 italic bg-white border border-dashed border-slate-200 rounded-lg">Chưa có sản phẩm nào được gán.</div>
                    ) : (
                      supplierProducts.filter(sp => sp.supplierId === selectedSupplier.id).map(sp => (
                        <div key={sp.id} className="bg-white border border-slate-200 rounded-lg p-3 flex flex-col gap-2 shadow-sm">
                          <div className="flex justify-between items-start gap-3">
                            <div>
                              <div className="font-semibold text-slate-800 text-sm">{products.find(p => p.id === sp.productId)?.name || sp.productId}</div>
                              <div className="text-xs text-slate-500 mt-0.5 leading-relaxed">
                                Giá: <strong className="text-slate-700">{formatCurrency(sp.importPrice || 0)}</strong> • MOQ: <strong className="text-slate-700">{sp.minOrderQuantity || 0}</strong> • Lead time: <strong className="text-slate-700">{sp.leadTime || 0} ngày</strong>
                              </div>
                              {sp.purchaseUnit && sp.conversionQuantity && (
                                <div className="text-[10px] text-amber-700 bg-amber-50 rounded px-1.5 py-0.5 mt-1 inline-block border border-amber-100">
                                  Quy cách: 1 {sp.purchaseUnit} = {sp.conversionQuantity} {sp.conversionTargetUnit}
                                </div>
                              )}
                            </div>
                            <Button
                              type="button"
                              size="sm"
                              variant="outline"
                              onClick={() => {
                                setRightColumnMode("EDIT");
                                setEditingSupplierProductId(sp.id);
                                setLinkProductId(sp.productId);
                                setImportPrice(sp.importPrice || 0);
                                setMinOrderQty(sp.minOrderQuantity || 0);
                                setLeadTime(sp.leadTime || 0);
                                setPurchaseUnit(sp.purchaseUnit || "");
                                setConversionQtyStr(sp.conversionQuantity ? String(sp.conversionQuantity) : "");
                                setWeightUnit(sp.conversionTargetUnit || "");
                                setConversionTargetUnit(sp.conversionTargetUnit || "");
                              }}
                              className="!py-1 !px-2 text-[10px] h-auto border-slate-200 text-slate-600 hover:text-amber-700 hover:border-amber-200 hover:bg-amber-50 shrink-0"
                            >
                              <Edit2 size={12} className="mr-1" /> Sửa điều kiện
                            </Button>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                )}

                {((!selectedSupplier && enableLinkProduct) || (selectedSupplier && rightColumnMode !== "LIST")) && (
                  <div className="space-y-4">
                    {selectedSupplier && rightColumnMode !== "LIST" && (
                      <div className="flex justify-between items-center bg-amber-50 p-2.5 rounded-lg border border-amber-200">
                        <span className="text-sm font-semibold text-amber-800">{rightColumnMode === "EDIT" ? "Sửa điều kiện cung cấp" : "Gắn thêm sản phẩm"}</span>
                        <Button type="button" size="sm" variant="outline" onClick={() => { setRightColumnMode("LIST"); setEditingSupplierProductId(null); }} className="!py-1 !px-2 text-xs border-amber-200 bg-white hover:bg-amber-100 text-amber-800">Huỷ bỏ</Button>
                      </div>
                    )}

                    <div className="bg-white p-4 border border-slate-200 rounded-lg space-y-4 shadow-sm">
                      <div>
                        <label className="block text-sm font-medium text-slate-700 mb-1.5">
                          Sản phẩm nội bộ <span className="text-rose-500">*</span>
                        </label>
                        <select
                          value={linkProductId}
                          onChange={(e) => setLinkProductId(e.target.value)}
                          className="block w-full px-3.5 py-2.5 rounded-lg border border-slate-300 bg-white text-sm outline-none focus:ring-2 focus:ring-amber-700/20 focus:border-amber-700 disabled:bg-slate-50"
                          required={enableLinkProduct || rightColumnMode !== "LIST"}
                          disabled={rightColumnMode === "EDIT"}
                        >
                          <option value="">Chọn sản phẩm</option>
                          {products.map((p) => (
                            <option key={p.id} value={p.id}>
                              {p.name}
                            </option>
                          ))}
                        </select>
                      </div>
                      <Input
                        label="Giá nhập đề xuất (VND)"
                        type="number"
                        value={importPrice || ""}
                        onChange={(e) => setImportPrice(parseFloat(e.target.value) || 0)}
                        required={enableLinkProduct || rightColumnMode !== "LIST"}
                      />
                      <div className="grid grid-cols-2 gap-4">
                        <Input
                          label="MOQ / Số lượng tối thiểu"
                          type="number"
                          value={minOrderQty || ""}
                          onChange={(e) => setMinOrderQty(parseInt(e.target.value) || 0)}
                          required={enableLinkProduct || rightColumnMode !== "LIST"}
                        />
                        <Input
                          label="Thời gian giao hàng (ngày)"
                          type="number"
                          value={leadTime || ""}
                          onChange={(e) => setLeadTime(parseInt(e.target.value) || 0)}
                          required={enableLinkProduct || rightColumnMode !== "LIST"}
                        />
                      </div>
                    </div>

                    <div className="bg-white p-4 border border-slate-200 rounded-lg space-y-4 shadow-sm">
                      <div className="flex items-center gap-2 mb-1">
                        <h5 className="text-sm font-bold text-slate-700">Quy cách nhập hàng từ nhà cung cấp</h5>
                        <span className="px-2 py-0.5 rounded-md bg-slate-100 text-slate-500 text-[10px] font-semibold uppercase">Tùy chọn</span>
                      </div>
                      
                      <div className="text-xs text-slate-600 space-y-1.5 mt-2 mb-3">
                        <p>Chỉ nhập khi nhà cung cấp đã báo rõ quy cách đóng gói. Nếu chưa có thông tin, có thể để trống và hệ thống dùng đơn vị tồn kho nội bộ.</p>
                        <div className="bg-slate-50 p-2 rounded border border-slate-200 mt-2">
                          <p className="font-semibold mb-1 text-slate-700">Ví dụ: Nếu nhà cung cấp bán theo bao 15kg, hãy chọn:</p>
                          <ul className="list-disc pl-4 space-y-0.5 text-slate-600">
                            <li>Đơn vị đặt hàng từ NCC: Bao</li>
                            <li>Khối lượng mỗi đơn vị: 15</li>
                            <li>Đơn vị khối lượng: kg</li>
                            <li>Đơn vị tồn kho nội bộ: gram</li>
                          </ul>
                        </div>
                      </div>

                      <div className="grid grid-cols-1 gap-3">
                        <div>
                          <label className="block text-xs font-medium text-slate-600 mb-1">Đơn vị đặt hàng từ NCC</label>
                          <select
                            value={purchaseUnit}
                            onChange={(e) => setPurchaseUnit(e.target.value)}
                            className="block w-full px-2.5 py-2 rounded-lg border border-slate-300 bg-white text-sm outline-none focus:ring-2 focus:ring-amber-700/20 focus:border-amber-700"
                          >
                            <option value="">Ví dụ: Thùng, Bao, Cuộn, kg</option>
                            {ALLOWED_PRODUCT_UNITS.map((item) => (
                              <option key={item} value={item}>{item}</option>
                            ))}
                          </select>
                        </div>

                        <div className="grid grid-cols-2 gap-3">
                          <div>
                            <label className="block text-xs font-medium text-slate-600 mb-1">Khối lượng mỗi đơn vị</label>
                            <input
                              type="number"
                              min="0.01"
                              step="0.01"
                              value={conversionQtyStr}
                              onChange={(e) => setConversionQtyStr(e.target.value)}
                              placeholder="Ví dụ: 15"
                              className="block w-full px-2.5 py-2 rounded-lg border border-slate-300 bg-white text-sm outline-none focus:ring-2 focus:ring-amber-700/20 focus:border-amber-700"
                            />
                          </div>
                          <div>
                            <label className="block text-xs font-medium text-slate-600 mb-1">Đơn vị khối lượng</label>
                            <select
                              value={weightUnit}
                              onChange={(e) => setWeightUnit(e.target.value)}
                              className="block w-full px-2.5 py-2 rounded-lg border border-slate-300 bg-white text-sm outline-none focus:ring-2 focus:ring-amber-700/20 focus:border-amber-700"
                            >
                              <option value="">Ví dụ: kg, gram</option>
                              {ALLOWED_PRODUCT_UNITS.map((item) => (
                                <option key={item} value={item}>{item}</option>
                              ))}
                            </select>
                          </div>
                          <div className="col-span-2">
                            <label className="block text-xs font-medium text-slate-600 mb-1">Đơn vị tồn kho nội bộ</label>
                            <select
                              value={conversionTargetUnit}
                              onChange={(e) => setConversionTargetUnit(e.target.value)}
                              className="block w-full px-2.5 py-2 rounded-lg border border-slate-300 bg-white text-sm outline-none focus:ring-2 focus:ring-amber-700/20 focus:border-amber-700"
                            >
                              <option value="">Ví dụ: hộp, kg, gram</option>
                              {ALLOWED_PRODUCT_UNITS.map((item) => (
                                <option key={item} value={item}>{item}</option>
                              ))}
                            </select>
                          </div>
                        </div>
                      </div>

                      {linkConversionWarning && (
                        <div className="flex items-start gap-2 rounded-lg bg-rose-50 border border-rose-200 px-3 py-2 text-xs font-medium text-rose-700">
                          <AlertTriangle size={14} className="shrink-0 mt-0.5" />
                          Vui lòng nhập đủ Đơn vị NCC, Khối lượng, Đơn vị khối lượng và Đơn vị tồn kho.
                        </div>
                      )}

                      {linkConversionError && (
                        <div className="flex items-start gap-2 rounded-lg bg-rose-50 border border-rose-200 px-3 py-2 text-xs font-medium text-rose-700">
                          <AlertTriangle size={14} className="shrink-0 mt-0.5" />
                          {convCalcResult?.error}
                        </div>
                      )}

                      {linkConversionPreview && (
                        <div className="rounded-lg bg-emerald-50 border border-emerald-200 px-3 py-2 text-xs font-semibold text-emerald-800 text-center">
                          Kết quả quy đổi: {linkConversionPreview}
                        </div>
                      )}

                      {selectedSupplier && rightColumnMode !== "LIST" && (
                         <div className="mt-4 pt-3 border-t border-slate-100 flex justify-end">
                            <Button type="button" onClick={handleInlineLinkSubmit} isLoading={linkLoading} className="text-sm px-4">
                              Lưu điều kiện cung cấp
                            </Button>
                         </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            </div>

            <div className="pt-4 flex justify-end gap-3 sticky bottom-[-20px] bg-white border-t border-slate-100 pb-2 z-10">
              <Button type="button" variant="outline" onClick={handleCloseSupplierModal} className="w-28">
                Hủy
              </Button>
              <Button type="submit" isLoading={modalLoading} className="w-28">
                Lưu lại
              </Button>
            </div>
          </form>
        </Modal>
      )}

      {/* Link Product Modal */}
      {isLinkModalOpen && (
        <Modal isOpen={true} onClose={() => setIsLinkModalOpen(false)} title="Gán sản phẩm cho nhà cung cấp" size="xl">
          <form onSubmit={handleLinkSubmit} className="flex flex-col max-h-[85vh]">
            <div className="overflow-y-auto p-2">
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Left Column */}
                <div className="bg-slate-50 border border-slate-200 rounded-xl p-5 space-y-4 h-fit shadow-sm">
                  <h4 className="font-bold text-slate-800 text-sm border-b border-slate-200 pb-2">Sản phẩm và điều kiện cung cấp</h4>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1.5">
                      Sản phẩm gán <span className="text-rose-500">*</span>
                    </label>
                    <select
                      value={linkProductId}
                      onChange={(e) => setLinkProductId(e.target.value)}
                      className="block w-full px-3.5 py-2.5 rounded-lg border border-slate-300 bg-white text-sm outline-none focus:ring-2 focus:ring-amber-700/20 focus:border-amber-700"
                      required
                    >
                      <option value="">Chọn sản phẩm</option>
                      {products.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.name}
                        </option>
                      ))}
                    </select>
                  </div>
                  <Input
                    label="Giá nhập đề xuất (VND)"
                    type="number"
                    value={importPrice || ""}
                    onChange={(e) => setImportPrice(parseFloat(e.target.value) || 0)}
                    required
                  />
                  <Input
                    label="Đơn tối thiểu (MOQ)"
                    type="number"
                    value={minOrderQty || ""}
                    onChange={(e) => setMinOrderQty(parseInt(e.target.value) || 0)}
                    required
                  />
                  <p className="text-[11px] text-slate-500 -mt-3">Số lượng ít nhất nhà cung cấp chấp nhận cho mỗi lần đặt hàng.</p>
                  <Input
                    label="Thời gian giao hàng dự kiến (ngày)"
                    type="number"
                    value={leadTime || ""}
                    onChange={(e) => setLeadTime(parseInt(e.target.value) || 0)}
                    required
                  />
                  <p className="text-[11px] text-slate-500 -mt-3">Số ngày dự kiến từ lúc đặt hàng đến khi hàng về kho.</p>
                </div>

                {/* Right Column */}
                <div className="bg-slate-50 border border-slate-200 rounded-xl p-5 space-y-4 h-fit shadow-sm">
                  <div className="flex items-center gap-2 mb-1 border-b border-slate-200 pb-2">
                    <h4 className="font-bold text-slate-800 text-sm">Quy cách nhập hàng từ nhà cung cấp</h4>
                    <span className="px-2 py-0.5 rounded-md bg-slate-200 text-slate-600 text-[10px] font-semibold uppercase">Tùy chọn</span>
                  </div>
                  <div className="text-xs text-slate-600 space-y-1.5 mt-2 mb-3">
                    <p>Chỉ nhập khi nhà cung cấp đã báo rõ quy cách đóng gói. Nếu chưa có thông tin, có thể để trống và hệ thống dùng đơn vị tồn kho nội bộ.</p>
                    <div className="bg-slate-50 p-2 rounded border border-slate-200 mt-2">
                      <p className="font-semibold mb-1 text-slate-700">Ví dụ: Nếu nhà cung cấp bán theo bao 15kg, hãy chọn:</p>
                      <ul className="list-disc pl-4 space-y-0.5 text-slate-600">
                        <li>Đơn vị đặt hàng từ NCC: Bao</li>
                        <li>Khối lượng mỗi đơn vị: 15</li>
                        <li>Đơn vị khối lượng: kg</li>
                        <li>Đơn vị tồn kho nội bộ: gram</li>
                      </ul>
                    </div>
                  </div>
                  
                  <div className="grid grid-cols-1 gap-3">
                    <div>
                      <label className="block text-xs font-medium text-slate-600 mb-1">Đơn vị đặt hàng từ NCC</label>
                      <select
                        value={purchaseUnit}
                        onChange={(e) => setPurchaseUnit(e.target.value)}
                        className="block w-full px-2.5 py-2 rounded-lg border border-slate-300 bg-white text-sm outline-none focus:ring-2 focus:ring-amber-700/20 focus:border-amber-700"
                      >
                        <option value="">Ví dụ: Thùng, Bao, Cuộn, kg</option>
                        {ALLOWED_PRODUCT_UNITS.map((item) => (
                          <option key={item} value={item}>{item}</option>
                        ))}
                      </select>
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block text-xs font-medium text-slate-600 mb-1">Khối lượng mỗi đơn vị</label>
                        <input
                          type="number"
                          min="0.01"
                          step="0.01"
                          value={conversionQtyStr}
                          onChange={(e) => setConversionQtyStr(e.target.value)}
                          placeholder="Ví dụ: 15"
                          className="block w-full px-2.5 py-2 rounded-lg border border-slate-300 bg-white text-sm outline-none focus:ring-2 focus:ring-amber-700/20 focus:border-amber-700"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-slate-600 mb-1">Đơn vị khối lượng</label>
                        <select
                          value={weightUnit}
                          onChange={(e) => setWeightUnit(e.target.value)}
                          className="block w-full px-2.5 py-2 rounded-lg border border-slate-300 bg-white text-sm outline-none focus:ring-2 focus:ring-amber-700/20 focus:border-amber-700"
                        >
                          <option value="">Ví dụ: kg, gram</option>
                          {ALLOWED_PRODUCT_UNITS.map((item) => (
                            <option key={item} value={item}>{item}</option>
                          ))}
                        </select>
                      </div>
                      <div className="col-span-2">
                        <label className="block text-xs font-medium text-slate-600 mb-1">Đơn vị tồn kho nội bộ</label>
                        <select
                          value={conversionTargetUnit}
                          onChange={(e) => setConversionTargetUnit(e.target.value)}
                          className="block w-full px-2.5 py-2 rounded-lg border border-slate-300 bg-white text-sm outline-none focus:ring-2 focus:ring-amber-700/20 focus:border-amber-700"
                        >
                          <option value="">Ví dụ: hộp, kg, chai</option>
                          {ALLOWED_PRODUCT_UNITS.map((item) => (
                            <option key={item} value={item}>{item}</option>
                          ))}
                        </select>
                      </div>
                    </div>
                  </div>

                  {linkConversionWarning && (
                    <div className="flex items-start gap-2 rounded-lg bg-rose-50 border border-rose-200 px-3 py-2 text-xs font-medium text-rose-700">
                      <AlertTriangle size={14} className="shrink-0 mt-0.5" />
                      Vui lòng nhập đủ Đơn vị NCC, Khối lượng, Đơn vị khối lượng và Đơn vị tồn kho.
                    </div>
                  )}

                  {linkConversionError && (
                    <div className="flex items-start gap-2 rounded-lg bg-rose-50 border border-rose-200 px-3 py-2 text-xs font-medium text-rose-700">
                      <AlertTriangle size={14} className="shrink-0 mt-0.5" />
                      {convCalcResult?.error}
                    </div>
                  )}

                  {linkConversionPreview && (
                    <div className="rounded-lg bg-emerald-50 border border-emerald-200 px-3 py-2 text-xs font-semibold text-emerald-800 text-center">
                      Kết quả quy đổi: {linkConversionPreview}
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Footer */}
            <div className="mt-4 pt-4 flex justify-end gap-3 sticky bottom-[-20px] bg-white border-t border-slate-100 pb-2 z-10 shrink-0 px-2">
              <Button type="button" variant="outline" onClick={() => setIsLinkModalOpen(false)} className="w-28">
                Hủy
              </Button>
              <Button type="submit" isLoading={linkLoading} className="w-32">
                Gắn liên kết
              </Button>
            </div>
          </form>
        </Modal>
      )}

      {/* Confirm deletion */}
      <ConfirmDialog
        isOpen={!!deleteId && deleteType === "link"}
        onClose={() => {
          setDeleteId(null);
          setDeleteType(null);
        }}
        onConfirm={handleConfirmDelete}
        title="Hủy gán sản phẩm"
        message="Bạn có chắc chắn muốn gỡ bỏ gán liên kết sản phẩm này khỏi nhà cung cấp?"
        confirmText="Đồng ý xóa"
        cancelText="Hủy"
        type="danger"
        isLoading={isDeleting}
      />

      <ConfirmDialog
        isOpen={!!deleteId && deleteType === "supplier_deactivate"}
        onClose={() => {
          setDeleteId(null);
          setDeleteType(null);
        }}
        onConfirm={handleMakeInactive}
        title="Ngừng hoạt động nhà cung cấp"
        message={
          purchaseRequests.some(pr => pr.supplier?.id === deleteId && ['PENDING', 'APPROVED', 'SENT'].includes(pr.status))
            ? "Nhà cung cấp này đang có yêu cầu nhập hàng chưa hoàn tất. Nếu ngừng hoạt động, Agent sẽ không chọn NCC này cho yêu cầu mới, nhưng yêu cầu cũ vẫn cần admin xử lý."
            : "Bạn có chắc chắn muốn chuyển nhà cung cấp này sang trạng thái Ngừng hoạt động? Nhà cung cấp sẽ không bị xóa nhưng sẽ không được chọn để nhập hàng nữa."
        }
        confirmText="Ngừng hoạt động"
        cancelText="Hủy"
        type="warning"
        isLoading={isDeleting}
      />

      <ConfirmDialog
        isOpen={!!deleteId && deleteType === "supplier_activate"}
        onClose={() => {
          setDeleteId(null);
          setDeleteType(null);
        }}
        onConfirm={handleMakeActive}
        title="Mở hoạt động nhà cung cấp"
        message="Bạn có chắc chắn muốn mở lại hoạt động cho nhà cung cấp này? Nhà cung cấp sẽ có thể được chọn để nhập hàng lại bình thường."
        confirmText="Mở hoạt động"
        cancelText="Hủy"
        type="warning"
        isLoading={isDeleting}
      />
    </div>
  );
};
