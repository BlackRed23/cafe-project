import { createHash } from 'node:crypto';
import { anomalyInputSchema, authorityProofSchema, anomalyResultSchema,
    ANM_CONTRACT_VERSION, type AnomalyInput, type AnomalyResult,
    type AnomalyCode, type AnomalyAuthority, type AuthorityProof } from './anomaly.schema';

const SCALE = 10000n;
const FIVE_MINUTES_MS = 300000;
type Severity = AnomalyResult['findings'][number]['severity'];
type Finding = AnomalyResult['findings'][number];

/** No floating-point accounting: all quantities are scaled integer decimal values. */
export function toAnomalyUnits(value: string): bigint {
    const sign = value.startsWith('-') ? -1n : 1n;
    const [whole, fraction = ''] = value.replace(/^-/, '').split('.');
    return sign * (BigInt(whole!) * SCALE + BigInt(fraction.padEnd(4, '0')));
}

/** Bind to an authenticated persisted source snapshot, excluding ledger dedup metadata. */
export function hashAnomalyEvidence(value: AnomalyInput): string {
    return createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

function eventKey(input: AnomalyInput, code: AnomalyCode, entityId: string): string {
    return createHash('sha256').update(JSON.stringify([
        input.source.sourceId, input.source.sourceVersion, input.source.rowVersion ?? null,
        input.source.movementCursor ?? null, code, entityId
    ])).digest('hex');
}

const staleness = (date: string, now: Date): boolean => {
    const age = now.getTime() - Date.parse(date);
    return !Number.isFinite(age) || age < 0 || age > FIVE_MINUTES_MS;
};

/**
 * A 'VERIFIED_SCHEMA' OBS flag is only a schema assessment, never independent
 * authentication. The authority must read source data and policy itself, and
 * verify actor/run/observation scope, fingerprint, version and cursor.
 * This function has no Backend, Graph, approval, procurement or write access.
 */
export async function evaluateAnomalies(
    raw: unknown, authority?: AnomalyAuthority, now?: Date
): Promise<AnomalyResult> {
    const parsed = anomalyInputSchema.safeParse(raw);
    if (!parsed.success || (now && !Number.isFinite(now.getTime()))) throw new Error('ANM_INPUT_REJECTED');
    const input = parsed.data;
    let candidateProof: AuthorityProof | undefined;
    if (authority) {
        try {
            const candidate = authorityProofSchema.safeParse(await authority.verify(input));
            if (candidate.success) {
                const p = candidate.data;
                if (p.actorId === input.actorId && p.runId === input.runId &&
                    p.observationId === input.observationId && p.sourceId === input.source.sourceId &&
                    p.sourceVersion === input.source.sourceVersion &&
                    p.evidenceHash === hashAnomalyEvidence(input)) {
                    candidateProof = p;
                }
            }
        } catch {
            // Failed verification is a HOLD, never a fallback to caller claims.
        }
    }
    // With a real async authority provider, reference time MUST be sampled
    // after its independent read. A fixed test clock remains exact when given.
    // This is not tolerance for future timestamps: staleness still rejects
    // even one millisecond in the future relative to the chosen time.
    const verifiedAt = now ?? new Date();
    const proof = candidateProof && !staleness(candidateProof.recordedAt, verifiedAt)
        ? candidateProof : undefined;
    const verified = proof !== undefined;
    const findings: Finding[] = [];
    const seen = new Set(proof?.priorEventIds ?? []);
    const add = (code: AnomalyCode, severity: Severity, details: Record<string, string> = {},
        entityId = input.entity.ingredientId, fresh = false): void => {
        const eventId = eventKey(input, code, entityId);
        const duplicate = seen.has(eventId);
        if (findings.some(f => f.eventId === eventId)) return;
        findings.push({
            code, severity, entityId, eventId, sourceVersion: input.source.sourceVersion,
            sourceConfidence: verified ? 'ATTESTED' : 'UNVERIFIED',
            policyRef: proof?.policyRef ?? null, traceRef: input.source.traceRef,
            observedEvidence: details,
            recommendedRoute: !verified || severity === 'CRITICAL' || severity === 'INSUFFICIENT'
                ? 'HOLD' : severity === 'REVIEW' || severity === 'WARNING' ? 'REVIEW' : 'CONTINUE',
            requiresFreshRead: fresh, requiresHumanReview: severity !== 'INFO',
            duplicate, newRecommendation: verified && !duplicate && severity !== 'INFO',
            noWrite: true
        });
    };

    // ANM-07: An OBS schema status is not authorization. Fail closed even if no other anomalies.
    if (input.observation.observationStatus !== 'SUCCESS' ||
        input.observation.dataQuality !== 'VERIFIED_SCHEMA' ||
        !input.observation.verifiedForBusiness) {
        add('INVALID_OBSERVATION', 'CRITICAL', {
            status: input.observation.observationStatus,
            quality: input.observation.dataQuality
        }, input.observationId, true);
    }
    if (!input.stock && !input.batches && !input.stocktake && !input.consumption &&
        !input.reconciliation && !input.inbound) {
        add('NO_BUSINESS_EVIDENCE', 'INSUFFICIENT', {}, input.source.sourceId, true);
    }
    // ANM-08: Both timestamps and the authority revision must be current.
    if (staleness(input.source.readAt, verifiedAt)) {
        add('STALE_CONTEXT', 'CRITICAL', { readAt: input.source.readAt }, input.source.sourceId, true);
    }
    if (proof && ((input.source.rowVersion !== undefined &&
        proof.rowVersion !== input.source.rowVersion) ||
        (input.source.movementCursor !== undefined &&
        proof.movementCursor !== input.source.movementCursor))) {
        add('SOURCE_VERSION_CONFLICT', 'CRITICAL', {
            expectedRowVersion: String(input.source.rowVersion ?? ''),
            actualRowVersion: String(proof.rowVersion ?? ''),
            expectedMovementCursor: input.source.movementCursor ?? '',
            actualMovementCursor: proof.movementCursor ?? ''
        }, input.source.sourceId, true);
    }
    // ANM-01: available may legitimately be negative, but the source identity still
    // needs an independent check. Negative physical/reserved/eligible is never clamped.
    if (input.stock) {
        const s = input.stock;
        const physical = toAnomalyUnits(s.physical), eligible = toAnomalyUnits(s.eligible);
        const reserved = toAnomalyUnits(s.reserved), available = toAnomalyUnits(s.available);
        if (physical < 0n || eligible < 0n || reserved < 0n) {
            add('NEGATIVE_INVENTORY', 'CRITICAL', s);
        }
        if (physical < eligible || eligible - reserved !== available) {
            add('INCONSISTENT_STOCK', 'CRITICAL', s);
        } else if (available < 0n) {
            // PER/Backend currently requires reserved <= eligible, so this is
            // not a safe, authorized negative-availability state.
            add('NEGATIVE_AVAILABLE_SHORTAGE', 'CRITICAL', s);
        }
    }
    // ANM-02: a count submitted for review cannot mutate official inventory.
    if (input.stocktake) {
        const s = input.stocktake;
        const expectedVariance = toAnomalyUnits(s.counted) - toAnomalyUnits(s.expected);
        if (expectedVariance !== toAnomalyUnits(s.variance)) {
            add('STOCKTAKE_VARIANCE', 'CRITICAL', {
                expected: s.expected, counted: s.counted, reportedVariance: s.variance
            }, s.id);
        } else if (expectedVariance !== 0n && s.status !== 'APPROVED') {
            add('STOCKTAKE_VARIANCE', 'REVIEW', {
                expected: s.expected, counted: s.counted,
                variance: s.variance, approvalStatus: s.status
            }, s.id);
        }
        if (s.status !== 'APPROVED' && s.adjustmentApplied) {
            add('UNAPPROVED_STOCKTAKE_MUTATION', 'CRITICAL',
                { approvalStatus: s.status, adjustmentApplied: 'true' }, s.id);
        }
        if (s.sourceVersion !== input.source.sourceVersion) {
            add('STOCKTAKE_VERSION_DRIFT', 'CRITICAL',
                { stocktakeVersion: s.sourceVersion }, s.id, true);
        }
    }
    // ANM-03: missing setting or historical baseline is uncertainty, not invented data.
    if (input.consumption) {
        const c = input.consumption, policy = proof?.consumptionPolicy;
        if (!policy || toAnomalyUnits(policy.thresholdMultiplier) < SCALE) {
            add('CONSUMPTION_POLICY_MISSING', 'INSUFFICIENT', {}, input.entity.ingredientId, true);
        } else if (c.historyDays < policy.minimumHistoryDays ||
            c.historyMovements < policy.minimumHistoryMovements) {
            add('CONSUMPTION_WINDOW_INADEQUATE', 'INSUFFICIENT', {
                historyDays: String(c.historyDays), historyMovements: String(c.historyMovements)
            }, input.entity.ingredientId, true);
        } else if (c.baselinePerDay === null || toAnomalyUnits(c.baselinePerDay) === 0n) {
            add('CONSUMPTION_BASELINE_MISSING', 'INSUFFICIENT', {
                baselinePerDay: String(c.baselinePerDay)
            }, input.entity.ingredientId, true);
        } else if (toAnomalyUnits(c.observedTotal) * SCALE >
            toAnomalyUnits(c.baselinePerDay) * BigInt(c.windowDays) *
                toAnomalyUnits(policy.thresholdMultiplier)) {
            add('CONSUMPTION_SPIKE', 'REVIEW', {
                observedTotal: c.observedTotal, baselinePerDay: c.baselinePerDay,
                windowDays: String(c.windowDays), approvedMultiplier: policy.thresholdMultiplier
            });
        }
    }
    // ANM-04/05: compare lot provenance with eligibility and aggregate exactly.
    if (input.batches) {
        const ids = new Set<string>();
        let total = 0n, eligible = 0n;
        for (const lot of input.batches) {
            if (ids.has(lot.id)) {
                add('BATCH_SUM_MISMATCH', 'CRITICAL', { duplicateLotId: lot.id }, lot.id);
                continue;
            }
            ids.add(lot.id);
            const amount = toAnomalyUnits(lot.physical);
            total += amount;
            const expired = lot.expirationDate !== null &&
                Date.parse(lot.expirationDate) <= Date.parse(input.source.readAt);
            const allowed = lot.qualityStatus === 'AVAILABLE' && !expired;
            if (allowed) eligible += amount;
            if (amount < 0n) add('NEGATIVE_INVENTORY', 'CRITICAL', { physical: lot.physical }, lot.id);
            if (lot.eligibleForSale !== allowed) {
                add('SELLABLE_BATCH_CONFLICT', 'CRITICAL', {
                    qualityStatus: lot.qualityStatus,
                    eligibleForSale: String(lot.eligibleForSale)
                }, lot.id);
            }
            if (amount <= 0n) continue;
            if (lot.qualityStatus === 'QUARANTINED') add('QUARANTINED_BATCH', 'REVIEW',
                { amount: lot.physical, originRef: lot.originRef ?? '' }, lot.id);
            if (lot.qualityStatus === 'RECALLED') add('RECALLED_BATCH', 'CRITICAL',
                { amount: lot.physical, originRef: lot.originRef ?? '' }, lot.id);
            if (lot.qualityStatus === 'UNAVAILABLE') add('UNAVAILABLE_BATCH', 'REVIEW',
                { amount: lot.physical }, lot.id);
            if (lot.qualityStatus === 'UNKNOWN') add('UNKNOWN_BATCH_QUALITY', 'INSUFFICIENT',
                { amount: lot.physical }, lot.id, true);
            if (expired) add('EXPIRED_BATCH', 'REVIEW',
                { amount: lot.physical, expiresAt: lot.expirationDate!,
                    originRef: lot.originRef ?? '' }, lot.id);
            if (lot.expirationDate === null) add('UNKNOWN_EXPIRY_LOT', 'WARNING',
                { amount: lot.physical }, lot.id);
        }
        if (input.stock && (total !== toAnomalyUnits(input.stock.physical) ||
            eligible !== toAnomalyUnits(input.stock.eligible))) {
            add('BATCH_SUM_MISMATCH', 'CRITICAL', {
                aggregatePhysical: input.stock.physical, computedPhysicalScaled: String(total),
                aggregateEligible: input.stock.eligible, computedEligibleScaled: String(eligible)
            });
        }
    }
    if (input.reconciliation) {
        const r = input.reconciliation;
        const conflict = toAnomalyUnits(r.ledgerPhysical) !== toAnomalyUnits(r.aggregatePhysical) ||
            toAnomalyUnits(r.aggregatePhysical) !== toAnomalyUnits(r.batchPhysical) ||
            (input.stock !== undefined &&
                toAnomalyUnits(r.reserved) !== toAnomalyUnits(input.stock.reserved));
        if (conflict) {
            const aligned = r.rowVersion === input.source.rowVersion &&
                r.movementCursor === input.source.movementCursor;
            add(aligned ? 'SOURCE_BALANCE_CONFLICT' : 'RECONCILIATION_TIMING_DIFFERENCE',
                aligned ? 'CRITICAL' : 'INSUFFICIENT', {
                    ledgerPhysical: r.ledgerPhysical, aggregatePhysical: r.aggregatePhysical,
                    batchPhysical: r.batchPhysical, rowVersion: String(r.rowVersion),
                    movementCursor: r.movementCursor
                }, input.entity.ingredientId, !aligned);
        }
    }
    // ANM-06: PO receipts are evidence only, never a source of sellable stock before receipt.
    if (input.inbound) {
        const allReceiptRefs = new Set<string>();
        for (const po of input.inbound) {
            const received = toAnomalyUnits(po.receivedBase);
            const ordered = toAnomalyUnits(po.orderedBase);
            if (received > ordered) add('PO_OVERRECEIPT', 'CRITICAL',
                { ordered: po.orderedBase, received: po.receivedBase }, po.purchaseOrderId);
            if (received > 0n && po.goodsReceiptRefs.length === 0) {
                add('PO_MISSING_RECEIPT', 'CRITICAL',
                    { received: po.receivedBase }, po.purchaseOrderId);
            }
            for (const [kind, refs] of [['goods', po.goodsReceiptRefs],
                ['external', po.receiptReferences]] as const) {
                for (const ref of refs) {
                    const key = kind + ':' + ref;
                    if (allReceiptRefs.has(key)) add('PO_DUPLICATE_RECEIPT', 'CRITICAL',
                    { duplicateReference: ref }, ref);
                    allReceiptRefs.add(key);
                }
            }
            if (!po.conversionVerified) add('PO_CONVERSION_UNVERIFIED', 'INSUFFICIENT',
                { purchaseOrderId: po.purchaseOrderId }, po.purchaseOrderId, true);
            if ((po.status === 'RECEIVED' && received !== ordered) ||
                (po.status === 'CANCELLED' && received > 0n)) {
                add('PO_STATUS_CONFLICT', 'REVIEW',
                    { status: po.status, received: po.receivedBase }, po.purchaseOrderId);
            }
        }
    }
    // ANM-09: past event IDs are supplied only by an independently verified audit ledger.
    if (!verified) add('SOURCE_UNVERIFIED', 'CRITICAL',
        { reason: 'NO_INDEPENDENT_AUTHORITY_PROOF' }, input.source.sourceId, true);
    const has = (severity: Severity) => findings.some(f => f.severity === severity);
    const status: AnomalyResult['status'] = !verified || has('CRITICAL') ? 'HOLD' :
        has('INSUFFICIENT') ? 'INSUFFICIENT_EVIDENCE' : has('REVIEW') ? 'REVIEW_REQUIRED' :
            has('WARNING') ? 'WARNING' : 'NORMAL';
    return anomalyResultSchema.parse({
        contractVersion: ANM_CONTRACT_VERSION, runId: input.runId,
        observationId: input.observationId, sourceVerified: verified,
        evidenceLevel: verified ? 'SOURCE_ATTESTED' : 'UNIT_ONLY', status,
        readOnly: true, canApprove: false, canPurchase: false,
        requiresFreshRead: findings.some(f => f.requiresFreshRead),
        requiresHumanReview: findings.some(f => f.requiresHumanReview),
        findings
    });
}
