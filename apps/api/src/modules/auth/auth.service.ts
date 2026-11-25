import bcrypt from 'bcrypt';
import crypto from 'crypto';
import jwt, { type SignOptions } from 'jsonwebtoken';
import nodemailer from 'nodemailer';
import { type User } from '@cafe-project/database';
import { env } from '../../common/env';
import { HttpError } from '../../common/http-error';
import { authRepository, type UserRecord } from './auth.repository';
import { verifyGoogleCredential } from './auth.google';
import { ACCESS_TOKEN_ALGORITHM, verifySignedToken } from './auth.tokens';
import type { ForgotPasswordInput, GoogleAuthInput, LoginInput, RegisterInput, ResetPasswordInput } from './auth.validation';

import type { AuthUser, AuthResponse, JwtUserPayload } from './auth.types';
export type { AuthUser, AuthResponse, JwtUserPayload } from './auth.types';

const PASSWORD_SALT_ROUNDS = 10;
const RESET_TOKEN_TTL_MS = 60 * 60 * 1000;
const RESET_PASSWORD_SUCCESS_MESSAGE = 'If this email exists, a reset password link has been sent.';

const toAuthUser = (user: Pick<User, 'id' | 'email' | 'name' | 'phone' | 'avatar' | 'role'>): AuthUser => ({
    id: user.id,
    email: user.email,
    name: user.name,
    phone: user.phone,
    avatar: user.avatar,
    role: user.role
});

const signAccessToken = (user: UserRecord): string => {
    const payload: JwtUserPayload = {
        id: user.id,
        email: user.email,
        role: user.role
    };

    const options: SignOptions = {
        algorithm: ACCESS_TOKEN_ALGORITHM,
        expiresIn: env.jwtExpiresIn as SignOptions['expiresIn']
    };

    return jwt.sign(payload, env.jwtSecret, options);
};

const createSmtpTransporter = () => {
    const host = process.env.SMTP_HOST || 'smtp.gmail.com';
    const port = Number(process.env.SMTP_PORT) || 587;
    const user = process.env.SMTP_USER;
    const pass = process.env.SMTP_PASS;

    if (!user || !pass) {
        throw new HttpError(500, 'SMTP configuration is missing. Please set SMTP_USER and SMTP_PASS.');
    }

    return nodemailer.createTransport({
        host,
        port,
        secure: port === 465,
        auth: { user, pass }
    });
};

const sendResetPasswordEmail = async (email: string, token: string): Promise<void> => {
    const transporter = createSmtpTransporter();
    const resetLink = `${env.frontendUrl}/reset-password?token=${encodeURIComponent(token)}`;
    const from = process.env.SMTP_FROM || `"Cafe INV" <${process.env.SMTP_USER}>`;

    await transporter.sendMail({
        from,
        to: email,
        subject: 'Reset your Cafe INV password',
        text: `Open this link to reset your password: ${resetLink}\n\nThis link expires in 1 hour.`,
        html: `
            <p>Open this link to reset your password:</p>
            <p><a href="${resetLink}">${resetLink}</a></p>
            <p>This link expires in 1 hour.</p>
        `
    });
};

export const registerUser = async (input: RegisterInput): Promise<AuthUser> => {
    const existingUser = await authRepository.findByEmail(input.email);

    if (existingUser) {
        throw new HttpError(409, 'Email đã tồn tại.');
    }

    if (typeof input.password !== 'string' || !input.password.trim()) {
        throw new HttpError(400, 'Mật khẩu là bắt buộc.');
    }

    const hashedPassword = await bcrypt.hash(input.password, PASSWORD_SALT_ROUNDS);

    const user = await authRepository.create({
        name: input.name,
        email: input.email,
        password: hashedPassword,
        phone: input.phone,
        provider: 'local',
        // Public registration never trusts a caller-provided role, even without validation.
        role: 'CUSTOMER'
    });

    return toAuthUser(user);
};

export const updateUserProfile = async (userId: string, input: { name?: string; phone?: string }): Promise<AuthUser> => {
    const user = await authRepository.updateProfile(userId, input);
    return toAuthUser(user);
};

