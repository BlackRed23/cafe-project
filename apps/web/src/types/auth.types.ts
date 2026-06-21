export type UserRole = "ADMIN" | "CUSTOMER" | "USER";

export interface User {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  phone?: string;
  is_active?: boolean;
  isActive?: boolean;
}

export interface LoginPayload {
  email: string;
  password: string;
}

export interface RegisterPayload {
  name: string;
  email: string;
  password: string;
  phone: string;
}

export interface AuthResponse {
  user: User;
  token?: string;
  accessToken?: string;
}
