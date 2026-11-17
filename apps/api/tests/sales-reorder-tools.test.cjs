const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const Module = require('node:module');
const ts = require('typescript');
const { Prisma } = require('@prisma/client'); // Decimal/enums only; no connection/client.
const oldTs = Module._extensions['.ts'];
const oldLoad = Module._load;
Module._extensions['.ts'] = (mod, file) => mod._compile(ts.transpileModule(fs.readFileSync(file, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
}).outputText, file);
Module._load = function (name, parent, main) {
    if (name === '@cafe-project/database' || name === 'nodemailer' || name === '@google/generative-ai') throw Error('Real infrastructure forbidden');
    if (name === '@cafe-project/agent/workflows') return require('../../agent/src/workflows/agent-workflow.ts');
    return oldLoad.call(this, name, parent, main);
};
after(() => { Module._load = oldLoad; if (oldTs) Module._extensions['.ts'] = oldTs; else delete Module._extensions['.ts']; });
const shared = require('../../agent/src/workflows/agent-workflow.ts');
function load(file, deps) {
    const exports = {};
    vm.runInNewContext(ts.transpileModule(fs.readFileSync(path.join(__dirname, '../src', file), 'utf8'), {
        compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
    }).outputText, { exports, Date, require(name) { if (!(name in deps)) throw Error(`Unexpected import ${name}`); return deps[name]; } });
    return exports;
}
const { HttpError } = load('common/http-error.ts', {});
const units = load('common/unit-conversion.ts', { '@cafe-project/database': { Prisma }, './http-error': { HttpError } });
const costs = load('common/ingredient-cost.utils.ts', { '@cafe-project/database': { Prisma }, './http-error': { HttpError }, './unit-conversion': units });
const policy = load('common/ingredient-policy.ts', {});
const reorder = load('common/ingredient-reorder.ts', { '@cafe-project/database': { Prisma }, '@cafe-project/agent/workflows': shared,
    './ingredient-policy': policy, './ingredient-cost.utils': costs, './http-error': { HttpError } });
const d = value => new Prisma.Decimal(value);
const now = new Date('2026-11-16T00:00:00Z');
const from = '2026-10-17T00:00:00.000Z', to = now.toISOString();
const sale = changes => ({ quantity: 2, committedAt: new Date('2026-11-15T12:00:00Z'), consumptionStatus: 'COMMITTED',
    order: { status: 'COMPLETED', paymentStatus: 'PAID', payments: [] }, ...changes });
