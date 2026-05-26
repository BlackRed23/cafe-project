export const Role = {
  ADMIN: 'ADMIN',
  MANAGER: 'MANAGER',
  STAFF: 'STAFF',
} as const;

export type Role = (typeof Role)[keyof typeof Role];

export type UserDTO = {
  id: string;
  email: string;
  name: string;
  phone: string | null;
  avatar: string | null;
  role: Role;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
};
