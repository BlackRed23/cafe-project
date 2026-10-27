import { timingSafeEqual } from 'node:crypto';
import { prisma } from '@cafe-project/database';
import { AgentHttpError } from './errors/http-error';

export const requireInternalSecret = (): string => {
    const secret = process.env.AGENT_INTERNAL_TOKEN;
    if (!secret || !/^[A-Za-z0-9_-]{43,}$/.test(secret) || new Set(secret).size < 12) {
        throw new Error('Invalid internal Agent authentication configuration.');
    }
    return secret;
};

export const validInternalToken = (token: unknown): boolean => {
    const secret = requireInternalSecret();
    return typeof token === 'string' && Buffer.byteLength(token) === Buffer.byteLength(secret)
        && timingSafeEqual(Buffer.from(token), Buffer.from(secret));
};

export const requireAgentUser = async (id: unknown, roles: string[] = ['ADMIN']): Promise<string> => {
    if (typeof id !== 'string' || !id) throw new AgentHttpError(403, 'Forbidden');
    const user = await prisma.user.findUnique({ where: { id }, select: { id: true, role: true, isActive: true } });
    if (!user?.isActive || !roles.includes(user.role)) throw new AgentHttpError(403, 'Forbidden');
    return user.id;
};
