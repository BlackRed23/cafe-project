/**
 * D4 opt-in evidence acquisition. Authenticated READS only; no purchase,
 * stocktake, supplier confirmation or approval capability.
 * The Backend demand-rate is a ledger observation, not a certified forecast.
 */
import { prisma } from '@cafe-project/database';
import { z } from 'zod';
import { requireAgentUser, requireInternalSecret } from '../../internal-auth';
import { backendReadBaseUrl, fetchBackendRiskJson } from '../agent-backend-demand-risk';
import type { PerceptionContext } from '../inventory-perception';
import { createD4LiveToolBindings } from './d4-live-tool-bindings';
import { Prisma } from '@cafe-project/database';
import { TOOL_CONTRACTS } from '../tool-contracts';

const payloadSchema = z.object({
    success: z.literal(true),
    data: z.object({
        ingredientId: z.string(), asOf: z.iso.datetime(),
        baseUnit: z.enum(['g', 'ml', 'piece']),
        rowVersion: z.number().int().nonnegative(),
        movementCursor: z.string().regex(/^\d+$/),
        demand: z.object({
            model: z.literal('DETERMINISTIC_LEDGER_BASELINE'),
            evidenceWindowDays: z.literal(30),
            dailyRate: z.number().finite().nonnegative(),
            observedMovements: z.number().int().nonnegative(),
            confidence: z.enum(['LOW', 'MEDIUM', 'HIGH']) }),
        pendingStockCountItems: z.number().int().nonnegative(),
        pendingPurchaseRequestItems: z.number().int().nonnegative(),
        inboundOutstandingBase: z.number().finite().nonnegative(),
        incoming: z.array(z.object({
            purchaseOrderId: z.string(), unreceivedBase: z.number().finite().nonnegative(),
            confirmationSource: z.string(), estimatedLate: z.boolean()
        })).max(1000),
        // These risk responses are observations, never authority to approve,
        // contact a supplier or bypass Backend purchasing policy.
        providerDeliveryVerified: z.literal(false),
        purchasingDecision: z.literal('HOLD_FOR_AUTHORIZED_REVIEW'),
        policyVersionApproved: z.literal(false),
        writesPerformed: z.literal(false)
    })
});
const supplierEligibilitySchema = z.object({
    success: z.literal(true),
    data: z.object({
        ingredientId: z.string(), asOf: z.iso.datetime(),
        stockSource: z.object({
            rowVersion: z.number().int().nonnegative(),
            movementCursor: z.string().regex(/^\d+$/),
            thresholdBase: z.string(),
            baseUnit: z.enum(['g', 'ml', 'piece'])
        }),
        suppliers: z.array(z.object({
            supplierId: z.string(), catalogEligibility: z.enum(['ELIGIBLE', 'INELIGIBLE']),
            availabilityStatus: z.literal('UNKNOWN'),
            availabilitySource: z.literal('NO_SUPPLIER_AVAILABILITY_EVIDENCE'),
            supplierExternallyVerified: z.literal(false),
            draftProposalEligible: z.boolean(), purchaseExecutionAuthorized: z.literal(false),
            terms: z.object({
                purchaseUnit: z.string(), conversionTargetUnit: z.string(),
                conversionQuantityBase: z.string(), minOrderQuantityPacks: z.number().int(),
                leadTimeDaysEstimate: z.number().int(),
                referencePricePerBaseUnit: z.string(),
                preferredInCatalog: z.boolean(), termsUpdatedAt: z.iso.datetime()
            })
        })).max(250),
        catalogDigest: z.string().regex(/^[a-f0-9]{64}$/),
        writesPerformed: z.literal(false), noSupplierMessages: z.literal(true),
        noPurchaseRequestOrOrderCreated: z.literal(true)
    })
});

/** Validates Backend risk evidence, not a supplier attestation or reorder policy.
 * The Backend 7-day trimmed ALL-CONSUME rate is intentionally not certified as
 * the order-only 30-day reorder rate from calculateReorderQuantity. */
