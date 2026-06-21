/**
 * Shared Category types — dùng chung giữa frontend và backend.
 * Khớp với Prisma schema: Category { id, name, description, createdAt, updatedAt }
 */

export type Category = {
  id: string;
  name: string;
  description: string | null;
  createdAt: string | Date;
  updatedAt: string | Date;
};

export type CreateCategoryPayload = {
  name: string;
  description?: string | null;
};

export type UpdateCategoryPayload = Partial<CreateCategoryPayload>;
