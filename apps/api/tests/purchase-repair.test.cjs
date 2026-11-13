const test = require('node:test');
const assert = require('node:assert/strict');
const { Prisma } = require('@prisma/client');
const { sourceLoader } = require('./repair-source-loader.cjs');
const D = x => new Prisma.Decimal(x);
function fixture() {
    const ingredient = { id: 'milk', name: 'Milk', sku: 'MILK', baseUnit: 'ml', isActive: true, deletedAt: null, quantity: D(10), reserved: D(2), minThreshold: D(5), category: null };
    const batches = [{ id: 'opening', ingredientId: 'milk', batchCode: 'opening', quantityRemaining: D(10), expirationDate: new Date('2099-12-31') }];
    const link = { ingredientId: 'milk', supplierId: 'supplier', conversionTargetUnit: 'ml', conversionQuantity: D(5), purchaseUnit: 'bottle', pricePerBaseUnit: D(2), ingredient };
    const items = [{ id: 'item', requestId: 'request', ingredientId: 'milk', quantity: 10, quantityReceived: 0, unitPrice: D(2), ingredient,
        notes: JSON.stringify({ schema: 'api-purchase-v1', baseUnit: 'ml', purchaseUnit: 'bottle', conversionQuantity: '5', note: 'order' }) }];
    const request = { id: 'request', requestNumber: 'PR-1', status: 'SENT', supplierId: 'supplier', supplier: { status: 'ACTIVE', deletedAt: null, ingredients: [link] },
        receivedAmount: D(0), items, receipts: [], emailSentAt: new Date() };
    const receipts = request.receipts, ledger = [];
    let failLedger = false;
    const tx = {
        $queryRaw: async () => [],
        supplier: { findFirst: async () => request.supplier }, supplierIngredient: { findUnique: async () => link },
        ingredient: { findUnique: async () => ({ ...ingredient, batches }), update: async ({ data }) => { ingredient.quantity = data.quantity; return ingredient; } },
        ingredientBatch: { findUnique: async ({ where }) => batches.find(b => b.batchCode === where.ingredientId_batchCode.batchCode) ?? null,
            create: async ({ data }) => { const batch = { id: `batch-${batches.length}`, ...data }; batches.push(batch); return batch; } },
        goodsReceipt: { findUnique: async ({ where }) => receipts.find(r => r.idempotencyKey === where.idempotencyKey) ?? null,
            create: async ({ data }) => { const receipt = { id: `receipt-${receipts.length}`, ...data }; receipts.push(receipt); return receipt; } },
        inventoryTransaction: { create: async ({ data }) => { if (failLedger) throw Error('receipt ledger failure'); ledger.push(data); return data; } },
        purchaseRequest: { findUnique: async () => request, update: async ({ data }) => { Object.assign(request, data); return request; },
            create: async ({ data }) => data },
        purchaseRequestItem: { findFirst: async () => null, findMany: async () => items,
            count: async () => items.filter(i => i.quantityReceived > 0).length,
            update: async ({ where, data }) => { const item = items.find(i => i.id === where.id); item.quantityReceived += data.quantityReceived.increment; return item; } }
    };
    const db = { ...tx, $transaction: async fn => {
        const before = { quantity: ingredient.quantity, received: items.map(i => i.quantityReceived), receiptCount: receipts.length, batchCount: batches.length, ledgerCount: ledger.length,
            status: request.status, receivedAmount: request.receivedAmount };
        try { return await fn(tx); } catch (error) {
            ingredient.quantity = before.quantity; items.forEach((item,i) => item.quantityReceived = before.received[i]);
            receipts.length = before.receiptCount; batches.length = before.batchCount; ledger.length = before.ledgerCount;
            request.status = before.status; request.receivedAmount = before.receivedAmount; throw error;
        }
    } };
    const load = sourceLoader(db);
    return { repository: load('modules/purchase/purchase.repository.ts').purchaseRepository, validator: load('modules/purchase/purchase.validator.ts'),
        request, ingredient, link, items, receipts, batches, ledger, failLedger() { failLedger = true; } };
}
const receive = (quantity = 4, key = 'receipt-1') => ({ idempotencyKey: key, note: 'Delivered', items: [{ purchaseRequestItemId: 'item', receivedQuantity: quantity,
    batches: [{ batchCode: key, expirationDate: '2099-12-31', quantity }] }] });

