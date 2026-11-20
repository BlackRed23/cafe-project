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
import { verifiedIsolatedActFault } from '../services/execution/act-isolated-fault';

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
    const counts = { availability: 0, batches: 0 };
    const fault = async (type: 'availability' | 'batches', id: string) => {
        const requested = process.env.ACT_E2E_FAULT_CASE;
        if (!requested || !process.env.ACT_E2E_FAULT_INGREDIENT_ID ||
            process.env.ACT_E2E_FAULT_INGREDIENT_ID !== id) return false;
        if (!await verifiedIsolatedActFault(id)) return false;
        const attempt = ++counts[type];
        if (requested === 'TIMEOUT' && type === 'availability') {
            // Registry's REAL 5000ms Promise.race timer, not a synthetic TIMEOUT response.
            await new Promise(resolve => setTimeout(resolve, 5300));
        }
        if (requested === 'TRANSIENT' && type === 'availability' && attempt === 1) {
            throw Object.assign(new Error('TEST_OWNED_TRANSIENT_SERVICE_FAILURE'), { statusCode: 503 });
        }
        if (requested === 'SECOND_STEP_NOT_FOUND' && type === 'batches') {
            throw Object.assign(new Error('TEST_OWNED_SECOND_STEP_NOT_FOUND'), { statusCode: 404 });
        }
        return requested === 'INVALID_OUTPUT' && type === 'availability';
    };
    return createToolRegistry({
        authorize: async (actorId, permission) => {
            if (permission !== 'inventory.read') throw Object.assign(new Error('FORBIDDEN'), { statusCode: 403 });
            return requireAgentUser(actorId, ['ADMIN']);
        },
        availability: async id => {
            if (await fault('availability', id)) {
                // Test-only contract violation; Registry must reject it before Graph trust.
                const row = await read(id);
                return { ingredientId: id, baseUnit: row.baseUnit, quantity: 'INVALID',
                    reserved: 0, available: 0, active: true, rowVersion: row.rowVersion };
            }
            const row = await read(id);
            return {
                ingredientId: id, baseUnit: row.baseUnit, quantity: bounded(row.quantity),
                reserved: bounded(row.reserved),
                // Aggregate stock only. Not quality/expiry-safe sellable stock.
                available: bounded(row.quantity) - bounded(row.reserved),
                active: row.isActive, rowVersion: row.rowVersion
            };
        },
        batches: async id => {
            await fault('batches', id);
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
