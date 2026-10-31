import {
    CallbackStatus,
    OrderStatus,
    PaymentMethod,
    PaymentStatus,
    TransactionStatus,
    prisma,
    type Prisma
} from '@cafe-project/database';

const paymentInclude = {
    order: { include: { user: { select: { id: true, name: true, email: true } } } }
} satisfies Prisma.PaymentInclude;

const orderWithPaymentsInclude = {
    user: { select: { id: true, name: true, email: true } },
    payments: { orderBy: [{ attemptNo: 'desc' }, { createdAt: 'desc' }] }
} satisfies Prisma.OrderInclude;

export type PaymentRecord = Prisma.PaymentGetPayload<{ include: typeof paymentInclude }>;
export type OrderWithPaymentsRecord = Prisma.OrderGetPayload<{ include: typeof orderWithPaymentsInclude }>;

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
            // Supersede any existing INITIATED or PENDING attempts for this order
            await tx.payment.updateMany({
                where: {
                    orderId: input.orderId,
                    status: { in: [TransactionStatus.INITIATED, TransactionStatus.PENDING] }
                },
                data: {
                    status: TransactionStatus.CANCELLED,
                    failureCode: 'SUPERSEDED',
                    failureMessage: 'Attempt superseded by a newer payment attempt'
                }
            });

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
        return prisma.payment.update({
            where: { id },
            data: {
                status: TransactionStatus.PENDING,
                requestPayload,
                responsePayload
            },
            include: paymentInclude
        });
    },

    async markAttemptGatewayError(
        id: string,
        failureCode: string,
        failureMessage: string,
        requestPayload?: Prisma.InputJsonValue,
        responsePayload?: Prisma.InputJsonValue
    ): Promise<void> {
        await prisma.payment.update({
            where: { id },
            data: {
                status: TransactionStatus.FAILED,
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
    }): Promise<{ outcome: 'APPLIED' | 'ALREADY_PAID_SAME_ATTEMPT' | 'DUPLICATE_PAYMENT_OTHER_ATTEMPT' }> {
        return prisma.$transaction(async (tx: Prisma.TransactionClient) => {
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
                        status: CallbackStatus.DUPLICATED,
                        processedAt: new Date()
                    }
                });
                return { outcome: 'ALREADY_PAID_SAME_ATTEMPT' as const };
            }

            // Late webhook for a cancelled/expired attempt while Order was ALREADY paid by another attempt
            if (freshOrder.paymentStatus === PaymentStatus.PAID) {
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
            const updatedPayment = await tx.payment.updateMany({
                where: {
                    id: freshPayment.id,
                    status: {
                        in: [
                            TransactionStatus.INITIATED,
                            TransactionStatus.PENDING,
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
                        status: TransactionStatus.FAILED,
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

    async updateStatus(id: string, status: TransactionStatus): Promise<PaymentRecord> {
        return prisma.$transaction(async (tx: Prisma.TransactionClient) => {
            const existing = await tx.payment.findUnique({ where: { id } });
            if (!existing) {
                throw new Error('Payment not found.');
            }

            const paidAt = status === TransactionStatus.PAID ? existing.paidAt ?? new Date() : null;
            const updated = await tx.payment.update({
                where: { id },
                data: { status, paidAt },
                include: paymentInclude
            });

            const orderPaymentStatus = mapTransactionToOrderPaymentStatus(status);
            await tx.order.update({
                where: { id: existing.orderId },
                data: {
                    paymentStatus: orderPaymentStatus,
                    ...(orderPaymentStatus === PaymentStatus.PAID ? { paidAt } : {})
                }
            });

            return updated;
        });
    }
};
