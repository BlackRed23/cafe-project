import http, { type IncomingMessage, type ServerResponse } from 'node:http';
import { URL } from 'node:url';
import dotenv from 'dotenv';
import { requireInternalSecret, validInternalToken, requireAgentUser } from './internal-auth';
import { agentService } from './services/agent.service';

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

const readJsonBody = async (req: IncomingMessage): Promise<any> =>
    new Promise((resolve, reject) => {
        const chunks: Buffer[] = [];
        req.on('data', (chunk) => chunks.push(Buffer.from(chunk)));
        req.on('error', reject);
        req.on('end', () => {
            const raw = Buffer.concat(chunks).toString('utf8').trim();
            if (!raw) return resolve({});
            try {
                resolve(JSON.parse(raw));
            } catch {
                reject(new Error('Invalid JSON body.'));
            }
        });
    });

const getQuery = (url: URL) => Object.fromEntries(url.searchParams.entries());

const requireInternalToken = (req: IncomingMessage, res: ServerResponse): boolean => {
    const token = req.headers['x-agent-internal-token'];
    if (!validInternalToken(token)) {
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

        if (!requireInternalToken(req, res)) return;
        // Only the authenticated backend may assert identity; JSON is never an identity source.
        const systemLog = method === 'POST' && url.pathname === '/internal/agent/logs'
            && req.headers['x-agent-principal'] === 'system';
        const userId = systemLog ? undefined : await requireAgentUser(req.headers['x-agent-user-id'],
            method === 'GET' && url.pathname === '/internal/agent/logs' ? ['ADMIN', 'STAFF'] : ['ADMIN']);

        if (method === 'POST' && url.pathname === '/internal/agent/scan-inventory') {
            const body = await readJsonBody(req);
            const data = await agentService.scanInventory(body.input || {}, userId!);
            return sendJson(res, 200, { data });
        }

        if (method === 'GET' && url.pathname === '/internal/agent/logs') {
            const data = await agentService.logs(getQuery(url));
            return sendJson(res, 200, { data });
        }

        if (method === 'POST' && url.pathname === '/internal/agent/recommend-reorder') {
            const body = await readJsonBody(req);
            const data = await agentService.recommendReorder(body.input || {}, userId!);
            return sendJson(res, 200, { data });
        }

        if (method === 'GET' && url.pathname === '/internal/agent/recommendations') {
            const data = await agentService.getRecommendations();
            return sendJson(res, 200, { data });
        }

        const createPrMatch = url.pathname.match(/^\/internal\/agent\/recommendations\/([^/]+)\/create-purchase-request$/);
        if (method === 'POST' && createPrMatch) {
            await readJsonBody(req);
            const data = await agentService.createPurchaseRequestFromRecommendation(createPrMatch[1], userId!);
            return sendJson(res, 200, { data });
        }

        if (method === 'POST' && url.pathname === '/internal/agent/logs') {
            const body = await readJsonBody(req);
            const data = await agentService.createLog({ ...body, creator: userId ? { connect: { id: userId } } : undefined, createdBy: undefined });
            return sendJson(res, 201, { data });
        }

        return sendJson(res, 404, { message: 'Not found' });
    } catch (error) {
        const statusCode = typeof (error as any)?.statusCode === 'number' ? (error as any).statusCode : 500;
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
