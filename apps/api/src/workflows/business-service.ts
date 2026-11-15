import type { MenuDraft, MenuProduct } from './contracts';
import { calculateRequirements, calculateComponents, attributeComponentCosts, planReservation, operationIdentity, ingredientCost } from '../common/inventory-core';
import { normalizeIngredientQuantity, rankEligibleBatches } from '../common/ingredient-policy';
import { BusinessError, BusinessTransaction, WorkflowRepository, OperationResult, requirePermission, Lot, Sale, Purchase, TransactionFailure, Receipt, ReceiptInput, OrderLineInput } from './contracts';

export type Command = { actorId: string; key: string; scope: string; versions: Record<string, string> };
const fail = (code: string, status = 409): never => { throw new BusinessError(status, code); };
const get = <T>(value: T | undefined): T => value ?? fail('NOT_FOUND', 404);
const scaled = (v: string, scale = 3): bigint => {
    const digits = scale === 4 ? 14 : scale === 2 ? 12 : 11;
    if (typeof v !== 'string' || !new RegExp(`^(0|[1-9]\\d{0,${digits - 1}})(\\.\\d{1,${scale}})?$`).test(v)) return fail('INVALID_DECIMAL', 400);
    const [whole, fraction = ''] = v.split('.'); return BigInt(whole!) * 10n ** BigInt(scale) + BigInt(fraction.padEnd(scale, '0'));
};
const format = (v: bigint, scale = 3): string => { const sign = v < 0n ? '-' : ''; v = v < 0n ? -v : v; const factor = 10n ** BigInt(scale); return sign + `${v / factor}.${(v % factor).toString().padStart(scale, '0')}`; };
const add = (a: string, b: string, sign = 1n): string => format(scaled(a) + sign * scaled(b));
const bump = (v: string) => (BigInt(v) + 1n).toString();
const unique = (ids: string[]) => { if (!ids.length || new Set(ids).size !== ids.length || ids.some(id => !id.trim() || id.trim() !== id)) fail('INVALID_LINES', 400); };

