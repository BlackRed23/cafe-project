import { isDeepStrictEqual } from 'node:util';

export type PurchaseProposal = { supplierId: string; lines: { ingredientId: string; quantity: string; unitCost: string }[] };
export type InventoryRow = { id: string; ingredientId: string; remaining: string; reserved: string; version: string };
export type StockRecommendation = {
    ingredientId: string; baseUnit: 'g' | 'ml' | 'piece'; available: string;
    minStock: string; targetStock: string; recommendedBaseQuantity: string; sourceVersion: string;
};
export type SupplierQuote = {
    supplierId: string; ingredientId: string; purchaseUnit: string; conversionQuantity: string; version: string; active: boolean;
};
export type ReplenishmentInput = { supplierId: string; unitCosts: Record<string, string> };
type Step<Id extends string, Tool extends string, Dependencies extends string[], Input = null> = {
    id: Id; tool: Tool; dependsOn: Dependencies; input: Input;
};
export type ReplenishmentPlan = [
    Step<'inventory', 'inventory.read', []>,
    Step<'low-stock', 'inventory.analyze', ['inventory']>,
    Step<'recommendations', 'purchase.recommend', ['low-stock'], ReplenishmentInput>,
    Step<'proposal', 'purchase.prepare', ['recommendations']>,
    Step<'approval', 'purchase.requestApproval', ['proposal']>,
    Step<'purchase', 'purchase.create', ['proposal', 'approval']>,
];
export type ReplenishmentOutputs = {
    inventory: InventoryRow[];
    'low-stock': StockRecommendation[];
    recommendations: { ingredientId: string; quantity: string; unitCost: string; packs: string; quoteVersion: string }[];
    proposal: { proposal: PurchaseProposal; versions: Record<string, string> };
    approval: { requiredRole: 'ADMIN'; proposalHash: string };
    purchase: Omit<PurchaseProposal, 'lines'> & {
        id: string; status: 'OPEN'; version: '1';
        lines: (PurchaseProposal['lines'][number] & {
            received: string; purchaseUnit: string; quoteVersion: string; packs: string; conversionQuantity: string;
        })[];
    };
};

const idPattern = /^[A-Za-z0-9][A-Za-z0-9:_-]{0,119}$/;
const costPattern = /^(0|[1-9]\d{0,13})(\.\d{1,4})?$/;
export function replenishmentPlan(input: ReplenishmentInput): ReplenishmentPlan {
    if (!input || typeof input.supplierId !== 'string' || !idPattern.test(input.supplierId) ||
        !input.unitCosts || Object.getPrototypeOf(input.unitCosts) !== Object.prototype) throw new Error('INVALID_REPLENISHMENT');
    const entries = Object.entries(input.unitCosts);
    if (entries.length < 1 || entries.length > 100 || entries.some(([id, cost]) =>
        !idPattern.test(id) || typeof cost !== 'string' || !costPattern.test(cost))) throw new Error('INVALID_REPLENISHMENT');
    return [
        { id: 'inventory', tool: 'inventory.read', dependsOn: [], input: null },
        { id: 'low-stock', tool: 'inventory.analyze', dependsOn: ['inventory'], input: null },
        { id: 'recommendations', tool: 'purchase.recommend', dependsOn: ['low-stock'], input: { supplierId: input.supplierId, unitCosts: Object.fromEntries(entries) } },
        { id: 'proposal', tool: 'purchase.prepare', dependsOn: ['recommendations'], input: null },
        { id: 'approval', tool: 'purchase.requestApproval', dependsOn: ['proposal'], input: null },
        { id: 'purchase', tool: 'purchase.create', dependsOn: ['proposal', 'approval'], input: null },
    ];
}

export function validateReplenishmentPlan(plan: ReplenishmentPlan): void {
    if (!isDeepStrictEqual(plan, replenishmentPlan(plan[2]?.input))) throw new Error('INVALID_DEPENDENCIES');
}
