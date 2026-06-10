import { OrderStatus, PaymentMethod, PaymentStatus } from '@cafe-project/database';
import { z } from 'zod';

export const createOrderSchema = z.object({
    items: z.array(z.object({
        productId: z.string().trim().min(1, 'Product is required.'),
        quantity: z.coerce.number().int('Quantity must be an integer.').positive('Quantity must be greater than 0.')
    })).min(1, 'Order items cannot be empty.'),
    shippingAddress: z.string().trim().optional(),
    shippingPhone: z.string().trim().optional(),
    note: z.string().trim().optional().nullable(),
    paymentMethod: z.nativeEnum(PaymentMethod).default(PaymentMethod.CASH)
});

export const orderStatusSchema = z.object({
    status: z.enum(['PENDING', 'CONFIRMED', 'PROCESSING', 'COMPLETED', 'CANCELLED'])
});

export const orderFiltersSchema = z.object({
    status: z.nativeEnum(OrderStatus).optional(),
    paymentStatus: z.nativeEnum(PaymentStatus).optional()
});

export type CreateOrderInput = z.infer<typeof createOrderSchema>;
export type OrderStatusInput = z.infer<typeof orderStatusSchema>;
export type OrderFiltersInput = z.infer<typeof orderFiltersSchema>;