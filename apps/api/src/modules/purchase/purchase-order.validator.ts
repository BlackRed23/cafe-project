import { z } from 'zod';

const uuid = z.string().uuid('requestId phải là UUID.');
const nonempty = z.string().trim().min(1, 'Bắt buộc nhập lý do hoặc bằng chứng.').max(1000);
const qty = z.number().int().positive();

export const poCreateSchema = z.object({
    requestId: uuid, purchaseRequestId: z.string().min(1),
    currency: z.literal('VND').default('VND')
}).strict();
export const purchasingHoldSchema = z.object({
    requestId: uuid, ingredientId: z.string().min(1), quantity: qty,
    reason: nonempty, demandSourceKey: z.string().trim().min(8).max(200).optional()
}).strict();
export const purchasingAssignSchema = z.object({
    requestId: uuid, supplierId: z.string().min(1), reason: nonempty
}).strict();
export const poDispatchSchema = z.object({
    requestId: uuid,
    mode: z.enum(['SANDBOX', 'UNKNOWN']),
    reason: nonempty
}).strict();
export const poDecisionSchema = z.object({
    requestId: uuid, reason: nonempty, evidenceReference: nonempty,
    source: z.enum(['ADMIN_ATTESTATION', 'SUPPLIER_DOCUMENT']).default('ADMIN_ATTESTATION'),
    sourceIdentity: nonempty.optional(),
    observedAt: z.string().datetime({ offset: true }).optional()
}).strict();
export const poCancelSchema = z.object({
    requestId: uuid, reason: nonempty, supplierEvidenceReference: nonempty.optional()
}).strict();
export const poSelectSupplierSchema = z.object({
    requestId: uuid, supplierId: z.string().min(1), reason: nonempty
}).strict();
export const poReceiptSchema = z.object({
    requestId: uuid,
    supplierInvoiceNo: nonempty.optional(),
    note: z.string().trim().max(1000).optional(),
    items: z.array(z.object({
        purchaseOrderItemId: z.string().min(1),
        receivedQuantity: qty,
        batches: z.array(z.object({
            batchCode: nonempty, expirationDate: z.string().datetime({ offset: true }),
            quantity: qty
        }).strict()).min(1)
    }).strict()).min(1)
}).strict();
export const poDiscrepancySchema = z.object({
    requestId: uuid, purchaseOrderItemId: z.string().min(1),
    category: z.enum(['OVER_DELIVERY', 'WRONG_INGREDIENT', 'DAMAGED', 'SHELF_LIFE']),
    observedIngredientId: z.string().min(1).optional(),
    observedQuantity: qty,
    acceptedQuantity: z.number().int().nonnegative(),
    rejectedQuantity: z.number().int().nonnegative(),
    reason: nonempty,
    evidence: z.record(z.string(), z.unknown()).optional()
}).strict().refine(v => v.acceptedQuantity + v.rejectedQuantity === v.observedQuantity,
    'Lượng quan sát phải bằng lượng chấp nhận cộng lượng từ chối.');
export const poReturnSchema = z.object({
    requestId: uuid, goodsReceiptId: z.string().min(1),
    batchId: z.string().min(1),
    quantity: z.number().finite().positive().refine(n => Math.abs(n*1000-Math.round(n*1000))<0.00001,
        'Số lượng trả có tối đa 3 số thập phân.'),
    reason: nonempty
}).strict();
export const poInvoiceSchema = z.object({
    requestId: uuid, invoiceNumber: nonempty, currency: z.string().min(3).max(3),
    note: nonempty.optional(),
    items: z.array(z.object({
        purchaseOrderItemId: z.string().min(1),
        ingredientId: z.string().min(1).optional(),
        quantity: qty, unit: nonempty, unitPrice: z.number().finite().nonnegative(),
        total: z.number().finite().nonnegative()
    }).strict()).min(1)
}).strict();

export const poOverdeliveryAmendmentSchema = z.object({
    requestId: uuid, discrepancyId: z.string().min(1), requestedExtraQuantity: qty, reason: nonempty
}).strict();
export const poShelfLifeRuleSchema = z.object({
    requestId: uuid, ingredientId: z.string().min(1).optional(), categoryId: z.string().min(1).optional(),
    minRemainingDays: z.number().int().min(0).max(3650), reason: nonempty
}).strict().refine(v => Boolean(v.ingredientId) !== Boolean(v.categoryId),
    'Cần chọn duy nhất một phạm vi nguyên liệu hoặc danh mục.');
export const poCancelResolutionSchema = z.object({
    requestId: uuid, decision: z.enum(['SUPPLIER_ACKNOWLEDGED', 'SUPPLIER_DISPUTED', 'AWAITING_EVIDENCE']),
    reason: nonempty, evidenceReference: nonempty.optional(),
    observedAt: z.string().datetime({ offset: true }).optional()
}).strict();
export const purchasingAggregationSchema = z.object({
    requestId: uuid, purchaseRequestIds: z.array(z.string().min(1)).min(2).max(50),
    reason: nonempty
}).strict();

export type PoCreateInput = z.infer<typeof poCreateSchema>;
export type PurchasingHoldInput = z.infer<typeof purchasingHoldSchema>;
export type PurchasingAssignInput = z.infer<typeof purchasingAssignSchema>;
export type PoDispatchInput = z.infer<typeof poDispatchSchema>;
export type PoDecisionInput = z.infer<typeof poDecisionSchema>;
export type PoCancelInput = z.infer<typeof poCancelSchema>;
export type PoSelectSupplierInput = z.infer<typeof poSelectSupplierSchema>;
export type PoReceiptInput = z.infer<typeof poReceiptSchema>;
export type PoDiscrepancyInput = z.infer<typeof poDiscrepancySchema>;
export type PoReturnInput = z.infer<typeof poReturnSchema>;
export type PoInvoiceInput = z.infer<typeof poInvoiceSchema>;
export type PoOverdeliveryAmendmentInput = z.infer<typeof poOverdeliveryAmendmentSchema>;
export type PoShelfLifeRuleInput = z.infer<typeof poShelfLifeRuleSchema>;
export type PoCancelResolutionInput = z.infer<typeof poCancelResolutionSchema>;
export type PurchasingAggregationInput = z.infer<typeof purchasingAggregationSchema>;
