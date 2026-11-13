const test = require('node:test');
const assert = require('node:assert/strict');
const { Prisma } = require('@prisma/client');
const { sourceLoader } = require('./repair-source-loader.cjs');
const D = x => new Prisma.Decimal(x);
function fixture() {
    const ingredient = { id: 'milk', baseUnit: 'ml', isActive: true, deletedAt: null, quantity: D(1000), reserved: D(0) };
    const batches = [{ id: 'early', ingredientId: 'milk', quantityRemaining: D(100), unitCost: D(2), expirationDate: new Date('2090-01-01'), receivedAt: new Date('2020-01-01') },
        { id: 'late', ingredientId: 'milk', quantityRemaining: D(900), unitCost: D(3), expirationDate: new Date('2099-01-01'), receivedAt: new Date('2020-01-01') }];
    const recipe = { id: 'r1', version: 7, productId: 'coffee', isActive: true, effectiveFrom: new Date('2020-01-01'), effectiveTo: null, yieldQuantity: D(1),
        ingredients: [{ ingredientId: 'milk', quantity: D(150), unit: 'ml', quantityBase: D(150), ingredient: { ...ingredient, batches } }] };
    let order = null, failLedger = false;
    const ledger = [], locks = [];
    const updateValue = (object, field, value) => { if (value !== undefined) object[field] = value.decrement ? object[field].minus(value.decrement) : value; };
    const tx = {
        $queryRaw: async (strings, ...values) => { locks.push(values[0]); return []; },
        product: { findMany: async () => [{ id: 'coffee', name: 'Coffee', price: D(100), recipes: [recipe] }] },
        ingredient: { findUnique: async () => ({ ...ingredient, batches }), update: async ({ data }) => {
            updateValue(ingredient, 'quantity', data.quantity); updateValue(ingredient, 'reserved', data.reserved); return ingredient;
        } },
        ingredientBatch: { findMany: async () => batches, updateMany: async ({ where, data }) => {
            const b = batches.find(b => b.id === where.id && b.quantityRemaining.gte(where.quantityRemaining.gte));
            if (!b) return { count: 0 }; b.quantityRemaining = b.quantityRemaining.minus(data.quantityRemaining.decrement); return { count: 1 };
        } },
        inventoryTransaction: { findUnique: async ({ where }) => { const l = ledger.find(l => l.idempotencyKey === where.idempotencyKey); return l ? { ...l, orderItem: { ...order.items.find(i => i.id === l.orderItemId), order } } : null; },
            create: async ({ data }) => { if (failLedger) throw Error('ledger failure'); ledger.push({ ...data }); return data; },
            findMany: async ({ where }) => ledger.filter(l => l.referenceId === where.referenceId && l.type === where.type) },
        order: { findUnique: async () => order, create: async ({ data }) => { order = { id: 'order', ...data, items: data.items.create.map(i => ({ ...i, orderId: 'order', product: { id: 'coffee' } })), payments: [] }; return order; },
            update: async ({ data }) => { Object.assign(order, data); return order; } },
        orderItem: { updateMany: async ({ data }) => { for (const item of order.items) Object.assign(item, data); return { count: order.items.length }; } }
    };
    const db = { ...tx, $transaction: async fn => {
        const before = { quantity: ingredient.quantity, reserved: ingredient.reserved, amounts: batches.map(b => b.quantityRemaining), ledger: ledger.length,
            order: order && { ...order, items: order.items.map(i => ({ ...i })) } };
        try { return await fn(tx); } catch (e) {
            ingredient.quantity = before.quantity; ingredient.reserved = before.reserved; batches.forEach((b,i) => b.quantityRemaining = before.amounts[i]); ledger.length = before.ledger; order = before.order; throw e;
        }
    } };
    const repository = sourceLoader(db, { './shipping.service': { detectShippingZone: () => 'LOCAL', calculateShippingFee: () => 0 } })('modules/order/order.repository.ts').orderRepository;
    return { repository, ingredient, batches, ledger, recipe, locks, get order() { return order; }, failLedger() { failLedger = true; } };
}
const input = { items: [{ productId: 'coffee', quantity: 1 }], paymentMethod: 'CASH', idempotencyKey: 'create-1' };

