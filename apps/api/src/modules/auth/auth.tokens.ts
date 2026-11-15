import jwt from 'jsonwebtoken';
import { HttpError } from '../../common/http-error';
import type { JwtUserPayload } from './auth.service';

/** Shared verifier; no account repository, environment loader or database import. */
export function verifySignedToken(token: string, secret: string): JwtUserPayload {
    try {
        const decoded = jwt.verify(token, secret) as JwtUserPayload;
        if (!decoded.id || !decoded.email || !decoded.role) throw new HttpError(401, 'Dữ liệu token không hợp lệ.');
        return { id: decoded.id, email: decoded.email, role: decoded.role };
    } catch (error) {
        if (error instanceof HttpError) throw error;
        throw new HttpError(401, 'Token không hợp lệ hoặc đã hết hạn.');
    }
}
