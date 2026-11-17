const { test } = require('node:test');
const assert = require('node:assert/strict');
const { harness } = require('./product-test-harness.cjs');
const h = harness(new Proxy({}, { get() { throw new Error('Validation must precede database access'); } }));
const { createProductSchema, updateProductSchema } = h.load('modules/product/product.validator.ts');
const valid = { name: 'Coffee', sku: 'COFFEE', price: 25000, categoryId: 'category' };

test('product price validation preserves zero/numeric strings and rejects invalid or lossy prices', async () => {
    for (const price of [0, 0.01, 12.34, 9999999999.99, '25000']) {
        assert.equal(createProductSchema.parse({ ...valid, price }).price, Number(price));
    }
    for (const price of [-1, NaN, Infinity, 1.001, 10000000000, null, '', '  ', true, {}, []]) {
        assert.equal(createProductSchema.safeParse({ ...valid, price }).success, false);
        await assert.rejects(h.service.createProduct({ ...valid, price }), e => e.statusCode === 400);
    }
});
test('product update requires explicit read version and at least one changed field', async () => {
    const expectedUpdatedAt = '2026-11-17T00:00:00.000Z';
    assert.equal(updateProductSchema.safeParse({ name: 'Updated', expectedUpdatedAt }).success, true);
    for (const input of [{}, { name: 'Updated' }, { expectedUpdatedAt }, { name: 'Updated', expectedUpdatedAt: 'invalid' }]) {
        assert.equal(updateProductSchema.safeParse(input).success, false);
        await assert.rejects(h.service.updateProduct('product', input), e => e.statusCode === 400);
    }
});
test('product service validates name/category/unit before DB; API validation returns controlled 400', async () => {
    for (const extra of [{ name: '' }, { categoryId: '' }, { unit: 'unknown' }]) {
        await assert.rejects(h.service.createProduct({ ...valid, ...extra }), e => e.statusCode === 400);
        assert.equal((await h.api('POST', '/products', { ...valid, ...extra })).status, 401);
    }
    const express = require('express');
    const { request } = require('./in-process-http.cjs');
    const app = express(); app.use(express.json());
    app.post('/validate', h.load('common/validate.ts').validateBody(createProductSchema), (_req, res) => res.sendStatus(204));
    for (const price of [-1, 1.001, null]) {
        const r = await request(app, '/validate', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ ...valid, price }) });
        assert.equal(r.status, 400);
        assert.equal((await r.json()).success, false);
    }
});