test('Purchase receipt base quantity not multiplied by pack conversion; one confirmed GoodsReceipt owns lot and ledger', async () => {
    const f = fixture(); await f.repository.receive(f.request, receive(), 'staff');
    assert.equal(f.ingredient.quantity.toString(), '14'); assert.equal(f.items[0].quantityReceived, 4); assert.equal(f.request.status, 'SENT');
    assert.equal(f.request.receivedAmount.toString(), '8'); assert.equal(f.receipts.length, 1);
    assert.equal(f.batches[1].goodsReceiptId, f.receipts[0].id); assert.equal(f.batches[1].purchaseRequestItemId, 'item');
    assert.equal(f.batches[1].receivedUnit, 'ml'); assert.equal(f.ledger[0].quantity.toString(), '4');
    assert.equal(f.ledger[0].referenceType, 'GOODS_RECEIPT');
});
test('Receipt replay no-op, conflicting replay rejected, partial remainder receives once even after final status', async () => {
    const f = fixture(); await f.repository.receive(f.request, receive(), 'staff'); await f.repository.receive(f.request, receive(), 'staff');
    assert.equal(f.ingredient.quantity.toString(), '14'); assert.equal(f.receipts.length, 1);
    await assert.rejects(f.repository.receive(f.request, receive(3), 'staff'), { statusCode: 409 });
    await f.repository.receive(f.request, receive(6, 'receipt-2'), 'staff'); assert.equal(f.request.status, 'RECEIVED');
    await f.repository.receive(f.request, receive(6, 'receipt-2'), 'staff'); assert.equal(f.ingredient.quantity.toString(), '20'); assert.equal(f.ledger.length, 2);
});
test('Receipt overdelivery, missing lots, duplicate lines and reused batch fail without stock writes', async () => {
    const f = fixture();
    const duplicate = receive(); duplicate.items.push(duplicate.items[0]);
    const noBatch = receive(); noBatch.items[0].batches = [];
    const reused = receive(); reused.items[0].batches[0].batchCode = 'opening';
    for (const input of [receive(11), duplicate, noBatch, reused]) await assert.rejects(f.repository.receive(f.request, input, 'staff'));
    assert.equal(f.ingredient.quantity.toString(), '10'); assert.equal(f.receipts.length, 0); assert.equal(f.ledger.length, 0);
});
test('Receipt ledger failure rolls back GoodsReceipt, lots, received counters and aggregate', async () => {
    const f = fixture(); f.failLedger(); await assert.rejects(f.repository.receive(f.request, receive(), 'staff'), /receipt ledger failure/);
    assert.equal(f.ingredient.quantity.toString(), '10'); assert.equal(f.receipts.length, 0); assert.equal(f.batches.length, 1); assert.equal(f.items[0].quantityReceived, 0);
});
test('Receipt requires SENT and unchanged base-unit snapshot; invalid expiry rejected', async () => {
    const f = fixture(); f.request.status = 'APPROVED'; await assert.rejects(f.repository.receive(f.request, receive(), 'staff'));
    f.request.status = 'SENT'; f.items[0].notes = JSON.stringify({ schema: 'api-purchase-v1', baseUnit: 'g' });
    await assert.rejects(f.repository.receive(f.request, receive(), 'staff'), /Đơn vị gốc/);
    f.items[0].notes = null; const input = receive(); input.items[0].batches[0].expirationDate = '2020-01-01';
    await assert.rejects(f.repository.receive(f.request, input, 'staff')); assert.equal(f.receipts.length, 0);
});
test('Purchase creation validates supplier link and snapshots integer base quantity/price, no stock write', async () => {
    const f = fixture();
    const created = await f.repository.create({ supplierId: 'supplier', aiGenerated: false, items: [{ inventoryId: 'milk', quantity: 10 }] }, 'admin', 'PR-2');
    assert.equal(created.items.create[0].quantity, 10); assert.equal(created.items.create[0].ingredientId, 'milk');
    assert.equal(created.items.create[0].unitPrice.toString(), '2'); assert.equal(created.totalAmount.toString(), '20'); assert.equal(f.ingredient.quantity.toString(), '10');
    f.link.conversionTargetUnit = 'g'; await assert.rejects(f.repository.create({ supplierId: 'supplier', aiGenerated: false, items: [{ inventoryId: 'milk', quantity: 10 }] }, 'admin', 'PR-3'));
});
test('Receipt HTTP schema requires idempotency key and rejects duplicate item entries', () => {
    const schema = fixture().validator.receivePurchaseRequestSchema;
    assert.equal(schema.safeParse(receive()).success, true); assert.equal(schema.safeParse({ ...receive(), idempotencyKey: undefined }).success, false);
    const duplicate = receive(); duplicate.items.push(duplicate.items[0]); assert.equal(schema.safeParse(duplicate).success, false);
});

test('Stale reject request cannot cancel purchase after a concurrent partial receipt', async () => {
    const f = fixture(); await f.repository.receive(f.request, receive(), 'staff');
    await assert.rejects(f.repository.updateStatus('request', { status: 'REJECTED' }, 'SENT'), { statusCode: 409 });
    assert.equal(f.request.status, 'SENT'); assert.equal(f.items[0].quantityReceived, 4); assert.equal(f.ingredient.quantity.toString(), '14');
});
