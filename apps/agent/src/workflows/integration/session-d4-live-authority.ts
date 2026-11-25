/**
 * D4 READ-only source attestation for the EXISTING AgentWorkflow StateGraph.
 *
 * The trusted input is a previously committed ACT/OBS journal entry. Its
 * ingredient ID is used only as a lookup key; stock, lot quality, versions and
 * cursor are freshly read from PostgreSQL under a current ADMIN principal.
 * This file neither authorizes execution nor creates a PLN/REP plan.
 */
import { createHash } from 'node:crypto';
import { isDeepStrictEqual } from 'node:util';
import { z } from 'zod';
import { prisma, Prisma } from '@cafe-project/database';
import { requireAgentUser } from '../../internal-auth';
import { TOOL_CONTRACTS } from '../tool-contracts';
import { hashAnomalyEvidence } from '../../services/anomaly/anomaly.service';
import { anomalyInputSchema, anomalyResultSchema } from '../../services/anomaly/anomaly.schema';
import {
    handoffScopeSchema, persistedSourceSchema, type HandoffScope,
    type PersistedAnomalySource
} from '../../services/anomaly/observation-handoff';
import {
    durableObservationRecordSchema, durableAnomalyRecordSchema,
    type DurableObservationRecord
} from './session-d-anm-rep-handoff';
import type { AgentRepository, AgentState, Execution } from '../workflow-contracts';

const hash = (value: unknown): string =>
    createHash('sha256').update(JSON.stringify(value)).digest('hex');
const amount = z.string().regex(/^-?(0|[1-9]\d{0,17})(\.\d{1,4})?$/);
const sourceRowSchema = z.strictObject({
    id: z.string().regex(/^[A-Za-z0-9][A-Za-z0-9:_-]{0,119}$/),
    baseUnit: z.enum(['g', 'ml', 'piece']),
    quantity: amount, reserved: amount,
    rowVersion: z.number().int().nonnegative(),
    movementCursor: z.string().regex(/^\d+$/),
    pendingStocktake: z.boolean(),
    batches: z.array(z.strictObject({
        id: z.string().regex(/^[A-Za-z0-9][A-Za-z0-9:_-]{0,119}$/),
        quantityRemaining: amount,
        qualityStatus: z.enum(['AVAILABLE', 'QUARANTINED', 'RECALLED', 'UNAVAILABLE', 'UNKNOWN']),
        expirationDate: z.iso.datetime({ offset: true }).nullable(),
        receivedAt: z.iso.datetime({ offset: true })
    })).max(1000)
});
export type D4IngredientSourceRow = z.infer<typeof sourceRowSchema>;
type GraphRun = NonNullable<AgentState['graphRuns']>[string] & {
    sessionDObservations?: Record<string, DurableObservationRecord>;
    sessionDAnomalies?: Record<string, unknown>;
    sessionDReplans?: Record<string, unknown>;
};
type FixedIdentity = { run: GraphRun; execution?: Execution; approvalCount: number };

/**
 * Dependency seam for deterministic unit tests. It is NOT an alternate
 * production credential: the live factory below always installs real Prisma
 * READs and requireAgentUser() from the authenticated database.
 */
export type D4ReadOnlyReaders = {
    authorizeAdmin(actorId: string): Promise<void>;
    loadGraphRun(graphId: string): Promise<GraphRun | undefined>;
    loadFixedIdentity(graphId: string): Promise<FixedIdentity | undefined>;
    readIngredient(ingredientId: string): Promise<D4IngredientSourceRow | undefined>;
    now(): Date;
};

export class D4SourceHold extends Error {
    constructor(readonly code: string) { super(code); }
}
const hold = (code: string): never => { throw new D4SourceHold(code); };
const fresh = (value: string, now: Date): boolean => {
    const delta = now.getTime() - Date.parse(value);
    return Number.isFinite(delta) && delta >= 0 && delta <= 300000;
};
const units = (value: string): bigint => {
    const negative = value.startsWith('-');
    const [whole, decimal = ''] = value.replace(/^-/, '').split('.');
    const scaled = BigInt(whole!) * 10000n + BigInt(decimal.padEnd(4, '0'));
    return negative ? -scaled : scaled;
};
const formatted = (value: bigint): string => {
    const negative = value < 0n;
    const absolute = negative ? -value : value;
    const decimal = (absolute % 10000n).toString().padStart(4, '0').replace(/0+$/, '');
    return (negative ? '-' : '') + (absolute / 10000n).toString() + (decimal ? '.' + decimal : '');
};
const terminalId = (scope: HandoffScope, event: {
    at: string; status: string; attempt?: number
}): string =>
    'act-' + hash([scope.graphId, scope.invocationId, event.at,
        event.status, event.attempt]).slice(0, 32);
