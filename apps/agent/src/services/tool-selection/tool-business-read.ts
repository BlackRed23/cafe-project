import { z } from 'zod';

/**
 * TOOL-04/05 independent, read-only Backend adapter.
 * It deliberately does not register tools in the shared Registry or change LangGraph.
 * Requests use an already-authenticated user's JWT against existing PUBLIC Business APIs,
 * so Backend's current-account RBAC and Stocktake ownership checks remain authoritative.
 */
const id = z.string().regex(/^[A-Za-z0-9][A-Za-z0-9:_-]{0,119}$/);
const iso = z.iso.datetime();
const quantity = z.string().regex(/^-?(0|[1-9]\d{0,13})(\.\d{1,3})?$/);
const natural = z.string().regex(/^\d+$/);
const quality = z.string().min(1).max(80);
const entry = z.object({
    ingredientId: id, batchId: id, openingCursor: natural,
    observedCursor: natural.nullable(),
    countedAt: iso.nullable(), expectedAtCount: quantity.nullable(),
    observedQty: quantity.nullable(), varianceQty: quantity.nullable(),
    openingQualityStatus: quality
});
const current = z.object({
    ingredientId: id, cursor: natural,
    batches: z.array(z.object({
        id, qualityStatus: quality, quantityRemaining: quantity,
        expirationDate: iso.nullable()
    })).max(1000)
});
const stocktakeResponse = z.object({
    session: z.object({
        id, status: z.enum([
            'DRAFT', 'PENDING', 'PENDING_APPROVAL', 'COMPLETED',
            'REJECTED', 'NEEDS_INVESTIGATION', 'CANCELLED'
        ]), scope: z.array(id).max(40),
        createdById: id, assignedCounterId: id.nullable(),
        revision: z.number().int().nonnegative(),
        approvedAt: iso.nullable(),
        updatedAt: iso
    }),
    entries: z.array(entry).max(2000),
    current: z.array(current).max(40)
});
const poResponse = z.object({
    id, status: z.string().min(1).max(80),
    purchaseRequestId: id,
    confirmedAt: iso.nullable(),
    confirmationSource: z.string().nullable(),
    updatedAt: iso,
    items: z.array(z.object({
        id, ingredientId: id.nullable(),
        quantityOrdered: z.number().int().nonnegative().max(1e9),
        quantityReceived: z.number().int().nonnegative().max(1e9),
        conversionToBase: quantity
    })).max(1000),
    receipts: z.array(z.object({
        id, purchaseOrderId: id.nullable(),
        status: z.enum(['DRAFT', 'CONFIRMED', 'CANCELLED']),
        receivedAt: iso
    })).max(1000)
});
const lotResponse = z.object({
    batches: z.array(z.object({
        id, ingredientId: id, goodsReceiptId: id.nullable(),
        qualityStatus: quality, expirationDate: iso.nullable(),
        quantityRemaining: quantity
    })).max(1000)
});
export const stocktakeReadInputSchema = z.strictObject({ stocktakeId: id, ingredientId: id });
export const inboundReadInputSchema = z.strictObject({ purchaseOrderId: id, ingredientId: id });
const inputStocktake = stocktakeReadInputSchema;
const inputInbound = inboundReadInputSchema;
export type StocktakeReadInput = z.infer<typeof inputStocktake>;
export type InboundReadInput = z.infer<typeof inputInbound>;

export class BusinessReadError extends Error {
    constructor(readonly code: 'INVALID_INPUT' | 'FORBIDDEN' | 'NOT_FOUND' |
        'INVALID_SOURCE' | 'BACKEND_UNAVAILABLE' | 'STALE_CONTEXT' | 'SCOPE_MISMATCH') {
        super(code);
    }
}

const scaled = (value: string): bigint => {
    if (!quantity.safeParse(value).success) throw new BusinessReadError('INVALID_SOURCE');
    const negative = value.startsWith('-');
    const [whole, fraction = ''] = (negative ? value.slice(1) : value).split('.');
    const abs = BigInt(whole!) * 1000n + BigInt(fraction.padEnd(3, '0'));
    return negative ? -abs : abs;
};
const decimal = (value: bigint): string => {
    const abs = value < 0n ? -value : value;
    return (value < 0n ? '-' : '') + (abs / 1000n).toString() + '.' +
        (abs % 1000n).toString().padStart(3, '0');
};
const validInstant = (value: string, now: Date): boolean =>
    Date.parse(value) <= now.getTime() + 60_000;

export type ToolBusinessBackendClient = {
    get(path: string): Promise<unknown>;
};

