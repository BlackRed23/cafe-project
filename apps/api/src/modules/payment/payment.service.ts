import {
    CallbackStatus,
    OrderStatus,
    PaymentMethod,
    PaymentStatus,
    Prisma,
    TransactionStatus
} from '@cafe-project/database';
import { HttpError } from '../../common/http-error';
import type { JwtUserPayload } from '../auth/auth.service';
import { createMoMoPayUrl, verifyMoMoSignature, type MoMoIpnPayload } from './momo.gateway';
import { createVNPayUrl, verifyVNPaySignature, type VNPayIpnQuery } from './vnpay.gateway';
import { paymentRepository, type PaymentRecord } from './payment.repository';
import type { CreatePaymentUrlInput, PaymentStatusInput } from './payment.validator';

export type PaymentDto = ReturnType<typeof toPaymentDto>;

export interface CreatePaymentUrlResult {
    payUrl: string;
    paymentId: string;
    merchantRef: string;
    expiresAt: Date;
}

export interface VNPayIpnResponse {
    RspCode: string;
    Message: string;
}

const toPaymentDto = (payment: PaymentRecord) => ({
    id: payment.id,
    orderId: payment.orderId,
    method: payment.method,
    merchantRef: payment.merchantRef,
    providerTxnId: payment.providerTxnId,
    attemptNo: payment.attemptNo,
    amount: Number(payment.amount),
    status: payment.status,
    paidAt: payment.paidAt,
    expiresAt: payment.expiresAt,
    customer: payment.order.user,
    createdAt: payment.createdAt,
    updatedAt: payment.updatedAt
});

const normalizeStatus = (status: PaymentStatusInput['status']): TransactionStatus => {
    if (status === 'SUCCESS') return TransactionStatus.PAID;
    return status as TransactionStatus;
};

const ensurePayment = async (payment: PaymentRecord | null): Promise<PaymentRecord> => {
    if (!payment) throw new HttpError(404, 'Payment not found.');
    return payment;
};

const isPrismaUniqueError = (error: unknown): boolean => {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        return true;
    }
    return typeof error === 'object' && error !== null && (error as { code?: string }).code === 'P2002';
};

export const getPaymentByOrderId = async (orderId: string, user: JwtUserPayload): Promise<PaymentDto> => {
    const payment = await ensurePayment(await paymentRepository.findLatestByOrderId(orderId));
    if (user.role === 'CUSTOMER' && payment.order.userId !== user.id) throw new HttpError(403, 'Forbidden.');
    return toPaymentDto(payment);
};

export const updatePaymentStatus = async (id: string, input: PaymentStatusInput): Promise<PaymentDto> => {
    const payment = await ensurePayment(await paymentRepository.findById(id));
    const nextStatus = normalizeStatus(input.status);

    if (payment.status === TransactionStatus.PAID && nextStatus === TransactionStatus.PAID) {
        throw new HttpError(400, 'Đơn hàng đã được thanh toán trước đó.');
    }

    return toPaymentDto(await paymentRepository.updateStatus(id, nextStatus));
};

