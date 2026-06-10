import { PurchaseRequestStatus } from '@cafe-project/database';
import { HttpError } from '../../common/http-error';
import { ACTIVE_PURCHASE_REQUEST_MESSAGE, purchaseRepository, type PurchaseRequestRecord } from './purchase.repository';
import type { CreatePurchaseRequestInput, PurchaseRequestFiltersInput, ReceivePurchaseRequestInput, RejectPurchaseRequestInput } from './purchase.validator';

const totalForItem = (quantity: number, unitPrice: number | null): number => quantity * (unitPrice ?? 0);

const toDto = (request: PurchaseRequestRecord) => ({
    id: request.id,
    requestNumber: request.requestNumber,
    status: request.status,
    supplierId: request.supplierId,
    supplier: request.supplier,
    notes: request.notes,
    aiGenerated: request.aiGenerated,
    totalAmount: Number(request.totalAmount),
    requester: request.requester,
    approver: request.approver,
    approvedAt: request.approvedAt,
    emailSentAt: request.emailSentAt,
    emailContent: request.emailContent,
    retryCount: request.retryCount,
    lastEmailError: request.lastEmailError,
    receivedAt: request.receivedAt,
    items: request.items.map((item) => ({
        id: item.id,
        inventoryId: item.inventoryId,
        productId: item.productId,
        productName: item.product.name,
        productSku: item.product.sku,
        categoryName: item.inventory.product.category.name,
        quantity: item.quantity,
        quantityReceived: item.quantityReceived,
        unitPrice: item.unitPrice ? Number(item.unitPrice) : 0,
        subtotal: totalForItem(item.quantity, item.unitPrice ? Number(item.unitPrice) : 0),
        notes: item.notes
    })),
    createdAt: request.createdAt,
    updatedAt: request.updatedAt
});

const ensureRequest = async (id: string): Promise<PurchaseRequestRecord> => {
    const request = await purchaseRepository.findById(id);
    if (!request) throw new HttpError(404, 'Purchase request not found.');
    return request;
};

const ensureNotCompleted = (request: PurchaseRequestRecord): void => {
    if (request.status === PurchaseRequestStatus.COMPLETED) throw new HttpError(400, 'Completed request cannot be modified.');
};

const ensureStatus = (request: PurchaseRequestRecord, expected: PurchaseRequestStatus, message: string): void => {
    ensureNotCompleted(request);
    if (request.status !== expected) throw new HttpError(400, message);
};

const requestNumber = (): string => `PR-${Date.now()}`;

export const purchaseService = {
    async list(filters: PurchaseRequestFiltersInput) { return (await purchaseRepository.findMany(filters)).map(toDto); },
    async get(id: string) { return toDto(await ensureRequest(id)); },
    async create(input: CreatePurchaseRequestInput, userId: string) {
        if (!(await purchaseRepository.supplierExists(input.supplierId))) throw new HttpError(404, 'Supplier not found.');
        for (const item of input.items) {
            if (await purchaseRepository.hasActiveRequestForInventory(item.inventoryId)) {
                throw new HttpError(400, ACTIVE_PURCHASE_REQUEST_MESSAGE);
            }
        }
        try { return toDto(await purchaseRepository.create(input, userId, requestNumber())); }
        catch (error) { throw new HttpError(400, error instanceof Error ? error.message : 'Unable to create purchase request.'); }
    },
    async approve(id: string, userId: string) {
        const request = await ensureRequest(id);
        ensureStatus(request, PurchaseRequestStatus.PENDING, 'Only pending requests can be approved.');
        return toDto(await purchaseRepository.updateStatus(id, {
            status: PurchaseRequestStatus.APPROVED,
            approver: { connect: { id: userId } },
            approvedAt: new Date()
        }));
    },
    async reject(id: string, input: RejectPurchaseRequestInput) {
        const request = await ensureRequest(id);
        ensureStatus(request, PurchaseRequestStatus.PENDING, 'Only pending requests can be rejected.');
        return toDto(await purchaseRepository.updateStatus(id, { status: PurchaseRequestStatus.REJECTED, notes: input.reason }));
    },
    async markSent(id: string) {
        const request = await ensureRequest(id);
        ensureStatus(request, PurchaseRequestStatus.APPROVED, 'Only approved requests can be marked sent.');
        return toDto(await purchaseRepository.updateStatus(id, { status: PurchaseRequestStatus.SENT, emailSentAt: new Date() }));
    },
    async receive(id: string, input: ReceivePurchaseRequestInput, userId: string) {
        const request = await ensureRequest(id);
        ensureStatus(request, PurchaseRequestStatus.SENT, 'Cannot receive before request is sent.');
        try { return toDto(await purchaseRepository.receive(request, input, userId)); }
        catch (error) { throw new HttpError(400, error instanceof Error ? error.message : 'Unable to receive purchase request.'); }
    },
    async complete(id: string) {
        const request = await ensureRequest(id);
        ensureStatus(request, PurchaseRequestStatus.RECEIVED, 'Cannot complete before request is received.');
        return toDto(await purchaseRepository.updateStatus(id, { status: PurchaseRequestStatus.COMPLETED }));
    },
    async delete(id: string) {
        const request = await ensureRequest(id);
        ensureNotCompleted(request);
        return toDto(await purchaseRepository.delete(id));
    }
};
