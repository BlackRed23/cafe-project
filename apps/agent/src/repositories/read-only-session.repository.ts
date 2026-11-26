import type { AgentRepository, AgentState } from '../workflows/workflow-contracts';

/** Per-request state for a non-durable read review. All access starts ungranted. */
export class ReadOnlySessionRepository implements AgentRepository {
    private state: AgentState = {
        sequence: 0, executions: {}, approvals: {}, audit: [], memories: {},
        operations: {}, toolCalls: {}, evaluations: [], permissions: {}
    };
    private tail = Promise.resolve();

    async atomic<T>(work: (state: AgentState) => Promise<T> | T,
        onCommit?: (publish: () => void) => void, onFinish?: (finish: () => void) => void): Promise<T> {
        if (onCommit || onFinish) throw new Error('READ_ONLY_CROSS_STORE_COMMIT_DISABLED');
        const result = this.tail.then(async () => {
            const draft = structuredClone(this.state);
            const value = structuredClone(await work(draft));
            this.state = draft;
            return value;
        });
        this.tail = result.then(() => undefined, () => undefined);
        return result;
    }

    async execution(id: string) {
        return this.atomic(state => state.executions[id]);
    }
}
