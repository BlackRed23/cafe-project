import type { ToolAuthorization, UnifiedToolRegistry } from './tool-registry';
import type { InventoryRow, PurchaseProposal, ReplenishmentPlan, SupplierQuote } from './replenishment';
import type { DynamicToolName, DynamicToolPlan, ToolChoicePolicy } from './dynamic-plan';

export type LegacyTool = 'inventory.read' | 'inventory.recommend' | 'purchase.create';
export type LegacyStep = { tool: LegacyTool; input: PurchaseProposal | null };
export type ToolName = LegacyTool | ReplenishmentPlan[number]['tool'];
export type PurchaseCommand = { actorId: string; key: string; scope: string; versions: Record<string, string> };
export type PurchaseResult = { status: number; body: unknown };
export type PurchaseReceiptProof = { key: string; requestHash: string };
export type Plan = LegacyStep[] | ReplenishmentPlan;
export interface BusinessPort extends ToolAuthorization {
    toolRegistry?: UnifiedToolRegistry;
    sourceVersions(actorId: string, proposals: PurchaseProposal[]): Promise<Record<string, string>>;
    atomic<T>(work: (business: BusinessPort, onCommit: (publish: () => void) => void, onFinish: (finish: () => void) => void) => Promise<T>): Promise<T>;
    inventory(actorId: string): Promise<InventoryRow[]>;
    recommendInventory(actorId: string, snapshot?: InventoryRow[]): Promise<unknown[]>;
    purchaseQuotes?(actorId: string, supplierId: string): Promise<(SupplierQuote | undefined)[]>;
    createPurchase(command: PurchaseCommand, proposal: PurchaseProposal): Promise<PurchaseResult>;
    purchaseReceipt(command: PurchaseCommand, proposal: PurchaseProposal): Promise<(PurchaseReceiptProof & { response: PurchaseResult }) | undefined>;
}
export type MemoryEvidence = { memoryId: string; executionIds: string[]; evaluationIds: string[]; tool: ToolName; relevance: number; confidence: number };
export type PlanningContext = { trust: 'untrusted-evidence-only'; evidence: MemoryEvidence[]; maxTokens: 2048 };
export type InventoryTool = 'inventory.read' | 'inventory.recommend';
export type MemoryDecisionProof = {
    kind: 'MOCK_INVENTORY_SELECTION'; stepIndex: 0; selectedTool: InventoryTool;
    alternativeTool: InventoryTool; without: 'ALL_HINTS' | 'SELECTED_HINT';
};
export type MemoryAttribution = { memoryId: string; presented?: boolean; status: 'USED' | 'UNUSED' | 'UNKNOWN'; proof?: MemoryDecisionProof };
export type PlanningEvidence = { evidence: MemoryEvidence[]; attribution?: MemoryAttribution[]; decision: Plan };

export interface LLMProvider {
    plan(
        prompt: string,
        context?: PlanningContext
    ): Promise<Plan>;

    planDynamic?(
        prompt: string,
        tools: {
            name: DynamicToolName;
            purpose: string;
        }[],
        context: { toolChoicePolicy: ToolChoicePolicy }
    ): Promise<DynamicToolPlan>;
}


export type Execution = { id: string; actorId: string; status: 'PLANNED' | 'AWAITING_APPROVAL' | 'RUNNING' | 'SUCCEEDED' | 'FAILED' | 'UNKNOWN' | 'CANCELLED'; plan: Plan; hash: string; revision: string; revisions: { revision: string; hash: string; plan: Plan }[]; versions: Record<string, string>; spent: number; reserved: number; budget: number; result: unknown[]; planning?: PlanningEvidence; outcome?: { verified: boolean; evaluationIds: string[] } };
export type Approval = { id: string; executionId: string; approverId: string; hash: string; expiresAt: string; revoked: boolean; consumed: boolean };
export type Memory = { id: string; ownerId: string; text: string; learned: boolean; confidence?: number; expiresAt?: string; revoked?: boolean; forgotten?: boolean; provenance?: { executionId: string; evaluationIds: string[]; tool: ToolName }[]; sourceIds?: string[] };
export type AgentState = { sequence: number; executions: Record<string, Execution>; approvals: Record<string, Approval>; audit: { executionId: string; tool: string; status: string; stepId?: string; attempt?: number }[]; memories: Record<string, Memory>; permissions: Record<string, string[]>;
    operations: Record<string, { hash: string; actorId: string; response: { status: number; body: unknown } }>;
    toolCalls: Record<string, {
        id: string; executionId: string; index: number; tool: ToolName; input: unknown; status: string; result: unknown;
        authorization?: { permission: string; approvalId?: string };
        purchaseCommand?: PurchaseCommand;
        receipt?: PurchaseReceiptProof;
        verifiedAt?: string;
        stepId?: string;
        attempts?: number;
    }>;
    evaluations: { id: string; executionId: string; toolCallId: string; passed: boolean; code: string }[];
};
export interface AgentExecutionRepository { execution(id: string): Promise<Execution | undefined> }
export interface AgentApprovalRepository { approve(id: string, approverId: string, expiresAt: string): Promise<Approval>; revoke(id: string, actorId: string): Promise<void> }
export interface MemoryLearning { remember(ownerId: string, text: string): Promise<Memory>; retrieve(ownerId: string, query: string): Promise<Memory[]>; learn(ownerId: string, id: string): Promise<Memory>; consolidate(ownerId: string): Promise<Memory[]>; forget(ownerId: string, id: string): Promise<void> }
export interface AgentRepository extends AgentExecutionRepository {
    atomic<T>(work: (state: AgentState) => Promise<T> | T, onCommit?: (publish: () => void) => void, onFinish?: (finish: () => void) => void): Promise<T>;
}
