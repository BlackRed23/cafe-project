import { PurchaseRequestStatus, type Prisma } from '@cafe-project/database';
import { HttpError } from '../../common/http-error';


import { purchaseRepository, type PurchaseRequestRecord } from './purchase.repository';
import type { CreatePurchaseRequestInput, MarkPurchaseRequestPaidInput, PurchaseRequestFiltersInput, ReceivePurchaseRequestInput, RejectPurchaseRequestInput } from './purchase.validator';
import { createAgentLogViaAgentService } from '../agent/agent.client';
import { randomUUID } from 'node:crypto';
import { getOptionalSettingValue } from '../system-setting/system-setting.service';

const totalForItem = (quantity: number, unitPrice: Prisma.Decimal | null): number => unitPrice?.mul(quantity).toNumber() ?? 0;

const visibleNote = (value: string | null): string | null => {
    try {
        const data: unknown = JSON.parse(value ?? '');
        if (data && typeof data === 'object' && 'schema' in data && 'note' in data &&
            (data.schema === 'api-purchase-v1' || data.schema === 'api-receipt-v1') && (typeof data.note === 'string' || data.note === null)) return data.note;
    } catch { /* Plain historical notes stay unchanged. */ }
    return value;
};

export const purchaseConversionForItem = (_request: PurchaseRequestRecord, item: PurchaseRequestRecord['items'][number]) => {
    let snapshot: Record<string, unknown> = {};
    try { const raw: unknown = JSON.parse(item.notes ?? ''); if (raw && typeof raw === 'object' && !Array.isArray(raw)) snapshot = raw as Record<string, unknown>; } catch { /* Agent/historical notes remain plain text. */ }
    const factor = snapshot.schema === 'api-purchase-v1' && typeof snapshot.conversionQuantity === 'string' ? Number(snapshot.conversionQuantity) : 0;
    const valid = factor > 0 && snapshot.baseUnit === item.ingredient.baseUnit && item.quantity / factor === Math.floor(item.quantity / factor);
    return { purchaseQuantity: valid ? item.quantity / factor : null,
        purchaseUnit: typeof snapshot.purchaseUnit === 'string' ? snapshot.purchaseUnit : null,
        conversionQuantity: factor || null, conversionTargetUnit: item.ingredient.baseUnit,
        convertedQuantity: item.quantity, inventoryUnit: item.ingredient.baseUnit, conversionMissing: !valid,
        quantityUnit: 'BASE', conversionSnapshotMissing: snapshot.schema !== 'api-purchase-v1' };
};

const emailStatusForRequest = (request: PurchaseRequestRecord): string => {
    if (request.status === PurchaseRequestStatus.SENT || request.emailSentAt) return 'Đã gửi';
    if (request.lastEmailError) return 'Gửi lỗi';
    return 'Chưa gửi';
};

const formatQuantity = (quantity: number, unit?: string | null): string => `${quantity}${unit ? ` ${unit}` : ''}`;
const unsafeSupplierEmailTextPatterns = [
    'ndfs',
    'San pham',
    'He thong',
    'de xuat',
    'nguong',
    'thap hon',
    'khong',
    'chu ky nhap hang',
    'reorderPlanningPeriod',
    'Tồn kho hiện tại',
    'Ngưỡng tối thiểu',
    'Dưới ngưỡng',
    'dưới ngưỡng',
    'AI Agent ghi nhận',
    'Hệ thống Cafe AI ghi nhận',
    'Hệ thống đề xuất vì tồn kho',
    'Sản phẩm hiện còn',
    'thấp hơn hoặc bằng ngưỡng',
    'tồn kho',
    'ngưỡng'
];

const isSupplierEmailContentUsable = (value?: string | null): value is string => {
    if (!value?.trim()) return false;
    return !unsafeSupplierEmailTextPatterns.some((pattern) => value.includes(pattern));
};

