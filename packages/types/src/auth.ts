

export const Role = {
    ADMIN: 'ADMIN',
    MANAGER: 'MANAGER',
    STAFF: 'STAFF'
} as const;

export type Role = (typeof Role)[keyof typeof Role];

export type UserDTO = {
    id: string;
    email: string;
    name: string;
    phone: string | null;
    avatar: string | null;
    role: Role;
    isActive: boolean;
    createdAt: string;
    updatedAt: string;
};

export type RegisterRequest = {
    name: string;
    email: string;
    password: string;
};

export type LoginRequest = {
    email: string;
    password: string;
};

export type AuthResponse = {
    user: UserDTO;
    token: string;
};

export type UserResponse = {
    user: UserDTO;
};

export type UserRole = Role;
export type LoginInput = LoginRequest;
export type AuthUser = UserDTO;
