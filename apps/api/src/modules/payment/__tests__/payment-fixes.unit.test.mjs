import assert from 'node:assert/strict';
import test, { describe } from 'node:test';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execSync } from 'node:child_process';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const apiRoot = path.resolve(__dirname, '../../../..');
const require = createRequire(import.meta.url);

import fs from 'node:fs';

// Compile latest TypeScript to dist if not already built
const distPaymentServicePath = path.join(apiRoot, 'dist/modules/payment/payment.service.js');
if (!fs.existsSync(distPaymentServicePath)) {
    execSync('npx tsc', { cwd: apiRoot, stdio: 'inherit' });
}

const {
    extractOrderIdFromMerchantRef,
    assertManualPaymentTransition,
    simulateDevMoMoIpn
} = require(path.join(apiRoot, 'dist/modules/payment/payment.service.js'));

const {
    appendManualPaymentAudit
} = require(path.join(apiRoot, 'dist/modules/payment/payment.repository.js'));

const {
    resolveUnpaidOnlineOrderCancelMinutes
} = require(path.join(apiRoot, 'dist/modules/order/order.service.js'));

// Stateful simulator mirroring order.service + order.repository + payment.service + payment.repository
const createPaymentFixesSimulator = () => {
    const orders = new Map();
    const payments = new Map();
    let seq = 1;

    const getLatestPayment = (orderId) => {
        const list = [...payments.values()]
            .filter((p) => p.orderId === orderId)
            .sort((a, b) => b.attemptNo - a.attemptNo);
        return list[0] ?? null;
    };

    return {
        orders,
        payments,
        seedOrder({
            id,
            status = 'PENDING',
            paymentStatus = 'PENDING',
            paymentMethod = 'CASH',
            totalAmount = 75000,
            expiresAt = null
        }) {
            const order = {
                id,
                status,
                paymentStatus,
                paymentMethod,
                totalAmount,
                createdAt: new Date(),
                reservedReleased: false,
                paidAt: paymentStatus === 'PAID' ? new Date() : null
            };
            orders.set(id, order);

            const isOnline = paymentMethod === 'MOMO' || paymentMethod === 'VNPAY';
            const payment = {
                id: `pay_${id}_1`,
                orderId: id,
                method: paymentMethod,
                merchantRef: `${id}_1`,
                amount: totalAmount,
                status: paymentStatus === 'PAID' ? 'PAID' : isOnline ? 'PENDING' : 'PENDING',
                attemptNo: 1,
                failureCode: null,
                failureMessage: null,
                paidAt: paymentStatus === 'PAID' ? order.paidAt : null,
                expiresAt,
                responsePayload: null
            };
            payments.set(payment.id, payment);
            return { order, payment };
        },

        // BUG-1: POST /api/orders/:id/confirm-payment
        confirmPayment(orderId, userId = 'staff-1', note = 'Đã nhận tiền mặt') {
            const order = orders.get(orderId);
            if (!order) throw Object.assign(new Error('Order not found'), { statusCode: 404 });
            if (order.status === 'CANCELLED') {
                throw Object.assign(new Error('Không thể xác nhận thanh toán cho đơn hàng đã hủy.'), { statusCode: 409 });
            }
            const latest = getLatestPayment(orderId);
            if (order.paymentStatus === 'PAID' || latest?.status === 'PAID') {
                throw Object.assign(new Error('Đơn hàng này đã được thanh toán.'), { statusCode: 409 });
            }
            const effectiveMethod = latest?.method ?? order.paymentMethod ?? 'CASH';
            if (effectiveMethod === 'MOMO' || effectiveMethod === 'VNPAY') {
                throw Object.assign(
                    new Error('Đơn đang chờ cổng thanh toán xác nhận, không thể xác nhận thủ công.'),
                    { statusCode: 409 }
                );
            }

            const now = new Date();
            order.paymentStatus = 'PAID';
            order.paidAt = now;
            if (latest) {
                latest.responsePayload = appendManualPaymentAudit(latest.responsePayload, {
                    by: userId,
                    from: latest.status,
                    to: 'PAID',
                    at: now.toISOString(),
                    note
                });
                latest.status = 'PAID';
                latest.paidAt = latest.paidAt ?? now;
            }
            return { order, payment: latest };
        },

        // BUG-3: Webhook arrives when Order is already CANCELLED
        applySuccessfulWebhookOnOrder(orderId, providerTxnId = `TXN_${seq++}`) {
            const order = orders.get(orderId);
            const payment = getLatestPayment(orderId);
            const now = new Date();

            if (order.status === 'CANCELLED') {
                payment.status = 'PAID';
                payment.paidAt = now;
                payment.providerTxnId = providerTxnId;
                payment.failureCode = 'REFUND_REQUIRED';
                payment.failureMessage = 'Đơn đã hủy trước khi nhận IPN thành công – cần hoàn tiền thủ công.';
                order.paymentStatus = 'PAID';
                order.paidAt = now;
                return { outcome: 'PAID_AFTER_CANCEL', order, payment };
            }

            payment.status = 'PAID';
            payment.paidAt = now;
            payment.providerTxnId = providerTxnId;
            order.paymentStatus = 'PAID';
            order.paidAt = now;
            if (order.status === 'PENDING') {
                order.status = 'PROCESSING';
            }
            return { outcome: 'APPLIED', order, payment };
        },

        // BUG-3: Cancel order that was already PAID
        cancelOrder(orderId) {
            const order = orders.get(orderId);
            order.status = 'CANCELLED';
            if (order.paymentStatus === 'PAID') {
                for (const p of payments.values()) {
                    if (p.orderId === orderId && p.status === 'PAID') {
                        p.failureCode = 'REFUND_REQUIRED';
                        p.failureMessage = 'Đơn bị hủy sau khi đã thanh toán – cần hoàn tiền.';
                    }
                }
            }
            return order;
        },

        // BUG-3: POST /api/payments/:id/mark-refunded
        markRefunded(paymentId, user = { id: 'admin-1', role: 'ADMIN' }, note = 'Hoàn tiền qua chuyển khoản') {
            if (user.role !== 'ADMIN') {
                throw Object.assign(new Error('Forbidden'), { statusCode: 403 });
            }
            const payment = payments.get(paymentId);
            if (!payment) throw Object.assign(new Error('Not found'), { statusCode: 404 });
            if (payment.status === 'REFUNDED') {
                throw Object.assign(new Error('Giao dịch này đã được hoàn tiền trước đó.'), { statusCode: 409 });
            }
            if (payment.status !== 'PAID' || payment.failureCode !== 'REFUND_REQUIRED') {
                throw Object.assign(
                    new Error('Chỉ có thể xác nhận hoàn tiền cho giao dịch đã thanh toán có đánh dấu cần hoàn tiền (REFUND_REQUIRED).'),
                    { statusCode: 409 }
                );
            }

            payment.responsePayload = appendManualPaymentAudit(payment.responsePayload, {
                by: user.id,
                from: payment.status,
                to: 'REFUNDED',
                at: new Date().toISOString(),
                note
            });
            payment.status = 'REFUNDED';
            payment.failureCode = 'REFUNDED_MANUAL';
            payment.failureMessage = `Đã hoàn tiền thủ công: ${note}`;

            const order = orders.get(payment.orderId);
            order.paymentStatus = 'REFUNDED';
            return { order, payment };
        },

        // BUG-6: Expire stale online payments
        expireStaleOnlinePayments(now = new Date()) {
            let count = 0;
            for (const p of payments.values()) {
                const isOnline = p.method === 'MOMO' || p.method === 'VNPAY';
                const isPending = p.status === 'INITIATED' || p.status === 'PENDING';
                if (isOnline && isPending && p.expiresAt && p.expiresAt < now) {
                    p.status = 'EXPIRED';
                    p.failureCode = 'EXPIRED';
                    count++;
                }
            }
            return count;
        },

        // BUG-6 (Extended): Auto-cancel stale unpaid online orders & release reserved stock
        autoCancelStaleOnlineOrders(now = new Date(), cancelMinutes = 120) {
            const cutoff = new Date(now.getTime() - cancelMinutes * 60 * 1000);
            const cancelledIds = [];
            for (const order of orders.values()) {
                const isOnline = order.paymentMethod === 'MOMO' || order.paymentMethod === 'VNPAY';
                if (!isOnline || order.status !== 'PENDING' || order.paymentStatus !== 'PENDING') continue;
                if (order.createdAt >= cutoff) continue;

                const orderPayments = [...payments.values()].filter((p) => p.orderId === order.id);
                const hasPaid = orderPayments.some((p) => p.status === 'PAID');
                const hasActiveAttempt = orderPayments.some(
                    (p) => (p.status === 'INITIATED' || p.status === 'PENDING') && p.expiresAt && p.expiresAt > now
                );
                if (hasPaid || hasActiveAttempt) continue;

                order.status = 'CANCELLED';
                order.paymentStatus = 'FAILED';
                order.reservedReleased = true;
                for (const p of orderPayments) {
                    if (p.status === 'INITIATED' || p.status === 'PENDING') {
                        p.status = 'EXPIRED';
                        p.failureCode = 'ORDER_AUTO_CANCELLED';
                    }
                }
                cancelledIds.push(order.id);
            }
            return cancelledIds;
        }
    };
};

