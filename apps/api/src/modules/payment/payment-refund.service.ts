import { PaymentMethod, PaymentRefundStatus } from '@cafe-project/database';
import { HttpError } from '../../common/http-error';
import type { JwtUserPayload } from '../auth/auth.service';
import { paymentRefundRepository } from './payment-refund.repository';
import { paymentRepository } from './payment.repository';
import { queryProviderRefund, submitProviderRefund } from './payment-provider';
import type { AttestCashRefundInput, RequestRefundInput } from './payment.validator';

const adminOnly = (user: JwtUserPayload) => {
    if (user.role !== 'ADMIN') throw new HttpError(403, 'Chỉ ADMIN được quản lý hoàn tiền.');
};

export const requestPaymentRefund = async (paymentId: string, input: RequestRefundInput, user: JwtUserPayload) => {
    adminOnly(user);
    return paymentRefundRepository.request({ paymentId, ...input, actorId: user.id });
};

export const getPaymentRefund = async (paymentId: string, refundId: string, user: JwtUserPayload) => {
    adminOnly(user);
    const refund = await paymentRefundRepository.get(paymentId, refundId);
    if (!refund) throw new HttpError(404, 'Không tìm thấy refund.');
    return refund;
};

export const executePaymentRefund = async (paymentId: string, refundId: string, user: JwtUserPayload) => {
    adminOnly(user);
    const { refund, payment } = await paymentRefundRepository.beginDispatch(paymentId, refundId, user.id);
    try {
        if (!payment.providerTxnId || !payment.merchantRef || payment.method === PaymentMethod.CASH) {
            throw new HttpError(409, 'CASH cần bằng chứng trao trả trực tiếp; online cần định danh provider.');
        }
        const result = await submitProviderRefund({
            method: payment.method, merchantRef: payment.merchantRef,
            providerTxnId: payment.providerTxnId, refundId: refund.id, amount: refund.amount,
            originalAmount: payment.amount, requestPayload: payment.requestPayload
        });
        return paymentRefundRepository.recordProviderResult(refund.id, result, user.id);
    } catch (error) {
        // Timeout, crash or invalid provider response does NOT prove failure.
        await paymentRefundRepository.markTransportUnknown(refund.id, error);
        throw new HttpError(502, 'Chưa xác định kết quả hoàn tiền; cần đối soát trước khi thử lại.', 'REFUND_OUTCOME_UNKNOWN');
    }
};

export const reconcilePaymentRefund = async (paymentId: string, refundId: string, user: JwtUserPayload) => {
    adminOnly(user);
    const refund = await paymentRefundRepository.get(paymentId, refundId);
    if (!refund) throw new HttpError(404, 'Không tìm thấy refund.');
    if (![PaymentRefundStatus.PROCESSING, PaymentRefundStatus.UNKNOWN].includes(refund.status as 'PROCESSING' | 'UNKNOWN')) {
        throw new HttpError(409, 'Yêu cầu này chưa cần đối soát.');
    }
    // An in-flight process may still be calling the provider. Never race its request.
    if (refund.status === PaymentRefundStatus.PROCESSING && refund.startedAt &&
        Date.now() - refund.startedAt.getTime() < 90000) {
        throw new HttpError(409, 'Yêu cầu đang xử lý; chưa thể kết luận kết quả.');
    }
    const original = await paymentRepository.findById(paymentId);
    if (!original) throw new HttpError(404, 'Không tìm thấy payment gốc.');
    let outcome: Awaited<ReturnType<typeof queryProviderRefund>>;
    try {
        outcome = await queryProviderRefund({ method: original.method, refundId: refund.id, amount: refund.amount });
    } catch {
        throw new HttpError(502, 'Không có kết quả đối soát hoàn tiền đáng tin cậy.', 'REFUND_LOOKUP_UNKNOWN');
    }
    return paymentRefundRepository.recordProviderResult(refund.id, outcome, user.id);
};

export const attestCashPaymentRefund = async (
    paymentId: string, refundId: string, input: AttestCashRefundInput, user: JwtUserPayload
) => {
    adminOnly(user);
    return paymentRefundRepository.attestCashRefund(paymentId, refundId, input.receiptRef, user.id);
};