/** Token is never returned, logged or passed to a browser as a special credential. */
export function createAuthenticatedBusinessReadClient(options: {
    baseUrl: string; bearerJwt: string; fetchImpl?: typeof fetch;
}): ToolBusinessBackendClient {
    const parsed = new URL(options.baseUrl);
    if (parsed.username || parsed.password || parsed.search || parsed.hash ||
        (parsed.protocol !== 'https:' &&
            !(parsed.protocol === 'http:' && ['127.0.0.1', 'localhost'].includes(parsed.hostname)))) {
        throw new BusinessReadError('INVALID_INPUT');
    }
    if (!options.bearerJwt || options.bearerJwt.length > 8192 || /\s/.test(options.bearerJwt)) {
        throw new BusinessReadError('INVALID_INPUT');
    }
    const fetcher = options.fetchImpl ?? fetch;
    return {
        async get(path: string): Promise<unknown> {
            if (!path.startsWith('/api/') || path.includes('..') || path.includes('?') ||
                path.includes('#') || path.includes('//')) throw new BusinessReadError('INVALID_INPUT');
            let response: Response;
            try {
                response = await fetcher(new URL(path, parsed).toString(), {
                    method: 'GET', redirect: 'error',
                    headers: { Authorization: 'Bearer ' + options.bearerJwt, Accept: 'application/json' },
                    signal: AbortSignal.timeout(5000)
                });
            } catch { throw new BusinessReadError('BACKEND_UNAVAILABLE'); }
            if (response.status === 401 || response.status === 403) throw new BusinessReadError('FORBIDDEN');
            if (response.status === 404) throw new BusinessReadError('NOT_FOUND');
            if (response.status !== 200) throw new BusinessReadError('BACKEND_UNAVAILABLE');
            let text: string;
            try { text = await response.text(); }
            catch { throw new BusinessReadError('BACKEND_UNAVAILABLE'); }
            if (text.length > 512_000) throw new BusinessReadError('INVALID_SOURCE');
            try {
                const raw = JSON.parse(text);
                if (raw?.success !== true || raw?.data == null) throw new Error('INVALID_RESPONSE');
                return raw.data;
            } catch { throw new BusinessReadError('INVALID_SOURCE'); }
        }
    };
}

export type StocktakeToolRead = {
    source: 'PUBLIC_BUSINESS_STOCKTAKE_API';
    stocktakeId: string; ingredientId: string;
    status: string; revision: number;
    checkedAt: string;
    pendingApproval: boolean;
    uncountedLots: number;
    unapprovedVariances: {
        batchId: string; varianceBase: string;
        observedCursor: string; openingCursor: string;
        qualityAtOpen: string; qualityCurrent: string;
    }[];
    warnings: ('STALE_CONTEXT' | 'UNCERTAIN_COUNT' | 'QUALITY_CHANGED' | 'INVESTIGATION_REQUIRED')[];
    requiresFreshRead: true;
    createsAdjustment: false;
    grantsApproval: false;
    decision: 'REVIEW_ONLY';
};
export const stocktakeToolReadOutputSchema = z.strictObject({
    source: z.literal('PUBLIC_BUSINESS_STOCKTAKE_API'),
    stocktakeId: id, ingredientId: id, status: z.string().min(1).max(80),
    revision: z.number().int().nonnegative(), checkedAt: iso,
    pendingApproval: z.boolean(), uncountedLots: z.number().int().nonnegative(),
    unapprovedVariances: z.array(z.strictObject({
        batchId: id, varianceBase: quantity, observedCursor: natural,
        openingCursor: natural, qualityAtOpen: quality, qualityCurrent: quality
    })).max(2000),
    warnings: z.array(z.enum([
        'STALE_CONTEXT', 'UNCERTAIN_COUNT', 'QUALITY_CHANGED', 'INVESTIGATION_REQUIRED'
    ])).max(4),
    requiresFreshRead: z.literal(true), createsAdjustment: z.literal(false),
    grantsApproval: z.literal(false), decision: z.literal('REVIEW_ONLY')
});

