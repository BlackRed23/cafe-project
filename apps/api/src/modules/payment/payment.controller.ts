import type { Request, Response } from 'express';
import { sendError, sendSuccess } from '../../common/response';
import type { AuthenticatedRequest } from '../auth/auth.middleware';
import type { MoMoIpnPayload } from './momo.gateway';
import type { VNPayIpnQuery } from './vnpay.gateway';
import {
    createPaymentUrl,
    getPaymentByOrderId,
    processMoMoWebhook,
    processVNPayIpn,
    updatePaymentStatus
} from './payment.service';
import type { CreatePaymentUrlInput, PaymentStatusInput } from './payment.validator';

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
    const payment = await updatePaymentStatus(req.params.id, req.body as PaymentStatusInput);
    sendSuccess(res, 200, 'Update payment successfully.', { payment });
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
