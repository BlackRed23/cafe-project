// Contract tests with mocked persistence; NOT PostgreSQL concurrency/rollback proof.
const assert = require('node:assert/strict');
const { test } = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');

function evaluate(file, dependencies) {
    const source = fs.readFileSync(path.resolve(__dirname, '../src', file), 'utf8');
    const exports = {};
    vm.runInNewContext(ts.transpileModule(source, {
        compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 }
    }).outputText, {
        exports, Date, Number, Math,
        require(name) {
            if (!(name in dependencies)) throw new Error(`Unexpected import: ${name}`);
            return dependencies[name];
        }
    });
    return exports;
}
const { HttpError } = evaluate('common/http-error.ts', {});

function fixture({ quantity = 20, reservedStock = 5, batchQuantity = 20, expirationDate = "2099-01-01", failAt } = {}) {
    let state = {
        inventory: { id: 'inv', productId: 'product', quantity, reservedStock },
        batches: [{ id: 'batch', inventoryId: 'inv', batchCode: 'OLD', quantity: batchQuantity, expirationDate: new Date(expirationDate) }],
        history: []
    };
    const calls = [];
    const prisma = {
        async $transaction(callback) {
            const draft = structuredClone(state);
            const checkpoint = name => { calls.push(name); if (failAt === name) throw new Error(`injected ${name}`); };
            const tx = {
                async $queryRaw(strings, id) {
                    checkpoint('lock');
                    assert.match(strings.join('?'), /SELECT "id" FROM "Inventory" WHERE "id" = \? FOR UPDATE/);
                    assert.equal(id, 'inv');
                    return [{ id }];
                },
                async $executeRaw(strings, delta, id, guardDelta, nonnegativeDelta) {
                    checkpoint('aggregate');
                    assert.match(strings.join('?'), /"quantity" = "quantity" \+ \?/);
                    assert.equal(id, 'inv');
                    assert.equal(delta, guardDelta);
                    assert.equal(delta, nonnegativeDelta);
                    if (failAt === 'aggregate-conflict' || draft.inventory.quantity + delta < draft.inventory.reservedStock) return 0;
                    draft.inventory.quantity += delta;
                    return 1;
                },
                inventory: {
                    async findUnique() { checkpoint('read'); return structuredClone(draft.inventory); },
                    async update({ data }) {
                        checkpoint('aggregate');
                        assert.equal(typeof data.quantity, 'object');
                        draft.inventory.quantity += data.quantity.increment;
                        return structuredClone(draft.inventory);
                    }
                },
                inventoryBatch: {
                    async findFirst({ where }) {
                        checkpoint('batch-read');
                        return draft.batches.find(b => b.inventoryId === where.inventoryId && (where.id ? b.id === where.id : b.batchCode === where.batchCode)) ?? null;
                    },
                    async create({ data }) {
                        checkpoint('batch-write');
                        const batch = { id: `batch-${draft.batches.length}`, ...data };
                        draft.batches.push(batch);
                        return batch;
                    },
                    async updateMany({ where, data }) {
                        checkpoint('batch-write');
                        const batch = draft.batches.find(b => b.id === where.id && b.inventoryId === where.inventoryId && b.quantity >= where.quantity.gte);
                        if (!batch || failAt === 'batch-conflict') return { count: 0 };
                        batch.quantity += data.quantity.increment;
                        return { count: 1 };
                    }
                },
                inventoryTransaction: {
                    async create({ data }) { checkpoint('history'); draft.history.push(data); return data; }
                }
            };
            const result = await callback(tx);
            state = draft;
            return result;
        }
    };
    const { inventoryRepository: repo } = evaluate('modules/inventory/inventory.repository.ts', {
        '@cafe-project/database': { prisma, InventoryTransactionType: { IMPORT: 'IMPORT', ADJUSTMENT: 'ADJUSTMENT' } },
        '../system-setting/system-setting.service': {},
        '../../common/http-error': { HttpError }
    });
    // Deliberately stale quantity/product: neither may be trusted at the write boundary.
    const stale = { id: 'inv', productId: 'stale-product', quantity: 9999, reservedStock: 0 };
    return { repo, stale, calls, state: () => structuredClone(state) };
}

test('import increments current stock and records batch/history inside transaction, ignoring stale input', async () => {
    const f = fixture();
    const result = await f.repo.importStock(f.stale, 4, 'note', 'admin', 'NEW', '2030-02-01');
    assert.equal(result.quantity, 24);
    assert.equal(result.reservedStock, 5);
    const s = f.state();
    assert.equal(s.batches.reduce((sum, b) => sum + b.quantity, 0), 24);
    assert.equal(s.history[0].quantity, 4);
    assert.equal(s.history[0].productId, 'product');
    assert.equal(s.history[0].batchId, s.batches[1].id);
    assert.equal(s.history[0].userId, 'admin');
    assert.equal(f.calls[0], 'lock');
});

