import os

backend_file = "apps/api/src/modules/inventory/inventory.service.ts"
with open(backend_file, "r", encoding="utf-8") as f:
    backend_content = f.read()

# 1. Update ThresholdSuggestionOptions
backend_content = backend_content.replace(
    """type ThresholdSuggestionOptions = {
    salesWindowDays?: number;
    bufferDays?: number;
    delayBufferDays?: number;
};""",
    """type ThresholdSuggestionOptions = {
    salesWindowDays?: number;
    bufferDays?: number;
    delayBufferDays?: number;
    planningPeriod?: 'WEEKLY' | 'MONTHLY' | 'CUSTOM';
    planningDays?: number;
};"""
)

# 2. Update getInventoryThresholdSuggestion variables
backend_content = backend_content.replace(
    """const bufferDays = normalizePositiveInteger(options.bufferDays, 2);

    const supplierProducts = await getSupplierProductsForSuggestion(inventory.productId);""",
    """const bufferDays = normalizePositiveInteger(options.bufferDays, 2);
    const planningPeriod = options.planningPeriod || 'WEEKLY';
    let planningDays = 7;
    if (planningPeriod === 'MONTHLY') planningDays = 30;
    else if (planningPeriod === 'CUSTOM') planningDays = normalizePositiveInteger(options.planningDays, 14);

    const supplierProducts = await getSupplierProductsForSuggestion(inventory.productId);"""
)

# 3. Update threshold formula
backend_content = backend_content.replace(
    """const leadTimeDemand = Math.ceil(avgDailySales * effectiveLeadTimeDays);
    const recommendedThreshold = Math.ceil(leadTimeDemand + safetyStock);
    const warnings = getThresholdWarnings(inventory.minThreshold, leadTimeDemand, recommendedThreshold);""",
    """const leadTimeDemand = Math.ceil(avgDailySales * effectiveLeadTimeDays);
    
    let recommendedThreshold = 0;
    if (avgDailySales > 0) {
        recommendedThreshold = Math.ceil(avgDailySales * (planningDays + effectiveLeadTimeDays + bufferDays));
    } else {
        const currentMin = inventory.minThreshold;
        if (planningPeriod === 'WEEKLY') {
            recommendedThreshold = Math.max(currentMin, 10);
        } else if (planningPeriod === 'MONTHLY') {
            recommendedThreshold = Math.max(currentMin * 3, 30);
        } else {
            recommendedThreshold = Math.max(Math.ceil(currentMin * (planningDays / 7)), 10);
        }
    }

    const warnings = getThresholdWarnings(inventory.minThreshold, leadTimeDemand, recommendedThreshold);"""
)

# 4. Update return values
backend_content = backend_content.replace(
    """    if (supplierProducts.length === 0) {
        warnings.push({
            level: 'info',
            message: 'Sản phẩm chưa gắn nhà cung cấp, hệ thống đang dùng thời gian nhập hàng mặc định 3 ngày.'
        });
    }

    return {
        inventoryId: inventory.id,
        productId: inventory.productId,
        productName: inventory.product.name,
        currentStock: inventory.quantity,""",
    """    if (supplierProducts.length === 0) {
        warnings.push({
            level: 'info',
            message: 'Sản phẩm chưa gắn nhà cung cấp, hệ thống đang dùng thời gian nhập hàng mặc định 3 ngày.'
        });
    }

    let periodText = 'hằng tuần';
    if (planningPeriod === 'MONTHLY') periodText = 'hằng tháng';
    else if (planningPeriod === 'CUSTOM') periodText = `tùy chỉnh ${planningDays} ngày`;

    const unit = inventory.unit || inventory.product.unit || 'đơn vị';
    const explanation = avgDailySales > 0
        ? `Sản phẩm ${inventory.product.name} đang được tính ngưỡng theo chu kỳ nhập hàng ${periodText}. Dựa trên tốc độ bán trung bình ${Number(avgDailySales.toFixed(2))} ${unit}/ngày, thời gian nhập hàng ${effectiveLeadTimeDays} ngày và ${bufferDays} ngày dự phòng, hệ thống gợi ý ngưỡng tồn kho là ${recommendedThreshold} ${unit}.`
        : `Sản phẩm ${inventory.product.name} chưa có đủ lịch sử bán hàng. Hệ thống tạm thời gợi ý mức an toàn là ${recommendedThreshold} ${unit} dựa trên chu kỳ ${periodText}.`;

    return {
        inventoryId: inventory.id,
        productId: inventory.productId,
        productName: inventory.product.name,
        inventoryUnit: unit,
        planningPeriod,
        planningDays,
        explanation,
        currentStock: inventory.quantity,"""
)

with open(backend_file, "w", encoding="utf-8") as f:
    f.write(backend_content)


frontend_file = "apps/web/src/pages/admin/AdminInventoryPage.tsx"
with open(frontend_file, "r", encoding="utf-8") as f:
    frontend_content = f.read()

# 1. Add states
frontend_content = frontend_content.replace(
    """  const [thresholdSuggestion, setThresholdSuggestion] = useState<any>(null);
  const [isSuggesting, setIsSuggesting] = useState(false);""",
    """  const [thresholdSuggestion, setThresholdSuggestion] = useState<any>(null);
  const [isSuggesting, setIsSuggesting] = useState(false);
  const [planningPeriod, setPlanningPeriod] = useState<"WEEKLY" | "MONTHLY" | "CUSTOM">("WEEKLY");
  const [planningDays, setPlanningDays] = useState<number>(14);"""
)

