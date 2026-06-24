import type { Prisma, User } from '@cafe-project/database';
import { prisma } from '@cafe-project/database';

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
    },

    async updateProfile(id: string, data: { name?: string; phone?: string }): Promise<UserRecord> {
        return prisma.user.update({
            where: { id },
            data: {
                ...(data.name && { name: data.name }),
                ...(data.phone !== undefined && { phone: data.phone }),
            }
        });
    },

    async updatePassword(id: string, hashedPassword: string): Promise<void> {
        await prisma.user.update({
            where: { id },
            data: { password: hashedPassword }
        });
    }
};
