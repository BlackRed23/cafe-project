import { prisma, InventoryTransactionType } from '@cafe-project/database';
import { ACTIVE_PURCHASE_REQUEST_MESSAGE, agentRepository, type AgentInventoryRecord } from '../repositories/agent.repository';
import { recommendationService } from './recommendation.service';
import { AgentHttpError } from '../errors/http-error';
import { logger } from '../utils/logger';
import { fixAgentLogDisplayOutput, fixVietnameseMojibakeText } from '../utils/textEncoding';
import { calculateReorderPoint, DELAY_BUFFER_DAYS, SAFETY_BUFFER_DAYS } from '../utils/inventory.utils';

export type ScanInventoryInput = {
    productIds?: string[];
    triggerType?: string;
    sourceType?: string;
    sourceId?: string;
    note?: string;
};

export type RecommendReorderInput = {
    productIds?: string[];
    force?: boolean;
};

export type AgentLogStatus = 'SUCCESS' | 'SKIPPED' | 'FAILED' | 'RUNNING';

type AgentDemoFailureMode = 'SCAN_THROW' | 'DATABASE_READ_FAIL' | 'MISSING_ENV' | 'IMPORT_FAIL_SIMULATED';
type ReorderPlanningPeriod = 'WEEKLY' | 'MONTHLY' | 'CUSTOM';

export type AgentLogQuery = {
    page?: unknown;
    limit?: unknown;
    status?: unknown;
    action?: unknown;
    triggerType?: unknown;
    productId?: unknown;
};

const isSupplierActive = (supplier: { status?: string | null; deletedAt?: Date | null }): boolean =>
    supplier.status !== 'INACTIVE' && !supplier.deletedAt;

const parseBooleanSetting = (value: string | null, defaultValue: boolean): boolean => {
    if (value === null) return defaultValue;
    return value.trim().toLowerCase() !== 'false';
};

const parsePositiveIntSetting = (value: string | null): number | null => {
    if (value === null) return null;
    const parsed = Number.parseInt(value, 10);
    return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
};

const parseReorderPlanningPeriod = (value: string | null): ReorderPlanningPeriod => {
    if (value === 'MONTHLY' || value === 'CUSTOM') return value;
    return 'WEEKLY';
};

const planningDaysForPeriod = (period: ReorderPlanningPeriod, customDays: number | null): number => {
    if (period === 'MONTHLY') return 30;
    if (period === 'CUSTOM') return customDays && customDays > 0 ? customDays : 14;
    return 7;
};

const planningPeriodText = (period: ReorderPlanningPeriod): string => {
    if (period === 'MONTHLY') return 'chu ky nhap hang hang thang';
    if (period === 'CUSTOM') return 'chu ky nhap hang tuy chinh';
    return 'chu ky nhap hang hang tuan';
};

const safeJsonParse = (value?: string | null): any => {
    if (!value) return null;
    try {
        return JSON.parse(value);
    } catch {
        return null;
    }
};

const asString = (value: unknown): string | undefined =>
    typeof value === 'string' && value.trim() ? value.trim() : undefined;

const isAgentDemoFailureMode = (value: unknown): value is AgentDemoFailureMode =>
    value === 'SCAN_THROW' ||
    value === 'DATABASE_READ_FAIL' ||
    value === 'MISSING_ENV' ||
    value === 'IMPORT_FAIL_SIMULATED';

const getAgentDemoFailureMode = (): AgentDemoFailureMode | undefined => {
    if (process.env.NODE_ENV === 'production') return undefined;
    const mode = process.env.AGENT_DEMO_FAILURE_MODE;
    return isAgentDemoFailureMode(mode) ? mode : undefined;
};

const AGENT_DEMO_FAILURE_META: Record<AgentDemoFailureMode, { reason: string; message: string; errorMessage: string }> = {
    SCAN_THROW: {
        reason: 'AGENT_LOGIC_ERROR',
        message: 'AI Agent gặp lỗi nội bộ khi kiểm tra tồn kho.',
        errorMessage: 'Demo failure: scan inventory logic threw an error.'
    },
    DATABASE_READ_FAIL: {
        reason: 'DATABASE_ERROR',
        message: 'AI Agent không thể đọc dữ liệu tồn kho từ hệ thống.',
        errorMessage: 'Demo failure: inventory database read failed.'
    },
    MISSING_ENV: {
        reason: 'AGENT_CONFIG_ERROR',
        message: 'AI Agent thiếu cấu hình cần thiết để xử lý.',
        errorMessage: 'Demo failure: required Agent environment configuration is missing.'
    },
    IMPORT_FAIL_SIMULATED: {
        reason: 'AGENT_IMPORT_ERROR',
        message: 'Backend không thể nạp module AI Agent.',
        errorMessage: 'Demo failure: backend could not import the AI Agent module.'
    }
};

const normalizePage = (value: unknown): number => {
    const parsed = Number.parseInt(String(value ?? ''), 10);
    return Number.isInteger(parsed) && parsed > 0 ? parsed : 1;
};

const normalizeLimit = (value: unknown): number => {
    const parsed = Number.parseInt(String(value ?? ''), 10);
    if (!Number.isInteger(parsed) || parsed <= 0) return 20;
    return Math.min(parsed, 100);
};

const statusFromResult = (result?: string | null, errorMessage?: string | null): AgentLogStatus => {
    if (errorMessage) return 'FAILED';

    const normalized = (result || '').toUpperCase();
    if (['FAILED', 'ERROR', 'SERVER_ERROR', 'DATABASE_ERROR', 'SMTP_ERROR', 'INVALID_DATA'].includes(normalized)) return 'FAILED';
    if (normalized === 'RUNNING') return 'RUNNING';
    if (['SKIPPED', 'SKIPPED_DUPLICATE', 'SKIPPED_DISABLED', 'NO_SUPPLIER', 'ACTIVE_PR_EXISTS', 'AI_DISABLED', 'ABOVE_THRESHOLD', 'STOCK_OK'].includes(normalized)) {
        return 'SKIPPED';
    }
    return 'SUCCESS';
};

const reasonFromLog = (action?: string | null, result?: string | null, input?: any, output?: any): string | undefined => {
    const outputReason = asString(output?.reason);
    if (outputReason) return outputReason;
    const inputReason = asString(input?.reason);
    if (inputReason) return inputReason;
    const normalizedResult = (result || '').toUpperCase();
    if (normalizedResult === 'SKIPPED_DUPLICATE') return 'ACTIVE_PR_EXISTS';
    if (normalizedResult === 'SKIPPED_DISABLED') return 'AI_DISABLED';
    if (normalizedResult === 'NO_SUPPLIER') return 'NO_SUPPLIER';
    if (normalizedResult) return normalizedResult;
    return asString(action);
};

