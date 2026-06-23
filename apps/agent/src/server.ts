import http, { type IncomingMessage, type ServerResponse } from 'node:http';
import { URL } from 'node:url';
import dotenv from 'dotenv';
import { agentService } from './services/agent.service';

dotenv.config();


const AGENT_HOST = process.env.AGENT_HOST || process.env.HOST || '127.0.0.1' || '0.0.0.0';
const AGENT_PORT = Number.parseInt(process.env.AGENT_PORT || process.env.PORT || '5055', 10);

const INTERNAL_TOKEN = process.env.AGENT_INTERNAL_TOKEN || 'dev-agent-secret';

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
    if (token !== INTERNAL_TOKEN) {
        sendJson(res, 401, { message: 'Unauthorized' });
        return false;
    }
    return true;
};

const handleRequest = async (req: IncomingMessage, res: ServerResponse) => {
    const url = new URL(req.url || '/', `http://${req.headers.host || `${AGENT_HOST}:${AGENT_PORT}`}`);
    const method = req.method || 'GET';

    try {
        if (method === 'GET' && url.pathname === '/health') {
            return sendJson(res, 200, { status: 'OK' });
        }

        if (!url.pathname.startsWith('/internal/agent/')) {
            return sendJson(res, 404, { message: 'Not found' });
        }

        if (!requireInternalToken(req, res)) return;

        if (method === 'POST' && url.pathname === '/internal/agent/scan-inventory') {
            const body = await readJsonBody(req);
            const data = await agentService.scanInventory(body.input || {}, body.userId || '');
            return sendJson(res, 200, { data });
        }

        if (method === 'GET' && url.pathname === '/internal/agent/logs') {
            const data = await agentService.logs(getQuery(url));
            return sendJson(res, 200, { data });
        }

        if (method === 'POST' && url.pathname === '/internal/agent/recommend-reorder') {
            const body = await readJsonBody(req);
            const data = await agentService.recommendReorder(body.input || {}, body.userId || '');
            return sendJson(res, 200, { data });
        }

        if (method === 'GET' && url.pathname === '/internal/agent/recommendations') {
            const data = await agentService.getRecommendations();
            return sendJson(res, 200, { data });
        }

        const createPrMatch = url.pathname.match(/^\/internal\/agent\/recommendations\/([^/]+)\/create-purchase-request$/);
        if (method === 'POST' && createPrMatch) {
            const body = await readJsonBody(req);
            const data = await agentService.createPurchaseRequestFromRecommendation(createPrMatch[1], body.userId || '');
            return sendJson(res, 200, { data });
        }

        if (method === 'POST' && url.pathname === '/internal/agent/logs') {
            const body = await readJsonBody(req);
            const data = await agentService.createLog(body);
            return sendJson(res, 201, { data });
        }

        return sendJson(res, 404, { message: 'Not found' });
    } catch (error) {
        const statusCode = typeof (error as any)?.statusCode === 'number' ? (error as any).statusCode : 500;
        const message = error instanceof Error ? error.message : 'Agent service error.';
        return sendJson(res, statusCode, { message });
    }
};

const server = http.createServer((req, res) => {
    handleRequest(req, res).catch((error) => {
        const message = error instanceof Error ? error.message : 'Agent service error.';
        sendJson(res, 500, { message });
    });
});

server.listen(AGENT_PORT, AGENT_HOST, () => {
    console.log(`[agent-service] listening on http://${AGENT_HOST}:${AGENT_PORT}`);
});
