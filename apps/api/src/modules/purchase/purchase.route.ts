import { Router } from 'express';
import { asyncHandler } from '../../common/async-handler';
import { validateBody } from '../../common/validate';
import { authenticate, requireRole } from '../auth/auth.middleware';
import { approvePurchaseRequest, completePurchaseRequest, findPurchaseRequest, listPurchaseRequests, markPurchaseRequestPaid, markPurchaseRequestSent, receivePurchaseRequest, rejectPurchaseRequest, removePurchaseRequest, storePurchaseRequest } from './purchase.controller';
import { createPurchaseRequestSchema, markPurchaseRequestPaidSchema, receivePurchaseRequestSchema, rejectPurchaseRequestSchema } from './purchase.validator';
import { getEmailPreview, sendEmail, retryEmail } from '../email/email.controller';

const router = Router();
const canView = [authenticate, requireRole(['ADMIN', 'STAFF'])];
const adminOnly = [authenticate, requireRole(['ADMIN'])];

router.get('/', ...canView, asyncHandler(listPurchaseRequests));
router.get('/:id', ...canView, asyncHandler(findPurchaseRequest));
router.post('/', ...adminOnly, validateBody(createPurchaseRequestSchema), asyncHandler(storePurchaseRequest));
router.patch('/:id/approve', ...adminOnly, asyncHandler(approvePurchaseRequest));
router.patch('/:id/reject', ...adminOnly, validateBody(rejectPurchaseRequestSchema), asyncHandler(rejectPurchaseRequest));
router.patch('/:id/mark-sent', ...adminOnly, asyncHandler(markPurchaseRequestSent));
router.patch('/:id/receive', ...adminOnly, validateBody(receivePurchaseRequestSchema), asyncHandler(receivePurchaseRequest));
router.post('/:id/mark-paid', ...adminOnly, validateBody(markPurchaseRequestPaidSchema), asyncHandler(markPurchaseRequestPaid));
router.patch('/:id/complete', ...adminOnly, asyncHandler(completePurchaseRequest));
router.delete('/:id', ...adminOnly, asyncHandler(removePurchaseRequest));

// Email endpoints
router.get('/:id/email-preview', ...adminOnly, asyncHandler(getEmailPreview));
router.post('/:id/send-email', ...adminOnly, asyncHandler(sendEmail));
router.post('/:id/retry-email', ...adminOnly, asyncHandler(retryEmail));

export default router;
