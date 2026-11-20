/**
 * OBS-01..08: pure ACT read-result interpretation. No Graph, Backend, repository,
 * authorization grant, checkpoint persistence or business mutation lives here.
 * The caller MUST supply identities from its authenticated ACT execution, never
 * from tool output or an LLM response. The proposed state is NOT applied.
 */
import { createHash } from 'node:crypto';
import { z } from 'zod';
import { TOOL_CONTRACTS, TOOL_ERRORS, type P1ToolName } from '../../workflows/tool-contracts';

const id = z.string().regex(/^[A-Za-z0-9][A-Za-z0-9:_-]{0,119}$/);
const instant = z.iso.datetime({ offset: true });
const sourceSchema = z.strictObject({
    observedAt: instant.optional(),
    rowVersion: z.number().int().nonnegative().optional(),
    movementCursor: id.optional(),
    evidenceReferences: z.array(id).max(32).optional()
});
export const observationInputSchema = z.strictObject({
    schemaVersion: z.literal('1.0.0'),
    runId: id,
    invocationId: id, // ACT stepId; separate invocationId is not supplied by ACT
    actorId: id,
    toolName: id,
    toolInput: z.unknown(),
    expectedSchemaVersion: z.string().min(1).max(40),
    actResult: z.unknown(),
    completedAt: instant, // sourced from ACT's terminal checkpoint
    source: sourceSchema.optional(),
    dependencies: z.array(id).max(32).optional()
});
export type ObservationInput = z.infer<typeof observationInputSchema>;
export type ObservationBoundary = {
    runId: string; invocationId: string; actorId: string; toolName: string;
    receivedAt: string; maxAgeMs?: number;
    expectedRowVersion?: number; expectedMovementCursor?: string;
    dependencies?: readonly string[]; completedDependencies?: readonly string[];
};
export type ObservationStatus = 'SUCCESS' | 'FAILED' | 'INSUFFICIENT_DATA' |
    'INVALID_OUTPUT' | 'STALE' | 'PARTIAL' | 'REJECTED' | 'DUPLICATE';
export type ObservationDecision = {
    schemaVersion: '1.0.0'; observationStatus: ObservationStatus;
    dataQuality: 'VERIFIED_SCHEMA' | 'TEST_FIXTURE' | 'INSUFFICIENT' | 'INVALID' | 'STALE' | 'UNTRUSTED';
    trustedResult?: unknown;
    evidenceReferences: string[];
    warnings: string[];
    errorCode?: string;
    requiresFreshRead: boolean;
    requiresHumanReview: boolean;
    auditTraceId: string;
    stateUpdateProposal: {
        action: 'PROPOSE_OBSERVATION' | 'HOLD' | 'IGNORE';
        runId: string; invocationId: string; actorId: string;
        toolName: string; attemptNumber: number;
        proposedStatus: 'OBSERVED' | 'FAILED' | 'HELD_POLICY' | 'REVIEW_REQUIRED' | 'UNCHANGED';
        verifiedForBusiness: boolean;
    };
};
type LedgerEntry = { attempt: number; fingerprint: string; completedAt: string };
export type ObservationLedger = Readonly<Record<string, LedgerEntry>>;

const errorCodes = new Set<string>([
    ...TOOL_ERRORS, 'INVALID_ACT_REQUEST', 'TOOL_DENIED', 'DEPENDENCY_NOT_VERIFIED',
    'TOOL_NOT_AVAILABLE', 'STALE_CONTEXT', 'DATA_UNAVAILABLE', 'REGISTRY_UNVERIFIED',
    'RETRY_BUDGET_EXCEEDED'
]);
const terminal = z.strictObject({
    status: z.enum(['SUCCEEDED', 'HELD_POLICY']), attempts: z.number().int().min(0).max(2),
    outcome: z.unknown().optional(), code: z.string().optional()
});
const evidenceSchema = z.strictObject({
    tool: id, version: z.string(), actorId: id,
    mode: z.enum(['MOCK', 'BACKEND']), startedAt: instant,
    durationMs: z.number().finite().nonnegative(), attempts: z.number().int(),
    status: z.enum(['SUCCEEDED', 'FAILED']), validated: z.boolean(), durable: z.literal(false)
});
const outcomeSchema = z.strictObject({
    ok: z.literal(true), output: z.unknown(), evidence: evidenceSchema
});
const hash = (value: unknown): string => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const validDate = (value: string): number => {
    const time = Date.parse(value);
    return Number.isFinite(time) ? time : NaN;
};

