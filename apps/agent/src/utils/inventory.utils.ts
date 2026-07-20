/**
 * Shared utility for inventory reorder point calculation.
 *
 * Extracted to avoid logic duplication between:
 *   - agentService.scanInventory() — auto-creates PurchaseRequest when stock is low
 *   - recommendationService.generateForProduct() — generates reorder recommendations
 *
 * Both flows must use the SAME formula and constants to ensure consistent
 * "should reorder?" decisions for any given product.
 */

export const DELAY_BUFFER_DAYS = 2;
export const SAFETY_BUFFER_DAYS = 2;
export const DEFAULT_SAFETY_STOCK = 10;

export type ReorderPointResult = {
    baseDailySales: number;
    effectiveLeadTimeDays: number;
    safetyStock: number;
    leadTimeDemand: number;
    reorderPoint: number;
};

/**
 * Calculate the reorder point using the standard formula:
 *   reorderPoint = leadTimeDemand + safetyStock
 *
 * Steps:
 *   baseDailySales    = max(averageDailySales, 1)          — fallback to 1 if no sales history
 *   effectiveLeadTime = leadTimeDays + delayBufferDays      — account for delivery delays
 *   safetyStock       = max(DEFAULT_SAFETY_STOCK, ceil(baseDailySales × bufferDays))
 *   leadTimeDemand    = ceil(baseDailySales × effectiveLeadTime)
 *   reorderPoint      = leadTimeDemand + safetyStock
 *
 * @param averageDailySales  Average units sold per day (use 0 if no history — will fallback to 1)
 * @param leadTimeDays       Supplier lead time in days (0 if no supplier)
 * @param delayBufferDays    Extra buffer for delivery delay uncertainty (default: DELAY_BUFFER_DAYS)
 * @param bufferDays         Safety buffer coverage days (default: SAFETY_BUFFER_DAYS)
 * @param defaultSafetyStock Minimum safety stock floor regardless of velocity (default: DEFAULT_SAFETY_STOCK)
 */
export const calculateReorderPoint = (
    averageDailySales: number,
    leadTimeDays: number,
    delayBufferDays: number = DELAY_BUFFER_DAYS,
    bufferDays: number = SAFETY_BUFFER_DAYS,
    defaultSafetyStock: number = DEFAULT_SAFETY_STOCK
): ReorderPointResult => {
    const baseDailySales = averageDailySales > 0 ? averageDailySales : 1;
    const effectiveLeadTimeDays = leadTimeDays + delayBufferDays;
    const safetyStock = Math.max(defaultSafetyStock, Math.ceil(baseDailySales * bufferDays));
    const leadTimeDemand = Math.ceil(baseDailySales * effectiveLeadTimeDays);
    const reorderPoint = leadTimeDemand + safetyStock;

    return { baseDailySales, effectiveLeadTimeDays, safetyStock, leadTimeDemand, reorderPoint };
};