const buildSupplierEmailItemLine = (request: PurchaseRequestRecord, item: PurchaseRequestRecord['items'][number]): string => {
    const conversion = purchaseConversionForItem(request, item);
    const productName = item.ingredient.name;
    const inventoryUnit = conversion.inventoryUnit || item.ingredient.baseUnit || '';

    if (!conversion.conversionMissing && conversion.purchaseQuantity && conversion.purchaseUnit && conversion.conversionQuantity && conversion.conversionTargetUnit) {
        return [
            `- ${productName}: ${conversion.purchaseQuantity} ${conversion.purchaseUnit} = ${conversion.convertedQuantity} ${inventoryUnit}`,
            `  Quy cách: 1 ${conversion.purchaseUnit} = ${conversion.conversionQuantity} ${conversion.conversionTargetUnit}`
        ].join('\n');
    }

    return `- ${productName}: ${formatQuantity(item.quantity, inventoryUnit)}`;
};

const buildSupplierEmailSubject = async (request: PurchaseRequestRecord): Promise<string> => {
    if (request.items.length === 1) {
        const item = request.items[0];
        const conversion = purchaseConversionForItem(request, item);
        const inventoryUnit = conversion.inventoryUnit || item.ingredient.baseUnit || '';
        const quantityDisplay =
            !conversion.conversionMissing && conversion.purchaseQuantity && conversion.purchaseUnit && inventoryUnit
                ? `${conversion.purchaseQuantity} ${conversion.purchaseUnit} = ${conversion.convertedQuantity} ${inventoryUnit}`
                : formatQuantity(item.quantity, inventoryUnit);

        return `Yêu cầu báo giá/đặt hàng ${item.ingredient.name} - ${quantityDisplay}`;
    }

    const storeName = await getOptionalSettingValue('store.name') || 'Cafe Admin';
    return `Yêu cầu báo giá/đặt hàng sản phẩm cho ${storeName}`;
};

export const buildPurchaseRequestAgentExplanation = (request: PurchaseRequestRecord): string => {
    if (request.aiGenerated && request.notes?.includes('chu ky nhap hang')) {
        return request.notes;
    }

    const explanations = request.items.map((item) => {
        const conversion = purchaseConversionForItem(request, item);
        const productName = item.ingredient.name;
        const inventoryUnit = conversion.inventoryUnit || item.ingredient.baseUnit || '';
        const stockText = formatQuantity(Number(item.ingredient.quantity), inventoryUnit);
        const thresholdText = formatQuantity(Number(item.ingredient.minThreshold), inventoryUnit);

        if (!conversion.conversionMissing && conversion.purchaseQuantity && conversion.purchaseUnit && conversion.conversionQuantity && conversion.conversionTargetUnit) {
            const neededQuantity = item.quantity;
            const neededText = formatQuantity(neededQuantity, inventoryUnit);
            const conversionText = `1 ${conversion.purchaseUnit} = ${conversion.conversionQuantity} ${conversion.conversionTargetUnit}`;
            const purchaseText = `${conversion.purchaseQuantity} ${conversion.purchaseUnit} = ${conversion.convertedQuantity} ${inventoryUnit}`;

            return `Sản phẩm ${productName} hiện còn ${stockText}, thấp hơn hoặc bằng ngưỡng tối thiểu ${thresholdText}.

Nhu cầu bổ sung tối thiểu là ${neededText}. Theo quy cách nhập hàng của nhà cung cấp: ${conversionText}.

Vì vậy hệ thống làm tròn theo quy cách nhập hàng và đề xuất nhập ${purchaseText} để đảm bảo đủ hàng và đúng quy cách nhập.`;
        }

        return `Sản phẩm ${productName} hiện còn ${stockText}, thấp hơn hoặc bằng ngưỡng tối thiểu ${thresholdText}.

Hệ thống đề xuất nhập thêm ${formatQuantity(item.quantity, inventoryUnit)} để đưa tồn kho về mức an toàn.

Sản phẩm này chưa có quy cách nhập hàng theo nhà cung cấp, nên số lượng đề xuất đang được hiển thị theo đơn vị tồn kho.`;
    });

    return explanations.join('\n\n');
};

