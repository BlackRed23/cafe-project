import { z } from 'zod';

export const createProductSchema = z.object({
    name: z
        .string()
        .trim()
        .min(1, 'Product name is required.')
        .max(255, 'Product name must be at most 255 characters.'),
    description: z
        .string()
        .trim()
        .max(1000, 'Description must be at most 1000 characters.')
        .optional()
        .nullable(),
    price: z.coerce.number().min(0, 'Price must be greater than or equal to 0.'),
    categoryId: z.string().trim().min(1, 'Category is required.')
});

export const updateProductSchema = z.object({
    name: z
        .string()
        .trim()
        .min(1, 'Product name is required.')
        .max(255, 'Product name must be at most 255 characters.')
        .optional(),
    description: z
        .string()
        .trim()
        .max(1000, 'Description must be at most 1000 characters.')
        .optional()
        .nullable(),
    price: z.coerce.number().min(0, 'Price must be greater than or equal to 0.').optional(),
    categoryId: z.string().trim().min(1, 'Category is required.').optional(),
    isActive: z.coerce.boolean().optional()
});

export type CreateProductInput = z.infer<typeof createProductSchema>;
export type UpdateProductInput = z.infer<typeof updateProductSchema>;
