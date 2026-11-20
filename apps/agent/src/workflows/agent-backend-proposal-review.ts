import { z } from 'zod';
import { createHash } from 'node:crypto';
import { requireAgentUser, requireInternalSecret } from '../internal-auth';
import { backendReadBaseUrl } from './agent-backend-demand-risk';

/** Exact identity of the Backend-owned proposal revision. Never an authority to execute. */
export const proposalReviewReferenceSchema = z.strictObject({
    proposalId: z.string().regex(/^[A-Za-z0-9][A-Za-z0-9:_-]{0,119}$/),
    version: z.number().int().positive().max(2147483647),
    contentHash: z.string().regex(/^[a-f0-9]{64}$/)
});
export type ProposalReviewReference = z.infer<typeof proposalReviewReferenceSchema>;
export type ProposalBackendStatus = 'PENDING_APPROVAL' | 'APPROVED_AWAITING_BACKEND' |
    'REJECTED' | 'EXECUTED' | 'STALE_PROPOSAL' | 'BACKEND_UNVERIFIED';
export type ProposalReviewObservation = ProposalReviewReference & {
    backendStatus: ProposalBackendStatus;
    observedAt: string;
    httpStatus: 200 | 409 | null;
    approved: boolean;
    rejected: boolean;
    purchaseRequestPresent: boolean;
    /** Sanitized Backend decision provenance, never a locally minted grant. */
    decisionActorId: string | null;
    decisionAt: string | null;
    /** No free-text rejectionReason is persisted in graph, trace or LLM input. */
    rejectionReasonHash: string | null;
    /** Always false: an inspection is NEVER Backend approval or execution. */
    writesPerformed: false;
};

const nullableId = z.string().min(1).max(120).nullable();
const nullableDate = z.iso.datetime().nullable();
const response = z.strictObject({
    success: z.literal(true),
    message: z.string(),
    data: z.strictObject({
        proposalId: proposalReviewReferenceSchema.shape.proposalId,
        version: proposalReviewReferenceSchema.shape.version,
        contentHash: proposalReviewReferenceSchema.shape.contentHash,
        status: z.enum(['PENDING_APPROVAL', 'APPROVED_AWAITING_BACKEND', 'REJECTED', 'EXECUTED']),
        approvedById: nullableId, approvedAt: nullableDate,
        rejectedById: nullableId, rejectedAt: nullableDate,
        rejectionReason: z.string().min(3).max(1000).nullable(),
        purchaseRequestId: nullableId, writesPerformed: z.literal(false)
    })
});
// Backend can return other 409 integrity faults. Never conflate those with a
// normal stale revision and conceal a corrupt/missing current snapshot.
const staleResponse = z.strictObject({
    success: z.literal(false),
    message: z.literal('STALE_PROPOSAL'),
    code: z.literal('STALE_PROPOSAL'),
    data: z.null()
});
type BackendProposal = z.infer<typeof response>['data'];
function consistent(value: BackendProposal): boolean {
    const approved = Boolean(value.approvedById && value.approvedAt);
    const rejected = Boolean(value.rejectedById && value.rejectedAt);
    if (Boolean(value.approvedById) !== Boolean(value.approvedAt) ||
        Boolean(value.rejectedById) !== Boolean(value.rejectedAt) ||
        Boolean(value.rejectionReason) !== rejected) return false;
    if (value.status === 'PENDING_APPROVAL')
        return !approved && !rejected && !value.purchaseRequestId;
    if (value.status === 'APPROVED_AWAITING_BACKEND')
        return approved && !rejected && !value.purchaseRequestId;
    if (value.status === 'REJECTED')
        return rejected && !value.purchaseRequestId;
    return approved && !rejected && Boolean(value.purchaseRequestId);
}

/**
 * The Backend checks the existing strong service token AND CURRENT active
 * ADMIN in PostgreSQL. A 409 is a persisted stale-revision observation, not a
 * reason to auto-select the newest version or synthesize ADMIN approval.
 *
 * Retry once only for transient 502/503/504/429 or network failure; no retry
 * for 400/401/403/404/409. Never propagate response text, rejection reason,
 * snapshot or supplier/customer content into graph state.
 */