export const buildPurchaseRequestEmailDraft = async (request: PurchaseRequestRecord) => {
    const supplierName = request.supplier.name || 'nhà cung cấp';
    const subject = await buildSupplierEmailSubject(request);
    const itemsList = request.items.map((item) => buildSupplierEmailItemLine(request, item)).join('\n');

    const storeName = await getOptionalSettingValue('store.name') || 'Cafe Admin';
    const storeEmail = await getOptionalSettingValue('store.email');
    const storePhone = await getOptionalSettingValue('store.phone');
    
    let contactInfo = '';
    if (storeEmail || storePhone) {
        contactInfo = `\n\nThông tin liên hệ:\n`;
        if (storeEmail) contactInfo += `- Email: ${storeEmail}\n`;
        if (storePhone) contactInfo += `- SĐT: ${storePhone}`;
    }

    const generatedBody = `Kính gửi ${supplierName},

${storeName} đang có nhu cầu đặt hàng/báo giá cho các sản phẩm sau:

${itemsList}

Vui lòng hỗ trợ xác nhận:
- Khả năng cung ứng
- Đơn giá hiện tại
- Thời gian giao hàng dự kiến
- Điều kiện thanh toán nếu có

Nếu có thay đổi về quy cách đóng gói, số lượng tối thiểu hoặc thời gian giao hàng, vui lòng phản hồi lại để chúng tôi xác nhận trước khi đặt hàng chính thức.

Trân trọng,
${storeName}${contactInfo}`;

    return {
        to: request.supplier.email || '',
        subject,
        body: isSupplierEmailContentUsable(request.emailContent) ? request.emailContent.trim() : generatedBody.trim(),
        status: emailStatusForRequest(request)
    };
};

