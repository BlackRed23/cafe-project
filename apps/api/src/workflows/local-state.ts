import { createHash, randomUUID } from 'node:crypto';
import { closeSync, existsSync, fsyncSync, openSync, readFileSync, renameSync, unlinkSync, writeFileSync } from 'node:fs';
import { isAbsolute, resolve } from 'node:path';
import { serialize, deserialize } from 'node:v8';
import { AgentState, MockAgentRepository } from '@cafe-project/agent/workflows';
import { MockRepository, MockState } from './mock-repository';

const FORMAT = 'cafe-local-development-state';
const VERSION = 1;
const CONTRACT = 'mock-business-agent-phase5-v1-27tables-16enums';
type State = { business: MockState; agent: AgentState };
const checksum = (data: Buffer) => createHash('sha256').update(data).digest('hex');
const record = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && Object.getPrototypeOf(value) === Object.prototype;
function validate(state: unknown): asserts state is State {
    if (!record(state) || !record(state.business) || !record(state.agent)) throw new Error('MOCK_STATE_CORRUPT');
    const business = state.business, agent = state.agent;
    for (const [s, maps, arrays] of [
        [business, ['principals', 'recipes', 'ingredients', 'lots', 'orders', 'purchases', 'receipts', 'counts', 'payments', 'operations', 'callbacks', 'reconciliations', 'menu'], ['quotes', 'events']],
        [agent, ['executions', 'approvals', 'memories', 'permissions', 'operations', 'toolCalls'], ['audit', 'evaluations']],
    ] as [Record<string, unknown>, string[], string[]][]) {
        if (!Number.isSafeInteger(s.sequence) || (s.sequence as number) < 0 || maps.some(k => !record(s[k])) || arrays.some(k => !Array.isArray(s[k]))) throw new Error('MOCK_STATE_CORRUPT');
    }
    for (const lot of Object.values(business.lots as MockState['lots'])) if (!(lot.expirationDate instanceof Date) || !(lot.receivedAt instanceof Date)) throw new Error('MOCK_STATE_CORRUPT');
}

/** Single-process, opt-in development convenience. No database durability/recovery contract. */
export class LocalDevelopmentState {
    constructor(private readonly path: string) { if (!isAbsolute(path)) throw new Error('MOCK_STATE_PATH_MUST_BE_ABSOLUTE'); }
    load(): State | undefined {
        if (!existsSync(this.path)) return undefined;
        try {
            const envelope = JSON.parse(readFileSync(this.path, 'utf8'));
            if (envelope.format !== FORMAT || envelope.version !== VERSION || envelope.contract !== CONTRACT || envelope.runtime !== process.versions.node.split('.')[0]) throw new Error('MOCK_STATE_INCOMPATIBLE');
            if (typeof envelope.payload !== 'string' || typeof envelope.checksum !== 'string') throw new Error('MOCK_STATE_CORRUPT');
            const bytes = Buffer.from(envelope.payload, 'base64');
            if (checksum(bytes) !== envelope.checksum) throw new Error('MOCK_STATE_CORRUPT');
            const state: unknown = deserialize(bytes); validate(state); return state;
        } catch (error) {
            if (error instanceof Error && error.message === 'MOCK_STATE_INCOMPATIBLE') throw error;
            throw new Error('MOCK_STATE_CORRUPT');
        }
    }
    save(state: State): void {
        validate(state);
        const payload = serialize(state);
        const envelope = JSON.stringify({ format: FORMAT, version: VERSION, contract: CONTRACT, runtime: process.versions.node.split('.')[0], checksum: checksum(payload), payload: payload.toString('base64') });
        const temp = `${this.path}.${randomUUID()}.tmp`;
        let fd: number | undefined;
        try {
            fd = openSync(temp, 'wx', 0o600); writeFileSync(fd, envelope); fsyncSync(fd); closeSync(fd); fd = undefined;
            renameSync(temp, this.path);
        } finally { if (fd !== undefined) closeSync(fd); if (existsSync(temp)) unlinkSync(temp); }
    }
}
export function createLocalDevelopmentRepositories(env: Record<string, string | undefined>) {
    if (env.MOCK_STATE_PERSISTENCE !== 'true') {
        if (env.MOCK_STATE_PERSISTENCE && env.MOCK_STATE_PERSISTENCE !== 'false') throw new Error('INVALID_MOCK_STATE_PERSISTENCE');
        return undefined;
    }
    if (env.DATA_PROVIDER !== 'mock' || !['development', 'test'].includes(env.NODE_ENV ?? '')) throw new Error('MOCK_STATE_PERSISTENCE_DISABLED');
    if (!env.MOCK_STATE_PATH || !isAbsolute(env.MOCK_STATE_PATH)) throw new Error('MOCK_STATE_PATH_MUST_BE_ABSOLUTE');
    const adapter = new LocalDevelopmentState(resolve(env.MOCK_STATE_PATH));
    const restored = adapter.load();
    let repository: MockRepository;
    const agentRepository = new MockAgentRepository(restored?.agent, agent => adapter.save({ business: repository.snapshot(), agent }));
    repository = new MockRepository(restored?.business, business => adapter.save({ business, agent: agentRepository.preparedSnapshot() }));
    return { repository, agentRepository };
}
