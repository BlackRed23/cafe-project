/** Decisions only; blocked capabilities are not enabled by policy declarations. */
export const BUSINESS_TOOL_POLICIES = Object.freeze({
    sales: Object.freeze({ interval: 'UTC [from,to)', maxDays: 90,
        include: 'COMPLETED + PAID + COMMITTED item; window uses OrderItem.committedAt, not completion/update date',
        refunds: 'exclude entire order if order or ANY payment is REFUNDED; conservative, not exact net returned units',
        cancellations: 'exclude cancelled/voided; missing committedAt reported as unplaced candidates, complete=false', status: 'IMPLEMENTED' }),
    reorder: Object.freeze({ quantityUnit: 'Ingredient.baseUnit',
        aggregate: 'quantity - reserved includes expired/unknown-expiry stock; not usable',
        usable: 'max(unexpired batch balance - ALL aggregate reservations,0); conservative lower bound, unknown expiry excluded',
        demand: 'observed negative Order CONSUME ledger over last 30 days; includes physical use after refunds; no artificial fallback',
        leadTime: 'active supplier source + timestamp/version required; no default',
        target: 'max(minThreshold,daily observed consumption*(store planning days+supplier leadTime+2 safety days)); ceil packs/MOQ; zero deficit=zero purchase', status: 'IMPLEMENTED' }),
    supplier: Object.freeze({ status: 'ACTIVE', deletedAt: null, priceKind: 'REFERENCE_NOT_CONFIRMED',
        conversion: 'positive explicit base conversion; known unit factors must match; whole pieces',
        price: 'finite nonnegative base price; excludes tax/shipping/minimums/pack rounding' }),
});
export const DRAFT_PURCHASE_POLICY = Object.freeze({
    enabled: false, persistenceStatus: 'PENDING', meaning: 'request awaiting approval, not approved/sent',
    actor: 'trusted authentication context; never model input',
    approval: 'current ADMIN identity + immutable approval ID + canonical proposal SHA256 + actor/scope',
    sources: 'ingredient/batch/recipe/supplier/price versions + capturedAt + expiresAt; reject stale/expired',
    replay: 'actor/scope/key unique; same canonical payload returns immutable receipt; changed payload conflicts',
    concurrency: 'atomic receipt/effect/approval-consumption in same transaction; one winner',
    receipt: 'durable command receipt, including rejected outcomes; not mutable AgentToolCall/domain row substitute',
    unknown: 'query authoritative receipt; absence alone not rollback proof; no blind write retry',
    blockers: 'receipt ownership, durable approval/version/expiry checks and concurrent/restart/UNKNOWN tests absent',
});
