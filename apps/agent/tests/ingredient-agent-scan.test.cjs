const assert = require('node:assert/strict');
const { test } = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const ts = require('typescript');

Module._extensions['.ts'] = (mod, file) =>
    mod._compile(
        ts.transpileModule(fs.readFileSync(file, 'utf8'), {
            compilerOptions: {
                module: ts.ModuleKind.CommonJS,
                target: ts.ScriptTarget.ES2022,
                esModuleInterop: true
            }
        }).outputText,
        file
    );

process.env.AGENT_INTERNAL_TOKEN = require('node:crypto').randomBytes(32).toString('base64url');

const users = {
    admin: { id: 'admin', role: 'ADMIN', isActive: true },
    staff: { id: 'staff', role: 'STAFF', isActive: true }
};

let logs = [];
let openPrIngredientIds = new Set();
let createdPrs = [];
let dedupeKeysToday = new Set();
let mockIngredients = [];
let mockInventories = [];
let productRecipeIngredients = {};
let geminiBehavior = 'throw';

const dbMock = {
    prisma: {
        user: {
            findUnique: async ({ where }) => users[where.id] || null
        },
        agentLog: {
            findFirst: async ({ where }) => {
                const key = where?.output?.contains;
                return key && dedupeKeysToday.has(key) ? { id: 'existing-dedupe-log' } : null;
            }
        }
    },
    PurchaseRequestStatus: {
        PENDING: 'PENDING',
        APPROVED: 'APPROVED',
        ORDERED: 'ORDERED'
    },
    OrderStatus: {
        CANCELLED: 'CANCELLED'
    },
    InventoryTransactionType: {
        DEDUCT: 'DEDUCT',
        CONSUME: 'CONSUME',
        WASTE: 'WASTE',
        IMPORT: 'IMPORT'
    }
};

const repoMock = {
    findInventories: async () => mockInventories,
    findIngredientsForScan: async (ids) => {
        if (!ids) return mockIngredients;
        return mockIngredients.filter((ing) => ids.includes(ing.id));
    },
    findActiveIngredientIds: async () => mockIngredients.map((i) => i.id),
    findActiveProductIds: async () => [],
    resolveIngredientIdsFromProducts: async (productIds) => {
        const out = new Set();
        for (const pid of productIds || []) {
            for (const ingId of productRecipeIngredients[pid] || []) {
                out.add(ingId);
            }
        }
        return Array.from(out);
    },
    getIngredientConsumption: async () => ({
        totalConsumed7d: 700,
        totalConsumed30d: 3000,
        dailyConsumption7d: 100,
        dailyConsumption30d: 100
    }),
    getSalesData: async () => ({ salesVelocity7d: 1, salesVelocity30d: 1 }),
    getRecentSalesMetrics: async () => ({
        recentSold30d: 0,
        dailySalesVelocity: 0,
        reorderPoint: 5,
        suggestedOrderQuantity: 10
    }),
    getSettingValue: async () => 'true',
    hasLogWithDedupeKeyToday: async (dedupeKey) => dedupeKeysToday.has(dedupeKey),
    hasOpenIngredientPurchaseRequest: async (ingredientId) => openPrIngredientIds.has(ingredientId),
    findOpenIngredientPurchaseRequest: async (ingredientId) =>
        openPrIngredientIds.has(ingredientId)
            ? {
                  id: `pr-open-${ingredientId}`,
                  status: 'PENDING',
                  supplierId: 'sup-1',
                  supplier: { id: 'sup-1', name: 'NCC Nguyên Liệu A', status: 'ACTIVE', deletedAt: null }
              }
            : null,
    createAiIngredientPurchaseRequest: async (ingredient, supplierLink, neededBaseQty, reason, userId) => {
        if (!userId || users[userId]?.role !== 'ADMIN') {
            throw new Error('Forbidden');
        }
        const conv = Number(supplierLink.conversionQuantity || 1000);
        const minPacks = Math.max(1, Number(supplierLink.minOrderQuantity || 1));
        const packs = Math.max(minPacks, Math.ceil(neededBaseQty / conv));
        const pr = {
            id: `pr-${createdPrs.length + 1}`,
            requestNumber: `AI-ING-${createdPrs.length + 1}`,
            supplierId: supplierLink.supplierId,
            status: 'PENDING',
            reason,
            items: [
                {
                    ingredientId: ingredient.id,
                    quantity: packs,
                    recommendedBaseQty: neededBaseQty
                }
            ],
            supplier: supplierLink.supplier
        };
        createdPrs.push(pr);
        openPrIngredientIds.add(ingredient.id);
        return pr;
    },
    createLog: async (data) => {
        const entry = {
            id: `log-${logs.length + 1}`,
            created_at: new Date(),
            ...data
        };
        try {
            const parsedOut = data.output ? JSON.parse(data.output) : {};
            if (parsedOut.dedupeKey) {
                dedupeKeysToday.add(parsedOut.dedupeKey);
            }
        } catch {}
        logs.push(entry);
        return entry;
    },
    updateLog: async (id, data) => ({
        id,
        ...data
    })
};

