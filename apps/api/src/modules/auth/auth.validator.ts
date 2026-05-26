import { z } from 'zod';
import type { LoginRequest, RegisterRequest } from '@cafe-project/types';

export const registerSchema = z.object({
    name: z
        .string()
        .trim()
        .min(2, 'Name must be at least 2 characters.')
        .max(100, 'Name must be at most 100 characters.'),
    email: z.string().trim().email('Email is invalid.').toLowerCase(),
    password: z
        .string()
        .min(6, 'Password must be at least 6 characters.')
        .max(100, 'Password must be at most 100 characters.')
});

export const loginSchema = z.object({
    email: z.string().trim().email('Email is invalid.').toLowerCase(),
    password: z.string().min(1, 'Password is required.')
});

export type RegisterInput = z.infer<typeof registerSchema> & RegisterRequest;
export type LoginInput = z.infer<typeof loginSchema> & LoginRequest;
