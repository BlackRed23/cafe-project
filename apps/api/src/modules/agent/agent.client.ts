import http from 'node:http';
import https from 'node:https';
import { URL } from 'node:url';
import { agentFailureLogService } from './agent-failure-log.service';

type ScanInventoryInput = {
    productIds?: string[];
    triggerType?: string;
    sourceType?: string;
    sourceId?: string;
    note?: string;
};

type RecommendReorderInput = {
    productIds?: string[];
    force?: boolean;
};

const AGENT_SERVICE_URL = process.env.AGENT_SERVICE_URL || 'http://127.0.0.1:5055';
const AGENT_INTERNAL_TOKEN = process.env.AGENT_INTERNAL_TOKEN || 'dev-agent-secret';
const AGENT_SERVICE_TIMEOUT_MS = Number.parseInt(process.env.AGENT_SERVICE_TIMEOUT_MS || '5000', 10);

class AgentServiceError extends Error {
    constructor(message: string, readonly statusCode?: number) {
        super(message);
    }
}

const buildUrl = (path: string, query?: Record<string, unknown>) => {
    const url = new URL(path, AGENT_SERVICE_URL);
    if (query) {
        for (const [key, value] of Object.entries(query)) {
            if (value !== undefined && value !== null && value !== '') url.searchParams.set(key, String(value));
        }
    }
    return url;
};

const requestJson = <T>(method: 'GET' | 'POST', path: string, body?: unknown, query?: Record<string, unknown>): Promise<T> =>
    new Promise((resolve, reject) => {
        const url = buildUrl(path, query);
        const payload = body === undefined ? undefined : JSON.stringify(body);
        const transport = url.protocol === 'https:' ? https : http;
        const req = transport.request(
            url,
            {
                method,
                timeout: AGENT_SERVICE_TIMEOUT_MS,
                headers: {
                    'x-agent-internal-token': AGENT_INTERNAL_TOKEN,
                    ...(payload
                        ? {
                              'content-type': 'application/json',
                              'content-length': Buffer.byteLength(payload)
                          }
                        : {})
                }
            },
            (res) => {
                const chunks: Buffer[] = [];
                res.on('data', (chunk) => chunks.push(Buffer.from(chunk)));
                res.on('end', () => {
                    try {
                        const raw = Buffer.concat(chunks).toString('utf8');
                        const parsed = raw ? JSON.parse(raw) : {};
                        if ((res.statusCode || 500) >= 400) {
                            reject(new AgentServiceError(parsed?.message || 'Agent service request failed.', res.statusCode));
                            return;
                        }
                        resolve((parsed?.data ?? parsed) as T);
                    } catch (error) {
                        reject(error);
                    }
                });
            }
        );

        req.on('timeout', () => {
            req.destroy(new AgentServiceError(`Agent service timeout after ${AGENT_SERVICE_TIMEOUT_MS}ms.`));
        });
        req.on('error', reject);
        if (payload) req.write(payload);
        req.end();
    });

export const scanInventoryViaAgentService = async (input: ScanInventoryInput, userId: string) => {
    try {
        return await requestJson<any>('POST', '/internal/agent/scan-inventory', { input, userId });
    } catch (error) {
        const log = await agentFailureLogService.createServiceUnavailableLog(input, error, userId);
        return {
            results: [log],
            createdPurchaseRequests: [],
            agentWarning: 'Không kết nối được AI Agent service.'
        };
    }
};

export const getAgentLogsViaAgentService = async (query: Record<string, unknown> = {}) => {
    try {
        return await requestJson<any>('GET', '/internal/agent/logs', undefined, query);
    } catch (error) {
        await agentFailureLogService.createServiceUnavailableLog({ triggerType: 'GET_AGENT_LOGS' }, error);
        return agentFailureLogService.listLogs(query);
    }
};

export const recommendReorderViaAgentService = (input: RecommendReorderInput, userId: string) =>
    requestJson<any>('POST', '/internal/agent/recommend-reorder', { input, userId });

export const getRecommendationsViaAgentService = () =>
    requestJson<any>('GET', '/internal/agent/recommendations');

export const createPurchaseRequestFromRecommendationViaAgentService = (id: string, userId: string) =>
    requestJson<any>('POST', `/internal/agent/recommendations/${id}/create-purchase-request`, { userId });

export const createAgentLogViaAgentService = async (input: Record<string, unknown>) => {
    try {
        return await requestJson<any>('POST', '/internal/agent/logs', input);
    } catch (error) {
        return agentFailureLogService.createServiceUnavailableLog({ triggerType: asString(input.action) }, error);
    }
};

const asString = (value: unknown): string | undefined =>
    typeof value === 'string' && value.trim() ? value.trim() : undefined;
