import { z } from 'zod';

export const createSupplierSchema = z.object({
    name: z.string().trim().min(1, 'Supplier name is required.').max(255, 'Supplier name must be at most 255 characters.'),
    email: z.string().trim().email('Email is invalid.').optional().nullable().or(z.literal('')),
    phone: z.string().trim().max(50, 'Phone must be at most 50 characters.').optional().nullable(),
    contact: z.string().trim().max(50, 'Contact must be at most 50 characters.').optional().nullable(),
    address: z.string().trim().max(1000, 'Address must be at most 1000 characters.').optional().nullable()
});

export const updateSupplierSchema = createSupplierSchema.partial().refine((data) => Object.keys(data).length > 0, {
    message: 'At least one field is required.'
});

export const createSupplierProductSchema = z.object({
    supplierId: z.string().trim().min(1, 'Supplier is required.'),
    productId: z.string().trim().min(1, 'Product is required.'),
    price: z.coerce.number().min(0, 'Price must be greater than or equal to 0.'),
    supplierSku: z.string().trim().optional().nullable(),
    minOrderQuantity: z.coerce.number().int().min(1, 'Min order quantity must be at least 1.').optional(),
    leadTimeDays: z.coerce.number().int().min(0, 'Lead time days must be greater than or equal to 0.').optional(),
    isPreferred: z.coerce.boolean().optional()
});

export const updateSupplierProductSchema = createSupplierProductSchema.partial().refine((data) => Object.keys(data).length > 0, {
    message: 'At least one field is required.'
});

export type CreateSupplierInput = z.infer<typeof createSupplierSchema>;
export type UpdateSupplierInput = z.infer<typeof updateSupplierSchema>;
export type CreateSupplierProductInput = z.infer<typeof createSupplierProductSchema>;
export type UpdateSupplierProductInput = z.infer<typeof updateSupplierProductSchema>;
