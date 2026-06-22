const fs = require("fs");
let content = fs.readFileSync("apps/web/src/pages/admin/AdminInventoryPage.tsx", "utf8");

// Add imports
content = content.replace(`import { inventoryApi } from "../../api/inventory.api";\r\nimport { agentLogsApi } from "../../api/agentLogs.api";`, `import { inventoryApi } from "../../api/inventory.api";\r\nimport { agentLogsApi } from "../../api/agentLogs.api";\r\nimport { suppliersApi } from "../../api/suppliers.api";`);
content = content.replace(`import type { Inventory, InventoryScanSeverity } from "../../types/inventory.types";`, `import type { Inventory, InventoryScanSeverity } from "../../types/inventory.types";\r\nimport type { SupplierProduct } from "../../types/supplier.types";`);

// Add states
content = content.replace(`  const [inputValue, setInputValue] = useState<number>(0);\r\n  const [inputNote, setInputNote] = useState("");`, `  const [inputValue, setInputValue] = useState<number>(0);\r\n  const [inputNote, setInputNote] = useState("");\r\n  const [importMode, setImportMode] = useState<"internal" | "supplier">("internal");\r\n  const [supplierProducts, setSupplierProducts] = useState<SupplierProduct[]>([]);`);

// Add fetchSupplierProducts
content = content.replace(`  useEffect(() => {\r\n    fetchInventories();\r\n  }, []);`, `  const fetchSupplierProducts = async () => {\r\n    try {\r\n      const data = await suppliersApi.getSupplierProducts();\r\n      setSupplierProducts(data);\r\n    } catch { }\r\n  };\r\n\r\n  useEffect(() => {\r\n    fetchInventories();\r\n    fetchSupplierProducts();\r\n  }, []);`);

// Reset importMode
content = content.replace(`    setInputValue(0);\r\n    setInputNote("");`, `    setInputValue(0);\r\n    setInputNote("");\r\n    setImportMode("internal");`);

// Modify handleModalSubmit
const submitReplacement = `    if (modalType === "adjust" && inputValue < 0) {
      showToast("S? lu?ng th?c t? không du?c âm", "error");
      return;
    }
    if (modalType === "threshold" && inputValue < 0) {
      showToast("Ngu?ng không du?c âm", "error");
      return;
    }

    setModalLoading(true);

    try {
      if (modalType === "import") {
        const supplierProduct = supplierProducts.find(sp => sp.productId === selectedInventory.productId);
        const hasSupplierConversion = Boolean(
          supplierProduct?.purchaseUnit &&
          supplierProduct?.conversionQuantity &&
          supplierProduct?.conversionTargetUnit
        );
        const conversionWarning = hasSupplierConversion && supplierProduct?.conversionTargetUnit !== selectedInventory.unit;
        const isSupplierMode = importMode === "supplier" && hasSupplierConversion && !conversionWarning;
        const finalQuantity = isSupplierMode ? inputValue * (supplierProduct!.conversionQuantity || 1) : inputValue;

        if (inputValue <= 0) {
          showToast(isSupplierMode ? "S? lu?ng nh?p theo NCC ph?i l?n hon 0" : "S? lu?ng nh?p thêm ph?i l?n hon 0", "error");
          setModalLoading(false);
          return;
        }

        const res = await inventoryApi.importInventory({
          productId: selectedInventory.productId,
          quantity: finalQuantity,
          note: inputNote.trim() || undefined,
        });
        const minThreshold = res.minThreshold ?? res.min_threshold ?? 0;
        const warning = res.warnings?.[0]?.message;
        
        let successMessage = "Nh?p kho thành công.";
        if (isSupplierMode) {
          successMessage = \`Ðã nh?p \${inputValue} \${supplierProduct!.purchaseUnit}, quy d?i thành \${finalQuantity} \${selectedInventory.unit}.\`;
        } else if (res.message) {
          successMessage = res.message;
        }

        if (res.quantity <= minThreshold) {
          showToast(warning || "Nh?p kho thành công nhung s? lu?ng sau nh?p v?n th?p hon ngu?ng t?i thi?u.", "warning");
        } else {
          showToast(successMessage, "success");
        }
      } else if (modalType === "adjust") {`;

