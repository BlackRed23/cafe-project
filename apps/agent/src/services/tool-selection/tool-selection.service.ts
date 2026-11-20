import { createHash } from 'node:crypto';
import { TOOL_CONTRACTS, type P1ToolName } from '../../workflows/tool-contracts';
import type { UnifiedToolRegistry } from '../../workflows/tool-registry';
import { planningResultSchema, type PlanningResult } from '../planning/planning.schema';
import {
    TOOL_SELECTION_VERSION, toolSelectionInputSchema, toolSelectionDecisionSchema,
    type ToolInformation, type ToolSelectionInput, type ToolSelectionDecision
} from './tool-selection.schema';

type ReadOnlyTool = Exclude<P1ToolName, 'createDraftPurchaseRequest'>;
type ToolChoice = ReadOnlyTool | null;
export type ToolSelectionAuthorization = (actorId: string, permission: string) => Promise<unknown>;

const objectiveTools: Record<ToolSelectionInput['objective'], ReadOnlyTool | null> = {
    INVENTORY: 'getIngredientAvailability',
    EXPIRY: 'getIngredientBatches',
    CONSUMPTION: 'getSalesHistory',
    STOCKTAKE: 'getStocktakeStatus',
    INBOUND: 'getInboundPurchaseOrder',
    SUPPLIER: 'findIngredientSuppliers',
    REORDER: 'calculateReorderQuantity',
    EXPLICIT: null
};
const objectiveEvidence: Record<ToolSelectionInput['objective'], ToolInformation> = {
    INVENTORY: 'STOCK', EXPIRY: 'LOTS', CONSUMPTION: 'SALES',
    STOCKTAKE: 'STOCKTAKE', INBOUND: 'INBOUND', SUPPLIER: 'SUPPLIERS',
    REORDER: 'REORDER_INPUT', EXPLICIT: 'STOCK'
};
const infoToTool: Partial<Record<ToolInformation, ReadOnlyTool>> = {
    STOCK: 'getIngredientAvailability', LOTS: 'getIngredientBatches',
    SALES: 'getSalesHistory', STOCKTAKE: 'getStocktakeStatus',
    INBOUND: 'getInboundPurchaseOrder', SUPPLIERS: 'findIngredientSuppliers',
    REORDER_INPUT: 'calculateReorderQuantity', PRICE: 'estimatePurchaseCost'
};
const requiredFields = (tool: ReadOnlyTool): string[] => {
    switch (tool) {
        case 'getSalesHistory': return ['productId', 'from', 'to'];
        case 'estimatePurchaseCost': return ['ingredientId', 'supplierId', 'quantityBase'];
        case 'getRecipeRequirements': return ['productId'];
        case 'getStocktakeStatus': return ['stocktakeId', 'ingredientId'];
        case 'getInboundPurchaseOrder': return ['purchaseOrderId', 'ingredientId'];
        default: return ['ingredientId'];
    }
};
const validToken = (tool: string): tool is P1ToolName =>
    Object.prototype.hasOwnProperty.call(TOOL_CONTRACTS, tool);

/**
 * Pure selection decision + current permission check; does NOT call registry.dispatch.
 * Caller must bind actorId to its authenticated principal and REAUTHORIZE at dispatch.
 * Returned data is safe for audit: no provider text, tokens, input values or raw tool payloads.
 */