export function validateD4LiveBackendRiskPayload(
    payload: unknown,
    expected: { ingredientId: string; baseUnit: string; rowVersion: number; movementCursor: string },
    at = new Date()
) {
    const parsed = payloadSchema.safeParse(payload);
    if (!parsed.success) throw new Error('BACKEND_RISK_UNVERIFIED');
    const data = parsed.data.data;
    const ageMs = at.getTime() - Date.parse(data.asOf);
    if (!Number.isFinite(ageMs) || ageMs < -60000 || ageMs > 300000 ||
        data.ingredientId !== expected.ingredientId ||
        data.baseUnit !== expected.baseUnit ||
        data.rowVersion !== expected.rowVersion ||
        data.movementCursor !== expected.movementCursor ||
        (data.demand.observedMovements === 0 && data.demand.dailyRate !== 0) ||
        Math.abs(data.incoming.reduce((sum, row) => sum + row.unreceivedBase, 0) -
            data.inboundOutstandingBase) > 0.001 ||
        data.incoming.length > 5) {
        throw new Error('BACKEND_RISK_UNVERIFIED');
    }
    return data;
}

export type D4LivePlanningEvidence = {
    ingredientId: string;
    source: 'AUTHENTICATED_BACKEND_READ';
    rowVersion: number;
    movementCursor: string;
    demandDailyBase?: string;
    demandConfidence?: 'LOW' | 'MEDIUM' | 'HIGH';
    demandMovements?: number;
    activePurchaseRequests?: number;
    incomingBase?: string;
    purchaseOrderIds?: string[];
    pendingStocktakes?: number;
    supplierTerms: {
        supplierId: string; minOrderQuantity: number; conversionQuantity: string;
        purchaseUnit: string; pricePerBaseUnit: string;
        leadTimeDays: number; isPreferred: boolean; updatedAt: string;
    }[];
    shelfLifeDays: number | null;
    supplierCatalogDigest?: string;
    supplierAvailability?: {
        supplierId: string; status: 'UNKNOWN';
        source: 'BACKEND_SUPPLIER_ELIGIBILITY'; checkedAt: string
    };
    /** No independently established quantity safety buffer in this contract. */
    safetyStockBase?: string;
    /** Independently reread by the actual Registry during Graph execution. */
    reorderPolicy?: {
        targetStock: string; dailyConsumption: string; demandRecords: number;
        supplierId: string; policyVersion: 'OBSERVED_CONSUMPTION_V1';
        settingsSource: 'DATABASE'; planningDays: number; safetyDays: number;
        policyUpdatedAt: string;
    };
};

/** A seven-day observational risk rate is never a certified 30-day reorder
 * rate. Expose it for review only at MEDIUM/HIGH confidence; LOW has no rate
 * usable by the D4 Graph. Neither branch supplies a safety-stock policy. */
export function projectD4ObservedRiskDemand(
    data: ReturnType<typeof validateD4LiveBackendRiskPayload>
): Pick<D4LivePlanningEvidence, 'demandDailyBase' | 'demandConfidence' | 'demandMovements'> {
    if (!data.demand.observedMovements || data.demand.confidence === 'LOW') {
        return { demandConfidence: data.demand.confidence };
    }
    return {
        demandDailyBase: String(data.demand.dailyRate),
        demandConfidence: data.demand.confidence,
        demandMovements: data.demand.observedMovements
    };
}

