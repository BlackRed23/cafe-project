import { z } from 'zod';

export const simulateSaleSchema = z.object({
    productId: z.string().trim().min(1, 'Product is required.').optional(),
    quantity: z.coerce.number().int('Quantity must be an integer.').min(1, 'Quantity must be at least 1.').optional(),
    
    // New preview fields
    isPreview: z.boolean().optional(),
    simulationMode: z.enum(['ONE_DAY', 'WEEK', 'MONTH', 'CUSTOM_RANGE']).optional(),
    startDate: z.string().optional(),
    endDate: z.string().optional(),
    dailySimulatedQuantity: z.coerce.number().optional(),

    productCount: z.coerce.number().int('Product count must be an integer.').min(1, 'Product count must be at least 1.').optional(),
    minDecrease: z.coerce.number().int('Minimum decrease must be an integer.').min(1, 'Minimum decrease must be at least 1.').optional(),
    maxDecrease: z.coerce.number().int('Maximum decrease must be an integer.').min(1, 'Maximum decrease must be at least 1.').optional(),
    note: z.string().trim().max(1000, 'Note must be at most 1000 characters.').optional().nullable()
}).superRefine((data, ctx) => {
    if (data.productId || data.quantity !== undefined || data.dailySimulatedQuantity !== undefined) {
        if (!data.productId) {
            ctx.addIssue({ code: 'custom', message: 'Product is required.', path: ['productId'] });
        }
        if (data.quantity === undefined && data.dailySimulatedQuantity === undefined) {
            ctx.addIssue({ code: 'custom', message: 'Quantity or dailySimulatedQuantity is required.', path: ['quantity'] });
        }
        return;
    }

    if (data.productCount === undefined) {
        ctx.addIssue({ code: 'custom', message: 'Product count is required.', path: ['productCount'] });
    }
    if (data.minDecrease === undefined) {
        ctx.addIssue({ code: 'custom', message: 'Minimum decrease is required.', path: ['minDecrease'] });
    }
    if (data.maxDecrease === undefined) {
        ctx.addIssue({ code: 'custom', message: 'Maximum decrease is required.', path: ['maxDecrease'] });
    }
    if (data.minDecrease !== undefined && data.maxDecrease !== undefined && data.maxDecrease < data.minDecrease) {
        ctx.addIssue({ code: 'custom', message: 'Maximum decrease must be greater than or equal to minimum decrease.', path: ['maxDecrease'] });
    }
});

export type SimulateSaleInput = z.infer<typeof simulateSaleSchema>;