// Digest logic exactly mirrors AgentWorkflow's immutable legacy Plan digest.
const canonical = (value: unknown): string => {
    if (value === null || typeof value === 'string' || typeof value === 'boolean') return JSON.stringify(value);
    if (typeof value === 'number' && Number.isSafeInteger(value)) return JSON.stringify(value);
    if (Array.isArray(value)) return '[' + value.map(canonical).join(',') + ']';
    if (typeof value === 'object' && value && Object.getPrototypeOf(value) === Object.prototype) {
        return '{' + Object.keys(value).sort().map(k =>
            JSON.stringify(k) + ':' + canonical((value as Record<string, unknown>)[k])).join(',') + '}';
    }
    return hold('D4_EXECUTION_IDENTITY_UNVERIFIED');
};

type VerifiedObservation = {
    scope: HandoffScope;
    record: DurableObservationRecord;
    ingredientId: string;
};

export function createSessionD4AuthorityFromReaders(readers: D4ReadOnlyReaders) {
    const loadObservation = async (rawScope: HandoffScope): Promise<VerifiedObservation> => {
        const scoped = handoffScopeSchema.safeParse(rawScope);
        if (!scoped.success || scoped.data.graphId !== scoped.data.runId ||
            !/^act-[1-8]$/.test(scoped.data.invocationId) ||
            !['getIngredientAvailability', 'getIngredientBatches'].includes(scoped.data.toolName)) {
            return hold('D4_SCOPE_UNVERIFIED');
        }
        const scope = scoped.data;
        await readers.authorizeAdmin(scope.actorId);
        const run = await readers.loadGraphRun(scope.graphId);
        if (!run || run.actorId !== scope.actorId || !run.inputHash || !run.requestId ||
            !run.leaseOwner || !run.leaseUntil ||
            Date.parse(run.leaseUntil) <= readers.now().getTime()) {
            return hold('D4_GRAPH_CHECKPOINT_UNVERIFIED');
        }
        const cycle = run.actCycle ?? 0;
        const parsed = durableObservationRecordSchema.safeParse(
            run.sessionDObservations?.[cycle + ':' + scope.invocationId]);
        if (!parsed.success) return hold('D4_OBS_CHECKPOINT_MISSING');
        const record = parsed.data;
        if (record.graphId !== scope.graphId || record.runId !== scope.runId ||
            record.actorId !== scope.actorId || record.invocationId !== scope.invocationId ||
            record.toolName !== scope.toolName ||
            record.observationId !== record.observationAuditTraceId ||
            record.persistedObservationDigest !== hash(record.decision) ||
            !fresh(record.recordedAt, readers.now()) ||
            !fresh(record.terminalAt, readers.now()) ||
            Date.parse(record.recordedAt) < Date.parse(record.terminalAt)) {
            return hold('D4_OBS_CHECKPOINT_UNVERIFIED');
        }
        const terminal = run.trace.filter(e => e.node === 'act_executor' &&
            e.stepId === scope.invocationId && e.actorId === scope.actorId &&
            (e.actCycle ?? 0) === cycle).at(-1);
        if (!terminal || terminal.status !== 'ACT_SUCCEEDED' ||
            terminal.at !== record.terminalAt ||
            terminalId(scope, terminal) !== record.terminalCheckpointId ||
            !run.trace.some(e => e.node === 'observation' &&
                e.stepId === scope.invocationId && e.actorId === scope.actorId &&
                e.status === 'OBS_SUCCESS' &&
                e.observationTraceId === record.observationAuditTraceId)) {
            return hold('D4_ACT_TERMINAL_UNVERIFIED');
        }
        const decision = record.decision;
        if (!decision || typeof decision !== 'object' || Array.isArray(decision)) {
            return hold('D4_OBS_DECISION_UNVERIFIED');
        }
        const obs = decision as Record<string, unknown>;
        const proposal = obs.stateUpdateProposal as Record<string, unknown> | undefined;
        if (!proposal || obs.schemaVersion !== '1.0.0' ||
            obs.observationStatus !== 'SUCCESS' || obs.dataQuality !== 'VERIFIED_SCHEMA' ||
            obs.auditTraceId !== record.observationAuditTraceId ||
            obs.requiresFreshRead !== false || proposal.verifiedForBusiness !== true ||
            proposal.action !== 'PROPOSE_OBSERVATION' || proposal.proposedStatus !== 'OBSERVED' ||
            proposal.runId !== scope.runId || proposal.invocationId !== scope.invocationId ||
            proposal.actorId !== scope.actorId || proposal.toolName !== scope.toolName ||
            proposal.attemptNumber !== terminal.attempt) {
            return hold('D4_OBS_DECISION_UNVERIFIED');
        }
        const contract = TOOL_CONTRACTS[scope.toolName as
            'getIngredientAvailability' | 'getIngredientBatches'];
        const result = contract.output.safeParse(obs.trustedResult);
        if (!result.success) return hold('D4_OBS_RESULT_UNVERIFIED');
        if (!result.data.ingredientId) return hold('D4_OBS_RESULT_UNVERIFIED');
        return { scope, record, ingredientId: result.data.ingredientId };
    };

    const buildSource = async (rawScope: HandoffScope): Promise<PersistedAnomalySource> => {
        const verified = await loadObservation(rawScope);
        const row = sourceRowSchema.safeParse(await readers.readIngredient(verified.ingredientId));
        if (!row.success || row.data.id !== verified.ingredientId) return hold('D4_SOURCE_ID_UNVERIFIED');
        // Revalidate current account after I/O as well: a role revocation
        // during the independent source read must not yield an attested proof.
        await readers.authorizeAdmin(verified.scope.actorId);
        const current = row.data;
        if (current.pendingStocktake) return hold('D4_STOCKTAKE_UNVERIFIED');
        const readAt = readers.now().toISOString();
        const seen = new Set<string>();
        let eligible = 0n;
        const batches = current.batches.map(batch => {
            if (seen.has(batch.id)) return hold('D4_DUPLICATE_BATCH');
            seen.add(batch.id);
            const accepted = batch.qualityStatus === 'AVAILABLE' &&
                (!batch.expirationDate || Date.parse(batch.expirationDate) > Date.parse(readAt));
            if (accepted) eligible += units(batch.quantityRemaining);
            return {
                id: batch.id, physical: batch.quantityRemaining,
                qualityStatus: batch.qualityStatus,
                expirationDate: batch.expirationDate, eligibleForSale: accepted
            };
        });
        const stock = {
            physical: current.quantity, eligible: formatted(eligible),
            reserved: current.reserved,
            available: formatted(eligible - units(current.reserved))
        };
        // ACT availability is an aggregate, not FEFO/quality-safe. Compare its
        // original values to current PHYSICAL stock; ANM separately computes
        // sellable stock. Never rewrite ACT output as eligible stock.
        if (verified.scope.toolName === 'getIngredientAvailability') {
            const result = TOOL_CONTRACTS.getIngredientAvailability.output.safeParse(
                (verified.record.decision as { trustedResult?: unknown }).trustedResult);
            if (!result.success || result.data.rowVersion !== current.rowVersion ||
                result.data.baseUnit !== current.baseUnit ||
                result.data.ingredientId !== current.id || result.data.active !== true) {
                return hold('D4_SOURCE_VERSION_DRIFT');
            }
            try {
                if (units(String(result.data.quantity)) !== units(current.quantity) ||
                    units(String(result.data.reserved)) !== units(current.reserved) ||
                    units(String(result.data.available)) !==
                        units(current.quantity) - units(current.reserved)) {
                    return hold('D4_ACT_SOURCE_CONTRADICTION');
                }
            } catch {
                return hold('D4_ACT_SOURCE_CONTRADICTION');
            }
        } else {
            // The registry batch DTO has no quality status. That status must
            // come ONLY from this separate current DB lot read.
            const result = TOOL_CONTRACTS.getIngredientBatches.output.safeParse(
                (verified.record.decision as { trustedResult?: unknown }).trustedResult);
            if (!result.success || result.data.ingredientId !== current.id ||
                result.data.baseUnit !== current.baseUnit ||
                result.data.batches.length !== current.batches.length) {
                return hold('D4_ACT_SOURCE_CONTRADICTION');
            }
            const byId = new Map(current.batches.map(batch => [batch.id, batch]));
            try {
                if (result.data.batches.some(batch => {
                    const actual = byId.get(batch.id);
                    return !actual || batch.expirationDate !== actual.expirationDate ||
                        batch.receivedAt !== actual.receivedAt ||
                        units(String(batch.quantityRemaining)) !== units(actual.quantityRemaining);
                })) return hold('D4_ACT_SOURCE_CONTRADICTION');
            } catch {
                return hold('D4_ACT_SOURCE_CONTRADICTION');
            }
        }
        const candidate = {
            graphId: verified.scope.graphId, runId: verified.scope.runId,
            actorId: verified.scope.actorId, invocationId: verified.scope.invocationId,
            toolName: verified.scope.toolName,
            observationId: verified.record.observationId,
            observationAuditTraceId: verified.record.observationAuditTraceId,
            persistedObservationDigest: verified.record.persistedObservationDigest,
            terminalCheckpointId: verified.record.terminalCheckpointId,
            terminalAt: verified.record.terminalAt,
            source: {
                kind: 'BACKEND_READ' as const,
                // A real Postgres primary key, NEVER a caller-generated source ID.
                sourceId: current.id, sourceVersion: 'v' + current.rowVersion,
                readAt, rowVersion: current.rowVersion,
                movementCursor: current.movementCursor,
                traceRef: verified.record.terminalCheckpointId
            },
            entity: { ingredientId: current.id, baseUnit: current.baseUnit },
            stock, batches
        };
        const result = persistedSourceSchema.safeParse(candidate);
        if (!result.success) return hold('D4_SOURCE_SCHEMA_UNVERIFIED');
        return result.data;
    };

    const verifyAnomaly = async (raw: unknown): Promise<unknown> => {
        const checked = anomalyInputSchema.safeParse(raw);
        if (!checked.success) return hold('D4_ANOMALY_INPUT_UNVERIFIED');
        const input = checked.data;
        const run = await readers.loadGraphRun(input.runId);
        if (!run || run.actorId !== input.actorId) return hold('D4_ANOMALY_SCOPE_UNVERIFIED');
        const activeCycle = (run.actCycle ?? 0) + ':';
        const matched = Object.entries(run.sessionDObservations ?? {})
            .filter(([key, o]) => key.startsWith(activeCycle) &&
                o.observationId === input.observationId &&
                o.observationAuditTraceId === input.observation.auditTraceId &&
                o.actorId === input.actorId && o.runId === input.runId)
            .map(([, record]) => record);
        if (matched.length !== 1) return hold('D4_ANOMALY_SCOPE_UNVERIFIED');
        const record = matched[0]!;
        const source = await buildSource({
            graphId: input.runId, runId: input.runId, actorId: input.actorId,
            invocationId: record.invocationId, toolName: record.toolName
        });
        const { readAt: _ignored, ...sourceIdentity } = source.source;
        const { readAt: _proposed, ...proposedIdentity } = input.source;
        void _ignored;
        void _proposed;
        // The source timestamp is historical but must precede an independent
        // reread no older than the five-minute authority horizon.
        if (!fresh(input.source.readAt, readers.now()) ||
            !isDeepStrictEqual(sourceIdentity, proposedIdentity) ||
            !isDeepStrictEqual(source.entity, input.entity) ||
            !isDeepStrictEqual(source.stock, input.stock) ||
            !isDeepStrictEqual(source.batches, input.batches) ||
            input.observation.observationStatus !== 'SUCCESS' ||
            input.observation.dataQuality !== 'VERIFIED_SCHEMA' ||
            input.observation.verifiedForBusiness !== true) {
            return hold('D4_ANOMALY_SOURCE_DRIFT');
        }
        return {
            actorId: input.actorId, runId: input.runId,
            observationId: input.observationId,
            sourceId: source.source.sourceId,
            sourceVersion: source.source.sourceVersion,
            evidenceHash: hashAnomalyEvidence(input),
            // Read-only verifier contract version, NOT an approved purchase policy.
            policyRef: 'D4_READ_ONLY_AUTHORITY_V1',
            recordedAt: readers.now().toISOString(),
            rowVersion: source.source.rowVersion,
            movementCursor: source.source.movementCursor
        };
    };

    /**
     * Independent Graph-owned fixed READ identity witness for a special
     * non-replanning policy route. This is NOT a REP/KEEP_PLAN verdict and
     * does not authorize the final business executor.
     */
    const verifyFixedReadIdentity = async (rawScope: HandoffScope): Promise<{
        status: 'REP_NOT_APPLICABLE';
        reason: 'FIXED_READ_IDENTITY_NO_VERIFIED_PLN';
        graphId: string; actorId: string; executionId: string; sourceAttested: true;
    }> => {
        const parsed = handoffScopeSchema.safeParse(rawScope);
        if (!parsed.success || parsed.data.graphId !== parsed.data.runId) {
            return hold('D4_FIXED_IDENTITY_SCOPE_UNVERIFIED');
        }
        const scope = parsed.data;
        await readers.authorizeAdmin(scope.actorId);
        const snapshot = await readers.loadFixedIdentity(scope.graphId);
        // The durable workflow retains prior HELD_POLICY while a newly leased
        // RESUME is executing. Accept that state ONLY for a positive recovery
        // ACT cycle: fresh committed OBS+ANM for the current cycle and active
        // lease are independently verified before returning any proof.
        const recoveryCycle = snapshot?.run.actCycle;
        const liveRecoveryCycle = snapshot?.run.status === 'HELD_POLICY' &&
            typeof recoveryCycle === 'number' && Number.isSafeInteger(recoveryCycle) &&
            recoveryCycle > 0;
        if (!snapshot?.execution || snapshot.run.actorId !== scope.actorId ||
            !snapshot.run.executionId || snapshot.run.executionId !== snapshot.execution.id ||
            !snapshot.run.leaseOwner || !snapshot.run.leaseUntil ||
            Date.parse(snapshot.run.leaseUntil) <= readers.now().getTime() ||
            (snapshot.run.status !== 'RUNNING' && !liveRecoveryCycle) ||
            snapshot.approvalCount !== 0) {
            return hold('D4_FIXED_IDENTITY_UNVERIFIED');
        }
        const e = snapshot.execution;
        const fixedPlan = [{ tool: 'inventory.read', input: null },
            { tool: 'inventory.recommend', input: null }];
        if (e.actorId !== scope.actorId || e.status !== 'PLANNED' ||
            !isDeepStrictEqual(e.plan, fixedPlan) || e.budget !== 2 ||
            !isDeepStrictEqual(e.versions, {}) || e.revision !== '1' ||
            e.revisions.length !== 0 || e.spent !== 0 || e.reserved !== 0 ||
            e.result.length !== 0 ||
            !e.planning || !isDeepStrictEqual(e.planning.decision, fixedPlan) ||
            e.planning.evidence.length !== 0 ||
            (e.planning.attribution?.length ?? 0) !== 0 ||
            e.hash !== createHash('sha256').update(canonical({
                plan: fixedPlan, versions: {}, revision: '1'
            })).digest('hex') ||
            snapshot.run.sessionDReplans &&
                Object.keys(snapshot.run.sessionDReplans).length > 0) {
            return hold('D4_TRUSTED_PLN_PLAN_UNAVAILABLE');
        }
        const run = snapshot.run;
        const cycle = (run.actCycle ?? 0) + ':';
        const committed = Object.entries(run.sessionDObservations ?? {})
            .filter(([key]) => key.startsWith(cycle))
            .sort(([a], [b]) => Number(a.split('act-')[1]) - Number(b.split('act-')[1]));
        // The Graph evaluates this proof INSIDE anomaly_classification before
        // the node can emit ANM_VERIFIED. Require all durable independently
        // attested ANM receipts below instead of a future trace event.
        if (committed.length < 2 || committed.length > 8 || committed.length % 2 !== 0) {
            return hold('D4_FIXED_READ_ANOMALY_UNVERIFIED');
        }
        let priorIngredient: string | undefined;
        for (let index = 0; index < committed.length; index++) {
            const [key, obs] = committed[index]!;
            const stepId = 'act-' + (index + 1);
            const toolName = index % 2 === 0 ?
                'getIngredientAvailability' : 'getIngredientBatches';
            if (key !== cycle + stepId || obs.invocationId !== stepId ||
                obs.toolName !== toolName || obs.actorId !== scope.actorId) {
                return hold('D4_FIXED_READ_ANOMALY_UNVERIFIED');
            }
            const checked = durableAnomalyRecordSchema.safeParse(run.sessionDAnomalies?.[key]);
            if (!checked.success || checked.data.actorId !== scope.actorId ||
                checked.data.invocationId !== stepId ||
                checked.data.toolName !== toolName ||
                checked.data.graphId !== scope.graphId ||
                checked.data.observationId !== obs.observationId ||
                checked.data.observationAuditTraceId !== obs.observationAuditTraceId ||
                checked.data.anomalyDigest !== hash(checked.data.anomaly)) {
                return hold('D4_FIXED_READ_ANOMALY_UNVERIFIED');
            }
            const a = anomalyResultSchema.parse(checked.data.anomaly);
            if (a.runId !== scope.runId || a.observationId !== obs.observationId ||
                a.status !== 'NORMAL' || !a.sourceVerified ||
                a.evidenceLevel !== 'SOURCE_ATTESTED' || !a.readOnly ||
                a.findings.some(f => f.recommendedRoute !== 'CONTINUE' || f.severity !== 'INFO')) {
                return hold('D4_FIXED_READ_ANOMALY_UNVERIFIED');
            }
            // Re-authenticate and independently re-read each committed ACT/OBS
            // before representing the ANM journal as still source-attested.
            const current = await buildSource({
                graphId: scope.graphId, runId: scope.runId, actorId: scope.actorId,
                invocationId: stepId, toolName
            });
            if (index % 2 === 0) priorIngredient = current.entity.ingredientId;
            else if (priorIngredient !== current.entity.ingredientId) {
                return hold('D4_FIXED_READ_SCOPE_MISMATCH');
            }
        }
        return {
            status: 'REP_NOT_APPLICABLE',
            reason: 'FIXED_READ_IDENTITY_NO_VERIFIED_PLN',
            graphId: scope.graphId, actorId: scope.actorId,
            executionId: e.id, sourceAttested: true
        };
    };

    const holdReplan: (input: unknown) => Promise<never> = async () =>
        hold('D4_TRUSTED_PLN_PLAN_UNAVAILABLE');
    return {
        loadPersistedSource: buildSource,
        anomalyAuthority: { verify: verifyAnomaly },
        verifyFixedReadIdentity,
        // The existing Graph Execution is a fixed READ identity, NOT a trusted
        // PLN_PER_BACKEND_V1 plan. No signed plan/version/candidate source exists.
        // Returning a guessed plan here could cause an invented KEEP_PLAN.
        loadPersistedReplanInput: holdReplan,
        replanAuthority: { verify: holdReplan }
    };
}

