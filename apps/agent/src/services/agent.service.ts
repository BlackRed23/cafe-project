import { prisma, InventoryTransactionType } from '@cafe-project/database';
import { ACTIVE_PURCHASE_REQUEST_MESSAGE, agentRepository, type AgentInventoryRecord } from '../repositories/agent.repository';
import { recommendationService } from './recommendation.service';
import { AgentHttpError } from '../errors/http-error';
import { logger } from '../utils/logger';
import { fixAgentLogDisplayOutput, fixVietnameseMojibakeText } from '../utils/textEncoding';

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
        message: 'AI Agent gáº·p lá»—i ná»™i bá»™ khi kiá»ƒm tra tá»“n kho.',
        errorMessage: 'Demo failure: scan inventory logic threw an error.'
    },
    DATABASE_READ_FAIL: {
        reason: 'DATABASE_ERROR',
        message: 'AI Agent khÃ´ng thá»ƒ Ä‘á»c dá»¯ liá»‡u tá»“n kho tá»« há»‡ thá»‘ng.',
        errorMessage: 'Demo failure: inventory database read failed.'
    },
    MISSING_ENV: {
        reason: 'AGENT_CONFIG_ERROR',
        message: 'AI Agent thiáº¿u cáº¥u hÃ¬nh cáº§n thiáº¿t Ä‘á»ƒ xá»­ lÃ½.',
        errorMessage: 'Demo failure: required Agent environment configuration is missing.'
    },
    IMPORT_FAIL_SIMULATED: {
        reason: 'AGENT_IMPORT_ERROR',
        message: 'Backend khÃ´ng thá»ƒ náº¡p module AI Agent.',
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

    if (normalizedAction === 'SCAN_INVENTORY_SESSION') return 'AI Agent bắt đầu quét tồn kho.';
    if (normalizedResult === 'CREATED_PURCHASE_REQUEST') return 'AI Agent đã tạo yêu cầu nhập hàng cho sản phẩm này.';
    if (normalizedResult === 'NO_SUPPLIER' || normalizedReason === 'NO_SUPPLIER' || normalizedReason === 'NO_SUPPLIERS_MAPPED' || normalizedReason === 'SUPPLIERS_INACTIVE') {
        return 'Sản phẩm tồn kho thấp nhưng chưa có nhà cung cấp hợp lệ.';
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
        return normalizedAction === 'SEND_SUPPLIER_EMAIL' ? 'Gá»­i email nhÃ  cung cáº¥p tháº¥t báº¡i.' : 'Agent xá»­ lÃ½ tháº¥t báº¡i.';
    }
    if (normalizedReason === 'AGENT_LOGIC_ERROR') return 'AI Agent gáº·p lá»—i ná»™i bá»™ khi kiá»ƒm tra tá»“n kho.';
    if (normalizedReason === 'DATABASE_ERROR') return 'AI Agent khÃ´ng thá»ƒ Ä‘á»c dá»¯ liá»‡u tá»“n kho tá»« há»‡ thá»‘ng.';
    if (normalizedReason === 'AGENT_CONFIG_ERROR') return 'AI Agent thiáº¿u cáº¥u hÃ¬nh cáº§n thiáº¿t Ä‘á»ƒ xá»­ lÃ½.';
    if (normalizedReason === 'AGENT_IMPORT_ERROR') return 'Backend khÃ´ng thá»ƒ náº¡p module AI Agent.';
    if (normalizedResult === 'CREATED_PURCHASE_REQUEST') return 'AI Agent Ä‘Ã£ táº¡o yÃªu cáº§u nháº­p hÃ ng cho sáº£n pháº©m nÃ y.';
    if (normalizedResult === 'RECOMMENDED') return 'AI Agent Ä‘Ã£ táº¡o khuyáº¿n nghá»‹ nháº­p hÃ ng.';
    if (normalizedResult === 'CONVERTED_TO_PR') return 'Khuyáº¿n nghá»‹ Ä‘Ã£ Ä‘Æ°á»£c chuyá»ƒn thÃ nh yÃªu cáº§u nháº­p hÃ ng.';
    if (normalizedResult === 'SKIPPED_DUPLICATE' || normalizedReason === 'ACTIVE_PR_EXISTS') return 'Sáº£n pháº©m Ä‘Ã£ cÃ³ yÃªu cáº§u nháº­p hÃ ng chá» báº¡n xÃ¡c nháº­n, nÃªn AI Agent khÃ´ng táº¡o thÃªm.';
    if (normalizedResult === 'NO_SUPPLIER' || normalizedReason === 'NO_SUPPLIER' || normalizedReason === 'NO_SUPPLIERS_MAPPED') return 'Sáº£n pháº©m tá»“n kho tháº¥p nhÆ°ng chÆ°a cÃ³ nhÃ  cung cáº¥p há»£p lá»‡.';
    if (normalizedReason === 'SUPPLIERS_INACTIVE') return 'Sáº£n pháº©m tá»“n kho tháº¥p nhÆ°ng chÆ°a cÃ³ nhÃ  cung cáº¥p há»£p lá»‡.';
    if (normalizedResult === 'SKIPPED_DISABLED' || normalizedReason === 'AI_DISABLED') return 'AI Agent Ä‘ang bá»‹ táº¯t trong cáº¥u hÃ¬nh há»‡ thá»‘ng.';
    if (normalizedReason === 'ABOVE_THRESHOLD' || normalizedReason === 'STOCK_OK' || normalizedResult === 'SKIPPED') return 'Tá»“n kho váº«n Ä‘ang á»Ÿ má»©c an toÃ n nÃªn Agent khÃ´ng táº¡o yÃªu cáº§u nháº­p hÃ ng.';
    if (normalizedAction === 'SEND_SUPPLIER_EMAIL' && normalizedResult === 'SUCCESS') return 'Email Ä‘áº·t hÃ ng Ä‘Ã£ Ä‘Æ°á»£c gá»­i cho nhÃ  cung cáº¥p.';
    if (normalizedAction === 'SEND_SUPPLIER_EMAIL' && normalizedResult === 'FAILED') return 'Gá»­i email nhÃ  cung cáº¥p tháº¥t báº¡i.';
    return 'Agent Ä‘Ã£ ghi nháº­n má»™t sá»± kiá»‡n xá»­ lÃ½.';
};

