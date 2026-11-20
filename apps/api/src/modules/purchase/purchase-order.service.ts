import { createHash, randomUUID } from 'node:crypto';
import { Prisma, prisma } from '@cafe-project/database';
import { HttpError } from '../../common/http-error';
import { isIngredientBatchUsable } from '../../common/ingredient-batch-availability';
import { purchaseService } from './purchase.service';
import type {
    PoCreateInput, PoDispatchInput, PoDecisionInput, PoCancelInput,
    PoSelectSupplierInput, PoReceiptInput, PoDiscrepancyInput, PoReturnInput, PoInvoiceInput,
    PurchasingHoldInput, PurchasingAssignInput, PoOverdeliveryAmendmentInput,
    PoShelfLifeRuleInput, PoCancelResolutionInput, PurchasingAggregationInput
} from './purchase-order.validator';

type DB = Prisma.TransactionClient;
type Actor = { id: string; role: string };
const zero = new Prisma.Decimal(0);
const hash = (v: unknown) => createHash('sha256').update(JSON.stringify(v)).digest('hex');
const onlyAdmin = (actor: Actor) => {
    if (actor.role !== 'ADMIN') throw new HttpError(403, 'Chỉ ADMIN được quyết định mua hàng.');
};
const lockRequest = async (tx: DB, id: string) => {
    const rows = await tx.$queryRaw<Array<{ id: string }>>`SELECT "id" FROM "PurchaseRequest" WHERE "id"=${id} FOR UPDATE`;
    if (rows.length !== 1) throw new HttpError(404, 'Không tìm thấy yêu cầu nhập hàng.');
};
const lockOrder = async (tx: DB, id: string) => {
    const rows = await tx.$queryRaw<Array<{ id: string }>>`SELECT "id" FROM "PurchaseOrder" WHERE "id"=${id} FOR UPDATE`;
    if (rows.length !== 1) throw new HttpError(404, 'Không tìm thấy PO.');
};
const include = { items: true, events: { orderBy: { createdAt: 'asc' as const } },
    supplier: { select: { id: true, name: true, email: true, status: true, deletedAt: true } },
    receipts: { orderBy: { receivedAt: 'asc' as const } },
    discrepancies: { orderBy: { createdAt: 'asc' as const } },
    supplierReturns: { orderBy: { createdAt: 'asc' as const } },
    invoices: { orderBy: { createdAt: 'asc' as const } },
    dispatchAttempts: { orderBy: { attemptNumber: 'asc' as const } },
    supplierEvidence: { orderBy: { recordedAt: 'asc' as const } },
    overdeliveryAmendments: { orderBy: { createdAt: 'asc' as const } } } as const;
const detail = async (tx: DB, id: string) =>
    tx.purchaseOrder.findUniqueOrThrow({ where: { id }, include });
const demand = async (tx: DB, id: string) =>
    tx.purchaseRequest.findUniqueOrThrow({ where: { id },
        include: { items: true, supplier: { include: { ingredients: true } } } });
const orderTransaction = async <T>(id: string, job: (tx: DB, order: Awaited<ReturnType<typeof detail>>) => Promise<T>): Promise<T> =>
    prisma.$transaction(async tx => {
        const found = await tx.purchaseOrder.findUnique({ where: { id }, select: { purchaseRequestId: true } });
        if (!found) throw new HttpError(404, 'Không tìm thấy PO.');
        await lockRequest(tx, found.purchaseRequestId);
        await lockOrder(tx, id);
        return job(tx, await detail(tx, id));
    }, { timeout: 20000 });
const event = async (tx: DB, orderId: string, requestId: string, type: string, actor: Actor, payload: unknown,
    details: Prisma.InputJsonValue) => {
    const existing = await tx.purchaseOrderEvent.findUnique({ where: { requestId } });
    if (existing) {
        if (existing.purchaseOrderId !== orderId || existing.type !== type ||
            existing.actorId !== actor.id || existing.payloadHash !== hash(payload))
            throw new HttpError(409, 'requestId đã sử dụng cho hành động/nội dung khác.');
        return true;
    }
    await tx.purchaseOrderEvent.create({ data: {
        purchaseOrderId: orderId, requestId, type, actorId: actor.id, payloadHash: hash(payload), details
    } });
    return false;
};
const eligibleSupplier = async (tx: DB, supplierId: string, ingredientIds: string[]) => {
    const supplier = await tx.supplier.findFirst({ where: { id: supplierId, status: 'ACTIVE', deletedAt: null },
        include: { ingredients: { where: { ingredientId: { in: ingredientIds } } } } });
    if (!supplier) throw new HttpError(409, 'Không có nhà cung cấp đang hoạt động.');
    if (ingredientIds.some(id => !supplier.ingredients.some(row => row.ingredientId === id &&
        row.conversionQuantity.gt(0) && row.conversionTargetUnit.length > 0))) {
        throw new HttpError(409, 'Nhà cung cấp chưa có quy cách hợp lệ cho nguyên liệu được đặt.');
    }
    const ingredients = await tx.ingredient.findMany({ where: { id: { in: ingredientIds }, isActive: true, deletedAt: null } });
    if (ingredients.length !== ingredientIds.length || ingredients.some(i => {
        const link = supplier.ingredients.find(x => x.ingredientId === i.id)!;
        return link.conversionTargetUnit !== i.baseUnit;
    })) throw new HttpError(409, 'Quy cách cung ứng không đúng đơn vị cơ sở nguyên liệu.');
    return supplier;
};
const evidenceAt = (poCreated: Date, input: PoDecisionInput | PoCancelResolutionInput): Date => {
    const observed = input.observedAt ? new Date(input.observedAt) : new Date();
    if (!Number.isFinite(observed.getTime()) ||
        observed.getTime() < poCreated.getTime() - 1000 ||
        observed.getTime() > Date.now() + 5 * 60 * 1000)
        throw new HttpError(409, 'Bằng chứng không thuộc thời điểm hợp lệ của PO (stale/future).');
    return observed;
};
const captureSupplierEvidence = async (tx: DB, po: Awaited<ReturnType<typeof detail>>,
    input: PoDecisionInput, actor: Actor, decision: string) => {
    if (input.source === 'SUPPLIER_DOCUMENT' && !input.sourceIdentity)
        throw new HttpError(409, 'Tài liệu nhà cung cấp cần xác định danh tính nguồn.');
    const observed = evidenceAt(po.createdAt, input);
    const sourceIdentity = input.sourceIdentity ?? 'ADMIN:' + actor.id;
    const fingerprint = hash({ supplierId: po.supplierId, sourceIdentity: sourceIdentity.trim().toLowerCase(),
        evidenceReference: input.evidenceReference.trim().toLowerCase(), decision });
    await tx.purchaseSupplierEvidence.create({ data: {
        requestId: input.requestId, evidenceFingerprint: fingerprint, purchaseOrderId: po.id, decision,
        source: input.source, sourceIdentity, evidenceReference: input.evidenceReference,
        observedAt: observed, actorId: actor.id, verificationStatus: 'NOT_VERIFIED_EXTERNAL'
    } });
    return { source: input.source, sourceIdentity, observedAt: observed.toISOString(),
        evidenceFingerprint: fingerprint, externalProviderVerified: false };
};

