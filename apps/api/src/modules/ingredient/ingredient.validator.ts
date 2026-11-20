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
    expiryClassification: z.enum(['PERISHABLE', 'NON_PERISHABLE']).optional(),
    imageUrl: z.string().trim().max(1000).optional().nullable(),
    isActive: z.coerce.boolean().optional().default(true)
});

// Zod 4 applies nested defaults even inside partial(); PATCH must not supply them.
export const updateIngredientSchema = createIngredientSchema.partial().extend({
    baseUnit: createIngredientSchema.shape.baseUnit.removeDefault().optional(),
    costPerBaseUnit: createIngredientSchema.shape.costPerBaseUnit.removeDefault().optional(),
    minThreshold: createIngredientSchema.shape.minThreshold.removeDefault().optional(),
    isActive: createIngredientSchema.shape.isActive.removeDefault().optional()
});

export const ingredientIncidentSchema = z.object({
    actualQuantity: z.number().finite().nonnegative().max(99999999999.999)
        .refine(value => Math.abs(value * 1000 - Math.round(value * 1000)) < 0.0001, 'Use at most three decimal places.'),
    reason: z.string().trim().min(1).max(1000)
}).strict();

/** Per-lot physical stock count. This creates a request, never edits official stock. */
export const ingredientAdjustmentSchema = z.object({
    requestId: z.string().uuid(),
    batchId: z.string().trim().min(1),
    measuredQuantity: z.number().finite().nonnegative().max(99999999999.999)
        .refine(value => Math.abs(value * 1000 - Math.round(value * 1000)) < 0.0001,
            'Số lượng đo được có tối đa 3 chữ số thập phân.'),
    reason: z.string().trim().min(1).max(1000)
}).strict();

export const ingredientCorrectionSchema = z.object({
    requestId: z.string().uuid(),
    reason: z.string().trim().min(1).max(1000)
}).strict();

export const lotTransitionSchema = z.object({
    requestId: z.string().uuid(),
    reason: z.string().trim().min(1).max(1000)
}).strict();

export const lotReturnSchema = lotTransitionSchema.extend({
    sourceTransactionId: z.string().trim().min(1),
    batchId: z.string().trim().min(1),
    quantity: z.number().finite().positive().max(99999999999.999)
        .refine(value => Math.abs(value * 1000 - Math.round(value * 1000)) < 0.0001, 'Use at most three decimal places.'),
    quality: z.enum(['UNKNOWN', 'UNSAFE', 'SAFE'])
}).strict();

export const ingredientInternalUseSchema = z.object({
    requestId: z.string().uuid(),
    quantity: z.number().finite().positive().max(99999999999.999),
    unit: z.string().trim().min(1).max(50),
    purpose: z.string().trim().min(1).max(500),
    recipient: z.string().trim().min(1).max(200)
}).strict();

export const importIngredientSchema = z.object({
    requestId: z.string().uuid('requestId phải là UUID hợp lệ.').optional(),
    // Ingredient/IngredientBatch/InventoryTransaction store physical quantities as
    // DECIMAL(14,3). Reject unrepresentable client input before opening a DB write.
    quantity: z.coerce.number().finite().positive('Số lượng nhập phải lớn hơn 0.')
        .max(99999999999.999, 'Số lượng nhập vượt giới hạn lưu trữ.'),
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
