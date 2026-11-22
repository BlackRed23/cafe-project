import { apiClient, unwrapApiData } from './client';
import { toSafeAuditEvent, validateSummary } from '../features/agent/agentWorkspace.presentation';
import type { AgentRunSummary, AuditPage } from '../features/agent/agentWorkspace.types';

export const agentWorkspaceApi = {
  /** ADMIN only. Backend enforces active JWT actor and per-record ownership. */
  async runSummary(runId: string): Promise<AgentRunSummary> {
    if (!/^[A-Za-z0-9_-]{1,120}$/.test(runId)) throw new Error('Mã run không hợp lệ.');
    const response = await apiClient.get('/agent/executions/' + encodeURIComponent(runId) + '/summary');
    return validateSummary(unwrapApiData<unknown>(response.data));
  },
  /** ADMIN/STAFF: display a strict allowlist only, not raw legacy agent log payloads. */
  async auditPage(page = 1): Promise<AuditPage> {
    const safePage = Number.isInteger(page) && page > 0 ? Math.min(page, 10000) : 1;
    const response = await apiClient.get('/agent/logs', { params: { page: safePage, limit: 12 } });
    const raw = unwrapApiData<unknown>(response.data);
    if (!raw || typeof raw !== 'object' || !Array.isArray((raw as {logs?: unknown}).logs)) {
      throw new Error('Nhật ký Agent chưa có cấu trúc hợp lệ.');
    }
    const data = raw as Record<string, unknown>;
    const pagination = data.pagination && typeof data.pagination === 'object'
      ? data.pagination as Record<string, unknown> : null;
    const validPagination = pagination && ['page', 'limit', 'total', 'totalPages'].every(
      k => Number.isInteger(pagination[k]) && Number(pagination[k]) >= 0)
      ? pagination as unknown as AuditPage['pagination'] : null;
    return { logs: (data.logs as unknown[]).map(toSafeAuditEvent).filter((x): x is NonNullable<typeof x> => x !== null),
      pagination: validPagination };
  }
};
