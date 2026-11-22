/**
 * Production adapter for the ONLY AgentWorkflow LangGraph's optional D4 draft
 * proposal and previously human-approved PR transition. No mock bridge,
 * supplier notification, ADMIN approval, payment, or direct Prisma PR writes.
 */
import { prisma, Prisma } from '@cafe-project/database';
import { requireAgentUser } from '../internal-auth';
import { agentRepository } from '../repositories/agent.repository';
import { submitPurchaseProposal, executeApprovedPurchaseProposal } from '../services/purchase-proposal.client';
import { d4ContextSchema, type D4Context, type D4Recommendation } from
    './integration/d4-purchasing-intelligence';
import type { GraphPurchaseReference } from './agent-langgraph';

const graphIdPattern = /^[0-9a-f]{64}$/;
/** A real process kill *after* a confirmed Backend HTTP write response, but
 * before the StateGraph checkpoint. Strict isolated E2E only; never callable
 * in production or against the shared cafedb. No effect unless explicitly set. */
async function isolatedCrashAfterCommit(seam: 'BEFORE_PROPOSAL' | 'PROPOSAL' | 'PR'): Promise<void> {
    const beforeProposal = seam === 'BEFORE_PROPOSAL' &&
        process.env.AGENT_GRAPH_E2E_KILL_BEFORE_PROPOSAL === 'YES';
    if (seam === 'BEFORE_PROPOSAL' ? !beforeProposal :
        process.env.AGENT_GRAPH_E2E_KILL_AFTER_COMMIT !== seam) return;
    const expectedName = process.env.AGENT130_GRAPH_PR_DB ?? '';
    const expectedOid = process.env.AGENT130_GRAPH_PR_OID ?? '';
    let dbName = '';
    try { dbName = decodeURIComponent(new URL(process.env.DATABASE_URL ?? '').pathname.slice(1)); }
    catch { throw new Error('GRAPH_CRASH_TEST_ISOLATION_UNVERIFIED'); }
    if (process.env.NODE_ENV !== 'test' ||
        process.env.AGENT130_SEVEN_STRICT !== 'YES' ||
        process.env.AGENT130_FULL_FLOW_ISOLATED !== 'YES' ||
        process.env.AGENT130_GRAPH_PR_CONFIRMED !== 'YES' ||
        !/^agent130_graph_pr_[a-f0-9]{12}$/.test(expectedName) ||
        dbName !== expectedName || !/^\d+$/.test(expectedOid)) {
        throw new Error('GRAPH_CRASH_TEST_ISOLATION_UNVERIFIED');
    }
    const [identity] = await prisma.$queryRaw<Array<{
        name: string; oid: string; role: string; owner: string; schema: string
    }>>`SELECT current_database() AS name,
        (SELECT oid::text FROM pg_database WHERE datname=current_database()) AS oid,
        current_user AS role, current_schema() AS schema,
        (SELECT pg_get_userbyid(datdba) FROM pg_database WHERE datname=current_database()) AS owner`;
    if (!identity || identity.name !== expectedName || identity.oid !== expectedOid ||
        identity.role !== 'agent130_graph_owner' ||
        identity.owner !== 'agent130_graph_owner' || identity.schema !== 'public') {
        throw new Error('GRAPH_CRASH_TEST_ISOLATION_UNVERIFIED');
    }
    process.kill(process.pid, 'SIGKILL');
    throw new Error('GRAPH_TEST_PROCESS_KILL_FAILED');
}
function enabled(graphId: string) {
    if (process.env.AGENT_GRAPH_PURCHASING !== 'YES' ||
        process.env.AGENT_GRAPH_PG_READONLY !== 'YES' ||
        process.env.AGENT_GRAPH_READONLY !== 'YES' ||
        process.env.AGENT_D4_PURCHASING_INTELLIGENCE !== 'YES' ||
        !graphIdPattern.test(graphId)) {
        throw new Error('GRAPH_PURCHASING_DISABLED');
    }
}

