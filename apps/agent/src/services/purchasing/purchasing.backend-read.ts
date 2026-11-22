/** Independent read-only HTTP adapter using CURRENT Backend JWT authorization.
 * It intentionally does not fabricate approved reorder policy, supplier price,
 * min-order terms, recipe demand or approval from public Backend responses.
 * The resulting proof can support safe HOLD/INSUFFICIENT_EVIDENCE decisions;
 * an authorized procurement proposal needs a future Backend-owned snapshot API.
 */
import { createHash } from 'node:crypto';
import { z } from 'zod';
import { createAuthenticatedBusinessReadClient, createToolBusinessReadAdapter } from
    '../tool-selection/tool-business-read';
import type { PurchasingAuthority, PurchasingInput } from './purchasing.schema';

const value = z.union([z.number().finite().nonnegative(),
    z.string().regex(/^(0|[1-9]\d{0,13})(\.\d{1,4})?$/)]);
const id = z.string().regex(/^[A-Za-z0-9][A-Za-z0-9:_-]{0,119}$/);
const iso = z.iso.datetime();
const ingredientSchema = z.object({
    // Backend accepts legacy baseUnit='gram' (same physical factor as 'g').
    // Do not silently normalize kg/l here: their amounts need a real conversion.
    id, baseUnit: z.enum(['g', 'gram', 'gr', 'ml', 'piece']), quantity: value,
    reserved: value, minThreshold: value, rowVersion: z.number().int().nonnegative(),
    isActive: z.literal(true)
});
const lotSchema = z.object({
    evaluatedAt: iso,
    ingredient: z.object({ physicalQuantity: value, reservedQuantity: value,
        usableQuantity: value, availableQuantity: value }),
    batches: z.array(z.object({
        id, quantityRemaining: value, qualityStatus: z.string().min(1).max(80),
        expirationDate: iso.nullable()
    })).max(1000)
});
const riskSchema = z.object({
    ingredientId: id, asOf: iso, rowVersion: z.number().int().nonnegative(),
    movementCursor: z.string().regex(/^\d+$/), availableBase: value,
    demand: z.object({ evidenceWindowDays: z.literal(30),
        observedMovements: z.number().int().nonnegative(),
        confidence: z.enum(['LOW', 'MEDIUM', 'HIGH']) }),
    stockoutEstimateDays: z.number().finite().nonnegative().nullable(),
    incoming: z.array(z.object({
        purchaseOrderId: id, unreceivedBase: value,
        confirmationSource: z.string().min(1).max(120), estimatedLate: z.boolean()
    })).max(50),
    openPurchaseRequests: z.array(z.object({ id, status: z.enum(['PENDING', 'APPROVED', 'SENT']),
        demandHashPresent: z.boolean() })).max(64),
    openPurchaseRequestsTruncated: z.boolean(),
    pendingStockCountItems: z.number().int().nonnegative(),
    codes: z.array(z.string().regex(/^[A-Z0-9_]{1,64}$/)).max(120),
    providerDeliveryVerified: z.literal(false),
    policyVersionApproved: z.literal(false),
    writesPerformed: z.literal(false)
});
const actorSchema = z.object({ id, role: z.enum(['ADMIN', 'STAFF']) });
const scale = (v: string | number) => {
    const source = String(v);
    if (!/^(0|[1-9]\d{0,13})(\.\d{1,4})?$/.test(source)) throw Error('INVALID_BACKEND_QUANTITY');
    const [w, f = ''] = source.split('.');
    return BigInt(w!) * 10000n + BigInt(f.padEnd(4, '0'));
};
const toText = (v: bigint) => {
    if (v < 0n) throw Error('INVALID_BACKEND_QUANTITY');
    const decimals = (v % 10000n).toString().padStart(4, '0').replace(/0+$/, '');
    return (v / 10000n).toString() + (decimals ? '.' + decimals : '');
};
const equal = (a: string | number, b: string | number) => scale(a) === scale(b);
const hash = (v: unknown) => createHash('sha256').update(JSON.stringify(v)).digest('hex');

