const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const { z } = require('zod');

// Fail closed: every dependency explicit. No database package/client or network loaded.
function load(file, deps, timers = {}) {
    const exports = {};
    const source = fs.readFileSync(path.join(__dirname, '../src', file), 'utf8');
    vm.runInNewContext(ts.transpileModule(source, { compilerOptions: {
        module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true,
    } }).outputText, { exports, setTimeout, clearTimeout, ...timers,
        require(name) { if (!(name in deps)) throw Error(`Unexpected dependency: ${name}`); return deps[name]; } });
    return exports;
}
const contracts = load('../../agent/src/workflows/tool-contracts.ts', { zod: { z } });
const { TOOL_CONTRACTS, ToolError } = contracts;
const adapterDeps = { './tool-contracts': contracts };
const { createReadToolAdapter } = load('../../agent/src/workflows/tool-registry.ts', adapterDeps);
const available = { ingredientId: 'beans', baseUnit: 'g', quantity: 10, reserved: 2, available: 8, active: true, rowVersion: 1 };
const batch = { ingredientId: 'beans', baseUnit: 'g', batches: [{ id: 'b', quantityRemaining: 10, expirationDate: null, receivedAt: '2026-01-01T00:00:00.000Z' }] };
const recipe = { recipeId: 'r', productId: 'coffee', version: 1, yieldQuantity: 2, ingredients: [{ ingredientId: 'beans', baseUnit: 'g', quantityBase: 18, optional: false }] };
const quote = { supplierId: 's', ingredientId: 'beans', purchaseUnit: 'kg', conversionQuantity: 1000, baseUnit: 'g', pricePerBaseUnit: 0.1234 };
function fixture(overrides = {}, create = createReadToolAdapter) {
    const calls = [];
    const services = { authorize: async (actor, permission) => { calls.push(['auth', actor, permission]); },
        availability: async id => { calls.push(['read', id]); return available; }, batches: async () => batch,
        recipe: async () => recipe, suppliers: async () => [quote],
        estimate: async p => ({ ...p, baseUnit: 'g', total: '1.23' }), ...overrides };
    return { tools: create(services), calls };
}
const rejects = (promise, code) => assert.rejects(promise, e => e.code === code && e.message === code);

test('P1 catalog: eight strict input/output contracts; five bound tools; writes absent', () => {
    assert.equal(Object.keys(TOOL_CONTRACTS).length, 8);
    assert.equal(Object.keys(fixture().tools).length, 5);
    for (const c of Object.values(TOOL_CONTRACTS)) {
        assert.ok(c.input && c.output && c.permission && c.service && c.purpose);
        assert.ok(['READ', 'CALCULATION', 'WRITE'].includes(c.category));
    }
    for (const name of ['getSalesHistory', 'calculateReorderQuantity', 'createDraftPurchaseRequest']) {
        assert.equal(TOOL_CONTRACTS[name].status, name === 'createDraftPurchaseRequest' ? 'BLOCKED' : 'IMPLEMENTED');
        assert.equal(fixture().tools[name], undefined);
    }
    assert.ok(Object.isFrozen(fixture().tools));
});
test('P1 contract: all supported handlers authorize and validate output', async () => {
    const { tools, calls } = fixture();
    assert.equal((await tools.getIngredientAvailability('admin', { ingredientId: 'beans' })).available, 8);
    assert.equal((await tools.getIngredientBatches('admin', { ingredientId: 'beans' })).batches.length, 1);
    assert.equal((await tools.getRecipeRequirements('admin', { productId: 'coffee' })).yieldQuantity, 2);
    assert.equal((await tools.findIngredientSuppliers('admin', { ingredientId: 'beans' }))[0].pricePerBaseUnit, 0.1234);
    assert.equal((await tools.estimatePurchaseCost('admin', { ingredientId: 'beans', supplierId: 's', quantityBase: '10' })).total, '1.23');
    assert.equal(calls.filter(c => c[0] === 'auth').length, 5);
    assert.equal(calls[0][0], 'auth');
});
test('P1 invalid input: SQL-like ID, unknown authority fields, negative/nonfinite values; no service calls', async () => {
    const { tools, calls } = fixture();
    for (const input of [null, {}, { ingredientId: 'x; DROP TABLE Ingredient' }, { ingredientId: 'beans', role: 'ADMIN' }]) {
        await rejects(tools.getIngredientAvailability('admin', input), 'INVALID_INPUT');
    }
    for (const quantityBase of ['-1', 'NaN', '1e3', '0.0001', Infinity, 12]) {
        await rejects(tools.estimatePurchaseCost('admin', { ingredientId: 'beans', supplierId: 's', quantityBase }), 'INVALID_INPUT');
    }
    assert.equal(calls.length, 0);
});
test('P1 permission denial: no read; permission rechecked on repeated call', async () => {
    let denied = false;
    const { tools, calls } = fixture({ authorize: async () => { if (denied) throw new ToolError('FORBIDDEN'); } });
    await tools.getIngredientAvailability('admin', { ingredientId: 'beans' });
    denied = true;
    await rejects(tools.getIngredientAvailability('admin', { ingredientId: 'beans' }), 'FORBIDDEN');
    await rejects(tools.getIngredientAvailability('', { ingredientId: 'beans' }), 'FORBIDDEN');
    assert.equal(calls.length, 1);
});
test('P1 every registered tool denies before business dispatch', async () => {
    const inputs = {
        getIngredientAvailability: { ingredientId: 'beans' }, getIngredientBatches: { ingredientId: 'beans' },
        getRecipeRequirements: { productId: 'coffee' }, findIngredientSuppliers: { ingredientId: 'beans' },
        estimatePurchaseCost: { ingredientId: 'beans', supplierId: 's', quantityBase: '1' },
    };
    for (const [name, input] of Object.entries(inputs)) {
        let dispatched = 0;
        const deny = async () => { throw new ToolError('FORBIDDEN'); };
        const read = async () => { dispatched++; };
        const tools = createReadToolAdapter({ authorize: deny, availability: read, batches: read, recipe: read, suppliers: read, estimate: read });
        await rejects(tools[name]('customer', input), 'FORBIDDEN');
        assert.equal(dispatched, 0);
    }
});
test('P1 invalid backend output and failures sanitized without retry', async () => {
    for (const value of [{ ...available, quantity: NaN }, { ...available, role: 'ADMIN' }, null]) {
        await rejects(fixture({ availability: async () => value }).tools.getIngredientAvailability('admin', { ingredientId: 'beans' }), 'INVALID_OUTPUT');
    }
    for (const [statusCode, code] of [[404, 'NOT_FOUND'], [403, 'FORBIDDEN'], [503, 'BACKEND_FAILURE']]) {
        let count = 0;
        const { tools } = fixture({ availability: async () => { count++; throw { statusCode, message: 'secret SQL credentials' }; } });
        await rejects(tools.getIngredientAvailability('admin', { ingredientId: 'beans' }), code);
        assert.equal(count, 1);
    }
});
test('P1 timeout during authorization never starts business read after expiry', async () => {
    const fast = load('../../agent/src/workflows/tool-registry.ts', adapterDeps, { setTimeout: fn => setTimeout(fn, 1) }).createReadToolAdapter;
    let release;
    const { tools, calls } = fixture({ authorize: () => new Promise(resolve => { release = resolve; }) }, fast);
    await rejects(tools.getIngredientAvailability('admin', { ingredientId: 'beans' }), 'TIMEOUT');
    release();
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(calls.length, 0);
});
test('P1 business read timeout bounded, no retries, late rejection handled', async () => {
    const fast = load('../../agent/src/workflows/tool-registry.ts', adapterDeps, { setTimeout: fn => setTimeout(fn, 1) }).createReadToolAdapter;
    let rejectRead;
    let calls = 0;
    const { tools } = fixture({ availability: () => { calls++; return new Promise((_, reject) => { rejectRead = reject; }); } }, fast);
    await rejects(tools.getIngredientAvailability('admin', { ingredientId: 'beans' }), 'TIMEOUT');
    rejectRead(Error('late failure'));
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(calls, 1);
});

