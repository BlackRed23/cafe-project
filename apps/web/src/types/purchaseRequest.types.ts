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
  emailTo?: string;
  emailSubject?: string;
  emailBody?: string;
  emailStatus?: string;
  emailSentAt?: string;
  sentAt?: string;
  supplierEmail?: string;
  retryCount?: number;
  lastEmailError?: string | null;
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

export interface PurchaseRequestEmailPreview {
  to?: string;
  emailTo?: string;
  subject?: string;
  emailSubject?: string;
  body?: string;
  emailBody?: string;
  canSend?: boolean;
  emailStatus?: string;
  retryCount?: number;
  lastEmailError?: string | null;
  sentAt?: string;
  emailSentAt?: string;
}
