// KT14 migration-only verification: no DDL/DML mutation of existing cafedb.
// Real JWT HTTP staff denial + existing PostgreSQL metadata + migration lint.
// Opt-in: KT14_CAFEDB_CONFIRMED=YES node apps/api/tests/technical-kt14-event-guard.cafedb.cjs
'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs'), net = require('node:net');
const { randomUUID } = require('node:crypto');
const { execFileSync } = require('node:child_process');
require('dotenv').config({ path: 'apps/api/.env', quiet: true });
const serialize = value => JSON.stringify(value, (_key, item) =>
  typeof item === 'bigint' ? item.toString() : item, 2);
const docker = (args, timeout = 15000) => execFileSync('docker', args, {
  cwd: process.cwd(), timeout, windowsHide: true,
  encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe']
}).trim();
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const freePort = () => new Promise((resolve, reject) => {
  const listener = net.createServer();
  listener.once('error', reject);
  listener.listen(0, '127.0.0.1', () => {
    const port = listener.address().port;
    listener.close(() => resolve(port));
  });
});
async function main() {
  assert.equal(process.env.KT14_CAFEDB_CONFIRMED, 'YES');
  const runId = 'kt14-' + randomUUID(), baseDir = 'D:/KLTN/cafe-project-artifacts/reports/security';
  fs.mkdirSync(baseDir, { recursive: true });
  const beforePath = baseDir + '/KT14-' + runId + '-before.json';
  const afterPath = baseDir + '/KT14-' + runId + '-after.json';
  const reportPath = baseDir + '/KT14-' + runId + '.md';
  const output = { case: 'KT14', runId, startedAt: new Date().toISOString(),
    verdict: 'NOT_RUN', database: 'cafedb',
    migrationAppliedByTest: false, destructiveSqlExecuted: false, sourceChanged: false,
    requests: [], staticChecks: {}, pg: {} };
  const proxy = 'cafe-kt14-owned-' + randomUUID().slice(0, 10);
  output.proxy = { name: proxy, removed: false };
  let ownProxy = false, db, httpServer;
  const cleanProxy = () => {
    if (!ownProxy) return;
    try {
      docker(['stop', '--time', '2', proxy], 12000);
      ownProxy = false; output.proxy.removed = true;
    } catch (error) { output.proxy.cleanupError = String(error.message).slice(0, 200); }
  };
  process.on('exit', cleanProxy);
  const migrationPath = 'packages/database/prisma/schema/migrations/20261119133000_kt14_event_guard/migration.sql';
  try {
    const fullSql = fs.readFileSync(migrationPath, 'utf8');
    const sql = fullSql.split(/\r?\n/).filter(line => !line.trim().startsWith('--')).join('\n');
    const tables = ['PurchaseOrderEvent', 'LotEvent', 'StocktakeEntryHistory'];
    output.staticChecks = {
      migrationPath, expectedTables: tables,
      addsOnlyFunctionAndThreeTriggers: !/\b(DROP|ALTER|TRUNCATE|GRANT|REVOKE)\b/i.test(sql) &&
        (sql.match(/CREATE TRIGGER/g) || []).length === 3 &&
        (sql.match(/BEFORE UPDATE OR DELETE/g) || []).length === 3,
      failClosedSqlState23514: sql.includes("ERRCODE = '23514'"),
      allExactEventTablesNamed: tables.every(table =>
        sql.includes('ON "' + table + '"')),
      keepsLegitimateInserts: sql.includes('BEFORE UPDATE OR DELETE') &&
        !sql.includes('BEFORE INSERT'),
      eventServiceReferences: []
    };
    assert.ok(output.staticChecks.addsOnlyFunctionAndThreeTriggers);
    assert.ok(output.staticChecks.failClosedSqlState23514);
    assert.ok(output.staticChecks.allExactEventTablesNamed);
    assert.ok(output.staticChecks.keepsLegitimateInserts);
    const appSource = ['apps/api/src/modules/purchase/purchase-order.service.ts',
      'apps/api/src/modules/ingredient/ingredient-lot.service.ts',
      'apps/api/src/modules/inventory/stocktake.service.ts'];
    for (const source of appSource) {
      const content = fs.readFileSync(source, 'utf8');
      const model = source.includes('purchase-order') ? 'purchaseOrderEvent' :
        source.includes('ingredient-lot') ? 'lotEvent' : 'stocktakeEntryHistory';
      const create = new RegExp(model + '\\.create\\s*\\(');
      const mutation = new RegExp(model + '\\.(update|upsert|delete|updateMany|deleteMany)\\s*\\(');
      const check = { source, model, createPresent: create.test(content),
        illegalMutationReferences: mutation.test(content) };
      assert.ok(check.createPresent && !check.illegalMutationReferences,
        'Existing lifecycle is not append-only for ' + model);
      output.staticChecks.eventServiceReferences.push(check);
    }
    assert.equal(docker(['inspect', 'cafe_postgres', '--format', '{{.State.Running}}']),
      'true');
    const ip = JSON.parse(docker(['inspect', 'cafe_postgres',
      '--format', '{{json .NetworkSettings.Networks}}'])).bridge?.IPAddress;
    assert.ok(ip);
    const uri = new URL(process.env.DATABASE_URL);
    assert.equal(uri.pathname, '/cafedb');
    const port = await freePort();
    const proxyScript = [
      'const net=require("node:net");',
      'net.createServer(c=>{',
      'const u=net.connect(5432,process.env.PG_TARGET);',
      'c.on("error",()=>u.destroy());u.on("error",()=>c.destroy());',
      'c.pipe(u);u.pipe(c);',
      '}).listen(15432,"0.0.0.0");'
    ].join('');
    docker(['run', '--rm', '-d', '--name', proxy, '--network', 'bridge',
      '-p', '127.0.0.1:' + port + ':15432',
      '-e', 'PG_TARGET=' + ip, '--entrypoint', 'node', 'cafe-agent:local',
      '-e', proxyScript], 20000);
    ownProxy = true; output.proxy.localPort = port;
    uri.hostname = '127.0.0.1'; uri.port = String(port);
    process.env.DATABASE_URL = uri.toString();
    process.env.NODE_ENV = 'test';
    require('ts-node').register({ project: 'apps/api/tsconfig.json', transpileOnly: true });
    const { PrismaClient } = require('@prisma/client');
    db = new PrismaClient({ datasources: { db: { url: uri.toString() } } });
    let pg;
    for (let i = 0; i < 30; i++) {
      try {
        pg = (await db.$queryRawUnsafe('SELECT current_database() name'))[0];
        break;
      } catch (error) {
        if (i === 29) throw error;
        await sleep(120);
      }
    }
    assert.equal(pg.name, 'cafedb');
    const metadata = async () => db.$queryRawUnsafe(
      "SELECT c.relname AS table_name,c.relrowsecurity AS rls,"+
      "has_table_privilege(current_user,c.oid,'UPDATE') AS can_update,"+
      "COALESCE((SELECT json_agg(json_build_object('name',t.tgname,'enabled',t.tgenabled,'definition',pg_get_triggerdef(t.oid))) "+
      "FROM pg_trigger t WHERE t.tgrelid=c.oid AND NOT t.tgisinternal),'[]'::json) AS guards "+
      "FROM pg_class c JOIN pg_namespace n ON c.relnamespace=n.oid "+
      "WHERE n.nspname=current_schema() AND c.relkind='r' "+
      "AND c.relname IN ('PurchaseOrderEvent','LotEvent','StocktakeEntryHistory','InventoryTransaction') "+
      "ORDER BY c.relname");
    const before = await metadata();
    assert.equal(before.length, 4, 'Some event tables missing from current db');
    output.pg.baseline = before;
    fs.writeFileSync(beforePath, serialize({ runId, at: new Date().toISOString(),
      pg: { database: 'cafedb', tables: before }, migrationSqlSha: require('node:crypto')
        .createHash('sha256').update(fullSql).digest('hex') }), 'utf8');
    const admin = await db.user.findFirstOrThrow({
      where: { role: 'ADMIN', isActive: true }, select: { id: true, role: true, email: true }
    });
    const staff = await db.user.findFirstOrThrow({
      where: { role: 'STAFF', isActive: true }, select: { id: true, role: true, email: true }
    });
    const order = await db.purchaseOrder.findFirst({
      select: { id: true, status: true }, orderBy: { createdAt: 'desc' }
    });
    const express = require('express'), jwt = require('jsonwebtoken');
    const app = express(); app.use(express.json());
    app.use('/api/purchase-orders',
      require('../src/modules/purchase/purchase.route').purchaseOrderRoutes);
    app.use(require('../src/common/error-handler').errorHandler);
    httpServer = app.listen(0, '127.0.0.1');
    await new Promise(resolve => httpServer.once('listening', resolve));
    const base = 'http://127.0.0.1:' + httpServer.address().port + '/api/purchase-orders/';
    const request = async (method, url, role, data) => {
      const auth = jwt.sign(role === 'STAFF' ? staff : admin, process.env.JWT_SECRET,
        { expiresIn: '30m' });
      const res = await fetch(url, {
        method, headers: { authorization: 'Bearer ' + auth,
          'content-type': 'application/json' },
        body: data === undefined ? undefined : JSON.stringify(data)
      });
      const body = await res.json();
      output.requests.push({ method, role, path: new URL(url).pathname, status: res.status });
      return { status: res.status, data: body };
    };
    if (order) {
      const detail = await request('GET', base + order.id, 'ADMIN');
      assert.equal(detail.status, 200, 'Existing purchasing read lifecycle unavailable');
      const denied = await request('POST', base + order.id + '/dispatch',
        'STAFF', { requestId: randomUUID(), mode: 'UNKNOWN', reason: 'KT14 denied' });
      assert.equal(denied.status, 403, 'STAFF executed admin-only PO dispatch');
      output.pg.staffDispatchDenied = true;
      output.pg.sampleOrderStatus = order.status;
    } else {
      output.pg.sampleOrderStatus = 'NOT_VERIFIED_NO_EXISTING_PO';
    }
    const after = await metadata();
    assert.equal(serialize(after), serialize(before), 'Metadata changed without migration');
    output.pg.metadataUnchanged = true;
    output.pg.eventGuardsInstalled = before
      .filter(row => tables.includes(row.table_name))
      .every(row => row.guards.some(t => t.enabled === 'O' &&
        t.definition.includes('UPDATE') && t.definition.includes('DELETE')));
    output.verdict = output.pg.eventGuardsInstalled && output.pg.staffDispatchDenied ?
      'BACKEND_PASS' : 'PARTIAL';
    output.finding = output.pg.eventGuardsInstalled ?
      'Event append-only triggers already installed; staff dispatch denied. Test did not mutate historical rows.' :
      'Additive migration prepared and statically lifecycle-checked, but NOT APPLIED to shared cafedb; persistence-level protection remains pending deployment. The test performed only SELECTs and role-denied HTTP.';
    console.log('KT14 ' + output.verdict + ' migrationPrepared=true installed=' +
      output.pg.eventGuardsInstalled + ' staffDenied=' + output.pg.staffDispatchDenied);
  } catch (error) {
    output.verdict = 'PARTIAL';
    output.failure = String(error.stack ?? error.message).slice(0, 1700);
    process.exitCode = 1;
    console.error('KT14 PARTIAL ' + error.message);
  } finally {
    if (httpServer) await new Promise(resolve => httpServer.close(resolve));
    if (db) await db.$disconnect();
    cleanProxy();
    output.finishedAt = new Date().toISOString();
    fs.writeFileSync(afterPath, serialize(output), 'utf8');
    fs.writeFileSync(reportPath, [
      '# KT14 - Additive event immutability migration verification',
      '',
      'RunID: ' + runId,
      'Verdict: ' + output.verdict,
      'Migration: ' + migrationPath,
      'Migration applied to cafedb by test: NO',
      'Destructive SQL / ledger history writes: NONE',
      'Staff PO dispatch denied: ' + (output.pg.staffDispatchDenied ?? 'not verified'),
      'Event triggers installed currently: ' + (output.pg.eventGuardsInstalled ?? 'not verified'),
      'Owned proxy removed: ' + output.proxy.removed,
      '',
      'Scope: static SQL safety+code compatibility, real PostgreSQL metadata and',
      'real JWT role-denied HTTP against an existing order. Does not prove',
      'post-deployment trigger behavior until reviewed migration is applied.',
      '',
      'Before: ' + beforePath,
      'After: ' + afterPath,
      'Failure: ' + (output.failure || 'none')
    ].join('\r\n'), 'utf8');
    console.log(serialize({ runId, verdict: output.verdict, beforePath, afterPath,
      reportPath, proxyRemoved: output.proxy.removed, failure: output.failure }));
  }
}
main().catch(error => { console.error(error); process.exitCode = 2; });
