import type { UserDTO } from './user.type';
import type { ApiResponse } from './common.type';

export type LoginRequest = {
  email: string;
  password: string;
};

export type RegisterRequest = {
  name: string;
  email: string;
  password: string;
};

export type AuthResponse = {
  user: UserDTO;
  token: string;
};

export type UserResponse = {
  user: UserDTO;
};

export type AuthUser = UserDTO;
export type AuthUserResponse = ApiResponse<UserResponse>;
export type LoginResponse = ApiResponse<AuthResponse>;
