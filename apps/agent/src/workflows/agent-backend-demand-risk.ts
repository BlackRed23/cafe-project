import { z } from 'zod';
import { requireAgentUser, requireInternalSecret } from '../internal-auth';
import type { InventoryRow } from './replenishment';
import type { BackendRiskEvidence, BackendRiskObservation } from './agent-backend-risk-evidence';
export { backendRiskEvidenceSchema } from './agent-backend-risk-evidence';

/**
 * Server-to-server READ only. The Backend endpoint authenticates the existing
 * Agent internal token AND re-reads actor ADMIN/isActive from current DB.
 * This is NOT a purchase/approval capability or a forged ADMIN JWT.
 */
const code = z.string().regex(/^[A-Z0-9_]{1,64}$/);
const risk = z.object({
    ingredientId: z.string().min(1).max(120),
    asOf: z.iso.datetime(),
    rowVersion: z.number().int().nonnegative(),
    movementCursor: z.string().regex(/^\d+$/),
    availableBase: z.number().finite().nonnegative(),
    demand: z.object({
        model: z.literal('DETERMINISTIC_LEDGER_BASELINE'),
        evidenceWindowDays: z.literal(30),
        observedMovements: z.number().int().nonnegative(),
        observedConsumptionDays: z.number().int().nonnegative(),
        dailyRate: z.number().finite().nonnegative(),
        confidence: z.enum(['LOW', 'MEDIUM', 'HIGH']),
        trend: z.enum(['RISING', 'FALLING', 'STABLE', 'UNKNOWN'])
    }),
    supplyTiming: z.object({ codes: z.array(code).max(40) }),
    inboundOutstandingBase: z.number().finite().nonnegative(),
    stockoutEstimateDays: z.number().finite().nonnegative().nullable(),
    incoming: z.array(z.object({
        purchaseOrderId: z.string().min(1).max(120),
        unreceivedBase: z.number().finite().nonnegative(),
        confirmationSource: z.string().min(1).max(120),
        estimatedLate: z.boolean()
    })).max(1000),
    openPurchaseRequests: z.array(z.object({
        id: z.string().min(1).max(120),
        status: z.enum(['PENDING', 'APPROVED', 'SENT']),
        demandHashPresent: z.boolean()
    })).max(64),
    openPurchaseRequestsTruncated: z.boolean(),
    nearExpiryBase: z.number().finite().nonnegative(),
    potentialExpirySurplusBase: z.number().finite().nonnegative(),
    pendingStockCountItems: z.number().int().nonnegative(),
    pendingPurchaseRequestItems: z.number().int().nonnegative(),
    codes: z.array(code).max(60),
    providerDeliveryVerified: z.literal(false),
    purchasingDecision: z.literal('HOLD_FOR_AUTHORIZED_REVIEW'),
    policyVersionApproved: z.literal(false),
    writesPerformed: z.literal(false)
});
const response = z.object({ success: z.literal(true), data: risk });
/** SSRF restriction: explicitly configured host; no redirects or arbitrary URLs. */
export function backendReadBaseUrl(): string {
    const configured = process.env.AGENT_BACKEND_READ_BASE_URL ?? process.env.API_INTERNAL_BASE_URL;
    if (!configured) throw new Error('BACKEND_RISK_UNVERIFIED');
    let url: URL;
    try { url = new URL(configured); } catch { throw new Error('BACKEND_RISK_UNVERIFIED'); }
    if (!['127.0.0.1', 'localhost', 'api', 'cafe-api', 'host.docker.internal'].includes(url.hostname) ||
        (url.protocol !== 'http:' && url.protocol !== 'https:') ||
        url.username || url.password || url.search || url.hash || (url.pathname !== '/' && url.pathname !== '')) {
        throw new Error('BACKEND_RISK_UNVERIFIED');
    }
    return url.origin;
}
/** Two bounded attempts for safe GET only; never retry auth, malformed data or arbitrary URLs. */
export async function fetchBackendRiskJson(url: URL, token: string): Promise<unknown> {
    // Bounded service-token READ allowlist: demand/risk plus the independent
    // supplier catalog eligibility projection. Never allow arbitrary internal
    // paths, proposals, approvals, purchasing writes or supplier dispatches.
    const allowedRead =
        /^\/api\/agent\/internal\/demand-risk\/[A-Za-z0-9][A-Za-z0-9:_-]{0,119}$/.test(url.pathname) ||
        /^\/api\/agent\/internal\/ingredients\/[A-Za-z0-9][A-Za-z0-9:_-]{0,119}\/supplier-eligibility$/.test(url.pathname);
    if (!['127.0.0.1', 'localhost', 'api', 'cafe-api', 'host.docker.internal'].includes(url.hostname) ||
        !['http:', 'https:'].includes(url.protocol) || !allowedRead ||
        url.username || url.password || url.hash || !token) throw new Error('BACKEND_RISK_UNVERIFIED');
    for (let attempt = 0; attempt < 2; attempt++) {
        try {
            const result = await fetch(url, {
                headers: { 'x-agent-internal-token': token, accept: 'application/json' },
                redirect: 'error', signal: AbortSignal.timeout(4500)
            });
            if (result.status === 503 && attempt === 0) continue;
            if (result.status !== 200 || !result.headers.get('content-type')?.includes('application/json')) {
                throw new Error('BACKEND_RISK_UNVERIFIED');
            }
            if (Number(result.headers.get('content-length') ?? 0) > 65536) throw new Error('BACKEND_RISK_UNVERIFIED');
            const raw = await result.text();
            if (Buffer.byteLength(raw, 'utf8') > 65536) throw new Error('BACKEND_RISK_UNVERIFIED');
            return JSON.parse(raw);
        } catch (error) {
            const timeoutOrNetwork = error instanceof Error &&
                (['TimeoutError', 'AbortError', 'TypeError'].includes(error.name));
            if (attempt === 0 && timeoutOrNetwork) continue;
            throw new Error('BACKEND_RISK_UNVERIFIED');
        }
    }
    throw new Error('BACKEND_RISK_UNVERIFIED');
}

