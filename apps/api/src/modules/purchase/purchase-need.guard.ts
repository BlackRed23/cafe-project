import { createHash } from 'node:crypto';
import { Prisma } from '@cafe-project/database';
import { HttpError } from '../../common/http-error';

/**
 * F2 / AI-LN-07. One automatic inventory shortage is a BACKEND business need,
 * not a demandSourceKey, caller-provided hash, supplier, actor or Agent run.
 *
 * Current Cafe Project is single-site. Until the business supplies a durable
 * multi-site/independent-causal-demand contract, the automated replenishment
 * category is conservatively scoped to (single site, ingredient, LOW_STOCK).
 * A changed stock cursor is a freshness fence, NOT a second need.
 *
 * This guard is only called for the automated shortage write path. Separate
 * manual ADMIN-authorized demand sources retain the legacy NH-21R semantics.
 * It uses the *same* advisory ingredient lock on the public PR and approved
 * proposal writers. No migration, app-managed unique ingredient constraint,
 * or caller-controlled source key is necessary for active-need exclusion.
 */
export const AI_LN_DUPLICATE_NEED = 'AI_LN_DUPLICATE_VERIFIED_SHORTAGE';
export const AI_LN_STALE_SOURCE = 'AI_LN_SHORTAGE_SOURCE_REVIEW_REQUIRED';
type Tx = Prisma.TransactionClient;
type Lot = {
    quantityRemaining: Prisma.Decimal;
    qualityStatus: string;
    expirationDate: Date | null;
};
const conflict = (code: string): never => { throw new HttpError(409, code, code); };

/** Stable across Agent run IDs, suppliers, demandSourceKeys and stock cursors. */
export const automaticNeedIdentity = (ingredientId: string): string =>
    createHash('sha256').update(JSON.stringify([
        'CAFE_SINGLE_SITE', 'LOW_STOCK_REPLENISHMENT', ingredientId
    ])).digest('hex');

export type VerifiedPurchaseNeed = {
    identity: string;
    ingredientId: string;
    rowVersion: number;
    movementCursor: string;
    available: string;
    threshold: string;
    outstandingInbound: string;
};

/**
 * Consistent lock order for BOTH purchasing writers:
 *   1) ingredient advisory transaction lock
 *   2) Ingredient row FOR UPDATE
 * before reading live stock or any PR write.
 *
 * The proposal writer must call this BEFORE stockStillCurrent() takes the
 * Ingredient row lock, otherwise it could invert lock order against the
 * public PR writer and deadlock.
 */
export async function lockAutomaticIngredientSource(
    tx: Tx, ingredientId: string
): Promise<void> {
    await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext(${'purchasing-demand:' + ingredientId}))::text`;
    await tx.$queryRaw`SELECT "id" FROM "Ingredient" WHERE "id" = ${ingredientId} FOR UPDATE`;
}

/**
 * MUST run within the same PostgreSQL transaction that creates the PR.
 * The caller must establish actual Backend ADMIN/service permissions first.
 */
export async function verifyAndLockAutomaticNeed(
    tx: Tx, ingredientId: string
): Promise<VerifiedPurchaseNeed> {
    await lockAutomaticIngredientSource(tx, ingredientId);
    const ingredient = await tx.ingredient.findUnique({
        where: { id: ingredientId },
        select: {
            id: true, isActive: true, deletedAt: true, rowVersion: true,
            movementCursor: true, quantity: true, reserved: true, minThreshold: true,
            batches: { select: {
                quantityRemaining: true, qualityStatus: true, expirationDate: true
            } }
        }
    });
    if (!ingredient?.isActive || ingredient.deletedAt) return conflict(AI_LN_STALE_SOURCE);
    const physical = new Prisma.Decimal(ingredient.quantity);
    const reserved = new Prisma.Decimal(ingredient.reserved);
    const threshold = new Prisma.Decimal(ingredient.minThreshold);
    const lots = ingredient.batches as Lot[];
    const total = lots.reduce((sum, lot) => sum.plus(lot.quantityRemaining), new Prisma.Decimal(0));
    const now = new Date();
    const eligible = lots.reduce((sum, lot) =>
        lot.qualityStatus === 'AVAILABLE' &&
        (!lot.expirationDate || lot.expirationDate.getTime() > now.getTime())
            ? sum.plus(lot.quantityRemaining) : sum, new Prisma.Decimal(0));
    if (physical.lt(0) || reserved.lt(0) || !total.eq(physical) ||
        lots.some(lot => new Prisma.Decimal(lot.quantityRemaining).lt(0)) ||
        reserved.gt(eligible) || threshold.lte(0)) return conflict(AI_LN_STALE_SOURCE);

    const pendingStocktake = await tx.stockCount.findFirst({
        where: { kind: 'STOCKTAKE',
            status: { in: ['DRAFT', 'PENDING_APPROVAL', 'NEEDS_INVESTIGATION'] },
            stocktakeEntries: { some: { ingredientId } }
        }, select: { id: true }
    });
    if (pendingStocktake) return conflict(AI_LN_STALE_SOURCE);

    const outstanding = await tx.purchaseOrderItem.findMany({
        // Any unsettled line (including a cancellation under review) makes
        // another automatic commitment ambiguous. A final cancelled/rejected
        // PO is excluded; fully received rows contribute zero outstanding.
        where: { ingredientId, purchaseOrder: {
            status: { notIn: ['CANCELLED', 'REJECTED'] }
        } },
        select: { quantityOrdered: true, quantityReceived: true, conversionToBase: true }
    });
    const inbound = outstanding.reduce((sum, item) =>
        sum.plus(new Prisma.Decimal(Math.max(0, item.quantityOrdered - item.quantityReceived))
            .mul(item.conversionToBase)), new Prisma.Decimal(0));
    const available = eligible.minus(reserved);
    // A still-open PO is NOT physical stock. Without a verified supplier ETA /
    // policy, an automated second commitment is unsafe, even if not all
    // shortage is covered. Manual ADMIN review remains a separate workflow.
    if (inbound.gt(0) || available.gte(threshold)) return conflict(AI_LN_STALE_SOURCE);

    const active = await tx.purchaseRequestItem.findFirst({
        where: {
            ingredientId,
            request: { status: { in: ['PENDING', 'APPROVED', 'SENT'] } }
        }, select: { requestId: true }
    });
    if (active) return conflict(AI_LN_DUPLICATE_NEED);

    // Persisted purchaseRequest + ingredient advisory lock is the existing
    // durable claim during its active lifecycle. It is *not* globally unique
    // across closed/received business events (new replenishment is allowed).
    const identity = automaticNeedIdentity(ingredientId);
    return {
        identity, ingredientId, rowVersion: ingredient.rowVersion,
        movementCursor: ingredient.movementCursor.toString(),
        available: available.toString(), threshold: threshold.toString(),
        outstandingInbound: inbound.toString()
    };
}
