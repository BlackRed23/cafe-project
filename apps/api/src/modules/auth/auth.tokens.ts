import jwt from 'jsonwebtoken';
import { HttpError } from '../../common/http-error';
import type { JwtUserPayload } from './auth.types';

export const ACCESS_TOKEN_ALGORITHM = 'HS256';

/** Shared verifier; no account repository, environment loader or database import. */
export function verifySignedToken(token: string, secret: string): JwtUserPayload {
    try {
        const decoded = jwt.verify(token, secret, { algorithms: [ACCESS_TOKEN_ALGORITHM] });
        if (typeof decoded === 'string' ||
            typeof decoded.id !== 'string' || !decoded.id.trim() ||
            typeof decoded.email !== 'string' || !/^[^@\s]+@[^@\s]+$/.test(decoded.email) ||
            !Number.isFinite(decoded.exp) || !Number.isFinite(decoded.iat) ||
            !['ADMIN', 'STAFF', 'CUSTOMER'].includes(decoded.role)) {
            throw new HttpError(401, 'Invalid token claims.');
        }
        return { id: decoded.id, email: decoded.email, role: decoded.role };
    } catch (error) {
        if (error instanceof HttpError) throw error;
        throw new HttpError(401, 'Token không hợp lệ hoặc đã hết hạn.');
    }
}
