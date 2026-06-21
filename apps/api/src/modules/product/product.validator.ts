import { z } from 'zod';
import { ALLOWED_PRODUCT_UNITS } from '../../common/units';

const unitSchema = z.enum(ALLOWED_PRODUCT_UNITS, {
    message: 'Unit is not supported.'
});

export const createProductSchema = z.object({
    name: z.string().trim().min(1, 'Product name is required.').max(255, 'Product name must be at most 255 characters.'),
    sku: z.string().trim().max(100, 'SKU must be at most 100 characters.').optional().nullable(),
    description: z.string().trim().max(1000, 'Description must be at most 1000 characters.').optional().nullable(),
    price: z.coerce.number().min(0, 'Price must be greater than or equal to 0.'),
    costPrice: z.coerce.number().min(0, 'Cost price must be greater than or equal to 0.').optional(),
    unit: unitSchema.optional(),
    isActive: z.boolean().optional(),
    categoryId: z.string().trim().min(1, 'Category is required.'),
    imageUrl: z.string().trim().url('Image URL must be a valid URL.').optional().nullable().or(z.literal(''))
});

export const updateProductSchema = createProductSchema.partial().refine((data) => Object.keys(data).length > 0, {
    message: 'At least one field is required.'
});

export type CreateProductInput = z.infer<typeof createProductSchema>;
export type UpdateProductInput = z.infer<typeof updateProductSchema>;
