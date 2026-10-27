import { InventoryTransactionType, type Category, type Inventory, type InventoryTransaction, type Prisma, type Product, type User } from '@cafe-project/database';
import { prisma } from '@cafe-project/database';
import { getOptionalSettingValue } from '../system-setting/system-setting.service';
import { HttpError } from '../../common/http-error';

const assertStockDelta = (quantity: number, positiveOnly = false): void => {
    if (!Number.isInteger(quantity) || quantity === 0 || Math.abs(quantity) > 2147483647 || (positiveOnly && quantity < 0)) {
        throw new HttpError(400, 'Số lượng tồn kho phải là số nguyên hợp lệ khác 0.');
    }
};

type ProductWithCategory = Product & {
    category: Category;
};

export type InventoryRecord = Inventory & {
    product: ProductWithCategory;
};

export type InventoryTransactionRecord = InventoryTransaction & {
    product: Product;
    user: Pick<User, 'id' | 'name' | 'email'> | null;
};

const inventoryInclude = {
    product: {
        include: {
            category: true
        }
    },
    batches: {
        orderBy: {
            expirationDate: 'asc'
        }
    }
} satisfies Prisma.InventoryInclude;

const transactionInclude = {
    product: true,
    user: {
        select: {
            id: true,
            name: true,
            email: true
        }
    }
} satisfies Prisma.InventoryTransactionInclude;

