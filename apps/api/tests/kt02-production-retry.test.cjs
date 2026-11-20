'use strict';
const assert = require('node:assert/strict');
const { test } = require('node:test');
require('ts-node').register({ project: 'apps/api/tsconfig.json', transpileOnly: true });
const { retryAbortedPgTransaction } = require('../src/common/pg-transaction-retry');

test('KT02: bounded production retry on a PostgreSQL 40P01 aborted transaction', async () => {
  let attempts = 0;
  const sleeps = [];
  const result = await retryAbortedPgTransaction(async () => {
    ++attempts;
    if (attempts < 3) throw { code: 'P2010', meta: { code: '40P01' } };
    return { committed: true };
  }, async milliseconds => { sleeps.push(milliseconds); });
  assert.deepEqual(result, { committed: true });
  assert.equal(attempts, 3);
  assert.deepEqual(sleeps, [50, 100]);
});

test('KT02: bounded production retry on Prisma P2034', async () => {
  let attempts = 0;
  await retryAbortedPgTransaction(async () => {
    if (++attempts === 1) throw { code: 'P2034' };
    return true;
  }, async () => {});
  assert.equal(attempts, 2);
});

test('KT02: no retry when connection or commit outcome is ambiguous', async () => {
  for (const error of [{ code: 'P1001' }, { code: 'P2010', meta: { code: '08006' } },
    { code: 'P2010', meta: { code: '23505' } }, new Error('connection lost')]) {
    let calls = 0;
    await assert.rejects(() => retryAbortedPgTransaction(async () => {
      calls++;
      throw error;
    }, async () => { throw new Error('must not sleep'); }), e => e === error);
    assert.equal(calls, 1);
  }
});

test('KT02: stop after exactly three aborted transaction attempts', async () => {
  let calls = 0;
  const delays = [];
  const deadlock = { code: '40P01' };
  await assert.rejects(() => retryAbortedPgTransaction(async () => {
    calls++;
    throw deadlock;
  }, async ms => { delays.push(ms); }), e => e === deadlock);
  assert.equal(calls, 3);
  assert.deepEqual(delays, [50, 100]);
});
