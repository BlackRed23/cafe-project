import { schedulePageLoad } from "../utils/schedulePageLoad";
import { mockEnabled, mockApi, mockTokenKey, mockUserKey } from '../mock/config';
const tokenStorageKey = mockEnabled ? mockTokenKey : 'access_token';
const userStorageKey = mockEnabled ? mockUserKey : 'user';
import React, { useState, useEffect, useCallback } from "react";
import { authApi } from "../api/auth.api";
import type { User, LoginPayload, RegisterPayload } from "../types/auth.types";

import { AuthContext } from "./AuthContextState";

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(localStorage.getItem(tokenStorageKey));
  const [loading, setLoading] = useState(() => Boolean(token));

  const logout = useCallback(() => {
    localStorage.removeItem(tokenStorageKey);
    localStorage.removeItem(userStorageKey);
    setUser(null);
    setToken(null);
    window.location.href = "/login";
  }, []);

  const loadMe = useCallback(async () => {
    try {
      setLoading(true);
      const data = mockEnabled ? { user: await mockApi!.request<User>('/session') } : await authApi.getMe();
      if (data.user) {
        setUser(data.user);
        localStorage.setItem(userStorageKey, JSON.stringify(data.user));
      } else {
        logout();
      }
    } catch {
      logout();
    } finally {
      setLoading(false);
    }
  }, [logout]);

  useEffect(() => {
    if (token) return schedulePageLoad(loadMe);
  }, [token, loadMe]);

  const persistAuth = (data: { accessToken?: string; token?: string; user?: User }) => {
    const receivedToken = data.accessToken || data.token;
    if (receivedToken) {
      localStorage.setItem(tokenStorageKey, receivedToken);
      setToken(receivedToken);
    }
    if (data.user) {
      setUser(data.user);
      localStorage.setItem(userStorageKey, JSON.stringify(data.user));
    }
  };

  const redirectAfterAuth = (user?: User) => {
    if (user?.role === "ADMIN" || user?.role === "STAFF") {
      window.location.href = "/admin/dashboard";
    } else {
      window.location.href = "/";
    }
  };

  const login = async (payload: LoginPayload) => {
    setLoading(true);
    try {
      const data = await authApi.login(payload);

      // Bắt buộc: lưu token + user vào localStorage TRƯỚC khi redirect
      persistAuth(data);

      // Xác nhận token đã thực sự nằm trong localStorage trước khi điều hướng
      const savedToken = localStorage.getItem(tokenStorageKey);
      if (!savedToken) {
        throw new Error("Token không được lưu thành công sau khi login");
      }

      redirectAfterAuth(data.user);
    } catch (error) {
      setLoading(false);
      throw error;
    }
  };

  const register = async (payload: RegisterPayload) => {
    setLoading(true);
    try {
      const data = await authApi.register(payload);
      persistAuth(data);
      if (data.user) {
        window.location.href = "/";
      } else {
        window.location.href = "/login?registered=true";
      }
    } catch (error) {
      setLoading(false);
      throw error;
    }
  };

  const loginWithGoogle = async (accessToken: string) => {
    setLoading(true);
    try {
      const data = await authApi.google({ access_token: accessToken });
      persistAuth(data);
      redirectAfterAuth(data.user);
    } catch (error) {
      setLoading(false);
      throw error;
    }
  };

  const isAuthenticated = !!user;
  const isAdmin = user?.role === "ADMIN";
  const isStaff = user?.role === "STAFF";

  return (
    <AuthContext.Provider
      value={{
        user,
        token,
        isAuthenticated,
        isAdmin,
        isStaff,
        loading,
        login,
        register,
        loginWithGoogle,
        logout,
        loadMe,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};
