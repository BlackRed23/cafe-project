const { test } = require('node:test');
const assert = require('node:assert/strict');
const { fork } = require('node:child_process');
const { once } = require('node:events');
const path = require('node:path');

async function start(t) {
  const child = fork(path.join(__dirname, 'mock-process.cjs'), [], { stdio: ['ignore', 'ignore', 'inherit', 'ipc'] });
  t.after(() => { if (child.exitCode === null) child.kill(); });
  const ready = await Promise.race([
    once(child, 'message').then(([message]) => message),
    once(child, 'exit').then(([code]) => { throw new Error('Mock child exited before ready: ' + code); }),
  ]);
  return { child, async call(route, input, key) {
    const response = await fetch(ready.origin + '/api/mock' + route, {
      method: input === undefined ? 'GET' : 'POST',
      headers: { Authorization: 'Bearer ' + ready.token, 'Content-Type': 'application/json', ...(key ? { 'Idempotency-Key': key } : {}) },
      body: input === undefined ? undefined : JSON.stringify(route.startsWith('/agent/') ? { input } : { input, versions: {} }),
    });
    const body = await response.json(); assert.equal(response.status, 200, JSON.stringify(body)); return body.data;
  }, async stop() { const exited = once(child, 'exit'); child.send('stop'); await exited; } };
}

test('Phase 4 process boundary: fresh Node process loses mock orders, receipts and Agent memory', { timeout: 60000 }, async t => {
  const input = { amount: '30', items: [{ productId: 'coffee', servings: '1' }] };
  let server = await start(t);
  const first = await server.call('/orders', input, 'process-key');
  await server.call('/agent/memory/remember', { text: 'process boundary marker' }, 'memory-key');
  assert.equal((await server.call('/views/orders')).length, 1);
  assert.equal((await server.call('/agent/memory?q=marker')).length, 1);
  const oldPid = server.child.pid; await server.stop(); server = await start(t);
  assert.notEqual(server.child.pid, oldPid);
  assert.deepEqual(await server.call('/views/orders'), []);
  assert.deepEqual(await server.call('/agent/memory?q=marker'), []);
  // Same key is a new mutation after real process loss, not durable replay.
  const reapplied = await server.call('/orders', input, 'process-key');
  assert.equal(reapplied.id, first.id); assert.equal((await server.call('/views/orders')).length, 1);
  await server.stop();
});
