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
    ]),
    note: z.string().trim().optional()
});

export const markRefundedSchema = z.object({
    note: z.string().trim().optional()
}).strict();

export const simulateMoMoIpnSchema = z.object({
    paymentId: z.string().trim().min(1, 'paymentId là bắt buộc.'),
    success: z.boolean().default(true)
});

export const createPaymentUrlSchema = z.object({
    orderId: z.string().trim().min(1, 'orderId là bắt buộc.'),
    method: z.enum(['MOMO', 'VNPAY'])
});

export const requestRefundSchema = z.object({
    requestId: z.string().trim().regex(/^[a-zA-Z0-9_-]{8,64}$/),
    amount: z.string().trim().regex(/^[1-9]\d{0,11}$/, 'Số tiền phải là số VND nguyên dương.'),
    reason: z.string().trim().min(8).max(500),
    approvalRef: z.string().trim().min(8).max(120)
}).strict();

export const attestCashRefundSchema = z.object({
    receiptRef: z.string().trim().regex(/^[a-zA-Z0-9_-]{8,120}$/)
}).strict();

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
export type MarkRefundedInput = z.infer<typeof markRefundedSchema>;
export type SimulateMoMoIpnInput = z.infer<typeof simulateMoMoIpnSchema>;
export type CreatePaymentUrlInput = z.infer<typeof createPaymentUrlSchema>;
export type MoMoWebhookInput = z.infer<typeof momoWebhookSchema>;
export type RequestRefundInput = z.infer<typeof requestRefundSchema>;
export type AttestCashRefundInput = z.infer<typeof attestCashRefundSchema>;
