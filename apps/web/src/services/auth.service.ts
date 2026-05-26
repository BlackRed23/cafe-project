import type { ApiResponse, AuthResponse, LoginRequest, RegisterRequest, UserDTO, UserResponse } from '@cafe-project/types';
import apiClient from '../api/axios';
import { removeToken, removeUser, setToken, setUser } from '../utils/auth';

export const authService = {
    async register(input: RegisterRequest): Promise<UserDTO> {
        const response = await apiClient.post<ApiResponse<UserResponse>>('/auth/register', input);

        return response.data.data.user;
    },

    async login(input: LoginRequest): Promise<AuthResponse> {
        const response = await apiClient.post<ApiResponse<AuthResponse>>('/auth/login', input);
        const auth = response.data.data;

        setToken(auth.token);
        setUser(auth.user);

        return auth;
    },

    async profile(): Promise<UserDTO> {
        const response = await apiClient.get<ApiResponse<UserResponse>>('/auth/profile');
        const user = response.data.data.user;

        setUser(user);

        return user;
    },

    logout(): void {
        removeToken();
        removeUser();
    }
};
