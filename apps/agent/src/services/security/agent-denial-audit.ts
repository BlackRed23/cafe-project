import { randomUUID } from 'node:crypto';
import { prisma } from '@cafe-project/database';

/** Internal Agent HTTP denial evidence. Never stores service tokens or raw URL. */
export type AgentSecurityDenial = 'INVALID_INTERNAL_TOKEN' | 'INTERNAL_PRINCIPAL_FORBIDDEN';

export async function recordAgentInternalDenial(
    reasonCode: AgentSecurityDenial, method: unknown
): Promise<{ persisted: boolean; correlationId: string }> {
    const correlationId = randomUUID();
    if (process.env.SECURITY_DENIAL_AUDIT_ENABLED !== 'YES') {
        return { persisted: false, correlationId };
    }
    try {
        await prisma.agentLog.create({ data: {
            action: 'AGENT_SECURITY_DENIAL',
            result: 'DENIED',
            reference_type: 'SecurityDenial',
            reference_id: correlationId,
            input: JSON.stringify({
                version: 'SEC_G2_V1', reasonCode, correlationId,
                timestamp: new Date().toISOString(), scope: 'INTERNAL_AGENT',
                operation: typeof method === 'string' &&
                    /^(GET|POST|PATCH|PUT|DELETE|HEAD)$/.test(method) ? method : 'OTHER',
                actorReference: null
            })
        } });
        return { persisted: true, correlationId };
    } catch {
        // No credentials, exception text or input contents are written to logs.
        // An unavailable audit sink never turns a rejection into authorization.
        return { persisted: false, correlationId };
    }
}
