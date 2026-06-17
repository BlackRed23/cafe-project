import { apiClient, unwrapApiData } from "./client";
import type { User } from "../types/auth.types";

export const usersApi = {
  getUsers: async (): Promise<User[]> => {
    const response = await apiClient.get<User>("/auth/me");
    return [unwrapApiData<User>(response.data)];
  },

  createUser: async (_payload: Partial<User>): Promise<User> => {
    throw new Error("Backend hiện tại chưa hỗ trợ API quản lý người dùng.");
  },

  updateUser: async (_id: string, _payload: Partial<User>): Promise<User> => {
    throw new Error("Backend hiện tại chưa hỗ trợ API cập nhật người dùng.");
  },

  deleteUser: async (_id: string): Promise<void> => {
    throw new Error("Backend hiện tại chưa hỗ trợ API xóa người dùng.");
  },
};
