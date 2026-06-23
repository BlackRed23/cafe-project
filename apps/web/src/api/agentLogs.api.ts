import { apiClient, unwrapApiData } from "./client";
import type {
  AgentLog,
  AgentLogsQuery,
  AgentLogsResponse,
  AgentLogStatus,
  ScanInventoryRequest,
  ScanInventoryResponse,
} from "../types/agentLog.types";
import { fixVietnameseMojibakeText } from "../utils/textEncoding";

const FAILED_RESULTS = new Set(["FAILED", "ERROR", "SERVER_ERROR", "DATABASE_ERROR", "SMTP_ERROR", "INVALID_DATA"]);
const SKIPPED_RESULTS = new Set([
  "SKIPPED",
  "SKIPPED_DUPLICATE",
  "SKIPPED_DISABLED",
  "NO_SUPPLIER",
  "ACTIVE_PR_EXISTS",
  "AI_DISABLED",
  "ABOVE_THRESHOLD",
  "STOCK_OK",
]);
const SUCCESS_RESULTS = new Set(["CREATED_PURCHASE_REQUEST", "RECOMMENDED", "CONVERTED_TO_PR", "SUCCESS"]);

export const normalizeAgentLogStatus = (result?: string, errorMessage?: string): AgentLogStatus => {
  if (errorMessage) return "FAILED";

  const normalized = (result || "").toUpperCase();
  if (FAILED_RESULTS.has(normalized)) return "FAILED";
  if (normalized === "RUNNING") return "RUNNING";
  if (SKIPPED_RESULTS.has(normalized)) return "SKIPPED";
  if (SUCCESS_RESULTS.has(normalized)) return "SUCCESS";

  return "SUCCESS";
};

const asObject = (value: unknown): Record<string, any> =>
  value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, any>) : {};

const parseJsonObject = (value: unknown): Record<string, any> => {
  if (typeof value !== "string" || !value.trim()) return asObject(value);
  try {
    return asObject(JSON.parse(value));
  } catch {
    return {};
  }
};

const firstString = (...values: unknown[]): string | undefined => {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) return fixVietnameseMojibakeText(value).trim();
  }
  return undefined;
};

const cleanDisplayText = (value: unknown): string | undefined =>
  typeof value === "string" ? fixVietnameseMojibakeText(value) : undefined;

const normalizeAgentOutput = (output: Record<string, any>): Record<string, any> => {
  const next = { ...output };
  const message = cleanDisplayText(next.message);
  const errorMessage = cleanDisplayText(next.errorMessage);
  const description = cleanDisplayText(next.description);
  if (message !== undefined) next.message = message;
  if (errorMessage !== undefined) next.errorMessage = errorMessage;
  if (description !== undefined) next.description = description;

  if (next.notification && typeof next.notification === "object" && !Array.isArray(next.notification)) {
    const notification = { ...next.notification };
    const title = cleanDisplayText(notification.title);
    const description = cleanDisplayText(notification.description);
    if (title !== undefined) notification.title = title;
    if (description !== undefined) notification.description = description;
    next.notification = notification;
  }

  return next;
};

const normalizeAgentLog = (log: any): AgentLog => {
  const input = parseJsonObject(log?.input);
  const parsedOutput = parseJsonObject(log?.output);
  const output = Object.keys(parsedOutput).length ? normalizeAgentOutput(parsedOutput) : parsedOutput;
  const result = firstString(log?.result, log?.status) || "";
  const errorMessage = firstString(log?.errorMessage, log?.error_message, log?.error);
  const referenceType = firstString(log?.referenceType, log?.reference_type);
  const referenceId = firstString(log?.referenceId, log?.reference_id);
  const purchaseRequestId =
    firstString(log?.purchaseRequestId, log?.purchase_request_id, output.purchaseRequestId) ||
    ((referenceType === "PurchaseRequest" || referenceType === "purchase_request") ? referenceId : undefined);

  return {
    ...log,
    id: String(log?.id || ""),
    action: firstString(log?.action) || "UNKNOWN",
    status: firstString(log?.status)
      ? (log.status as AgentLogStatus)
      : normalizeAgentLogStatus(result, errorMessage),
    result,
    reason: firstString(log?.reason, output.reason, input.reason, result),
    description: firstString(log?.description, log?.data?.description, output?.description, output?.message, log?.message) || "",
    message: firstString(log?.message, log?.description, output?.message, output?.description) || "",
    triggerType: firstString(log?.triggerType, input.triggerType),
    sourceType: firstString(log?.sourceType, log?.source_type, input.sourceType, output.sourceType),
    sourceId: firstString(log?.sourceId, log?.source_id, input.sourceId, output.sourceId),
    productId: firstString(log?.productId, output.productId, input.productId, log?.product?.id),
    productName: firstString(log?.productName, output.productName, input.productName, log?.product?.name),
    inventoryId: firstString(log?.inventoryId, output.inventoryId, input.inventoryId),
    purchaseRequestId,
    purchase_request_id: purchaseRequestId,
    referenceType,
    referenceId,
    input: Object.keys(input).length ? input : log?.input ?? null,
    output: Object.keys(output).length ? output : log?.output ?? null,
    reasoning: firstString(log?.reasoning),
    error: firstString(log?.error),
    errorMessage,
    error_message: errorMessage,
    fallbackUsed: Boolean(log?.fallbackUsed ?? log?.fallback_used),
    createdAt: firstString(log?.createdAt, log?.created_at, log?.triggered_at) || "",
    created_at: firstString(log?.created_at, log?.createdAt, log?.triggered_at) || "",
  };
};

const cleanParams = (query?: AgentLogsQuery) => {
  if (!query) return undefined;

  const params: Record<string, string | number> = {};
  if (query.page) params.page = query.page;
  if (query.limit) params.limit = query.limit;
  if (query.status) params.status = query.status;
  if (query.action?.trim()) params.action = query.action.trim();
  if (query.triggerType?.trim()) params.triggerType = query.triggerType.trim();
  if (query.productId?.trim()) params.productId = query.productId.trim();

  return Object.keys(params).length ? params : undefined;
};

export const agentLogsApi = {
  scanInventory: async (payload: ScanInventoryRequest): Promise<ScanInventoryResponse> => {
    const response = await apiClient.post("/agent/scan-inventory", payload);
    const data = unwrapApiData<any>(response.data);

    return {
      ...data,
      results: Array.isArray(data?.results) ? data.results.map(normalizeAgentLog) : [],
      createdPurchaseRequests: Array.isArray(data?.createdPurchaseRequests) ? data.createdPurchaseRequests : [],
      agentWarning: firstString(data?.agentWarning),
    };
  },

  getAgentLogsResponse: async (query?: AgentLogsQuery): Promise<AgentLogsResponse> => {
    const response = await apiClient.get("/agent/logs", { params: cleanParams(query) });
    const data = unwrapApiData<any>(response.data);
    const logs = Array.isArray(data?.logs) ? data.logs.map(normalizeAgentLog) : [];

    return {
      logs,
      pagination: data?.pagination,
    };
  },

  getAgentLogs: async (query?: AgentLogsQuery): Promise<AgentLog[]> => {
    const response = await agentLogsApi.getAgentLogsResponse(query);
    return response.logs;
  },
};
