import type { AgentAuditEvent, AgentRunSummary, AuditStatus, RunStatus, ToolStatus } from './agentWorkspace.types';

export const AGENT_PHASES = [
  ['PER', 'Nhận biết dữ liệu'], ['PLN', 'Lập kế hoạch'], ['TOOL', 'Chọn công cụ'],
  ['ACT', 'Thực thi'], ['OBS', 'Quan sát'], ['ANM', 'Phát hiện bất thường'],
  ['REP', 'Điều chỉnh kế hoạch'], ['PUR', 'Đề xuất mua hàng'], ['EXP', 'Giải thích quyết định']
] as const;

export const EMPTY_EVIDENCE = 'Backend chưa công bố dữ liệu xác thực cho mục này.';

export function runStatusLabel(status: RunStatus | string | null): string {
  switch (status) {
    case 'RUNNING': return 'Đang xử lý';
    case 'WAITING_APPROVAL': return 'HOLD · Cần xem xét';
    case 'AWAITING_APPROVAL': return 'Chờ phê duyệt';
    case 'HELD_POLICY': return 'Tạm giữ theo chính sách';
    case 'DEGRADED_LLM': return 'Phân tích giới hạn';
    case 'UNKNOWN': return 'Chưa xác định';
    case 'SUCCEEDED': return 'Hoàn tất';
    case 'FAILED': return 'Thất bại';
    case 'TIMEOUT': return 'Quá thời gian';
    case 'CANCELLED': return 'Đã hủy';
    default: return 'Không có dữ liệu';
  }
}

export function toolStatusLabel(status: ToolStatus | string): string {
  switch (status) {
    case 'PENDING': return 'Chưa thực thi';
    case 'RUNNING': return 'Đang chạy';
    case 'SUCCEEDED': return 'Thành công';
    case 'FAILED': return 'Thất bại';
    case 'BLOCKED_BY_PERMISSION': return 'HOLD · Không đủ quyền';
    case 'SKIPPED': return 'Bỏ qua';
    default: return 'Không có dữ liệu';
  }
}

export function statusTone(status: string | null): 'good' | 'bad' | 'warn' | 'neutral' {
  if (status === 'SUCCEEDED' || status === 'SUCCESS') return 'good';
  if (['FAILED', 'TIMEOUT', 'CANCELLED'].includes(status || '')) return 'bad';
  if (['RUNNING', 'WAITING_APPROVAL', 'AWAITING_APPROVAL', 'HELD_POLICY', 'DEGRADED_LLM',
    'BLOCKED_BY_PERMISSION', 'PENDING', 'SKIPPED'].includes(status || '')) return 'warn';
  return 'neutral';
}

export function phaseEvidence(summary: AgentRunSummary | null, phase: string): string {
  if (!summary) return 'Chưa có run được xác minh';
  if (phase === 'ACT' && summary.selectedTools.length) {
    return 'Đã ghi nhận ' + summary.selectedTools.length + ' lời gọi công cụ; xem trạng thái từng lời gọi';
  }
  if (phase === 'TOOL' && summary.selectedTools.length) {
    return 'Có ' + summary.selectedTools.length + ' tên công cụ trong bản ghi; lý do chọn chưa được lưu';
  }
  return 'Chưa có bằng chứng theo pha từ API';
}

export function safeAuditStatus(value: unknown): AuditStatus {
  return value === 'SUCCESS' || value === 'SKIPPED' || value === 'FAILED' || value === 'RUNNING'
    ? value : 'UNAVAILABLE';
}

const safeCode = (value: unknown): string | null =>
  typeof value === 'string' && /^[A-Za-z0-9_:-]{1,100}$/.test(value) ? value : null;

