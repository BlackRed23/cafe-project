import type { RequestHandler } from 'express';
import { isIP } from 'node:net';
import { HttpError } from '../../common/http-error';

function clientKey(address: string): string {
    if (isIP(address) !== 6) return address;
    const canonical = new URL(`http://[${address.split('%')[0]}]/`).hostname.slice(1, -1);
    const mapped = /^::ffff:([a-f0-9]+):([a-f0-9]+)$/.exec(canonical);
    if (mapped) {
        const high = parseInt(mapped[1], 16);
        const low = parseInt(mapped[2], 16);
        return [high >> 8, high & 255, low >> 8, low & 255].join('.');
    }
    const [left, right] = canonical.split('::');
    const groups = left ? left.split(':') : [];
    if (right !== undefined) {
        const tail = right ? right.split(':') : [];
        groups.push(...Array(8 - groups.length - tail.length).fill('0'), ...tail);
    }
    return groups.slice(0, 4).join(':');
}

export function throttleAuth(limit: number, windowMs: number, maxClients = 4096): RequestHandler {
    const clients = new Map<string, number>();
    let windowEndsAt = 0;

    return (req, res, next) => {
        const now = Date.now();
        if (now >= windowEndsAt) {
            clients.clear();
            windowEndsAt = now + windowMs;
        }

        const key = clientKey(req.ip || req.socket.remoteAddress || '');
        const count = clients.get(key);
        if ((count === undefined && clients.size >= maxClients) || (count ?? 0) >= limit) {
            res.setHeader('Retry-After', String(Math.ceil((windowEndsAt - now) / 1000)));
            next(new HttpError(429, 'Too many requests. Please try again later.'));
            return;
        }

        clients.set(key, (count ?? 0) + 1);
        next();
    };
}
