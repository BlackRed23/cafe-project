/** The public projection of a legacy AgentExecution. No private Graph state. */
export type RunStatus = 'RUNNING' | 'WAITING_APPROVAL' | 'SUCCEEDED' | 'FAILED' | 'TIMEOUT' | 'CANCELLED';
export type ToolStatus = 'PENDING' | 'RUNNING' | 'SUCCEEDED' | 'FAILED' | 'BLOCKED_BY_PERMISSION' | 'SKIPPED';

export interface AgentRunSummary {
  runId: string;
  source: 'AGENT_EXECUTION';
  status: RunStatus;
  startedAt: string;
  completedAt: string | null;
  taskIdentity: { type: 'AGENT_EXECUTION'; id: string };
  ingredientIdentity: null;
  perceptionSummary: null;
  planningSteps: [];
  selectedTools: Array<{ stepNo: number; name: string; status: ToolStatus; selectionReason: null }>;
  selectionReasonsStatus: 'NOT_PERSISTED';
  dataQualityStatus: 'NOT_RECORDED';
  warnings: Array<'FALLBACK_USED' | 'AWAITING_HUMAN_REVIEW'>;
  approval: { state: 'PENDING_HUMAN' | 'NOT_RECORDED'; canApproveFromThisEndpoint: false };
  blocked: boolean;
  errorCode: string | null;
  messageVi: string;
  permittedActions: [];
}

export type AuditStatus = 'SUCCESS' | 'SKIPPED' | 'FAILED' | 'RUNNING' | 'UNAVAILABLE';
export interface AgentAuditEvent {
  id: string;
  action: string;
  status: AuditStatus;
  result: string | null;
  reason: string | null;
  createdAt: string | null;
  purchaseRequestId: string | null;
}

export interface AuditPage {
  logs: AgentAuditEvent[];
  pagination: { page: number; limit: number; total: number; totalPages: number } | null;
}