const messageFromLog = (action?: string | null, result?: string | null, reason?: string, errorMessage?: string | null, output?: any): string => {
    const outputMessage = asString(output?.message);
    if (outputMessage) return outputMessage;

    const normalizedAction = (action || '').toUpperCase();
    const normalizedResult = (result || '').toUpperCase();
    const normalizedReason = (reason || '').toUpperCase();

    if (normalizedAction === 'SCAN_INVENTORY_SESSION') {
        if (normalizedResult === 'SUCCESS') return 'AI Agent đã quét xong tồn kho.';
        if (normalizedResult === 'FAILED') return 'AI Agent quét tồn kho thất bại.';
        return 'AI Agent đang quét tồn kho.';
    }
    if (normalizedResult === 'CREATED_PURCHASE_REQUEST') {
        const sName = asString(output?.supplierName);
        return sName ? `Tồn kho dưới ngưỡng, đã tạo yêu cầu nhập hàng từ nhà cung cấp ${sName}.` : 'Tồn kho dưới ngưỡng, đã tạo yêu cầu nhập hàng từ nhà cung cấp.';
    }
    if (normalizedResult === 'NO_SUPPLIER' || normalizedReason === 'NO_SUPPLIER' || normalizedReason === 'NO_SUPPLIERS_MAPPED') {
        return 'Sản phẩm tồn kho thấp nhưng chưa có nhà cung cấp hợp lệ.';
    }
    if (normalizedReason === 'SUPPLIERS_INACTIVE' || normalizedReason === 'SUPPLIER_INACTIVE') {
        return 'Nhà cung cấp không hoạt động';
    }
    if (normalizedReason === 'PRODUCT_PENDING_DELETE') {
        return 'Sản phẩm đang chờ xoá nên Agent không tạo yêu cầu nhập hàng.';
    }
    if (normalizedResult === 'SKIPPED_DUPLICATE' || normalizedReason === 'ACTIVE_PR_EXISTS') {
        return 'Sản phẩm đã có yêu cầu nhập hàng đang chờ xử lý.';
    }
    if (normalizedResult === 'SKIPPED_DISABLED' || normalizedReason === 'AI_DISABLED') {
        return 'AI Agent đang tắt nên không thực hiện phân tích tồn kho.';
    }
    if (normalizedReason === 'ABOVE_THRESHOLD' || normalizedReason === 'STOCK_OK' || normalizedResult === 'SKIPPED') {
        return 'Tồn kho vẫn an toàn, chưa cần tạo yêu cầu nhập hàng.';
    }
    if (normalizedReason === 'AGENT_LOGIC_ERROR' || normalizedResult === 'FAILED' || normalizedReason === 'SERVER_ERROR') {
        return 'AI Agent gặp lỗi khi kiểm tra tồn kho.';
    }
    if (errorMessage && (normalizedAction === 'SEND_SUPPLIER_EMAIL' || normalizedResult === 'FAILED')) {
        return normalizedAction === 'SEND_SUPPLIER_EMAIL' ? 'Gửi email nhà cung cấp thất bại.' : 'Agent xử lý thất bại.';
    }
    if (normalizedReason === 'AGENT_LOGIC_ERROR') return 'AI Agent gặp lỗi nội bộ khi kiểm tra tồn kho.';
    if (normalizedReason === 'DATABASE_ERROR') return 'AI Agent không thể đọc dữ liệu tồn kho từ hệ thống.';
    if (normalizedReason === 'AGENT_CONFIG_ERROR') return 'AI Agent thiếu cấu hình cần thiết để xử lý.';
    if (normalizedReason === 'AGENT_IMPORT_ERROR') return 'Backend không thể nạp module AI Agent.';
    if (normalizedResult === 'CREATED_PURCHASE_REQUEST') {
        const sName = asString(output?.supplierName);
        return sName ? `Tồn kho dưới ngưỡng, đã tạo yêu cầu nhập hàng từ nhà cung cấp ${sName}.` : 'Tồn kho dưới ngưỡng, đã tạo yêu cầu nhập hàng từ nhà cung cấp.';
    }
    if (normalizedResult === 'RECOMMENDED') return 'AI Agent đã tạo khuyến nghị nhập hàng.';
    if (normalizedResult === 'CONVERTED_TO_PR') return 'Khuyến nghị đã được chuyển thành yêu cầu nhập hàng.';
    if (normalizedResult === 'SKIPPED_DUPLICATE' || normalizedReason === 'ACTIVE_PR_EXISTS') return 'Sản phẩm đã có yêu cầu nhập hàng chờ bạn xác nhận, nên AI Agent không tạo thêm.';
    if (normalizedResult === 'NO_SUPPLIER' || normalizedReason === 'NO_SUPPLIER' || normalizedReason === 'NO_SUPPLIERS_MAPPED') return 'Sản phẩm tồn kho thấp nhưng chưa có nhà cung cấp hợp lệ.';
    if (normalizedReason === 'SUPPLIERS_INACTIVE' || normalizedReason === 'SUPPLIER_INACTIVE') return 'Nhà cung cấp không hoạt động';
    if (normalizedReason === 'PRODUCT_PENDING_DELETE') return 'Sản phẩm đang chờ xoá nên Agent không tạo yêu cầu nhập hàng.';
    if (normalizedResult === 'SKIPPED_DISABLED' || normalizedReason === 'AI_DISABLED') return 'AI Agent đang bị tắt trong cấu hình hệ thống.';
    if (normalizedReason === 'ABOVE_THRESHOLD' || normalizedReason === 'STOCK_OK' || normalizedResult === 'SKIPPED') return 'Tồn kho vẫn đang ở mức an toàn nên Agent không tạo yêu cầu nhập hàng.';
    if (normalizedAction === 'SEND_SUPPLIER_EMAIL' && normalizedResult === 'SUCCESS') return 'Email đặt hàng đã được gửi cho nhà cung cấp.';
    if (normalizedAction === 'SEND_SUPPLIER_EMAIL' && normalizedResult === 'FAILED') return 'Gửi email nhà cung cấp thất bại.';
    return 'Agent đã ghi nhận một sự kiện xử lý.';
};

const derivePurchaseRequestId = (log: any, output: any): string | undefined => {
    const fromOutput = asString(output?.purchaseRequestId);
    if (fromOutput) return fromOutput;
    const referenceType = (log.reference_type || '').toLowerCase();
    if (referenceType === 'purchaserequest' || referenceType === 'purchase_request') return asString(log.reference_id);
    return undefined;
};

const getAgentSettings = async () => {
    const [enabled, slogan, promptPrefix, defaultMinThreshold, reorderPlanningPeriod, reorderPlanningCustomDays, storeName] = await Promise.all([
        agentRepository.getSettingValue('ai.enabled'),
        agentRepository.getSettingValue('ai.slogan'),
        agentRepository.getSettingValue('ai.promptPrefix'),
        agentRepository.getSettingValue('inventory.defaultMinThreshold'),
        agentRepository.getSettingValue('inventory.reorderPlanningPeriod'),
        agentRepository.getSettingValue('inventory.reorderPlanningCustomDays'),
        agentRepository.getSettingValue('store.name')
    ]);
    const planningPeriod = parseReorderPlanningPeriod(reorderPlanningPeriod);
    const customDays = parsePositiveIntSetting(reorderPlanningCustomDays);

    return {
        enabled: parseBooleanSetting(enabled, true),
        slogan,
        promptPrefix,
        storeName: storeName || 'Cafe Admin',
        defaultMinThreshold: parsePositiveIntSetting(defaultMinThreshold),
        reorderPlanningPeriod: planningPeriod,
        reorderPlanningDays: planningDaysForPeriod(planningPeriod, customDays)
    };
};

