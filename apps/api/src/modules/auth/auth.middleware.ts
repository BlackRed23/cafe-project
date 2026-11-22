import type { NextFunction, Request, Response } from 'express';
import type { UserRole } from '@cafe-project/database';
import { HttpError } from '../../common/http-error';
import { sendError } from '../../common/response';
import type { JwtUserPayload } from './auth.types';
import { recordBackendDenial } from './security-denial-audit';

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

export type AuthenticationSource = {
    verifyAuthToken(token: string): JwtUserPayload;
    getCurrentUser(id: string): Promise<JwtUserPayload>;
};

/** Compatibility boundary: legacy defaults still call the existing auth service. */
export const createAuthMiddleware = (source: AuthenticationSource) => async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
    req.user = undefined;
    const token = getBearerToken(req.headers.authorization);

    if (!token) {
        await recordBackendDenial(req, 'JWT_MISSING_OR_MALFORMED');
        sendError(res, 401, 'Token xác thực là bắt buộc.');
        return;
    }

    try {
        const claims = source.verifyAuthToken(token);
        // JWT identity is signed; authorization comes from the current account.
        const current = await source.getCurrentUser(claims.id);
        req.user = { id: current.id, email: current.email, role: current.role };
    } catch (error) {
        const statusCode = error instanceof HttpError ? error.statusCode : 503;
        const message = error instanceof HttpError ? error.message : 'Không thể xác minh tài khoản lúc này.';

        await recordBackendDenial(req, statusCode === 401 ? 'JWT_INVALID' :
            statusCode === 403 ? 'ACCOUNT_DISABLED' : 'ACCOUNT_LOOKUP_FAILED');
        sendError(res, statusCode, message);
        return;
    }
    next();
};

export const authMiddleware = createAuthMiddleware({
    verifyAuthToken: token => require('./auth.service').verifyAuthToken(token),
    getCurrentUser: id => require('./auth.service').getCurrentUser(id),
});

export const roleMiddleware = (...allowedRoles: UserRole[]) => {
    return async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
        if (!req.user) {
            await recordBackendDenial(req, 'PRINCIPAL_MISSING');
            sendError(res, 401, 'Cần xác thực để truy cập.');
            return;
        }

        if (!allowedRoles.includes(req.user.role)) {
            await recordBackendDenial(req, 'ROLE_FORBIDDEN', req.user.id);
            sendError(res, 403, 'Bạn không có quyền truy cập.');
            return;
        }

        next();
    };
};

export const authenticate = authMiddleware;
export const requireRole = (roles: UserRole[]) => roleMiddleware(...roles);
