// Apply this exact additive DDL only; never deploy/replay historical migrations or schema-push cafedb.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { createHash } = require('node:crypto');
require('dotenv').config({ path: 'apps/api/.env', quiet: true });
require('dotenv').config({ quiet: true });
const { PrismaClient } = require('@prisma/client');
async function main() {
  assert.equal(process.env.LOT_MIGRATION_CONFIRMED, 'YES');
  const url = new URL(process.env.DATABASE_URL); assert.equal(url.pathname, '/cafedb');
  url.hostname = '127.0.0.1'; url.port = '55432';
  const db = new PrismaClient({ datasources: { db: { url: url.toString() } } });
  const guard = process.env.LOT_MIGRATION_GUARD === 'YES';
  const file = guard ? 'packages/database/prisma/schema/migrations/20261117161000_lot_receipt_guard/migration.sql' :
    'packages/database/prisma/schema/migrations/20261117160000_lot_lifecycle/migration.sql';
  const sql = fs.readFileSync(file, 'utf8');
  const out = { time: new Date().toISOString(), file, sha256: createHash('sha256').update(sql).digest('hex') };
  const evidenceFile = 'D:/KLTN/cafe-project-artifacts/reports/lot/lot-evidence.json';
  try {
    out.baseline = await db.$queryRaw`SELECT current_database() AS database, version() AS version,
      to_regclass('public._prisma_migrations')::text AS history, to_regclass('public."LotEvent"')::text AS events,
      to_regclass('public."LotReturn"')::text AS returns`;
    assert.equal(out.baseline[0].database, 'cafedb'); assert.match(out.baseline[0].version, /^PostgreSQL 15\./);
    if (guard) { assert.ok(out.baseline[0].events); assert.ok(out.baseline[0].returns); }
    else { assert.equal(out.baseline[0].events, null); assert.equal(out.baseline[0].returns, null); }
    if (out.baseline[0].history) {
      out.history = await db.$queryRawUnsafe('SELECT migration_name, finished_at, rolled_back_at FROM "_prisma_migrations" ORDER BY started_at');
      assert.ok(out.history.every(m => m.finished_at || m.rolled_back_at), 'Unresolved migration history blocks DDL');
    }
    out.columns = await db.$queryRaw`SELECT table_name, column_name, data_type FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name IN ('Ingredient','IngredientBatch','InventoryTransaction')
      AND column_name IN ('id','quantity','quantityRemaining','expirationDate','type','expiryClassification','expiryClassificationRequired','qualityStatus')
      ORDER BY table_name,column_name`;
    const additions = out.columns.filter(c => ['expiryClassification', 'expiryClassificationRequired', 'qualityStatus'].includes(c.column_name));
    assert.equal(additions.length, guard ? 3 : 0, 'Unexpected partial schema');
    for (const [table, column] of [['Ingredient', 'quantity'], ['IngredientBatch', 'quantityRemaining'], ['IngredientBatch', 'expirationDate'], ['InventoryTransaction', 'quantity']]) {
      assert.ok(out.columns.some(c => c.table_name === table && c.column_name === column), 'Unexpected baseline: ' + table + '.' + column);
    }
    out.transaction = await db.$transaction(async tx => {
      await tx.$executeRawUnsafe("SET LOCAL lock_timeout = '5s'");
      await tx.$executeRawUnsafe("SET LOCAL statement_timeout = '20s'");
      await tx.$executeRawUnsafe('LOCK TABLE "Ingredient", "IngredientBatch", "InventoryTransaction" IN SHARE ROW EXCLUSIVE MODE');
      const fingerprints = async () => Promise.all([
        tx.$queryRaw`SELECT count(*)::int AS count, md5(string_agg(md5((to_jsonb(i) - 'expiryClassification' - 'expiryClassificationRequired')::text), '' ORDER BY id)) AS hash FROM "Ingredient" i`,
        tx.$queryRaw`SELECT count(*)::int AS count, md5(string_agg(md5((to_jsonb(b) - 'qualityStatus')::text), '' ORDER BY id)) AS hash FROM "IngredientBatch" b`,
        tx.$queryRaw`SELECT count(*)::int AS count, md5(string_agg(md5(to_jsonb(t)::text), '' ORDER BY id)) AS hash FROM "InventoryTransaction" t`
      ]);
      const before = await fingerprints();
      const statements = (guard ? sql.split('-- @statement') : sql.split(';')).map(s => s.replace(/^--.*$/gm, '').trim()).filter(Boolean);
      const allowed = guard ? /^(CREATE FUNCTION|CREATE TRIGGER)/ : /^(ALTER TABLE .* (ADD COLUMN|ALTER COLUMN .* SET DEFAULT|ADD CONSTRAINT)|CREATE TABLE|CREATE INDEX)/s;
      assert.ok(statements.every(s => allowed.test(s)), 'Only additive DDL authorized');
      for (const statement of statements) await tx.$executeRawUnsafe(statement);
      const after = await fingerprints(); assert.deepEqual(after, before, 'Existing persisted fields must remain byte-equivalent');
      const legacy = await tx.$queryRaw`SELECT count(*)::int AS count FROM "Ingredient" WHERE "expiryClassification" IS NOT NULL OR "expiryClassificationRequired" <> false`;
      if (!guard) assert.equal(legacy[0].count, 0);
      return { before, after, statements: statements.length, existingRowsUnchanged: true };
    }, { timeout: 60000 });
    out.verdict = 'PASS'; console.log(JSON.stringify({ verdict: out.verdict, baseline: out.baseline, transaction: out.transaction }));
  } catch (e) { out.verdict = 'BLOCKED'; out.error = e.message; process.exitCode = 1; console.error(e.message); }
  finally { await db.$disconnect(); const ledger = JSON.parse(fs.readFileSync(evidenceFile, 'utf8')); (ledger.migrations ??= []).push(out); fs.writeFileSync(evidenceFile, JSON.stringify(ledger, null, 2)); }
}
main().catch(e => { console.error(e.message); process.exitCode = 1; });
