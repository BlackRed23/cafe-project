import { createHash } from 'node:crypto';
import type { CreateOrderInput } from './order.validator';

const digest = (value: unknown): string => createHash('sha256').update(JSON.stringify(value)).digest('hex');

// Immutable primary keys keep submission identity independent of mutable payment payloads.
// No new table or migration required; both records commit with stock reservations.
export const submissionOrderId = (userId: string, requestId: string): string =>
    `submission_${digest([userId, requestId])}`;

export const submissionPaymentId = (orderId: string, input: CreateOrderInput): string => {
    const payload = {
        items: input.items.map(item => ({ productId: item.productId, quantity: item.quantity,
            toppings: (item.toppings ?? []).map(t => ({ toppingId: t.toppingId, quantity: t.quantity })) })),
        shippingName: input.shippingName ?? null, shippingPhone: input.shippingPhone ?? null,
        shippingAddress: input.shippingAddress ?? null, note: input.note ?? null,
        paymentMethod: input.paymentMethod
    };
    return `submission_${digest([orderId, payload])}`;
};