const submitMatch = `    if (modalType === "import" && inputValue <= 0) {\r
      showToast("S? lu?ng nh?p thêm ph?i l?n hon 0", "error");\r
      return;\r
    }\r
    if (modalType === "adjust" && inputValue < 0) {\r
      showToast("S? lu?ng th?c t? không du?c âm", "error");\r
      return;\r
    }\r
    if (modalType === "threshold" && inputValue < 0) {\r
      showToast("Ngu?ng không du?c âm", "error");\r
      return;\r
    }\r
\r
    setModalLoading(true);\r
\r
    try {\r
      if (modalType === "import") {\r
        const res = await inventoryApi.importInventory({\r
          productId: selectedInventory.productId,\r
          quantity: inputValue,\r
          note: inputNote.trim() || undefined,\r
        });\r
        const minThreshold = res.minThreshold ?? res.min_threshold ?? 0;\r
        const warning = res.warnings?.[0]?.message;\r
        if (res.quantity <= minThreshold) {\r
          showToast(warning || "Nh?p kho thành công nhung s? lu?ng sau nh?p v?n th?p hon ngu?ng t?i thi?u.", "warning");\r
        } else {\r
          showToast(res.message || "Nh?p kho thành công. Ð? hàng.", "success");\r
        }\r
      } else if (modalType === "adjust") {`;

content = content.replace(submitMatch, submitReplacement);

// Modify UI Render
const uiMatch = `            <div>\r
              <Input\r
                label={\r
                  modalType === "threshold"\r
                    ? "Ngu?ng t?i thi?u m?i"\r
                    : modalType === "import"\r
                    ? "S? lu?ng nh?p thêm"\r
                    : "S? lu?ng th?c t? sau ki?m kê"\r
                }\r
                type="number"\r
                value={inputValue || ""}\r
                onChange={(e) => setInputValue(parseInt(e.target.value) || 0)}\r
                required\r
              />\r
              {modalType === "threshold" && thresholdSuggestion && (\r
                <div className="mt-1">\r
                  {getThresholdWarning() && (\r
                    <p className="text-xs text-amber-600 flex items-center gap-1 mt-1">\r
                      <AlertCircle size={12} /> {getThresholdWarning()?.message}\r
                    </p>\r
                  )}\r
                  {false && (\r
                    <p className="text-xs text-amber-600 flex items-center gap-1 mt-1">\r
                      <AlertCircle size={12} /> C?nh báo: Ngu?ng này quá th?p (nh? hon lu?ng d? phòng {thresholdSuggestion.safetyStock}).\r
                    </p>\r
                  )}\r
                  {false && (\r
                    <p className="text-xs text-amber-600 flex items-center gap-1 mt-1">\r
                      <AlertCircle size={12} /> C?nh báo: Ngu?ng này khá cao so v?i m?c d? xu?t.\r
                    </p>\r
                  )}\r
                </div>\r
              )}\r
            </div>`;

