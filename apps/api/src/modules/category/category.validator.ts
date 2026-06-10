import { z } from 'zod';

export const createCategorySchema = z.object({
    name: z.string().trim().min(1, 'Category name is required.').max(255, 'Category name must be at most 255 characters.'),
    description: z.string().trim().max(1000, 'Description must be at most 1000 characters.').optional().nullable()
});

export const updateCategorySchema = createCategorySchema.partial().refine((data) => Object.keys(data).length > 0, {
    message: 'At least one field is required.'
});

export type CreateCategoryInput = z.infer<typeof createCategorySchema>;
export type UpdateCategoryInput = z.infer<typeof updateCategorySchema>;