function fixture() {
    const state = { rows: [sale()], exists: true, role: 'ADMIN', active: true, dbCalls: 0,
        consumption: [{ quantity: d(-300) }], settings: {},
        stock: { id: 'beans', baseUnit: 'g', isActive: true, deletedAt: null, quantity: d(100), reserved: d(20), minThreshold: d(50), rowVersion: 4,
            batches: [
                { id: 'good', quantityRemaining: d(80), expirationDate: new Date('2026-12-01Z'), receivedAt: new Date('2026-10-01Z') },
                { id: 'expired', quantityRemaining: d(10), expirationDate: new Date('2026-11-15Z'), receivedAt: new Date('2026-10-01Z') },
                { id: 'unknown', quantityRemaining: d(10), expirationDate: null, receivedAt: new Date('2026-10-01Z') },
            ] },
        suppliers: [{ id: 'link', supplierId: 's', ingredientId: 'beans', supplier: { status: 'ACTIVE', deletedAt: null, name: 'Supplier' },
            ingredient: { name: 'Beans', sku: 'B', baseUnit: 'g' }, purchaseUnit: 'bag', conversionQuantity: d(25), conversionTargetUnit: 'g',
            minOrderQuantity: 2, leadTimeDays: 0, isPreferred: true, pricePerBaseUnit: d('0.1234'), updatedAt: new Date('2026-10-01Z') }] };
    const prisma = { $transaction: async (work, options) => {
        state.dbCalls++; assert.equal(options.isolationLevel, 'RepeatableRead');
        return work({
            product: { findUnique: async () => state.exists ? { id: 'coffee' } : null },
            orderItem: { findMany: async query => {
                assert.equal(query.take, 10001); assert.equal(query.where.OR[0].committedAt.gte.toISOString(), from);
                assert.equal(query.where.OR[0].committedAt.lt.toISOString(), to); return state.rows;
            } },
            ingredient: { findUnique: async () => state.stock },
            inventoryTransaction: { findMany: async query => {
                assert.equal(query.take, 10001); assert.equal(query.where.type, 'CONSUME'); assert.equal(query.where.referenceType, 'Order');
                assert.equal(query.where.createdAt.gte.toISOString(), from); assert.equal(query.where.createdAt.lt.toISOString(), to);
                return state.consumption;
            } },
        });
    } };
    const db = { Prisma, prisma };
    const orderRepository = load('modules/order/order.repository.ts', { '@cafe-project/database': db,
        './order-submission': {},
        '../../common/http-error': { HttpError },
        '../../common/ingredient-cost.utils': costs, './shipping.service': {}, '../agent/agent.client': {}, '../payment/payment.repository': {} });
    const orderService = load('modules/order/order.service.ts', { '@cafe-project/database': db, '../../common/http-error': { HttpError },
        '../payment/payment.service': {}, './order.repository': orderRepository, '../agent/agent.client': {} });
    const ingredients = load('modules/ingredient/ingredient.repository.ts', { '@cafe-project/database': db });
    const suppliers = load('modules/supplier/supplier.service.ts', { '@cafe-project/database': db, '../../common/http-error': { HttpError },
        '../../common/unit-conversion': units, './supplier.repository': { supplierRepository: {
            findActiveIngredientById: async () => ({ id: 'beans', baseUnit: state.stock.baseUnit }),
            findSupplierIngredientsByIngredient: async () => state.suppliers,
        } } });
    const settings = load('modules/system-setting/system-setting.service.ts', { '../../common/http-error': { HttpError },
        './system-setting.repository': { systemSettingRepository: { findByKey: async key => state.settings[key] ?? null } },
        './system-setting.validator': { systemSettingKeySchema: { safeParse: key => ({ success: true, data: key }) } } });
    const ingredientService = load('modules/ingredient/ingredient.service.ts', { '@cafe-project/database': db, '../../common/http-error': { HttpError },
        '../../common/ingredient-batch-availability': load('common/ingredient-batch-availability.ts', {}),
        '../../common/ingredient-cost.utils': costs, '../../common/unit-conversion': units, '../agent/agent.client': {}, '../recipe/recipe.service': {},
        './ingredient.repository': ingredients, '../supplier/supplier.service': suppliers, '../system-setting/system-setting.service': settings,
        '../../common/ingredient-reorder': reorder });
    const binding = load('workflows/tool-services.ts', { './tool-adapter': shared, './tool-contracts': shared,
        '../modules/order/order.service': orderService,
        '../modules/ingredient/ingredient.service': { ingredientService: { ...ingredientService.ingredientService,
            calculateReorderQuantity: input => ingredientService.ingredientService.calculateReorderQuantity(input, now) } },
        '../modules/supplier/supplier.service': suppliers,
        '../modules/auth/auth.service': { getCurrentUser: async () => {
            if (!state.active) throw new HttpError(403, 'Disabled'); return { role: state.role };
        } }, '../common/ingredient-cost.utils': costs });
    const registry = binding.createBackendToolRegistry();
    const agent = new shared.AgentWorkflow(new shared.MockAgentRepository(), { toolRegistry: registry, authorize: async () => ({ role: state.role }) },
        { plan: async () => { throw Error('LLM/planner forbidden'); } });
    return { state, registry, agent, orderService, ingredientService: ingredientService.ingredientService };
}
const salesCall = f => f.agent.dispatchTool('admin', 'getSalesHistory', { productId: 'coffee', from, to });
const reorderCall = f => f.agent.dispatchTool('admin', 'calculateReorderQuantity', { ingredientId: 'beans' });