test('successive imports using the same stale snapshot accumulate (sequential mock only)', async () => {
    const f = fixture();
    await f.repo.importStock(f.stale, 3, null, 'admin', 'A', '2030-01-01');
    await f.repo.importStock(f.stale, 7, null, 'admin', 'B', '2030-01-01');
    assert.equal(f.state().inventory.quantity, 30);
    assert.equal(f.state().history.length, 2);
});

for (const delta of [4, -4, -15]) {
    test(`adjust ${delta} changes selected batch, total and history, preserving reservation`, async () => {
        const f = fixture();
        const result = await f.repo.adjustStock(f.stale, delta, 'count', 'admin', 'batch');
        const s = f.state();
        assert.equal(result.quantity, 20 + delta);
        assert.equal(s.batches[0].quantity, 20 + delta);
        assert.equal(s.inventory.reservedStock, 5);
        assert.equal(s.history[0].quantity, delta);
        assert.equal(s.history[0].batchId, 'batch');
        assert.equal(s.history[0].productId, 'product');
        // Stock count does not silently change expiry or reclassify a batch as usable.
        assert.equal(s.batches[0].expirationDate.toISOString(), '2099-01-01T00:00:00.000Z');
        assert.equal(f.calls[0], 'lock');
    });
}

for (const [name, options, delta, batchId] of [
    ['reserved stock would be consumed', {}, -16, 'batch'],
    ['negative total', {}, -21, 'batch'],
    ['insufficient selected batch', { batchQuantity: 2 }, -3, 'batch'],
    ['unknown/foreign batch', {}, 2, 'foreign'],
    ['missing batch, including legacy caller', {}, 2, undefined]
]) {
    test(`adjust rejects ${name} without committed mock writes`, async () => {
        const f = fixture(options);
        const before = f.state();
        await assert.rejects(f.repo.adjustStock(f.stale, delta, null, 'admin', batchId), e => e instanceof HttpError);
        assert.deepEqual(f.state(), before);
    });
}

test('legacy aggregate/batch discrepancy is not backfilled or silently erased', async () => {
    const f = fixture({ quantity: 30, batchQuantity: 20 });
    await f.repo.adjustStock(f.stale, 2, null, 'admin', 'batch');
    assert.equal(f.state().inventory.quantity - f.state().batches[0].quantity, 10);
    assert.equal(f.state().batches.length, 1);
});

test('invalid import quantities, absent/invalid expiry fail before persistence', async () => {
    const f = fixture();
    for (const delta of [0, -1, 1.5, NaN, Infinity, 2147483648]) {
        await assert.rejects(f.repo.importStock(f.stale, delta, null, 'admin', 'A', '2030-01-01'), e => e.statusCode === 400);
    }
    for (const expiry of [undefined, '', 'invalid']) {
        await assert.rejects(f.repo.importStock(f.stale, 1, null, 'admin', 'A', expiry), e => e.statusCode === 400);
    }
    assert.equal(f.calls.length, 0);
});

test('invalid adjustment delta fails before persistence', async () => {
    const f = fixture();
    for (const delta of [0, 1.5, NaN, Infinity, -2147483648]) {
        await assert.rejects(f.repo.adjustStock(f.stale, delta, null, 'admin', 'batch'), e => e.statusCode === 400);
    }
    assert.equal(f.calls.length, 0);
});

test('existing batch code import is rejected without a second batch', async () => {
    const f = fixture();
    await assert.rejects(f.repo.importStock(f.stale, 1, null, 'admin', 'OLD', '2030-01-01'), e => e.statusCode === 409);
    assert.equal(f.state().inventory.quantity, 20);
    assert.equal(f.state().batches.length, 1);
    assert.equal(f.state().history.length, 0);
});

for (const operation of ['import', 'adjust']) {
    for (const failAt of ['batch-write', 'history']) {
        test(`${operation}: injected ${failAt} rejects transaction; mock discards draft`, async () => {
            const f = fixture({ failAt });
            const before = f.state();
            await assert.rejects(operation === 'import'
                ? f.repo.importStock(f.stale, 2, null, 'admin', 'NEW', '2030-01-01')
                : f.repo.adjustStock(f.stale, 2, null, 'admin', 'batch'), /injected/);
            assert.deepEqual(f.state(), before);
        });
    }
}

for (const failAt of ['aggregate-conflict', 'batch-conflict']) {
    test(`adjust ${failAt} is controlled 409 without committed mock movement`, async () => {
        const f = fixture({ failAt });
        const before = f.state();
        await assert.rejects(f.repo.adjustStock(f.stale, -2, null, 'admin', 'batch'), e => e.statusCode === 409);
        assert.deepEqual(f.state(), before);
    });
}

