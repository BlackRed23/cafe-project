// Isolated LN-01/02/03/07/08 HTTP -> live service -> Prisma -> existing cafedb acceptance.
// Opt-in only; no provider charges, provider emulator on localhost. Fixture rows are retained for audit.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const { randomUUID } = require('node:crypto');
assert.equal(process.env.LN_CAFEDB_CONFIRMED, 'YES', 'Opt in with LN_CAFEDB_CONFIRMED=YES');
require('dotenv').config({ path: 'apps/api/.env', quiet: true });
const dbUrl = new URL(process.env.DATABASE_URL);
assert.equal(dbUrl.pathname, '/cafedb', 'Refusing any DB other than existing cafedb');
dbUrl.hostname = '127.0.0.1'; dbUrl.port = process.env.LN_DB_PORT || '15432';
process.env.DATABASE_URL = dbUrl.toString();
process.env.NODE_ENV = 'test';
Object.assign(process.env, {
    MOMO_PARTNER_CODE: 'ln-backend-only', MOMO_ACCESS_KEY: 'ln-local-access',
    MOMO_SECRET_KEY: randomUUID(), MOMO_DEV_FALLBACK: 'false',
    PAYMENT_REFUND_POLICY_ENABLED: 'false', PAYMENT_REFUND_EXECUTION_ENABLED: 'false'
});
require('ts-node').register({ project: 'apps/api/tsconfig.json', transpileOnly: true });
const { prisma: db } = require('@cafe-project/database');
const jwt = require('jsonwebtoken');
const express = require('express');
const app = express(); app.use(express.json());
app.use('/api/ingredients', require('../src/modules/ingredient/ingredient.route').ingredientRoutes);
app.use('/api/products', require('../src/modules/product/product.route').default);
app.use('/api/products', require('../src/modules/recipe/recipe.route').productRecipeRoutes);
app.use('/api/orders', require('../src/modules/order/order.route').default);
app.use('/api/payments', require('../src/modules/payment/payment.route').default);
app.use(require('../src/common/error-handler').errorHandler);

const runId = 'ln-sales-payment-' + randomUUID();
const reportDir = 'D:/KLTN/cafe-project-artifacts/reports/cross-workflow';
const evidencePath = `${reportDir}/${runId}.json`;
const result = { runId, at: new Date().toISOString(), evidenceClass: 'AUTHENTICATED_HTTP_PRISMA_CAFEDB; LOCAL_PROVIDER_EMULATOR_ONLY',
    requests: [], cases: [], defects: [], sourceEdits: [], externalProviderVerified: false };