const derivePurchaseRequestId = (log: any, output: any): string | undefined => {
    const fromOutput = asString(output?.purchaseRequestId);
    if (fromOutput) return fromOutput;
    const referenceType = (log.reference_type || '').toLowerCase();
    if (referenceType === 'purchaserequest' || referenceType === 'purchase_request') return asString(log.reference_id);
    return undefined;
};

const getAgentSettings = async () => {
    const [enabled, slogan, promptPrefix, defaultMinThreshold, reorderPlanningPeriod, reorderPlanningCustomDays] = await Promise.all([
        agentRepository.getSettingValue('ai.enabled'),
        agentRepository.getSettingValue('ai.slogan'),
        agentRepository.getSettingValue('ai.promptPrefix'),
        agentRepository.getSettingValue('inventory.defaultMinThreshold'),
        agentRepository.getSettingValue('inventory.reorderPlanningPeriod'),
        agentRepository.getSettingValue('inventory.reorderPlanningCustomDays')
    ]);
    const planningPeriod = parseReorderPlanningPeriod(reorderPlanningPeriod);
    const customDays = parsePositiveIntSetting(reorderPlanningCustomDays);

    return {
        enabled: parseBooleanSetting(enabled, true),
        slogan,
        promptPrefix,
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
    title: 'ÄÃ£ táº¡o yÃªu cáº§u nháº­p hÃ ng',
    description: `Sáº£n pháº©m "${productName}" cÃ²n tháº¥p hÆ¡n ngÆ°á»¡ng. AI Agent Ä‘Ã£ táº¡o yÃªu cáº§u nháº­p hÃ ng chá» admin xÃ¡c nháº­n.`,
    actionLabel: 'Xem yÃªu cáº§u nháº­p hÃ ng',
    actionUrl: `/admin/purchase-requests/${purchaseRequestId}`
});

const notificationForDuplicatePurchaseRequest = (productName: string, purchaseRequestId?: string): AgentNotification => ({
    type: 'info',
    title: 'ÄÃ£ cÃ³ yÃªu cáº§u nháº­p hÃ ng chá» báº¡n xÃ¡c nháº­n',
    description: `Sáº£n pháº©m "${productName}" Ä‘Ã£ cÃ³ yÃªu cáº§u nháº­p hÃ ng Ä‘ang chá» xá»­ lÃ½, nÃªn AI Agent khÃ´ng táº¡o thÃªm yÃªu cáº§u má»›i.`,
    actionLabel: 'Xem yÃªu cáº§u nháº­p hÃ ng',
    actionUrl: purchaseRequestId ? `/admin/purchase-requests/${purchaseRequestId}` : '/admin/purchase-requests'
});

