import { Router } from 'express';
import { asyncHandler } from '../../common/async-handler';
import { authenticate, requireRole } from '../auth/auth.middleware';
import { getEmailPreview, sendEmail, retryEmail } from './email.controller';

const router = Router();
const adminOnly = [authenticate, requireRole(['ADMIN'])];

router.get('/:id/email-preview', ...adminOnly, asyncHandler(getEmailPreview));
router.post('/:id/send-email', ...adminOnly, asyncHandler(sendEmail));
router.post('/:id/retry-email', ...adminOnly, asyncHandler(retryEmail));

export default router;
