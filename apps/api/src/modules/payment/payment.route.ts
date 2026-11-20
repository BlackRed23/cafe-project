import { Router } from 'express';
import { asyncHandler } from '../../common/async-handler';
import { validateBody } from '../../common/validate';
import { authenticate, requireRole } from '../auth/auth.middleware';
import {
    attestCashRefundHandler,
    createPaymentUrlHandler,
    executeRefundHandler,
    findPaymentByOrder,
    getRefundHandler,
    markPaymentRefundedHandler,
    momoWebhookHandler,
    patchPaymentStatus,
    reconcilePaymentHandler,
    reconcileRefundHandler,
    requestRefundHandler,
    simulateMoMoIpnHandler,
    vnpayIpnHandler
} from './payment.controller';
import {
    attestCashRefundSchema,
    createPaymentUrlSchema,
    markRefundedSchema,
    momoWebhookSchema,
    paymentStatusSchema,
    requestRefundSchema,
    simulateMoMoIpnSchema
} from './payment.validator';

const router = Router();

// Public Webhook / IPN routes (No JWT required, protected by HMAC signature)
// Placed BEFORE parameterized routes like /:id/status
router.post('/webhook/momo', validateBody(momoWebhookSchema), asyncHandler(momoWebhookHandler));
router.get('/webhook/vnpay-ipn', asyncHandler(vnpayIpnHandler));

// Dev-only IPN simulator (returns 404 in production)
router.post(
    '/dev/simulate-ipn',
    authenticate,
    requireRole(['ADMIN']),
    validateBody(simulateMoMoIpnSchema),
    asyncHandler(simulateMoMoIpnHandler)
);

// Authenticated routes
router.post('/create-url', authenticate, validateBody(createPaymentUrlSchema), asyncHandler(createPaymentUrlHandler));
router.get('/order/:orderId', authenticate, asyncHandler(findPaymentByOrder));
router.post('/:id/reconcile', authenticate, requireRole(['ADMIN']), asyncHandler(reconcilePaymentHandler));
router.post('/:id/refunds', authenticate, requireRole(['ADMIN']), validateBody(requestRefundSchema), asyncHandler(requestRefundHandler));
router.get('/:id/refunds/:refundId', authenticate, requireRole(['ADMIN']), asyncHandler(getRefundHandler));
router.post('/:id/refunds/:refundId/execute', authenticate, requireRole(['ADMIN']), asyncHandler(executeRefundHandler));
router.post('/:id/refunds/:refundId/reconcile', authenticate, requireRole(['ADMIN']), asyncHandler(reconcileRefundHandler));
router.post('/:id/refunds/:refundId/attest-cash', authenticate, requireRole(['ADMIN']), validateBody(attestCashRefundSchema), asyncHandler(attestCashRefundHandler));
router.post(
    '/:id/mark-refunded',
    authenticate,
    requireRole(['ADMIN']),
    validateBody(markRefundedSchema),
    asyncHandler(markPaymentRefundedHandler)
);
router.patch(
    '/:id/status',
    authenticate,
    requireRole(['ADMIN', 'STAFF']),
    validateBody(paymentStatusSchema),
    asyncHandler(patchPaymentStatus)
);

export default router;
