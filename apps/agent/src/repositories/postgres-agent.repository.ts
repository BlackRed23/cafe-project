import { createHash } from 'node:crypto';
import { Prisma, prisma, type PrismaClient } from '@cafe-project/database';
import type { AgentRepository, AgentState, Execution } from '../workflows/workflow-contracts';

/** Versioned graph/execution checkpoint. AgentLog remains an independent audit trail.
 * The existing AgentExecution columns cannot losslessly encode graph states and revisions.
 * This namespaced SystemSetting row requires no schema migration and does not touch
 * purchasing tables. Do not enable it as a purchasing BusinessPort adapter.
 */
const CHECKPOINT_KEY = 'agent.workflow.checkpoint.v1';
const MAX_CHECKPOINT_BYTES = 8 * 1024 * 1024;
const RETRIES = 3;

type Envelope = { version: 1; digest: string; state: AgentState };
const hash = (value: string) => createHash('sha256').update(value, 'utf8').digest('hex');
const blank = (): AgentState => ({
    sequence: 0, executions: {}, approvals: {}, audit: [], memories: {},
    permissions: {}, operations: {}, toolCalls: {}, evaluations: [], graphRuns: {}
});

function decode(value: string): AgentState {
    if (Buffer.byteLength(value, 'utf8') > MAX_CHECKPOINT_BYTES) throw new Error('INVALID_GRAPH_CHECKPOINT');
    let record: unknown;
    try { record = JSON.parse(value); } catch { throw new Error('INVALID_GRAPH_CHECKPOINT'); }
    if (!record || typeof record !== 'object' || Array.isArray(record)) throw new Error('INVALID_GRAPH_CHECKPOINT');
    const envelope = record as Partial<Envelope>;
    if (envelope.version !== 1 || typeof envelope.digest !== 'string' ||
        !envelope.state || typeof envelope.state !== 'object' || Array.isArray(envelope.state)) throw new Error('INVALID_GRAPH_CHECKPOINT');
    const serialized = JSON.stringify(envelope.state);
    if (hash(serialized) !== envelope.digest) throw new Error('INVALID_GRAPH_CHECKPOINT');
    const s = envelope.state;
    if (!Number.isSafeInteger(s.sequence) || s.sequence < 0 || !Array.isArray(s.audit) ||
        !Array.isArray(s.evaluations) || !s.executions || typeof s.executions !== 'object' ||
        !s.approvals || typeof s.approvals !== 'object' || !s.memories || typeof s.memories !== 'object' ||
        !s.permissions || typeof s.permissions !== 'object' || !s.operations || typeof s.operations !== 'object' ||
        !s.toolCalls || typeof s.toolCalls !== 'object' ||
        (s.graphRuns !== undefined && (typeof s.graphRuns !== 'object' || Array.isArray(s.graphRuns)))) {
        throw new Error('INVALID_GRAPH_CHECKPOINT');
    }
    return s;
}

function encode(state: AgentState): string {
    const data = JSON.stringify(state);
    if (!data) throw new Error('INVALID_GRAPH_CHECKPOINT');
    const value = JSON.stringify({ version: 1, digest: hash(data), state } satisfies Envelope);
    if (Buffer.byteLength(value, 'utf8') > MAX_CHECKPOINT_BYTES) throw new Error('GRAPH_CHECKPOINT_TOO_LARGE');
    return value;
}

const retryable = (error: unknown) => {
    const candidate = error as { code?: string; meta?: { code?: string } } | null;
    return candidate?.code === 'P2034' || candidate?.code === 'P2002' ||
        (candidate?.code === 'P2010' && ['40001', '40P01'].includes(candidate.meta?.code ?? ''));
};

/** PostgreSQL serializes all snapshots with a real row lock in one transaction.
 *
 * No actor permissions are preseeded: a verified Backend identity/role adapter
 * must grant them deliberately. Production composition must reject
 * unverified database adapters. Cross-database BusinessPort atomic/onCommit is
 * unsupported until its transaction ownership has been verified.
 */
export class PostgresAgentRepository implements AgentRepository {
    constructor(private readonly db: Pick<PrismaClient, '$transaction'> = prisma,
        private readonly key: string = CHECKPOINT_KEY) {
        if (!/^agent\.workflow\.checkpoint\.v1(?:\.[a-zA-Z0-9-]{1,100})?$/.test(key)) {
            throw new Error('INVALID_GRAPH_CHECKPOINT_KEY');
        }
    }

