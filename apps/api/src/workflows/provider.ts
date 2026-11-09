import { WorkflowRepository } from './contracts';
import { MockRepository } from './mock-repository';

export const TARGET_TABLES = ['User', 'Category', 'Product', 'Ingredient', 'IngredientBatch', 'InventoryTransaction', 'StockCount', 'StockCountItem', 'Recipe', 'RecipeIngredient', 'Topping', 'ToppingIngredient', 'Order', 'OrderItem', 'OrderItemTopping', 'Supplier', 'SupplierIngredient', 'PurchaseRequest', 'PurchaseRequestItem', 'GoodsReceipt', 'Payment', 'PaymentCallback', 'PaymentReconciliation', 'AgentExecution', 'AgentToolCall', 'AgentEvaluation', 'SystemSetting'] as const;
export const TARGET_ENUMS = ['UserRole', 'CategoryKind', 'InventoryTransactionType', 'WasteReason', 'StockCountStatus', 'OrderStatus', 'ConsumptionStatus', 'PaymentStatus', 'PaymentMethod', 'TransactionStatus', 'CallbackStatus', 'ToppingType', 'PurchaseRequestStatus', 'GoodsReceiptStatus', 'ExecutionStatus', 'ToolCallStatus'] as const;
/** No Prisma import or connection until a complete reviewed schema/adapter exists. */
export class PostgresPrismaBoundary {
    static readonly blockers = ['U1 operation history ownership', 'U2 immutable recipe/component provenance', 'U3 approvals/revisions/budgets', 'U4 receipt lines/corrections', 'U5 costs/refunds/unknown outcomes', 'U6 catalog/grants/client parity'];
    static create(): never { throw new Error('POSTGRES_NOT_VERIFIED: approved schema and real adapter unavailable'); }
}
export function createWorkflowRepository(env: Record<string, string | undefined> = process.env): WorkflowRepository {
    const selected = env.DATA_PROVIDER;
    if (env.NODE_ENV === 'production' && !selected) throw new Error('Production requires explicit DATA_PROVIDER');
    if (selected === 'postgres') return PostgresPrismaBoundary.create();
    if (selected !== undefined && selected !== 'mock') throw new Error('Invalid DATA_PROVIDER');
    if (env.NODE_ENV === 'production') throw new Error('Mock provider prohibited in production');
    return new MockRepository();
}
