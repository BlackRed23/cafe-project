
import { z } from 'zod';
import { stockQuantity } from './inventory-quantity';

const positiveId = z.string().trim().min(1);
const idempotencyKey = z.string().trim().min(1).max(200).optional();
const fitsStock = (value: number) => {
    try { stockQuantity(value, true, true); return true; } catch { return false; }
};

const decimalQuantity = z.coerce.number()
    .finite()
    .positive()
    .refine(fitsStock, 'Số lượng vượt Decimal(14,3).');

const signedDecimalQuantity = z.coerce.number()
    .finite()
    .refine(fitsStock, 'Số lượng vượt Decimal(14,3).')
    .refine(value => value !== 0, 'Số lượng phải khác 0.');

export const inventoryIdSchema = positiveId;

export const importInventorySchema = z.object({
    inventoryId: inventoryIdSchema,
    idempotencyKey,
    supplierIngredientId: positiveId.optional(),
    supplierId: positiveId.optional(),
    quantity: decimalQuantity.optional(),
    purchaseQuantity: decimalQuantity.optional(),
    batchCode: z.string().trim().optional(),
    expirationDate: z.string().trim().min(1),
    note: z.string().trim().max(1000).optional().nullable()
}).strict().superRefine((data, ctx) => {
    if (!data.batchCode && !data.idempotencyKey) {
        ctx.addIssue({ code: 'custom', path: ['batchCode'], message: 'Cần mã lô hoặc idempotencyKey.' });
    }
    if (data.quantity !== undefined && data.purchaseQuantity !== undefined) {
        ctx.addIssue({ code: 'custom', path: ['quantity'], message: 'Chỉ chọn quantity hoặc purchaseQuantity.' });
    }
    if (data.quantity === undefined &&
        data.purchaseQuantity === undefined) {
        ctx.addIssue({
            code: 'custom',
            path: ['quantity'],
            message: 'Cần cung cấp quantity hoặc purchaseQuantity.'
        });
    }
});

export const adjustInventorySchema = z.object({
    inventoryId: inventoryIdSchema,
    idempotencyKey,
    batchId: positiveId,
    quantity: signedDecimalQuantity,
    note: z.string().trim().max(1000).optional().nullable()
}).strict();

export const updateThresholdSchema = z.object({
    inventoryId: inventoryIdSchema,
    minThreshold: z.coerce.number()
        .finite()
        .min(0)
        .refine(fitsStock, 'Ngưỡng tồn kho vượt Decimal(14,3).')
});

export type ImportInventoryInput = z.infer<typeof importInventorySchema>;
export type AdjustInventoryInput = z.infer<typeof adjustInventorySchema>;
export type UpdateThresholdInput = z.infer<typeof updateThresholdSchema>;
