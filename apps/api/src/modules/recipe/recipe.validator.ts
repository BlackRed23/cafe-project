import { ToppingType } from '@cafe-project/database';
import { z } from 'zod';

export const recipeIngredientItemSchema = z.object({
    ingredientId: z.string().trim().min(1, 'Vui lòng chọn nguyên liệu.'),
    quantity: z.coerce.number().positive('Định lượng nguyên liệu phải lớn hơn 0.'),
    unit: z.string().trim().min(1, 'Đơn vị tính không được để trống.'),
    isOptional: z.coerce.boolean().optional().default(false),
    allowSubstitute: z.coerce.boolean().optional().default(false),
    note: z.string().trim().max(500).optional().nullable()
});

export const createRecipeSchema = z.object({
    yieldQuantity: z.coerce.number().positive('Sản lượng công thức phải lớn hơn 0.').optional().default(1),
    laborCost: z.coerce.number().min(0, 'Chi phí nhân công không được âm.').optional().default(0),
    overheadCost: z.coerce.number().min(0, 'Chi phí vận hành không được âm.').optional().default(0),
    note: z.string().trim().max(1000).optional().nullable(),
    activate: z.coerce.boolean().optional().default(true),
    ingredients: z.array(recipeIngredientItemSchema).min(1, 'Công thức phải có ít nhất 1 nguyên liệu.')
});

export const previewRecipeCostSchema = z.object({
    yieldQuantity: z.coerce.number().positive('Sản lượng công thức phải lớn hơn 0.').optional().default(1),
    laborCost: z.coerce.number().min(0, 'Chi phí nhân công không được âm.').optional().default(0),
    overheadCost: z.coerce.number().min(0, 'Chi phí vận hành không được âm.').optional().default(0),
    productPrice: z.coerce.number().min(0).optional(),
    ingredients: z.array(recipeIngredientItemSchema).default([])
});

export const toppingIngredientItemSchema = z.object({
    ingredientId: z.string().trim().min(1, 'Vui lòng chọn nguyên liệu cho topping.'),
    quantity: z.coerce.number().positive('Định lượng phải lớn hơn 0.').optional(),
    unit: z.string().trim().optional(),
    quantityBase: z.coerce.number().positive('Định lượng chuẩn phải lớn hơn 0.').optional(),
    note: z.string().trim().max(500).optional().nullable()
});

export const createToppingSchema = z.object({
    name: z.string().trim().min(1, 'Tên topping không được để trống.').max(200),
    toppingType: z.nativeEnum(ToppingType).optional().default(ToppingType.ADD),
    price: z.coerce.number().min(0, 'Giá topping không được âm.').default(0),
    productId: z.string().trim().optional().nullable(),
    isActive: z.coerce.boolean().optional().default(true),
    sortOrder: z.coerce.number().int().optional().default(0),
    ingredients: z.array(toppingIngredientItemSchema).optional().default([])
});

export const updateToppingSchema = createToppingSchema.partial();

export type RecipeIngredientItemInput = z.infer<typeof recipeIngredientItemSchema>;
export type CreateRecipeInput = z.infer<typeof createRecipeSchema>;
export type PreviewRecipeCostInput = z.infer<typeof previewRecipeCostSchema>;
export type CreateToppingInput = z.infer<typeof createToppingSchema>;
export type UpdateToppingInput = z.infer<typeof updateToppingSchema>;
