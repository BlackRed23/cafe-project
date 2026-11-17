import { Router } from 'express';
import { asyncHandler } from '../../common/async-handler';
import { validateBody } from '../../common/validate';
import { authenticate, requireRole } from '../auth/auth.middleware';
import {
    confirmOrderPaymentHandler,
    findOrder,
    findOrderByRequest,
    listMyOrders,
    listOrders,
    patchOrderStatus,
    storeOrder
} from './order.controller';
import { confirmPaymentSchema, createOrderSchema, orderStatusSchema, orderOperationSchema, approveOperationSchema, editItemsSchema, prepareItemSchema } from './order.validator';
import { requestOrderOperation, approveOrderOperation, editOrderItems, prepareReplacementItem } from './order-operations';
import { sendSuccess } from '../../common/response';
import type { AuthenticatedRequest } from '../auth/auth.middleware';

const router = Router();

router.post('/', authenticate, validateBody(createOrderSchema), asyncHandler(storeOrder));
router.get('/me', authenticate, asyncHandler(listMyOrders));
router.get('/by-request/:requestId', authenticate, asyncHandler(findOrderByRequest));
router.get('/', authenticate, requireRole(['ADMIN', 'STAFF']), asyncHandler(listOrders));
router.get('/:id', authenticate, asyncHandler(findOrder));
router.post('/:id/operations', authenticate, requireRole(['ADMIN', 'STAFF']), validateBody(orderOperationSchema),
    asyncHandler(async (req: AuthenticatedRequest, res) => {
        const operation = await requestOrderOperation(req.params.id, req.body, req.user!);
        sendSuccess(res, 201, 'Operation requested.', { operation });
    }));
router.post('/:id/operations/:operationId/approve', authenticate, requireRole(['ADMIN']), validateBody(approveOperationSchema),
    asyncHandler(async (req: AuthenticatedRequest, res) => {
        const operation = await approveOrderOperation(req.params.id, req.params.operationId, req.body.expectedVersion, req.user!);
        sendSuccess(res, 200, 'Operation approved.', { operation });
    }));
router.patch('/:id/items', authenticate, requireRole(['ADMIN', 'STAFF']), validateBody(editItemsSchema),
    asyncHandler(async (req: AuthenticatedRequest, res) => {
        const operation = await editOrderItems(req.params.id, req.body, req.user!);
        sendSuccess(res, 200, 'Order items changed.', { operation });
    }));
router.post('/:id/items/:itemId/prepare', authenticate, requireRole(['ADMIN', 'STAFF']), validateBody(prepareItemSchema),
    asyncHandler(async (req: AuthenticatedRequest, res) => {
        const operation = await prepareReplacementItem(req.params.id, req.params.itemId, req.body, req.user!);
        sendSuccess(res, 200, 'Replacement preparation started.', { operation });
    }));
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
