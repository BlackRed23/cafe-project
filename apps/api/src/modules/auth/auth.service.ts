import bcrypt from 'bcrypt';
import crypto from 'crypto';
import jwt, { type SignOptions } from 'jsonwebtoken';
import nodemailer from 'nodemailer';
import { type User, type UserRole } from '@cafe-project/database';
import { env } from '../../common/env';
import { HttpError } from '../../common/http-error';
import { authRepository, type UserRecord } from './auth.repository';
import type { ForgotPasswordInput, GoogleAuthInput, LoginInput, RegisterInput, ResetPasswordInput } from './auth.validation';

export type AuthUser = {
    id: string;
    email: string;
    name: string;
    phone?: string | null;
    avatar?: string | null;
    role: UserRole;
};

export type AuthResponse = {
    accessToken: string;
    user: AuthUser;
};

export type JwtUserPayload = {
    id: string;
    email: string;
    role: UserRole;
};

type JwtDecodedPayload = JwtUserPayload & {
    iat?: number;
    exp?: number;
};

const PASSWORD_SALT_ROUNDS = 10;
const RESET_TOKEN_TTL_MS = 60 * 60 * 1000;
const RESET_PASSWORD_SUCCESS_MESSAGE = 'If this email exists, a reset password link has been sent.';

type GoogleUserInfo = {
    sub: string;
    email: string;
    name?: string;
    picture?: string;
};

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

const fetchGoogleUserInfo = async (accessToken: string): Promise<GoogleUserInfo> => {
    try {
        const response = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
            headers: {
                Authorization: `Bearer ${accessToken}`
            }
        });

        if (!response.ok) {
            throw new HttpError(401, 'Invalid Google access token.');
        }

        const data = await response.json() as Partial<GoogleUserInfo>;

        if (!data.sub || !data.email) {
            throw new HttpError(401, 'Google account information is incomplete.');
        }

        return {
            sub: data.sub,
            email: data.email.toLowerCase(),
            name: data.name,
            picture: data.picture
        };
    } catch (error) {
        if (error instanceof HttpError) {
            throw error;
        }
        console.error('Error fetching Google user info:', error);
        throw new HttpError(503, 'Failed to connect to Google authentication service. Please check your internet connection and try again.');
    }
};

export const registerUser = async (input: RegisterInput): Promise<AuthUser> => {
    const existingUser = await authRepository.findByEmail(input.email);

    if (existingUser) {
        throw new HttpError(409, 'Email already exists.');
    }

    if (typeof input.password !== 'string' || !input.password.trim()) {
        throw new HttpError(400, 'Password is required.');
    }

    const hashedPassword = await bcrypt.hash(input.password, PASSWORD_SALT_ROUNDS);

    const user = await authRepository.create({
        name: input.name,
        email: input.email,
        password: hashedPassword,
        phone: input.phone,
        provider: 'local',
        role: input.role
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
        throw new HttpError(404, 'User not found.');
    }

    if (!user.password) {
        throw new HttpError(400, 'This account does not have a local password yet. Please use forgot password to set one.');
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
        throw new HttpError(401, 'Invalid credentials.');
    }

    if (!user.isActive) {
        throw new HttpError(403, 'Account is inactive.');
    }

    if (!user.password) {
        throw new HttpError(401, 'This account uses Google login. Please sign in with Google or reset your password.');
    }

    const isPasswordValid = await bcrypt.compare(input.password, user.password);

    if (!isPasswordValid) {
        throw new HttpError(401, 'Invalid credentials.');
    }

    await authRepository.updateLastLoginAt(user.id);

    return {
        accessToken: signAccessToken(user),
        user: toAuthUser(user)
    };
};

export const loginWithGoogle = async (input: GoogleAuthInput): Promise<AuthResponse> => {
    const googleUser = await fetchGoogleUserInfo(input.access_token);
    const existingUser = await authRepository.findByEmail(googleUser.email);

    let user: UserRecord;

    if (!existingUser) {
        user = await authRepository.create({
            email: googleUser.email,
            name: googleUser.name || googleUser.email,
            password: null,
            googleId: googleUser.sub,
            provider: 'google',
            avatar: googleUser.picture
        });
    } else {
        if (!existingUser.isActive) {
            throw new HttpError(403, 'Account is inactive.');
        }

        user = await authRepository.updateGoogleProfile(existingUser.id, {
            googleId: existingUser.googleId || googleUser.sub,
            avatar: existingUser.avatar || googleUser.picture,
            provider: existingUser.provider || 'google'
        });
    }

    await authRepository.updateLastLoginAt(user.id);

    return {
        accessToken: signAccessToken(user),
        user: toAuthUser(user)
    };
};

export const forgotPassword = async (input: ForgotPasswordInput): Promise<{ message: string }> => {
    const user = await authRepository.findByEmail(input.email);

    if (!user) {
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
        throw new HttpError(400, 'Reset token is invalid or expired.');
    }

    const hashedPassword = await bcrypt.hash(input.newPassword.trim(), PASSWORD_SALT_ROUNDS);
    await authRepository.updatePassword(user.id, hashedPassword);
};

export const getCurrentUser = async (userId: string): Promise<AuthUser> => {
    const user = await authRepository.findById(userId);

    if (!user) {
        throw new HttpError(401, 'Invalid token user.');
    }

    if (!user.isActive) {
        throw new HttpError(403, 'Account is inactive.');
    }

    return toAuthUser(user);
};

export const verifyAuthToken = (token: string): JwtUserPayload => {
    try {
        const decoded = jwt.verify(token, env.jwtSecret) as JwtDecodedPayload;

        if (!decoded.id || !decoded.email || !decoded.role) {
            throw new HttpError(401, 'Invalid token payload.');
        }

        return {
            id: decoded.id,
            email: decoded.email,
            role: decoded.role
        };
    } catch (error) {
        if (error instanceof HttpError) {
            throw error;
        }

        throw new HttpError(401, 'Invalid or expired token.');
    }
};