const uiReplacement = `            {modalType === "import" ? (() => {
              const supplierProduct = supplierProducts.find(sp => sp.productId === selectedInventory.productId);
              const hasSupplierConversion = Boolean(
                supplierProduct?.purchaseUnit &&
                supplierProduct?.conversionQuantity &&
                supplierProduct?.conversionTargetUnit
              );
              const conversionWarning = hasSupplierConversion && supplierProduct?.conversionTargetUnit !== selectedInventory.unit;
              const isSupplierMode = importMode === "supplier" && hasSupplierConversion && !conversionWarning;

              return (
                <div className="space-y-4">
                  <div className="bg-slate-50 p-3 rounded-lg border border-slate-200 text-sm flex items-center justify-between">
                    <span className="text-slate-600 font-medium">Ðon v? t?n kho n?i b?:</span>
                    <span className="font-bold text-slate-800">{selectedInventory.unit || "don v?"}</span>
                  </div>

                  {hasSupplierConversion && (
                    <div className="space-y-2 border-b border-slate-100 pb-4">
                      <label className="block text-sm font-semibold text-slate-800 mb-1">Nh?p theo</label>
                      <div className="flex gap-3">
                        <button
                          type="button"
                          onClick={() => setImportMode("internal")}
                          className={\`flex-1 py-2 px-3 border rounded-lg text-sm font-medium transition-colors \${importMode === "internal" ? "border-amber-500 bg-amber-50 text-amber-800" : "border-slate-200 text-slate-600 hover:bg-slate-50"}\`}
                        >
                          Ðon v? t?n kho n?i b?
                        </button>
                        <button
                          type="button"
                          onClick={() => setImportMode("supplier")}
                          disabled={conversionWarning}
                          className={\`flex-1 py-2 px-3 border rounded-lg text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed \${importMode === "supplier" ? "border-amber-500 bg-amber-50 text-amber-800" : "border-slate-200 text-slate-600 hover:bg-slate-50"}\`}
                        >
                          Quy cách nhà cung c?p
                        </button>
                      </div>

                      {conversionWarning && (
                        <div className="flex items-start gap-1.5 mt-2 text-xs text-rose-600 bg-rose-50 p-2 rounded border border-rose-100">
                          <AlertCircle size={14} className="shrink-0 mt-0.5" />
                          <span>Quy cách nhà cung c?p chua kh?p don v? t?n kho n?i b?, vui lòng ki?m tra l?i.</span>
                        </div>
                      )}
                      
                      {!conversionWarning && isSupplierMode && (
                        <div className="text-xs font-medium text-emerald-700 bg-emerald-50 px-3 py-2 rounded-lg border border-emerald-100 flex items-center gap-2">
                          <Info size={14} />
                          Quy d?i: 1 {supplierProduct!.purchaseUnit} = {supplierProduct!.conversionQuantity} {supplierProduct!.conversionTargetUnit}
                        </div>
                      )}
                    </div>
                  )}

                  <div>
                    <Input
                      label={isSupplierMode ? \`S? lu?ng nh?p theo NCC (\${supplierProduct!.purchaseUnit})\` : \`S? lu?ng nh?p thêm (\${selectedInventory.unit || "don v?"})\`}
                      type="number"
                      value={inputValue || ""}
                      onChange={(e) => setInputValue(parseInt(e.target.value) || 0)}
                      required
                    />
                    
                    {isSupplierMode && inputValue > 0 ? (
                      <p className="text-sm font-bold text-emerald-700 mt-2 bg-emerald-50 px-3 py-2 rounded border border-emerald-100">
                        S? lu?ng s? c?ng vào kho: {inputValue * supplierProduct!.conversionQuantity!} {selectedInventory.unit}
                      </p>
                    ) : (
                      <p className="text-xs text-slate-500 mt-1.5 italic">
                        S? lu?ng này s? du?c c?ng tr?c ti?p vào t?n kho n?i b?.
                      </p>
                    )}
                  </div>
                </div>
              );
            })() : (
              <div>
                <Input
                  label={
                    modalType === "threshold"
                      ? "Ngu?ng t?i thi?u m?i"
                      : "S? lu?ng th?c t? sau ki?m kê"
                  }
                  type="number"
                  value={inputValue || ""}
                  onChange={(e) => setInputValue(parseInt(e.target.value) || 0)}
                  required
                />
                {modalType === "threshold" && thresholdSuggestion && (
                  <div className="mt-1">
                    {getThresholdWarning() && (
                      <p className="text-xs text-amber-600 flex items-center gap-1 mt-1">
                        <AlertCircle size={12} /> {getThresholdWarning()?.message}
                      </p>
                    )}
                    {false && (
                      <p className="text-xs text-amber-600 flex items-center gap-1 mt-1">
                        <AlertCircle size={12} /> C?nh báo: Ngu?ng này quá th?p (nh? hon lu?ng d? phòng {thresholdSuggestion.safetyStock}).
                      </p>
                    )}
                    {false && (
                      <p className="text-xs text-amber-600 flex items-center gap-1 mt-1">
                        <AlertCircle size={12} /> C?nh báo: Ngu?ng này khá cao so v?i m?c d? xu?t.
                      </p>
                    )}
                  </div>
                )}
              </div>
            )}`;

content = content.replace(uiMatch, uiReplacement);
fs.writeFileSync("apps/web/src/pages/admin/AdminInventoryPage.tsx", content);

