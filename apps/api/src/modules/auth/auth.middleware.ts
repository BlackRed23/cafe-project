import type { NextFunction, Request, Response } from 'express';
import type { Role } from '@cafe-project/types';
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

export const authenticate = (req: AuthenticatedRequest, res: Response, next: NextFunction): void => {
    const token = getBearerToken(req.headers.authorization);

    if (!token) {
        sendError(res, 401, 'Authorization token is required.');
        return;
    }

    try {
        req.user = verifyAuthToken(token);
        next();
    } catch (error) {
        const statusCode = error instanceof HttpError ? error.statusCode : 401;
        const message = error instanceof Error ? error.message : 'Invalid token.';

        sendError(res, statusCode, message);
    }
};

export const requireRole = (roles: Role[]) => {
    return (req: AuthenticatedRequest, res: Response, next: NextFunction): void => {
        if (!req.user) {
            sendError(res, 401, 'Authentication is required.');
            return;
        }

        if (!roles.includes(req.user.role)) {
            sendError(res, 403, 'Forbidden.');
            return;
        }

        next();
    };
};
