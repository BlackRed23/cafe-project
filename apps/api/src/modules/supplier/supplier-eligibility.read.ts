import { createHash } from 'node:crypto';
import { Prisma, prisma, type PrismaClient } from '@cafe-project/database';
import { HttpError } from '../../common/http-error';

/**
 * Source of truth: Supplier + SupplierIngredient are a commercial CATALOG,
 * not a supplier stock feed. Status CONFIRMED/UNAVAILABLE require explicit,
 * independently traceable evidence which this schema does not yet store.
 * Never infer either from ACTIVE, preferred, prices, or previous POs.
 */
export type SupplierCapacityAvailability = 'UNKNOWN' | 'CONFIRMED' | 'UNAVAILABLE';
export type SupplierCatalogEligibility = 'ELIGIBLE' | 'INELIGIBLE';

export type SupplierCatalogRow = {
    supplierId: string;
    supplier: { name: string; status: string; deletedAt: Date | null };
    purchaseUnit: string;
    conversionQuantity: Prisma.Decimal;
    conversionTargetUnit: string;
    pricePerBaseUnit: Prisma.Decimal;
    minOrderQuantity: number;
    leadTimeDays: number;
    isPreferred: boolean;
    updatedAt: Date;
};

export type SupplierSourcingObservation = {
    supplierId: string;
    supplierName: string;
    catalogEligibility: SupplierCatalogEligibility;
    catalogEligibilityReasons: string[];
    /** Current supplier stock never inferred from catalog configuration. */
    availabilityStatus: SupplierCapacityAvailability;
    availabilitySource: 'NO_SUPPLIER_AVAILABILITY_EVIDENCE';
    availableQuantityConfirmedBase: null;
    availabilityEvidenceReference: null;
    supplierExternallyVerified: false;
    terms: {
        purchaseUnit: string;
        conversionTargetUnit: string;
        conversionQuantityBase: string;
        minOrderQuantityPacks: number;
        leadTimeDaysEstimate: number;
        referencePricePerBaseUnit: string;
        priceStatus: 'CATALOG_REFERENCE_NOT_OFFER';
        preferredInCatalog: boolean;
        termsUpdatedAt: string;
    };
    draftProposalEligible: boolean;
    /** A catalog read can NEVER grant purchasing authority. */
    purchaseExecutionAuthorized: false;
    holdCodes: string[];
};

const validDecimal = (value: Prisma.Decimal): boolean => value.isFinite() && value.gt(0);

/** Pure projection; use alongside authenticated Backend database reads. */
export function projectSupplierSourcingRow(row: SupplierCatalogRow, baseUnit: string): SupplierSourcingObservation {
    const reasons: string[] = [];
    if (row.supplier.status !== 'ACTIVE' || row.supplier.deletedAt !== null) {
        reasons.push('SUPPLIER_CATALOG_INACTIVE');
    }
    if (!row.purchaseUnit.trim() || row.conversionTargetUnit !== baseUnit ||
        !validDecimal(row.conversionQuantity)) reasons.push('SUPPLIER_PACK_CONVERSION_INVALID');
    if (!Number.isInteger(row.minOrderQuantity) || row.minOrderQuantity < 1 ||
        !Number.isInteger(row.leadTimeDays) || row.leadTimeDays < 0 || row.leadTimeDays > 365 ||
        !row.pricePerBaseUnit.isFinite() || row.pricePerBaseUnit.lt(0) ||
        !Number.isFinite(row.updatedAt.getTime())) reasons.push('SUPPLIER_CATALOG_TERMS_INVALID');
    const eligible = reasons.length === 0;
    return {
        supplierId: row.supplierId,
        supplierName: row.supplier.name,
        catalogEligibility: eligible ? 'ELIGIBLE' : 'INELIGIBLE',
        catalogEligibilityReasons: reasons,
        availabilityStatus: 'UNKNOWN',
        availabilitySource: 'NO_SUPPLIER_AVAILABILITY_EVIDENCE',
        availableQuantityConfirmedBase: null,
        availabilityEvidenceReference: null,
        supplierExternallyVerified: false,
        terms: {
            purchaseUnit: row.purchaseUnit,
            conversionTargetUnit: row.conversionTargetUnit,
            conversionQuantityBase: row.conversionQuantity.toString(),
            minOrderQuantityPacks: row.minOrderQuantity,
            leadTimeDaysEstimate: row.leadTimeDays,
            referencePricePerBaseUnit: row.pricePerBaseUnit.toString(),
            priceStatus: 'CATALOG_REFERENCE_NOT_OFFER',
            preferredInCatalog: row.isPreferred,
            termsUpdatedAt: row.updatedAt.toISOString()
        },
        draftProposalEligible: eligible,
        purchaseExecutionAuthorized: false,
        holdCodes: [
            ...reasons,
            'SUPPLIER_AVAILABILITY_UNVERIFIED',
            'SUPPLIER_CAPACITY_UNVERIFIED',
            'ADMIN_APPROVAL_AND_BACKEND_PR_POLICY_REQUIRED'
        ]
    };
}