    async atomic<T>(work: (state: AgentState) => Promise<T> | T,
        onCommit?: (publish: () => void) => void, onFinish?: (finish: () => void) => void): Promise<T> {
        // A synchronous publish callback cannot commit a different Prisma transaction.
        // Claiming atomic purchase+checkpoint behavior here would permit duplicate PRs.
        if (onCommit || onFinish) throw new Error('POSTGRES_NOT_VERIFIED: shared BusinessPort transaction required');
        for (let attempt = 0; ; ++attempt) {
            try {
                return await this.db.$transaction(async tx => {
                    await tx.systemSetting.createMany({
                        data: [{ key: this.key, value: encode(blank()) }], skipDuplicates: true
                    });
                    const locked = await tx.$queryRaw<Array<{ key: string; value: string }>>`
                        SELECT "key", "value" FROM "SystemSetting"
                        WHERE "key" = ${this.key} FOR UPDATE
                    `;
                    if (locked.length !== 1) throw new Error('INVALID_GRAPH_CHECKPOINT');
                    const original = decode(locked[0]!.value);
                    const draft = structuredClone(original);
                    const result = structuredClone(await work(draft));
                    const updated = encode(draft);
                    if (updated !== locked[0]!.value) {
                        await tx.systemSetting.update({ where: { key: this.key }, data: { value: updated } });
                    }
                    return result;
                }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, timeout: 15000 });
            } catch (error) {
                if (!retryable(error) || attempt >= RETRIES) throw error;
                await new Promise(resolve => setTimeout(resolve, 10 * (attempt + 1)));
            }
        }
    }

    /**
     * One serializable transaction is the durable ACT read-attempt boundary:
     * append a sanitized Graph event AND project the attempt to existing
     * AgentExecution/AgentToolCall tables. No schema migration, tool payload,
     * inventory write, purchasing permission or privileged retry is involved.
     */
    async recordActEvent(input: Parameters<NonNullable<AgentRepository['recordActEvent']>>[0]): Promise<void> {
        const e = input.event;
        if (e.node !== 'act_executor' ||
            !['ACT_STARTED', 'ACT_RETRY_SCHEDULED', 'ACT_SUCCEEDED', 'ACT_HELD'].includes(e.status) ||
            !e.stepId || !/^act-[1-8]$/.test(e.stepId) ||
            e.tool !== 'getIngredientAvailability' && e.tool !== 'getIngredientBatches' ||
            !Number.isInteger(e.attempt) || e.attempt! < 0 || e.attempt! > 2 ||
            !Number.isInteger(input.toolIndex) || input.toolIndex < 0 || input.toolIndex > 7 ||
            Number.isNaN(Date.parse(e.at)) || e.actorId !== input.actorId) {
            throw new Error('INVALID_ACT_CHECKPOINT');
        }
        const key = 'act:' + input.graphId;
        for (let attempt = 0; ; attempt++) {
            try {
                await this.db.$transaction(async tx => {
                    const locked = await tx.$queryRaw<Array<{ key: string; value: string }>>`
                        SELECT "key", "value" FROM "SystemSetting"
                        WHERE "key" = ${this.key} FOR UPDATE
                    `;
                    if (locked.length !== 1) throw new Error('INVALID_GRAPH_CHECKPOINT');
                    const state = decode(locked[0]!.value);
                    const run = state.graphRuns?.[input.graphId];
                    if (!run || run.inputHash !== input.inputHash ||
                        run.leaseOwner !== input.invocationId ||
                        run.actorId !== input.actorId || run.requestId !== input.requestId ||
                        (input.executionId && run.executionId !== input.executionId) ||
                        !state.permissions[input.actorId]?.includes('agent.run')) {
                        throw new Error('INVALID_GRAPH_CHECKPOINT');
                    }
                    const execution = await tx.agentExecution.upsert({
                        where: { idempotencyKey: key }, update: {},
                        create: {
                            goal: 'ACT_REGISTERED_READ_ONLY',
                            intent: input.executionId ? 'GRAPH:' + input.executionId : 'GRAPH_READ',
                            triggeredBy: input.actorId, idempotencyKey: key, status: 'RUNNING'
                        }
                    });
                    if (execution.triggeredBy !== input.actorId || execution.idempotencyKey !== key) {
                        throw new Error('INVALID_ACT_CHECKPOINT');
                    }
                    const cycle = run.actCycle ?? 0;
                    if (!Number.isSafeInteger(cycle) || cycle < 0 || cycle > 100000) {
                        throw new Error('INVALID_ACT_CHECKPOINT');
                    }
                    const slot = cycle * 100 + input.toolIndex * 3 + e.attempt!;
                    const row = await tx.agentToolCall.findUnique({
                        where: { executionId_stepNo: { executionId: execution.id, stepNo: slot } }
                    });
                    if (row?.status === 'SUCCEEDED' && e.status !== 'ACT_SUCCEEDED') {
                        throw new Error('INVALID_ACT_REPLAY');
                    }
                    if (e.status === 'ACT_STARTED' && execution.status !== 'RUNNING') {
                        await tx.agentExecution.update({
                            where: { id: execution.id },
                            data: { status: 'RUNNING', endedAt: null, errorMessage: null }
                        });
                    }
                    const status = e.status === 'ACT_SUCCEEDED' ? 'SUCCEEDED' :
                        e.status === 'ACT_STARTED' ? 'RUNNING' :
                            e.attempt === 0 ? 'SKIPPED' : 'FAILED';
                    const reason = e.code && /^[A-Z0-9_]{1,64}$/.test(e.code) ? e.code : null;
                    const complete = e.status !== 'ACT_STARTED';
                    await tx.agentToolCall.upsert({
                        where: { executionId_stepNo: { executionId: execution.id, stepNo: slot } },
                        create: {
                            executionId: execution.id, stepNo: slot, toolName: e.tool!,
                            arguments: { graphId: input.graphId, requestId: input.requestId,
                                stepId: e.stepId, attempt: e.attempt, readOnly: true },
                            status, errorMessage: reason, startedAt: new Date(e.at),
                            ...(complete ? { result: { event: e.status, code: reason },
                                completedAt: new Date(e.at) } : {})
                        },
                        update: { status, errorMessage: reason,
                            ...(complete ? { result: { event: e.status, code: reason },
                                completedAt: new Date(e.at) } : {}) }
                    });
                    run.trace.push(structuredClone(e));
                    run.updatedAt = e.at;
                    await tx.systemSetting.update({
                        where: { key: this.key }, data: { value: encode(state) }
                    });
                }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, timeout: 15000 });
                return;
            } catch (error) {
                if (!retryable(error) || attempt >= RETRIES) throw error;
                await new Promise(resolve => setTimeout(resolve, 10 * (attempt + 1)));
            }
        }
    }

    /** Atomic terminal Graph status and existing AgentExecution projection. */
    async finalizeActRun(input: Parameters<NonNullable<AgentRepository['finalizeActRun']>>[0]): Promise<void> {
        for (let attempt = 0; ; attempt++) {
            try {
                await this.db.$transaction(async tx => {
                    const locked = await tx.$queryRaw<Array<{ value: string }>>`
                        SELECT "value" FROM "SystemSetting" WHERE "key" = ${this.key} FOR UPDATE
                    `;
                    if (locked.length !== 1) throw new Error('INVALID_GRAPH_CHECKPOINT');
                    const state = decode(locked[0]!.value);
                    const run = state.graphRuns?.[input.graphId];
                    if (!run || run.inputHash !== input.inputHash ||
                        run.leaseOwner !== input.invocationId) {
                        throw new Error('INVALID_GRAPH_CHECKPOINT');
                    }
                    run.status = input.status;
                    run.updatedAt = new Date().toISOString();
                    delete run.leaseOwner;
                    delete run.leaseUntil;
                    await tx.systemSetting.update({
                        where: { key: this.key }, data: { value: encode(state) }
                    });
                    const projected = await tx.agentExecution.findUnique({
                        where: { idempotencyKey: 'act:' + input.graphId }
                    });
                    if (projected) {
                        await tx.agentExecution.update({
                            where: { id: projected.id },
                            data: {
                                status: input.status === 'SUCCEEDED' ? 'SUCCEEDED' :
                                    input.status === 'RUNNING' ? 'RUNNING' : 'FAILED',
                                ...(input.status !== 'RUNNING' ? { endedAt: new Date(),
                                    errorMessage: input.status === 'SUCCEEDED' ? null : 'ACT_POLICY_HOLD' } : {})
                            }
                        });
                    }
                }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, timeout: 15000 });
                return;
            } catch (error) {
                if (!retryable(error) || attempt >= RETRIES) throw error;
                await new Promise(resolve => setTimeout(resolve, 10 * (attempt + 1)));
            }
        }
    }

    async execution(id: string): Promise<Execution | undefined> {
        return this.atomic(state => state.executions[id]);
    }
}
