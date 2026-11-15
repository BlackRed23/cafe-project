import { z } from 'zod';

export const scanInventorySchema = z.object({
    productIds: z.array(z.string().trim().min(1)).optional(),
    ingredientIds: z.array(z.string().trim().min(1)).optional(),
    scope: z.enum(['ALL', 'PRODUCT', 'INGREDIENT']).optional(),
    triggerType: z.string().trim().min(1).default('MANUAL')
}).optional().default({ triggerType: 'MANUAL' });

export const recommendReorderSchema = z.object({
    productIds: z.array(z.string().trim().min(1)).optional(),
    ingredientIds: z.array(z.string().trim().min(1)).optional(),
    scope: z.enum(['ALL', 'PRODUCT', 'INGREDIENT']).optional(),
    force: z.boolean().optional().default(false)
}).optional().default({ force: false });