export async function selectToolForTask(
    raw: unknown, registry: UnifiedToolRegistry, authorize: ToolSelectionAuthorization
): Promise<ToolSelectionDecision> {
    const parsed = toolSelectionInputSchema.safeParse(raw);
    if (!parsed.success) throw new Error('TOOL_INPUT_REJECTED');
    const input = parsed.data;
    const make = (status: ToolSelectionDecision['status'], reason: ToolSelectionDecision['selectionReason'],
        choice: ToolChoice = null, missing: string[] = [], alternatives: string[] = []): ToolSelectionDecision => {
        const reasonForTrace = [input.version, input.actorId, input.objective, input.dependencyIds.join(','),
            choice || 'none', reason, String(input.recoveryCount)].join(':');
        const traceId = createHash('sha256').update(reasonForTrace).digest('hex').slice(0, 32);
        return toolSelectionDecisionSchema.parse({
            version: TOOL_SELECTION_VERSION, status, selectedTool: choice,
            selectionReason: reason, requiredInputs: choice ? requiredFields(choice) : [],
            dependencyIds: input.dependencyIds,
            validationStatus: status === 'SELECTED' ? 'VALID' :
                ['DENIED', 'NEEDS_INFORMATION'].includes(status) ? 'INVALID' : 'NOT_CHECKED',
            deniedReason: status === 'DENIED' ? reason : null,
            missingInformation: missing, alternativeEligibleTools: alternatives,
            requiresAdditionalData: status === 'NEEDS_INFORMATION' || status === 'BLOCKED_CAPABILITY',
            requiresApproval: false, decisionTraceId: traceId,
            readOnly: true, executeCalled: false,
            evidenceLevel: registry.capabilities().some(cap => cap.mode === 'BACKEND')
                ? 'CONTRACT_SELECTION' : 'UNIT_SELECTION'
        });
    };
    const missingDeps = input.dependencyIds.filter(id => !input.completedDependencyIds.includes(id));
    if (missingDeps.length) return make('NEEDS_INFORMATION', 'DEPENDENCY_PENDING', null, missingDeps);
    if (input.previousOutcome !== 'NOT_RUN') {
        if (!input.previousTool) return make('NEEDS_INFORMATION', 'INPUT_MISSING', null, ['PREVIOUS_TOOL']);
        if (!validToken(input.previousTool)) return make('DENIED', 'UNKNOWN_TOOL');
    }
    if (input.recoveryCount >= 2 && input.previousOutcome !== 'NOT_RUN') {
        return make('DENIED', 'RECOVERY_LIMIT_REACHED');
    }
    if (input.dataQuality !== 'VERIFIED' && input.objective === 'REORDER') {
        return make('NEEDS_INFORMATION', 'DATA_QUALITY_UNVERIFIED', null, ['VERIFIED_PER_AND_BACKEND_EVIDENCE']);
    }
    let tool: ToolChoice = null;
    if (input.objective === 'EXPLICIT') {
        if (!input.requestedTool || !validToken(input.requestedTool)) {
            return make('DENIED', 'UNKNOWN_TOOL');
        }
        const c = TOOL_CONTRACTS[input.requestedTool];
        if (c.category === 'WRITE' || c.status !== 'IMPLEMENTED' || c.binding === null) {
            return make('DENIED', 'TOOL_NOT_ALLOWED');
        }
        tool = input.requestedTool as ReadOnlyTool;
    } else {
        tool = objectiveTools[input.objective];
        if (input.requestedTool && input.requestedTool !== tool) {
            return make('DENIED', validToken(input.requestedTool) ? 'TOOL_NOT_ALLOWED' : 'UNKNOWN_TOOL');
        }
    }
    // A previous aggregate stock lookup cannot prove batch eligibility or expiry.
    if (input.previousOutcome === 'INSUFFICIENT_DATA' &&
        input.previousTool === 'getIngredientAvailability' &&
        input.requiredInformation.includes('LOTS')) {
        tool = 'getIngredientBatches';
    } else if (input.previousOutcome === 'INVALID_OUTPUT' || input.previousOutcome === 'TIMEOUT') {
        // Selecting again is not proof a timed-out tool executed or was recovered.
        return make('NEEDS_INFORMATION', 'INPUT_MISSING', null, ['SAFE_MANUAL_REVIEW']);
    }
    const need = input.requiredInformation.length ? input.requiredInformation : [objectiveEvidence[input.objective]];
    if (!tool) return make('BLOCKED_CAPABILITY', 'REGISTRY_CAPABILITY_UNAVAILABLE', null, need);
    if (need.every(key => input.availableInformation.includes(key)) && input.previousOutcome === 'NOT_RUN' &&
        input.objective !== 'EXPLICIT') {
        return make('NO_TOOL_REQUIRED', 'INFORMATION_ALREADY_PRESENT');
    }
    const cap = registry.capabilities().find(c => c.name === tool && c.bound);
    if (!cap || TOOL_CONTRACTS[tool].status !== 'IMPLEMENTED') {
        return make('BLOCKED_CAPABILITY', 'REGISTRY_CAPABILITY_UNAVAILABLE', null, need);
    }
    const fields = requiredFields(tool);
    const allowedFields = new Set(fields);
    if (tool === 'calculateReorderQuantity') allowedFields.add('supplierId');
    const args = Object.fromEntries(fields.filter(name => Object.prototype.hasOwnProperty.call(input.inputs, name))
        .map(name => [name, input.inputs[name as keyof typeof input.inputs]]));
    if (tool === 'calculateReorderQuantity' && input.inputs.supplierId !== undefined) {
        args.supplierId = input.inputs.supplierId;
    }
    const missing = fields.filter(name => args[name] === undefined);
    if (missing.length) return make('NEEDS_INFORMATION', 'INPUT_MISSING', null, missing);
    if (Object.keys(input.inputs).some(name => !allowedFields.has(name))) {
        return make('DENIED', 'INVALID_SCHEMA');
    }
    // Do not trust a model-generated string that merely looks like a tool call.
    if (!TOOL_CONTRACTS[tool].input.safeParse(args).success) {
        return make('DENIED', 'INVALID_SCHEMA');
    }
    // Permission check is selection-time only. Actual Registry dispatch rechecks permission.
    try {
        await authorize(input.actorId, TOOL_CONTRACTS[tool].permission);
    } catch {
        return make('DENIED', 'UNAUTHORIZED');
    }
    // Every suggested alternative must pass its OWN permission check.
    // A bound tool is not proof an actor may use that tool.
    const alternatives: ReadOnlyTool[] = [];
    for (const info of need) {
        const candidate = infoToTool[info];
        if (!candidate || candidate === tool || !registry.capabilities().some(c => c.name === candidate && c.bound)) continue;
        try {
            await authorize(input.actorId, TOOL_CONTRACTS[candidate].permission);
            alternatives.push(candidate);
        } catch { /* Keep denied capabilities private; never offer them as fallback. */ }
    }
    return make('SELECTED',
        input.previousOutcome === 'INSUFFICIENT_DATA' && tool === 'getIngredientBatches'
            ? 'SUPPLEMENTARY_LOT_READ' : 'OBJECTIVE_MATCH',
        tool, [], [...new Set(alternatives)]);
}