test('Order create snapshots recipe version and reserves base units; retries do not reserve twice', async () => {
    const f = fixture(); const order = await f.repository.create('user', input);
    assert.equal(f.ingredient.quantity.toString(), '1000'); assert.equal(f.ingredient.reserved.toString(), '150');
    assert.equal(order.items[0].recipeId, 'r1'); assert.equal(order.items[0].recipeVersion, 7);
    assert.equal(order.items[0].costBreakdown.ingredients[0].quantityBase, '150');
    await f.repository.create('user', input); assert.equal(f.ingredient.reserved.toString(), '150'); assert.equal(f.ledger.length, 1);
    await assert.rejects(f.repository.create('user', { ...input, items: [{ productId: 'coffee', quantity: 2 }] }), { statusCode: 409 });
});
test('Order completion uses original reservation despite recipe edits; FEFO ledger and repeat transition safe', async () => {
    const f = fixture(); await f.repository.create('user', input); await f.repository.updateStatus(f.order, 'PROCESSING', 'admin');
    f.recipe.ingredients[0].quantityBase = D(999);
    await f.repository.updateStatus(f.order, 'COMPLETED', 'admin');
    assert.equal(f.ingredient.quantity.toString(), '850'); assert.equal(f.ingredient.reserved.toString(), '0');
    assert.equal(f.batches[0].quantityRemaining.toString(), '0'); assert.equal(f.batches[1].quantityRemaining.toString(), '850');
    assert.deepEqual(f.ledger.filter(l => l.type === 'CONSUME').map(l => l.quantity.toString()), ['-100', '-50']);
    assert.equal(f.order.items[0].consumptionStatus, 'COMMITTED');
    await f.repository.updateStatus(f.order, 'COMPLETED', 'admin'); assert.equal(f.ingredient.quantity.toString(), '850');
    await assert.rejects(f.repository.updateStatus(f.order, 'CANCELLED', 'admin'), { statusCode: 409 });
});
test('Order cancellation releases reserve without adding physical stock; retry no-op', async () => {
    const f = fixture(); await f.repository.create('user', input); await f.repository.updateStatus(f.order, 'CANCELLED', 'admin');
    await f.repository.updateStatus(f.order, 'CANCELLED', 'admin');
    assert.equal(f.ingredient.quantity.toString(), '1000'); assert.equal(f.ingredient.reserved.toString(), '0');
    assert.equal(f.ledger.filter(l => l.type === 'CONSUME').length, 0); assert.equal(f.order.items[0].consumptionStatus, 'VOIDED_BEFORE_START');
});
test('Order with multiple items sharing ingredient cannot oversell aggregate or expire lots silently', async () => {
    const f = fixture();
    await assert.rejects(f.repository.create('user', { ...input, items: [{ productId: 'coffee', quantity: 4 }, { productId: 'coffee', quantity: 4 }] }));
    assert.equal(f.ingredient.reserved.toString(), '0'); assert.equal(f.ledger.length, 0);
    await f.repository.create('user', input); await f.repository.updateStatus(f.order, 'PROCESSING', 'admin');
    f.batches.forEach(b => b.expirationDate = new Date('2020-01-01'));
    await assert.rejects(f.repository.updateStatus(f.order, 'COMPLETED', 'admin'));
    assert.equal(f.ingredient.quantity.toString(), '1000'); assert.equal(f.ingredient.reserved.toString(), '150'); assert.equal(f.order.status, 'PROCESSING');
});
test('Order ledger failure rolls back reservation and order creation', async () => {
    const f = fixture(); f.failLedger(); await assert.rejects(f.repository.create('user', input), /ledger failure/);
    assert.equal(f.order, null); assert.equal(f.ingredient.reserved.toString(), '0');
});
test('Historical orders without snapshot/reservation are BLOCKED without physical stock mutation', async () => {
    const f = fixture(); await f.repository.create('user', input); f.order.items[0].recipeId = null;
    await assert.rejects(f.repository.updateStatus(f.order, 'CANCELLED', 'admin'), /BLOCKED/); assert.equal(f.ingredient.quantity.toString(), '1000');
});

test('Partial/mismatched reservation ledger and changed ingredient unit cannot finalize an order', async () => {
    for (const mode of ['quantity', 'snapshot', 'unit']) {
        const f = fixture(); await f.repository.create('user', input); await f.repository.updateStatus(f.order, 'PROCESSING', 'admin');
        if (mode === 'quantity') f.ledger[0].quantity = D(149);
        if (mode === 'snapshot') f.order.items[0].costBreakdown.ingredients.push({ ingredientId: 'missing', quantityBase: '1', baseUnit: 'g' });
        if (mode === 'unit') f.ingredient.baseUnit = 'g';
        await assert.rejects(f.repository.updateStatus(f.order, 'COMPLETED', 'admin'));
        assert.equal(f.ingredient.quantity.toString(), '1000'); assert.equal(f.order.status, 'PROCESSING');
    }
});
