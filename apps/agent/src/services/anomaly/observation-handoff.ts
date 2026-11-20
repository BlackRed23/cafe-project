/**
 * Session C only: a leaf OBS -> ANM bridge, NOT a new Graph or Backend authority.
 *
 * OBS currently emits a pure, non-durable proposal. The trusted Graph/Backend
 * owner must supply BOTH a correlated persisted snapshot and an independently
 * authenticated authority verifier. Merely supplying a VERIFIED_SCHEMA flag,
 * a BACKEND mode string, or a matching caller-generated hash is NOT proof.
 */
import { createHash } from 'node:crypto';
import { z } from 'zod';
import { TOOL_CONTRACTS } from '../../workflows/tool-contracts';
import {
    ANM_CONTRACT_VERSION, anomalyInputSchema, type AnomalyAuthority,
    type AnomalyInput, type AnomalyResult
} from './anomaly.schema';
import { evaluateAnomalies, toAnomalyUnits } from './anomaly.service';

export const OBS_ANM_HANDOFF_VERSION = 'OBS_ANM_HANDOFF_V1' as const;
const id = z.string().regex(/^[A-Za-z0-9][A-Za-z0-9:_-]{0,119}$/);
const instant = z.iso.datetime({ offset: true });
const observationSchema = z.strictObject({
    schemaVersion: z.literal('1.0.0'),
    observationStatus: z.enum(['SUCCESS', 'FAILED', 'INSUFFICIENT_DATA',
        'INVALID_OUTPUT', 'STALE', 'PARTIAL', 'REJECTED', 'DUPLICATE']),
    dataQuality: z.enum(['VERIFIED_SCHEMA', 'TEST_FIXTURE', 'INSUFFICIENT',
        'INVALID', 'STALE', 'UNTRUSTED']),
    trustedResult: z.unknown().optional(),
    evidenceReferences: z.array(id).max(32),
    warnings: z.array(z.string().regex(/^[A-Z0-9_]{1,64}$/)).max(32),
    errorCode: z.string().regex(/^[A-Z0-9_]{1,64}$/).optional(),
    requiresFreshRead: z.boolean(), requiresHumanReview: z.boolean(),
    auditTraceId: id,
    stateUpdateProposal: z.strictObject({
        action: z.enum(['PROPOSE_OBSERVATION', 'HOLD', 'IGNORE']),
        runId: id, invocationId: id, actorId: id, toolName: id,
        attemptNumber: z.number().int().nonnegative().max(2),
        proposedStatus: z.enum(['OBSERVED', 'FAILED', 'HELD_POLICY',
            'REVIEW_REQUIRED', 'UNCHANGED']),
        verifiedForBusiness: z.boolean()
    })
});
export type ObsAnmObservation = z.infer<typeof observationSchema>;

/** This scope must come from a verified AgentRepository execution, NOT an LLM. */
export const handoffScopeSchema = z.strictObject({
    graphId: id, runId: id, actorId: id, invocationId: id, toolName: id
});
export type HandoffScope = z.infer<typeof handoffScopeSchema>;

/** Output of an independent, authorized checkpoint + Backend snapshot reader. */
export const persistedSourceSchema = z.strictObject({
    graphId: id, runId: id, actorId: id, invocationId: id, toolName: id,
    observationId: id, observationAuditTraceId: id,
    /** Digest from a *persisted* OBS record, not a digest supplied by the caller. */
    persistedObservationDigest: z.string().regex(/^[a-f0-9]{64}$/),
    terminalCheckpointId: id, terminalAt: instant,
    source: anomalyInputSchema.shape.source,
    entity: anomalyInputSchema.shape.entity,
    stock: anomalyInputSchema.shape.stock,
    batches: anomalyInputSchema.shape.batches,
    stocktake: anomalyInputSchema.shape.stocktake,
    consumption: anomalyInputSchema.shape.consumption,
    reconciliation: anomalyInputSchema.shape.reconciliation,
    inbound: anomalyInputSchema.shape.inbound
});
export type PersistedAnomalySource = z.infer<typeof persistedSourceSchema>;

