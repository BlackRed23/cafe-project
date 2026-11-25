import http, { type IncomingMessage, type ServerResponse } from 'node:http';
import { URL } from 'node:url';
import dotenv from 'dotenv';
import { requireInternalSecret, validInternalToken, requireAgentUser } from './internal-auth';
import { agentService, type RecommendReorderInput, type ScanInventoryInput } from './services/agent.service';
import { executeApprovedPurchaseProposal } from './services/purchase-proposal.client';
import { recordAgentInternalDenial } from './services/security/agent-denial-audit';
import { z } from 'zod';

dotenv.config();


const AGENT_HOST = process.env.AGENT_HOST || '127.0.0.1';

const AGENT_PORT = Number.parseInt(
    process.env.PORT || process.env.AGENT_PORT || '5055',
    10
);

requireInternalSecret();

const sendJson = (res: ServerResponse, statusCode: number, payload: unknown) => {
    const body = JSON.stringify(payload);
    res.writeHead(statusCode, {
        'content-type': 'application/json; charset=utf-8',
        'content-length': Buffer.byteLength(body)
    });
    res.end(body);
};

const readJsonBody = async <T = unknown>(req: IncomingMessage): Promise<T> =>
    new Promise<T>((resolve, reject) => {
        const chunks: Buffer[] = [];
        req.on('data', (chunk) => chunks.push(Buffer.from(chunk)));
        req.on('error', reject);
        req.on('end', () => {
            const raw = Buffer.concat(chunks).toString('utf8').trim();
            if (!raw) return resolve({} as T);
            try {
                resolve(JSON.parse(raw));
            } catch {
                reject(new Error('Invalid JSON body.'));
            }
        });
    });

const getQuery = (url: URL) => Object.fromEntries(url.searchParams.entries());

const requireInternalToken = async (req: IncomingMessage, res: ServerResponse): Promise<boolean> => {
    const token = req.headers['x-agent-internal-token'];
    if (!validInternalToken(token)) {
        await recordAgentInternalDenial('INVALID_INTERNAL_TOKEN', req.method);
        sendJson(res, 401, { message: 'Unauthorized' });
        return false;
    }
    return true;
};