/** Only a fully independently attested, no-HOLD D4 candidate can become a draft. */
export async function createVerifiedGraphD4Proposal(actorId: string, graphId: string,
    context: D4Context, recommendation: D4Recommendation): Promise<GraphPurchaseReference> {
    enabled(graphId);
    await requireAgentUser(actorId, ['ADMIN']);
    const parsed = d4ContextSchema.safeParse(context);
    const c = parsed.success ? parsed.data : undefined;
    const r = recommendation;
    if (!c || c.actorId !== actorId || !c.provenance ||
        c.provenance.source !== 'GRAPH_AUTHENTICATED_BACKEND' ||
        c.provenance.rowVersion !== c.perception.rowVersion ||
        c.provenance.movementCursor !== c.perception.movementCursor ||
        c.provenance.demandRecords < 1 || !c.reorderPolicy ||
        c.reorderPolicy.settingsSource !== 'DATABASE' ||
        c.reorderPolicy.demandRecords !== c.provenance.demandRecords ||
        c.reorderPolicy.supplierId !== r.supplier?.supplierId ||
        c.reorderPolicy.targetStock !== r.confirmed?.targetBase ||
        c.perception.dataQualityStatus !== 'VERIFIED' ||
        c.stocktake || c.perception.pendingStocktakes ||
        c.activePurchaseRequests !== 0 || c.incomingBase !== '0' ||
        r.status !== 'REVIEW_CANDIDATE' || r.reasons.length !== 0 ||
        !r.readOnly || !r.requiresHumanApproval || r.authorizedToPurchase ||
        r.authorizedToApprove || r.authorizedToPay ||
        !r.confirmed || r.confirmed.shortageBase === '0' ||
        !r.supplier || r.confirmed.purchasePacks == null ||
        !Number.isInteger(r.confirmed.purchasePacks) ||
        r.confirmed.purchasePacks < 1 || r.confirmed.purchasePacks > 2147483647 ||
        !r.verifiedTools.includes('getIngredientAvailability') ||
        !r.verifiedTools.includes('getIngredientBatches') ||
        !r.verifiedTools.includes('findIngredientSuppliers') ||
        !r.verifiedTools.includes('calculateReorderQuantity') ||
        !c.supplierAvailability ||
        c.supplierAvailability.supplierId !== r.supplier.supplierId ||
        !(['UNKNOWN', 'CONFIRMED', 'VERIFIED_AVAILABLE'] as string[]).includes(c.supplierAvailability.status) ||
        (c.supplierAvailability.status === 'UNKNOWN'
            ? c.supplierAvailability.source !== 'BACKEND_SUPPLIER_ELIGIBILITY'
            : c.supplierAvailability.source !== 'BACKEND_SUPPLIER_CONFIRMATION')) {
        throw new Error('GRAPH_PROPOSAL_SOURCE_UNVERIFIED');
    }
    const now = Date.now();
    if (!Number.isFinite(Date.parse(c.now)) || Math.abs(now - Date.parse(c.now)) > 300000 ||
        Math.abs(now - Date.parse(c.supplierAvailability.checkedAt)) > 300000 ||
        Math.abs(now - Date.parse(c.provenance.verifiedAt)) > 300000) {
        throw new Error('STALE_CONTEXT');
    }
    const ingredient = await prisma.ingredient.findFirst({
        where: { id: c.perception.ingredientId, isActive: true, deletedAt: null },
        select: { id: true, baseUnit: true, rowVersion: true, movementCursor: true }
    });
    if (!ingredient || ingredient.baseUnit !== c.perception.baseUnit ||
        ingredient.rowVersion !== c.perception.rowVersion ||
        ingredient.movementCursor.toString() !== c.perception.movementCursor) {
        throw new Error('STALE_CONTEXT');
    }
    const storedPeriod = await prisma.systemSetting.findUnique({
        where: { key: 'inventory.reorderPlanningPeriod' }
    });
    const customPeriod = storedPeriod?.value === 'CUSTOM'
        ? await prisma.systemSetting.findUnique({
            where: { key: 'inventory.reorderPlanningCustomDays' }
        }) : null;
    if (!storedPeriod || !c.reorderPolicy ||
        c.reorderPolicy.policyUpdatedAt !== new Date(Math.max(
            storedPeriod.updatedAt.getTime(),
            customPeriod?.updatedAt.getTime() ?? 0)).toISOString() ||
        (storedPeriod.value === 'WEEKLY' ? 7 :
            storedPeriod.value === 'MONTHLY' ? 30 :
                Number(customPeriod?.value)) !== c.reorderPolicy.planningDays) {
        throw new Error('STALE_POLICY');
    }
    const supply = await agentRepository.readIngredientSupplyState(ingredient.id);
    if (!supply || supply.rowVersion !== ingredient.rowVersion ||
        supply.movementCursor !== ingredient.movementCursor.toString() ||
        supply.inboundOutstanding > 0 ||
        new Prisma.Decimal(supply.available).toString() !==
            new Prisma.Decimal(c.perception.availableQuantity).toString()) {
        throw new Error('STALE_CONTEXT');
    }
    const link = await prisma.supplierIngredient.findFirst({
        where: { supplierId: r.supplier.supplierId, ingredientId: ingredient.id,
            supplier: { status: 'ACTIVE', deletedAt: null } },
        select: { supplierId: true, purchaseUnit: true, conversionQuantity: true,
            conversionTargetUnit: true, pricePerBaseUnit: true, minOrderQuantity: true }
    });
    if (!link || link.conversionTargetUnit !== ingredient.baseUnit ||
        link.purchaseUnit !== r.supplier.purchaseUnit ||
        !link.conversionQuantity.eq(r.supplier.packSizeBase) ||
        link.minOrderQuantity !== r.supplier.minimumPacks ||
        r.confirmed.purchasePacks < link.minOrderQuantity ||
        !new Prisma.Decimal(r.confirmed.purchaseBase || '0').eq(
            link.conversionQuantity.mul(r.confirmed.purchasePacks))) {
        throw new Error('GRAPH_PROPOSAL_SUPPLIER_UNVERIFIED');
    }
    // Deterministic ID makes a lost HTTP response safe to retry after restart.
    const proposalId = 'graph-' + graphId;
    const snapshot = {
        supplierId: link.supplierId, ingredientId: ingredient.id,
        quantity: r.confirmed.purchasePacks,
        unit: link.purchaseUnit, baseUnit: ingredient.baseUnit,
        unitsPerPack: link.conversionQuantity.toString(),
        unitPrice: link.pricePerBaseUnit.mul(link.conversionQuantity)
            .toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP).toFixed(2),
        notes: 'LangGraph D4 DRAFT requires independent ADMIN review ' + graphId +
            ' source ' + ingredient.rowVersion + '/' + ingredient.movementCursor.toString() +
            ' policy ' + c.provenance.policyRef +
            ' supplierAvailability=' + c.supplierAvailability.status +
            ' supplierShelfLife=' + (c.supplierShelfLifeDays == null ? 'UNKNOWN' : c.supplierShelfLifeDays),
        emailContent: null
    };
    // B: test-only process kill after verified Graph draft-candidate checkpoint
    // but before any Backend proposal POST. The post-commit hooks below are
    // independent; none of these flags is enabled in shared environments.
    await isolatedCrashAfterCommit('BEFORE_PROPOSAL');
    const result = await submitPurchaseProposal(snapshot, proposalId);
    await isolatedCrashAfterCommit('PROPOSAL');
    return { proposalId: result.proposalId,
        version: result.version, contentHash: result.contentHash };
}

/** Rechecks exact persisted ADMIN approval and deduplication inside Backend. */
export async function executeVerifiedGraphD4Proposal(actorId: string, graphId: string,
    reference: GraphPurchaseReference): Promise<{ purchaseRequestId: string }> {
    enabled(graphId);
    await requireAgentUser(actorId, ['ADMIN']);
    if (reference.proposalId !== 'graph-' + graphId ||
        !Number.isInteger(reference.version) || reference.version < 1 ||
        !/^[a-f0-9]{64}$/.test(reference.contentHash)) {
        throw new Error('INVALID_PROPOSAL_REFERENCE');
    }
    const result = await executeApprovedPurchaseProposal(reference.proposalId,
        { version: reference.version, contentHash: reference.contentHash },
        'graph-pr-' + graphId);
    await isolatedCrashAfterCommit('PR');
    const prId = result.purchaseRequest?.id;
    if (!result.verified || typeof prId !== 'string' || !prId) {
        throw new Error('PURCHASE_RESULT_UNVERIFIED');
    }
    return { purchaseRequestId: prId };
}
