const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const Module = require('node:module');
const ts = require('typescript');
const oldTs = Module._extensions['.ts'];
const oldLoad = Module._load;
Module._extensions['.ts'] = (mod, file) => mod._compile(ts.transpileModule(fs.readFileSync(file, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
}).outputText, file);
Module._load = function (name, parent, main) {
    if (['@cafe-project/database', 'nodemailer', '@google/generative-ai'].includes(name)) throw Error('Infrastructure forbidden');
    if (name === '@cafe-project/agent/workflows') return require('../../agent/src/workflows/agent-workflow.ts');
    return oldLoad.call(this, name, parent, main);
};
after(() => { Module._load = oldLoad; if (oldTs) Module._extensions['.ts'] = oldTs; else delete Module._extensions['.ts']; });
const shared = require('../../agent/src/workflows/agent-workflow.ts');
const { TOOL_CONTRACTS, createToolRegistry, ToolError, AgentWorkflow, MockAgentRepository, MockLLMProvider } = shared;
const { createBackendWorkflows } = require('../src/workflows/index.ts');
const { BusinessWorkflows } = require('../src/workflows/business-service.ts');
const { MockRepository, deterministicFixtures } = require('../src/workflows/mock-repository.ts');
const { bindMockTools } = require('../src/workflows/tool-mock-services.ts');
const clock = () => new Date('2026-11-16T00:00:00Z');
const actor = 'admin';

function evaluate(file, deps) {
    const exports = {};
    vm.runInNewContext(ts.transpileModule(fs.readFileSync(path.join(__dirname, '../src', file), 'utf8'), {
        compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
    }).outputText, { exports, require: name => { if (!(name in deps)) throw Error(`Unexpected dependency ${name}`); return deps[name]; } });
    return exports;
}

test('P1.5 one catalog object exported by API and Agent; explicit metadata and bindings', () => {
    assert.equal(require('../src/workflows/tool-contracts.ts').TOOL_CONTRACTS, TOOL_CONTRACTS);
    assert.equal(require('../src/workflows/tool-adapter.ts').createToolRegistry, createToolRegistry);
    for (const [name, c] of Object.entries(TOOL_CONTRACTS)) {
        assert.equal(c.name, name); assert.equal(c.version, '1.0.0');
        assert.equal(c.policy.timeoutMs, 5000); assert.equal(c.policy.attempts, 1);
        assert.ok(Object.isFrozen(c)); assert.ok(c.errors.includes('TIMEOUT'));
    }
    assert.equal(Object.keys(shared.TOOL_REGISTRY).length, 7); // Legacy steps unchanged, no false aliases.
});

test('P1.5 actual AgentWorkflow dispatches dynamic mock names, preserves Agent/business state', async () => {
    const repository = new MockRepository();
    const business = bindMockTools(new BusinessWorkflows(repository, clock));
    const store = new MockAgentRepository();
    const agent = new AgentWorkflow(store, business, { plan: async () => { throw Error('Planner must not run'); } });
    const beforeAgent = store.snapshot(), beforeBusiness = repository.snapshot();
    for (const [name, input] of [
        ['getIngredientAvailability', { ingredientId: 'beans' }], ['getIngredientBatches', { ingredientId: 'beans' }],
        ['getRecipeRequirements', { productId: 'coffee' }],
    ]) {
        const result = await agent.dispatchTool(actor, name, input);
        assert.equal(result.ok, true); assert.equal(result.evidence.tool, name);
        assert.equal(result.evidence.mode, 'MOCK'); assert.equal(result.evidence.durable, false);
        assert.equal(result.evidence.validated, true); assert.equal(result.evidence.attempts, 1);
        assert.equal(TOOL_CONTRACTS[name].output.safeParse(result.output).success, true);
    }
    assert.deepEqual(store.snapshot(), beforeAgent); assert.deepEqual(repository.snapshot(), beforeBusiness);
    assert.equal(business.toolRegistry.capabilities().filter(c => c.bound).length, 3);
    assert.equal(createBackendWorkflows({ DATA_PROVIDER: 'mock' }, clock).toolRegistry.capabilities().filter(c => c.bound).length, 3);
});

