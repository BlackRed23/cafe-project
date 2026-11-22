/**
 * Public AgentLog projection. AgentLog INPUT/OUTPUT/REASONING are untrusted:
 * prompts, tool observations, failure stacks, and user text can contain keys.
 *
 * This allowlist is intentionally narrower than the persisted diagnostic row.
 * Never spread an incoming object into the public result or forward raw errors.
 * Sanitization is the last boundary before sending any AgentLog DTO outward.
 */
const unsafeHint = /(?:bearer\s+\S+|authorization|password|passphrase|secret|api[_ -]?key|access[_ -]?token|internal[_ -]?token|private[_ -]?value|credential|(?:^|\W)jwt(?:\W|$)|stack\s*trace|\bat\s+\S+\s*\([^\n]*:\d+:\d+\))/i;
const longOpaqueToken = /[A-Za-z0-9_-]{36,}/;
const uuidReference = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const safeRef = /^[A-Za-z0-9][A-Za-z0-9:_-]{0,119}$/;
const safeCode = /^[A-Z][A-Z0-9_]{0,79}$/;

function safeText(value: unknown, limit = 200): string | null {
    if (typeof value !== 'string') return null;
    const text = value.trim();
    if (!text || text.length > limit || /[\u0000-\u001f]/.test(text) ||
        unsafeHint.test(text) || longOpaqueToken.test(text)) return null;
    return text;
}
function code(value: unknown): string | null {
    return typeof value === 'string' && safeCode.test(value) &&
        !unsafeHint.test(value) && !longOpaqueToken.test(value) ? value : null;
}
function ref(value: unknown): string | null {
    // Backend IDs/correlation IDs may be UUIDs; an actual UUID is not a
    // Bearer token and should remain usable for safe audit drilldown.
    if (typeof value === 'string' && uuidReference.test(value)) return value;
    return typeof value === 'string' && safeRef.test(value) &&
        !unsafeHint.test(value) && !longOpaqueToken.test(value) ? value : null;
}
function date(value: unknown): string | null {
    if (value instanceof Date) return Number.isFinite(value.getTime()) ? value.toISOString() : null;
    return typeof value === 'string' && /^\d{4}-\d\d-\d\dT/.test(value) &&
        Number.isFinite(Date.parse(value)) ? new Date(value).toISOString() : null;
}
function bool(value: unknown): boolean {
    return value === true;
}
const safeContextFields = Object.freeze({
    // Never include arbitrary nested keys, raw prompt/instruction, or evidence.
    ingredientId: ref, productId: ref, inventoryId: ref,
    purchaseRequestId: ref, scanSessionId: ref, sourceId: ref,
    sourceType: code, triggerType: code, itemType: code,
    baseUnit: (v: unknown) => ['g', 'ml', 'piece'].includes(String(v)) ? String(v) : null,
    reason: code, status: code, result: code,
    reasonCode: code, correlationId: ref,
    operation: code,
    timestamp: date,
    availableStock: (v: unknown) => typeof v === 'number' && Number.isFinite(v) ? v : null,
    currentQuantity: (v: unknown) => typeof v === 'number' && Number.isFinite(v) ? v : null,
    recommendedQuantity: (v: unknown) => typeof v === 'number' && Number.isFinite(v) ? v : null,
    minThreshold: (v: unknown) => typeof v === 'number' && Number.isFinite(v) ? v : null,
    daysLeft: (v: unknown) => typeof v === 'number' && Number.isFinite(v) ? v : null
});
/** Literal safe fields only. Unknown keys are silently dropped. */
export function publicAgentLogContext(raw: unknown): Record<string, unknown> | null {
    if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) return null;
    const result: Record<string, unknown> = {};
    for (const [name, mapper] of Object.entries(safeContextFields)) {
        if (!Object.prototype.hasOwnProperty.call(raw, name)) continue;
        const transformed = mapper((raw as Record<string, unknown>)[name]);
        if (transformed !== null) result[name] = transformed;
    }
    return result;
}
/**
 * The generic return type preserves the existing DTO shape for legacy callers,
 * while explicitly blanking sensitive fields at runtime. No raw input is spread.
 */
export function sanitizePublicAgentLog<T extends Record<string, unknown>>(raw: T): T {
    const actor = raw.createdBy && typeof raw.createdBy === 'object' &&
        !Array.isArray(raw.createdBy) ? raw.createdBy as Record<string, unknown> : null;
    return {
        id: ref(raw.id),
        action: code(raw.action),
        status: code(raw.status),
        result: code(raw.result),
        reason: code(raw.reason),
        message: safeText(raw.message, 240) ?? 'Nhật ký Agent đã được ghi nhận.',
        triggerType: code(raw.triggerType),
        scanSessionId: ref(raw.scanSessionId),
        itemType: code(raw.itemType),
        ingredientId: ref(raw.ingredientId),
        ingredientName: safeText(raw.ingredientName, 100),
        baseUnit: ['g', 'ml', 'piece'].includes(String(raw.baseUnit)) ? raw.baseUnit : null,
        productId: ref(raw.productId),
        productName: safeText(raw.productName, 100),
        inventoryId: ref(raw.inventoryId),
        purchaseRequestId: ref(raw.purchaseRequestId),
        referenceType: code(raw.referenceType),
        referenceId: ref(raw.referenceId),
        sourceId: ref(raw.sourceId),
        sourceType: code(raw.sourceType),
        input: publicAgentLogContext(raw.input),
        output: publicAgentLogContext(raw.output),
        reasoning: null,
        errorMessage: null,
        error_message: null,
        fallbackUsed: bool(raw.fallbackUsed),
        fallback_used: bool(raw.fallback_used),
        createdBy: actor ? { id: ref(actor.id), name: safeText(actor.name, 80) } : null,
        createdAt: date(raw.createdAt),
        reference_type: code(raw.reference_type),
        reference_id: ref(raw.reference_id)
    } as unknown as T;
}
