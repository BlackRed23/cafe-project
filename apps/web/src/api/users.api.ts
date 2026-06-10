import { apiClient, USE_MOCK } from "./client";
import type { User } from "../types/auth.types";
import { MockDB } from "./mockDb";

export const usersApi = {
  getUsers: async (): Promise<User[]> => {
    if (USE_MOCK) {
      return MockDB.getUsers();
    }
    const response = await apiClient.get<User[]>("/users");
    return response.data;
  },

  createUser: async (payload: Partial<User>): Promise<User> => {
    if (USE_MOCK) {
      return MockDB.createUser(payload);
    }
    const response = await apiClient.post<User>("/users", payload);
    return response.data;
  },

  updateUser: async (id: string, payload: Partial<User>): Promise<User> => {
    if (USE_MOCK) {
      return MockDB.updateUser(id, payload);
    }
    const response = await apiClient.put<User>(`/users/${id}`, payload);
    return response.data;
  },

  deleteUser: async (id: string): Promise<void> => {
    if (USE_MOCK) {
      MockDB.deleteUser(id);
      return;
    }
    await apiClient.delete(`/users/${id}`);
  },
};
