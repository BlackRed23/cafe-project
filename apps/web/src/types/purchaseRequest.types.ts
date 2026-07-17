export type PurchaseRequestStatus =
  | "PENDING"
  | "APPROVED"
  | "SENT"
  | "RECEIVED"
  | "COMPLETED"
  | "REJECTED";

export type PurchaseRequestPaymentStatus = "UNPAID" | "PAID";

export interface PurchaseRequestItem {
  id: string;
  inventoryId: string;
  productId: string;
  productName: string;
  productSku?: string | null;
  categoryName?: string | null;
  quantity: number;
  quantityReceived?: number | null;
  unitPrice?: number | null;
  subtotal?: number | null;
  notes?: string | null;
  purchaseQuantity?: number | null;
  purchaseUnit?: string | null;
  conversionQuantity?: number | null;
  conversionTargetUnit?: string | null;
  convertedQuantity?: number | null;
  inventoryUnit?: string | null;
  conversionMissing?: boolean;
  productPendingDelete?: boolean;
}

export interface PurchaseRequestEmailDraft {
  to: string;
  subject: string;
  body: string;
  status: string;
}

export interface PurchaseRequest {
  id: string;
  requestNumber?: string;
  status: PurchaseRequestStatus;
  reason?: string;
  aiReason?: string;
  ai_reason?: string;
  agentExplanation?: string;
  displayReasoning?: string;
  notes?: string | null;
  aiGenerated?: boolean;
  totalAmount?: number;
  emailContent?: string;
  email_content?: string;
  emailTo?: string;
  emailSubject?: string;
  emailBody?: string;
  emailStatus?: string;
  emailDraft?: PurchaseRequestEmailDraft;
  emailSentAt?: string;
  sentAt?: string;
  supplierEmail?: string;
  retryCount?: number;
  lastEmailError?: string | null;
  receivedAt?: string | null;
  paymentStatus?: PurchaseRequestPaymentStatus;
  paidAt?: string | null;
  paymentNote?: string | null;

  suggestedQuantity?: number;
  suggested_quantity?: number;
  purchaseQuantity?: number | null;
  purchaseUnit?: string | null;
  conversionQuantity?: number | null;
  conversionTargetUnit?: string | null;
  convertedQuantity?: number | null;
  inventoryUnit?: string | null;
  conversionMissing?: boolean;

  items?: PurchaseRequestItem[];

  product?: {
    id: string;
    name: string;
  };
  supplier?: {
    id: string;
    name: string;
    email: string;
    status?: string;
  };
  supplierId?: string;
  requester?: { id: string; name: string; email: string } | null;
  approver?: { id: string; name: string; email: string } | null;
  approvedAt?: string | null;
  createdAt?: string;
  created_at?: string;
  updatedAt?: string;
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
