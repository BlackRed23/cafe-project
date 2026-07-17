import React, { createContext, useContext, useState, useEffect } from "react";
import { authApi } from "../api/auth.api";
import type { User, LoginPayload, RegisterPayload } from "../types/auth.types";

interface AuthContextType {
  user: User | null;
  token: string | null;
  isAuthenticated: boolean;
  isAdmin: boolean;
  isStaff: boolean;
  loading: boolean;
  login: (payload: LoginPayload) => Promise<void>;
  register: (payload: RegisterPayload) => Promise<void>;
  logout: () => void;
  loadMe: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(localStorage.getItem("access_token"));
  const [loading, setLoading] = useState<boolean>(true);

  const loadMe = async () => {
    try {
      setLoading(true);
      const data = await authApi.getMe();
      if (data.user) {
        setUser(data.user);
        localStorage.setItem("user", JSON.stringify(data.user));
      } else {
        logout();
      }
    } catch (error) {
      logout();
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (token) {
      loadMe();
    } else {
      setLoading(false);
    }
  }, [token]);

  const login = async (payload: LoginPayload) => {
    setLoading(true);
    try {
      const data = await authApi.login(payload);
      const receivedToken = data.accessToken || data.token;
      if (receivedToken) {
        localStorage.setItem("access_token", receivedToken);
        setToken(receivedToken);
      }
      if (data.user) {
        setUser(data.user);
        localStorage.setItem("user", JSON.stringify(data.user));
        
        // Redirect according to user role
        if (data.user.role === "ADMIN" || data.user.role === "STAFF") {
          window.location.href = "/admin/dashboard";
        } else {
          window.location.href = "/";
        }
      }
    } catch (error) {
      setLoading(false);
      throw error;
    }
  };

  const register = async (payload: RegisterPayload) => {
    setLoading(true);
    try {
      const data = await authApi.register(payload);
      const receivedToken = data.accessToken || data.token;
      if (receivedToken) {
        localStorage.setItem("access_token", receivedToken);
        setToken(receivedToken);
      }
      if (data.user) {
        setUser(data.user);
        localStorage.setItem("user", JSON.stringify(data.user));
        window.location.href = "/";
      } else {
        window.location.href = "/login?registered=true";
      }
    } catch (error) {
      setLoading(false);
      throw error;
    }
  };

  const logout = () => {
    localStorage.removeItem("access_token");
    localStorage.removeItem("user");
    setUser(null);
    setToken(null);
    window.location.href = "/login";
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
        logout,
        loadMe,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
};
