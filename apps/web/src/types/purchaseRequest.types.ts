export type PurchaseRequestStatus =
  | "PENDING"
  | "APPROVED"
  | "SENT"
  | "RECEIVED"
  | "COMPLETED"
  | "REJECTED";

export interface PurchaseRequest {
  id: string;
  status: PurchaseRequestStatus;
  reason?: string;
  aiReason?: string;
  ai_reason?: string;
  emailContent?: string;
  email_content?: string;
  suggestedQuantity?: number;
  suggested_quantity?: number;
  product?: {
    id: string;
    name: string;
  };
  supplier?: {
    id: string;
    name: string;
    email: string;
  };
  createdAt?: string;
  created_at?: string;
}
