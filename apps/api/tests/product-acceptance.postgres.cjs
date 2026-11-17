// Dedicated, opt-in PostgreSQL only. No .env, fallback URL, reset, truncate or shared cleanup.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { PrismaClient } = require('@prisma/client');
const { harness } = require('./product-test-harness.cjs');
const url = process.env.PRODUCT_TEST_DATABASE_URL;

test('Product acceptance against isolated PostgreSQL', { skip: !url && 'BLOCKED: PRODUCT_TEST_DATABASE_URL absent' }, async t => {
    const target = new URL(url);
    assert.equal(target.hostname, '127.0.0.1');
    assert.equal(target.port, '55439');
    assert.equal(target.pathname, '/product_service_test');
    assert.equal(process.env.PRODUCT_TEST_DATABASE_CONFIRMED, 'YES');
    const db = new PrismaClient({ datasources: { db: { url } } });
    try {
        const [identity] = await db.$queryRaw`SELECT current_database() AS db, inet_server_port() AS port, version() AS version`;
        assert.equal(identity.db, 'product_service_test'); assert.equal(identity.port, 55439);
        t.diagnostic(JSON.stringify(identity));
        const h = harness(db, { network: true }), suffix = randomUUID();
        const category = await db.category.create({ data: { name: 'product-test-' + suffix } });
        const admin = await db.user.create({ data: { name: 'Admin', email: suffix + '@product-test.invalid', role: 'ADMIN' } });
        const secondAdmin = await db.user.create({ data: { name: 'Admin 2', email: suffix + '-2@product-test.invalid', role: 'ADMIN' } });
        const input = (sku, extra = {}) => ({ name: 'Test product', sku: sku + '-' + suffix, price: 25000, categoryId: category.id, ...extra });
        const create = (sku, extra) => h.service.createProduct(input(sku, extra));
        const update = (product, extra) => h.service.updateProduct(product.id, { expectedUpdatedAt: new Date(product.updatedAt).toISOString(), ...extra });
        const orderInput = productId => ({ items: [{ productId, quantity: 2, toppings: [] }], paymentMethod: 'CASH' });
        const stock = productId => db.inventory.create({ data: { productId, quantity: 100, unit: 'chai',
            batches: { create: { batchCode: 'test-batch-' + suffix, quantity: 100, expirationDate: new Date('2099-01-01') } } } });

        await t.test('create service and HTTP persist product; missing category leaves no partial product', async () => {
            const p = await create('service-create');
            assert.equal((await db.product.findUniqueOrThrow({ where: { id: p.id } })).price.toString(), '25000');
            const r = await h.api('POST', '/products', input('http-create'), admin.id);
            assert.equal(r.status, 201);
            assert.equal(await db.product.count({ where: { id: r.body.data.product.id } }), 1);
            const bad = input('missing-category', { categoryId: 'absent-' + suffix });
            await assert.rejects(h.service.createProduct(bad), e => e.statusCode === 404);
            assert.equal((await h.api('POST', '/products', bad, admin.id)).status, 404);
            assert.equal(await db.product.count({ where: { sku: bad.sku } }), 0);
        });
        await t.test('duplicate SKU service conflict, HTTP conflict and database race leave exactly one record', async () => {
            const p = await create('duplicate');
            await assert.rejects(h.service.createProduct(input('duplicate')), e => e.statusCode === 409);
            assert.equal((await h.api('POST', '/products', input('duplicate'), admin.id)).status, 409);
            const racing = input('race');
            const results = await Promise.all([h.api('POST', '/products', racing, admin.id), h.api('POST', '/products', racing, admin.id)]);
            assert.deepEqual(results.map(r => r.status).sort(), [201, 409]);
            assert.equal(await db.product.count({ where: { sku: racing.sku } }), 1);
            await assert.rejects(db.product.create({ data: input('duplicate') }), e => e.code === 'P2002');
            assert.equal(await db.product.count({ where: { sku: p.sku } }), 1);
            const rawInput = input('raw-db-race');
            const rawRace = await Promise.allSettled([db.product.create({ data: rawInput }), db.product.create({ data: rawInput })]);
            assert.equal(rawRace.filter(r => r.status === 'fulfilled').length, 1);
            assert.equal(rawRace.find(r => r.status === 'rejected').reason.code, 'P2002');
            assert.equal(await db.product.count({ where: { sku: rawInput.sku } }), 1);
        });
        await t.test('normalized duplicate SKU is rejected before persistence on update', async () => {
            const p = await create('normal-source'), q = await create('normal-target');
            await assert.rejects(update(q, { sku: '  ' + p.sku + '  ' }), e => e.statusCode === 409);
            assert.equal((await db.product.findUniqueOrThrow({ where: { id: q.id } })).sku, q.sku);
        });
        await t.test('invalid price fails service and HTTP with no product writes', async () => {
            for (const price of [-1, 1.001, 10000000000, null, '', true]) {
                const data = input('invalid-' + String(price), { price });
                await assert.rejects(h.service.createProduct(data), e => e.statusCode === 400);
                assert.equal((await h.api('POST', '/products', data, admin.id)).status, 400);
                assert.equal(await db.product.count({ where: { sku: data.sku } }), 0);
            }
        });
        await t.test('two administrators use same version: stale and concurrent updates return conflict', async () => {
            const p = await create('version');
            const version = new Date(p.updatedAt).toISOString();
            const a = await h.api('PUT', '/products/' + p.id, { name: 'Accepted', expectedUpdatedAt: version }, admin.id);
            assert.equal(a.status, 200);
            const b = await h.api('PUT', '/products/' + p.id, { name: 'Lost update', expectedUpdatedAt: version }, secondAdmin.id);
            assert.equal(b.status, 409);
            await assert.rejects(update(p, { name: 'Stale service request' }), e => e.statusCode === 409);
            assert.equal((await db.product.findUniqueOrThrow({ where: { id: p.id } })).name, 'Accepted');
            const next = a.body.data.product.updatedAt;
            const race = await Promise.all(['Winner A', 'Winner B'].map((name, index) => h.api('PUT', '/products/' + p.id, { name, expectedUpdatedAt: next }, index ? secondAdmin.id : admin.id)));
            assert.deepEqual(race.map(r => r.status).sort(), [200, 409]);
            assert.equal((await db.product.findUniqueOrThrow({ where: { id: p.id } })).name, race.find(r => r.status === 200).body.data.product.name);
            assert.equal((await h.api('PUT', '/products/' + p.id, { price: 1 }, admin.id)).status, 400);
        });
        await t.test('deactivation blocks fresh and stale order confirmation while historical item stays intact', async () => {
            const p = await create('deactivation'); await stock(p.id);
            const pending = await h.orders.createOrder(admin.id, orderInput(p.id));
            const before = await db.orderItem.findMany({ where: { orderId: pending.id } });
            await update(p, { isActive: false });
            await assert.rejects(h.orders.createOrder(admin.id, orderInput(p.id)), e => e.statusCode === 409);
            assert.equal((await h.api('POST', '/orders', orderInput(p.id), admin.id)).status, 409);
            const confirmed = await h.api('PATCH', '/orders/' + pending.id + '/status', { status: 'CONFIRMED' }, admin.id);
            assert.equal(confirmed.status, 409);
            assert.equal((await db.order.findUniqueOrThrow({ where: { id: pending.id } })).status, 'PENDING');
            assert.deepEqual(await db.orderItem.findMany({ where: { orderId: pending.id } }), before);
            assert.equal(await db.order.count({ where: { userId: admin.id, items: { some: { productId: p.id } } } }), 1);
        });
        await t.test('historical sales survive service/API/direct DB removal attempts and deactivation', async () => {
            const p = await create('history'); await stock(p.id);
            const o = await h.orders.createOrder(admin.id, orderInput(p.id));
            await h.orders.updateOrderStatus(o.id, { status: 'CONFIRMED' }, admin.id);
            await h.orders.updateOrderStatus(o.id, { status: 'COMPLETED', paymentStatus: 'PAID' }, admin.id);
            const before = await db.order.findUniqueOrThrow({ where: { id: o.id }, include: { items: true } });
            await assert.rejects(h.service.deleteProduct(p.id), e => e.statusCode === 409);
            assert.equal((await h.api('DELETE', '/products/' + p.id, undefined, admin.id)).status, 409);
            // Remove unrelated legacy blockers inside a rolled-back transaction so
            // rejection specifically proves the sales-history FK protects Product.
            await assert.rejects(db.$transaction(async tx => {
                await tx.inventoryTransaction.deleteMany({ where: { productId: p.id } });
                const inventory = await tx.inventory.findUniqueOrThrow({ where: { productId: p.id } });
                await tx.inventoryBatch.deleteMany({ where: { inventoryId: inventory.id } });
                await tx.inventory.delete({ where: { productId: p.id } });
                await tx.product.delete({ where: { id: p.id } });
            }), e => /OrderItem_productId_fkey/.test(e.message));
            await update(p, { isActive: false });
            assert.deepEqual(await db.order.findUniqueOrThrow({ where: { id: o.id }, include: { items: true } }), before);
            assert.equal((await h.api('GET', '/orders/' + o.id, undefined, admin.id)).status, 200);
        });
        await t.test('order snapshots server price and product changes preserve confirmed total', async () => {
            const p = await create('price-snapshot'); await stock(p.id);
            const response = await h.api('POST', '/orders', { ...orderInput(p.id), price: 1, totalAmount: 2 }, admin.id);
            assert.equal(response.status, 201);
            const id = response.body.data.order.id;
            assert.equal((await h.api('PATCH', '/orders/' + id + '/status', { status: 'CONFIRMED' }, admin.id)).status, 200);
            const before = await db.order.findUniqueOrThrow({ where: { id }, include: { items: true } });
            assert.equal(before.items[0].price.toString(), '25000');
            await update(p, { price: 30000 });
            assert.deepEqual(await db.order.findUniqueOrThrow({ where: { id }, include: { items: true } }), before);
        });
        await t.test('concurrent price changes never split order unit price, total or payment', async () => {
            for (let n = 0; n < 5; n++) {
                const p = await create('price-race-' + n); await stock(p.id);
                const [order] = await Promise.all([h.orders.createOrder(admin.id, orderInput(p.id)), update(p, { price: 30000 })]);
                const stored = await db.order.findUniqueOrThrow({ where: { id: order.id }, include: { items: true, payments: true } });
                assert.ok(['25000', '30000'].includes(stored.items[0].price.toString()));
                assert.equal(stored.totalAmount.toString(), stored.items[0].price.mul(2).add(stored.shippingFee).toString());
                assert.equal(stored.payments[0].amount.toString(), stored.totalAmount.toString());
            }
        });
        await t.test('Recipe and Order regression: valid recipe reserves ingredients, cancellation releases original reservation', async () => {
            const p = await create('recipe-order');
            const ingredient = await db.ingredient.create({ data: { sku: 'ingredient-' + suffix, name: 'Coffee', baseUnit: 'g', quantity: 1000, costPerBaseUnit: 100 } });
            const recipeInput = { yieldQuantity: 1, ingredients: [{ ingredientId: ingredient.id, quantity: 10, unit: 'g' }] };
            const r = await h.api('POST', `/products/${p.id}/recipes`, recipeInput, admin.id);
            assert.equal(r.status, 201);
            const recipe = await db.recipe.findFirstOrThrow({ where: { productId: p.id, isActive: true } });
            const order = await h.orders.createOrder(admin.id, orderInput(p.id));
            const storedItem = await db.orderItem.findFirstOrThrow({ where: { orderId: order.id } });
            assert.equal(storedItem.recipeId, recipe.id); assert.equal(storedItem.recipeVersion, recipe.version);
            assert.equal((await db.ingredient.findUniqueOrThrow({ where: { id: ingredient.id } })).reserved.toString(), '20');
            assert.equal(await db.inventoryTransaction.count({ where: { orderItemId: storedItem.id, type: 'RESERVE' } }), 1);
            await h.orders.updateOrderStatus(order.id, { status: 'CANCELLED' }, admin.id);
            const after = await db.ingredient.findUniqueOrThrow({ where: { id: ingredient.id } });
            assert.equal(after.reserved.toString(), '0'); assert.equal(after.quantity.toString(), '1000');
            assert.equal((await db.orderItem.findUniqueOrThrow({ where: { id: storedItem.id } })).recipeId, recipe.id);
            await db.recipe.update({ where: { id: recipe.id }, data: { isActive: false } });
            const before = await db.order.count({ where: { userId: admin.id } });
            assert.equal((await h.api('POST', '/orders', orderInput(p.id), admin.id)).status, 400);
            assert.equal(await db.order.count({ where: { userId: admin.id } }), before);
        });
        await t.test('invalid active recipe cannot create partial Order, Payment or reservations', async () => {
            const p = await create('invalid-recipe');
            await db.recipe.create({ data: { productId: p.id, version: 1, isActive: true } });
            const before = { orders: await db.order.count(), payments: await db.payment.count(), items: await db.orderItem.count() };
            await assert.rejects(h.orders.createOrder(admin.id, orderInput(p.id)), e => e.statusCode === 409);
            assert.equal((await h.api('POST', '/orders', orderInput(p.id), admin.id)).status, 409);
            assert.deepEqual({ orders: await db.order.count(), payments: await db.payment.count(), items: await db.orderItem.count() }, before);
            await update(p, { isActive: false });
            const inactive = await h.service.getProductById(p.id);
            await assert.rejects(update(inactive, { isActive: true }), e => e.statusCode === 409);
            assert.equal((await h.api('PUT', '/products/' + p.id, { isActive: true, expectedUpdatedAt: new Date(inactive.updatedAt).toISOString() }, admin.id)).status, 409);
            assert.equal((await db.product.findUniqueOrThrow({ where: { id: p.id } })).isActive, false);
            assert.equal((await h.api('PATCH', '/products/' + p.id + '/restore', {}, admin.id)).status, 409);
            assert.equal((await db.product.findUniqueOrThrow({ where: { id: p.id } })).isActive, false);
        });
        await t.test('Recipe service and API reject invalid payload without a recipe record', async () => {
            const p = await create('invalid-recipe-service');
            const invalid = { yieldQuantity: 0, ingredients: [] };
            await assert.rejects(h.load('modules/recipe/recipe.service.ts').recipeService.createVersion(p.id, invalid), e => e.statusCode === 400);
            assert.equal((await h.api('POST', `/products/${p.id}/recipes`, invalid, admin.id)).status, 400);
            assert.equal(await db.recipe.count({ where: { productId: p.id } }), 0);
        });
        await t.test('Recipe activation rejects empty recipe or unavailable ingredients without changing active version', async () => {
            const p = await create('recipe-activate');
            const ingredient = await db.ingredient.create({ data: { sku: 'inactive-ingredient-' + suffix, name: 'Unavailable', isActive: false } });
            for (const [version, ingredients] of [[1, []], [2, [{ ingredientId: ingredient.id, quantity: 1, quantityBase: 1, unit: 'g' }]]]) {
                const recipe = await db.recipe.create({ data: { productId: p.id, version, isActive: false, ingredients: { create: ingredients } } });
                await assert.rejects(h.load('modules/recipe/recipe.service.ts').recipeService.activateVersion(p.id, recipe.id), e => e.statusCode === 409);
                assert.equal((await h.api('POST', `/products/${p.id}/recipes/${recipe.id}/activate`, {}, admin.id)).status, 409);
                assert.equal((await db.recipe.findUniqueOrThrow({ where: { id: recipe.id } })).isActive, false);
            }
        });
        await t.test('deactivation transaction racing cart acceptance blocks on DB lock then rejects without partial records', async () => {
            const p = await create('deactivation-race'); await stock(p.id);
            const before = { orders: await db.order.count(), payments: await db.payment.count(), items: await db.orderItem.count() };
            let attempt;
            await db.$transaction(async tx => {
                await tx.product.update({ where: { id: p.id }, data: { isActive: false } });
                attempt = h.api('POST', '/orders', orderInput(p.id), admin.id);
                const deadline = Date.now() + 4000;
                let locked = false;
                while (Date.now() < deadline) {
                    // Observe outside writer transaction: PostgreSQL caches stats
                    // snapshots inside a transaction and can hide later waiters.
                    const waiters = await db.$queryRaw`SELECT pid FROM pg_stat_activity WHERE datname = current_database()
                        AND wait_event_type = 'Lock' AND query LIKE '%FROM "Product"%'`;
                    if (waiters.length) { locked = true; break; }
                    await new Promise(resolve => setTimeout(resolve, 20));
                }
                assert.equal(locked, true, 'Order acceptance must wait for deactivation transaction');
            });
            assert.equal((await attempt).status, 409);
            assert.deepEqual({ orders: await db.order.count(), payments: await db.payment.count(), items: await db.orderItem.count() }, before);
        });
    } finally { await db.$disconnect(); }
});
