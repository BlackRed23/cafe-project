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
import { Play, Terminal, Mail, RefreshCw, Info } from "lucide-react";

import { useToast } from "../../contexts/ToastContext";

const LAST_SIMULATION_TRANSACTION_KEY = "lastSimulationTransactionId";

export const AdminSimulateSalePage: React.FC = () => {
  const [products, setProducts] = useState<Product[]>([]);
  const [inventories, setInventories] = useState<Inventory[]>([]);
  const [selectedProductId, setSelectedProductId] = useState("");
  const [multiMode, setMultiMode] = useState(false);
  const [items, setItems] = useState<Array<{ productId: string; quantity: number }>>([]);
  // inputMode: "MANUAL" = 1 sản phẩm thủ công, "MULTI" = nhiều sản phẩm thủ công, "RANDOM" = random preview
  const [inputMode, setInputMode] = useState<'MANUAL' | 'MULTI' | 'RANDOM'>('MANUAL');
  const [randomProductCount, setRandomProductCount] = useState(3);
  const [randomMinQty, setRandomMinQty] = useState(1);
  const [randomMaxQty, setRandomMaxQty] = useState(10);
  const [randomPreviewReady, setRandomPreviewReady] = useState(false);
  const [simulationMode, setSimulationMode] = useState<"ONE_DAY" | "WEEK" | "MONTH" | "CUSTOM_RANGE">("ONE_DAY");
  const [dailySimulatedQuantity, setDailySimulatedQuantity] = useState(5);
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [note, setNote] = useState("");

  const [isLoading, setIsLoading] = useState(true);
  const [showConfirm, setShowConfirm] = useState(false);
  const [isSimulating, setIsSimulating] = useState(false);
  const [isRestoring, setIsRestoring] = useState(false);
  const [apiError, setApiError] = useState<string | null>(null);

  const toast = useToast();

  // Result state (legacy single-product)
  const [_result, setResult] = useState<{
    success: boolean;
    productId?: string;
    inventoryId?: string;
    transactionId?: string;
    productName?: string;
    stockBefore: number;
    stockAfter: number;
    decreasedQuantity: number;
    restored?: boolean;
    restoredStock?: number;
    restoreTransactionId?: string;
    statusAfter: "OK" | "WARNING" | "NEED_RESTOCK";
    minThreshold: number;
    prCreated: boolean;
    prId?: string;
    prNumber?: string;
    hasNoSupplierSkip?: boolean;
    hasDuplicateSkip?: boolean;
    hasAgentWarning?: boolean;
    hasAgentFailed?: boolean;
    scanSessionId?: string;
    agentWarning?: string;
    cooldownRemainingSeconds?: number;
    activeScanSessionId?: string;
    agentLogs?: any[];
  } | null>(null);

  // Multi-product simulation results
  const [simulationProductResults, setSimulationProductResults] = useState<any[]>([]);
  const [_lastSubmittedItems, setLastSubmittedItems] = useState<Array<{ productId: string; quantity: number }>>([]);

  const [pendingRestores, setPendingRestores] = useState<any[]>([]);
  const [selectedRestoreId, setSelectedRestoreId] = useState("");

  const loadData = async (hydratePendingRestore = false) => {
    try {
      setIsLoading(true);
      const [prods, invs, pendingResponse] = await Promise.all([
        productsApi.getProducts(),
        inventoryApi.getInventories().catch(() => [] as Inventory[]),
        hydratePendingRestore ? simulateSaleApi.getPendingRestore().catch(() => null) : Promise.resolve(null),
      ]);
      setProducts(prods.filter((p) => p.isActive !== false));
      setInventories(invs);

      const pendingList = pendingResponse?.pendingRestores || [];
      if (pendingList.length > 0) {
        const grouped = new Map<string, any>();
        for (const t of pendingList) {
          if (!grouped.has(t.productId)) {
            grouped.set(t.productId, {
              productId: t.productId,
              productName: t.productName,
              unit: t.unit || "đơn vị",
              totalDecreasedQuantity: 0,
              transactionIds: [],
              stockAfter: t.stockAfter,
            });
          }
          const g = grouped.get(t.productId);
          g.totalDecreasedQuantity += t.decreasedQuantity;
          g.transactionIds.push(t.transactionId);
        }
        setPendingRestores(Array.from(grouped.values()));
        localStorage.setItem(LAST_SIMULATION_TRANSACTION_KEY, pendingList[0].transactionId);
      } else {
        setPendingRestores([]);
        if (hydratePendingRestore) {
          localStorage.removeItem(LAST_SIMULATION_TRANSACTION_KEY);
        }
      }
    } catch (err) {
      setApiError("Không thể tải thông tin sản phẩm và kho.");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadData(true);
  }, []);

  const selectedInventory = inventories.find((inv) => inv.productId === selectedProductId);
  const selectedProduct = products.find((p) => p.id === selectedProductId);

  const currentQty = selectedInventory?.quantity ?? 0;
  const threshold = selectedInventory?.minThreshold ?? selectedInventory?.min_threshold ?? 0;
  // Compute availableStock per rules
  const availableStock = selectedInventory?.availableStock ??
    (selectedInventory?.quantity ?? 0) - (selectedInventory?.reservedStock ?? selectedInventory?.reserved_stock ?? 0);
  let unit = selectedProduct?.unit || "đơn vị";
  if (unit.toLowerCase() === "ly") unit = "đơn vị";

  let localNumberOfDays = 1;
  if (simulationMode === "WEEK") localNumberOfDays = 7;
  else if (simulationMode === "MONTH") localNumberOfDays = 30;
  else if (simulationMode === "CUSTOM_RANGE" && startDate && endDate) {
    const start = new Date(startDate);
    const end = new Date(endDate);
    const diffTime = end.getTime() - start.getTime();
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    localNumberOfDays = diffDays >= 0 ? diffDays + 1 : 0;
  } else if (simulationMode === "CUSTOM_RANGE") {
    localNumberOfDays = 0;
  }
  const localSimulatedDemand = localNumberOfDays * (dailySimulatedQuantity || 0);

  const handleSimulate = async () => {
    // Validate before simulation
    if (isSimulating) {
      return;
    }
    if (multiMode) {
      const validItems = items.filter(i => i.productId?.trim() && i.quantity > 0);
      if (validItems.length === 0) {
        toast.error('Vui lòng chọn ít nhất một sản phẩm để mô phỏng.');
        return;
      }
      const duplicated = validItems.find((item, idx) =>
        validItems.findIndex(i => i.productId === item.productId) !== idx
      );
      if (duplicated) {
        toast.error('Không được chọn trùng sản phẩm trong cùng một lần mô phỏng.');
        return;
      }
      const overStock = validItems.find(item => {
        const inv = inventories.find(i => i.productId === item.productId);
        const available = inv?.availableStock ?? ((inv?.quantity ?? 0) - (inv?.reservedStock ?? 0));
        return item.quantity > (available ?? 0);
      });
      if (overStock) {
        toast.error('Số lượng mô phỏng không được vượt quá tồn kho khả dụng.');
        return;
      }
    } else {
      if (!selectedProductId) {
        toast.error('Vui lòng chọn sản phẩm để mô phỏng.');
        return;
      }
      if (localSimulatedDemand <= 0) {
        toast.error('Số lượng mô phỏng phải lớn hơn 0.');
        return;
      }
      const inv = inventories.find(i => i.productId === selectedProductId);
      const available = inv?.availableStock ?? ((inv?.quantity ?? 0) - (inv?.reservedStock ?? 0));
      if (localSimulatedDemand > (available ?? 0)) {
        toast.error('Số lượng mô phỏng không được vượt quá tồn kho khả dụng.');
        return;
      }
    }
    setIsSimulating(true);
    setApiError(null);
    setResult(null);
    setSimulationProductResults([]);

    try {
      // Prepare payload based on mode
      const payload = multiMode
        ? { items }
        : { productId: selectedProductId, quantity: localSimulatedDemand };
      // Call simulate sale API
      const res = await simulateSaleApi.simulateSale(payload);

      const affectedProducts: any[] = res?.affectedProducts ?? (res?.affectedProduct ? [res.affectedProduct] : []);
      const allLogs: any[] = res?.agentLogs ?? res?.agentResults ?? [];
      const createdPRs: any[] = res?.createdPurchaseRequests ?? [];
      const scanSessionId = res?.scanSessionId;

      // Helper to parse JSON safely
      const parseJson = (val: any) => {
        if (typeof val === 'string') { try { return JSON.parse(val); } catch { return null; } }
        return val;
      };

      // Helper to resolve agent status from logs
      const resolveAgentStatus = (logs: any[]): string => {
        for (const log of logs) {
          const output = parseJson(log.output);
          if (log.result === 'CREATED_PURCHASE_REQUEST' || log.action === 'CREATE_PURCHASE_REQUEST' || output?.action === 'CREATE_PURCHASE_REQUEST') return 'CREATED_PURCHASE_REQUEST';
        }
        for (const log of logs) {
          const output = parseJson(log.output);
          if (log.result === 'SKIPPED_DUPLICATE' || output?.reason === 'ACTIVE_PR_EXISTS' || log.reasonCode === 'ACTIVE_PR_EXISTS' || log.result === 'ACTIVE_PR_EXISTS') return 'SKIPPED_DUPLICATE';
        }
        for (const log of logs) {
          const output = parseJson(log.output);
          if (log.result === 'NO_SUPPLIER' || log.result === 'SUPPLIER_NOT_FOUND' || log.result === 'SUPPLIER_PRODUCTS_EMPTY' || output?.reason === 'NO_SUPPLIERS_MAPPED' || output?.reason === 'SUPPLIERS_INACTIVE' || output?.reason === 'SUPPLIER_MISSING') return 'NO_SUPPLIER';
        }
        for (const log of logs) {
          if (log.status === 'FAILED') return 'FAILED';
        }
        for (const log of logs) {
          if (log.reason === 'STOCK_OK' || log.result === 'STOCK_OK' || log.reason === 'ABOVE_THRESHOLD' || log.result === 'ABOVE_THRESHOLD') return 'STOCK_OK';
        }
        return logs.length > 0 ? 'PROCESSED' : 'UNKNOWN';
      };

      // Helper to resolve agent message
      const resolveAgentMessage = (status: string): string => {
        switch (status) {
          case 'CREATED_PURCHASE_REQUEST': return 'Đã tạo yêu cầu nhập hàng';
          case 'SKIPPED_DUPLICATE': return 'Đã có yêu cầu nhập hàng đang xử lý';
          case 'NO_SUPPLIER': return 'Thiếu nhà cung cấp hợp lệ';
          case 'FAILED': return 'Xử lý thất bại';
          case 'STOCK_OK': return 'Tồn kho an toàn';
          case 'PROCESSED': return 'Đã xử lý';
          default: return 'Chưa có kết quả';
        }
      };

      // Build submitted items list
      const submittedItems = multiMode
        ? items.filter(i => i.productId?.trim() && i.quantity > 0)
        : [{ productId: selectedProductId, quantity: localSimulatedDemand }];

      // Build per-product results
      const productResults = submittedItems.map((item) => {
        const product = products.find(p => p.id === item.productId);
        const affected = affectedProducts.find((x: any) => x.productId === item.productId);
        const inv = inventories.find(i => i.productId === item.productId);

        // Filter agent logs for this product
        const productLogs = allLogs.filter((log: any) => {
          const input = parseJson(log.input);
          const output = parseJson(log.output);
          return (
            log.productId === item.productId ||
            input?.productId === item.productId ||
            output?.productId === item.productId ||
            log.productName === product?.name ||
            input?.productName === product?.name ||
            output?.productName === product?.name
          );
        });

        // Find purchase request for this product
        const pr = createdPRs.find((p: any) =>
          p.productId === item.productId ||
          p.inventory?.productId === item.productId ||
          p.items?.some((prItem: any) => prItem.inventory?.productId === item.productId)
        );

        const agentStatus = resolveAgentStatus(productLogs);
        let pUnit = product?.unit || affected?.unit || 'đơn vị';
        if (pUnit.toLowerCase() === 'ly') pUnit = 'đơn vị';

        const stockBefore = affected?.stockBefore ?? affected?.previousQuantity;
        const stockAfter = affected?.stockAfter ?? affected?.newQuantity;
        const reservedBefore = inv?.reservedStock ?? inv?.reserved_stock ?? 0;
        const availableBefore = stockBefore != null ? stockBefore - reservedBefore : undefined;
        const availableAfter = stockAfter != null ? stockAfter - reservedBefore : undefined;

        return {
          productId: item.productId,
          productName: product?.name ?? affected?.productName ?? 'Sản phẩm',
          unit: pUnit,
          simulatedQuantity: item.quantity,
          stockBefore,
          stockAfter,
          reservedStock: reservedBefore,
          availableBefore,
          availableAfter,
          decreasedQuantity: affected?.decreasedQuantity ?? item.quantity,
          minThreshold: affected?.minThreshold ?? inv?.minThreshold ?? inv?.min_threshold ?? 0,
          agentStatus,
          agentMessage: resolveAgentMessage(agentStatus),
          agentLogs: productLogs,
          purchaseRequest: pr,
          transactionId: affected?.transactionId,
          inventoryId: affected?.inventoryId,
          scanSessionId: productLogs[0]?.scanSessionId || scanSessionId,
        };
      });

      setSimulationProductResults(productResults);
      setLastSubmittedItems(submittedItems);

      // Also set the legacy single-product result for backward compat
      if (!multiMode && productResults.length === 1) {
        const pr = productResults[0];
        let status: "OK" | "WARNING" | "NEED_RESTOCK" = "OK";
        if ((pr.stockAfter ?? 0) < (pr.minThreshold ?? 0)) status = "NEED_RESTOCK";
        else if ((pr.stockAfter ?? 0) === (pr.minThreshold ?? 0)) status = "WARNING";

        setResult({
          success: true,
          productId: pr.productId,
          inventoryId: pr.inventoryId,
          transactionId: pr.transactionId,
          productName: pr.productName,
          stockBefore: pr.stockBefore ?? 0,
          stockAfter: pr.stockAfter ?? 0,
          decreasedQuantity: pr.decreasedQuantity,
          statusAfter: status,
          minThreshold: pr.minThreshold ?? 0,
          prCreated: !!pr.purchaseRequest,
          prId: pr.purchaseRequest?.id,
          prNumber: pr.purchaseRequest?.requestNumber || pr.purchaseRequest?.id,
          hasNoSupplierSkip: pr.agentStatus === 'NO_SUPPLIER',
          hasDuplicateSkip: pr.agentStatus === 'SKIPPED_DUPLICATE',
          hasAgentWarning: !!res?.agentWarning || res?.cooldownRemainingSeconds > 0 || !!res?.activeScanSessionId,
          hasAgentFailed: pr.agentStatus === 'FAILED',
          scanSessionId,
          agentWarning: res?.agentWarning,
          cooldownRemainingSeconds: res?.cooldownRemainingSeconds,
          activeScanSessionId: res?.activeScanSessionId,
          agentLogs: pr.agentLogs,
        });
      }

      /* ─── Toast notifications based on response ─── */
      if (multiMode) {
        toast.success("Mô phỏng thành công", `Đã mô phỏng ${submittedItems.length} sản phẩm. Xem kết quả chi tiết bên dưới.`);
      } else {
        const singleAfter = productResults[0]?.stockAfter ?? 0;
        toast.success("Mô phỏng thành công", `Tồn kho còn ${singleAfter} ${unit}.`);
      }

      if (createdPRs.length > 0) {
        const prCount = createdPRs.length;
        toast.success("Tạo yêu cầu tự động", prCount === 1
          ? `AI Agent đã tạo yêu cầu nhập hàng: ${createdPRs[0]?.requestNumber || createdPRs[0]?.id || ''}.`
          : `AI Agent đã tạo ${prCount} yêu cầu nhập hàng.`);
      } else {
        const hasNoSupplier = productResults.some(p => p.agentStatus === 'NO_SUPPLIER');
        const hasDuplicate = productResults.some(p => p.agentStatus === 'SKIPPED_DUPLICATE');
        if (hasNoSupplier) {
          toast.warning("Chưa có nhà cung cấp", "Có sản phẩm chưa được liên kết với nhà cung cấp nên AI Agent không thể tạo yêu cầu nhập hàng.");
        }
        if (hasDuplicate) {
          toast.info("Yêu cầu nhập hàng tồn tại", "Có sản phẩm đã có yêu cầu nhập hàng đang chờ xử lý.");
        }
      }

      // Stock warnings
      const lowStockProducts = productResults.filter(p => (p.stockAfter ?? 0) <= 0);
      const nearThreshold = productResults.filter(p => (p.stockAfter ?? 0) > 0 && (p.stockAfter ?? 0) < (p.minThreshold ?? 0));
      if (lowStockProducts.length > 0) {
        toast.error("Sản phẩm hết hàng", lowStockProducts.length === 1
          ? `${lowStockProducts[0].productName} đã hết hàng. Vui lòng kiểm tra yêu cầu nhập hàng.`
          : `${lowStockProducts.length} sản phẩm hết hàng. Vui lòng kiểm tra yêu cầu nhập hàng.`);
      }
      if (nearThreshold.length > 0) {
        toast.warning("Sản phẩm sắp hết hàng", nearThreshold.length === 1
          ? `${nearThreshold[0].productName} dưới ngưỡng cảnh báo.`
          : `${nearThreshold.length} sản phẩm dưới ngưỡng cảnh báo.`);
      }

      // Save transaction ID for restore
      const firstTransactionId = affectedProducts[0]?.transactionId ?? res?.transactionId;
      if (firstTransactionId) {
        localStorage.setItem(LAST_SIMULATION_TRANSACTION_KEY, firstTransactionId);
      }
      await loadData(false);
    } catch (err: any) {
      // Case Error toasts
      const status = err.response?.status;
      const message = err.response?.data?.message || err.message || "";

      if (status === 400 && (message.toLowerCase().includes("not enough") || message.toLowerCase().includes("inventory") || message.toLowerCase().includes("stock") || message.toLowerCase().includes("không đủ"))) {
        toast.error("Không đủ tồn kho", message || `Không đủ tồn kho để mô phỏng bán hàng. Tồn kho hiện tại: ${currentQty} ${unit}, yêu cầu: ${localSimulatedDemand} ${unit}.`);
      } else {
        toast.error("Lỗi giả lập", "Không thể mô phỏng bán hàng. Vui lòng kiểm tra kết nối server.");
      }

      setApiError(message || "Lỗi khi chạy giả lập bán hàng.");
    } finally {
      setIsSimulating(false);
      setShowConfirm(false);
    }
  };

  const handleRestoreSimulation = async () => {
    if (!selectedRestoreId || isRestoring) return;

    const itemToRestore = pendingRestores.find(r => r.productId === selectedRestoreId);
    if (!itemToRestore || !itemToRestore.transactionIds.length) return;

    setIsRestoring(true);
    setApiError(null);

    try {
      for (const tId of itemToRestore.transactionIds) {
        await simulateSaleApi.restoreSimulation(tId);
      }
      toast.success("Khôi phục sản phẩm mô phỏng thành công.");

      setSelectedRestoreId("");
      localStorage.removeItem(LAST_SIMULATION_TRANSACTION_KEY);
      await loadData(true);
    } catch (err: any) {
      const status = err.response?.status;
      const message = err.response?.data?.message || err.message || "Không thể khôi phục mô phỏng.";
      if (status === 409) {
        toast.warning("Mô phỏng đã được khôi phục", message);
      } else {
        toast.error("Khôi phục thất bại", message);
      }
      setApiError(message);
    } finally {
      setIsRestoring(false);
    }
  };


  // ---- Random Mode: generate preview items[] ----
  const handleGenerateRandom = () => {
    // Validate inputs
    if (!randomProductCount || randomProductCount < 1) {
      toast.error('Số sản phẩm không hợp lệ', 'Vui lòng nhập số sản phẩm cần random (tối thiểu 1).');
      return;
    }
    if (!randomMinQty || randomMinQty < 1 || !randomMaxQty || randomMaxQty < 1) {
      toast.error('Số lượng random không hợp lệ', 'Số lượng tối thiểu và tối đa phải lớn hơn 0.');
      return;
    }
    if (randomMinQty > randomMaxQty) {
      toast.error('Số lượng không hợp lệ', 'Số lượng tối thiểu không được lớn hơn số lượng tối đa.');
      return;
    }

    // Build pool of valid products
    const validPool = products
      .filter((p) => p.isActive !== false)
      .map((p) => {
        const inv = inventories.find((i) => i.productId === p.id);
        if (!inv) return null;
        const available = inv.availableStock ?? ((inv.quantity ?? 0) - (inv.reservedStock ?? inv.reserved_stock ?? 0));
        if (available <= 0) return null;
        return { product: p, available };
      })
      .filter(Boolean) as { product: Product; available: number }[];

    if (validPool.length === 0) {
      toast.error('Không có sản phẩm khả dụng', 'Không có sản phẩm nào có tồn kho khả dụng để random.');
      return;
    }

    // Shuffle
    const shuffled = [...validPool].sort(() => Math.random() - 0.5);
    const selected = shuffled.slice(0, Math.min(randomProductCount, shuffled.length));
    const actualCount = selected.length;

    // Generate random quantities
    const randomInt = (min: number, max: number) => Math.floor(Math.random() * (max - min + 1)) + min;
    const randomItems = selected.map(({ product, available }) => {
      const effectiveMax = Math.min(randomMaxQty, available);
      const effectiveMin = Math.min(randomMinQty, effectiveMax);
      const qty = randomInt(effectiveMin, effectiveMax);
      return { productId: product.id, quantity: qty };
    });

    // Apply to items list and switch to MULTI mode so the table shows
    setItems(randomItems);
    setMultiMode(true);
    setRandomPreviewReady(true);

    if (actualCount < randomProductCount) {
      toast.warning(
        'Không đủ sản phẩm hợp lệ',
        `Chỉ random được ${actualCount} sản phẩm do số lượng tồn khả dụng không đủ. Vui lòng kiểm tra preview trước khi Apply.`
      );
    } else {
      toast.info(
        'Đã tạo danh sách mô phỏng random',
        `Đã tạo ${actualCount} sản phẩm ngẫu nhiên. Chưa trừ kho — vui lòng kiểm tra và chỉnh sửa trước khi Apply Simulation.`
      );
    }
  };

  if (isLoading) {
    return <Loading message="Đang tải cấu hình bán giả lập..." />;
  }

  return (
    <div className="max-w-7xl mx-auto flex flex-col gap-6">
      {apiError && (
        <div className="p-4 bg-rose-50 border border-rose-200 text-rose-800 text-sm font-semibold rounded-2xl">
          {apiError}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
        {/* Left Column: Mô phỏng bán */}
        <section className="bg-white border border-slate-100 rounded-3xl p-6 sm:p-8 shadow-sm flex flex-col h-fit">
          <div className="border-b border-slate-100 pb-3 mb-6">
            <h3 className="text-lg font-black text-slate-800 flex items-center gap-2">
              <Play size={20} className="text-amber-800" /> Mô phỏng bán
            </h3>
            {/* ===== Mode Selector Tabs ===== */}
            <div className="mt-4 mb-2">
              <p className="text-xs font-semibold text-slate-500 mb-2 uppercase tracking-wide">Chế độ mô phỏng</p>
              <div className="flex gap-1 p-1 bg-slate-100 rounded-xl">
                <button
                  type="button"
                  onClick={() => {
                    setInputMode('MANUAL');
                    setMultiMode(false);
                    setRandomPreviewReady(false);
                  }}
                  className={`flex-1 py-2 px-3 rounded-lg text-sm font-semibold transition-all ${
                    inputMode === 'MANUAL'
                      ? 'bg-white text-slate-800 shadow-sm'
                      : 'text-slate-500 hover:text-slate-700'
                  }`}
                >
                  Thủ công
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setInputMode('MULTI');
                    setMultiMode(true);
                    setRandomPreviewReady(false);
                    if (items.length === 0) setItems([{ productId: '', quantity: 0 }]);
                  }}
                  className={`flex-1 py-2 px-3 rounded-lg text-sm font-semibold transition-all ${
                    inputMode === 'MULTI'
                      ? 'bg-white text-slate-800 shadow-sm'
                      : 'text-slate-500 hover:text-slate-700'
                  }`}
                >
                  Đa sản phẩm
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setInputMode('RANDOM');
                    setMultiMode(true);
                    setRandomPreviewReady(false);
                  }}
                  className={`flex-1 py-2 px-3 rounded-lg text-sm font-semibold transition-all ${
                    inputMode === 'RANDOM'
                      ? 'bg-white text-amber-800 shadow-sm'
                      : 'text-slate-500 hover:text-slate-700'
                  }`}
                >
                  Random
                </button>
              </div>
            </div>

            {/* ===== MANUAL mode: single product select ===== */}
            {inputMode === 'MANUAL' && (
              <div>
                <label className="block text-sm font-medium text-slate-750 mb-1.5 font-semibold">Chọn sản phẩm</label>
                <select
                  value={selectedProductId}
                  onChange={(e) => { setSelectedProductId(e.target.value); }}
                  className="block w-full px-3.5 py-2.5 rounded-lg border border-slate-300 bg-white text-sm outline-none focus:ring-2 focus:ring-amber-700/20 focus:border-amber-700"
                >
                  <option value="">-- Chọn sản phẩm cần mô phỏng --</option>
                  {products.map((p) => (
                    <option key={p.id} value={p.id}>{p.name}</option>
                  ))}
                </select>
              </div>
            )}

            {/* ===== RANDOM mode: config inputs + generate button ===== */}
            {inputMode === 'RANDOM' && (
              <div className="space-y-4">
                <div className="p-4 bg-amber-50 border border-amber-200 rounded-xl">
                  <p className="text-xs font-semibold text-amber-800 mb-3">
                    Cấu hình Random
                  </p>
                  <div className="grid grid-cols-3 gap-3">
                    <div>
                      <label className="block text-xs font-medium text-slate-600 mb-1">Số sản phẩm</label>
                      <input
                        type="number"
                        min={1}
                        max={products.length}
                        value={randomProductCount}
                        onChange={(e) => setRandomProductCount(parseInt(e.target.value) || 1)}
                        className="block w-full px-3 py-2 rounded-lg border border-amber-200 bg-white text-sm outline-none focus:ring-2 focus:ring-amber-700/20 focus:border-amber-700"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-slate-600 mb-1">SL tối thiểu</label>
                      <input
                        type="number"
                        min={1}
                        value={randomMinQty}
                        onChange={(e) => setRandomMinQty(parseInt(e.target.value) || 1)}
                        className="block w-full px-3 py-2 rounded-lg border border-amber-200 bg-white text-sm outline-none focus:ring-2 focus:ring-amber-700/20 focus:border-amber-700"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-slate-600 mb-1">SL tối đa</label>
                      <input
                        type="number"
                        min={1}
                        value={randomMaxQty}
                        onChange={(e) => setRandomMaxQty(parseInt(e.target.value) || 1)}
                        className="block w-full px-3 py-2 rounded-lg border border-amber-200 bg-white text-sm outline-none focus:ring-2 focus:ring-amber-700/20 focus:border-amber-700"
                      />
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={handleGenerateRandom}
                    className="mt-3 w-full py-2.5 px-4 bg-amber-700 hover:bg-amber-800 active:bg-amber-900 text-white text-sm font-semibold rounded-lg transition-colors"
                  >
                    Tạo danh sách random
                  </button>
                </div>

                {randomPreviewReady && items.length > 0 && (
                  <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl text-xs text-amber-800 font-medium flex items-center gap-2">
                    <Info size={14} className="shrink-0 text-amber-600" />
                    Danh sách random chỉ là preview, chưa trừ kho. Bấm Apply Simulation để mô phỏng bán.
                  </div>
                )}
              </div>
            )}

            {/* ===== MULTI / RANDOM: shared item list table ===== */}
            {(inputMode === 'MULTI' || (inputMode === 'RANDOM' && randomPreviewReady)) && items.length > 0 && (
              <div className="space-y-2">
                <div className="flex items-center justify-between mb-1">
                  <p className="text-xs font-semibold text-slate-600">
                    {inputMode === 'RANDOM' ? `Danh sách random (${items.length} sản phẩm)` : `Danh sách sản phẩm (${items.length})`}
                  </p>
                  {inputMode === 'MULTI' && (
                    <button
                      type="button"
                      onClick={() => setItems([...items, { productId: '', quantity: 0 }])}
                      className="text-xs px-2 py-1 bg-amber-600 hover:bg-amber-700 text-white rounded-lg font-medium transition-colors"
                    >
                      + Thêm dòng
                    </button>
                  )}
                </div>
                {/* Header row */}
                <div className="grid grid-cols-[1fr_100px_44px] gap-2 px-1">
                  <span className="text-[10px] font-semibold text-slate-400 uppercase">Sản phẩm</span>
                  <span className="text-[10px] font-semibold text-slate-400 uppercase text-center">Số lượng</span>
                  <span />
                </div>
                {items.map((item, idx) => {
                  const inv = inventories.find(i => i.productId === item.productId);
                  const available = inv ? (inv.availableStock ?? ((inv.quantity ?? 0) - (inv.reservedStock ?? inv.reserved_stock ?? 0))) : 0;
                  const isOverStock = item.quantity > available && available > 0;
                  return (
                    <div key={idx} className="grid grid-cols-[1fr_100px_44px] gap-2 items-center">
                      <select
                        value={item.productId}
                        onChange={(e) => {
                          const newItems = [...items];
                          newItems[idx] = { ...newItems[idx], productId: e.target.value };
                          setItems(newItems);
                        }}
                        className="block w-full px-3 py-2 rounded-lg border border-slate-300 bg-white text-sm outline-none focus:ring-2 focus:ring-amber-700/20 focus:border-amber-700"
                      >
                        <option value="">-- Chọn --</option>
                        {products.map((p) => (
                          <option key={p.id} value={p.id}>{p.name}</option>
                        ))}
                      </select>
                      <div className="relative">
                        <input
                          type="number"
                          min={1}
                          value={item.quantity || ''}
                          onChange={(e) => {
                            const val = parseInt(e.target.value) || 0;
                            const newItems = [...items];
                            newItems[idx] = { ...newItems[idx], quantity: val };
                            setItems(newItems);
                          }}
                          placeholder="SL"
                          className={`block w-full px-2 py-2 rounded-lg border text-sm text-center outline-none focus:ring-2 ${
                            isOverStock
                              ? 'border-rose-400 bg-rose-50 focus:ring-rose-200'
                              : 'border-slate-300 focus:ring-amber-700/20 focus:border-amber-700'
                          }`}
                        />
                        {item.productId && available > 0 && (
                          <span className="absolute -bottom-4 left-0 text-[9px] text-slate-400">max {available}</span>
                        )}
                      </div>
                      <button
                        type="button"
                        onClick={() => setItems(items.filter((_, i) => i !== idx))}
                        className="w-9 h-9 flex items-center justify-center rounded-lg border border-rose-200 bg-rose-50 text-rose-600 hover:bg-rose-100 transition-colors text-sm font-bold"
                        title="Xóa dòng"
                      >
                        ×
                      </button>
                    </div>
                  );
                })}
                {inputMode === 'MULTI' && (
                  <button
                    type="button"
                    onClick={() => setItems([...items, { productId: '', quantity: 0 }])}
                    className="mt-1 w-full py-2 border-2 border-dashed border-slate-300 text-slate-500 text-sm rounded-lg hover:border-amber-400 hover:text-amber-700 transition-colors"
                  >
                    + Thêm sản phẩm
                  </button>
                )}
              </div>
            )}

            {/* Placeholder when RANDOM but not generated yet */}
            {inputMode === 'RANDOM' && !randomPreviewReady && (
              <div className="flex flex-col items-center justify-center py-8 border-2 border-dashed border-amber-200 rounded-xl bg-amber-50">
                <p className="text-sm text-amber-800 font-medium">Nhập cấu hình và bấm <strong>Tạo danh sách random</strong></p>
                <p className="text-xs text-amber-600 mt-1">Danh sách sẽ hiển thị để kiểm tra trước khi Apply</p>
              </div>
            )}
            <p className="text-xs text-slate-500 mt-2 leading-relaxed">
              Chọn sản phẩm và nhập số lượng để mô phỏng bán hàng. Hệ thống sẽ dùng logic mô phỏng hiện có và kích hoạt AI Agent sau khi tồn kho thay đổi.
            </p>
          </div>

          <div className="flex-1 space-y-6">
            {!multiMode && selectedProductId && (
              <div className="space-y-6">
                {/* Inventory Card */}
                <div className="p-4 bg-amber-50 border border-amber-200 rounded-xl mb-4">
                  <div className="grid grid-cols-3 gap-2 text-sm">
                    <div>
                      <span className="block text-xs text-slate-600">Tồn kho thật</span>
                      <strong className="block text-base text-slate-800">{currentQty} {unit}</strong>
                    </div>
                    <div>
                      <span className="block text-xs text-slate-600">Đang giữ</span>
                      <strong className="block text-base text-slate-800">{selectedInventory?.reservedStock ?? selectedInventory?.reserved_stock ?? 0} {unit}</strong>
                    </div>
                    <div>
                      <span className="block text-xs text-slate-600">Khả dụng</span>
                      <strong className="block text-base text-slate-800">{availableStock} {unit}</strong>
                    </div>
                  </div>
                  {selectedInventory?.minThreshold ?? selectedInventory?.min_threshold ? (
                    <p className="mt-2 text-xs text-slate-600">Ngưỡng tối thiểu: {threshold} {unit}</p>
                  ) : null}
                  <p className="mt-1 text-xs font-medium">
                    Trạng thái: 
                    {availableStock <= 0 ? "Hết hàng" : availableStock < threshold ? "Dưới ngưỡng" : availableStock === threshold ? "Sắp chạm ngưỡng" : "Còn hàng"}
                  </p>
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-750 mb-1.5 font-semibold">Số lượng dự kiến bán mỗi ngày</label>
                  <div className="flex gap-2 items-center">
                    <input
                      type="number"
                      min={1}
                      value={dailySimulatedQuantity || ""}
                      onChange={(e) => { setDailySimulatedQuantity(parseInt(e.target.value) || 0); }}
                      disabled={availableStock <= 0}
                      className="block w-full px-3.5 py-2.5 rounded-lg border border-slate-300 text-sm outline-none focus:ring-2 focus:ring-amber-700/20 focus:border-amber-700"
                    />
                    <span className="text-sm font-medium text-slate-600 whitespace-nowrap">{unit}/ngày</span>
                  </div>
                  <p className="mt-1 text-xs text-slate-500">Có thể mô phỏng tối đa: {availableStock} {unit}</p>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-slate-750 mb-1.5 font-semibold">Thời gian mô phỏng</label>
                    <select
                      value={simulationMode}
                      onChange={(e) => { setSimulationMode(e.target.value as any); }}
                      className="block w-full px-3.5 py-2.5 rounded-lg border border-slate-300 bg-white text-sm outline-none focus:ring-2 focus:ring-amber-700/20 focus:border-amber-700"
                    >
                      <option value="ONE_DAY">1 Ngày</option>
                      <option value="WEEK">1 Tuần (7 ngày)</option>
                      <option value="MONTH">1 Tháng (30 ngày)</option>
                      <option value="CUSTOM_RANGE">Tùy chọn khoảng thời gian</option>
                    </select>
                  </div>
                  {simulationMode === "CUSTOM_RANGE" && (
                    <div className="flex gap-2 items-end">
                      <div className="flex-1">
                        <label className="block text-xs font-medium text-slate-500 mb-1">Từ ngày</label>
                        <input
                          type="date"
                          value={startDate}
                          onChange={(e) => { setStartDate(e.target.value); }}
                          className="block w-full px-2 py-2.5 rounded-lg border border-slate-300 text-sm outline-none focus:ring-2 focus:ring-amber-700/20"
                        />
                      </div>
                      <div className="flex-1">
                        <label className="block text-xs font-medium text-slate-500 mb-1">Đến ngày</label>
                        <input
                          type="date"
                          value={endDate}
                          onChange={(e) => { setEndDate(e.target.value); }}
                          className="block w-full px-2 py-2.5 rounded-lg border border-slate-300 text-sm outline-none focus:ring-2 focus:ring-amber-700/20"
                        />
                      </div>
                    </div>
                  )}
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-750 mb-1.5 font-semibold">Ghi chú (Tùy chọn)</label>
                  <input
                    type="text"
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                    placeholder="Vd: Mô phỏng bán dịp lễ"
                    className="block w-full px-3.5 py-2.5 rounded-lg border border-slate-300 text-sm outline-none focus:ring-2 focus:ring-amber-700/20 focus:border-amber-700"
                  />
                </div>

                <div className="p-4 bg-amber-50 border border-amber-200 rounded-xl mb-4">
                  <div className="flex items-start gap-2">
                    <Info size={18} className="text-amber-600 mt-0.5 shrink-0" />
                    <p className="text-sm text-amber-800 font-medium">
                      Apply Simulation sẽ cập nhật tồn kho thật và kích hoạt Agent scan. Chức năng này không tạo Order, không tạo Payment và không tính doanh thu.
                    </p>
                  </div>
                </div>

                <div className="p-5 bg-slate-50 border border-slate-200 rounded-xl">
                  <h4 className="text-sm font-semibold text-slate-700 mb-3">Tính toán dự kiến</h4>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div className="bg-white p-3 rounded-lg border border-slate-150">
                      <span className="text-xs text-slate-400 font-medium block">Số ngày mô phỏng</span>
                      <strong className="text-base text-slate-700">{localNumberOfDays} ngày</strong>
                    </div>
                    <div className="bg-white p-3 rounded-lg border border-slate-150">
                      <span className="text-xs text-slate-400 font-medium block">Dự kiến bán</span>
                      <strong className="text-base text-slate-700">{dailySimulatedQuantity} {unit}/ngày</strong>
                    </div>
                    <div className="bg-white p-3 rounded-lg border border-amber-200">
                      <span className="text-xs text-slate-400 font-medium block">Tổng nhu cầu mô phỏng</span>
                      <strong className="text-lg text-amber-600">{localSimulatedDemand} {unit}</strong>
                    </div>
                  </div>
                  {localSimulatedDemand <= 0 && (
                    <p className="text-sm text-rose-600 mt-2 font-medium">Số lượng mô phỏng phải lớn hơn 0.</p>
                  )}
                  {localSimulatedDemand > availableStock && (
                    <p className="text-sm text-rose-600 mt-2 font-medium">Số lượng mô phỏng không được vượt quá tồn kho khả dụng ({availableStock} {unit}).</p>
                  )}
                </div>
              </div>
            )}
                
                <div className="pt-4 flex justify-end">
                  <Button
                    onClick={() => setShowConfirm(true)}
                    className="px-6 py-3"
                    disabled={
                      isSimulating ||
                      (inputMode === 'MANUAL' && (!selectedProductId || localSimulatedDemand <= 0 || localSimulatedDemand > availableStock)) ||
                      ((inputMode === 'MULTI' || inputMode === 'RANDOM') && (items.length === 0 || items.some(i => !i.productId || i.quantity <= 0))) ||
                      (inputMode === 'RANDOM' && !randomPreviewReady)
                    }
                  >
                    Apply Simulation
                  </Button>
                </div>

            {/* ═══ Simulation Results Section ═══ */}
            {simulationProductResults.length > 0 && (
              <div className="mt-6 border-t border-slate-100 pt-6 space-y-4">
                {/* Summary */}
                <div className="mb-4 p-4 border border-emerald-200 rounded-xl bg-emerald-50 shadow-sm">
                  <div className="flex items-center justify-between mb-3">
                    <h4 className="text-sm font-bold text-slate-800">Kết quả mô phỏng</h4>
                    <div className="flex gap-2">
                      {simulationProductResults[0]?.scanSessionId && (
                        <Link to={`/admin/agent-logs?scanSessionId=${simulationProductResults[0].scanSessionId}`}>
                          <Button size="sm" variant="outline" className="text-[10px] h-7 px-2 flex items-center gap-1 border-slate-300 bg-white text-slate-700 hover:bg-slate-50">
                            <Terminal size={12} /> Xem Nhật ký Agent
                          </Button>
                        </Link>
                      )}
                    </div>
                  </div>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-xs">
                    <div className="bg-white p-2 border border-slate-100 rounded">
                      <span className="block text-slate-400">Số sản phẩm</span>
                      <strong className="text-slate-700">{simulationProductResults.length}</strong>
                    </div>
                    <div className="bg-white p-2 border border-slate-100 rounded">
                      <span className="block text-slate-400">Tổng mô phỏng</span>
                      <strong className="text-amber-600">{simulationProductResults.reduce((s, p) => s + (p.simulatedQuantity ?? 0), 0)} đơn vị</strong>
                    </div>
                    <div className="bg-white p-2 border border-slate-100 rounded">
                      <span className="block text-slate-400">Trạng thái</span>
                      <strong className={`truncate block ${
                        simulationProductResults.some(p => p.agentStatus === 'FAILED') ? 'text-rose-600' :
                        simulationProductResults.some(p => p.agentStatus === 'NO_SUPPLIER') ? 'text-amber-600' :
                        'text-emerald-600'
                      }`}>
                        {simulationProductResults.some(p => p.agentStatus === 'FAILED') ? 'Có lỗi Agent' :
                         simulationProductResults.some(p => p.agentStatus === 'NO_SUPPLIER') ? 'Có cảnh báo' :
                         'Thành công'}
                      </strong>
                    </div>
                    <div className="bg-white p-2 border border-slate-100 rounded">
                      <span className="block text-slate-400">PR đã tạo</span>
                      <strong className="text-slate-700">{simulationProductResults.filter(p => p.purchaseRequest).length}</strong>
                    </div>
                  </div>
                </div>

                {/* Runtime trace */}
                <div className="p-5 border border-slate-200 rounded-xl bg-white shadow-sm">
                  <h4 className="text-sm font-bold text-slate-800 border-b border-slate-100 pb-2 mb-4">Luồng chạy thực tế</h4>
                  <div className="max-h-[250px] overflow-y-auto pr-2 custom-scrollbar">
                    <div className="relative pl-6 space-y-4 before:absolute before:inset-0 before:ml-[11px] before:-translate-x-px md:before:mx-auto md:before:translate-x-0 before:h-full before:w-0.5 before:bg-gradient-to-b before:from-slate-200 before:via-slate-200 before:to-transparent">
                      {/* Step 1 */}
                      <div className="relative">
                        <div className="absolute -left-6 bg-emerald-500 w-2 h-2 rounded-full ring-2 ring-emerald-100 mt-1.5"></div>
                        <div className="text-sm">
                          <strong className="text-slate-800 text-xs block">1. Nhận danh sách sản phẩm mô phỏng</strong>
                          <div className="text-slate-500 text-[10px] mt-0.5">Thành công · {simulationProductResults.length} sản phẩm · {simulationProductResults.reduce((s, p) => s + (p.simulatedQuantity ?? 0), 0)} đơn vị</div>
                        </div>
                      </div>
                      {/* Step 2 */}
                      <div className="relative">
                        <div className="absolute -left-6 bg-emerald-500 w-2 h-2 rounded-full ring-2 ring-emerald-100 mt-1.5"></div>
                        <div className="text-sm">
                          <strong className="text-slate-800 text-xs block">2. Kiểm tra tồn kho khả dụng</strong>
                          <div className="text-slate-500 text-[10px] mt-0.5">Thành công · Đủ tồn kho cho tất cả sản phẩm</div>
                        </div>
                      </div>
                      {/* Step 3 */}
                      <div className="relative">
                        <div className="absolute -left-6 bg-emerald-500 w-2 h-2 rounded-full ring-2 ring-emerald-100 mt-1.5"></div>
                        <div className="text-sm">
                          <strong className="text-slate-800 text-xs block">3. Trừ tồn kho mô phỏng</strong>
                          <div className="text-slate-500 text-[10px] mt-0.5">Thành công · Đã cập nhật {simulationProductResults.length} sản phẩm</div>
                        </div>
                      </div>
                      {/* Step 4 */}
                      <div className="relative">
                        <div className={`absolute -left-6 w-2 h-2 rounded-full ring-2 mt-1.5 ${
                          simulationProductResults.some(p => p.agentStatus === 'FAILED') ? 'bg-rose-500 ring-rose-100' : 'bg-emerald-500 ring-emerald-100'
                        }`}></div>
                        <div className="text-sm">
                          <strong className="text-slate-800 text-xs block">4. Kích hoạt AI Agent scan tồn kho</strong>
                          <div className={`text-[10px] mt-0.5 ${
                            simulationProductResults.some(p => p.agentStatus === 'FAILED') ? 'text-rose-600' : 'text-slate-500'
                          }`}>
                            {simulationProductResults[0]?.scanSessionId ? 'Đã kích hoạt' : 'Chưa có phản hồi'}
                          </div>
                        </div>
                      </div>
                      {/* Step 5 */}
                      <div className="relative">
                        <div className={`absolute -left-6 w-2 h-2 rounded-full ring-2 mt-1.5 ${
                          simulationProductResults.some(p => p.purchaseRequest) ? 'bg-amber-500 ring-amber-100' :
                          simulationProductResults.some(p => p.agentStatus === 'FAILED') ? 'bg-rose-500 ring-rose-100' :
                          'bg-blue-500 ring-blue-100'
                        }`}></div>
                        <div className="text-sm">
                          <strong className="text-slate-800 text-xs block">5. AI Agent đánh giá từng sản phẩm</strong>
                          <div className="text-slate-500 text-[10px] mt-0.5">
                            {(() => {
                              const prCreated = simulationProductResults.filter(p => p.agentStatus === 'CREATED_PURCHASE_REQUEST').length;
                              const stockOk = simulationProductResults.filter(p => p.agentStatus === 'STOCK_OK').length;
                              const skipped = simulationProductResults.filter(p => p.agentStatus === 'SKIPPED_DUPLICATE').length;
                              const noSupplier = simulationProductResults.filter(p => p.agentStatus === 'NO_SUPPLIER').length;
                              const failed = simulationProductResults.filter(p => p.agentStatus === 'FAILED').length;
                              const parts: string[] = [];
                              if (prCreated > 0) parts.push(`${prCreated} tạo PR`);
                              if (stockOk > 0) parts.push(`${stockOk} an toàn`);
                              if (skipped > 0) parts.push(`${skipped} đã có PR`);
                              if (noSupplier > 0) parts.push(`${noSupplier} thiếu NCC`);
                              if (failed > 0) parts.push(`${failed} thất bại`);
                              return parts.length > 0 ? parts.join(' · ') : 'Hoàn tất';
                            })()}
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Per-product result cards */}
                <div className="space-y-3">
                  <h4 className="text-sm font-bold text-slate-700">Chi tiết từng sản phẩm</h4>
                  {simulationProductResults.map((item) => {
                    const getProductAgentLogUrl = () => {
                      const params = new URLSearchParams();
                      if (item.productId) params.set('productId', item.productId);
                      if (item.scanSessionId) params.set('scanSessionId', item.scanSessionId);
                      return `/admin/agent-logs?${params.toString()}`;
                    };

                    const statusBadge = (() => {
                      switch (item.agentStatus) {
                        case 'CREATED_PURCHASE_REQUEST':
                          return <span className="px-2 py-0.5 rounded-md bg-amber-100 text-amber-700 text-[10px] font-bold uppercase">Đã tạo YC nhập hàng</span>;
                        case 'SKIPPED_DUPLICATE':
                          return <span className="px-2 py-0.5 rounded-md bg-blue-100 text-blue-700 text-[10px] font-bold uppercase">Đã có YC nhập hàng</span>;
                        case 'NO_SUPPLIER':
                          return <span className="px-2 py-0.5 rounded-md bg-orange-100 text-orange-700 text-[10px] font-bold uppercase">Thiếu NCC</span>;
                        case 'FAILED':
                          return <span className="px-2 py-0.5 rounded-md bg-rose-100 text-rose-700 text-[10px] font-bold uppercase">Thất bại</span>;
                        case 'STOCK_OK':
                          return <span className="px-2 py-0.5 rounded-md bg-emerald-100 text-emerald-700 text-[10px] font-bold uppercase">Tồn kho an toàn</span>;
                        default:
                          return <span className="px-2 py-0.5 rounded-md bg-slate-100 text-slate-600 text-[10px] font-bold uppercase">Đã xử lý</span>;
                      }
                    })();

                    return (
                      <div key={item.productId} className="p-4 border border-slate-200 rounded-xl bg-white shadow-sm">
                        <div className="flex items-center justify-between mb-3">
                          <div className="flex items-center gap-2">
                            <strong className="text-sm text-slate-800">{item.productName}</strong>
                            {statusBadge}
                          </div>
                          <div className="flex gap-1.5">
                            {item.purchaseRequest && (
                              <Link to={`/admin/purchase-requests/${item.purchaseRequest.id}`}>
                                <Button size="sm" className="bg-amber-800 hover:bg-amber-900 text-[10px] h-6 px-2 flex items-center gap-1 border-none text-white">
                                  <Mail size={10} /> PR
                                </Button>
                              </Link>
                            )}
                            {item.agentLogs && item.agentLogs.length > 0 && (
                              <Link to={getProductAgentLogUrl()}>
                                <Button size="sm" variant="outline" className="text-[10px] h-6 px-2 flex items-center gap-1 border-slate-300 bg-white text-slate-700 hover:bg-slate-50">
                                  <Terminal size={10} /> Log
                                </Button>
                              </Link>
                            )}
                          </div>
                        </div>
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-xs">
                          <div className="bg-slate-50 p-2 rounded border border-slate-100">
                            <span className="block text-slate-400">Mô phỏng</span>
                            <strong className="text-amber-600">{item.simulatedQuantity} {item.unit}</strong>
                          </div>
                          <div className="bg-slate-50 p-2 rounded border border-slate-100">
                            <span className="block text-slate-400">Tồn trước</span>
                            <strong className="text-slate-700">{item.stockBefore != null ? `${item.stockBefore} ${item.unit}` : 'Không có dữ liệu'}</strong>
                          </div>
                          <div className="bg-slate-50 p-2 rounded border border-slate-100">
                            <span className="block text-slate-400">Tồn sau</span>
                            <strong className={`${(item.stockAfter ?? 0) <= 0 ? 'text-rose-600' : (item.stockAfter ?? 0) < (item.minThreshold ?? 0) ? 'text-amber-600' : 'text-slate-700'}`}>
                              {item.stockAfter != null ? `${item.stockAfter} ${item.unit}` : 'Không có dữ liệu'}
                            </strong>
                          </div>
                          <div className="bg-slate-50 p-2 rounded border border-slate-100">
                            <span className="block text-slate-400">Agent</span>
                            <strong className={`truncate block ${
                              item.agentStatus === 'FAILED' ? 'text-rose-600' :
                              item.agentStatus === 'NO_SUPPLIER' ? 'text-orange-600' :
                              item.agentStatus === 'CREATED_PURCHASE_REQUEST' ? 'text-amber-700' :
                              'text-emerald-600'
                            }`}>{item.agentMessage}</strong>
                          </div>
                        </div>
                        {item.reservedStock > 0 && (
                          <div className="mt-2 grid grid-cols-2 gap-2 text-xs">
                            <div className="bg-slate-50 p-2 rounded border border-slate-100">
                              <span className="block text-slate-400">Đang giữ</span>
                              <strong className="text-slate-600">{item.reservedStock} {item.unit}</strong>
                            </div>
                            <div className="bg-slate-50 p-2 rounded border border-slate-100">
                              <span className="block text-slate-400">Khả dụng sau</span>
                              <strong className="text-slate-600">{item.availableAfter != null ? `${item.availableAfter} ${item.unit}` : 'Không có dữ liệu'}</strong>
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        </section>

        {/* Right Column: Khôi phục sản phẩm */}
        <section className="bg-white border border-slate-100 rounded-3xl p-6 sm:p-8 shadow-sm flex flex-col h-fit">
          <div className="flex items-start justify-between border-b border-slate-100 pb-3 mb-6">
            <div>
              <h3 className="text-lg font-black text-slate-800 flex items-center gap-2">
                <RefreshCw size={20} className="text-blue-600" /> Khôi phục sản phẩm
              </h3>
              <p className="text-xs text-slate-500 mt-2 leading-relaxed">
                Khôi phục lại số lượng tồn kho đã bị trừ trong lần mô phỏng gần nhất chưa khôi phục.
              </p>
            </div>
            <button onClick={() => loadData(true)} className="p-1.5 text-slate-400 hover:text-slate-700 rounded-lg hover:bg-slate-50 shrink-0">
              <RefreshCw size={14} />
            </button>
          </div>

          <div className="flex flex-col">
            {pendingRestores.length === 0 ? (
              <div className="flex items-center justify-center p-6 border-2 border-dashed border-slate-200 rounded-xl bg-slate-50 min-h-[200px]">
                <p className="text-slate-500 text-sm font-medium">Chưa có mô phỏng nào cần khôi phục.</p>
              </div>
            ) : (
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-slate-750 mb-1.5 font-semibold">Chọn sản phẩm cần khôi phục</label>
                  <select
                    value={selectedRestoreId}
                    onChange={(e) => setSelectedRestoreId(e.target.value)}
                    className="block w-full px-3.5 py-2.5 rounded-lg border border-slate-300 bg-white text-sm outline-none focus:ring-2 focus:ring-amber-700/20 focus:border-amber-700"
                  >
                    <option value="">-- Chọn sản phẩm cần khôi phục --</option>
                    {pendingRestores.map((r) => (
                      <option key={r.productId} value={r.productId}>
                        {r.productName} (Cần khôi phục: {r.totalDecreasedQuantity} {r.unit})
                      </option>
                    ))}
                  </select>
                </div>

                {selectedRestoreId && pendingRestores.find(r => r.productId === selectedRestoreId) && (() => {
                  const r = pendingRestores.find(item => item.productId === selectedRestoreId)!;
                  return (
                    <div className="p-5 bg-slate-50 border border-slate-200 rounded-xl space-y-4">
                      <div className="flex justify-between items-start gap-2">
                        <div>
                          <span className="text-xs text-slate-500 block mb-1">Tên sản phẩm</span>
                          <strong className="text-slate-800 text-sm">{r.productName || "Sản phẩm không tên"}</strong>
                        </div>
                        <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold bg-amber-50 border border-amber-200 text-amber-800 shrink-0">
                          Chưa khôi phục
                        </span>
                      </div>

                      <div className="grid grid-cols-2 gap-3">
                        <div className="bg-white p-3 rounded-lg border border-slate-150 text-center">
                          <span className="text-[10px] text-slate-400 block font-medium mb-1">Tổng cần khôi phục</span>
                          <strong className="text-base text-rose-600">{r.totalDecreasedQuantity} {r.unit}</strong>
                        </div>
                        <div className="bg-white p-3 rounded-lg border border-slate-150 text-center">
                          <span className="text-[10px] text-slate-400 block font-medium mb-1">Số lần mô phỏng</span>
                          <strong className="text-base text-slate-700">{r.transactionIds.length}</strong>
                        </div>
                      </div>

                      {r.transactionIds.length > 0 && (
                        <div className="text-[10px] text-slate-400 break-all bg-white p-2 rounded border border-slate-150 max-h-24 overflow-y-auto">
                          <strong>Các mã giao dịch:</strong>
                          <ul className="list-disc pl-4 mt-1">
                            {r.transactionIds.map((tid: string) => (
                              <li key={tid}>{tid}</li>
                            ))}
                          </ul>
                        </div>
                      )}
                    </div>
                  );
                })()}
              </div>
            )}
          </div>

          <div className="pt-6 mt-6 border-t border-slate-100 flex justify-end gap-3">
            <Button
              onClick={handleRestoreSimulation}
              disabled={!selectedRestoreId || isRestoring}
              className="px-6 py-3"
              isLoading={isRestoring}
            >
              Khôi phục sản phẩm
            </Button>
          </div>
        </section>
      </div>

      {/* Confirmation Dialog */}
      <ConfirmDialog
        isOpen={showConfirm}
        onClose={() => setShowConfirm(false)}
        onConfirm={handleSimulate}
        title="Xác nhận Apply Simulation"
        message={
          (inputMode === 'MULTI' || inputMode === 'RANDOM')
            ? `Bạn muốn thực hiện Apply Simulation cho ${items.filter(i => i.productId?.trim() && i.quantity > 0).length} sản phẩm${inputMode === 'RANDOM' ? ' (chế độ random)' : ''}? Giao dịch này sẽ cập nhật kho thực tế và kích hoạt AI Agent kiểm định.`
            : `Bạn muốn thực hiện Apply Simulation mô phỏng bán ${localSimulatedDemand} ${unit} cho sản phẩm ${selectedProduct?.name}? Giao dịch này sẽ cập nhật kho thực tế và kích hoạt AI Agent kiểm định.`
        }
        confirmText="Apply Simulation"
        cancelText="Hủy"
        type="warning"
        isLoading={isSimulating}
      />
    </div>
  );
};
