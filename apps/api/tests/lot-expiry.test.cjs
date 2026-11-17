const test = require('node:test');
const assert = require('node:assert/strict');
const { harness } = require('./product-test-harness.cjs');
const { isIngredientBatchUnexpired, isIngredientBatchUsable, lotExpiryStatus } = harness({}).load('common/ingredient-batch-availability.ts');

test('Lot timestamp expiry boundary excludes equality and past; preserves explicit legacy null compatibility', () => {
  const now = new Date('2026-11-17T12:00:00Z');
  assert.equal(isIngredientBatchUnexpired('2026-11-17T11:59:59.999Z', now), false);
  assert.equal(isIngredientBatchUnexpired(now, now), false);
  assert.equal(isIngredientBatchUnexpired('2026-11-17T12:00:00.001Z', now), true);
  assert.equal(isIngredientBatchUnexpired('invalid', now), false);
  assert.equal(isIngredientBatchUnexpired(null, now), true);
});

test('Lot quality fails closed; exact 7-day warning boundary inclusive and expired exclusive', () => {
  const now = new Date('2026-11-17T12:00:00Z');
  const future = new Date(now.getTime() + 7 * 86400000);
  for (const qualityStatus of [undefined, 'UNKNOWN', 'QUARANTINED', 'RECALLED', 'unexpected']) {
    assert.equal(isIngredientBatchUsable({ qualityStatus, expirationDate: future }, now), false);
  }
  assert.equal(isIngredientBatchUsable({ qualityStatus: 'AVAILABLE', expirationDate: future }, now), true);
  assert.equal(isIngredientBatchUsable({ qualityStatus: 'AVAILABLE', expirationDate: now }, now), false);
  assert.equal(lotExpiryStatus(future, now, 7), 'NEAR_EXPIRY');
  assert.equal(lotExpiryStatus(new Date(future.getTime() + 1), now, 7), 'VALID');
  assert.equal(lotExpiryStatus(now, now, 7), 'EXPIRED');
  assert.equal(lotExpiryStatus(null, now, 7), 'NO_EXPIRY');
});