test('adjust validator preserves explicit batch selection and rejects empty ID', () => {
    const { adjustInventorySchema } = evaluate('modules/inventory/inventory.validator.ts', { zod: require('zod') });
    assert.equal(adjustInventorySchema.parse({ inventoryId: 'inv', batchId: 'batch', quantity: -2 }).batchId, 'batch');
    assert.equal(adjustInventorySchema.safeParse({ inventoryId: 'inv', batchId: '', quantity: -2 }).success, false);
});

function loadService(repository, effects) {
    return evaluate('modules/inventory/inventory.service.ts', {
        '@cafe-project/database': { prisma: {}, InventoryTransactionType: {} },
        '../../common/http-error': { HttpError },
        './inventory.repository': { inventoryRepository: repository },
        '../agent/agent.client': {
            createAgentLogViaAgentService: async () => { effects.push('log'); },
            scanInventoryViaAgentService: async () => { effects.push('scan'); }
        }
    });
}

test('service passes batch ID and leaves stale-snapshot rejection to repository; effects follow success', async () => {
    const effects = [];
    let args;
    const updated = {
        id: 'inv', productId: 'product', quantity: 18, reservedStock: 5, minThreshold: 10,
        product: { name: 'Coffee', sku: 'SKU', category: { name: 'Drinks' } }, batches: []
    };
    const service = loadService({
        findById: async () => ({ ...updated, quantity: 0 }),
        adjustStock: async (...input) => { args = input; return updated; }
    }, effects);
    const result = await service.adjustInventory({ inventoryId: 'inv', batchId: 'batch', quantity: -2 }, 'admin');
    assert.equal(args[4], 'batch');
    assert.equal(args[3], 'admin');
    assert.equal(result.stockAfter, 18);
    assert.deepEqual(effects, ['log', 'scan']);
});

test('service emits no Agent effects when repository transaction rejects', async () => {
    const effects = [];
    const f = fixture();
    const service = loadService({ findById: async () => f.stale, adjustStock: f.repo.adjustStock }, effects);
    await assert.rejects(service.adjustInventory({ inventoryId: 'inv', quantity: 2 }, 'admin'), e => e.statusCode === 409);
    assert.deepEqual(effects, []);
});

test('inventory HTTP routes preserve ADMIN-only writes before persistence (in-process, JWT and persistence mocked)', async () => {
    const express = require('express');
    const response = evaluate('common/response.ts', {});
    const auth = evaluate('modules/auth/auth.middleware.ts', {
        '../../common/http-error': { HttpError }, '../../common/response': response,
        './auth.service': { verifyAuthToken(token) {
            if (!['ADMIN', 'STAFF', 'CUSTOMER'].includes(token)) throw new HttpError(401, 'Invalid token');
            return { id: 'actor', role: token };
        } }
    });
    const validators = evaluate('modules/inventory/inventory.validator.ts', { zod: require('zod') });
    const f = fixture();
    const service = loadService({ findById: async () => f.stale, adjustStock: f.repo.adjustStock }, []);
    const controllers = evaluate('modules/inventory/inventory.controller.ts', {
        '../../common/response': response, './inventory.service': service
    });
    const routes = evaluate('modules/inventory/inventory.route.ts', {
        express,
        '../../common/async-handler': evaluate('common/async-handler.ts', {}),
        '../../common/validate': evaluate('common/validate.ts', { './response': response }),
        '../auth/auth.middleware': auth,
        './inventory.controller': controllers,
        './inventory.validator': validators
    });
    const app = express();
    app.use(express.json());
    app.use('/inventories', routes.inventoryRoutes);
    app.use((error, _req, res, _next) => res.status(error.statusCode || 500).json({ message: error.message }));
    const request = require('./in-process-http.cjs').request;
    for (const route of ['/inventories/import', '/inventories/adjust']) {
        for (const [role, expected] of [[undefined, 401], ['INVALID', 401], ['CUSTOMER', 403], ['STAFF', 403]]) {
            const result = await request(app, route, {
                method: 'POST', headers: { 'content-type': 'application/json', ...(role ? { authorization: `Bearer ${role}` } : {}) },
                body: JSON.stringify({ inventoryId: 'inv', quantity: 2 })
            });
            assert.equal(result.status, expected);
        }
    }
    assert.equal(f.calls.length, 0);
    const denied = await request(app, '/inventories/adjust', {
        method: 'POST', headers: { 'content-type': 'application/json', authorization: 'Bearer ADMIN' },
        body: JSON.stringify({ inventoryId: 'inv', quantity: 2 })
    });
    assert.equal(denied.status, 409);
    assert.equal(f.calls.length, 0);
});

test('adjust rejects an expired batch without committed writes', async () => {
    const f = fixture({ expirationDate: '2020-01-01' });
    const before = f.state();
    await assert.rejects(f.repo.adjustStock(f.stale, 2, null, 'admin', 'batch'), /hết hạn/);
    assert.deepEqual(f.state(), before);
});
