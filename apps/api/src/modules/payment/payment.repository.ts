import {
    CallbackStatus,
    OrderStatus,
    PaymentMethod,
    PaymentStatus,
    TransactionStatus,
    prisma,
    Prisma
} from '@cafe-project/database';
import { HttpError } from '../../common/http-error';

const paymentInclude = {
    order: { include: { user: { select: { id: true, name: true, email: true } } } }
} satisfies Prisma.PaymentInclude;

const orderWithPaymentsInclude = {
    user: { select: { id: true, name: true, email: true } },
    payments: { orderBy: [{ attemptNo: 'desc' }, { createdAt: 'desc' }] }
} satisfies Prisma.OrderInclude;

export type PaymentRecord = Prisma.PaymentGetPayload<{ include: typeof paymentInclude }>;
export type OrderWithPaymentsRecord = Prisma.OrderGetPayload<{ include: typeof orderWithPaymentsInclude }>;

export interface ManualPaymentAuditEntry {
    by: string;
    from: TransactionStatus;
    to: TransactionStatus;
    at: string;
    note?: string | null;
}

export const appendManualPaymentAudit = (
    existingPayload: Prisma.JsonValue | null | undefined,
    entry: ManualPaymentAuditEntry
): Prisma.InputJsonValue => {
    const baseObj =
        existingPayload && typeof existingPayload === 'object' && !Array.isArray(existingPayload)
            ? { ...(existingPayload as Record<string, unknown>) }
            : {};
    const prevList = Array.isArray(baseObj.manualUpdates) ? [...baseObj.manualUpdates] : [];
    prevList.push(entry);
    return {
        ...baseObj,
        manualUpdates: prevList
    } as unknown as Prisma.InputJsonValue;
};

const mapTransactionToOrderPaymentStatus = (status: TransactionStatus): PaymentStatus => {
    switch (status) {
        case TransactionStatus.PAID:
            return PaymentStatus.PAID;
        case TransactionStatus.REFUNDED:
            return PaymentStatus.REFUNDED;
        case TransactionStatus.FAILED:
        case TransactionStatus.CANCELLED:
        case TransactionStatus.EXPIRED:
            return PaymentStatus.FAILED;
        default:
            return PaymentStatus.PENDING;
    }
};

