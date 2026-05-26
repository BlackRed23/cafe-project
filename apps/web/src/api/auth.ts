import type { ApiResponse, AuthResponse, LoginRequest, RegisterRequest, UserResponse } from '@cafe-project/types';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000';
const TOKEN_KEY = 'auth_token';

const request = async <T>(path: string, options: RequestInit = {}): Promise<T> => {
    const response = await fetch(`${API_URL}/api/auth${path}`, {
        ...options,
        headers: {
            'Content-Type': 'application/json',
            ...options.headers
        }
    });

    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
        throw new Error(data.message || 'Request failed.');
    }

    return (data as ApiResponse<T>).data;
};

export const getAuthToken = () => localStorage.getItem(TOKEN_KEY);

export const register = async (input: RegisterRequest) => {
    return request<UserResponse>('/register', {
        method: 'POST',
        body: JSON.stringify(input)
    });
};

export const login = async (input: LoginRequest) => {
    const data = await request<AuthResponse>('/login', {
        method: 'POST',
        body: JSON.stringify(input)
    });

    localStorage.setItem(TOKEN_KEY, data.token);
    return data;
};

export const getMe = async () => {
    const token = getAuthToken();
    if (!token) {
        throw new Error('Not authenticated.');
    }

    return request<UserResponse>('/me', {
        method: 'GET',
        headers: {
            Authorization: `Bearer ${token}`
        }
    });
};

export const logout = () => {
    localStorage.removeItem(TOKEN_KEY);
};