export type ObsAnmPort = {
    /** The port must fetch a durable, independently authenticated record. */
    loadPersistedSource(scope: HandoffScope): Promise<unknown>;
    /** The port must re-read/verify actor, scope, version, cursor and evidence. */
    authority: AnomalyAuthority;
};
export type HandoffResult = {
    version: typeof OBS_ANM_HANDOFF_VERSION;
    status: 'READY' | 'INCOMPLETE' | 'HOLD';
    reason: 'ACCEPTED' | 'INVALID_SCOPE' | 'INVALID_OBS_DECISION' |
        'OBS_NOT_ACCEPTED' | 'OBS_SCOPE_MISMATCH' | 'UNSUPPORTED_TOOL' |
        'UNVERIFIED_SOURCE' | 'MISSING_PROVENANCE' | 'STALE_SNAPSHOT' |
        'SOURCE_CONTRADICTION' | 'INVALID_TOOL_RESULT';
    missingFields: string[];
    graphId: string | null;
    runId: string | null;
    observationId: string | null;
    traceRef: string | null;
    input?: AnomalyInput;
    analysis?: AnomalyResult;
};

export function digestObservation(decision: ObsAnmObservation): string {
    return createHash('sha256').update(JSON.stringify(decision)).digest('hex');
}

const ageInvalid = (date: string, now: Date): boolean => {
    const delta = now.getTime() - Date.parse(date);
    return !Number.isFinite(delta) || delta < 0 || delta > 300000;
};
const quantityEqual = (raw: number, authoritative: string): boolean => {
    try { return toAnomalyUnits(String(raw)) === toAnomalyUnits(authoritative); }
    catch { return false; }
};

/**
 * Actual OBS output types differ by registered tool. Restrict conversion to
 * source fields independently cross-checked by a BACKEND read, not invented
 * "eligible" quantities, unit conversions, or model generated baselines.
 */
function validateToolEvidence(tool: string, output: unknown, p: PersistedAnomalySource):
    'MATCH' | 'INCOMPLETE' | 'CONFLICT' {
    if (tool === 'getIngredientAvailability') {
        const x = output as z.infer<typeof TOOL_CONTRACTS.getIngredientAvailability.output>;
        if (!p.stock) return 'INCOMPLETE'; // OBS output has no eligible physical lot evidence.
        return x.ingredientId === p.entity.ingredientId && x.baseUnit === p.entity.baseUnit &&
            x.rowVersion === p.source.rowVersion &&
            quantityEqual(x.quantity, p.stock.physical) &&
            quantityEqual(x.reserved, p.stock.reserved) &&
            quantityEqual(x.available, p.stock.available) ? 'MATCH' : 'CONFLICT';
    }
    if (tool === 'getIngredientBatches') {
        const x = output as z.infer<typeof TOOL_CONTRACTS.getIngredientBatches.output>;
        if (!p.batches) return 'INCOMPLETE'; // OBS lacks qualityStatus/eligibility.
        if (x.ingredientId !== p.entity.ingredientId || x.baseUnit !== p.entity.baseUnit ||
            x.batches.length !== p.batches.length) return 'CONFLICT';
        const byId = new Map(p.batches.map(b => [b.id, b]));
        return x.batches.every(b => {
            const source = byId.get(b.id);
            return !!source && quantityEqual(b.quantityRemaining, source.physical) &&
                b.expirationDate === source.expirationDate;
        }) ? 'MATCH' : 'CONFLICT';
    }
    if (tool === 'getStocktakeStatus') {
        const x = output as z.infer<typeof TOOL_CONTRACTS.getStocktakeStatus.output>;
        if (!p.stocktake) return 'INCOMPLETE'; // OBS lacks expected/count and adjustment state.
        const vars = x.unapprovedVariances;
        // The single-statement ANM stocktake shape cannot faithfully represent
        // multiple batch variances; future multi-batch DTO required.
        if (vars.length !== 1 || x.status !== p.stocktake.status) return 'INCOMPLETE';
        return x.stocktakeId === p.stocktake.id &&
            x.ingredientId === p.entity.ingredientId &&
            (!p.entity.batchId || vars[0]!.batchId === p.entity.batchId) &&
            toAnomalyUnits(vars[0]!.varianceBase) ===
                toAnomalyUnits(p.stocktake.variance) ? 'MATCH' : 'CONFLICT';
    }
    if (tool === 'getInboundPurchaseOrder') {
        const x = output as z.infer<typeof TOOL_CONTRACTS.getInboundPurchaseOrder.output>;
        if (!p.inbound || p.inbound.length !== 1) return 'INCOMPLETE';
        const row = p.inbound[0]!;
        if (x.purchaseOrderId !== row.purchaseOrderId ||
            x.ingredientId !== p.entity.ingredientId ||
            x.purchaseOrderStatus !== row.status) return 'CONFLICT';
        const sourceReceipts = new Set(row.goodsReceiptRefs);
        const observedConfirmed = x.goodsReceipts.filter(r => r.status === 'CONFIRMED');
        if (sourceReceipts.size !== observedConfirmed.length ||
            observedConfirmed.some(r => !sourceReceipts.has(r.receiptId))) return 'CONFLICT';
        // Never convert unreceived stock into physical; compare outstanding and receipts.
        const outstanding = toAnomalyUnits(row.orderedBase) - toAnomalyUnits(row.receivedBase);
        const observedMatches = toAnomalyUnits(x.observedReceivedBase) ===
            toAnomalyUnits(row.receivedBase);
        // Backend summary cannot safely express negative outstanding receipts.
        if (outstanding < 0n) return observedMatches ? 'MATCH' : 'CONFLICT';
        return observedMatches && toAnomalyUnits(x.pendingBase) === outstanding ?
            'MATCH' : 'CONFLICT';
    }
    return 'INCOMPLETE';
}