/**
 * Consistent READ transaction. No Prisma create/update/delete, no network,
 * no supplier notification and no reuse of an unverified PO as confirmation.
 */
export async function readIngredientSupplierEligibility(
    ingredientId: string, db: PrismaClient = prisma
) {
    if (!/^[A-Za-z0-9][A-Za-z0-9:_-]{0,119}$/.test(ingredientId)) {
        throw new HttpError(400, 'INVALID_INGREDIENT_ID');
    }
    return db.$transaction(async tx => {
        const ingredient = await tx.ingredient.findFirst({
            where: { id: ingredientId, isActive: true, deletedAt: null },
            select: { id: true, baseUnit: true, minThreshold: true,
                rowVersion: true, movementCursor: true }
        });
        if (!ingredient) throw new HttpError(404, 'INGREDIENT_UNAVAILABLE');
        const mappings = await tx.supplierIngredient.findMany({
            where: { ingredientId },
            select: {
                supplierId: true,
                supplier: { select: { name: true, status: true, deletedAt: true } },
                purchaseUnit: true, conversionQuantity: true, conversionTargetUnit: true,
                minOrderQuantity: true, leadTimeDays: true, pricePerBaseUnit: true,
                isPreferred: true, updatedAt: true
            },
            orderBy: [{ isPreferred: 'desc' }, { supplierId: 'asc' }],
            take: 251
        });
        // Never advertise a truncated supplier catalog as a complete shortlist.
        if (mappings.length > 250) throw new HttpError(409, 'SUPPLIER_CATALOG_TRUNCATED');
        const suppliers = mappings.map(row => projectSupplierSourcingRow(row, ingredient.baseUnit));
        // Deterministic digest proves which catalog terms and stock revision
        // were read, not any supplier availability or approved safety stock.
        const fingerprint = createHash('sha256').update(JSON.stringify({
            ingredientId: ingredient.id,
            rowVersion: ingredient.rowVersion,
            movementCursor: ingredient.movementCursor.toString(),
            baseUnit: ingredient.baseUnit,
            minThreshold: ingredient.minThreshold.toString(),
            suppliers: suppliers.map(row => ({ id: row.supplierId, eligibility: row.catalogEligibility,
                terms: row.terms, source: row.availabilitySource }))
        })).digest('hex');
        return {
            ingredientId: ingredient.id,
            asOf: new Date().toISOString(),
            stockSource: { rowVersion: ingredient.rowVersion,
                movementCursor: ingredient.movementCursor.toString(),
                thresholdBase: ingredient.minThreshold.toString(),
                baseUnit: ingredient.baseUnit },
            reorderPolicy: {
                thresholdBasis: 'INGREDIENT_MIN_THRESHOLD' as const,
                thresholdVerifiedFromBackend: true as const,
                safetyStockBase: null,
                safetyStockApproved: false as const,
                forecastApproved: false as const,
                reorderQuantityComputed: false as const,
                disposition: 'REVIEW_ONLY' as const,
                codes: ['SAFETY_STOCK_POLICY_NOT_ATTESTED', 'FORECAST_PROVENANCE_NOT_ATTESTED']
            },
            suppliers,
            catalogDigest: fingerprint,
            writesPerformed: false as const,
            noSupplierMessages: true as const,
            noPurchaseRequestOrOrderCreated: true as const
        };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead, timeout: 15000 });
}
