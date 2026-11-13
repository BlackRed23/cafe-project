const test = require('node:test');
const assert = require('node:assert/strict');
const Module = require('node:module');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const { Prisma, InventoryTransactionType } = require('@prisma/client');
const D = value => new Prisma.Decimal(value);
const future = '2099-12-31';

// Source-only harness: no PrismaClient, HTTP, Agent or PostgreSQL connection.
function fixture(overrides = {}) {
    let state = {
        ingredient: { id: 'ingredient', name: 'Milk', sku: 'MILK', isActive: true, deletedAt: null, category: null,
            baseUnit: 'ml', quantity: D('10'), reserved: D('2'), minThreshold: D('3'), costPerBaseUnit: D('0.25'), rowVersion: 0,
            imageUrl: null, createdAt: new Date(), updatedAt: new Date(), ...overrides },
        batches: [{ id: 'batch', ingredientId: 'ingredient', batchCode: 'existing', quantityInitial: D('10'), quantityRemaining: D('10'),
            expirationDate: new Date('2099-12-31'), receivedAt: new Date('2026-01-01'), goodsReceiptId: null, purchaseRequestItemId: null }],
        ledger: []
    };
    let failure = false;
    let drift = false;
    let locks = 0;
    const effects = [];
    const copy = () => ({ ...state.ingredient, batches: state.batches.map(b => ({ ...b })) });
    const link = { id: 'link', ingredientId: 'ingredient', supplierId: 'supplier', pricePerBaseUnit: D('0.3'),
        conversionQuantity: D('2.5'), purchaseUnit: 'bottle', conversionTargetUnit: 'ml', supplier: { name: 'Supplier', status: 'ACTIVE', deletedAt: null } };
    const tx = {
        $queryRaw: async parts => { assert.match(parts.join(''), /Ingredient.*FOR UPDATE/s); locks++; },
        ingredient: {
            findUnique: async () => copy(), findFirst: async () => copy(), findMany: async () => [copy()],
            update: async ({ data }) => {
                if (data.quantity) state.ingredient.quantity = data.quantity;
                if (data.minThreshold) state.ingredient.minThreshold = data.minThreshold;
                state.ingredient.rowVersion++;
                return copy();
            }
        },
        ingredientBatch: {
            aggregate: async () => ({ _sum: { quantityRemaining: drift ? D('999') : state.batches.reduce((s,b) => s.plus(b.quantityRemaining), D(0)) } }),
            findUnique: async ({ where }) => state.batches.find(b => b.batchCode === where.ingredientId_batchCode.batchCode) ?? null,
            findFirst: async ({ where }) => state.batches.find(b => b.id === where.id && b.ingredientId === where.ingredientId) ?? null,
            create: async ({ data }) => { const b = { id: `batch-${state.batches.length}`, goodsReceiptId: null, purchaseRequestItemId: null,
                supplierId: null, receivedAt: new Date(), ...data }; b.supplierId ??= null; state.batches.push(b); return b; },
            updateMany: async ({ where, data }) => {
                const b = state.batches.find(b => b.id === where.id && b.ingredientId === where.ingredientId && b.quantityRemaining.equals(where.quantityRemaining));
                if (!b) return { count: 0 }; b.quantityRemaining = data.quantityRemaining; return { count: 1 };
            }
        },
        inventoryTransaction: {
            findUnique: async ({ where }) => state.ledger.find(l => l.idempotencyKey === where.idempotencyKey) ?? null,
            create: async ({ data }) => { if (failure) throw Error('ledger write failed'); state.ledger.push({ id: `tx-${state.ledger.length}`, ...data }); return data; },
            aggregate: async () => ({ _sum: { quantity: D('-12.5') } }),
            findMany: async () => []
        },
        supplierIngredient: { findUnique: async () => link, findMany: async () => [] },
        product: { findMany: async args => { assert.equal(args.where.recipes.some.ingredients.some.ingredientId, 'ingredient'); return [{ id: 'selling-product' }]; } }
    };
    const db = { ...tx, $transaction: async callback => {
        const before = { ingredient: { ...state.ingredient }, batches: state.batches.map(b => ({ ...b })), ledger: state.ledger.map(l => ({ ...l })) };
        try { return await callback(tx); } catch (error) { state = before; throw error; }
    } };
    const cache = new Map();
    function load(file) {
        file = path.resolve(file);
        if (cache.has(file)) return cache.get(file).exports;
        const m = new Module(file); cache.set(file, m); m.filename = file; m.paths = Module._nodeModulePaths(path.dirname(file));
        m.require = request => {
            if (request === '@cafe-project/database') return { Prisma, InventoryTransactionType, prisma: db };
            if (request.endsWith('/agent/agent.client')) return {
                createAgentLogViaAgentService: async data => effects.push({ audit: data }),
                scanInventoryViaAgentService: async input => effects.push({ scan: input })
            };
            if (request.startsWith('.')) return load(path.resolve(path.dirname(file), request + '.ts'));
            return Module.prototype.require.call(m, request);
        };
        m._compile(ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, esModuleInterop: true } }).outputText, file);
        return m.exports;
    }
    const root = path.resolve(__dirname, '../src/modules/inventory');
    return { repository: load(path.join(root, 'inventory.repository.ts')).inventoryRepository,
        service: load(path.join(root, 'inventory.service.ts')), validator: load(path.join(root, 'inventory.validator.ts')),
        controller: load(path.join(root, 'inventory.controller.ts')),
        quantity: load(path.join(root, 'inventory-quantity.ts')), get state() { return state; }, effects, link,
        get locks() { return locks; }, failLedger() { failure = true; }, drift() { drift = true; } };
}

