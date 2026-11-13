import { PaymentStatus, type Prisma } from '@cafe-project/database';
import { prisma } from '@cafe-project/database';
import { selectPayment, paymentSummaryStatus } from './payment-selection';
import { HttpError } from '../../common/http-error';

const paymentInclude = {
    order: { include: { user: { select: { id: true, name: true, email: true } } } }
} satisfies Prisma.PaymentInclude;

export type PaymentRecord = Prisma.PaymentGetPayload<{ include: typeof paymentInclude }>;

export const paymentRepository = {
    async findByOrderId(orderId: string): Promise<PaymentRecord | null> {
        const payments = await prisma.payment.findMany({ where: { orderId }, include: paymentInclude });
        return selectPayment(payments);
    },

    async findById(id: string): Promise<PaymentRecord | null> {
        return prisma.payment.findUnique({ where: { id }, include: paymentInclude });
    },

    async updateStatus(id: string, status: PaymentStatus): Promise<PaymentRecord> {
        return prisma.$transaction(async (tx: Prisma.TransactionClient) => {
            const existing = await tx.payment.findUnique({ where: { id } });
            if (!existing) throw new HttpError(404, 'Payment not found.');
            // All attempts for an order share this lock and aggregate update.
            await tx.$queryRaw`SELECT "id" FROM "Order" WHERE "id" = ${existing.orderId} FOR UPDATE`;
            const current = await tx.payment.findUnique({ where: { id } });
            if (!current) throw new HttpError(404, 'Payment not found.');
            if (current.status === 'PAID' && status === 'PAID') throw new HttpError(409, 'Payment already paid.');
            if (status === 'PAID') {
                const paidAttempt = await tx.payment.findFirst({ where: { orderId: current.orderId, status: 'PAID', id: { not: id } } });
                if (paidAttempt) throw new HttpError(409, 'Order already has a paid attempt.');
            }
            const payment = await tx.payment.update({
                where: { id },
                data: { status, paidAt: status === 'PAID' ? new Date() : status === 'REFUNDED' ? current.paidAt : null },
                include: paymentInclude
            });
            const selected = selectPayment(await tx.payment.findMany({ where: { orderId: current.orderId } }));
            if (!selected) throw new HttpError(409, 'Payment aggregate unavailable.');
            await tx.order.update({
                where: { id: current.orderId },
                data: { paymentStatus: paymentSummaryStatus(selected.status), paymentMethod: selected.method, paidAt: selected.paidAt }
            });
            return payment;
        });
    }
};