const originalLoad = Module._load;
Module._load = function (request, parent, isMain) {
    if (request === '@cafe-project/database') return dbMock;
    if (request === '../repositories/agent.repository') {
        return {
            agentRepository: repoMock,
            ACTIVE_PURCHASE_REQUEST_MESSAGE: 'Sản phẩm đã có yêu cầu nhập hàng đang chờ xử lý.'
        };
    }
    if (request === './gemini.service') {
        return {
            geminiService: {
                getRecommendation: async () => {
                    if (geminiBehavior === 'invalid_supplier') {
                        return {
                            recommended_supplier_id: 'non-existent-supplier-999',
                            recommended_quantity: 5000,
                            confidence: 0.9,
                            reasoning: 'Hallucinated supplier'
                        };
                    }
                    throw new Error('Internal Gemini API key quota exceeded at https://generativelanguage.googleapis.com');
                }
            }
        };
    }
    if (request === '../utils/logger') {
        return { logger: { info() {}, warn() {}, error() {} } };
    }
    return originalLoad.call(this, request, parent, isMain);
};

const { recommendationService } = require('../src/services/recommendation.service.ts');
const { agentService } = require('../src/services/agent.service.ts');
Module._load = originalLoad;

const makeIngredient = (overrides = {}) => ({
    id: 'ing-arabica',
    sku: 'ING-COFFEE-ARABICA',
    name: 'Hạt Cà Phê Arabica Cầu Đất',
    baseUnit: 'g',
    quantity: 200,
    reserved: 50,
    minThreshold: 500,
    costPerBaseUnit: 0.35,
    isActive: true,
    deletedAt: null,
    batches: [
        {
            id: 'batch-1',
            batchCode: 'LOT-ARA-01',
            quantityRemaining: 200,
            expirationDate: new Date(Date.now() + 30 * 86400000)
        }
    ],
    supplierLinks: [
        {
            id: 'si-1',
            supplierId: 'sup-1',
            ingredientId: 'ing-arabica',
            purchaseUnit: 'kg',
            conversionQuantity: 1000,
            pricePerPurchaseUnit: 320000,
            pricePerBaseUnit: 320,
            minOrderQuantity: 2,
            leadTimeDays: 2,
            isPreferred: true,
            supplier: {
                id: 'sup-1',
                name: 'Nông Trại Cầu Đất',
                status: 'ACTIVE',
                deletedAt: null
            }
        }
    ],
    recipeItems: [
        {
            recipe: {
                isActive: true,
                product: { id: 'drk-espresso', name: 'Espresso Đơn' }
            }
        }
    ],
    ...overrides
});

const resetState = () => {
    logs = [];
    openPrIngredientIds = new Set();
    createdPrs = [];
    dedupeKeysToday = new Set();
    mockIngredients = [];
    mockInventories = [];
    productRecipeIngredients = {};
    geminiBehavior = 'throw';
    // Reset scan cooldown inside agentService by advancing Date.now if needed
};

