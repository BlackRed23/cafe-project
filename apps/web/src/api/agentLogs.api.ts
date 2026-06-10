import { apiClient, USE_MOCK } from "./client";
import type { AgentLog } from "../types/agentLog.types";
import { MockDB } from "./mockDb";

export const agentLogsApi = {
  getAgentLogs: async (params?: { limit?: number }): Promise<AgentLog[]> => {
    if (USE_MOCK) {
      const logs = MockDB.getLogs();
      if (params?.limit) {
        return logs.slice(0, params.limit);
      }
      return logs;
    }
    const response = await apiClient.get<AgentLog[]>("/agent-logs", { params });
    return response.data;
  },
};