test('P1.5 dynamic unknown/version/invalid/unbound/WRITE cases fail closed with evidence', async () => {
    const registry = createBackendWorkflows({ DATA_PROVIDER: 'mock' }, clock).toolRegistry;
    const cases = [
        ['constructor', {}, undefined, 'UNKNOWN_TOOL'], ['__proto__', {}, undefined, 'UNKNOWN_TOOL'],
        ['getIngredientAvailability', { ingredientId: 'beans' }, '99', 'VERSION_MISMATCH'],
        ['getIngredientAvailability', { ingredientId: 'beans', actorId: 'admin' }, undefined, 'INVALID_INPUT'],
        ['findIngredientSuppliers', { ingredientId: 'beans' }, undefined, 'BLOCKED'],
        ['calculateReorderQuantity', { ingredientId: 'beans' }, undefined, 'BLOCKED'],
        ['getSalesHistory', { productId: 'coffee', from: '2026-01-01T00:00:00Z', to: '2026-01-02T00:00:00Z' }, undefined, 'BLOCKED'],
        ['createDraftPurchaseRequest', { supplierId: 's', idempotencyKey: 'k', approvalId: 'a', proposalHash: 'a'.repeat(64),
            sourceVersions: { beans: '1' }, expiresAt: '2026-12-01T00:00:00Z', lines: [{ ingredientId: 'beans', quantityBase: '0.001' }] }, undefined, 'BLOCKED'],
    ];
    for (const [name, input, version, code] of cases) {
        const result = await registry.dispatch(actor, name, input, version);
        assert.equal(result.ok, false); assert.equal(result.error, code);
        assert.equal(result.evidence.status, 'FAILED'); assert.equal(result.evidence.attempts, 0);
    }
    assert.equal(TOOL_CONTRACTS.createDraftPurchaseRequest.output.safeParse({ requestId: 'p', status: 'PENDING' }).success, true);
    assert.equal(TOOL_CONTRACTS.createDraftPurchaseRequest.output.safeParse({ requestId: 'p', status: 'DRAFT' }).success, false);
});

test('P1.5 permission gates and concurrent actor contexts never share identity', async () => {
    const business = createBackendWorkflows({ DATA_PROVIDER: 'mock' }, clock);
    const agent = new AgentWorkflow(new MockAgentRepository(), business, new MockLLMProvider());
    const results = await Promise.all(['admin', 'staff', 'customer', 'agent'].map(id => business.toolRegistry.dispatch(id, 'getIngredientAvailability', { ingredientId: 'beans' })));
    assert.deepEqual(results.map(r => r.ok), [true, true, false, false]);
    assert.equal(results[2].error, 'FORBIDDEN'); assert.equal(results[2].evidence.actorId, 'customer');
    assert.equal((await agent.dispatchTool('customer', 'getIngredientAvailability', { ingredientId: 'beans' })).error, 'FORBIDDEN');
    const unbound = new AgentWorkflow(new MockAgentRepository(), new BusinessWorkflows(new MockRepository(), clock), new MockLLMProvider());
    await assert.rejects(unbound.dispatchTool(actor, 'getIngredientAvailability', { ingredientId: 'beans' }), /TOOL_REGISTRY_NOT_BOUND/);
});

test('P1.5 aggregate vs usable policy: expired/unknown excluded, reservations subtracted by existing business service', async () => {
    const seed = deterministicFixtures();
    seed.lots.early.remaining = '20'; seed.lots.early.reserved = '5';
    seed.lots.late.expirationDate = new Date('2026-01-01Z');
    seed.lots.unknown = { ...seed.lots.late, id: 'unknown', remaining: '10', expirationDate: null };
    const business = bindMockTools(new BusinessWorkflows(new MockRepository(seed), clock));
    const aggregate = await business.toolRegistry.dispatch(actor, 'getIngredientAvailability', { ingredientId: 'beans' });
    assert.equal(aggregate.output.available, 125);
    const recommendation = (await business.recommendInventory(actor)).find(i => i.ingredientId === 'beans');
    assert.equal(recommendation.available, '15.000');
    // Existing target-deficit policy still works; not silently redefined as canonical demand policy.
    assert.equal(recommendation.recommendedBaseQuantity, '185.000');
    assert.equal((await business.toolRegistry.dispatch(actor, 'calculateReorderQuantity', { ingredientId: 'beans' })).error, 'BLOCKED');
});

test('P1.5 sales interval validation and absent timestamp evidence remain blocked', () => {
    const schema = TOOL_CONTRACTS.getSalesHistory.input;
    assert.equal(schema.safeParse({ productId: 'p', from: '2026-01-01T00:00:00Z', to: '2026-04-02T00:00:00Z' }).success, false);
    assert.equal(schema.safeParse({ productId: 'p', from: '2026-01-02T00:00:00Z', to: '2026-01-01T00:00:00Z' }).success, false);
    assert.equal(shared.BUSINESS_TOOL_POLICIES.sales.status, 'IMPLEMENTED');
    assert.equal(shared.DRAFT_PURCHASE_POLICY.enabled, false);
});

test('P1.5 workflow guard shares real 5-second deadline and failed evidence', { timeout: 15000 }, async () => {
    let authorizeCalls = 0, readCalls = 0, release;
    const registry = createToolRegistry({ authorize: async () => { authorizeCalls++; },
        availability: async () => { readCalls++; } }, 'MOCK');
    const result = await registry.dispatch(actor, 'getIngredientAvailability', { ingredientId: 'beans' }, '1.0.0',
        () => new Promise(resolve => { release = resolve; }));
    assert.equal(result.error, 'TIMEOUT'); assert.equal(result.evidence.validated, false);
    assert.equal(result.evidence.attempts, 0); assert.equal(result.evidence.status, 'FAILED');
    release(); await new Promise(resolve => setImmediate(resolve));
    assert.equal(authorizeCalls, 0); assert.equal(readCalls, 0);
});