function decision(input: Partial<ObservationInput>, boundary: ObservationBoundary,
    status: ObservationStatus, code: string | undefined, quality: ObservationDecision['dataQuality'],
    options: { result?: unknown; warnings?: string[]; fresh?: boolean; review?: boolean;
        references?: string[]; attempt?: number; fixture?: boolean } = {}): ObservationDecision {
    const proposedStatus = status === 'SUCCESS' ? 'OBSERVED' : status === 'FAILED' ? 'FAILED'
        : status === 'DUPLICATE' ? 'UNCHANGED' : status === 'REJECTED' || options.review
            ? 'REVIEW_REQUIRED' : 'HELD_POLICY';
    const attemptNumber = options.attempt ?? 0;
    const accepted = status === 'SUCCESS' && !options.fixture;
    return {
        schemaVersion: '1.0.0', observationStatus: status, dataQuality: quality,
        ...(status === 'SUCCESS' ? { trustedResult: options.result } : {}),
        evidenceReferences: options.references ?? [], warnings: options.warnings ?? [],
        ...(code ? { errorCode: code } : {}),
        requiresFreshRead: options.fresh ?? false,
        requiresHumanReview: options.review ?? (status === 'REJECTED'),
        auditTraceId: `obs-${hash([boundary.runId, boundary.invocationId, attemptNumber, status, code]).slice(0, 32)}`,
        stateUpdateProposal: {
            action: status === 'SUCCESS' ? 'PROPOSE_OBSERVATION' : status === 'DUPLICATE' ? 'IGNORE' : 'HOLD',
            runId: boundary.runId, invocationId: boundary.invocationId,
            actorId: boundary.actorId, toolName: boundary.toolName,
            attemptNumber, proposedStatus, verifiedForBusiness: accepted
        }
    };
}

function incomplete(toolName: string, value: unknown): boolean {
    // Zero quantities are valid data; truly empty required business collections are not.
    if (toolName === 'findIngredientSuppliers') return Array.isArray(value) && value.length === 0;
    if (toolName === 'getIngredientBatches') return !!value && typeof value === 'object' &&
        Array.isArray((value as { batches?: unknown }).batches) &&
        (value as { batches: unknown[] }).batches.length === 0;
    if (toolName === 'getRecipeRequirements') return !!value && typeof value === 'object' &&
        Array.isArray((value as { ingredients?: unknown }).ingredients) &&
        (value as { ingredients: unknown[] }).ingredients.length === 0;
    return false;
}

