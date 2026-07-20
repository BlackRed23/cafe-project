import { UserRole } from '@cafe-project/database';
import { z } from 'zod';

export const registerSchema = z.object({
    email: z.string().trim().email('Email không hợp lệ.').toLowerCase(),
    password: z.string()
        .trim()
        .min(8, 'Mật khẩu phải có ít nhất 8 ký tự.')
        .max(64, 'Mật khẩu tối đa 64 ký tự.')
        .regex(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&#])[A-Za-z\d@$!%*?&#]+$/, 'Mật khẩu phải chứa ít nhất 1 chữ hoa, 1 chữ thường, 1 số và 1 ký tự đặc biệt.'),
    name: z.string().trim().min(2, 'Tên phải có ít nhất 2 ký tự.').max(100, 'Tên tối đa 100 ký tự.'),
    phone: z.string().trim().min(10, 'Số điện thoại phải có ít nhất 10 ký tự.').max(15, 'Số điện thoại tối đa 15 ký tự.'),
    role: z.nativeEnum(UserRole).default(UserRole.CUSTOMER)
});

export const loginSchema = z.object({
    email: z.string().trim().email('Email không hợp lệ.').toLowerCase(),
    password: z.string().trim().min(1, 'Mật khẩu không được để trống.')
});

export const googleAuthSchema = z.object({
    access_token: z.string().trim().min(1, 'Token Google là bắt buộc.')
});

export const forgotPasswordSchema = z.object({
    email: z.string().trim().email('Email không hợp lệ.').toLowerCase()
});

export const resetPasswordSchema = z.object({
    token: z.string().trim().min(1, 'Token đặt lại mật khẩu là bắt buộc.'),
    newPassword: z.string()
        .trim()
        .min(8, 'Mật khẩu phải có ít nhất 8 ký tự.')
        .max(64, 'Mật khẩu tối đa 64 ký tự.')
        .regex(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&#])[A-Za-z\d@$!%*?&#]+$/, 'Mật khẩu phải chứa ít nhất 1 chữ hoa, 1 chữ thường, 1 số và 1 ký tự đặc biệt.')
});

export type RegisterInput = z.infer<typeof registerSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
export type GoogleAuthInput = z.infer<typeof googleAuthSchema>;
export type ForgotPasswordInput = z.infer<typeof forgotPasswordSchema>;
export type ResetPasswordInput = z.infer<typeof resetPasswordSchema>;