export const changeUserPassword = async (userId: string, input: { currentPassword: string; newPassword: string }): Promise<void> => {
    const user = await authRepository.findById(userId);
    if (!user) {
        throw new HttpError(404, 'Không tìm thấy người dùng.');
    }

    if (!user.password) {
        throw new HttpError(400, 'Tài khoản này chưa có mật khẩu cục bộ. Vui lòng sử dụng tính năng quên mật khẩu để đặt mật khẩu.');
    }

    const isPasswordValid = await bcrypt.compare(input.currentPassword, user.password);
    if (!isPasswordValid) {
        throw new HttpError(400, 'Mật khẩu hiện tại không đúng.');
    }

    const trimmedNew = input.newPassword.trim();
    if (trimmedNew.length < 8 || trimmedNew.length > 64) {
        throw new HttpError(400, 'Mật khẩu mới phải từ 8 đến 64 ký tự.');
    }

    if (!/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&#])[A-Za-z\d@$!%*?&#]+$/.test(trimmedNew)) {
        throw new HttpError(400, 'Mật khẩu mới phải chứa ít nhất 1 chữ hoa, 1 chữ thường, 1 số và 1 ký tự đặc biệt.');
    }

    if (input.currentPassword === input.newPassword) {
        throw new HttpError(400, 'Mật khẩu mới phải khác mật khẩu hiện tại.');
    }

    const hashedPassword = await bcrypt.hash(trimmedNew, PASSWORD_SALT_ROUNDS);
    await authRepository.updatePassword(userId, hashedPassword);
};

export const loginUser = async (input: LoginInput): Promise<AuthResponse> => {
    const user = await authRepository.findByEmail(input.email);

    if (!user) {
        throw new HttpError(401, 'Email hoặc mật khẩu không chính xác.');
    }

    if (!user.isActive) {
        throw new HttpError(403, 'Tài khoản đã bị khóa.');
    }

    if (!user.password) {
        throw new HttpError(401, 'Tài khoản này sử dụng đăng nhập Google. Vui lòng đăng nhập bằng Google hoặc đặt lại mật khẩu.');
    }

    const isPasswordValid = await bcrypt.compare(input.password, user.password);

    if (!isPasswordValid) {
        throw new HttpError(401, 'Email hoặc mật khẩu không chính xác.');
    }

    await authRepository.updateLastLoginAt(user.id);

    return {
        accessToken: signAccessToken(user),
        user: toAuthUser(user)
    };
};

export const loginWithGoogle = async (input: GoogleAuthInput): Promise<AuthResponse> => {
    const googleUser = 'id_token' in input
        ? await verifyGoogleCredential(input.id_token, 'id')
        : await verifyGoogleCredential(input.access_token, 'access');
    let user = await authRepository.findByGoogleId(googleUser.sub);

    if (user) {
        if (!user.isActive || user.provider !== 'google' || user.role !== 'CUSTOMER') {
            throw new HttpError(403, 'Google sign-in is unavailable for this account.');
        }
    } else {
        if (!googleUser.authoritativeEmail || await authRepository.findByEmail(googleUser.email)) {
            throw new HttpError(403, 'Google sign-in is unavailable for this account.');
        }

        try {
            user = await authRepository.create({
                email: googleUser.email,
                name: googleUser.name || googleUser.email,
                password: null,
                googleId: googleUser.sub,
                provider: 'google',
                role: 'CUSTOMER',
                avatar: googleUser.picture
            });
        } catch (error) {
            if (error && typeof error === 'object' && 'code' in error && error.code === 'P2002') {
                throw new HttpError(409, 'Google account could not be registered. Please retry sign-in.');
            }
            throw error;
        }
    }

    await authRepository.updateLastLoginAt(user.id);

    return {
        accessToken: signAccessToken(user),
        user: toAuthUser(user)
    };
};

export const forgotPassword = async (input: ForgotPasswordInput): Promise<{ message: string }> => {
    const user = await authRepository.findByEmail(input.email);

    if (!user?.isActive) {
        return { message: RESET_PASSWORD_SUCCESS_MESSAGE };
    }

    const resetToken = crypto.randomBytes(32).toString('hex');
    const resetTokenExpiresAt = new Date(Date.now() + RESET_TOKEN_TTL_MS);

    await authRepository.setResetToken(user.id, resetToken, resetTokenExpiresAt);
    await sendResetPasswordEmail(user.email, resetToken);

    return { message: RESET_PASSWORD_SUCCESS_MESSAGE };
};

export const resetPassword = async (input: ResetPasswordInput): Promise<void> => {
    const user = await authRepository.findByValidResetToken(input.token);

    if (!user) {
        throw new HttpError(400, 'Token đặt lại mật khẩu không hợp lệ hoặc đã hết hạn.');
    }

    const hashedPassword = await bcrypt.hash(input.newPassword.trim(), PASSWORD_SALT_ROUNDS);
    const consumed = await authRepository.consumeResetToken(user.id, input.token, hashedPassword);
    if (!consumed) {
        throw new HttpError(400, 'Invalid or expired password reset token.');
    }
};

export const getCurrentUser = async (userId: string): Promise<AuthUser> => {
    const user = await authRepository.findById(userId);

    if (!user) {
        throw new HttpError(401, 'Token người dùng không hợp lệ.');
    }

    if (!user.isActive) {
        throw new HttpError(403, 'Tài khoản đã bị khóa.');
    }

    return toAuthUser(user);
};

export const verifyAuthToken = (token: string): JwtUserPayload => {
    return verifySignedToken(token, env.jwtSecret);
};
