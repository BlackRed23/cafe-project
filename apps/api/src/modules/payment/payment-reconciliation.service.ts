import { CallbackStatus, PaymentMethod, Prisma, TransactionStatus, prisma } from '@cafe-project/database';
import { HttpError } from '../../common/http-error';
import type { JwtUserPayload } from '../auth/auth.service';
import { paymentRepository } from './payment.repository';
import { queryProviderPayment } from './payment-provider';

/** One authoritative provider query is recorded for every reconciliation attempt. */
export const reconcileProviderPayment = async (paymentId: string, user: JwtUserPayload) => {
    if (user.role !== 'ADMIN') throw new HttpError(403, 'Chỉ ADMIN được đối soát với cổng thanh toán.');
    const payment = await paymentRepository.findById(paymentId);
    if (!payment) throw new HttpError(404, 'Không tìm thấy giao dịch.');
    if (payment.method !== PaymentMethod.MOMO && payment.method !== PaymentMethod.VNPAY) {
        throw new HttpError(409, 'Không hỗ trợ tra cứu cổng cho phương thức thanh toán này.');
    }
    if (!payment.merchantRef) throw new HttpError(409, 'Thiếu mã thanh toán để tra cứu.');
    if ([TransactionStatus.PAID, TransactionStatus.REFUNDED].includes(payment.status as 'PAID' | 'REFUNDED')) {
        throw new HttpError(409, 'Giao dịch đã chốt trạng thái nhận tiền hoặc hoàn tiền.');
    }

    let lookup: Awaited<ReturnType<typeof queryProviderPayment>>;
    try {
        lookup = await queryProviderPayment({ method: payment.method, merchantRef: payment.merchantRef,
            amount: new Prisma.Decimal(payment.amount), requestPayload: payment.requestPayload,
            providerTxnId: payment.providerTxnId });
    } catch (error) {
        await paymentRepository.createCallbackLog({
            method: payment.method, providerEventId: null, eventType: 'PROVIDER_STATUS_LOOKUP',
            paymentId: payment.id, signatureValid: false, rawPayload: { paymentId: payment.id },
            status: CallbackStatus.FAILED, errorMessage: 'QUERY_TRANSPORT_UNKNOWN'
        });
        throw new HttpError(502, 'Không xác định được kết quả từ cổng; giữ trạng thái hiện có.', 'PROVIDER_LOOKUP_UNKNOWN');
    }
    const callback = await paymentRepository.createCallbackLog({
        method: payment.method, providerEventId: null, eventType: 'PROVIDER_STATUS_LOOKUP',
        paymentId: payment.id, signatureValid: false,
        rawPayload: lookup.evidence as Prisma.InputJsonValue, status: CallbackStatus.RECEIVED
    });
    if (lookup.outcome === 'PAID' && lookup.providerTxnId) {
        const result = await paymentRepository.applySuccessfulWebhookTx({
            callbackId: callback.id, payment, providerTxnId: lookup.providerTxnId, method: payment.method
        });
        return { outcome: lookup.outcome, paymentStatus: (await paymentRepository.findById(payment.id))?.status,
            settlement: result.outcome, callbackId: callback.id };
    }
    if (lookup.outcome === 'FAILED') {
        await prisma.$transaction(async tx => {
            await tx.$queryRaw`SELECT id FROM "Order" WHERE id = ${payment.orderId} FOR UPDATE`;
            const fresh = await tx.payment.findUniqueOrThrow({ where: { id: payment.id } });
            if (fresh.status === TransactionStatus.PENDING || fresh.status === TransactionStatus.INITIATED) {
                await tx.payment.update({ where: { id: payment.id }, data: {
                    status: TransactionStatus.FAILED, failureCode: 'PROVIDER_CONFIRMED_FAILED',
                    failureMessage: `Provider query confirmed terminal failure: ${lookup.code}`
                } });
            }
            await tx.paymentCallback.update({ where: { id: callback.id }, data: {
                status: CallbackStatus.APPLIED, processedAt: new Date(), errorMessage: 'LOOKUP_CONFIRMED_FAILED'
            } });
        });
    } else {
        await paymentRepository.updateCallbackLog(callback.id, {
            paymentId: payment.id, status: CallbackStatus.APPLIED, errorMessage: `LOOKUP_NON_TERMINAL:${lookup.code}`
        });
    }
    return { outcome: lookup.outcome, paymentStatus: (await paymentRepository.findById(payment.id))?.status,
        callbackId: callback.id };
};
