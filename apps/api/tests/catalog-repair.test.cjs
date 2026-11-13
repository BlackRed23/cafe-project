const test = require('node:test');
const assert = require('node:assert/strict');
const { Prisma } = require('@prisma/client');
const { sourceLoader } = require('./repair-source-loader.cjs');
const D = x => new Prisma.Decimal(x);
const load = sourceLoader();
const { supplierConversion } = load('modules/supplier/supplier-conversion.ts');
const { activeRecipe, recipeNeeds, productCapacity } = load('common/recipe-stock.ts');
const recipe = () => ({ id: 'r1', productId: 'coffee', version: 2, isActive: true, effectiveFrom: new Date('2020-01-01'), effectiveTo: null,
    yieldQuantity: D(2), ingredients: [{ ingredientId: 'milk', quantity: D('0.1'), unit: 'l', quantityBase: D(100),
        ingredient: { id: 'milk', isActive: true, deletedAt: null, baseUnit: 'ml', quantity: D(500), reserved: D(100),
            batches: [{ quantityRemaining: D(500), expirationDate: new Date('2099-12-31'), receivedAt: new Date('2020-01-01') }] } }] });

test('supplier purchase quote converts exactly to base-unit price; preserves fractional unit and zero lead-time', () => {
    const result = supplierConversion({ price: 125, purchaseUnit: 'bottle', conversionQuantity: 500, conversionTargetUnit: 'ml' }, 'ml');
    assert.equal(result.pricePerBaseUnit.toString(), '0.25'); assert.equal(result.conversionQuantity.toString(), '500');
    const identity = supplierConversion({ price: 0.125 }, 'g');
    assert.equal(identity.purchaseUnit, 'g'); assert.equal(identity.pricePerBaseUnit.toString(), '0.125');
    assert.equal(supplierConversion({ price: '12345678901234.1234' }, 'g').pricePerBaseUnit.toString(), '12345678901234.1234');
});
test('supplier refuses ambiguous/mismatched conversion, negative quotes and precision loss', () => {
    for (const input of [{ price: 1, conversionQuantity: 3 }, { price: 1, purchaseUnit: 'bag', conversionQuantity: 3, conversionTargetUnit: 'g' },
        { price: 1, purchaseUnit: 'bag', conversionQuantity: 5, conversionTargetUnit: 'ml' }, { price: -1 }]) {
        assert.throws(() => supplierConversion(input, 'g'));
    }
});
test('supplier repository maps legacy endpoint identity to Ingredient, never selling Product', async () => {
    const calls = [];
    const repository = sourceLoader({ supplierIngredient: { findUnique: async args => { calls.push(args); return null; } } })('modules/supplier/supplier.repository.ts').supplierRepository;
    await repository.findSupplierProductByPair('supplier', 'milk');
    assert.deepEqual(calls[0].where, { supplierId_ingredientId: { supplierId: 'supplier', ingredientId: 'milk' } });
});
test('recipe capacity respects yield, expired lots, reservations, unit conversion and shared ingredient', () => {
    const r = recipe(); assert.equal(productCapacity([r]), 8); assert.equal(recipeNeeds(r, 3).get('milk').toString(), '150');
    r.ingredients[0].ingredient.batches[0].expirationDate = new Date('2020-01-01'); assert.equal(productCapacity([r]), 0);
});
test('missing/ambiguous/inactive recipe, mismatched base quantities and fractional pieces fail closed', () => {
    assert.throws(() => activeRecipe([])); const r = recipe(); assert.throws(() => activeRecipe([r, { ...r, id: 'r2' }]));
    r.ingredients[0].quantityBase = D(101); assert.throws(() => recipeNeeds(r, 1)); assert.equal(productCapacity([r]), 0);
    r.ingredients[0].ingredient.isActive = false; assert.equal(productCapacity([r]), 0);
});
test('Product creation writes only Product; deletion with Recipe blocked without changing ingredients', async () => {
    let created = 0, deleted = 0;
    const tx = { $queryRaw: async () => [], orderItem: { count: async () => 0 }, recipe: { count: async () => 1 },
        product: { create: async ({ data }) => { created++; return data; }, delete: async () => { deleted++; } } };
    const repository = sourceLoader({ ...tx, $transaction: fn => fn(tx) })('modules/product/product.repository.ts').productRepository;
    await repository.create({ name: 'Coffee' }); assert.equal(created, 1);
    await assert.rejects(repository.delete('coffee'), { statusCode: 409 }); assert.equal(deleted, 0);
});

test('Supplier service preserves purchase quote and base price without treating ingredient as selling Product', async () => {
    let saved;
    const supplier = { id: 'supplier', name: 'Supplier', deletedAt: null, status: 'ACTIVE', ingredients: [] };
    const ingredient = { id: 'milk', name: 'Milk', sku: 'MILK', baseUnit: 'ml', isActive: true, deletedAt: null };
    const service = sourceLoader({ supplier: { findUnique: async () => supplier }, ingredient: { findFirst: async () => ingredient },
        supplierIngredient: { findUnique: async () => null, create: async ({ data }) => { saved = data; return { id: 'link', ...data, supplier, ingredient }; } }
    })('modules/supplier/supplier.service.ts').supplierService;
    const dto = await service.createSupplierProduct({ supplierId: 'supplier', productId: 'milk', price: '125', purchaseUnit: 'bottle', conversionQuantity: 500, conversionTargetUnit: 'ml', leadTimeDays: 0 });
    assert.equal(saved.ingredientId, 'milk'); assert.equal(saved.pricePerBaseUnit.toString(), '0.25'); assert.equal(saved.leadTimeDays, 0);
    assert.equal(dto.priceExact, '125'); assert.equal(dto.pricePerBaseUnitExact, '0.25'); assert.equal(dto.ingredientId, 'milk'); assert.equal(dto.productId, 'milk');
});
