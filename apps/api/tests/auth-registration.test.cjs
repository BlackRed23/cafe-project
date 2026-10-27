// Run from the repository root: node --test apps/api/tests/auth-registration.test.cjs
// Uses existing project dependencies only. No application bootstrap or real Prisma client.
const assert = require('node:assert/strict');
const { before, after, beforeEach, test } = require('node:test');
const Module = require('node:module');
const path = require('node:path');
const http = require('node:http');
const { createRequire } = require('node:module');

const apiRequire = createRequire(path.resolve(__dirname, '../package.json'));
const ts = apiRequire('typescript');
const express = apiRequire('express');
const bcrypt = apiRequire('bcrypt');
const jwt = apiRequire('jsonwebtoken');
const apiSrc = path.resolve(__dirname, '../src');
const originalTsLoader = Module._extensions['.ts'];
const originalLoad = Module._load;
const writes = [];
const loginUpdates = [];
let users = [];
let createError;
const testSecret = 'isolated-registration-test-secret';
class KnownRequestError extends Error {
    constructor(code) { super(code); this.code = code; }
}
const unexpectedPersistence = new Proxy({}, {
    get(_target, key) { throw new Error(`Unexpected persistence access: ${String(key)}`); }
});
const prismaMock = new Proxy({
    user: new Proxy({
        async findUnique({ where }) {
            return users.find(user => where.email ? user.email === where.email : user.id === where.id) ?? null;
        },
        async create({ data }) {
            writes.push(data);
            if (createError) throw createError;
            const user = { id: `user-${users.length + 1}`, isActive: true, ...data };
            users.push(user);
            return user;
        },
        async update({ where, data }) {
            assert.deepEqual(Object.keys(data), ['lastLoginAt']);
            const user = users.find(user => user.id === where.id);
            assert.ok(user);
            loginUpdates.push(where.id);
            return Object.assign(user, data);
        }
    }, {
        get(target, key) { return key in target ? target[key] : unexpectedPersistence[key]; }
    })
}, {
    get(target, key) { return key in target ? target[key] : unexpectedPersistence[key]; }
});

// Replace the package before importing ANY source: no generated Prisma client is loaded.
Module._load = function(request, parent, isMain) {
    if (request === '@cafe-project/database') {
        return {
            prisma: prismaMock,
            UserRole: { ADMIN: 'ADMIN', STAFF: 'STAFF', CUSTOMER: 'CUSTOMER' },
            Prisma: {
                PrismaClientKnownRequestError: KnownRequestError,
                PrismaClientInitializationError: class extends Error {},
                PrismaClientValidationError: class extends Error {}
            }
        };
    }
    if (parent?.filename.startsWith(apiSrc) && /(?:^|\/)env$/.test(request)) {
        return { env: { jwtSecret: testSecret, jwtExpiresIn: '1h', nodeEnv: 'test' } };
    }
    return originalLoad.call(this, request, parent, isMain);
};
Module._extensions['.ts'] = function(module, filename) {
    assert.ok(filename.startsWith(apiSrc + path.sep), `Unexpected TS import: ${filename}`);
    const source = require('node:fs').readFileSync(filename, 'utf8');
    const compiled = ts.transpileModule(source, {
        compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, esModuleInterop: true }
    });
    module._compile(compiled.outputText, filename);
};

let routes, registerUser, authenticate, requireRole, errorHandler;
try {
    routes = require('../src/modules/auth/auth.routes.ts').default;
    ({ registerUser } = require('../src/modules/auth/auth.service.ts'));
    ({ authenticate, requireRole } = require('../src/modules/auth/auth.middleware.ts'));
    ({ errorHandler } = require('../src/common/error-handler.ts'));
} finally {
    Module._load = originalLoad;
    if (originalTsLoader) Module._extensions['.ts'] = originalTsLoader;
    else delete Module._extensions['.ts'];
}

const app = express();
app.use(express.json());
app.use('/api/auth', routes);
// Exercise the production authentication and ADMIN-only authorization middleware.
app.get('/admin-only', authenticate, requireRole(['ADMIN']), (_req, res) => res.json({ ok: true }));
app.use(errorHandler);
let server, origin;
before(async () => {
    if (process.env.TEST_IN_PROCESS === '1') return;
    server = http.createServer(app);
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    origin = `http://127.0.0.1:${server.address().port}`;
});
after(async () => {
    if (server) await new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
});
beforeEach(() => { users = []; writes.length = 0; loginUpdates.length = 0; createError = undefined; });
const input = () => ({ email: 'customer@example.test', password: 'SecurePass1!', name: 'Customer', phone: '0901234567' });
async function request(route, body, token) {
    const options = {
        method: body === undefined ? 'GET' : 'POST',
        headers: {
            ...(body === undefined ? {} : { 'content-type': 'application/json' }),
            ...(token ? { authorization: `Bearer ${token}` } : {})
        },
        ...(body === undefined ? {} : { body: JSON.stringify(body) })
    };
    const response = process.env.TEST_IN_PROCESS === '1'
        ? await require('./in-process-http.cjs').request(app, route, options)
        : await fetch(origin + route, options);
    return { status: response.status, body: await response.json() };
}