/** Only first-party, registered READ results are eligible for this handoff. */
const supported = new Set(['getIngredientAvailability', 'getIngredientBatches',
    'getStocktakeStatus', 'getInboundPurchaseOrder']);

/** Safe bridge entrypoint: no mutation, checkpoint writer, network or Graph. */
export async function evaluateObservationHandoff(
    rawObservation: unknown, rawScope: unknown, port: ObsAnmPort, now = new Date()
): Promise<HandoffResult> {
    const scopeParse = handoffScopeSchema.safeParse(rawScope);
    const scope = scopeParse.success ? scopeParse.data : null;
    const result = (status: HandoffResult['status'], reason: HandoffResult['reason'],
        missingFields: string[] = [], observationId: string | null = null,
        traceRef: string | null = null): HandoffResult => ({
        version: OBS_ANM_HANDOFF_VERSION, status, reason, missingFields,
        graphId: scope?.graphId ?? null, runId: scope?.runId ?? null,
        observationId, traceRef
    });
    if (!scope || !Number.isFinite(now.getTime())) return result('HOLD', 'INVALID_SCOPE');
    const obs = observationSchema.safeParse(rawObservation);
    if (!obs.success) return result('HOLD', 'INVALID_OBS_DECISION');
    const d = obs.data, proposal = d.stateUpdateProposal;
    if (proposal.runId !== scope.runId || proposal.actorId !== scope.actorId ||
        proposal.invocationId !== scope.invocationId || proposal.toolName !== scope.toolName) {
        return result('HOLD', 'OBS_SCOPE_MISMATCH');
    }
    if (d.observationStatus !== 'SUCCESS' || d.dataQuality !== 'VERIFIED_SCHEMA' ||
        proposal.action !== 'PROPOSE_OBSERVATION' ||
        proposal.proposedStatus !== 'OBSERVED' ||
        !proposal.verifiedForBusiness || d.requiresFreshRead ||
        d.trustedResult === undefined) return result('HOLD', 'OBS_NOT_ACCEPTED');
    if (!supported.has(scope.toolName)) return result('INCOMPLETE', 'UNSUPPORTED_TOOL',
        ['supportedBackendBusinessTool']);
    const contract = TOOL_CONTRACTS[scope.toolName as keyof typeof TOOL_CONTRACTS];
    if (!contract || contract.category !== 'READ' ||
        !contract.output.safeParse(d.trustedResult).success) return result('HOLD', 'INVALID_TOOL_RESULT');

    let source: unknown;
    try { source = await port.loadPersistedSource(scope); }
    catch { return result('HOLD', 'UNVERIFIED_SOURCE'); }
    if (!source || typeof source !== 'object' || Array.isArray(source)) {
        return result('HOLD', 'UNVERIFIED_SOURCE');
    }
    const s = source as Record<string, unknown>;
    const src = s.source && typeof s.source === 'object' ? s.source as Record<string, unknown> : {};
    const missing: string[] = [];
    for (const [field, val] of [
        ['observationId', s.observationId], ['terminalCheckpointId', s.terminalCheckpointId],
        ['source.sourceId', src.sourceId], ['source.sourceVersion', src.sourceVersion],
        ['source.rowVersion', src.rowVersion], ['source.movementCursor', src.movementCursor],
        ['source.readAt', src.readAt], ['source.traceRef', src.traceRef]
    ] as const) { if (val === undefined || val === null || val === '') missing.push(field); }
    if (missing.length) return result('INCOMPLETE', 'MISSING_PROVENANCE', missing);
    const snapshot = persistedSourceSchema.safeParse(source);
    if (!snapshot.success) return result('HOLD', 'UNVERIFIED_SOURCE');
    const p = snapshot.data;
    if (p.graphId !== scope.graphId || p.runId !== scope.runId ||
        p.actorId !== scope.actorId || p.invocationId !== scope.invocationId ||
        p.toolName !== scope.toolName || p.observationAuditTraceId !== d.auditTraceId ||
        p.persistedObservationDigest !== digestObservation(d)) {
        return result('HOLD', 'OBS_SCOPE_MISMATCH');
    }
    if (ageInvalid(p.terminalAt, now) || ageInvalid(p.source.readAt, now)) {
        return result('HOLD', 'STALE_SNAPSHOT', [], p.observationId, p.source.traceRef);
    }
    const comparison = validateToolEvidence(scope.toolName, d.trustedResult, p);
    if (comparison === 'INCOMPLETE') {
        return result('INCOMPLETE', 'MISSING_PROVENANCE',
            scope.toolName === 'getIngredientAvailability' ? ['stock.eligible'] :
                scope.toolName === 'getIngredientBatches' ? ['batches.qualityStatus'] :
                    scope.toolName === 'getStocktakeStatus' ? ['stocktake.expected', 'stocktake.counted',
                        'stocktake.batchStatusMapping'] : ['inbound.orderedBase', 'inbound.receiptProvenance'],
            p.observationId, p.source.traceRef);
    }
    if (comparison === 'CONFLICT') return result('HOLD', 'SOURCE_CONTRADICTION', [],
        p.observationId, p.source.traceRef);
    // The inbound tool explicitly states supplierExternallyVerified:false;
    // its non-atomic pair of reads cannot certify external confirmation.
    if (scope.toolName === 'getInboundPurchaseOrder') {
        return result('INCOMPLETE', 'MISSING_PROVENANCE',
            ['inbound.supplierConfirmationVerified', 'inbound.atomicReceiptSnapshot'],
            p.observationId, p.source.traceRef);
    }
    const prepared = anomalyInputSchema.safeParse({
        contractVersion: ANM_CONTRACT_VERSION, runId: scope.runId,
        actorId: scope.actorId, observationId: p.observationId,
        observation: { observationStatus: d.observationStatus,
            dataQuality: d.dataQuality, auditTraceId: d.auditTraceId,
            verifiedForBusiness: proposal.verifiedForBusiness },
        source: p.source, entity: p.entity,
        ...(p.stock ? { stock: p.stock } : {}),
        ...(p.batches ? { batches: p.batches } : {}),
        ...(p.stocktake ? { stocktake: p.stocktake } : {}),
        ...(p.consumption ? { consumption: p.consumption } : {}),
        ...(p.reconciliation ? { reconciliation: p.reconciliation } : {}),
        ...(p.inbound ? { inbound: p.inbound } : {})
    });
    if (!prepared.success) return result('HOLD', 'UNVERIFIED_SOURCE');
    // Authority independently compares the normalized snapshot to a trusted
    // source; failure returns SOURCE_UNVERIFIED/HOLD in the ANM classifier.
    const analysis = await evaluateAnomalies(prepared.data, port.authority, now);
    if (!analysis.sourceVerified) {
        return { ...result('HOLD', 'UNVERIFIED_SOURCE', [], p.observationId, p.source.traceRef),
            input: prepared.data, analysis };
    }
    return { ...result('READY', 'ACCEPTED', [], p.observationId, p.source.traceRef),
        input: prepared.data, analysis };
}
