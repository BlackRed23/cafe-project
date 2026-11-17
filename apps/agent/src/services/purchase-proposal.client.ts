import { createHash, randomUUID } from 'node:crypto';
import { AgentHttpError } from '../errors/http-error';

type Snapshot = {
    supplierId: string; ingredientId?: string; inventoryId?: string; quantity: number;
    unit: string; baseUnit: string; unitsPerPack: string; unitPrice: string;
    notes: string; emailContent: string | null;
};
type Reference = { version: number; contentHash: string };
type Proposal = Reference & { proposalId: string; snapshot: Snapshot; purchaseRequest?: Purchase | null };
type Purchase = { id: string; supplierId: string; agentProposalId: string; agentProposalVersion: number;
    notes: string; emailContent: string | null; items: { ingredientId?: string | null; inventoryId?: string | null; quantity: number; unitPrice: string | number }[] };
const snapshotHash = (snapshot: Snapshot) => createHash('sha256').update(JSON.stringify(snapshot, Object.keys(snapshot).sort())).digest('hex');

async function backend(path: string, method = 'GET', body?: unknown): Promise<any> {
    // Same secret authenticates service, never impersonates an ADMIN.
    const token = process.env.AGENT_INTERNAL_TOKEN;
    if (!token) throw new AgentHttpError(503, 'Backend proposal authentication unavailable.');
    const base = new URL(process.env.API_INTERNAL_BASE_URL || 'http://127.0.0.1:5000');
    if (base.username || base.password || !['http:', 'https:'].includes(base.protocol)) throw new AgentHttpError(503, 'Invalid Backend URL.');
    const response = await fetch(new URL('/api/agent/internal/purchase-proposals' + path, base), {
        method, signal: AbortSignal.timeout(15000), headers: { 'Content-Type': 'application/json', 'x-agent-internal-token': token },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    if (!response.ok) throw new AgentHttpError(response.status, 'Backend proposal request rejected.');
    const result = await response.json() as { data?: unknown };
    if (!result.data) throw new AgentHttpError(502, 'Backend proposal response invalid.');
    return result.data;
}

export async function submitPurchaseProposal(snapshot: Snapshot, proposalId: string = randomUUID()): Promise<Proposal> {
    const result = await backend('', 'POST', { proposalId, snapshot });
    if (result.proposalId !== proposalId || result.version !== 1 || !/^[a-f0-9]{64}$/.test(result.contentHash) ||
        !result.snapshot || snapshotHash(result.snapshot) !== result.contentHash) throw new AgentHttpError(502, 'Proposal identity mismatch.');
    return result;
}

/** A lost response can be retried with same key, or recovered through authoritative GET. */
export async function executeApprovedPurchaseProposal(proposalId: string, reference: Reference, idempotencyKey: string) {
    if (!Number.isInteger(reference.version) || reference.version < 1 || !/^[a-f0-9]{64}$/.test(reference.contentHash) || !idempotencyKey?.trim()) throw new AgentHttpError(400, 'Invalid proposal reference.');
    const path = '/' + encodeURIComponent(proposalId);
    const result = await backend(path + '/execute', 'POST', { ...reference, idempotencyKey });
    const persisted: Proposal = await backend(path);
    const pr = persisted.purchaseRequest, snapshot = persisted.snapshot;
    if (persisted.proposalId !== proposalId || persisted.version !== reference.version || persisted.contentHash !== reference.contentHash ||
        !snapshot || snapshotHash(snapshot) !== reference.contentHash || result.purchaseRequest?.id !== pr?.id || !pr || pr.agentProposalId !== proposalId || pr.agentProposalVersion !== reference.version ||
        pr.supplierId !== snapshot.supplierId || pr.notes !== snapshot.notes || pr.emailContent !== snapshot.emailContent || pr.items.length !== 1 ||
        (pr.items[0]!.ingredientId ?? undefined) !== snapshot.ingredientId || (pr.items[0]!.inventoryId ?? undefined) !== snapshot.inventoryId ||
        pr.items[0]!.quantity !== snapshot.quantity || Number(pr.items[0]!.unitPrice) !== Number(snapshot.unitPrice)) throw new AgentHttpError(502, 'PURCHASE_RESULT_UNVERIFIED');
    return { ...result, verified: true };
}
