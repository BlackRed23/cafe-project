import { UserRole } from '@cafe-project/database';
import { z } from 'zod';

export const registerSchema = z.object({
    email: z.string().trim().email('Email is invalid.').toLowerCase(),
    password: z.string().min(6, 'Password must be at least 6 characters.').max(100, 'Password must be at most 100 characters.'),
    name: z.string().trim().min(2, 'Name must be at least 2 characters.').max(100, 'Name must be at most 100 characters.'),
    phone: z.string().trim().min(10, 'Phone must be at least 10 characters.').max(15, 'Phone must be at most 15 characters.'),
    role: z.nativeEnum(UserRole).default(UserRole.CUSTOMER)
});

export const loginSchema = z.object({
    email: z.string().trim().email('Email is invalid.').toLowerCase(),
    password: z.string().min(1, 'Password is required.')
});

export type RegisterInput = z.infer<typeof registerSchema>;
export type LoginInput = z.infer<typeof loginSchema>;