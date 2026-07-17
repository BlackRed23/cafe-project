import { UserRole } from '@cafe-project/database';
import { z } from 'zod';

export const registerSchema = z.object({
    email: z.string().trim().email('Email is invalid.').toLowerCase(),
    password: z.string()
        .trim()
        .min(8, 'Password must be at least 8 characters.')
        .max(64, 'Password must be at most 64 characters.')
        .regex(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&#])[A-Za-z\d@$!%*?&#]+$/, 'Password must contain at least 1 uppercase letter, 1 lowercase letter, 1 number, and 1 special character.'),
    name: z.string().trim().min(2, 'Name must be at least 2 characters.').max(100, 'Name must be at most 100 characters.'),
    phone: z.string().trim().min(10, 'Phone must be at least 10 characters.').max(15, 'Phone must be at most 15 characters.'),
    role: z.nativeEnum(UserRole).default(UserRole.CUSTOMER)
});

export const loginSchema = z.object({
    email: z.string().trim().email('Email is invalid.').toLowerCase(),
    password: z.string().trim().min(1, 'Password is required.')
});

export const googleAuthSchema = z.object({
    access_token: z.string().trim().min(1, 'Google access token is required.')
});

export const forgotPasswordSchema = z.object({
    email: z.string().trim().email('Email is invalid.').toLowerCase()
});

export const resetPasswordSchema = z.object({
    token: z.string().trim().min(1, 'Reset token is required.'),
    newPassword: z.string()
        .trim()
        .min(8, 'Password must be at least 8 characters.')
        .max(64, 'Password must be at most 64 characters.')
        .regex(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&#])[A-Za-z\d@$!%*?&#]+$/, 'Password must contain at least 1 uppercase letter, 1 lowercase letter, 1 number, and 1 special character.')
});

export type RegisterInput = z.infer<typeof registerSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
export type GoogleAuthInput = z.infer<typeof googleAuthSchema>;
export type ForgotPasswordInput = z.infer<typeof forgotPasswordSchema>;
export type ResetPasswordInput = z.infer<typeof resetPasswordSchema>;
