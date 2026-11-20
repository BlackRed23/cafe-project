// Phase IV LIVE STOCKTAKE. Only current HTTP routes, real Prisma/cafedb read assertions.
// Test-only owned child. IV08 fault injector is delegated to worker2's separate runner.
// Run: LN_CAFEDB_CONFIRMED=YES LN_DB_PORT=15432 node apps/api/tests/live-stocktake-iv.cafedb.cjs
'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const net = require('node:net');
const { spawn } = require('node:child_process');
const { randomUUID } = require('node:crypto');
require('dotenv').config({ path: 'apps/api/.env', quiet: true });
const databaseUrl = new URL(process.env.DATABASE_URL);
assert.equal(databaseUrl.pathname, '/cafedb', 'Refusing DB other than existing cafedb');
databaseUrl.hostname = '127.0.0.1'; databaseUrl.port = process.env.LN_DB_PORT || '15432';
const sleep = ms => new Promise(r => setTimeout(r, ms));
const sanitize = (key, value) => {
    if (/secret|authorization|password|signature|token|credential/i.test(key)) return undefined;
    if (typeof value === 'bigint') return value.toString();
    return value;
};
const stringify = value => JSON.stringify(value, sanitize, 2);

if (process.argv.includes('--owned-server')) {
    assert.equal(process.env.LN_CAFEDB_CONFIRMED, 'YES');
    process.env.DATABASE_URL = databaseUrl.toString();
    process.env.NODE_ENV = 'test';
    require('ts-node').register({ project: 'apps/api/tsconfig.json', transpileOnly: true });
    const express = require('express'); const app = express();
    app.use(express.json()); app.set('json replacer', sanitize);
    for (const [path, file, member] of [
        ['/api/ingredients', '../src/modules/ingredient/ingredient.route', 'ingredientRoutes'],
        ['/api/stocktakes', '../src/modules/inventory/stocktake.route', 'stocktakeRoutes'],
        ['/api/suppliers', '../src/modules/supplier/supplier.route', 'supplierRoutes'],
        ['/api/supplier-products', '../src/modules/supplier/supplier.route', 'supplierProductRoutes'],
        ['/api/purchase-requests', '../src/modules/purchase/purchase.route', 'default'],
        ['/api/purchase-orders', '../src/modules/purchase/purchase.route', 'purchaseOrderRoutes'],
        ['/api/products', '../src/modules/product/product.route', 'default'],
        ['/api/products', '../src/modules/recipe/recipe.route', 'productRecipeRoutes'],
        ['/api/orders', '../src/modules/order/order.route', 'default']
    ]) app.use(path, require(file)[member]);
    app.use(require('../src/common/error-handler').errorHandler);
    const server = app.listen(Number(process.env.IV_OWNED_API_PORT), '127.0.0.1',
        () => process.send?.({ kind: 'IV_READY', port: server.address().port, pid: process.pid,
            faultHookInstalled: true }));
    process.on('SIGTERM', () => server.close(() => process.exit()));
} else {
    main().catch(e => { console.error(e.stack || e); process.exitCode = 1; });
}

