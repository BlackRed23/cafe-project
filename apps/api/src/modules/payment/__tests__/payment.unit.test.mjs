import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import test from 'node:test';

// Pure unit & stateful flow tests for MoMo (HMAC-SHA256) and VNPay (HMAC-SHA512)
// Run directly with: node --test apps/api/src/modules/payment/__tests__/payment.unit.test.mjs

const timingSafeEqualHex = (signatureA, signatureB) => {
    const cleanA = String(signatureA || '').trim().toLowerCase();
    const cleanB = String(signatureB || '').trim().toLowerCase();
    if (!cleanA || !cleanB || cleanA.length !== cleanB.length) return false;
    const bufA = Buffer.from(cleanA, 'utf8');
    const bufB = Buffer.from(cleanB, 'utf8');
    return bufA.length === bufB.length && crypto.timingSafeEqual(bufA, bufB);
};

const signMoMoIpnPayload = (payload, accessKey, secretKey) => {
    const rawSignature =
        `accessKey=${accessKey}` +
        `&amount=${payload.amount ?? ''}` +
        `&extraData=${payload.extraData ?? ''}` +
        `&message=${payload.message ?? ''}` +
        `&orderId=${payload.orderId ?? ''}` +
        `&orderInfo=${payload.orderInfo ?? ''}` +
        `&orderType=${payload.orderType ?? ''}` +
        `&partnerCode=${payload.partnerCode ?? ''}` +
        `&payType=${payload.payType ?? ''}` +
        `&requestId=${payload.requestId ?? ''}` +
        `&responseTime=${payload.responseTime ?? ''}` +
        `&resultCode=${payload.resultCode ?? ''}` +
        `&transId=${payload.transId ?? ''}`;

    return crypto.createHmac('sha256', secretKey).update(rawSignature).digest('hex');
};

const verifyMoMoSignature = (payload, { accessKey, secretKey }) => {
    if (!payload || typeof payload.signature !== 'string') return false;
    const expected = signMoMoIpnPayload(payload, accessKey, secretKey);
    return timingSafeEqualHex(payload.signature, expected);
};

const buildVNPaySignData = (params) => {
    const keys = Object.keys(params)
        .filter((k) => k !== 'vnp_SecureHash' && k !== 'vnp_SecureHashType' && params[k] !== undefined && params[k] !== '')
        .sort();
    return keys
        .map((k) => `${encodeURIComponent(k)}=${encodeURIComponent(String(params[k])).replace(/%20/g, '+')}`)
        .join('&');
};

const signVNPayParams = (params, hashSecret) => {
    return crypto.createHmac('sha512', hashSecret).update(Buffer.from(buildVNPaySignData(params), 'utf8')).digest('hex');
};

const verifyVNPaySignature = (query, { hashSecret }) => {
    if (!query || typeof query.vnp_SecureHash !== 'string') return false;
    const expected = signVNPayParams(query, hashSecret);
    return timingSafeEqualHex(query.vnp_SecureHash, expected);
};

