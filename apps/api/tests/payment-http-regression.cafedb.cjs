// Opt-in real source HTTP/PostgreSQL acceptance; isolated additive fixtures only.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { randomUUID, createHash } = require('node:crypto');
const http = require('node:http');
assert.equal(process.env.PAYMENT_CAFEDB_CONFIRMED, 'YES');
require('dotenv').config({ path: 'apps/api/.env', quiet: true });
require('dotenv').config({ quiet: true });
const url = new URL(process.env.DATABASE_URL); assert.equal(url.pathname, '/cafedb');
url.hostname = '127.0.0.1'; url.port = process.env.PAYMENT_DB_PORT || '55432'; process.env.DATABASE_URL = url.toString();
// Synthetic contract keys confined to this process. No provider financial calls.
Object.assign(process.env, { MOMO_PARTNER_CODE: 'tt-contract', MOMO_ACCESS_KEY: 'tt-access', MOMO_SECRET_KEY: randomUUID(),
  VNPAY_TMN_CODE: 'TTTEST', VNPAY_HASH_SECRET: randomUUID(), VNPAY_URL: 'https://sandbox.vnpayment.vn/paymentv2/vpcpay.html', MOMO_DEV_FALLBACK: 'false' });
require('ts-node').register({ project: 'apps/api/tsconfig.json', transpileOnly: true });
const { prisma: db } = require('@cafe-project/database');
const { signMoMoIpnPayload } = require('../src/modules/payment/momo.gateway');
const { signVNPayParams } = require('../src/modules/payment/vnpay.gateway');
const jwt = require('jsonwebtoken');
const dir = 'D:/KLTN/cafe-project-artifacts/reports/payment'; fs.mkdirSync(dir, { recursive: true });
const out = { run: 'tt-' + randomUUID(), time: new Date().toISOString(), class: 'A real HTTP/PostgreSQL; B synthetic signed contract; C not exercised', requests: [], cases: [] };
const save = () => fs.writeFileSync(process.env.PAYMENT_EVIDENCE_PATH || dir + '/http-evidence-regression.json', JSON.stringify(out, (key, value) => {
  if (/signature|securehash|accesskey|secret|authorization|rawPayload|headers/i.test(key)) return undefined;
  if (typeof value === 'string' && /^https?:/.test(value) && value.includes('?')) return value.split('?')[0] + '?[REDACTED]';
  return value;
}, 2));
const app = require('express')(); app.use(require('express').json());
app.use('/api/orders', require('../src/modules/order/order.route').default);
app.use('/api/payments', require('../src/modules/payment/payment.route').default);
app.use(require('../src/common/error-handler').errorHandler);
let server, admin, staff, customer, actor, customerActor, base;
const api = async (method, path, body, token = admin) => {
  const start = new Date().toISOString();
  const r = await fetch(base + path, { method, headers: { 'content-type': 'application/json', ...(token ? { authorization: 'Bearer ' + token } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body), signal: AbortSignal.timeout(25000) });
  const raw = await r.text(); const response = raw ? JSON.parse(raw) : null;
  const e = { id: 'H' + (out.requests.length + 1), method, path: path.split('?')[0], start, end: new Date().toISOString(), status: r.status,
    role: token === admin ? 'ADMIN' : token === staff ? 'STAFF' : token ? 'CUSTOMER' : 'ANONYMOUS', response };
  out.requests.push(e); return e;
};
const state = id => db.order.findUniqueOrThrow({ where: { id }, include: { payments: { orderBy: { attemptNo: 'asc' } } } });
const fixture = async (method = 'MOMO', count = 1, extra = {}) => {
  const id = out.run + '-' + randomUUID();
  const o = await db.order.create({ data: { id, userId: actor.id, totalAmount: '10000', paymentMethod: method, ...extra,
    payments: { create: Array.from({ length: count }, (_, n) => ({ method, amount: '10000', merchantRef: id + '_' + (n + 1), attemptNo: n + 1, status: n + 1 < count ? 'CANCELLED' : 'PENDING' })) } }, include: { payments: { orderBy: { attemptNo: 'asc' } } } });
  return o;
};
const momo = (p, code = 0, change = {}) => {
  const v = { partnerCode: process.env.MOMO_PARTNER_CODE, orderId: p.merchantRef, requestId: p.merchantRef + '-request', amount: '10000', orderInfo: 'TT contract',
    transId: out.run + '-' + randomUUID(), resultCode: code, message: 'TT contract', responseTime: Date.now(), extraData: '', ...change };
  v.signature = signMoMoIpnPayload(v, process.env.MOMO_ACCESS_KEY, process.env.MOMO_SECRET_KEY); return v;
};
const ipn = payload => api('POST', '/payments/webhook/momo', payload, null);
const vnp = async (p, code = '00', change = {}) => {
  const q = { vnp_TmnCode: 'TTTEST', vnp_TxnRef: p.merchantRef, vnp_Amount: '1000000', vnp_ResponseCode: code, vnp_TransactionStatus: code === '00' ? '00' : '02', vnp_TransactionNo: out.run + randomUUID(), ...change };
  q.vnp_SecureHash = signVNPayParams(q, process.env.VNPAY_HASH_SECRET);
  return api('GET', '/payments/webhook/vnpay-ipn?' + new URLSearchParams(q), undefined, null);
};
const run = async (id, fn) => {
  const start = out.requests.length;
  try { const details = await fn(); out.cases.push({ id, verdict: details.verdict || 'PASS', ...details, evidence: out.requests.slice(start).map(r => r.id) }); }
  catch (e) { out.cases.push({ id, verdict: 'FAIL', error: e.stack, evidence: out.requests.slice(start).map(r => r.id) }); process.exitCode = 1; }
  save(); console.log(id + ' ' + out.cases.at(-1).verdict);
};
const overlap = async (id, calls) => {
  let release, ready; const gate = new Promise(r => release = r), locked = new Promise(r => ready = r);
  const holder = db.$transaction(async tx => { await tx.$queryRaw`SELECT id FROM "Order" WHERE id=${id} FOR UPDATE`; ready(); await gate; }, { timeout: 20000 });
  await locked; const pending = calls.map(fn => fn()); let waiters = 0;
  try { for (let n = 0; n < 100; n++) { const [r] = await db.$queryRaw`SELECT count(*)::int AS count FROM pg_stat_activity WHERE datname=current_database() AND wait_event_type='Lock' AND query LIKE '%"Order"%'`; waiters = r.count; if (waiters >= 2) break; await new Promise(r => setTimeout(r, 30)); } }
  finally { release(); await holder; }
  const results = await Promise.all(pending); assert.ok(waiters >= 2, 'Expected two PostgreSQL lock waiters'); return { waiters, results };
};
async function main() {
  out.database = await db.$queryRaw`SELECT current_database() AS name, version() AS version, inet_server_addr()::text AS address, inet_server_port() AS port`;
  out.migrations = await db.$queryRaw`SELECT migration_name, finished_at, rolled_back_at FROM _prisma_migrations ORDER BY migration_name`;
  actor = await db.user.findFirstOrThrow({ where: { role: 'ADMIN', isActive: true }, select: { id: true, email: true, role: true } });
  const employee = await db.user.findFirstOrThrow({ where: { role: 'STAFF', isActive: true }, select: { id: true, email: true, role: true } });
  customerActor = await db.user.create({ data: { email: out.run + '@example.invalid', name: 'TT isolated customer', role: 'CUSTOMER' }, select: { id: true, email: true, role: true } });
  const token = u => jwt.sign(u, process.env.JWT_SECRET, { expiresIn: '1h' }); admin = token(actor); staff = token(employee); customer = token(customerActor);
  out.actors = { admin: actor.id, staff: employee.id, customer: customerActor.id };
  server = app.listen(0, '127.0.0.1'); await new Promise(r => server.once('listening', r)); base = 'http://127.0.0.1:' + server.address().port + '/api'; out.base = base;
  const ledgerCount = () => db.inventoryTransaction.count();
  await run('TT-01', async () => {
    const o = await fixture('CASH'), p = o.payments[0], before = await ledgerCount();
    assert.equal((await api('POST', `/orders/${o.id}/confirm-payment`, {}, null)).status, 401);
    assert.equal((await api('POST', `/orders/${o.id}/confirm-payment`, {}, customer)).status, 403);
    const race = await overlap(o.id, [() => api('POST', `/orders/${o.id}/confirm-payment`, {}, staff), () => api('POST', `/orders/${o.id}/confirm-payment`, {}, staff)]);
    assert.deepEqual(race.results.map(r => r.status).sort(), [200, 409]);
    const after = await state(o.id); assert.equal(after.paymentStatus, 'PAID'); assert.equal(after.payments[0].amount.toString(), '10000');
    assert.equal(after.payments[0].responsePayload.manualUpdates.length, 1); assert.equal(after.payments[0].responsePayload.manualUpdates[0].by, employee.id);
    assert.ok(after.payments[0].paidAt); assert.equal(await ledgerCount(), before); return { before: o, after, race };
  });
  await run('TT-02', async () => {
    // New safety contract: create-url rejects any pre-existing unresolved provider attempt.
    const o = await fixture('VNPAY', 0); const created = await api('POST', '/payments/create-url', { orderId: o.id, method: 'VNPAY' }); assert.equal(created.status, 200);
    const current = (await state(o.id)).payments.at(-1); assert.equal((await vnp(current)).response.RspCode, '00');
    const after = await state(o.id); assert.equal(after.paymentStatus, 'PAID'); assert.ok(after.payments.at(-1).providerTxnId);
    return { verdict: 'NOT_VERIFIED', backend: 'PASS', providerSandbox: 'NOT_VERIFIED', before: o, after };
  });
  await run('TT-03', async () => {
    const o = await fixture('VNPAY'); assert.equal((await vnp(o.payments[0], '05')).response.RspCode, '00');
    const failed = await state(o.id); assert.equal(failed.payments[0].status, 'FAILED'); assert.equal(failed.paymentStatus, 'PENDING'); assert.equal(failed.payments[0].providerTxnId, null);
    assert.equal((await api('POST', '/payments/create-url', { orderId: o.id, method: 'VNPAY' })).status, 200); return { before: o, failed, after: await state(o.id) };
  });
  await run('TT-04', async () => {
    const o = await fixture(), before = await ledgerCount(); assert.equal((await ipn(momo(o.payments[0], 1006))).status, 204);
    const after = await state(o.id); assert.equal(after.payments[0].status, 'CANCELLED'); assert.equal(after.status, 'PENDING'); assert.equal(await ledgerCount(), before); return { before: o, after };
  });
  await run('TT-05', async () => {
    const o = await fixture(), payload = momo(o.payments[0]); const race = await overlap(o.id, [() => ipn(payload), () => ipn(payload)]);
    assert.ok(race.results.every(r => r.status === 204)); assert.equal((await ipn(payload)).status, 204);
    const callbacks = await db.paymentCallback.findMany({ where: { paymentId: o.payments[0].id } }); assert.equal(callbacks.length, 1); assert.equal(callbacks[0].retryCount, 2);
    const recovery = await fixture(), retryPayload = momo(recovery.payments[0]);
    await db.paymentCallback.create({ data: { method: 'MOMO', providerEventId: `MOMO:${retryPayload.orderId}:${retryPayload.transId}:0`,
      signatureValid: true, rawPayload: retryPayload, status: 'VERIFIED' } });
    assert.equal((await ipn(retryPayload)).status, 204); assert.equal((await state(recovery.id)).paymentStatus, 'PAID');
    return { after: await state(o.id), race, callbacks: callbacks.map(({ rawPayload, headers, ...safe }) => safe) };
  });
  await run('TT-06', async () => {
    const o = await fixture('MOMO', 2); await ipn(momo(o.payments[0])); const after = await state(o.id);
    assert.equal(after.payments[0].status, 'PAID'); assert.equal(after.payments[0].failureCode, 'LATE_SETTLEMENT'); assert.equal(after.payments[1].status, 'PENDING'); assert.equal(after.paymentStatus, 'PENDING'); return { before: o, after, reconciliation: 'LATE_SETTLEMENT; manual decision required' };
  });
  await run('TT-07', async () => {
    // Network endpoint deliberately accepts then drops response. No external charge.
    const gateway = http.createServer((req, res) => { req.resume(); req.on('end', () => res.destroy()); });
    gateway.listen(0, '127.0.0.1'); await new Promise(r => gateway.once('listening', r));
    const old = process.env.MOMO_ENDPOINT; process.env.MOMO_ENDPOINT = 'http://127.0.0.1:' + gateway.address().port;
    try {
      const o = await fixture('MOMO', 0); assert.equal((await api('POST', '/payments/create-url', { orderId: o.id, method: 'MOMO' })).status, 502);
      const unknown = await state(o.id), p = unknown.payments.at(-1); assert.equal(p.status, 'PENDING'); assert.equal(p.failureCode, 'GATEWAY_OUTCOME_UNKNOWN');
      assert.equal((await api('POST', '/payments/create-url', { orderId: o.id, method: 'MOMO' })).status, 409);
      await ipn(momo(p)); assert.equal((await state(o.id)).paymentStatus, 'PAID');
      return { verdict: 'NOT_VERIFIED', backend: 'PASS', unknown, after: await state(o.id), limitation: 'No authoritative lookup adapter or real charged sandbox transaction' };
    } finally { process.env.MOMO_ENDPOINT = old || ''; await new Promise(r => gateway.close(r)); }
  });
  await run('TT-08', async () => {
    const o = await fixture(); await ipn(momo(o.payments[0], 0, { amount: '10000.1' })); assert.equal((await state(o.id)).paymentStatus, 'PENDING');
    const v = await fixture('VNPAY'); assert.equal((await vnp(v.payments[0], '00', { vnp_Amount: '1000001' })).response.RspCode, '04');
    assert.equal((await state(v.id)).totalAmount.toString(), '10000'); return { momo: await state(o.id), vnpay: await state(v.id), discrepancyCount: await db.paymentCallback.count({ where: { paymentId: { in: [o.payments[0].id, v.payments[0].id] }, errorMessage: { startsWith: 'AMOUNT_MISMATCH' } } }) };
  });
  await run('TT-09', async () => {
    const o = await fixture(); assert.equal((await ipn({ ...momo(o.payments[0]), signature: 'invalid' })).status, 400); assert.equal((await ipn({})).status, 400);
    assert.equal((await api('GET', '/payments/webhook/vnpay-ipn?vnp_SecureHash=bad', undefined, null)).response.RspCode, '97');
    assert.deepEqual(await state(o.id), o); return { before: o, after: await state(o.id) };
  });
  await run('TT-10', async () => {
    const o = await fixture('MOMO', 2), race = await overlap(o.id, o.payments.map(p => () => ipn(momo(p))));
    // If old attempt wins first it is reconciled separately; current attempt settles order.
    const after = await state(o.id); assert.equal(after.payments.filter(p => p.status === 'PAID').length, 2);
    assert.equal(new Set(after.payments.map(p => p.providerTxnId)).size, 2); assert.equal(after.paymentStatus, 'PAID');
    assert.ok(after.payments.some(p => ['DUPLICATE_PAYMENT', 'LATE_SETTLEMENT'].includes(p.failureCode)));
    const online = await api('POST', `/payments/${after.payments[0].id}/mark-refunded`, { note: out.run }); assert.equal(online.status, 409);
    return { before: o, after, race, refund: 'No automatic refund; reconciliation required' };
  });
  await run('TT-11', async () => {
    const o = await fixture('CASH', 1, { status: 'CANCELLED', paymentStatus: 'PAID' });
    await db.payment.update({ where: { id: o.payments[0].id }, data: { status: 'PAID', paidAt: new Date(), failureCode: 'REFUND_REQUIRED' } });
    const r = await api('POST', `/payments/${o.payments[0].id}/mark-refunded`, { amount: 1000, note: 'partial probe' });
    assert.equal(r.status, 400); assert.equal((await state(o.id)).payments[0].status, 'PAID');
    return { verdict: 'BLOCKED_POLICY', reason: 'Partial amount/limits/authorization not approved; no refund model/adapter', guard: r.status };
  });
  await run('TT-12', async () => {
    const o = await fixture('CASH', 1, { status: 'CANCELLED', paymentStatus: 'PAID' });
    const p = await db.payment.update({ where: { id: o.payments[0].id }, data: { status: 'PAID', paidAt: new Date(), failureCode: 'REFUND_REQUIRED' } });
    const before = await ledgerCount(); assert.equal((await api('POST', `/payments/${p.id}/mark-refunded`, { note: 'TT verified CASH handover evidence' }, staff)).status, 403);
    const race = await overlap(o.id, [() => api('POST', `/payments/${p.id}/mark-refunded`, { note: 'TT authorized CASH receipt' }), () => api('POST', `/payments/${p.id}/mark-refunded`, { note: 'TT duplicate receipt' })]);
    assert.deepEqual(race.results.map(r => r.status).sort(), [200, 409]); const after = await state(o.id); assert.equal(after.payments[0].status, 'REFUNDED');
    assert.equal(after.payments[0].paidAt.toISOString(), p.paidAt.toISOString()); assert.equal(after.payments[0].responsePayload.manualUpdates.length, 1); assert.equal(await ledgerCount(), before);
    return { before: o, after, race, scope: 'ADMIN-attested CASH, synthetic handover fixture; online execution unavailable' };
  });
  await run('TT-13', async () => {
    const o = await fixture('MOMO', 1, { status: 'CANCELLED', paymentStatus: 'PAID' });
    await db.payment.update({ where: { id: o.payments[0].id }, data: { status: 'PAID', paidAt: new Date(), failureCode: 'REFUND_REQUIRED', providerTxnId: out.run + randomUUID() } });
    const before = await state(o.id); assert.equal((await api('POST', `/payments/${o.payments[0].id}/mark-refunded`, { note: 'unverified provider refund' })).status, 409);
    assert.equal((await api('PATCH', `/payments/${o.payments[0].id}/status`, { status: 'REFUNDED' })).status, 409); assert.deepEqual(await state(o.id), before);
    return { verdict: 'BLOCKED_EXTERNAL', guard: 'PASS', reason: 'No provider refund execution/lookup; cannot exercise failure/unknown refund outcome' };
  });
  await run('TT-14', async () => {
    const o = await fixture(), before = await ledgerCount(); const race = await overlap(o.id, [() => ipn(momo(o.payments[0])), () => api('PATCH', `/orders/${o.id}/status`, { status: 'CANCELLED' })]);
    const after = await state(o.id); assert.equal(after.payments[0].status, 'PAID'); assert.equal(after.paymentStatus, 'PAID');
    if (after.status === 'CANCELLED') assert.equal(after.payments[0].failureCode, 'REFUND_REQUIRED');
    else { assert.equal(after.status, 'PROCESSING'); assert.equal(race.results[1].status, 409); }
    assert.equal(await ledgerCount(), before); return { before: o, after, race };
  });
  await run('TT-15', async () => {
    const o = await fixture('VNPAY'), p = o.payments[0], txn = out.run + randomUUID();
    await vnp(p, '05', { vnp_TransactionNo: txn }); await vnp(p, '00', { vnp_TransactionNo: txn });
    const paid = await state(o.id); assert.equal(paid.payments[0].status, 'PAID');
    await overlap(o.id, [() => vnp(p, '24', { vnp_TransactionNo: txn }), () => vnp(p, '00', { vnp_TransactionNo: txn + '-second' })]);
    assert.deepEqual(await state(o.id), paid);
    return { after: paid, events: await db.paymentCallback.count({ where: { paymentId: p.id } }) };
  });
}
main().catch(e => { out.fatal = e.message; process.exitCode = 1; console.error(e.message); }).finally(async () => {
  out.source = ['payment.repository.ts', 'payment.service.ts', 'payment.validator.ts', 'momo.gateway.ts'].map(f => ({ file: 'apps/api/src/modules/payment/' + f, sha256: createHash('sha256').update(fs.readFileSync('apps/api/src/modules/payment/' + f)).digest('hex') }));
  save(); if (server) await new Promise(r => server.close(r)); await db.$disconnect();
});
