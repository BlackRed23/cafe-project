import { z } from 'zod';
import { ALLOWED_PRODUCT_UNITS } from '../../common/units';

// unitSchema excludes 'ly' by design — only units in ALLOWED_PRODUCT_UNITS are accepted.
// ALLOWED_PRODUCT_UNITS = ['gói', 'hộp', 'thùng', 'bao', 'kg', 'gram', 'chai']
const unitSchema = z.enum(ALLOWED_PRODUCT_UNITS, {
    message: 'Unit is not supported.'
});

// ─── Supplier ────────────────────────────────────────────────────────────────

// Base object schema WITHOUT any .refine() / .superRefine() so that .partial()
// can be safely called on it later.
const supplierBaseSchema = z.object({
    name: z
        .string()
        .trim()
        .min(1, 'Supplier name is required.')
        .max(255, 'Supplier name must be at most 255 characters.'),
    email: z
        .string()
        .trim()
        .email('Email is invalid.')
        .optional()
        .nullable()
        .or(z.literal('')),
    phone: z.string().trim().max(50, 'Phone must be at most 50 characters.').optional().nullable(),
    contact: z
        .string()
        .trim()
        .max(50, 'Contact must be at most 50 characters.')
        .optional()
        .nullable(),
    address: z
        .string()
        .trim()
        .max(1000, 'Address must be at most 1000 characters.')
        .optional()
        .nullable()
});

// create: no extra refinements needed beyond field-level validation
export const createSupplierSchema = supplierBaseSchema;

// update: .partial() is called on the base (refine-free) schema, THEN we refine
export const updateSupplierSchema = supplierBaseSchema
    .partial()
    .refine((data) => Object.keys(data).length > 0, {
        message: 'At least one field is required.'
    });

// ─── Supplier Product ─────────────────────────────────────────────────────────

// Base object schema WITHOUT any .refine() / .superRefine().
// This lets us safely call .partial() for the update schema.
const supplierProductBaseSchema = z.object({
    supplierId: z.string().trim().min(1, 'Supplier is required.'),
    productId: z.string().trim().min(1, 'Product is required.'),
    price: z.coerce.number().min(0, 'Price must be greater than or equal to 0.'),
    supplierSku: z.string().trim().optional().nullable(),
    minOrderQuantity: z.coerce
        .number()
        .int()
        .min(1, 'Min order quantity must be at least 1.')
        .optional(),
    leadTimeDays: z.coerce
        .number()
        .int()
        .min(0, 'Lead time days must be greater than or equal to 0.')
        .optional(),
    isPreferred: z.coerce.boolean().optional(),
    // Conversion spec fields — all three must be provided together or all omitted.
    // 'ly' is not in ALLOWED_PRODUCT_UNITS so it is rejected automatically.
    purchaseUnit: unitSchema.optional().nullable(),
    conversionQuantity: z.coerce
        .number()
        .positive('Conversion quantity must be greater than 0.')
        .optional()
        .nullable(),
    conversionTargetUnit: unitSchema.optional().nullable()
});

// Shared refinement: if any conversion field is set, all three must be set.
const validateConversionFields = (
    data: {
        purchaseUnit?: string | null;
        conversionQuantity?: number | null;
        conversionTargetUnit?: string | null;
    },
    ctx: z.RefinementCtx
) => {
    const hasAny = Boolean(
        data.purchaseUnit || data.conversionQuantity || data.conversionTargetUnit
    );
    const hasAll = Boolean(
        data.purchaseUnit && data.conversionQuantity && data.conversionTargetUnit
    );

    if (hasAny && !hasAll) {
        ctx.addIssue({
            code: 'custom',
            message:
                'Nếu nhập quy cách, vui lòng nhập đủ đơn vị nhập hàng, số lượng quy đổi và đơn vị tồn kho nhận được.',
            path: ['conversionQuantity']
        });
    }
};

// create: base schema + conversion refinement
// .superRefine() is applied AFTER the base object is defined — NOT before .partial()
export const createSupplierProductSchema = supplierProductBaseSchema.superRefine(
    validateConversionFields
);

// update: .partial() is called on the base (refine-free) schema, THEN we superRefine
// This avoids the ZodError: ".partial() cannot be used on object schemas containing refinements"
const supplierProductPartialSchema = supplierProductBaseSchema.partial();

export const updateSupplierProductSchema = supplierProductPartialSchema
    .superRefine(validateConversionFields)
    .refine((data) => Object.keys(data).length > 0, {
        message: 'At least one field is required.'
    });

// ─── Inferred types ──────────────────────────────────────────────────────────

export type CreateSupplierInput = z.infer<typeof createSupplierSchema>;
export type UpdateSupplierInput = z.infer<typeof updateSupplierSchema>;
export type CreateSupplierProductInput = z.infer<typeof createSupplierProductSchema>;
export type UpdateSupplierProductInput = z.infer<typeof updateSupplierProductSchema>;
