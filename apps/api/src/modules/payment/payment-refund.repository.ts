import crypto from 'node:crypto';
import {
    PaymentMethod, PaymentRefundStatus, PaymentStatus, Prisma, TransactionStatus, prisma
} from '@cafe-project/database';
import { HttpError } from '../../common/http-error';
import type { ProviderRefundResult } from './payment-provider';

const lockOrder = async (tx: Prisma.TransactionClient, orderId: string) => {
    await tx.$queryRaw`SELECT id FROM "Order" WHERE id = ${orderId} FOR UPDATE`;
};

const policy = () => {
    const version = process.env.PAYMENT_REFUND_POLICY_VERSION?.trim();
    const max = process.env.PAYMENT_REFUND_MAX_VND?.trim();
    if (process.env.PAYMENT_REFUND_POLICY_ENABLED !== 'true' || !version || !max || !/^\d+$/.test(max) || Number(max) < 1) {
        throw new HttpError(403, 'Chưa kích hoạt chính sách hoàn tiền được phê duyệt.', 'REFUND_POLICY_DISABLED');
    }
    return { version, max: new Prisma.Decimal(max) };
};

const totalReserved = async (tx: Prisma.TransactionClient, paymentId: string, excludeId?: string) => {
    const result = await tx.paymentRefund.aggregate({ where: {
        paymentId, ...(excludeId ? { id: { not: excludeId } } : {}),
        status: { not: PaymentRefundStatus.FAILED }
    }, _sum: { amount: true } });
    return result._sum.amount ?? new Prisma.Decimal(0);
};

