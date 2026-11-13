const test = require('node:test');
const assert = require('node:assert/strict');
const { Prisma } = require('@prisma/client');
const { sourceLoader } = require('./repair-source-loader.cjs');
const D = x => new Prisma.Decimal(x);
const product = id => ({ id, name: id, recipes: [{ id: 'r-' + id, productId: id, isActive: true, effectiveFrom: new Date('2020-01-01'), effectiveTo: null,
    version: 1, yieldQuantity: D(1), ingredients: [{ ingredientId: 'shared', quantity: D(60), quantityBase: D(60), unit: 'ml', ingredient: {
        id: 'shared', isActive: true, deletedAt: null, baseUnit: 'ml', quantity: D(200), reserved: D(0),
        batches: [{ quantityRemaining: D(100), expirationDate: new Date('2099-01-01'), receivedAt: new Date('2020-01-01') },
            { quantityRemaining: D(100), expirationDate: new Date('2020-01-01'), receivedAt: new Date('2019-01-01') }] } }] }] });

test('Simulation preview reads recipe quantities without stock/Agent/purchase writes; real mutation and restore BLOCKED', async () => {
    const service = sourceLoader({ product: { findMany: async () => [product('coffee')] } })('modules/simulate-sale/simulate-sale.service.ts').simulateSaleService;
    const result = await service.run({ isPreview: true, productId: 'coffee', quantity: 1 }, 'admin');
    assert.equal(result.isPreview, true); assert.equal(result.inventoryUnchanged, true); assert.equal(result.affectedProducts[0].transactionId, null);
    assert.equal(result.affectedProducts[0].ingredientConsumption[0].quantityBase, '60'); assert.deepEqual(result.createdPurchaseRequests, []);
    await assert.rejects(service.run({ productId: 'coffee', quantity: 1 }, 'admin'), { code: 'SIMULATION_WRITE_BLOCKED' });
    await assert.rejects(service.restore('old', 'admin'), { code: 'SIMULATION_RESTORE_BLOCKED' });
});
test('Simulation aggregates shared ingredients and excludes expired batches across products', async () => {
    const service = sourceLoader({ product: { findMany: async () => [product('coffee'), product('tea')] } })('modules/simulate-sale/simulate-sale.service.ts').simulateSaleService;
    await assert.rejects(service.run({ isPreview: true, items: [{ productId: 'coffee', quantity: 1 }, { productId: 'tea', quantity: 1 }] }, 'admin'), /dùng chung/);
});