const toLogDto = (log: any) => {
    const input = safeJsonParse(log.input);
    const output = fixAgentLogDisplayOutput(safeJsonParse(log.output)) as any;
    const result = log.result || '';
    const reason = reasonFromLog(log.action, result, input, output);
    const status = statusFromResult(result, log.error_message);
    const purchaseRequestId = derivePurchaseRequestId(log, output);
    const productId = asString(output?.productId) || asString(input?.productId);
    const scanSessionId = asString(output?.scanSessionId) || asString(input?.scanSessionId);

    const sourceId = asString(output?.sourceId) || asString(input?.sourceId);
    const sourceType = asString(output?.sourceType) || asString(input?.sourceType);

    return {
        id: log.id,
        action: log.action,
        status,
        result,
        reason,
        message: fixVietnameseMojibakeText(messageFromLog(log.action, result, reason, log.error_message, output)),
        triggerType: asString(input?.triggerType),
        scanSessionId,
        productId,
        productName: asString(output?.productName) || asString(input?.productName),
        inventoryId: asString(input?.inventoryId) || asString(output?.inventoryId),
        purchaseRequestId,
        referenceType: log.reference_type,
        referenceId: log.reference_id,
        sourceId,
        sourceType,
        input,
        output,
        reasoning: fixVietnameseMojibakeText(log.reasoning),
        errorMessage: fixVietnameseMojibakeText(log.error_message),
        fallbackUsed: log.fallback_used,
        createdBy: log.creator ? { id: log.creator.id, name: log.creator.name, email: log.creator.email } : log.createdBy || null,
        createdAt: log.triggered_at,
        fallback_used: log.fallback_used,
        error_message: log.error_message,
        reference_type: log.reference_type,
        reference_id: log.reference_id
    };
};

const reasoningText = (inventory: AgentInventoryRecord, minThreshold: number, recommendedQty: number, supplierName?: string): string =>
    `Sản phẩm ${inventory.product.name} hiện còn ${inventory.quantity} ${inventory.unit}, thấp hơn hoặc bằng ngưỡng tối thiểu ${minThreshold} ${inventory.unit}.

Nhà cung cấp ${supplierName ?? 'không xác định'} được chọn vì có giá nhập phù hợp nhất trong dữ liệu hiện có.`;

const planningReasoningText = (
    inventory: AgentInventoryRecord,
    minThreshold: number,
    recommendedQty: number,
    planningPeriod: ReorderPlanningPeriod,
    planningDays: number,
    leadTimeDays: number,
    bufferDays: number,
    averageDailySales: number,
    supplierName?: string
): string => {
    const base = reasoningText(inventory, minThreshold, recommendedQty, supplierName);
    return `He thong dang tinh de xuat theo ${planningPeriodText(planningPeriod)}.

San pham ${inventory.product.name} hien can bo sung de dap ung nhu cau ban trong ${planningDays} ngay tiep theo, co tinh them thoi gian nhap hang ${leadTimeDays} ngay va muc du phong an toan ${bufferDays} ngay.

Toc do ban trung binh moi ngay dung lam du lieu nen: ${averageDailySales.toFixed(2)} ${inventory.unit}/ngay.

So luong de xuat: ${recommendedQty} ${inventory.unit}.

${base}`;
};

const withOptionalText = (base: string, optionalParts: Array<string | null>): string => {
    const prefix = optionalParts.map((part) => part?.trim()).filter(Boolean);
    return [...prefix, base].join('\n');
};

type AgentNotification = {
    type: 'success' | 'info' | 'warning' | 'error';
    title: string;
    description: string;
    actionLabel?: string;
    actionUrl?: string;
};

const notificationForCreatedPurchaseRequest = (productName: string, purchaseRequestId: string): AgentNotification => ({
    type: 'success',
    title: 'Đã tạo yêu cầu nhập hàng',
    description: `Sản phẩm "${productName}" còn thấp hơn ngưỡng. AI Agent đã tạo yêu cầu nhập hàng chờ admin xác nhận.`,
    actionLabel: 'Xem yêu cầu nhập hàng',
    actionUrl: `/admin/purchase-requests/${purchaseRequestId}`
});

const notificationForDuplicatePurchaseRequest = (productName: string, purchaseRequestId?: string): AgentNotification => ({
    type: 'info',
    title: 'Đã có yêu cầu nhập hàng chờ bạn xác nhận',
    description: `Sản phẩm "${productName}" đã có yêu cầu nhập hàng đang chờ xử lý, nên AI Agent không tạo thêm yêu cầu mới.`,
    actionLabel: 'Xem yêu cầu nhập hàng',
    actionUrl: purchaseRequestId ? `/admin/purchase-requests/${purchaseRequestId}` : '/admin/purchase-requests'
});

const notificationForNoSupplier = (productName: string): AgentNotification => ({
    type: 'warning',
    title: 'Thiếu nhà cung cấp',
    description: `Sản phẩm "${productName}" chưa có nhà cung cấp phù hợp, nên AI Agent không thể tạo yêu cầu nhập hàng.`,
    actionLabel: 'Kiểm tra nhà cung cấp',
    actionUrl: '/admin/suppliers'
});

const notificationForInactiveSupplier = (productName: string): AgentNotification => ({
    type: 'warning',
    title: 'Nhà cung cấp không hoạt động',
    description: `Sản phẩm "${productName}" có nhà cung cấp nhưng nhà cung cấp đang ngưng hoạt động.`,
    actionLabel: 'Kiểm tra nhà cung cấp',
    actionUrl: '/admin/suppliers'
});

const notificationForAiDisabled = (): AgentNotification => ({
    type: 'info',
    title: 'AI Agent đang tắt',
    description: 'Hệ thống đã phát hiện biến động tồn kho nhưng AI Agent đang bị tắt trong cấu hình.',
    actionLabel: 'Mở cài đặt',
    actionUrl: '/admin/settings'
});

const notificationForAgentFailed = (productName?: string): AgentNotification => ({
    type: 'error',
    title: 'AI Agent service không khả dụng',
    description: `Không kết nối được AI Agent service. Vui lòng kiểm tra tiến trình apps/agent.`,
    actionLabel: 'Xem nhật ký Agent',
    actionUrl: '/admin/agent-logs'
});

const notificationForDemoFailure = (description: string): AgentNotification => ({
    type: 'error',
    title: 'AI Agent service không khả dụng',
    description,
    actionLabel: 'Xem nhật ký Agent',
    actionUrl: '/admin/agent-logs'
});

const createDemoFailureLog = async (
    mode: AgentDemoFailureMode,
    input: ScanInventoryInput,
    triggerType: string,
    userId?: string
) => {
    const meta = AGENT_DEMO_FAILURE_META[mode];
    const failureInput = {
        triggerType,
        productIds: input.productIds,
        sourceType: input.sourceType,
        sourceId: input.sourceId,
        note: input.note,
        demoFailureMode: mode
    };
    const failureOutput = {
        failed: true,
        demoFailureMode: mode,
        reason: meta.reason,
        message: meta.message,
        errorMessage: meta.errorMessage,
        notification: notificationForDemoFailure(meta.message)
    };

    const log = await agentRepository.createLog({
        action: 'SCAN_INVENTORY_FAILED',
        input: JSON.stringify(failureInput),
        output: JSON.stringify(failureOutput),
        reasoning: `Demo failure mode ${mode} was enabled for non-production Agent testing.`,
        result: 'FAILED',
        fallback_used: false,
        error_message: meta.errorMessage,
        reference_type: 'AgentDemoFailure',
        reference_id: mode,
        creator: userId ? { connect: { id: userId } } : undefined
    });

    return toLogDto(log);
};

