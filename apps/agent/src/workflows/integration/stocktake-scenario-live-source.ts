/**
 * Live PostgreSQL read for a *pending* stocktake, scoped to the already
 * authenticated ADMIN and verified one-ingredient perception.
 * No update/create/delete, stocktake approval or provisional stock mutation.
 */
import { createHash } from 'node:crypto';
import { prisma, Prisma } from '@cafe-project/database';
import { requireAgentUser } from '../../internal-auth';
import type { PerceptionContext } from '../inventory-perception';
import { stocktakeScenarioSourceSchema, type StocktakeScenarioSource } from './stocktake-scenario-continuation';

export async function readPendingStocktakeScenarioSource(
    actorId: string, context: PerceptionContext
): Promise<StocktakeScenarioSource> {
    await requireAgentUser(actorId, ['ADMIN']);
    if (context.baseUnit !== 'ml' || context.dataQualityStatus !== 'VERIFIED' ||
        context.availableQuantity !== context.physicalQuantity ||
        context.reservedQuantity !== '0') throw new Error('INVALID_SCENARIO_SOURCE');
    const ingredient = await prisma.ingredient.findFirst({
        where: { id: context.ingredientId, isActive: true, deletedAt: null },
        select: { id: true, baseUnit: true, rowVersion: true, movementCursor: true,
            quantity: true, reserved: true, minThreshold: true,
            batches: { select: { id: true } } }
    });
    if (!ingredient || ingredient.rowVersion !== context.rowVersion ||
        ingredient.movementCursor.toString() !== context.movementCursor ||
        ingredient.baseUnit !== context.baseUnit ||
        !ingredient.quantity.eq(context.physicalQuantity) ||
        !ingredient.minThreshold.eq(context.thresholdQuantity) ||
        !ingredient.reserved.eq(0)) throw new Error('STALE_CONTEXT');
    const open = await prisma.stockCount.findMany({
        where: { kind: 'STOCKTAKE',
            status: { in: ['DRAFT', 'PENDING_APPROVAL', 'NEEDS_INVESTIGATION'] },
            stocktakeEntries: { some: { ingredientId: ingredient.id } } },
        select: { id: true, status: true, revision: true, approvedAt: true,
            stocktakeEntries: {
                where: { ingredientId: ingredient.id },
                select: { batchId: true, revision: true, countedAt: true,
                    expectedAtCount: true, observedQty: true, varianceQty: true,
                    observedCursor: true }
            } }
    });
    if (open.length !== 1 || open[0]?.approvedAt ||
        !['PENDING_APPROVAL', 'NEEDS_INVESTIGATION'].includes(open[0].status)) {
        throw new Error('INVALID_SCENARIO_SOURCE');
    }
    const session = open[0];
    const entries = [...session.stocktakeEntries].sort((a, b) => a.batchId.localeCompare(b.batchId));
    if (!entries.length || entries.length !== ingredient.batches.length ||
        entries.some(entry => !entry.countedAt || !entry.observedQty ||
            !entry.expectedAtCount || !entry.varianceQty || entry.observedCursor === null ||
            entry.observedCursor.toString() !== ingredient.movementCursor.toString()) ||
        entries.some(entry => !ingredient.batches.some(batch => batch.id === entry.batchId))) {
        throw new Error('INVALID_SCENARIO_SOURCE');
    }
    const ZERO = new Prisma.Decimal(0);
    const total = (column: 'expectedAtCount' | 'observedQty' | 'varianceQty') =>
        entries.reduce((sum, entry) => sum.plus(entry[column]!), ZERO);
    const expected = total('expectedAtCount');
    const observed = total('observedQty');
    const variance = total('varianceQty');
    if (!expected.eq(ingredient.quantity) ||
        !observed.minus(expected).eq(variance) || observed.lt(0)) {
        throw new Error('INVALID_SCENARIO_SOURCE');
    }
    const revisions = entries.map(entry => ({
        batchId: entry.batchId, revision: entry.revision,
        observedCursor: entry.observedCursor!.toString()
    }));
    const digest = createHash('sha256').update(JSON.stringify([
        ingredient.id, ingredient.rowVersion, ingredient.movementCursor.toString(),
        ingredient.quantity.toString(), ingredient.minThreshold.toString(),
        session.id, session.status, session.revision,
        entries.map(entry => [entry.batchId, entry.revision, entry.expectedAtCount!.toString(),
            entry.observedQty!.toString(), entry.varianceQty!.toString(),
            entry.observedCursor!.toString(), entry.countedAt!.toISOString()])
    ])).digest('hex');
    return stocktakeScenarioSourceSchema.parse({
        ingredientId: ingredient.id, stocktakeId: session.id,
        stocktakeStatus: session.status, stocktakeRevision: session.revision,
        rowVersion: ingredient.rowVersion, movementCursor: ingredient.movementCursor.toString(),
        officialBase: ingredient.quantity.toString(),
        hypotheticalBase: observed.toString(), observedVarianceBase: variance.toString(),
        targetBase: ingredient.minThreshold.toString(), baseUnit: ingredient.baseUnit,
        entryRevisions: revisions, sourceDigest: digest
    });
}
