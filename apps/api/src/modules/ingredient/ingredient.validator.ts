import { WasteReason } from '@cafe-project/database';
import { z } from 'zod';

export const createIngredientSchema = z.object({
    sku: z.string().trim().max(100, 'SKU tối đa 100 ký tự.').optional(),
    name: z.string().trim().min(1, 'Tên nguyên liệu không được để trống.').max(200),
    categoryId: z.string().trim().optional().nullable(),
    baseUnit: z.string().trim().min(1, 'Đơn vị chuẩn không được để trống.').default('g'),
    costPerBaseUnit: z.coerce.number().min(0, 'Giá vốn trên đơn vị không được âm.').optional().default(0),
    minThreshold: z.coerce.number().min(0, 'Ngưỡng tối thiểu không được âm.').optional().default(0),
    origin: z.string().trim().max(500).optional().nullable(),
    storageInstructions: z.string().trim().max(1000).optional().nullable(),
    expiryInfo: z.string().trim().max(500).optional().nullable(),
    shelfLifeDays: z.coerce.number().int().positive('Số ngày bảo quản phải là số nguyên dương.').optional().nullable(),
    imageUrl: z.string().trim().max(1000).optional().nullable(),
    isActive: z.coerce.boolean().optional().default(true)
});

export const updateIngredientSchema = createIngredientSchema.partial();

export const importIngredientSchema = z.object({
    quantity: z.coerce.number().positive('Số lượng nhập phải lớn hơn 0.'),
    unit: z.string().trim().optional(),
    unitCost: z.coerce.number().min(0, 'Đơn giá nhập không được âm.').optional(),
    totalCost: z.coerce.number().min(0, 'Tổng chi phí nhập không được âm.').optional(),
    batchCode: z.string().trim().max(100).optional().nullable(),
    expirationDate: z.string().trim().optional().nullable(),
    supplierId: z.string().trim().optional().nullable(),
    note: z.string().trim().max(1000).optional().nullable()
}).superRefine((data, ctx) => {
    if (data.unitCost === undefined && data.totalCost === undefined) {
        ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: 'Vui lòng nhập đơn giá (unitCost) hoặc tổng tiền nhập (totalCost).',
            path: ['unitCost']
        });
    }
});

export const wasteIngredientSchema = z.object({
    quantity: z.coerce.number().positive('Số lượng hao hụt phải lớn hơn 0.'),
    unit: z.string().trim().optional(),
    wasteReason: z.nativeEnum(WasteReason, {
        message: 'Lý do hao hụt không hợp lệ.'
    }),
    batchId: z.string().trim().optional().nullable(),
    note: z.string().trim().max(1000).optional().nullable()
});

export const ingredientFiltersSchema = z.object({
    search: z.string().trim().optional(),
    categoryId: z.string().trim().optional(),
    lowStock: z.string().optional(),
    includeInactive: z.string().optional()
});

export type CreateIngredientInput = z.infer<typeof createIngredientSchema>;
export type UpdateIngredientInput = z.infer<typeof updateIngredientSchema>;
export type ImportIngredientInput = z.infer<typeof importIngredientSchema>;
export type WasteIngredientInput = z.infer<typeof wasteIngredientSchema>;
export type IngredientFiltersInput = z.infer<typeof ingredientFiltersSchema>;
