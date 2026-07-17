import { prisma } from '@cafe-project/database';
import type { Prisma } from '@cafe-project/database';
import bcrypt from 'bcrypt';

export const userService = {
    async getUsers() {
        return prisma.user.findMany({
            select: {
                id: true,
                email: true,
                name: true,
                phone: true,
                role: true,
                isActive: true,
                createdAt: true,
                updatedAt: true,
            }
        });
    },

    async getUserById(id: string) {
        const user = await prisma.user.findUnique({
            where: { id },
            select: {
                id: true,
                email: true,
                name: true,
                phone: true,
                role: true,
                isActive: true,
                createdAt: true,
                updatedAt: true,
            }
        });

        if (!user) {
            throw new Error('User not found');
        }

        return user;
    },

    async createUser(data: Prisma.UserCreateInput) {
        if (typeof data.password !== 'string' || !data.password.trim()) {
            throw new Error('Password is required for local users.');
        }

        const hashedPassword = await bcrypt.hash(data.password, 10);
        
        const user = await prisma.user.create({
            data: {
                ...data,
                password: hashedPassword,
                provider: data.provider ?? 'local',
            },
            select: {
                id: true,
                email: true,
                name: true,
                phone: true,
                role: true,
                isActive: true,
                createdAt: true,
                updatedAt: true,
            }
        });

        return user;
    },

    async updateUser(id: string, data: Prisma.UserUpdateInput) {
        if (data.password && typeof data.password === 'string') {
            data.password = await bcrypt.hash(data.password, 10);
        }

        const user = await prisma.user.update({
            where: { id },
            data,
            select: {
                id: true,
                email: true,
                name: true,
                phone: true,
                role: true,
                isActive: true,
                createdAt: true,
                updatedAt: true,
            }
        });

        return user;
    },

    async deleteUser(id: string) {
        const user = await prisma.user.delete({
            where: { id },
            select: {
                id: true,
                email: true,
                name: true,
                phone: true,
                role: true,
                isActive: true,
                createdAt: true,
                updatedAt: true,
            }
        });

        return user;
    }
};