// In-memory state simulator matching paymentRepository & payment.service rules
const createPaymentEngine = (momoConfig, vnpayConfig) => {
    const orders = new Map();
    const payments = new Map();
    const callbacks = new Map();
    const callbackByEventId = new Map();

    return {
        orders,
        payments,
        callbacks,
        seedOrder({ id, userId = 'u1', totalAmount = 65000, status = 'PENDING', paymentStatus = 'PENDING' }) {
            orders.set(id, { id, userId, totalAmount, status, paymentStatus, paymentMethod: null, paidAt: null });
        },
        createAttempt({ orderId, method }) {
            const order = orders.get(orderId);
            if (!order) throw Object.assign(new Error('Not found'), { statusCode: 404 });
            if (order.paymentStatus === 'PAID') throw Object.assign(new Error('Already paid'), { statusCode: 409 });
            if (order.status === 'CANCELLED') throw Object.assign(new Error('Cancelled'), { statusCode: 409 });

            let maxAttempt = 0;
            for (const p of payments.values()) {
                if (p.orderId === orderId) {
                    if (p.attemptNo > maxAttempt) maxAttempt = p.attemptNo;
                    if (p.status === 'INITIATED' || p.status === 'PENDING') {
                        p.status = 'CANCELLED';
                        p.failureCode = 'SUPERSEDED';
                    }
                }
            }

            const attemptNo = maxAttempt + 1;
            const merchantRef = `${orderId}_${attemptNo}`;
            const payment = {
                id: `pay_${orderId}_${attemptNo}`,
                orderId,
                method,
                merchantRef,
                amount: order.totalAmount,
                status: 'PENDING',
                attemptNo,
                providerTxnId: null,
                paidAt: null,
                failureCode: null
            };
            payments.set(payment.id, payment);
            order.paymentMethod = method;
            return payment;
        },
        async processMoMoWebhook(payload) {
            if (!verifyMoMoSignature(payload, momoConfig)) {
                const cbId = `cb_${callbacks.size + 1}`;
                callbacks.set(cbId, { id: cbId, status: 'REJECTED_INVALID_SIGNATURE', signatureValid: false });
                throw Object.assign(new Error('Invalid signature.'), { statusCode: 400 });
            }

            const transId = payload.transId ? String(payload.transId) : null;
            const providerEventId = transId ? `MOMO:${transId}` : `MOMO:${payload.orderId}:${payload.resultCode}`;

            // Atomic unique check (simulates P2002 on PaymentCallback.providerEventId)
            if (callbackByEventId.has(providerEventId)) {
                const existing = callbackByEventId.get(providerEventId);
                existing.retryCount += 1;
                return { status: 'ALREADY_PROCESSED' };
            }

            const cb = {
                id: `cb_${callbacks.size + 1}`,
                providerEventId,
                signatureValid: true,
                status: 'VERIFIED',
                retryCount: 0,
                errorMessage: null
            };
            callbacks.set(cb.id, cb);
            callbackByEventId.set(providerEventId, cb);

            const payment = [...payments.values()].find((p) => p.merchantRef === payload.orderId);
            if (!payment) {
                cb.status = 'FAILED';
                throw Object.assign(new Error('Payment not found'), { statusCode: 404 });
            }

            if (Math.round(Number(payload.amount)) !== Math.round(Number(payment.amount))) {
                cb.status = 'FAILED';
                cb.errorMessage = 'AMOUNT_MISMATCH';
                return { status: 'FAILED' };
            }

            const order = orders.get(payment.orderId);
            const isSuccess = Number(payload.resultCode) === 0;

            if (isSuccess) {
                if (payment.status === 'PAID') {
                    cb.status = 'DUPLICATED';
                    return { status: 'ALREADY_PROCESSED' };
                }
                if (order.paymentStatus === 'PAID') {
                    cb.status = 'FAILED';
                    cb.errorMessage = 'DUPLICATE_PAYMENT';
                    return { status: 'FAILED' };
                }
                if (['INITIATED', 'PENDING', 'CANCELLED', 'EXPIRED'].includes(payment.status)) {
                    payment.status = 'PAID';
                    payment.paidAt = new Date();
                    payment.providerTxnId = `MOMO:${transId}`;
                    order.paymentStatus = 'PAID';
                    order.paidAt = payment.paidAt;
                    if (order.status === 'PENDING') order.status = 'PROCESSING';
                }
                cb.status = 'APPLIED';
                return { status: 'APPLIED' };
            }

            // Failed IPN: do not downgrade if already PAID
            if (payment.status !== 'PAID') {
                payment.status = 'FAILED';
                payment.failureCode = String(payload.resultCode);
            }
            cb.status = 'APPLIED';
            return { status: 'FAILED' };
        },
        async processVNPayIpn(query) {
            if (!verifyVNPaySignature(query, vnpayConfig)) {
                return { RspCode: '97', Message: 'Invalid Checksum' };
            }
            const payment = [...payments.values()].find((p) => p.merchantRef === query.vnp_TxnRef);
            if (!payment) return { RspCode: '01', Message: 'Order not found' };

            const expectedAmount = Math.round(Number(payment.amount));
            const receivedAmount = Math.round(Number(query.vnp_Amount) / 100);
            if (receivedAmount !== expectedAmount) return { RspCode: '04', Message: 'Invalid amount' };

            const providerEventId = `VNPAY:${query.vnp_TransactionNo || query.vnp_TxnRef}`;
            if (callbackByEventId.has(providerEventId) || payment.status === 'PAID') {
                return { RspCode: '02', Message: 'Order already confirmed' };
            }
            callbackByEventId.set(providerEventId, { id: providerEventId, retryCount: 0 });

            const order = orders.get(payment.orderId);
            if (query.vnp_ResponseCode === '00' && query.vnp_TransactionStatus === '00') {
                payment.status = 'PAID';
                order.paymentStatus = 'PAID';
                if (order.status === 'PENDING') order.status = 'PROCESSING';
            } else if (payment.status !== 'PAID') {
                payment.status = 'FAILED';
            }
            return { RspCode: '00', Message: 'Confirm Success' };
        }
    };
};

