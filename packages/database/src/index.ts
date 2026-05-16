import { PrismaClient } from "@prisma/client";

// Ngăn chặn việc khởi tạo quá nhiều connection trong quá trình dev
const globalForPrisma = globalThis as unknown as {
    prisma: PrismaClient | undefined;
};

export const prisma = globalForPrisma.prisma ?? new PrismaClient();

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;

export * from "@prisma/client";