export type InboundToolRead = {
    source: 'PUBLIC_BUSINESS_PO_AND_LOT_APIS';
    purchaseOrderId: string; purchaseRequestId: string;
    ingredientId: string; purchaseOrderStatus: string;
    checkedAt: string; updatedAt: string;
    pendingBase: string; observedReceivedBase: string;
    inboundConsideration: 'UNCONFIRMED' | 'REVIEW_UNVERIFIED' | 'NOT_INBOUND';
    supplierExternallyVerified: false;
    goodsReceipts: { receiptId: string; status: 'DRAFT'|'CONFIRMED'|'CANCELLED'; linkedBatchIds: string[] }[];
    provenanceChecked: true;
    warnings: ('NO_CONFIRMED_ARRIVAL' | 'RECEIPT_WITHOUT_LOT_PROOF' |
        'LOT_QUALITY_HOLD' | 'STALE_CONTEXT')[];
    requiresFreshRead: true;
    contributesToPhysicalStock: false;
    createsPurchaseOrder: false;
    decision: 'REVIEW_ONLY';
};
export const inboundToolReadOutputSchema = z.strictObject({
    source: z.literal('PUBLIC_BUSINESS_PO_AND_LOT_APIS'),
    purchaseOrderId: id, purchaseRequestId: id, ingredientId: id,
    purchaseOrderStatus: z.string().min(1).max(80),
    checkedAt: iso, updatedAt: iso,
    pendingBase: quantity, observedReceivedBase: quantity,
    inboundConsideration: z.enum(['UNCONFIRMED', 'REVIEW_UNVERIFIED', 'NOT_INBOUND']),
    supplierExternallyVerified: z.literal(false),
    goodsReceipts: z.array(z.strictObject({
        receiptId: id, status: z.enum(['DRAFT','CONFIRMED','CANCELLED']),
        linkedBatchIds: z.array(id).max(1000)
    })).max(1000),
    provenanceChecked: z.literal(true),
    warnings: z.array(z.enum([
        'NO_CONFIRMED_ARRIVAL','RECEIPT_WITHOUT_LOT_PROOF','LOT_QUALITY_HOLD','STALE_CONTEXT'
    ])).max(4),
    requiresFreshRead: z.literal(true), contributesToPhysicalStock: z.literal(false),
    createsPurchaseOrder: z.literal(false), decision: z.literal('REVIEW_ONLY')
});

/**
 * One trusted Backend business transaction per GET; the pair of PO/lot GETs is
 * not atomic, so every inbound projection explicitly requires revalidation.
 */