const MOMO_CFG = { accessKey: 'test_access', secretKey: 'test_secret' };
const VNPAY_CFG = { hashSecret: 'vnpay_test_hash_secret_123456' };

const makeSignedMoMoPayload = (overrides = {}) => {
    const base = {
        partnerCode: 'MOMO',
        orderId: 'order1_1',
        requestId: 'order1_1_100',
        amount: 65000,
        orderInfo: 'Thanh toan don hang order1',
        orderType: 'momo_wallet',
        transId: '99887766',
        resultCode: 0,
        message: 'Success',
        payType: 'qr',
        responseTime: 1700000000000,
        extraData: '',
        ...overrides
    };
    base.signature = overrides.signature ?? signMoMoIpnPayload(base, MOMO_CFG.accessKey, MOMO_CFG.secretKey);
    return base;
};

test('1. MoMo & VNPay HMAC signature verification (valid & invalid)', () => {
    const momoPayload = makeSignedMoMoPayload();
    assert.equal(verifyMoMoSignature(momoPayload, MOMO_CFG), true);
    assert.equal(verifyMoMoSignature({ ...momoPayload, amount: 99999 }, MOMO_CFG), false);
    assert.equal(verifyMoMoSignature({ ...momoPayload, signature: 'bad_hex' }, MOMO_CFG), false);

    const vnpParams = {
        vnp_Amount: '6500000',
        vnp_Command: 'pay',
        vnp_ResponseCode: '00',
        vnp_TmnCode: 'TESTTMN',
        vnp_TransactionNo: '14000001',
        vnp_TransactionStatus: '00',
        vnp_TxnRef: 'order1_1'
    };
    const vnpHash = signVNPayParams(vnpParams, VNPAY_CFG.hashSecret);
    assert.equal(verifyVNPaySignature({ ...vnpParams, vnp_SecureHash: vnpHash }, VNPAY_CFG), true);
    assert.equal(verifyVNPaySignature({ ...vnpParams, vnp_Amount: '100', vnp_SecureHash: vnpHash }, VNPAY_CFG), false);
});

test('2. Idempotency & parallel webhooks: duplicate transId only applies once', async () => {
    const engine = createPaymentEngine(MOMO_CFG, VNPAY_CFG);
    engine.seedOrder({ id: 'order1', totalAmount: 65000 });
    engine.createAttempt({ orderId: 'order1', method: 'MOMO' });

    const payload = makeSignedMoMoPayload({ orderId: 'order1_1', transId: 'TXN_DUP_1' });
    const [res1, res2] = await Promise.all([
        engine.processMoMoWebhook(payload),
        engine.processMoMoWebhook(payload)
    ]);

    assert.equal(res1.status, 'APPLIED');
    assert.equal(res2.status, 'ALREADY_PROCESSED');
    assert.equal(engine.orders.get('order1').paymentStatus, 'PAID');
    assert.equal(engine.orders.get('order1').status, 'PROCESSING');
    assert.equal(engine.callbacks.size, 1);
});

test('3. Amount mismatch is rejected and does not mark order PAID', async () => {
    const engine = createPaymentEngine(MOMO_CFG, VNPAY_CFG);
    engine.seedOrder({ id: 'order2', totalAmount: 65000 });
    engine.createAttempt({ orderId: 'order2', method: 'MOMO' });

    const badAmountPayload = makeSignedMoMoPayload({ orderId: 'order2_1', amount: 10000, transId: 'TXN_BAD_AMT' });
    const res = await engine.processMoMoWebhook(badAmountPayload);

    assert.equal(res.status, 'FAILED');
    assert.equal(engine.orders.get('order2').paymentStatus, 'PENDING');
    assert.equal(engine.payments.get('pay_order2_1').status, 'PENDING');
});

