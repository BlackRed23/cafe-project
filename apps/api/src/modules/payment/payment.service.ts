import { PaymentStatus } from '@cafe-project/database';
import { HttpError } from '../../common/http-error';
import type { JwtUserPayload } from '../auth/auth.service';
import { paymentRepository, type PaymentRecord } from './payment.repository';
import type { PaymentStatusInput } from './payment.validator';

export type PaymentDto = ReturnType<typeof toPaymentDto>;

const toPaymentDto = (payment: PaymentRecord) => ({
    id: payment.id,
    orderId: payment.orderId,
    method: payment.method,
    amount: Number(payment.amount),
    status: payment.status,
    paidAt: payment.paidAt,
    customer: payment.order.user,
    createdAt: payment.createdAt,
    updatedAt: payment.updatedAt
});

const normalizeStatus = (status: PaymentStatusInput['status']): PaymentStatus => {
    if (status === 'SUCCESS') return PaymentStatus.PAID;
    return status as PaymentStatus;
};

const ensurePayment = async (payment: PaymentRecord | null): Promise<PaymentRecord> => {
    if (!payment) throw new HttpError(404, 'Payment not found.');
    return payment;
};

export const getPaymentByOrderId = async (orderId: string, user: JwtUserPayload): Promise<PaymentDto> => {
    const payment = await ensurePayment(await paymentRepository.findByOrderId(orderId));
    if (user.role === 'CUSTOMER' && payment.order.userId !== user.id) throw new HttpError(403, 'Forbidden.');
    return toPaymentDto(payment);
};

export const updatePaymentStatus = async (id: string, input: PaymentStatusInput): Promise<PaymentDto> => {
    const payment = await ensurePayment(await paymentRepository.findById(id));
    const nextStatus = normalizeStatus(input.status);

    if (payment.status === PaymentStatus.PAID && nextStatus === PaymentStatus.PAID) {
        throw new HttpError(400, 'Đơn hàng đã được thanh toán trước đó.');
    }

    return toPaymentDto(await paymentRepository.updateStatus(id, nextStatus));
};
