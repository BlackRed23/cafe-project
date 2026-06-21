import { agentService, type AgentLogQuery, type RecommendReorderInput, type ScanInventoryInput } from './services/agent.service';

export type { AgentLogQuery, AgentLogStatus, RecommendReorderInput, ScanInventoryInput } from './services/agent.service';

export const scanInventory = (input: ScanInventoryInput, userId: string) =>
    agentService.scanInventory(input, userId);

export const getAgentLogs = (query: AgentLogQuery = {}) =>
    agentService.logs(query);

export const recommendReorder = (input: RecommendReorderInput, userId: string) =>
    agentService.recommendReorder(input, userId);

export const getRecommendations = () =>
    agentService.getRecommendations();

export const createPurchaseRequestFromRecommendation = (logId: string, userId: string) =>
    agentService.createPurchaseRequestFromRecommendation(logId, userId);

export const createAgentLog = (data: Parameters<typeof agentService.createLog>[0]) =>
    agentService.createLog(data);