export const paymentRefundRepository = {
    async request(input: {
        paymentId: string; requestId: string; amount: string; reason: string; approvalRef: string; actorId: string;
    }) {
        const config = policy();
        const amount = new Prisma.Decimal(input.amount);
        if (!amount.isInteger() || amount.lessThanOrEqualTo(0) || amount.greaterThan(config.max)) {
            throw new HttpError(422, 'Số tiền hoàn phải là số VND nguyên dương trong hạn mức được duyệt.');
        }
        const hash = crypto.createHash('sha256').update(JSON.stringify({
            paymentId: input.paymentId, amount: amount.toFixed(0), reason: input.reason,
            approvalRef: input.approvalRef, policyVersion: config.version
        })).digest('hex');
        return prisma.$transaction(async tx => {
            const identity = await tx.payment.findUnique({ where: { id: input.paymentId }, select: { orderId: true } });
            if (!identity) throw new HttpError(404, 'Không tìm thấy payment.');
            await lockOrder(tx, identity.orderId);
            const existing = await tx.paymentRefund.findUnique({
                where: { paymentId_requestId: { paymentId: input.paymentId, requestId: input.requestId } }
            });
            if (existing) {
                if (existing.requestHash !== hash) throw new HttpError(409, 'requestId đã được sử dụng với nội dung khác.');
                return existing;
            }
            const payment = await tx.payment.findUniqueOrThrow({ where: { id: input.paymentId } });
            if (payment.status !== TransactionStatus.PAID) throw new HttpError(409, 'Chỉ cho phép tạo hoàn tiền cho payment đã nhận tiền.');
            if (payment.method !== PaymentMethod.CASH && payment.method !== PaymentMethod.MOMO && payment.method !== PaymentMethod.VNPAY) {
                throw new HttpError(409, 'Phương thức thanh toán chưa được hỗ trợ hoàn tiền.');
            }
            if (payment.method !== PaymentMethod.CASH && !payment.providerTxnId) {
                throw new HttpError(409, 'Thiếu bằng chứng giao dịch online đã nhận tiền.');
            }
            if (payment.method === PaymentMethod.MOMO && amount.lessThan(1000)) {
                throw new HttpError(422, 'MoMo yêu cầu số tiền hoàn tối thiểu 1.000 VND.');
            }
            if ((await totalReserved(tx, payment.id)).plus(amount).greaterThan(payment.amount)) {
                throw new HttpError(409, 'Tổng số tiền hoàn và đang chờ hoàn vượt số tiền đã thanh toán.');
            }
            const refund = await tx.paymentRefund.create({ data: {
                paymentId: payment.id, requestId: input.requestId, requestHash: hash, amount,
                reason: input.reason, approvalRef: input.approvalRef, policyVersion: config.version,
                requestedBy: input.actorId,
                events: { create: { status: PaymentRefundStatus.REQUESTED, kind: 'REQUESTED', actorId: input.actorId,
                    detail: { policyVersion: config.version, approvalRef: input.approvalRef } } }
            } });
            return refund;
        });
    },

    async get(paymentId: string, refundId: string) {
        return prisma.paymentRefund.findFirst({ where: { id: refundId, paymentId }, include: { events: { orderBy: { createdAt: 'asc' } } } });
    },

    async beginDispatch(paymentId: string, refundId: string, actorId: string) {
        const config = policy();
        if (process.env.PAYMENT_REFUND_EXECUTION_ENABLED !== 'true') {
            throw new HttpError(403, 'Chưa phê duyệt việc gọi API hoàn tiền nhà cung cấp.', 'REFUND_EXECUTION_DISABLED');
        }
        return prisma.$transaction(async tx => {
            const payment = await tx.payment.findUnique({ where: { id: paymentId } });
            if (!payment) throw new HttpError(404, 'Không tìm thấy payment.');
            await lockOrder(tx, payment.orderId);
            const refund = await tx.paymentRefund.findFirst({ where: { id: refundId, paymentId } });
            if (!refund) throw new HttpError(404, 'Không tìm thấy yêu cầu hoàn tiền.');
            if (refund.policyVersion !== config.version) {
                throw new HttpError(409, 'Chính sách hoàn tiền đã thay đổi; cần duyệt lại.');
            }
            if (![PaymentRefundStatus.REQUESTED, PaymentRefundStatus.FAILED].includes(refund.status as 'REQUESTED' | 'FAILED')) {
                throw new HttpError(409, 'Giao dịch hoàn tiền đang xử lý, chưa rõ kết quả hoặc đã thành công; phải đối soát trước.');
            }
            if (payment.status !== TransactionStatus.PAID) throw new HttpError(409, 'Payment gốc không còn trạng thái PAID.');
            if (payment.method === PaymentMethod.CASH || !payment.providerTxnId || !payment.merchantRef) {
                throw new HttpError(409, 'CASH chỉ xác nhận bằng biên nhận riêng; online cần mã giao dịch provider.');
            }
            const anotherInFlight = await tx.paymentRefund.findFirst({ where: {
                paymentId, id: { not: refundId }, status: { in: [PaymentRefundStatus.PROCESSING, PaymentRefundStatus.UNKNOWN] }
            } });
            if (anotherInFlight) throw new HttpError(409, 'Đang có một khoản hoàn tiền chưa xác định kết quả.');
            if ((await totalReserved(tx, paymentId, refundId)).plus(refund.amount).greaterThan(payment.amount)) {
                throw new HttpError(409, 'Khoản hoàn vượt số tiền đã thanh toán.');
            }
            const updated = await tx.paymentRefund.update({ where: { id: refundId }, data: {
                status: PaymentRefundStatus.PROCESSING, startedAt: new Date(), attemptCount: { increment: 1 },
                providerCode: null, failureMessage: null
            } });
            await tx.paymentRefundEvent.create({ data: {
                refundId, status: PaymentRefundStatus.PROCESSING, kind: 'DISPATCH', actorId,
                detail: { attempt: updated.attemptCount }
            } });
            return { refund: updated, payment };
        });
    },

    async recordProviderResult(refundId: string, result: ProviderRefundResult, actorId?: string) {
        return prisma.$transaction(async tx => {
            const identity = await tx.paymentRefund.findUniqueOrThrow({ where: { id: refundId }, select: { paymentId: true } });
            const payment = await tx.payment.findUniqueOrThrow({ where: { id: identity.paymentId } });
            await lockOrder(tx, payment.orderId);
            const refund = await tx.paymentRefund.findUniqueOrThrow({ where: { id: refundId } });
            if (![PaymentRefundStatus.PROCESSING, PaymentRefundStatus.UNKNOWN].includes(refund.status as 'PROCESSING' | 'UNKNOWN')) {
                throw new HttpError(409, 'Trạng thái hoàn tiền đã được xử lý bởi tiến trình khác.');
            }
            const status = result.outcome === 'SUCCEEDED' ? PaymentRefundStatus.SUCCEEDED
                : result.outcome === 'FAILED' ? PaymentRefundStatus.FAILED : PaymentRefundStatus.UNKNOWN;
            const updated = await tx.paymentRefund.update({ where: { id: refundId }, data: {
                status, providerRefundId: result.providerRefundId ?? refund.providerRefundId,
                providerCode: result.code, failureMessage: result.outcome === 'UNKNOWN' ? 'Provider outcome not final' : null,
                completedAt: status === PaymentRefundStatus.SUCCEEDED || status === PaymentRefundStatus.FAILED ? new Date() : null
            } });
            await tx.paymentRefundEvent.create({ data: {
                refundId, status, kind: 'PROVIDER_RESULT', actorId, providerRef: result.providerRefundId,
                detail: result.evidence as Prisma.InputJsonValue
            } });

            if (status === PaymentRefundStatus.SUCCEEDED) {
                const succeeded = await tx.paymentRefund.aggregate({ where: {
                    paymentId: payment.id, status: PaymentRefundStatus.SUCCEEDED
                }, _sum: { amount: true } });
                if ((succeeded._sum.amount ?? new Prisma.Decimal(0)).greaterThanOrEqualTo(payment.amount)) {
                    await tx.payment.update({ where: { id: payment.id }, data: { status: TransactionStatus.REFUNDED } });
                    const anotherPaid = await tx.payment.count({ where: {
                        orderId: payment.orderId, id: { not: payment.id }, status: TransactionStatus.PAID
                    } });
                    if (!anotherPaid) await tx.order.update({ where: { id: payment.orderId }, data: { paymentStatus: PaymentStatus.REFUNDED } });
                }
            }
            return updated;
        });
    },

    async markTransportUnknown(refundId: string, error: unknown) {
        const message = error instanceof Error ? error.message.slice(0, 150) : 'Provider transport failed';
        return this.recordProviderResult(refundId, {
            outcome: 'UNKNOWN', code: 'TRANSPORT_UNKNOWN', providerRefundId: null,
            evidence: { code: 'TRANSPORT_UNKNOWN', errorType: error instanceof Error ? error.name : 'unknown' }
        }).then(async updated => {
            await prisma.paymentRefund.updateMany({ where: { id: refundId, status: PaymentRefundStatus.UNKNOWN },
                data: { failureMessage: message } });
            return updated;
        });
    },

    async attestCashRefund(paymentId: string, refundId: string, receiptRef: string, actorId: string) {
        const config = policy();
        return prisma.$transaction(async tx => {
            const payment = await tx.payment.findUnique({ where: { id: paymentId } });
            if (!payment) throw new HttpError(404, 'Không tìm thấy payment.');
            await lockOrder(tx, payment.orderId);
            const refund = await tx.paymentRefund.findFirst({ where: { id: refundId, paymentId } });
            if (!refund) throw new HttpError(404, 'Không tìm thấy refund.');
            if (payment.method !== PaymentMethod.CASH || payment.status !== TransactionStatus.PAID ||
                refund.status !== PaymentRefundStatus.REQUESTED || refund.policyVersion !== config.version) {
                throw new HttpError(409, 'Chỉ có thể xác nhận CASH đã nhận tiền, chưa ghi nhận hoàn và đúng chính sách.');
            }
            const reference = `CASH:${receiptRef}`;
            const reused = await tx.paymentRefund.findFirst({ where: { paymentId, providerRefundId: reference } });
            if (reused) throw new HttpError(409, 'Biên nhận hoàn tiền đã được ghi nhận trước đó.');
            const refundUpdated = await tx.paymentRefund.update({ where: { id: refund.id }, data: {
                status: PaymentRefundStatus.SUCCEEDED, providerRefundId: reference, providerCode: 'ADMIN_CASH_ATTESTED',
                completedAt: new Date()
            } });
            await tx.paymentRefundEvent.create({ data: {
                refundId: refund.id, status: PaymentRefundStatus.SUCCEEDED,
                kind: 'CASH_RECEIPT_ATTESTED', actorId, providerRef: reference,
                detail: { receiptRef, policyVersion: config.version, approvalRef: refund.approvalRef }
            } });
            const succeeded = await tx.paymentRefund.aggregate({ where: {
                paymentId, status: PaymentRefundStatus.SUCCEEDED
            }, _sum: { amount: true } });
            if ((succeeded._sum.amount ?? new Prisma.Decimal(0)).greaterThanOrEqualTo(payment.amount)) {
                await tx.payment.update({ where: { id: payment.id }, data: { status: TransactionStatus.REFUNDED } });
                const otherPaid = await tx.payment.count({ where: {
                    orderId: payment.orderId, id: { not: payment.id }, status: TransactionStatus.PAID
                } });
                if (otherPaid === 0) await tx.order.update({ where: { id: payment.orderId }, data: { paymentStatus: PaymentStatus.REFUNDED } });
            }
            return refundUpdated;
        });
    }
};
