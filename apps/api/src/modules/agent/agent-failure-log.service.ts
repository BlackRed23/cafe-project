import { prisma } from '@cafe-project/database';

type AgentFailureInput = {
    triggerType?: string;
    productIds?: string[];
    productId?: string;
    sourceType?: string;
    sourceId?: string;
    note?: string;
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

const toAgentLogDto = (log: any) => {
    const input = safeJsonParse(log.input);
    const output = safeJsonParse(log.output);
    const result = log.result || '';
    const reason = asString(output?.reason) || result || asString(log.action);

    return {
        id: log.id,
        action: log.action,
        status: log.error_message || result === 'FAILED' ? 'FAILED' : 'SUCCESS',
        result,
        reason,
        message: asString(output?.message) || 'Agent xử lý thất bại.',
        triggerType: asString(input?.triggerType),
        productId: asString(output?.productId) || asString(input?.productId),
        productName: asString(output?.productName) || asString(input?.productName),
        inventoryId: asString(output?.inventoryId) || asString(input?.inventoryId),
        purchaseRequestId: asString(output?.purchaseRequestId),
        referenceType: log.reference_type,
        referenceId: log.reference_id,
        input,
        output,
        reasoning: log.reasoning,
        errorMessage: log.error_message,
        fallbackUsed: log.fallback_used,
        createdAt: log.triggered_at,
        error_message: log.error_message,
        reference_type: log.reference_type,
        reference_id: log.reference_id
    };
};

const safeErrorMessage = (error: unknown): string => {
    if (error instanceof Error && error.message) return error.message;
    if (typeof error === 'string' && error.trim()) return error.trim();
    return 'Unknown Agent service error.';
};

const failureReason = (error: unknown): 'AGENT_SERVICE_TIMEOUT' | 'AGENT_SERVICE_UNAVAILABLE' => {
    const message = safeErrorMessage(error).toLowerCase();
    return message.includes('timeout') || message.includes('aborted') ? 'AGENT_SERVICE_TIMEOUT' : 'AGENT_SERVICE_UNAVAILABLE';
};

export const agentFailureLogService = {
    async createServiceUnavailableLog(input: AgentFailureInput = {}, error: unknown, userId?: string) {
        const errorMessage = safeErrorMessage(error);
        const reason = failureReason(error);
        const message = 'Không kết nối được AI Agent service.';
        const output = {
            failed: true,
            reason,
            message,
            errorMessage,
            productId: input.productId,
            productIds: input.productIds,
            notification: {
                type: 'error',
                title: 'Agent xử lý thất bại',
                description: 'Backend không kết nối được AI Agent service. Vui lòng kiểm tra process apps/agent.',
                actionLabel: 'Xem nhật ký Agent',
                actionUrl: '/admin/agent-logs'
            }
        };

        const log = await prisma.agentLog.create({
            data: {
                action: 'AGENT_SERVICE_UNAVAILABLE',
                input: JSON.stringify({
                    triggerType: input.triggerType,
                    productId: input.productId,
                    productIds: input.productIds,
                    sourceType: input.sourceType,
                    sourceId: input.sourceId,
                    note: input.note
                }),
                output: JSON.stringify(output),
                reasoning: 'apps/api could not reach the separate apps/agent HTTP service.',
                result: 'FAILED',
                fallback_used: false,
                error_message: errorMessage,
                reference_type: input.sourceType || 'AgentService',
                reference_id: input.sourceId,
                creator: userId ? { connect: { id: userId } } : undefined
            }
        });

        return toAgentLogDto(log);
    },

    async listLogs(query: Record<string, unknown> = {}) {
        const page = Number.parseInt(String(query.page ?? '1'), 10) || 1;
        const limit = Math.min(Number.parseInt(String(query.limit ?? '20'), 10) || 20, 100);
        const status = asString(query.status)?.toUpperCase();
        const action = asString(query.action);
        const productId = asString(query.productId);
        const and: any[] = [];
        if (action) and.push({ action });
        if (status === 'FAILED') and.push({ OR: [{ result: 'FAILED' }, { error_message: { not: null } }] });
        if (productId) {
            and.push({
                OR: [
                    { input: { contains: productId } },
                    { output: { contains: productId } },
                    { reference_id: productId }
                ]
            });
        }
        const where: any = and.length ? { AND: and } : {};
        const [total, logs] = await Promise.all([
            prisma.agentLog.count({ where }),
            prisma.agentLog.findMany({
                where,
                orderBy: { triggered_at: 'desc' },
                skip: (page - 1) * limit,
                take: limit
            })
        ]);

        return {
            logs: logs.map(toAgentLogDto),
            pagination: {
                page,
                limit,
                total,
                totalPages: Math.max(1, Math.ceil(total / limit))
            }
        };
    }
};
