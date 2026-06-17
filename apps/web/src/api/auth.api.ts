import { apiClient, unwrapApiData } from "./client";
import type { LoginPayload, RegisterPayload, AuthResponse } from "../types/auth.types";

export const authApi = {
  login: async (payload: LoginPayload): Promise<AuthResponse> => {
    const response = await apiClient.post<AuthResponse>("/auth/login", payload);
    return unwrapApiData<AuthResponse>(response.data);
  },

  register: async (payload: RegisterPayload): Promise<AuthResponse> => {
    const response = await apiClient.post<AuthResponse>("/auth/register", payload);
    return unwrapApiData<AuthResponse>(response.data);
  },

  getMe: async (): Promise<AuthResponse> => {
    const response = await apiClient.get<AuthResponse["user"]>("/auth/me");
    return { user: unwrapApiData<AuthResponse["user"]>(response.data) };
  },
};
