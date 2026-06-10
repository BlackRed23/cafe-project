import { Router } from 'express';
import { asyncHandler } from '../../common/async-handler';
import { validateBody } from '../../common/validate';
import { authenticate, requireRole } from '../auth/auth.middleware';
import { findPaymentByOrder, patchPaymentStatus } from './payment.controller';
import { paymentStatusSchema } from './payment.validator';

const router = Router();

router.get('/order/:orderId', authenticate, asyncHandler(findPaymentByOrder));
router.patch('/:id/status', authenticate, requireRole(['ADMIN', 'STAFF']), validateBody(paymentStatusSchema), asyncHandler(patchPaymentStatus));

export default router;