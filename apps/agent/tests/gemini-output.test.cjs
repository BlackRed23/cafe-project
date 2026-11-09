// Real Gemini adapter, mocked SDK/environment: no provider, credentials or database.
const assert = require('node:assert/strict');
const { test } = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');

const valid = () => ({ recommendedQuantity: 12, recommendedSupplierId: 'supplier-1', confidence: 0.8, reasoning: 'Stock is low.', emailDraft: 'Please quote.' });
function fixture(text, failure) {
    let calls = 0;
    const exports = {};
    const source = fs.readFileSync(path.resolve(__dirname, '../src/services/gemini.service.ts'), 'utf8');
    vm.runInNewContext(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, {
        exports,
        require(name) {
            if (name === '../config/env') return { env: { GEMINI_API_KEY: 'synthetic-test-key', GEMINI_MODEL: 'mock-model' } };
            if (name === '@google/generative-ai') return { GoogleGenerativeAI: class {
                getGenerativeModel() { return { generateContent: async () => {
                    calls++;
                    if (failure) throw failure;
                    return { response: { text: () => text } };
                } }; }
            } };
            throw new Error(`Unexpected import: ${name}`);
        }
    });
    return { service: exports.geminiService, calls: () => calls };
}

test('valid structured response and fenced JSON retain typed values', async () => {
    for (const text of [JSON.stringify(valid()), '```json\n' + JSON.stringify(valid()) + '\n```']) {
        const f = fixture(text);
        const actual = await f.service.getRecommendation('synthetic prompt');
        assert.deepEqual(JSON.parse(JSON.stringify(actual)), valid());
        assert.equal(f.calls(), 1);
    }
});

for (const [field, badValues] of Object.entries({
    recommendedQuantity: [null, true, '12', 0, -1, 1e309],
    confidence: [null, '0.8', -0.1, 1.1],
    recommendedSupplierId: [null, 7, '', '   '],
    reasoning: [null, {}, '', '   '],
    emailDraft: [null, {}]
})) {
    test(`invalid ${field} types/ranges fail without exposing provider content`, async () => {
        for (const value of badValues) {
            const payload = { ...valid(), [field]: value, providerPrivateField: 'PRIVATE_RESPONSE_MARKER' };
            const f = fixture(JSON.stringify(payload));
            await assert.rejects(f.service.getRecommendation('synthetic prompt'), error => {
                assert.equal(error.message.includes('PRIVATE_RESPONSE_MARKER'), false);
                return /invalid|valid/i.test(error.message);
            });
        }
    });
}

test('malformed JSON, nonobjects and missing fields reject with sanitized errors', async () => {
    for (const text of ['PRIVATE_RESPONSE_MARKER invalid JSON', 'null', '[]', '{}', 'true', '"PRIVATE_RESPONSE_MARKER"', JSON.stringify(valid()).replace(':12,', ':1e999,')]) {
        await assert.rejects(fixture(text).service.getRecommendation('synthetic prompt'), error => {
            assert.equal(error.message.includes('PRIVATE_RESPONSE_MARKER'), false);
            return /invalid|valid/i.test(error.message);
        });
    }
});

test('SDK failure details are not propagated to callers', async () => {
    await assert.rejects(fixture('', new Error('PRIVATE_PROVIDER_ERROR_MARKER')).service.getRecommendation('synthetic prompt'), error => {
        assert.equal(error.message.includes('PRIVATE_PROVIDER_ERROR_MARKER'), false);
        return /failed/i.test(error.message);
    });
});
