import { PaymentStatus, type Prisma } from '@cafe-project/database';
import { prisma } from '@cafe-project/database';

const paymentInclude = {
    order: { include: { user: { select: { id: true, name: true, email: true } } } }
} satisfies Prisma.PaymentInclude;

export type PaymentRecord = Prisma.PaymentGetPayload<{ include: typeof paymentInclude }>;

export const paymentRepository = {
    async findByOrderId(orderId: string): Promise<PaymentRecord | null> {
        return prisma.payment.findUnique({ where: { orderId }, include: paymentInclude });
    },

    async findById(id: string): Promise<PaymentRecord | null> {
        return prisma.payment.findUnique({ where: { id }, include: paymentInclude });
    },

    async updateStatus(id: string, status: PaymentStatus): Promise<PaymentRecord> {
        return prisma.payment.update({
            where: { id },
            data: { status, paidAt: status === PaymentStatus.PAID ? new Date() : null },
            include: paymentInclude
        });
    }
};