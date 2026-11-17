import type { AgentRepository, AgentState } from '../workflows/workflow-contracts';

export class MockAgentRepository implements AgentRepository {
    private state: AgentState;
    private tail = Promise.resolve();
    private fault: 'beforeCommit' | 'afterCommit' | undefined;
    private prepared: AgentState | undefined;
    constructor(seed?: AgentState, private readonly persist?: (state: AgentState) => void) {
        this.state = structuredClone(seed ?? { sequence: 0, executions: {}, approvals: {}, audit: [], memories: {}, operations: {}, toolCalls: {}, evaluations: [], permissions: { admin: ['agent.run', 'agent.approve', 'memory'], staff: ['agent.run', 'memory'], agent: ['agent.run', 'memory'] } });
        this.state.operations ??= {}; this.state.toolCalls ??= {}; this.state.evaluations ??= [];
    }
    snapshot(): AgentState { return structuredClone(this.state); }
    preparedSnapshot(): AgentState { return structuredClone(this.prepared ?? this.state); }
    injectFault(point: 'beforeCommit' | 'afterCommit'): void { this.fault = point; }
    private hit(point: 'beforeCommit' | 'afterCommit'): void { if (this.fault === point) { this.fault = undefined; throw new Error(`INJECTED_${point}`); } }
    async atomic<T>(work: (state: AgentState) => Promise<T> | T, onCommit?: (publish: () => void) => void, onFinish?: (finish: () => void) => void): Promise<T> {
        const prior = this.tail; let release!: () => void; this.tail = new Promise<void>(resolve => { release = resolve; }); await prior;
        try {
            const draft = structuredClone(this.state); const result = structuredClone(await work(draft)); this.hit('beforeCommit');
            if (onCommit) { this.prepared = draft; onCommit(() => { this.state = draft; this.hit('afterCommit'); }); }
            else { this.persist?.(draft); this.state = draft; this.hit('afterCommit'); }
            return result;
        } finally { const finish = () => { this.prepared = undefined; release(); }; if (onFinish) onFinish(finish); else finish(); }
    }
    async execution(id: string) { return this.atomic(s => s.executions[id]); }
}
