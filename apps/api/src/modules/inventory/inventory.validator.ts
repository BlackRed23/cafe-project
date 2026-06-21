import { z } from 'zod';

export const inventoryIdSchema = z.string().trim().min(1, 'Mã tồn kho là bắt buộc.');

export const importInventorySchema = z.object({
    inventoryId: inventoryIdSchema,
    supplierProductId: z.string().trim().min(1, 'Supplier product is required.').optional(),
    supplierId: z.string().trim().min(1, 'Supplier is required.').optional(),
    quantity: z.coerce.number().int('Số lượng phải là số nguyên.').positive('Số lượng phải lớn hơn 0.').optional(),
    purchaseQuantity: z.coerce.number().positive('Số lượng nhập phải lớn hơn 0.').optional(),
    note: z.string().trim().max(1000, 'Ghi chú tối đa 1000 ký tự.').optional().nullable()
}).superRefine((data, ctx) => {
    if (data.quantity === undefined && data.purchaseQuantity === undefined) {
        ctx.addIssue({
            code: 'custom',
            message: 'Quantity or purchaseQuantity is required.',
            path: ['quantity']
        });
    }
});

export const adjustInventorySchema = z.object({
    inventoryId: inventoryIdSchema,
    quantity: z.coerce.number().int('Số lượng phải là số nguyên.').refine((value) => value !== 0, 'Số lượng điều chỉnh không được bằng 0.'),
    note: z.string().trim().max(1000, 'Ghi chú tối đa 1000 ký tự.').optional().nullable()
});

export const updateThresholdSchema = z.object({
    inventoryId: inventoryIdSchema,
    minThreshold: z.coerce.number().int('Ngưỡng phải là số nguyên.').min(0, 'Ngưỡng không được âm.')
});

export type ImportInventoryInput = z.infer<typeof importInventorySchema>;
export type AdjustInventoryInput = z.infer<typeof adjustInventorySchema>;
export type UpdateThresholdInput = z.infer<typeof updateThresholdSchema>;