export const handleRequest = async (req: IncomingMessage, res: ServerResponse) => {
    const url = new URL(req.url || '/', 'http://agent.internal');
    const method = req.method || 'GET';

    try {
        if (method === 'GET' && url.pathname === '/health') {
            return sendJson(res, 200, { status: 'OK' });
        }

        if (!url.pathname.startsWith('/internal/agent/')) {
            return sendJson(res, 404, { message: 'Not found' });
        }

        if (!await requireInternalToken(req, res)) return;
        // Only the authenticated backend may assert identity; JSON is never an identity source.
        const systemLog = method === 'POST' && url.pathname === '/internal/agent/logs'
            && req.headers['x-agent-principal'] === 'system';
        let userId: string | undefined;
        try {
            userId = systemLog ? undefined : await requireAgentUser(req.headers['x-agent-user-id'],
                method === 'GET' && url.pathname === '/internal/agent/logs' ? ['ADMIN', 'STAFF'] : ['ADMIN']);
        } catch (error) {
            await recordAgentInternalDenial('INTERNAL_PRINCIPAL_FORBIDDEN', method);
            throw error;
        }

        if (method === 'POST' && url.pathname === '/internal/agent/scan-inventory') {
            const body = await readJsonBody<{ input?: ScanInventoryInput }>(req);
            const data = await agentService.scanInventory(body.input || {}, userId!);
            return sendJson(res, 200, { data });
        }
        if (method === 'POST' && url.pathname === '/internal/agent/graph-proposal-review') {
            const body = await readJsonBody<{ input: unknown }>(req);
            // User principal comes exclusively from verified internal headers,
            // NOT from the supplied JSON or a forged ADMIN JWT.
            const { runLiveReadOnlyProposalReview } = await import('./workflows/agent-live-readonly');
            const data = await runLiveReadOnlyProposalReview(body.input, userId!);
            return sendJson(res, 200, { data });
        }
        if (method === 'POST' && url.pathname === '/internal/agent/graph-purchasing-resume') {
            const raw = await readJsonBody(req);
            const parsed = z.strictObject({
                scanSessionId: z.string().min(8).max(200),
                ingredientIds: z.array(z.string().regex(/^[A-Za-z0-9][A-Za-z0-9:_-]{0,119}$/))
                    .min(1).max(4)
            }).safeParse(raw);
            if (!parsed.success || new Set(parsed.data.ingredientIds).size !== parsed.data.ingredientIds.length ||
                process.env.AGENT_GRAPH_PURCHASING !== 'YES') {
                return sendJson(res, 403, { message: 'Graph purchasing resume denied.' });
            }
            const { runLiveReadOnlyGraph } = await import('./workflows/agent-live-readonly');
            const data = await runLiveReadOnlyGraph({ scope: 'INGREDIENT',
                ingredientIds: parsed.data.ingredientIds }, userId!, parsed.data.scanSessionId,
                undefined, true);
            return sendJson(res, 200, { data });
        }
        if (method === 'POST' && url.pathname === '/internal/agent/graph-proposal-risk-review') {
            const body = await readJsonBody<{ input: unknown }>(req);
            const { runLiveReadOnlyJointReview } = await import('./workflows/agent-live-readonly');
            const data = await runLiveReadOnlyJointReview(body.input, userId!);
            return sendJson(res, 200, { data });
        }

        if (method === 'GET' && url.pathname === '/internal/agent/logs') {
            const data = await agentService.logs(getQuery(url));
            return sendJson(res, 200, { data });
        }

        if (method === 'POST' && url.pathname === '/internal/agent/recommend-reorder') {
            const body = await readJsonBody<{ input?: RecommendReorderInput }>(req);
            const data = await agentService.recommendReorder(body.input || {}, userId!);
            return sendJson(res, 200, { data });
        }

        if (method === 'GET' && url.pathname === '/internal/agent/recommendations') {
            const data = await agentService.getRecommendations();
            return sendJson(res, 200, { data });
        }

        const executeMatch = url.pathname.match(/^\/internal\/agent\/purchase-proposals\/([^/]+)\/execute$/);
        if (method === 'POST' && executeMatch) {
            const body = await readJsonBody<{ version: number; contentHash: string; idempotencyKey: string }>(req);
            if (Object.keys(body).some(key => !['version', 'contentHash', 'idempotencyKey'].includes(key))) {
                return sendJson(res, 400, { message: 'Only approved proposal reference allowed.' });
            }
            const data = await executeApprovedPurchaseProposal(executeMatch[1], { version: body.version, contentHash: body.contentHash }, body.idempotencyKey);
            return sendJson(res, 200, { data });
        }
        const createPrMatch = url.pathname.match(/^\/internal\/agent\/recommendations\/([^/]+)\/create-purchase-request$/);
        if (method === 'POST' && createPrMatch) {
            await readJsonBody(req);
            const data = await agentService.createPurchaseRequestFromRecommendation(createPrMatch[1], userId!);
            return sendJson(res, 200, { data });
        }

        if (method === 'POST' && url.pathname === '/internal/agent/logs') {
            const body = await readJsonBody<Parameters<typeof agentService.createLog>[0] & { createdBy?: unknown }>(req);
            const log = { ...body, creator: userId ? { connect: { id: userId } } : undefined };
            delete log.createdBy;
            const data = await agentService.createLog(log);
            return sendJson(res, 201, { data });
        }

        return sendJson(res, 404, { message: 'Not found' });
    } catch (error) {
        // A second authenticated RESUME against the same durable Graph lease
        // is an ordinary concurrency conflict, not an internal HTTP 500.
        // The first invocation may finish normally; never retry a purchasing
        // WRITE here or expose internal checkpoint/credential details.
        if (error instanceof Error && error.message === 'GRAPH_RESUME_IN_PROGRESS') {
            return sendJson(res, 409, { message: 'Graph resume already in progress.' });
        }
        const statusCode = error && typeof error === 'object' && 'statusCode' in error && typeof error.statusCode === 'number'
            ? error.statusCode : 500;
        const message = statusCode === 403 ? 'Forbidden' : 'Agent service error.';
        return sendJson(res, statusCode, { message });
    }
};

if (require.main === module) {
    const server = http.createServer((req, res) => {
        handleRequest(req, res).catch(() => {
            sendJson(res, 500, { message: 'Agent service error.' });
        });
    });

    server.listen(AGENT_PORT, AGENT_HOST, () => {
        console.log('[agent-service] listening on configured interface');
    });
}