const notificationForNoSupplier = (productName: string): AgentNotification => ({
    type: 'warning',
    title: 'Thiáº¿u nhÃ  cung cáº¥p',
    description: `Sáº£n pháº©m "${productName}" Ä‘ang tháº¥p hÆ¡n ngÆ°á»¡ng nhÆ°ng chÆ°a cÃ³ nhÃ  cung cáº¥p há»£p lá»‡, nÃªn AI Agent chÆ°a thá»ƒ táº¡o yÃªu cáº§u nháº­p hÃ ng.`,
    actionLabel: 'Kiá»ƒm tra nhÃ  cung cáº¥p',
    actionUrl: '/admin/suppliers'
});

const notificationForAiDisabled = (): AgentNotification => ({
    type: 'info',
    title: 'AI Agent Ä‘ang táº¯t',
    description: 'Há»‡ thá»‘ng Ä‘Ã£ phÃ¡t hiá»‡n biáº¿n Ä‘á»™ng tá»“n kho nhÆ°ng AI Agent Ä‘ang bá»‹ táº¯t trong cáº¥u hÃ¬nh.',
    actionLabel: 'Má»Ÿ cÃ i Ä‘áº·t',
    actionUrl: '/admin/settings'
});

const notificationForAgentFailed = (productName?: string): AgentNotification => ({
    type: 'error',
    title: 'Agent xá»­ lÃ½ tháº¥t báº¡i',
    description: `AI Agent khÃ´ng thá»ƒ kiá»ƒm tra tá»“n kho${productName ? ` cho sáº£n pháº©m "${productName}"` : ''}. Vui lÃ²ng kiá»ƒm tra nháº­t kÃ½ Agent.`,
    actionLabel: 'Xem nháº­t kÃ½ Agent',
    actionUrl: '/admin/agent-logs'
});