/** Schema-only validation after execution; never repairs a malformed quantity/JSON by guessing. */
export function verifySelectedToolOutput(tool: string, payload: unknown):
    { valid: true } | { valid: false; code: 'UNKNOWN_TOOL' | 'INVALID_OUTPUT' | 'TOOL_NOT_ALLOWED' } {
    if (!validToken(tool)) return { valid: false, code: 'UNKNOWN_TOOL' };
    if (TOOL_CONTRACTS[tool].status !== 'IMPLEMENTED') {
        return { valid: false, code: 'TOOL_NOT_ALLOWED' };
    }
    return TOOL_CONTRACTS[tool].output.safeParse(payload).success
        ? { valid: true } : { valid: false, code: 'INVALID_OUTPUT' };
}

/**
 * PLN → TOOL safe handoff (not LangGraph integration).
 * A PLN candidate triggers fresh read ONLY; no purchase, no approval.
 * Source/perAcceptance values are caller claims and do not establish trusted Graph identity.
 */
export async function selectFreshReadForPlanning(raw: unknown, actorId: string,
    registry: UnifiedToolRegistry, authorize: ToolSelectionAuthorization): Promise<ToolSelectionDecision[]> {
    const parsed = planningResultSchema.safeParse(raw);
    if (!parsed.success) throw new Error('PLN_RESULT_REJECTED');
    const plan: PlanningResult = parsed.data;
    if (plan.status !== 'REVIEW_CANDIDATE' || plan.authorizedToPurchase || plan.authorizedToApprove) return [];
    const decisions = [];
    for (const candidate of plan.candidates) {
        decisions.push(await selectToolForTask({
            version: TOOL_SELECTION_VERSION, actorId, objective: 'INVENTORY', dataQuality: 'VERIFIED',
            requiredInformation: ['STOCK'], availableInformation: [],
            dependencyIds: [], completedDependencyIds: [],
            inputs: { ingredientId: candidate.ingredientId }, previousOutcome: 'NOT_RUN', recoveryCount: 0
        }, registry, authorize));
    }
    return decisions;
}
