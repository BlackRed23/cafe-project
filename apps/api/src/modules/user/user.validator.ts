import { z } from 'zod';
import { UserRole } from '@cafe-project/database';

export const createUserSchema = z.object({
    email: z.string().email(),
    password: z.string().min(6),
    name: z.string().min(1),
    role: z.nativeEnum(UserRole).default(UserRole.STAFF),
    isActive: z.boolean().optional(),
});

export const updateUserSchema = z.object({
    email: z.string().email().optional(),
    password: z.string().min(6).optional(),
    name: z.string().min(1).optional(),
    role: z.nativeEnum(UserRole).optional(),
    isActive: z.boolean().optional(),
});

export type CreateUserInput = z.infer<typeof createUserSchema>;
export type UpdateUserInput = z.infer<typeof updateUserSchema>;
