// KT02: genuine PostgreSQL deadlock inside ACTUAL importStock HTTP transaction.
// Controlled test-only query injection creates one extra SELECT...FOR UPDATE.
// No production source or shared server changes. Opt-in KT02_CAFEDB_CONFIRMED=YES.
'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs'), net = require('node:net');
const { randomBytes, randomUUID } = require('node:crypto');
const { execFileSync } = require('node:child_process');
require('dotenv').config({ path: 'apps/api/.env', quiet: true });
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const printable = value => JSON.stringify(value, (key, item) => {
  if (/^(token|secret|password|authorization|databaseUrl)$/i.test(key)) return '[REDACTED]';
  if (typeof item === 'bigint') return item.toString();
  return item;
}, 2);
const docker = (args, timeout = 15000) => execFileSync('docker', args, {
  cwd: process.cwd(), timeout, windowsHide: true,
  encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe']
}).trim();
const openPort = () => new Promise((resolve, reject) => {
  const srv = net.createServer();
  srv.once('error', reject);
  srv.listen(0, '127.0.0.1', () => {
    const port = srv.address().port;
    srv.close(() => resolve(port));
  });
});

async function main() {
  assert.equal(process.env.KT02_CAFEDB_CONFIRMED, 'YES', 'Explicit real cafedb opt-in required');
  const runId = 'kt02-live-' + randomUUID();
  const reportDir = 'D:/KLTN/cafe-project-artifacts/reports/security';
  fs.mkdirSync(reportDir, { recursive: true });
  const beforePath = reportDir + '/KT02-' + runId + '-before.json';
  const afterPath = reportDir + '/KT02-' + runId + '-after.json';
  const reportPath = reportDir + '/KT02-' + runId + '.md';
  for (const path of [beforePath, afterPath, reportPath])
    assert.ok(!fs.existsSync(path), 'Refusing overwrite: ' + path);
  const result = { case: 'KT02', runId, startedAt: new Date().toISOString(),
    verdict: 'NOT_RUN', db: 'cafedb', requests: [], holder: {}, retry: {},
    limitations: [
      'Extra SELECT FOR UPDATE injected by owned test wrapper into REAL Prisma importStock transaction',
      'Proves actual service retry, not every possible PG transaction isolation or distributed failure'
    ] };
  const name = 'cafe-kt02-owned-' + randomUUID().slice(0, 10);
  let ownProxy = false, appServer, database, monitor, blocker, releaseInjection;
  let testIngredients = [];
  result.proxy = { name, removed: false };
  const stopProxy = () => {
    if (!ownProxy) return;
    try { docker(['stop', '--time', '2', name], 12000); ownProxy = false; result.proxy.removed = true; }
    catch (error) { result.proxy.cleanupError = String(error.message).slice(0, 180); }
  };
  process.on('exit', stopProxy);
  process.on('SIGINT', () => process.exit(130));
  process.on('SIGTERM', () => process.exit(143));
  const output = file => fs.writeFileSync(file, printable(result), 'utf8');
  const bounded = (promise, label, millis = 20000) => Promise.race([
    promise, sleep(millis).then(() => { throw Error(label + ' timed out'); })
  ]);
  try {
    assert.equal(docker(['inspect', 'cafe_postgres', '--format', '{{.State.Running}}']),
      'true', 'Shared cafe_postgres not running. Do not start/stop it.');
    const networks = JSON.parse(docker(['inspect', 'cafe_postgres',
      '--format', '{{json .NetworkSettings.Networks}}']));
    const ip = networks.bridge?.IPAddress;
    assert.ok(/^\d{1,3}(?:\.\d{1,3}){3}$/.test(ip ?? ''));
    const sourceUrl = new URL(process.env.DATABASE_URL);
    assert.equal(sourceUrl.pathname, '/cafedb');
    const port = await openPort();
    const forward = [
      'const net=require("node:net");',
      'net.createServer(c=>{',
      'const s=net.connect(5432,process.env.PG_TARGET);',
      'c.on("error",()=>s.destroy());s.on("error",()=>c.destroy());',
      'c.pipe(s);s.pipe(c);',
      '}).listen(15432,"0.0.0.0");'
    ].join('');
    docker(['run', '--rm', '-d', '--name', name, '--network', 'bridge',
      '-p', '127.0.0.1:' + port + ':15432',
      '-e', 'PG_TARGET=' + ip, '--entrypoint', 'node', 'cafe-agent:local',
      '-e', forward], 20000);
    ownProxy = true;
    result.proxy.localPort = port;
    sourceUrl.hostname = '127.0.0.1'; sourceUrl.port = String(port);
    process.env.DATABASE_URL = sourceUrl.toString();
    process.env.NODE_ENV = 'test';
    process.env.AGENT_INTERNAL_TOKEN = randomBytes(32).toString('base64url');
    process.env.PAYMENT_REFUND_POLICY_ENABLED = 'false';
    process.env.PAYMENT_REFUND_EXECUTION_ENABLED = 'false';
    require('ts-node').register({ project: 'apps/api/tsconfig.json', transpileOnly: true });
    const { prisma } = require('@cafe-project/database');
    const { PrismaClient } = require('@prisma/client');
    database = prisma;
    monitor = new PrismaClient({ datasources: { db: { url: sourceUrl.toString() } } });
    let pg;
    for (let attempt = 0; attempt < 30; attempt++) {
      try {
        pg = (await monitor.$queryRawUnsafe(
          'SELECT current_database() name, pg_backend_pid() pid'))[0];
        break;
      } catch (error) {
        if (attempt === 29) throw error;
        await sleep(150);
      }
    }
    assert.equal(pg.name, 'cafedb');
    result.postgres = { backendPid: pg.pid, observedWaiters: [], realAbortedCode: null };
    const jwt = require('jsonwebtoken'), express = require('express');
    const admin = await monitor.user.findFirstOrThrow({
      where: { role: 'ADMIN', isActive: true }, select: { id: true, role: true, email: true }
    });
    const token = jwt.sign(admin, process.env.JWT_SECRET, { expiresIn: '45m' });
    const app = express();
    app.use(express.json());
    app.use('/api/ingredients',
      require('../src/modules/ingredient/ingredient.route').ingredientRoutes);
    app.use(require('../src/common/error-handler').errorHandler);
    appServer = app.listen(0, '127.0.0.1');
    await new Promise(resolve => appServer.once('listening', resolve));
    const base = 'http://127.0.0.1:' + appServer.address().port + '/api';
    async function call(method, path, body) {
      const begin = Date.now();
      const res = await fetch(base + path, {
        method, headers: { 'content-type': 'application/json', authorization: 'Bearer ' + token },
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: AbortSignal.timeout(30000)
      });
      const payload = await res.json();
      result.requests.push({ method, path, status: res.status,
        requestId: body?.requestId, durationMs: Date.now() - begin,
        replayed: payload.data?.replayed, message: payload.message });
      return { status: res.status, data: payload.data, body: payload };
    }
    const requireStatus = (response, status) => {
      assert.equal(response.status, status, printable(response.body).slice(0, 350));
      return response.data;
    };
    const fixture = async tag => requireStatus(await call('POST', '/ingredients', {
      sku: runId + '-' + tag, name: runId + '-' + tag,
      baseUnit: 'g', costPerBaseUnit: 2, expiryClassification: 'NON_PERISHABLE'
    }), 201);
    const target = await fixture('import-target');
    const other = await fixture('lock-blocker');
    testIngredients = [
      { id: target.id, expectedSku: runId + '-import-target' },
      { id: other.id, expectedSku: runId + '-lock-blocker' }
    ];
    result.fixtures = { targetIngredientId: target.id, blockerIngredientId: other.id };
    const capture = async () => {
      const row = await monitor.ingredient.findUniqueOrThrow({
        where: { id: target.id }, select: {
          id: true, quantity: true, movementCursor: true, rowVersion: true
        }
      });
      const lots = await monitor.ingredientBatch.findMany({ where: { ingredientId: target.id },
        select: { id: true, quantityInitial: true, quantityRemaining: true }, orderBy: { id: 'asc' } });
      const ledger = await monitor.inventoryTransaction.findMany({
        where: { ingredientId: target.id },
        select: { id: true, idempotencyKey: true, movementSeq: true, quantity: true, type: true },
        orderBy: { movementSeq: 'asc' }
      });
      return { ingredient: row, lots, ledger };
    };
    const before = await capture();
    const beforeProof = { runId, db: 'cafedb', capturedAt: new Date().toISOString(), before };
    fs.writeFileSync(beforePath, printable(beforeProof), 'utf8');
    result.beforeProofPath = beforePath;
    // Hold B in a SEPARATE PostgreSQL transaction, then block on A after
    // the real importStock transaction has already locked A.
    let holderReady, resumeHolder, lockedTarget, resumeInjection;
    const ready = new Promise(resolve => { holderReady = resolve; });
    const allowHolder = new Promise(resolve => { resumeHolder = resolve; });
    const targetLocked = new Promise(resolve => { lockedTarget = resolve; });
    const allowInjection = new Promise(resolve => { resumeInjection = resolve; });
    releaseInjection = resumeInjection;
    const holderResult = monitor.$transaction(async tx => {
      await tx.$queryRawUnsafe('SELECT "id" FROM "Ingredient" WHERE "id"=$1 FOR UPDATE', other.id);
      holderReady();
      await allowHolder;
      const rows = await tx.$queryRawUnsafe(
        'SELECT "id" FROM "Ingredient" WHERE "id"=$1 FOR UPDATE', target.id);
      result.holder.secondLockSucceeded = rows.length === 1;
    }, { timeout: 19000 });
    holderResult.catch(() => {});
    await bounded(ready, 'holder acquired other row');
    let liveWrapper = true, injected = false, transactionAttempts = 0;
    const baselineTransaction = prisma.$transaction.bind(prisma);
    prisma.$transaction = (job, options) => {
      if (!liveWrapper || typeof job !== 'function') return baselineTransaction(job, options);
      const index = ++transactionAttempts;
      result.retry.attempts = transactionAttempts;
      (result.retry.enteredAtMs ||= []).push(Date.now());
      return baselineTransaction(async tx => {
        const wrapped = new Proxy(tx, {
          get(object, key) {
            if (key !== '$queryRaw') return object[key];
            return async (...args) => {
              const rows = await object.$queryRaw(...args);
              const statement = Array.isArray(args[0]) ? args[0].join(' ') : String(args[0]);
              if (index === 1 && !injected &&
                statement.includes('Ingredient') && statement.includes('FOR UPDATE')) {
                injected = true;
                result.retry.firstImportRowLocked = true;
                lockedTarget();
                await allowInjection;
                try {
                  await object.$queryRawUnsafe(
                    'SELECT "id" FROM "Ingredient" WHERE "id"=$1 FOR UPDATE', other.id);
                } catch (error) {
                  result.postgres.realAbortedCode =
                    error?.meta?.code || error?.code || 'UNCLASSIFIED';
                  result.retry.firstError = { code: error?.code ?? null,
                    postgresCode: error?.meta?.code ?? null,
                    observedAtMs: Date.now() };
                  throw error;
                }
              }
              return rows;
            };
          }
        });
        return job(wrapped);
      }, options);
    };
    const receiptId = randomUUID();
    const payload = { requestId: receiptId, quantity: 7, unit: 'g', unitCost: 2,
      batchCode: runId + '-first-import', expirationDate: '2099-01-01T00:00:00Z' };
    const pending = call('POST', '/ingredients/' + target.id + '/import', payload);
    let response;
    try {
      await bounded(targetLocked, 'real importStock row lock', 15000);
      // Force the REAL HTTP transaction to start waiting for held B FIRST.
      // Its deadlock_timeout starts before the external transaction later
      // requests A, making the business transaction the deadlock victim.
      resumeInjection();
      let observed = false;
      for (let attempt = 0; attempt < 150; attempt++) {
        const waiters = await monitor.$queryRawUnsafe(
          "SELECT pid, wait_event_type, wait_event FROM pg_stat_activity "+
          "WHERE datname=current_database() AND wait_event_type='Lock' "+
          "AND query LIKE '%Ingredient%' AND query LIKE '%FOR UPDATE%'");
        if (waiters.length) result.postgres.observedWaiters = waiters.map(row => ({
          pid: row.pid, waitEvent: row.wait_event
        }));
        if (waiters.length >= 1) { observed = true; break; }
        await sleep(35);
      }
      assert.ok(observed, 'No real importStock lock wait observed before reverse lock');
      result.postgres.businessWaitingBeforeExternalCycle = true;
      // A was already locked by importStock; now external B-holder asks for A.
      resumeHolder();
      const settled = await bounded(Promise.allSettled([holderResult, pending]),
        'deadlock wait and real HTTP import', 30000);
      result.holder.finalState = settled[0].status;
      assert.equal(settled[1].status, 'fulfilled',
        'Actual HTTP import did not settle: ' + settled[1].reason);
      response = settled[1].value;
    } finally {
      resumeInjection();
      resumeHolder();
      await holderResult.catch(() => {});
      liveWrapper = false;
      prisma.$transaction = baselineTransaction;
    }
    result.retry.receiptHttpStatus = response.status;
    assert.equal(response.status, 200,
      'Real production importStock did not recover from live PG deadlock: ' +
        printable(response.body).slice(0, 350));
    assert.equal(response.data.replayed, false);
    assert.ok(transactionAttempts >= 2 && transactionAttempts <= 3,
      'Actual production writer did not retry within allowed attempts: ' + transactionAttempts);
    assert.equal(result.postgres.realAbortedCode, '40P01',
      'No 40P01 observed within real production importStock transaction');
    assert.equal(result.retry.firstError?.postgresCode, '40P01');
    const gap = result.retry.enteredAtMs[1] - result.retry.firstError.observedAtMs;
    result.retry.firstRetryGapMs = gap;
    assert.ok(gap >= 45, 'Production retry backoff below ~50ms: ' + gap);
    const after = await capture();
    const keys = after.ledger.filter(row => row.idempotencyKey === 'ingredient-import:' + receiptId);
    assert.equal(keys.length, 1, 'Retry created duplicate ledger movement');
    assert.equal(after.lots.length - before.lots.length, 1);
    assert.equal(Number(after.ingredient.quantity) - Number(before.ingredient.quantity), 7);
    assert.equal(after.ingredient.movementCursor - before.ingredient.movementCursor, 1n);
    const replay = requireStatus(await call('POST', '/ingredients/' + target.id + '/import', payload), 200);
    assert.equal(replay.replayed, true);
    assert.equal(printable(await capture()), printable(after), 'Replay changed persisted records');
    result.after = after;
    result.checked = { realProductionTransactionAttempts: transactionAttempts,
      injectedDeadlockSQLState: '40P01', backoffMeasuredMs: gap,
      exactlyOneImportLedger: true, exactlyOneBatch: true, finalQuantity: Number(after.ingredient.quantity),
      replayedNoWrite: true, pgLockWaiters: result.postgres.observedWaiters.length };
    result.verdict = 'PASS';
    console.log('KT02 PASS: production importStock retried ' + transactionAttempts +
      ' times after real PG 40P01; backoff=' + gap + 'ms, one ledger, replay safe.');
  } catch (error) {
    result.verdict = result.verdict === 'NOT_RUN' ? 'PARTIAL' : result.verdict;
    result.failure = String(error.stack ?? error.message).slice(0, 1600);
    process.exitCode = 1;
    console.error('KT02 ' + result.verdict + ': ' + error.message);
  } finally {
    if (releaseInjection) releaseInjection();
    if (appServer) await new Promise(resolve => appServer.close(resolve));
    result.cleanup = { fixtureIds: testIngredients.map(item => item.id),
      deactivated: [], preservedHistory: true };
    if (monitor) {
      for (const fixture of testIngredients) {
        try {
          const current = await monitor.ingredient.findUnique({
            where: { id: fixture.id }, select: { sku: true, isActive: true }
          });
          if (!current || current.sku !== fixture.expectedSku)
            throw Error('Fixture identity mismatch; refusing to mutate');
          if (current.isActive) {
            await monitor.ingredient.update({
              where: { id: fixture.id }, data: { isActive: false }
            });
          }
          result.cleanup.deactivated.push(fixture.id);
        } catch (error) {
          (result.cleanup.errors ||= []).push({
            id: fixture.id, reason: String(error.message).slice(0, 160)
          });
        }
      }
    }
    if (result.verdict === 'PASS' &&
      result.cleanup.deactivated.length !== testIngredients.length) {
      result.verdict = 'PARTIAL';
      result.cleanup.warning = 'Fixture cleanup not fully verified';
    }
    if (monitor) await monitor.$disconnect();
    if (database) await database.$disconnect();
    stopProxy();
    result.finishedAt = new Date().toISOString();
    fs.writeFileSync(afterPath, printable(result), 'utf8');
    const md = [
      '# KT02 - Real production HTTP deadlock retry follow-up',
      '',
      'RunID: ' + runId,
      'Verdict: ' + result.verdict,
      'Actual production transaction attempts: ' + (result.retry.attempts ?? 'unverified'),
      'Observed PostgreSQL SQLSTATE: ' + (result.postgres?.realAbortedCode ?? 'unverified'),
      'Measured first backoff (ms): ' + (result.retry.firstRetryGapMs ?? 'unverified'),
      'Real PG waiting sessions: ' + (result.postgres?.observedWaiters?.length ?? 'unverified'),
      'HTTP requests: ' + result.requests.length,
      'Exactly one durable IMPORT ledger: ' + (result.checked?.exactlyOneImportLedger ?? 'unverified'),
      'Test-only fixtures deactivated: ' + (result.cleanup?.deactivated?.length ?? 0) +
        '/' + testIngredients.length,
      'Owned proxy removed: ' + result.proxy.removed,
      '',
      'Production source unmodified. Test-only extra lock SELECT inside real transaction',
      'creates a PostgreSQL deadlock with a separate held transaction.',
      'A real JWT HTTP call exercises the importStock retryAbortedPgTransaction path.',
      'This does not test DB connection-loss retry (which must not be retried blindly).',
      '',
      'Before evidence: ' + beforePath,
      'After evidence: ' + afterPath,
      'Failure: ' + (result.failure || 'none')
    ];
    fs.writeFileSync(reportPath, md.join('\r\n'), 'utf8');
    console.log(printable({ runId, verdict: result.verdict, beforePath, afterPath, reportPath,
      attempts: result.retry.attempts, pgCode: result.postgres?.realAbortedCode,
      httpRequests: result.requests.length, proxyRemoved: result.proxy.removed,
      failure: result.failure }));
  }
}
main().catch(error => { console.error(error.stack ?? error); process.exitCode = 2; });
