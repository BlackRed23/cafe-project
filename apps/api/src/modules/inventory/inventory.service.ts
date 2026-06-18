import { HttpError } from '../../common/http-error';
import { prisma } from '../../common/prisma';
import { inventoryRepository, type InventoryRecord, type InventoryTransactionRecord } from './inventory.repository';
import type { AdjustInventoryInput, ImportInventoryInput, UpdateThresholdInput } from './inventory.validator';
import { agentService } from '../agent/agent.service';
import { InventoryTransactionType } from '@cafe-project/database';
export type InventoryStatus = 'OUT_OF_STOCK' | 'LOW_STOCK' | 'IN_STOCK';

type ThresholdSuggestionOptions = {
    salesWindowDays?: number;
    bufferDays?: number;
    delayBufferDays?: number;
};

export type ThresholdWarning = {
    level: 'strong' | 'warning' | 'info';
    message: string;
};

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

export type InventoryMutationDto = {
    inventory: InventoryDto;
    stockAfter: number;
    minThreshold: number;
    message: string;
    warnings: ThresholdWarning[];
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

const normalizePositiveInteger = (value: number | undefined, fallback: number): number => {
    if (value === undefined || !Number.isFinite(value) || !Number.isInteger(value) || value <= 0) {
        return fallback;
    }

    return value;
};

const toSupplierDto = (supplierProduct: any) => ({
    supplierId: supplierProduct.supplierId,
    supplierName: supplierProduct.supplier.name,
    isPreferred: supplierProduct.isPreferred,
    priority: null,
    leadTimeDays: supplierProduct.leadTimeDays,
    moq: supplierProduct.minOrderQuantity,
    purchasePrice: Number(supplierProduct.price)
});

const getSupplierProductsForSuggestion = async (productId: string) => {
    return prisma.supplierProduct.findMany({
        where: {
            productId,
            supplier: {
                status: 'ACTIVE',
                deletedAt: null
            }
        },
        include: { supplier: true },
        orderBy: [{ isPreferred: 'desc' }, { leadTimeDays: 'asc' }, { price: 'asc' }]
    });
};

const getThresholdWarnings = (inputThreshold: number, leadTimeDemand: number, recommendedThreshold: number): ThresholdWarning[] => {
    const warnings: ThresholdWarning[] = [];

    if (inputThreshold < leadTimeDemand) {
        warnings.push({
            level: 'strong',
            message: 'Ngưỡng này quá thấp so với tốc độ bán và thời gian nhập hàng.'
        });
    } else if (inputThreshold < recommendedThreshold) {
        warnings.push({
            level: 'warning',
            message: 'Ngưỡng thấp hơn đề xuất, có nguy cơ thiếu hàng trong thời gian chờ nhập.'
        });
    }

    if (inputThreshold > recommendedThreshold * 3) {
        warnings.push({
            level: 'warning',
            message: 'Ngưỡng này cao bất thường, có thể gây tồn kho quá nhiều.'
        });
    }

    return warnings;
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

export const importInventory = async (input: ImportInventoryInput, userId: string): Promise<InventoryMutationDto> => {
    const inventory = await ensureInventoryExists(input.inventoryId);

    if (input.quantity <= 0) {
        throw new HttpError(400, 'Số lượng phải lớn hơn 0.');
    }

    const updatedInventory = await inventoryRepository.importStock(inventory, input.quantity, normalizeNote(input.note), userId);
    const dto = toInventoryDto(updatedInventory);
    const isLow = dto.quantity <= dto.minThreshold;

    return {
        inventory: dto,
        stockAfter: dto.quantity,
        minThreshold: dto.minThreshold,
        message: isLow ? 'Số lượng sau nhập vẫn thấp hơn ngưỡng tối thiểu.' : 'Nhập kho thành công. Đủ hàng.',
        warnings: isLow
            ? [
                  {
                      level: 'warning',
                      message: 'Số lượng sau nhập vẫn thấp hơn ngưỡng tối thiểu.'
                  }
              ]
            : []
    };
};

export const adjustInventory = async (input: AdjustInventoryInput, userId: string): Promise<InventoryMutationDto> => {
    const inventory = await ensureInventoryExists(input.inventoryId);

    if (input.quantity === 0) {
        throw new HttpError(400, 'Số lượng điều chỉnh không được bằng 0.');
    }

    if (inventory.quantity + input.quantity < 0) {
        throw new HttpError(400, 'Tồn kho không đủ.');
    }

    const updatedInventory = await inventoryRepository.adjustStock(inventory, input.quantity, normalizeNote(input.note), userId);
    const dto = toInventoryDto(updatedInventory);

    if (dto.quantity <= dto.minThreshold) {
        agentService.scanInventory({ productIds: [inventory.productId], triggerType: 'INVENTORY_ADJUSTMENT' }, userId).catch((error) => {
            console.error(`[inventory] Agent scan failed after inventory adjustment. productId=${inventory.productId}`, error);
        });
    }

    return {
        inventory: dto,
        stockAfter: dto.quantity,
        minThreshold: dto.minThreshold,
        message: dto.quantity <= dto.minThreshold ? 'Số lượng sau điều chỉnh thấp hơn ngưỡng, cần nhập hàng.' : 'Điều chỉnh thành công.',
        warnings:
            dto.quantity <= dto.minThreshold
                ? [
                      {
                          level: 'warning',
                          message: 'Số lượng sau điều chỉnh thấp hơn ngưỡng, cần nhập hàng.'
                      }
                  ]
                : []
    };
};

export const updateInventoryThreshold = async (input: UpdateThresholdInput): Promise<InventoryMutationDto> => {
    const inventory = await ensureInventoryExists(input.inventoryId);

    if (input.minThreshold < 0) {
        throw new HttpError(400, 'Ngưỡng không được âm.');
    }

    const suggestion = await getInventoryThresholdSuggestion(input.inventoryId);
    const updatedInventory = await inventoryRepository.updateThreshold(inventory, input.minThreshold);
    const warnings = getThresholdWarnings(input.minThreshold, suggestion.leadTimeDemand, suggestion.recommendedThreshold);
    const dto = toInventoryDto(updatedInventory);

    return {
        inventory: dto,
        stockAfter: dto.quantity,
        minThreshold: dto.minThreshold,
        message: warnings.length > 0 ? warnings[0].message : 'Cập nhật ngưỡng tồn kho thành công.',
        warnings
    };
};

export const getInventoryThresholdSuggestion = async (inventoryId: string, options: ThresholdSuggestionOptions = {}) => {
    const inventory = await ensureInventoryExists(inventoryId);
    const salesWindowDays = normalizePositiveInteger(options.salesWindowDays, 30);
    const bufferDays = normalizePositiveInteger(options.bufferDays, 2);

    const supplierProducts = await getSupplierProductsForSuggestion(inventory.productId);
    const primarySupplierProduct = supplierProducts[0] ?? null;

    const leadTimeDays = primarySupplierProduct?.leadTimeDays || 3;
    const delayBufferDays = normalizePositiveInteger(options.delayBufferDays, 2);
    const effectiveLeadTimeDays = leadTimeDays + delayBufferDays;

    const salesWindowStart = new Date();
    salesWindowStart.setDate(salesWindowStart.getDate() - salesWindowDays);

    const salesTransactions = await prisma.inventoryTransaction.aggregate({
        where: {
            productId: inventory.productId,
            type: { in: [InventoryTransactionType.ORDER, InventoryTransactionType.SIMULATE_SALE] },
            createdAt: { gte: salesWindowStart }
        },
        _sum: { quantity: true }
    });

    const totalSalesInWindow = Math.abs(salesTransactions._sum.quantity ?? 0);
    const avgDailySales = totalSalesInWindow / salesWindowDays;
    const safetyStock = avgDailySales > 0 ? Math.ceil(avgDailySales * bufferDays) : 10;
    const leadTimeDemand = Math.ceil(avgDailySales * effectiveLeadTimeDays);
    const recommendedThreshold = Math.ceil(leadTimeDemand + safetyStock);
    const warnings = getThresholdWarnings(inventory.minThreshold, leadTimeDemand, recommendedThreshold);

    if (supplierProducts.length === 0) {
        warnings.push({
            level: 'info',
            message: 'Sản phẩm chưa gắn nhà cung cấp, hệ thống đang dùng thời gian nhập hàng mặc định 3 ngày.'
        });
    }

    return {
        inventoryId: inventory.id,
        productId: inventory.productId,
        productName: inventory.product.name,
        currentStock: inventory.quantity,
        currentThreshold: inventory.minThreshold,
        salesWindowDays,
        totalSalesInWindow,
        avgDailySales: Number(avgDailySales.toFixed(2)),
        leadTimeDays,
        delayBufferDays,
        effectiveLeadTimeDays,
        bufferDays,
        safetyStock,
        leadTimeDemand,
        recommendedThreshold,
        supplier: primarySupplierProduct ? toSupplierDto(primarySupplierProduct) : null,
        backupSuppliers: supplierProducts.slice(1).map(toSupplierDto),
        supplierCapacityAvailable: false,
        capacityNote: 'SupplierProduct hiện chưa có availableQuantity/capacity; hệ thống không tự kết luận nhà cung cấp đủ hay thiếu.',
        warnings: warnings.map((warning) => warning.message),
        warningDetails: warnings
    };
};