test('4. Failed webhook (resultCode != 0) marks attempt FAILED and late failed webhook never downgrades PAID', async () => {
    const engine = createPaymentEngine(MOMO_CFG, VNPAY_CFG);
    engine.seedOrder({ id: 'order3', totalAmount: 65000 });
    engine.createAttempt({ orderId: 'order3', method: 'MOMO' });

    const failedPayload = makeSignedMoMoPayload({ orderId: 'order3_1', resultCode: 1006, transId: 'TXN_FAIL_1' });
    const resFail = await engine.processMoMoWebhook(failedPayload);
    assert.equal(resFail.status, 'FAILED');
    assert.equal(engine.payments.get('pay_order3_1').status, 'FAILED');
    assert.equal(engine.orders.get('order3').paymentStatus, 'PENDING');

    // Create 2nd attempt, succeed, then send a late failure for attempt 2
    engine.createAttempt({ orderId: 'order3', method: 'MOMO' });
    const okPayload = makeSignedMoMoPayload({ orderId: 'order3_2', resultCode: 0, transId: 'TXN_OK_2' });
    await engine.processMoMoWebhook(okPayload);
    assert.equal(engine.payments.get('pay_order3_2').status, 'PAID');

    const lateFailPayload = makeSignedMoMoPayload({ orderId: 'order3_2', resultCode: 99, transId: 'TXN_LATE_FAIL' });
    await engine.processMoMoWebhook(lateFailPayload);
    assert.equal(engine.payments.get('pay_order3_2').status, 'PAID');
    assert.equal(engine.orders.get('order3').paymentStatus, 'PAID');
});

test('5. Superseded attempt & late webhook rules (SUPERSEDED + DUPLICATE_PAYMENT protection)', async () => {
    const engine = createPaymentEngine(MOMO_CFG, VNPAY_CFG);
    engine.seedOrder({ id: 'order4', totalAmount: 65000 });

    const attempt1 = engine.createAttempt({ orderId: 'order4', method: 'MOMO' });
    const attempt2 = engine.createAttempt({ orderId: 'order4', method: 'MOMO' });

    assert.equal(attempt1.status, 'CANCELLED');
    assert.equal(attempt1.failureCode, 'SUPERSEDED');
    assert.equal(attempt2.status, 'PENDING');
    assert.equal(attempt2.attemptNo, 2);

    // Late success webhook on superseded attempt1 while order is still unpaid -> accepted!
    const latePaid1 = makeSignedMoMoPayload({ orderId: 'order4_1', resultCode: 0, transId: 'TXN_LATE_1' });
    const res1 = await engine.processMoMoWebhook(latePaid1);
    assert.equal(res1.status, 'APPLIED');
    assert.equal(attempt1.status, 'PAID');
    assert.equal(engine.orders.get('order4').paymentStatus, 'PAID');

    // Now attempt2 also sends a success webhook -> flagged as DUPLICATE_PAYMENT
    const paid2 = makeSignedMoMoPayload({ orderId: 'order4_2', resultCode: 0, transId: 'TXN_DUP_ATTEMPT_2' });
    const res2 = await engine.processMoMoWebhook(paid2);
    assert.equal(res2.status, 'FAILED');
    assert.equal(attempt2.status, 'PENDING');
});

test('6. Cancelled order rejects new payment URL creation & VNPay RspCodes', async () => {
    const engine = createPaymentEngine(MOMO_CFG, VNPAY_CFG);
    engine.seedOrder({ id: 'order5', totalAmount: 50000, status: 'CANCELLED' });

    assert.throws(() => engine.createAttempt({ orderId: 'order5', method: 'VNPAY' }), (err) => err.statusCode === 409);

    engine.seedOrder({ id: 'order6', totalAmount: 50000 });
    engine.createAttempt({ orderId: 'order6', method: 'VNPAY' });

    const baseVnp = {
        vnp_Amount: '5000000',
        vnp_ResponseCode: '00',
        vnp_TransactionNo: 'VNP_1',
        vnp_TransactionStatus: '00',
        vnp_TxnRef: 'order6_1'
    };
    const validQuery = { ...baseVnp, vnp_SecureHash: signVNPayParams(baseVnp, VNPAY_CFG.hashSecret) };
    const badSigRes = await engine.processVNPayIpn({ ...baseVnp, vnp_SecureHash: 'wrong' });
    assert.equal(badSigRes.RspCode, '97');

    const badAmtParams = { ...baseVnp, vnp_Amount: '99900' };
    const badAmtRes = await engine.processVNPayIpn({
        ...badAmtParams,
        vnp_SecureHash: signVNPayParams(badAmtParams, VNPAY_CFG.hashSecret)
    });
    assert.equal(badAmtRes.RspCode, '04');

    const okRes = await engine.processVNPayIpn(validQuery);
    assert.equal(okRes.RspCode, '00');

    const dupRes = await engine.processVNPayIpn(validQuery);
    assert.equal(dupRes.RspCode, '02');
});
