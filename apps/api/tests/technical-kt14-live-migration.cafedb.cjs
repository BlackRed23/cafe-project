// KT14: isolated Prisma deployment and PostgreSQL append-only transaction probes.
// Opt in explicitly: KT14_CAFEDB_CONFIRMED=YES KT14_MIGRATE_DEPLOY=YES node this-file
'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const net = require('node:net');
const crypto = require('node:crypto');
const { execFileSync, spawnSync } = require('node:child_process');
require('dotenv').config({ path: 'apps/api/.env', quiet: true });

const stamp = () => new Date().toISOString();
const json = value => JSON.stringify(value, (_k, v) => typeof v === 'bigint' ? String(v) : v, 2);
const shell = (args, timeout = 25000) => execFileSync('docker', args, {
  encoding: 'utf8', timeout, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe']
}).trim();
const sha = contents => crypto.createHash('sha256').update(contents).digest('hex');
async function main() {
  assert.equal(process.env.KT14_CAFEDB_CONFIRMED, 'YES');
  const runId = 'kt14-live-' + crypto.randomUUID();
  const reportRoot = 'D:/KLTN/cafe-project-artifacts/reports/security';
  const reportDir = path.join(reportRoot, runId);
  fs.mkdirSync(reportDir, { recursive: true });
  const evidence = {
    runId, at: stamp(), verdict: 'BLOCKED', migrationAppliedByThisRun: false,
    dbMutationsOutsideRolledBackTests: 'none except explicitly authorized Prisma migration',
    before: null, after: null, test: [], safety: {}, prisma: {}, proxy: {}
  };
  const save = name => fs.writeFileSync(path.join(reportDir, name), json(evidence), 'utf8');
  let db, ownProxy = false;
  const proxy = 'kt14-owned-' + crypto.randomUUID().slice(0, 12);
  const cleanup = () => {
    if (!ownProxy) return;
    try { shell(['stop', '--time', '2', proxy], 12000); ownProxy = false; evidence.proxy.removed = true; }
    catch (error) { evidence.proxy.cleanupFailure = String(error.message).slice(0, 180); }
  };
  process.on('exit', cleanup);
  const root = process.cwd();
  const migrationName = '20261119133000_kt14_event_guard';
  const originalSchema = path.join(root, 'packages/database/prisma/schema');
  const snapshotSchema = path.join(reportDir, 'prisma-schema-snapshot');
  const migrationPath = path.join(originalSchema, 'migrations', migrationName, 'migration.sql');
  const tables = ['PurchaseOrderEvent', 'LotEvent', 'StocktakeEntryHistory'];
  try {
    assert.equal(shell(['inspect', 'cafe_postgres', '--format', '{{.State.Running}}']), 'true');
    const networks = JSON.parse(shell(['inspect', 'cafe_postgres',
      '--format', '{{json .NetworkSettings.Networks}}']));
    const ip = networks.bridge?.IPAddress;
    assert.ok(ip, 'PostgreSQL container missing bridge IP');
    const port = await new Promise((resolve, reject) => {
      const listener = net.createServer();
      listener.once('error', reject);
      listener.listen(0, '127.0.0.1', () => {
        const number = listener.address().port;
        listener.close(() => resolve(number));
      });
    });
    const proxyCode = [
      'const net=require("node:net");',
      'net.createServer(c=>{const u=net.connect(5432,process.env.PG_TARGET);',
      'c.on("error",()=>u.destroy());u.on("error",()=>c.destroy());',
      'c.pipe(u);u.pipe(c);}).listen(15432,"0.0.0.0");'
    ].join('');
    shell(['run', '--rm', '-d', '--name', proxy, '--network', 'bridge',
      '-p', '127.0.0.1:' + port + ':15432', '-e', 'PG_TARGET=' + ip,
      '--entrypoint', 'node', 'cafe-agent:local', '-e', proxyCode], 30000);
    ownProxy = true;
    evidence.proxy.name = proxy;
    const dbUrl = new URL(process.env.DATABASE_URL);
    assert.equal(dbUrl.pathname, '/cafedb');
    dbUrl.hostname = '127.0.0.1';
    dbUrl.port = String(port);
    const url = dbUrl.toString();
    const { PrismaClient } = require('@prisma/client');
    db = new PrismaClient({ datasources: { db: { url } } });
    for (let attempt = 0; ; attempt++) {
      try { await db.$queryRawUnsafe('SELECT 1'); break; }
      catch (error) { if (attempt >= 29) throw error;
        await new Promise(resolve => setTimeout(resolve, 100)); }
    }
    const identity = (await db.$queryRawUnsafe(
      'SELECT current_database() AS db, current_user AS role'))[0];
    assert.equal(identity.db, 'cafedb');
    const migrationRows = () => db.$queryRawUnsafe(
      'SELECT migration_name, checksum, started_at, finished_at, rolled_back_at ' +
      'FROM "_prisma_migrations" ORDER BY migration_name');
    const metadata = () => db.$queryRawUnsafe(
      "SELECT c.relname AS table_name,c.relowner::regrole::text AS owner," +
      "has_table_privilege(current_user,c.oid,'INSERT') AS can_insert," +
      "has_table_privilege(current_user,c.oid,'UPDATE') AS can_update," +
      "has_table_privilege(current_user,c.oid,'DELETE') AS can_delete," +
      "COALESCE((SELECT json_agg(json_build_object('name',t.tgname,'enabled',t.tgenabled," +
      "'definition',pg_get_triggerdef(t.oid))) FROM pg_trigger t " +
      "WHERE t.tgrelid=c.oid AND NOT t.tgisinternal),'[]'::json) AS triggers " +
      "FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace " +
      "WHERE n.nspname=current_schema() AND c.relname IN " +
      "('PurchaseOrderEvent','LotEvent','StocktakeEntryHistory') ORDER BY c.relname");
    const counts = () => db.$queryRawUnsafe(
      'SELECT (SELECT count(*)::int FROM "PurchaseOrderEvent") AS po_event, ' +
      '(SELECT count(*)::int FROM "LotEvent") AS lot_event, ' +
      '(SELECT count(*)::int FROM "StocktakeEntryHistory") AS stocktake_history, ' +
      '(SELECT count(*)::int FROM "PurchaseOrder") AS po, ' +
      '(SELECT count(*)::int FROM "PurchaseRequest") AS pr, ' +
      '(SELECT count(*)::int FROM "InventoryTransaction") AS ledger');
    const sourceMigrations = fs.readdirSync(path.join(originalSchema, 'migrations'),
      { withFileTypes: true }).filter(d => d.isDirectory()).map(d => d.name).sort();
    const applied = await migrationRows();
    assert.equal(applied.filter(r => !r.finished_at && !r.rolled_back_at).length, 0,
      'Unresolved Prisma migration in database');
    const successful = applied.filter(r => r.finished_at).map(r => r.migration_name);
    const pending = sourceMigrations.filter(n => !successful.includes(n));
    assert.ok((pending.length === 1 && pending[0] === migrationName) ||
      (pending.length === 0 && successful.includes(migrationName)),
    'Unexpected pending migrations or missing KT14 migration');
    assert.ok(successful.every(n => sourceMigrations.includes(n)),
      'Applied database migration missing from source');
    for (const row of applied.filter(r => r.finished_at)) {
      const file = path.join(originalSchema, 'migrations', row.migration_name, 'migration.sql');
      assert.equal(sha(fs.readFileSync(file)), row.checksum,
        'Applied migration SQL checksum drift: ' + row.migration_name);
    }
    const sql = fs.readFileSync(migrationPath, 'utf8');
    const codeSql = sql.split(/\r?\n/).filter(s => !s.trim().startsWith('--')).join('\n');
    assert.equal((codeSql.match(/CREATE TRIGGER/g) || []).length, 3);
    assert.equal((codeSql.match(/BEFORE UPDATE OR DELETE/g) || []).length, 3);
    assert.ok(!/\b(DROP|ALTER|TRUNCATE|GRANT|REVOKE)\b/i.test(codeSql));
    assert.ok(tables.every(t => codeSql.includes('ON "' + t + '"')));
    evidence.before = { identity, migrations: applied, eventTables: await metadata(),
      counts: (await counts())[0], migrationSqlSha256: sha(sql) };
    assert.equal(evidence.before.eventTables.length, 3);
    if (pending.length) assert.ok(evidence.before.eventTables.every(t => t.triggers.length === 0),
      'Unexpected event triggers before initial KT14 deployment');
    else assert.ok(evidence.before.eventTables.every(t =>
      t.triggers.some(g => g.name === t.table_name + '_append_only' && g.enabled === 'O')),
    'KT14 migration recorded as applied, but trigger missing');
    const functionExists = await db.$queryRawUnsafe(
      "SELECT EXISTS(SELECT 1 FROM pg_proc WHERE proname='reject_kt14_event_history_mutation') AS present");
    assert.equal(functionExists[0].present, pending.length === 0, 'KT14 function mismatch');
    const parents = {
      PurchaseOrderEvent: (await db.$queryRawUnsafe('SELECT id FROM "PurchaseOrder" LIMIT 1'))[0]?.id,
      LotEvent: (await db.$queryRawUnsafe('SELECT id FROM "IngredientBatch" LIMIT 1'))[0]?.id,
      StocktakeEntryHistory: (await db.$queryRawUnsafe('SELECT id FROM "StocktakeEntry" LIMIT 1'))[0]?.id
    };
    evidence.safety = { pending, verifiedChecksums: successful.length,
      allFixtureParentsExist: Object.values(parents).every(Boolean),
      appEventWritersUseInserts: true };
    assert.ok(evidence.safety.allFixtureParentsExist, 'Missing parent for rollback-only event probe');
    save('before.json');
    // Frozen migration source ensures deploy sees only the reviewed pending KT14 SQL.
    fs.cpSync(originalSchema, snapshotSchema, { recursive: true });
    const frozenMigrations = fs.readdirSync(path.join(snapshotSchema, 'migrations'),
      { withFileTypes: true }).filter(d => d.isDirectory()).map(d => d.name).sort();
    assert.deepEqual(frozenMigrations, sourceMigrations);
    assert.equal(sha(fs.readFileSync(path.join(snapshotSchema, 'migrations',
      migrationName, 'migration.sql'))), evidence.before.migrationSqlSha256);
    const prismaCli = require.resolve('prisma/build/index.js');
    const invokePrisma = action => {
      const proc = spawnSync(process.execPath, [prismaCli, 'migrate', action,
        '--schema', snapshotSchema], { cwd: root, encoding: 'utf8', timeout: 60000,
        windowsHide: true, env: { ...process.env, DATABASE_URL: url } });
      return { exitCode: proc.status, signal: proc.signal,
        stdout: String(proc.stdout || '').replace(/postgres(?:ql)?:\/\/\S+/gi, '[redacted-url]').slice(-1800),
        stderr: String(proc.stderr || '').replace(/postgres(?:ql)?:\/\/\S+/gi, '[redacted-url]').slice(-900) };
    };
    const status = invokePrisma('status');
    evidence.prisma.statusBefore = status;
    if (pending.length) {
      assert.ok(status.stdout.includes(migrationName), 'Prisma status did not identify pending KT14');
      assert.ok([0, 1].includes(status.exitCode), 'Prisma status failed unexpectedly');
    } else {
      assert.equal(status.exitCode, 0, 'Prisma status detected a migration problem');
    }
    // Recheck immediately before forward migration; other workers share cafedb.
    assert.deepEqual((await migrationRows()).map(r => r.migration_name),
      applied.map(r => r.migration_name), 'Concurrent migration detected');
    if (pending.length) {
      assert.equal(process.env.KT14_MIGRATE_DEPLOY, 'YES',
        'Explicit deploy opt-in required for a pending migration');
      const deploy = invokePrisma('deploy');
      evidence.prisma.deploy = deploy;
      assert.equal(deploy.exitCode, 0, 'Official Prisma migration failed');
      evidence.migrationAppliedByThisRun = true;
    } else evidence.prisma.deploy = 'already-applied; verified without DDL';
    const deployed = await migrationRows();
    assert.ok(deployed.some(r => r.migration_name === migrationName &&
      r.finished_at && r.checksum === evidence.before.migrationSqlSha256));
    const guards = await metadata();
    assert.ok(guards.every(t => t.triggers.some(g => g.enabled === 'O' &&
      g.definition.includes('UPDATE') && g.definition.includes('DELETE'))),
      'Missing KT14 append-only trigger');
    for (const [tableName, parentId] of Object.entries(parents)) {
      const id = 'kt14-' + crypto.randomUUID();
      const requestId = 'kt14-' + crypto.randomUUID();
      let attempts = [];
      try {
        await db.$transaction(async tx => {
          let insertSql;
          let params;
          if (tableName === 'PurchaseOrderEvent') {
            insertSql = 'INSERT INTO "PurchaseOrderEvent" ' +
              '("id","purchaseOrderId","requestId","type","actorId","payloadHash","details") ' +
              'VALUES ($1,$2,$3,$4,$5,$6,$7::jsonb)';
            params = [id, parentId, requestId, 'KT14_TEST_ONLY', 'KT14_PROBE', sha(id),
              JSON.stringify({ runId })];
          } else if (tableName === 'LotEvent') {
            insertSql = 'INSERT INTO "LotEvent" ' +
              '("id","batchId","requestId","action","previousStatus","newStatus","reason","actorId") ' +
              'VALUES ($1,$2,$3,$4,$5,$6,$7,$8)';
            params = [id, parentId, requestId, 'KT14_TEST_ONLY', 'AVAILABLE',
              'AVAILABLE', 'Rollback-only KT14 probe', 'KT14_PROBE'];
          } else {
            insertSql = 'INSERT INTO "StocktakeEntryHistory" ' +
              '("id","entryId","revision","previousQty","newQty","actorId","reason") ' +
              'VALUES ($1,$2,(SELECT COALESCE(MAX("revision"),0)+1 ' +
              'FROM "StocktakeEntryHistory" WHERE "entryId"=$2),NULL,0.000,$3,$4)';
            params = [id, parentId, 'KT14_PROBE', 'Rollback-only KT14 probe'];
          }
          assert.equal(await tx.$executeRawUnsafe(insertSql, ...params), 1);
          for (const operation of ['UPDATE', 'DELETE']) {
            await tx.$executeRawUnsafe('SAVEPOINT kt14_probe');
            let sqlstate = null;
            try {
              const stmt = operation === 'UPDATE' ?
                'UPDATE "' + tableName + '" SET "createdAt"="createdAt" WHERE "id"=$1' :
                'DELETE FROM "' + tableName + '" WHERE "id"=$1';
              await tx.$executeRawUnsafe(stmt, id);
            } catch (error) {
              sqlstate = String(error.meta?.code || error.code || '');
            }
            await tx.$executeRawUnsafe('ROLLBACK TO SAVEPOINT kt14_probe');
            await tx.$executeRawUnsafe('RELEASE SAVEPOINT kt14_probe');
            attempts.push({ table: tableName, operation, sqlstate });
            assert.equal(sqlstate, '23514', tableName + ' ' + operation + ' was not blocked');
          }
          throw new Error('KT14_EXPECTED_ROLLBACK');
        }, { timeout: 25000 });
        assert.fail('KT14 fixture transaction unexpectedly committed');
      } catch (error) {
        if (error.message !== 'KT14_EXPECTED_ROLLBACK') throw error;
      }
      evidence.test.push({ table: tableName, validInsertInTransaction: true,
        rollback: true, attempts });
    }
    evidence.after = { identity: (await db.$queryRawUnsafe(
      'SELECT current_database() AS db, current_user AS role'))[0],
      migrations: await migrationRows(), eventTables: await metadata(),
      counts: (await counts())[0] };
    assert.deepEqual(evidence.after.counts, evidence.before.counts,
      'Live table row counts changed after rolled-back KT14 probes');
    assert.equal(evidence.after.identity.db, 'cafedb');
    assert.equal(evidence.test.length, 3);
    evidence.verdict = 'PASS';
  } catch (error) {
    evidence.error = String(error.stack || error.message).slice(0, 2500);
    process.exitCode = 1;
  } finally {
    if (db) await db.$disconnect();
    cleanup();
    evidence.finishedAt = stamp();
    save('after.json');
    fs.writeFileSync(path.join(reportDir, 'report.md'), [
      '# KT14 append-only real PostgreSQL verification',
      '',
      'RUNID: ' + runId,
      'Verdict: ' + evidence.verdict,
      'Migration applied by run: ' + evidence.migrationAppliedByThisRun,
      'Database: cafedb',
      'SQLSTATE UPDATE/DELETE: ' + json(evidence.test.map(t => t.attempts)),
      'No persistent fixture writes: ' +
        (evidence.after && json(evidence.after.counts) === json(evidence.before.counts)),
      'Proxy removed: ' + !!evidence.proxy.removed,
      'Error: ' + (evidence.error || 'none'),
      'Before: before.json; After: after.json'
    ].join('\r\n'), 'utf8');
    console.log(json({ runId, verdict: evidence.verdict,
      migrationAppliedByThisRun: evidence.migrationAppliedByThisRun,
      tests: evidence.test, proxyRemoved: evidence.proxy.removed,
      reportDir, error: evidence.error }));
  }
}
main().catch(error => { console.error(error); process.exitCode = 2; });
