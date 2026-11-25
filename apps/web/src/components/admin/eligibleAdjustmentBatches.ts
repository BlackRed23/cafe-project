import type { Inventory } from "../../types/inventory.types";

export const eligibleAdjustmentBatches = (inventory: Inventory, now = Date.now()) =>
  (inventory.batches ?? []).filter(batch => Number.isFinite(Date.parse(batch.expirationDate)) && Date.parse(batch.expirationDate) > now && batch.quantity >= 0);
