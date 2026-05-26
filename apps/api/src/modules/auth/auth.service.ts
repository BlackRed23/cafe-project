import bcrypt from 'bcryptjs';
import jwt, { type SignOptions } from 'jsonwebtoken';
import { Role, type AuthResponse, type UserDTO } from '@cafe-project/types';
import { env } from '../../common/env';
import { HttpError } from '../../common/http-error';
import { authRepository, type UserRecord } from './auth.repository';
import type { LoginInput, RegisterInput } from './auth.validator';

export type JwtUserPayload = {
    userId: string;
    email: string;
    role: Role;
};

type JwtDecodedPayload = JwtUserPayload & {
    iat?: number;
    exp?: number;
};

const PASSWORD_SALT_ROUNDS = 12;

const toUserDTO = (user: UserRecord): UserDTO => ({
    id: user.id,
    email: user.email,
    name: user.name,
    phone: user.phone,
    avatar: user.avatar,
    role: user.role as Role,
    isActive: user.isActive,
    createdAt: user.createdAt.toISOString(),
    updatedAt: user.updatedAt.toISOString()
});

const signAccessToken = (user: UserRecord): string => {
    const payload: JwtUserPayload = {
        userId: user.id,
        email: user.email,
        role: user.role as Role
    };

    const options: SignOptions = {
        expiresIn: env.jwtExpiresIn as SignOptions['expiresIn']
    };

    return jwt.sign(payload, env.jwtSecret, options);
};

export const registerUser = async (input: RegisterInput): Promise<UserDTO> => {
    const existingUser = await authRepository.findByEmail(input.email);

    if (existingUser) {
        throw new HttpError(409, 'Email is already registered.');
    }

    const hashedPassword = await bcrypt.hash(input.password, PASSWORD_SALT_ROUNDS);

    const user = await authRepository.create({
        name: input.name,
        email: input.email,
        password: hashedPassword,
        role: Role.STAFF
    });

    return toUserDTO(user);
};

export const loginUser = async (input: LoginInput): Promise<AuthResponse> => {
    const user = await authRepository.findByEmail(input.email);

    if (!user) {
        throw new HttpError(401, 'Email or password is incorrect.');
    }

    if (!user.isActive) {
        throw new HttpError(403, 'Account is inactive.');
    }

    const isPasswordValid = await bcrypt.compare(input.password, user.password);

    if (!isPasswordValid) {
        throw new HttpError(401, 'Email or password is incorrect.');
    }

    await authRepository.updateLastLoginAt(user.id);

    return {
        user: toUserDTO(user),
        token: signAccessToken(user)
    };
};

export const getCurrentUser = async (userId: string): Promise<UserDTO> => {
    const user = await authRepository.findById(userId);

    if (!user) {
        throw new HttpError(404, 'User not found.');
    }

    if (!user.isActive) {
        throw new HttpError(403, 'Account is inactive.');
    }

    return toUserDTO(user);
};

export const verifyAuthToken = (token: string): JwtUserPayload => {
    try {
        const decoded = jwt.verify(token, env.jwtSecret) as JwtDecodedPayload;

        if (!decoded.userId || !decoded.email || !decoded.role) {
            throw new HttpError(401, 'Invalid token payload.');
        }

        return {
            userId: decoded.userId,
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