/** Authenticated caller-provided boundary + ACT envelope -> deterministic proposal. */
export function observeActRead(raw: unknown, boundary: ObservationBoundary,
    ledger: ObservationLedger = {}): { decision: ObservationDecision; ledger: ObservationLedger } {
    const parsed = observationInputSchema.safeParse(raw);
    if (!parsed.success) return { decision: decision({}, boundary, 'REJECTED', 'INVALID_OBS_ENVELOPE', 'UNTRUSTED'), ledger };
    const input = parsed.data;
    if (input.runId !== boundary.runId || input.invocationId !== boundary.invocationId ||
        input.actorId !== boundary.actorId || input.toolName !== boundary.toolName) {
        return { decision: decision(input, boundary, 'REJECTED', 'CORRELATION_MISMATCH', 'UNTRUSTED'), ledger };
    }
    const catalog = Object.prototype.hasOwnProperty.call(TOOL_CONTRACTS, input.toolName)
        ? TOOL_CONTRACTS[input.toolName as P1ToolName] : undefined;
    if (!catalog || catalog.category === 'WRITE' || catalog.status !== 'IMPLEMENTED' ||
        input.expectedSchemaVersion !== catalog.version || !catalog.input.safeParse(input.toolInput).success) {
        return { decision: decision(input, boundary, 'REJECTED', 'UNVERIFIED_TOOL_CONTRACT', 'UNTRUSTED'), ledger };
    }
    const required = boundary.dependencies ?? [];
    const supplied = input.dependencies ?? [];
    if (new Set(required).size !== required.length || new Set(supplied).size !== supplied.length ||
        required.length !== supplied.length || required.some(dep => !supplied.includes(dep)) ||
        required.some(dep => !(boundary.completedDependencies ?? []).includes(dep))) {
        return { decision: decision(input, boundary, 'REJECTED', 'DEPENDENCY_NOT_VERIFIED', 'UNTRUSTED'), ledger };
    }
    const actParsed = terminal.safeParse(input.actResult);
    if (!actParsed.success) return { decision: decision(input, boundary, 'REJECTED', 'INVALID_ACT_RESULT', 'UNTRUSTED'), ledger };
    const act = actParsed.data;
    const received = validDate(boundary.receivedAt), completed = validDate(input.completedAt);
    if (!Number.isFinite(received) || !Number.isFinite(completed) ||
        !Number.isFinite(boundary.maxAgeMs ?? 300000) || (boundary.maxAgeMs ?? 300000) < 0) {
        return { decision: decision(input, boundary, 'REJECTED', 'INVALID_OBS_CLOCK', 'UNTRUSTED'), ledger };
    }
    const key = `${boundary.runId}:${boundary.invocationId}`;
    const previous = ledger[key];
    const fingerprint = hash(input);
    if (previous) {
        if (act.attempts === previous.attempt && fingerprint === previous.fingerprint) {
            return { decision: decision(input, boundary, 'DUPLICATE', 'ALREADY_OBSERVED', 'VERIFIED_SCHEMA',
                { attempt: act.attempts }), ledger };
        }
        if (act.attempts <= previous.attempt || completed <= validDate(previous.completedAt)) {
            return { decision: decision(input, boundary, 'REJECTED', 'REPLAY_OR_OUT_OF_ORDER', 'UNTRUSTED',
                { attempt: act.attempts }), ledger };
        }
    }
    const nextLedger = { ...ledger, [key]: { attempt: act.attempts, fingerprint, completedAt: input.completedAt } };
    if (completed > received || received - completed > (boundary.maxAgeMs ?? 300000) ||
        (input.source?.observedAt && (validDate(input.source.observedAt) > completed ||
            received - validDate(input.source.observedAt) > (boundary.maxAgeMs ?? 300000)))) {
        return { decision: decision(input, boundary, 'STALE', 'STALE_OBSERVATION', 'STALE',
            { fresh: true, attempt: act.attempts }), ledger: nextLedger };
    }
    if (act.status === 'HELD_POLICY') {
        const code = act.code;
        if (act.outcome !== undefined || !code || !errorCodes.has(code)) {
            return { decision: decision(input, boundary, 'REJECTED', 'INVALID_ACT_FAILURE', 'UNTRUSTED'), ledger };
        }
        return { decision: decision(input, boundary, 'FAILED', code, 'UNTRUSTED',
            { attempt: act.attempts, fresh: code === 'STALE_CONTEXT' || code === 'DATA_UNAVAILABLE' }), ledger: nextLedger };
    }
    if (act.code !== undefined || act.attempts < 1) {
        return { decision: decision(input, boundary, 'REJECTED', 'INCONSISTENT_ACT_SUCCESS', 'UNTRUSTED'), ledger };
    }
    const outcome = outcomeSchema.safeParse(act.outcome);
    if (!outcome.success || outcome.data.evidence.tool !== input.toolName ||
        outcome.data.evidence.actorId !== input.actorId || outcome.data.evidence.version !== catalog.version ||
        outcome.data.evidence.status !== 'SUCCEEDED' || !outcome.data.evidence.validated ||
        outcome.data.evidence.attempts !== 1 || validDate(outcome.data.evidence.startedAt) > completed) {
        return { decision: decision(input, boundary, 'INVALID_OUTPUT', 'INVALID_ACT_EVIDENCE', 'INVALID',
            { attempt: act.attempts, review: true }), ledger: nextLedger };
    }
    if (received - validDate(outcome.data.evidence.startedAt) > (boundary.maxAgeMs ?? 300000)) {
        return { decision: decision(input, boundary, 'STALE', 'STALE_TOOL_PROVENANCE', 'STALE',
            { attempt: act.attempts, fresh: true }), ledger: nextLedger };
    }
    const validated = catalog.output.safeParse(outcome.data.output);
    if (!validated.success) return { decision: decision(input, boundary, 'INVALID_OUTPUT', 'INVALID_TOOL_OUTPUT',
        'INVALID', { attempt: act.attempts, review: true }), ledger: nextLedger };
    const result = validated.data as Record<string, unknown>;
    const original = input.toolInput as Record<string, unknown>;
    for (const field of ['ingredientId', 'productId', 'supplierId', 'stocktakeId', 'purchaseOrderId']) {
        if (field in result && field in original && result[field] !== original[field]) {
            return { decision: decision(input, boundary, 'REJECTED', 'SOURCE_IDENTITY_MISMATCH', 'UNTRUSTED',
                { attempt: act.attempts, review: true }), ledger: nextLedger };
        }
    }
    if (input.source?.rowVersion !== undefined && result.rowVersion !== undefined &&
        input.source.rowVersion !== result.rowVersion) {
        return { decision: decision(input, boundary, 'STALE', 'SOURCE_VERSION_CONFLICT', 'STALE',
            { attempt: act.attempts, fresh: true }), ledger: nextLedger };
    }
    const observedVersion = typeof result.rowVersion === 'number' ? result.rowVersion : undefined;
    if ((boundary.expectedRowVersion !== undefined &&
        (observedVersion === undefined || observedVersion !== boundary.expectedRowVersion)) ||
        (boundary.expectedMovementCursor !== undefined &&
            input.source?.movementCursor !== boundary.expectedMovementCursor)) {
        return { decision: decision(input, boundary, 'STALE', 'SOURCE_VERSION_UNVERIFIED', 'STALE',
            { attempt: act.attempts, fresh: true }), ledger: nextLedger };
    }
    // ACT currently has no authoritative movementCursor proof in ToolOutcome.
    // A wrapper-provided cursor can be compared but never promoted into truth.
    if (boundary.expectedMovementCursor !== undefined) {
        return { decision: decision(input, boundary, 'REJECTED', 'PENDING_ACT_CURSOR_PROVENANCE', 'UNTRUSTED',
            { attempt: act.attempts, fresh: true, review: true }), ledger: nextLedger };
    }
    if (incomplete(input.toolName, result)) {
        return { decision: decision(input, boundary, 'INSUFFICIENT_DATA', 'EMPTY_BUSINESS_DATA', 'INSUFFICIENT',
            { attempt: act.attempts, fresh: true }), ledger: nextLedger };
    }
    const fixture = outcome.data.evidence.mode === 'MOCK';
    const warnings = [
        ...(fixture ? ['FIXTURE_ONLY'] : []),
        ...(input.source?.movementCursor ? ['CURSOR_PROVENANCE_REQUIRES_ACT_VERIFICATION'] : []),
        'PROPOSAL_ONLY_NOT_GRAPH_PERSISTED'
    ];
    return { decision: decision(input, boundary, 'SUCCESS', undefined, fixture ? 'TEST_FIXTURE' : 'VERIFIED_SCHEMA',
        { result, warnings, references: input.source?.evidenceReferences ?? [],
            attempt: act.attempts, fixture }), ledger: nextLedger };
}

