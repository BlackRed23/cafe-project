export interface AgentLog {
  id: string;
  action?: string;
  status?: string;
  input?: unknown;
  output?: unknown;
  reasoning?: string;
  error?: string;
  errorMessage?: string;
  error_message?: string;
  purchaseRequestId?: string;
  purchase_request_id?: string;
  product?: {
    id: string;
    name: string;
  };
  createdAt?: string;
  created_at?: string;
}