test('sales dispatch -> actual service/repository: paid/completed/committed only; cancellation/refund exclusions explicit', async () => {
    const f = fixture();
    f.state.rows.push(sale({ order: { status: 'CANCELLED', paymentStatus: 'PAID', payments: [] } }),
        sale({ order: { status: 'COMPLETED', paymentStatus: 'REFUNDED', payments: [] } }),
        sale({ order: { status: 'COMPLETED', paymentStatus: 'PAID', payments: [{ status: 'REFUNDED' }] } }),
        sale({ order: { status: 'COMPLETED', paymentStatus: 'PENDING', payments: [] } }), sale({ consumptionStatus: 'PENDING' }));
    const r = await salesCall(f);
    assert.equal(r.ok, true); assert.equal(r.output.soldQuantity, 2); assert.equal(r.output.excludedCancelledQuantity, 2);
    assert.equal(r.output.excludedRefundedQuantity, 4); assert.equal(r.output.excludedUnpaidQuantity, 2);
    assert.equal(r.output.excludedUncommittedQuantity, 2); assert.equal(r.evidence.mode, 'BACKEND');
});
test('sales half-open committedAt range, missing timestamps not synthesized, empty and missing product distinguished', async () => {
    const f = fixture();
    f.state.rows = [sale({ committedAt: new Date(from) }), sale({ committedAt: new Date(to) }), sale({ committedAt: null })];
    let r = await salesCall(f);
    assert.equal(r.output.soldQuantity, 2); assert.equal(r.output.complete, false); assert.equal(r.output.missingCommittedAtItems, 1);
    f.state.rows = []; r = await salesCall(f); assert.equal(r.output.soldQuantity, 0); assert.equal(r.output.complete, true);
    f.state.exists = false; assert.equal((await salesCall(f)).error, 'NOT_FOUND');
});
test('sales invalid range/authority input denied before repository; invalid quantity/read cap blocks only tool call', async () => {
    const f = fixture();
    assert.equal((await f.registry.dispatch('admin', 'getSalesHistory', { productId: 'coffee', from: to, to: from })).error, 'INVALID_INPUT');
    assert.equal((await f.registry.dispatch('admin', 'getSalesHistory', { productId: 'coffee', from, to, actorId: 'admin' })).error, 'INVALID_INPUT');
    assert.equal(f.state.dbCalls, 0);
    f.state.rows = [sale({ quantity: 0 })]; assert.equal((await salesCall(f)).error, 'BLOCKED');
    f.state.rows = Array(10001).fill(sale()); assert.equal((await salesCall(f)).error, 'BLOCKED');
    assert.equal((await reorderCall(f)).ok, true);
});
test('reorder dispatch -> backend services/repos: expiry, all reservations, observed demand, zero lead time, pack/MOQ and exact cost', async () => {
    const r = await reorderCall(fixture());
    assert.equal(r.ok, true); const o = r.output;
    assert.equal(o.aggregateAvailable, 80); assert.equal(o.eligibleStock, 80); assert.equal(o.usableStock, 60);
    assert.equal(o.unknownExpiryStock, 10); assert.equal(o.observedConsumption, 300); assert.equal(o.dailyConsumption, 10);
    assert.equal(o.targetStock, 90); assert.equal(o.leadTimeDays, 0); assert.equal(o.packs, 2); assert.equal(o.quantity, 50);
    assert.equal(o.demandRecords, 1); assert.equal(o.demandBasis, 'OBSERVED_ORDER_CONSUME');
    assert.equal(o.estimatedCost, '6.17'); assert.equal(o.settingsSource, 'DEFAULT_POLICY');
});
test('reorder no forced purchase when stock sufficient; no synthetic demand for empty ledger', async () => {
    const f = fixture(); f.state.consumption = [];
    let r = await reorderCall(f); assert.equal(r.output.quantity, 0); assert.equal(r.output.packs, 0); assert.equal(r.output.observedConsumption, 0);
    f.state.stock.minThreshold = d(0); f.state.stock.reserved = d(100);
    r = await reorderCall(f); assert.equal(r.output.usableStock, 0); assert.equal(r.output.quantity, 0);
});
test('reorder stored CUSTOM policy honored; LLM target and quantities rejected', async () => {
    const f = fixture();
    f.state.settings['inventory.reorderPlanningPeriod'] = { value: 'CUSTOM', updatedAt: now };
    f.state.settings['inventory.reorderPlanningCustomDays'] = { value: '14', updatedAt: now };
    let r = await reorderCall(f); assert.equal(r.output.planningDays, 14); assert.equal(r.output.targetStock, 160); assert.equal(r.output.quantity, 100);
    assert.equal(r.output.settingsSource, 'DATABASE');
    for (const extra of [{ targetStock: 1 }, { quantity: 1 }, { leadTimeDays: 0 }]) {
        r = await f.registry.dispatch('admin', 'calculateReorderQuantity', { ingredientId: 'beans', ...extra }); assert.equal(r.error, 'INVALID_INPUT');
    }
    f.state.settings['inventory.reorderPlanningCustomDays'].value = '0'; assert.equal((await reorderCall(f)).error, 'BLOCKED');
});
test('reorder fractional base-unit packs remain exact; expiry instant and future receipts excluded', async () => {
    const f = fixture(); f.state.consumption = []; f.state.stock.reserved = d(0); f.state.stock.minThreshold = d('100.25');
    f.state.suppliers[0].conversionQuantity = d('0.125'); f.state.suppliers[0].minOrderQuantity = 1;
    let r = await reorderCall(f); assert.equal(r.output.quantity, 20.25); assert.equal(r.output.packs, 162);
    f.state.stock.batches[0].expirationDate = now;
    r = await reorderCall(f); assert.equal(r.output.eligibleStock, 0); assert.equal(r.output.quantity, 100.25);
    f.state.stock.batches[0].expirationDate = new Date('2026-12-01Z'); f.state.stock.batches[0].receivedAt = new Date('2026-12-01Z');
    r = await reorderCall(f); assert.equal(r.output.eligibleStock, 0);
});
test('reorder missing/deleted supplier and inconsistent stock/invalid ledger blocked; no write path', async () => {
    for (const mutate of [
        f => { f.state.suppliers = []; }, f => { f.state.suppliers[0].supplier.deletedAt = now; },
        f => { f.state.stock.quantity = d(101); }, f => { f.state.stock.reserved = d(101); },
        f => { f.state.consumption = [{ quantity: d(1) }]; }, f => { f.state.consumption = Array(10001).fill({ quantity: d(-1) }); },
        f => { f.state.suppliers[0].leadTimeDays = null; },
    ]) { const f = fixture(); mutate(f); assert.equal((await reorderCall(f)).error, 'BLOCKED'); }
    const f = fixture();
    const input = { supplierId: 's', idempotencyKey: 'k', approvalId: 'a', proposalHash: 'a'.repeat(64), sourceVersions: { beans: '4' }, expiresAt: to,
        lines: [{ ingredientId: 'beans', quantityBase: '1' }] };
    assert.equal((await f.registry.dispatch('admin', 'createDraftPurchaseRequest', input)).error, 'BLOCKED');
});
test('planning permissions current role/active status: STAFF reads sales, ADMIN plans purchase; denial performs no reads', async () => {
    const f = fixture(); f.state.role = 'STAFF';
    assert.equal((await salesCall(f)).ok, true); const before = f.state.dbCalls;
    assert.equal((await reorderCall(f)).error, 'FORBIDDEN'); assert.equal(f.state.dbCalls, before);
    f.state.active = false; assert.equal((await salesCall(f)).error, 'FORBIDDEN'); assert.equal(f.state.dbCalls, before);
});