let server, providerServer, base, admin, staff, category;
let emulatorMode = 'dropAfterCharge', emulatedCharges = new Map(), providerCalls = [];
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const json = value => JSON.stringify(value, (key, v) => {
    if (/authorization|signature|accessKey|secretKey|token/i.test(key)) return undefined;
    if (typeof v === 'bigint') return v.toString();
    if (typeof v === 'string' && /^https?:/.test(v) && v.includes('?')) return v.split('?')[0] + '?[REDACTED]';
    return v;
}, 2);
const save = () => { fs.mkdirSync(reportDir, { recursive: true }); fs.writeFileSync(evidencePath, json(result)); };
const api = async (method, path, data, role = 'ADMIN') => {
    const startedAt = new Date().toISOString();
    const response = await fetch(base + path, { method, signal: AbortSignal.timeout(25000),
        headers: { 'content-type': 'application/json', ...(role ? { authorization: 'Bearer ' + (role === 'STAFF' ? staff : admin) } : {}) },
        body: data === undefined ? undefined : JSON.stringify(data) });
    const raw = await response.text(); let body; try { body = raw ? JSON.parse(raw) : null; } catch { body = { raw }; }
    const item = { id: `H${result.requests.length + 1}`, method, path: path.split('?')[0], role: role || 'ANONYMOUS',
        request: data, status: response.status, response: body, startedAt, endedAt: new Date().toISOString() };
    result.requests.push(item); return item;
};
const ok = (entry, expected = 200) => { assert.equal(entry.status, expected, `${entry.id} ${entry.path}: ${json(entry.response)}`); return entry.response.data; };
const reject = (entry, allowed = [400, 409]) => assert.ok(allowed.includes(entry.status), `${entry.id} unexpected ${entry.status} ${json(entry.response)}`);
const once = async (id, fn) => {
    if (process.env.LN_CASES && !process.env.LN_CASES.split(',').includes(id)) return;
    const n = result.requests.length;
    try { const assertions = await fn(); result.cases.push({ id, verdict: 'BACKEND_PASS', requestIds: result.requests.slice(n).map(r => r.id), assertions }); }
    catch (e) { result.cases.push({ id, verdict: 'FAIL', requestIds: result.requests.slice(n).map(r => r.id), error: e.stack }); process.exitCode = 1; }
    save(); console.log(`${id} ${result.cases.at(-1).verdict}`);
};
const ingredient = async (label, unit = 'g') => ok(await api('POST', '/api/ingredients', {
    sku: `${runId}-${label}`, name: `${runId}-${label}`, baseUnit: unit, costPerBaseUnit: 2,
    expiryClassification: 'NON_PERISHABLE'
}), 201);
const inbound = async (i, quantity, label, date = '2099-01-01') => ok(await api('POST', `/api/ingredients/${i.id}/import`, {
    requestId: randomUUID(), quantity, unit: i.baseUnit, unitCost: 2, batchCode: `${runId}-${label}`, expirationDate: date
}));
const product = async (label, recipe, yieldQuantity = 1) => {
    const p = ok(await api('POST', '/api/products', { sku: `${runId}-${label}`, name: `${runId}-${label}`,
        price: 10000, categoryId: category.id, isActive: false, requiresRecipe: true }), 201).product;
    const version = ok(await api('POST', `/api/products/${p.id}/recipes`, { yieldQuantity, ingredients: recipe }), 201);
    const current = ok(await api('GET', `/api/products/${p.id}`)).product;
    ok(await api('PUT', `/api/products/${p.id}`, { expectedUpdatedAt: current.updatedAt, isActive: true }));
    return { p, version };
};
const submit = (p, quantity = 1, opts = {}) => api('POST', '/api/orders', {
    requestId: randomUUID(), items: [{ productId: p.id, quantity }], paymentMethod: 'CASH', ...opts
});
const transition = (id, status, role) => api('PATCH', `/api/orders/${id}/status`, { status }, role);
const snapshot = async i => ({
    ingredient: await db.ingredient.findUniqueOrThrow({ where: { id: i.id }, select: { id: true, quantity: true, reserved: true, rowVersion: true } }),
    lots: await db.ingredientBatch.findMany({ where: { ingredientId: i.id }, orderBy: { expirationDate: 'asc' },
        select: { id: true, batchCode: true, quantityRemaining: true, expirationDate: true, qualityStatus: true } }),
    ledger: await db.inventoryTransaction.findMany({ where: { ingredientId: i.id }, orderBy: { createdAt: 'asc' },
        select: { id: true, type: true, quantity: true, batchId: true, orderItemId: true, referenceId: true } })
});
const order = id => db.order.findUniqueOrThrow({ where: { id }, include: { items: true, payments: true, operations: true } });
const num = v => Number(v);
const quantity = (s, physical, reserved) => { assert.equal(num(s.ingredient.quantity), physical); assert.equal(num(s.ingredient.reserved), reserved); };
const ledgers = (s, type) => s.ledger.filter(x => x.type === type);

// Show independently observed PostgreSQL lock waiters while two authenticated HTTP requests are in flight.
const competing = async (ingredientId, calls) => {
    let unlock, ready; const gate = new Promise(resolve => unlock = resolve), acquired = new Promise(resolve => ready = resolve);
    const holder = db.$transaction(async tx => {
        await tx.$queryRaw`SELECT id FROM "Ingredient" WHERE id=${ingredientId} FOR UPDATE`;
        ready(); await gate;
    }, { timeout: 20000 });
    await acquired; const pending = calls.map(fn => fn()); let waiters = [];
    try {
        for (let i = 0; i < 120; ++i) {
            waiters = await db.$queryRaw`SELECT pid, wait_event, wait_event_type, query FROM pg_stat_activity
                WHERE datname=current_database() AND wait_event_type='Lock' AND query LIKE '%"Ingredient"%'`;
            if (waiters.length >= calls.length) break;
            await sleep(40);
        }
    } finally { unlock(); await holder; }
    const responses = await Promise.all(pending);
    assert.ok(waiters.length >= calls.length, `Expected ${calls.length} observed lock waiters, saw ${waiters.length}`);
    return { waiters: waiters.map(w => ({ pid: w.pid, wait_event: w.wait_event, query: w.query.slice(0, 200) })),
        responses: responses.map(r => ({ id: r.id, status: r.status })) };
};

