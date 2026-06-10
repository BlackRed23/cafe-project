import { HttpError } from '../../common/http-error';
import { inventoryRepository, type InventoryRecord, type InventoryTransactionRecord } from './inventory.repository';
import type { AdjustInventoryInput, ImportInventoryInput } from './inventory.validator';

export type InventoryStatus = 'OUT_OF_STOCK' | 'LOW_STOCK' | 'IN_STOCK';

export type InventoryDto = {
    id: string;
    inventoryId: string;
    productId: string;
    productImageUrl: string | null;
    productName: string;
    productSku: string;
    categoryName: string;
    quantity: number;
    minThreshold: number;
    unit: string;
    status: InventoryStatus;
    createdAt: Date;
    updatedAt: Date;
};

export type InventoryTransactionDto = {
    id: string;
    productId: string;
    productName: string;
    productSku: string;
    type: string;
    quantity: number;
    previousQty: number | null;
    newQty: number | null;
    note: string | null;
    createdBy: string | null;
    createdByEmail: string | null;
    createdAt: Date;
};

const getStatus = (quantity: number, minThreshold: number): InventoryStatus => {
    if (quantity <= 0) return 'OUT_OF_STOCK';
    if (quantity <= minThreshold) return 'LOW_STOCK';

    return 'IN_STOCK';
};

const toInventoryDto = (inventory: InventoryRecord): InventoryDto => ({
    id: inventory.id,
    inventoryId: inventory.id,
    productId: inventory.productId,
    productImageUrl: inventory.product.imageUrl,
    productName: inventory.product.name,
    productSku: inventory.product.sku,
    categoryName: inventory.product.category.name,
    quantity: inventory.quantity,
    minThreshold: inventory.minThreshold,
    unit: inventory.unit,
    status: getStatus(inventory.quantity, inventory.minThreshold),
    createdAt: inventory.createdAt,
    updatedAt: inventory.updatedAt
});

const toTransactionDto = (transaction: InventoryTransactionRecord): InventoryTransactionDto => ({
    id: transaction.id,
    productId: transaction.productId,
    productName: transaction.product.name,
    productSku: transaction.product.sku,
    type: transaction.type === 'ADJUSTMENT' ? 'ADJUST' : transaction.type,
    quantity: transaction.quantity,
    previousQty: null,
    newQty: null,
    note: transaction.reason,
    createdBy: transaction.user?.name ?? null,
    createdByEmail: transaction.user?.email ?? null,
    createdAt: transaction.createdAt
});

const normalizeNote = (note: string | null | undefined): string | null => {
    if (!note) return null;

    return note;
};

const ensureInventoryExists = async (id: string): Promise<InventoryRecord> => {
    const inventory = await inventoryRepository.findById(id);

    if (!inventory) {
        throw new HttpError(404, 'Không tìm thấy tồn kho.');
    }

    return inventory;
};

export const getInventories = async (): Promise<InventoryDto[]> => {
    await inventoryRepository.createMissingForActiveProducts();
    const inventories = await inventoryRepository.findMany();

    return inventories.map(toInventoryDto);
};

export const getInventoryById = async (id: string): Promise<InventoryDto> => {
    return toInventoryDto(await ensureInventoryExists(id));
};

export const getInventoryTransactions = async (): Promise<InventoryTransactionDto[]> => {
    const transactions = await inventoryRepository.findTransactions();

    return transactions.map(toTransactionDto);
};

export const importInventory = async (input: ImportInventoryInput, userId: string): Promise<InventoryDto> => {
    const inventory = await ensureInventoryExists(input.inventoryId);

    if (input.quantity <= 0) {
        throw new HttpError(400, 'Số lượng phải lớn hơn 0.');
    }

    const updatedInventory = await inventoryRepository.importStock(inventory, input.quantity, normalizeNote(input.note), userId);

    return toInventoryDto(updatedInventory);
};

export const adjustInventory = async (input: AdjustInventoryInput, userId: string): Promise<InventoryDto> => {
    const inventory = await ensureInventoryExists(input.inventoryId);

    if (input.quantity === 0) {
        throw new HttpError(400, 'Số lượng điều chỉnh không được bằng 0.');
    }

    if (inventory.quantity + input.quantity < 0) {
        throw new HttpError(400, 'Tồn kho không đủ.');
    }

    const updatedInventory = await inventoryRepository.adjustStock(inventory, input.quantity, normalizeNote(input.note), userId);

    return toInventoryDto(updatedInventory);
};
