import type { UserDTO } from '@cafe-project/types';

export type AppRole = 'ADMIN' | 'MANAGER' | 'STAFF' | 'USER';

const TOKEN_KEYS = ['token', 'auth_token'];
const USER_KEYS = ['user', 'auth_user'];

type StoredUser = Partial<UserDTO> & {
    role?: AppRole;
};

export const getToken = (): string | null => {
    for (const key of TOKEN_KEYS) {
        const value = localStorage.getItem(key);

        if (value) {
            return value;
        }
    }

    return null;
};

export const setToken = (token: string): void => {
    localStorage.setItem('token', token);
    localStorage.setItem('auth_token', token);
};

export const removeToken = (): void => {
    TOKEN_KEYS.forEach((key) => localStorage.removeItem(key));
};

export const getUser = (): StoredUser | null => {
    for (const key of USER_KEYS) {
        const value = localStorage.getItem(key);

        if (!value) {
            continue;
        }

        try {
            return JSON.parse(value) as StoredUser;
        } catch {
            localStorage.removeItem(key);
        }
    }

    return null;
};

export const setUser = (user: UserDTO): void => {
    localStorage.setItem('user', JSON.stringify(user));
    localStorage.setItem('auth_user', JSON.stringify(user));
};

export const removeUser = (): void => {
    USER_KEYS.forEach((key) => localStorage.removeItem(key));
};

export const logout = (): void => {
    removeToken();
    removeUser();
};

export const getRole = (): AppRole | null => {
    const user = getUser();

    return user?.role ?? null;
};

export const canManageCatalog = (): boolean => {
    const role = getRole();

    return role === 'ADMIN' || role === 'MANAGER';
};

export const getRoleRedirectPath = (): string => {
    const role = getRole();

    if (role === 'ADMIN' || role === 'MANAGER') {
        return '/admin/products';
    }

    if (role === 'STAFF') {
        return '/staff/products';
    }

    return '/products';
};