const lostOrderAck = async (i, requestBody, actorId) => {
    let unlock, ready; const gate = new Promise(resolve => unlock = resolve), acquired = new Promise(resolve => ready = resolve);
    const holder = db.$transaction(async tx => { await tx.$queryRaw`SELECT id FROM "Ingredient" WHERE id=${i.id} FOR UPDATE`;
        ready(); await gate; }, { timeout: 20000 });
    await acquired;
    const req = http.request(base + '/api/orders', { method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${admin}` } });
    req.on('error', () => {}); req.end(JSON.stringify(requestBody));
    let observedWaiters = 0;
    try {
        for (let x = 0; x < 120; x++) {
            const rows = await db.$queryRaw`SELECT count(*)::int AS count FROM pg_stat_activity WHERE datname=current_database()
                AND wait_event_type='Lock' AND query LIKE '%"Ingredient"%'`;
            observedWaiters = rows[0].count; if (observedWaiters) break; await sleep(40);
        }
        assert.ok(observedWaiters, 'Lost-ack request did not reach locked DB transaction');
        req.destroy();
        result.requests.push({ id: `H${result.requests.length + 1}`, method: 'POST', path: '/api/orders', role: 'ADMIN',
            request: requestBody, status: null, response: { transport: 'CLIENT_ACK_LOST', dbLockWaiters: observedWaiters } });
    } finally { req.destroy(); unlock(); await holder; }
    for (let x = 0; x < 60; x++) {
        const rows = await db.order.findMany({ where: { userId: actorId, id: { startsWith: 'submission_' } },
            orderBy: { createdAt: 'desc' }, take: 50, select: { id: true } });
        const expected = require('../src/modules/order/order-submission').submissionOrderId(actorId, requestBody.requestId);
        if (rows.some(r => r.id === expected)) return { id: expected, observedWaiters };
        await sleep(60);
    }
    throw Error('No durable order after disconnected submission');
};

async function main() {
    result.database = await db.$queryRaw`SELECT current_database() AS name, version() AS version`;
    const user = await db.user.findFirstOrThrow({ where: { role: 'ADMIN', isActive: true }, select: { id: true, role: true, email: true } });
    const employee = await db.user.findFirstOrThrow({ where: { role: 'STAFF', isActive: true }, select: { id: true, role: true, email: true } });
    category = await db.category.findFirstOrThrow({ select: { id: true } });
    admin = jwt.sign(user, process.env.JWT_SECRET, { expiresIn: '1h' });
    staff = jwt.sign(employee, process.env.JWT_SECRET, { expiresIn: '1h' });
    result.actors = { adminId: user.id, staffId: employee.id };
    providerServer = http.createServer(async (req, res) => {
        let raw = ''; for await (const chunk of req) raw += chunk;
        let data; try { data = JSON.parse(raw); } catch { res.statusCode = 400; return res.end('{}'); }
        if (req.url.endsWith('/create')) {
            const key = data.orderId; providerCalls.push({ type: 'CREATE_ACCEPTED', merchantRef: key });
            emulatedCharges.set(key, { amount: num(data.amount),
                providerTxnId: `${Date.now()}${Math.floor(Math.random() * 1000000).toString().padStart(6, '0')}` });
            if (emulatorMode === 'dropAfterCharge') return req.socket.destroy();
            res.setHeader('content-type', 'application/json');
            return res.end(JSON.stringify({ resultCode: 0, payUrl: 'http://127.0.0.1/test-checkout' }));
        }
        if (req.url.endsWith('/query')) {
            const found = emulatedCharges.get(data.orderId);
            providerCalls.push({ type: 'AUTHORITATIVE_LOCAL_LOOKUP', merchantRef: data.orderId, found: !!found });
            res.setHeader('content-type', 'application/json');
            return res.end(JSON.stringify({ partnerCode: data.partnerCode, orderId: data.orderId, requestId: data.requestId,
                amount: found?.amount ?? 0, transId: found?.providerTxnId ?? '0', resultCode: found ? 0 : 1000 }));
        }
        res.statusCode = 404; res.end('{}');
    });
    await new Promise(resolve => providerServer.listen(0, '127.0.0.1', resolve));
    process.env.MOMO_ENDPOINT = `http://127.0.0.1:${providerServer.address().port}/v2/gateway/api/create`;
    server = app.listen(0, '127.0.0.1'); await new Promise(resolve => server.once('listening', resolve));
    base = `http://127.0.0.1:${server.address().port}`; result.runtime = { base, pid: process.pid };

    await once('LN-01', async () => {
        const coffee = await ingredient('coffee-01'), milk = await ingredient('milk-01', 'ml');
        await inbound(coffee, 2, 'early-g', '2098-01-01'); await inbound(coffee, 10, 'late-g');
        await inbound(milk, 5, 'early-ml', '2098-01-01'); await inbound(milk, 20, 'late-ml');
        const { p, version } = await product('ln01', [
            { ingredientId: coffee.id, quantity: 0.004, unit: 'kg' },
            { ingredientId: milk.id, quantity: 0.01, unit: 'l' }
        ], 2);
        const savedRecipe = await db.recipe.findUniqueOrThrow({ where: { id: version.id }, include: { ingredients: true } });
        assert.equal(num(savedRecipe.yieldQuantity), 2);
        assert.equal(num(savedRecipe.ingredients.find(r => r.ingredientId === coffee.id).quantityBase), 4);
        assert.equal(num(savedRecipe.ingredients.find(r => r.ingredientId === milk.id).quantityBase), 10);
        const o = ok(await submit(p, 2), 201).order;
        const before = { coffee: await snapshot(coffee), milk: await snapshot(milk), order: await order(o.id) };
        quantity(before.coffee, 12, 4); quantity(before.milk, 25, 10);
        assert.equal(before.order.items[0].recipeId, version.id);
        ok(await transition(o.id, 'CONFIRMED')); ok(await transition(o.id, 'PREPARING'));
        const after = { coffee: await snapshot(coffee), milk: await snapshot(milk), order: await order(o.id) };
        quantity(after.coffee, 8, 0); quantity(after.milk, 15, 0);
        assert.deepEqual(after.coffee.lots.map(b => num(b.quantityRemaining)), [0, 8]);
        assert.deepEqual(after.milk.lots.map(b => num(b.quantityRemaining)), [0, 15]);
        assert.deepEqual(ledgers(after.coffee, 'CONSUME').map(r => num(r.quantity)), [-2, -2]);
        assert.deepEqual(ledgers(after.milk, 'CONSUME').map(r => num(r.quantity)), [-5, -5]);
        assert.equal(after.order.items[0].consumptionStatus, 'COMMITTED');
        // Impossible new order must roll back all attempted reservations and DB ledger writes.
        const orderCountBeforeShortage = await db.orderItem.count({ where: { productId: p.id } });
        reject(await submit(p, 5), [400, 409]);
        assert.equal(await db.orderItem.count({ where: { productId: p.id } }), orderCountBeforeShortage);
        assert.deepEqual(await snapshot(coffee), after.coffee); assert.deepEqual(await snapshot(milk), after.milk);
        reject(await transition(o.id, 'PREPARING'));
        assert.deepEqual(await snapshot(coffee), after.coffee); assert.deepEqual(await snapshot(milk), after.milk);
        return { before, after, replay: 'REJECTED_NO_DOUBLE_CONSUME', shortage: 'ROLLBACK_NO_ORDER_OR_STOCK_LEDGER_DELTA',
            calculation: '0.004 kg/2*2=4g;0.01 l/2*2=10ml',
            external: 'NOT_APPLICABLE' };
    });

    await once('LN-02', async () => {
        const i = await ingredient('ln02'), initial = await inbound(i, 10, 'ln02-stock');
        const { p } = await product('ln02', [{ ingredientId: i.id, quantity: 3, unit: 'g' }]);
        const requestId = randomUUID();
        const httpPayload = { requestId, items: [{ productId: p.id, quantity: 1 }], paymentMethod: 'MOMO' };
        // Destroy response after the authenticated handler is observed waiting for a real Ingredient DB lock.
        const ack = await lostOrderAck(i, httpPayload, user.id);
        const first = await order(ack.id);
        const replay = ok(await api('POST', '/api/orders', httpPayload), 201).order;
        assert.equal(replay.id, first.id);
        assert.equal(await db.orderItem.count({ where: { orderId: first.id } }), 1);
        const before = await snapshot(i); quantity(before, 10, 3);
        // Local provider commits charge but drops HTTP response; API must keep durable merchantRef+UNKNOWN.
        const failedAck = await api('POST', '/api/payments/create-url', { orderId: first.id, method: 'MOMO' });
        assert.equal(failedAck.status, 502, json(failedAck.response));
        const withAttempt = await order(first.id);
        const active = withAttempt.payments.filter(p => p.merchantRef);
        assert.equal(active.length, 1, 'Only one durable gateway identity');
        assert.equal(active[0].failureCode, 'GATEWAY_OUTCOME_UNKNOWN');
        assert.equal(active[0].status, 'PENDING');
        assert.equal(providerCalls.filter(c => c.type === 'CREATE_ACCEPTED' && c.merchantRef === active[0].merchantRef).length, 1);
        reject(await api('POST', '/api/payments/create-url', { orderId: first.id, method: 'MOMO' }), [409]);
        const fixed = ok(await api('POST', `/api/payments/${active[0].id}/reconcile`));
        assert.equal(fixed.outcome, 'PAID');
        const after = await order(first.id), afterStock = await snapshot(i);
        assert.equal(after.paymentStatus, 'PAID'); assert.equal(after.payments.filter(p => p.status === 'PAID').length, 1);
        assert.equal((await api('POST', '/api/orders', httpPayload)).status, 201);
        assert.equal(await db.order.count({ where: { id: first.id } }), 1);
        assert.equal(await db.payment.count({ where: { orderId: first.id, merchantRef: active[0].merchantRef } }), 1);
        assert.equal(await db.payment.count({ where: { orderId: first.id } }), 1, 'Adopt initial placeholder; no second payment row');
        const reconciliationAudit = await db.paymentCallback.findMany({ where: { paymentId: active[0].id, eventType: 'PROVIDER_STATUS_LOOKUP' } });
        assert.equal(reconciliationAudit.length, 1, 'One durable authoritative lookup record');
        assert.equal(await db.inventoryTransaction.count({ where: { referenceId: first.id, type: 'RESERVE' } }), 1);
        assert.equal(await db.inventoryTransaction.count({ where: { referenceId: first.id, type: 'CONSUME' } }), 0);
        assert.deepEqual(afterStock, before);
        return { initialImportId: initial.id, requestId, ack, originalOrder: first.id, paymentId: active[0].id,
            merchantRef: active[0].merchantRef, failedAckStatus: failedAck.status, reconcile: fixed,
            reconciliationAudit: reconciliationAudit.map(({ rawPayload, headers, ...safe }) => safe),
            providerCalls: providerCalls.filter(c => c.merchantRef === active[0].merchantRef), before, after, afterStock,
            external: 'BACKEND_PASS_LOCAL_EMULATOR_ONLY' };
    });

    await once('LN-03', async () => {
        const i = await ingredient('ln03'); await inbound(i, 10, 'race-stock');
        const { p } = await product('ln03', [{ ingredientId: i.id, quantity: 7, unit: 'g' }]);
        const baseline = await snapshot(i); quantity(baseline, 10, 0);
        const race = await competing(i.id, [() => submit(p), () => submit(p, 1, { requestId: randomUUID() })]);
        assert.deepEqual(race.responses.map(r => r.status).sort(), [201, 400]);
        const after = await snapshot(i); quantity(after, 10, 7);
        assert.equal(ledgers(after, 'RESERVE').length, 1);
        assert.equal(await db.orderItem.count({ where: { productId: p.id } }), 1);
        assert.equal(ledgers(after, 'CONSUME').length, 0);
        return { baseline, after, race, lockOverlap: 'POSTGRES_PG_STAT_ACTIVITY_TWO_WAITERS', external: 'NOT_APPLICABLE' };
    });

    await once('LN-07', async () => {
        const i = await ingredient('ln07'); await inbound(i, 20, 'version-stock');
        const { p, version: v1 } = await product('ln07', [{ ingredientId: i.id, quantity: 2, unit: 'g' }]);
        const older = ok(await submit(p), 201).order;
        const oldBefore = await order(older.id);
        const v2 = ok(await api('POST', `/api/products/${p.id}/recipes`, {
            yieldQuantity: 1, ingredients: [{ ingredientId: i.id, quantity: 5, unit: 'g' }]
        }), 201);
        const newer = ok(await submit(p), 201).order;
        const newBefore = await order(newer.id);
        assert.equal(oldBefore.items[0].recipeId, v1.id); assert.equal(oldBefore.items[0].recipeVersion, 1);
        assert.equal(newBefore.items[0].recipeId, v2.id); assert.equal(newBefore.items[0].recipeVersion, 2);
        const before = await snapshot(i); quantity(before, 20, 7);
        for (const o of [older, newer]) { ok(await transition(o.id, 'CONFIRMED')); ok(await transition(o.id, 'PREPARING')); }
        const after = await snapshot(i); quantity(after, 13, 0);
        const consumption = ledgers(after, 'CONSUME');
        assert.equal(consumption.length, 2);
        assert.deepEqual(consumption.map(x => -num(x.quantity)).sort((a, b) => a - b), [2, 5]);
        const oldAfter = await order(older.id), newAfter = await order(newer.id);
        assert.equal(oldAfter.items[0].recipeId, v1.id); assert.equal(newAfter.items[0].recipeId, v2.id);
        const dbV1 = await db.recipe.findUniqueOrThrow({ where: { id: v1.id }, include: { ingredients: true } });
        const dbV2 = await db.recipe.findUniqueOrThrow({ where: { id: v2.id }, include: { ingredients: true } });
        assert.equal(num(dbV1.ingredients[0].quantityBase), 2); assert.equal(num(dbV2.ingredients[0].quantityBase), 5);
        return { recipeV1: v1.id, recipeV2: v2.id, before, after, oldAfter, newAfter,
            frozen: '2g_v1_and_5g_v2_no_mixing' };
    });

    await once('LN-08', async () => {
        const i = await ingredient('ln08'); await inbound(i, 10, 'cancel-stock');
        const { p } = await product('ln08', [{ ingredientId: i.id, quantity: 3, unit: 'g' }]);
        const o = ok(await submit(p), 201).order;
        ok(await transition(o.id, 'CONFIRMED')); ok(await transition(o.id, 'PREPARING'));
        const paid = ok(await api('POST', `/api/orders/${o.id}/confirm-payment`, {}, 'STAFF'));
        const before = { stock: await snapshot(i), order: await order(o.id) };
        quantity(before.stock, 7, 0); assert.equal(before.order.paymentStatus, 'PAID');
        reject(await transition(o.id, 'CANCELLED', 'STAFF'));
        const operation = ok(await api('POST', `/api/orders/${o.id}/operations`, {
            requestId: randomUUID(), expectedVersion: before.order.version, kind: 'CANCEL', reason: `${runId} staff requested` }, 'STAFF'), 201).operation;
        assert.equal((await api('POST', `/api/orders/${o.id}/operations/${operation.id}/approve`, {
            expectedVersion: (await order(o.id)).version }, 'STAFF')).status, 403);
        const approved = ok(await api('POST', `/api/orders/${o.id}/operations/${operation.id}/approve`, {
            expectedVersion: (await order(o.id)).version }));
        assert.equal(approved.operation.status, 'APPLIED');
        const after = { stock: await snapshot(i), order: await order(o.id) };
        assert.deepEqual(after.stock, before.stock);
        assert.equal(after.order.status, 'CANCELLED');
        assert.equal(after.order.paymentStatus, 'PAID');
        assert.equal(after.order.payments.filter(p => p.status === 'PAID').length, 1);
        assert.equal(after.order.payments.find(p => p.status === 'PAID').failureCode, 'REFUND_REQUIRED');
        assert.equal(await db.paymentRefund.count({ where: { paymentId: after.order.payments.find(p => p.status === 'PAID').id } }), 0);
        assert.equal(ledgers(after.stock, 'CONSUME').length, 1);
        assert.equal(ledgers(after.stock, 'RELEASE').length, 0);
        const replay = ok(await api('POST', `/api/orders/${o.id}/operations/${operation.id}/approve`, {
            expectedVersion: (await order(o.id)).version }));
        assert.equal(replay.operation.id, operation.id);
        assert.deepEqual(await snapshot(i), after.stock);
        return { paid, operationId: operation.id, before, after, approvalReplay: 'NO_DOUBLE_EFFECT',
            refundRequired: 'FLAG_NOT_PAYOUT', externalRefund: 'NOT_EXECUTED' };
    });
}
main().catch(error => { process.exitCode = 1; result.fatal = error.stack; console.error(error); })
    .finally(async () => { result.summary = { total: result.cases.length, passed: result.cases.filter(c => c.verdict === 'BACKEND_PASS').length,
        failed: result.cases.filter(c => c.verdict === 'FAIL').length, requestCount: result.requests.length,
        providerCreateCalls: providerCalls.filter(x => x.type === 'CREATE_ACCEPTED').length,
        providerQueryCalls: providerCalls.filter(x => x.type === 'AUTHORITATIVE_LOCAL_LOOKUP').length };
        save(); if (server) await new Promise(resolve => server.close(resolve));
        if (providerServer) await new Promise(resolve => providerServer.close(resolve)); await db.$disconnect(); });
