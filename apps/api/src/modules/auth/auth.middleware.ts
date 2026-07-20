import type { NextFunction, Request, Response } from 'express';
import type { UserRole } from '@cafe-project/database';
import { HttpError } from '../../common/http-error';
import { sendError } from '../../common/response';
import { verifyAuthToken, type JwtUserPayload } from './auth.service';

export type AuthenticatedRequest = Request & {
    user?: JwtUserPayload;
};

const getBearerToken = (authorizationHeader: string | undefined): string | null => {
    if (!authorizationHeader?.startsWith('Bearer ')) {
        return null;
    }

    const token = authorizationHeader.slice('Bearer '.length).trim();

    return token || null;
};

export const authMiddleware = (req: AuthenticatedRequest, res: Response, next: NextFunction): void => {
    const token = getBearerToken(req.headers.authorization);

    if (!token) {
        sendError(res, 401, 'Token xác thực là bắt buộc.');
        return;
    }

    try {
        req.user = verifyAuthToken(token);
        next();
    } catch (error) {
        const statusCode = error instanceof HttpError ? error.statusCode : 401;
        const message = error instanceof Error ? error.message : 'Token không hợp lệ.';

        sendError(res, statusCode, message);
    }
};

export const roleMiddleware = (...allowedRoles: UserRole[]) => {
    return (req: AuthenticatedRequest, res: Response, next: NextFunction): void => {
        if (!req.user) {
            sendError(res, 401, 'Cần xác thực để truy cập.');
            return;
        }

        if (!allowedRoles.includes(req.user.role)) {
            sendError(res, 403, 'Bạn không có quyền truy cập.');
            return;
        }

        next();
    };
};

export const authenticate = authMiddleware;
export const requireRole = (roles: UserRole[]) => roleMiddleware(...roles);
