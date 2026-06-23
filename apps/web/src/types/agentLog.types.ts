export type AgentLogStatus = "SUCCESS" | "SKIPPED" | "FAILED" | "RUNNING";

export interface AgentLogNotification {
  type: "success" | "info" | "warning" | "error";
  title: string;
  description: string;
  actionLabel?: string;
  actionUrl?: string;
}

export interface AgentLog {
  id: string;
  action: string;
  status: AgentLogStatus;
  result: string;
  reason?: string;
  message: string;
  description?: string;
  triggerType?: string;
  sourceType?: string;
  sourceId?: string;
  productId?: string;
  productName?: string;
  inventoryId?: string;
  purchaseRequestId?: string;
  referenceType?: string;
  referenceId?: string;
  referenceProductId?: string;
  scanSessionId?: string;
  input?: unknown;
  output?: unknown;
  reasoning?: string;
  error?: string;
  errorMessage?: string;
  fallbackUsed?: boolean;
  createdBy?: unknown;
  createdAt: string;
  product?: {
    id: string;
    name: string;
  };
  error_message?: string;
  purchase_request_id?: string;
  created_at?: string;
}

export interface AgentLogsPagination {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

export interface AgentLogsResponse {
  logs: AgentLog[];
  pagination?: AgentLogsPagination;
}

export interface AgentLogsQuery {
  page?: number;
  limit?: number;
  status?: AgentLogStatus;
  action?: string;
  triggerType?: string;
  productId?: string;
}

export interface ScanInventoryRequest {
  productIds?: string[];
  triggerType: string;
}

export interface ScanInventoryResponse {
  results?: AgentLog[];
  createdPurchaseRequests?: Array<{
    id: string;
    requestNumber?: string;
    supplierName?: string;
    status?: string;
  }>;
  agentWarning?: string;
  scanSessionId?: string;
  sessionStatus?: string;
  summary?: any;
  cooldownRemainingSeconds?: number;
  activeScanSessionId?: string;
  activeTriggerType?: string;
  startedAt?: number;
}
