// Real receipt validator/repository with denied persistence; no application bootstrap or DB.
const assert = require('node:assert/strict');
const { test } = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
function load(file, deps = {}) {
    const exports = {};
    const source = fs.readFileSync(path.resolve(__dirname, '../src', file), 'utf8');
    vm.runInNewContext(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText, {
        exports, require(name) {
            if (!(name in deps)) throw new Error(`Unexpected import: ${name}`);
            return deps[name];
        }
    });
    return exports;
}
// Resolve only explicitly listed local imports.
const deps = { '@cafe-project/database': { PurchaseRequestStatus: { PENDING: 'PENDING', APPROVED: 'APPROVED', SENT: 'SENT' } }, zod: require('zod') };
deps['./purchase.receipt-validation'] = load('modules/purchase/purchase.receipt-validation.ts');
const { receivePurchaseRequestSchema } = load('modules/purchase/purchase.validator.ts', deps);
const item = (id, quantity = 4) => ({ purchaseRequestItemId: id, receivedQuantity: quantity });

test('receipt schema rejects duplicate item IDs including whitespace-normalized aliases', () => {
    for (const duplicate of ['item-1', ' item-1 ']) {
        const result = receivePurchaseRequestSchema.safeParse({ items: [item('item-1'), item(duplicate)] });
        assert.equal(result.success, false);
        assert.ok(result.error.issues.some(issue => issue.path.join('.') === 'items.1.purchaseRequestItemId'));
    }
});

test('distinct partial receipt items and matching batch quantities remain accepted', () => {
    const result = receivePurchaseRequestSchema.safeParse({ items: [item('item-1'), { ...item('item-2', 2), batches: [{ quantity: 2, expirationDate: '2099-01-01' }] }] });
    assert.equal(result.success, true);
    const mismatch = receivePurchaseRequestSchema.safeParse({ items: [{ ...item('item-1', 3), batches: [{ quantity: 2, expirationDate: '2099-01-01' }] }] });
    assert.equal(mismatch.success, false);
});

test('direct receipt repository rejects duplicate payload before any transaction or persistence', async () => {
    let transactions = 0;
    const prisma = new Proxy({ $transaction: async () => { transactions++; throw new Error('Unexpected persistence'); } }, {
        get(target, name) { if (name in target) return target[name]; throw new Error(`Unexpected DB member: ${String(name)}`); }
    });
    const { HttpError } = load('common/http-error.ts');
    const { purchaseRepository } = load('modules/purchase/purchase.repository.ts', {
        '@cafe-project/database': { ...deps['@cafe-project/database'], prisma },
        '../../common/http-error': { HttpError },
        './purchase.receipt-validation': deps['./purchase.receipt-validation']
    });
    for (const duplicate of ['item-1', ' item-1 ']) {
        await assert.rejects(purchaseRepository.receive({ id: 'pr-1', items: [] }, { items: [item('item-1'), item(duplicate)] }, 'admin'), error => error.statusCode === 400);
    }
    assert.equal(transactions, 0);
});

// R3: quantities and monetary inputs must be representable finite values.
const { createPurchaseRequestSchema } = load('modules/purchase/purchase.validator.ts', deps);
const { importInventorySchema } = load('modules/inventory/inventory.validator.ts', { zod: require('zod') });
test('purchase price rejects non-finite values and numeric overflow strings', () => {
    for (const unitPrice of [Infinity, -Infinity, NaN, 'Infinity', '1e999']) {
        assert.equal(createPurchaseRequestSchema.safeParse({ supplierId: 's', items: [{ inventoryId: 'i', quantity: 1, unitPrice }] }).success, false);
    }
});
test('purchase price retains zero, decimal, numeric-string and omitted prices', () => {
    for (const unitPrice of [0, 12.5, '12.50', null, undefined]) {
        assert.equal(createPurchaseRequestSchema.safeParse({ supplierId: 's', items: [{ inventoryId: 'i', quantity: 1, unitPrice }] }).success, true);
    }
});
test('inventory purchase quantity rejects non-finite values before service dispatch', () => {
    for (const purchaseQuantity of [Infinity, -Infinity, NaN, 'Infinity', '1e999']) {
        assert.equal(importInventorySchema.safeParse({ inventoryId: 'i', expirationDate: '2099-01-01', purchaseQuantity }).success, false);
    }
});
test('inventory purchase quantity retains finite fractional conversion input', () => {
    for (const purchaseQuantity of [1, 0.5, '2.5']) {
        assert.equal(importInventorySchema.safeParse({ inventoryId: 'i', expirationDate: '2099-01-01', purchaseQuantity }).success, true);
    }
});
