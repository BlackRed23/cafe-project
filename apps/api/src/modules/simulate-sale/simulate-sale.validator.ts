import { z } from 'zod';

// Item schema for both legacy and multi-product payloads
const simulateSaleItemSchema = z.object({
  productId: z.string().trim().min(1, 'Product is required.'),
  quantity: z.coerce.number().int('Quantity must be an integer.').positive('Quantity must be greater than 0.'),
});

export const simulateSaleSchema = z
  .object({
    // Legacy fields (optional)
    productId: z.string().trim().min(1).optional(),
    quantity: z.coerce.number().int().positive().optional(),
    // New multi-product field (optional)
    items: z.array(simulateSaleItemSchema).optional(),

    // Additional optional fields used elsewhere
    isPreview: z.boolean().optional(),
    simulationMode: z.enum(['ONE_DAY', 'WEEK', 'MONTH', 'CUSTOM_RANGE']).optional(),
    startDate: z.string().optional().nullable(),
    endDate: z.string().optional().nullable(),
    dailySimulatedQuantity: z.coerce.number().optional(),
    note: z.string().optional().nullable(),
    productCount: z.coerce.number().int().positive().optional(),
    minDecrease: z.coerce.number().int().positive().optional(),
    maxDecrease: z.coerce.number().int().positive().optional(),
  })
  .superRefine((data, ctx) => {
    const hasItems = Array.isArray(data.items) && data.items.length > 0;
    const hasLegacy = Boolean(data.productId) && typeof data.quantity === 'number' && data.quantity > 0;

    if (!hasItems && !hasLegacy) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['items'],
        message: 'Vui lòng chọn ít nhất một sản phẩm để mô phỏng.',
      });
    }

    if (hasItems) {
      const productIds = data.items!.map((i) => i.productId);
      const duplicated = productIds.find((id, idx) => productIds.indexOf(id) !== idx);
      if (duplicated) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['items'],
          message: 'Không được chọn trùng sản phẩm trong cùng một lần mô phỏng.',
        });
      }
    }
  });

export type SimulateSaleInput = z.infer<typeof simulateSaleSchema>;
