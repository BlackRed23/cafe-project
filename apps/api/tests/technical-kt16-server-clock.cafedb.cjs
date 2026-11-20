// KT16: maliciously inverted client timestamps, server PostgreSQL ledger order.
// No host clock changes. Requires explicit real cafedb opt-in, creates unique fixture.
// Run: KT16_CAFEDB_CONFIRMED=YES node apps/api/tests/technical-kt16-server-clock.cafedb.cjs
'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs'), net = require('node:net');
const { randomUUID } = require('node:crypto');
const { execFileSync } = require('node:child_process');
require('dotenv').config({ path: 'apps/api/.env', quiet: true });
const json = item => JSON.stringify(item, (_key, value) =>
  typeof value === 'bigint' ? value.toString() : value, 2);
const docker = (args, timeout = 15000) => execFileSync('docker', args, {
  cwd: process.cwd(), encoding: 'utf8', timeout, windowsHide: true,
  stdio: ['ignore', 'pipe', 'pipe']
}).trim();
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
const port = () => new Promise((resolve, reject) => {
  const s = net.createServer();
  s.once('error', reject);
  s.listen(0, '127.0.0.1', () => {
    const n = s.address().port;
    s.close(() => resolve(n));
  });
});
async function main() {
  assert.equal(process.env.KT16_CAFEDB_CONFIRMED, 'YES');
  const runId = 'kt16-' + randomUUID();
  const dir = 'D:/KLTN/cafe-project-artifacts/reports/security';
  fs.mkdirSync(dir, { recursive: true });
  const beforeFile = dir + '/KT16-' + runId + '-before.json';
  const afterFile = dir + '/KT16-' + runId + '-after.json';
  const reportFile = dir + '/KT16-' + runId + '.md';
  for (const name of [beforeFile, afterFile, reportFile])
    assert.ok(!fs.existsSync(name), 'Cannot overwrite old evidence');
  const report = { case: 'KT16', runId, startedAt: new Date().toISOString(),
    verdict: 'NOT_RUN', database: 'cafedb', requests: [], guards: {},
    noHostClockMutation: true, realSupplierEmail: false, realPayment: false };
  const proxy = 'cafe-kt16-owned-' + randomUUID().slice(0, 10);
  report.proxy = { name: proxy, removed: false };
  let ownProxy = false, db = null, server = null, ingredientId = null;
  const stopProxy = () => {
    if (!ownProxy) return;
    try {
      docker(['stop', '--time', '2', proxy], 12000);
      ownProxy = false; report.proxy.removed = true;
    } catch (error) { report.proxy.cleanupError = String(error.message).slice(0, 240); }
  };
  process.on('exit', stopProxy);
  process.on('SIGINT', () => process.exit(130));
  process.on('SIGTERM', () => process.exit(143));
  try {
    assert.equal(docker(['inspect', 'cafe_postgres', '--format', '{{.State.Running}}']),
      'true');
    const netInfo = JSON.parse(docker(['inspect', 'cafe_postgres',
      '--format', '{{json .NetworkSettings.Networks}}']));
    const ip = netInfo.bridge?.IPAddress;
    assert.ok(ip);
    const databaseUrl = new URL(process.env.DATABASE_URL);
    assert.equal(databaseUrl.pathname, '/cafedb');
    const local = await port();
    const forward = [
      'const net=require("node:net");',
      'net.createServer(c=>{',
      'const r=net.connect(5432,process.env.PG_TARGET);',
      'c.on("error",()=>r.destroy());r.on("error",()=>c.destroy());',
      'c.pipe(r);r.pipe(c);',
      '}).listen(15432,"0.0.0.0");'
    ].join('');
    docker(['run', '--rm', '-d', '--name', proxy, '--network', 'bridge',
      '-p', '127.0.0.1:' + local + ':15432',
      '-e', 'PG_TARGET=' + ip,
      '--entrypoint', 'node', 'cafe-agent:local', '-e', forward], 20000);
    ownProxy = true;
    report.proxy.localPort = local;
    databaseUrl.hostname = '127.0.0.1'; databaseUrl.port = String(local);
    process.env.DATABASE_URL = databaseUrl.toString();
    process.env.NODE_ENV = 'test';
    require('ts-node').register({ project: 'apps/api/tsconfig.json', transpileOnly: true });
    const { PrismaClient } = require('@prisma/client');
    const jwt = require('jsonwebtoken'), express = require('express');
    db = new PrismaClient({ datasources: { db: { url: databaseUrl.toString() } } });
    let ready;
    for (let i = 0; i < 30; i++) {
      try {
        ready = (await db.$queryRawUnsafe(
          'SELECT current_database() AS name, clock_timestamp() AS db_time'))[0];
        break;
      } catch (error) {
        if (i === 29) throw error;
        await wait(150);
      }
    }
    assert.equal(ready.name, 'cafedb');
    report.guards.postgresTimeBefore = ready.db_time;
    const admin = await db.user.findFirstOrThrow({
      where: { role: 'ADMIN', isActive: true },
      select: { id: true, role: true, email: true }
    });
    const authorization = 'Bearer ' + jwt.sign(admin, process.env.JWT_SECRET,
      { expiresIn: '30m' });
    const app = express();
    app.use(express.json());
    app.use('/api/ingredients',
      require('../src/modules/ingredient/ingredient.route').ingredientRoutes);
    app.use(require('../src/common/error-handler').errorHandler);
    server = app.listen(0, '127.0.0.1');
    await new Promise(resolve => server.once('listening', resolve));
    const base = 'http://127.0.0.1:' + server.address().port + '/api/ingredients';
    const call = async (method, suffix, body) => {
      const res = await fetch(base + suffix, {
        method, headers: { authorization, 'content-type': 'application/json' },
        body: body === undefined ? undefined : JSON.stringify(body)
      });
      const parsed = await res.json();
      report.requests.push({ method, path: new URL(base + suffix).pathname,
        status: res.status, requestId: body?.requestId,
        replayed: parsed.data?.replayed });
      return { status: res.status, data: parsed.data, body: parsed };
    };
    const ingredientResponse = await call('POST', '', {
      sku: runId, name: runId, baseUnit: 'g',
      costPerBaseUnit: 1, expiryClassification: 'NON_PERISHABLE'
    });
    assert.equal(ingredientResponse.status, 201);
    ingredientId = ingredientResponse.data.id;
    const snap = async () => ({
      ingredient: await db.ingredient.findUniqueOrThrow({ where: { id: ingredientId },
        select: { quantity: true, movementCursor: true, rowVersion: true } }),
      ledger: await db.inventoryTransaction.findMany({ where: { ingredientId },
        select: { id: true, idempotencyKey: true, movementSeq: true,
          createdAt: true, quantity: true, type: true },
        orderBy: { movementSeq: 'asc' } }),
      batches: await db.ingredientBatch.findMany({ where: { ingredientId },
        select: { id: true, quantityRemaining: true }, orderBy: { id: 'asc' } })
    });
    const before = await snap();
    fs.writeFileSync(beforeFile, json({ runId, dbTime: ready.db_time, before }), 'utf8');
    const future = '2099-12-31T23:59:59.000Z';
    const past = '1990-01-01T00:00:00.000Z';
    const identities = [randomUUID(), randomUUID()];
    const items = [
      { requestId: identities[0], quantity: 2, unit: 'g', unitCost: 1,
        batchCode: runId + '-future-client', expirationDate: '2099-01-01T00:00:00Z',
        createdAt: future, clientObservedAt: future, movementSeq: '-100', movementCursor: '-100' },
      { requestId: identities[1], quantity: 3, unit: 'g', unitCost: 1,
        batchCode: runId + '-past-client', expirationDate: '2099-01-01T00:00:00Z',
        createdAt: past, clientObservedAt: past, movementSeq: '999999999999', movementCursor: '99999999' }
    ];
    for (const body of items) {
      const receipt = await call('POST', '/' + ingredientId + '/import', body);
      assert.equal(receipt.status, 200, 'Client timestamp unexpectedly replaced server time');
      assert.equal(receipt.data.replayed, false);
    }
    const clockAfter = (await db.$queryRawUnsafe(
      'SELECT clock_timestamp() AS db_time'))[0].db_time;
    const after = await snap();
    assert.equal(after.ledger.length - before.ledger.length, 2);
    assert.equal(Number(after.ingredient.quantity) - Number(before.ingredient.quantity), 5);
    const receipts = after.ledger.filter(row => identities.some(key =>
      row.idempotencyKey === 'ingredient-import:' + key));
    assert.equal(receipts.length, 2);
    assert.equal(receipts[0].movementSeq + 1n, receipts[1].movementSeq);
    assert.equal(after.ingredient.movementCursor,
      receipts[receipts.length - 1].movementSeq);
    const firstDbTime = new Date(ready.db_time).getTime();
    const lastDbTime = new Date(clockAfter).getTime();
    for (const row of receipts) {
      const stamp = new Date(row.createdAt).getTime();
      assert.ok(stamp >= firstDbTime - 2000 && stamp <= lastDbTime + 2000,
        'Ledger time followed forged client wall clock instead of server window');
      assert.ok(Math.abs(stamp - Date.parse(future)) > 86400000);
      assert.ok(Math.abs(stamp - Date.parse(past)) > 86400000);
    }
    const previous = json(after);
    const replay = await call('POST', '/' + ingredientId + '/import', items[0]);
    assert.equal(replay.status, 200); assert.equal(replay.data.replayed, true);
    assert.equal(json(await snap()), previous);
    report.guards.postgresTimeAfter = clockAfter;
    report.guards.ledger = receipts.map(row => ({
      movementSeq: row.movementSeq, createdAt: row.createdAt,
      requestId: row.idempotencyKey?.slice('ingredient-import:'.length)
    }));
    report.guards.forgedClientTimestamps = [future, past];
    report.guards.serverSequenceOwnsOrder = true;
    report.guards.timestampWithinPostgresWindow = true;
    report.guards.noDuplicateOnReplay = true;
    report.result = after;
    report.verdict = 'BACKEND_PASS';
    console.log('KT16 BACKEND_PASS: forged 2099/1990 times ignored, server movementSeq authoritative.');
  } catch (error) {
    report.verdict = 'PARTIAL';report.failure = String(error.stack ?? error.message).slice(0, 1600);
    process.exitCode = 1;console.error('KT16 PARTIAL ' + error.message);
  } finally {
    if (ingredientId && db) {
      try {
        await db.ingredient.update({
          where: { id: ingredientId }, data: { isActive: false }
        });
        report.fixtureDeactivated = true;
      } catch (error) {
        report.fixtureDeactivationError = String(error.message).slice(0, 220);
      }
    }
    if (server) await new Promise(resolve => server.close(resolve));
    if (db) await db.$disconnect();
    stopProxy();
    if (report.verdict === 'BACKEND_PASS' &&
      (!report.fixtureDeactivated || !report.proxy.removed)) {
      report.verdict = 'PARTIAL';
      report.failure = 'Fixture or owned proxy cleanup not verified';
    }
    report.finishedAt = new Date().toISOString();
    fs.writeFileSync(afterFile, json(report), 'utf8');
    fs.writeFileSync(reportFile, [
      '# KT16 - Wrong client clock / authoritative PostgreSQL ordering',
      '',
      'RunID: ' + runId,
      'Verdict: ' + report.verdict,
      'Requests: ' + report.requests.length,
      'Server ledger order: ' + (report.guards.serverSequenceOwnsOrder ?? 'NOT_VERIFIED'),
      'DB timestamp window: ' + (report.guards.timestampWithinPostgresWindow ?? 'NOT_VERIFIED'),
      'Replay: ' + (report.guards.noDuplicateOnReplay ?? 'NOT_VERIFIED'),
      'Owned proxy removed: ' + report.proxy.removed,
      'Fixture deactivated: ' + (report.fixtureDeactivated ?? false),
      '',
      'No host clock was changed; this tests forged request timestamps against server DB.',
      'Does not claim NTP skew / machine clock drift testing.',
      '',
      'Before: ' + beforeFile,
      'After: ' + afterFile,
      'Failure: ' + (report.failure || 'none')
    ].join('\r\n'), 'utf8');
    console.log(json({ runId, verdict: report.verdict, beforeFile, afterFile,
      reportFile, requests: report.requests.length, proxyRemoved: report.proxy.removed,
      fixtureDeactivated: report.fixtureDeactivated, failure: report.failure }));
  }
}
main().catch(error => { console.error(error); process.exitCode = 2; });
