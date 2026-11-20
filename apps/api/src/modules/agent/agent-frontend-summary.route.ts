import { Router, type RequestHandler } from 'express';
import { prisma } from '@cafe-project/database';
import { z } from 'zod';
import { asyncHandler } from '../../common/async-handler';
import { HttpError } from '../../common/http-error';
import { sendSuccess } from '../../common/response';
import { authenticate, requireRole, type AuthenticatedRequest } from '../auth/auth.middleware';

/**
 * Frontend-safe projection of legacy AgentExecution records.
 * It does NOT represent SystemSetting-backed LangGraph checkpoint state.
 * Never return goal, prompts, tool arguments/results or raw error messages.
 */
const runIdSchema = z.string().regex(/^[A-Za-z0-9_-]{1,120}$/);
const publicToolNames = new Set([
    'getIngredientAvailability', 'getIngredientBatches', 'getRecipeRequirements',
    'getSalesHistory', 'findIngredientSuppliers', 'calculateReorderQuantity',
    'estimatePurchaseCost'
]);
const statuses = {
    RUNNING: 'Agent đang xử lý nhiệm vụ.',
    WAITING_APPROVAL: 'Agent đang chờ người có thẩm quyền xem xét.',
    SUCCEEDED: 'Nhiệm vụ Agent đã hoàn tất.',
    FAILED: 'Nhiệm vụ Agent thất bại; vui lòng xem trạng thái nghiệp vụ.',
    TIMEOUT: 'Nhiệm vụ Agent đã quá thời gian xử lý.',
    CANCELLED: 'Nhiệm vụ Agent đã bị hủy.'
} as const;
type ExecutionStatus = keyof typeof statuses;
type SafeToolCall = {
    stepNo: number;
    toolName: string;
    status: 'PENDING' | 'RUNNING' | 'SUCCEEDED' | 'FAILED' | 'BLOCKED_BY_PERMISSION' | 'SKIPPED';
};
export type AgentFrontendExecutionRecord = {
    id: string;
    /** Authoritative Backend user ownership; system-owned runs are not public. */
    triggeredBy: string | null;
    status: ExecutionStatus;
    startedAt: Date;
    endedAt: Date | null;
    fallbackUsed: boolean;
    toolCalls: SafeToolCall[];
};

export type AgentFrontendExecutionSummary = {
    runId: string;
    source: 'AGENT_EXECUTION';
    status: ExecutionStatus;
    startedAt: string;
    completedAt: string | null;
    taskIdentity: { type: 'AGENT_EXECUTION'; id: string };
    ingredientIdentity: null;
    perceptionSummary: null;
    planningSteps: [];
    selectedTools: { stepNo: number; name: string; status: SafeToolCall['status']; selectionReason: null }[];
    selectionReasonsStatus: 'NOT_PERSISTED';
    dataQualityStatus: 'NOT_RECORDED';
    warnings: ('FALLBACK_USED' | 'AWAITING_HUMAN_REVIEW')[];
    approval: { state: 'PENDING_HUMAN' | 'NOT_RECORDED'; canApproveFromThisEndpoint: false };
    blocked: boolean;
    errorCode: 'AGENT_EXECUTION_FAILED' | 'AGENT_EXECUTION_TIMEOUT' | 'AGENT_EXECUTION_CANCELLED' | null;
    messageVi: string;
    permittedActions: [];
};

export function toAgentFrontendExecutionSummary(record: AgentFrontendExecutionRecord): AgentFrontendExecutionSummary {
    const warnings: AgentFrontendExecutionSummary['warnings'] = [];
    if (record.fallbackUsed) warnings.push('FALLBACK_USED');
    if (record.status === 'WAITING_APPROVAL') warnings.push('AWAITING_HUMAN_REVIEW');
    const codes = {
        FAILED: 'AGENT_EXECUTION_FAILED',
        TIMEOUT: 'AGENT_EXECUTION_TIMEOUT',
        CANCELLED: 'AGENT_EXECUTION_CANCELLED'
    } as const;
    return {
        runId: record.id,
        source: 'AGENT_EXECUTION',
        status: record.status,
        startedAt: record.startedAt.toISOString(),
        completedAt: record.endedAt?.toISOString() ?? null,
        taskIdentity: { type: 'AGENT_EXECUTION', id: record.id },
        ingredientIdentity: null,
        perceptionSummary: null,
        planningSteps: [],
        selectedTools: record.toolCalls
            .filter(call => publicToolNames.has(call.toolName))
            .slice(0, 100)
            .map(call => ({
                stepNo: call.stepNo, name: call.toolName, status: call.status,
                selectionReason: null as null
            })),
        selectionReasonsStatus: 'NOT_PERSISTED',
        dataQualityStatus: 'NOT_RECORDED',
        warnings,
        approval: {
            state: record.status === 'WAITING_APPROVAL' ? 'PENDING_HUMAN' : 'NOT_RECORDED',
            canApproveFromThisEndpoint: false
        },
        blocked: record.status === 'WAITING_APPROVAL',
        errorCode: Object.prototype.hasOwnProperty.call(codes, record.status)
            ? codes[record.status as keyof typeof codes] : null,
        messageVi: statuses[record.status],
        permittedActions: []
    };
}

export type AgentSummaryLoader = (id: string) => Promise<AgentFrontendExecutionRecord | null>;
export const loadAgentFrontendExecution: AgentSummaryLoader = async id => {
    return prisma.agentExecution.findUnique({
        where: { id },
        select: {
            id: true, triggeredBy: true, status: true, startedAt: true, endedAt: true, fallbackUsed: true,
            toolCalls: {
                orderBy: { stepNo: 'asc' },
                select: { stepNo: true, toolName: true, status: true },
                take: 100
            }
        }
    });
};

/** Injection is for isolated signed-JWT HTTP contract verification only. */
export function createAgentFrontendSummaryRouter(
    loader: AgentSummaryLoader = loadAgentFrontendExecution,
    authentication: RequestHandler = authenticate
) {
    const router = Router();
    router.get('/executions/:runId/summary', authentication, requireRole(['ADMIN']), asyncHandler(async (req, res) => {
        const parsed = runIdSchema.safeParse(req.params.runId);
        if (!parsed.success) throw new HttpError(400, 'INVALID_AGENT_RUN_ID', 'INVALID_AGENT_RUN_ID');
        const execution = await loader(parsed.data);
        // Do not expose another ADMIN's run or anonymous/system-owned state.
        // Return the same 404 for missing and foreign run IDs to prevent enumeration.
        const actor = (req as AuthenticatedRequest).user;
        if (!execution || !actor?.id || execution.triggeredBy !== actor.id) {
            throw new HttpError(404, 'AGENT_EXECUTION_NOT_FOUND', 'AGENT_EXECUTION_NOT_FOUND');
        }
        sendSuccess(res, 200, 'Đã lấy trạng thái thực thi Agent (chỉ đọc).',
            toAgentFrontendExecutionSummary(execution));
    }));
    return router;
}
