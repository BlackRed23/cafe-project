export type StocktakeStatus = 'DRAFT' | 'PENDING_APPROVAL' | 'NEEDS_INVESTIGATION' | 'COMPLETED' | 'REJECTED';
export type CountReasonCategory = 'COUNTED' | 'DAMAGED' | 'VERIFIED_WASTE' | 'WRONG_LOT' | 'EXPIRED' | 'UNEXPLAINED';
export const countReasons: CountReasonCategory[] = ['COUNTED','DAMAGED','VERIFIED_WASTE','WRONG_LOT','EXPIRED','UNEXPLAINED'];
export interface StocktakeEntry {
  id: string; ingredientId: string; batchId: string; openingQty: string; openingCursor: string;
  openingQualityStatus: string; openingExpirationDate: string | null; presentAtOpen: boolean;
  expectedAtCount: string | null; observedQty: string | null; varianceQty: string | null;
  observedCursor: string | null; countedAt: string | null; countedById: string | null;
  reason: string | null; reasonCategory: CountReasonCategory | null; revision: number;
  history: Array<{ id: string; revision: number; previousQty: string | null; newQty: string; actorId: string; reason: string; createdAt: string }>;
}
export interface StocktakeSession {
  id: string; code: string; status: StocktakeStatus; scope: string[]; createdById: string;
  assignedCounterId: string; approvedById: string | null; approvedAt: string | null;
  rejectedById: string | null; rejectedAt: string | null; rejectedReason: string | null;
  investigationReason: string | null; revision: number; submittedAt: string | null;
  createdAt: string; updatedAt: string; note: string | null;
}
export interface StocktakeData {
  session: StocktakeSession; entries: StocktakeEntry[]; counted: number; uncounted: number;
  current: Array<{ ingredientId: string; cursor: string; physicalQty: string; reservedQty: string;
    batches: Array<{ id: string; batchCode: string; quantityRemaining: string; qualityStatus: string;
      expirationDate: string | null; usable: boolean }> }>;
  untrackedBatches: Array<{ ingredientId: string; batchId: string; quantityRemaining: string }>;
  replayed?: boolean; blockedForInvestigation?: boolean;
}
export interface StocktakeCreate { requestId: string; ingredientIds: string[]; assignedCounterId: string; note?: string }
export interface StocktakeCount { requestId: string; batchId: string; expectedCursor: string; expectedRevision: number;
  actualQty: number; reason: string; reasonCategory: CountReasonCategory }
