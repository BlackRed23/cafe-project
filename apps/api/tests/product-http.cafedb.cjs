// Opt-in real HTTP verification. Existing cafedb only; no mocks or global cleanup.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const bcrypt = require('bcrypt');
const { PrismaClient } = require('@prisma/client');

async function main() {
    assert.equal(process.env.PRODUCT_CAFEDB_CONFIRMED, 'YES');
    const url = new URL(process.env.DATABASE_URL);
    assert.equal(url.pathname, '/cafedb');
    const db = new PrismaClient({ datasources: { db: { url: url.toString() } } });
    const base = process.env.PRODUCT_API_URL || 'http://127.0.0.1:5000/api';
    const reports = process.env.PRODUCT_REPORT_DIR;
    assert.ok(reports, 'PRODUCT_REPORT_DIR required');
    const run = 'sp-http-' + randomUUID();
    const evidence = [];
    let token;
    const api = async (method, route, body, access = token) => {
        const r = await fetch(base + route, { method, signal: AbortSignal.timeout(15000),
            headers: { 'content-type': 'application/json', ...(access ? { authorization: 'Bearer ' + access } : {}) },
            body: body === undefined ? undefined : JSON.stringify(body) });
        const result = { method, route, request: body, status: r.status, response: await r.json() };
        if (!route.includes('/auth/')) evidence.push(result);
        return result;
    };
    const reportFile = path.join(reports, 'PRODUCT-SERVICE-API-VERIFICATION.md');
    const defectFile = path.join(reports, 'PRODUCT-SP-DEFECT-LOG.md');
    const results = [];
    async function scenario(id, expected, fn) {
        if (process.env.PRODUCT_SP_IDS && !process.env.PRODUCT_SP_IDS.split(',').includes(id)) return;
        evidence.length = 0;
        let verdict = 'PASS', detail;
        try { detail = await fn(); if (detail?.blocked) verdict = 'BLOCKED_POLICY'; }
        catch (e) { verdict = 'FAIL'; detail = { error: e.message }; }
        const entry = { id, expected, verdict, detail, evidence: [...evidence] };
        results.push(entry);
        fs.appendFileSync(reportFile, `\n### ${run} ${id}: ${verdict}\nExpected: ${expected}\n\n\`\`\`json\n${JSON.stringify(entry, null, 2)}\n\`\`\`\n`);
        if (verdict !== 'PASS') fs.appendFileSync(defectFile,
            `\n## ${run} ${id} — ${verdict === 'FAIL' ? 'OPEN' : 'BLOCKED'}\nExpected: ${expected}\nActual/evidence:\n\`\`\`json\n${JSON.stringify(entry, null, 2)}\n\`\`\`\nRoot cause: ${detail?.blocked || 'UNKNOWN pending source trace'}\nPatch: none yet. Retest/regression: pending.\n`);
        console.log(JSON.stringify({ run, id, verdict, error: detail?.error }));
    }
    try {
        const [identity] = await db.$queryRaw`SELECT current_database() AS db, version() AS version`;
        assert.equal(identity.db, 'cafedb');
        fs.appendFileSync(reportFile, `\n## Continued real HTTP run ${run}\nTime: ${new Date().toISOString()}\nDatabase: ${JSON.stringify(identity)}\nAPI: ${base}; actual src/index.ts, real auth; cron disabled by supported environment flags.\n`);
        const password = randomUUID();
        const passwordHash = await bcrypt.hash(password, 10);
        const category = await db.category.create({ data: { name: run } });
        const actors = await Promise.all([1, 2].map(n => db.user.create({ data: {
            name: `${run}-${n}`, email: `${run}-${n}@example.invalid`, password: passwordHash, role: 'ADMIN'
        } })));
        const login = async actor => {
            const r = await api('POST', '/auth/login', { email: actor.email, password }, null);
            assert.equal(r.status, 200, 'Fixture ADMIN login failed');
            assert.ok(r.response.accessToken); return r.response.accessToken;
        };
        token = await login(actors[0]);
        const second = await login(actors[1]);
        let count = 0;
        const input = extra => ({ name: 'SP verification', sku: `${run}-${++count}`, description: 'original', price: 25000, categoryId: category.id, requiresRecipe: false, ...extra });
        const create = async extra => { const r = await api('POST', '/products', input(extra)); assert.equal(r.status, 201); return r.response.data.product; };
        const update = (p, extra, access) => api('PUT', '/products/' + p.id, { expectedUpdatedAt: p.updatedAt, ...extra }, access);
        const product = id => db.product.findUniqueOrThrow({ where: { id } });
        const orderBody = id => ({ items: [{ productId: id, quantity: 2, toppings: [] }], paymentMethod: 'CASH' });
        const stock = id => db.inventory.create({ data: { productId: id, quantity: 100, unit: 'chai', batches: { create: {
            batchCode: `${run}-${id}`, quantity: 100, expirationDate: new Date('2099-01-01')
        } } } });
        const order = async id => { const r = await api('POST', '/orders', orderBody(id)); assert.equal(r.status, 201); return r.response.data.order; };
        const confirm = id => api('PATCH', `/orders/${id}/status`, { status: 'CONFIRMED' });
        const storedOrder = id => db.order.findUniqueOrThrow({ where: { id }, include: { items: true, payments: true } });
        await scenario('SP-01', 'Valid product persists exactly', async () => {
            const data = input(); const r = await api('POST', '/products', data); assert.equal(r.status, 201);
            const p = await product(r.response.data.product.id);
            for (const k of ['name', 'sku', 'description', 'categoryId']) assert.equal(p[k], data[k]);
            assert.equal(p.price.toString(), '25000'); return { product: p };
        });
        await scenario('SP-02', 'Duplicate SKU rejected without duplicate records', async () => {
            const data = input(); const race = await Promise.all([api('POST', '/products', data), api('POST', '/products', data)]);
            assert.deepEqual(race.map(r => r.status).sort(), [201, 409]);
            assert.equal((await api('POST', '/products', data)).status, 409);
            assert.equal(await db.product.count({ where: { sku: data.sku } }), 1); return { sku: data.sku, count: 1 };
        });
        await scenario('SP-03', 'Update name/description/price persists with audit', async () => {
            const p = await create(); const before = await product(p.id);
            const r = await update(p, { name: 'Changed', description: 'Changed description', price: 30000 }); assert.equal(r.status, 200);
            const saved = await product(p.id); assert.equal(saved.name, 'Changed'); assert.equal(saved.description, 'Changed description'); assert.equal(saved.price.toString(), '30000');
            const logs = () => db.productAuditLog.findMany({ where: { productId: p.id }, orderBy: { createdAt: 'asc' } });
            const [audit] = await logs(); assert.ok(audit.id); assert.ok(audit.createdAt); assert.equal(audit.actorId, actors[0].id);
            assert.equal(audit.action, 'PRODUCT_UPDATED'); assert.equal(audit.productId, p.id);
            assert.deepEqual(audit.changedFields.sort(), ['description', 'name', 'price']);
            assert.equal(audit.before.name, before.name); assert.equal(audit.before.description, before.description); assert.equal(audit.before.price, '25000');
            assert.equal(audit.after.name, saved.name); assert.equal(audit.after.description, saved.description); assert.equal(audit.after.price, '30000');
            // Real PostgreSQL fault injection, restricted to this owned fixture.
            const trigger = 'sp_audit_' + randomUUID().replaceAll('-', '');
            try {
                await db.$executeRawUnsafe(`CREATE FUNCTION "${trigger}"() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'owned SP audit failure'; END $$`);
                await db.$executeRawUnsafe(`CREATE TRIGGER "${trigger}" BEFORE INSERT ON "ProductAuditLog" FOR EACH ROW WHEN (NEW."productId" = '${p.id}') EXECUTE FUNCTION "${trigger}"()`);
                assert.equal((await update(r.response.data.product, { name: 'Must rollback' })).status, 500);
                assert.deepEqual(await product(p.id), saved); assert.equal((await logs()).length, 1);
            } finally {
                await db.$executeRawUnsafe(`DROP TRIGGER IF EXISTS "${trigger}" ON "ProductAuditLog"`);
                await db.$executeRawUnsafe(`DROP FUNCTION IF EXISTS "${trigger}"()`);
            }
            const noOp = await update(r.response.data.product, { name: saved.name }); assert.equal(noOp.status, 200); assert.equal((await logs()).length, 1);
            const inactive = await update(noOp.response.data.product, { isActive: false }); assert.equal(inactive.status, 200);
            const last = (await logs()).at(-1); assert.deepEqual(last.changedFields, ['isActive']); assert.equal(last.before.isActive, true); assert.equal(last.after.isActive, false);
            return { audit, rollbackVerified: true, noOpAuditOmitted: true, statusAudit: last };
        });
        await scenario('SP-04', 'Invalid input rejected with no writes', async () => {
            const p = await create(); const before = await product(p.id);
            for (const invalid of [{ price: -1 }, { price: 'bad' }, { price: null }, { price: 1.001 }, { name: '' }, { categoryId: '' }, { requiresRecipe: 'true' }, { requiresRecipe: null }]) {
                const data = input(invalid); assert.equal((await api('POST', '/products', data)).status, 400);
                assert.equal(await db.product.count({ where: { sku: data.sku } }), 0);
                assert.equal((await update(p, invalid)).status, 400); assert.deepEqual(await product(p.id), before);
            } assert.equal(await db.productAuditLog.count({ where: { productId: p.id } }), 0);
            return { rejectedCreateAndUpdate: 16, unchangedProduct: p.id, auditCount: 0 };
        });
        await scenario('SP-05', 'Inactive product cannot enter new order', async () => {
            const p = await create(); await stock(p.id); assert.equal((await update(p, { isActive: false })).status, 200);
            const r = await api('POST', '/orders', orderBody(p.id)); assert.ok([400, 409].includes(r.status));
            assert.equal(await db.orderItem.count({ where: { productId: p.id } }), 0); return { active: (await product(p.id)).isActive, orderItems: 0 };
        });
        await scenario('SP-06', 'Confirmation with inactive product rejected; pending snapshot intact', async () => {
            const p = await create(); await stock(p.id); const o = await order(p.id); const before = await storedOrder(o.id);
            assert.equal((await update(p, { isActive: false })).status, 200); assert.equal((await confirm(o.id)).status, 409);
            assert.deepEqual(await storedOrder(o.id), before); return { order: o.id, unchanged: true };
        });
        await scenario('SP-07', 'Sold product delete rejected; history preserved; deactivation guidance', async () => {
            const p = await create(); await stock(p.id); const o = await order(p.id); assert.equal((await confirm(o.id)).status, 200);
            assert.equal((await api('PATCH', `/orders/${o.id}/status`, { status: 'COMPLETED', paymentStatus: 'PAID' })).status, 200);
            const before = await storedOrder(o.id); const r = await api('DELETE', '/products/' + p.id); assert.equal(r.status, 409);
            assert.deepEqual(await storedOrder(o.id), before); assert.ok(await product(p.id));
            assert.equal((await update(p, { isActive: false })).status, 200); assert.deepEqual(await storedOrder(o.id), before);
            assert.equal((await api('GET', '/orders/' + o.id)).status, 200);
            assert.match(r.response.message, /ngừng|deactivat/i, 'Deletion rejection must require deactivation'); return { order: o.id, preserved: true };
        });
        await scenario('SP-08', 'Confirmation uses current price; later product edits preserve confirmed snapshot', async () => {
            const p = await create(); await stock(p.id); const o = await order(p.id);
            const changed = await update(p, { price: 30000 }); assert.equal(changed.status, 200); assert.equal((await confirm(o.id)).status, 200);
            const confirmed = await storedOrder(o.id);
            assert.equal(confirmed.items[0].price.toString(), '30000', 'Confirmation must snapshot confirmation-time price');
            assert.equal(confirmed.totalAmount.toString(), String(60000 + Number(confirmed.shippingFee)));
            assert.equal(confirmed.payments[0].amount.toString(), confirmed.totalAmount.toString());
            assert.equal((await update(changed.response.data.product, { price: 35000 })).status, 200);
            assert.deepEqual(await storedOrder(o.id), confirmed);
            const paid = await create(); await stock(paid.id); const paidOrder = await order(paid.id);
            assert.equal((await api('POST', `/orders/${paidOrder.id}/confirm-payment`, {})).status, 200);
            assert.equal((await update(paid, { price: 30000 })).status, 200);
            const paidBefore = await storedOrder(paidOrder.id); assert.equal((await confirm(paidOrder.id)).status, 409);
            assert.deepEqual(await storedOrder(paidOrder.id), paidBefore);
            const online = await create(); await stock(online.id);
            const onlineResponse = await api('POST', '/orders', { ...orderBody(online.id), paymentMethod: 'MOMO' }); assert.equal(onlineResponse.status, 201);
            assert.equal((await update(online, { price: 30000 })).status, 200);
            const onlineId = onlineResponse.response.data.order.id; const onlineBefore = await storedOrder(onlineId);
            assert.equal((await confirm(onlineId)).status, 409); assert.deepEqual(await storedOrder(onlineId), onlineBefore);
            return { confirmed, paidOrderUnchanged: paidOrder.id, onlineOrderUnchanged: onlineId };
        });
        await scenario('SP-09', 'Concurrent ADMIN updates detect conflict without lost update', async () => {
            const p = await create(); const r = await Promise.all([update(p, { name: 'Admin A' }), update(p, { name: 'Admin B' }, second)]);
            assert.deepEqual(r.map(x => x.status).sort(), [200, 409]); const saved = await product(p.id);
            assert.equal(saved.name, r.find(x => x.status === 200).response.data.product.name);
            assert.equal((await update(p, { description: 'stale' })).status, 409);
            const logs = await db.productAuditLog.findMany({ where: { productId: p.id } }); assert.equal(logs.length, 1);
            const winner = r.findIndex(x => x.status === 200); assert.equal(logs[0].actorId, actors[winner].id);
            assert.deepEqual(logs[0].changedFields, ['name']); return { stored: saved, audit: logs[0] };
        });
        await scenario('SP-10', 'Ingredient-required product activation rejected without valid recipe', async () => {
            const p = await create({ isActive: false, requiresRecipe: true });
            assert.equal((await update(p, { isActive: true })).status, 409);
            assert.equal((await product(p.id)).isActive, false);
            // Necessary fixture: legacy empty active recipe cannot be created by validated Recipe HTTP API.
            await db.recipe.create({ data: { productId: p.id, version: 1, isActive: true } });
            assert.equal((await update(p, { isActive: true })).status, 409); assert.equal((await product(p.id)).isActive, false);
            assert.equal((await api('PATCH', `/products/${p.id}/restore`, {})).status, 409); assert.equal((await product(p.id)).isActive, false);
            const noRecipe = await create({ isActive: false }); const r = await update(noRecipe, { isActive: true }); assert.equal(r.status, 200);
            assert.equal((await product(noRecipe.id)).requiresRecipe, false);
            const unknown = await create({ isActive: false, requiresRecipe: undefined });
            assert.equal((await product(unknown.id)).requiresRecipe, null); assert.equal((await update(unknown, { isActive: true })).status, 409);
            assert.equal((await product(unknown.id)).isActive, false);
            await stock(unknown.id);
            // Simulate existing unreviewed active legacy row; never classify it implicitly.
            await db.product.update({ where: { id: unknown.id }, data: { isActive: true } });
            const legacyOrder = await api('POST', '/orders', orderBody(unknown.id)); assert.equal(legacyOrder.status, 409);
            assert.match(legacyOrder.response.message, /requiresRecipe/); assert.equal(await db.orderItem.count({ where: { productId: unknown.id } }), 0);
            const data = input({ requiresRecipe: true }); assert.equal((await api('POST', '/products', data)).status, 409);
            assert.equal(await db.product.count({ where: { sku: data.sku } }), 0);
            const good = await create({ isActive: false, requiresRecipe: true });
            const ingredient = await db.ingredient.create({ data: { name: run, sku: run, baseUnit: 'g', quantity: 1000, costPerBaseUnit: 100 } });
            const recipe = await api('POST', `/products/${good.id}/recipes`, { yieldQuantity: 1, ingredients: [{ ingredientId: ingredient.id, quantity: 10, unit: 'g' }] }); assert.equal(recipe.status, 201);
            // Recipe creation may touch product cost/version: read current version over HTTP.
            const fresh = (await api('GET', '/products/' + good.id)).response.data.product;
            assert.equal((await update(fresh, { isActive: true })).status, 200);
            assert.equal((await product(good.id)).isActive, true);
            const o = await order(good.id); assert.equal((await db.ingredient.findUniqueOrThrow({ where: { id: ingredient.id } })).reserved.toString(), '20');
            assert.equal((await api('PATCH', `/orders/${o.id}/status`, { status: 'CANCELLED' })).status, 200);
            assert.equal((await db.ingredient.findUniqueOrThrow({ where: { id: ingredient.id } })).reserved.toString(), '0');
            return { requiredWithoutRecipeRejected: true, invalidRecipeRejected: true, unreviewedRejected: true, packagedAccepted: true, validRecipeAccepted: true, reservationReleaseVerified: true };
        });
        const summary = { run, pass: results.filter(r => r.verdict === 'PASS').length, fail: results.filter(r => r.verdict === 'FAIL').length, blocked: results.filter(r => r.verdict === 'BLOCKED_POLICY').length };
        fs.appendFileSync(reportFile, `\nRun totals: ${JSON.stringify(summary)}\nFixtures retained under ${run}; no cleanup of history or unrelated data.\n`);
        console.log(JSON.stringify(summary)); process.exitCode = summary.fail ? 1 : summary.blocked ? 2 : 0;
    } finally { await db.$disconnect(); }
}
main().catch(e => { console.error(e.message); process.exitCode = 1; });
