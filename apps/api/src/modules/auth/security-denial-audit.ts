import { randomUUID } from 'node:crypto';
import type { Request } from 'express';

/**
 * Backend authorization-denial evidence, not Graph audit and not an approval.
 * No Authorization header, JWT, request body, URL path parameters or query
 * values are collected. Anonymous/invalid tokens have no authenticated actor.
 */
export const SECURITY_DENIAL_CODES = Object.freeze([
    'JWT_MISSING_OR_MALFORMED',
    'JWT_INVALID',
    'ACCOUNT_DISABLED',
    'ACCOUNT_LOOKUP_FAILED',
    'PRINCIPAL_MISSING',
    'ROLE_FORBIDDEN',
    'RESOURCE_SCOPE_DENIED'
] as const);
export type SecurityDenialCode = typeof SECURITY_DENIAL_CODES[number];
export type SecurityDenialAuditResult = { persisted: true; correlationId: string } |
    { persisted: false; correlationId: string };

const routeScope = (req: Pick<Request, 'baseUrl'>): string => {
    // baseUrl is the router mount, not a user-controlled full URL.
    const raw = String(req.baseUrl ?? '');
    return /^\/api\/[a-z-]{1,40}$/.test(raw) ? raw : 'API_PROTECTED';
};
const methodCode = (method: unknown): string =>
    typeof method === 'string' && /^(GET|POST|PATCH|PUT|DELETE|HEAD)$/.test(method)
        ? method : 'OTHER';

/** Persist before sending a 401/403; audit failures never grant access. */
export async function recordBackendDenial(
    req: Pick<Request, 'baseUrl' | 'method'>,
    reasonCode: SecurityDenialCode,
    verifiedActorId?: string
): Promise<SecurityDenialAuditResult> {
    const correlationId = randomUUID();
    // Explicit deployment/isolated-acceptance opt-in avoids accidental writes
    // by contract/unit tests that import the real middleware and inherit a
    // developer DATABASE_URL. Never let merely importing a route enable writes.
    if (process.env.SECURITY_DENIAL_AUDIT_ENABLED !== 'YES' || process.env.DATA_PROVIDER === 'mock') {
        return { persisted: false, correlationId };
    }
    const timestamp = new Date().toISOString();
    try {
        const { prisma } = await import('@cafe-project/database');
        await prisma.agentLog.create({
            data: {
                action: 'SECURITY_DENIAL',
                result: 'DENIED',
                reference_type: 'SecurityDenial',
                reference_id: correlationId,
                ...(verifiedActorId ? { createdBy: verifiedActorId } : {}),
                input: JSON.stringify({
                    version: 'SEC_G2_V1',
                    correlationId, timestamp, reasonCode,
                    operation: methodCode(req.method),
                    scope: routeScope(req),
                    actorReference: verifiedActorId ?? null
                })
            }
        });
        return { persisted: true, correlationId };
    } catch {
        // Preserve the original denial without creating a failure-open path.
        // A missing audit record must remain visible in acceptance monitoring.
        return { persisted: false, correlationId };
    }
}
