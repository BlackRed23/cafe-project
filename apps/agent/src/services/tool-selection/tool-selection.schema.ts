import { z } from 'zod';

/** TOOL owns this contract; no modifications to PER, PLN, Graph or Registry. */
export const TOOL_SELECTION_VERSION = 'TOOL_SELECTION_V1' as const;
const id = z.string().regex(/^[A-Za-z0-9][A-Za-z0-9:_-]{0,119}$/);
const stepId = z.string().regex(/^[A-Za-z0-9_-]{1,64}$/);
export const toolInformationSchema = z.enum([
    'STOCK', 'LOTS', 'SALES', 'STOCKTAKE', 'INBOUND', 'SUPPLIERS',
    'REORDER_INPUT', 'PRICE'
]);
export type ToolInformation = z.infer<typeof toolInformationSchema>;
export const toolSelectionInputSchema = z.strictObject({
    version: z.literal(TOOL_SELECTION_VERSION),
    actorId: id,
    objective: z.enum([
        'INVENTORY', 'EXPIRY', 'CONSUMPTION', 'STOCKTAKE',
        'INBOUND', 'SUPPLIER', 'REORDER', 'EXPLICIT'
    ]),
    /** Trust boundary: this is caller evidence, not an authorization attestation. */
    dataQuality: z.enum(['VERIFIED', 'PARTIAL', 'UNKNOWN']),
    requiredInformation: z.array(toolInformationSchema).max(8),
    availableInformation: z.array(toolInformationSchema).max(8),
    dependencyIds: z.array(stepId).max(10),
    completedDependencyIds: z.array(stepId).max(10),
    inputs: z.strictObject({
        ingredientId: id.optional(),
        productId: id.optional(),
        from: z.iso.datetime().optional(),
        to: z.iso.datetime().optional(),
        supplierId: id.optional(),
        stocktakeId: id.optional(),
        purchaseOrderId: id.optional(),
        quantityBase: z.string().regex(/^(0|[1-9]\d{0,11})(\.\d{1,3})?$/).optional()
    }),
    requestedTool: z.string().min(1).max(120).optional(),
    previousTool: z.string().min(1).max(120).optional(),
    previousOutcome: z.enum(['NOT_RUN', 'INSUFFICIENT_DATA', 'INVALID_OUTPUT', 'TIMEOUT']),
    recoveryCount: z.number().int().nonnegative().max(2)
});
export type ToolSelectionInput = z.infer<typeof toolSelectionInputSchema>;

export const toolSelectionDecisionSchema = z.strictObject({
    version: z.literal(TOOL_SELECTION_VERSION),
    status: z.enum(['SELECTED', 'NO_TOOL_REQUIRED', 'NEEDS_INFORMATION', 'DENIED', 'BLOCKED_CAPABILITY']),
    selectedTool: z.string().nullable(),
    selectionReason: z.enum([
        'OBJECTIVE_MATCH', 'SUPPLEMENTARY_LOT_READ', 'PLANNING_REVALIDATION',
        'INFORMATION_ALREADY_PRESENT', 'DEPENDENCY_PENDING',
        'INPUT_MISSING', 'DATA_QUALITY_UNVERIFIED', 'RECOVERY_LIMIT_REACHED',
        'UNKNOWN_TOOL', 'TOOL_NOT_ALLOWED', 'UNAUTHORIZED', 'INVALID_SCHEMA',
        'REGISTRY_CAPABILITY_UNAVAILABLE'
    ]),
    requiredInputs: z.array(z.string()),
    dependencyIds: z.array(stepId),
    validationStatus: z.enum(['VALID', 'INVALID', 'NOT_CHECKED']),
    deniedReason: z.string().nullable(),
    missingInformation: z.array(z.string()),
    alternativeEligibleTools: z.array(z.string()),
    requiresAdditionalData: z.boolean(),
    requiresApproval: z.literal(false),
    decisionTraceId: z.string().regex(/^[a-f0-9]{32}$/),
    readOnly: z.literal(true),
    executeCalled: z.literal(false),
    /** Selection does not prove any tool actually ran, or that Backend authorized a write. */
    evidenceLevel: z.enum(['UNIT_SELECTION', 'CONTRACT_SELECTION'])
});
export type ToolSelectionDecision = z.infer<typeof toolSelectionDecisionSchema>;