const toDto = async (request: PurchaseRequestRecord) => ({
    id: request.id,
    requestNumber: request.requestNumber,
    status: request.status,
    supplierId: request.supplierId,
    supplier: request.supplier,
    notes: request.notes,
    aiGenerated: request.aiGenerated,
    agentExplanation: buildPurchaseRequestAgentExplanation(request),
    displayReasoning: buildPurchaseRequestAgentExplanation(request),
    totalAmount: Number(request.totalAmount),
    requester: request.requester,
    approver: request.approver,
    approvedAt: request.approvedAt,
    emailSentAt: request.emailSentAt,
    emailContent: request.emailContent,
    retryCount: request.retryCount,
    lastEmailError: request.lastEmailError,
    receivedAt: request.receivedAt,
    paymentStatus: request.paymentStatus,
    paidAt: request.paidAt,
    paymentNote: request.paymentNote,
    receivedAmount: Number(request.receivedAmount),
    amountPaid: Number(request.amountPaid),
    emailDraft: await buildPurchaseRequestEmailDraft(request),
    receipts: request.receipts.map(receipt => ({ ...receipt, note: visibleNote(receipt.note) })),
    items: request.items.map((item) => {
        const conversion = purchaseConversionForItem(request, item);

        return {
            id: item.id,
            inventoryId: item.ingredientId,
            ingredientId: item.ingredientId,
            productId: item.ingredientId,
            productName: item.ingredient.name,
            productSku: (item.ingredient.sku),
            categoryName: item.ingredient.category?.name ?? '',
            quantity: item.quantity,
            quantityReceived: item.quantityReceived,
            unitPrice: item.unitPrice ? Number(item.unitPrice) : 0,
            subtotal: totalForItem(item.quantity, item.unitPrice),
            notes: visibleNote(item.notes),
            productPendingDelete: !!item.ingredient.deletedAt,
            ...conversion
        };
    }),
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

const audit = (action: string, id: string, userId?: string) => {
    createAgentLogViaAgentService({ action, result: 'SUCCESS', reference_type: 'PurchaseRequest', reference_id: id,
        ...(userId ? { creator: { connect: { id: userId } } } : {}) }).catch(() => console.error('[PURCHASE] Audit dispatch unavailable'));
};
const ensureActive = (request: PurchaseRequestRecord) => {
    if (request.supplier.status !== 'ACTIVE' || request.supplier.deletedAt || request.items.some(i => !i.ingredient.isActive || i.ingredient.deletedAt)) throw new HttpError(409, 'Nhà cung cấp hoặc nguyên liệu không hoạt động.');
};
export const purchaseService = {
    async list(filters: PurchaseRequestFiltersInput) { return Promise.all((await purchaseRepository.findMany(filters)).map(toDto)); },
    async get(id: string) { return toDto(await ensureRequest(id)); },
    async create(input: CreatePurchaseRequestInput, userId: string) {
        return toDto(await purchaseRepository.create(input, userId, 'PR-' + randomUUID()));
    },
    async approve(id: string, userId: string) {
        const request = await ensureRequest(id); ensureStatus(request, PurchaseRequestStatus.PENDING, 'Only pending requests can be approved.'); ensureActive(request);
        const updated = await purchaseRepository.updateStatus(id, { status: 'APPROVED', approvedAt: new Date(), approver: { connect: { id: userId } } }, request.status);
        audit('APPROVE_PURCHASE_REQUEST', id, userId); return toDto(updated);
    },
    async reject(id: string, input: RejectPurchaseRequestInput) {
        const request = await ensureRequest(id);
        if (request.status === 'RECEIVED' || request.status === 'COMPLETED' || request.items.some(i => i.quantityReceived > 0)) throw new HttpError(409, 'Không hủy yêu cầu đã nhận hàng.');
        const updated = await purchaseRepository.updateStatus(id, { status: 'REJECTED', notes: input.reason }, request.status);
        audit('CANCEL_PURCHASE_REQUEST', id); return toDto(updated);
    },
    async markSent(id: string) {
        const request = await ensureRequest(id); ensureStatus(request, PurchaseRequestStatus.APPROVED, 'Only approved requests can be marked sent.'); ensureActive(request);
        return toDto(await purchaseRepository.updateStatus(id, { status: 'SENT', emailSentAt: new Date() }, request.status));
    },
    async receive(id: string, input: ReceivePurchaseRequestInput, userId: string) {
        const request = await ensureRequest(id);
        const received = await purchaseRepository.receive(request, input, userId);
        audit('RECEIVE_PURCHASE_REQUEST', id, userId);
        return { purchaseRequest: await toDto(received), isStockSafe: received.items.every(i => i.ingredient.quantity.minus(i.ingredient.reserved).gt(i.ingredient.minThreshold)) };
    },
    async markPaid(id: string, input: MarkPurchaseRequestPaidInput) {
        const request = await ensureRequest(id);
        if (request.status !== 'RECEIVED' && request.status !== 'COMPLETED') throw new HttpError(409, 'Chỉ ghi nhận thanh toán sau khi nhận đủ hàng.');
        if (request.paymentStatus === 'PAID') return toDto(request);
        return toDto(await purchaseRepository.updateStatus(id, { paymentStatus: 'PAID', paidAt: new Date(), paymentNote: input.paymentNote ?? null, amountPaid: request.receivedAmount }, request.status));
    },
    async complete(id: string) {
        const request = await ensureRequest(id); ensureStatus(request, PurchaseRequestStatus.RECEIVED, 'Cannot complete before request is received.');
        return toDto(await purchaseRepository.updateStatus(id, { status: 'COMPLETED' }, request.status));
    },
    async delete(id: string) { return toDto(await purchaseRepository.delete(id)); }
};