export const inventoryRepository = {
    async createMissingForActiveProducts(): Promise<void> {
        const productsWithoutInventory = await prisma.product.findMany({
            where: {
                isActive: true,
                inventory: {
                    is: null
                }
            },
            select: {
                id: true,
                unit: true
            }
        });

        if (productsWithoutInventory.length === 0) {
            return;
        }

        const defaultMinThresholdSetting = await getOptionalSettingValue('inventory.defaultMinThreshold');
        const defaultMinThreshold = parseInt(defaultMinThresholdSetting || '10', 10);
        const minThreshold = isNaN(defaultMinThreshold) ? 10 : defaultMinThreshold;

        await prisma.inventory.createMany({
            data: productsWithoutInventory.map((product: any) => ({
                productId: product.id,
                quantity: 0,
                minThreshold,
                unit: product.unit || 'hộp'
            })),
            skipDuplicates: true
        });
    },

    async findMany(): Promise<InventoryRecord[]> {
        return prisma.inventory.findMany({
            where: {
                product: {
                    isActive: true
                }
            },
            include: inventoryInclude,
            orderBy: {
                updatedAt: 'desc'
            }
        });
    },

    async findById(id: string): Promise<InventoryRecord | null> {
        return prisma.inventory.findFirst({
            where: {
                id,
                product: {
                    isActive: true
                }
            },
            include: inventoryInclude
        });
    },

    async findTransactions(): Promise<InventoryTransactionRecord[]> {
        return prisma.inventoryTransaction.findMany({
            include: transactionInclude,
            orderBy: {
                createdAt: 'desc'
            }
        });
    },

    async importStock(inventory: InventoryRecord, quantity: number, note: string | null, userId: string, batchCode?: string, expirationDate?: string): Promise<InventoryRecord> {
        assertStockDelta(quantity, true);
        const expiry = expirationDate ? new Date(expirationDate) : null;
        if (!expiry || !Number.isFinite(expiry.getTime())) {
            throw new HttpError(400, 'Ngày hết hạn của lô không hợp lệ.');
        }
        return prisma.$transaction(async (tx: Prisma.TransactionClient) => {
            // Lock the aggregate before batch reads/writes, matching order/receipt write order.
            await tx.$queryRaw`SELECT "id" FROM "Inventory" WHERE "id" = ${inventory.id} FOR UPDATE`;
            const current = await tx.inventory.findUnique({ where: { id: inventory.id } });
            if (!current) throw new HttpError(404, 'Không tìm thấy tồn kho.');
            const finalBatchCode = batchCode?.trim() || `${current.productId.slice(0, 8)}-${Date.now()}`;
            if (await tx.inventoryBatch.findFirst({ where: { inventoryId: current.id, batchCode: finalBatchCode } })) {
                throw new HttpError(409, 'Mã lô đã tồn tại trong kho.');
            }
            await tx.inventory.update({
                where: { id: inventory.id },
                data: {
                    quantity: { increment: quantity }
                }
            });

            const batch = await tx.inventoryBatch.create({
                data: {
                    inventoryId: current.id,
                    batchCode: finalBatchCode,
                    quantity,
                    expirationDate: expiry
                }
            });

            await tx.inventoryTransaction.create({
                data: {
                    productId: current.productId,
                    userId,
                    type: InventoryTransactionType.IMPORT,
                    quantity,
                    reason: note,
                    batchId: batch.id
                }
            });

            const updatedInventory = await tx.inventory.findUnique({
                where: { id: inventory.id },
                include: inventoryInclude
            });

            if (!updatedInventory) {
                throw new Error('Inventory update failed.');
            }

            return updatedInventory;
        });
    },

    async adjustStock(inventory: InventoryRecord, quantity: number, note: string | null, userId: string, batchId?: string): Promise<InventoryRecord> {
        assertStockDelta(quantity);
        if (!batchId) {
            throw new HttpError(409, 'Cần chọn lô để điều chỉnh; tồn kho không có lô cần được đối soát trước.');
        }
        return prisma.$transaction(async (tx: Prisma.TransactionClient) => {
            await tx.$queryRaw`SELECT "id" FROM "Inventory" WHERE "id" = ${inventory.id} FOR UPDATE`;
            const current = await tx.inventory.findUnique({ where: { id: inventory.id } });
            if (!current) throw new HttpError(404, 'Không tìm thấy tồn kho.');
            const batch = await tx.inventoryBatch.findFirst({ where: { id: batchId, inventoryId: current.id } });
            if (!batch) throw new HttpError(400, 'Lô không thuộc tồn kho cần điều chỉnh.');
            if (!Number.isFinite(new Date(batch.expirationDate).getTime()) || new Date(batch.expirationDate).getTime() <= Date.now()) {
                throw new HttpError(409, 'Lô đã hết hạn hoặc không có hạn hợp lệ; cần đối soát riêng.');
            }
            if (current.quantity + quantity < current.reservedStock || current.quantity + quantity < 0 || batch.quantity + quantity < 0) {
                throw new HttpError(409, 'Điều chỉnh vượt tồn kho khả dụng hoặc số lượng của lô.');
            }

            // Evaluate reservation protection in the UPDATE as well as under the row lock.
            const changed = await tx.$executeRaw`
                UPDATE "Inventory" SET "quantity" = "quantity" + ${quantity}, "updatedAt" = NOW()
                WHERE "id" = ${current.id}
                  AND "quantity" + ${quantity} >= "reservedStock"
                  AND "quantity" + ${quantity} >= 0
            `;
            if (changed !== 1) throw new HttpError(409, 'Tồn kho đã thay đổi, vui lòng kiểm tra lại.');
            const changedBatch = await tx.inventoryBatch.updateMany({
                where: { id: batch.id, inventoryId: current.id, quantity: { gte: Math.max(0, -quantity) } },
                data: { quantity: { increment: quantity } }
            });
            if (changedBatch.count !== 1) throw new HttpError(409, 'Lô đã thay đổi, vui lòng kiểm tra lại.');

            await tx.inventoryTransaction.create({
                data: {
                    productId: current.productId,
                    userId,
                    type: InventoryTransactionType.ADJUSTMENT,
                    quantity,
                    reason: note,
                    batchId: batch.id
                }
            });

            const updatedInventory = await tx.inventory.findUnique({
                where: { id: inventory.id },
                include: inventoryInclude
            });

            if (!updatedInventory) {
                throw new Error('Inventory update failed.');
            }

            return updatedInventory;
        });
    },

    async updateThreshold(inventory: InventoryRecord, minThreshold: number): Promise<InventoryRecord> {
        return prisma.inventory.update({
            where: { id: inventory.id },
            data: { minThreshold },
            include: inventoryInclude
        });
    }
};
