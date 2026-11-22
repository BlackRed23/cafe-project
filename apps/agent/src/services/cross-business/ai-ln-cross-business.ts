/**
 * AI-LN read-side business gate.
 *
 * This service composes the existing PUR independent Backend authority with
 * source-version fencing. It never creates a PR/PO, approves, sends to suppliers
 * or grants a role. The authority MUST be backed by authenticated live reads for
 * production; fixture authorities prove only contract behavior in unit tests.
 *
 * It is intentionally NOT presented as a LangGraph-integrated purchasing step.
 * The workflow and Backend purchasing writer are independently owned.
 */
import { createHash } from 'node:crypto';
import { purchasingAuthorityProofSchema, purchasingInputSchema,
    type PurchasingAuthority, type PurchasingInput } from '../purchasing/purchasing.schema';
import { evaluatePurchasing } from '../purchasing/purchasing.service';
import { createPurchasingHttpReadAuthority } from '../purchasing/purchasing.backend-read';

const ids = [
    'AI-LN-01', 'AI-LN-02', 'AI-LN-03', 'AI-LN-04',
    'AI-LN-05', 'AI-LN-06', 'AI-LN-07', 'AI-LN-08',
    'AI-LN-09', 'AI-LN-10', 'AI-LN-11', 'AI-LN-12'
] as const;
export type AiLnCaseId = typeof ids[number];
type Status = 'HOLD' | 'REVIEW_REQUIRED' | 'NO_ACTION' |
    'BLOCKED_DATA' | 'BLOCKED_CAPABILITY' | 'BLOCKED_REQUIREMENT';
export type AiLnReadAssessment = {
    caseId: AiLnCaseId;
    status: Status;
    reasons: string[];
    sourceAttested: boolean;
    rowVersion: number | null;
    movementCursor: string | null;
    availableBase: string | null;
    pendingStocktakes: number | null;
    incomingUnreceivedBase: string | null;
    decisionFingerprint: string;
    /** This is a local correlation receipt, NOT a durable DB audit ID. */
    receiptPersisted: false;
    readOnly: true;
    backendWriterInvoked: false;
    approvalPerformed: false;
    requiresBackendRevalidation: true;
};
const scaled = (value: string): bigint => {
    const [whole, fraction = ''] = value.split('.');
    return BigInt(whole!) * 10000n + BigInt(fraction.padEnd(4, '0'));
};
const format = (number: bigint): string => {
    if (number < 0n) throw new Error('AI_LN_NEGATIVE_AMOUNT');
    const fraction = (number % 10000n).toString().padStart(4, '0').replace(/0+$/, '');
    return (number / 10000n).toString() + (fraction ? '.' + fraction : '');
};
const digest = (value: unknown) => createHash('sha256')
    .update(JSON.stringify(value)).digest('hex');
const isFresh = (date: string, now: Date): boolean => {
    const age = now.getTime() - Date.parse(date);
    return Number.isFinite(age) && age >= -60000 && age <= 300000;
};

/** Prevent stale approvals, receipts and stocktakes from hiding in unchanged rowVersion. */
function businessFingerprint(proof: ReturnType<typeof purchasingAuthorityProofSchema.parse>) {
    const { sourceReadAt: _readAt, backendReadAt: _backendReadAt,
        ...perception } = proof.perception;
    return digest({
        inventory: perception,
        risk: proof.backendRisk.observations.map(({ asOf: _asOf, ...observation }) => observation),
        codes: proof.backendRisk.codes,
        stocktake: proof.stocktake,
        inbound: proof.inbound,
        suppliers: proof.suppliers,
        policy: proof.policy,
        recipeDemand: proof.recipeDemand
    });
}

/**
 * Two independently requested Backend authority reads, followed by existing PUR
 * decision evaluation. A changed source must HOLD instead of producing a stale
 * recommendation; a single failed read also HOLDs without fabricated stock.
 *
 * Reusable from a trusted Graph adapter, but until Graph and durable Backend
 * proposal writer are connected no result is an E2E purchasing acceptance.
 */