export const createPaymentUrl = async (
    user: JwtUserPayload,
    input: CreatePaymentUrlInput,
    clientIp = '127.0.0.1'
): Promise<CreatePaymentUrlResult> => {
    const order = await paymentRepository.findOrderWithPayments(input.orderId);
    if (!order) {
        throw new HttpError(404, 'Không tìm thấy đơn hàng.');
    }

    if (user.role === 'CUSTOMER' && order.userId !== user.id) {
        throw new HttpError(403, 'Bạn không có quyền thanh toán đơn hàng này.');
    }

    if (order.paymentStatus === PaymentStatus.PAID || order.payments.some((p) => p.status === TransactionStatus.PAID)) {
        throw new HttpError(409, 'Đơn hàng này đã được thanh toán.');
    }

    if (order.status === OrderStatus.CANCELLED) {
        throw new HttpError(409, 'Không thể thanh toán đơn hàng đã bị hủy.');
    }

    const method = input.method === 'MOMO' ? PaymentMethod.MOMO : PaymentMethod.VNPAY;
    const now = new Date();
    const expiresAt = new Date(now.getTime() + 15 * 60 * 1000);
    // Amount always sourced from Order DB (totalAmount already includes shippingFee from order.repository.ts)
    const amountNumber = Math.round(Number(order.totalAmount));

    const attempt = await paymentRepository.createAttemptSupersedingActive({
        orderId: order.id,
        method,
        amount: order.totalAmount,
        expiresAt
    });

    const merchantRef = attempt.merchantRef ?? `${order.id}_${attempt.attemptNo}`;

    try {
        if (method === PaymentMethod.MOMO) {
            const momoRes = await createMoMoPayUrl({
                merchantRef,
                orderId: order.id,
                amount: amountNumber,
                orderInfo: `Thanh toan don hang ${order.id}`
            });

            await paymentRepository.markAttemptPendingWithPayload(
                attempt.id,
                momoRes.requestPayload as Prisma.InputJsonValue,
                momoRes.responsePayload as Prisma.InputJsonValue
            );

            return {
                payUrl: momoRes.payUrl,
                paymentId: attempt.id,
                merchantRef,
                expiresAt
            };
        }

        const vnpayRes = createVNPayUrl({
            merchantRef,
            orderId: order.id,
            amount: amountNumber,
            ipAddr: clientIp,
            orderInfo: `Thanh toan don hang ${order.id}`,
            now,
            expiresAt
        });

        await paymentRepository.markAttemptPendingWithPayload(
            attempt.id,
            vnpayRes.requestPayload as Prisma.InputJsonValue,
            { payUrl: vnpayRes.payUrl } as Prisma.InputJsonValue
        );

        return {
            payUrl: vnpayRes.payUrl,
            paymentId: attempt.id,
            merchantRef,
            expiresAt
        };
    } catch (error) {
        const errObj = error as Error & {
            gatewayCode?: string;
            requestPayload?: Prisma.InputJsonValue;
            responsePayload?: Prisma.InputJsonValue;
        };
        await paymentRepository.markAttemptGatewayError(
            attempt.id,
            errObj.gatewayCode || 'GATEWAY_INIT_FAILED',
            errObj.message || 'Failed to create payment URL',
            errObj.requestPayload,
            errObj.responsePayload
        );
        throw error;
    }
};

export const processMoMoWebhook = async (
    payload: MoMoIpnPayload,
    headers?: Record<string, unknown>
): Promise<{ status: 'APPLIED' | 'ALREADY_PROCESSED' | 'FAILED' }> => {
    const rawPayload = (payload ?? {}) as Prisma.InputJsonValue;
    const rawHeaders = headers ? (headers as Prisma.InputJsonValue) : undefined;

    // 1. Verify HMAC-SHA256 signature first
    let signatureValid = false;
    try {
        signatureValid = verifyMoMoSignature(payload);
    } catch {
        signatureValid = false;
    }

    if (!signatureValid) {
        await paymentRepository.createCallbackLog({
            method: PaymentMethod.MOMO,
            providerEventId: null,
            eventType: 'MOMO_IPN',
            paymentId: null,
            signatureValid: false,
            rawPayload,
            headers: rawHeaders,
            status: CallbackStatus.REJECTED_INVALID_SIGNATURE,
            errorMessage: 'Invalid MoMo HMAC-SHA256 signature'
        });
        throw new HttpError(400, 'Invalid signature.');
    }

    const merchantRef = String(payload.orderId ?? '').trim();
    const resultCode = Number(payload.resultCode);
    const isSuccess = resultCode === 0;
    const transIdStr =
        payload.transId !== undefined && payload.transId !== null && String(payload.transId).trim() !== ''
            ? String(payload.transId).trim()
            : null;
    const providerEventId = transIdStr
        ? `MOMO:${transIdStr}`
        : `MOMO:${merchantRef}:${String(payload.resultCode ?? 'UNKNOWN')}`;

    // 2. Idempotency check via atomic create on PaymentCallback.providerEventId @unique
    let callbackLog: { id: string };
    try {
        callbackLog = await paymentRepository.createCallbackLog({
            method: PaymentMethod.MOMO,
            providerEventId,
            eventType: 'MOMO_IPN',
            signatureValid: true,
            rawPayload,
            headers: rawHeaders,
            status: CallbackStatus.VERIFIED
        });
    } catch (error) {
        if (isPrismaUniqueError(error)) {
            await paymentRepository.incrementCallbackRetryByEventId(providerEventId);
            return { status: 'ALREADY_PROCESSED' };
        }
        throw error;
    }

    try {
        // 3. Find Payment by merchantRef (fallback to latest by orderId if merchantRef equals orderId)
        let payment = await paymentRepository.findByMerchantRef(merchantRef);
        if (!payment && merchantRef) {
            payment = await paymentRepository.findLatestByOrderId(merchantRef);
        }

        if (!payment) {
            await paymentRepository.updateCallbackLog(callbackLog.id, {
                status: CallbackStatus.FAILED,
                errorMessage: `Payment not found for merchantRef=${merchantRef}`
            });
            throw new HttpError(404, `Payment not found for order ${merchantRef}`);
        }

        // 4. Verify amount against DB Payment.amount
        const expectedAmount = Math.round(Number(payment.amount));
        const receivedAmount = Math.round(Number(payload.amount));
        if (!Number.isFinite(receivedAmount) || receivedAmount !== expectedAmount) {
            console.warn(
                `[PAYMENT][MOMO] Amount mismatch for payment ${payment.id}: expected=${expectedAmount}, received=${payload.amount}`
            );
            await paymentRepository.updateCallbackLog(callbackLog.id, {
                paymentId: payment.id,
                status: CallbackStatus.FAILED,
                errorMessage: `AMOUNT_MISMATCH: expected ${expectedAmount}, got ${payload.amount}`
            });
            return { status: 'FAILED' };
        }

        // 5. Execute atomic DB transaction
        if (isSuccess) {
            const txResult = await paymentRepository.applySuccessfulWebhookTx({
                callbackId: callbackLog.id,
                payment,
                providerTxnId: transIdStr ? `MOMO:${transIdStr}` : null,
                method: PaymentMethod.MOMO
            });

            if (txResult.outcome === 'DUPLICATE_PAYMENT_OTHER_ATTEMPT') {
                console.warn(
                    `[PAYMENT][MOMO] DUPLICATE_PAYMENT warning: Order ${payment.orderId} already PAID, but attempt ${payment.id} received PAID IPN (transId=${transIdStr}). Manual refund required.`
                );
                return { status: 'FAILED' };
            }

            if (txResult.outcome === 'ALREADY_PAID_SAME_ATTEMPT') {
                return { status: 'ALREADY_PROCESSED' };
            }

            return { status: 'APPLIED' };
        }

        await paymentRepository.applyFailedWebhookTx({
            callbackId: callbackLog.id,
            payment,
            failureCode: String(payload.resultCode ?? 'FAILED'),
            failureMessage: typeof payload.message === 'string' ? payload.message : 'MoMo payment failed'
        });

        return { status: 'FAILED' };
    } catch (error) {
        if (error instanceof HttpError) {
            throw error;
        }
        if (isPrismaUniqueError(error)) {
            await paymentRepository.updateCallbackLog(callbackLog.id, {
                status: CallbackStatus.DUPLICATED,
                errorMessage: 'Duplicate providerTxnId (P2002)'
            });
            return { status: 'ALREADY_PROCESSED' };
        }
        await paymentRepository.updateCallbackLog(callbackLog.id, {
            status: CallbackStatus.FAILED,
            errorMessage: error instanceof Error ? error.message : 'Unexpected webhook processing error'
        });
        throw error;
    }
};