export function createToolBusinessReadAdapter(client: ToolBusinessBackendClient,
    now: () => Date = () => new Date()) {
    return Object.freeze({
        async readStocktake(raw: unknown): Promise<StocktakeToolRead> {
            const args = inputStocktake.safeParse(raw);
            if (!args.success) throw new BusinessReadError('INVALID_INPUT');
            const verified = stocktakeResponse.safeParse(await client.get(
                '/api/stocktakes/' + encodeURIComponent(args.data.stocktakeId)));
            if (!verified.success) throw new BusinessReadError('INVALID_SOURCE');
            const { session, entries, current: currentRows } = verified.data;
            if (session.id !== args.data.stocktakeId || !session.scope.includes(args.data.ingredientId)) {
                throw new BusinessReadError('SCOPE_MISMATCH');
            }
            const time = now();
            if (!Number.isFinite(time.getTime()) || !validInstant(session.updatedAt, time)) {
                throw new BusinessReadError('STALE_CONTEXT');
            }
            const physical = currentRows.find(row => row.ingredientId === args.data.ingredientId);
            if (!physical) throw new BusinessReadError('INVALID_SOURCE');
            const lots = new Map(physical.batches.map(row => [row.id, row]));
            const warnings: StocktakeToolRead['warnings'] = [];
            if (session.status === 'NEEDS_INVESTIGATION') warnings.push('INVESTIGATION_REQUIRED');
            const unapprovedVariances: StocktakeToolRead['unapprovedVariances'] = [];
            let uncountedLots = 0;
            for (const row of entries) {
                if (row.ingredientId !== args.data.ingredientId) continue;
                const lot = lots.get(row.batchId);
                if (!lot || BigInt(row.openingCursor) > BigInt(physical.cursor)) {
                    throw new BusinessReadError('INVALID_SOURCE');
                }
                if (row.openingQualityStatus !== lot.qualityStatus) warnings.push('QUALITY_CHANGED');
                if (row.countedAt === null) {
                    uncountedLots++;
                    if (row.varianceQty !== null || row.observedQty !== null) {
                        throw new BusinessReadError('INVALID_SOURCE');
                    }
                    continue;
                }
                if (row.expectedAtCount === null || row.observedQty === null ||
                    row.varianceQty === null || row.observedCursor === null ||
                    scaled(row.observedQty) - scaled(row.expectedAtCount) !== scaled(row.varianceQty)) {
                    throw new BusinessReadError('INVALID_SOURCE');
                }
                if (BigInt(row.observedCursor) !== BigInt(physical.cursor)) warnings.push('STALE_CONTEXT');
                if (scaled(row.varianceQty) !== 0n && session.status !== 'COMPLETED') {
                    unapprovedVariances.push({
                        batchId: row.batchId, varianceBase: decimal(scaled(row.varianceQty)),
                        observedCursor: row.observedCursor, openingCursor: row.openingCursor,
                        qualityAtOpen: row.openingQualityStatus, qualityCurrent: lot.qualityStatus
                    });
                }
            }
            if (uncountedLots) warnings.push('UNCERTAIN_COUNT');
            return stocktakeToolReadOutputSchema.parse({
                source: 'PUBLIC_BUSINESS_STOCKTAKE_API',
                stocktakeId: session.id, ingredientId: args.data.ingredientId,
                status: session.status, revision: session.revision,
                checkedAt: time.toISOString(),
                pendingApproval: session.status === 'PENDING_APPROVAL',
                uncountedLots, unapprovedVariances,
                warnings: [...new Set(warnings)],
                requiresFreshRead: true, createsAdjustment: false, grantsApproval: false,
                decision: 'REVIEW_ONLY'
            });
        },

        async readInbound(raw: unknown): Promise<InboundToolRead> {
            const args = inputInbound.safeParse(raw);
            if (!args.success) throw new BusinessReadError('INVALID_INPUT');
            const order = poResponse.safeParse(await client.get(
                '/api/purchase-orders/' + encodeURIComponent(args.data.purchaseOrderId)));
            if (!order.success) throw new BusinessReadError('INVALID_SOURCE');
            if (order.data.id !== args.data.purchaseOrderId) throw new BusinessReadError('SCOPE_MISMATCH');
            const scopedItems = order.data.items.filter(item => item.ingredientId === args.data.ingredientId);
            if (!scopedItems.length) throw new BusinessReadError('SCOPE_MISMATCH');
            const time = now();
            if (!validInstant(order.data.updatedAt, time)) throw new BusinessReadError('STALE_CONTEXT');
            if (order.data.confirmedAt && !validInstant(order.data.confirmedAt, time)) {
                throw new BusinessReadError('STALE_CONTEXT');
            }
            let outstanding = 0n, received = 0n;
            for (const item of scopedItems) {
                const conversion = scaled(item.conversionToBase);
                if (conversion <= 0n || item.quantityReceived > item.quantityOrdered) {
                    throw new BusinessReadError('INVALID_SOURCE');
                }
                outstanding += BigInt(item.quantityOrdered - item.quantityReceived) * conversion;
                received += BigInt(item.quantityReceived) * conversion;
            }
            // Reuse existing ingredient-level lot projection to verify provenance;
            // never infer a received batch from an order item alone.
            const lotData = lotResponse.safeParse(await client.get(
                '/api/ingredients/' + encodeURIComponent(args.data.ingredientId) + '/batches'));
            if (!lotData.success) throw new BusinessReadError('INVALID_SOURCE');
            const receipts = order.data.receipts;
            if (receipts.some(r => r.purchaseOrderId !== order.data.id)) {
                throw new BusinessReadError('INVALID_SOURCE');
            }
            if (receipts.some(r => !validInstant(r.receivedAt, time))) {
                throw new BusinessReadError('STALE_CONTEXT');
            }
            const warnings: InboundToolRead['warnings'] = [];
            const goodsReceipts = receipts.map(r => {
                const linked = lotData.data.batches.filter(batch => batch.goodsReceiptId === r.id);
                if (r.status === 'CONFIRMED' && !linked.length) warnings.push('RECEIPT_WITHOUT_LOT_PROOF');
                for (const batch of linked) {
                    if (batch.ingredientId !== args.data.ingredientId) throw new BusinessReadError('INVALID_SOURCE');
                    if (batch.qualityStatus !== 'AVAILABLE' ||
                        (batch.expirationDate !== null && Date.parse(batch.expirationDate) <= time.getTime())) {
                        warnings.push('LOT_QUALITY_HOLD');
                    }
                }
                return { receiptId: r.id, status: r.status, linkedBatchIds: linked.map(batch => batch.id) };
            });
            const active = ['CONFIRMED', 'PARTIALLY_RECEIVED'].includes(order.data.status);
            if (!active || !order.data.confirmedAt) warnings.push('NO_CONFIRMED_ARRIVAL');
            // A source timestamp is not proof the supplier independently verified delivery.
            return inboundToolReadOutputSchema.parse({
                source: 'PUBLIC_BUSINESS_PO_AND_LOT_APIS',
                purchaseOrderId: order.data.id, purchaseRequestId: order.data.purchaseRequestId,
                ingredientId: args.data.ingredientId, purchaseOrderStatus: order.data.status,
                checkedAt: time.toISOString(), updatedAt: order.data.updatedAt,
                pendingBase: decimal(outstanding), observedReceivedBase: decimal(received),
                inboundConsideration: !active || !order.data.confirmedAt ? 'UNCONFIRMED'
                    : outstanding === 0n ? 'NOT_INBOUND' : 'REVIEW_UNVERIFIED',
                supplierExternallyVerified: false,
                goodsReceipts, provenanceChecked: true,
                warnings: [...new Set(warnings)],
                requiresFreshRead: true, contributesToPhysicalStock: false,
                createsPurchaseOrder: false, decision: 'REVIEW_ONLY'
            });
        }
    });
}
