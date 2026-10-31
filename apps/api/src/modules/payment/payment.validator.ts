import { z } from 'zod';

export const paymentStatusSchema = z.object({
    status: z.enum([
        'INITIATED',
        'PENDING',
        'AUTHORIZED',
        'SUCCESS',
        'PAID',
        'FAILED',
        'CANCELLED',
        'EXPIRED',
        'REFUNDED'
    ])
});

export const createPaymentUrlSchema = z.object({
    orderId: z.string().trim().min(1, 'orderId là bắt buộc.'),
    method: z.enum(['MOMO', 'VNPAY'])
});

export const momoWebhookSchema = z
    .object({
        partnerCode: z.string().optional(),
        orderId: z.string().optional(),
        requestId: z.string().optional(),
        amount: z.union([z.number(), z.string()]).optional(),
        orderInfo: z.string().optional(),
        orderType: z.string().optional(),
        transId: z.union([z.number(), z.string()]).optional(),
        resultCode: z.union([z.number(), z.string()]).optional(),
        message: z.string().optional(),
        payType: z.string().optional(),
        responseTime: z.union([z.number(), z.string()]).optional(),
        extraData: z.string().optional(),
        signature: z.string().optional()
    })
    .passthrough();

export type PaymentStatusInput = z.infer<typeof paymentStatusSchema>;
export type CreatePaymentUrlInput = z.infer<typeof createPaymentUrlSchema>;
export type MoMoWebhookInput = z.infer<typeof momoWebhookSchema>;
