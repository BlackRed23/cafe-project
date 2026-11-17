// Load current TypeScript source. DB supplied explicitly; never load environment files.
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const database = require('@prisma/client');
const express = require('express');
const jwt = require('jsonwebtoken');
const http = require('node:http');
const { request } = require('./in-process-http.cjs');

function harness(db, { network = false } = {}) {
    const cache = new Map();
    const secret = 'product-acceptance-test-secret-only';
    function load(file) {
        file = path.resolve(__dirname, '../src', file);
        if (!file.endsWith('.ts')) file += '.ts';
        if (cache.has(file)) return cache.get(file).exports;
        const mod = { exports: {} };
        cache.set(file, mod);
        const source = ts.transpileModule(fs.readFileSync(file, 'utf8'), {
            compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true }
        }).outputText;
        new Function('require', 'module', 'exports', source)(name => {
            if (name === '@cafe-project/database') return { ...database, prisma: db };
            if (name.endsWith('/env') || name === './env') return { env: { nodeEnv: 'test', jwtSecret: secret } };
            if (name.endsWith('/cloudinary')) return { extractCloudinaryPublicId: () => null, deleteCloudinaryImage: async () => { throw new Error('Cloudinary forbidden'); } };
            if (name.endsWith('/agent.client')) return { scanInventoryViaAgentService: async () => ({}), createAgentLogViaAgentService: async () => ({}) };
            if (name === './auth.service' && file.endsWith('auth.middleware.ts')) return {
                verifyAuthToken: token => jwt.verify(token, secret),
                getCurrentUser: async id => {
                    const user = await db.user.findUnique({ where: { id } });
                    if (!user?.isActive) throw new (load('common/http-error.ts').HttpError)(401, 'Invalid account.');
                    return user;
                }
            };
            return name.startsWith('.') ? load(path.resolve(path.dirname(file), name)) : require(name);
        }, mod, mod.exports);
        return mod.exports;
    }
    const app = express();
    app.use(express.json());
    app.use('/products', load('modules/product/product.route.ts').default);
    app.use('/products', load('modules/recipe/recipe.route.ts').productRecipeRoutes);
    app.use('/orders', load('modules/order/order.route.ts').default);
    app.use(load('common/error-handler.ts').errorHandler);
    return {
        load, app,
        service: load('modules/product/product.service.ts'),
        orders: load('modules/order/order.service.ts'),
        async api(method, route, body, actor) {
            const options = {
                method, body: body === undefined ? undefined : JSON.stringify(body),
                headers: { 'content-type': 'application/json', ...(actor ? { authorization: `Bearer ${jwt.sign({ id: actor }, secret)}` } : {}) }
            };
            const server = network ? http.createServer(app) : undefined;
            try {
                if (server) await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
                const response = server
                    ? await fetch(`http://127.0.0.1:${server.address().port}${route}`, options)
                    : await request(app, route, options);
                return { status: response.status, body: await response.json() };
            } finally {
                if (server?.listening) {
                    server.closeAllConnections();
                    await new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
                }
            }
        }
    };
}
module.exports = { harness };
