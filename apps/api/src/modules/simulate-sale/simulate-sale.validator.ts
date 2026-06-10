import { z } from 'zod';

export const simulateSaleSchema = z.object({
    productCount: z.coerce.number().int('Product count must be an integer.').min(1, 'Product count must be at least 1.'),
    minDecrease: z.coerce.number().int('Minimum decrease must be an integer.').min(1, 'Minimum decrease must be at least 1.'),
    maxDecrease: z.coerce.number().int('Maximum decrease must be an integer.').min(1, 'Maximum decrease must be at least 1.'),
    note: z.string().trim().max(1000, 'Note must be at most 1000 characters.').optional().nullable()
}).refine((data) => data.maxDecrease >= data.minDecrease, { message: 'Maximum decrease must be greater than or equal to minimum decrease.' });

export type SimulateSaleInput = z.infer<typeof simulateSaleSchema>;