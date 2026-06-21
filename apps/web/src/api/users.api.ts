import { apiClient } from "./client";
import type { User } from "../types/auth.types";

export const usersApi = {
  // Lấy toàn bộ danh sách users từ DB
  getUsers: async (): Promise<User[]> => {
    const response = await apiClient.get("/users");
    // Backend trả về: { success, message, data: { users: [...] } }
    return response.data?.data?.users ?? response.data?.users ?? [];
  },

  // Tạo user mới (Admin tạo tài khoản cho nhân viên / khách)
  createUser: async (payload: Partial<User> & { password?: string }): Promise<User> => {
    const response = await apiClient.post("/users", payload);
    return response.data?.data?.user ?? response.data?.user ?? response.data;
  },

  // Cập nhật thông tin user (Admin sửa)
  updateUser: async (id: string, payload: Partial<User>): Promise<User> => {
    const response = await apiClient.put(`/users/${id}`, payload);
    return response.data?.data?.user ?? response.data?.user ?? response.data;
  },

  // Xóa user
  deleteUser: async (id: string): Promise<void> => {
    await apiClient.delete(`/users/${id}`);
  },

  // Khách hàng tự cập nhật profile của mình
  updateProfile: async (payload: { name?: string; phone?: string }): Promise<User> => {
    const response = await apiClient.patch("/auth/profile", payload);
    return response.data?.data?.user ?? response.data?.user ?? response.data;
  },
};
