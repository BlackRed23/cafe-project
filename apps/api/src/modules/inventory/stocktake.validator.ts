import { z } from 'zod';

const id = z.string().trim().min(1);
const uuid = z.string().uuid('requestId phải là UUID hợp lệ.');
const note = z.string().trim().min(1, 'Vui lòng nhập lý do.').max(1000);
const quantity = z.number().finite().nonnegative('Số lượng kiểm kê không được âm.')
    .max(99999999999.999).refine(
        n => Math.abs(n * 1000 - Math.round(n * 1000)) < 0.00001,
        'Số lượng kiểm kê có tối đa 3 chữ số thập phân.'
    );

export const stocktakeCreateSchema = z.object({
    requestId: uuid,
    ingredientIds: z.array(id).min(1).max(50).refine(ids => new Set(ids).size === ids.length,
        'Phạm vi nguyên liệu bị trùng.'),
    assignedCounterId: id,
    note: z.string().trim().max(1000).optional()
}).strict();

export const stocktakeEntrySchema = z.object({
    requestId: uuid,
    batchId: id,
    expectedCursor: z.string().regex(/^\d+$/, 'Cần mã phiên bản tồn kho hợp lệ.'),
    expectedRevision: z.number().int().nonnegative(),
    actualQty: quantity,
    reason: note,
    reasonCategory: z.enum(['COUNTED', 'DAMAGED', 'VERIFIED_WASTE', 'WRONG_LOT', 'EXPIRED', 'UNEXPLAINED'])
}).strict();

export const stocktakeSubmitSchema = z.object({ requestId: uuid }).strict();
export const stocktakeDecisionSchema = z.object({ requestId: uuid, reason: note }).strict();
export type StocktakeCreateInput = z.infer<typeof stocktakeCreateSchema>;
export type StocktakeEntryInput = z.infer<typeof stocktakeEntrySchema>;
export type StocktakeSubmitInput = z.infer<typeof stocktakeSubmitSchema>;
export type StocktakeDecisionInput = z.infer<typeof stocktakeDecisionSchema>;