/** Explicitly whitelist public fields. Never carry logs' raw input/output/reasoning into UI. */
export function toSafeAuditEvent(value: unknown): AgentAuditEvent | null {
  if (!value || typeof value !== 'object') return null;
  const row = value as Record<string, unknown>;
  if (typeof row.id !== 'string' || !/^[A-Za-z0-9_-]{1,120}$/.test(row.id)) return null;
  return {
    id: row.id,
    action: safeCode(row.action) || 'UNKNOWN',
    status: safeAuditStatus(row.status),
    result: safeCode(row.result),
    reason: safeCode(row.reason),
    createdAt: typeof row.createdAt === 'string' && Number.isFinite(Date.parse(row.createdAt)) ? row.createdAt : null,
    purchaseRequestId: safeCode(row.purchaseRequestId)
  };
}

export function canReadRunSummary(isAdmin: boolean): boolean { return isAdmin; }

/** HTTP 200 is not a business success. Only Backend's explicit status is evidence. */
export function validateSummary(value: unknown): AgentRunSummary {
  if (!value || typeof value !== 'object') throw new Error('Phản hồi Agent không đúng cấu trúc.');
  const row = value as Record<string, unknown>;
  if (row.source !== 'AGENT_EXECUTION' || typeof row.runId !== 'string' ||
    !/^[A-Za-z0-9_-]{1,120}$/.test(row.runId) ||
    !['RUNNING', 'WAITING_APPROVAL', 'SUCCEEDED', 'FAILED', 'TIMEOUT', 'CANCELLED'].includes(String(row.status)) ||
    !Array.isArray(row.selectedTools) || !Array.isArray(row.permittedActions) ||
    row.permittedActions.length !== 0 || !row.approval || typeof row.approval !== 'object') {
    throw new Error('Bản tóm tắt run thiếu trường bắt buộc hoặc chưa được xác minh.');
  }
  const approval = row.approval as Record<string, unknown>;
  if (approval.canApproveFromThisEndpoint !== false || !['PENDING_HUMAN', 'NOT_RECORDED'].includes(String(approval.state))) {
    throw new Error('Dữ liệu phê duyệt không hợp lệ; đã giữ an toàn.');
  }
  // Server already restricts toolNames. Client also never renders arbitrary labels.
  const names = new Set(['getIngredientAvailability','getIngredientBatches','getRecipeRequirements',
    'getSalesHistory','findIngredientSuppliers','calculateReorderQuantity','estimatePurchaseCost']);
  const selectedTools = row.selectedTools.slice(0, 100).filter((v: unknown) => {
    if (!v || typeof v !== 'object') return false;
    const t = v as Record<string, unknown>;
    return names.has(String(t.name)) && typeof t.stepNo === 'number' &&
      Number.isInteger(t.stepNo) && t.stepNo >= 0 &&
      ['PENDING', 'RUNNING', 'SUCCEEDED', 'FAILED', 'BLOCKED_BY_PERMISSION', 'SKIPPED'].includes(String(t.status));
  }).map((v: { stepNo: number; name: string; status: ToolStatus }) => ({
    stepNo: v.stepNo, name: v.name, status: v.status, selectionReason: null as null
  }));
  return {
    runId: row.runId, source: 'AGENT_EXECUTION', status: row.status as RunStatus,
    startedAt: typeof row.startedAt === 'string' ? row.startedAt : '',
    completedAt: typeof row.completedAt === 'string' ? row.completedAt : null,
    taskIdentity: { type: 'AGENT_EXECUTION', id: row.runId },
    ingredientIdentity: null, perceptionSummary: null, planningSteps: [],
    selectedTools, selectionReasonsStatus: 'NOT_PERSISTED',
    dataQualityStatus: 'NOT_RECORDED',
    warnings: Array.isArray(row.warnings) ? row.warnings.filter(v => v === 'FALLBACK_USED' || v === 'AWAITING_HUMAN_REVIEW') : [],
    approval: { state: approval.state as AgentRunSummary['approval']['state'], canApproveFromThisEndpoint: false },
    blocked: row.status === 'WAITING_APPROVAL' || row.blocked === true,
    errorCode: safeCode(row.errorCode),
    messageVi: typeof row.messageVi === 'string' && row.messageVi.length <= 300 ? row.messageVi : runStatusLabel(String(row.status)),
    permittedActions: []
  };
}
