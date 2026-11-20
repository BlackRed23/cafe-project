import type { Request, Response } from 'express';
import { HttpError } from '../../common/http-error';
import { sendError, sendSuccess } from '../../common/response';
import type { AuthenticatedRequest } from '../auth/auth.middleware';
import type { MoMoIpnPayload } from './momo.gateway';
import type { VNPayIpnQuery } from './vnpay.gateway';
import { reconcileProviderPayment } from './payment-reconciliation.service';
import { attestCashPaymentRefund, executePaymentRefund, getPaymentRefund, reconcilePaymentRefund, requestPaymentRefund } from './payment-refund.service';
import {
    createPaymentUrl,
    getPaymentByOrderId,
    markPaymentRefunded,
    processMoMoWebhook,
    processVNPayIpn,
    simulateDevMoMoIpn,
    updatePaymentStatus
} from './payment.service';
import type {
    CreatePaymentUrlInput,
    MarkRefundedInput,
    PaymentStatusInput,
    SimulateMoMoIpnInput
} from './payment.validator';
import type { AttestCashRefundInput, RequestRefundInput } from './payment.validator';

const resolveClientIp = (req: Request): string => {
    const forwarded = req.headers['x-forwarded-for'];
    if (typeof forwarded === 'string' && forwarded.trim()) {
        return forwarded.split(',')[0]!.trim();
    }
    if (Array.isArray(forwarded) && forwarded[0]) {
        return forwarded[0].trim();
    }
    return req.socket?.remoteAddress || req.ip || '127.0.0.1';
};

export const findPaymentByOrder = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    if (!req.user) return sendError(res, 401, 'Authentication is required.');
    const payment = await getPaymentByOrderId(req.params.orderId, req.user);
    sendSuccess(res, 200, 'Get payment successfully.', { payment });
};

export const patchPaymentStatus = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    if (!req.user) return sendError(res, 401, 'Authentication is required.');
    const payment = await updatePaymentStatus(req.params.id, req.body as PaymentStatusInput, req.user);
    sendSuccess(res, 200, 'Update payment successfully.', { payment });
};

export const markPaymentRefundedHandler = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    if (!req.user) return sendError(res, 401, 'Authentication is required.');
    const payment = await markPaymentRefunded(req.params.id, req.body as MarkRefundedInput, req.user);
    sendSuccess(res, 200, 'Đã xác nhận hoàn tiền thành công.', { payment });
};

export const simulateMoMoIpnHandler = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    if (process.env.NODE_ENV === 'production') {
        throw new HttpError(404, 'Not found.');
    }
    if (!req.user) return sendError(res, 401, 'Authentication is required.');
    const result = await simulateDevMoMoIpn(req.body as SimulateMoMoIpnInput);
    sendSuccess(res, 200, 'Đã giả lập IPN MoMo thành công.', result);
};

export const createPaymentUrlHandler = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    if (!req.user) return sendError(res, 401, 'Authentication is required.');
    const input = req.body as CreatePaymentUrlInput;
    const clientIp = resolveClientIp(req);
    const result = await createPaymentUrl(req.user, input, clientIp);
    sendSuccess(res, 200, 'Create payment URL successfully.', result);
};

export const momoWebhookHandler = async (req: Request, res: Response): Promise<void> => {
    await processMoMoWebhook(req.body as MoMoIpnPayload, req.headers as Record<string, unknown>);
    res.status(204).send();
};

export const vnpayIpnHandler = async (req: Request, res: Response): Promise<void> => {
    const query = req.query as unknown as VNPayIpnQuery;
    const result = await processVNPayIpn(query, req.headers as Record<string, unknown>);
    res.status(200).json(result);
};

export const reconcilePaymentHandler = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    if (!req.user) return sendError(res, 401, 'Authentication is required.');
    const result = await reconcileProviderPayment(req.params.id, req.user);
    sendSuccess(res, 200, 'Provider reconciliation recorded.', result);
};

export const requestRefundHandler = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    if (!req.user) return sendError(res, 401, 'Authentication is required.');
    const refund = await requestPaymentRefund(req.params.id, req.body as RequestRefundInput, req.user);
    sendSuccess(res, 200, 'Refund request recorded; no funds moved.', { refund });
};

export const getRefundHandler = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    if (!req.user) return sendError(res, 401, 'Authentication is required.');
    const refund = await getPaymentRefund(req.params.id, req.params.refundId, req.user);
    sendSuccess(res, 200, 'Refund ledger.', { refund });
};

export const executeRefundHandler = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    if (!req.user) return sendError(res, 401, 'Authentication is required.');
    const refund = await executePaymentRefund(req.params.id, req.params.refundId, req.user);
    sendSuccess(res, 200, 'Provider refund response recorded.', { refund });
};

export const reconcileRefundHandler = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    if (!req.user) return sendError(res, 401, 'Authentication is required.');
    const refund = await reconcilePaymentRefund(req.params.id, req.params.refundId, req.user);
    sendSuccess(res, 200, 'Refund provider reconciliation recorded.', { refund });
};

export const attestCashRefundHandler = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    if (!req.user) return sendError(res, 401, 'Authentication is required.');
    const refund = await attestCashPaymentRefund(req.params.id, req.params.refundId,
        req.body as AttestCashRefundInput, req.user);
    sendSuccess(res, 200, 'Admin đã xác nhận biên nhận hoàn tiền CASH.', { refund });
};
