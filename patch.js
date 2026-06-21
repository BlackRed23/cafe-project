const fs = require('fs');
const file = 'apps/web/src/pages/admin/AdminInventoryPage.tsx';
let content = fs.readFileSync(file, 'utf8');

const replacement = `              <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 mb-4 space-y-3 text-sm text-slate-700 relative overflow-hidden">
                {isSuggesting && (
                  <div className="absolute inset-0 bg-white/50 backdrop-blur-sm flex items-center justify-center z-10">
                    <Loading message="Đang tính toán..." />
                  </div>
                )}
                
                {/* Lựa chọn chu kỳ tính ngưỡng */}
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
                        className={\`px-3 py-1.5 rounded-lg border text-xs font-medium transition-colors \${planningPeriod === period ? 'bg-amber-100 border-amber-300 text-amber-800' : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'}\`}
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
                </div>

                <div className="flex justify-between mt-3">
                  <span>Tồn kho hiện tại:</span>
                  <span className="font-medium text-slate-900">{selectedInventory.quantity}</span>
                </div>
                <div className="flex justify-between">
                  <span>Ngưỡng hiện tại:</span>
                  <span className="font-medium text-slate-900">{selectedInventory.minThreshold ?? selectedInventory.min_threshold ?? 0}</span>
                </div>`;

content = content.replace(
  /<div className="bg-slate-50 p-4 rounded-xl border border-slate-200 mb-4 space-y-2 text-sm text-slate-700 relative overflow-hidden">[\s\S]*?<div className="flex justify-between">[\s\S]*?<span>Ngưỡng hiện tại:<\/span>[\s\S]*?<span className="font-medium text-slate-900">{selectedInventory\.minThreshold \?\? selectedInventory\.min_threshold \?\? 0}<\/span>[\s\S]*?<\/div>/,
  replacement
);

const explanationReplacement = `                  <div className="flex justify-between items-center">
                    <span className="font-semibold text-emerald-700">Ngưỡng đề xuất:</span>
                    <span className="font-bold text-lg text-emerald-700">{thresholdSuggestion?.recommendedThreshold ?? 0}</span>
                  </div>
                  {thresholdSuggestion?.explanation && (
                    <div className="text-xs text-slate-600 bg-white p-2 rounded border border-slate-100 my-2">
                      <Info size={14} className="inline mr-1 text-blue-500 mb-0.5" />
                      {thresholdSuggestion.explanation}
                    </div>
                  )}`;

content = content.replace(
  /<div className="flex justify-between items-center">[\s\S]*?<span className="font-semibold text-emerald-700">Ngưỡng đề xuất:<\/span>[\s\S]*?<span className="font-bold text-lg text-emerald-700">{thresholdSuggestion\?\.recommendedThreshold \?\? 0}<\/span>[\s\S]*?<\/div>/,
  explanationReplacement
);

fs.writeFileSync(file, content);
