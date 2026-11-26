/**
 * Production-bound, scoped READ adapters for existing UnifiedToolRegistry.
 *
 * Source is the same authoritative PostgreSQL as Backend, not a mock. Registry
 * enforces strict Backend tool contracts, role checks, versions and WRITE denial.
 * No purchase/stock mutation handler is registered; API's financial and
 * demand-risk policy remains exclusively Backend-owned.
 */
import { prisma, Prisma } from '@cafe-project/database';
import { requireAgentUser } from '../internal-auth';
import { createToolRegistry } from './tool-registry';
import { createD4LiveToolBindings } from './integration/d4-live-tool-bindings';

const bounded = (value: Prisma.Decimal | number): number => {
    const number = Number(value);
    if (!Number.isFinite(number) || number < 0 || number > 1e12) throw new Error('ANOMALOUS_INVENTORY');
    return number;
};

/** No unscoped inventory access: only ingredients from the verified scan. */
export function createLiveBackendReadRegistry(ingredientIds: readonly string[]) {
    const scope = new Set(ingredientIds);
    if (!scope.size || scope.size > 30 || [...scope].some(id => !/^[A-Za-z0-9][A-Za-z0-9:_-]{0,119}$/.test(id))) {
        throw new Error('INVALID_INVENTORY_SCOPE');
    }
    const read = async (id: string) => {
        if (!scope.has(id)) throw Object.assign(new Error('FORBIDDEN'), { statusCode: 403 });
        const ingredient = await prisma.ingredient.findFirst({
            where: { id, isActive: true, deletedAt: null },
            include: { batches: { orderBy: [{ expirationDate: 'asc' }, { id: 'asc' }] } }
        });
        if (!ingredient) throw Object.assign(new Error('NOT_FOUND'), { statusCode: 404 });
        if (!['g', 'ml', 'piece'].includes(ingredient.baseUnit) ||
            !Number.isSafeInteger(ingredient.rowVersion) || ingredient.rowVersion < 0 ||
            ingredient.batches.length > 1000) throw new Error('ANOMALOUS_INVENTORY');
        const sum = ingredient.batches.reduce((total, batch) => total.plus(batch.quantityRemaining), new Prisma.Decimal(0));
        if (!sum.eq(ingredient.quantity) || bounded(ingredient.reserved) > bounded(ingredient.quantity)) {
            throw new Error('ANOMALOUS_INVENTORY');
        }
        return ingredient;
    };
    const d4Reads = createD4LiveToolBindings(ingredientIds);
    return createToolRegistry({
        authorize: async (actorId, permission) => {
            if (!['inventory.read', 'supplier.read', 'purchase.plan', 'purchase.read'].includes(permission)) {
                throw Object.assign(new Error('FORBIDDEN'), { statusCode: 403 });
            }
            return requireAgentUser(actorId, ['ADMIN']);
        },
        availability: async id => {
            const row = await read(id);
            return {
                ingredientId: id, baseUnit: row.baseUnit, quantity: bounded(row.quantity),
                reserved: bounded(row.reserved),
                // Aggregate stock only. Not quality/expiry-safe sellable stock.
                available: bounded(row.quantity) - bounded(row.reserved),
                active: row.isActive, rowVersion: row.rowVersion
            };
        },
        suppliers: async id => {
            await read(id); // ingredient scope, live status and current role are all revalidated
            const rows = await prisma.supplierIngredient.findMany({
                where: { ingredientId: id, supplier: { status: 'ACTIVE', deletedAt: null } },
                include: { supplier: { select: { status: true, deletedAt: true } } },
                orderBy: [{ isPreferred: 'desc' }, { pricePerBaseUnit: 'asc' }, { supplierId: 'asc' }]
            });
            if (rows.length > 100) throw new Error('ANOMALOUS_INVENTORY');
            return rows.map(row => ({
                supplierId: row.supplierId, ingredientId: row.ingredientId,
                purchaseUnit: row.purchaseUnit, conversionQuantity: bounded(row.conversionQuantity),
                baseUnit: row.conversionTargetUnit, pricePerBaseUnit: bounded(row.pricePerBaseUnit)
            }));
        },
        ...d4Reads,
        batches: async id => {
            const row = await read(id);
            return {
                ingredientId: id, baseUnit: row.baseUnit,
                batches: row.batches.map(batch => ({
                    id: batch.id, quantityRemaining: bounded(batch.quantityRemaining),
                    expirationDate: batch.expirationDate?.toISOString() ?? null,
                    receivedAt: batch.receivedAt.toISOString()
                }))
            };
        }
    }, 'BACKEND');
}
