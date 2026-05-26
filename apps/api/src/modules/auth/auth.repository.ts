import type { Prisma, User } from '@cafe-project/database';
import { prisma } from '../../common/prisma';

export type UserRecord = User;

export const authRepository = {
    async findByEmail(email: string): Promise<UserRecord | null> {
        return prisma.user.findUnique({
            where: { email }
        });
    },

    async findById(id: string): Promise<UserRecord | null> {
        return prisma.user.findUnique({
            where: { id }
        });
    },

    async create(data: Prisma.UserCreateInput): Promise<UserRecord> {
        return prisma.user.create({
            data
        });
    },

    async updateLastLoginAt(id: string): Promise<UserRecord> {
        return prisma.user.update({
            where: { id },
            data: {
                lastLoginAt: new Date()
            }
        });
    }
};
