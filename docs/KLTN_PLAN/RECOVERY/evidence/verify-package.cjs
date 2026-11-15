// Validate recovery evidence without application imports, database access or network.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const assert = require('node:assert/strict');
const root = path.resolve(__dirname, '../../../..');
const recovery = path.dirname(__dirname);
const revision = process.argv[2] || 'r1';
if (!['r1', 'r2'].includes(revision)) throw new Error('Expected r1 or r2');
const snapshot = JSON.parse(fs.readFileSync(path.join(__dirname, revision === 'r2' ? 'source-inventory-r2.json' : 'source-inventory.json'), 'utf8'));
const hash = p => crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');
for (const [name, expected] of Object.entries(snapshot.source_sha256)) {
    assert.equal(hash(path.join(root, name)), expected, `Input changed since snapshot: ${name}`);
}
const initial = JSON.parse(fs.readFileSync(path.join(__dirname, 'source-inventory.json'), 'utf8'));
for (const [name, expected] of Object.entries(initial.source_sha256).filter(([name]) => name.startsWith('docs/'))) {
    assert.equal(hash(path.join(root, name)), expected, `Historical document changed: ${name}`);
}
const required = ['BACKLOG_W01_W04.md','DEPENDENCY_MATRIX.md','RECOVERY_EXECUTION.md','TEST_EVIDENCE.md','ACCEPTANCE_STATUS.md'];
for (const file of required) assert.ok(fs.statSync(path.join(recovery, file)).size > 0);
const backlog = fs.readFileSync(path.join(recovery, required[0]), 'utf8');
const taskRows = backlog.split(/\r?\n/).filter(line => /^\| W0[1-4]-T0[1-4] \/ P[012] \/ /.test(line));
assert.equal(taskRows.length, 16);
assert.equal(new Set(taskRows.map(line => line.match(/W\d+-T\d+/)[0])).size, 16);
const counts = Object.fromEntries(['VERIFIED_COMPLETE', 'PARTIAL', 'BLOCKED'].map(s => [s, taskRows.filter(line => line.split('|')[1].trim().endsWith(s)).length]));
assert.deepEqual(counts, { VERIFIED_COMPLETE: 2, PARTIAL: 5, BLOCKED: 9 });
for (const file of fs.readdirSync(recovery).filter(f => f.endsWith('.md'))) {
    const text = fs.readFileSync(path.join(recovery, file), 'utf8');
    for (const match of text.matchAll(/\[[^\]]*\]\(([^)]+)\)/g)) {
        const target = match[1].split('#')[0];
        if (target && !/^https?:/.test(target)) assert.ok(fs.existsSync(path.resolve(recovery, target)), `Broken link in ${file}: ${target}`);
    }
}
const runDefinitions = [
    ['R-BASELINE', 'regression-before.log', 0, 72, 0],
    ['R-INTERMEDIATE', 'regression-after.log', 1, 73, 1],
    ['R-FINAL', 'regression-final.log', 0, 73, 0],
    ['R-API-TYPES', 'api-typecheck.log', 0],
    ['R-AGENT-TYPES', 'agent-typecheck.log', 0],
];
if (revision === 'r2') runDefinitions.push(
    ['R2-TARGETED-BEFORE', 'r2-targeted-before.log', 1, 11, 9],
    ['R2-TARGETED-AFTER', 'r2-targeted-after.log', 0, 11, 0],
    ['R2-REGRESSION-84', 'r2-regression-84.log', 0, 84, 0],
    ['R2-SIDE-EFFECTS-INTERMEDIATE', 'r2-side-effects.log', 1, 31, 1],
    ['R2-FINAL', 'r2-regression-final.log', 0, 90, 0],
    ['R2-API-TYPES', 'r2-api-typecheck.log', 0],
    ['R2-AGENT-TYPES', 'r2-agent-typecheck.log', 0]
);
const runs = runDefinitions.map(([id, file, exitCode, tests, failures]) => {
    const p = path.join(__dirname, file);
    const text = fs.readFileSync(p, 'utf8');
    if (tests !== undefined) {
        assert.match(text, new RegExp(`tests ${tests}\\b`));
        assert.match(text, new RegExp(`fail ${failures}\\b`));
    } else assert.equal(text.trim(), '');
    return { id, file, exit_code_observed_in_tool_execution: exitCode, tests, failures,
        log_written_at_utc: fs.statSync(p).mtime.toISOString(), sha256: hash(p) };
});
const artifacts = Object.fromEntries(fs.readdirSync(recovery).filter(f => f.endsWith('.md')).map(f => [f, hash(path.join(recovery, f))]));
const result = { verified_at_utc: new Date().toISOString(), display_timezone: 'Asia/Saigon',
    revision,
    required_reports: required, task_counts: counts, remaining: 14, source_hashes_verified: Object.keys(snapshot.source_sha256).length,
    historical_weekly_and_audit_hashes_unchanged_since_snapshot: true,
    markdown_links: 'PASS', database_access: revision === 'r2' ? 'BLOCKED_BY_USER_CHOICE; NOT_ATTEMPTED' : 'NOT_ATTEMPTED', runs, artifact_sha256: artifacts };
fs.writeFileSync(path.join(__dirname, revision === 'r2' ? 'execution-metadata-r2.json' : 'execution-metadata.json'), JSON.stringify(result, null, 2) + '\n');
console.log(JSON.stringify({ validation: 'PASS', tasks: counts, sourceHashes: result.source_hashes_verified, links: 'PASS', databaseAccess: 'NOT_ATTEMPTED' }));
