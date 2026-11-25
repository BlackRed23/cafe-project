import type { Response } from 'express';
import { sendError, sendSuccess } from '../../common/response';
import type { AuthenticatedRequest } from '../auth/auth.middleware';
import { purchaseService } from './purchase.service';
import type { CreatePurchaseRequestInput, MarkPurchaseRequestPaidInput, PurchaseRequestFiltersInput, ReceivePurchaseRequestInput, RejectPurchaseRequestInput } from './purchase.validator';

type PurchaseRequestDto = Awaited<ReturnType<typeof purchaseService.get>>;

const staffPurchaseRequest = (request: PurchaseRequestDto) => ({
    id: request.id,
    requestNumber: request.requestNumber,
    status: request.status,
    supplierId: request.supplierId,
    supplier: request.supplier ? {
        id: request.supplier.id,
        name: request.supplier.name,
        status: request.supplier.status
    } : null,
    aiGenerated: request.aiGenerated,
    totalAmount: request.totalAmount,
    emailSentAt: request.emailSentAt,
    emailDraft: { status: request.emailDraft.status },
    receivedAt: request.receivedAt,
    paymentStatus: request.paymentStatus,
    createdAt: request.createdAt,
    updatedAt: request.updatedAt,
    items: request.items.map(item => ({
        id: item.id,
        inventoryId: item.inventoryId,
        ingredientId: item.ingredientId,
        productId: item.productId,
        productName: item.productName,
        productSku: item.productSku,
        categoryName: item.categoryName,
        quantity: item.quantity,
        quantityReceived: item.quantityReceived,
        unitPrice: item.unitPrice,
        subtotal: item.subtotal,
        productPendingDelete: item.productPendingDelete,
        purchaseQuantity: item.purchaseQuantity,
        purchaseUnit: item.purchaseUnit,
        conversionQuantity: item.conversionQuantity,
        conversionTargetUnit: item.conversionTargetUnit,
        convertedQuantity: item.convertedQuantity,
        inventoryUnit: item.inventoryUnit,
        conversionMissing: item.conversionMissing
    }))
});

export const listPurchaseRequests = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    const requests = await purchaseService.list(req.query as PurchaseRequestFiltersInput);
    sendSuccess(res, 200, 'Get purchase requests successfully.', {
        purchaseRequests: req.user?.role === 'ADMIN' ? requests : requests.map(staffPurchaseRequest)
    });
};
export const findPurchaseRequest = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    const request = await purchaseService.get(req.params.id);
    sendSuccess(res, 200, 'Get purchase request successfully.', {
        purchaseRequest: req.user?.role === 'ADMIN' ? request : staffPurchaseRequest(request)
    });
};
export const storePurchaseRequest = async (req: AuthenticatedRequest, res: Response): Promise<void> => { if (!req.user) return sendError(res, 401, 'Authentication is required.'); sendSuccess(res, 201, 'Create purchase request successfully.', { purchaseRequest: await purchaseService.create(req.body as CreatePurchaseRequestInput, req.user.id) }); };
export const approvePurchaseRequest = async (req: AuthenticatedRequest, res: Response): Promise<void> => { if (!req.user) return sendError(res, 401, 'Authentication is required.'); sendSuccess(res, 200, 'Approve purchase request successfully.', { purchaseRequest: await purchaseService.approve(req.params.id, req.user.id) }); };
export const rejectPurchaseRequest = async (req: AuthenticatedRequest, res: Response): Promise<void> => { if (!req.user) return sendError(res, 401, 'Authentication is required.'); sendSuccess(res, 200, 'Reject purchase request successfully.', { purchaseRequest: await purchaseService.reject(req.params.id, req.body as RejectPurchaseRequestInput, req.user.id) }); };
export const markPurchaseRequestSent = async (req: AuthenticatedRequest, res: Response): Promise<void> => sendSuccess(res, 200, 'Mark purchase request sent successfully.', { purchaseRequest: await purchaseService.markSent(req.params.id) });
export const receivePurchaseRequest = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    if (!req.user) return sendError(res, 401, 'Authentication is required.');
    const result = await purchaseService.receive(req.params.id, req.body as ReceivePurchaseRequestInput, req.user.id);
    sendSuccess(res, 200, 'Receive purchase request successfully.', req.user.role === 'ADMIN' ? result : {
        purchaseRequest: staffPurchaseRequest(result.purchaseRequest),
        isStockSafe: result.isStockSafe,
        replayed: result.replayed
    });
};
export const markPurchaseRequestPaid = async (req: AuthenticatedRequest, res: Response): Promise<void> => sendSuccess(res, 200, 'Mark purchase request paid successfully.', { purchaseRequest: await purchaseService.markPaid(req.params.id, req.body as MarkPurchaseRequestPaidInput) });
export const completePurchaseRequest = async (req: AuthenticatedRequest, res: Response): Promise<void> => sendSuccess(res, 200, 'Complete purchase request successfully.', { purchaseRequest: await purchaseService.complete(req.params.id) });
export const removePurchaseRequest = async (req: AuthenticatedRequest, res: Response): Promise<void> => sendSuccess(res, 200, 'Delete purchase request successfully.', { purchaseRequest: await purchaseService.delete(req.params.id) });
