
export type IngredientBatchStatus =
  | "DEPLETED"
  | "EXPIRED"
  | "EXPIRING_SOON"
  | "UNEXPIRED"
  | "UNKNOWN_EXPIRY";

export interface IngredientBatch {
  id: string;
  ingredientId: string;

  ingredient: {
    id: string;
    name: string;
    baseUnit: string;
  };

  batchCode: string;

  quantityInitial: number;
  quantityRemaining: number;
  unitCost: number;

  expirationDate: string | null;
  receivedAt: string;

  derivedStatus: IngredientBatchStatus;
  expirationEligible: boolean;
}

export interface IngredientBatchQuery {
  ingredientId?: string;
  status?: IngredientBatchStatus;
  days?: number;
}

export interface ExpiringBatchQuery {
  days?: number;
}

export interface ApiEnvelope<T> {
  success: boolean;
  message: string;
  data: T | null;
}


/**
 * Compatibility alias for the existing Admin Ingredient Batches page.
 */
export type IngredientBatchRecord = IngredientBatch;

/**
 * Fields currently used by the batch transaction UI.
 * Optional fields require verification against the Backend DTO.
 */
export interface IngredientBatchTransaction {
  id: string;
  batchId?: string | null;
  type?: string;
  quantity?: number;
  unitCost?: number;
  totalCost?: number;
  reason?: string | null;
  performedBy?: string | null;
  createdAt?: string;
}

export type LotExpiry = 'VALID' | 'NEAR_EXPIRY' | 'EXPIRED' | 'NO_EXPIRY';
export type LotQuality = 'AVAILABLE' | 'QUARANTINED' | 'RECALLED' | 'UNKNOWN';
export type StockNumber = number | string;
export interface LotBatch {
  id: string; ingredientId: string; batchCode: string;
  quantityInitial: StockNumber; quantityRemaining: StockNumber; unitCost: StockNumber;
  physicalQuantity: number; usableQuantity: number;
  expirationDate: string | null; receivedAt: string;
  qualityStatus: LotQuality | string; expiryStatus: LotExpiry | string;
  depletionStatus: 'DEPLETED' | 'REMAINING';
}
export interface LotList {
  evaluatedAt: string; warningDays: number;
  ingredient: { id: string; physicalQuantity: number; reservedQuantity: number; usableQuantity: number; availableQuantity: number };
  batches: LotBatch[];
}
export interface LotEvent {
  id: string; batchId: string; requestId: string; action: string;
  previousStatus: string; newStatus: string; reason: string; actorId: string; createdAt: string;
}
export interface LotOutbound {
  id: string; batchId: string | null; ingredientId: string | null; type: string;
  quantity: StockNumber; unitCost: StockNumber; createdAt: string;
  reason: string | null; referenceId: string | null; referenceType: string | null; orderItemId: string | null;
}
export interface LotReturn {
  id: string; requestId: string; sourceTransactionId: string; sourceBatchId: string;
  targetBatchId: string; transactionId: string; quantity: StockNumber;
  quality: string; disposition: 'QUARANTINED'; actorId: string; reason: string; createdAt: string;
}
export type RawLotBatch = Omit<LotBatch, 'physicalQuantity' | 'usableQuantity' | 'expiryStatus' | 'depletionStatus'>;
export interface LotTrace {
  batch: RawLotBatch; events: LotEvent[]; outbound: LotOutbound[];
  orders: { id: string; status: string; stockDeductedAt: string | null }[];
  orderItems: { id: string; orderId: string }[]; returns: LotReturn[];
}
export interface LotTransitionPayload { requestId: string; reason: string }
export interface LotReturnPayload extends LotTransitionPayload {
  sourceTransactionId: string; batchId: string; quantity: number; quality: 'UNKNOWN' | 'UNSAFE' | 'SAFE';
}
export interface LotTransitionResult { batch: RawLotBatch; event: LotEvent; replayed: boolean }
export interface LotReturnResult { return: LotReturn; replayed: boolean; releaseToUsable: 'NOT_VERIFIED' }
