// Offline inventory: reads source only; never imports the application or connects to services.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { execFileSync } = require('node:child_process');
const root = path.resolve(__dirname, '../../../..');
const revision = process.argv[2] || 'r1';
if (!['r1', 'r2'].includes(revision)) throw new Error('Expected r1 or r2');
const read = p => fs.readFileSync(path.join(root, p), 'utf8');
const hash = p => crypto.createHash('sha256').update(fs.readFileSync(path.join(root, p))).digest('hex');
function walk(dir, ext) {
    return fs.readdirSync(path.join(root, dir), { withFileTypes: true }).flatMap(e => {
        const p = `${dir}/${e.name}`;
        return e.isDirectory() ? walk(p, ext) : p.endsWith(ext) ? [p] : [];
    }).sort();
}
const declarations = p => Object.fromEntries(['model', 'enum'].map(kind => [kind,
    [...read(p).matchAll(new RegExp(`^${kind}\\s+(\\w+)`, 'gm'))].map(m => m[1])]));
const schema = walk('packages/database/prisma/schema', '.prisma');
const sql = [...walk('packages/database/prisma/schema/migrations', '.sql'), ...walk('packages/database/prisma/migration_27_tables', '.sql')];
const inputs = [...schema, ...sql, ...walk('apps/api/src', '.ts'), ...walk('apps/agent/src', '.ts'), ...walk('apps/api/tests', '.cjs'), ...walk('apps/agent/tests', '.cjs'), ...walk('docs/KLTN_PLAN/WEEK_04_AUDIT', '.md'),
    ...[1,2,3,4,5].map(w => `docs/KLTN_PLAN/WEEK_0${w}.md`),
    'package.json','apps/api/package.json','apps/agent/package.json','apps/web/package.json','packages/database/package.json','apps/web/src/routes/AppRoutes.tsx','docs/PROJECT_SOURCE_ANALYSIS.md','docs/PROJECT_VERIFICATION.md','docs/KLTN_PLAN/LOCAL_DEVELOPMENT_SETUP.md','docs/KLTN_PLAN/PROJECT_BASELINE.md','docs/KLTN_PLAN/REQUIREMENTS_TRACEABILITY.md'];
const schemaFiles = Object.fromEntries(schema.map(p => [p, declarations(p)]));
const generated = 'node_modules/.prisma/client/schema.prisma';
const result = {
    revision,
    captured_at: new Date().toISOString(), display_timezone: 'Asia/Saigon',
    head: execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim(),
    node: process.version,
    schema_files: schemaFiles,
    source_model_count: Object.values(schemaFiles).reduce((n,v) => n + v.model.length, 0),
    source_enum_count: Object.values(schemaFiles).reduce((n,v) => n + v.enum.length, 0),
    generated_client: declarations(generated), generated_client_schema_sha256: hash(generated),
    sql_inventory: Object.fromEntries(sql.map(p => [p, { sha256: hash(p), create_table_statements: [...read(p).matchAll(/^CREATE TABLE\b/gm)].length, create_type_statements: [...read(p).matchAll(/CREATE TYPE\s+"/g)].length, executed: false }])),
    source_sha256: Object.fromEntries([...new Set(inputs)].sort().map(p => [p, hash(p)])),
    database_access: revision === 'r2' ? 'BLOCKED_BY_USER_CHOICE; no authentication, probe or query attempted' : 'NOT_ATTEMPTED; authorization, confirmed target and dedicated read-only role pending'
};
fs.writeFileSync(path.join(__dirname, revision === 'r2' ? 'source-inventory-r2.json' : 'source-inventory.json'), JSON.stringify(result, null, 2) + '\n');
console.log(JSON.stringify({ sourceModels: result.source_model_count, sourceEnums: result.source_enum_count, generatedModels: result.generated_client.model.length, generatedEnums: result.generated_client.enum.length, hashedInputs: Object.keys(result.source_sha256).length }));
