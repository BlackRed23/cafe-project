import { Router } from 'express';
import { asyncHandler } from '../../common/async-handler';
import { validateBody } from '../../common/validate';
import { authenticate, requireRole } from '../auth/auth.middleware';
import {
    createPurchaseRequestFromRecommendation,
    getLogs,
    getRecommendations,
    recommendReorder,
    scanInventory
} from './agent.controller';
import { recommendReorderSchema, scanInventorySchema } from './agent.validator';
import { createPurchaseProposalRouter } from './purchase-proposal.route';
import { requireProposalService } from './purchase-proposal.route';
import { purchaseProposalService } from './purchase-proposal.service';
import { readIngredientDemandRisk } from './ingredient-demand-risk';
import { sendSuccess } from '../../common/response';
import { HttpError } from '../../common/http-error';
import { prisma } from '@cafe-project/database';
import { z } from 'zod';
import { createAgentFrontendSummaryRouter } from './agent-frontend-summary.route';
import { readIngredientSupplierEligibility } from '../supplier/supplier-eligibility.read';

const router = Router();
router.use(createAgentFrontendSummaryRouter());
router.use(createPurchaseProposalRouter());
const canView = [authenticate, requireRole(['ADMIN', 'STAFF'])];
const adminOnly = [authenticate, requireRole(['ADMIN'])];

router.get('/logs', ...canView, asyncHandler(getLogs));
router.post('/scan-inventory', ...adminOnly, validateBody(scanInventorySchema), asyncHandler(scanInventory));
router.post('/recommend-reorder', ...adminOnly, validateBody(recommendReorderSchema), asyncHandler(recommendReorder));
router.get('/recommendations', ...adminOnly, asyncHandler(getRecommendations));
router.post('/recommendations/:id/create-purchase-request', ...adminOnly, asyncHandler(createPurchaseRequestFromRecommendation));
// AI02/03/04/11/12/24: read-only ledger and supplier-risk evidence.
// Never creates PR/PO, never interprets threshold as approved procurement policy.
router.get('/demand-risk/:ingredientId', ...adminOnly, asyncHandler(async (req, res) => {
    sendSuccess(res, 200, 'Read-only demand and expiry risk.', await readIngredientDemandRisk(req.params.ingredientId));
}));
// Service-to-Backend READ endpoint. A service credential alone is NOT an
// ADMIN approval: recheck the supplied principal against the CURRENT database
// for ADMIN/active status and expose only a read-only projection.
router.get('/internal/demand-risk/:ingredientId', requireProposalService, asyncHandler(async (req, res) => {
    const parsed = z.strictObject({ actorId: z.string().trim().min(1).max(120) }).safeParse(req.query);
    if (!parsed.success) throw new HttpError(400, 'INVALID_AGENT_READ_PRINCIPAL');
    const actor = await prisma.user.findUnique({
        where: { id: parsed.data.actorId },
        select: { role: true, isActive: true }
    });
    if (!actor?.isActive || actor.role !== 'ADMIN') throw new HttpError(403, 'AGENT_READ_FORBIDDEN');
    sendSuccess(res, 200, 'Authorized service read-only demand evidence.',
        await readIngredientDemandRisk(req.params.ingredientId));
}));

// Independent service-to-Backend supplier catalog READ: the service token never
// establishes ADMIN authority. Verify the current database principal each time.
// The returned UNKNOWN supplier capacity must NEVER be promoted to CONFIRMED.
router.get('/internal/ingredients/:ingredientId/supplier-eligibility', requireProposalService,
    asyncHandler(async (req, res) => {
        const parsed = z.strictObject({ actorId: z.string().trim().min(1).max(120) }).safeParse(req.query);
        if (!parsed.success) throw new HttpError(400, 'INVALID_AGENT_READ_PRINCIPAL');
        const actor = await prisma.user.findUnique({
            where: { id: parsed.data.actorId }, select: { role: true, isActive: true }
        });
        if (!actor?.isActive || actor.role !== 'ADMIN') throw new HttpError(403, 'AGENT_READ_FORBIDDEN');
        sendSuccess(res, 200, 'Current Backend supplier catalog; no availability attestation.',
            await readIngredientSupplierEligibility(req.params.ingredientId));
    }));

// AI18/19: Bridge the persisted Backend decision into a resumed, read-only
// Agent graph. The service token is never proof of ADMIN approval: an ACTIVE
// ADMIN principal is revalidated from current PostgreSQL, and the exact
// revision/hash must still match the Backend's own serializable snapshot.
// The response omits supplier terms, untrusted notes and email content.
const statusQuery = z.strictObject({
    actorId: z.string().trim().min(1).max(120),
    version: z.coerce.number().int().positive(),
    contentHash: z.string().regex(/^[0-9a-f]{64}$/)
});
router.get('/internal/purchase-proposals/:id/status', requireProposalService, asyncHandler(async (req, res) => {
    const parsed = statusQuery.safeParse(req.query);
    if (!parsed.success) throw new HttpError(400, 'INVALID_AGENT_APPROVAL_REFERENCE');
    sendSuccess(res, 200, 'Current persisted Backend proposal state; read-only.',
        await purchaseProposalService.readReviewStatus(req.params.id, parsed.data.actorId, {
            version: parsed.data.version, contentHash: parsed.data.contentHash
        }));
}));

export default router;
