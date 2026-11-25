import jwt from 'jsonwebtoken';
import { HttpError } from '../../common/http-error';

const issuers: [string, ...string[]] = ['accounts.google.com', 'https://accounts.google.com'];
const invalidToken = () => new HttpError(401, 'Invalid Google credential.');

type GoogleProfile = {
    sub: string;
    email: string;
    authoritativeEmail: boolean;
    name?: string;
    picture?: string;
};

async function googleJson(url: string, options?: RequestInit): Promise<Record<string, unknown>> {
    try {
        const response = await fetch(url, {
            ...options,
            redirect: 'error',
            signal: AbortSignal.timeout(5000)
        });
        if (response.status === 400 || response.status === 401 || response.status === 403) throw invalidToken();
        if (!response.ok) throw new Error('Google request failed');
        const data: unknown = await response.json();
        if (!data || typeof data !== 'object' || Array.isArray(data)) throw new Error('Invalid Google response');
        return data as Record<string, unknown>;
    } catch (error) {
        if (error instanceof HttpError) throw error;
        throw new HttpError(503, 'Google authentication is temporarily unavailable.');
    }
}

let certs: Record<string, unknown> = {};
let certsExpireAt = 0;
let pendingCerts: Promise<void> | undefined;

async function refreshCerts(): Promise<void> {
    certs = await googleJson('https://www.googleapis.com/oauth2/v1/certs');
    // Short cache bounds rotation lag and prevents a fetch per unrecognized key.
    certsExpireAt = Date.now() + 5 * 60_000;
}

async function verifyIdToken(token: string, clientId: string): Promise<jwt.JwtPayload> {
    const decoded = jwt.decode(token, { complete: true });
    if (decoded?.header.alg !== 'RS256' || !decoded.header.kid) throw invalidToken();
    if (Date.now() >= certsExpireAt) {
        pendingCerts ??= refreshCerts().finally(() => { pendingCerts = undefined; });
        await pendingCerts;
    }
    const key = Object.prototype.hasOwnProperty.call(certs, decoded.header.kid) ? certs[decoded.header.kid] : undefined;
    if (typeof key !== 'string') throw invalidToken();

    try {
        const claims = jwt.verify(token, key, { algorithms: ['RS256'], audience: clientId, issuer: issuers });
        if (typeof claims === 'string' || !Number.isFinite(claims.exp) || claims.aud !== clientId ||
            (claims.azp !== undefined && claims.azp !== clientId)) throw invalidToken();
        return claims;
    } catch {
        throw invalidToken();
    }
}

async function verifyAccessToken(token: string, clientId: string): Promise<Record<string, unknown>> {
    const headers = { Authorization: `Bearer ${token}` };
    const info = await googleJson('https://oauth2.googleapis.com/tokeninfo', { method: 'POST', headers });
    const expiresAt = typeof info.exp === 'string' && /^\d+$/.test(info.exp) ? Number(info.exp) : info.exp;
    if (info.aud !== clientId || info.azp !== clientId ||
        typeof expiresAt !== 'number' || !Number.isFinite(expiresAt) || expiresAt <= Date.now() / 1000 ||
        typeof info.sub !== 'string' || !info.sub) throw invalidToken();

    const profile = await googleJson('https://www.googleapis.com/oauth2/v3/userinfo', { headers });
    if (profile.sub !== info.sub) throw invalidToken();
    return profile;
}

export async function verifyGoogleCredential(credential: string, kind: 'id' | 'access'): Promise<GoogleProfile> {
    const clientId = process.env.GOOGLE_CLIENT_ID?.trim();
    if (!clientId) throw new HttpError(503, 'Google authentication is not configured.');

    const profile = kind === 'id'
        ? await verifyIdToken(credential, clientId)
        : await verifyAccessToken(credential, clientId);
    if (typeof profile.sub !== 'string' || !profile.sub.trim() || profile.sub.length > 255 ||
        typeof profile.email !== 'string' || !/^[^@\s]+@[^@\s]+$/.test(profile.email) ||
        profile.email_verified !== true) throw invalidToken();

    const email = profile.email.toLowerCase();
    return {
        sub: profile.sub,
        email,
        authoritativeEmail: email.endsWith('@gmail.com') || (typeof profile.hd === 'string' && !!profile.hd.trim()),
        name: typeof profile.name === 'string' ? profile.name : undefined,
        picture: typeof profile.picture === 'string' ? profile.picture : undefined
    };
}
