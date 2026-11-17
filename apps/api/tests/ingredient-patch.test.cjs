const test = require('node:test');
const assert = require('node:assert/strict');
const { harness } = require('./product-test-harness.cjs');
const h = harness(new Proxy({}, { get() { throw new Error('Validation must not access DB'); } }));
const { createIngredientSchema, updateIngredientSchema, ingredientIncidentSchema, ingredientInternalUseSchema } = h.load('modules/ingredient/ingredient.validator.ts');
test('Ingredient PATCH supplies no defaults: active, threshold, unit and metadata patches preserve omission', () => {
  for (const input of [{}, { isActive: false }, { minThreshold: 12 }, { baseUnit: 'ml' }, { origin: null }]) {
    assert.deepEqual(updateIngredientSchema.parse(input), input);
  }
  assert.equal(createIngredientSchema.parse({ name: 'new' }).baseUnit, 'g');
  assert.equal(createIngredientSchema.parse({ name: 'new' }).costPerBaseUnit, 0);
});
test('Ingredient PATCH retains validation for supplied fields', () => {
  for (const input of [{ minThreshold: -1 }, { costPerBaseUnit: -1 }, { baseUnit: '' }]) {
    assert.equal(updateIngredientSchema.safeParse(input).success, false);
  }
});
test('Missing-stock incident requires exact nonnegative count and reason, rejects arbitrary delta', () => {
  assert.deepEqual(ingredientIncidentSchema.parse({ actualQuantity: 7.125, reason: ' missing ' }), { actualQuantity: 7.125, reason: 'missing' });
  for (const input of [{ actualQuantity: -1, reason: 'lost' }, { actualQuantity: 1.0001, reason: 'lost' },
    { actualQuantity: 1, reason: '' }, { actualQuantity: 1, reason: 'lost', quantity: -3 }]) {
    assert.equal(ingredientIncidentSchema.safeParse(input).success, false);
  }
});
test('Internal usage requires idempotency key, positive quantity, purpose and recipient', () => {
  const valid = { requestId: '57e96ab1-14e9-4075-b1e8-8e06bb97d429', quantity: 3, unit: 'g', purpose: 'training', recipient: 'barista' };
  assert.deepEqual(ingredientInternalUseSchema.parse(valid), valid);
  for (const patch of [{ requestId: '' }, { quantity: 0 }, { quantity: -1 }, { purpose: '' }, { recipient: '' }]) {
    assert.equal(ingredientInternalUseSchema.safeParse({ ...valid, ...patch }).success, false);
  }
});