export const processVNPayIpn = async (
    query: VNPayIpnQuery,
    headers?: Record<string, unknown>
): Promise<VNPayIpnResponse> => {
    const rawPayload = (query ?? {}) as Prisma.InputJsonValue;
    const rawHeaders = headers ? (headers as Prisma.InputJsonValue) : undefined;

    // 1. Verify HMAC-SHA512 signature first
    let signatureValid = false;
    try {
        signatureValid = verifyVNPaySignature(query);
    } catch {
        signatureValid = false;
    }

    if (!signatureValid) {
        await paymentRepository.createCallbackLog({
            method: PaymentMethod.VNPAY,
            providerEventId: null,
            eventType: 'VNPAY_IPN',
            paymentId: null,
            signatureValid: false,
            rawPayload,
            headers: rawHeaders,
            status: CallbackStatus.REJECTED_INVALID_SIGNATURE,
            errorMessage: 'Invalid VNPay HMAC-SHA512 checksum'
        });
        return { RspCode: '97', Message: 'Invalid Checksum' };
    }

    const merchantRef = String(query.vnp_TxnRef ?? '').trim();
    const responseCode = String(query.vnp_ResponseCode ?? '');
    const transactionStatus = String(query.vnp_TransactionStatus ?? '');
    const isSuccess = responseCode === '00' && transactionStatus === '00';
    const vnpTxnNo =
        query.vnp_TransactionNo && String(query.vnp_TransactionNo).trim() !== '' && String(query.vnp_TransactionNo).trim() !== '0'
            ? String(query.vnp_TransactionNo).trim()
            : null;

    // 2. Find Payment first so we can return VNPay standard codes (01 = Order not found, 04 = Invalid amount, 02 = Already confirmed)
    let payment = await paymentRepository.findByMerchantRef(merchantRef);
    if (!payment && merchantRef) {
        payment = await paymentRepository.findLatestByOrderId(merchantRef);
    }

    if (!payment) {
        await paymentRepository.createCallbackLog({
            method: PaymentMethod.VNPAY,
            providerEventId: null,
            eventType: 'VNPAY_IPN',
            paymentId: null,
            signatureValid: true,
            rawPayload,
            headers: rawHeaders,
            status: CallbackStatus.FAILED,
            errorMessage: `Order/Payment not found for vnp_TxnRef=${merchantRef}`
        });
        return { RspCode: '01', Message: 'Order not found' };
    }

    // 3. Check amount (vnp_Amount is multiplied by 100)
    const expectedAmount = Math.round(Number(payment.amount));
    const receivedAmountRaw = Number(query.vnp_Amount);
    const receivedAmount = Math.round(receivedAmountRaw / 100);
    if (!Number.isFinite(receivedAmountRaw) || receivedAmount !== expectedAmount) {
        await paymentRepository.createCallbackLog({
            method: PaymentMethod.VNPAY,
            providerEventId: null,
            eventType: 'VNPAY_IPN',
            paymentId: payment.id,
            signatureValid: true,
            rawPayload,
            headers: rawHeaders,
            status: CallbackStatus.FAILED,
            errorMessage: `AMOUNT_MISMATCH: expected ${expectedAmount}, got ${receivedAmount} (raw=${query.vnp_Amount})`
        });
        return { RspCode: '04', Message: 'Invalid amount' };
    }

    // 4. Idempotency check via providerEventId @unique
    const providerEventId = vnpTxnNo
        ? `VNPAY:${vnpTxnNo}`
        : `VNPAY:${merchantRef}:${responseCode}:${transactionStatus}`;

    let callbackLog: { id: string };
    try {
        callbackLog = await paymentRepository.createCallbackLog({
            method: PaymentMethod.VNPAY,
            providerEventId,
            eventType: 'VNPAY_IPN',
            paymentId: payment.id,
            signatureValid: true,
            rawPayload,
            headers: rawHeaders,
            status: CallbackStatus.VERIFIED
        });
    } catch (error) {
        if (isPrismaUniqueError(error)) {
            await paymentRepository.incrementCallbackRetryByEventId(providerEventId);
            return { RspCode: '02', Message: 'Order already confirmed' };
        }
        return { RspCode: '99', Message: 'Unknown error' };
    }

    // If payment was already PAID before this event
    if (payment.status === TransactionStatus.PAID) {
        await paymentRepository.updateCallbackLog(callbackLog.id, {
            paymentId: payment.id,
            status: CallbackStatus.DUPLICATED,
            errorMessage: 'Order already confirmed'
        });
        return { RspCode: '02', Message: 'Order already confirmed' };
    }

    try {
        if (isSuccess) {
            const txResult = await paymentRepository.applySuccessfulWebhookTx({
                callbackId: callbackLog.id,
                payment,
                providerTxnId: vnpTxnNo ? `VNPAY:${vnpTxnNo}` : null,
                method: PaymentMethod.VNPAY
            });

            if (txResult.outcome === 'ALREADY_PAID_SAME_ATTEMPT') {
                return { RspCode: '02', Message: 'Order already confirmed' };
            }

            if (txResult.outcome === 'DUPLICATE_PAYMENT_OTHER_ATTEMPT') {
                console.warn(
                    `[PAYMENT][VNPAY] DUPLICATE_PAYMENT warning: Order ${payment.orderId} already PAID, but attempt ${payment.id} received PAID IPN (vnp_TransactionNo=${vnpTxnNo}). Manual refund required.`
                );
                return { RspCode: '02', Message: 'Order already confirmed' };
            }

            return { RspCode: '00', Message: 'Confirm Success' };
        }

        await paymentRepository.applyFailedWebhookTx({
            callbackId: callbackLog.id,
            payment,
            failureCode: `${responseCode}_${transactionStatus}`,
            failureMessage: `VNPay payment failed (ResponseCode=${responseCode}, TransactionStatus=${transactionStatus})`
        });

        return { RspCode: '00', Message: 'Confirm Success' };
    } catch (error) {
        if (isPrismaUniqueError(error)) {
            await paymentRepository.updateCallbackLog(callbackLog.id, {
                paymentId: payment.id,
                status: CallbackStatus.DUPLICATED,
                errorMessage: 'Duplicate providerTxnId (P2002)'
            });
            return { RspCode: '02', Message: 'Order already confirmed' };
        }
        await paymentRepository.updateCallbackLog(callbackLog.id, {
            paymentId: payment.id,
            status: CallbackStatus.FAILED,
            errorMessage: error instanceof Error ? error.message : 'Unexpected VNPay IPN error'
        });
        return { RspCode: '99', Message: 'Unknown error' };
    }
};
