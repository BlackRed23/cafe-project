// Run from the repository root: node --test apps/api/tests/test-db-security.test.cjs
const assert = require('node:assert/strict');
const { test } = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const http = require('node:http');
const { createRequire } = require('node:module');
const apiRequire = createRequire(path.resolve(__dirname, '../package.json'));
const ts = apiRequire('typescript');
const express = apiRequire('express');

function evaluate(file, requireMock) {
    const source = fs.readFileSync(path.resolve(__dirname, '../src', file), 'utf8');
    const compiled = ts.transpileModule(source, {
        compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, esModuleInterop: true }
    });
    const exports = {};
    vm.runInNewContext(compiled.outputText, {
        exports, require: requireMock, process: { env: {} },
        console: { log() {}, error() {} }
    });
    return exports;
}

test('bootstrap preserves health and route mounting; unauthenticated /test-db is 404 without database access', async () => {
    let databaseCalls = 0;
    let scheduled = 0;
    let startupCallback;
    let errorListener;
    const app = express();
    const prisma = new Proxy({}, {
        get() {
            return new Proxy({}, {
                get() {
                    return () => { databaseCalls++; throw new Error('Database access forbidden in this test'); };
                }
            });
        }
    });
    app.listen = (port, callback) => {
        assert.equal(port, 43210);
        startupCallback = callback;
        return { on(event, listener) { assert.equal(event, 'error'); errorListener = listener; } };
    };
    const routes = new Map();
    const response = evaluate('common/response.ts', name => { throw new Error(`Unexpected import: ${name}`); });
    evaluate('index.ts', name => {
        if (name === 'express') return Object.assign(() => app, { json: express.json });
        if (name === 'cors') return apiRequire('cors');
        if (name === '@cafe-project/database') return { prisma };
        if (name === './common/env') return { env: { port: 43210 } };
        if (name === './common/response') return response;
        if (name === './common/error-handler') return {
            errorHandler: (error, _req, res, _next) => res.status(500).json({ message: error.message })
        };
        if (name === './modules/cron/cron.service') return { scheduleJobs() { scheduled++; } };
        if (/\.routes?$/.test(name)) {
            const router = express.Router();
            routes.set(name, router);
            return {
                __esModule: true, default: router,
                inventoryRoutes: router, inventoryTransactionRoutes: router,
                productSupplierRoutes: router, supplierProductRoutes: router, supplierRoutes: router
            };
        }
        throw new Error(`Unexpected import: ${name}`);
    });
    assert.equal(typeof startupCallback, 'function');
    assert.equal(typeof errorListener, 'function');
    startupCallback();
    assert.equal(scheduled, 1);
    assert.equal(routes.size, 14);
    // Each imported API router remains mounted (supplier/inventory routers mount more than once).
    for (const router of routes.values()) {
        assert.ok(app._router.stack.some(layer => layer.handle === router));
    }
    assert.equal(app._router.stack.filter(layer => layer.handle?.stack).length, 17);
    const inProcess = process.env.TEST_IN_PROCESS === '1';
    const server = inProcess ? undefined : http.createServer(app);
    if (server) await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    try {
        const request = route => inProcess
            ? require('./in-process-http.cjs').request(app, route)
            : fetch(`http://127.0.0.1:${server.address().port}${route}`);
        const blocked = await request('/test-db');
        assert.equal(blocked.status, 404);
        assert.match(await blocked.text(), /Cannot GET \/test-db/);
        assert.equal(databaseCalls, 0);
        const health = await request('/health');
        assert.equal(health.status, 200);
        assert.deepEqual(await health.json(), {
            success: true, message: 'Cafe API server is running.', data: { status: 'OK' }
        });
        assert.equal(databaseCalls, 0);
    } finally {
        if (server) {
            server.closeAllConnections();
            await new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
        }
    }
});
