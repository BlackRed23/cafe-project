import type { Payment, PaymentStatus } from '@cafe-project/database';

export const selectPayment = <T extends Pick<Payment, 'id' | 'status' | 'paidAt' | 'updatedAt' | 'attemptNo'>>(payments: readonly T[]): T | null =>
    [...payments].sort((a, b) =>
        Number(b.status === 'PAID') - Number(a.status === 'PAID') ||
        (b.paidAt ?? b.updatedAt).getTime() - (a.paidAt ?? a.updatedAt).getTime() ||
        b.attemptNo - a.attemptNo || a.id.localeCompare(b.id)
    )[0] ?? null;

export const paymentSummaryStatus = (status: Payment['status']): PaymentStatus => {
    if (status === 'PAID' || status === 'REFUNDED') return status;
    if (status === 'FAILED' || status === 'CANCELLED' || status === 'EXPIRED') return 'FAILED';
    return 'PENDING';
};