/** Production factory: current ADMIN, existing Graph checkpoint, real PG only. */
export function createSessionD4LiveAuthority(store: Pick<AgentRepository, 'atomic'>) {
    return createSessionD4AuthorityFromReaders({
        authorizeAdmin: async actorId => { await requireAgentUser(actorId, ['ADMIN']); },
        loadGraphRun: async graphId => store.atomic(s =>
            structuredClone(s.graphRuns?.[graphId] as GraphRun | undefined)),
        loadFixedIdentity: async graphId => store.atomic(s => {
            const run = s.graphRuns?.[graphId] as GraphRun | undefined;
            if (!run) return undefined;
            return {
                run: structuredClone(run),
                execution: run.executionId ? structuredClone(s.executions[run.executionId]) : undefined,
                approvalCount: Object.values(s.approvals).filter(a =>
                    a.executionId === run.executionId).length
            };
        }),
        readIngredient: async ingredientId => prisma.$transaction(async tx => {
            const row = await tx.ingredient.findFirst({
                where: { id: ingredientId, isActive: true, deletedAt: null },
                include: { batches: { orderBy: [{ id: 'asc' }] } }
            });
            if (!row) return undefined;
            const pending = await tx.stockCount.findFirst({
                where: {
                    kind: 'STOCKTAKE',
                    status: { in: ['DRAFT', 'PENDING', 'PENDING_APPROVAL', 'NEEDS_INVESTIGATION'] },
                    stocktakeEntries: { some: { ingredientId } }
                }, select: { id: true }
            });
            return {
                id: row.id, baseUnit: row.baseUnit,
                quantity: row.quantity.toString(), reserved: row.reserved.toString(),
                rowVersion: row.rowVersion, movementCursor: row.movementCursor.toString(),
                pendingStocktake: Boolean(pending),
                batches: row.batches.map(batch => ({
                    id: batch.id, quantityRemaining: batch.quantityRemaining.toString(),
                    qualityStatus: batch.qualityStatus,
                    expirationDate: batch.expirationDate?.toISOString() ?? null,
                    receivedAt: batch.receivedAt.toISOString()
                }))
            };
        }, { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead })
        .then(value => value ? sourceRowSchema.parse(value) : undefined),
        now: () => new Date()
    });
}