async function main() {
    assert.equal(process.env.LN_CAFEDB_CONFIRMED, 'YES', 'Explicit opt-in required');
    const jwt = require('jsonwebtoken');
    const { PrismaClient } = require('@prisma/client');
    const db = new PrismaClient({ datasources: { db: { url: databaseUrl.toString() } } });
    const runId = 'iv-' + randomUUID();
    const directory = 'D:/KLTN/cafe-project-artifacts/reports/live-stocktake';
    fs.mkdirSync(directory, { recursive: true });
    const file = directory + '/live-stocktake-' + runId + '.json';
    const out = { runId, startedAt: new Date().toISOString(), database: 'existing cafedb',
        proxyPort: Number(databaseUrl.port), mode: 'ACTUAL_JWT_HTTP_TO_SERVICE_PRISMA_POSTGRESQL',
        selected: (process.env.IV_CASES || 'IV01,IV02,IV03,IV04,IV05,IV06,IV07,IV08,IV09,IV10').split(','),
        requests: [], cases: [], childProcesses: [], faultEvents: [], notes: [
            'Fixtures have unique runId; test HTTP writes only; DB reads and held row locks are observational.',
            'Actual physical count is a deliberate fixture observation, not sensor/onsite verification.',
            'No real provider, refunds, suppliers, migrations or destructive DB SQL.'
        ] };
    const save = () => fs.writeFileSync(file, stringify(out));
    let child, port, admin, staff, adminActor, staffActor, category, sequence = 0;
    const n = Number;
    const freePort = () => new Promise((resolve, reject) => {
        const server = net.createServer(); server.once('error', reject);
        server.listen(0, '127.0.0.1', () => { const p = server.address().port; server.close(() => resolve(p)); });
    });
    async function start() {
        port = await freePort();
        child = spawn(process.execPath, [__filename, '--owned-server'], {
            cwd: process.cwd(), windowsHide: true,
            env: { ...process.env, LN_CAFEDB_CONFIRMED: 'YES', IV_OWNED_API_PORT: String(port) },
            stdio: ['ignore', 'pipe', 'pipe', 'ipc']
        });
        const pid = child.pid; let stderr = '';
        child.stderr.on('data', data => { stderr = (stderr + data.toString()).slice(-2000); });
        child.stdout.on('data', () => {});
        await Promise.race([new Promise((resolve, reject) => {
            child.on('message', evt => { if (evt.kind === 'IV_READY') resolve(); });
            child.once('exit', code => reject(new Error(`Owned child exited ${code}: ${stderr}`)));
        }), sleep(20000).then(() => { throw new Error(`Owned child startup timeout: ${stderr}`); })]);
        out.childProcesses.push({ event: 'START', pid, port, at: new Date().toISOString() });
    }
    async function stop() {
        if (!child) return;
        const c = child; child = null;
        if (c.exitCode !== null || c.signalCode !== null) return;
        const exited = new Promise(resolve => c.once('exit', (code, signal) => resolve({ code, signal })));
        c.kill('SIGTERM');
        const ended = await Promise.race([exited, sleep(5000).then(() => { c.kill('SIGKILL'); return exited; })]);
        out.childProcesses.push({ event: 'STOP', pid: c.pid, ...ended, at: new Date().toISOString() });
    }
    async function http(method, path, body, role = 'ADMIN') {
        const id = 'IV-H' + (++sequence), startedAt = new Date().toISOString();
        const token = role === 'STAFF' ? staff : role === 'ADMIN' ? admin : null;
        try {
            const r = await fetch(`http://127.0.0.1:${port}/api${path}`, { method,
                headers: { 'content-type': 'application/json', ...(token ? { authorization: 'Bearer ' + token } : {}) },
                body: body === undefined ? undefined : JSON.stringify(body), signal: AbortSignal.timeout(30000) });
            const raw = await r.text(); let parsed;
            try { parsed = JSON.parse(raw); } catch { parsed = { raw }; }
            const e = { id, method, path, role, request: body, status: r.status, response: parsed,
                startedAt, endedAt: new Date().toISOString() };
            out.requests.push(e);
            return { id, status: r.status, data: parsed?.data, raw: parsed };
        } catch (error) {
            out.requests.push({ id, method, path, role, request: body, status: 'TRANSPORT_ERROR',
                error: error.message, startedAt, endedAt: new Date().toISOString() });
            throw error;
        }
    }
    const ok = (r, status = 200) => { assert.equal(r.status, status, `${r.id}: ${stringify(r.raw).slice(0, 700)}`); return r.data; };
    const rejected = (r, status = 409) => assert.equal(r.status, status, `${r.id}: ${stringify(r.raw).slice(0, 700)}`);
    const attempt = async (id, expected, fn) => {
        if (!out.selected.includes(id)) return;
        const startAt = out.requests.length;
        try { const evidence = await fn(); out.cases.push({ id, expected, verdict: 'BACKEND_PASS', evidence,
            requestIds: out.requests.slice(startAt).map(x => x.id) }); }
        catch (error) { out.cases.push({ id, expected, verdict: 'FAIL', error: error.stack || error.message,
            requestIds: out.requests.slice(startAt).map(x => x.id) }); process.exitCode = 1; }
        save(); const c = out.cases.at(-1); console.log(`${id} ${c.verdict}${c.error ? ': ' + c.error.slice(0, 170) : ''}`);
    };
    const ingredient = async (tag, baseUnit = 'ml') => ok(await http('POST', '/ingredients', {
        sku: `${runId}-${tag}`, name: `${runId}-${tag}`, baseUnit,
        costPerBaseUnit: 2, expiryClassification: 'NON_PERISHABLE'
    }), 201);
    const importLot = (i, qty, tag, expiry = '2099-01-01') => http('POST', `/ingredients/${i.id}/import`, {
        requestId: randomUUID(), quantity: qty, unit: i.baseUnit, unitCost: 2,
        batchCode: `${runId}-${tag}`, expirationDate: expiry
    }).then(ok);
    const product = async (i, tag, amount = 200) => {
        const p = ok(await http('POST', '/products', {
            sku: `${runId}-${tag}`, name: `${runId}-${tag}`, price: 10000,
            categoryId: category.id, isActive: false, requiresRecipe: true
        }), 201).product;
        ok(await http('POST', `/products/${p.id}/recipes`, { yieldQuantity: 1,
            ingredients: [{ ingredientId: i.id, quantity: amount, unit: i.baseUnit }] }), 201);
        const current = ok(await http('GET', `/products/${p.id}`)).product;
        ok(await http('PUT', `/products/${p.id}`, { isActive: true, expectedUpdatedAt: current.updatedAt }));
        return p;
    };
    const confirmedPurchaseOrder = async (i, qty, tag) => {
        const supplier = ok(await http('POST', '/suppliers', {
            name: runId + '-' + tag, email: `${runId.slice(0, 12)}-${tag}@example.invalid`
        }), 201).supplier;
        ok(await http('POST', '/supplier-products', {
            // SupplierProduct input enum omits 'ml'; let ingredient mapping default
            // its actual base unit to ml in the existing service. No fake kg/gram conversion.
            supplierId: supplier.id, productId: i.id, price: 2,
            minOrderQuantity: 1, leadTimeDays: 1
        }), 201);
        const request = ok(await http('POST', '/purchase-requests', {
            supplierId: supplier.id, notes: runId,
            items: [{ ingredientId: i.id, quantity: qty, unitPrice: 2 }]
        }), 201).purchaseRequest;
        ok(await http('PATCH', `/purchase-requests/${request.id}/approve`));
        const po = ok(await http('POST', '/purchase-orders', {
            requestId: randomUUID(), purchaseRequestId: request.id, currency: 'VND'
        }), 201).order;
        ok(await http('POST', `/purchase-orders/${po.id}/confirm`, {
            requestId: randomUUID(), reason: runId + ' test receiving workflow',
            evidenceReference: runId + '-' + tag
        }));
        return po;
    };
    const goodsReceipt = (po, qty, tag) => http('POST', `/purchase-orders/${po.id}/receipts`, {
        requestId: randomUUID(), supplierInvoiceNo: `${runId}-${tag}`, note: `${runId} local receipt`,
        items: [{ purchaseOrderItemId: po.items[0].id, receivedQuantity: qty,
            batches: [{ batchCode: `${runId}-received-${tag}`, quantity: qty,
                expirationDate: '2099-01-01T00:00:00.000Z' }] }]
    }, 'STAFF').then(r => ok(r, 201));
    const order = async p => {
        const o = ok(await http('POST', '/orders', { requestId: randomUUID(), paymentMethod: 'CASH',
            items: [{ productId: p.id, quantity: 1 }] }), 201).order;
        ok(await http('PATCH', `/orders/${o.id}/status`, { status: 'CONFIRMED' }));
        return o;
    };
    const preparing = o => http('PATCH', `/orders/${o.id}/status`, { status: 'PREPARING' });
    const open = async i => ok(await http('POST', '/stocktakes', {
        requestId: randomUUID(), ingredientIds: [i.id], assignedCounterId: staffActor.id, note: runId
    }, 'STAFF'), 201);
    const view = s => http('GET', `/stocktakes/${s.session.id}`, undefined, 'STAFF').then(ok);
    const countBody = (s, i, batchId, qty, category = 'COUNTED', suffix = 'count') => ({
        requestId: randomUUID(), batchId, actualQty: qty,
        expectedCursor: s.current.find(row => row.ingredientId === i.id).cursor,
        expectedRevision: s.entries.find(e => e.batchId === batchId)?.revision ?? 0,
        reason: `${runId} ${suffix}`, reasonCategory: category
    });
    const count = async (s, i, batchId, qty, category = 'COUNTED') =>
        http('POST', `/stocktakes/${s.session.id}/entries`, countBody(await view(s), i, batchId, qty, category), 'STAFF').then(ok);
    const submit = s => http('POST', `/stocktakes/${s.session.id}/submit`, { requestId: randomUUID() }, 'STAFF');
    const approve = s => http('POST', `/stocktakes/${s.session.id}/approve`, { requestId: randomUUID() });
    const state = async (i, sessionId) => ({
        ingredient: await db.ingredient.findUniqueOrThrow({ where: { id: i.id },
            select: { id: true, quantity: true, reserved: true, movementCursor: true, rowVersion: true } }),
        batches: await db.ingredientBatch.findMany({ where: { ingredientId: i.id }, orderBy: { id: 'asc' },
            select: { id: true, quantityRemaining: true, expirationDate: true, qualityStatus: true, batchCode: true } }),
        ledger: await db.inventoryTransaction.findMany({ where: { ingredientId: i.id }, orderBy: { movementSeq: 'asc' },
            select: { id: true, movementSeq: true, type: true, quantity: true, batchId: true,
                orderItemId: true, referenceId: true, referenceType: true, performedBy: true } }),
        ...(sessionId ? {
            session: await db.stockCount.findUniqueOrThrow({ where: { id: sessionId } }),
            entries: await db.stocktakeEntry.findMany({ where: { stockCountId: sessionId },
                include: { history: true }, orderBy: { id: 'asc' } }),
            actions: await db.stocktakeRequest.findMany({ where: { stockCountId: sessionId }, orderBy: { requestId: 'asc' } })
        } : {})
    });
    const stable = s => stringify(s);
    const qty = (s, physical, reserved) => { assert.equal(n(s.ingredient.quantity), physical);
        if (reserved !== undefined) assert.equal(n(s.ingredient.reserved), reserved);
        assert.equal(s.batches.reduce((sum, b) => sum + n(b.quantityRemaining), 0), physical); };
    const txType = (s, type) => s.ledger.filter(t => t.type === type);
    const adjust = (s, stockId) => s.ledger.filter(t => t.type === 'ADJUSTMENT' && t.referenceId === stockId);

    async function overlap(i, tasks, expected = 2) {
        let unlock, ready;
        const gate = new Promise(resolve => unlock = resolve), locked = new Promise(resolve => ready = resolve);
        const holder = db.$transaction(async tx => {
            await tx.$queryRaw`SELECT id FROM "Ingredient" WHERE id=${i.id} FOR UPDATE`; ready(); await gate;
        }, { timeout: 20000 });
        await locked; const pending = tasks.map(fn => fn()); let waiters = [];
        try {
            for (let attempt = 0; attempt < 110; attempt++) {
                waiters = await db.$queryRaw`SELECT pid, wait_event_type, wait_event, query FROM pg_stat_activity
                    WHERE datname=current_database() AND wait_event_type='Lock' AND query LIKE '%"Ingredient"%'`;
                if (waiters.length >= expected) break;
                await sleep(40);
            }
        } finally { unlock(); await holder; }
        const responses = await Promise.all(pending);
        assert.ok(waiters.length >= expected, `Expected ${expected} DB lock waiters, got ${waiters.length}`);
        return { waiters: waiters.map(x => ({ pid: x.pid, event: x.wait_event, sql: x.query.slice(0, 160) })),
            responses: responses.map(x => ({ id: x.id, status: x.status })) };
    }

    try {
        const dbinfo = await db.$queryRaw`SELECT current_database() AS name, version() AS version,
            (SELECT count(*)::int FROM pg_trigger WHERE tgname='InventoryTransaction_stocktake_cursor') AS cursor_triggers`;
        assert.equal(dbinfo[0].name, 'cafedb');
        assert.equal(dbinfo[0].cursor_triggers, 1);
        out.dbinfo = dbinfo;
        adminActor = await db.user.findFirstOrThrow({ where: { role: 'ADMIN', isActive: true },
            select: { id: true, role: true, email: true } });
        staffActor = await db.user.findFirstOrThrow({ where: { role: 'STAFF', isActive: true },
            select: { id: true, role: true, email: true } });
        category = await db.category.findFirstOrThrow({ select: { id: true } });
        admin = jwt.sign(adminActor, process.env.JWT_SECRET, { expiresIn: '1h' });
        staff = jwt.sign(staffActor, process.env.JWT_SECRET, { expiresIn: '1h' });
        out.actors = { admin: adminActor.id, staff: staffActor.id };
        await start();

        await attempt('IV01', 'Opening 10000ml, count9700 then PREPARING200; approval yields 9500ml', async () => {
            const i = await ingredient('iv01'), lot = await importLot(i, 10000, 'iv01-opening');
            const p = await product(i, 'iv01-cup'), s = await open(i), e = s.entries[0];
            assert.equal(e.openingQty, '10000'); assert.equal(e.batchId, lot.batch.id);
            const measured = await count(s, i, e.batchId, 9700);
            assert.equal(measured.entries[0].varianceQty, '-300');
            const o = await order(p); qty(await state(i), 10000, 200);
            ok(await preparing(o)); qty(await state(i), 9800, 0);
            const pending = ok(await submit(s)); assert.equal(pending.session.status, 'PENDING_APPROVAL');
            const before = await state(i, s.session.id); qty(before, 9800, 0);
            assert.equal(adjust(before, s.session.id).length, 0);
            const done = ok(await approve(s)); assert.equal(done.session.status, 'COMPLETED');
            const after = await state(i, s.session.id); qty(after, 9500, 0);
            assert.deepEqual(adjust(after, s.session.id).map(x => n(x.quantity)), [-300]);
            assert.equal(txType(after, 'CONSUME').reduce((a, b) => a + n(b.quantity), 0), -200);
            assert.equal(after.session.approvedById, adminActor.id);
            return { sessionId: s.session.id, orderId: o.id, lot: lot.batch.id,
                before, after, logical: '10000 + (COUNT 9700-10000=-300) + (POST_COUNT_SALE -200) = 9500' };
        });

        await attempt('IV02', 'PRE-count sale200 changes expected to9800; count9500 gives -300', async () => {
            const i = await ingredient('iv02'), lot = await importLot(i, 10000, 'iv02-opening');
            const p = await product(i, 'iv02-cup'), s = await open(i);
            const o = await order(p); ok(await preparing(o)); qty(await state(i), 9800, 0);
            const measured = await count(s, i, lot.batch.id, 9500);
            assert.equal(measured.entries[0].expectedAtCount, '9800');
            assert.equal(measured.entries[0].varianceQty, '-300');
            assert.ok(BigInt(measured.entries[0].observedCursor) > BigInt(s.entries[0].openingCursor));
            ok(await submit(s)); ok(await approve(s));
            const after = await state(i, s.session.id); qty(after, 9500, 0);
            assert.deepEqual(adjust(after, s.session.id).map(x => n(x.quantity)), [-300]);
            return { sessionId: s.session.id, orderId: o.id, beforeCount: 9800, observed: 9500,
                expectedAtCount: measured.entries[0].expectedAtCount, after };
        });

        await attempt('IV03', 'Receipt500 after opening adds lot; aggregate expected10500, count10200 => -300', async () => {
            const i = await ingredient('iv03'), a = await importLot(i, 10000, 'iv03-initial');
            const po = await confirmedPurchaseOrder(i, 500, 'iv03-po');
            const s = await open(i);
            const receipt = await goodsReceipt(po, 500, 'iv03-500ml');
            const rec = await view(s);
            assert.equal(rec.untrackedBatches.length, 1);
            const newLotId = rec.untrackedBatches[0].batchId;
            await count(s, i, a.batch.id, 9700);
            const second = await count(s, i, newLotId, 500);
            const entries = second.entries; assert.equal(entries.length, 2);
            assert.equal(entries.reduce((z, e) => z + n(e.expectedAtCount), 0), 10500);
            assert.equal(entries.reduce((z, e) => z + n(e.observedQty), 0), 10200);
            assert.equal(entries.reduce((z, e) => z + n(e.varianceQty), 0), -300);
            assert.equal(entries.find(e => e.batchId === newLotId).presentAtOpen, false);
            ok(await submit(s)); ok(await approve(s));
            const after = await state(i, s.session.id); qty(after, 10200, 0);
            assert.deepEqual(adjust(after, s.session.id).map(x => n(x.quantity)), [-300]);
            return { sessionId: s.session.id, purchaseOrderId: po.id, goodsReceipt: receipt,
                originalLotId: a.batch.id, newLotId, expectedAggregate: 10500, observedAggregate: 10200, after };
        });

        await attempt('IV04', 'Uncertain physical-count cutoff: sale/receipt races require recount/investigation', async () => {
            const i = await ingredient('iv04-sale'), lot = await importLot(i, 10000, 'iv04-initial');
            const p = await product(i, 'iv04-cup'), s = await open(i), o = await order(p);
            const old = await view(s), entry = countBody(old, i, lot.batch.id, 9700, 'UNEXPLAINED', 'physical overlap uncertain');
            const sale = await overlap(i, [() => preparing(o),
                () => http('POST', `/stocktakes/${s.session.id}/entries`, entry, 'STAFF')]);
            assert.equal(sale.responses[0].status, 200);
            assert.ok([200, 409].includes(sale.responses[1].status));
            if (sale.responses[1].status === 409) await count(s, i, lot.batch.id, 9500, 'UNEXPLAINED');
            const review = ok(await submit(s)); assert.equal(review.session.status, 'NEEDS_INVESTIGATION');
            rejected(await approve(s)); qty(await state(i), 9800, 0);
            const j = await ingredient('iv04-receipt'), initial = await importLot(j, 10000, 'iv04-receipt-initial');
            const receiptSession = await open(j), stale = await view(receiptSession);
            const addBody = { requestId: randomUUID(), quantity: 500, unit: 'ml', unitCost: 2,
                batchCode: `${runId}-iv04-race-new`, expirationDate: '2099-01-01' };
            const receiptRace = await overlap(j, [() => http('POST', `/ingredients/${j.id}/import`, addBody),
                () => http('POST', `/stocktakes/${receiptSession.session.id}/entries`,
                    countBody(stale, j, initial.batch.id, 9700, 'UNEXPLAINED'), 'STAFF')]);
            assert.equal(receiptRace.responses[0].status, 200);
            assert.ok([200, 409].includes(receiptRace.responses[1].status));
            if (receiptRace.responses[1].status === 409) await count(receiptSession, j, initial.batch.id, 9700, 'UNEXPLAINED');
            rejected(await submit(receiptSession));
            qty(await state(j), 10500, 0);
            return { saleSessionId: s.session.id, receiptSessionId: receiptSession.session.id,
                saleOverlap: sale, receiptOverlap: receiptRace, status: review.session.status,
                resolution: 'NO_ADJUSTMENT_AND_NEEDS_INVESTIGATION; physical cutoff cannot be inferred by concurrent HTTP' };
        });

        await attempt('IV05', 'Counted loss -300, later sale -200: approval preserves both and final9500', async () => {
            const i = await ingredient('iv05'), lot = await importLot(i, 10000, 'iv05-opening');
            const p = await product(i, 'iv05-cup'), s = await open(i);
            const counted = await count(s, i, lot.batch.id, 9700);
            assert.equal(counted.entries[0].varianceQty, '-300');
            const pending = ok(await submit(s)); assert.equal(pending.session.status, 'PENDING_APPROVAL');
            const o = await order(p); ok(await preparing(o));
            const before = await state(i, s.session.id); qty(before, 9800, 0);
            ok(await approve(s)); const after = await state(i, s.session.id); qty(after, 9500, 0);
            assert.deepEqual(adjust(after, s.session.id).map(x => n(x.quantity)), [-300]);
            assert.equal(txType(after, 'CONSUME').length, 1);
            return { sessionId: s.session.id, orderId: o.id, before, after,
                rule: '10000 - 200 post-count sale - 300 measured variance = 9500, no double deduction' };
        });

        await attempt('IV06', 'ADMIN approve overlaps authenticated Order PREPARING under same ingredient lock', async () => {
            const i = await ingredient('iv06'), lot = await importLot(i, 10000, 'iv06-opening');
            const p = await product(i, 'iv06-cup'), s = await open(i);
            await count(s, i, lot.batch.id, 9700); ok(await submit(s));
            const o = await order(p); qty(await state(i), 10000, 200);
            const race = await overlap(i, [() => approve(s), () => preparing(o)]);
            assert.deepEqual(race.responses.map(x => x.status), [200, 200]);
            const after = await state(i, s.session.id); qty(after, 9500, 0);
            assert.equal(after.session.status, 'COMPLETED');
            assert.deepEqual(adjust(after, s.session.id).map(x => n(x.quantity)), [-300]);
            assert.equal(txType(after, 'CONSUME').length, 1);
            return { sessionId: s.session.id, orderId: o.id, lockEvidence: race,
                after, calculation: '10000 - 300 approval - 200 sale = 9500' };
        });

        await attempt('IV07', 'Idempotent count/submit/approve request; changed payload and actor denied', async () => {
            const i = await ingredient('iv07'), lot = await importLot(i, 1000, 'iv07-opening'), s = await open(i);
            const path = `/stocktakes/${s.session.id}/entries`, body = countBody(await view(s), i, lot.batch.id, 970);
            const first = ok(await http('POST', path, body, 'STAFF'));
            assert.equal(first.replayed, false);
            assert.equal(ok(await http('POST', path, body, 'STAFF')).replayed, true);
            rejected(await http('POST', path, { ...body, actualQty: 960 }, 'STAFF'));
            rejected(await http('POST', path, body, 'ADMIN'), 403);
            const submitBody = { requestId: randomUUID() }, submitPath = `/stocktakes/${s.session.id}/submit`;
            const firstSubmit = ok(await http('POST', submitPath, submitBody, 'STAFF'));
            assert.equal(firstSubmit.session.status, 'PENDING_APPROVAL');
            assert.equal(ok(await http('POST', submitPath, submitBody, 'STAFF')).replayed, true);
            const approveBody = { requestId: randomUUID() }, approvePath = `/stocktakes/${s.session.id}/approve`;
            const firstApproval = ok(await http('POST', approvePath, approveBody));
            assert.equal(firstApproval.replayed, false);
            assert.equal(ok(await http('POST', approvePath, approveBody)).replayed, true);
            rejected(await http('POST', approvePath, { requestId: randomUUID() }));
            const after = await state(i, s.session.id); qty(after, 970, 0);
            assert.equal(after.entries[0].history.length, 1); assert.equal(adjust(after, s.session.id).length, 1);
            assert.equal(after.actions.filter(x => x.action === 'APPROVE').length, 1);
            return { sessionId: s.session.id, requestIds: { count: body.requestId, submit: submitBody.requestId,
                approve: approveBody.requestId }, firstCount: first.entries[0], after,
                actorDenied: 403, modifiedPayload: 409, duplicateEffect: 0 };
        });

        if (out.selected.includes('IV08')) {
            out.cases.push({ id: 'IV08', verdict: 'DELEGATED_NOT_EXECUTED', requestIds: [],
                expected: 'Own-child post-intermediate-write/precommit rollback, real SQL and retry',
                handoff: 'Worker2 owns apps/api/tests/live-stocktake-iv-fault.cafedb.cjs and IV08 evidence. Not passed here.' });
            save();
        }

        await attempt('IV09', 'Reservation / quarantined / expired / short eligible lot fails safely', async () => {
            const i = await ingredient('iv09-reserve'), lot = await importLot(i, 1000, 'iv09-opening');
            const p = await product(i, 'iv09-cup', 900), s = await open(i);
            await count(s, i, lot.batch.id, 100); ok(await submit(s));
            const o = await order(p); qty(await state(i), 1000, 900);
            const before = await state(i, s.session.id);
            rejected(await approve(s)); assert.equal(stable(await state(i, s.session.id)), stable(before));
            // Quarantine and expiry are quality holds: cannot spend physical quantity.
            const j = await ingredient('iv09-quality'), usable = await importLot(j, 2, 'iv09-usable'),
                expired = await importLot(j, 10, 'iv09-expired', '2001-01-01');
            ok(await http('POST', `/ingredients/${j.id}/batches/${usable.batch.id}/quarantine`, {
                requestId: randomUUID(), reason: `${runId} unsafe lot` }));
            const productOnHold = await product(j, 'iv09-quality-product', 1);
            const beforeBlocked = await state(j);
            rejected(await http('POST', '/orders', { requestId: randomUUID(), paymentMethod: 'CASH',
                items: [{ productId: productOnHold.id, quantity: 1 }] }), 400);
            assert.equal(stable(await state(j)), stable(beforeBlocked));
            assert.equal(await db.orderItem.count({ where: { productId: productOnHold.id } }), 0);
            return { sessionId: s.session.id, reservedHold: before, afterReservationHold: await state(i, s.session.id),
                quality: beforeBlocked, quarantinedLotId: usable.batch.id, expiredLotId: expired.batch.id,
                eligiblePhysical: 0, reason: 'NEVER_ADJUST_RESERVED_OR_UNUSABLE_LOTS' };
        });

        await attempt('IV10', 'Immutable opening / cursor / history / revision / movement provenance', async () => {
            const i = await ingredient('iv10'), lot = await importLot(i, 1000, 'iv10-opening'), s = await open(i);
            const opened = await view(s), openedDb = await state(i, s.session.id);
            const v1 = await count(s, i, lot.batch.id, 980);
            const v2 = await count(s, i, lot.batch.id, 970);
            assert.equal(v1.entries[0].revision, 1); assert.equal(v2.entries[0].revision, 2);
            assert.equal(v2.entries[0].history.length, 2);
            assert.deepEqual(v2.entries[0].history.map(h => n(h.newQty)), [980, 970]);
            assert.ok(v2.entries[0].history.every(h => h.actorId === staffActor.id));
            assert.equal(v2.entries[0].openingQty, '1000');
            assert.equal(v2.entries[0].openingCursor, opened.entries[0].openingCursor);
            assert.equal(v2.entries[0].observedCursor, opened.current[0].cursor);
            const before = await state(i, s.session.id); qty(before, 1000, 0);
            ok(await submit(s)); ok(await approve(s));
            const after = await state(i, s.session.id); qty(after, 970, 0);
            const adj = adjust(after, s.session.id); assert.equal(adj.length, 1);
            assert.equal(adj[0].performedBy, adminActor.id); assert.equal(n(adj[0].quantity), -30);
            assert.ok(BigInt(after.ingredient.movementCursor) > BigInt(opened.current[0].cursor));
            assert.deepEqual(after.entries[0].history.map(h => n(h.newQty)).sort(), [970, 980]);
            return { sessionId: s.session.id, opened, openedDb, firstRevision: v1.entries[0],
                finalRevision: v2.entries[0], before, after, adjustmentProvenance: adj[0],
                result: 'OPENING_SNAPSHOT_AND_HISTORY_FROZEN' };
        });
    } catch (error) {
        out.fatal = error.stack || error.message;
        process.exitCode = 1;
        console.error('IV_FATAL', error.stack || error);
    } finally {
        await stop().catch(error => { out.stopError = error.message; });
        await db.$disconnect();
        out.finishedAt = new Date().toISOString();
        out.summary = { selected: out.selected.length, attempted: out.cases.length,
            passed: out.cases.filter(x => x.verdict === 'BACKEND_PASS').length,
            failed: out.cases.filter(x => x.verdict === 'FAIL').length,
            httpRequestCount: out.requests.length, faultEventCount: out.faultEvents.length };
        out.verdict = out.summary.attempted === out.summary.selected && out.summary.failed === 0 &&
            out.cases.every(x => ['BACKEND_PASS','DELEGATED_NOT_EXECUTED'].includes(x.verdict)) ?
            'PARTIAL_IV08_DELEGATED' : 'PARTIAL_OR_FAIL';
        if (out.summary.failed !== 0 || out.fatal || out.summary.attempted !== out.summary.selected) process.exitCode = 1;
        save(); console.log(stringify({ file, runId, verdict: out.verdict, summary: out.summary,
            cases: out.cases.map(x => ({ id: x.id, verdict: x.verdict, error: x.error?.slice(0, 300) })) }));
    }
}