export async function inspectBackendProposalRevision(
    actorId: string, raw: ProposalReviewReference
): Promise<ProposalReviewObservation> {
    const reference = proposalReviewReferenceSchema.safeParse(raw);
    if (!reference.success) throw new Error('INVALID_PROPOSAL_REFERENCE');
    await requireAgentUser(actorId, ['ADMIN']);
    const origin = backendReadBaseUrl();
    const token = requireInternalSecret();
    const target = new URL('/api/agent/internal/purchase-proposals/' +
        encodeURIComponent(reference.data.proposalId) + '/status', origin);
    target.searchParams.set('actorId', actorId);
    target.searchParams.set('version', String(reference.data.version));
    target.searchParams.set('contentHash', reference.data.contentHash);
    const blocked = () => { throw new Error('BACKEND_PROPOSAL_UNVERIFIED'); };
    for (let attempt = 0; attempt < 2; attempt++) {
        let result: Response;
        try {
            result = await fetch(target, {
                method: 'GET',
                headers: { 'x-agent-internal-token': token, accept: 'application/json' },
                redirect: 'error',
                signal: AbortSignal.timeout(4500)
            });
        } catch {
            if (attempt === 0) { await new Promise(resolve => setTimeout(resolve, 50)); continue; }
            return blocked();
        }
        if (result.status === 409) {
            let isStale = false;
            try {
                if (result.headers.get('content-type')?.includes('application/json') &&
                    Number(result.headers.get('content-length') ?? 0) <= 4096) {
                    const body = await result.text();
                    isStale = Buffer.byteLength(body, 'utf8') <= 4096 &&
                        staleResponse.safeParse(JSON.parse(body)).success;
                }
            } catch { /* Malformed/error response is never accepted as STALE. */ }
            if (!isStale) return blocked();
            return { ...reference.data, backendStatus: 'STALE_PROPOSAL', observedAt: new Date().toISOString(),
                httpStatus: 409, approved: false, rejected: false, purchaseRequestPresent: false,
                decisionActorId: null, decisionAt: null, rejectionReasonHash: null, writesPerformed: false };
        }
        if ([429, 502, 503, 504].includes(result.status) && attempt === 0) {
            await result.body?.cancel();
            await new Promise(resolve => setTimeout(resolve, 50));
            continue;
        }
        if (result.status !== 200 || !result.headers.get('content-type')?.includes('application/json') ||
            Number(result.headers.get('content-length') ?? 0) > 16384) return blocked();
        let rawJson: unknown;
        try {
            const rawText = await result.text();
            if (Buffer.byteLength(rawText, 'utf8') > 16384) return blocked();
            rawJson = JSON.parse(rawText);
        } catch { return blocked(); }
        const parsed = response.safeParse(rawJson);
        if (!parsed.success || !consistent(parsed.data.data)) return blocked();
        const data = parsed.data.data;
        if (data.proposalId !== reference.data.proposalId || data.version !== reference.data.version ||
            data.contentHash !== reference.data.contentHash) return blocked();
        return {
            ...reference.data, backendStatus: data.status, observedAt: new Date().toISOString(), httpStatus: 200,
            approved: Boolean(data.approvedById && data.approvedAt),
            rejected: Boolean(data.rejectedById && data.rejectedAt),
            purchaseRequestPresent: Boolean(data.purchaseRequestId),
            decisionActorId: data.status === 'REJECTED' ? data.rejectedById : data.approvedById,
            decisionAt: data.status === 'REJECTED' ? data.rejectedAt : data.approvedAt,
            rejectionReasonHash: data.status === 'REJECTED' && data.rejectionReason
                ? createHash('sha256').update(data.rejectionReason, 'utf8').digest('hex') : null,
            writesPerformed: false
        };
    }
    return blocked();
}
