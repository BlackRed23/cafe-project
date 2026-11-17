import { createHash, randomUUID } from 'node:crypto';
import { prisma, Prisma, type PrismaClient } from '@cafe-project/database';
import { z } from 'zod';
import { HttpError } from '../../common/http-error';

const id = z.string().trim().min(1).max(200);
const amount = z.string().regex(/^(0|[1-9]\d{0,9})(\.\d{1,2})?$/);
export const proposalSnapshotSchema = z.object({
    supplierId: id,
    ingredientId: id.optional(),
    inventoryId: id.optional(),
    quantity: z.number().int().positive().max(2147483647),
    unit: id,
    baseUnit: id,
    unitsPerPack: z.string().max(32).regex(/^[1-9]\d*(\.\d{1,3})?$|^0\.\d{1,3}$/)
        .refine(value => new Prisma.Decimal(value).gt(0)).transform(value => new Prisma.Decimal(value).toString()),
    unitPrice: amount.transform(value => new Prisma.Decimal(value).toFixed(2)),
    notes: z.string().max(10000).default(''),
    emailContent: z.string().max(20000).nullable().default(null),
}).strict().refine(s => Boolean(s.ingredientId) !== Boolean(s.inventoryId), 'Exactly one stock identity required');
export const proposalReferenceSchema = z.object({
    version: z.number().int().positive(), contentHash: z.string().regex(/^[a-f0-9]{64}$/),
}).strict();
export const proposalExecuteSchema = proposalReferenceSchema.extend({ idempotencyKey: id }).strict();
export type ProposalSnapshot = z.infer<typeof proposalSnapshotSchema>;
type Reference = z.infer<typeof proposalReferenceSchema>;
type Tx = Prisma.TransactionClient;
// Flat, schema-ordered scalar contracts; sort keys so JSONB storage order is irrelevant.
const digest = (value: object) => createHash('sha256').update(JSON.stringify(value, Object.keys(value).sort())).digest('hex');
const conflict = (code: string): never => { throw new HttpError(409, code); };
const includeRequest = { items: true } as const;

/** All business writes live here. No HTTP/LLM inside transactions. */
export class PurchaseProposalService {
    constructor(private readonly db: PrismaClient = prisma) {}

