import { createToolRegistry, ToolError } from '@cafe-project/agent/workflows';
import type { BusinessWorkflows } from './business-service';

/** Missing mock price/time evidence stays unbound; never fabricate production DTOs. */
export function bindMockTools(business: BusinessWorkflows) {
    // Actor-specific service calls avoid ambient mutable identity across concurrent dispatches.
    const registry = (actor: string) => createToolRegistry({
            // Existing mock recipe grants map explicitly to inventory.read.
            authorize: async (id, permission) => {
                const current = await business.authorize(id, permission === 'recipe.read' ? 'inventory.read' : permission);
                if (!['ADMIN', 'STAFF'].includes(current.role)) throw new ToolError('FORBIDDEN');
                return current;
            },
            availability: id => business.readToolSnapshot(actor, 'availability', id),
            batches: id => business.readToolSnapshot(actor, 'batches', id),
            recipe: id => business.readToolSnapshot(actor, 'recipe', id),
        }, 'MOCK');
    return Object.assign(business, { toolRegistry: {
        capabilities: () => registry('').capabilities(),
        dispatch: (actor: string, name: string, input: unknown, version?: string, guard?: () => Promise<unknown>) => registry(actor).dispatch(actor, name, input, version, guard),
    } });
}