test('Case 1: Low ingredient stock with active supplier creates PENDING PurchaseRequest with ingredientId, and second scan skips duplicate', async () => {
    resetState();
    mockIngredients = [makeIngredient()];

    const firstScan = await agentService.scanInventory(
        {
            ingredientIds: ['ing-arabica'],
            scope: 'INGREDIENT',
            triggerType: 'INGREDIENT_WASTE'
        },
        'admin'
    );

    assert.equal(firstScan.createdPurchaseRequests.length, 1);
    assert.equal(createdPrs.length, 1);
    assert.equal(createdPrs[0].status, 'PENDING');
    assert.equal(createdPrs[0].items[0].ingredientId, 'ing-arabica');
    assert.ok(createdPrs[0].items[0].quantity >= 2);

    const createLog = firstScan.results.find(
        (r) => r.action === 'SCAN_INGREDIENT_CREATE_PURCHASE_REQUEST'
    );
    assert.ok(createLog, 'Expected SCAN_INGREDIENT_CREATE_PURCHASE_REQUEST log');
    assert.equal(createLog.itemType, 'INGREDIENT');
    assert.equal(createLog.ingredientId, 'ing-arabica');
    assert.ok(createLog.reasoning.includes('Hạt Cà Phê Arabica Cầu Đất'));
    assert.ok(createLog.reasoning.includes('Espresso Đơn'));

    // Second scan on the same ingredient should skip duplicate PR creation
    const secondScan = await agentService.scanInventory(
        {
            ingredientIds: ['ing-arabica'],
            scope: 'INGREDIENT',
            triggerType: 'ORDER_COMPLETED'
        },
        'admin'
    );

    assert.equal(secondScan.createdPurchaseRequests.length, 0);
    assert.equal(createdPrs.length, 1);
    const dupLog = secondScan.results.find((r) => r.action === 'SCAN_INGREDIENT_SKIP_DUPLICATE');
    assert.ok(dupLog, 'Expected SCAN_INGREDIENT_SKIP_DUPLICATE on second scan');
    assert.equal(dupLog.reason, 'ACTIVE_PR_EXISTS');
});

test('Case 2: IngredientBatch expiring within <= 3 days logs SCAN_INGREDIENT_CRITICAL_EXPIRY and dedupes on same day', async () => {
    resetState();
    const twoDaysFromNow = new Date(Date.now() + 2 * 86400000);
    mockIngredients = [
        makeIngredient({
            id: 'ing-milk',
            sku: 'ING-MILK-FRESH',
            name: 'Sữa Tươi Thanh Trùng',
            baseUnit: 'ml',
            quantity: 10000,
            reserved: 0,
            minThreshold: 500,
            batches: [
                {
                    id: 'batch-exp-2d',
                    batchCode: 'MILK-EXP-02',
                    quantityRemaining: 2000,
                    expirationDate: twoDaysFromNow
                }
            ]
        })
    ];

    const firstScan = await agentService.scanInventory(
        {
            ingredientIds: ['ing-milk'],
            scope: 'INGREDIENT',
            triggerType: 'INGREDIENT_IMPORTED'
        },
        'admin'
    );

    const expiryLogsFirst = firstScan.results.filter(
        (r) => r.action === 'SCAN_INGREDIENT_CRITICAL_EXPIRY'
    );
    assert.equal(expiryLogsFirst.length, 1);
    assert.equal(expiryLogsFirst[0].reason, 'CRITICAL_EXPIRY');
    assert.equal(expiryLogsFirst[0].output.notification.actionUrl, '/admin/ingredients/ing-milk');

    // Second scan same day should not duplicate the expiry warning log
    const secondScan = await agentService.scanInventory(
        {
            ingredientIds: ['ing-milk'],
            scope: 'INGREDIENT',
            triggerType: 'INGREDIENT_IMPORTED'
        },
        'admin'
    );
    const expiryLogsSecond = secondScan.results.filter(
        (r) => r.action === 'SCAN_INGREDIENT_CRITICAL_EXPIRY'
    );
    assert.equal(expiryLogsSecond.length, 0);
});

test('Case 3: Low ingredient stock with no supplier or inactive supplier logs NO_SUPPLIER / SUPPLIERS_INACTIVE and creates 0 PRs', async () => {
    resetState();
    mockIngredients = [
        makeIngredient({
            id: 'ing-no-sup',
            name: 'Bột Matcha Uji',
            supplierLinks: []
        }),
        makeIngredient({
            id: 'ing-inactive-sup',
            name: 'Syrup Vanilla',
            supplierLinks: [
                {
                    id: 'si-inactive',
                    supplierId: 'sup-inactive',
                    ingredientId: 'ing-inactive-sup',
                    purchaseUnit: 'chai',
                    conversionQuantity: 750,
                    pricePerPurchaseUnit: 180000,
                    pricePerBaseUnit: 240,
                    minOrderQuantity: 1,
                    leadTimeDays: 3,
                    isPreferred: true,
                    supplier: {
                        id: 'sup-inactive',
                        name: 'NCC Đã Ngưng',
                        status: 'INACTIVE',
                        deletedAt: null
                    }
                }
            ]
        })
    ];

    const res = await agentService.scanInventory(
        {
            ingredientIds: ['ing-no-sup', 'ing-inactive-sup'],
            scope: 'INGREDIENT',
            triggerType: 'INGREDIENT_WASTE'
        },
        'admin'
    );

    assert.equal(res.createdPurchaseRequests.length, 0);
    assert.equal(createdPrs.length, 0);

    const noSupLog = res.results.find((r) => r.ingredientId === 'ing-no-sup');
    const inactiveSupLog = res.results.find((r) => r.ingredientId === 'ing-inactive-sup');

    assert.equal(noSupLog.action, 'SCAN_INGREDIENT_NO_SUPPLIER');
    assert.equal(noSupLog.reason, 'NO_SUPPLIER');
    assert.equal(inactiveSupLog.action, 'SCAN_INGREDIENT_INACTIVE_SUPPLIER');
    assert.equal(inactiveSupLog.reason, 'SUPPLIERS_INACTIVE');
});

