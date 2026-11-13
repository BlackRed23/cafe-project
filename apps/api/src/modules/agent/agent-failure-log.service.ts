import { Prisma, prisma } from '@cafe-project/database';
import { auditDto, auditInclude } from './agent-audit';
type AgentFailureInput = { triggerType?: string; productIds?: string[]; productId?: string; sourceType?: string; sourceId?: string; note?: string };
const str = (v: unknown) => typeof v === 'string' && v.trim() ? v.trim() : undefined;
const pageInt = (value: unknown, fallback: number, max = 2147483647) => {
    const n = Number(value); return Number.isSafeInteger(n) && n > 0 ? Math.min(n, max) : fallback;
};
export const agentFailureLogService = {
    async createServiceUnavailableLog(input: AgentFailureInput = {}, error: unknown, userId?: string) {
        const timeout = error instanceof Error && /timeout|aborted/i.test(error.message);
        const reason = timeout ? 'AGENT_SERVICE_TIMEOUT' : 'AGENT_SERVICE_UNAVAILABLE';
        const errorMessage = timeout ? 'Agent service timeout.' : 'Agent service unavailable.';
        const args: Prisma.InputJsonObject = { triggerType: input.triggerType ?? null, productId: input.productId ?? null, productIds: input.productIds ?? [],
            sourceType: input.sourceType ?? null, sourceId: input.sourceId ?? null, note: input.note ?? null };
        const execution = await prisma.agentExecution.create({ data: { goal: 'AGENT_SERVICE_UNAVAILABLE', intent: 'AGENT_SERVICE_UNAVAILABLE', status: 'FAILED',
            errorMessage, endedAt: new Date(), ...(userId ? { triggeredBy: userId } : {}),
            toolCalls: { create: { stepNo: 1, toolName: 'AGENT_SERVICE_UNAVAILABLE', status: 'FAILED', errorMessage, completedAt: new Date(),
                arguments: { action: 'AGENT_SERVICE_UNAVAILABLE', input: args, reference_type: input.sourceType ?? 'AgentService', reference_id: input.sourceId ?? null,
                    reasoning: 'API could not reach separate Agent service.' },
                result: { result: 'FAILED', output: { reason, message: 'Không kết nối được AI Agent service.', errorMessage,
                    productId: input.productId ?? null, productIds: input.productIds ?? [], notification: { type: 'error', title: 'Agent xử lý thất bại',
                        description: 'Không kết nối được AI Agent service.', actionLabel: 'Xem nhật ký Agent', actionUrl: '/admin/agent-logs' } } }
            } }
        }, include: auditInclude });
        return auditDto(execution);
    },
    async listLogs(query: Record<string, unknown> = {}) {
        const page = pageInt(query.page, 1), limit = pageInt(query.limit, 20, 100), status = str(query.status)?.toUpperCase();
        const action = str(query.action), productId = str(query.productId), triggerType = str(query.triggerType);
        const and: Prisma.AgentExecutionWhereInput[] = [];
        if (action) and.push({ OR: [{ intent: action }, { toolCalls: { some: { arguments: { path: ['action'], equals: action } } } }] });
        if (status === 'FAILED') and.push({ status: { in: ['FAILED', 'TIMEOUT', 'CANCELLED'] } });
        if (status === 'RUNNING') and.push({ status: { in: ['RUNNING', 'WAITING_APPROVAL'] } });
        if (status === 'SUCCESS') and.push({ status: 'SUCCEEDED' });
        if (triggerType) and.push({ toolCalls: { some: { arguments: { path: ['input', 'triggerType'], equals: triggerType } } } });
        if (productId) and.push({ toolCalls: { some: { OR: [
            { arguments: { path: ['input', 'productId'], equals: productId } },
            { arguments: { path: ['input', 'productIds'], array_contains: [productId] } },
            { result: { path: ['output', 'productId'], equals: productId } }
        ] } } });
        const where: Prisma.AgentExecutionWhereInput = and.length ? { AND: and } : {};
        const [total, logs] = await Promise.all([prisma.agentExecution.count({ where }), prisma.agentExecution.findMany({ where, include: auditInclude,
            orderBy: { startedAt: 'desc' }, skip: Math.min((page - 1) * limit, 2147483647), take: limit })]);
        return { logs: logs.map(auditDto), pagination: { page, limit, total, totalPages: Math.max(1, Math.ceil(total / limit)) } };
    }
};
