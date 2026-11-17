import type { Plan, PlanningContext, MemoryEvidence, InventoryTool, MemoryDecisionProof, LLMProvider } from '../workflow-contracts';

export const mockDecision = Symbol('mockDecision');
const inventoryHint = (e: MemoryEvidence): e is MemoryEvidence & { tool: InventoryTool } =>
    e.tool === 'inventory.read' || e.tool === 'inventory.recommend';
export class MockLLMProvider implements LLMProvider {
    constructor(private readonly steps?: Plan) {}
    async plan(prompt: string, context?: PlanningContext): Promise<Plan> {
        return this[mockDecision](prompt, context).plan;
    }
    [mockDecision](prompt: string, context?: PlanningContext): {
        plan: Plan; influence?: { memoryId: string; proof: MemoryDecisionProof };
    } {
        if (this.steps) return { plan: structuredClone(this.steps) };
        if (prompt.startsWith('purchase:')) return { plan: [{ tool: 'purchase.create', input: JSON.parse(prompt.slice(9)) }] };
        if (prompt === 'recommend') return { plan: [{ tool: 'inventory.recommend', input: null }] };
        const [hint, nextHint] = context?.evidence.filter(inventoryHint) ?? [];
        const selectedTool = hint?.tool ?? 'inventory.read';
        const plan: Plan = [{ tool: selectedTool, input: null }];
        if (!hint) return { plan };
        // The default without hints is read. A ranked read hint can also displace a recommendation.
        const without = selectedTool === 'inventory.recommend' ? 'ALL_HINTS' : 'SELECTED_HINT';
        const alternativeTool = without === 'ALL_HINTS' ? 'inventory.read' : nextHint?.tool ?? 'inventory.read';
        if (selectedTool === alternativeTool) return { plan };
        return { plan, influence: { memoryId: hint.memoryId, proof: { kind: 'MOCK_INVENTORY_SELECTION', stepIndex: 0, selectedTool, alternativeTool, without } } };
    }
}
