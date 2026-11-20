// KT02: exact retry whitelist/attempt-limit/backoff of the PRODUCTION helper.
// Unlike technical-kt02-production.cafedb.cjs, this unit requires no database.
'use strict';
const assert = require('node:assert/strict');
const { test } = require('node:test');
require('ts-node').register({ project: 'apps/api/tsconfig.json', transpileOnly: true });
const { retryAbortedPgTransaction } = require('../src/common/pg-transaction-retry');

test('KT02 actual helper retries 40P01 twice with exactly 50/100ms backoff', async () => {
  const sleeps = [];
  let attempts = 0;
  const result = await retryAbortedPgTransaction(async () => {
    attempts++;
    if (attempts < 3) throw { code: 'P2010', meta: { code: '40P01' } };
    return { ok: true };
  }, async ms => sleeps.push(ms));
  assert.deepEqual(result, { ok: true });
  assert.equal(attempts, 3);
  assert.deepEqual(sleeps, [50, 100]);
});

test('KT02 actual helper caps third 40001 failure at three total attempts', async () => {
  const sleeps = [];
  let attempts = 0;
  const rejection = { code: '40001' };
  await assert.rejects(
    retryAbortedPgTransaction(async () => {
      attempts++;
      throw rejection;
    }, async ms => sleeps.push(ms)),
    error => error === rejection
  );
  assert.equal(attempts, 3);
  assert.deepEqual(sleeps, [50, 100]);
});

test('KT02 actual helper never retries unknown connection/timeout errors', async () => {
  for (const code of ['P1001', 'P1008', 'P2024', 'P2010']) {
    const sleeps = [];
    let attempts = 0;
    const rejection = { code, meta: { code: code === 'P2010' ? '08006' : code } };
    await assert.rejects(
      retryAbortedPgTransaction(async () => {
        attempts++;
        throw rejection;
      }, async ms => sleeps.push(ms)),
      error => error === rejection
    );
    assert.equal(attempts, 1, code);
    assert.deepEqual(sleeps, [], code);
  }
});
