const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');
const { artifactPath } = require('../../../scripts/artifact-path.cjs');

test('artifact root supports external writes and rejects escaping paths', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'cafe-artifact-'));
    try {
        const env = { CAFE_ARTIFACT_ROOT: root };
        const output = artifactPath('reports/probe.json', env);
        fs.mkdirSync(path.dirname(output), { recursive: true });
        fs.writeFileSync(output, '{"ok":true}');
        assert.deepEqual(JSON.parse(fs.readFileSync(output, 'utf8')), { ok: true });
        for (const invalid of ['../escape.json', '', root]) {
            assert.throws(() => artifactPath(invalid, env), /ARTIFACT_PATH_OUTSIDE_ROOT/);
        }
        assert.throws(() => artifactPath('report.json', { CAFE_ARTIFACT_ROOT: 'relative' }), /MUST_BE_ABSOLUTE/);
        assert.equal(artifactPath('logs/check.json', {}), path.resolve(__dirname, '../../../../cafe-project-artifacts/logs/check.json'));
    } finally {
        fs.rmSync(root, { recursive: true, force: true });
    }
});
