import { apiClient, USE_MOCK } from "./client";
import type { LoginPayload, RegisterPayload, AuthResponse } from "../types/auth.types";
import { MockDB } from "./mockDb";

export const authApi = {
  login: async (payload: LoginPayload): Promise<AuthResponse> => {
    if (USE_MOCK) {
      const data = MockDB.login(payload.email);
      return data;
    }
    const response = await apiClient.post<AuthResponse>("/auth/login", payload);
    return response.data;
  },

  register: async (payload: RegisterPayload): Promise<AuthResponse> => {
    if (USE_MOCK) {
      const data = MockDB.login(payload.email);
      return data;
    }
    const response = await apiClient.post<AuthResponse>("/auth/register", payload);
    return response.data;
  },

  getMe: async (): Promise<AuthResponse> => {
    if (USE_MOCK) {
      const mockUser = localStorage.getItem("mock_user") || localStorage.getItem("user");
      if (mockUser) {
        return { user: JSON.parse(mockUser) };
      }
      throw new Error("Không có phiên đăng nhập");
    }
    const response = await apiClient.get<AuthResponse>("/auth/me");
    return response.data;
  },
};
