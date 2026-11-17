import { timingSafeEqual } from 'node:crypto';
import { Router, type RequestHandler, type ErrorRequestHandler } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../../common/async-handler';
import { HttpError } from '../../common/http-error';
import { sendSuccess } from '../../common/response';
import { authenticate, requireRole, type AuthenticatedRequest } from '../auth/auth.middleware';
import { purchaseProposalService, proposalReferenceSchema, proposalSnapshotSchema, type PurchaseProposalService } from './purchase-proposal.service';

// Service authentication grants proposal/receipt access, NEVER approval authority.
export const requireProposalService: RequestHandler = (req, _res, next) => {
    const expected = process.env.AGENT_INTERNAL_TOKEN;
    const actual = req.headers['x-agent-internal-token'];
    if (!expected || !/^[A-Za-z0-9_-]{43,}$/.test(expected) || new Set(expected).size < 12) return next(new HttpError(503, 'INTERNAL_AUTH_UNAVAILABLE'));
    if (typeof actual !== 'string' || Buffer.byteLength(actual) !== Buffer.byteLength(expected) ||
        !timingSafeEqual(Buffer.from(actual), Buffer.from(expected))) return next(new HttpError(403, 'SERVICE_FORBIDDEN'));
    next();
};

export function createPurchaseProposalRouter(service: PurchaseProposalService = purchaseProposalService) {
    const router = Router();
    const internal = Router();
    internal.use(requireProposalService);
    internal.post('/', asyncHandler(async (req, res) => {
        const body = z.object({ proposalId: z.string().min(1).max(200), snapshot: proposalSnapshotSchema }).strict().parse(req.body);
        sendSuccess(res, 201, 'Proposal saved; ADMIN approval required.', await service.create(body.proposalId, body.snapshot));
    }));
    internal.get('/:id', asyncHandler(async (req, res) => { sendSuccess(res, 200, 'Proposal.', await service.get(req.params.id)); }));
    internal.put('/:id', asyncHandler(async (req, res) => {
        const body = z.object({ reference: proposalReferenceSchema, snapshot: proposalSnapshotSchema }).strict().parse(req.body);
        sendSuccess(res, 200, 'New proposal revision; approval required.', await service.revise(req.params.id, body.reference, body.snapshot));
    }));
    internal.post('/:id/execute', asyncHandler(async (req, res) => {
        sendSuccess(res, 200, 'Approved proposal result.', await service.execute(req.params.id, req.body));
    }));
    router.use('/internal/purchase-proposals', internal);
    const admin = [authenticate, requireRole(['ADMIN'])];
    router.get('/purchase-proposals/:id', ...admin, asyncHandler(async (req, res) => {
        sendSuccess(res, 200, 'Review proposal snapshot/version/hash.', await service.get(req.params.id));
    }));
    router.post('/purchase-proposals/:id/approve', ...admin, asyncHandler(async (req: AuthenticatedRequest, res) => {
        // req.user originates exclusively from Backend JWT + current-account lookup.
        sendSuccess(res, 200, 'Exact proposal revision approved.', await service.approve(req.params.id, req.user!.id, req.body));
    }));
    router.post('/purchase-proposals/:id/execute', ...admin, asyncHandler(async (req, res) => {
        sendSuccess(res, 200, 'Approved proposal result.', await service.execute(req.params.id, req.body));
    }));
    const invalidBody: ErrorRequestHandler = (error, _req, _res, next) => {
        next(error instanceof z.ZodError ? new HttpError(400, 'INVALID_PROPOSAL_INPUT') : error);
    };
    router.use(invalidBody);
    return router;
}