/** Shared service validation/authorization for every persistence provider. No LLM or Prisma dependency. */
export class BusinessWorkflows {
    constructor(readonly repository: WorkflowRepository, private readonly clock: () => Date = () => new Date(), private readonly maxAttempts = 3) {
        if (!Number.isInteger(maxAttempts) || maxAttempts < 1 || maxAttempts > 3) throw new Error('Invalid retry bound');
    }
    /** Mock Agent enlistment: business draft and prepared Agent state publish at the same commit. */
    atomic<T>(work: (business: BusinessWorkflows, onCommit: (publish: () => void) => void, onFinish: (finish: () => void) => void) => Promise<T>): Promise<T> {
        return this.repository.transaction(tx => work(new BusinessWorkflows({ transaction: async fn => tx.savepointAsync(async () => fn(tx)), read: async fn => fn(tx) }, this.clock, 1), tx.onCommit, tx.onFinish));
    }
    private async command<P>(c: Command, kind: string, permission: string, payload: P, work: (tx: BusinessTransaction, now: Date, input: P, command: Command) => unknown): Promise<OperationResult> {
        c = structuredClone(c); payload = structuredClone(payload);
        const identity = operationIdentity({ type: kind, scope: c.scope, callerKey: c.key, actorId: c.actorId, versions: c.versions, payload });
        const run = () => this.repository.transaction(tx => {
            requirePermission(tx, c.actorId, permission); // Always current authorization, including replay.
            const prior = tx.operation(identity.key);
            if (prior) { if (prior.requestHash !== identity.requestHash) return { status: 409, body: { code: 'IDEMPOTENCY_CONFLICT' } }; return prior.response; }
            const now = this.clock(); if (!Number.isFinite(now.getTime())) throw new Error('Invalid clock');
            let response: OperationResult;
            try { response = { status: 200, body: tx.savepoint(() => work(tx, now, payload, c)) }; }
            catch (error) { if (!(error instanceof BusinessError)) throw error; response = { status: error.status, body: { code: error.code } }; }
            tx.saveOperation({ key: identity.key, requestHash: identity.requestHash, actorId: c.actorId, canonicalVersion: '1', resultVersion: '1', committedAt: now.toISOString(), response });
            return response;
        });
        for (let attempt = 1; ; attempt++) {
            try { return await run(); }
            catch (error) {
                if (!(error instanceof TransactionFailure)) throw error;
                if (error.outcome === 'UNKNOWN') {
                    const receipt = await this.repository.read(tx => { requirePermission(tx, c.actorId, permission); return tx.operation(identity.key); });
                    if (receipt) return receipt.requestHash === identity.requestHash ? receipt.response : { status: 409, body: { code: 'IDEMPOTENCY_CONFLICT' } };
                    throw error; // Absence alone is not proof of rollback. Never blindly re-execute.
                }
                if (attempt >= this.maxAttempts) throw error;
            }
        }
    }
    private version(c: Command, id: string, actual: string): void { if (c.versions[id] !== actual) fail('STALE_VERSION'); }
    async catalog(actorId: string) {
        return this.repository.read(tx => { const actor = requirePermission(tx, actorId, 'inventory.read'); return actor.role === 'ADMIN' ? tx.menu() : tx.menu().filter(p => p.active).map(p => ({ ...p, draft: null })); });
    }
    async applicationData(actorId: string, area: 'inventory' | 'orders' | 'purchases' | 'counts' | 'payments') {
        const permissions = { inventory: 'inventory.read', orders: 'order.write', purchases: 'purchase.write', counts: 'count.write', payments: 'payment.write' };
        return this.repository.read(tx => {
            requirePermission(tx, actorId, permissions[area]);
            switch (area) {
                case 'inventory': return { ingredients: tx.ingredients(), lots: tx.lots(), events: tx.inventoryEvents() };
                case 'orders': return tx.listOrders();
                case 'purchases': return { balances: tx.listPurchases().map(p => this.purchaseBalance(tx, p)), purchases: tx.listPurchases(), receipts: tx.listReceipts(), quotes: tx.supplierQuotes() };
                case 'counts': return tx.listCounts();
                case 'payments': return { payments: tx.listPayments(), reconciliations: tx.listReconciliations() };
            }
        });
    }
    saveMenuDraft(c: Command, input: { productId: string; name: string; price: string } & MenuDraft) {
        return this.command(c, 'menu.draft', 'menu.write', input, (tx, now, p, command) => {
            if (tx.principal(command.actorId)?.role !== 'ADMIN') fail('ADMIN_REQUIRED', 403);
            if (!/^[A-Za-z0-9][A-Za-z0-9:_-]{0,119}$/.test(p.productId) || !p.name.trim() || p.name.length > 200 || scaled(p.price, 2) <= 0n) fail('INVALID_MENU', 400);
            const current = tx.menu().find(product => product.id === p.productId);
            if (current) this.version(command, current.id, current.version);
            else if (command.versions[p.productId] !== undefined) fail('STALE_VERSION');
            unique(p.ingredients.map(row => row.ingredientId));
            const ingredients = p.ingredients.map(row => {
                const ingredient = get(tx.ingredient(row.ingredientId));
                if (!ingredient.active || scaled(row.quantity) <= 0n) fail('INVALID_RECIPE', 400);
                return { ...row, baseUnit: ingredient.baseUnit, active: ingredient.active };
            });
            try { calculateRequirements([{ id: 'validation', version: '1', active: true, productActive: true, effectiveFrom: now, effectiveTo: null, yieldQuantity: p.yieldQuantity, ingredients }], '1', [], [], now); }
            catch { fail('INVALID_RECIPE', 400); }
            const product: MenuProduct = { id: p.productId, name: current?.name ?? p.name.trim(), price: current?.price ?? format(scaled(p.price, 2), 2), version: current ? bump(current.version) : '1', active: current?.active ?? false, draft: { name: p.name.trim(), price: format(scaled(p.price, 2), 2), yieldQuantity: p.yieldQuantity, ingredients: p.ingredients } };
            tx.saveMenu(product); return product;
        });
    }
    publishMenu(c: Command, input: { productId: string }) {
        return this.command(c, 'menu.publish', 'menu.write', input, (tx, now, p, command) => {
            if (tx.principal(command.actorId)?.role !== 'ADMIN') fail('ADMIN_REQUIRED', 403);
            const product = get(tx.menu().find(product => product.id === p.productId)); this.version(command, product.id, product.version);
            const draft = product.draft ?? fail('NO_RECIPE_DRAFT');
            const ingredients = draft.ingredients.map(row => { const i = get(tx.ingredient(row.ingredientId)); if (!i.active) fail('INACTIVE_INGREDIENT'); return { ...row, baseUnit: i.baseUnit, active: i.active }; });
            const version = bump(product.version);
            const recipe = { id: tx.nextId('recipe'), version, active: true, productActive: true, effectiveFrom: now, effectiveTo: null, yieldQuantity: draft.yieldQuantity, ingredients };
            try { calculateRequirements([recipe], '1', [], [], now); } catch { fail('INVALID_RECIPE', 400); }
            tx.saveRecipes(product.id, [...tx.candidates(product.id).map(row => ({ ...row, active: false })), recipe]);
            product.name = draft.name ?? product.name; product.price = draft.price ?? product.price; product.active = true; product.version = version; product.draft = null; tx.saveMenu(product); return product;
        });
    }
    archiveMenu(c: Command, input: { productId: string }) {
        return this.command(c, 'menu.archive', 'menu.write', input, (tx, _now, p, command) => {
            if (tx.principal(command.actorId)?.role !== 'ADMIN') fail('ADMIN_REQUIRED', 403);
            const product = get(tx.menu().find(product => product.id === p.productId)); this.version(command, product.id, product.version);
            product.active = false; product.version = bump(product.version); tx.saveMenu(product);
            tx.saveRecipes(product.id, tx.candidates(product.id).map(recipe => ({ ...recipe, active: false }))); return product;
        });
    }
    async inventory(actorId: string) {
        return this.repository.read(tx => { requirePermission(tx, actorId, 'inventory.read'); return tx.lots(); });
    }
    async recommendInventory(actorId: string, snapshot?: Pick<Lot, 'id' | 'ingredientId' | 'remaining' | 'reserved' | 'version'>[]) {
        return this.repository.read(tx => {
            requirePermission(tx, actorId, 'inventory.read'); const now = this.clock();
            const lots = tx.lots();
            if (snapshot) {
                const observed = new Map(snapshot.map(row => [row.id, row]));
                if (observed.size !== lots.length || snapshot.length !== lots.length || lots.some(lot => {
                    const row = observed.get(lot.id);
                    return !row || row.ingredientId !== lot.ingredientId || row.remaining !== lot.remaining ||
                        row.reserved !== lot.reserved || row.version !== lot.version;
                })) fail('STALE_PROPOSAL');
            }
            return tx.ingredients().filter(i => i.active).sort((a, b) => a.id < b.id ? -1 : 1).map(ingredient => {
                const eligible = rankEligibleBatches(lots.filter(lot => lot.ingredientId === ingredient.id), now);
                const available = eligible.reduce((sum, lot) => sum + scaled(lot.remaining) - scaled(lot.reserved), 0n);
                if (available < 0n) fail('BALANCE_CONFLICT');
                const min = scaled(ingredient.minStock ?? '0'); const target = scaled(ingredient.targetStock ?? ingredient.minStock ?? '0');
                if (target < min) fail('INVALID_STOCK_POLICY', 400);
                return { ingredientId: ingredient.id, baseUnit: ingredient.baseUnit, available: format(available), minStock: format(min), targetStock: format(target), recommendedBaseQuantity: format(available < min && target > available ? target - available : 0n), sourceVersion: ingredient.version };
            });
        });
    }
    async recipes(actorId: string, productId: string) { return this.repository.read(tx => { requirePermission(tx, actorId, 'inventory.read'); return tx.candidates(productId); }); }
    async purchaseQuotes(actorId: string, supplierId: string) { return this.repository.read(tx => { requirePermission(tx, actorId, 'purchase.write'); return tx.ingredients().map(i => tx.quote(supplierId, i.id)).filter(quote => quote?.active); }); }
    async authorize(actorId: string, permission: string) { return this.repository.read(tx => requirePermission(tx, actorId, permission)); }
    async sourceVersions(actorId: string, proposals: { supplierId: string; lines: { ingredientId: string }[] }[]) {
        return this.repository.read(tx => {
            requirePermission(tx, actorId, 'inventory.read');
            const result: Record<string, string> = Object.fromEntries(tx.lots().map(lot => [lot.id, lot.version]));
            for (const proposal of proposals) for (const line of proposal.lines) {
                result[JSON.stringify(['ingredient', line.ingredientId])] = get(tx.ingredient(line.ingredientId)).version;
                result[JSON.stringify(['quote', proposal.supplierId, line.ingredientId])] = get(tx.quote(proposal.supplierId, line.ingredientId)).version;
            }
            return result;
        });
    }
    private sourceVersion(tx: BusinessTransaction, key: string): string | undefined {
        if (!key.startsWith('[')) return tx.lots().find(lot => lot.id === key)?.version;
        try {
            const source = JSON.parse(key);
            if (Array.isArray(source) && source.every(v => typeof v === 'string')) {
                if (source.length === 2 && source[0] === 'ingredient') return tx.ingredient(source[1])?.version;
                if (source.length === 3 && source[0] === 'quote') return tx.quote(source[1], source[2])?.version;
            }
        } catch { /* Invalid source guard never grants authority. */ }
        return undefined;
    }
    async recipe(actorId: string, input: OrderLineInput) {
        return this.repository.read(tx => { requirePermission(tx, actorId, 'inventory.read'); try { return calculateComponents(tx.candidates(input.productId), input.servings, input.omitted, input.effects, this.clock()); } catch { return fail('INVALID_RECIPE', 400); } });
    }
    async getOrder(actorId: string, id: string) { return this.repository.read(tx => { requirePermission(tx, actorId, 'order.write'); return get(tx.order(id)); }); }
    async getPurchase(actorId: string, id: string) { return this.repository.read(tx => { requirePermission(tx, actorId, 'purchase.write'); return get(tx.purchase(id)); }); }
    async getPayment(actorId: string, id: string) { return this.repository.read(tx => { requirePermission(tx, actorId, 'payment.write'); return get(tx.payment(id)); }); }
    editIngredient(c: Command, input: { ingredientId: string; name: string }) {
        return this.command(c, 'ingredient.edit', 'inventory.write', input, (tx, _now, input, c) => {
            const ingredient = get(tx.ingredient(input.ingredientId)); this.version(c, ingredient.id, ingredient.version);
            if (!input.name.trim() || input.name.length > 200) fail('INVALID_NAME', 400);
            ingredient.name = input.name; ingredient.version = bump(ingredient.version); tx.saveIngredient(ingredient); return ingredient;
        });
    }
    createOrder(c: Command, input: (OrderLineInput & { amount: string }) | { items: OrderLineInput[]; amount: string }) {
        return this.command(c, 'order.create', 'order.write', input, (tx, now, input, c) => {
            if (scaled(input.amount, 2) <= 0n) fail('POSITIVE_AMOUNT_REQUIRED', 400);
            const lines = 'items' in input ? input.items : [input];
            if (!lines.length || lines.length > 100) fail('INVALID_ORDER_LINES', 400);
            const items = lines.map(line => {
                try { return { id: tx.nextId('order-item'), productId: line.productId, status: 'PENDING' as const, ...calculateComponents(tx.candidates(line.productId), line.servings, line.omitted, line.effects, now) }; }
                catch { return fail('INVALID_RECIPE', 400); }
            });
            const order: Sale = { id: tx.nextId('order'), version: '1', amount: format(scaled(input.amount, 2), 2), status: 'PENDING', snapshot: items[0]!.snapshot, items, allocations: [], costs: [], componentCosts: [], costAdjustments: [], costTotal: null, remakes: [], losses: [] };
            this.reserve(tx, order, now); tx.saveOrder(order); return order;
        });
    }
    private reserve(tx: BusinessTransaction, order: Sale, now: Date, itemIds = order.items.map(item => item.id)): void {
        for (const item of order.items.filter(item => itemIds.includes(item.id))) for (const requirement of item.components) {
            if (scaled(requirement.quantity) === 0n) continue;
            let plan: ReturnType<typeof planReservation>;
            try { plan = planReservation(requirement.ingredientId, requirement.quantity, tx.lots().filter(b => b.ingredientId === requirement.ingredientId), now); }
            catch { return fail('INSUFFICIENT_STOCK'); }
            for (const allocation of plan) {
                const lot = get(tx.lots().find(b => b.id === allocation.batchId));
                lot.reserved = add(lot.reserved, allocation.quantity); lot.version = bump(lot.version); tx.saveLot(lot);
                const id = tx.nextId('allocation'); order.allocations.push({ id, itemId: item.id, componentId: requirement.id, ...allocation, terminal: 'RESERVED' });
                tx.event({ id, type: 'RESERVE', orderId: order.id, itemId: item.id, componentId: requirement.id, batchId: lot.id, quantity: allocation.quantity });
            }
        }
    }
    private terminal(tx: BusinessTransaction, order: Sale, consume: boolean, itemIds = order.items.map(item => item.id)): void {
        const previousCount = order.componentCosts.length;
        for (const allocation of order.allocations.filter(a => a.terminal === 'RESERVED' && itemIds.includes(a.itemId))) {
            const lot = get(tx.lots().find(b => b.id === allocation.batchId));
            if (scaled(lot.reserved) < scaled(allocation.quantity) || scaled(lot.remaining) < scaled(allocation.quantity)) fail('BALANCE_CONFLICT');
            lot.reserved = add(lot.reserved, allocation.quantity, -1n);
            if (consume) {
                lot.remaining = add(lot.remaining, allocation.quantity, -1n);
                order.costs.push({ ingredientId: lot.ingredientId, batchId: lot.id, quantity: allocation.quantity, unitCost: lot.unitCost });
                order.costTotal = ingredientCost(order.costs).total;
                order.componentCosts.push({ allocationId: allocation.id, itemId: allocation.itemId, componentId: allocation.componentId, ingredientId: lot.ingredientId, batchId: lot.id, quantity: allocation.quantity, unitCost: lot.unitCost, exact: null, attributedCost: null });
            }
            lot.version = bump(lot.version); tx.saveLot(lot); allocation.terminal = consume ? 'CONSUMED' : 'RELEASED';
            tx.event({ id: tx.nextId('event'), type: allocation.terminal, sourceAllocationId: allocation.id, orderId: order.id, batchId: lot.id, quantity: allocation.quantity });
        }
        if (consume) {
            const previous = order.componentCosts.slice(0, previousCount);
            const frozenCents = previous.reduce((sum, cost) => sum + (cost.attributedCost === null ? 0n : scaled(cost.attributedCost, 2)), 0n);
            const target = order.costTotal === null ? undefined : format(scaled(order.costTotal, 2) - frozenCents, 2);
            order.componentCosts = [...previous, ...attributeComponentCosts(order.componentCosts.slice(previousCount), target)];
        }
    }
    private loss(order: Sale, itemIds: string[], type: 'REMAKE' | 'CANCELLED_AFTER_PREP', reason: string): void {
        const already = new Set(order.losses.flatMap(loss => loss.allocationIds));
        for (const itemId of itemIds) {
            const sources = order.componentCosts.filter(cost => cost.itemId === itemId && !already.has(cost.allocationId));
            if (sources.length) order.losses.push({ itemId, type, reason, allocationIds: sources.map(cost => cost.allocationId), costTotal: sources.some(cost => cost.attributedCost === null) ? null : format(sources.reduce((sum, cost) => sum + scaled(cost.attributedCost!, 2), 0n), 2) });
        }
    }
    private selectedItems(order: Sale, itemIds: string[] | undefined, states: string[]) {
        if (itemIds) unique(itemIds);
        const selected = order.items.filter(item => itemIds ? itemIds.includes(item.id) : states.includes(item.status));
        if (!selected.length || (itemIds && selected.length !== itemIds.length) || selected.some(item => !states.includes(item.status))) fail('INVALID_ORDER_STATE');
        return selected;
    }
    private refreshOrderStatus(order: Sale): void {
        const active = order.items.filter(item => item.status !== 'CANCELLED');
        order.status = !active.length ? 'CANCELLED' : active.every(item => item.status === 'COMPLETED') ? 'COMPLETED' : active.some(item => item.status !== 'PENDING') ? 'PREPARING' : 'PENDING';
    }
    remakeOrder(c: Command, input: { orderId: string; reason: string; itemIds?: string[] }) {
        return this.command(c, 'order.remake', 'order.write', input, (tx, now, input, c) => {
            const order = get(tx.order(input.orderId)); this.version(c, order.id, order.version);
            if (order.status !== 'PREPARING' || !input.reason.trim()) fail('INVALID_REMAKE');
            const ids = this.selectedItems(order, input.itemIds, ['PREPARING']).map(item => item.id);
            this.loss(order, ids, 'REMAKE', input.reason);
            this.reserve(tx, order, now, ids); this.terminal(tx, order, true, ids); order.remakes.push({ reason: input.reason, previousVersion: order.version }); order.version = bump(order.version); tx.saveOrder(order); return order;
        });
    }
    transitionOrder(c: Command, input: { orderId: string; action: 'prepare' | 'complete' | 'cancel'; itemIds?: string[]; reason?: string }) {
        return this.command(c, 'order.' + input.action, 'order.write', input, (tx, now, input, c) => {
            const order = get(tx.order(input.orderId)); this.version(c, order.id, order.version);
            if (input.action === 'prepare') {
                const items = this.selectedItems(order, input.itemIds, ['PENDING']); const ids = items.map(item => item.id);
                // Replace the selected items' reservations atomically; never consume expired lots.
                this.terminal(tx, order, false, ids); this.reserve(tx, order, now, ids); this.terminal(tx, order, true, ids); items.forEach(item => { item.status = 'PREPARING'; });
            } else if (input.action === 'complete') {
                this.selectedItems(order, input.itemIds, ['PREPARING']).forEach(item => { item.status = 'COMPLETED'; });
            } else if (input.action === 'cancel') {
                const items = this.selectedItems(order, input.itemIds, ['PENDING', 'PREPARING']); const ids = items.map(item => item.id);
                this.loss(order, ids, 'CANCELLED_AFTER_PREP', input.reason ?? 'CANCELLED_AFTER_PREPARATION');
                this.terminal(tx, order, false, ids); items.forEach(item => { item.status = 'CANCELLED'; }); // Refunds stay separate.
            } else fail('INVALID_ACTION', 400);
            this.refreshOrderStatus(order);
            order.version = bump(order.version); tx.saveOrder(order); return order;
        });
    }
    private receiptPayable(purchase: Purchase, receipt: Receipt, extra?: { lineId: string; quantity: string }): bigint {
        const corrections = extra ? [...receipt.corrections, extra] : receipt.corrections;
        const costs = receipt.lines.map(line => {
            const corrected = corrections.filter(c => c.lineId === line.id).reduce((sum, c) => sum + scaled(c.quantity), 0n);
            const remaining = scaled(line.quantity) - corrected; if (remaining < 0n) fail('INVALID_CORRECTION_QUANTITY');
            return { quantity: format(remaining), unitCost: get(purchase.lines.find(p => p.ingredientId === line.ingredientId)).unitCost };
        });
        return scaled(ingredientCost(costs).total!, 2);
    }
    private purchaseBalance(tx: BusinessTransaction, purchase: Purchase) {
        const receipts = tx.listReceipts().filter(r => r.purchaseId === purchase.id && r.status === 'CONFIRMED');
        let payable = 0n;
        for (const receipt of receipts) {
            payable += this.receiptPayable(purchase, receipt);
        }
        const paid = (purchase.settlements ?? []).reduce((sum, p) => sum + scaled(p.amount, 2) * (p.kind === 'SUPPLIER_REFUND' || p.kind === 'CREDIT_OUT' ? -1n : 1n), 0n);
        return { id: purchase.id, supplierId: purchase.supplierId, payable: format(payable, 2), paid: format(paid, 2), balance: format(payable - paid, 2), supplierCredit: format(paid > payable ? paid - payable : 0n, 2) };
    }
    resolveSupplierCredit(c: Command, input: { purchaseId: string; amount: string; reason: string; targetPurchaseId?: string }) {
        return this.command(c, 'purchase.credit', 'purchase.approve', input, (tx, now, p, command) => {
            const source = get(tx.purchase(p.purchaseId)); this.version(command, source.id, source.version);
            const balance = this.purchaseBalance(tx, source); const amount = scaled(p.amount, 2);
            if (!p.reason.trim() || amount <= 0n || amount > scaled(balance.supplierCredit, 2)) fail('INVALID_SUPPLIER_CREDIT', 400);
            const target = p.targetPurchaseId ? get(tx.purchase(p.targetPurchaseId)) : undefined;
            if (target) {
                this.version(command, target.id, target.version);
                const due = this.purchaseBalance(tx, target).balance;
                if (target.id === source.id || target.supplierId !== source.supplierId || due.startsWith('-') || amount > scaled(due, 2)) fail('INVALID_CREDIT_TRANSFER', 400);
            }
            const id = tx.nextId('supplier-credit'); const entry = { id, amount: format(amount, 2), reason: p.reason, recordedAt: now.toISOString() };
            source.settlements ??= []; source.settlements.push({ ...entry, kind: target ? 'CREDIT_OUT' : 'SUPPLIER_REFUND', ...(target ? { relatedPurchaseId: target.id } : {}) });
            source.version = bump(source.version); tx.savePurchase(source);
            if (target) {
                target.settlements ??= []; target.settlements.push({ ...entry, kind: 'CREDIT_IN', relatedPurchaseId: source.id });
                target.version = bump(target.version); tx.savePurchase(target);
            }
            return { source, sourceBalance: this.purchaseBalance(tx, source), target: target ?? null, targetBalance: target ? this.purchaseBalance(tx, target) : null };
        });
    }
    settlePurchase(c: Command, input: { purchaseId: string; amount: string; reason: string }) {
        return this.command(c, 'purchase.settle', 'purchase.approve', input, (tx, now, p, command) => {
            if (tx.principal(command.actorId)?.role !== 'ADMIN') fail('ADMIN_REQUIRED', 403);
            const purchase = get(tx.purchase(p.purchaseId)); this.version(command, purchase.id, purchase.version);
            const balance = this.purchaseBalance(tx, purchase); const amount = scaled(p.amount, 2);
            if (amount <= 0n || balance.balance.startsWith('-') || amount > scaled(balance.balance, 2) || !p.reason.trim()) fail('INVALID_SUPPLIER_PAYMENT', 400);
            purchase.settlements ??= []; purchase.settlements.push({ id: tx.nextId('supplier-payment'), amount: format(amount, 2), reason: p.reason, recordedAt: now.toISOString() });
            purchase.version = bump(purchase.version); tx.savePurchase(purchase); return { purchase, balance: this.purchaseBalance(tx, purchase) };
        });
    }
    async purchaseReceipt(c: Command, input: Parameters<BusinessWorkflows['createPurchase']>[1]) {
        const identity = operationIdentity({ type: 'purchase.create', scope: c.scope, callerKey: c.key, actorId: c.actorId, versions: c.versions, payload: input });
        return this.repository.read(tx => {
            requirePermission(tx, c.actorId, 'purchase.write');
            const receipt = tx.operation(identity.key);
            if (!receipt || receipt.actorId !== c.actorId || receipt.requestHash !== identity.requestHash ||
                receipt.canonicalVersion !== '1' || receipt.resultVersion !== '1') return undefined;
            if (receipt.response.status === 200) {
                const id = (receipt.response.body as Partial<Purchase> | null)?.id;
                if (typeof id !== 'string' || tx.purchase(id)?.supplierId !== input.supplierId) return undefined;
            }
            return { key: identity.key, requestHash: identity.requestHash, response: receipt.response };
        });
    }
    createPurchase(c: Command, input: { supplierId: string; lines: { ingredientId: string; quantity: string; unitCost: string }[] }) {
        return this.command(c, 'purchase.create', 'purchase.write', input, (tx, _now, input, c) => {
            for (const [id, version] of Object.entries(c.versions)) {
                if (this.sourceVersion(tx, id) !== version) fail('STALE_SOURCE');
            }
            unique(input.lines.map(l => l.ingredientId)); if (!input.supplierId.trim()) fail('INVALID_SUPPLIER', 400);
            const lines = input.lines.map(line => {
                const ingredient = get(tx.ingredient(line.ingredientId)); if (!ingredient.active) fail('INACTIVE_INGREDIENT', 400);
                try { normalizeIngredientQuantity(line.quantity, ingredient.baseUnit, ingredient.baseUnit); } catch { fail('INVALID_QUANTITY', 400); }
                if (scaled(line.quantity) <= 0n || scaled(line.unitCost, 4) < 0n) fail('INVALID_PURCHASE', 400);
                const quote = get(tx.quote(input.supplierId, line.ingredientId));
                if (!quote.active || scaled(quote.conversionQuantity) <= 0n || scaled(line.quantity) % scaled(quote.conversionQuantity) !== 0n) fail('WHOLE_PURCHASE_PACKS_REQUIRED', 400);
                return { ...line, received: '0', conversionQuantity: quote.conversionQuantity, purchaseUnit: quote.purchaseUnit, quoteVersion: quote.version, packs: (scaled(line.quantity) / scaled(quote.conversionQuantity)).toString() };
            });
            const purchase: Purchase = { id: tx.nextId('purchase'), supplierId: input.supplierId, status: 'OPEN', version: '1', lines };
            tx.savePurchase(purchase); return purchase;
        });
    }
    private draftReceipt(tx: BusinessTransaction, input: ReceiptInput): Receipt {
        get(tx.purchase(input.purchaseId)); if (!input.lines.length) fail('INVALID_LINES', 400);
        return { id: tx.nextId('receipt'), purchaseId: input.purchaseId, version: '1', status: 'DRAFT', revisions: [], corrections: [], lines: input.lines.map(line => {
            const item = get(tx.purchase(input.purchaseId)?.lines.find(l => l.ingredientId === line.ingredientId));
            const ingredient = get(tx.ingredient(line.ingredientId));
            try { normalizeIngredientQuantity(line.quantity, ingredient.baseUnit, ingredient.baseUnit); } catch { fail('INVALID_QUANTITY', 400); }
            if (!Number.isFinite(Date.parse(line.expirationDate))) fail('INVALID_EXPIRY', 400);
            return { ...line, id: tx.nextId('receipt-line'), batchId: null, packNumerator: scaled(line.quantity).toString(), packDenominator: scaled(item.conversionQuantity).toString() };
        }) };
    }
    private confirmReceiptInTransaction(tx: BusinessTransaction, receipt: Receipt, purchase: Purchase, now: Date): Receipt {
        if (receipt.status !== 'DRAFT' || purchase.status !== 'OPEN') fail('INVALID_RECEIPT_STATE');
        for (const line of receipt.lines) {
            const item = get(purchase.lines.find(l => l.ingredientId === line.ingredientId)); const expirationDate = new Date(line.expirationDate);
            if (expirationDate <= now || scaled(item.received) + scaled(line.quantity) > scaled(item.quantity)) fail('INVALID_RECEIPT', 400);
            const lot: Lot = { id: tx.nextId('batch'), ingredientId: line.ingredientId, remaining: line.quantity, reserved: '0', version: '1', unitCost: item.unitCost, expirationDate, receivedAt: now };
            tx.saveLot(lot); item.received = add(item.received, line.quantity); line.batchId = lot.id;
            tx.event({ id: tx.nextId('event'), type: 'IMPORT', batchId: lot.id, receiptId: receipt.id, receiptLineId: line.id, quantity: line.quantity });
        }
        purchase.status = purchase.lines.every(l => scaled(l.received) === scaled(l.quantity)) ? 'RECEIVED' : 'OPEN'; purchase.version = bump(purchase.version);
        receipt.status = 'CONFIRMED'; receipt.version = bump(receipt.version); tx.saveReceipt(receipt); tx.savePurchase(purchase); return receipt;
    }
    createReceiptDraft(c: Command, input: ReceiptInput) {
        return this.command(c, 'receipt.draft', 'purchase.write', input, (tx, _now, input) => { const receipt = this.draftReceipt(tx, input); tx.saveReceipt(receipt); return receipt; });
    }
    editReceiptDraft(c: Command, input: ReceiptInput & { receiptId: string }) {
        return this.command(c, 'receipt.edit', 'purchase.write', input, (tx, _now, input, c) => {
            const receipt = get(tx.receipt(input.receiptId)); this.version(c, receipt.id, receipt.version);
            if (receipt.status !== 'DRAFT' || receipt.purchaseId !== input.purchaseId) fail('INVALID_RECEIPT_STATE');
            const draft = this.draftReceipt(tx, input); receipt.revisions.push({ version: receipt.version, lines: receipt.lines }); receipt.lines = draft.lines; receipt.version = bump(receipt.version); tx.saveReceipt(receipt); return receipt;
        });
    }
    confirmReceipt(c: Command, input: { receiptId: string }) {
        return this.command(c, 'receipt.confirm', 'purchase.write', input, (tx, now, input, c) => {
            const receipt = get(tx.receipt(input.receiptId)); this.version(c, receipt.id, receipt.version);
            const purchase = get(tx.purchase(receipt.purchaseId)); this.version(c, purchase.id, purchase.version); return this.confirmReceiptInTransaction(tx, receipt, purchase, now);
        });
    }
    receive(c: Command, input: ReceiptInput) {
        return this.command(c, 'purchase.receive', 'purchase.write', input, (tx, now, input, c) => {
            const purchase = get(tx.purchase(input.purchaseId)); this.version(c, purchase.id, purchase.version);
            return this.confirmReceiptInTransaction(tx, this.draftReceipt(tx, input), purchase, now);
        });
    }
    correctReceipt(c: Command, input: { receiptId: string; lineId: string; quantity: string; reason: string; disposition?: 'RETURN_AVAILABLE' | 'RETURN_AND_CREDIT_CONSUMED' }) {
        return this.command(c, 'receipt.correct', 'purchase.write', input, (tx, _now, input, c) => {
            const receipt = get(tx.receipt(input.receiptId)); this.version(c, receipt.id, receipt.version);
            if (receipt.status !== 'CONFIRMED' || !input.reason.trim()) fail('INVALID_CORRECTION');
            const line = get(receipt.lines.find(l => l.id === input.lineId)); const lot = get(tx.lots().find(l => l.id === line.batchId));
            const purchase = get(tx.purchase(receipt.purchaseId)); this.version(c, purchase.id, purchase.version);
            const item = get(purchase.lines.find(l => l.ingredientId === line.ingredientId)); const quantity = scaled(input.quantity);
            const prior = receipt.corrections.filter(v => v.lineId === line.id).reduce((sum, v) => sum + scaled(v.quantity), 0n);
            if (quantity <= 0n || quantity + prior > scaled(line.quantity)) fail('INVALID_CORRECTION_QUANTITY');
            const available = scaled(lot.remaining) - scaled(lot.reserved);
            const physical = available < quantity ? available : quantity; let consumed = quantity - physical;
            if (consumed > 0n && input.disposition !== 'RETURN_AND_CREDIT_CONSUMED') fail('CORRECTION_REQUIRES_AVAILABLE_ORIGINAL_STOCK');
            const ingredient = get(tx.ingredient(line.ingredientId)); try { normalizeIngredientQuantity(input.quantity, ingredient.baseUnit, ingredient.baseUnit); } catch { fail('INVALID_QUANTITY', 400); }
            const correctionId = tx.nextId('correction');
            const allocations: { orderId: string; allocationId: string; quantity: string; credit: string }[] = [];
            for (const order of tx.ordersForBatch(lot.id).sort((a, b) => a.id < b.id ? -1 : 1)) {
                for (const source of order.componentCosts.filter(cost => cost.batchId === lot.id)) {
                    if (consumed === 0n) break;
                    const used = receipt.corrections.flatMap(correction => correction.allocations).filter(a => a.allocationId === source.allocationId).reduce((sum, a) => sum + scaled(a.quantity), 0n);
                    const capacity = scaled(source.quantity) - used; const take = consumed < capacity ? consumed : capacity;
                    if (take > 0n) { allocations.push({ orderId: order.id, allocationId: source.allocationId, quantity: format(take), credit: '0' }); consumed -= take; }
                }
            }
            if (consumed !== 0n) fail('CORRECTION_SOURCE_CONFLICT');
            const credits = attributeComponentCosts([{ quantity: format(physical), unitCost: item.unitCost }, ...allocations.map(a => ({ quantity: a.quantity, unitCost: item.unitCost }))]);
            allocations.forEach((allocation, index) => { allocation.credit = credits[index + 1]!.attributedCost!; });
            for (const orderId of new Set(allocations.map(a => a.orderId))) {
                const order = get(tx.order(orderId));
                for (const allocation of allocations.filter(a => a.orderId === orderId)) order.costAdjustments.push({ correctionId, allocationId: allocation.allocationId, amount: '-' + allocation.credit });
                order.version = bump(order.version); tx.saveOrder(order);
            }
            if (physical > 0n) { lot.remaining = format(scaled(lot.remaining) - physical); lot.version = bump(lot.version); tx.saveLot(lot); }
            item.received = add(item.received, input.quantity, -1n); purchase.status = 'OPEN'; purchase.version = bump(purchase.version); tx.savePurchase(purchase);
            const cost = format(this.receiptPayable(purchase, receipt) - this.receiptPayable(purchase, receipt, { lineId: line.id, quantity: input.quantity }), 2);
            const correction = { id: correctionId, lineId: line.id, quantity: input.quantity, reason: input.reason, payableDelta: '-' + cost, physicalQuantity: format(physical), consumedQuantity: format(quantity - physical), allocations };
            receipt.corrections.push(correction); receipt.version = bump(receipt.version); tx.saveReceipt(receipt);
            if (physical > 0n) tx.event({ id: tx.nextId('event'), type: 'RETURN', receiptId: receipt.id, receiptLineId: line.id, correctionId: correction.id, batchId: lot.id, quantity: format(physical) }); return receipt;
        });
    }
    createCount(c: Command, input: { lines: { batchId: string; actual: string }[] }) {
        return this.command(c, 'count.create', 'count.write', input, (tx, _now, input, c) => {
            unique(input.lines.map(l => l.batchId));
            const count = { id: tx.nextId('count'), actorId: c.actorId, status: 'DRAFT' as const, lines: input.lines.map(line => {
                const lot = get(tx.lots().find(l => l.id === line.batchId)); scaled(line.actual);
                if (scaled(line.actual) > 0n) { const ingredient = get(tx.ingredient(lot.ingredientId)); try { normalizeIngredientQuantity(line.actual, ingredient.baseUnit, ingredient.baseUnit); } catch { fail('INVALID_QUANTITY', 400); } }
                return { ...line, version: lot.version, physical: lot.remaining, reserved: lot.reserved, variance: format(scaled(line.actual) - scaled(lot.remaining)) };
            }) }; tx.saveCount(count); return count;
        });
    }
    submitCount(c: Command, input: { countId: string }) {
        return this.command(c, 'count.submit', 'count.write', input, (tx, _now, input, c) => { const count = get(tx.count(input.countId)); if (count.status !== 'DRAFT') fail('INVALID_COUNT_STATE'); count.status = 'SUBMITTED'; tx.saveCount(count); return count; });
    }
    editCount(c: Command, input: { countId: string; lines: { batchId: string; actual: string }[] }) {
        return this.command(c, 'count.edit', 'count.write', input, (tx, _now, input, c) => {
            const count = get(tx.count(input.countId)); if (count.status !== 'DRAFT') fail('INVALID_COUNT_STATE'); unique(input.lines.map(l => l.batchId));
            count.lines = input.lines.map(line => {
                const lot = get(tx.lots().find(l => l.id === line.batchId)); const ingredient = get(tx.ingredient(lot.ingredientId));
                if (scaled(line.actual) > 0n) { try { normalizeIngredientQuantity(line.actual, ingredient.baseUnit, ingredient.baseUnit); } catch { fail('INVALID_QUANTITY', 400); } }
                return { ...line, version: lot.version, physical: lot.remaining, reserved: lot.reserved, variance: format(scaled(line.actual) - scaled(lot.remaining)) };
            }); tx.saveCount(count); return count;
        });
    }
    approveCount(c: Command, input: { countId: string; selfApprovalReason: string }) {
        return this.command(c, 'count.approve', 'count.approve', input, (tx, _now, input, c) => {
            if (tx.principal(c.actorId)?.role !== 'ADMIN') fail('ADMIN_REQUIRED', 403);
            const count = get(tx.count(input.countId)); if (count.status !== 'SUBMITTED') fail('INVALID_COUNT_STATE');
            if (count.actorId === c.actorId && !input.selfApprovalReason.trim()) fail('SELF_APPROVAL_REASON_REQUIRED', 403);
            for (const line of count.lines) {
                const lot = get(tx.lots().find(l => l.id === line.batchId));
                if (lot.version !== line.version || scaled(line.actual) < scaled(lot.reserved)) fail('COUNT_CONFLICT');
                lot.remaining = line.actual; lot.version = bump(lot.version); tx.saveLot(lot);
                if (scaled(line.actual) !== scaled(line.physical)) tx.event({ id: tx.nextId('event'), type: 'ADJUST', batchId: lot.id, countId: count.id, variance: line.variance });
            }
            count.status = 'APPROVED'; tx.saveCount(count); return count;
        });
    }
    paymentAttempt(c: Command, input: { orderId: string; account: string }) {
        return this.command(c, 'payment.attempt', 'payment.write', input, (tx, now, input, c) => {
            const order = get(tx.order(input.orderId)); if (order.status === 'CANCELLED' || !input.account.trim()) fail('INVALID_PAYMENT');
            if (tx.payments(order.id).some(p => p.status !== 'FAILED')) fail('PAYMENT_EXISTS');
            const payment = { id: tx.nextId('payment'), orderId: order.id, amount: order.amount, account: input.account, createdAt: now.toISOString(), settledAt: null, status: 'PENDING' as const, refunds: [], refundAttempts: [] };
            tx.savePayment(payment); return payment;
        });
    }
    settle(c: Command, input: { paymentId: string; account: string; eventId: string; amount: string; outcome: 'SETTLED' | 'FAILED' }) {
        return this.command(c, 'payment.settle', 'payment.callback', input, (tx, now, input, c) => {
            const p = get(tx.payment(input.paymentId));
            if (!input.eventId.trim() || p.account !== input.account || scaled(p.amount, 2) !== scaled(input.amount, 2)) fail('CALLBACK_MISMATCH');
            if (input.outcome !== 'SETTLED' && input.outcome !== 'FAILED') fail('INVALID_OUTCOME', 400);
            if (p.status !== 'PENDING' && p.status !== input.outcome) fail('PAYMENT_STATE');
            tx.callback(JSON.stringify([input.account, input.eventId]), { ...input, refundId: null, hash: JSON.stringify(input) }); p.status = input.outcome;
            if (input.outcome === 'SETTLED' && p.settledAt === null) p.settledAt = now.toISOString(); tx.savePayment(p); return p;
        });
    }
    refund(c: Command, input: { paymentId: string; amount: string }) {
        return this.command(c, 'payment.refund', 'payment.write', input, (tx, now, input, c) => {
            const p = get(tx.payment(input.paymentId)); const amount = scaled(input.amount, 2);
            if (p.status !== 'SETTLED' || p.refundAttempts.some(r => r.status === 'PENDING' || r.status === 'UNKNOWN') || amount <= 0n || p.refunds.reduce((sum, r) => sum + scaled(r.amount, 2), 0n) + amount > scaled(p.amount, 2)) fail('INVALID_REFUND');
            const id = tx.nextId('refund'); p.refunds.push({ id, amount: format(amount, 2), appliedAt: now.toISOString() }); p.refundAttempts.push({ id, amount: format(amount, 2), status: 'SUCCEEDED' });
            if (p.refunds.reduce((sum, r) => sum + scaled(r.amount, 2), 0n) === scaled(p.amount, 2)) p.status = 'REFUNDED';
            tx.savePayment(p); return p;
        });
    }
    requestRefund(c: Command, input: { paymentId: string; amount: string }) {
        return this.command(c, 'refund.request', 'payment.write', input, (tx, _now, input) => {
            const p = get(tx.payment(input.paymentId)); const amount = scaled(input.amount, 2);
            if (p.status !== 'SETTLED' || amount <= 0n || p.refundAttempts.some(r => r.status === 'PENDING' || r.status === 'UNKNOWN') || p.refunds.reduce((sum, r) => sum + scaled(r.amount, 2), 0n) + amount > scaled(p.amount, 2)) fail('INVALID_REFUND');
            const attempt = { id: tx.nextId('refund'), amount: format(amount, 2), status: 'PENDING' as const }; p.refundAttempts.push(attempt); tx.savePayment(p); return attempt;
        });
    }
    resolveRefund(c: Command, input: { paymentId: string; refundId: string; outcome: 'UNKNOWN' | 'SUCCEEDED' | 'FAILED'; eventId: string; account: string }) {
        return this.command(c, 'refund.resolve', 'payment.callback', input, (tx, now, input) => {
            const p = get(tx.payment(input.paymentId)); const attempt = get(p.refundAttempts.find(r => r.id === input.refundId));
            if (p.account !== input.account || !input.eventId.trim() || !['UNKNOWN', 'SUCCEEDED', 'FAILED'].includes(input.outcome)) fail('CALLBACK_MISMATCH');
            tx.callback(JSON.stringify([input.account, input.eventId]), { ...input, amount: attempt.amount, hash: JSON.stringify(input) });
            if (attempt.status === 'SUCCEEDED' || attempt.status === 'FAILED') { if (attempt.status !== input.outcome) fail('REFUND_TERMINAL'); return attempt; }
            attempt.status = input.outcome;
            if (input.outcome === 'SUCCEEDED') {
                p.refunds.push({ id: attempt.id, amount: attempt.amount, appliedAt: now.toISOString() });
                if (p.refunds.reduce((sum, r) => sum + scaled(r.amount, 2), 0n) === scaled(p.amount, 2)) p.status = 'REFUNDED';
            }
            tx.savePayment(p); return attempt;
        });
    }
    reconcilePayments(c: Command, input: { account: string; date: string; expectedGross: string; expectedRefunds: string }) {
        return this.command(c, 'payment.reconcile', 'payment.write', input, (tx, _now, input) => {
            if (!/^\d{4}-\d{2}-\d{2}$/.test(input.date) || !Number.isFinite(Date.parse(input.date)) || new Date(input.date).toISOString().slice(0, 10) !== input.date || !input.account.trim()) fail('INVALID_RECONCILIATION', 400);
            const rows = tx.accountPayments(input.account);
            const gross = rows.filter(p => p.settledAt?.slice(0, 10) === input.date).reduce((sum, p) => sum + scaled(p.amount, 2), 0n);
            const refunds = rows.reduce((sum, p) => sum + p.refunds.filter(r => r.appliedAt.slice(0, 10) === input.date).reduce((n, r) => n + scaled(r.amount, 2), 0n), 0n);
            const record = { id: tx.nextId('reconciliation'), ...input, actualGross: format(gross, 2), actualRefunds: format(refunds, 2), status: gross === scaled(input.expectedGross, 2) && refunds === scaled(input.expectedRefunds, 2) ? 'MATCHED' as const : 'MISMATCHED' as const };
            tx.saveReconciliation(record); return record;
        });
    }
}