test('P1 backend service binding: fresh role, DTO mapping, ingredient-only guard, decimal estimate', async () => {
    let role = 'ADMIN';
    let reads = 0;
    let wrongKind = false;
    const { estimateBasePurchaseCost } = load('common/ingredient-cost.utils.ts', {
        '@cafe-project/database': { Prisma: require('@prisma/client').Prisma },
        './http-error': { HttpError: class extends Error {} }, './unit-conversion': {},
    });
    const { createBackendReadTools } = load('workflows/tool-services.ts', {
        './tool-adapter': { createReadToolAdapter }, './tool-contracts': contracts,
        '../modules/auth/auth.service': { getCurrentUser: async () => ({ role }) },
        '../modules/ingredient/ingredient.service': { ingredientService: { getById: async id => {
            reads++;
            return { ...available, id, isActive: true, availableQuantity: 8, batches: [{ id: 'b', quantityRemaining: 10, expirationDate: null, receivedAt: new Date('2026-01-01') }] };
        } } },
        '../modules/recipe/recipe.service': { recipeService: { getActiveByProduct: async () => ({ ...recipe, id: 'r', ingredients: [{ ...recipe.ingredients[0], isOptional: false }] }) } },
        '../modules/supplier/supplier.service': { supplierService: { findIngredientSuppliers: async () => [{ ...quote, ingredientId: wrongKind ? undefined : 'beans', conversionTargetUnit: 'g' }] } },
        '../common/ingredient-cost.utils': { estimateBasePurchaseCost },
    });
    const tools = createBackendReadTools();
    assert.equal((await tools.getIngredientAvailability('admin', { ingredientId: 'beans' })).available, 8);
    assert.equal((await tools.getIngredientBatches('admin', { ingredientId: 'beans' })).batches[0].expirationDate, null);
    assert.equal((await tools.getRecipeRequirements('admin', { productId: 'coffee' })).ingredients[0].optional, false);
    assert.equal((await tools.estimatePurchaseCost('admin', { ingredientId: 'beans', supplierId: 's', quantityBase: '10' })).total, '1.23');
    assert.equal(estimateBasePurchaseCost('0.005', 1), '0.01');
    await rejects(tools.estimatePurchaseCost('admin', { ingredientId: 'beans', supplierId: 'missing', quantityBase: '1' }), 'NOT_FOUND');
    wrongKind = true;
    await rejects(tools.findIngredientSuppliers('admin', { ingredientId: 'beans' }), 'INVALID_OUTPUT');
    role = 'STAFF';
    const before = reads;
    await rejects(tools.findIngredientSuppliers('admin', { ingredientId: 'beans' }), 'FORBIDDEN');
    assert.equal(reads, before);
    role = 'CUSTOMER';
    await rejects(tools.getIngredientAvailability('admin', { ingredientId: 'beans' }), 'FORBIDDEN');
});