test('Decimal capacity, exact three places, overflow, signed values, whole pieces', () => {
    const { stockQuantity: q, requireWholePieces } = fixture().quantity;
    assert.equal(q('0.125').plus(q('0.875')).toString(), '1');
    assert.equal(q('-0.001', true).toString(), '-0.001');
    assert.equal(q('99999999999.999').toString(), '99999999999.999');
    for (const value of ['0', '-1', 'NaN', 'Infinity', '0.0001', '100000000000']) assert.throws(() => q(value));
    assert.throws(() => requireWholePieces(D('0.5'), 'piece'));
});

test('validators reject ambiguous units, receipt ownership fields and unsafe decimal input', () => {
    const v = fixture().validator;
    const valid = { inventoryId: 'ingredient', quantity: 0.125, batchCode: 'manual', expirationDate: future };
    assert.equal(v.importInventorySchema.safeParse(valid).success, true);
    assert.equal(v.importInventorySchema.safeParse({ ...valid, quantity: 99999999999.999 }).success, true);
    for (const input of [{ ...valid, quantity: 0.0001 }, { ...valid, purchaseQuantity: 1 }, { ...valid, goodsReceiptId: 'receipt' },
        { ...valid, batchCode: undefined }, { ...valid, quantity: 100000000000 }, { ...valid, expirationDate: undefined }]) {
        assert.equal(v.importInventorySchema.safeParse(input).success, false);
    }
});

test('fractional import locks aggregate and writes batch, stock and ingredient ledger once', async () => {
    const f = fixture();
    await f.repository.importStock(f.state.ingredient, D('0.125'), 'manual', 'admin', 'new', future, { idempotencyKey: 'import-key' });
    assert.equal(f.state.ingredient.quantity.toString(), '10.125');
    assert.equal(f.state.batches[1].quantityInitial.toString(), '0.125');
    assert.equal(f.state.batches[1].quantityRemaining.toString(), '0.125');
    assert.equal(f.state.ledger[0].ingredientId, 'ingredient');
    assert.equal(f.state.ledger[0].batchId, f.state.batches[1].id);
    assert.equal(f.locks, 1);
    await f.repository.importStock(f.state.ingredient, D('0.125'), 'manual', 'admin', 'new', future, { idempotencyKey: 'import-key' });
    assert.equal(f.state.ledger.length, 1);
    assert.equal(f.state.ingredient.quantity.toString(), '10.125');
    await assert.rejects(f.repository.importStock(f.state.ingredient, D('0.25'), 'manual', 'admin', 'new', future, { idempotencyKey: 'import-key' }), { statusCode: 409 });
});

test('duplicate batch and GoodsReceipt batch cannot be imported again', async () => {
    const f = fixture(); f.state.batches[0].goodsReceiptId = 'purchase-receipt';
    await assert.rejects(f.repository.importStock(f.state.ingredient, 1, null, 'admin', 'existing', future), { statusCode: 409 });
    assert.equal(f.state.ledger.length, 0); assert.equal(f.state.ingredient.quantity.toString(), '10');
});

test('import rollback on ledger failure leaves no stock or batch mutation', async () => {
    const f = fixture(); f.failLedger();
    await assert.rejects(f.repository.importStock(f.state.ingredient, 1, null, 'admin', 'new', future), /ledger write failed/);
    assert.equal(f.state.ingredient.quantity.toString(), '10'); assert.equal(f.state.batches.length, 1);
});

test('adjustment protects reserved total and selected batch, no negative balance', async () => {
    const f = fixture();
    await assert.rejects(f.repository.adjustStock(f.state.ingredient, -8.001, null, 'admin', 'batch'));
    await assert.rejects(f.repository.adjustStock(f.state.ingredient, -11, null, 'admin', 'batch'));
    await assert.rejects(f.repository.adjustStock(f.state.ingredient, -1, null, 'admin', 'foreign'), { statusCode: 400 });
    assert.equal(f.state.ingredient.quantity.toString(), '10'); assert.equal(f.state.ledger.length, 0);
});

