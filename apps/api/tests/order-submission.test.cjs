const test = require('node:test');
const assert = require('node:assert/strict');
const { harness } = require('./product-test-harness.cjs');
const { submissionOrderId, submissionPaymentId } = harness({}).load('modules/order/order-submission.ts');
test('submission identity scopes request key to actor and fingerprints normalized business payload', () => {
  const base = { items: [{ productId: 'p', quantity: 1 }], paymentMethod: 'CASH', requestId: 'key' };
  const id = submissionOrderId('actor', 'key');
  assert.equal(id, submissionOrderId('actor', 'key'));
  assert.notEqual(id, submissionOrderId('other', 'key'));
  assert.notEqual(id, submissionOrderId('actor', 'other'));
  assert.equal(submissionPaymentId(id, base), submissionPaymentId(id, { paymentMethod: 'CASH', items: [{ quantity: 1, productId: 'p', toppings: [] }], note: null }));
  for (const update of [{ items: [{ productId: 'p', quantity: 2 }] }, { shippingAddress: 'changed' }, { paymentMethod: 'MOMO' }]) {
    assert.notEqual(submissionPaymentId(id, base), submissionPaymentId(id, { ...base, ...update }));
  }
});
