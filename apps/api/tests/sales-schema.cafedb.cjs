const assert = require('node:assert/strict');
const fs = require('node:fs');
require('dotenv').config({ path: 'apps/api/.env', quiet: true }); require('dotenv').config({ quiet: true });
assert.equal(process.env.SALES_CAFEDB_CONFIRMED, 'YES');
const url = new URL(process.env.DATABASE_URL); assert.equal(url.pathname, '/cafedb'); url.hostname = '127.0.0.1'; url.port = '55432';
const db = new (require('@prisma/client').PrismaClient)({ datasources: { db: { url: url.toString() } } });
(async () => {
  const baseline = { identity: await db.$queryRaw`SELECT current_database() AS database, version() AS version`, migrations: await db.$queryRaw`SELECT to_regclass('public._prisma_migrations')::text AS table`, enums: await db.$queryRaw`SELECT enumlabel FROM pg_enum JOIN pg_type ON pg_type.oid=enumtypid WHERE typname='OrderStatus' ORDER BY enumsortorder`, columns: await db.$queryRaw`SELECT column_name, data_type FROM information_schema.columns WHERE table_name='Order' ORDER BY ordinal_position` };
  if (baseline.migrations[0].table) {
    baseline.history = await db.$queryRaw`SELECT migration_name, checksum, finished_at, rolled_back_at FROM _prisma_migrations`;
    assert.ok(baseline.history.every(m => m.finished_at || m.rolled_back_at), 'Unfinished migration: additive deployment blocked');
    for (const m of baseline.history.filter(m => !m.rolled_back_at)) {
      const source = fs.readFileSync(`packages/database/prisma/schema/migrations/${m.migration_name}/migration.sql`);
      assert.equal(require('node:crypto').createHash('sha256').update(source).digest('hex'), m.checksum, 'Migration checksum mismatch: ' + m.migration_name);
    }
    baseline.checksumsMatch = true;
  }
  fs.writeFileSync('D:/KLTN/cafe-project-artifacts/reports/sales/schema-baseline.json', JSON.stringify(baseline, null, 2));
  console.log(JSON.stringify(baseline));
  if (process.env.SALES_APPLY_SCHEMA === 'YES') {
    assert.ok(baseline.enums.some(e => e.enumlabel === 'PROCESSING') && baseline.columns.some(c => c.column_name === 'stockDeductedAt'));
    assert.ok(baseline.checksumsMatch, 'Verified migration history required');
    process.env.DATABASE_URL = url.toString();
    const r = require('node:child_process').spawnSync(process.execPath, ['node_modules/prisma/build/index.js', 'migrate', 'deploy', '--schema', 'packages/database/prisma/schema'], { env: process.env, encoding: 'utf8' });
    console.log(r.stdout); assert.equal(r.status, 0, r.stderr);
  }
})().catch(e => { console.error(e.message); process.exitCode = 1; }).finally(() => db.$disconnect());