test('Simulation projects remaining capacity after all shared-ingredient demands, without changing real balances', async () => {
    const products = [product('coffee'), product('tea')];
    for (const p of products) { const i = p.recipes[0].ingredients[0].ingredient; i.quantity = D(300); i.batches[0].quantityRemaining = D(200); }
    const service = sourceLoader({ product: { findMany: async () => products } })('modules/simulate-sale/simulate-sale.service.ts').simulateSaleService;
    const result = await service.run({ isPreview: true, items: [{ productId: 'coffee', quantity: 1 }, { productId: 'tea', quantity: 1 }] }, 'admin');
    assert.deepEqual(result.affectedProducts.map(p => p.stockAfter), [1, 1]);
    assert.equal(products[0].recipes[0].ingredients[0].ingredient.quantity.toString(), '300');
});
test('Agent fallback writes atomic Execution + ToolCall audit, preserves references and redacts raw service error', async () => {
    let saved;
    const service = sourceLoader({ agentExecution: { create: async ({ data }) => { saved = data; return { id: 'execution', ...data,
        startedAt: new Date(), fallbackUsed: false, toolCalls: [data.toolCalls.create], purchaseRequests: [], triggeredByUser: null }; } } })('modules/agent/agent-failure-log.service.ts').agentFailureLogService;
    const result = await service.createServiceUnavailableLog({ productIds: ['coffee'], sourceType: 'ORDER', sourceId: 'order-1' }, Error('timeout https://user:secret@host'), 'admin');
    assert.equal(saved.status, 'FAILED'); assert.equal(saved.toolCalls.create.status, 'FAILED'); assert.equal(saved.triggeredBy, 'admin');
    assert.equal(result.referenceId, 'order-1'); assert.equal(result.reason, 'AGENT_SERVICE_TIMEOUT');
    assert.equal(JSON.stringify(saved).includes('secret'), false);
});
test('Agent audit adapter preserves SKIPPED outcome, JSON payload and failure/running status', () => {
    const { auditDto } = sourceLoader()('modules/agent/agent-audit.ts');
    const raw = { id: 'execution', status: 'SUCCEEDED', goal: 'SCAN', intent: 'SCAN', fallbackUsed: false, errorMessage: null,
        startedAt: new Date(), purchaseRequests: [{ id: 'pr' }], triggeredByUser: null,
        toolCalls: [{ toolName: 'SCAN', arguments: { action: 'SCAN_INVENTORY', input: { productId: 'coffee' }, reasoning: 'No action required' },
            result: { result: 'SKIPPED', output: { message: 'Stock safe', ingredientId: 'milk' } } }] };
    const dto = auditDto(raw); assert.equal(dto.result, 'SKIPPED'); assert.equal(dto.productId, 'coffee'); assert.equal(dto.ingredientId, 'milk'); assert.equal(dto.purchaseRequestId, 'pr');
    assert.equal(auditDto({ ...raw, status: 'WAITING_APPROVAL' }).status, 'RUNNING');
    assert.equal(auditDto({ ...raw, status: 'TIMEOUT' }).status, 'FAILED');
});
test('Dashboard classifies Decimal available stock and reports totals separately by base unit', async () => {
    const values = [{ id: 'milk', name: 'Milk', sku: 'MILK', quantity: D(10), reserved: D(10), minThreshold: D(2), baseUnit: 'ml' },
        { id: 'beans', name: 'Beans', sku: 'BEAN', quantity: D('0.125'), reserved: D(0), minThreshold: D(1), baseUnit: 'g' }];
    const service = sourceLoader({ ingredient: { findMany: async () => values }, product: { count: async () => 2 }, supplier: { count: async () => 1 },
        order: { count: async () => 0, findMany: async () => [] }, purchaseRequest: { count: async () => 0 },
        agentExecution: { count: async () => 0, findFirst: async () => null } })('modules/dashboard/dashboard.service.ts').dashboardService;
    const result = await service.getSummary(); assert.equal(result.inventory.totalQuantity, null);
    assert.deepEqual(result.inventory.quantitiesByUnit, [{ unit: 'ml', quantity: 10 }, { unit: 'g', quantity: 0.125 }]);
    assert.equal(result.inventory.outOfStockCount, 1); assert.equal(result.inventory.lowStockCount, 1);
    const low = await service.getLowStock(); assert.equal(low[0].ingredientId, 'milk'); assert.equal(low[0].availableStock, 0);
});
test('Email preview uses ingredient/base quantity and refuses unapproved requests; no SMTP send', async () => {
    let sends = 0;
    const request = { id: 'pr', status: 'APPROVED', supplier: { email: 'supplier@example.test', name: 'Supplier', ingredients: [] }, retryCount: 0,
        items: [{ id: 'item', quantity: 10, unitPrice: D(2), notes: null, ingredient: { name: 'Milk', baseUnit: 'ml', quantity: D(10), minThreshold: D(3) } }] };
    const loader = sourceLoader({ purchaseRequest: { findUnique: async () => request }, systemSetting: { findUnique: async () => null } }, {
        nodemailer: { createTransport: () => ({ sendMail: async () => { sends++; } }) },
        '../agent/agent.client': { createAgentLogViaAgentService: async () => ({}) }
    });
    const email = loader('modules/email/email.service.ts').emailService;
    email.getSmtpConfig = async () => { throw Error('No SMTP in test'); };
    const preview = await email.getPreview('pr'); assert.match(preview.body, /Milk: 10 ml/); assert.equal(preview.canSend, false); assert.equal(sends, 0);
    request.status = 'PENDING'; await assert.rejects(email.getPreview('pr')); assert.equal(sends, 0);
});

test('Explicit email send uses injected SMTP only; audit failure after success does not mark delivery failed', async () => {
    let sends = 0, failures = 0;
    const request = { id: 'pr', status: 'APPROVED', retryCount: 0, supplier: { status: 'ACTIVE' }, items: [{ ingredient: { isActive: true, deletedAt: null } }] };
    const email = sourceLoader({ purchaseRequest: { findUnique: async () => request, update: async ({ data }) => {
        if (data.retryCount) failures++; Object.assign(request, data); return request;
    } } }, { nodemailer: { createTransport: () => ({ sendMail: async () => { sends++; } }) },
        '../agent/agent.client': { createAgentLogViaAgentService: async () => { throw Error('audit offline'); } }
    })('modules/email/email.service.ts').emailService;
    email.getSmtpConfig = async () => ({ host: 'stub', port: 587, user: 'stub', pass: 'stub', from: 'stub@example.test' });
    const result = await email.sendEmail('pr', 'Approved order', '10 ml milk', 'admin', 'supplier@example.test');
    assert.equal(result.status, 'SENT'); assert.equal(sends, 1); assert.equal(failures, 0);
});
