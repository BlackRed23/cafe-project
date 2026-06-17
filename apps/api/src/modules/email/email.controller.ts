import type { Response } from 'express';
import { sendSuccess, sendError } from '../../common/response';
import type { AuthenticatedRequest } from '../auth/auth.middleware';
import { emailService } from './email.service';
import { sendEmailSchema } from './email.validator';

export const getEmailPreview = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
        const preview = await emailService.getPreview(req.params.id);
        sendSuccess(res, 200, 'Get email preview successfully.', preview);
    } catch (error: any) {
        const status = error.status || 500;
        sendError(res, status, error.message || 'Unable to load email preview.');
    }
};

export const sendEmail = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    if (!req.user) {
        return sendError(res, 401, 'Authentication is required.');
    }

    try {
        const validation = sendEmailSchema.safeParse(req.body);
        if (!validation.success) {
            return sendError(res, 400, validation.error.issues[0]?.message || 'Invalid input.');
        }

        const { to, subject, body } = validation.data;
        const request = await emailService.sendEmail(req.params.id, subject, body, req.user.id, to);
        sendSuccess(res, 200, 'Email sent to supplier successfully.', { purchaseRequest: request });
    } catch (error: any) {
        const status = error.status || 500;
        sendError(res, status, error.message || 'Failed to send email.');
    }
};

export const retryEmail = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    if (!req.user) {
        return sendError(res, 401, 'Authentication is required.');
    }

    try {
        const validation = sendEmailSchema.safeParse(req.body);
        if (!validation.success) {
            return sendError(res, 400, validation.error.issues[0]?.message || 'Invalid input.');
        }

        const { to, subject, body } = validation.data;
        const request = await emailService.retryEmail(req.params.id, subject, body, req.user.id, to);
        sendSuccess(res, 200, 'Email retried successfully.', { purchaseRequest: request });
    } catch (error: any) {
        const status = error.status || 500;
        sendError(res, status, error.message || 'Failed to retry email.');
    }
};
