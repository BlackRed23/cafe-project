export const ALLOWED_PRODUCT_UNITS = ['gói', 'hộp', 'thùng', 'bao', 'kg', 'gram', 'chai'] as const;

export type ProductUnit = (typeof ALLOWED_PRODUCT_UNITS)[number];

export const isAllowedProductUnit = (unit: string | null | undefined): unit is ProductUnit =>
    Boolean(unit && ALLOWED_PRODUCT_UNITS.includes(unit as ProductUnit));
