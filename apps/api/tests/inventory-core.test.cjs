const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const Module = require('node:module');
const ts = require('typescript');
const original = Module._extensions['.ts'];
Module._extensions['.ts'] = (mod, file) => {
    assert.match(file, /common[\\/](inventory-core|ingredient-policy)\.ts$/);
    mod._compile(ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText, file);
};
let core;
try { core = require('../src/common/inventory-core.ts'); }
finally { if (original) Module._extensions['.ts'] = original; else delete Module._extensions['.ts']; }
const { calculateRequirements: calc, ingredientCost: cost, planReservation: plan, operationIdentity: operation, canonicalOperationValue: canonical } = core;
test('D01/D03 source components retain exact fractions and conserve rounded aggregate requirements', () => {
    const effect = { type: 'ADD', ingredientId: 'a', baseUnit: 'g', unit: 'g', quantity: '0.001', active: true };
    const result = core.calculateComponents([recipe([ingredient('a', '1')], '3')], '1', [], [effect], now);
    assert.equal(result.snapshot.requirements[0].quantity, '0.334');
    assert.deepEqual(result.components.map(c => c.quantity), ['0.333', '0.001']);
    assert.equal(BigInt(result.components[0].exact.numerator) * 3n, BigInt(result.components[0].exact.denominator));
    assert.deepEqual(result.components.map(c => c.source), ['RECIPE', 'TOPPING']);
});
test('D03 source×lot cents conserve aggregate COGS without losing sub-cent costs', () => {
    const rows = core.attributeComponentCosts(Array.from({ length: 3 }, (_, id) => ({ id, quantity: '1', unitCost: '0.005' })));
    assert.deepEqual(rows.map(row => row.attributedCost), ['0.01', '0.01', '0']);
    assert.equal(core.ingredientCost(rows).total, '0.02');
    assert.deepEqual(rows.map(row => row.id), [0, 1, 2]);
    const partial = core.attributeComponentCosts([{ quantity: '1', unitCost: null }, { quantity: '1', unitCost: '0' }]);
    assert.equal(partial[0].attributedCost, null); assert.equal(partial[0].exact, null); assert.equal(partial[1].attributedCost, '0');
});
const now = new Date('2026-11-06T00:00:00Z');
const ingredient = (id, quantity, baseUnit = 'g', optional = false) => ({ ingredientId: id, quantity, unit: baseUnit, baseUnit, optional, active: true });
const recipe = (ingredients = [ingredient('coffee', '36'), ingredient('milk', '300', 'ml')], yieldQuantity = '2') => ({ id: 'recipe', version: '1', active: true, productActive: true, effectiveFrom: new Date('2026-01-01'), effectiveTo: null, yieldQuantity, ingredients });
test('D01 recipe yield and explicit optional omission; snapshot detached from inputs', () => {
    const r = recipe(); const result = calc([r], '3', [], [], now);
    assert.deepEqual(result.requirements.map(v => v.quantity), ['54', '450']);
    r.ingredients[0].quantity = '99'; assert.equal(result.requirements[0].quantity, '54');
    assert.equal(calc([recipe([ingredient('optional', '1', 'g', true)])], '1', ['optional'], [], now).requirements.length, 0);
});
test('D01 selection boundary, ambiguity and invalid selections fail closed', () => {
    const r = recipe(); r.effectiveTo = now;
    for (const candidates of [[], [r], [recipe(), recipe()]]) assert.throws(() => calc(candidates, '1', [], [], now));
    for (const omitted of [['coffee'], ['unknown'], ['coffee', 'coffee']]) assert.throws(() => calc([recipe()], '1', omitted, [], now));
    for (const yieldQuantity of ['0', '-1', 'NaN', '1.001']) assert.throws(() => calc([recipe([], yieldQuantity)], '1', [], [], now));
    assert.throws(() => calc([recipe([{ ...ingredient('a', '1'), active: false }])], '1', [], [], now));
    assert.throws(() => calc([recipe([ingredient('a', '1'), ingredient('a', '1')])], '1', [], [], now));
});
test('D01/D03 aggregate recipe and selected ADD line quantities before rounding once', () => {
    const r = recipe([ingredient('a', '1')], '3');
    const effect = { type: 'ADD', ingredientId: 'a', baseUnit: 'g', unit: 'g', quantity: '0.001', active: true };
    assert.equal(calc([r], '1', [], [], now).requirements[0].quantity, '0.333');
    assert.equal(calc([r], '3', [], [], now).requirements[0].quantity, '1');
    assert.equal(calc([r], '1', [], [effect], now).requirements[0].quantity, '0.334');
    assert.equal(calc([r], '1', [], [{ ...effect, quantity: '0' }], now).requirements[0].quantity, '0.333');
    const delta = calc([r], '1', [], [], now).requirements[0].roundingDelta;
    assert.ok(BigInt(delta.numerator) < 0n);
    for (const type of ['REMOVE', 'SUBSTITUTE']) assert.throws(() => calc([r], '1', [], [{ ...effect, type }], now));
    assert.throws(() => calc([r], '1', [], [{ ...effect, baseUnit: 'ml', unit: 'ml' }], now));
});
test('D03 half-up boundary, piece integrality and capacity', () => {
    assert.equal(calc([recipe([ingredient('a', '0.001')], '2')], '1', [], [], now).requirements[0].quantity, '0.001');
    assert.throws(() => calc([recipe([ingredient('a', '1', 'piece')], '2')], '1', [], [], now));
    assert.throws(() => calc([recipe([ingredient('a', '99999999999.999')], '1')], '2', [], [], now));
    assert.throws(() => calc([recipe()], '0.5', [], [], now));
});
test('D03 exact costs, round once; unknown differs from known zero', () => {
    assert.deepEqual(cost([{ quantity: '10', unitCost: '200' }, { quantity: '8', unitCost: '250' }, { quantity: '30', unitCost: '30' }]), { complete: true, total: '4900' });
    assert.equal(cost([{ quantity: '1', unitCost: '0.004' }, { quantity: '1', unitCost: '0.004' }]).total, '0.01');
    assert.equal(cost([{ quantity: '1', unitCost: '0.005' }]).total, '0.01');
    assert.deepEqual(cost([{ quantity: '1', unitCost: null }]), { complete: false, total: null });
    assert.deepEqual(cost([{ quantity: '1', unitCost: '0' }]), { complete: true, total: '0' });
    assert.throws(() => cost([{ quantity: '1', unitCost: '1.00001' }]));
    assert.throws(() => cost([{ quantity: '99999999999', unitCost: '99999999999999' }]));
});
const batch = (id, remaining, reserved = '0', expiry = '2026-11-08') => ({ id, ingredientId: 'a', remaining, reserved, expirationDate: expiry === null ? null : new Date(expiry), receivedAt: new Date('2026-11-01') });
test('D04/D05 FEFO plans exact remaining target and subtracts reservations without mutation', () => {
    const input = [batch('later', '20', '2', '2026-11-09'), batch('early', '10')];
    const copy = JSON.stringify(input);
    assert.deepEqual(plan('a', '18', input, now), [{ batchId: 'early', quantity: '10' }, { batchId: 'later', quantity: '8' }]);
    assert.equal(JSON.stringify(input), copy);
    assert.deepEqual(plan('a', '1', [batch('a', '0.333'), batch('b', '0.333'), batch('c', '0.334')], now).map(a => a.quantity), ['0.333', '0.333', '0.334']);
});
test('D05 insufficient, expired, foreign, duplicate and invalid balances reject entire plan', () => {
    for (const batches of [[batch('a', '1', '1')], [batch('a', '1', '0', null)], [batch('a', '1', '0', now)], [batch('a', '1', '2')], [batch('a', '1'), batch('a', '1')], [{ ...batch('a', '1'), ingredientId: 'other' }]]) assert.throws(() => plan('a', '1', batches, now));
    for (const q of ['0', '-1', '1.0001']) assert.throws(() => plan('a', q, [batch('a', '2')], now));
});
test('D09 canonical keys stable across object ordering; changed payload conflicts by hash', () => {
    const input = { type: 'reserve', scope: 'cafe', callerKey: 'request', actorId: 'admin', versions: { b: '2', a: '1' }, payload: { quantity: '18', baseUnit: 'g' } };
    const a = operation(input); const b = operation({ ...input, versions: { a: '1', b: '2' }, payload: { baseUnit: 'g', quantity: '18' } });
    assert.equal(a.key, b.key); assert.equal(a.requestHash, b.requestHash); assert.equal(a.childKey('batch'), b.childKey('batch'));
    assert.equal(a.key, operation({ ...input, payload: { quantity: '19' } }).key);
    assert.notEqual(a.requestHash, operation({ ...input, payload: { quantity: '19' } }).requestHash);
    assert.notEqual(a.key, operation({ ...input, scope: 'other' }).key);
    assert.notEqual(a.childKey('batch'), a.childKey('other'));
    assert.notEqual(a.requestHash, operation({ ...input, actorId: 'staff' }).requestHash);
});
test('D09 refuses lossy/unsupported JSON values and preserves array order', () => {
    for (const value of [undefined, 1, NaN, Infinity, new Date(), { value: undefined }, [undefined], Array(2), { get value() { throw new Error('getter'); } }]) assert.throws(() => canonical(value));
    assert.notEqual(canonical(['a', 'b']), canonical(['b', 'a']));
    assert.throws(() => operation({ type: ' ', scope: 'cafe', callerKey: 'a', actorId: 'b', versions: {}, payload: null }));
});
test('D02/D09 explicit quantity adapter canonicalizes equivalent units and unordered rows', () => {
    const normalize = core.normalizeOperationQuantities;
    assert.equal(canonical(normalize([{ ingredientId: 'a', quantity: '0.018', unit: 'kg', baseUnit: 'g' }])),
        canonical(normalize([{ ingredientId: 'a', quantity: '18.000', unit: 'g', baseUnit: 'g' }])));
    const a = { ingredientId: 'a', quantity: '1', unit: 'g', baseUnit: 'g' };
    const b = { ...a, ingredientId: 'b' };
    assert.equal(canonical(normalize([a, b])), canonical(normalize([b, a])));
    assert.throws(() => normalize([a, a]));
});


