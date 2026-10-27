import { prisma } from '@cafe-project/database';
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

const AGENT_SERVICE_URL = process.env.AGENT_BASE_URL || 'http://localhost:5055';
const internalSecret = () => {
    const secret = process.env.AGENT_INTERNAL_TOKEN;
    if (!secret || !/^[A-Za-z0-9_-]{43,}$/.test(secret) || new Set(secret).size < 12)
        throw new AgentServiceError('Invalid internal Agent authentication configuration.', 503);
    return secret;
};
const authorize = async (method: string, path: string, userId?: string) => {
    if (method === 'POST' && path === '/internal/agent/logs' && !userId) return;
    if (!userId) throw new AgentServiceError('Forbidden', 403);
    const user = await prisma.user.findUnique({ where: { id: userId }, select: { role: true, isActive: true } })
        .catch(() => { throw new AgentServiceError('Agent authorization unavailable.', 503); });
    const roles = method === 'GET' && path === '/internal/agent/logs' ? ['ADMIN', 'STAFF'] : ['ADMIN'];
    if (!user?.isActive || !roles.includes(user.role)) throw new AgentServiceError('Forbidden', 403);
};
const rethrowSecurityError = (error: unknown) => {
    if (error instanceof AgentServiceError && [401, 403, 503].includes(error.statusCode || 0)) throw error;
};
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

const requestJson = async <T>(method: 'GET' | 'POST', path: string, body?: unknown, query?: Record<string, unknown>, userId?: string): Promise<T> => {
    const token = internalSecret();
    await authorize(method, path, userId);
    return new Promise<T>((resolve, reject) => {
        const url = buildUrl(path, query);
        const payload = body === undefined ? undefined : JSON.stringify(body);
        const transport = url.protocol === 'https:' ? https : http;
        const req = transport.request(
            url,
            {
                method,
                timeout: AGENT_SERVICE_TIMEOUT_MS,
                headers: {
                    'x-agent-internal-token': token,
                    'x-agent-principal': userId ? 'user' : 'system',
                    ...(userId ? { 'x-agent-user-id': userId } : {}),
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
                            reject(new AgentServiceError('Agent service request failed.', res.statusCode));
                            return;
                        }
                        resolve((parsed?.data ?? parsed) as T);
                    } catch {
                        reject(new AgentServiceError('Invalid Agent service response.'));
                    }
                });
            }
        );

        req.on('timeout', () => {
            req.destroy(new AgentServiceError(`Agent service timeout after ${AGENT_SERVICE_TIMEOUT_MS}ms.`));
        });
        req.on('error', (error) => reject(error instanceof AgentServiceError
            ? error : new AgentServiceError('Agent service unavailable.')));
        if (payload) req.write(payload);
        req.end();
    }).catch((error: unknown) => {
        throw error instanceof AgentServiceError ? error : new AgentServiceError('Agent service unavailable.');
    });
};

export const scanInventoryViaAgentService = async (input: ScanInventoryInput, userId?: string) => {
    try {
        return await requestJson<any>('POST', '/internal/agent/scan-inventory', { input }, undefined, userId);
    } catch (error) {
        rethrowSecurityError(error);
        const log = await agentFailureLogService.createServiceUnavailableLog(input, error, userId);
        return {
            results: [log],
            createdPurchaseRequests: [],
            agentWarning: 'Không kết nối được AI Agent service.'
        };
    }
};

export const getAgentLogsViaAgentService = async (query: Record<string, unknown> = {}, userId?: string) => {
    try {
        return await requestJson<any>('GET', '/internal/agent/logs', undefined, query, userId);
    } catch (error) {
        rethrowSecurityError(error);
        await agentFailureLogService.createServiceUnavailableLog({ triggerType: 'GET_AGENT_LOGS' }, error);
        return agentFailureLogService.listLogs(query);
    }
};

export const recommendReorderViaAgentService = (input: RecommendReorderInput, userId: string) =>
    requestJson<any>('POST', '/internal/agent/recommend-reorder', { input }, undefined, userId);

export const getRecommendationsViaAgentService = (userId?: string) =>
    requestJson<any>('GET', '/internal/agent/recommendations', undefined, undefined, userId);

export const createPurchaseRequestFromRecommendationViaAgentService = (id: string, userId: string) =>
    requestJson<any>('POST', `/internal/agent/recommendations/${id}/create-purchase-request`, {}, undefined, userId);

export const createAgentLogViaAgentService = async (input: Record<string, unknown>) => {
    try {
        return await requestJson<any>('POST', '/internal/agent/logs', input);
    } catch (error) {
        rethrowSecurityError(error);
        return agentFailureLogService.createServiceUnavailableLog({ triggerType: asString(input.action) }, error);
    }
};

const asString = (value: unknown): string | undefined =>
    typeof value === 'string' && value.trim() ? value.trim() : undefined;