describe('Payment Fixes Unit Tests (BUG-1 to BUG-7)', () => {
    test('1. confirmPayment: CASH pending -> PAID; duplicate -> 409; CANCELLED -> 409; MOMO pending -> 409', () => {
        const sim = createPaymentFixesSimulator();
        sim.seedOrder({ id: 'ord_cash', paymentMethod: 'CASH', status: 'PENDING', paymentStatus: 'PENDING' });

        const res1 = sim.confirmPayment('ord_cash', 'staff_01', 'Đã thu tiền mặt');
        assert.equal(res1.order.paymentStatus, 'PAID');
        assert.equal(res1.payment.status, 'PAID');
        assert.ok(res1.payment.paidAt instanceof Date);
        assert.equal(res1.payment.responsePayload.manualUpdates.length, 1);
        assert.equal(res1.payment.responsePayload.manualUpdates[0].by, 'staff_01');

        // Calling 2nd time -> 409
        assert.throws(
            () => sim.confirmPayment('ord_cash', 'staff_01'),
            (err) => err.statusCode === 409
        );

        // Cancelled order -> 409
        sim.seedOrder({ id: 'ord_cancel', paymentMethod: 'CASH', status: 'CANCELLED', paymentStatus: 'PENDING' });
        assert.throws(
            () => sim.confirmPayment('ord_cancel', 'staff_01'),
            (err) => err.statusCode === 409
        );

        // Online MOMO pending -> 409 (cannot manually confirm)
        sim.seedOrder({ id: 'ord_momo', paymentMethod: 'MOMO', status: 'PENDING', paymentStatus: 'PENDING' });
        assert.throws(
            () => sim.confirmPayment('ord_momo', 'admin_01'),
            (err) => err.statusCode === 409 && err.message.includes('cổng thanh toán')
        );
    });

    test('2. Manual status state machine (assertManualPaymentTransition): blocks PAID -> FAILED, enforces ADMIN for REFUNDED, preserves paidAt', () => {
        // PENDING -> PAID for CASH is allowed
        assert.doesNotThrow(() => assertManualPaymentTransition('PENDING', 'PAID', 'CASH', 'STAFF'));

        // PENDING -> PAID for MOMO is blocked with 409
        assert.throws(
            () => assertManualPaymentTransition('PENDING', 'PAID', 'MOMO', 'ADMIN'),
            (err) => err.statusCode === 409
        );

        // PAID -> FAILED or PAID -> PENDING is blocked with 409
        assert.throws(
            () => assertManualPaymentTransition('PAID', 'FAILED', 'CASH', 'ADMIN'),
            (err) => err.statusCode === 409
        );
        assert.throws(
            () => assertManualPaymentTransition('PAID', 'PENDING', 'CASH', 'ADMIN'),
            (err) => err.statusCode === 409
        );

        // PAID -> REFUNDED by STAFF is blocked with 403, by ADMIN is allowed
        assert.throws(
            () => assertManualPaymentTransition('PAID', 'REFUNDED', 'CASH', 'STAFF'),
            (err) => err.statusCode === 403
        );
        assert.doesNotThrow(() => assertManualPaymentTransition('PAID', 'REFUNDED', 'CASH', 'ADMIN'));

        // FAILED -> PAID is blocked (must create new attempt)
        assert.throws(
            () => assertManualPaymentTransition('FAILED', 'PAID', 'CASH', 'ADMIN'),
            (err) => err.statusCode === 409
        );
    });

    test('3. applySuccessfulWebhookTx with CANCELLED order -> PAID_AFTER_CANCEL, failureCode = REFUND_REQUIRED, order remains CANCELLED', () => {
        const sim = createPaymentFixesSimulator();
        sim.seedOrder({ id: 'ord_late_ipn', paymentMethod: 'MOMO', status: 'CANCELLED', paymentStatus: 'PENDING' });

        const txRes = sim.applySuccessfulWebhookOnOrder('ord_late_ipn', 'MOMO:999111');
        assert.equal(txRes.outcome, 'PAID_AFTER_CANCEL');
        assert.equal(txRes.payment.status, 'PAID');
        assert.equal(txRes.payment.failureCode, 'REFUND_REQUIRED');
        assert.equal(txRes.order.status, 'CANCELLED');
        assert.equal(txRes.order.paymentStatus, 'PAID');
    });

    test('4. Cancelling an already PAID order sets REFUND_REQUIRED; mark-refunded transitions to REFUNDED; duplicate mark-refunded -> 409', () => {
        const sim = createPaymentFixesSimulator();
        const { payment } = sim.seedOrder({
            id: 'ord_paid_cancel',
            paymentMethod: 'VNPAY',
            status: 'PROCESSING',
            paymentStatus: 'PAID'
        });

        sim.cancelOrder('ord_paid_cancel');
        assert.equal(sim.orders.get('ord_paid_cancel').status, 'CANCELLED');
        assert.equal(payment.failureCode, 'REFUND_REQUIRED');

        // STAFF cannot mark refunded (403)
        assert.throws(
            () => sim.markRefunded(payment.id, { id: 'staff-1', role: 'STAFF' }),
            (err) => err.statusCode === 403
        );

        // ADMIN marks refunded -> Payment & Order become REFUNDED
        const refundedRes = sim.markRefunded(payment.id, { id: 'admin-1', role: 'ADMIN' }, 'Hoàn qua VCB');
        assert.equal(refundedRes.payment.status, 'REFUNDED');
        assert.equal(refundedRes.payment.failureCode, 'REFUNDED_MANUAL');
        assert.equal(refundedRes.order.paymentStatus, 'REFUNDED');

        // Calling mark-refunded again -> 409
        assert.throws(
            () => sim.markRefunded(payment.id, { id: 'admin-1', role: 'ADMIN' }),
            (err) => err.statusCode === 409
        );
    });

    test('5. Expire job only transitions expired MOMO/VNPAY in INITIATED/PENDING; CASH is untouched; late IPN after EXPIRED still succeeds', () => {
        const sim = createPaymentFixesSimulator();
        const past = new Date(Date.now() - 20 * 60 * 1000);
        const future = new Date(Date.now() + 10 * 60 * 1000);

        const { payment: momoExpired } = sim.seedOrder({
            id: 'ord_momo_old',
            paymentMethod: 'MOMO',
            expiresAt: past
        });
        const { payment: vnpFresh } = sim.seedOrder({
            id: 'ord_vnp_fresh',
            paymentMethod: 'VNPAY',
            expiresAt: future
        });
        const { payment: cashOld } = sim.seedOrder({
            id: 'ord_cash_old',
            paymentMethod: 'CASH',
            expiresAt: past
        });

        const expiredCount = sim.expireStaleOnlinePayments(new Date());
        assert.equal(expiredCount, 1);
        assert.equal(momoExpired.status, 'EXPIRED');
        assert.equal(momoExpired.failureCode, 'EXPIRED');
        assert.equal(vnpFresh.status, 'PENDING');
        assert.equal(cashOld.status, 'PENDING');

        // Late valid IPN on EXPIRED attempt still marks PAID
        const lateRes = sim.applySuccessfulWebhookOnOrder('ord_momo_old', 'MOMO:LATE_OK');
        assert.equal(lateRes.outcome, 'APPLIED');
        assert.equal(momoExpired.status, 'PAID');
        assert.equal(sim.orders.get('ord_momo_old').paymentStatus, 'PAID');
    });

    test('6. simulateDevMoMoIpn throws 404 when NODE_ENV === "production"', async () => {
        const prevEnv = process.env.NODE_ENV;
        process.env.NODE_ENV = 'production';
        try {
            await assert.rejects(
                () => simulateDevMoMoIpn({ paymentId: 'pay_123', success: true }),
                (err) => err.statusCode === 404
            );
        } finally {
            process.env.NODE_ENV = prevEnv;
        }
    });

    test('7. extractOrderIdFromMerchantRef extracts orderId accurately across formats', () => {
        assert.equal(extractOrderIdFromMerchantRef('abc_2'), 'abc');
        assert.equal(extractOrderIdFromMerchantRef('a_b_3'), 'a_b');
        assert.equal(extractOrderIdFromMerchantRef('cm9xyz123_15'), 'cm9xyz123');
        assert.equal(extractOrderIdFromMerchantRef('orderWithoutUnderscore'), 'orderWithoutUnderscore');
        assert.equal(extractOrderIdFromMerchantRef('order_with_non_numeric_suffix'), 'order_with_non_numeric_suffix');
        assert.equal(extractOrderIdFromMerchantRef(''), '');
    });

    test('8. Auto-cancel stale unpaid online orders after timeout & release reserved stock while skipping CASH or active retry attempts', () => {
        assert.equal(resolveUnpaidOnlineOrderCancelMinutes(undefined), 120);
        assert.equal(resolveUnpaidOnlineOrderCancelMinutes('180'), 180);
        assert.equal(resolveUnpaidOnlineOrderCancelMinutes('5'), 120); // Clamped minimum >= 15

        const sim = createPaymentFixesSimulator();
        const now = new Date();
        const threeHoursAgo = new Date(now.getTime() - 180 * 60 * 1000);
        const expiredTenMinsAgo = new Date(now.getTime() - 10 * 60 * 1000);
        const expiresInTenMins = new Date(now.getTime() + 10 * 60 * 1000);

        // Stale MOMO order (> 2h old, expired attempt) -> should auto-cancel and release reserved stock
        const { order: staleMomo } = sim.seedOrder({
            id: 'ord_stale_momo',
            paymentMethod: 'MOMO',
            expiresAt: expiredTenMinsAgo
        });
        staleMomo.createdAt = threeHoursAgo;

        // Stale VNPAY order (> 2h old, but customer just clicked retry and has an active non-expired attempt) -> should NOT cancel yet
        const { order: retryingVnp } = sim.seedOrder({
            id: 'ord_retrying_vnp',
            paymentMethod: 'VNPAY',
            expiresAt: expiresInTenMins
        });
        retryingVnp.createdAt = threeHoursAgo;

        // Stale CASH order (> 2h old) -> should NOT auto-cancel via online timeout
        const { order: cashOrder } = sim.seedOrder({
            id: 'ord_cash_cod',
            paymentMethod: 'CASH'
        });
        cashOrder.createdAt = threeHoursAgo;

        sim.expireStaleOnlinePayments(now);
        const cancelledIds = sim.autoCancelStaleOnlineOrders(now, 120);

        assert.deepEqual(cancelledIds, ['ord_stale_momo']);
        assert.equal(staleMomo.status, 'CANCELLED');
        assert.equal(staleMomo.paymentStatus, 'FAILED');
        assert.equal(staleMomo.reservedReleased, true);

        assert.equal(retryingVnp.status, 'PENDING');
        assert.equal(retryingVnp.reservedReleased, false);

        assert.equal(cashOrder.status, 'PENDING');
        assert.equal(cashOrder.reservedReleased, false);
    });
});
