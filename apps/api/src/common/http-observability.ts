import { randomUUID } from 'node:crypto';
import { performance } from 'node:perf_hooks';
import type { RequestHandler } from 'express';

export const observeHttp: RequestHandler = (req, res, next) => {
    const requestId = randomUUID();
    const started = performance.now();
    res.locals.requestId = requestId;
    res.setHeader('X-Request-Id', requestId);

    res.once('finish', () => {
        const route: unknown = req.route?.path;
        const path = typeof route === 'string' ? route : undefined;
        console.log(JSON.stringify({
            event: 'http.request.completed',
            timestamp: new Date().toISOString(),
            requestId,
            method: req.method,
            route: path,
            workflowId: res.locals.workflowId,
            status: res.statusCode,
            durationMs: Math.round(performance.now() - started)
        }));
    });
    next();
};
