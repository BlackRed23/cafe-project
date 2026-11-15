import type { RecipeInput, PlanningBatch, calculateRequirements } from '../common/inventory-core';
import type { BaseUnit } from '../common/ingredient-policy';

export type Principal = { id: string; role: 'ADMIN' | 'STAFF' | 'CUSTOMER' | 'AGENT'; permissions: string[]; active: boolean };
export type Ingredient = { id: string; name: string; baseUnit: BaseUnit; active: boolean; version: string; minStock?: string; targetStock?: string };
export type Component = { id: string; ingredientId: string; quantity: string; source: 'RECIPE' | 'TOPPING'; exact: { numerator: string; denominator: string } };
export type OrderLineInput = { productId: string; servings: string; omitted: string[]; effects: import('../common/inventory-core').AddEffect[] };
export type SaleItem = { id: string; productId: string; status: 'PENDING' | 'PREPARING' | 'COMPLETED' | 'CANCELLED'; snapshot: ReturnType<typeof calculateRequirements>; components: Component[] };
export type Allocation = { id: string; itemId: string; componentId: string; batchId: string; quantity: string; terminal: 'RESERVED' | 'RELEASED' | 'CONSUMED' };
export type ComponentCost = { allocationId: string; itemId: string; componentId: string; ingredientId: string; batchId: string; quantity: string; unitCost: string | null; exact: { numerator: string; denominator: string } | null; attributedCost: string | null };
export type Sale = { id: string; version: string; amount: string; status: 'PENDING' | 'PREPARING' | 'COMPLETED' | 'CANCELLED'; snapshot: ReturnType<typeof calculateRequirements>; items: SaleItem[]; allocations: Allocation[]; costs: { ingredientId: string; batchId: string; quantity: string; unitCost: string | null }[]; componentCosts: ComponentCost[]; costTotal: string | null; costAdjustments: { correctionId: string; allocationId: string; amount: string }[]; remakes: { reason: string; previousVersion: string }[]; losses: { itemId: string; type: 'REMAKE' | 'CANCELLED_AFTER_PREP'; reason: string; allocationIds: string[]; costTotal: string | null }[] };
export type Lot = PlanningBatch & { version: string; unitCost: string | null };
export type SupplierQuote = { supplierId: string; ingredientId: string; purchaseUnit: string; conversionQuantity: string; version: string; active: boolean };
export type Purchase = { settlements?: { id: string; amount: string; reason: string; recordedAt: string; kind?: 'PAYMENT' | 'SUPPLIER_REFUND' | 'CREDIT_OUT' | 'CREDIT_IN'; relatedPurchaseId?: string }[]; id: string; supplierId: string; status: 'OPEN' | 'RECEIVED'; version: string; lines: { ingredientId: string; quantity: string; received: string; unitCost: string; conversionQuantity: string; purchaseUnit: string; quoteVersion: string; packs: string }[] };
export type ReceiptInput = { purchaseId: string; lines: { ingredientId: string; quantity: string; expirationDate: string }[] };
export type Receipt = { id: string; purchaseId: string; version: string; status: 'DRAFT' | 'CONFIRMED'; lines: { id: string; ingredientId: string; batchId: string | null; quantity: string; expirationDate: string; packNumerator: string; packDenominator: string }[]; revisions: { version: string; lines: Receipt['lines'] }[]; corrections: { id: string; lineId: string; quantity: string; reason: string; payableDelta: string; physicalQuantity: string; consumedQuantity: string; allocations: { orderId: string; allocationId: string; quantity: string; credit: string }[] }[] };
export type Count = { id: string; actorId: string; status: 'DRAFT' | 'SUBMITTED' | 'APPROVED'; lines: { batchId: string; version: string; physical: string; reserved: string; actual: string; variance: string }[] };
export type RefundAttempt = { id: string; amount: string; status: 'PENDING' | 'UNKNOWN' | 'SUCCEEDED' | 'FAILED' };
export type Payment = { id: string; orderId: string; account: string; amount: string; createdAt: string; settledAt: string | null; status: 'PENDING' | 'SETTLED' | 'FAILED' | 'REFUNDED'; refunds: { id: string; amount: string; appliedAt: string }[]; refundAttempts: RefundAttempt[] };
export type Reconciliation = { id: string; account: string; date: string; expectedGross: string; expectedRefunds: string; actualGross: string; actualRefunds: string; status: 'MATCHED' | 'MISMATCHED' };
export type PaymentEvent = { paymentId: string; account: string; eventId: string; amount: string; outcome: string; refundId: string | null; hash: string };
export type MenuDraft = { yieldQuantity: string; ingredients: { ingredientId: string; quantity: string; unit: 'g' | 'kg' | 'ml' | 'l' | 'piece'; optional: boolean }[] };
export type MenuProduct = { id: string; name: string; price: string; version: string; active: boolean; draft: (MenuDraft & { name?: string; price?: string }) | null };
export type OperationResult = { status: number; body: unknown };
export type OperationRecord = { key: string; requestHash: string; actorId: string; canonicalVersion: string; resultVersion: string; committedAt: string; response: OperationResult };
export interface RecipeRepository { candidates(productId: string): RecipeInput[]; menu(): MenuProduct[]; saveMenu(product: MenuProduct): void; saveRecipes(productId: string, recipes: RecipeInput[]): void }
export interface InventoryRepository { ingredients(): Ingredient[]; lots(): Lot[]; saveLot(lot: Lot): void; event(event: Record<string, string>): void }
export interface OrderRepository { order(id: string): Sale | undefined; ordersForBatch(batchId: string): Sale[]; saveOrder(order: Sale): void }
export interface PurchaseRepository { quote(supplierId: string, ingredientId: string): SupplierQuote | undefined; purchase(id: string): Purchase | undefined; savePurchase(purchase: Purchase): void; receipt(id: string): Receipt | undefined; saveReceipt(receipt: Receipt): void }
export interface PaymentRepository { accountPayments(account: string): Payment[]; saveReconciliation(record: Reconciliation): void; payments(orderId: string): Payment[]; payment(id: string): Payment | undefined; savePayment(payment: Payment): void; callback(key: string, event: PaymentEvent): void }
export interface CountRepository { count(id: string): Count | undefined; saveCount(count: Count): void }
export interface OperationHistoryRepository { operation(key: string): OperationRecord | undefined; saveOperation(record: OperationRecord): void }
export interface BusinessTransaction extends RecipeRepository, InventoryRepository, OrderRepository, PurchaseRepository, PaymentRepository, CountRepository, OperationHistoryRepository {
    listOrders(): Sale[]; listPurchases(): Purchase[]; listReceipts(): Receipt[]; listCounts(): Count[];
    listPayments(): Payment[]; listReconciliations(): Reconciliation[]; inventoryEvents(): Record<string, string>[]; supplierQuotes(): SupplierQuote[];
    onCommit(publish: () => void): void;
    onFinish(finish: () => void): void;
    savepoint<T>(work: () => T): T;
    savepointAsync<T>(work: () => Promise<T>): Promise<T>;
    principal(id: string): Principal | undefined;
    ingredient(id: string): Ingredient | undefined;
    saveIngredient(ingredient: Ingredient): void;
    nextId(kind: string): string;
}
/** Adapters must commit effects and operation history in the SAME transaction. */
export interface WorkflowRepository {
    transaction<T>(work: (tx: BusinessTransaction) => Promise<T> | T): Promise<T>;
    read<T>(work: (tx: BusinessTransaction) => T): Promise<T>;
}
export class BusinessError extends Error {
    constructor(public status: number, public code: string) { super(code); }
}
/** Only adapters that can establish rollback may classify ROLLED_BACK. */
export class TransactionFailure extends Error {
    constructor(public outcome: 'ROLLED_BACK' | 'UNKNOWN', message: string) { super(message); }
}
export function requirePermission(tx: BusinessTransaction, actorId: string, permission: string): Principal {
    const actor = tx.principal(actorId);
    if (!actor?.active || !actor.permissions.includes(permission)) throw new BusinessError(403, 'FORBIDDEN');
    if (['agent.approve', 'count.approve', 'purchase.approve', 'menu.write'].includes(permission) && actor.role !== 'ADMIN') throw new BusinessError(403, 'FORBIDDEN');
    return actor;
}