export const paymentRepository = {
    async findLatestByOrderId(orderId: string): Promise<PaymentRecord | null> {
        return prisma.payment.findFirst({
            where: { orderId },
            orderBy: [{ attemptNo: 'desc' }, { createdAt: 'desc' }],
            include: paymentInclude
        });
    },

    async findByOrderId(orderId: string): Promise<PaymentRecord | null> {
        return this.findLatestByOrderId(orderId);
    },

    async findById(id: string): Promise<PaymentRecord | null> {
        return prisma.payment.findUnique({ where: { id }, include: paymentInclude });
    },

    async findByMerchantRef(merchantRef: string): Promise<PaymentRecord | null> {
        return prisma.payment.findFirst({
            where: { merchantRef },
            orderBy: [{ attemptNo: 'desc' }, { createdAt: 'desc' }],
            include: paymentInclude
        });
    },

    async findOrderWithPayments(orderId: string): Promise<OrderWithPaymentsRecord | null> {
        return prisma.order.findUnique({
            where: { id: orderId },
            include: orderWithPaymentsInclude
        });
    },

    async createAttemptSupersedingActive(input: {
        orderId: string;
        method: PaymentMethod;
        amount: Prisma.Decimal | number;
        expiresAt: Date;
    }): Promise<PaymentRecord> {
        return prisma.$transaction(async (tx: Prisma.TransactionClient) => {
            await tx.$queryRaw`SELECT id FROM "Order" WHERE id = ${input.orderId} FOR UPDATE`;
            const order = await tx.order.findUniqueOrThrow({ where: { id: input.orderId } });
            if (order.status === OrderStatus.CANCELLED || order.paymentStatus === PaymentStatus.PAID) {
                throw new HttpError(409, 'Đơn đã hủy hoặc đã thanh toán.');
            }
            if (await tx.payment.findFirst({ where: { orderId: input.orderId, status: TransactionStatus.PAID } })) {
                throw new HttpError(409, 'Đã nhận tiền; cần đối soát trước khi tạo thanh toán mới.');
            }
            const unknown = await tx.payment.findFirst({ where: { orderId: input.orderId, failureCode: 'GATEWAY_OUTCOME_UNKNOWN' } });
            if (unknown) throw new HttpError(409, 'Giao dịch chưa rõ kết quả; cần đối soát trước khi tạo lần thanh toán mới.');
            const unresolved = await tx.payment.findMany({ where: {
                orderId: input.orderId,
                status: { in: [TransactionStatus.INITIATED, TransactionStatus.PENDING, TransactionStatus.EXPIRED] }
            } });
            // Online Order creation stores one undispatched INITIATED placeholder in the same
            // transaction as its items and stock reservation. Adopt that exact row under
            // the Order lock; a fresh gateway attempt would otherwise 409 every new order.
            // Once merchantRef/requestPayload exists, outcome is potentially unknown and
            // must never be reissued without authoritative reconciliation.
            if (unresolved.length === 1) {
                const initial = unresolved[0];
                const anyOtherAttempt = await tx.payment.count({ where: { orderId: input.orderId, id: { not: initial.id } } });
                if (anyOtherAttempt === 0 && initial.status === TransactionStatus.INITIATED &&
                    initial.method === input.method && order.paymentMethod === input.method &&
                    initial.amount.eq(input.amount) && initial.attemptNo === 1 &&
                    !initial.merchantRef && !initial.requestPayload && !initial.responsePayload &&
                    !initial.expiresAt && !initial.failureCode) {
                    return tx.payment.update({
                        where: { id: initial.id },
                        data: { merchantRef: `${input.orderId}_1`, expiresAt: input.expiresAt },
                        include: paymentInclude
                    });
                }
            }
            if (unresolved.length > 0) {
                throw new HttpError(409, 'Đã có giao dịch chưa xác minh kết quả; cần tra cứu cổng thanh toán trước khi thử lại.');
            }

            const maxAttemptAgg = await tx.payment.aggregate({
                where: { orderId: input.orderId },
                _max: { attemptNo: true }
            });
            const nextAttemptNo = (maxAttemptAgg._max.attemptNo ?? 0) + 1;
            const merchantRef = `${input.orderId}_${nextAttemptNo}`;

            const created = await tx.payment.create({
                data: {
                    orderId: input.orderId,
                    method: input.method,
                    merchantRef,
                    amount: input.amount,
                    status: TransactionStatus.INITIATED,
                    attemptNo: nextAttemptNo,
                    expiresAt: input.expiresAt
                },
                include: paymentInclude
            });

            await tx.order.update({
                where: { id: input.orderId },
                data: { paymentMethod: input.method }
            });

            return created;
        });
    },

    async markAttemptPendingWithPayload(
        id: string,
        requestPayload: Prisma.InputJsonValue,
        responsePayload: Prisma.InputJsonValue
    ): Promise<PaymentRecord> {
        return prisma.$transaction(async tx => {
            const identity = await tx.payment.findUniqueOrThrow({ where: { id }, select: { orderId: true } });
            await tx.$queryRaw`SELECT id FROM "Order" WHERE id = ${identity.orderId} FOR UPDATE`;
            await tx.payment.updateMany({ where: { id, status: TransactionStatus.INITIATED }, data: { status: TransactionStatus.PENDING } });
            return tx.payment.update({
            where: { id },
            data: {
                // Callback may arrive before create-url response. Never regress settlement.
                requestPayload,
                responsePayload
            },
            include: paymentInclude
        });
        });
    },

    async markAttemptGatewayError(
        id: string,
        failureCode: string,
        failureMessage: string,
        requestPayload?: Prisma.InputJsonValue,
        responsePayload?: Prisma.InputJsonValue
    ): Promise<void> {
        await prisma.payment.updateMany({
            where: { id, status: { in: [TransactionStatus.INITIATED, TransactionStatus.PENDING] } },
            data: {
                status: failureCode === 'GATEWAY_OUTCOME_UNKNOWN' ? TransactionStatus.PENDING : TransactionStatus.FAILED,
                failureCode,
                failureMessage,
                ...(requestPayload !== undefined ? { requestPayload } : {}),
                ...(responsePayload !== undefined ? { responsePayload } : {})
            }
        });
    },

    async createCallbackLog(input: {
        method: PaymentMethod;
        providerEventId: string | null;
        eventType?: string;
        paymentId?: string | null;
        signatureValid: boolean;
        rawPayload: Prisma.InputJsonValue;
        headers?: Prisma.InputJsonValue;
        status: CallbackStatus;
        errorMessage?: string | null;
    }) {
        return prisma.paymentCallback.create({
            data: {
                method: input.method,
                providerEventId: input.providerEventId,
                eventType: input.eventType ?? null,
                paymentId: input.paymentId ?? null,
                signatureValid: input.signatureValid,
                rawPayload: input.rawPayload,
                headers: input.headers,
                status: input.status,
                errorMessage: input.errorMessage ?? null,
                processedAt:
                    input.status === CallbackStatus.REJECTED_INVALID_SIGNATURE ||
                    input.status === CallbackStatus.FAILED ||
                    input.status === CallbackStatus.DUPLICATED
                        ? new Date()
                        : null
            }
        });
    },

    async incrementCallbackRetryByEventId(providerEventId: string) {
        return prisma.paymentCallback.updateMany({
            where: { providerEventId },
            data: { retryCount: { increment: 1 } }
        });
    },

    async findCallbackByEventId(providerEventId: string) {
        return prisma.paymentCallback.findUnique({ where: { providerEventId } });
    },

    async updateCallbackLog(
        id: string,
        data: {
            paymentId?: string | null;
            signatureValid?: boolean;
            status: CallbackStatus;
            errorMessage?: string | null;
            processedAt?: Date;
        }
    ) {
        return prisma.paymentCallback.update({
            where: { id },
            data: {
                ...data,
                processedAt: data.processedAt ?? new Date()
            }
        });
    },

    async applySuccessfulWebhookTx(input: {
        callbackId: string;
        payment: PaymentRecord;
        providerTxnId: string | null;
        method: PaymentMethod;
    }): Promise<{
        outcome:
            | 'APPLIED'
            | 'ALREADY_PAID_SAME_ATTEMPT'
            | 'DUPLICATE_PAYMENT_OTHER_ATTEMPT'
            | 'PAID_AFTER_CANCEL';
    }> {
        return prisma.$transaction(async (tx: Prisma.TransactionClient) => {
            await tx.$queryRaw`SELECT id FROM "Order" WHERE id = ${input.payment.orderId} FOR UPDATE`;
            const freshOrder = await tx.order.findUnique({
                where: { id: input.payment.orderId }
            });
            const freshPayment = await tx.payment.findUnique({
                where: { id: input.payment.id }
            });

            if (!freshOrder || !freshPayment) {
                throw new Error(`Order or Payment not found during transaction (${input.payment.id})`);
            }

            if (freshPayment.status === TransactionStatus.PAID) {
                await tx.paymentCallback.update({
                    where: { id: input.callbackId },
                    data: {
                        paymentId: freshPayment.id,
                        status: input.providerTxnId !== freshPayment.providerTxnId ? CallbackStatus.FAILED : CallbackStatus.DUPLICATED,
                        errorMessage: input.providerTxnId !== freshPayment.providerTxnId ? 'DUPLICATE_SETTLEMENT_SAME_ATTEMPT' : null,
                        processedAt: new Date()
                    }
                });
                return { outcome: 'ALREADY_PAID_SAME_ATTEMPT' as const };
            }

            // Never revive a refunded payment from a stale settlement event.
            if (freshPayment.status === TransactionStatus.REFUNDED) {
                await tx.paymentCallback.update({ where: { id: input.callbackId }, data: {
                    status: CallbackStatus.DUPLICATED, paymentId: freshPayment.id, processedAt: new Date(), errorMessage: 'STALE_AFTER_REFUND'
                } });
                return { outcome: 'ALREADY_PAID_SAME_ATTEMPT' as const };
            }
            const otherSettlement = await tx.payment.findFirst({ where: {
                orderId: freshOrder.id, id: { not: freshPayment.id }, status: { in: [TransactionStatus.PAID, TransactionStatus.REFUNDED] }
            } });
            if (freshOrder.paymentStatus === PaymentStatus.PAID || (otherSettlement && otherSettlement.failureCode !== 'LATE_SETTLEMENT')) {
                await tx.payment.update({ where: { id: freshPayment.id }, data: {
                    status: TransactionStatus.PAID, paidAt: freshPayment.paidAt ?? new Date(),
                    providerTxnId: input.providerTxnId,
                    failureCode: 'DUPLICATE_PAYMENT', failureMessage: 'Đã nhận thêm tiền; cần đối soát, không tự động hoàn tiền.'
                } });
                await tx.paymentCallback.update({
                    where: { id: input.callbackId },
                    data: {
                        paymentId: freshPayment.id,
                        status: CallbackStatus.FAILED,
                        errorMessage: 'DUPLICATE_PAYMENT',
                        processedAt: new Date()
                    }
                });
                return { outcome: 'DUPLICATE_PAYMENT_OTHER_ATTEMPT' as const };
            }

            const paidAt = new Date();
            const newer = await tx.payment.findFirst({ where: { orderId: freshPayment.orderId, attemptNo: { gt: freshPayment.attemptNo } } });
            if (newer && freshOrder.status !== OrderStatus.CANCELLED) {
                await tx.payment.update({ where: { id: freshPayment.id }, data: {
                    status: TransactionStatus.PAID, paidAt, providerTxnId: input.providerTxnId,
                    failureCode: 'LATE_SETTLEMENT', failureMessage: 'Tiền về lần thanh toán cũ; cần đối soát.'
                } });
                await tx.paymentCallback.update({ where: { id: input.callbackId }, data: {
                    paymentId: freshPayment.id, status: CallbackStatus.APPLIED, processedAt: new Date(), errorMessage: 'LATE_SETTLEMENT'
                } });
                return { outcome: 'APPLIED' as const };
            }

            // BUG-3: Order was already CANCELLED before IPN arrived -> record PAID + flag REFUND_REQUIRED
            if (freshOrder.status === OrderStatus.CANCELLED) {
                await tx.payment.update({
                    where: { id: freshPayment.id },
                    data: {
                        status: TransactionStatus.PAID,
                        paidAt,
                        providerTxnId: input.providerTxnId ?? freshPayment.providerTxnId,
                        failureCode: 'REFUND_REQUIRED',
                        failureMessage: 'Đơn đã hủy trước khi nhận IPN thành công – cần hoàn tiền thủ công.'
                    }
                });

                await tx.order.update({
                    where: { id: freshOrder.id },
                    data: {
                        paymentStatus: PaymentStatus.PAID,
                        paidAt,
                        paymentMethod: input.method
                    }
                });

                await tx.paymentCallback.update({
                    where: { id: input.callbackId },
                    data: {
                        paymentId: freshPayment.id,
                        status: CallbackStatus.APPLIED,
                        errorMessage: 'PAID_AFTER_CANCEL',
                        processedAt: new Date()
                    }
                });

                return { outcome: 'PAID_AFTER_CANCEL' as const };
            }

            const updatedPayment = await tx.payment.updateMany({
                where: {
                    id: freshPayment.id,
                    status: {
                        in: [
                            TransactionStatus.INITIATED,
                            TransactionStatus.PENDING,
                            TransactionStatus.FAILED,
                            TransactionStatus.CANCELLED,
                            TransactionStatus.EXPIRED
                        ]
                    }
                },
                data: {
                    status: TransactionStatus.PAID,
                    paidAt,
                    providerTxnId: input.providerTxnId ?? freshPayment.providerTxnId,
                    failureCode: null,
                    failureMessage: null
                }
            });

            if (updatedPayment.count === 1) {
                await tx.order.update({
                    where: { id: freshOrder.id },
                    data: {
                        paymentStatus: PaymentStatus.PAID,
                        paidAt,
                        paymentMethod: input.method,
                        ...(freshOrder.status === OrderStatus.PENDING ? { status: OrderStatus.PROCESSING } : {})
                    }
                });
            }

            await tx.paymentCallback.update({
                where: { id: input.callbackId },
                data: {
                    paymentId: freshPayment.id,
                    status: CallbackStatus.APPLIED,
                    processedAt: new Date()
                }
            });

            return { outcome: 'APPLIED' as const };
        });
    },

    async applyFailedWebhookTx(input: {
        callbackId: string;
        payment: PaymentRecord;
        failureCode: string;
        failureMessage: string;
    }): Promise<void> {
        await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
            await tx.$queryRaw`SELECT id FROM "Order" WHERE id = ${input.payment.orderId} FOR UPDATE`;
            const freshPayment = await tx.payment.findUnique({ where: { id: input.payment.id } });
            if (!freshPayment) return;

            // Rule 8: Payment already PAID receiving a late failed IPN -> ignore, do not downgrade status
            if (freshPayment.status !== TransactionStatus.PAID) {
                await tx.payment.updateMany({
                    where: {
                        id: freshPayment.id,
                        status: { in: [TransactionStatus.INITIATED, TransactionStatus.PENDING] }
                    },
                    data: {
                        status: ['1006', '24_02'].includes(input.failureCode) ? TransactionStatus.CANCELLED : TransactionStatus.FAILED,
                        failureCode: input.failureCode,
                        failureMessage: input.failureMessage
                    }
                });
            }

            // Order stays paymentStatus = PENDING (unless already PAID) so customer can retry
            await tx.paymentCallback.update({
                where: { id: input.callbackId },
                data: {
                    paymentId: freshPayment.id,
                    status: CallbackStatus.APPLIED,
                    errorMessage: `${input.failureCode}: ${input.failureMessage}`,
                    processedAt: new Date()
                }
            });
        });
    },

    async updateStatus(
        id: string,
        status: TransactionStatus,
        audit?: { by: string; note?: string }
    ): Promise<PaymentRecord> {
        return prisma.$transaction(async (tx: Prisma.TransactionClient) => {
            const identity = await tx.payment.findUniqueOrThrow({ where: { id }, select: { orderId: true } });
            await tx.$queryRaw`SELECT id FROM "Order" WHERE id = ${identity.orderId} FOR UPDATE`;
            const existing = await tx.payment.findUnique({ where: { id } });
            if (!existing) {
                throw new Error('Payment not found.');
            }
            if (![TransactionStatus.INITIATED, TransactionStatus.PENDING].includes(existing.status as 'INITIATED' | 'PENDING') || status === TransactionStatus.REFUNDED) {
                throw new HttpError(409, 'Trạng thái đã thay đổi hoặc cần dùng luồng hoàn tiền riêng.');
            }
            if (status === TransactionStatus.PAID) {
                const order = await tx.order.findUniqueOrThrow({ where: { id: existing.orderId } });
                if (order.status === OrderStatus.CANCELLED || order.paymentStatus === PaymentStatus.PAID) throw new HttpError(409, 'Đơn đã hủy hoặc đã thanh toán.');
            }

            // Never clear paidAt once a payment was PAID
            const paidAt =
                status === TransactionStatus.PAID
                    ? existing.paidAt ?? new Date()
                    : existing.paidAt;

            const nextResponsePayload = audit
                ? appendManualPaymentAudit(existing.responsePayload, {
                      by: audit.by,
                      from: existing.status,
                      to: status,
                      at: new Date().toISOString(),
                      note: audit.note ?? null
                  })
                : undefined;

            const updated = await tx.payment.update({
                where: { id },
                data: {
                    status,
                    paidAt,
                    ...(nextResponsePayload !== undefined ? { responsePayload: nextResponsePayload } : {})
                },
                include: paymentInclude
            });

            const orderPaymentStatus = mapTransactionToOrderPaymentStatus(status);
            const otherPaidCount = await tx.payment.count({
                where: {
                    orderId: existing.orderId,
                    id: { not: existing.id },
                    status: TransactionStatus.PAID
                }
            });

            // Do not downgrade Order.paymentStatus from PAID if another attempt is already PAID
            const shouldSkipOrderSync =
                otherPaidCount > 0 &&
                orderPaymentStatus !== PaymentStatus.PAID &&
                orderPaymentStatus !== PaymentStatus.REFUNDED;

            if (!shouldSkipOrderSync) {
                await tx.order.update({
                    where: { id: existing.orderId },
                    data: {
                        paymentStatus: orderPaymentStatus,
                        ...(orderPaymentStatus === PaymentStatus.PAID ? { paidAt } : {})
                    }
                });
            }

            return updated;
        });
    },

    async markRefunded(
        id: string,
        userId: string,
        note?: string
    ): Promise<PaymentRecord> {
        return prisma.$transaction(async (tx: Prisma.TransactionClient) => {
            const identity = await tx.payment.findUniqueOrThrow({ where: { id }, select: { orderId: true } });
            await tx.$queryRaw`SELECT id FROM "Order" WHERE id = ${identity.orderId} FOR UPDATE`;
            const existing = await tx.payment.findUnique({ where: { id } });
            if (!existing) {
                throw new Error('Payment not found.');
            }
            if (existing.method !== PaymentMethod.CASH || existing.status !== TransactionStatus.PAID || existing.failureCode !== 'REFUND_REQUIRED') {
                throw new HttpError(409, 'Chỉ xác nhận hoàn tiền CASH đã thanh toán và cần hoàn tiền; online cần bằng chứng từ cổng.');
            }

            const nextResponsePayload = appendManualPaymentAudit(existing.responsePayload, {
                by: userId,
                from: existing.status,
                to: TransactionStatus.REFUNDED,
                at: new Date().toISOString(),
                note: note ?? 'Xác nhận đã hoàn tiền thủ công'
            });

            const updated = await tx.payment.update({
                where: { id },
                data: {
                    status: TransactionStatus.REFUNDED,
                    failureCode: 'REFUNDED_MANUAL',
                    failureMessage: note ? `Đã hoàn tiền thủ công: ${note}` : 'Đã hoàn tiền thủ công cho khách hàng.',
                    responsePayload: nextResponsePayload
                },
                include: paymentInclude
            });

            await tx.order.update({
                where: { id: existing.orderId },
                data: {
                    paymentStatus: PaymentStatus.REFUNDED
                }
            });

            return updated;
        });
    },

    async expireStaleOnlinePayments(now = new Date()): Promise<number> {
        const res = await prisma.payment.updateMany({
            where: {
                // Expired pay URL does not prove the provider did not charge.
                // Only attempts never dispatched to a provider can expire automatically.
                status: TransactionStatus.INITIATED,
                method: { in: [PaymentMethod.MOMO, PaymentMethod.VNPAY] },
                expiresAt: { lt: now },
                requestPayload: { equals: Prisma.DbNull }
            },
            data: {
                status: TransactionStatus.EXPIRED,
                failureCode: 'EXPIRED',
                failureMessage: 'Giao dịch thanh toán trực tuyến đã quá hạn (15 phút).'
            }
        });
        return res.count;
    }
};