const { Prisma } = require('@prisma/client'); // Decimal only; no PrismaClient constructed.
const { HttpError } = require('../src/common/http-error.ts');
const units = evaluate('common/unit-conversion.ts', { '@cafe-project/database': { Prisma }, './http-error': { HttpError } });
test('P1.5 supplier service filters inactive/deleted; unit checks reuse shared conversion rules', async () => {
    let baseUnit = 'g';
    const row = { id: 'm', supplierId: 's', ingredientId: 'beans', supplier: { name: 'S', status: 'ACTIVE', deletedAt: null },
        ingredient: { name: 'Beans', sku: 'B', baseUnit: 'g' }, purchaseUnit: 'kg', conversionQuantity: new Prisma.Decimal(1000),
        conversionTargetUnit: 'g', pricePerBaseUnit: new Prisma.Decimal('0.1234') };
    let rows = [row, { ...row, supplier: { ...row.supplier, status: 'INACTIVE' } }, { ...row, supplier: { ...row.supplier, deletedAt: new Date() } }];
    const { supplierService } = evaluate('modules/supplier/supplier.service.ts', {
        '@cafe-project/database': { Prisma }, '../../common/http-error': { HttpError }, '../../common/unit-conversion': units,
        './supplier.repository': { supplierRepository: { findActiveIngredientById: async () => ({ baseUnit }), findSupplierIngredientsByIngredient: async () => rows } },
    });
    assert.equal((await supplierService.findIngredientSuppliers('beans')).length, 1);
    for (const change of [{ conversionQuantity: 0 }, { conversionQuantity: 999 }, { pricePerBaseUnit: null },
        { conversionTargetUnit: 'ml' }, { purchaseUnit: 'liter' }, { ingredientId: 'other' }]) {
        rows = [{ ...row, ...change }];
        await assert.rejects(supplierService.findIngredientSuppliers('beans'));
    }
    rows = [{ ...row, purchaseUnit: 'bag' }];
    assert.equal((await supplierService.findIngredientSuppliers('beans'))[0].conversionQuantity, 1000);
    baseUnit = 'piece'; rows = [{ ...row, purchaseUnit: 'bag', conversionTargetUnit: 'piece', conversionQuantity: 1.5 }];
    await assert.rejects(supplierService.findIngredientSuppliers('beans'));
});

test('P1.5 backend factory and AgentWorkflow use same dynamic registry for five wired handlers (injected services)', async () => {
    const { estimateBasePurchaseCost } = evaluate('common/ingredient-cost.utils.ts', {
        '@cafe-project/database': { Prisma }, './http-error': { HttpError }, './unit-conversion': units,
    });
    let role = 'ADMIN';
    const { createBackendToolRegistry } = evaluate('workflows/tool-services.ts', {
        './tool-adapter': shared, './tool-contracts': shared,
        '../modules/auth/auth.service': { getCurrentUser: async () => ({ role }) },
        '../modules/ingredient/ingredient.service': { ingredientService: { getById: async id => ({ id, baseUnit: 'g', quantity: 10, reserved: 2,
            availableQuantity: 8, isActive: true, rowVersion: 1, batches: [] }) } },
        '../modules/recipe/recipe.service': { recipeService: { getActiveByProduct: async productId => ({ id: 'r', productId, version: 1, yieldQuantity: 1, ingredients: [] }) } },
        '../modules/supplier/supplier.service': { supplierService: { findIngredientSuppliers: async ingredientId => [{ ingredientId, supplierId: 's', purchaseUnit: 'kg',
            conversionQuantity: 1000, conversionTargetUnit: 'g', pricePerBaseUnit: 0.1234 }] } },
        '../common/ingredient-cost.utils': { estimateBasePurchaseCost },
    });
    const registry = createBackendToolRegistry();
    assert.equal(registry.capabilities().filter(c => c.bound).length, 7);
    const mockBusiness = createBackendWorkflows({ DATA_PROVIDER: 'mock' }, clock);
    // Injected backend composition test only; not a complete real BusinessPort/production runtime.
    const agent = new AgentWorkflow(new MockAgentRepository(), Object.assign(mockBusiness, { toolRegistry: registry }), new MockLLMProvider());
    for (const [name, input] of [
        ['getIngredientAvailability', { ingredientId: 'beans' }], ['getIngredientBatches', { ingredientId: 'beans' }],
        ['getRecipeRequirements', { productId: 'coffee' }], ['findIngredientSuppliers', { ingredientId: 'beans' }],
        ['estimatePurchaseCost', { ingredientId: 'beans', supplierId: 's', quantityBase: '10' }],
    ]) {
        const result = await agent.dispatchTool(actor, name, input);
        assert.equal(result.ok, true); assert.equal(result.evidence.mode, 'BACKEND');
        if (name === 'estimatePurchaseCost') assert.equal(result.output.total, '1.23');
    }
    role = 'STAFF';
    assert.equal((await registry.dispatch(actor, 'findIngredientSuppliers', { ingredientId: 'beans' })).error, 'FORBIDDEN');
    role = 'CUSTOMER';
    assert.equal((await registry.dispatch(actor, 'getIngredientAvailability', { ingredientId: 'beans' })).error, 'FORBIDDEN');
});
