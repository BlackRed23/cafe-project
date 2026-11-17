import type { UserRole } from '@cafe-project/database';

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

