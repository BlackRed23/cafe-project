import type { Product } from "../types/product.types";

export const isProductOutOfStock = (product: Product): boolean => {
  const quantity = product.inventory?.quantity ?? 0;
  const isActive = product.isActive !== false && product.is_active !== false;
  return !isActive || quantity <= 0;
};

export const sortProductsInStockFirst = (products: Product[]): Product[] => {
  return [...products].sort((a, b) => {
    const aOut = isProductOutOfStock(a);
    const bOut = isProductOutOfStock(b);
    if (aOut === bOut) return 0;
    return aOut ? 1 : -1;
  });
};