test('fractional adjustment and replay key do not subtract twice', async () => {
    const f = fixture();
    await f.repository.adjustStock(f.state.ingredient, -0.125, null, 'admin', 'batch', 'adjust-key');
    await f.repository.adjustStock(f.state.ingredient, -0.125, null, 'admin', 'batch', 'adjust-key');
    assert.equal(f.state.ingredient.quantity.toString(), '9.875');
    assert.equal(f.state.batches[0].quantityRemaining.toString(), '9.875');
    assert.equal(f.state.ledger.length, 1);
    await assert.rejects(f.repository.adjustStock(f.state.ingredient, -0.25, null, 'admin', 'batch', 'adjust-key'), { statusCode: 409 });
});

test('expired, untracked and aggregate-drift stock mutations stop before writes', async () => {
    const f = fixture(); f.state.batches[0].expirationDate = new Date('2020-01-01');
    await assert.rejects(f.repository.adjustStock(f.state.ingredient, 1, null, 'admin', 'batch'), { statusCode: 409 });
    f.drift();
    await assert.rejects(f.repository.importStock(f.state.ingredient, 1, null, 'admin', 'new', future), { statusCode: 409 });
    assert.equal(f.state.ledger.length, 0);
});

test('adjustment rolls back batch and aggregate when ledger fails', async () => {
    const f = fixture(); f.failLedger();
    await assert.rejects(f.repository.adjustStock(f.state.ingredient, -1, null, 'admin', 'batch'), /ledger write failed/);
    assert.equal(f.state.ingredient.quantity.toString(), '10'); assert.equal(f.state.batches[0].quantityRemaining.toString(), '10');
});

test('DTO numeric compatibility aliases Ingredient ID and excludes expired/reserved stock', async () => {
    const f = fixture();
    const dto = await f.service.getInventoryById('ingredient');
    assert.equal(dto.productId, 'ingredient'); assert.equal(dto.inventoryId, dto.ingredientId);
    assert.equal(dto.quantity, 10); assert.equal(dto.reservedStock, 2); assert.equal(dto.sellableQuantity, 8);
    assert.equal(dto.categoryName, ''); assert.equal(dto.batches[0].quantity, 10);
    f.state.batches[0].expirationDate = new Date('2020-01-01');
    assert.equal((await f.service.getInventoryById('ingredient')).sellableQuantity, 0);
});

test('supplier conversion preserves fractional base quantity and scopes Agent by selling Product ID', async () => {
    const f = fixture();
    const result = await f.service.importInventory({ inventoryId: 'ingredient', supplierIngredientId: 'link', purchaseQuantity: 0.5, batchCode: 'converted', expirationDate: future }, 'admin');
    assert.equal(result.convertedQuantity, 1.25); assert.equal(result.stockAfter, 11.25);
    assert.equal(f.state.batches[1].receivedQty.toString(), '0.5'); assert.equal(f.state.batches[1].receivedUnit, 'bottle');
    assert.equal(f.state.batches[1].unitCost.toString(), '0.3');
    await new Promise(resolve => setImmediate(resolve));
    assert.deepEqual(f.effects.find(e => e.scan).scan.productIds, ['selling-product']);
    assert.equal(f.effects.find(e => e.audit).audit.input.ingredientId, 'ingredient');
});

test('supplier dimension, activity and unrepresentable conversion are rejected', async () => {
    for (const change of [{ conversionTargetUnit: 'g' }, { supplier: { status: 'INACTIVE', deletedAt: null } }, { conversionQuantity: D('0.001') }]) {
        const f = fixture(); Object.assign(f.link, change);
        await assert.rejects(f.service.importInventory({ inventoryId: 'ingredient', supplierIngredientId: 'link', purchaseQuantity: 0.125, batchCode: 'converted', expirationDate: future }, 'admin'));
        assert.equal(f.state.ledger.length, 0);
    }
});

test('threshold supports decimal and zero, rejects overflow and fractional pieces', async () => {
    const f = fixture();
    await f.repository.updateThreshold(f.state.ingredient, 0.125); assert.equal(f.state.ingredient.minThreshold.toString(), '0.125');
    await f.repository.updateThreshold(f.state.ingredient, 0); assert.equal(f.state.ingredient.minThreshold.toString(), '0');
    await assert.rejects(f.repository.updateThreshold(f.state.ingredient, 100000000000));
    const pieces = fixture({ baseUnit: 'piece' });
    await assert.rejects(pieces.repository.updateThreshold(pieces.state.ingredient, 0.125));
});

test('controller preserves response envelope and numeric ingredient aliases; missing user cannot mutate', async () => {
    const f = fixture();
    const response = { type(value) { this.mime = value; return this; }, status(code) { this.code = code; return this; }, json(body) { this.body = body; return this; } };
    await f.controller.findInventory({ params: { id: 'ingredient' } }, response);
    assert.equal(response.code, 200); assert.equal(response.body.success, true);
    assert.equal(response.body.data.inventory.inventoryId, 'ingredient');
    assert.equal(response.body.data.inventory.ingredientId, 'ingredient');
    assert.equal(typeof response.body.data.inventory.quantity, 'number');
    await f.controller.importStock({ body: {} }, response);
    assert.equal(response.code, 401); assert.equal(response.body.success, false);
    assert.equal(f.state.ledger.length, 0);
});
