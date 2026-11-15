import { BusinessTransaction, WorkflowRepository, Principal, Sale, Lot, Purchase, Receipt, Count, Payment, OperationRecord, Ingredient, BusinessError, TransactionFailure, SupplierQuote, Reconciliation, PaymentEvent } from './contracts';
import type { RecipeInput } from '../common/inventory-core';
import type { MenuProduct } from './contracts';

export type MockState = {
    sequence: number; principals: Record<string, Principal>; recipes: Record<string, RecipeInput[]>;
    ingredients: Record<string, Ingredient>;
    quotes: SupplierQuote[];
    lots: Record<string, Lot>; orders: Record<string, Sale>; purchases: Record<string, Purchase>;
    receipts: Record<string, Receipt>; counts: Record<string, Count>; payments: Record<string, Payment>;
    operations: Record<string, OperationRecord>; callbacks: Record<string, PaymentEvent>; events: Record<string, string>[];
    reconciliations: Record<string, Reconciliation>;
    menu: Record<string, MenuProduct>;
};
export function deterministicFixtures(): MockState {
    return { sequence: 0,
        menu: { coffee: { id: 'coffee', name: 'Coffee', price: '30.00', version: '1', active: true, draft: null }, latte: { id: 'latte', name: 'Latte', price: '40.00', version: '1', active: true, draft: null } },
        ingredients: { beans: { id: 'beans', name: 'Beans', baseUnit: 'g', active: true, version: '1', minStock: '50', targetStock: '200' }, milk: { id: 'milk', name: 'Milk', baseUnit: 'ml', active: true, version: '1', minStock: '150', targetStock: '1000' } },
        quotes: [...['s', 'supplier', 'full-supplier'].map(supplierId => ({ supplierId, ingredientId: 'beans', purchaseUnit: 'pack', conversionQuantity: '1', version: '1', active: true })), { supplierId: 'full-supplier', ingredientId: 'milk', purchaseUnit: 'bottle', conversionQuantity: '1000', version: '1', active: true }],
        principals: { admin: { id: 'admin', role: 'ADMIN', active: true, permissions: ['menu.write', 'order.write', 'inventory.read', 'inventory.write', 'purchase.write', 'purchase.approve', 'count.write', 'count.approve', 'payment.write', 'payment.callback', 'agent.run', 'agent.approve', 'memory'] },
            staff: { id: 'staff', role: 'STAFF', active: true, permissions: ['order.write', 'inventory.read', 'purchase.write', 'count.write', 'agent.run', 'memory'] },
            customer: { id: 'customer', role: 'CUSTOMER', active: true, permissions: [] },
            agent: { id: 'agent', role: 'AGENT', active: true, permissions: ['inventory.read', 'purchase.write', 'agent.run', 'memory'] } },
        recipes: { coffee: [{ id: 'coffee-v1', version: '1', active: true, productActive: true, effectiveFrom: new Date('2026-01-01Z'), effectiveTo: null, yieldQuantity: '1',
            ingredients: [{ ingredientId: 'beans', baseUnit: 'g', quantity: '18', unit: 'g', active: true, optional: false }] }],
            latte: [{ id: 'latte-v1', version: '1', active: true, productActive: true, effectiveFrom: new Date('2026-01-01Z'), effectiveTo: null, yieldQuantity: '1', ingredients: [{ ingredientId: 'beans', baseUnit: 'g', quantity: '18', unit: 'g', active: true, optional: false }, { ingredientId: 'milk', baseUnit: 'ml', quantity: '150', unit: 'ml', active: true, optional: false }] }] },
        lots: { early: { id: 'early', ingredientId: 'beans', remaining: '100', reserved: '0', version: '1', unitCost: '0.1000', expirationDate: new Date('2026-12-01Z'), receivedAt: new Date('2026-10-01Z') },
            late: { id: 'late', ingredientId: 'beans', remaining: '100', reserved: '0', version: '1', unitCost: '0.2000', expirationDate: new Date('2027-01-01Z'), receivedAt: new Date('2026-10-02Z') } },
        orders: {}, purchases: {}, receipts: {}, counts: {}, payments: {}, operations: {}, callbacks: {}, events: [], reconciliations: {} };
}
const copy = <T>(value: T): T => structuredClone(value);
/** Serialized FIFO simulation, NOT PostgreSQL locks. Snapshot supports simulated process restart only. */
export class MockRepository implements WorkflowRepository {
    private state: MockState;
    private tail: Promise<void> = Promise.resolve();
    private fault: { point: string; remaining: number } | undefined;
    constructor(seed = deterministicFixtures(), private readonly persist?: (state: MockState) => void) { this.state = copy(seed); }
    snapshot(): MockState { return copy(this.state); }
    injectFault(point: 'write' | 'beforeCommit' | 'afterCommit', occurrence = 1): void {
        if (!Number.isInteger(occurrence) || occurrence < 1) throw new Error('Invalid fault occurrence');
        this.fault = { point, remaining: occurrence };
    }
    private hit(point: string): void {
        if (this.fault?.point === point && --this.fault.remaining === 0) { this.fault = undefined; throw new TransactionFailure(point === 'afterCommit' ? 'UNKNOWN' : 'ROLLED_BACK', `INJECTED_${point}`); }
    }
    private view(s: MockState, publications: (() => void)[] = [], completions: (() => void)[] = []): BusinessTransaction {
        const save = <T>(target: Record<string, T>, id: string, value: T) => { target[id] = copy(value); this.hit('write'); };
        return {
            onCommit: publish => { publications.push(publish); },
            onFinish: finish => { completions.push(finish); },
            savepoint: work => { const before = copy(s); const count = publications.length; try { return work(); } catch (error) { Object.assign(s, before); publications.length = count; throw error; } },
            savepointAsync: async work => { const before = copy(s); const count = publications.length; try { return await work(); } catch (error) { Object.assign(s, before); publications.length = count; throw error; } },
            principal: id => copy(s.principals[id]), candidates: id => copy(s.recipes[id] ?? []),
            menu: () => copy(Object.values(s.menu)), saveMenu: v => save(s.menu, v.id, v),
            saveRecipes: (id, recipes) => save(s.recipes, id, recipes),
            listOrders: () => copy(Object.values(s.orders)), listPurchases: () => copy(Object.values(s.purchases)),
            listReceipts: () => copy(Object.values(s.receipts)), listCounts: () => copy(Object.values(s.counts)),
            listPayments: () => copy(Object.values(s.payments)), listReconciliations: () => copy(Object.values(s.reconciliations)),
            inventoryEvents: () => copy(s.events), supplierQuotes: () => copy(s.quotes),
            ingredient: id => copy(s.ingredients[id]), saveIngredient: v => save(s.ingredients, v.id, v),
            ingredients: () => copy(Object.values(s.ingredients)),
            lots: () => copy(Object.values(s.lots)), saveLot: v => save(s.lots, v.id, v),
            event: v => { s.events.push(copy(v)); this.hit('write'); },
            order: id => copy(s.orders[id]), saveOrder: v => save(s.orders, v.id, v),
            ordersForBatch: batchId => copy(Object.values(s.orders).filter(o => o.allocations.some(a => a.batchId === batchId && a.terminal === 'CONSUMED'))),
            quote: (supplierId, ingredientId) => copy(s.quotes.find(q => q.supplierId === supplierId && q.ingredientId === ingredientId)),
            purchase: id => copy(s.purchases[id]), savePurchase: v => save(s.purchases, v.id, v), receipt: id => copy(s.receipts[id]), saveReceipt: v => save(s.receipts, v.id, v),
            count: id => copy(s.counts[id]), saveCount: v => save(s.counts, v.id, v),
            payments: id => copy(Object.values(s.payments).filter(p => p.orderId === id)), payment: id => copy(s.payments[id]), savePayment: v => save(s.payments, v.id, v),
            accountPayments: account => copy(Object.values(s.payments).filter(p => p.account === account)), saveReconciliation: v => save(s.reconciliations, v.id, v),
            callback: (key, event) => { if (s.callbacks[key] && s.callbacks[key].hash !== event.hash) throw new BusinessError(409, 'CALLBACK_CONFLICT'); save(s.callbacks, key, event); },
            operation: key => copy(s.operations[key]), saveOperation: v => { if (s.operations[v.key]) throw new Error('IMMUTABLE_OPERATION'); save(s.operations, v.key, v); },
            nextId: kind => `${kind}-${++s.sequence}`,
        };
    }
    async transaction<T>(work: (tx: BusinessTransaction) => Promise<T> | T): Promise<T> {
        const prior = this.tail; let release!: () => void;
        this.tail = new Promise<void>(resolve => { release = resolve; });
        await prior;
        const completions: (() => void)[] = [];
        try {
            const draft = copy(this.state); const publications: (() => void)[] = []; const result = await work(this.view(draft, publications, completions));
            const detached = copy(result); this.hit('beforeCommit'); this.persist?.(draft); this.state = draft; for (const publish of publications) publish(); this.hit('afterCommit'); return detached;
        } finally { for (const finish of completions) finish(); release(); }
    }
    async read<T>(work: (tx: BusinessTransaction) => T): Promise<T> { await this.tail; return copy(work(this.view(copy(this.state)))); }
}
