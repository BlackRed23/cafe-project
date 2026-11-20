import type { AgentGraphEvent } from './agent-langgraph';

const DIRECT_FAILURE = new Set([
    'READ_REJECTED', 'PERCEPTION_REJECTED', 'ANALYSIS_REJECTED',
    'BACKEND_READ_FAILED', 'STALE_REGISTERED_READ', 'TOOL_REJECTED',
    'REGISTRY_NOT_BOUND', 'POLICY_REJECTED', 'PLAN_REJECTED',
    'RESUME_REJECTED', 'EXECUTION_HELD', 'READ_ID_HELD',
    'BACKEND_DECISION_UNVERIFIED', 'READ_ID_HELD'
]);
const POLICY_BLOCKERS = new Set([
    'STOCKTAKE_UNCERTAIN', 'INBOUND_NOT_PHYSICAL', 'EXISTING_PURCHASE_REQUEST',
    'ANOMALOUS_STOCK_AGGREGATE', 'EXPIRED_STOCK_PRESENT',
    'UNKNOWN_EXPIRY_LOT', 'NON_AVAILABLE_LOT_PRESENT',
    'NEAR_EXPIRY_FEFO', 'DEMAND_DORMANT_REVIEW'
]);

/**
 * A benign earlier observation (e.g. sparse history) is not a HOLD cause.
 * Never expose arbitrary LLM/tool text: codes come only from verified Graph
 * events. This helper changes audit labeling, not business authorization.
 */
export function perceptionHoldReason(trace: readonly AgentGraphEvent[]): string {
    for (let i = trace.length - 1; i >= 0; i--) {
        const event = trace[i]!;
        if (event.code && DIRECT_FAILURE.has(event.status)) return event.code;
    }
    if (trace.some(event => event.status === 'POLICY_HOLD')) {
        const blocker = trace.find(event =>
            event.node === 'backend_demand_risk' &&
            event.status === 'BACKEND_READ_REVIEW_ONLY' &&
            event.code && POLICY_BLOCKERS.has(event.code));
        if (blocker?.code) return blocker.code;
    }
    return [...trace].reverse().find(event => event.code &&
        event.status !== 'BACKEND_READ_REVIEW_ONLY')?.code ??
        'UNVERIFIED_GRAPH_READ';
}
