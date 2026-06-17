import { apiClient, unwrapApiList } from "./client";
import type { AgentLog } from "../types/agentLog.types";

const normalizeAgentLog = (log: any): AgentLog => ({
  ...log,
  status: log?.status ?? log?.result,
  errorMessage: log?.errorMessage ?? log?.error_message,
  error_message: log?.error_message ?? log?.errorMessage,
  purchaseRequestId: log?.purchaseRequestId ?? log?.purchase_request_id,
  purchase_request_id: log?.purchase_request_id ?? log?.purchaseRequestId,
  createdAt: log?.createdAt ?? log?.created_at ?? log?.triggered_at,
  created_at: log?.created_at ?? log?.createdAt ?? log?.triggered_at,
});

export const agentLogsApi = {
  getAgentLogs: async (): Promise<AgentLog[]> => {
    const response = await apiClient.get("/agent/logs");
    return unwrapApiList<any>(response.data, "logs").map(normalizeAgentLog);
  },
};
