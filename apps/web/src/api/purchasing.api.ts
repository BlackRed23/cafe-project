import { apiClient, unwrapApiData } from './client';
import type { PurchasingOrder, PurchasingReceiptContext, PurchasingReceipt, StaffPurchaseReceiptResult, PurchasingDiscrepancy, StaffPurchaseDiscrepancyResult, PurchasingInvoice } from '../types/purchasing.types';
const po=(id:string)=>`/purchase-orders/${encodeURIComponent(id)}`;
const pr=(id:string)=>`/purchase-requests/${encodeURIComponent(id)}`;
const read=<T>(data:unknown):T=>unwrapApiData<T>(data as Parameters<typeof unwrapApiData<T>>[0]);
export const purchasingApi={
  getOrder:async(id:string)=>read<PurchasingOrder>((await apiClient.get(po(id))).data),
  getReceiptContext:async(id:string)=>read<PurchasingReceiptContext>((await apiClient.get(po(id)+'/receipt-context')).data),
  createOrder:async(body:{requestId:string;purchaseRequestId:string;currency:'VND'})=>
    read<{order:PurchasingOrder;replayed:boolean}>((await apiClient.post('/purchase-orders',body)).data),
  dispatch:async(id:string,body:{requestId:string;mode:'SANDBOX'|'UNKNOWN';reason:string})=>
    read<{order:PurchasingOrder;externalDelivery:string;replayed:boolean}>((await apiClient.post(`${po(id)}/dispatch`,body)).data),
  decision:async(id:string,action:'confirm'|'reject',body:{requestId:string;reason:string;evidenceReference:string})=>
    read<{order:PurchasingOrder;externalConfirmation?:string;replayed:boolean}>((await apiClient.post(`${po(id)}/${action}`,body)).data),
  cancellation:async(id:string,action:'cancel'|'request-cancel',body:{requestId:string;reason:string;supplierEvidenceReference?:string})=>
    read<{order:PurchasingOrder;remainingCancellation?:string;replayed:boolean}>((await apiClient.post(`${po(id)}/${action}`,body)).data),
  receipt:async(id:string,body:PurchasingReceipt)=>
    read<{order:PurchasingOrder;replayed:boolean;isStockSafe:boolean}|StaffPurchaseReceiptResult>((await apiClient.post(`${po(id)}/receipts`,body)).data),
  discrepancy:async(id:string,body:PurchasingDiscrepancy)=>
    read<{discrepancy:{id:string;status:string};replayed:boolean}|StaffPurchaseDiscrepancyResult>((await apiClient.post(`${po(id)}/discrepancies`,body)).data),
  supplierReturn:async(id:string,body:{requestId:string;goodsReceiptId:string;batchId:string;quantity:number;reason:string})=>
    read<{supplierReturn:{id:string;quantity:string};supplierCredit:'UNSETTLED';replayed:boolean}>((await apiClient.post(`${po(id)}/returns`,body)).data),
  invoice:async(id:string,body:PurchasingInvoice)=>
    read<{reconciliation:{id:string;status:'MATCHED'|'DISPUTED';differences:unknown};financialApproval:'NOT_GRANTED';replayed:boolean}>((await apiClient.post(`${po(id)}/invoices/reconcile`,body)).data),
  eligibleSuppliers:async(ingredientId:string)=>
    read<{status:string;createPOAllowed:boolean;eligible:Array<{supplierId:string;supplierName:string;purchaseUnit:string;conversionToBase:string}>}>(
      (await apiClient.get(`/purchase-requests/ingredients/${encodeURIComponent(ingredientId)}/eligible-suppliers`)).data),
  sourcingHold:async(body:{requestId:string;ingredientId:string;quantity:number;reason:string;demandSourceKey?:string})=>
    read<{request:{id:string};replayed:boolean}>((await apiClient.post('/purchase-requests/sourcing-holds',body)).data),
  supplierAction:async(id:string,action:'assign-supplier'|'select-supplier',body:{requestId:string;supplierId:string;reason:string})=>
    read<{request:{id:string};replayed:boolean}>((await apiClient.post(`${pr(id)}/${action}`,body)).data),
};