export async function readD4LivePlanningEvidence(
    actorId: string, p: PerceptionContext, requireSourcing = false
): Promise<D4LivePlanningEvidence> {
    await requireAgentUser(actorId, ['ADMIN']);
    if (p.dataQualityStatus !== 'VERIFIED') throw new Error('STALE_CONTEXT');
    const ingredient = await prisma.ingredient.findFirst({
        where: { id: p.ingredientId, isActive: true, deletedAt: null },
        select: { id: true, rowVersion: true, movementCursor: true,
            baseUnit: true, quantity: true, reserved: true }
    });
    if (!ingredient || ingredient.rowVersion !== p.rowVersion ||
        ingredient.movementCursor.toString() !== p.movementCursor ||
        ingredient.quantity.toString() !== p.physicalQuantity ||
        ingredient.reserved.toString() !== p.reservedQuantity ||
        ingredient.baseUnit !== p.baseUnit) throw new Error('STALE_CONTEXT');
    const origin = backendReadBaseUrl();
    const url = new URL('/api/agent/internal/demand-risk/' + encodeURIComponent(p.ingredientId), origin);
    url.searchParams.set('actorId', actorId);
    const data = validateD4LiveBackendRiskPayload(
        await fetchBackendRiskJson(url, requireInternalSecret()), {
            ingredientId: p.ingredientId, baseUnit: p.baseUnit,
            rowVersion: p.rowVersion, movementCursor: p.movementCursor
        });
    const links = await prisma.supplierIngredient.findMany({
        where: { ingredientId: p.ingredientId, supplier: { status: 'ACTIVE', deletedAt: null } },
        select: { supplierId: true, minOrderQuantity: true, conversionQuantity: true,
            conversionTargetUnit: true, purchaseUnit: true, pricePerBaseUnit: true,
            leadTimeDays: true, isPreferred: true, updatedAt: true }
    });
    if (links.length > 100 || links.some(link => link.conversionTargetUnit !== p.baseUnit ||
        link.minOrderQuantity < 1 || link.leadTimeDays < 0 || link.leadTimeDays > 365 ||
        link.conversionQuantity.lte(0) || link.pricePerBaseUnit.lt(0))) {
        throw new Error('BACKEND_RISK_UNVERIFIED');
    }
    let supplierCatalogDigest: string | undefined;
    let supplierAvailability: D4LivePlanningEvidence['supplierAvailability'];
    if (requireSourcing) {
        const supplierUrl = new URL('/api/agent/internal/ingredients/' +
            encodeURIComponent(p.ingredientId) + '/supplier-eligibility', origin);
        supplierUrl.searchParams.set('actorId', actorId);
        const payload = supplierEligibilitySchema.safeParse(
            await fetchBackendRiskJson(supplierUrl, requireInternalSecret()));
        if (!payload.success) throw new Error('SUPPLIER_BACKEND_EVIDENCE_UNVERIFIED');
        const sourced = payload.data.data;
        const age = Date.now() - Date.parse(sourced.asOf);
        if (!Number.isFinite(age) || age < -60000 || age > 300000 ||
            sourced.ingredientId !== p.ingredientId ||
            sourced.stockSource.baseUnit !== p.baseUnit ||
            sourced.stockSource.rowVersion !== p.rowVersion ||
            sourced.stockSource.movementCursor !== p.movementCursor ||
            !new Prisma.Decimal(sourced.stockSource.thresholdBase).eq(p.thresholdQuantity)) {
            throw new Error('SUPPLIER_BACKEND_EVIDENCE_UNVERIFIED');
        }
        const eligible = sourced.suppliers.filter(s =>
            s.catalogEligibility === 'ELIGIBLE' && s.draftProposalEligible);
        if (eligible.length !== links.length || links.some(link => {
            const s = eligible.find(entry => entry.supplierId === link.supplierId);
            return !s || s.terms.purchaseUnit !== link.purchaseUnit ||
                s.terms.conversionTargetUnit !== p.baseUnit ||
                !new Prisma.Decimal(s.terms.conversionQuantityBase).eq(link.conversionQuantity) ||
                !new Prisma.Decimal(s.terms.referencePricePerBaseUnit).eq(link.pricePerBaseUnit) ||
                s.terms.minOrderQuantityPacks !== link.minOrderQuantity ||
                s.terms.leadTimeDaysEstimate !== link.leadTimeDays ||
                s.terms.preferredInCatalog !== link.isPreferred ||
                s.terms.termsUpdatedAt !== link.updatedAt.toISOString();
        })) throw new Error('SUPPLIER_BACKEND_EVIDENCE_UNVERIFIED');
        const preferred = [...eligible].sort((a, b) =>
            Number(b.terms.preferredInCatalog) - Number(a.terms.preferredInCatalog) ||
            Number(a.terms.referencePricePerBaseUnit) - Number(b.terms.referencePricePerBaseUnit) ||
            a.terms.leadTimeDaysEstimate - b.terms.leadTimeDaysEstimate ||
            a.supplierId.localeCompare(b.supplierId))[0];
        if (preferred) supplierAvailability = {
            supplierId: preferred.supplierId, status: 'UNKNOWN',
            source: 'BACKEND_SUPPLIER_ELIGIBILITY', checkedAt: sourced.asOf
        };
        supplierCatalogDigest = sourced.catalogDigest;
    }
    // Read the existing Backend-owned reorder implementation, rather than
    // promoting a trimmed 7-day risk observation into the 30-day order rate.
    // An invalid/missing policy or actual Order-linked CONSUME leaves the Graph
    // without provenance and therefore in HOLD. The Registry rereads this
    // independently before a proposal may be persisted.
    let reorderPolicy: D4LivePlanningEvidence['reorderPolicy'];
    let policySafetyStock: string | undefined;
    try {
        const backend = createD4LiveToolBindings([p.ingredientId]);
        if (!backend.reorder) throw new Error('REORDER_SOURCE_UNVERIFIED');
        const reorder = TOOL_CONTRACTS.calculateReorderQuantity.output.parse(
            await backend.reorder({ ingredientId: p.ingredientId }));
        if (reorder.ingredientId !== p.ingredientId ||
            reorder.ingredientVersion !== p.rowVersion ||
            reorder.settingsSource !== 'DATABASE' || reorder.demandRecords < 1 ||
            reorder.demandBasis !== 'OBSERVED_ORDER_CONSUME' ||
            reorder.policyVersion !== 'OBSERVED_CONSUMPTION_V1' ||
            !links.some(link => link.supplierId === reorder.supplierId &&
                link.leadTimeDays === reorder.leadTimeDays)) {
            throw new Error('REORDER_SOURCE_UNVERIFIED');
        }
        const period = await prisma.systemSetting.findUnique({
            where: { key: 'inventory.reorderPlanningPeriod' }
        });
        if (!period || !['WEEKLY', 'MONTHLY', 'CUSTOM'].includes(period.value))
            throw new Error('REORDER_POLICY_UNVERIFIED');
        const custom = period.value === 'CUSTOM'
            ? await prisma.systemSetting.findUnique({
                where: { key: 'inventory.reorderPlanningCustomDays' }
            }) : null;
        const days = period.value === 'WEEKLY' ? 7 :
            period.value === 'MONTHLY' ? 30 : Number(custom?.value);
        if (!Number.isInteger(days) || days !== reorder.planningDays ||
            (period.value === 'CUSTOM' && !custom))
            throw new Error('REORDER_POLICY_UNVERIFIED');
        const policyUpdatedAt = new Date(Math.max(period.updatedAt.getTime(),
            custom?.updatedAt.getTime() ?? 0)).toISOString();
        reorderPolicy = {
            targetStock: String(reorder.targetStock),
            dailyConsumption: new Prisma.Decimal(reorder.dailyConsumption).toDecimalPlaces(4).toString(),
            demandRecords: reorder.demandRecords, supplierId: reorder.supplierId,
            policyVersion: 'OBSERVED_CONSUMPTION_V1', settingsSource: 'DATABASE',
            planningDays: reorder.planningDays, safetyDays: reorder.safetyDays,
            policyUpdatedAt
        };
        policySafetyStock = new Prisma.Decimal(reorderPolicy.dailyConsumption)
            .mul(reorder.planningDays + reorder.safetyDays)
            .toDecimalPlaces(4, Prisma.Decimal.ROUND_CEIL).toString();
    } catch {
        // Explicitly retain HOLD; missing policy/consumption is not a zero-demand
        // signal, and no source gets fabricated for the proposal writer.
    }
    // No guessed safety buffer or unverified supplier stock availability.
    // Source versions are reread after tool execution by the Graph.
    return {
        ingredientId: p.ingredientId, source: 'AUTHENTICATED_BACKEND_READ',
        rowVersion: p.rowVersion, movementCursor: p.movementCursor,
        ...projectD4ObservedRiskDemand(data),
        ...(reorderPolicy ? {
            demandDailyBase: reorderPolicy.dailyConsumption,
            demandMovements: reorderPolicy.demandRecords,
            safetyStockBase: policySafetyStock!, reorderPolicy
        } : {}),
        pendingStocktakes: data.pendingStockCountItems,
        activePurchaseRequests: data.pendingPurchaseRequestItems,
        incomingBase: String(data.inboundOutstandingBase),
        purchaseOrderIds: data.incoming.map(o => o.purchaseOrderId),
        ...(supplierCatalogDigest ? { supplierCatalogDigest } : {}),
        ...(supplierAvailability ? { supplierAvailability } : {}),
        supplierTerms: links.map(l => ({
            supplierId: l.supplierId, minOrderQuantity: l.minOrderQuantity,
            conversionQuantity: l.conversionQuantity.toString(),
            purchaseUnit: l.purchaseUnit, pricePerBaseUnit: l.pricePerBaseUnit.toString(),
            leadTimeDays: l.leadTimeDays, isPreferred: l.isPreferred,
            updatedAt: l.updatedAt.toISOString()
        })),
        // Ingredient.shelfLifeDays describes ingredient storage lifetime, NOT
        // an independently verified supplier shelf-life/acceptance promise.
        // The caller maps this field to supplierShelfLifeDays, so explicitly
        // retain null and the supplier expiry policy HOLD until real evidence.
        shelfLifeDays: null
    };
}