test('D09 canonical vectors reject silent property loss, getters and cycles', () => {
    let invoked = false;
    const getter = Object.defineProperty(['a'], '0', { enumerable: true, get() { invoked = true; return 'a'; } });
    const hidden = Object.defineProperty({}, 'secret', { value: 'x' });
    const symbols = ['a']; symbols[Symbol('x')] = 'hidden';
    const decorated = ['a']; decorated.extra = 'x';
    const cycle = {}; cycle.self = cycle;
    for (const value of [getter, hidden, symbols, decorated, cycle]) assert.throws(() => canonical(value));
    assert.equal(invoked, false);
    const shared = { value: 'x' };
    assert.equal(canonical([shared, shared]), '[{"value":"x"},{"value":"x"}]');
    assert.equal(canonical({ z: ['b', 'a'], a: 'x' }), '{"a":"x","z":["b","a"]}');
});
test('D01 zero ADD rejects dimension conflicts and omitted identities are validated', () => {
    assert.throws(() => calc([recipe([ingredient('a', '1')])], '1', [], [{ type: 'ADD', ingredientId: 'a', baseUnit: 'ml', unit: 'ml', quantity: '0', active: true }], now));
    assert.throws(() => calc([recipe([ingredient(' ', '1', 'g', true)])], '1', [' '], [], now));
});
test('D03 repeated exact extensions and deterministic fractional FEFO', () => {
    assert.equal(cost(Array.from({ length: 2000 }, () => ({ quantity: '0.001', unitCost: '0.0001' }))).total, '0');
    assert.equal(cost([{ quantity: '99999999999.999', unitCost: '1' }]).total, '100000000000');
    const rows = [batch('z', '0.334'), batch('a', '0.333'), batch('b', '0.333')];
    assert.deepEqual(plan('a', '1', rows, now), plan('a', '1', [...rows].reverse(), now));
    assert.deepEqual(plan('a', '0.001', [batch('a', '0.002', '0.001')], now), [{ batchId: 'a', quantity: '0.001' }]);
});
