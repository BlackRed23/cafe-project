import { OrderStatus, PaymentMethod, PaymentStatus } from '@cafe-project/database';
import { z } from 'zod';

export const orderItemToppingInputSchema = z.object({
    toppingId: z.string().trim().min(1, 'Topping ID không được để trống.'),
    quantity: z.coerce.number().int('Số lượng topping phải là số nguyên.').positive('Số lượng topping phải lớn hơn 0.').default(1)
});

export const createOrderSchema = z.object({
    requestId: z.string().trim().min(1).max(128).optional(),
    items: z.array(z.object({
        productId: z.string().trim().min(1, 'Product is required.'),
        quantity: z.coerce.number().int('Quantity must be an integer.').positive('Quantity must be greater than 0.'),
        toppings: z.array(orderItemToppingInputSchema).optional().default([])
    })).min(1, 'Order items cannot be empty.'),
    shippingName: z.string().trim().optional(),
    shippingAddress: z.string().trim().optional(),
    shippingPhone: z.string().trim().optional(),
    note: z.string().trim().optional().nullable(),
    paymentMethod: z.nativeEnum(PaymentMethod).default(PaymentMethod.CASH)
});

export const orderStatusSchema = z.object({
    status: z.enum(['PENDING', 'CONFIRMED', 'PROCESSING', 'PREPARING', 'COMPLETED', 'CANCELLED']),
    expectedVersion: z.number().int().nonnegative().optional(),
    paymentStatus: z.nativeEnum(PaymentStatus).refine(value => value === PaymentStatus.PAID,
        'Only manual PAID confirmation is allowed; refunds require authorized refund workflow.').optional()
});

export const confirmPaymentSchema = z.object({
    note: z.string().trim().optional()
});

export const orderFiltersSchema = z.object({
    status: z.nativeEnum(OrderStatus).optional(),
    paymentStatus: z.nativeEnum(PaymentStatus).optional()
});

export type CreateOrderInput = z.infer<typeof createOrderSchema>;
export type OrderStatusInput = z.infer<typeof orderStatusSchema>;
export type ConfirmPaymentInput = z.infer<typeof confirmPaymentSchema>;
export type OrderFiltersInput = z.infer<typeof orderFiltersSchema>;

const item = z.object({ productId: z.string().min(1), quantity: z.number().int().positive() });
export const orderOperationSchema = z.object({
    requestId: z.string().trim().min(1).max(128), expectedVersion: z.number().int().nonnegative(),
    kind: z.enum(['CANCEL', 'REMAKE', 'CORRECTION']), reason: z.string().trim().min(1).max(1000),
    originalItemId: z.string().min(1).optional(), replacement: item.optional()
});
export const approveOperationSchema = z.object({ expectedVersion: z.number().int().nonnegative() });
export const editItemsSchema = z.object({ requestId: z.string().trim().min(1).max(128),
    expectedVersion: z.number().int().nonnegative(), reason: z.string().trim().min(1).max(1000),
    items: z.array(item).min(1) });
export const prepareItemSchema = z.object({ requestId: z.string().trim().min(1).max(128),
    expectedVersion: z.number().int().nonnegative() });