const notificationForDemoFailure = (description: string): AgentNotification => ({
    type: 'error',
    title: 'Agent xá»­ lÃ½ tháº¥t báº¡i',
    description,
    actionLabel: 'Xem nháº­t kÃ½ Agent',
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
    async scanInventory(input: ScanInventoryInput = { triggerType: 'MANUAL_SCAN' }, userId: string) {
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
            let reorderPoint = minThreshold;
            let safetyStock = minThreshold;
            let averageDailySales = 0;
            const delayBufferDays = 2;
            const leadTimeDays = supplierProduct?.leadTimeDays && supplierProduct.leadTimeDays > 0 ? supplierProduct.leadTimeDays : 0;
            if (supplierProduct && supplierProduct.leadTimeDays > 0) {
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
                averageDailySales = totalSold / 30;
                safetyStock = averageDailySales > 0 ? Math.ceil(averageDailySales * 2) : minThreshold;
                reorderPoint = Math.max(
                    Math.ceil(averageDailySales * (leadTimeDays + delayBufferDays) + safetyStock),
                    minThreshold
                );
            }

            const targetStock = averageDailySales > 0
                ? Math.ceil(averageDailySales * (planningDays + leadTimeDays + delayBufferDays))
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
            const baseInput = {
                scanSessionId,
                triggerType,
                sourceType: input.sourceType,
                sourceId: input.sourceId,
                note: input.note,
                inventoryId: inventory.id,
                productId: inventory.productId,
                productName: product.name,
                currentQty: inventory.quantity,
                minThreshold,
                avgDailySales: Number(averageDailySales.toFixed(2)),
                reorderPlanningPeriod: settings.reorderPlanningPeriod,
                reorderPlanningDays: planningDays,
                safetyStock,
                leadTimeDays: supplierProduct?.leadTimeDays ?? null,
                delayBufferDays,
                reorderPoint,
                targetStock,
                recommendedQty,
                backupSuppliers,
                capacityNote: 'SupplierProduct hiá»‡n chÆ°a cÃ³ availableQuantity/capacity; Agent khÃ´ng tá»± káº¿t luáº­n nhÃ  cung cáº¥p Ä‘á»§ hay thiáº¿u.'
            };

            if (inventory.quantity > reorderPoint) {
                const log = await agentRepository.createLog({
                    action: 'SCAN_INVENTORY_STOCK_OK',
                    input: JSON.stringify(baseInput),
                    output: JSON.stringify({
                        skipped: true,
                        reason: 'STOCK_OK',
                        productId: inventory.productId,
                        productName: product.name,
                        inventoryId: inventory.id,
                        currentQty: inventory.quantity,
                        minThreshold,
                        reorderPoint
                    }),
                    reasoning: 'Tá»“n kho váº«n Ä‘ang á»Ÿ má»©c an toÃ n.',
                    result: 'STOCK_OK',
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
                const reasoning = 'Sáº£n pháº©m Ä‘Ã£ cÃ³ yÃªu cáº§u nháº­p hÃ ng vÃ  Ä‘ang Ä‘Æ°á»£c xá»­ lÃ½.';
                const log = await agentRepository.createLog({
                    action: 'SCAN_INVENTORY_SKIP_DUPLICATE',
                    input: JSON.stringify(baseInput),
                    output: JSON.stringify({
                        skipped: true,
                        reason: 'ACTIVE_PR_EXISTS',
                        productId: inventory.productId,
                        productName: product.name,
                        inventoryId: inventory.id,
                        purchaseRequestId: openPurchaseRequest.id,
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

            if (product.supplierProducts.length === 0) {
                const reasoning = 'Sáº£n pháº©m chÆ°a Ä‘Æ°á»£c liÃªn káº¿t vá»›i nhÃ  cung cáº¥p.';
                const log = await agentRepository.createLog({
                    action: 'SCAN_INVENTORY_NO_SUPPLIER',
                    input: JSON.stringify(baseInput),
                    output: JSON.stringify({
                        skipped: true,
                        reason: 'NO_SUPPLIER',
                        productId: inventory.productId,
                        productName: product.name,
                        inventoryId: inventory.id,
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
                const reasoning = 'NhÃ  cung cáº¥p cá»§a sáº£n pháº©m Ä‘ang bá»‹ vÃ´ hiá»‡u hÃ³a.';
                const log = await agentRepository.createLog({
                    action: 'SCAN_INVENTORY_INACTIVE_SUPPLIER',
                    input: JSON.stringify(baseInput),
                    output: JSON.stringify({
                        skipped: true,
                        reason: 'SUPPLIERS_INACTIVE',
                        productId: inventory.productId,
                        productName: product.name,
                        inventoryId: inventory.id,
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
                [settings.promptPrefix, settings.slogan]
            );
            const request = await agentRepository.createAiPurchaseRequest(inventory, supplierProduct, recommendedQty, reasoning, userId);
            createdPurchaseRequests.push({ id: request.id, requestNumber: request.requestNumber, supplierName: request.supplier.name, status: request.status });
            const output = {
                reason: 'CREATED_PURCHASE_REQUEST',
                productId: inventory.productId,
                productName: product.name,
                inventoryId: inventory.id,
                purchaseRequestId: request.id,
                recommendedSupplierId: supplierProduct.supplierId,
                recommendedQty,
                backupSuppliers,
                confidence: 0.82,
                notification: notificationForCreatedPurchaseRequest(product.name, request.id)
            };
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
                    reason: 'SERVER_ERROR',
                    message: 'AI Agent khÃ´ng thá»ƒ kiá»ƒm tra tá»“n kho cho sáº£n pháº©m nÃ y.',
                    errorMessage,
                    productId: inventory.productId,
                    productName: product.name,
                    inventoryId: inventory.id,
                    notification: notificationForAgentFailed(product.name)
                };
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
                totalChecked: inventories.length,
                createdPurchaseRequestCount: createdPurchaseRequests.length,
                skippedDuplicateCount: results.filter(r => r.result === 'SKIPPED_DUPLICATE').length,
                noSupplierCount: results.filter(r => r.result === 'NO_SUPPLIER').length,
                failedCount: results.filter(r => r.result === 'FAILED').length,
                stockOkCount: results.filter(r => r.result === 'STOCK_OK').length
            };

            await agentRepository.updateLog(sessionLog.id, {
                result: 'SUCCESS',
                reasoning: 'AI Agent đã quét xong tồn kho.',
                output: JSON.stringify({
                    scanSessionId,
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
            .filter((log) => (statusFilter ? log.status === statusFilter : true))
            .filter((log) => (triggerType ? log.triggerType === triggerType : true))
            .filter((log) => (productId ? log.productId === productId || log.referenceId === productId : true));

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
        return logs.map((log) => {
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
