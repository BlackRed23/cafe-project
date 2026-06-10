import type { Response } from 'express';
import { sendError, sendSuccess } from '../../common/response';
import type { AuthenticatedRequest } from '../auth/auth.middleware';
import { getPaymentByOrderId, updatePaymentStatus } from './payment.service';
import type { PaymentStatusInput } from './payment.validator';

export const findPaymentByOrder = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    if (!req.user) return sendError(res, 401, 'Authentication is required.');
    const payment = await getPaymentByOrderId(req.params.orderId, req.user);
    sendSuccess(res, 200, 'Get payment successfully.', { payment });
};

export const patchPaymentStatus = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    const payment = await updatePaymentStatus(req.params.id, req.body as PaymentStatusInput);
    sendSuccess(res, 200, 'Update payment successfully.', { payment });
};