export const purchaseOrderService = {
    async createSourcingHold(input: PurchasingHoldInput, actor: Actor) {
        if (!['ADMIN','STAFF'].includes(actor.role)) throw new HttpError(403, 'Không đủ quyền đề nghị nhập hàng.');
        const source = input.demandSourceKey ?? 'supplier-hold:' + input.requestId;
        return prisma.$transaction(async tx => {
            await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext(${'purchasing-demand:' + input.ingredientId}))::text`;
            const prior = await tx.purchaseRequest.findUnique({ where: { demandSourceKey: source }, include: { items: true } });
            if (prior) {
                if (prior.requestedBy !== actor.id || prior.demandHash !== hash(input))
                    throw new HttpError(409, 'Nguồn nhu cầu đã sử dụng với nội dung khác.');
                return { request: prior, replayed: true };
            }
            const ingredient = await tx.ingredient.findFirst({ where: {
                id: input.ingredientId, isActive: true, deletedAt: null
            } });
            if (!ingredient) throw new HttpError(404, 'Không tìm thấy nguyên liệu cần mua.');
            const available = await tx.supplierIngredient.findFirst({ where: {
                ingredientId: input.ingredientId, supplier: { status: 'ACTIVE', deletedAt: null },
                conversionTargetUnit: ingredient.baseUnit, conversionQuantity: { gt: 0 }
            } });
            if (available) throw new HttpError(409, 'Đã có nhà cung cấp hợp lệ; tạo Purchase Request theo luồng thường.');
            // A distinct source retains its own demand identity. Aggregation requires
            // an explicit ADMIN action; different source keys never silently merge.
            return { request: await tx.purchaseRequest.create({ data: {
                requestNumber: 'PR-HOLD-' + randomUUID(), status: 'PENDING',
                requestedBy: actor.id, supplierId: null, notes: input.reason,
                supplierHoldReason: 'NO_ELIGIBLE_SUPPLIER', demandSourceKey: source,
                demandHash: hash(input), items: { create: [{
                    ingredientId: ingredient.id, quantity: input.quantity,
                    unitPrice: null, notes: input.reason
                }] }
            }, include: { items: true } }), replayed: false };
        }, { timeout: 20000 });
    },

    async assignSupplier(id: string, input: PurchasingAssignInput, actor: Actor) {
        onlyAdmin(actor);
        return prisma.$transaction(async tx => {
            await lockRequest(tx, id);
            const r = await demand(tx, id);
            if (r.supplierAssignmentRequestId) {
                if (r.supplierAssignmentRequestId !== input.requestId ||
                    r.supplierAssignmentHash !== hash(input)) throw new HttpError(409, 'Đã chọn nhà cung cấp cho phiếu này.');
                return { request: r, replayed: true };
            }
            if (r.status !== 'PENDING' || r.supplierId !== null ||
                r.supplierHoldReason !== 'NO_ELIGIBLE_SUPPLIER') {
                throw new HttpError(409, 'Chỉ phân công nhà cung cấp cho yêu cầu đang chờ bổ sung.');
            }
            const ingredientIds = r.items.flatMap(i => i.ingredientId ? [i.ingredientId] : []);
            const supplier = await eligibleSupplier(tx, input.supplierId, ingredientIds);
            let total = zero;
            for (const item of r.items) {
                const mapping = supplier.ingredients.find(m => m.ingredientId === item.ingredientId);
                if (!mapping) throw new HttpError(409, 'Thiếu quy cách nhà cung cấp.');
                const unitPrice = mapping.pricePerBaseUnit.mul(mapping.conversionQuantity).toDecimalPlaces(2);
                await tx.purchaseRequestItem.update({ where: { id: item.id }, data: { unitPrice } });
                total = total.add(unitPrice.mul(item.quantity));
            }
            return { request: await tx.purchaseRequest.update({ where: { id },
                data: { supplierId: supplier.id, supplierHoldReason: null, supplierAssignedById: actor.id,
                    supplierAssignedAt: new Date(), supplierAssignmentRequestId: input.requestId,
                    supplierAssignmentHash: hash(input), totalAmount: total },
                include: { items: true, supplier: true } }), replayed: false };
        }, { timeout: 20000 });
    },
    async get(id: string, actor: Actor) {
        onlyAdmin(actor);
        return prisma.$transaction(tx => detail(tx, id));
    },

    async create(input: PoCreateInput, actor: Actor) {
        onlyAdmin(actor);
        return prisma.$transaction(async tx => {
            await lockRequest(tx, input.purchaseRequestId);
            const r = await demand(tx, input.purchaseRequestId);
            if (r.status !== 'APPROVED' || !r.approvedBy || !r.approvedAt)
                throw new HttpError(409, 'Chỉ tạo PO khi Purchase Request đã được ADMIN phê duyệt.');
            const replay = await tx.purchaseOrderEvent.findUnique({ where: { requestId: input.requestId } });
            if (replay) {
                if (replay.type !== 'CREATED' || replay.actorId !== actor.id ||
                    replay.payloadHash !== hash(input)) throw new HttpError(409, 'requestId đã dùng cho nội dung khác.');
                return { order: await detail(tx, replay.purchaseOrderId), replayed: true };
            }
            const existing = await tx.purchaseOrder.findMany({ where: { purchaseRequestId: r.id },
                orderBy: { createdAt: 'desc' }, include: { items: true } });
            if (existing.some(po => !['REJECTED', 'CANCELLED'].includes(po.status)))
                throw new HttpError(409, 'Đã có PO đang xử lý cho yêu cầu này.');
            const ids = [...new Set(r.items.flatMap(i => i.ingredientId ? [i.ingredientId] : []))];
            if (!r.supplierId) throw new HttpError(409, 'Phải chọn nhà cung cấp trước khi tạo PO.');
            const supplier = await eligibleSupplier(tx, r.supplierId, ids);
            const poItems = r.items.map(item => {
                const remaining = item.quantity - item.quantityReceived;
                if (remaining <= 0) throw new HttpError(409, 'Yêu cầu không còn số lượng cần đặt.');
                const mapping = supplier.ingredients.find(m => m.ingredientId === item.ingredientId);
                if (item.ingredientId && !mapping) throw new HttpError(409, 'Nhà cung cấp không hỗ trợ nguyên liệu.');
                if (!item.ingredientId) throw new HttpError(409, 'PO mới hỗ trợ yêu cầu nguyên liệu; Inventory legacy dùng luồng cũ.');
                return {
                    purchaseRequestItemId: item.id, ingredientId: item.ingredientId,
                    quantityOrdered: remaining, unit: mapping!.purchaseUnit,
                    conversionToBase: mapping!.conversionQuantity,
                    unitPrice: item.unitPrice ?? zero, currency: input.currency
                };
            });
            const po = await tx.purchaseOrder.create({ data: {
                code: 'PO-' + randomUUID(), purchaseRequestId: r.id,
                supplierId: supplier.id, supplierName: supplier.name,
                recipientEmail: supplier.email, currency: input.currency, createdById: actor.id,
                items: { create: poItems }
            } });
            await event(tx, po.id, input.requestId, 'CREATED', actor, input,
                { supplierId: supplier.id, purchaseRequestId: r.id, currency: input.currency,
                    approvedBy: r.approvedBy, approvedAt: r.approvedAt.toISOString() });
            return { order: await detail(tx, po.id), replayed: false };
        }, { timeout: 20000 });
    },

    async dispatch(id: string, input: PoDispatchInput, actor: Actor) {
        onlyAdmin(actor);
        return orderTransaction(id, async (tx, order) => {
            const done = await tx.purchaseDispatchAttempt.findUnique({ where: { requestId: input.requestId } });
            if (done) {
                const audit = await tx.purchaseOrderEvent.findUnique({ where: { requestId: input.requestId } });
                if (done.purchaseOrderId !== id || done.mode !== input.mode ||
                    done.requestedById !== actor.id || audit?.payloadHash !== hash(input))
                    throw new HttpError(409, 'requestId đã được dùng khác nội dung.');
                return { order, replayed: true, externalDelivery: 'NOT_VERIFIED' };
            }
            if (!['CREATED', 'DISPATCH_UNKNOWN', 'SANDBOX_SENT'].includes(order.status))
                throw new HttpError(409, 'PO không ở trạng thái có thể chuẩn bị/gửi thử.');
            if (order.status === 'DISPATCH_UNKNOWN' && input.mode === 'UNKNOWN')
                throw new HttpError(409, 'UNKNOWN chưa xác minh; chặn gửi lại có khả năng trùng tới nhà cung cấp.');
            // Zero network calls. The user has not authorized contacting a supplier.
            const status = input.mode === 'SANDBOX' ? 'SANDBOX_SENT' : 'DISPATCH_UNKNOWN';
            const attemptNumber = order.dispatchAttempts.length + 1;
            const dispatchIdentity = hash({ poId: id, supplierId: order.supplierId,
                recipient: order.recipientEmail, items: order.items.map(i => ({
                    id: i.id, qty: i.quantityOrdered, price: i.unitPrice.toString()
                })) });
            const providerReference = input.mode === 'SANDBOX'
                ? 'no-network:' + dispatchIdentity.slice(0, 24) + ':' + attemptNumber : null;
            await tx.purchaseDispatchAttempt.create({ data: {
                requestId: input.requestId, purchaseOrderId: id, attemptNumber,
                dispatchIdentity, recipientSnapshot: order.recipientEmail, mode: input.mode,
                providerReference, providerStatus: input.mode === 'SANDBOX' ? 'SANDBOX_ACCEPTED' : 'UNKNOWN',
                requestedById: actor.id
            } });
            await event(tx, id, input.requestId, 'DISPATCH', actor, input,
                { adapter: 'NO_NETWORK_TEST_ONLY', outcome: input.mode === 'SANDBOX' ? 'SANDBOX_ACCEPTED' : 'UNKNOWN',
                    recipient: 'sandbox.invalid', reason: input.reason, realSupplierContacted: false,
                    dispatchIdentity, providerReference, attemptNumber });
            await tx.purchaseOrder.update({ where: { id }, data: { status } });
            return { order: await detail(tx, id), replayed: false, externalDelivery: 'NOT_VERIFIED' };
        });
    },

    async confirm(id: string, input: PoDecisionInput, actor: Actor) {
        onlyAdmin(actor);
        return orderTransaction(id, async (tx, po) => {
            const replay = await tx.purchaseOrderEvent.findUnique({ where: { requestId: input.requestId } });
            if (replay) {
                if (replay.purchaseOrderId !== id || replay.type !== 'MANUAL_CONFIRM' ||
                    replay.actorId !== actor.id || replay.payloadHash !== hash(input))
                    throw new HttpError(409, 'requestId đã được dùng khác nội dung.');
                return { order: po, replayed: true,
                    externalConfirmation: 'ADMIN_ATTESTATION_NOT_INDEPENDENTLY_VERIFIED' };
            }
            if (!['CREATED', 'SANDBOX_SENT', 'DISPATCH_UNKNOWN'].includes(po.status))
                throw new HttpError(409, 'PO đã được xác nhận/từ chối hoặc đã kết thúc.');
            const evidence = await captureSupplierEvidence(tx, po, input, actor, 'CONFIRMED');
            await event(tx, id, input.requestId, 'MANUAL_CONFIRM', actor, input,
                { evidenceReference: input.evidenceReference, reason: input.reason, ...evidence });
            await tx.purchaseOrder.update({ where: { id }, data: {
                status: 'CONFIRMED', confirmedAt: new Date(), confirmedById: actor.id,
                confirmationSource: input.source, confirmationReference: input.evidenceReference
            } });
            await tx.purchaseRequest.update({ where: { id: po.purchaseRequestId },
                data: { status: 'SENT' } });
            return { order: await detail(tx, id), replayed: false,
                externalConfirmation: 'ADMIN_ATTESTATION_NOT_INDEPENDENTLY_VERIFIED' };
        });
    },

    async reject(id: string, input: PoDecisionInput, actor: Actor) {
        onlyAdmin(actor);
        return orderTransaction(id, async (tx, po) => {
            const replay = await tx.purchaseOrderEvent.findUnique({ where: { requestId: input.requestId } });
            if (replay) {
                if (replay.purchaseOrderId !== id || replay.type !== 'MANUAL_REJECT' ||
                    replay.payloadHash !== hash(input) || replay.actorId !== actor.id)
                    throw new HttpError(409, 'requestId đã được dùng khác nội dung.');
                return { order: po, replayed: true };
            }
            if (!['CREATED', 'SANDBOX_SENT', 'DISPATCH_UNKNOWN', 'CONFIRMED'].includes(po.status) ||
                po.items.some(i => i.quantityReceived > 0)) throw new HttpError(409, 'Không thể từ chối PO đã nhận hàng.');
            const evidence = await captureSupplierEvidence(tx, po, input, actor, 'REJECTED');
            await event(tx, id, input.requestId, 'MANUAL_REJECT', actor, input,
                { reason: input.reason, evidenceReference: input.evidenceReference, ...evidence });
            await tx.purchaseOrder.update({ where: { id }, data: {
                status: 'REJECTED', rejectionAt: new Date(), rejectionReason: input.reason
            } });
            await tx.purchaseRequest.update({ where: { id: po.purchaseRequestId },
                data: { status: 'APPROVED' } });
            return { order: await detail(tx, id), replayed: false };
        });
    },

    async selectSupplier(requestId: string, input: PoSelectSupplierInput, actor: Actor) {
        onlyAdmin(actor);
        return prisma.$transaction(async tx => {
            await lockRequest(tx, requestId);
            const r = await demand(tx, requestId);
            const orders = await tx.purchaseOrder.findMany({ where: { purchaseRequestId: requestId },
                orderBy: { createdAt: 'desc' } });
            const last = orders[0];
            if (!last || !['REJECTED', 'CANCELLED'].includes(last.status) ||
                r.status !== 'APPROVED') throw new HttpError(409, 'Chỉ đổi nhà cung cấp sau khi PO trước bị từ chối/hủy.');
            const old = await tx.purchaseOrderEvent.findUnique({ where: { requestId: input.requestId } });
            if (old) {
                if (old.purchaseOrderId !== last.id || old.type !== 'SUPPLIER_RESELECT' ||
                    old.payloadHash !== hash(input) || old.actorId !== actor.id)
                    throw new HttpError(409, 'requestId đã dùng với nội dung khác.');
                return { request: await demand(tx, requestId), replayed: true };
            }
            await eligibleSupplier(tx, input.supplierId, r.items.flatMap(i => i.ingredientId ? [i.ingredientId] : []));
            const supplier = await tx.supplier.findUniqueOrThrow({ where: { id: input.supplierId },
                include: { ingredients: true } });
            for (const item of r.items.filter(x => x.ingredientId)) {
                const mapping = supplier.ingredients.find(x => x.ingredientId === item.ingredientId);
                if (!mapping) throw new HttpError(409, 'Nhà cung cấp mới thiếu nguyên liệu.');
                const price = mapping.pricePerBaseUnit.mul(mapping.conversionQuantity).toDecimalPlaces(2);
                if (!price.equals(item.unitPrice ?? zero))
                    throw new HttpError(409, 'Giá nhà cung cấp khác cam kết; cần phê duyệt lại Purchase Request.');
            }
            await event(tx, last.id, input.requestId, 'SUPPLIER_RESELECT', actor, input,
                { originalSupplierId: r.supplierId, newSupplierId: supplier.id, reason: input.reason });
            return { request: await tx.purchaseRequest.update({ where: { id: requestId },
                data: { supplierId: supplier.id }, include: { supplier: true } }), replayed: false };
        }, { timeout: 20000 });
    },

    async cancel(id: string, input: PoCancelInput, actor: Actor) {
        onlyAdmin(actor);
        return orderTransaction(id, async (tx, po) => {
            const previous = await tx.purchaseOrderEvent.findUnique({ where: { requestId: input.requestId } });
            if (previous) {
                if (previous.purchaseOrderId !== id || previous.type !== 'CANCEL' ||
                    previous.actorId !== actor.id || previous.payloadHash !== hash(input))
                    throw new HttpError(409, 'requestId đã dùng với nội dung khác.');
                return { order: po, replayed: true };
            }
            if (['CANCELLED', 'REJECTED', 'RECEIVED'].includes(po.status))
                throw new HttpError(409, 'PO không thể hủy trong trạng thái hiện tại.');
            if (po.status !== 'CREATED')
                throw new HttpError(409, 'BLOCKED_POLICY: không được hủy PO đã điều phối hoặc xác nhận khi chưa có chính sách kết thúc cam kết được duyệt.');
            await event(tx, id, input.requestId, 'CANCEL', actor, input,
                { reason: input.reason, supplierEvidenceReference: input.supplierEvidenceReference ?? null,
                    receivedBeforeCancellation: po.items.map(i => ({ itemId: i.id,
                        received: i.quantityReceived, remainingCancelled: i.quantityOrdered - i.quantityReceived })) });
            await tx.purchaseOrder.update({ where: { id }, data: {
                status: 'CANCELLED', cancelledAt: new Date(), cancelledById: actor.id,
                cancellationReason: input.reason
            } });
            const allOrders = await tx.purchaseOrder.count({ where: {
                purchaseRequestId: po.purchaseRequestId, status: { notIn: ['CANCELLED', 'REJECTED'] } } });
            if (allOrders === 0) await tx.purchaseRequest.update({ where: { id: po.purchaseRequestId },
                data: { status: 'APPROVED' } });
            return { order: await detail(tx, id), replayed: false };
        });
    },

    async requestCancellation(id: string, input: PoCancelInput, actor: Actor) {
        onlyAdmin(actor);
        return orderTransaction(id, async (tx, po) => {
            const previous = await tx.purchaseOrderEvent.findUnique({ where: { requestId: input.requestId } });
            if (previous) {
                if (previous.purchaseOrderId !== id || previous.type !== 'CANCELLATION_REQUESTED' ||
                    previous.actorId !== actor.id || previous.payloadHash !== hash(input))
                    throw new HttpError(409, 'requestId đã dùng cho nội dung khác.');
                return { order: po, replayed: true, remainingCancellation: 'BLOCKED_POLICY' };
            }
            if (!['SANDBOX_SENT', 'DISPATCH_UNKNOWN', 'CONFIRMED','PARTIALLY_RECEIVED'].includes(po.status))
                throw new HttpError(409, 'Chỉ giữ hủy PO đã điều phối, xác nhận hoặc nhận một phần.');
            await event(tx, id, input.requestId, 'CANCELLATION_REQUESTED', actor, input,
                { reason: input.reason, suppliedEvidenceReference: input.supplierEvidenceReference ?? null,
                    status: 'PENDING_POLICY_REVIEW',
                    existingAccepted: po.items.map(i => ({ itemId: i.id, receivedQty: i.quantityReceived,
                        outstandingQty: i.quantityOrdered - i.quantityReceived })) });
            await tx.purchaseOrder.update({ where: { id },
                data: { status: 'CANCELLATION_PENDING', cancellationReason: input.reason } });
            return { order: await detail(tx, id), replayed: false, remainingCancellation: 'BLOCKED_POLICY' };
        });
    },

    async recordCancellationResolution(id: string, input: PoCancelResolutionInput, actor: Actor) {
        onlyAdmin(actor);
        return orderTransaction(id, async (tx, po) => {
            const prior = await tx.purchaseOrderEvent.findUnique({ where: { requestId: input.requestId } });
            if (prior) {
                if (prior.purchaseOrderId !== id || prior.type !== 'CANCELLATION_RESOLUTION_EVIDENCE' ||
                    prior.actorId !== actor.id || prior.payloadHash !== hash(input))
                    throw new HttpError(409, 'requestId đã dùng cho chứng cứ khác.');
                return { order: po, replayed: true, finalCommitment: 'BLOCKED_POLICY' };
            }
            if (po.status !== 'CANCELLATION_PENDING')
                throw new HttpError(409, 'PO chưa yêu cầu giải quyết hủy.');
            if (input.decision === 'SUPPLIER_ACKNOWLEDGED' && !input.evidenceReference)
                throw new HttpError(409, 'Cần mã chứng từ cho lời xác nhận nhà cung cấp.');
            const observedAt = evidenceAt(po.createdAt, input);
            await event(tx, id, input.requestId, 'CANCELLATION_RESOLUTION_EVIDENCE', actor, input, {
                decision: input.decision, evidenceReference: input.evidenceReference ?? null,
                observedAt: observedAt.toISOString(), independentlyVerified: false,
                reason: input.reason, status: 'PENDING_POLICY_REVIEW',
                openItems: po.items.map(i => ({ itemId: i.id,
                    received: i.quantityReceived, outstanding: i.quantityOrdered - i.quantityReceived }))
            });
            return { order: await detail(tx, id), replayed: false, finalCommitment: 'BLOCKED_POLICY' };
        });
    },

    async requestOverdeliveryAmendment(id: string, input: PoOverdeliveryAmendmentInput, actor: Actor) {
        onlyAdmin(actor);
        return orderTransaction(id, async (tx, po) => {
            const old = await tx.purchaseOverdeliveryAmendment.findUnique({ where: { requestId: input.requestId } });
            if (old) {
                if (old.purchaseOrderId !== id || old.discrepancyId !== input.discrepancyId ||
                    old.requestedById !== actor.id || old.reason !== input.reason ||
                    !old.requestedExtraQuantity.equals(input.requestedExtraQuantity))
                    throw new HttpError(409, 'requestId đã sử dụng cho đề nghị sửa đổi khác.');
                return { amendment: old, replayed: true, excessAcceptance: 'BLOCKED_POLICY' };
            }
            const discrepancy = po.discrepancies.find(d => d.id === input.discrepancyId);
            if (!discrepancy || discrepancy.category !== 'OVER_DELIVERY' || discrepancy.status !== 'HELD' ||
                discrepancy.rejectedQuantity.lt(input.requestedExtraQuantity))
                throw new HttpError(409, 'Chỉ đề nghị phần giao vượt đang giữ, chưa được chấp nhận.');
            const previous = await tx.purchaseOverdeliveryAmendment.findUnique({
                where: { discrepancyId: discrepancy.id }
            });
            if (previous) throw new HttpError(409, 'Phần giao vượt đã có đề nghị sửa đổi; không duyệt trùng.');
            const amendment = await tx.purchaseOverdeliveryAmendment.create({ data: {
                requestId: input.requestId, purchaseOrderId: id, discrepancyId: discrepancy.id,
                requestedExtraQuantity: input.requestedExtraQuantity, reason: input.reason,
                requestedById: actor.id, status: 'PENDING_POLICY'
            } });
            return { amendment, replayed: false, excessAcceptance: 'BLOCKED_POLICY',
                authorizationRequired: 'Approved overdelivery tolerance and separate amendment authority' };
        });
    },

    async configureShelfLifeRule(input: PoShelfLifeRuleInput, actor: Actor) {
        onlyAdmin(actor);
        return prisma.$transaction(async tx => {
            const old = await tx.purchaseShelfLifeRule.findUnique({ where: { requestId: input.requestId } });
            if (old) {
                if (old.configuredById !== actor.id || old.ingredientId !== (input.ingredientId ?? null) ||
                    old.categoryId !== (input.categoryId ?? null) ||
                    old.minRemainingDays !== input.minRemainingDays || old.reason !== input.reason)
                    throw new HttpError(409, 'requestId đã dùng cho cấu hình hạn dùng khác.');
                return { rule: old, replayed: true, policyApproval: 'BLOCKED_POLICY' };
            }
            if (input.ingredientId && !await tx.ingredient.findUnique({ where: { id: input.ingredientId } }))
                throw new HttpError(404, 'Không tìm thấy nguyên liệu.');
            if (input.categoryId && !await tx.category.findFirst({
                where: { id: input.categoryId, kind: 'INGREDIENT' }
            })) throw new HttpError(404, 'Không tìm thấy danh mục nguyên liệu.');
            const rule = await tx.purchaseShelfLifeRule.create({ data: {
                requestId: input.requestId, ingredientId: input.ingredientId ?? null,
                categoryId: input.categoryId ?? null, minRemainingDays: input.minRemainingDays,
                reason: input.reason, configuredById: actor.id, status: 'DRAFT'
            } });
            return { rule, replayed: false, policyApproval: 'BLOCKED_POLICY' };
        });
    },

    async listShelfLifeRules(actor: Actor) {
        onlyAdmin(actor);
        return { rules: await prisma.purchaseShelfLifeRule.findMany({
            orderBy: { configuredAt: 'desc' }, take: 200
        }), approvedDefault: null, policyApproval: 'BLOCKED_POLICY' };
    },

    async aggregateIndependentDemand(input: PurchasingAggregationInput, actor: Actor) {
        onlyAdmin(actor);
        const ids = [...new Set(input.purchaseRequestIds)].sort();
        if (ids.length < 2 || ids.length !== input.purchaseRequestIds.length)
            throw new HttpError(400, 'Cần ít nhất hai Purchase Request nguồn khác nhau.');
        return prisma.$transaction(async tx => {
            const existing = await tx.purchaseDemandAggregation.findUnique({
                where: { requestId: input.requestId }, include: { members: true }
            });
            if (existing) {
                if (existing.approvedById !== actor.id || existing.reason !== input.reason ||
                    existing.members.map(m => m.purchaseRequestId).sort().join('|') !== ids.join('|'))
                    throw new HttpError(409, 'requestId đã dùng cho một nhóm khác.');
                return { aggregation: existing, replayed: true, fulfillment: 'BLOCKED_POLICY' };
            }
            for (const id of ids) await lockRequest(tx, id);
            const requests = await tx.purchaseRequest.findMany({
                where: { id: { in: ids } }, include: { items: true, aggregationMember: true }
            });
            if (requests.length !== ids.length || requests.some(r =>
                r.status !== 'PENDING' || !r.demandSourceKey || !r.demandHash ||
                r.aggregationMember !== null))
                throw new HttpError(409, 'Chỉ nhóm các nguồn PENDING độc lập, chưa được nhóm trước đó.');
            const ingredientSets = requests.map(r => new Set(r.items.flatMap(i =>
                i.ingredientId ? [i.ingredientId] : [])));
            if (!Array.from(ingredientSets[0]!).some(ingredient =>
                ingredientSets.every(s => s.has(ingredient))))
                throw new HttpError(409, 'Nhóm phải có ít nhất một nguyên liệu chung.');
            const snapshot = requests.map(r => ({
                id: r.id, source: r.demandSourceKey!, hash: r.demandHash!,
                items: r.items.map(i => ({ ingredientId: i.ingredientId, quantity: i.quantity }))
            })).sort((a,b) => a.id.localeCompare(b.id));
            const aggregation = await tx.purchaseDemandAggregation.create({ data: {
                requestId: input.requestId, sourceHash: hash(snapshot), reason: input.reason,
                approvedById: actor.id, status: 'ADMIN_GROUPING_APPROVED_PENDING_POLICY',
                members: { create: requests.map(r => ({
                    purchaseRequestId: r.id, sourceKey: r.demandSourceKey!, sourceHash: r.demandHash!
                })) }
            }, include: { members: true } });
            return { aggregation, replayed: false, fulfillment: 'BLOCKED_POLICY',
                groupedWithoutMerging: true };
        }, { timeout: 20000 });
    },

    async receive(id: string, input: PoReceiptInput, actor: Actor) {
        // Only authorized STAFF/ADMIN may record accepted physical receipts.
        if (!['ADMIN', 'STAFF'].includes(actor.role)) throw new HttpError(403, 'Không đủ quyền nhận hàng.');
        const po = await prisma.purchaseOrder.findUnique({ where: { id }, include: { items: true } });
        if (!po) throw new HttpError(404, 'Không tìm thấy PO.');
        // Historical replay must reach the receipt's existing hash/actor check;
        // a newer draft must not change the outcome of an already committed receipt.
        const priorReceipt = await prisma.goodsReceipt.findUnique({
            where: { idempotencyKey: input.requestId }
        });
        if (!priorReceipt) {
            const ingredientIds = po.items.flatMap(i => i.ingredientId ? [i.ingredientId] : []);
            const ingredients = await prisma.ingredient.findMany({ where: { id: { in: ingredientIds } },
                select: { id: true, categoryId: true } });
            const categoryIds = ingredients.flatMap(i => i.categoryId ? [i.categoryId] : []);
            const rules = await prisma.purchaseShelfLifeRule.findMany({ where: { status: 'DRAFT',
                OR: [{ ingredientId: { in: ingredientIds } }, { categoryId: { in: categoryIds } }] },
                orderBy: { configuredAt: 'desc' } });
            for (const row of input.items) {
                const item = po.items.find(i => i.id === row.purchaseOrderItemId);
                const ing = ingredients.find(i => i.id === item?.ingredientId);
                if (!ing) continue;
                const rule = rules.find(r => r.ingredientId === ing.id) ??
                    rules.find(r => r.categoryId && r.categoryId === ing.categoryId);
                if (rule && row.batches.some(b =>
                    new Date(b.expirationDate).getTime() < Date.now() + rule.minRemainingDays * 86400000))
                    throw new HttpError(409,
                        'BLOCKED_POLICY: lô dưới ngưỡng hạn dùng DRAFT; cần giải quyết chứng cứ trước khi nhập.');
            }
        }
        const requestItems = input.items.map(item => {
            const found = po.items.find(x => x.id === item.purchaseOrderItemId);
            if (!found) throw new HttpError(409, 'Lô nhận không thuộc PO.');
            if (item.batches.reduce((n, b) => n + b.quantity, 0) !== item.receivedQuantity)
                throw new HttpError(400, 'Tổng số lượng theo lô không khớp số lượng nhận.');
            return {
                purchaseRequestItemId: found.purchaseRequestItemId, receivedQuantity: item.receivedQuantity,
                batches: item.batches.map(b => ({ batchCode: b.batchCode,
                    expirationDate: b.expirationDate, quantity: b.quantity }))
            };
        });
        if (new Set(requestItems.map(i => i.purchaseRequestItemId)).size !== requestItems.length)
            throw new HttpError(409, 'Một mặt hàng PO không được nhận trùng trong một phiếu.');
        const received = await purchaseService.receive(po.purchaseRequestId, {
            purchaseOrderId: po.id, idempotencyKey: input.requestId,
            supplierInvoiceNo: input.supplierInvoiceNo ?? null, note: input.note ?? null,
            items: requestItems
        }, actor.id);
        const current = await prisma.purchaseOrder.findUniqueOrThrow({ where: { id }, include });
        return { order: current, purchaseRequest: received.purchaseRequest,
            replayed: 'replayed' in received ? received.replayed : false,
            isStockSafe: received.isStockSafe };
    },

    async discrepancy(id: string, input: PoDiscrepancyInput, actor: Actor) {
        if (!['ADMIN', 'STAFF'].includes(actor.role)) throw new HttpError(403, 'Không đủ quyền kiểm tra hàng.');
        return orderTransaction(id, async (tx, po) => {
            const old = await tx.purchaseDeliveryDiscrepancy.findUnique({ where: { requestId: input.requestId } });
            if (old) {
                if (old.purchaseOrderId !== id || old.actorId !== actor.id ||
                    old.purchaseOrderItemId !== input.purchaseOrderItemId ||
                    old.reason !== input.reason || old.category !== input.category ||
                    old.observedQuantity.toString() !== String(input.observedQuantity) ||
                    old.acceptedQuantity.toString() !== String(input.acceptedQuantity) ||
                    old.rejectedQuantity.toString() !== String(input.rejectedQuantity) ||
                    old.observedIngredientId !== (input.observedIngredientId ?? null) ||
                    JSON.stringify(old.evidence ?? {}) !== JSON.stringify(input.evidence ?? {}))
                    throw new HttpError(409, 'requestId đã được dùng với bằng chứng khác.');
                return { discrepancy: old, replayed: true };
            }
            const item = po.items.find(i => i.id === input.purchaseOrderItemId);
            if (!item) throw new HttpError(404, 'Mặt hàng không thuộc PO.');
            if (!['CONFIRMED', 'PARTIALLY_RECEIVED'].includes(po.status))
                throw new HttpError(409, 'Chỉ kiểm tra chênh lệch của PO đang nhận hàng.');
            const remaining = item.quantityOrdered - item.quantityReceived;
            if (input.acceptedQuantity > remaining) throw new HttpError(409, 'Không tự chấp nhận hàng vượt số lượng PO còn lại.');
            if (input.category === 'OVER_DELIVERY' && input.observedQuantity <= remaining)
                throw new HttpError(409, 'Không có giao vượt số lượng còn lại.');
            if (input.category === 'WRONG_INGREDIENT' &&
                (!input.observedIngredientId || item.ingredientId === input.observedIngredientId))
                throw new HttpError(409, 'Phải ghi nhận nguyên liệu sai khác thực sự.');
            if (input.category === 'SHELF_LIFE' && input.acceptedQuantity > 0)
                throw new HttpError(409, 'BLOCKED_POLICY: chưa có ngưỡng hạn dùng được phê duyệt để chấp nhận.');
            if (input.category === 'DAMAGED' && input.acceptedQuantity > 0)
                throw new HttpError(409, 'Hàng hỏng phải bị giữ/từ chối trước khi nhập chính thức.');
            if (input.category === 'WRONG_INGREDIENT' && input.acceptedQuantity > 0)
                throw new HttpError(409, 'Không chấp nhận tự động nguyên liệu thay thế.');
            return { discrepancy: await tx.purchaseDeliveryDiscrepancy.create({ data: {
                requestId: input.requestId, purchaseOrderId: id, purchaseOrderItemId: item.id,
                expectedIngredientId: item.ingredientId, observedIngredientId: input.observedIngredientId ?? null,
                observedQuantity: input.observedQuantity, acceptedQuantity: input.acceptedQuantity,
                rejectedQuantity: input.rejectedQuantity, category: input.category,
                reason: input.reason, actorId: actor.id,
                evidence: (input.evidence ?? {}) as Prisma.InputJsonValue,
                status: 'HELD'
            } }), replayed: false };
        });
    },

    async returnToSupplier(id: string, input: PoReturnInput, actor: Actor) {
        onlyAdmin(actor);
        const po = await prisma.purchaseOrder.findUnique({ where: { id }, select: { purchaseRequestId: true } });
        if (!po) throw new HttpError(404, 'Không tìm thấy PO.');
        return prisma.$transaction(async tx => {
            await lockRequest(tx, po.purchaseRequestId);
            await lockOrder(tx, id);
            const current = await detail(tx, id);
            const existing = await tx.purchaseSupplierReturn.findUnique({ where: { requestId: input.requestId } });
            if (existing) {
                if (existing.purchaseOrderId !== id || existing.actorId !== actor.id ||
                    existing.goodsReceiptId !== input.goodsReceiptId || existing.batchId !== input.batchId ||
                    !existing.quantity.equals(input.quantity) || existing.reason !== input.reason)
                    throw new HttpError(409, 'requestId đã dùng cho lô/lượng trả khác.');
                return { supplierReturn: existing, replayed: true, supplierCredit: 'UNSETTLED' };
            }
            const receipt = await tx.goodsReceipt.findFirst({ where: {
                id: input.goodsReceiptId, purchaseOrderId: id, status: 'CONFIRMED'
            } });
            if (!receipt) throw new HttpError(409, 'Phiếu nhận hàng không thuộc PO hoặc chưa xác nhận.');
            const batchRef = await tx.ingredientBatch.findFirst({ where: {
                id: input.batchId, goodsReceiptId: receipt.id, supplierId: current.supplierId
            } });
            if (!batchRef) throw new HttpError(409, 'Lô trả không xuất phát từ đúng Goods Receipt và Supplier.');
            const ingredientId = batchRef.ingredientId;
            await tx.$queryRaw`SELECT "id" FROM "Ingredient" WHERE "id"=${ingredientId} FOR UPDATE`;
            const ingredient = await tx.ingredient.findUniqueOrThrow({ where: { id: ingredientId },
                include: { batches: true } });
            const batch = ingredient.batches.find(b => b.id === batchRef.id)!;
            const quantity = new Prisma.Decimal(input.quantity);
            const original = await tx.inventoryTransaction.findFirst({ where: {
                ingredientId, batchId: batch.id, type: 'IMPORT',
                referenceType: 'GoodsReceipt', referenceId: receipt.id
            } });
            if (!original || original.quantity.lt(quantity))
                throw new HttpError(409, 'Không tìm thấy IMPORT gốc hoặc lượng trả vượt lượng đã nhận.');
            if (batch.quantityRemaining.lt(quantity) || ingredient.quantity.lt(quantity))
                throw new HttpError(409, 'Hàng đã tiêu hao; không đủ vật tư thực tế để trả.');
            const eligibleAfter = ingredient.batches.reduce((n, b) =>
                isIngredientBatchUsable(b) ? n.add(b.id === batch.id ? b.quantityRemaining.sub(quantity) : b.quantityRemaining) : n, zero);
            if (eligibleAfter.lt(ingredient.reserved))
                throw new HttpError(409, 'Hàng đang giữ cho đơn bán; không được trả vượt phần chưa phân bổ.');
            const oldReturns = await tx.purchaseSupplierReturn.aggregate({ where: {
                goodsReceiptId: receipt.id, batchId: batch.id
            }, _sum: { quantity: true } });
            if ((oldReturns._sum.quantity ?? zero).add(quantity).gt(original.quantity))
                throw new HttpError(409, 'Tổng lượng trả vượt lượng nhập gốc.');
            const ledger = await tx.inventoryTransaction.create({ data: {
                ingredientId, batchId: batch.id, type: 'RETURN_OUT', quantity: quantity.neg(),
                unitCost: batch.unitCost, totalCost: quantity.neg().mul(batch.unitCost).toDecimalPlaces(2),
                referenceType: 'PurchaseSupplierReturn', referenceId: input.requestId,
                idempotencyKey: 'supplier-return:' + input.requestId, performedBy: actor.id,
                reason: input.reason
            } });
            await tx.ingredientBatch.update({ where: { id: batch.id },
                data: { quantityRemaining: { decrement: quantity } } });
            await tx.ingredient.update({ where: { id: ingredientId },
                data: { quantity: { decrement: quantity }, rowVersion: { increment: 1 } } });
            const row = await tx.purchaseSupplierReturn.create({ data: {
                requestId: input.requestId, purchaseOrderId: id,
                goodsReceiptId: receipt.id, batchId: batch.id, ingredientId, supplierId: current.supplierId,
                quantity, ledgerId: ledger.id, reason: input.reason, actorId: actor.id
            } });
            return { supplierReturn: row, replayed: false, supplierCredit: 'UNSETTLED' };
        }, { timeout: 20000 });
    },

    async reconcileInvoice(id: string, input: PoInvoiceInput, actor: Actor) {
        onlyAdmin(actor);
        return orderTransaction(id, async (tx, po) => {
            const old = await tx.purchaseInvoiceReconciliation.findUnique({ where: { requestId: input.requestId } });
            if (old) {
                if (old.purchaseOrderId !== id || old.actorId !== actor.id ||
                    old.invoiceNumber !== input.invoiceNumber || old.currency !== input.currency ||
                    JSON.stringify(old.invoiceItems) !== JSON.stringify(input.items))
                    throw new HttpError(409, 'requestId đã dùng cho hóa đơn khác.');
                return { reconciliation: old, replayed: true, financialApproval: 'NOT_GRANTED' };
            }
            const differences: Array<{ field: string; itemId?: string; expected: unknown; actual: unknown }> = [];
            if (input.currency !== po.currency) differences.push({ field: 'currency',
                expected: po.currency, actual: input.currency });
            if (input.items.length !== po.items.length) differences.push({ field: 'itemCount',
                expected: po.items.length, actual: input.items.length });
            const used = new Set<string>();
            for (const row of input.items) {
                if (used.has(row.purchaseOrderItemId)) throw new HttpError(409, 'Trùng mặt hàng hóa đơn.');
                used.add(row.purchaseOrderItemId);
                const item = po.items.find(i => i.id === row.purchaseOrderItemId);
                if (!item) throw new HttpError(409, 'Mặt hàng hóa đơn không thuộc PO.');
                for (const [field, expected, actual] of [
                    ['quantity', item.quantityReceived, row.quantity], ['unit', item.unit, row.unit],
                    ['price', item.unitPrice.toString(), String(row.unitPrice)],
                    ['ingredient', item.ingredientId, row.ingredientId ?? null]
                ] as Array<[string, unknown, unknown]>) {
                    if (String(expected) !== String(actual)) differences.push({
                        field, itemId: item.id, expected, actual
                    });
                }
                const expectedTotal = new Prisma.Decimal(row.quantity).mul(item.unitPrice).toDecimalPlaces(2);
                if (!expectedTotal.equals(row.total)) differences.push({
                    field: 'total', itemId: item.id, expected: expectedTotal.toString(), actual: row.total
                });
            }
            const status = differences.length ? 'DISPUTED' : 'MATCHED';
            const row = await tx.purchaseInvoiceReconciliation.create({ data: {
                requestId: input.requestId, purchaseOrderId: id,
                invoiceNumber: input.invoiceNumber, currency: input.currency,
                invoiceItems: input.items, differences: differences as Prisma.InputJsonValue, status, actorId: actor.id,
                note: input.note ?? null
            } });
            return { reconciliation: row, replayed: false, financialApproval: 'NOT_GRANTED' };
        });
    }
};
