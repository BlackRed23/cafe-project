// Opt-in real Express/PostgreSQL contract; local provider emulator is NOT provider sandbox evidence.
const assert = require('node:assert/strict');
const http = require('node:http');
const fs = require('node:fs');
const { randomUUID, createHmac } = require('node:crypto');
assert.equal(process.env.PAYMENT_CAFEDB_CONFIRMED, 'YES');
require('dotenv').config({ path: 'apps/api/.env', quiet: true });
const databaseUrl = new URL(process.env.DATABASE_URL);
assert.equal(databaseUrl.pathname, '/cafedb');
databaseUrl.hostname = '127.0.0.1';
databaseUrl.port = process.env.PAYMENT_DB_PORT || '15432';
process.env.DATABASE_URL = databaseUrl.toString();
process.env.NODE_ENV = 'test';
Object.assign(process.env, {
    MOMO_PARTNER_CODE: 'tt-recovery-partner', MOMO_ACCESS_KEY: 'tt-recovery-access',
    MOMO_SECRET_KEY: randomUUID(), VNPAY_TMN_CODE: 'TTTEST88', VNPAY_HASH_SECRET: randomUUID(),
    PAYMENT_REFUND_POLICY_ENABLED: 'false',
    PAYMENT_REFUND_EXECUTION_ENABLED: 'false', PAYMENT_REFUND_POLICY_VERSION: 'TT-ONLY',
    PAYMENT_REFUND_MAX_VND: '10000'
});
require('ts-node').register({ project: 'apps/api/tsconfig.json', transpileOnly: true });
const express = require('express');
const jwt = require('jsonwebtoken');
const { prisma } = require('@cafe-project/database');
const { errorHandler } = require('../src/common/error-handler');
const routes = require('../src/modules/payment/payment.route').default;
const runId = 'tt-recovery-' + randomUUID();
const momoSettlementId = String(1000000000 + Math.floor(Math.random() * 900000000));
const vnpaySettlementId = String(1000000000 + Math.floor(Math.random() * 900000000));
const results = [];
let base, apiServer, providerServer, adminToken, staffToken, actor;
let behavior = 'queryPaid';
let observedProviderCalls = 0;

const assertStatus = (result, expected) => assert.equal(result.status, expected, JSON.stringify(result.body));
const api = async (method, path, body, role = 'ADMIN') => {
    const response = await fetch(`${base}/api/payments${path}`, {
        method, headers: { 'content-type': 'application/json', authorization: 'Bearer ' +
            (role === 'STAFF' ? staffToken : adminToken) },
        body: body === undefined ? undefined : JSON.stringify(body), signal: AbortSignal.timeout(10000)
    });
    const raw = await response.text();
    return { status: response.status, body: raw ? JSON.parse(raw) : null };
};

const fixture = async (status = 'PENDING', failCode = null, method = 'MOMO') => {
    const orderId = runId + '-' + randomUUID();
    return prisma.order.create({ data: {
        id: orderId, userId: actor.id, totalAmount: '10000', paymentStatus: status === 'PAID' ? 'PAID' : 'PENDING',
        paymentMethod: method, payments: { create: {
            method, amount: '10000', merchantRef: `${orderId}_1`, attemptNo: 1,
            requestPayload: method === 'VNPAY' ? { vnp_CreateDate: '20261119120000' } : undefined,
            status, failureCode: failCode, providerTxnId: status === 'PAID' ? `${method}:${Date.now()}${Math.floor(Math.random() * 10000)}` : null
        } }
    }, include: { payments: true } });
};

const record = async (id, testFn) => {
    try { const details = await testFn(); results.push({ id, outcome: 'PASS_BACKEND_ONLY', ...details }); }
    catch (error) { results.push({ id, outcome: 'FAIL', error: error.stack }); process.exitCode = 1; }
    console.log(`${id}: ${results.at(-1).outcome}`);
};

