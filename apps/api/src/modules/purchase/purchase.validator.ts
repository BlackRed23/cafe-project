import { PurchaseRequestStatus } from '@cafe-project/database';
import { z } from 'zod';

export const createPurchaseRequestSchema = z.object({
    supplierId: z.string().trim().min(1, 'Supplier is required.'),
    notes: z.string().trim().max(1000, 'Notes must be at most 1000 characters.').optional().nullable(),
    aiGenerated: z.coerce.boolean().optional().default(false),
    items: z.array(z.object({
        inventoryId: z.string().trim().min(1, 'Inventory is required.'),
        quantity: z.coerce.number().int('Quantity must be an integer.').positive('Quantity must be greater than 0.'),
        unitPrice: z.coerce.number().min(0, 'Unit price must be greater than or equal to 0.').optional().nullable(),
        notes: z.string().trim().max(1000, 'Item notes must be at most 1000 characters.').optional().nullable()
    })).min(1, 'Items cannot be empty.')
});

export const rejectPurchaseRequestSchema = z.object({
    reason: z.string().trim().min(1, 'Reject reason is required.').max(1000, 'Reason must be at most 1000 characters.')
});

export const receivePurchaseRequestSchema = z.object({
    note: z.string().trim().max(1000, 'Note must be at most 1000 characters.').optional().nullable(),
    items: z.array(z.object({
        purchaseRequestItemId: z.string().trim().min(1, 'Purchase request item is required.'),
        receivedQuantity: z.coerce.number().int('Received quantity must be an integer.').min(0, 'Received quantity must be greater than or equal to 0.')
    })).min(1, 'Receive items cannot be empty.')
});

export const markPurchaseRequestPaidSchema = z.object({
    paymentNote: z.string().trim().max(1000, 'Payment note must be at most 1000 characters.').optional().nullable()
});

export const purchaseRequestFiltersSchema = z.object({
    status: z.nativeEnum(PurchaseRequestStatus).optional(),
    supplierId: z.string().trim().optional(),
    aiGenerated: z.coerce.boolean().optional()
});

export type CreatePurchaseRequestInput = z.infer<typeof createPurchaseRequestSchema>;
export type RejectPurchaseRequestInput = z.infer<typeof rejectPurchaseRequestSchema>;
export type ReceivePurchaseRequestInput = z.infer<typeof receivePurchaseRequestSchema>;
export type MarkPurchaseRequestPaidInput = z.infer<typeof markPurchaseRequestPaidSchema>;
export type PurchaseRequestFiltersInput = z.infer<typeof purchaseRequestFiltersSchema>;
