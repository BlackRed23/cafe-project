import { apiClient, unwrapApiData } from "./client";
import type { ForgotPasswordPayload, GoogleAuthPayload, LoginPayload, RegisterPayload, ResetPasswordPayload, AuthResponse } from "../types/auth.types";

export const authApi = {
  login: async (payload: LoginPayload): Promise<AuthResponse> => {
    const response = await apiClient.post<AuthResponse>("/auth/login", payload);
    return unwrapApiData<AuthResponse>(response.data);
  },

  register: async (payload: RegisterPayload): Promise<AuthResponse> => {
    const response = await apiClient.post<AuthResponse>("/auth/register", payload);
    return unwrapApiData<AuthResponse>(response.data);
  },

  google: async (payload: GoogleAuthPayload): Promise<AuthResponse> => {
    const response = await apiClient.post<AuthResponse>("/auth/google", payload);
    return unwrapApiData<AuthResponse>(response.data);
  },

  getMe: async (): Promise<AuthResponse> => {
    const response = await apiClient.get<AuthResponse["user"]>("/auth/me");
    return { user: unwrapApiData<AuthResponse["user"]>(response.data) };
  },

  changePassword: async (payload: { currentPassword: string; newPassword: string }): Promise<void> => {
    await apiClient.patch("/auth/change-password", payload);
  },

  forgotPassword: async (payload: ForgotPasswordPayload): Promise<void> => {
    await apiClient.post("/auth/forgot-password", payload);
  },

  resetPassword: async (payload: ResetPasswordPayload): Promise<void> => {
    await apiClient.post("/auth/reset-password", payload);
  },
};