/** Batch is constrained to one authenticated run + actor; partial results never imply global success. */
export function observeActBatch(entries: readonly { input: unknown; boundary: ObservationBoundary }[],
    initial: ObservationLedger = {}): { status: 'SUCCESS' | 'PARTIAL' | 'REJECTED';
        decisions: ObservationDecision[]; ledger: ObservationLedger } {
    let ledger = initial;
    const decisions: ObservationDecision[] = [];
    const first = entries[0]?.boundary;
    // Preflight conflicting snapshots of the same resource before promoting any
    // one of them. Different payloads with identical source version (or no
    // mutually verifiable version) are not silently merged as trusted evidence.
    const conflicts = new Set<number>();
    const parsed = entries.map(entry => observationInputSchema.safeParse(entry.input));
    for (let i = 0; i < entries.length; i++) {
        if (!parsed[i].success) continue;
        const a = (parsed[i] as { success: true; data: ObservationInput }).data;
        const ao = terminal.safeParse(a.actResult);
        if (!ao.success || ao.data.status !== 'SUCCEEDED') continue;
        const ar = outcomeSchema.safeParse(ao.data.outcome);
        if (!ar.success) continue;
        for (let j = i + 1; j < entries.length; j++) {
            if (!parsed[j].success) continue;
            const b = (parsed[j] as { success: true; data: ObservationInput }).data;
            const bo = terminal.safeParse(b.actResult);
            if (!bo.success || bo.data.status !== 'SUCCEEDED') continue;
            const br = outcomeSchema.safeParse(bo.data.outcome);
            if (!br.success || a.toolName !== b.toolName || hash(a.toolInput) !== hash(b.toolInput) ||
                hash(ar.data.output) === hash(br.data.output)) continue;
            // Explicit differing rowVersion in both outputs could be sequential,
            // but ACT checkpoint order still needs durable verification later.
            const av = (ar.data.output as { rowVersion?: unknown } | null)?.rowVersion;
            const bv = (br.data.output as { rowVersion?: unknown } | null)?.rowVersion;
            if (typeof av !== 'number' || typeof bv !== 'number' || av === bv) {
                conflicts.add(i); conflicts.add(j);
            }
        }
    }
    for (let i = 0; i < entries.length; i++) {
        const entry = entries[i];
        if (first && (entry.boundary.runId !== first.runId || entry.boundary.actorId !== first.actorId)) {
            decisions.push(decision({}, entry.boundary, 'REJECTED', 'CROSS_SCOPE_BATCH', 'UNTRUSTED'));
            continue;
        }
        if (conflicts.has(i)) {
            decisions.push(decision({}, entry.boundary, 'REJECTED', 'CONTRADICTORY_BATCH_EVIDENCE', 'UNTRUSTED'));
            continue;
        }
        const result = observeActRead(entry.input, entry.boundary, ledger);
        ledger = result.ledger;
        decisions.push(result.decision);
    }
    return { status: decisions.length > 0 && decisions.every(d => d.observationStatus === 'SUCCESS')
        ? 'SUCCESS' : decisions.some(d => d.observationStatus === 'SUCCESS') ? 'PARTIAL' : 'REJECTED',
        decisions, ledger };
}
