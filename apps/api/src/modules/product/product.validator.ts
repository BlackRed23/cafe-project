import { z } from 'zod';
import { ALLOWED_PRODUCT_UNITS } from '../../common/units';

const unitSchema = z.enum(ALLOWED_PRODUCT_UNITS, {
    message: 'Unit is not supported.'
});

const priceSchema = z.preprocess(
    value => typeof value === 'string' && value.trim() !== '' ? Number(value) : value,
    z.number().finite().min(0).max(9999999999.99).multipleOf(0.01)
);

export const createProductSchema = z.object({
    name: z.string().trim().min(1, 'Product name is required.').max(255, 'Product name must be at most 255 characters.'),
    sku: z.string().trim().max(100, 'SKU must be at most 100 characters.').optional().nullable(),
    description: z.string().trim().max(1000, 'Description must be at most 1000 characters.').optional().nullable(),
    price: priceSchema,
    costPrice: z.coerce.number().min(0, 'Cost price must be greater than or equal to 0.').optional(),
    unit: unitSchema.optional(),
    isActive: z.boolean().optional(),
    categoryId: z.string().trim().min(1, 'Category is required.'),
    imageUrl: z.string().trim().url('Image URL must be a valid URL.').optional().nullable().or(z.literal('')),
    nutritionFacts: z.string().trim().optional().nullable(),
    nutrition_facts: z.string().trim().optional().nullable(),
    usageInstructions: z.string().trim().optional().nullable(),
    usage_instructions: z.string().trim().optional().nullable(),
    storageInstructions: z.string().trim().optional().nullable(),
    storage_instructions: z.string().trim().optional().nullable(),
    origin: z.string().trim().optional().nullable(),
    certifications: z.string().trim().optional().nullable(),
    expiryInfo: z.string().trim().optional().nullable(),
    expiry_info: z.string().trim().optional().nullable()
});

export const updateProductSchema = createProductSchema.partial().extend({
    expectedUpdatedAt: z.string().datetime({ offset: true })
}).refine((data) => Object.keys(data).some(key => key !== 'expectedUpdatedAt'), {
    message: 'At least one field is required.'
});

export type CreateProductInput = z.infer<typeof createProductSchema>;
export type UpdateProductInput = z.infer<typeof updateProductSchema>;
