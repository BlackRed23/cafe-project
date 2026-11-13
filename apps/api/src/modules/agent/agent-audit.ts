import { Prisma } from '@cafe-project/database';

export const auditInclude = { toolCalls: { orderBy: { stepNo: 'asc' } },
    triggeredByUser: { select: { id: true, name: true, email: true } }, purchaseRequests: { select: { id: true } } } satisfies Prisma.AgentExecutionInclude;
export type AuditExecution = Prisma.AgentExecutionGetPayload<{ include: typeof auditInclude }>;
const record = (value: unknown): Record<string, unknown> => {
    if (typeof value === 'string') { try { return record(JSON.parse(value)); } catch { return {}; } }
    return value !== null && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
};
const str = (value: unknown) => typeof value === 'string' ? value : undefined;

/** Display adapter aligned with Agent service; persistence remains Execution/ToolCall. */
export function auditDto(execution: AuditExecution) {
    const call = execution.toolCalls[0];
    const args = record(call?.arguments), result = record(call?.result);
    const input = record(args.input ?? args), output = record(result.output ?? result);
    const status = ['FAILED', 'TIMEOUT', 'CANCELLED'].includes(execution.status) ? 'FAILED'
        : ['RUNNING', 'WAITING_APPROVAL'].includes(execution.status) ? 'RUNNING' : 'SUCCESS';
    const action = str(args.action) ?? execution.intent ?? call?.toolName ?? execution.goal;
    const outcome = str(result.result) ?? status;
    return { id: execution.id, action, status, executionStatus: execution.status, toolCallStatus: call?.status, result: outcome,
        reason: str(output.reason) ?? outcome, message: str(output.message) ?? execution.errorMessage ?? action,
        triggerType: str(input.triggerType), productId: str(output.productId) ?? str(input.productId),
        ingredientId: str(output.ingredientId) ?? str(input.ingredientId), productName: str(output.productName) ?? str(input.productName),
        inventoryId: str(output.inventoryId) ?? str(input.inventoryId), purchaseRequestId: str(output.purchaseRequestId) ?? execution.purchaseRequests[0]?.id,
        referenceType: str(args.reference_type), referenceId: str(args.reference_id),
        reference_type: str(args.reference_type), reference_id: str(args.reference_id),
        input, output, reasoning: str(args.reasoning) ?? '', errorMessage: execution.errorMessage, error_message: execution.errorMessage,
        fallbackUsed: execution.fallbackUsed, fallback_used: execution.fallbackUsed,
        createdBy: execution.triggeredByUser, createdAt: execution.startedAt };
}
