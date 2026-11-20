import { TOOL_CONTRACTS, ToolError, type P1ToolName } from './tool-contracts';

export interface ToolAuthorization {
    authorize(actorId: string, permission: string): Promise<unknown>;
}

export type ToolServices = ToolAuthorization & {
    availability?(id: string): Promise<unknown>;
    batches?(id: string): Promise<unknown>;
    recipe?(id: string): Promise<unknown>;
    suppliers?(id: string): Promise<unknown>;
    estimate?(input: { ingredientId: string; supplierId: string; quantityBase: string }): Promise<unknown>;
    sales?(input: { productId: string; from: string; to: string }): Promise<unknown>;
    reorder?(input: { ingredientId: string; supplierId?: string }): Promise<unknown>;
    stocktake?(input: { stocktakeId: string; ingredientId: string }): Promise<unknown>;
    inbound?(input: { purchaseOrderId: string; ingredientId: string }): Promise<unknown>;
};
export type ToolEvidence = {
    tool: string; version: string; actorId: string; mode: 'MOCK' | 'BACKEND';
    startedAt: string; durationMs: number; attempts: number;
    status: 'SUCCEEDED' | 'FAILED'; validated: boolean; durable: false;
};
export type ToolOutcome = { ok: true; output: unknown; evidence: ToolEvidence } |
    { ok: false; error: ToolError['code']; evidence: ToolEvidence };
export interface UnifiedToolRegistry {
    dispatch(actorId: string, name: string, input: unknown, version?: string, guard?: () => Promise<unknown>): Promise<ToolOutcome>;
    capabilities(): { name: P1ToolName; version: string; bound: boolean; mode: 'MOCK' | 'BACKEND' }[];
}

/** One bounded call; no planner, graph, approval emulation or business writes. */
export function createToolRegistry(services: ToolServices, mode: 'MOCK' | 'BACKEND'): UnifiedToolRegistry {
    return Object.freeze({
        capabilities: () => Object.values(TOOL_CONTRACTS).map(c => ({ name: c.name, version: c.version,
            mode, bound: c.binding !== null && typeof services[c.binding] === 'function' && c.status === 'IMPLEMENTED' })),
        async dispatch(actorId: string, name: string, raw: unknown, version = '1.0.0', guard?: () => Promise<unknown>): Promise<ToolOutcome> {
            const started = Date.now();
            const evidence: ToolEvidence = { tool: name, version, actorId, mode, startedAt: new Date(started).toISOString(),
                durationMs: 0, attempts: 0, status: 'FAILED', validated: false, durable: false };
            let timer: ReturnType<typeof setTimeout> | undefined;
            let expired = false;
            try {
                if (!Object.prototype.hasOwnProperty.call(TOOL_CONTRACTS, name)) throw new ToolError('UNKNOWN_TOOL');
                const contract = TOOL_CONTRACTS[name as P1ToolName];
                if (version !== contract.version) throw new ToolError('VERSION_MISMATCH');
                const parsed = contract.input.safeParse(raw);
                if (!parsed.success) throw new ToolError('INVALID_INPUT');
                if (typeof actorId !== 'string' || !actorId.trim()) throw new ToolError('FORBIDDEN');
                if (contract.category === 'WRITE' || contract.status !== 'IMPLEMENTED' || !contract.binding) throw new ToolError('BLOCKED');
                const handler = services[contract.binding];
                if (typeof handler !== 'function') throw new ToolError('BLOCKED');
                const output = await Promise.race([
                    (async () => {
                        await guard?.(); // Trusted workflow agent.run gate shares tool deadline/evidence.
                        if (expired) throw new ToolError('TIMEOUT');
                        await services.authorize(actorId, contract.permission);
                        if (expired) throw new ToolError('TIMEOUT');
                        evidence.attempts = 1;
                        const input = parsed.data as Record<string, string>;
                        const result = contract.binding === 'stocktake' ? await services.stocktake!({ stocktakeId: input.stocktakeId!, ingredientId: input.ingredientId! })
                            : contract.binding === 'inbound' ? await services.inbound!({ purchaseOrderId: input.purchaseOrderId!, ingredientId: input.ingredientId! })
                            : contract.binding === 'sales' ? await services.sales!({ productId: input.productId!, from: input.from!, to: input.to! })
                            : contract.binding === 'reorder' ? await services.reorder!({ ingredientId: input.ingredientId!, ...(input.supplierId ? { supplierId: input.supplierId } : {}) })
                            : contract.binding === 'estimate'
                            ? await services.estimate!({ ingredientId: input.ingredientId!, supplierId: input.supplierId!, quantityBase: input.quantityBase! })
                            : await (handler as (id: string) => Promise<unknown>).call(services, input.ingredientId ?? input.productId!);
                        const validated = contract.output.safeParse(result);
                        if (!validated.success) throw new ToolError('INVALID_OUTPUT');
                        return validated.data;
                    })(),
                    new Promise<never>((_, reject) => { timer = setTimeout(() => { expired = true; reject(new ToolError('TIMEOUT')); }, contract.policy.timeoutMs); }),
                ]);
                return { ok: true, output, evidence: { ...evidence, status: 'SUCCEEDED', validated: true, durationMs: Date.now() - started } };
            } catch (error) {
                const status = (error as { statusCode?: number; status?: number } | null)?.statusCode ?? (error as { status?: number } | null)?.status;
                const code = error instanceof ToolError ? error.code : status === 401 || status === 403 ? 'FORBIDDEN' : status === 404 ? 'NOT_FOUND'
                    : status === 409 && (error as { code?: string })?.code === 'BLOCKED' ? 'BLOCKED' : 'BACKEND_FAILURE';
                return { ok: false, error: code, evidence: { ...evidence, durationMs: Date.now() - started } };
            } finally { if (timer) clearTimeout(timer); }
        },
    });
}

/** P1 compatibility facade; named handlers use same catalog and dispatch. */
export function createReadToolAdapter(services: ToolServices) {
    const registry = createToolRegistry(services, 'BACKEND');
    function named<N extends P1ToolName>(name: N) {
        return async (actorId: string, input: unknown): Promise<import('zod').infer<(typeof TOOL_CONTRACTS)[N]['output']>> => {
            const result = await registry.dispatch(actorId, name, input);
            if (!result.ok) throw new ToolError(result.error);
            return result.output as import('zod').infer<(typeof TOOL_CONTRACTS)[N]['output']>;
        };
    }
    return Object.freeze({ getIngredientAvailability: named('getIngredientAvailability'), getIngredientBatches: named('getIngredientBatches'),
        getRecipeRequirements: named('getRecipeRequirements'), findIngredientSuppliers: named('findIngredientSuppliers'), estimatePurchaseCost: named('estimatePurchaseCost') });
}
