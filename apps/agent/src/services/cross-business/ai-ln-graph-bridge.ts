/**
 * Opt-in, read-only AI-LN integration at the verified Agent service boundary.
 *
 * This is NOT a new Graph node and does not modify D4's existing StateGraph.
 * The existing Graph is executed first with its own durable checkpoint/audit;
 * only a verified SUCCEEDED read is allowed to enter the cross-business gate.
 * Backend-only purchasing writes and ADMIN approvals remain unchanged.
 */
import { prisma } from '@cafe-project/database';
import { requireAgentUser } from '../../internal-auth';
import { agentRepository } from '../../repositories/agent.repository';
import { runLiveReadOnlyGraph } from '../../workflows/agent-live-readonly';
import type { PerceptionContext } from '../../workflows/inventory-perception';
import { assessAiLnReadOnly, createAiLnBackendJwtReader,
    type AiLnCaseId, type AiLnReadAssessment } from './ai-ln-cross-business';

type BridgeStatus = 'HOLD_GRAPH' | 'HOLD_SOURCE' | 'REVIEW_READY' | 'HOLD_CROSS_BUSINESS';
export type AiLnGraphBridgeResult = {
    caseId: AiLnCaseId;
    graphId: string;
    requestId: string;
    graphStatus: string;
    status: BridgeStatus;
    graphCheckpointDurable: true;
    graphAuditDurable: true;
    readOnly: true;
    purchaseAttempted: false;
    approvalAttempted: false;
    sourceRowVersion: number | null;
    sourceMovementCursor: string | null;
    decision: AiLnReadAssessment | null;
    auditLogId: string;
};

const supportedCases = new Set<AiLnCaseId>([
    'AI-LN-01', 'AI-LN-02', 'AI-LN-03', 'AI-LN-04',
    'AI-LN-05', 'AI-LN-06', 'AI-LN-07', 'AI-LN-08',
    'AI-LN-09', 'AI-LN-10', 'AI-LN-11', 'AI-LN-12'
]);
const id = /^[A-Za-z0-9][A-Za-z0-9:_-]{0,119}$/;

export async function runAiLnVerifiedGraphReadCase(input: {
    caseId: AiLnCaseId;
    actorId: string;
    ingredientId: string;
    scanSessionId: string;
    backendBaseUrl: string;
    bearerJwt: string;
}): Promise<AiLnGraphBridgeResult> {
    if (!supportedCases.has(input.caseId) ||
        !id.test(input.actorId) || !id.test(input.ingredientId) ||
        !id.test(input.scanSessionId)) throw new Error('INVALID_AI_LN_SCOPE');
    if (process.env.AGENT_GRAPH_READONLY !== 'YES' ||
        process.env.AGENT_GRAPH_PG_READONLY !== 'YES') {
        throw new Error('AI_LN_GRAPH_DURABILITY_UNVERIFIED');
    }
    await requireAgentUser(input.actorId, ['ADMIN']);
    const graph = await runLiveReadOnlyGraph(
        { scope: 'INGREDIENT', ingredientIds: [input.ingredientId] },
        input.actorId, input.scanSessionId
    );
    if (!graph.graphId || !graph.requestId ||
        graph.checkpointDurable !== true || graph.auditDurable !== true) {
        throw new Error('AI_LN_GRAPH_CHECKPOINT_UNVERIFIED');
    }
    let sourceRowVersion: number | null = null;
    let sourceMovementCursor: string | null = null;
    let decision: AiLnReadAssessment | null = null;
    let status: BridgeStatus = 'HOLD_GRAPH';

    // HOLD precedence: never delegate an uncertain Graph snapshot to PUR.
    if (graph.status === 'SUCCEEDED') {
        const per: PerceptionContext[] = graph.perception ?? [];
        const observation = per.length === 1 && per[0]?.ingredientId === input.ingredientId
            && per[0].dataQualityStatus === 'VERIFIED' ? per[0] : undefined;
        if (!observation) {
            status = 'HOLD_SOURCE';
        } else {
            sourceRowVersion = observation.rowVersion;
            sourceMovementCursor = observation.movementCursor;
            const read = createAiLnBackendJwtReader({
                baseUrl: input.backendBaseUrl, bearerJwt: input.bearerJwt
            });
            decision = await read(input.caseId, {
                contractVersion: 'PUR_INGREDIENT_V1',
                runId: graph.graphId, actorId: input.actorId,
                ingredientId: input.ingredientId,
                expectedRowVersion: observation.rowVersion,
                expectedMovementCursor: observation.movementCursor,
                requestedRecipeId: null
            });
            // Last independent current DB version fence AFTER HTTP business
            // evidence; never finalize a recommendation on a changed lot/stock.
            const current = await prisma.ingredient.findFirst({
                where: { id: input.ingredientId, isActive: true, deletedAt: null },
                select: { rowVersion: true, movementCursor: true }
            });
            const sourceStillCurrent = Boolean(current &&
                current.rowVersion === observation.rowVersion &&
                current.movementCursor.toString() === observation.movementCursor);
            status = sourceStillCurrent
                ? decision.sourceAttested && decision.status === 'REVIEW_REQUIRED'
                    ? 'REVIEW_READY' : 'HOLD_CROSS_BUSINESS'
                : 'HOLD_SOURCE';
        }
    }
    // Recheck current ADMIN after all asynchronous reads. Persist a sanitized
    // cross-business audit alongside the original durable Graph audit.
    await requireAgentUser(input.actorId, ['ADMIN']);
    const log = await agentRepository.createLog({
        action: 'AI_LN_VERIFIED_READ_GATE',
        input: JSON.stringify({ caseId: input.caseId, graphId: graph.graphId,
            ingredientId: input.ingredientId, actorId: input.actorId }),
        output: JSON.stringify({
            caseId: input.caseId, graphId: graph.graphId, graphStatus: graph.status,
            bridgeStatus: status, sourceRowVersion, sourceMovementCursor,
            decisionStatus: decision?.status ?? null,
            reasonCodes: decision?.reasons ?? [], checkpointDurable: true,
            noBusinessWrite: true
        }),
        reasoning: 'Read-only AI-LN cross-business gate linked to existing durable Graph run.',
        result: status === 'REVIEW_READY' ? 'SUCCESS' : 'SKIPPED',
        fallback_used: false,
        reference_type: 'AiLnCrossBusiness', reference_id: graph.graphId,
        creator: { connect: { id: input.actorId } }
    });
    return {
        caseId: input.caseId, graphId: graph.graphId, requestId: graph.requestId,
        graphStatus: graph.status, status,
        graphCheckpointDurable: true, graphAuditDurable: true,
        readOnly: true, purchaseAttempted: false, approvalAttempted: false,
        sourceRowVersion, sourceMovementCursor, decision, auditLogId: log.id
    };
}