for (const role of [undefined, 'CUSTOMER']) {
    test(`valid registration (${role ?? 'omitted role'}) stores CUSTOMER and hashes password`, async () => {
        const payload = { ...input(), ...(role ? { role } : {}) };
        const result = await request('/api/auth/register', payload);
        assert.equal(result.status, 201);
        assert.equal(writes.length, 1);
        assert.equal(writes[0].role, 'CUSTOMER');
        assert.equal(writes[0].provider, 'local');
        assert.notEqual(writes[0].password, payload.password);
        assert.equal(bcrypt.getRounds(writes[0].password), 10);
        assert.equal(await bcrypt.compare(payload.password, writes[0].password), true);
        assert.equal(result.body.user.role, 'CUSTOMER');
        assert.equal('password' in result.body.user, false);
    });
}
for (const role of ['ADMIN', 'STAFF', 'OWNER', 'customer', '', null, 1, {}, ['CUSTOMER']]) {
    test(`registration rejects role=${JSON.stringify(role)} with no user creation`, async () => {
        const result = await request('/api/auth/register', { ...input(), role });
        assert.equal(result.status, 400);
        assert.equal(writes.length, 0);
        assert.equal(users.length, 0);
    });
}
for (const role of ['ADMIN', 'STAFF', 'OWNER', undefined]) {
    test(`direct service input role=${role} cannot persist a privileged role`, async () => {
        // Deliberately bypass the TypeScript input type and HTTP validation.
        const result = await registerUser({ ...input(), role });
        assert.equal(writes.length, 1);
        assert.equal(writes[0].role, 'CUSTOMER');
        assert.equal(result.role, 'CUSTOMER');
    });
}
test('duplicate email remains 409 and creates no second user', async () => {
    await request('/api/auth/register', input());
    const result = await request('/api/auth/register', input());
    assert.equal(result.status, 409);
    assert.equal(result.body.message, 'Email đã tồn tại.');
    assert.equal(writes.length, 1);
});
test('database unique-email race remains 409', async () => {
    createError = new KnownRequestError('P2002');
    const result = await request('/api/auth/register', input());
    assert.equal(result.status, 409);
    assert.equal(users.length, 0);
});
test('new customer login issues a verified CUSTOMER JWT and is forbidden on ADMIN-only route', async () => {
    await request('/api/auth/register', input());
    const login = await request('/api/auth/login', { email: input().email, password: input().password });
    assert.equal(login.status, 200);
    const claims = jwt.verify(login.body.accessToken, testSecret);
    assert.equal(claims.role, 'CUSTOMER');
    assert.equal(claims.id, users[0].id);
    assert.equal(login.body.user.role, 'CUSTOMER');
    assert.equal('password' in login.body.user, false);
    assert.equal(loginUpdates.length, 1);
    assert.equal((await request('/admin-only', undefined, login.body.accessToken)).status, 403);
});
test('wrong password and unknown email remain 401 without updating last login', async () => {
    await request('/api/auth/register', input());
    assert.equal((await request('/api/auth/login', { email: input().email, password: 'wrong' })).status, 401);
    assert.equal((await request('/api/auth/login', { email: 'unknown@example.test', password: input().password })).status, 401);
    assert.equal(loginUpdates.length, 0);
});
test('existing ADMIN can still log in and access ADMIN-only route; unauthenticated access is 401', async () => {
    users.push({ id: 'existing-admin', email: 'admin@example.test', name: 'Admin', role: 'ADMIN',
        isActive: true, password: await bcrypt.hash(input().password, 10) });
    const login = await request('/api/auth/login', { email: users[0].email, password: input().password });
    assert.equal(login.status, 200);
    assert.equal(jwt.verify(login.body.accessToken, testSecret).role, 'ADMIN');
    assert.equal((await request('/admin-only', undefined, login.body.accessToken)).status, 200);
    assert.equal((await request('/admin-only')).status, 401);
    assert.equal((await request('/admin-only', undefined, 'invalid-token')).status, 401);
});