test('Case 4: recommendationService.generateForIngredient falls back safely on Gemini invalid supplier or error without leaking provider details', async () => {
    resetState();
    mockIngredients = [makeIngredient()];
    process.env.AGENT_RECOMMENDATION_MODE = 'gemini';
    process.env.GEMINI_API_KEY = 'mock-key-for-test';

    // 4a. Gemini returns hallucinated supplier ID -> rejected by validation -> fallbackUsed = true
    geminiBehavior = 'invalid_supplier';
    const rec1 = await recommendationService.generateForIngredient('ing-arabica', true, 'admin');
    assert.equal(rec1.skipped, false);
    assert.equal(rec1.recommendation.fallbackUsed, true);
    assert.equal(rec1.recommendation.recommendedSupplierId, 'sup-1');
    assert.equal(rec1.recommendation.itemType, 'INGREDIENT');

    // 4b. Gemini throws error -> fallbackUsed = true and public output does not leak internal URL/key
    geminiBehavior = 'throw';
    const rec2 = await recommendationService.generateForIngredient('ing-arabica', true, 'admin');
    assert.equal(rec2.skipped, false);
    assert.equal(rec2.recommendation.fallbackUsed, true);
    assert.equal(rec2.recommendation.recommendedSupplierId, 'sup-1');
    assert.ok(!rec2.recommendation.reasoning.includes('generativelanguage.googleapis.com'));
});

test('Case 5: scanInventory with productIds resolves ingredientIds from active Recipe and scans those ingredients', async () => {
    resetState();
    mockIngredients = [makeIngredient()];
    productRecipeIngredients = {
        'drk-espresso': ['ing-arabica']
    };

    const res = await agentService.scanInventory(
        {
            productIds: ['drk-espresso'],
            triggerType: 'ORDER_COMPLETED',
            sourceType: 'ORDER',
            sourceId: 'ord-123'
        },
        'admin'
    );

    assert.equal(res.createdPurchaseRequests.length, 1);
    assert.equal(res.results[0].ingredientId, 'ing-arabica');
    assert.equal(createdPrs[0].items[0].ingredientId, 'ing-arabica');
});

