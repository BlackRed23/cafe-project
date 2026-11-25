import { prisma } from '@cafe-project/database';
import { HttpError } from '../../common/http-error';

type ReceiptActor = { id: string; role: string };

/** A deliberately minimal, allowlisted projection: never expose full PO records to STAFF. */
export const purchaseReceiptContextService = {
    async get(orderId: string, actor: ReceiptActor) {
        if (!['ADMIN', 'STAFF'].includes(actor.role)) {
            throw new HttpError(403, 'Không đủ quyền xem thông tin nhận hàng.');
        }
        const order = await prisma.purchaseOrder.findUnique({
            where: { id: orderId },
            select: {
                id: true,
                status: true,
                items: {
                    select: {
                        id: true,
                        ingredientId: true,
                        quantityOrdered: true,
                        quantityReceived: true,
                        unit: true,
                        conversionToBase: true
                    }
                }
            }
        });
        if (!order) throw new HttpError(404, 'Không tìm thấy PO.');

        // Reconciliation IDs are restricted to the current actor and this PO.
        // Never disclose receipt/invoice content or another operator's request UUIDs.
        const [ownReceipts, ownDiscrepancies] = await Promise.all([
            prisma.goodsReceipt.findMany({
                where: { purchaseOrderId: order.id, receivedBy: actor.id, idempotencyKey: { not: null } },
                select: { idempotencyKey: true },
                take: 100,
                orderBy: { receivedAt: 'desc' }
            }),
            prisma.purchaseDeliveryDiscrepancy.findMany({
                where: { purchaseOrderId: order.id, actorId: actor.id },
                select: { requestId: true },
                take: 100,
                orderBy: { createdAt: 'desc' }
            })
        ]);

        return {
            orderId: order.id,
            status: order.status,
            canReceive: ['CONFIRMED', 'PARTIALLY_RECEIVED'].includes(order.status),
            receiptRequestIds: ownReceipts.flatMap(row => row.idempotencyKey ? [row.idempotencyKey] : []),
            discrepancyRequestIds: ownDiscrepancies.map(row => row.requestId),
            items: order.items.map(item => ({
                purchaseOrderItemId: item.id,
                ingredientId: item.ingredientId,
                quantityOrdered: item.quantityOrdered,
                quantityReceived: item.quantityReceived,
                remainingQuantity: Math.max(0, item.quantityOrdered - item.quantityReceived),
                unit: item.unit,
                conversionToBase: item.conversionToBase.toString()
            })),
            receiptRequirements: {
                requestId: 'UUID',
                items: ['purchaseOrderItemId', 'receivedQuantity', 'batches'],
                batches: ['batchCode', 'expirationDate', 'quantity'],
                expirationDateFormat: 'ISO_8601_WITH_TIMEZONE',
                batchQuantityMustEqualReceived: true
            },
            discrepancyRequirements: {
                requestId: 'UUID',
                categories: ['OVER_DELIVERY', 'WRONG_INGREDIENT', 'DAMAGED', 'SHELF_LIFE'],
                observedQuantityMustEqualAcceptedPlusRejected: true
            }
        };
    }
};

/** Redact the rich write DTO for STAFF. Never serialize order, PR, receipt notes or invoices. */
export const staffReceiptResult = (
    result: Awaited<ReturnType<typeof import('./purchase-order.service').purchaseOrderService.receive>>,
    requestId: string,
    actorId: string
) => {
    const ownReceipt = result.order.receipts.find(row =>
        row.idempotencyKey === requestId && row.receivedBy === actorId);
    return {
        orderId: result.order.id,
        status: result.order.status,
        receiptId: ownReceipt?.id ?? null,
        receiptRequestId: requestId,
        replayed: result.replayed,
        isStockSafe: result.isStockSafe,
        items: result.order.items.map(item => ({
            purchaseOrderItemId: item.id,
            ingredientId: item.ingredientId,
            quantityOrdered: item.quantityOrdered,
            quantityReceived: item.quantityReceived,
            remainingQuantity: Math.max(0, item.quantityOrdered - item.quantityReceived),
            unit: item.unit
        }))
    };
};

export const staffDiscrepancyResult = (
    result: Awaited<ReturnType<typeof import('./purchase-order.service').purchaseOrderService.discrepancy>>,
    requestId: string
) => ({
    discrepancyId: result.discrepancy.id,
    discrepancyRequestId: requestId,
    status: result.discrepancy.status,
    purchaseOrderItemId: result.discrepancy.purchaseOrderItemId,
    observedQuantity: result.discrepancy.observedQuantity.toString(),
    acceptedQuantity: result.discrepancy.acceptedQuantity.toString(),
    rejectedQuantity: result.discrepancy.rejectedQuantity.toString(),
    replayed: result.replayed
});