/** All raw response fields stay local; only bounded observation codes enter graph checkpoints. */
export async function readBackendPerceptionRisk(actorId: string, inventory: InventoryRow[]): Promise<BackendRiskEvidence> {
    await requireAgentUser(actorId, ['ADMIN']);
    if (!inventory.length || inventory.length > 4) throw new Error('BACKEND_RISK_UNVERIFIED');
    const origin = backendReadBaseUrl(), token = requireInternalSecret();
    const evidence = await Promise.all(inventory.map(async row => {
        if (!/^[A-Za-z0-9][A-Za-z0-9:_-]{0,119}$/.test(row.ingredientId)) {
            throw new Error('BACKEND_RISK_UNVERIFIED');
        }
        const url = new URL('/api/agent/internal/demand-risk/' + encodeURIComponent(row.ingredientId), origin);
        url.searchParams.set('actorId', actorId);
        const payload = await fetchBackendRiskJson(url, token);
        const parsed = response.safeParse(payload);
        if (!parsed.success) throw new Error('BACKEND_RISK_UNVERIFIED');
        const data = parsed.data.data;
        const asOf = Date.parse(data.asOf);
        if (data.ingredientId !== row.ingredientId ||
            String(data.rowVersion + 1) !== row.version ||
            !Number.isFinite(asOf) || Math.abs(Date.now() - asOf) > 300000 ||
            data.availableBase > Number(row.remaining) ||
            (data.pendingStockCountItems > 0 && !data.codes.includes('STOCKTAKE_UNCERTAIN')) ||
            (data.inboundOutstandingBase > 0 && !data.codes.includes('INBOUND_NOT_PHYSICAL')) ||
            (data.pendingPurchaseRequestItems > 0 && !data.codes.includes('EXISTING_PURCHASE_REQUEST'))) {
            throw new Error('BACKEND_RISK_UNVERIFIED');
        }
        const verifiedInbound = data.incoming.reduce((total, item) => total + item.unreceivedBase, 0);
        if (Math.abs(verifiedInbound - data.inboundOutstandingBase) > 0.001 ||
            data.openPurchaseRequests.length > data.pendingPurchaseRequestItems ||
            (data.openPurchaseRequestsTruncated && data.pendingPurchaseRequestItems <= data.openPurchaseRequests.length)) {
            throw new Error('BACKEND_RISK_UNVERIFIED');
        }
        return { codes: [
            ...data.codes, ...data.supplyTiming.codes,
            ...(data.demand.confidence === 'LOW' ? ['DEMAND_LOW_CONFIDENCE'] : []),
            ...(data.demand.trend === 'RISING' ? ['OBSERVED_DEMAND_RISING'] : []),
            ...(data.nearExpiryBase > 0 ? ['NEAR_EXPIRY_BACKEND'] : []),
            ...(data.potentialExpirySurplusBase > 0 ? ['EXPIRY_SURPLUS_BACKEND'] : [])
        ], observation: {
            ingredientId: data.ingredientId, asOf: data.asOf,
            rowVersion: data.rowVersion, movementCursor: data.movementCursor,
            availableBase: String(data.availableBase),
            projectedDaysRemaining: data.stockoutEstimateDays,
            forecastConfidence: data.demand.confidence,
            demandWindowDays: data.demand.evidenceWindowDays,
            observedConsumptionMovements: data.demand.observedMovements,
            incomingPurchaseOrders: data.incoming.map(item => ({
                purchaseOrderId: item.purchaseOrderId,
                unreceivedBase: String(item.unreceivedBase),
                confirmationSource: item.confirmationSource,
                estimatedLate: item.estimatedLate
            })),
            outstandingPurchaseRequests: data.openPurchaseRequests.map(item => ({
                id: item.id, status: item.status, demandHashPresent: item.demandHashPresent
            })), outstandingPurchaseRequestsTruncated: data.openPurchaseRequestsTruncated,
            pendingStocktakes: data.pendingStockCountItems
        } satisfies BackendRiskObservation };
    }));
    return { codes: [...new Set(evidence.flatMap(item => item.codes))],
        observations: evidence.map(item => item.observation) };
}
/** Compatibility for existing callers expecting classifications only. */
export async function readBackendDemandRisk(actorId: string, inventory: InventoryRow[]): Promise<string[]> {
    return (await readBackendPerceptionRisk(actorId, inventory)).codes;
}