test('Case 6: ingredientService.recordWaste triggers scanInventoryViaAgentService ONLY after $transaction commits, and 0 times on rollback', async () => {
    let agentScanCalls = [];
    let shouldFailTx = false;

    const fakeTx = {
        $queryRaw: async () => [],
        ingredientBatch: {
            update: async () => ({})
        },
        inventoryTransaction: {
            create: async () => ({})
        },
        ingredient: {
            update: async () => ({})
        }
    };

    const fakePrisma = {
        $transaction: async (fn) => {
            const out = await fn(fakeTx);
            if (shouldFailTx) {
                throw new Error('Simulated DB commit failure');
            }
            return out;
        },
        Decimal: class Decimal {
            static min(a, b) {
                return Number(a?.v ?? a) <= Number(b?.v ?? b) ? a : b;
            }
            static max(a, b) {
                return Number(a?.v ?? a) >= Number(b?.v ?? b) ? a : b;
            }
            constructor(v) {
                this.v = Number(v?.v ?? v ?? 0);
            }
            sub(other) {
                return new fakePrisma.Decimal(this.v - Number(other.v ?? other));
            }
            add(other) {
                return new fakePrisma.Decimal(this.v + Number(other.v ?? other));
            }
            mul(other) {
                return new fakePrisma.Decimal(this.v * Number(other.v ?? other));
            }
            div(other) {
                return new fakePrisma.Decimal(this.v / Number(other.v ?? other));
            }
            lt(other) {
                return this.v < Number(other.v ?? other);
            }
            lte(other) {
                return this.v <= Number(other.v ?? other);
            }
            gt(other) {
                return this.v > Number(other.v ?? other);
            }
            neg() {
                return new fakePrisma.Decimal(-this.v);
            }
            equals(other) {
                return this.v === Number(other.v ?? other);
            }
            toFixed(n) {
                return this.v.toFixed(n);
            }
            toDecimalPlaces(n) {
                return new fakePrisma.Decimal(Number(this.v.toFixed(n)));
            }
            toString() {
                return String(this.v);
            }
            valueOf() {
                return this.v;
            }
        }
    };

    const prevLoad = Module._load;
    Module._load = function (request, parent, isMain) {
        if (request === '@cafe-project/database') {
            return {
                prisma: fakePrisma,
                Prisma: { Decimal: fakePrisma.Decimal },
                InventoryTransactionType: { WASTE: 'WASTE', IMPORT: 'IMPORT' }
            };
        }
        if (request === '../agent/agent.client') {
            return {
                scanInventoryViaAgentService: async (input, userId) => {
                    agentScanCalls.push({ input, userId });
                    return { results: [] };
                }
            };
        }
        if (request === './ingredient.repository') {
            return {
                ingredientInclude: {},
                ingredientRepository: {
                    findById: async (id) => ({
                        id,
                        sku: 'ING-MILK',
                        name: 'Sữa tươi',
                        categoryId: null,
                        category: null,
                        baseUnit: 'ml',
                        costPerBaseUnit: new fakePrisma.Decimal(0.04),
                        quantity: new fakePrisma.Decimal(1000),
                        reserved: new fakePrisma.Decimal(0),
                        minThreshold: new fakePrisma.Decimal(500),
                        origin: null,
                        storageInstructions: null,
                        expiryInfo: null,
                        shelfLifeDays: 10,
                        imageUrl: null,
                        isActive: true,
                        rowVersion: 1,
                        batches: [
                            {
                                id: 'b-1',
                                batchCode: 'LOT-1',
                                quantityInitial: new fakePrisma.Decimal(1000),
                                quantityRemaining: new fakePrisma.Decimal(1000),
                                unitCost: new fakePrisma.Decimal(0.04),
                                expirationDate: new Date(Date.now() + 5 * 86400000),
                                receivedAt: new Date(),
                                supplierId: null,
                                receivedQty: new fakePrisma.Decimal(1000),
                                receivedUnit: 'ml',
                                note: null
                            }
                        ],
                        createdAt: new Date(),
                        updatedAt: new Date()
                    })
                }
            };
        }
        if (request === '../recipe/recipe.service') {
            return { recalculateCostsForIngredient: async () => [] };
        }
        return prevLoad.call(this, request, parent, isMain);
    };

    const ingredientServicePath = path.resolve(
        __dirname,
        '../../api/src/modules/ingredient/ingredient.service.ts'
    );
    delete require.cache[ingredientServicePath];
    const { ingredientService } = require(ingredientServicePath);
    Module._load = prevLoad;

    // 6a: When transaction fails/rolls back, scanInventoryViaAgentService is NOT called
    shouldFailTx = true;
    await assert.rejects(
        ingredientService.recordWaste(
            'ing-milk',
            { quantity: 200, unit: 'ml', wasteReason: 'EXPIRED', note: 'Test rollback' },
            'admin'
        ),
        /Simulated DB commit failure/
    );
    assert.equal(agentScanCalls.length, 0);

    // 6b: When transaction commits, scanInventoryViaAgentService IS called once with INGREDIENT_WASTE
    shouldFailTx = false;
    await ingredientService.recordWaste(
        'ing-milk',
        { quantity: 200, unit: 'ml', wasteReason: 'EXPIRED', note: 'Test commit' },
        'admin'
    );
    assert.equal(agentScanCalls.length, 1);
    assert.deepEqual(agentScanCalls[0].input.ingredientIds, ['ing-milk']);
    assert.equal(agentScanCalls[0].input.scope, 'INGREDIENT');
    assert.equal(agentScanCalls[0].input.triggerType, 'INGREDIENT_WASTE');
    assert.equal(agentScanCalls[0].userId, 'admin');
});