export function createPurchasingHttpReadAuthority(options: {
    baseUrl: string; bearerJwt: string; fetchImpl?: typeof fetch;
    clock?: () => Date;
}): PurchasingAuthority {
    // Reuse TOOL's SSRF-restricted, authenticated PUBLIC Business API GET client.
    const client = createAuthenticatedBusinessReadClient(options);
    const adapter = createToolBusinessReadAdapter(client, options.clock);
    const origin = new URL(options.baseUrl);
    const fetcher = options.fetchImpl ?? fetch;
    return Object.freeze({
        async verify(input: PurchasingInput) {
            const now = options.clock?.() ?? new Date();
            if (!Number.isFinite(now.getTime())) throw Error('INVALID_BACKEND_CLOCK');
            // /api/auth/me is the existing special unwrapped auth response.
            let response: Response;
            try {
                response = await fetcher(new URL('/api/auth/me', origin), {
                    method: 'GET', redirect: 'error',
                    headers: { Authorization: 'Bearer ' + options.bearerJwt, Accept: 'application/json' },
                    signal: AbortSignal.timeout(5000)
                });
            } catch { throw Error('BACKEND_AUTH_UNAVAILABLE'); }
            if (response.status !== 200 || !response.headers.get('content-type')?.includes('application/json')) {
                throw Error('BACKEND_ACTOR_UNVERIFIED');
            }
            const actorText = await response.text();
            if (actorText.length > 16000) throw Error('BACKEND_ACTOR_UNVERIFIED');
            let actorRaw: unknown;
            try { actorRaw = JSON.parse(actorText); } catch { throw Error('BACKEND_ACTOR_UNVERIFIED'); }
            const actor = actorSchema.parse(actorRaw);
            if (actor.id !== input.actorId || actor.role !== 'ADMIN') {
                // /api/agent/demand-risk itself requires ADMIN; STAFF cannot use
                // the Agent's own service token to impersonate an ADMIN.
                throw Error('BACKEND_ACTOR_FORBIDDEN');
            }
            const path = encodeURIComponent(input.ingredientId);
            const ingredient = ingredientSchema.parse(await client.get('/api/ingredients/' + path));
            const lots = lotSchema.parse(await client.get('/api/ingredients/' + path + '/batches'));
            const risk = riskSchema.parse(await client.get('/api/agent/demand-risk/' + path));
            if (ingredient.id !== input.ingredientId || risk.ingredientId !== input.ingredientId ||
                ingredient.rowVersion !== input.expectedRowVersion ||
                risk.rowVersion !== ingredient.rowVersion ||
                risk.movementCursor !== input.expectedMovementCursor ||
                !equal(lots.ingredient.physicalQuantity, ingredient.quantity) ||
                !equal(lots.ingredient.reservedQuantity, ingredient.reserved) ||
                !equal(lots.ingredient.availableQuantity, risk.availableBase)) {
                throw Error('BACKEND_SNAPSHOT_MISMATCH');
            }
            const inFiveMinutes = (timestamp: string) => {
                const age = now.getTime() - Date.parse(timestamp);
                return age >= -60_000 && age <= 300_000;
            };
            if (!inFiveMinutes(risk.asOf) || !inFiveMinutes(lots.evaluatedAt)) {
                throw Error('BACKEND_SNAPSHOT_STALE');
            }
            const batches = lots.batches.map(row => {
                const expired = row.expirationDate !== null && Date.parse(row.expirationDate) <= now.getTime();
                const eligible = row.qualityStatus === 'AVAILABLE' && !expired;
                return { id: row.id, quantityRemaining: toText(scale(row.quantityRemaining)),
                    qualityStatus: row.qualityStatus, expirationDate: row.expirationDate, eligible };
            });
            const total = batches.reduce((v, b) => v + scale(b.quantityRemaining), 0n);
            const usable = batches.filter(b => b.eligible)
                .reduce((v, b) => v + scale(b.quantityRemaining), 0n);
            const reserved = scale(ingredient.reserved), physical = scale(ingredient.quantity);
            const available = usable - reserved;
            if (total !== physical || reserved > usable ||
                !equal(toText(usable), lots.ingredient.usableQuantity) ||
                !equal(toText(available), lots.ingredient.availableQuantity) ||
                !equal(toText(available), risk.availableBase)) {
                throw Error('BACKEND_STOCK_RECONCILIATION_FAILED');
            }
            const expiredBase = batches.filter(b => !b.eligible && b.qualityStatus === 'AVAILABLE')
                .reduce((v, b) => v + scale(b.quantityRemaining), 0n);
            const qualityBase = batches.filter(b => !b.eligible && b.qualityStatus !== 'AVAILABLE')
                .reduce((v, b) => v + scale(b.quantityRemaining), 0n);
            const inbound = await Promise.all([...new Set(risk.incoming.map(r => r.purchaseOrderId))]
                .map(purchaseOrderId => adapter.readInbound({ purchaseOrderId, ingredientId: input.ingredientId })));
            const riskEvidence = {
                codes: risk.codes,
                observations: [{ ingredientId: risk.ingredientId, asOf: risk.asOf,
                    rowVersion: risk.rowVersion, movementCursor: risk.movementCursor,
                    availableBase: toText(scale(risk.availableBase)),
                    projectedDaysRemaining: risk.stockoutEstimateDays,
                    forecastConfidence: risk.demand.confidence,
                    demandWindowDays: risk.demand.evidenceWindowDays,
                    observedConsumptionMovements: risk.demand.observedMovements,
                    incomingPurchaseOrders: risk.incoming.map(r => ({
                        purchaseOrderId: r.purchaseOrderId, unreceivedBase: toText(scale(r.unreceivedBase)),
                        confirmationSource: r.confirmationSource, estimatedLate: r.estimatedLate })),
                    outstandingPurchaseRequests: risk.openPurchaseRequests,
                    outstandingPurchaseRequestsTruncated: risk.openPurchaseRequestsTruncated,
                    pendingStocktakes: risk.pendingStockCountItems }]
            };
            // Local receipt fingerprint, NOT a persisted Backend business/audit row.
            const ref = 'pur-http-' + hash([input.runId, input.ingredientId,
                risk.rowVersion, risk.movementCursor, risk.asOf]).slice(0, 32);
            return {
                runId: input.runId, actorId: actor.id, actorRole: actor.role,
                ingredientId: input.ingredientId, verifiedAt: now.toISOString(), evidenceRef: ref,
                perception: {
                    ingredientId: input.ingredientId,
                    baseUnit: ingredient.baseUnit === 'gram' || ingredient.baseUnit === 'gr'
                        ? 'g' as const : ingredient.baseUnit,
                    physicalQuantity: toText(physical), reservedQuantity: toText(reserved),
                    eligibleQuantity: toText(usable), availableQuantity: toText(available),
                    thresholdQuantity: toText(scale(ingredient.minThreshold)),
                    belowThreshold: available < scale(ingredient.minThreshold),
                    excludedQuantityByReason: { expired: toText(expiredBase), qualityHold: toText(qualityBase) },
                    lotBreakdown: batches, rowVersion: ingredient.rowVersion,
                    movementCursor: risk.movementCursor, sourceReadAt: now.toISOString(),
                    dataQualityStatus: 'VERIFIED' as const,
                    warnings: risk.codes.filter(c => c.includes('STALE') || c.includes('ANOMALOUS')),
                    requiresRevalidation: true as const
                }, backendRisk: riskEvidence,
                // These are NOT published by the existing authenticated read
                // endpoints. Never invent procurement policies/supplier prices.
                policy: null, recipeDemand: null, suppliers: [], inbound, stocktake: null
            };
        }
    });
}
