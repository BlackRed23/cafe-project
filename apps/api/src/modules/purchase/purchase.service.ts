import { PurchaseRequestStatus } from '@cafe-project/database';
import { HttpError } from '../../common/http-error';
import { ACTIVE_PURCHASE_REQUEST_MESSAGE, purchaseRepository, type PurchaseRequestRecord } from './purchase.repository';
import type { CreatePurchaseRequestInput, PurchaseRequestFiltersInput, ReceivePurchaseRequestInput, RejectPurchaseRequestInput } from './purchase.validator';
import { scanInventoryViaAgentService } from '../agent/agent.client';

const totalForItem = (quantity: number, unitPrice: number | null): number => quantity * (unitPrice ?? 0);

const purchaseConversionForItem = (request: PurchaseRequestRecord, item: PurchaseRequestRecord['items'][number]) => {
    const supplierProduct = request.supplier.products.find((mapping) => mapping.productId === item.productId);
    const conversionQuantity = supplierProduct?.conversionQuantity ?? null;
    const purchaseUnit = supplierProduct?.purchaseUnit ?? null;
    const conversionTargetUnit = supplierProduct?.conversionTargetUnit ?? null;

    if (!purchaseUnit || !conversionQuantity || !conversionTargetUnit || conversionTargetUnit !== item.inventory.unit) {
        return {
            purchaseQuantity: null,
            purchaseUnit,
            conversionQuantity,
            conversionTargetUnit,
            convertedQuantity: item.quantity,
            inventoryUnit: item.inventory.unit,
            conversionMissing: true
        };
    }

    const purchaseQuantity = Math.ceil(item.quantity / conversionQuantity);

    return {
        purchaseQuantity,
        purchaseUnit,
        conversionQuantity,
        conversionTargetUnit,
        convertedQuantity: Math.ceil(purchaseQuantity * conversionQuantity),
        inventoryUnit: item.inventory.unit,
        conversionMissing: false
    };
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
    'Ã',
    'Ä',
    'áº',
    'á»',
    'Æ',
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
    const productName = item.product.name;
    const inventoryUnit = conversion.inventoryUnit || item.inventory.unit || '';

    if (!conversion.conversionMissing && conversion.purchaseQuantity && conversion.purchaseUnit && conversion.conversionQuantity && conversion.conversionTargetUnit) {
        return [
            `- ${productName}: ${conversion.purchaseQuantity} ${conversion.purchaseUnit} = ${conversion.convertedQuantity} ${inventoryUnit}`,
            `  Quy cách: 1 ${conversion.purchaseUnit} = ${conversion.conversionQuantity} ${conversion.conversionTargetUnit}`
        ].join('\n');
    }

    return `- ${productName}: ${formatQuantity(item.quantity, inventoryUnit)}`;
};

const buildSupplierEmailSubject = (request: PurchaseRequestRecord): string => {
    if (request.items.length === 1) {
        const item = request.items[0];
        const conversion = purchaseConversionForItem(request, item);
        const inventoryUnit = conversion.inventoryUnit || item.inventory.unit || '';
        const quantityDisplay =
            !conversion.conversionMissing && conversion.purchaseQuantity && conversion.purchaseUnit && inventoryUnit
                ? `${conversion.purchaseQuantity} ${conversion.purchaseUnit} = ${conversion.convertedQuantity} ${inventoryUnit}`
                : formatQuantity(item.quantity, inventoryUnit);

        return `Yêu cầu báo giá/đặt hàng ${item.product.name} - ${quantityDisplay}`;
    }

    return 'Yêu cầu báo giá/đặt hàng sản phẩm cho Cafe Admin';
};

export const buildPurchaseRequestAgentExplanation = (request: PurchaseRequestRecord): string => {
    if (request.aiGenerated && request.notes?.includes('chu ky nhap hang')) {
        return request.notes;
    }

    const explanations = request.items.map((item) => {
        const conversion = purchaseConversionForItem(request, item);
        const productName = item.product.name;
        const inventoryUnit = conversion.inventoryUnit || item.inventory.unit || '';
        const stockText = formatQuantity(item.inventory.quantity, inventoryUnit);
        const thresholdText = formatQuantity(item.inventory.minThreshold, inventoryUnit);

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

export const buildPurchaseRequestEmailDraft = (request: PurchaseRequestRecord) => {
    const supplierName = request.supplier.name || 'nhà cung cấp';
    const subject = buildSupplierEmailSubject(request);
    const itemsList = request.items.map((item) => buildSupplierEmailItemLine(request, item)).join('\n');

    const generatedBody = `Kính gửi ${supplierName},

Cafe Admin đang có nhu cầu đặt hàng/báo giá cho các sản phẩm sau:

${itemsList}

Vui lòng hỗ trợ xác nhận:
- Khả năng cung ứng
- Đơn giá hiện tại
- Thời gian giao hàng dự kiến
- Điều kiện thanh toán nếu có

Nếu có thay đổi về quy cách đóng gói, số lượng tối thiểu hoặc thời gian giao hàng, vui lòng phản hồi lại để chúng tôi xác nhận trước khi đặt hàng chính thức.

Trân trọng,
Cafe Admin`;

    return {
        to: request.supplier.email || '',
        subject,
        body: isSupplierEmailContentUsable(request.emailContent) ? request.emailContent.trim() : generatedBody,
        status: emailStatusForRequest(request)
    };
};

const toDto = (request: PurchaseRequestRecord) => ({
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
    emailDraft: buildPurchaseRequestEmailDraft(request),
    items: request.items.map((item) => {
        const conversion = purchaseConversionForItem(request, item);

        return {
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
            notes: item.notes,
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

const requestNumber = (): string => `PR-${Date.now()}`;

export const purchaseService = {
    async list(filters: PurchaseRequestFiltersInput) {
        return (await purchaseRepository.findMany(filters)).map(toDto);
    },

    async get(id: string) {
        return toDto(await ensureRequest(id));
    },

    async create(input: CreatePurchaseRequestInput, userId: string) {
        if (!(await purchaseRepository.supplierExists(input.supplierId))) throw new HttpError(404, 'Supplier not found.');
        for (const item of input.items) {
            if (await purchaseRepository.hasActiveRequestForInventory(item.inventoryId)) {
                throw new HttpError(400, ACTIVE_PURCHASE_REQUEST_MESSAGE);
            }
        }
        try {
            return toDto(await purchaseRepository.create(input, userId, requestNumber()));
        } catch (error) {
            throw new HttpError(400, error instanceof Error ? error.message : 'Unable to create purchase request.');
        }
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
        try {
            const received = await purchaseRepository.receive(request, input, userId);
            const productIds = received.items.map((item) => item.productId);
            scanInventoryViaAgentService({
                productIds,
                triggerType: 'PURCHASE_RECEIVED',
                sourceType: 'PURCHASE_REQUEST',
                sourceId: id,
                note: 'Purchase request received'
            }, userId).catch((error) => {
                console.error('[AI_AGENT] Failed to scan inventory after purchase receive', error);
            });
            return toDto(received);
        } catch (error) {
            throw new HttpError(400, error instanceof Error ? error.message : 'Unable to receive purchase request.');
        }
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
