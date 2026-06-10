import bcrypt from 'bcrypt';
import jwt, { type SignOptions } from 'jsonwebtoken';
import { type User, type UserRole } from '@cafe-project/database';
import { env } from '../../common/env';
import { HttpError } from '../../common/http-error';
import { authRepository, type UserRecord } from './auth.repository';
import type { LoginInput, RegisterInput } from './auth.validation';

export type AuthUser = {
    id: string;
    email: string;
    name: string;
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

const toAuthUser = (user: Pick<User, 'id' | 'email' | 'name' | 'role'>): AuthUser => ({
    id: user.id,
    email: user.email,
    name: user.name,
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

export const registerUser = async (input: RegisterInput): Promise<AuthUser> => {
    const existingUser = await authRepository.findByEmail(input.email);

    if (existingUser) {
        throw new HttpError(409, 'Email already exists.');
    }

    const hashedPassword = await bcrypt.hash(input.password, PASSWORD_SALT_ROUNDS);

    const user = await authRepository.create({
        name: input.name,
        email: input.email,
        password: hashedPassword,
        role: input.role
    });

    return toAuthUser(user);
};

export const loginUser = async (input: LoginInput): Promise<AuthResponse> => {
    const user = await authRepository.findByEmail(input.email);

    if (!user) {
        throw new HttpError(401, 'Invalid credentials.');
    }

    if (!user.isActive) {
        throw new HttpError(403, 'Account is inactive.');
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