# 2. Update getThresholdSuggestion call and add fetchSuggestion
frontend_content = frontend_content.replace(
    """  const handleCloseModal = () => {""",
    """  const fetchSuggestion = async (period: "WEEKLY" | "MONTHLY" | "CUSTOM", days: number) => {
    if (!selectedInventory) return;
    setIsSuggesting(true);
    try {
      const suggestion = await inventoryApi.getThresholdSuggestion((selectedInventory as any).inventoryId ?? selectedInventory.id, {
        planningPeriod: period,
        planningDays: days,
      });
      setThresholdSuggestion(suggestion);
    } catch (err) {
      console.error("Failed to load suggestion");
    } finally {
      setIsSuggesting(false);
    }
  };

  const handleCloseModal = () => {"""
)

# 3. Update handleOpenModal
frontend_content = frontend_content.replace(
    """    if (type === "threshold") {
      setIsSuggesting(true);
      setThresholdSuggestion(null);
      try {
        const suggestion = await inventoryApi.getThresholdSuggestion((inv as any).inventoryId ?? inv.id);""",
    """    if (type === "threshold") {
      setIsSuggesting(true);
      setThresholdSuggestion(null);
      setPlanningPeriod("WEEKLY");
      setPlanningDays(14);
      try {
        const suggestion = await inventoryApi.getThresholdSuggestion((inv as any).inventoryId ?? inv.id, { planningPeriod: "WEEKLY", planningDays: 14 });"""
)

# 4. Update UI block for selection
frontend_content = frontend_content.replace(
    """              <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 mb-4 space-y-2 text-sm text-slate-700 relative overflow-hidden">
                {isSuggesting && (
                  <div className="absolute inset-0 bg-white/50 backdrop-blur-sm flex items-center justify-center z-10">
                    <Loading message="Đang tính toán..." />
                  </div>
                )}
                <div className="flex justify-between border-b border-slate-200 pb-2 mb-2">
                  <span className="font-semibold text-slate-900">Thông tin đề xuất</span>
                </div>""",
    """              <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 mb-4 space-y-3 text-sm text-slate-700 relative overflow-hidden">
                {isSuggesting && (
                  <div className="absolute inset-0 bg-white/50 backdrop-blur-sm flex items-center justify-center z-10">
                    <Loading message="Đang tính toán..." />
                  </div>
                )}
                <div className="space-y-2 pb-3 border-b border-slate-200">
                  <label className="block font-semibold text-slate-900">Chu kỳ tính ngưỡng đề xuất</label>
                  <div className="flex gap-2">
                    {(['WEEKLY', 'MONTHLY', 'CUSTOM'] as const).map(period => (
                      <button
                        key={period}
                        type="button"
                        onClick={() => {
                          setPlanningPeriod(period);
                          fetchSuggestion(period, planningDays);
                        }}
                        className={`px-3 py-1.5 rounded-lg border text-xs font-medium transition-colors ${planningPeriod === period ? 'bg-amber-100 border-amber-300 text-amber-800' : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'}`}
                      >
                        {period === 'WEEKLY' ? 'Theo tuần' : period === 'MONTHLY' ? 'Theo tháng' : 'Tùy chỉnh'}
                      </button>
                    ))}
                  </div>
                  
                  {planningPeriod === 'CUSTOM' && (
                    <div className="mt-2 flex items-center gap-2">
                      <span className="text-xs font-medium text-slate-600">Số ngày dự trữ:</span>
                      <input 
                        type="number" 
                        min="1"
                        value={planningDays}
                        onChange={(e) => setPlanningDays(parseInt(e.target.value) || 1)}
                        onBlur={() => fetchSuggestion('CUSTOM', planningDays)}
                        className="w-20 px-2 py-1 text-sm border border-slate-300 rounded focus:outline-none focus:border-amber-500"
                      />
                    </div>
                  )}
                </div>"""
)

# 5. Add explanation to UI
frontend_content = frontend_content.replace(
    """                  <div className="flex justify-between items-center">
                    <span className="font-semibold text-emerald-700">Ngưỡng đề xuất:</span>
                    <span className="font-bold text-lg text-emerald-700">{thresholdSuggestion?.recommendedThreshold ?? 0}</span>
                  </div>""",
    """                  <div className="flex justify-between items-center">
                    <span className="font-semibold text-emerald-700">Ngưỡng đề xuất:</span>
                    <span className="font-bold text-lg text-emerald-700">{thresholdSuggestion?.recommendedThreshold ?? 0}</span>
                  </div>
                  {thresholdSuggestion?.explanation && (
                    <div className="text-xs text-slate-600 bg-white p-2.5 rounded-lg border border-slate-200 my-2 leading-relaxed">
                      <Info size={14} className="inline mr-1 text-blue-500 mb-0.5" />
                      {thresholdSuggestion.explanation}
                    </div>
                  )}"""
)

with open(frontend_file, "w", encoding="utf-8") as f:
    f.write(frontend_content)
