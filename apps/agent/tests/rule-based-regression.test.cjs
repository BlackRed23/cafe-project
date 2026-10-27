const assert = require('node:assert/strict');
const { test } = require('node:test');
const fs = require('node:fs');
const Module = require('node:module');
const ts = require('typescript');

Module._extensions['.ts'] = (mod, file) => mod._compile(ts.transpileModule(fs.readFileSync(file, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true }
}).outputText, file);
const logs = [];
let geminiCalls = 0;
const inventory = { id: 'inventory', productId: 'p', quantity: 0, reservedStock: 0, minThreshold: 2, unit: 'kg',
    product: { id: 'p', name: 'Coffee', sku: 'COFFEE', supplierProducts: [
        { supplierId: 's', price: 10, leadTimeDays: 2, minOrderQuantity: 1, supplier: { name: 'Supplier', status: 'ACTIVE', deletedAt: null } }
    ] } };
const repository = {
    findInventories: async () => [inventory],
    getSalesData: async () => ({ salesVelocity7d: 1, salesVelocity30d: 1 }),
    hasOpenPurchaseRequest: async () => false,
    getSettingValue: async () => null,
    createLog: async data => { logs.push(data); return { id: 'log', ...data }; }
};
const originalLoad = Module._load;
Module._load = function (request, parent, main) {
    if (request === '../repositories/agent.repository') return { agentRepository: repository };
    if (request === './gemini.service') return { geminiService: { getRecommendation: async () => { geminiCalls++; throw new Error('mock provider unavailable'); } } };
    return originalLoad.call(this, request, parent, main);
};
const { recommendationService } = require('../src/services/recommendation.service.ts');
Module._load = originalLoad;

test('real recommendation service produces traceable rule-based results without external services', async () => {
    process.env.AGENT_RECOMMENDATION_MODE = 'rule-based';
    const result = await recommendationService.generateForProduct('p', false, 'admin');
    assert.equal(result.skipped, false);
    assert.equal(result.recommendation.fallbackUsed, true);
    assert.equal(result.recommendation.recommendedSupplierId, 's');
    assert.ok(result.recommendation.recommendedQuantity > 0);
    assert.deepEqual(logs[0].creator, { connect: { id: 'admin' } });
    assert.equal(logs[0].action, 'RECOMMEND_REORDER');
    assert.equal(geminiCalls, 0);
});

test('mock Gemini failure falls back to rules and preserves actor in audit', async () => {
    process.env.AGENT_RECOMMENDATION_MODE = 'gemini';
    process.env.GEMINI_API_KEY = 'mock-only';
    const result = await recommendationService.generateForProduct('p', false, 'admin');
    assert.equal(geminiCalls, 1);
    assert.equal(result.recommendation.fallbackUsed, true);
    assert.deepEqual(logs[1].creator, { connect: { id: 'admin' } });
    assert.equal(logs[1].error_message, 'mock provider unavailable');
});
