import { PaymentStatus } from '@cafe-project/database';
import { z } from 'zod';

export const paymentStatusSchema = z.object({
    status: z.enum(['PENDING', 'SUCCESS', 'PAID', 'FAILED', 'REFUNDED'])
});

export type PaymentStatusInput = z.infer<typeof paymentStatusSchema>;