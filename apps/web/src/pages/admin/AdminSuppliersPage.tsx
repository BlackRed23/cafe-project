import React, { useState, useEffect } from "react";
import { suppliersApi } from "../../api/suppliers.api";
import { productsApi } from "../../api/products.api";
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
import { Plus, Edit2, Trash2, Link2, Truck, Coffee } from "lucide-react";

export const AdminSuppliersPage: React.FC = () => {
  const toast = useToast();
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [supplierProducts, setSupplierProducts] = useState<SupplierProduct[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchSup, setSearchSup] = useState("");
  const [searchProd, setSearchProd] = useState("");

  // Supplier modal states
  const [selectedSupplier, setSelectedSupplier] = useState<Supplier | null>(null);
  const [isSupplierModalOpen, setIsSupplierModalOpen] = useState(false);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [address, setAddress] = useState("");
  const [modalLoading, setModalLoading] = useState(false);

  // Link product modal states
  const [isLinkModalOpen, setIsLinkModalOpen] = useState(false);
  const [linkSupplierId, setLinkSupplierId] = useState("");
  const [linkProductId, setLinkProductId] = useState("");
  const [importPrice, setImportPrice] = useState(0);
  const [minOrderQty, setMinOrderQty] = useState(1);
  const [leadTime, setLeadTime] = useState(3);
  const [priorityScore, setPriorityScore] = useState(1);
  const [linkLoading, setLinkLoading] = useState(false);

  // Confirm delete states
  const [deleteType, setDeleteType] = useState<"supplier" | "link" | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const fetchData = async () => {
    try {
      setIsLoading(true);
      const [sups, prodLinks, prods] = await Promise.all([
        suppliersApi.getSuppliers(),
        suppliersApi.getSupplierProducts().catch(() => [] as SupplierProduct[]),
        productsApi.getProducts().catch(() => [] as Product[]),
      ]);
      setSuppliers(sups);
      setSupplierProducts(prodLinks);
      setProducts(prods);
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
    } else {
      setSelectedSupplier(null);
      setName("");
      setEmail("");
      setPhone("");
      setAddress("");
    }
    setIsSupplierModalOpen(true);
  };

  const handleCloseSupplierModal = () => {
    setIsSupplierModalOpen(false);
    setSelectedSupplier(null);
  };

  const handleSupplierSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setModalLoading(true);
    const payload = { name, email, phone, address };

    try {
      if (selectedSupplier) {
        await suppliersApi.updateSupplier(selectedSupplier.id, payload);
        toast.success("Cập nhật thành công", `Nhà cung cấp "${payload.name}" đã được cập nhật.`);
      } else {
        await suppliersApi.createSupplier(payload);
        toast.success("Tạo thành công", `Nhà cung cấp "${payload.name}" đã được thêm mới.`);
      }
      await fetchData();
      handleCloseSupplierModal();
    } catch (err) {
      toast.error("Thao tác thất bại", "Lỗi khi lưu thông tin nhà cung cấp.");
    } finally {
      setModalLoading(false);
    }
  };

  const handleOpenLinkModal = (supplierId: string) => {
    setLinkSupplierId(supplierId);
    setLinkProductId("");
    setImportPrice(50000);
    setMinOrderQty(10);
    setLeadTime(3);
    setPriorityScore(1);
    setIsLinkModalOpen(true);
  };

  const handleLinkSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!linkProductId) return;
    setLinkLoading(true);

    const payload = {
      supplierId: linkSupplierId,
      supplier_id: linkSupplierId,
      productId: linkProductId,
      product_id: linkProductId,
      importPrice,
      import_price: importPrice,
      minOrderQuantity: minOrderQty,
      min_order_quantity: minOrderQty,
      leadTime,
      lead_time: leadTime,
      priorityScore,
      priority_score: priorityScore,
    };

    try {
      await suppliersApi.createSupplierProduct(payload);
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
      if (deleteType === "supplier") {
        await suppliersApi.deleteSupplier(deleteId);
        toast.success("Xóa thành công", "Nhà cung cấp đã được xóa.");
      } else {
        await suppliersApi.deleteSupplierProduct(deleteId);
        toast.success("Gỡ liên kết thành công", "Đã gỡ sản phẩm khỏi nhà cung cấp.");
      }
      await fetchData();
      setDeleteId(null);
      setDeleteType(null);
    } catch (err) {
      toast.error("Thao tác thất bại", "Lỗi khi thực hiện xóa.");
    } finally {
      setIsDeleting(false);
    }
  };

  if (isLoading) {
    return <Loading message="Đang tải danh sách nhà cung cấp..." />;
  }

  const filteredSuppliers = suppliers.filter((sup) =>
    sup.name.toLowerCase().includes(searchSup.toLowerCase())
  );

  const filteredSupplierProducts = supplierProducts.filter((sp) => {
    const sName = suppliers.find((s) => s.id === (sp.supplierId || sp.supplier_id))?.name || "";
    const pName = products.find((p) => p.id === (sp.productId || sp.product_id))?.name || "";
    return sName.toLowerCase().includes(searchProd.toLowerCase()) || pName.toLowerCase().includes(searchProd.toLowerCase());
  });

  const supplierColumns = [
    {
      header: "Nhà cung cấp",
      render: (sup: Supplier) => (
        <div className="flex items-center gap-2">
          <Truck className="text-slate-400" size={16} />
          <span className="font-semibold text-slate-800">{sup.name}</span>
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
          >
            <Edit2 size={15} />
          </button>
          <button
            onClick={() => {
              setDeleteType("supplier");
              setDeleteId(sup.id);
            }}
            className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg"
          >
            <Trash2 size={15} />
          </button>
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
      header: "Đơn đặt tối thiểu (MOQ)",
      render: (sp: SupplierProduct) => <span>{sp.minOrderQuantity ?? sp.min_order_quantity ?? 0}</span>,
    },
    {
      header: "Lead Time",
      render: (sp: SupplierProduct) => <span>{sp.leadTime ?? sp.lead_time ?? 0} ngày</span>,
    },
    {
      header: "Điểm ưu tiên",
      render: (sp: SupplierProduct) => {
        const score = sp.priorityScore ?? sp.priority_score ?? 1;
        return <span className="font-bold text-emerald-600">{score}/10</span>;
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
          <Coffee size={18} className="text-amber-800" /> Bảng gán sản phẩm & Giá nhập
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
          size="sm"
        >
          <form onSubmit={handleSupplierSubmit} className="space-y-4">
            <Input label="Tên nhà cung cấp" value={name} onChange={(e) => setName(e.target.value)} required />
            <Input label="Email liên hệ" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
            <Input label="Số điện thoại" value={phone} onChange={(e) => setPhone(e.target.value)} />
            <Input label="Địa chỉ" value={address} onChange={(e) => setAddress(e.target.value)} />

            <div className="pt-3 border-t border-slate-100 flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={handleCloseSupplierModal}>
                Hủy
              </Button>
              <Button type="submit" isLoading={modalLoading}>
                Lưu lại
              </Button>
            </div>
          </form>
        </Modal>
      )}

      {/* Link Product Modal */}
      {isLinkModalOpen && (
        <Modal isOpen={true} onClose={() => setIsLinkModalOpen(false)} title="Gán sản phẩm cho nhà cung cấp" size="sm">
          <form onSubmit={handleLinkSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">Sản phẩm gán</label>
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

            <div className="grid grid-cols-2 gap-4">
              <Input
                label="Đơn tối thiểu (MOQ)"
                type="number"
                value={minOrderQty || ""}
                onChange={(e) => setMinOrderQty(parseInt(e.target.value) || 0)}
                required
              />
              <Input
                label="Lead Time (ngày)"
                type="number"
                value={leadTime || ""}
                onChange={(e) => setLeadTime(parseInt(e.target.value) || 0)}
                required
              />
            </div>

            <Input
              label="Điểm ưu tiên (Priority Score)"
              type="number"
              min={1}
              max={10}
              value={priorityScore || ""}
              onChange={(e) => setPriorityScore(parseInt(e.target.value) || 1)}
              required
            />

            <div className="pt-3 border-t border-slate-100 flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => setIsLinkModalOpen(false)}>
                Hủy
              </Button>
              <Button type="submit" isLoading={linkLoading}>
                Gán liên kết
              </Button>
            </div>
          </form>
        </Modal>
      )}

      {/* Confirm deletion */}
      <ConfirmDialog
        isOpen={!!deleteId}
        onClose={() => {
          setDeleteId(null);
          setDeleteType(null);
        }}
        onConfirm={handleConfirmDelete}
        title={deleteType === "supplier" ? "Xóa nhà cung cấp" : "Hủy gán sản phẩm"}
        message={
          deleteType === "supplier"
            ? "Bạn có chắc chắn muốn xóa nhà cung cấp này khỏi danh mục? Tất cả các liên kết sản phẩm của nhà cung cấp này cũng sẽ bị gỡ bỏ."
            : "Bạn có chắc chắn muốn gỡ bỏ gán liên kết sản phẩm này khỏi nhà cung cấp?"
        }
        confirmText="Đồng ý xóa"
        cancelText="Hủy"
        type="danger"
        isLoading={isDeleting}
      />
    </div>
  );
};