    private async transaction<T>(work: (tx: Tx) => Promise<T>): Promise<T> {
        for (let attempt = 0; ; attempt++) {
            try { return await this.db.$transaction(work, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable }); }
            catch (error) {
                const code = (error as { code?: string }).code;
                // A concurrent unique-key winner is reread by the entire transaction.
                if (attempt >= 3 || !['P2034', 'P2002'].includes(code ?? '')) throw error;
            }
        }
    }
    private async admin(tx: Tx, actorId: string) {
        const user = await tx.user.findUnique({ where: { id: actorId }, select: { id: true, role: true, isActive: true } });
        if (!user?.isActive || user.role !== 'ADMIN') throw new HttpError(403, 'ADMIN_REQUIRED');
    }
    private async current(tx: Tx, proposalId: string, reference?: Reference) {
        await tx.$queryRaw`SELECT "id" FROM "AgentPurchaseProposal" WHERE "id" = ${proposalId} FOR UPDATE`;
        const proposal = await tx.agentPurchaseProposal.findUnique({ where: { id: proposalId } });
        if (!proposal) throw new HttpError(404, 'PROPOSAL_NOT_FOUND');
        const revision = await tx.agentPurchaseProposalVersion.findUnique({ where: { proposalId_version: { proposalId, version: proposal.currentVersion } } });
        if (!revision) return conflict('MISSING_REVISION');
        if (reference && (reference.version !== revision.version || reference.contentHash !== revision.contentHash)) return conflict('STALE_PROPOSAL');
        const snapshot = proposalSnapshotSchema.parse(revision.snapshot);
        if (digest(snapshot) !== revision.contentHash) return conflict('SNAPSHOT_INTEGRITY');
        return { revision, snapshot };
    }
    private async terms(tx: Tx, snapshot: ProposalSnapshot) {
        const supplier = await tx.supplier.findUnique({ where: { id: snapshot.supplierId } });
        if (!supplier || supplier.deletedAt || supplier.status !== 'ACTIVE') return conflict('SUPPLIER_UNAVAILABLE');
        if (snapshot.ingredientId) {
            const ingredient = await tx.ingredient.findUnique({ where: { id: snapshot.ingredientId } });
            const link = await tx.supplierIngredient.findUnique({ where: { supplierId_ingredientId: { supplierId: snapshot.supplierId, ingredientId: snapshot.ingredientId } } });
            if (!ingredient?.isActive || ingredient.deletedAt || !link) return conflict('INGREDIENT_UNAVAILABLE');
            if (snapshot.baseUnit !== ingredient.baseUnit || link.conversionTargetUnit !== ingredient.baseUnit ||
                snapshot.unit !== link.purchaseUnit || !new Prisma.Decimal(snapshot.unitsPerPack).eq(link.conversionQuantity) ||
                snapshot.quantity < link.minOrderQuantity ||
                !new Prisma.Decimal(snapshot.unitPrice).eq(new Prisma.Decimal(link.pricePerBaseUnit).mul(link.conversionQuantity).toDecimalPlaces(2))) return conflict('SUPPLIER_TERMS_CHANGED');
            return { ingredientId: ingredient.id };
        }
        const inventory = await tx.inventory.findUnique({ where: { id: snapshot.inventoryId! }, include: { product: true } });
        if (!inventory?.product.isActive || inventory.product.deletedAt) return conflict('INVENTORY_UNAVAILABLE');
        const link = await tx.supplierProduct.findUnique({ where: { supplierId_productId: { supplierId: snapshot.supplierId, productId: inventory.productId } } });
        if (!link || snapshot.unit !== inventory.unit || snapshot.baseUnit !== inventory.unit || snapshot.unitsPerPack !== '1' ||
            !new Prisma.Decimal(snapshot.unitPrice).eq(link.price)) return conflict('SUPPLIER_TERMS_CHANGED');
        return { inventoryId: inventory.id, productId: inventory.productId };
    }
    async create(proposalId: string, raw: unknown) {
        id.parse(proposalId);
        const snapshot = proposalSnapshotSchema.parse(raw), contentHash = digest(snapshot);
        return this.transaction(async tx => {
            const existing = await tx.agentPurchaseProposal.findUnique({ where: { id: proposalId } });
            if (existing) {
                const result = await this.current(tx, proposalId);
                if (result.revision.version !== 1 || result.revision.contentHash !== contentHash) return conflict('IDEMPOTENCY_CONFLICT');
                return result.revision;
            }
            await this.terms(tx, snapshot);
            await tx.agentPurchaseProposal.create({ data: { id: proposalId } });
            return tx.agentPurchaseProposalVersion.create({ data: { proposalId, version: 1, snapshot, contentHash } });
        });
    }
    async get(proposalId: string) {
        id.parse(proposalId);
        return this.transaction(async tx => {
            const { revision } = await this.current(tx, proposalId);
            const purchaseRequest = await tx.purchaseRequest.findUnique({ where: { agentProposalId_agentProposalVersion: { agentProposalId: proposalId, agentProposalVersion: revision.version } }, include: includeRequest });
            return { ...revision, purchaseRequest };
        });
    }
    async revise(proposalId: string, rawReference: unknown, rawSnapshot: unknown) {
        const reference = proposalReferenceSchema.parse(rawReference), snapshot = proposalSnapshotSchema.parse(rawSnapshot);
        return this.transaction(async tx => {
            const { revision } = await this.current(tx, proposalId, reference);
            if (await tx.purchaseRequest.findFirst({ where: { agentProposalId: proposalId } })) return conflict('PROPOSAL_ALREADY_EXECUTED');
            await this.terms(tx, snapshot);
            const version = revision.version + 1;
            await tx.agentPurchaseProposal.update({ where: { id: proposalId }, data: { currentVersion: version } });
            // Old approval remains auditable, but cannot authorize this new revision.
            return tx.agentPurchaseProposalVersion.create({ data: { proposalId, version, snapshot, contentHash: digest(snapshot) } });
        });
    }
    async approve(proposalId: string, actorId: string, raw: unknown) {
        const reference = proposalReferenceSchema.parse(raw);
        return this.transaction(async tx => {
            await this.admin(tx, actorId);
            const { revision, snapshot } = await this.current(tx, proposalId, reference);
            await this.terms(tx, snapshot);
            if (revision.approvedById) return revision;
            return tx.agentPurchaseProposalVersion.update({ where: { proposalId_version: { proposalId, version: reference.version } }, data: { approvedById: actorId, approvedAt: new Date() } });
        });
    }
    async execute(proposalId: string, raw: unknown) {
        id.parse(proposalId);
        const input = proposalExecuteSchema.parse(raw);
        const requestHash = digest({ operation: 'agent.purchase.execute', proposalId, version: input.version, contentHash: input.contentHash });
        return this.transaction(async tx => {
            const { revision, snapshot } = await this.current(tx, proposalId, input);
            const receipt = await tx.agentPurchaseCommandReceipt.findUnique({ where: { key: input.idempotencyKey } });
            if (receipt && receipt.requestHash !== requestHash) return conflict('IDEMPOTENCY_CONFLICT');
            let request = await tx.purchaseRequest.findUnique({ where: { agentProposalId_agentProposalVersion: { agentProposalId: proposalId, agentProposalVersion: input.version } }, include: includeRequest });
            if (receipt && (!request || receipt.purchaseRequestId !== request.id)) return conflict('RECEIPT_INTEGRITY');
            if (!request) {
                if (!revision.approvedById || !revision.approvedAt) throw new HttpError(403, 'APPROVAL_REQUIRED');
                await this.admin(tx, revision.approvedById);
                const stock = await this.terms(tx, snapshot);
                const totalAmount = new Prisma.Decimal(snapshot.unitPrice).mul(snapshot.quantity);
                if (totalAmount.gte('10000000000')) return conflict('TOTAL_AMOUNT_OUT_OF_RANGE');
                request = await tx.purchaseRequest.create({ data: {
                    requestNumber: `AI-${randomUUID()}`, supplierId: snapshot.supplierId,
                    requestedBy: revision.approvedById, approvedBy: revision.approvedById, approvedAt: revision.approvedAt,
                    status: 'APPROVED', aiGenerated: true, notes: snapshot.notes, emailContent: snapshot.emailContent,
                    totalAmount, agentProposalId: proposalId, agentProposalVersion: input.version,
                    items: { create: { ...stock, quantity: snapshot.quantity, unitPrice: snapshot.unitPrice, notes: snapshot.notes } },
                }, include: includeRequest });
            }
            if (!receipt) await tx.agentPurchaseCommandReceipt.create({ data: { key: input.idempotencyKey, requestHash, purchaseRequestId: request.id } });
            return { proposalId, version: revision.version, contentHash: revision.contentHash, snapshot, purchaseRequest: request };
        });
    }
}

export const purchaseProposalService = new PurchaseProposalService();