export async function assessAiLnReadOnly(caseId: AiLnCaseId, rawInput: unknown,
    authority: PurchasingAuthority | undefined, now: Date): Promise<AiLnReadAssessment> {
    if (!ids.includes(caseId) || !Number.isFinite(now.getTime())) {
        throw new Error('AI_LN_INVALID_REQUEST');
    }
    const input: PurchasingInput = purchasingInputSchema.parse(rawInput);
    let sourceAttested = false;
    let rowVersion: number | null = null;
    let movementCursor: string | null = null;
    let availableBase: string | null = null;
    let pendingStocktakes: number | null = null;
    let incomingUnreceivedBase: string | null = null;
    const outcome = (status: Status, reasons: string[]): AiLnReadAssessment => ({
        caseId, status, reasons: [...new Set(reasons)].sort(), sourceAttested,
        rowVersion, movementCursor, availableBase, pendingStocktakes, incomingUnreceivedBase,
        decisionFingerprint: digest([caseId, input.runId, input.actorId,
            input.ingredientId, rowVersion, movementCursor, status, [...new Set(reasons)].sort()]),
        receiptPersisted: false, readOnly: true, backendWriterInvoked: false,
        approvalPerformed: false, requiresBackendRevalidation: true
    });
    if (caseId === 'AI-LN-12') {
        return outcome('BLOCKED_REQUIREMENT', ['USER_EXPECTED_BEHAVIOR_SOURCE_NOT_RETRIEVED']);
    }
    if (['AI-LN-07', 'AI-LN-08'].includes(caseId)) {
        return outcome('BLOCKED_CAPABILITY', ['DURABLE_BACKEND_PROPOSAL_WRITER_UNCONNECTED']);
    }
    if (caseId === 'AI-LN-09') {
        return outcome('BLOCKED_CAPABILITY', ['VERIFIED_SUPPLIER_REJECTION_PORT_UNAVAILABLE']);
    }
    if (caseId === 'AI-LN-10') {
        return outcome('BLOCKED_CAPABILITY', ['EXECUTION_TIME_APPROVAL_POLICY_PORT_UNAVAILABLE']);
    }
    if (!authority) return outcome('HOLD', ['AUTHENTICATED_BACKEND_AUTHORITY_UNAVAILABLE']);
    try {
        const first = purchasingAuthorityProofSchema.parse(await authority.verify(input));
        const second = purchasingAuthorityProofSchema.parse(await authority.verify(input));
        const p = second.perception;
        const risk = second.backendRisk.observations.filter(
            o => o.ingredientId === input.ingredientId);
        if (first.actorId !== input.actorId || second.actorId !== input.actorId ||
            first.actorRole !== 'ADMIN' || second.actorRole !== 'ADMIN' ||
            first.ingredientId !== input.ingredientId || second.ingredientId !== input.ingredientId ||
            first.runId !== input.runId || second.runId !== input.runId ||
            risk.length !== 1 || p.ingredientId !== input.ingredientId ||
            !isFresh(first.verifiedAt, now) || !isFresh(second.verifiedAt, now) ||
            !isFresh(first.perception.sourceReadAt, now) ||
            !isFresh(p.sourceReadAt, now) || !isFresh(risk[0]!.asOf, now)) {
            return outcome('HOLD', ['BACKEND_SCOPE_OR_FRESHNESS_UNVERIFIED']);
        }
        // State mutation between two authenticated reads invalidates the run.
        if (businessFingerprint(first) !== businessFingerprint(second)) {
            return outcome('HOLD', ['BUSINESS_SOURCE_CHANGED_DURING_ANALYSIS']);
        }
        if (p.rowVersion !== input.expectedRowVersion ||
            p.movementCursor !== input.expectedMovementCursor ||
            p.rowVersion !== risk[0]!.rowVersion || p.movementCursor !== risk[0]!.movementCursor ||
            scaled(p.availableQuantity) !== scaled(risk[0]!.availableBase)) {
            return outcome('HOLD', ['BACKEND_SCOPE_OR_FRESHNESS_UNVERIFIED']);
        }
        // Existing PUR already reconciles individual lots, unit conversion,
        // inbound snapshots, stocktakes and policy; it does not execute writes.
        const purchase = await evaluatePurchasing(input, now, {
            verify: async () => second
        });
        if (!purchase.sourceAttested || purchase.status === 'HOLD') {
            return outcome('HOLD', purchase.reasons.length ? purchase.reasons :
                ['PURCHASING_EVIDENCE_UNVERIFIED']);
        }
        sourceAttested = true;
        rowVersion = p.rowVersion;
        movementCursor = p.movementCursor;
        availableBase = p.availableQuantity;
        pendingStocktakes = risk[0]!.pendingStocktakes;
        incomingUnreceivedBase = format(risk[0]!.incomingPurchaseOrders.reduce(
            (sum, item) => sum + scaled(item.unreceivedBase), 0n));
        switch (caseId) {
            case 'AI-LN-01':
                return p.belowThreshold && pendingStocktakes > 0
                    ? outcome('REVIEW_REQUIRED', ['PENDING_STOCKTAKE_NOT_OFFICIAL'])
                    : outcome('BLOCKED_DATA', ['PENDING_STOCKTAKE_TRIGGER_ABSENT']);
            case 'AI-LN-02':
                return p.belowThreshold && scaled(incomingUnreceivedBase) > 0n
                    ? outcome('REVIEW_REQUIRED', ['OUTSTANDING_PO_NOT_PHYSICAL_STOCK'])
                    : outcome('BLOCKED_DATA', ['PENDING_PO_TRIGGER_ABSENT']);
            case 'AI-LN-03': {
                const excluded = scaled(p.excludedQuantityByReason.expired) +
                    scaled(p.excludedQuantityByReason.qualityHold);
                return excluded > 0n && p.belowThreshold
                    ? outcome('REVIEW_REQUIRED', ['LOTS_EXCLUDED_FROM_ELIGIBLE_STOCK'])
                    : outcome('BLOCKED_DATA', ['EXPIRED_LOT_SHORTAGE_TRIGGER_ABSENT']);
            }
            case 'AI-LN-04':
                return second.backendRisk.codes.includes('OBSERVED_DEMAND_RISING') &&
                    risk[0]!.incomingPurchaseOrders.some(i => i.estimatedLate)
                    ? outcome('REVIEW_REQUIRED', ['DELIVERY_DELAY_NOT_PROVIDER_VERIFIED'])
                    : outcome('BLOCKED_DATA', ['VERIFIED_SPIKE_AND_DELAY_TRIGGER_ABSENT']);
            case 'AI-LN-05':
                return outcome('BLOCKED_DATA', ['STOCKTAKE_APPROVAL_RACE_NOT_OBSERVED']);
            case 'AI-LN-06':
                return outcome('BLOCKED_DATA', ['GOODS_RECEIPT_RACE_NOT_OBSERVED']);
            case 'AI-LN-11':
                return outcome('BLOCKED_DATA', ['CONTRADICTORY_INVENTORY_NOT_OBSERVED']);
            default:
                return outcome('BLOCKED_CAPABILITY', ['SCENARIO_PORT_NOT_IMPLEMENTED']);
        }
    } catch {
        return outcome('HOLD', ['BACKEND_AUTHORITY_OR_STOCK_RECONCILIATION_FAILED']);
    }
}

/**
 * Runtime entrypoint for REAL authenticated Backend GETs. The calling Graph/API
 * owner must supply an existing user's JWT; this does not issue credentials.
 * Do not expose the token in the browser-visible assessment or persisted audit.
 */
export function createAiLnBackendJwtReader(options: {
    baseUrl: string; bearerJwt: string; fetchImpl?: typeof fetch; clock?: () => Date
}) {
    const authority = createPurchasingHttpReadAuthority(options);
    return (caseId: AiLnCaseId, rawInput: unknown) =>
        assessAiLnReadOnly(caseId, rawInput, authority, options.clock?.() ?? new Date());
}
