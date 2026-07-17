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

    async updateGoogleProfile(id: string, data: { googleId: string; avatar?: string | null; provider?: string }): Promise<UserRecord> {
        return prisma.user.update({
            where: { id },
            data: {
                googleId: data.googleId,
                provider: data.provider ?? 'google',
                ...(data.avatar && { avatar: data.avatar })
            }
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
            data: {
                password: hashedPassword,
                provider: 'local',
                resetToken: null,
                resetTokenExpiresAt: null
            }
        });
    },

    async setResetToken(id: string, resetToken: string, resetTokenExpiresAt: Date): Promise<void> {
        await prisma.user.update({
            where: { id },
            data: { resetToken, resetTokenExpiresAt }
        });
    },

    async findByValidResetToken(resetToken: string): Promise<UserRecord | null> {
        return prisma.user.findFirst({
            where: {
                resetToken,
                resetTokenExpiresAt: {
                    gt: new Date()
                }
            }
        });
    }
};