async function main() {
    const provider = http.createServer(async (req, res) => {
        observedProviderCalls += 1;
        let raw = ''; for await (const chunk of req) raw += chunk;
        const data = JSON.parse(raw);
        res.setHeader('content-type', 'application/json');
        if (data.vnp_Command === 'querydr') {
            const response = {
                vnp_ResponseId: randomUUID().replaceAll('-', '').slice(0, 32), vnp_Command: 'querydr',
                vnp_ResponseCode: '00', vnp_Message: 'Success', vnp_TmnCode: data.vnp_TmnCode,
                vnp_TxnRef: data.vnp_TxnRef, vnp_Amount: behavior === 'vnpWrongAmount' ? '900000' : '1000000',
                vnp_BankCode: 'NCB', vnp_PayDate: '20261119122000', vnp_TransactionNo: vnpaySettlementId,
                vnp_TransactionType: '01', vnp_TransactionStatus: '00', vnp_OrderInfo: 'Test',
                vnp_PromotionCode: '', vnp_PromotionAmount: ''
            };
            const names = ['vnp_ResponseId','vnp_Command','vnp_ResponseCode','vnp_Message','vnp_TmnCode',
                'vnp_TxnRef','vnp_Amount','vnp_BankCode','vnp_PayDate','vnp_TransactionNo','vnp_TransactionType',
                'vnp_TransactionStatus','vnp_OrderInfo','vnp_PromotionCode','vnp_PromotionAmount'];
            const signature = createHmac('sha512', process.env.VNPAY_HASH_SECRET)
                .update(names.map(key => response[key]).join('|')).digest('hex');
            response.vnp_SecureHash = behavior === 'vnpBadSignature' ? 'f'.repeat(128) : signature;
            return res.end(JSON.stringify(response));
        }
        if (req.url.endsWith('/refund/query')) {
            return res.end(JSON.stringify({ partnerCode: data.partnerCode, requestId: data.requestId,
                orderId: data.orderId, resultCode: 0,
                refundTrans: [{ orderId: data.orderId, amount: 10000, transId: 987654321, resultCode: 0 }] }));
        }
        if (req.url.endsWith('/refund')) {
            if (behavior === 'refundUnknown') { res.statusCode = 503; return res.end('{}'); }
            if (behavior === 'refundRejected') {
                return res.end(JSON.stringify({ partnerCode: data.partnerCode, requestId: data.requestId,
                    orderId: data.orderId, amount: data.amount, resultCode: 1080 }));
            }
            return res.end(JSON.stringify({ partnerCode: data.partnerCode, requestId: data.requestId,
                orderId: data.orderId, amount: data.amount, transId: 987654321, resultCode: 0 }));
        }
        if (req.url.endsWith('/query')) {
            return res.end(JSON.stringify({ partnerCode: data.partnerCode, requestId: data.requestId,
                orderId: data.orderId, amount: behavior === 'queryWrongAmount' ? 9000 : 10000, transId: momoSettlementId,
                resultCode: behavior === 'queryFailed' ? 1006 : behavior === 'queryUnknown' ? 1000 : 0 }));
        }
        res.statusCode = 404; res.end('{}');
    });
    providerServer = provider;
    await new Promise(resolve => provider.listen(0, '127.0.0.1', resolve));
    process.env.MOMO_ENDPOINT = `http://127.0.0.1:${provider.address().port}/v2/gateway/api/create`;
    process.env.VNPAY_API_URL = `http://127.0.0.1:${provider.address().port}/merchant_webapi/api/transaction`;
    actor = await prisma.user.findFirstOrThrow({ where: { role: 'ADMIN', isActive: true }, select: { id: true, role: true, email: true } });
    const staff = await prisma.user.findFirstOrThrow({ where: { role: 'STAFF', isActive: true }, select: { id: true, role: true, email: true } });
    adminToken = jwt.sign(actor, process.env.JWT_SECRET, { expiresIn: '30m' });
    staffToken = jwt.sign(staff, process.env.JWT_SECRET, { expiresIn: '30m' });
    const app = express(); app.use(express.json()); app.use('/api/payments', routes); app.use(errorHandler);
    apiServer = app.listen(0, '127.0.0.1'); await new Promise(resolve => apiServer.once('listening', resolve));
    base = `http://127.0.0.1:${apiServer.address().port}`;
    const database = await prisma.$queryRaw`SELECT current_database() AS db, inet_server_port() AS port`;
    assert.equal(database[0].db, 'cafedb');

    await record('TT-07', async () => {
        const o = await fixture('PENDING', 'GATEWAY_OUTCOME_UNKNOWN');
        const payment = o.payments[0]; behavior = 'queryUnknown';
        assertStatus(await api('POST', '/create-url', { orderId: o.id, method: 'MOMO' }), 409);
        assertStatus(await api('POST', `/${payment.id}/reconcile`), 200);
        behavior = 'queryWrongAmount';
        assertStatus(await api('POST', `/${payment.id}/reconcile`), 200);
        let p = await prisma.payment.findUniqueOrThrow({ where: { id: payment.id } });
        assert.equal(p.failureCode, 'GATEWAY_OUTCOME_UNKNOWN');
        behavior = 'queryPaid';
        const reconciled = await api('POST', `/${payment.id}/reconcile`);
        assertStatus(reconciled, 200);
        p = await prisma.payment.findUniqueOrThrow({ where: { id: payment.id } });
        assert.equal(p.status, 'PAID'); assert.equal(p.providerTxnId, `MOMO:${momoSettlementId}`);
        const order = await prisma.order.findUniqueOrThrow({ where: { id: o.id } });
        assert.equal(order.paymentStatus, 'PAID');
        assert.equal(await prisma.paymentCallback.count({ where: { paymentId: p.id, eventType: 'PROVIDER_STATUS_LOOKUP' } }), 3);
        return { outcomeCode: 'PAID', paymentId: p.id, queryEvidence: 'synthetic localhost provider; genuine HTTP and PostgreSQL' };
    });

    await record('TT-07-VNPAY', async () => {
        const o = await fixture('PENDING', 'GATEWAY_OUTCOME_UNKNOWN', 'VNPAY');
        const payment = o.payments[0];
        behavior = 'vnpBadSignature';
        assertStatus(await api('POST', `/${payment.id}/reconcile`), 200);
        assert.equal((await prisma.payment.findUniqueOrThrow({ where: { id: payment.id } })).status, 'PENDING');
        behavior = 'vnpWrongAmount';
        assertStatus(await api('POST', `/${payment.id}/reconcile`), 200);
        assert.equal((await prisma.payment.findUniqueOrThrow({ where: { id: payment.id } })).status, 'PENDING');
        behavior = 'vnpValid';
        const response = await api('POST', `/${payment.id}/reconcile`);
        assertStatus(response, 200);
        assert.equal((await prisma.payment.findUniqueOrThrow({ where: { id: payment.id } })).status, 'PAID');
        assert.equal((await prisma.order.findUniqueOrThrow({ where: { id: o.id } })).paymentStatus, 'PAID');
        return { provider: 'VNPAY', checksumAndAmountTampering: 'REJECTED', proof: 'synthetic signed localhost response' };
    });

    await record('TT-11', async () => {
        const o = await fixture('PAID'); const id = o.payments[0].id;
        const refundBody = amount => ({ requestId: randomUUID(), amount, reason: 'Customer approved return', approvalRef: 'TT-APPROVAL-001' });
        assertStatus(await api('POST', `/${id}/refunds`, refundBody('6000')), 403);
        process.env.PAYMENT_REFUND_POLICY_ENABLED = 'true';
        assertStatus(await api('POST', `/${id}/refunds`, refundBody('6000'), 'STAFF'), 403);
        const firstBody = refundBody('6000'); const secondBody = refundBody('6000');
        const attempts = await Promise.all([api('POST', `/${id}/refunds`, firstBody), api('POST', `/${id}/refunds`, secondBody)]);
        assert.deepEqual(attempts.map(x => x.status).sort(), [200, 409]);
        const successfulBody = attempts[0].status === 200 ? firstBody : secondBody;
        const first = attempts.find(x => x.status === 200).body.data.refund;
        const replay = await api('POST', `/${id}/refunds`, successfulBody);
        assertStatus(replay, 200); assert.equal(replay.body.data.refund.id, first.id);
        assertStatus(await api('POST', `/${id}/refunds`, { ...successfulBody, amount: '5000' }), 409);
        assertStatus(await api('POST', `/${id}/refunds`, refundBody('4000')), 200);
        assertStatus(await api('POST', `/${id}/refunds`, refundBody('1000')), 409);
        assertStatus(await api('POST', `/${id}/refunds/${first.id}/execute`), 403);
        assert.equal(await prisma.paymentRefund.count({ where: { paymentId: id } }), 2);
        assert.equal((await prisma.payment.findUniqueOrThrow({ where: { id } })).status, 'PAID');
        const cash = await fixture('PAID', null, 'CASH');
        const cashId = cash.payments[0].id;
        const c1 = await api('POST', `/${cashId}/refunds`, refundBody('6000'));
        const c2 = await api('POST', `/${cashId}/refunds`, refundBody('4000'));
        assertStatus(c1, 200); assertStatus(c2, 200);
        const receipt1 = { receiptRef: 'TT-CASH-RECEIPT-001' }, receipt2 = { receiptRef: 'TT-CASH-RECEIPT-002' };
        assertStatus(await api('POST', `/${cashId}/refunds/${c1.body.data.refund.id}/attest-cash`, receipt1), 200);
        assert.equal((await prisma.payment.findUniqueOrThrow({ where: { id: cashId } })).status, 'PAID');
        assertStatus(await api('POST', `/${cashId}/refunds/${c2.body.data.refund.id}/attest-cash`, receipt1), 409);
        assertStatus(await api('POST', `/${cashId}/refunds/${c2.body.data.refund.id}/attest-cash`, receipt2), 200);
        assert.equal((await prisma.payment.findUniqueOrThrow({ where: { id: cashId } })).status, 'REFUNDED');
        assert.equal((await prisma.order.findUniqueOrThrow({ where: { id: cash.id } })).paymentStatus, 'REFUNDED');
        return { refundId: first.id, policy: 'test-only', maxReserved: 10000, concurrency: 'one accepted, one rejected' };
    });

    await record('TT-13', async () => {
        process.env.PAYMENT_REFUND_EXECUTION_ENABLED = 'true';
        const o = await fixture('PAID'); const id = o.payments[0].id;
        const created = await api('POST', `/${id}/refunds`, {
            requestId: randomUUID(), amount: '10000', reason: 'Approved full refund', approvalRef: 'TT-APPROVAL-013'
        });
        assertStatus(created, 200);
        const refundId = created.body.data.refund.id;
        behavior = 'refundRejected';
        const rejected = await api('POST', `/${id}/refunds/${refundId}/execute`);
        assertStatus(rejected, 200); assert.equal(rejected.body.data.refund.status, 'FAILED');
        behavior = 'refundUnknown';
        assertStatus(await api('POST', `/${id}/refunds/${refundId}/execute`), 502);
        assertStatus(await api('POST', `/${id}/refunds/${refundId}/execute`), 409);
        let state = await prisma.paymentRefund.findUniqueOrThrow({ where: { id: refundId } });
        assert.equal(state.status, 'UNKNOWN');
        assert.equal((await prisma.payment.findUniqueOrThrow({ where: { id } })).status, 'PAID');
        const lookup = await api('POST', `/${id}/refunds/${refundId}/reconcile`);
        assertStatus(lookup, 200); assert.equal(lookup.body.data.refund.status, 'SUCCEEDED');
        state = await prisma.paymentRefund.findUniqueOrThrow({ where: { id: refundId } });
        assert.equal(state.status, 'SUCCEEDED');
        assert.equal((await prisma.payment.findUniqueOrThrow({ where: { id } })).status, 'REFUNDED');
        assert.equal((await prisma.order.findUniqueOrThrow({ where: { id: o.id } })).paymentStatus, 'REFUNDED');
        const events = await prisma.paymentRefundEvent.findMany({ where: { refundId }, orderBy: { createdAt: 'asc' } });
        assert.deepEqual(events.map(e => e.kind), ['REQUESTED','DISPATCH','PROVIDER_RESULT','DISPATCH','PROVIDER_RESULT','PROVIDER_RESULT']);
        return { refundId, eventCount: events.length, transitions: 'REQUESTED -> FAILED -> UNKNOWN -> SUCCEEDED', providerProof: 'NOT_VERIFIED_EXTERNAL' };
    });
    console.log(JSON.stringify({ runId, database, observedProviderCalls, results }, null, 2));
    const evidence = { runId, database, observedProviderCalls, results,
        evidenceClass: 'HTTP+REAL_POSTGRESQL_WITH_LOCAL_SYNTHETIC_PROVIDER_ONLY',
        externalProvider: 'NOT_VERIFIED', policyEnabledOutsideTestProcess: false };
    const evidencePath = 'D:/KLTN/cafe-project-artifacts/reports/payment/recovery-cafedb-evidence.json';
    fs.mkdirSync('D:/KLTN/cafe-project-artifacts/reports/payment', { recursive: true });
    fs.writeFileSync(evidencePath, JSON.stringify(evidence, null, 2));
}

main().catch(error => { console.error(error.message); process.exitCode = 1; })
    .finally(async () => {
        if (apiServer) await new Promise(resolve => apiServer.close(resolve));
        if (providerServer) await new Promise(resolve => providerServer.close(resolve));
        await prisma.$disconnect();
    });
