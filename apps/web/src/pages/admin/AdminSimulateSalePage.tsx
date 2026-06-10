import React, { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { productsApi } from "../../api/products.api";
import { inventoryApi } from "../../api/inventory.api";
import { simulateSaleApi } from "../../api/simulateSale.api";
import type { Product } from "../../types/product.types";
import type { Inventory } from "../../types/inventory.types";
import { Button } from "../../components/common/Button";
import { Loading } from "../../components/common/Loading";
import { ConfirmDialog } from "../../components/common/ConfirmDialog";
import { Play, Sparkles, Terminal, Mail, RefreshCw, AlertTriangle, ShieldCheck } from "lucide-react";

export const AdminSimulateSalePage: React.FC = () => {
  const [products, setProducts] = useState<Product[]>([]);
  const [inventories, setInventories] = useState<Inventory[]>([]);
  const [selectedProductId, setSelectedProductId] = useState("");
  const [sellQuantity, setSellQuantity] = useState(5);
  
  const [isLoading, setIsLoading] = useState(true);
  const [showConfirm, setShowConfirm] = useState(false);
  const [isSimulating, setIsSimulating] = useState(false);
  const [apiError, setApiError] = useState<string | null>(null);

  // Result state
  const [result, setResult] = useState<{
    success: boolean;
    stockBefore: number;
    stockAfter: number;
    statusAfter: "OK" | "WARNING" | "NEED_RESTOCK";
    minThreshold: number;
    prCreated: boolean;
    prId?: string;
  } | null>(null);

  const loadData = async () => {
    try {
      setIsLoading(true);
      const [prods, invs] = await Promise.all([
        productsApi.getProducts(),
        inventoryApi.getInventories().catch(() => [] as Inventory[]),
      ]);
      setProducts(prods.filter((p) => p.isActive !== false));
      setInventories(invs);
    } catch (err) {
      setApiError("Không thể tải thông tin sản phẩm và kho.");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const selectedInventory = inventories.find((inv) => inv.productId === selectedProductId);
  const selectedProduct = products.find((p) => p.id === selectedProductId);

  const currentQty = selectedInventory?.quantity ?? 0;
  const threshold = selectedInventory?.minThreshold ?? selectedInventory?.min_threshold ?? 0;
  
  // Suggest a quantity to drop below threshold
  const suggestedQuantity = currentQty > threshold ? currentQty - threshold + 1 : 1;

  const handleSimulate = async () => {
    if (!selectedProductId || sellQuantity <= 0) return;
    setIsSimulating(true);
    setApiError(null);
    setResult(null);

    try {
      const res: any = await simulateSaleApi.simulateSale({
        productId: selectedProductId,
        quantity: sellQuantity,
      });

      // Calculate post-simulation status
      const postQty = currentQty - sellQuantity;
      let status: "OK" | "WARNING" | "NEED_RESTOCK" = "OK";
      if (postQty < threshold) {
        status = "NEED_RESTOCK";
      } else if (postQty === threshold) {
        status = "WARNING";
      }

      setResult({
        success: true,
        stockBefore: currentQty,
        stockAfter: Math.max(0, postQty),
        statusAfter: status,
        minThreshold: threshold,
        prCreated: !!(res?.purchaseRequestId || res?.purchaseRequest || res?.prCreated),
        prId: res?.purchaseRequestId || res?.purchaseRequest?.id || undefined,
      });

      // Refresh inventory stock values locally
      await loadData();
    } catch (err: any) {
      setApiError(err.response?.data?.message || err.message || "Lỗi khi chạy giả lập bán hàng.");
    } finally {
      setIsSimulating(false);
      setShowConfirm(false);
    }
  };

  if (isLoading) {
    return <Loading message="Đang tải cấu hình bán giả lập..." />;
  }

  return (
    <div className="max-w-2xl mx-auto flex flex-col gap-6">
      {apiError && (
        <div className="p-4 bg-rose-50 border border-rose-200 text-rose-800 text-sm font-semibold rounded-2xl">
          {apiError}
        </div>
      )}

      {/* Main Form container */}
      <div className="bg-white border border-slate-100 rounded-3xl p-6 sm:p-8 shadow-sm space-y-6">
        <div className="flex items-center justify-between border-b border-slate-100 pb-3">
          <h3 className="text-lg font-black text-slate-800 flex items-center gap-2">
            <Play size={20} className="text-amber-800" /> Giả lập bán hàng (Simulate Sale)
          </h3>
          <button onClick={loadData} className="p-1.5 text-slate-400 hover:text-slate-700 rounded-lg hover:bg-slate-50">
            <RefreshCw size={14} />
          </button>
        </div>

        <div className="space-y-4">
          {/* Select Product */}
          <div>
            <label className="block text-sm font-medium text-slate-750 mb-1.5 font-semibold">Chọn sản phẩm</label>
            <select
              value={selectedProductId}
              onChange={(e) => {
                setSelectedProductId(e.target.value);
                setResult(null);
              }}
              className="block w-full px-3.5 py-2.5 rounded-lg border border-slate-300 bg-white text-sm outline-none focus:ring-2 focus:ring-amber-700/20 focus:border-amber-700"
            >
              <option value="">-- Chọn sản phẩm --</option>
              {products.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </div>

          {/* Current Stock info panel */}
          {selectedProductId && (
            <div className="grid grid-cols-2 gap-4 p-4.5 bg-slate-55 border border-slate-100 rounded-xl text-sm">
              <div>
                <span className="text-xs text-slate-400 font-medium block">Tồn kho hiện tại:</span>
                <span className="text-base font-bold text-slate-800">
                  {currentQty} {selectedProduct?.unit || "hộp"}
                </span>
              </div>
              <div>
                <span className="text-xs text-slate-400 font-medium block">Ngưỡng tối thiểu:</span>
                <span className="text-base font-bold text-slate-800">
                  {threshold} {selectedProduct?.unit || "hộp"}
                </span>
              </div>

              {/* Suggestion banner */}
              {currentQty > threshold ? (
                <div className="col-span-2 mt-2 pt-2 border-t border-slate-150 text-xs text-amber-850 font-medium flex items-center gap-1.5">
                  <Sparkles size={14} className="text-amber-800 animate-pulse" />
                  Gợi ý: Nhập số lượng từ <strong className="underline">{suggestedQuantity}</strong> trở lên để kích hoạt cảnh báo tồn kho thấp.
                </div>
              ) : (
                <div className="col-span-2 mt-2 pt-2 border-t border-slate-150 text-xs text-rose-700 font-medium flex items-center gap-1.5">
                  <AlertTriangle size={14} className="text-rose-500 animate-pulse" />
                  Sản phẩm hiện đang dưới ngưỡng an toàn!
                </div>
              )}
            </div>
          )}

          {/* Quantity to sell */}
          {selectedProductId && (
            <div>
              <label className="block text-sm font-medium text-slate-750 mb-1.5 font-semibold">Số lượng bán giả lập</label>
              <div className="flex gap-2">
                <input
                  type="number"
                  min={1}
                  value={sellQuantity || ""}
                  onChange={(e) => setSellQuantity(parseInt(e.target.value) || 0)}
                  className="block px-3.5 py-2.5 rounded-lg border border-slate-300 text-sm outline-none focus:ring-2 focus:ring-amber-700/20 focus:border-amber-700 max-w-[120px]"
                />
                <Button
                  onClick={() => setSellQuantity(suggestedQuantity)}
                  variant="outline"
                  className="text-xs font-semibold"
                >
                  Sử dụng gợi ý ({suggestedQuantity})
                </Button>
              </div>
            </div>
          )}
        </div>

        {selectedProductId && (
          <div className="pt-4 border-t border-slate-100 flex justify-end">
            <Button
              onClick={() => setShowConfirm(true)}
              className="px-6 py-3"
              disabled={sellQuantity <= 0}
            >
              Chạy giả lập bán hàng
            </Button>
          </div>
        )}
      </div>

      {/* Result Container */}
      {result && (
        <div className="bg-white border border-slate-100 rounded-3xl p-6 sm:p-8 shadow-md space-y-5">
          <h4 className="font-bold text-slate-800 border-b border-slate-100 pb-2">Kết quả mô phỏng bán</h4>
          
          <div className="grid grid-cols-3 gap-4 text-center">
            <div className="p-3 bg-slate-50 border border-slate-100 rounded-xl">
              <span className="text-[10px] text-slate-400 block font-medium">Kho trước bán</span>
              <strong className="text-base text-slate-700">{result.stockBefore}</strong>
            </div>
            <div className="p-3 bg-slate-50 border border-slate-100 rounded-xl">
              <span className="text-[10px] text-slate-400 block font-medium">Kho sau bán</span>
              <strong className="text-base text-slate-700">{result.stockAfter}</strong>
            </div>
            <div className="p-3 bg-slate-50 border border-slate-100 rounded-xl">
              <span className="text-[10px] text-slate-400 block font-medium">Trạng thái kho</span>
              <div className="mt-0.5">
                {result.statusAfter === "NEED_RESTOCK" ? (
                  <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold bg-rose-50 border border-rose-200 text-rose-800">Cần nhập hàng</span>
                ) : result.statusAfter === "WARNING" ? (
                  <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold bg-orange-50 border border-orange-250 text-orange-850">Cảnh báo</span>
                ) : (
                  <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-50 border border-emerald-200 text-emerald-800">Bình thường</span>
                )}
              </div>
            </div>
          </div>

          {result.prCreated ? (
            <div className="p-4 bg-amber-50 border border-amber-250 text-amber-900 rounded-xl space-y-3">
              <p className="text-xs font-semibold flex items-center gap-1.5">
                <Sparkles size={14} className="text-amber-700 animate-pulse" />
                AI Agent phát hiện tồn kho thấp và đã tạo thành công dự thảo đề xuất nhập hàng (Purchase Request)!
              </p>
              <div className="flex items-center gap-3">
                {result.prId && (
                  <Link to={`/admin/purchase-requests/${result.prId}`}>
                    <Button size="sm" className="bg-amber-800 hover:bg-amber-900 text-xs flex items-center gap-1 border-none text-white">
                      <Mail size={12} /> Xem Purchase Request
                    </Button>
                  </Link>
                )}
                <Link to="/admin/agent-logs">
                  <Button size="sm" variant="outline" className="text-xs flex items-center gap-1 border-amber-300 text-amber-900 hover:bg-amber-50/50 bg-white">
                    <Terminal size={12} /> Xem Agent Logs
                  </Button>
                </Link>
              </div>
            </div>
          ) : (
            <div className="p-4 bg-slate-50 border border-slate-200 text-slate-650 rounded-xl text-xs flex items-center gap-1.5">
              <ShieldCheck size={14} className="text-emerald-600" />
              Tồn kho sau bán vẫn ở mức an toàn. AI Agent không tạo Purchase Request mới.
            </div>
          )}
        </div>
      )}

      {/* Confirmation Dialog */}
      <ConfirmDialog
        isOpen={showConfirm}
        onClose={() => setShowConfirm(false)}
        onConfirm={handleSimulate}
        title="Xác nhận giả lập bán"
        message={`Bạn muốn giả lập bán hàng với số lượng ${sellQuantity} cho sản phẩm ${selectedProduct?.name}? Giao dịch này sẽ cập nhật kho thực tế và kích hoạt AI Agent kiểm định.`}
        confirmText="Chạy mô phỏng"
        cancelText="Hủy"
        type="warning"
        isLoading={isSimulating}
      />
    </div>
  );
};
