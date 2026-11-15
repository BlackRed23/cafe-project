const assert = require('node:assert/strict');
const { test } = require('node:test');
const fs = require('node:fs');
const ts = require('typescript');
const vm = require('node:vm');
const exportsObject = {};
vm.runInNewContext(ts.transpileModule(fs.readFileSync(require('node:path').resolve(__dirname, '../src/common/ingredient-policy.ts'), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 }
}).outputText, { exports: exportsObject, Date });
const { normalizeIngredientQuantity: quantity, supplierExpiryInstant: expiry, rankEligibleBatches: rank } = exportsObject;
test('D02 exact dimensional conversion and canonical strings', () => {
    assert.equal(quantity('0.018', 'kg', 'g'), '18');
    assert.equal(quantity('0.150', ' L ', 'ml'), '150');
    assert.equal(quantity('1.230', 'g', 'g'), '1.23');
    assert.equal(quantity('2.000', 'piece', 'piece'), '2');
    assert.equal(quantity('99999999999.999', 'g', 'g'), '99999999999.999');
});
test('D02/D03 rejects invalid, cross-dimension, fractional-piece and overflow input', () => {
    for (const value of ['0', '-1', 'NaN', 'Infinity', '1e3', '1.0001', '100000000000', ' 1', '01', 1]) {
        assert.throws(() => quantity(value, 'g', 'g'));
    }
    for (const args of [['1', 'g', 'ml'], ['0.5', 'piece', 'piece'], ['100000000', 'kg', 'g'], ['1', 'box', 'g'], ['1', '__proto__', 'g']]) {
        assert.throws(() => quantity(...args));
    }
});
test('D04 supplier date uses next café midnight including leap day', () => {
    assert.equal(expiry('2026-11-05').toISOString(), '2026-11-05T17:00:00.000Z');
    assert.equal(expiry('2024-02-29').toISOString(), '2024-02-29T17:00:00.000Z');
    for (const date of ['2026-02-29', '2026-04-31', 'garbage', '2026-11-05T00:00:00Z']) assert.throws(() => expiry(date));
});
test('D04 expiry boundary, quarantine and deterministic FEFO without input mutation', () => {
    const now = new Date('2026-11-05T17:00:00Z');
    const batch = (id, expirationDate, received = '2026-11-01') => ({ id, expirationDate: expirationDate === null ? null : new Date(expirationDate), receivedAt: new Date(received) });
    const input = [batch('z', '2026-11-07'), batch('b', '2026-11-06'), batch('a', '2026-11-06'), batch('older', '2026-11-06', '2026-10-01'), batch('boundary', now), batch('null', null), batch('bad', 'invalid')];
    assert.deepEqual(Array.from(rank(input, now), b => b.id), ['older', 'a', 'b', 'z']);
    assert.equal(input[0].id, 'z');
    assert.throws(() => rank(input, new Date('invalid')));
});