let activeScanSessionId: string | null = null;
let activeTriggerType: string | null = null;
let activeScanStartedAt: number | null = null;

let lastManualScanAt: number = 0;
const MANUAL_SCAN_COOLDOWN_MS = 60 * 1000;

export const agentService = {
    async scanInventory(input: ScanInventoryInput = { triggerType: 'MANUAL_SCAN' }, userId?: string) {
        const triggerType = input.triggerType || 'MANUAL_SCAN';
        const demoFailureMode = getAgentDemoFailureMode();
        if (demoFailureMode) {
            const log = await createDemoFailureLog(demoFailureMode, input, triggerType, userId);
            return { results: [log], createdPurchaseRequests: [] };
        }

        const settings = await getAgentSettings();

        if (triggerType === 'MANUAL_ADMIN_SCAN') {
            const now = Date.now();
            if (lastManualScanAt > 0 && now - lastManualScanAt < MANUAL_SCAN_COOLDOWN_MS) {
                const remaining = Math.ceil((MANUAL_SCAN_COOLDOWN_MS - (now - lastManualScanAt)) / 1000);
                return {
                    results: [],
                    createdPurchaseRequests: [],
                    cooldownRemainingSeconds: remaining,
                    agentWarning: `AI Agent vừa quét gần đây, vui lòng chờ ${remaining}s trước khi quét lại.`
                };
            }
        }

        if (activeScanSessionId) {
            return {
                results: [],
                createdPurchaseRequests: [],
                activeScanSessionId,
                activeTriggerType,
                startedAt: activeScanStartedAt,
                agentWarning: `AI Agent đang quét tồn kho, vui lòng chờ hoàn tất.`
            };
        }

        const scanSessionId = `scan_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
        activeScanSessionId = scanSessionId;
        activeTriggerType = triggerType;
        activeScanStartedAt = Date.now();
        if (triggerType === 'MANUAL_ADMIN_SCAN') {
            lastManualScanAt = Date.now();
        }

        let sessionLog;
        try {
            const scanStartedAt = new Date();
            logger.info(`[AgentScan] SESSION START | sessionId=${scanSessionId} | trigger=${triggerType} | sourceType=${input.sourceType} | sourceId=${input.sourceId}`);
            sessionLog = await agentRepository.createLog({
                action: 'SCAN_INVENTORY_SESSION',
                input: JSON.stringify({ scanSessionId, triggerType, sourceType: input.sourceType, sourceId: input.sourceId, productIds: input.productIds, startedAt: scanStartedAt.toISOString() }),
                output: JSON.stringify({ scanSessionId }),
                reasoning: 'AI Agent bắt đầu quét tồn kho.',
                result: 'RUNNING',
                fallback_used: false,
                creator: userId ? { connect: { id: userId } } : undefined
            });

            if (!settings.enabled) {
                const log = await agentRepository.createLog({
                    action: 'SCAN_INVENTORY_DISABLED',
                    input: JSON.stringify({ scanSessionId, triggerType, productIds: input.productIds, sourceType: input.sourceType, sourceId: input.sourceId, note: input.note }),
                    output: JSON.stringify({ scanSessionId, skipped: true, reason: 'AI_DISABLED', notification: notificationForAiDisabled() }),
                    reasoning: 'AI Agent is disabled by system setting.',
                    result: 'SKIPPED_DISABLED',
                    fallback_used: false,
                    reference_type: 'SystemSetting',
                    reference_id: 'ai.enabled',
                    creator: userId ? { connect: { id: userId } } : undefined
                });

                await agentRepository.updateLog(sessionLog.id, {
                    result: 'SUCCESS',
                    reasoning: 'AI Agent đã quét xong tồn kho (nhưng đang bị tắt).',
                    output: JSON.stringify({
                        scanSessionId,
                        finishedAt: new Date().toISOString(),
                        durationMs: Date.now() - (activeScanStartedAt || Date.now()),
                        totalChecked: 0,
                        createdPurchaseRequestCount: 0,
                        skippedDuplicateCount: 0,
                        noSupplierCount: 0,
                        failedCount: 0,
                        stockOkCount: 0
                    })
                });

                activeScanSessionId = null;
                activeTriggerType = null;
                activeScanStartedAt = null;

                return { results: [toLogDto(log)], createdPurchaseRequests: [], scanSessionId, sessionStatus: 'SUCCESS', summary: { totalChecked: 0, createdPurchaseRequestCount: 0, skippedDuplicateCount: 0, noSupplierCount: 0, failedCount: 0, stockOkCount: 0 } };
            }

            const inventories = await agentRepository.findInventories(input.productIds);
            const results = [];
            const createdPurchaseRequests = [];

            for (const inventory of inventories) {
                const product = inventory.product;
                try {
                    const minThreshold = settings.defaultMinThreshold ?? inventory.minThreshold;
                    const supplierProduct = product.supplierProducts.find((sp) => isSupplierActive(sp.supplier));

                    const planningDays = settings.reorderPlanningDays;

                    const thirtyDaysAgo = new Date();
                    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
                    const recentSales = await prisma.inventoryTransaction.aggregate({
                        where: {
                            productId: product.id,
                            type: { in: [InventoryTransactionType.ORDER, InventoryTransactionType.SIMULATE_SALE] },
                            createdAt: { gte: thirtyDaysAgo }
                        },
                        _sum: { quantity: true }
                    });
                    const totalSold = Math.abs(recentSales._sum.quantity || 0);
                    const averageDailySales = totalSold / 30;

                    // Dùng calculateReorderPoint chung — đồng bộ tiêu chí với recommendationService
                    const leadTimeDays = supplierProduct?.leadTimeDays && supplierProduct.leadTimeDays > 0 ? supplierProduct.leadTimeDays : 0;
                    const { baseDailySales, effectiveLeadTimeDays, safetyStock, leadTimeDemand, reorderPoint } = calculateReorderPoint(averageDailySales, leadTimeDays);
                    const delayBufferDays = DELAY_BUFFER_DAYS;
                    const bufferDays = SAFETY_BUFFER_DAYS;

                    const targetStock = baseDailySales > 0
                        ? Math.ceil(baseDailySales * (planningDays + effectiveLeadTimeDays + bufferDays))
                        : minThreshold;
                    const minimumReorderQty = supplierProduct?.minOrderQuantity && supplierProduct.minOrderQuantity > 0 ? supplierProduct.minOrderQuantity : 1;
                    const recommendedQty = Math.max(targetStock - inventory.quantity, minimumReorderQty, minThreshold - inventory.quantity, 1);
                    const backupSuppliers = product.supplierProducts
                        .filter((sp) => sp.supplierId !== supplierProduct?.supplierId && isSupplierActive(sp.supplier))
                        .map((sp) => ({
                            supplierId: sp.supplierId,
                            supplierName: sp.supplier.name,
                            isPreferred: sp.isPreferred,
                            leadTimeDays: sp.leadTimeDays,
                            moq: sp.minOrderQuantity,
                            purchasePrice: Number(sp.price)
                        }));
                    const currentQty = inventory.quantity;
                    const reservedQty = inventory.reservedStock ?? 0;
                    const availableStock = currentQty - reservedQty;

                    const baseOutput = {
                        scanSessionId,
                        triggerType,
                        sourceType: input.sourceType,
                        sourceId: input.sourceId,
                        productId: inventory.productId,
                        productName: product.name,
                        sku: product.sku,
                        quantity: inventory.quantity,
                        reservedStock: reservedQty,
                        availableStock,
                        minThreshold,
                        safetyStock,
                        recommendedThreshold: targetStock
                    };

                    const baseInput = {
                        ...baseOutput,
                        note: input.note,
                        inventoryId: inventory.id,
                        avgDailySales: Number(averageDailySales.toFixed(2)),
                        reorderPlanningPeriod: settings.reorderPlanningPeriod,
                        reorderPlanningDays: planningDays,
                        leadTimeDays: supplierProduct?.leadTimeDays ?? null,
                        delayBufferDays,
                        reorderPoint,
                        recommendedQty,
                        backupSuppliers,
                        capacityNote: 'SupplierProduct hiện chưa có availableQuantity/capacity; Agent không tự kết luận nhà cung cấp đủ hay thiếu.'
                    };

                    if (product.pendingDeleteUntil) {
                        const log = await agentRepository.createLog({
                            action: 'SCAN_INVENTORY_SKIP',
                            input: JSON.stringify(baseInput),
                            output: JSON.stringify({
                                ...baseOutput,
                                skipped: true,
                                reason: 'PRODUCT_PENDING_DELETE',
                                inventoryId: inventory.id,
                                message: 'Sản phẩm đang chờ xoá nên Agent không tạo yêu cầu nhập hàng.'
                            }),
                            reasoning: 'Sản phẩm đang chờ xoá nên Agent không tạo yêu cầu nhập hàng.',
                            result: 'SKIPPED',
                            fallback_used: false,
                            reference_type: 'Inventory',
                            reference_id: inventory.id,
                            creator: userId ? { connect: { id: userId } } : undefined
                        });
                        results.push(toLogDto(log));
                        continue;
                    }

                    const startOfToday = new Date();
                    startOfToday.setHours(0, 0, 0, 0);
                    const activeBatches = inventory.batches?.filter(b => b.quantity > 0) || [];
                    let hasBatchWarning = false;

                    for (const batch of activeBatches) {
                        const expDate = new Date(batch.expirationDate);
                        const diffTime = expDate.getTime() - startOfToday.getTime();
                        const daysLeft = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

                        let warningType = 'SAFE';
                        let actionLabel = 'SCAN_INVENTORY_SAFE';
                        let reasoning = 'Lô hàng an toàn.';
                        let title = 'Thông báo lô hàng';
                        let actionMsg = 'Không cần xử lý';

                        if (daysLeft < 0) {
                            warningType = 'EXPIRED';
                            actionLabel = 'SCAN_INVENTORY_EXPIRED';
                            reasoning = 'Phát hiện lô hàng hết hạn cần xử lý xuất hủy.';
                            title = 'Cảnh báo lô hàng hết hạn';
                            actionMsg = 'Khóa lô và yêu cầu điều chỉnh/hủy';
                        } else if (daysLeft <= 3) {
                            warningType = 'CRITICAL_EXPIRY';
                            actionLabel = 'SCAN_INVENTORY_CRITICAL_EXPIRY';
                            reasoning = 'Phát hiện lô hàng sắp hết hạn mức độ nghiêm trọng.';
                            title = 'Cảnh báo lô hàng cực kỳ cận hạn';
                            actionMsg = 'Đề xuất bán gấp/khuyến mãi';
                        } else if (daysLeft <= 7) {
                            warningType = 'NEAR_EXPIRY';
                            actionLabel = 'SCAN_INVENTORY_NEAR_EXPIRY';
                            reasoning = 'Phát hiện lô hàng sắp hết hạn cần đẩy bán nhanh.';
                            title = 'Cảnh báo lô hàng cận hạn';
                            actionMsg = 'Theo dõi hoặc chuẩn bị khuyến mãi';
                        }

                        if (warningType !== 'SAFE') {
                            hasBatchWarning = true;
                            const dedupeKey = `batch_expiry_${inventory.productId}_${batch.id}_${warningType}_${startOfToday.toISOString().split('T')[0]}`;

                            const existingLog = await prisma.agentLog.findFirst({
                                where: { action: actionLabel, output: { contains: dedupeKey } }
                            });

                            if (!existingLog) {
                                const message = `AI Agent phát hiện sản phẩm ${product.name}, lô ${batch.batchCode} ${warningType === 'EXPIRED' ? 'đã hết hạn' : 'sắp hết hạn trong ' + daysLeft + ' ngày'}.`;
                                const log = await agentRepository.createLog({
                                    action: actionLabel,
                                    input: JSON.stringify(baseInput),
                                    output: JSON.stringify({
                                        ...baseOutput,
                                        reason: warningType,
                                        inventoryId: inventory.id,
                                        message,
                                        batchId: batch.id,
                                        dedupeKey,
                                        notification: {
                                            title,
                                            description: message,
                                            productName: product.name,
                                            batchCode: batch.batchCode,
                                            quantity: batch.quantity,
                                            expirationDate: batch.expirationDate,
                                            daysLeft,
                                            action: actionMsg,
                                            actionLabel: "Xem chi tiết lô",
                                            actionUrl: `/admin/inventory/${inventory.productId}`
                                        }
                                    }),
                                    reasoning,
                                    result: 'WARNING',
                                    fallback_used: false,
                                    reference_type: 'Inventory',
                                    reference_id: inventory.id,
                                    creator: userId ? { connect: { id: userId } } : undefined
                                });
                                results.push(toLogDto(log));
                            }
                        }
                    }

                    if (availableStock > reorderPoint) {
                        const log = await agentRepository.createLog({
                            action: 'SCAN_INVENTORY_STOCK_OK',
                            input: JSON.stringify(baseInput),
                            output: JSON.stringify({
                                ...baseOutput,
                                skipped: true,
                                reason: 'STOCK_OK',
                                inventoryId: inventory.id,
                                message: 'AI Agent đã quét xong, tồn kho vẫn an toàn'
                            }),
                            reasoning: 'Tồn kho vẫn đang ở mức an toàn.',
                            result: 'STOCK_OK',
                            fallback_used: false,
                            reference_type: 'Inventory',
                            reference_id: inventory.id,
                            creator: userId ? { connect: { id: userId } } : undefined
                        });
                        results.push(toLogDto(log));
                        continue;
                    }

                    if (availableStock === reorderPoint && availableStock > 0) {
                        const log = await agentRepository.createLog({
                            action: 'SCAN_INVENTORY_WARNING',
                            input: JSON.stringify(baseInput),
                            output: JSON.stringify({
                                ...baseOutput,
                                skipped: true,
                                reason: 'THRESHOLD_REACHED',
                                inventoryId: inventory.id,
                                message: `AI Agent tự động quét tồn kho sản phẩm ${product.name}. Khả dụng ${availableStock}, ngưỡng ${minThreshold}. Sản phẩm cần nhập hàng.`
                            }),
                            reasoning: 'Tồn kho khả dụng vừa chạm ngưỡng, ghi nhận cảnh báo nhưng chưa tạo PR.',
                            result: 'WARNING',
                            fallback_used: false,
                            reference_type: 'Inventory',
                            reference_id: inventory.id,
                            creator: userId ? { connect: { id: userId } } : undefined
                        });
                        results.push(toLogDto(log));
                        continue;
                    }

                    const openPurchaseRequest = await agentRepository.findOpenPurchaseRequest(inventory.productId, inventory.id);
                    if (openPurchaseRequest) {
                        const isPRSupplierActive = isSupplierActive(openPurchaseRequest.supplier);

                        if (!isPRSupplierActive) {
                            const suggestedSuppliers = product.supplierProducts
                                .filter((sp) => sp.supplierId !== openPurchaseRequest.supplier.id && isSupplierActive(sp.supplier))
                                .map((sp) => ({
                                    supplierId: sp.supplierId,
                                    supplierName: sp.supplier.name,
                                    isPreferred: sp.isPreferred,
                                    leadTimeDays: sp.leadTimeDays,
                                    moq: sp.minOrderQuantity,
                                    purchasePrice: Number(sp.price)
                                }));

                            const reasoning = suggestedSuppliers.length > 0
                                ? 'Đã có yêu cầu nhập hàng đang chờ xử lý nhưng nhà cung cấp của yêu cầu này hiện đã bị tắt. Agent tìm thấy nhà cung cấp thay thế đang hoạt động.'
                                : 'Đã có yêu cầu nhập hàng đang chờ xử lý nhưng nhà cung cấp của yêu cầu này hiện đã bị tắt. Không có nhà cung cấp thay thế đang hoạt động.';

                            const log = await agentRepository.createLog({
                                action: 'SCAN_INVENTORY_SKIP_DUPLICATE',
                                input: JSON.stringify(baseInput),
                                output: JSON.stringify({
                                    ...baseOutput,
                                    skipped: true,
                                    reason: 'EXISTING_PR_SUPPLIER_INACTIVE',
                                    inventoryId: inventory.id,
                                    existingPurchaseRequestId: openPurchaseRequest.id,
                                    existingPurchaseRequestStatus: openPurchaseRequest.status,
                                    supplierId: openPurchaseRequest.supplier.id,
                                    supplierName: openPurchaseRequest.supplier.name,
                                    supplierStatus: 'INACTIVE',
                                    suggestedSuppliers,
                                    message: `AI Agent bỏ qua sản phẩm ${product.name} vì đã có yêu cầu nhập hàng đang xử lý.`,
                                    notification: {
                                        title: "Yêu cầu nhập hàng dùng nhà cung cấp đã tắt",
                                        description: `Sản phẩm ${product.name} đang có yêu cầu nhập hàng chờ xử lý, nhưng nhà cung cấp ${openPurchaseRequest.supplier.name} hiện đã ngừng hoạt động.`,
                                        actionLabel: "Xem yêu cầu nhập hàng",
                                        actionUrl: `/admin/purchase-requests/${openPurchaseRequest.id}`
                                    }
                                }),
                                reasoning,
                                result: 'SKIPPED',
                                fallback_used: true,
                                reference_type: 'Inventory',
                                reference_id: inventory.id,
                                creator: userId ? { connect: { id: userId } } : undefined
                            });
                            results.push(toLogDto(log));
                            continue;
                        } else {
                            const reasoning = 'Đã có yêu cầu nhập hàng đang chờ xử lý, Agent không tạo thêm yêu cầu mới để tránh trùng.';
                            const log = await agentRepository.createLog({
                                action: 'SCAN_INVENTORY_SKIP_DUPLICATE',
                                input: JSON.stringify(baseInput),
                                output: JSON.stringify({
                                    ...baseOutput,
                                    skipped: true,
                                    reason: 'ACTIVE_PR_EXISTS',
                                    inventoryId: inventory.id,
                                    purchaseRequestId: openPurchaseRequest.id,
                                    message: `AI Agent bỏ qua sản phẩm ${product.name} vì đã có yêu cầu nhập hàng đang xử lý.`,
                                    notification: notificationForDuplicatePurchaseRequest(product.name, openPurchaseRequest.id)
                                }),
                                reasoning,
                                result: 'SKIPPED_DUPLICATE',
                                fallback_used: true,
                                reference_type: 'Inventory',
                                reference_id: inventory.id,
                                creator: userId ? { connect: { id: userId } } : undefined
                            });
                            results.push(toLogDto(log));
                            continue;
                        }
                    }

                    if (product.supplierProducts.length === 0) {
                        const reasoning = 'Sản phẩm chưa được liên kết với nhà cung cấp.';
                        const log = await agentRepository.createLog({
                            action: 'SCAN_INVENTORY_NO_SUPPLIER',
                            input: JSON.stringify(baseInput),
                            output: JSON.stringify({
                                ...baseOutput,
                                skipped: true,
                                reason: 'NO_SUPPLIER',
                                inventoryId: inventory.id,
                                message: `AI Agent phát hiện sản phẩm ${product.name} chưa có nhà cung cấp.`,
                                notification: notificationForNoSupplier(product.name)
                            }),
                            reasoning,
                            result: 'NO_SUPPLIER',
                            fallback_used: true,
                            reference_type: 'Inventory',
                            reference_id: inventory.id,
                            creator: userId ? { connect: { id: userId } } : undefined
                        });
                        results.push(toLogDto(log));
                        continue;
                    }

                    if (!supplierProduct) {
                        const reasoning = 'Nhà cung cấp của sản phẩm đang bị vô hiệu hóa.';
                        const log = await agentRepository.createLog({
                            action: 'SCAN_INVENTORY_INACTIVE_SUPPLIER',
                            input: JSON.stringify(baseInput),
                            output: JSON.stringify({
                                ...baseOutput,
                                skipped: true,
                                reason: 'SUPPLIERS_INACTIVE',
                                inventoryId: inventory.id,
                                supplierIds: product.supplierProducts.map((sp) => sp.supplierId),
                                inactiveSupplierIds: product.supplierProducts.filter((sp) => !isSupplierActive(sp.supplier)).map((sp) => sp.supplierId),
                                message: `AI Agent phát hiện sản phẩm ${product.name} chưa có nhà cung cấp.`,
                                notification: notificationForInactiveSupplier(product.name)
                            }),
                            reasoning,
                            result: 'SKIPPED',
                            fallback_used: true,
                            reference_type: 'Inventory',
                            reference_id: inventory.id,
                            creator: userId ? { connect: { id: userId } } : undefined
                        });
                        results.push(toLogDto(log));
                        continue;
                    }

                    if (triggerType === 'PURCHASE_RECEIVED') {
                        const reasoningWarning = 'Sau khi nhận hàng, tồn kho vẫn thấp hơn mức cần thiết. Admin cần kiểm tra lại số lượng nhập hoặc tạo yêu cầu bổ sung.';
                        const log = await agentRepository.createLog({
                            action: 'SCAN_INVENTORY_WARNING',
                            input: JSON.stringify(baseInput),
                            output: JSON.stringify({
                                ...baseOutput,
                                skipped: true,
                                reason: 'RECEIVED_BUT_LOW_STOCK',
                                inventoryId: inventory.id,
                                message: reasoningWarning,
                                notification: {
                                    title: "Tồn kho vẫn thấp sau khi nhập hàng",
                                    description: `Sản phẩm "${product.name}" vẫn dưới ngưỡng tồn kho sau khi nhập hàng.`,
                                    actionLabel: "Kiểm tra tồn kho",
                                    actionUrl: `/admin/inventory`
                                }
                            }),
                            reasoning: reasoningWarning,
                            result: 'WARNING',
                            fallback_used: false,
                            reference_type: 'Inventory',
                            reference_id: inventory.id,
                            creator: userId ? { connect: { id: userId } } : undefined
                        });
                        results.push(toLogDto(log));
                        continue;
                    }

                    // BUG 2 FIX: Cảnh báo khi có NCC backup giao nhanh hơn đáng kể (>2x) so với NCC được chọn.
                    // Chỉ ghi warning vào reasoning log, KHÔNG thay đổi NCC đã được chọn.
                    let backupSupplierWarning: string | null = null;
                    const selectedLeadTime = supplierProduct.leadTimeDays ?? 0;
                    if (backupSuppliers.length > 0 && selectedLeadTime > 0) {
                        const fasterBackup = backupSuppliers
                            .filter(b => b.leadTimeDays < selectedLeadTime)
                            .sort((a, b) => a.leadTimeDays - b.leadTimeDays)[0];
                        if (fasterBackup && selectedLeadTime > fasterBackup.leadTimeDays * 2) {
                            const leadTimeDiff = selectedLeadTime - fasterBackup.leadTimeDays;
                            const priceDiff = fasterBackup.purchasePrice - Number(supplierProduct.price);
                            const priceSign = priceDiff >= 0 ? '+' : '';
                            backupSupplierWarning = `[Goi y NCC thay the] ${fasterBackup.supplierName} giao nhanh hon ${leadTimeDiff} ngay so voi NCC duoc chon (${supplierProduct.supplier.name}), gia chi chenh ${priceSign}${Math.abs(priceDiff).toFixed(0)} tren moi don vi hang.`;
                        }
                    }

                    const reasoning = withOptionalText(
                        planningReasoningText(
                            inventory,
                            minThreshold,
                            recommendedQty,
                            settings.reorderPlanningPeriod,
                            planningDays,
                            leadTimeDays,
                            delayBufferDays,
                            averageDailySales,
                            supplierProduct.supplier.name
                        ),
                        [
                            availableStock === 0 ? 'Tồn kho khả dụng đã bằng 0, cần ưu tiên tạo yêu cầu nhập hàng khẩn cấp.' : null,
                            backupSupplierWarning,
                            settings.promptPrefix,
                            settings.slogan
                        ]
                    );
                    const request = await agentRepository.createAiPurchaseRequest(inventory, supplierProduct, recommendedQty, reasoning, userId);
                    createdPurchaseRequests.push({ id: request.id, requestNumber: request.requestNumber, supplierName: supplierProduct.supplier.name, status: request.status });
                    const output = {
                        ...baseOutput,
                        reason: 'CREATED_PURCHASE_REQUEST',
                        inventoryId: inventory.id,
                        purchaseRequestId: request.id,
                        purchaseRequestCode: request.requestNumber,
                        recommendedSupplierId: supplierProduct.supplierId,
                        supplierName: supplierProduct.supplier.name,
                        recommendedQty,
                        backupSuppliers,
                        confidence: 0.82,
                        message: `AI Agent tự động quét tồn kho sản phẩm ${product.name}. Khả dụng ${availableStock}, ngưỡng ${minThreshold}. Sản phẩm cần nhập hàng.\nAI Agent đã tạo yêu cầu nhập hàng ${request.requestNumber} cho sản phẩm ${product.name}.`,
                        notification: notificationForCreatedPurchaseRequest(product.name, request.id)
                    };
                    logger.info(`[AgentScan] CREATE_PR | product="${product.name}" (${inventory.productId}) | qty=${recommendedQty} | supplier="${supplierProduct.supplier.name}"`, { input: baseInput, output });
                    const log = await agentRepository.createLog({
                        action: 'SCAN_INVENTORY_CREATE_PURCHASE_REQUEST',
                        input: JSON.stringify(baseInput),
                        output: JSON.stringify(output),
                        reasoning,
                        result: 'CREATED_PURCHASE_REQUEST',
                        fallback_used: true,
                        reference_type: 'PurchaseRequest',
                        reference_id: request.id,
                        creator: userId ? { connect: { id: userId } } : undefined
                    });
                    results.push(toLogDto(log));
                } catch (error) {
                    const errorMessage = error instanceof Error ? error.message : String(error);
                    const failureInput = {
                        scanSessionId,
                        triggerType,
                        sourceType: input.sourceType,
                        sourceId: input.sourceId,
                        note: input.note,
                        inventoryId: inventory.id,
                        productId: inventory.productId,
                        productName: product.name
                    };
                    const failureOutput = {
                        scanSessionId,
                        triggerType,
                        sourceType: input.sourceType,
                        sourceId: input.sourceId,
                        reason: 'SERVER_ERROR',
                        message: 'AI Agent không thể kiểm tra tồn kho cho sản phẩm này.',
                        errorMessage,
                        productId: inventory.productId,
                        productName: product.name,
                        inventoryId: inventory.id,
                        notification: notificationForAgentFailed(product.name)
                    };
                    logger.error(`[AgentScan] FAILED | product="${product.name}" (${inventory.productId}) | error="${errorMessage}"`, { input: failureInput, output: failureOutput });
                    const log = await agentRepository.createLog({
                        action: 'SCAN_INVENTORY_FAILED',
                        input: JSON.stringify(failureInput),
                        output: JSON.stringify(failureOutput),
                        reasoning: 'AI Agent failed while scanning inventory.',
                        result: 'FAILED',
                        fallback_used: false,
                        error_message: errorMessage,
                        reference_type: 'Inventory',
                        reference_id: inventory.id,
                        creator: userId ? { connect: { id: userId } } : undefined
                    });
                    results.push(toLogDto(log));
                }
            }

            const scanFinishedAt = Date.now();
            const durationMs = scanFinishedAt - (activeScanStartedAt || scanFinishedAt);
            const summary = {
                totalProductsScanned: inventories.length,
                stockOkCount: results.filter(r => r.result === 'STOCK_OK').length,
                warningCount: results.filter(r => r.reason === 'THRESHOLD_REACHED' || r.result === 'WARNING').length,
                atThresholdCount: results.filter(r => r.reason === 'THRESHOLD_REACHED').length,
                lowStockCount: results.filter(r => r.result === 'CREATED_PURCHASE_REQUEST' || r.reason === 'LOW_STOCK' || r.result === 'NO_SUPPLIER').length,
                outOfStockCount: results.filter(r => r.reason === 'OUT_OF_STOCK').length,
                noSupplierCount: results.filter(r => r.result === 'NO_SUPPLIER' || r.reason === 'SUPPLIERS_INACTIVE').length,
                skippedDuplicatePrCount: results.filter(r => r.result === 'SKIPPED_DUPLICATE' || r.reason === 'ACTIVE_PR_EXISTS' || r.reason === 'EXISTING_PR_SUPPLIER_INACTIVE').length,
                purchaseRequestCreatedCount: createdPurchaseRequests.length,
                errorCount: results.filter(r => r.result === 'FAILED').length
            };

            await agentRepository.updateLog(sessionLog.id, {
                result: 'SUCCESS',
                reasoning: 'AI Agent đã quét xong tồn kho.',
                output: JSON.stringify({
                    scanSessionId,
                    triggerType,
                    finishedAt: new Date(scanFinishedAt).toISOString(),
                    durationMs,
                    ...summary
                })
            });

            activeScanSessionId = null;
            activeTriggerType = null;
            activeScanStartedAt = null;

            return { results, createdPurchaseRequests, scanSessionId, sessionStatus: 'SUCCESS', summary };
        } catch (error) {
            activeScanSessionId = null;
            activeTriggerType = null;
            activeScanStartedAt = null;

            if (sessionLog) {
                await agentRepository.updateLog(sessionLog.id, {
                    result: 'FAILED',
                    reasoning: 'SERVER_ERROR',
                    error_message: error instanceof Error ? error.message : String(error),
                    output: JSON.stringify({
                        scanSessionId,
                        failed: true,
                        errorMessage: error instanceof Error ? error.message : String(error)
                    })
                });
            }
            throw error;
        }
    },

    async logs(query: AgentLogQuery = {}) {
        const page = normalizePage(query.page);
        const limit = normalizeLimit(query.limit);
        const action = asString(query.action);
        const statusFilter = asString(query.status)?.toUpperCase() as AgentLogStatus | undefined;
        const triggerType = asString(query.triggerType);
        const productId = asString(query.productId);

        const rawLogs = await agentRepository.findLogs({
            ...(action ? { action } : {}),
            ...(productId
                ? {
                    OR: [
                        { input: { contains: productId } },
                        { output: { contains: productId } },
                        { reference_id: productId }
                    ]
                }
                : {})
        });

        const filtered = rawLogs
            .map(toLogDto)
            .filter((log: ReturnType<typeof toLogDto>) => (statusFilter ? log.status === statusFilter : true))
            .filter((log: ReturnType<typeof toLogDto>) => (triggerType ? log.triggerType === triggerType : true))
            .filter((log: ReturnType<typeof toLogDto>) => (productId ? log.productId === productId || log.referenceId === productId : true));

        const total = filtered.length;
        const totalPages = Math.max(1, Math.ceil(total / limit));
        const safePage = Math.min(page, totalPages);
        const start = (safePage - 1) * limit;

        return {
            logs: filtered.slice(start, start + limit),
            pagination: {
                page: safePage,
                limit,
                total,
                totalPages
            }
        };
    },

    async recommendReorder(input: RecommendReorderInput = { force: false }, userId: string) {
        const productIds = input.productIds || await agentRepository.findActiveProductIds();
        const recommendations = [];
        const skippedProducts = [];

        for (const id of productIds) {
            try {
                const res = await recommendationService.generateForProduct(id, input.force, userId);
                if (res.skipped && res.skippedProduct) skippedProducts.push(res.skippedProduct);
                if (!res.skipped && res.recommendation) {
                    recommendations.push({
                        logId: res.logId,
                        ...res.recommendation
                    });
                }
            } catch (err: any) {
                logger.error(`Recommendation failed for product ${id}:`, err);
            }
        }

        return {
            scannedCount: productIds.length,
            newRecommendationsCount: recommendations.length,
            skippedCount: skippedProducts.length,
            recommendations,
            skippedProducts
        };
    },

    async getRecommendations() {
        const logs = await agentRepository.findLogs({ action: 'RECOMMEND_REORDER' });
        return logs.map((log: any /* Dùng any do Prisma model type không được infer đầy đủ qua findLogs */) => {
            const output = log.output ? JSON.parse(log.output) : null;
            return {
                logId: log.id,
                productId: output?.productId || '',
                productName: output?.productName || '',
                sku: output?.sku || '',
                currentQuantity: output?.currentQuantity ?? 0,
                minThreshold: output?.minThreshold ?? 0,
                salesVelocity7d: output?.salesVelocity7d ?? 0,
                salesVelocity30d: output?.salesVelocity30d ?? 0,
                recommendedQuantity: output?.recommendedQuantity ?? 0,
                recommendedSupplierId: output?.recommendedSupplierId || '',
                recommendedSupplierName: output?.recommendedSupplierName || '',
                confidence: output?.confidence ?? 0,
                reasoning: log.reasoning,
                emailDraft: output?.emailDraft || '',
                fallbackUsed: log.fallback_used,
                errorMessage: log.error_message,
                createdAt: log.triggered_at,
                createdBy: log.creator?.name || null,
                result: log.result,
                referenceType: log.reference_type,
                referenceId: log.reference_id
            };
        });
    },

    async createPurchaseRequestFromRecommendation(logId: string, userId: string) {
        const log = await agentRepository.findRecommendationLog(logId);
        if (!log) throw new AgentHttpError(404, 'Recommendation log not found.');
        if (log.action !== 'RECOMMEND_REORDER') throw new AgentHttpError(400, 'Invalid log action type.');
        if (log.result === 'CONVERTED_TO_PR') throw new AgentHttpError(400, 'Recommendation has already been converted to a purchase request.');

        const recommendation = log.output ? JSON.parse(log.output) : null;
        if (!recommendation) throw new AgentHttpError(400, 'Recommendation data is missing.');

        try {
            return await agentRepository.createPurchaseRequestFromRecommendation({
                logId,
                productId: recommendation.productId,
                supplierId: recommendation.recommendedSupplierId,
                recommendedQuantity: recommendation.recommendedQuantity,
                reasoning: recommendation.reasoning,
                emailDraft: recommendation.emailDraft,
                userId
            });
        } catch (error) {
            const message = error instanceof Error ? error.message : 'Failed to create purchase request.';
            if (message === ACTIVE_PURCHASE_REQUEST_MESSAGE) throw new AgentHttpError(400, ACTIVE_PURCHASE_REQUEST_MESSAGE);
            if (message.includes('Inventory record')) throw new AgentHttpError(404, message);
            throw error;
        }
    },

    async runScan(triggerType: 'SCHEDULED' | 'MANUAL' = 'SCHEDULED') {
        const admin = await agentRepository.findFirstAdmin();
        if (!admin) {
            await agentRepository.createLog({
                action: 'SCAN_INVENTORY',
                result: 'FAILED',
                input: JSON.stringify({ triggerType }),
                reasoning: 'No active ADMIN user found in database to authorize the PurchaseRequest.',
                error_message: 'No active ADMIN user found.',
                fallback_used: false
            });
            return;
        }

        await this.scanInventory({ triggerType }, admin.id);
    },

    async createLog(data: Parameters<typeof agentRepository.createLog>[0]) {
        return agentRepository.createLog(data);
    }
};
