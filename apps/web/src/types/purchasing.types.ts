export interface PurchasingOrderItem {
  id: string; purchaseRequestItemId: string; ingredientId: string;
  quantityOrdered: number; quantityReceived: number;
  unit: string; conversionToBase: string; unitPrice: string; currency: string;
}
export interface PurchasingOrder {
  id: string; code: string; status: string; currency: string; supplierId: string;
  supplierName: string; recipientEmail: string | null; purchaseRequestId: string;
  supplier?: {name:string;email:string;status:string};
  items: PurchasingOrderItem[];
  events: Array<{id:string;type:string;actorId:string;createdAt:string;details:unknown}>;
  receipts: Array<{id:string;receivedAt:string;supplierInvoiceNo?:string}>;
  discrepancies: Array<{id:string;category:string;status:string;reason:string;createdAt:string}>;
  supplierReturns: Array<{id:string;goodsReceiptId:string;batchId:string;quantity:string;createdAt:string}>;
  invoices: Array<{id:string;invoiceNumber:string;status:string;differences:unknown;createdAt:string}>;
}
export interface ReceiptLine {
  purchaseOrderItemId: string; receivedQuantity: number;
  batches: Array<{batchCode:string;expirationDate:string;quantity:number}>;
}
export interface PurchasingReceipt {
  requestId:string; supplierInvoiceNo?:string; note?:string; items:ReceiptLine[];
}
export interface PurchasingDiscrepancy {
  requestId:string;purchaseOrderItemId:string;
  category:'OVER_DELIVERY'|'WRONG_INGREDIENT'|'DAMAGED'|'SHELF_LIFE';
  observedIngredientId?:string;observedQuantity:number;acceptedQuantity:number;rejectedQuantity:number;
  reason:string;evidence?:Record<string,unknown>;
}
export interface PurchasingInvoice {
  requestId:string;invoiceNumber:string;currency:string;note?:string;
  items:Array<{purchaseOrderItemId:string;ingredientId?:string;quantity:number;unit:string;unitPrice:number;total:number}>;
}
