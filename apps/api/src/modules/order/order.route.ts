import { Router } from 'express';
import { asyncHandler } from '../../common/async-handler';
import { validateBody } from '../../common/validate';
import { authenticate, requireRole } from '../auth/auth.middleware';
import {
    confirmOrderPaymentHandler,
    findOrder,
    listMyOrders,
    listOrders,
    patchOrderStatus,
    storeOrder
} from './order.controller';
import { confirmPaymentSchema, createOrderSchema, orderStatusSchema } from './order.validator';

const router = Router();

router.post('/', authenticate, validateBody(createOrderSchema), asyncHandler(storeOrder));
router.get('/me', authenticate, asyncHandler(listMyOrders));
router.get('/', authenticate, requireRole(['ADMIN', 'STAFF']), asyncHandler(listOrders));
router.get('/:id', authenticate, asyncHandler(findOrder));
router.post(
    '/:id/confirm-payment',
    authenticate,
    requireRole(['ADMIN', 'STAFF']),
    validateBody(confirmPaymentSchema),
    asyncHandler(confirmOrderPaymentHandler)
);
router.patch(
    '/:id/status',
    authenticate,
    requireRole(['ADMIN', 'STAFF']),
    validateBody(orderStatusSchema),
    asyncHandler(patchOrderStatus)
);

export default router;
