import { prisma, Prisma } from '@cafe-project/database';
import { HttpError } from '../../common/http-error';

// Read-only and snapshot-consistent. Never modifies quantities or historical ledger.
export const reconcileIngredientInventory = async (ingredientId: string) =>
    prisma.$transaction(async tx => {
        const ingredient = await tx.ingredient.findUnique({
            where: { id: ingredientId },
            include: { batches: { select: { id: true, quantityRemaining: true, qualityStatus: true } } }
        });
        if (!ingredient || ingredient.deletedAt) throw new HttpError(404, 'Không tìm thấy nguyên liệu.');

        const transactions = await tx.inventoryTransaction.findMany({
            where: { ingredientId },
            select: { id: true, batchId: true, type: true, quantity: true, referenceType: true, referenceId: true, createdAt: true },
            orderBy: [{ createdAt: 'asc' }, { id: 'asc' }]
        });
        const physical = new Prisma.Decimal(ingredient.quantity);
        const batchTotal = ingredient.batches.reduce((sum, batch) => sum.add(batch.quantityRemaining), new Prisma.Decimal(0));
        const physicalTypes = new Set(['IMPORT', 'CONSUME', 'WASTE', 'RETURN', 'ADJUSTMENT', 'DAMAGE', 'SIMULATE_SALE']);
        const reservationTypes = new Set(['RESERVE', 'RELEASE', 'CANCEL']);
        const movementRows = transactions.filter(row => physicalTypes.has(row.type));
        const reservationOnly = transactions.filter(row => reservationTypes.has(row.type));
        const unclassified = transactions.filter(row => !physicalTypes.has(row.type) && !reservationTypes.has(row.type));
        const netMovements = movementRows.reduce((sum, row) => sum.add(row.quantity), new Prisma.Decimal(0));

        return {
            ingredientId,
            evaluatedAt: new Date().toISOString(),
            physicalQuantity: physical.toString(),
            batchQuantity: batchTotal.toString(),
            aggregateBatchDifference: physical.sub(batchTotal).toString(),
            aggregateBatchConsistent: physical.eq(batchTotal),
            ledgerNetMovements: netMovements.toString(),
            ledgerBalanceDifference: physical.sub(netMovements).toString(),
            // Imported/seeded historical opening balances are not provable from this ledger.
            ledgerBaseline: 'UNVERIFIED',
            ledgerDifferenceIsDefinitive: false,
            movementCount: movementRows.length,
            movementReferences: movementRows.map(row => ({ id: row.id, batchId: row.batchId, type: row.type,
                quantity: row.quantity.toString(), referenceType: row.referenceType, referenceId: row.referenceId })),
            reservationOnlyCount: reservationOnly.length,
            unclassifiedMovements: unclassified.map(row => ({ id: row.id, type: row.type })),
            batches: ingredient.batches.map(batch => ({ id: batch.id, quantityRemaining: batch.quantityRemaining.toString(), qualityStatus: batch.qualityStatus }))
        };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead });
